/**
 * src/sky.js — the sky, the daylight and the fog, all read from ONE simulated atmosphere.
 *
 * THE ARCHITECTURE IN ONE PARAGRAPH. Each time the clock pushes an hour (setTimeOfDay), this module
 *   1. places the sun and the moon where they really are: 37.4° N (Bishop, CA) on 21 June, so the sun
 *      rises at 05:33 and sets at 20:18 along its true arc, and the moon sits on the ecliptic at its
 *      phase's elongation, so it rises and sets as that phase does (full at sunset, first quarter at noon);
 *   2. integrates Rayleigh + Mie scattering with ozone absorption through a spherical atmosphere, lit by
 *      the sun and the moon — single scattering exactly, the higher orders by Hillaire's isotropic estimate —
 *      for 64 × 32 sky directions: the sky LUT (look-up table: a small texture the shaders read instead of
 *      re-doing the maths per pixel). ~2 ms on the CPU per push;
 *   3. derives every natural light from that same air: the key light is the sun (or moon) through the
 *      air's transmittance, the hemisphere fill is the LUT integrated over the dome, and an eye-adaptation
 *      curve decides how bright all of it reads on screen.
 *
 * FOG IS THE SKY. The background shader and the fog are the SAME GLSL function (skyHaze) reading the same
 * texture: a fogged fragment fades to the sky radiance in the direction you look through it, and below the
 * horizon the sky is its own lowest row (2° up, see HORIZON_Y) continued down. So the fog cannot be brighter than the sky at
 * dawn, and there is no colour step at the horizon, by construction rather than by tuning — there is no
 * second colour to drift. The same holds toward the sun: distant land glows with the sun's glare.
 *
 * THE WORLD EDGE. Terrain is drawn to a square ring around the stream centre. Fog has two terms: an
 * exp² haze (density owned by main.js's quality tiers, as before) and an edge term that reaches 100 %
 * at the drawn radius (setWorldRadius). Fully fogged land IS the background, so the edge, and any
 * chunk still streaming in beyond it, is invisible from every vantage. A later far-ridge layer (FEAT-188)
 * belongs beyond that radius with the haze term only — see skyFog.x/y.
 *
 * TWO CURVES (round 2, owner 11-08: "the legacy looks like you put the same pic through lightroom"). The sky and
 * the fog keep their own hue-true grade (skyGrade, linear to 0.76): a sunset stays orange. The land — every lit
 * surface — goes through three's ACES filmic curve at the legacy exposure, the look every asset was authored
 * under: its toe crushes the shadows and lifts the colour of the lit subjects, and the headlights, the campfire
 * and every emissive read exactly as they were tuned (they are authored in render units against that curve).
 * Fog is mixed after tone mapping, so a fogged fragment still lands on the graded sky.
 *
 * WHY THESE GLOBAL SHADER PATCHES. three's fog chunks know one flat colour. This module replaces the
 * four fog chunks at import, and
 * adds its uniforms to every built-in material (ShaderLib) and to UniformsLib.fog (which the particle and
 * impostor ShaderMaterials merge). Those uniforms are SHARED objects (see shared()): one live value behind
 * every material. Scenes other than the world (the menu stage) keep three's plain FogExp2 colour: the world
 * scene flips skyGlare.w on in onBeforeRender and off again in onAfterRender.
 *
 * UNITS. The atmosphere works in "sun units": the sun's irradiance above the atmosphere is 1. The eye's
 * adaptation (adaptScale) maps those to render units — at noon a horizontal white surface reads π, so its
 * radiance is 1 — and compresses the 10⁷ range from noon to a moonless night: most of a sunset is
 * compensated, the night much less, so a moonless night is near black and a full moon barely shows the road.
 * Artificial light (headlights, campfire, emissive lenses) is NOT scaled: it was authored in render units,
 * which is exactly why it dominates the night and barely registers at noon.
 */
import * as THREE from 'three'
import { MoonSystem, MOON_PARAMS } from './moon.js'

const D2R = Math.PI / 180
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// ── The site and the date ────────────────────────────────────────────────────────────────────────────
// The owner's spec: Eastern Sierra, 21 June, sunrise 05:33, sunset 20:18 (clock time, PDT). Solar noon is
// their midpoint, 12:55.5 — Bishop's clock runs ~1 h ahead of the sun. At this latitude and declination
// the computed day is 14 h 45 m between upper-limb crossings with standard refraction, i.e. these two
// times to within 0.3 min — the sky-ephemeris gate (test/sky-ephemeris.mjs) asserts it.
const LAT = 37.4 * D2R
const OBLIQUITY = 23.44 * D2R
const SUN_DEC = OBLIQUITY                         // the June solstice
export const SUNRISE_H = 5 + 33 / 60
export const SUNSET_H = 20 + 18 / 60
const SOLAR_NOON_H = (SUNRISE_H + SUNSET_H) / 2

/** Atmospheric refraction (Saemundsson), radians, faded out between −1° and −3° of true elevation. */
function refraction (el) {
  const d = Math.max(el / D2R, -1)
  return 1.02 / Math.tan((d + 10.3 / (d + 5.11)) * D2R) / 60 * D2R * clamp01((el / D2R + 3) / 2)
}

/** Apparent elevation and azimuth (from north, toward east) of a body at declination `dec`, hour angle `ha`. */
function altAz (dec, ha) {
  const sl = Math.sin(LAT), cl = Math.cos(LAT), sd = Math.sin(dec), cd = Math.cos(dec)
  const el = Math.asin(sl * sd + cl * cd * Math.cos(ha))
  return { el: el + refraction(el), az: Math.atan2(-Math.sin(ha) * cd, sd * cl - cd * sl * Math.cos(ha)) }
}
const hourAngle = (hour) => (hour - SOLAR_NOON_H) * 15 * D2R

/** The sun at clock `hour`: { el, az } in radians (el apparent). */
export function sunAt (hour) { return altAz(SUN_DEC, hourAngle(hour)) }

/** The moon at clock `hour` in a synodic month at `cycle` (0 new, 0.5 full): it sits on the ecliptic
 *  360°·cycle east of the sun, so its hour angle trails the sun's by that right ascension. The 5° orbit
 *  tilt and the moon's own motion through one day are left out. */
export function moonAt (hour, cycle) {
  const lam = Math.PI / 2 + 2 * Math.PI * cycle   // the sun's ecliptic longitude is 90° at the solstice
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(lam))
  const ra = Math.atan2(Math.cos(OBLIQUITY) * Math.sin(lam), Math.cos(lam))
  return altAz(dec, hourAngle(hour) - (ra - Math.PI / 2))
}

/** World direction for elevation/azimuth. World north is −Z and east +X (the map draws −Z up, +X right). */
function dirOf ({ el, az }, out) {
  return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az))
}

// "Total darkness from 21:18 to 04:33 — an hour each side" (owner). The sun's elevation an hour after sunset,
// ≈ −10.5°. The atmosphere already puts the sky near black there; nightWeight and the spec fade use it.
const DARK_EL = sunAt(SUNSET_H + 1).el

/** FEAT-120: how much of `hour` is night, 0 (sun up) … 1 (an hour past sunset) — the crickets' clock. */
export function nightWeight (hour) { return 1 - smooth(DARK_EL, 0, sunAt(hour).el) }

// ── Tunables (the GUI binds these) ───────────────────────────────────────────────────────────────────
export const SKY_PARAMS = {
  aod: 0.02,          // aerosol optical depth above the eye at 550 nm: 0.02–0.05 is clean high-desert air, 0.3 smoggy
  hazeAfternoon: 0.5, // extra aerosol the afternoon's convection lifts by 17:00 (fraction of `aod`)
  multiScatter: 1.0,  // gain on the orders ≥ 2 (1 = Hillaire's estimate as computed)
  skyGain: 2.5,       // the sky and its fill against the sun. The world's flat albedos are bright (stylised), so the
                      // sky is lifted to sit with them; 1 is the physical ratio
  ambient: 1.0,       // × the sky's own irradiance on the hemisphere fill
  saturation: 0.82,   // of the natural light and sky (albedo colour is untouched — man-made stays saturated)
  exposure: 1.7,      // the sky's pre-exposure (the land's camera is LAND_EXPOSURE, the legacy's)
  landGain: 2.0,      // the natural light on the land against the sky's, into the land's ACES curve (noon matched to the legacy)
  skyAdapt: 0.45,     // the sky's eye (eyeCurve): the share of every decade of lost light it never adapts back…
  skyDepth: 1.3,      // …plus how far under noon its adaptation runs out, in decades…
  skyTwilight: 0.72,  // …and how fast it runs out (e-folding, decades of light). Smaller = a darker golden hour and dusk
  skySat: 1.0,        // colour saturation of the sky (and the fog, the same function)
  skyCast: 0.5,       // how much of the light's colour cast the sky keeps that the white balance takes out (0–1)
  duskSat: 0.3,       // the twilight grade: extra sky saturation from the sun 14° up to the end of twilight…
  dusk: 1.3,          // …and the strength of its teal split tone on the sky that is not the warm glow (0 = as simulated)
  moonAdapt: 0.15,    // how much of the moon's light the eye adapts away (1 = all of it: full and new moon look alike)
  landDepth: 1.62,    // the land's eye (landEye): how far under noon the land reads at the darkest, in decades
  landTwilight: 2.0,  // …and how fast it gets there (e-folding, decades of light). Smaller = darker golden hour and dusk
  warmth: 0.2,        // the land's white balance against the sky's: 0 = the same, 0.2 = sunlit ground warm like the legacy's
  landCast: 1.0,      // how much of the light's colour cast the land keeps that the sky's white balance takes out (0–1)
  nightFog: 0.55,     // at night the fog (and the sky glow) is this × flat ground under it
  nightBlue: 1.5,     // colour saturation of the land's light under rod vision (the sky's drains to grey)
  bounce: 0.35,       // × the ground's bounce light (the hemisphere fill from below). The fill has no occlusion: at 1 the
                      // ground under the truck lit its wheel wells as if nothing shaded it
  glare: 6e-4,        // strength of the sharp forward-scatter lobe round the sun (the glare, not the disc)
  glareG: 0.93,       // its sharpness (Henyey-Greenstein g)
  sunSize: 1.2,       // drawn sun disc RADIUS, degrees (the real one is 0.27°; the moon is drawn at 2.75°)
  stars: 2.5,         // star brightness, as displayed (not through the eye: the night's level sets the sky behind them)
}

/** Aerosol (as a multiple of the profile's sea-level density, BETA_M) for an optical depth `aod` above the eye. */
const aerosol = (aod) => aod / (MIE_EXT * H_M * Math.exp(-OBS_H / H_M))
/** Aerosol through the day: clear at dawn, hazier after the afternoon's convection, settling at night. */
function hazeAt (hour) {
  const p = SKY_PARAMS
  return aerosol(p.aod) * (1 + p.hazeAfternoon * smooth(10, 17, hour) * (1 - smooth(21, 24, hour)))
}

// ── The atmosphere: scattering in a spherical shell (km) ──────────────────────────────────────────────
const RP = 6360, RTOP = 6420           // planet, top of atmosphere
const OBS_H = 1.5                      // the observer's altitude — the Owens Valley floor and up
const BETA_R = [5.802e-3, 13.558e-3, 33.1e-3]   // Rayleigh scattering at sea level, /km (Hillaire 2020)
const BETA_M = 3.996e-3                          // Mie scattering at sea level, /km, for aerosol(…) = 1 (see SKY_PARAMS.aod)
const MIE_EXT = BETA_M / 0.9                     // Mie extinction (single-scatter albedo 0.9)
const BETA_O = [0.650e-3, 1.881e-3, 0.085e-3]   // ozone absorption at its layer's peak, /km — keeps twilight blue
const H_R = 8, H_M = 1.2                         // scale heights
// The aerosol lobe (the sharp glare is analytic, per pixel). Round 3: 0.76 → 0.85, desert dust's forward peak — at sunset it
// gathers the glow round the sun and leaves the horizon away from it darker, where 0.76 lit the whole horizon band khaki.
// (More evening haze did the same to the sky but halved the sunlit land's key light at 20:00.)
const MIE_G = 0.85
const ozone = (h) => Math.max(0, 1 - Math.abs(h - 25) / 15)   // tent, 10–40 km
// Moonlight in sun units: full moon ≈ 0.25 lux against the sun's ≈ 127 klx above the air, and slightly red.
const MOON_E = 2.0e-6, MOON_RGB = [1.0, 0.95, 0.88]
// The moonless sky (airglow + starlight ≈ 0.002 lux), as a radiance in sun units, brighter toward the horizon
// (the van Rhijn effect — also what keeps a silhouette against the sky at night).
const NIGHT_L = 1.6e-8 / Math.PI, NIGHT_RGB = [0.85, 0.95, 1.0]

/**
 * Column density (km of surface-density air) from height h along a ray of zenith cosine mu, for an
 * exponential layer of scale height H — Schüler's approximation of the Chapman function (GPU Pro 3),
 * including the below-horizon branch, where a ray that grazes or hits the planet goes to infinity (T = 0).
 * `c` is sqrt(π x / 2) for x = (RP + h)/H, precomputed per sample.
 */
function chapman (h, H, rho, c, mu) {
  if (mu >= 0) return H * rho * c / ((c - 1) * mu + 1)
  const x = (RP + h) / H, s = Math.sqrt(1 - mu * mu)
  const x0 = x * s
  return H * rho * (2 * Math.sqrt(Math.PI * x0 / 2) * Math.exp(x * mu * mu / (1 + s)) - c / ((1 - c) * mu + 1))
}
/** Ozone column from height h outward along a rising ray (zenith cosine mu ≥ 0 there): the remaining
 *  share of the 10–40 km tent, across the 25 km shell at the angle the ray meets it (r·sin χ is conserved
 *  along a straight ray). */
function ozoneUp (h, mu) {
  const s = (RP + h) * Math.sqrt(1 - mu * mu) / (RP + 25)
  return 15 * clamp01((40 - h) / 30) / Math.max(Math.sqrt(Math.max(0, 1 - s * s)), 0.03)
}
/** Ozone column toward a light at zenith cosine mu. A descending ray (twilight, seen from high air) runs down
 *  to its tangent point and back out: twice the column above the tangent, less the part above h. This is
 *  what filters the reddened twilight light back to blue at the zenith. */
function ozoneCol (h, mu) {
  if (mu >= 0) return ozoneUp(h, mu)
  return 2 * ozoneUp(Math.max(0, (RP + h) * Math.sqrt(1 - mu * mu) - RP), 0) - ozoneUp(h, -mu)
}

const LUT_W = 64, LUT_H = 32, STEPS = 16   // azimuth × elevation (row j at sin(el) = ((j + .5)/H)²) × ray samples
// The lowest sky anyone on the ground sees. The geometric 0° row looks through ~300 km of air and is the most
// extreme colour in the sky (salmon at dawn, beige at dusk); the fog below the horizon is that row, so it
// showed as a slab with a hard line a degree under the real sky. Rows below 2° repeat the 2° sky instead.
const HORIZON_Y = Math.sin(2 * D2R)
/** Per sky row: the view ray's samples (they depend on elevation only, so they are built once). */
const ROWS = (() => {
  const r0 = RP + OBS_H, rows = []
  for (let j = 0; j < LUT_H; j++) {
    const y = Math.max(((j + 0.5) / LUT_H) ** 2, HORIZON_Y), ce = Math.sqrt(1 - y * y)
    const tMax = -r0 * y + Math.sqrt(r0 * r0 * y * y - r0 * r0 + RTOP * RTOP)
    const row = { y, ce, h: [], ds: [], rR: [], rM: [], cR: [], cM: [], vR: [], vM: [], vO: [], a: [], b: [] }
    let accR = 0, accM = 0, accO = 0
    for (let n = 0; n < STEPS; n++) {
      const t = tMax * ((n + 0.5) / STEPS) ** 2, ds = tMax * (2 * n + 1) / (STEPS * STEPS)
      const px = t * ce, py = r0 + t * y, r = Math.hypot(px, py), h = r - RP
      const rR = Math.exp(-h / H_R), rM = Math.exp(-h / H_M), rO = ozone(h)
      // View column from the eye to this sample's midpoint (all earlier segments + half this one).
      row.vR.push(accR + rR * ds / 2); row.vM.push(accM + rM * ds / 2); row.vO.push(accO + rO * ds / 2)
      accR += rR * ds; accM += rM * ds; accO += rO * ds
      row.h.push(h); row.ds.push(ds); row.rR.push(rR); row.rM.push(rM)
      row.cR.push(Math.sqrt(Math.PI * (RP + h) / H_R / 2)); row.cM.push(Math.sqrt(Math.PI * (RP + h) / H_M / 2))
      row.a.push(px / r); row.b.push(py / r)   // the sample's local up = a·(view azimuth) + b·(observer up)
    }
    rows.push(row)
  }
  return rows
})()

/**
 * Add one light's single scattering to `out` (LUT_W × LUT_H × 3, sun units). `dir` is the light's
 * direction, `E` its irradiance above the air (rgb), `haze` the aerosol multiplier.
 */
function scatterLight (out, dir, E, haze) {
  const sy = dir.y, sh = Math.hypot(dir.x, dir.z), saz = Math.atan2(dir.x, -dir.z)
  const bM = MIE_EXT * haze, g = MIE_G, g2 = g * g, ms = SKY_PARAMS.multiScatter, psi = [0, 0, 0]
  const tv = new Float32Array(STEPS * 3)
  for (let j = 0; j < LUT_H; j++) {
    const R = ROWS[j]
    for (let n = 0; n < STEPS; n++) {   // the view ray's own transmittance, eye → sample
      for (let k = 0; k < 3; k++) tv[n * 3 + k] = Math.exp(-(BETA_R[k] * R.vR[n] + bM * R.vM[n] + BETA_O[k] * R.vO[n]))
    }
    for (let i = 0; i < LUT_W; i++) {
      const hs = sh * Math.cos(2 * Math.PI * (i + 0.5) / LUT_W - saz)   // the light's horizontal share along this azimuth
      const mu = R.ce * hs + R.y * sy                                    // cos(view, light)
      let sR0 = 0, sR1 = 0, sR2 = 0, sM0 = 0, sM1 = 0, sM2 = 0, m0 = 0, m1 = 0, m2 = 0
      for (let n = 0; n < STEPS; n++) {
        const mus = R.a[n] * hs + R.b[n] * sy, h = R.h[n]
        // Orders ≥ 2 (isotropic, so no phase function): σs · Ψ, through the view ray's air.
        psiAt(h, mus, psi)
        const wr = R.rR[n] * R.ds[n], wm = R.rM[n] * R.ds[n] * BETA_M * haze
        m0 += (BETA_R[0] * wr + wm) * psi[0] * tv[n * 3]
        m1 += (BETA_R[1] * wr + wm) * psi[1] * tv[n * 3 + 1]
        m2 += (BETA_R[2] * wr + wm) * psi[2] * tv[n * 3 + 2]
        if (mus < 0 && (1 - mus * mus) * (RP + h) ** 2 < RP * RP) continue   // the planet's shadow
        const cR = R.vR[n] + chapman(h, H_R, R.rR[n], R.cR[n], mus)
        const cM = R.vM[n] + chapman(h, H_M, R.rM[n], R.cM[n], mus)
        const cO = R.vO[n] + ozoneCol(h, mus), tm = bM * cM
        const t0 = Math.exp(-(BETA_R[0] * cR + tm + BETA_O[0] * cO))
        const t1 = Math.exp(-(BETA_R[1] * cR + tm + BETA_O[1] * cO))
        const t2 = Math.exp(-(BETA_R[2] * cR + tm + BETA_O[2] * cO))
        sR0 += wr * t0; sR1 += wr * t1; sR2 += wr * t2
        const wM = R.rM[n] * R.ds[n]
        sM0 += wM * t0; sM1 += wM * t1; sM2 += wM * t2
      }
      const pR = 3 / (16 * Math.PI) * (1 + mu * mu)
      const pM = 3 / (8 * Math.PI) * (1 - g2) * (1 + mu * mu) / ((2 + g2) * Math.pow(1 + g2 - 2 * g * mu, 1.5))
      const k = (j * LUT_W + i) * 3, bm = BETA_M * haze * pM
      out[k] += E[0] * (BETA_R[0] * sR0 * pR + bm * sM0 + ms * m0)
      out[k + 1] += E[1] * (BETA_R[1] * sR1 * pR + bm * sM1 + ms * m1)
      out[k + 2] += E[2] * (BETA_R[2] * sR2 * pR + bm * sM2 + ms * m2)
    }
  }
}

/**
 * Second and higher orders of scattering — what keeps the twilight zenith blue instead of black, fills the
 * Earth's shadow, and lifts the noon sky. Hillaire 2020 ("A Scalable and Production Ready Sky and Atmosphere
 * Rendering Technique", §5.5): treat the light that has scattered at least once as isotropic. Then a point at
 * height h, with the sun at local zenith cosine mus, sees a second-order radiance L2 from the sunlit air (and
 * lit ground) all round it, and each further order is the previous one × f_ms, the fraction of isotropic light
 * the surrounding air scatters back. Summing the geometric series: Ψ = L2 / (1 − f_ms), per colour channel.
 * The table depends on the air only (sun irradiance 1), so it is built once and again when the aerosol knob
 * moves (the afternoon's extra haze is left out of it). A view ray then in-scatters σs·Ψ at every sample.
 * Size: MS_H heights × MS_MU sun angles × MS_DIRS directions × MS_STEPS samples ≈ 0.2 M steps, ~20 ms.
 */
const MS_H = 12, MS_MU = 32, MS_DIRS = 32, MS_STEPS = 16, MS_TOP = 60, MS_MU0 = -0.4
const MS_DIR = Array.from({ length: MS_DIRS }, (_, k) => {   // a Fibonacci sphere: even directions, y up
  const y = 1 - 2 * (k + 0.5) / MS_DIRS, r = Math.sqrt(1 - y * y), phi = k * 2.399963
  return [r * Math.cos(phi), y, r * Math.sin(phi)]
})
/** Transmittance from a point at radius r (km from the centre) to the light at local zenith cosine mus, rgb → out;
 *  0 inside the planet's shadow. */
function sunT (r, mus, haze, out) {
  if (mus < 0 && (1 - mus * mus) * r * r < RP * RP) { out[0] = out[1] = out[2] = 0; return out }
  const h = Math.max(0, r - RP), cR = chapman(h, H_R, Math.exp(-h / H_R), Math.sqrt(Math.PI * r / H_R / 2), mus)
  const cM = chapman(h, H_M, Math.exp(-h / H_M), Math.sqrt(Math.PI * r / H_M / 2), mus), cO = ozoneCol(h, mus)
  for (let k = 0; k < 3; k++) out[k] = Math.exp(-(BETA_R[k] * cR + MIE_EXT * haze * cM + BETA_O[k] * cO))
  return out
}
function buildMultiScatter (haze) {
  const psi = new Float32Array(MS_H * MS_MU * 3), ts = [0, 0, 0], bM = MIE_EXT * haze, sM = BETA_M * haze
  for (let a = 0; a < MS_H; a++) {
    const r0 = RP + MS_TOP * (a / (MS_H - 1)) ** 2
    for (let b = 0; b < MS_MU; b++) {
      const mus = MS_MU0 + (1 - MS_MU0) * b / (MS_MU - 1), sx = Math.sqrt(1 - mus * mus)   // the sun in the x–y plane
      const L = [0, 0, 0], F = [0, 0, 0]
      for (const [dx, dy, dz] of MS_DIR) {
        const bq = r0 * dy, dG = bq * bq - r0 * r0 + RP * RP
        const tG = dy < 0 && dG > 0 ? -bq - Math.sqrt(dG) : -1
        const tMax = tG > 0 ? tG : -bq + Math.sqrt(bq * bq - r0 * r0 + RTOP * RTOP), dt = tMax / MS_STEPS
        const od = [0, 0, 0]
        for (let n = 0; n < MS_STEPS; n++) {
          const t = (n + 0.5) * dt, px = t * dx, py = r0 + t * dy, pz = t * dz
          const r = Math.sqrt(px * px + py * py + pz * pz), h = Math.max(0, r - RP)
          const rR = Math.exp(-h / H_R), rM = Math.exp(-h / H_M), rO = ozone(h)
          sunT(r, (px * sx + py * mus) / r, haze, ts)
          for (let k = 0; k < 3; k++) {
            const ext = BETA_R[k] * rR + bM * rM + BETA_O[k] * rO, sc = BETA_R[k] * rR + sM * rM
            const tv = Math.exp(-(od[k] + ext * dt / 2))
            F[k] += tv * sc * dt
            L[k] += tv * sc * ts[k] * dt / (4 * Math.PI)
            od[k] += ext * dt
          }
        }
        if (tG > 0) {   // the lit ground, Lambertian
          const gx = tG * dx, gy = r0 + tG * dy, mg = (gx * sx + gy * mus) / RP
          if (mg > 0) {
            sunT(RP, mg, haze, ts)
            for (let k = 0; k < 3; k++) L[k] += Math.exp(-od[k]) * ts[k] * GROUND_ALBEDO[k] / Math.PI * mg
          }
        }
      }
      const o = (a * MS_MU + b) * 3
      for (let k = 0; k < 3; k++) psi[o + k] = (L[k] / MS_DIRS) / (1 - F[k] / MS_DIRS)
    }
  }
  return psi
}
let PSI = null, PSI_AOD = -1
/** Ψ at height h (km) and sun cosine mus, bilinear, rgb → out. */
function psiAt (h, mus, out) {
  const fa = Math.min(Math.sqrt(Math.max(h, 0) / MS_TOP), 1) * (MS_H - 1)
  const fb = Math.min(Math.max((mus - MS_MU0) / (1 - MS_MU0), 0), 1) * (MS_MU - 1)
  const a0 = Math.min(Math.floor(fa), MS_H - 2), b0 = Math.min(Math.floor(fb), MS_MU - 2), wa = fa - a0, wb = fb - b0
  const i00 = (a0 * MS_MU + b0) * 3, i01 = i00 + 3, i10 = i00 + MS_MU * 3, i11 = i10 + 3
  for (let k = 0; k < 3; k++) {
    out[k] = (PSI[i00 + k] * (1 - wb) + PSI[i01 + k] * wb) * (1 - wa) + (PSI[i10 + k] * (1 - wb) + PSI[i11 + k] * wb) * wa
  }
  return out
}

/** Sky irradiance on a horizontal surface, ∫ L cos θ dω = Σ L · y · Δy · Δaz (y = sin el), rgb into `out`. */
function skyIrradiance (L, out) {
  out[0] = out[1] = out[2] = 0
  for (let j = 0; j < LUT_H; j++) {
    const w = ROWS[j].y * ((j + 1) ** 2 - j ** 2) / LUT_H ** 2 * (2 * Math.PI / LUT_W)
    for (let i = 0; i < LUT_W; i++) {
      const k = (j * LUT_W + i) * 3
      out[0] += L[k] * w; out[1] += L[k + 1] * w; out[2] += L[k + 2] * w
    }
  }
  return out
}

/** Transmittance of the air from the observer toward elevation `el`, rgb, written into `out`. */
function transmittance (el, haze, out) {
  const h = OBS_H, mu = Math.sin(el)
  const cR = chapman(h, H_R, Math.exp(-h / H_R), Math.sqrt(Math.PI * (RP + h) / H_R / 2), mu)
  const cM = chapman(h, H_M, Math.exp(-h / H_M), Math.sqrt(Math.PI * (RP + h) / H_M / 2), mu)
  const cO = ozoneCol(h, mu), tm = MIE_EXT * haze * cM
  for (let k = 0; k < 3; k++) out[k] = cR < 1e5 ? Math.exp(-(BETA_R[k] * cR + tm + BETA_O[k] * cO)) : 0
  return out
}

/** The moon's brightness against full at a phase angle (Allen's magnitude law, opposition surge kept):
 *  a quarter moon gives ~9 % of a full moon's light, not 50 %. */
function moonPhaseLaw (cycle) {
  const alpha = Math.abs(180 - 360 * (((cycle % 1) + 1) % 1))   // sun–moon angle seen from the moon, degrees
  return Math.pow(10, -0.4 * (0.026 * alpha + 4e-9 * alpha ** 4))
}

/**
 * The whole natural state of the sky at `hour`: sun/moon geometry, the raw sky LUT (sun units), the sky's
 * horizontal irradiance, direct sun and moon irradiance. Pure — no three objects touched beyond scratch.
 */
function simulate (hour, cycle, st) {
  const haze = hazeAt(hour)
  if (PSI_AOD !== SKY_PARAMS.aod) { PSI = buildMultiScatter(aerosol(SKY_PARAMS.aod)); PSI_AOD = SKY_PARAMS.aod }
  st.sun = sunAt(hour); st.moon = moonAt(hour, cycle)
  dirOf(st.sun, st.sunDir); dirOf(st.moon, st.moonDir)
  // Two tables: the sun's sky (lut), and the night's (lutN: airglow + moon), which _apply sets to the land's level.
  const L = st.lut.fill(0), N = st.lutN.fill(0), e = [0, 0, 0]
  // The owner's "total darkness an hour after sunset": the sun's light is faded out over the last 3° to DARK_EL.
  const sunFade = smooth(DARK_EL, DARK_EL + 3 * D2R, st.sun.el)
  if (sunFade > 0) scatterLight(L, st.sunDir, [sunFade, sunFade, sunFade], haze)
  // The moonless night sky, brighter toward the horizon.
  for (let j = 0; j < LUT_H; j++) {
    const night = NIGHT_L * (1 + 2 * (1 - ROWS[j].y) ** 4)
    for (let i = 0; i < LUT_W; i++) {
      const k = (j * LUT_W + i) * 3
      N[k] = night * NIGHT_RGB[0]; N[k + 1] = night * NIGHT_RGB[1]; N[k + 2] = night * NIGHT_RGB[2]
    }
  }
  // The sky without the moon: what the eye adapts to in full (see eEye).
  skyIrradiance(L, st.eSky0); skyIrradiance(N, e)
  for (let k = 0; k < 3; k++) st.eSky0[k] += e[k]
  const moonLit = MOON_E * moonPhaseLaw(cycle)
  st.moonE = moonLit
  if (st.moon.el > -12 * D2R && moonLit > 1e-9) scatterLight(N, st.moonDir, MOON_RGB.map(c => c * moonLit), haze)
  // Direct light: the sun through the air, cut by its 0.27° disc crossing the horizon; the moon likewise.
  transmittance(st.sun.el, haze, st.tSun)
  const sunVis = clamp01((st.sun.el + 0.267 * D2R) / (0.533 * D2R)) * sunFade
  for (let k = 0; k < 3; k++) st.eSun[k] = st.tSun[k] * sunVis
  transmittance(st.moon.el, haze, st.tMoon)
  const moonVis = clamp01((st.moon.el + 0.26 * D2R) / (0.52 * D2R)) * moonLit
  for (let k = 0; k < 3; k++) st.eMoon[k] = st.tMoon[k] * moonVis * MOON_RGB[k]
  skyIrradiance(L, st.eSky); skyIrradiance(N, e)
  for (let k = 0; k < 3; k++) st.eSky[k] += e[k]
  const sh = Math.max(0, st.sunDir.y), mh = Math.max(0, st.moonDir.y)
  // The eye adapts to what it sees, not just to the ground: half the light falling on a sun-facing wall counts.
  // (Horizontal illuminance alone made a 4°-high sun light the walls facing it at 4× noon.)
  const g = SKY_PARAMS.skyGain
  const eA0 = lum(...st.eSun) * (sh + 0.5 * Math.sqrt(1 - sh * sh)) + g * lum(...st.eSky0)
  st.eA = eA0 + lum(...st.eMoon) * (mh + 0.5 * Math.sqrt(1 - mh * mh)) + g * (lum(...st.eSky) - lum(...st.eSky0))
  // What the eye adapts to: all of the sun's light, only moonAdapt of the moon's (round 2, owner 11-08: "there is
  // practically no difference between new moon and full moon apparent brightness"). Adapting to all of it squeezed
  // the full moon's ~20× more light on the ground down to ~2.7× on screen, and the moonlit sky to no change at all.
  st.eEye = eA0 + SKY_PARAMS.moonAdapt * (st.eA - eA0)
  return st
}
const newState = () => ({ lut: new Float32Array(LUT_W * LUT_H * 3), lutN: new Float32Array(LUT_W * LUT_H * 3), sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(),
  eSky: [0, 0, 0], eSky0: [0, 0, 0], eSun: [0, 0, 0], eMoon: [0, 0, 0], tSun: [0, 0, 0], tMoon: [0, 0, 0], eA: 0, eEye: 0, moonE: 0 })
// Ground albedo — a warm desert-granite grey: the hemisphere fill's ground colour and the sky's ground bounce.
const GROUND_ALBEDO = [0.20, 0.18, 0.15]

// ── The shared shader side ──────────────────────────────────────────────────────────────────────────
// The SKY's tone curve (the background and the fog it lends the land): Khronos PBR Neutral's shoulder WITHOUT its
// toe. Linear (so hue-true: a sunset stays orange instead of ACES's slide to yellow) up to 0.76, then a soft
// roll-off that only greys a channel as it saturates. The land uses ACES (see TWO CURVES above).
const GRADE_GLSL = /* glsl */`
#ifndef SKY_GRADE
#define SKY_GRADE
vec3 skyGrade (vec3 c) {
  float peak = max(c.r, max(c.g, c.b));
  if (peak <= 0.76) return c;
  float d = 0.24;
  float np = 1.0 - d * d / (peak + d - 0.76);
  c *= np / peak;
  return mix(c, vec3(np), 1.0 - 1.0 / (0.1 * (peak - np) + 1.0));
}
#endif
`
// skyHaze(d): the sky's radiance in direction d WITHOUT its disc or stars — what the background shows and
// what every fogged fragment fades to. Below the horizon it is the horizon row (the LUT clamps), so the
// fogged land is the horizon continued downward. Radiance is pre-exposed (×exposure) in the LUT.
const HAZE_GLSL = /* glsl */`
uniform sampler2D skyLut;
uniform vec4 skySun;     // xyz: the sun's direction; w: glare sharpness g
uniform vec4 skyGlare;   // rgb: glare radiance (pre-exposed); w: 1 while the world scene renders
uniform vec4 skyFog;     // x, y: the world-edge fog's start and full radius (m, horizontal)
#ifndef SKY_HAZE
#define SKY_HAZE
vec3 skyHaze (vec3 d) {
  float az = atan(d.x, -d.z);
  if (d.y < 0.0) {
    // Below the horizon: the horizon row at the same ANGLE TO THE SUN, not the same azimuth (round 3). By azimuth the
    // sunset glow came down through the fog as a straight-sided column; by angle it is the round glow the sky shows.
    vec2 sh = skySun.xz; float shl = length(sh);
    if (shl > 1e-3) {
      float sa = atan(sh.x, -sh.y), c = clamp(dot(d, skySun.xyz) / shl, -1.0, 1.0);
      float da = az - sa; da -= 6.2831853 * floor(da / 6.2831853 + 0.5);
      az = sa + (da < 0.0 ? -1.0 : 1.0) * acos(c);
    }
  }
  vec2 uv = vec2(az * 0.15915494, sqrt(clamp(d.y, 0.0, 1.0)));
  float g = skySun.w, k = 1.0 + g * g - 2.0 * g * dot(d, skySun.xyz);
  return texture2D(skyLut, uv).rgb + skyGlare.rgb * (1.0 - g * g) / (k * sqrt(k));
}
#endif
`
/** A uniform value every material shares by REFERENCE: three clones uniforms when a material compiles
 *  (cloneUniforms → value.clone()), which would freeze each one on its compile-time value. */
const shared = (v) => { v.clone = () => v; return v }
const LUT_DATA = new Uint16Array(LUT_W * LUT_H * 4)
const LUT_TEX = new THREE.DataTexture(LUT_DATA, LUT_W, LUT_H, THREE.RGBAFormat, THREE.HalfFloatType)
LUT_TEX.wrapS = THREE.RepeatWrapping                     // azimuth wraps; elevation clamps (row 0 = horizon)
LUT_TEX.magFilter = LUT_TEX.minFilter = THREE.LinearFilter
LUT_TEX.generateMipmaps = false
const U = {
  skyLut: { value: shared(LUT_TEX) },
  skySun: { value: shared(new THREE.Vector4(0, 1, 0, 0.93)) },
  skyGlare: { value: shared(new THREE.Vector4(0, 0, 0, 0)) },   // w starts OFF (Vector4 defaults w to 1)
  skyFog: { value: shared(new THREE.Vector4(1e8, 1e9, 1, 0)) },
}
for (const lib of Object.values(THREE.ShaderLib)) if (lib.uniforms.fogDensity) Object.assign(lib.uniforms, U)
Object.assign(THREE.UniformsLib.fog, U)

THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying vec3 vFogView;\n#endif\n'
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n\tvFogView = mvPosition.xyz;\n#endif\n'
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
uniform vec3 fogColor;
varying vec3 vFogView;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear;
uniform float fogFar;
#endif
${HAZE_GLSL}${GRADE_GLSL}
#endif
`
// World scene: haze (exp² on true distance, not view depth, so it does not swing as the camera yaws)
// joined by the edge term, then mixed toward the graded sky in this fragment's direction. Other scenes:
// three's own flat-colour fog, unchanged.
THREE.ShaderChunk.fog_fragment = /* glsl */`#ifdef USE_FOG
#ifdef FOG_EXP2
float fogFactor = 1.0 - exp(-fogDensity * fogDensity * dot(vFogView, vFogView));
#else
float fogFactor = smoothstep(fogNear, fogFar, -vFogView.z);
#endif
if (skyGlare.w > 0.5) {
  vec3 fogW = vFogView * mat3(viewMatrix);   // view → world (the rotation's transpose)
  #ifdef FOG_EXP2
  fogFactor = fogDensity > 0.0 ? max(fogFactor, smoothstep(skyFog.x, skyFog.y, length(fogW.xz))) : 0.0;
  #endif
  // Under one 8-bit step of fog (the near field: < ~20 m on Normal) skips the sky lookup — most of the screen.
  if (fogFactor > 0.004) gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(skyGrade(skyHaze(normalize(fogW))), 1.0)).rgb, fogFactor);
} else {
  #ifdef FOG_EXP2
  fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogView.z * vFogView.z);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
}
#endif
`
// The background: a camera-centred box pinned to the far plane, shading only the pixels nothing else covers.
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main () {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`
const SKY_FRAG = /* glsl */`
${HAZE_GLSL}${GRADE_GLSL}
uniform vec4 skyDisc;      // rgb: disc radiance (pre-exposed); w: cos(disc radius)
uniform mat3 skyStarFrame; // world → the star sphere's frame (turns with sidereal time)
uniform float skyStars;    // star radiance as displayed; 0 by day
varying vec3 vDir;
float hash13 (vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main () {
  vec3 d = normalize(vDir);
  vec3 L = skyHaze(d);
  float above = step(0.0, d.y);
  // The sun disc, limb-darkened, with an anti-aliased edge one pixel wide.
  float mu = dot(d, skySun.xyz), aa = fwidth(mu);
  float disc = smoothstep(skyDisc.w - aa, skyDisc.w + aa, mu);
  if (disc > 0.0) {
    float r = clamp((1.0 - mu) / (1.0 - skyDisc.w), 0.0, 1.0);
    L += skyDisc.rgb * disc * above * mix(0.7, 1.0, sqrt(1.0 - r));
  }
  // Stars: one candidate per cell of a 3D grid on the star sphere (so the field is even at the pole);
  // ~15 % of cells hold one, brightness skewed so most are faint. Jitter ≤ 0.3 cell keeps every star
  // inside its own cell, so none is clipped. Dimmed toward the horizon by the air.
  if (skyStars > 0.0 && d.y > 0.0) {
    vec3 ds = skyStarFrame * d, cell = floor(ds * 70.0);
    float h = hash13(cell);
    if (h < 0.15) {
      vec3 jit = vec3(hash13(cell + 17.0), hash13(cell + 41.0), hash13(cell + 73.0)) - 0.5;
      vec3 s = normalize(cell + 0.5 + jit * 0.6);
      float dist = length(ds - s) * 70.0;
      float b = pow(h / 0.15, 6.0) * 0.9 + 0.1;
      L += skyStars * b * smoothstep(0.09, 0.0, dist) * smoothstep(0.0, 0.25, d.y);
    }
  }
  gl_FragColor = vec4(skyGrade(L), 1.0);
  #include <colorspace_fragment>
}`

/**
 * The eye: displayed brightness against noon, log10 B = slope·x − depth·(1 − e^(x / fall)), x = log10(E / E_noon).
 * The LAND's (round 2: slope 0, landDepth, landTwilight) falls steeply through the golden hour and dusk (sunset ≈ 11 %
 * of noon) and levels out at night (a moonless night ≈ 2.7 %, the legacy's level), so the land's night still shows the
 * moon. The SKY's (round 3: skyAdapt, skyDepth, skyTwilight) is darker still through twilight and keeps falling after
 * it (the slope): round 2's sky curve compensated most of a sunset, held the twilight sky near noon's brightness, and
 * blew the glow round the sun out to white ("the rebuild really blows out the sky with fogginess and scatter at dawn
 * and dusk"). Sunset reads ≈ 2 % of noon, 21:00 ≈ 0.2 %. After twilight the night's own sky is set to the land's level instead (see _apply).
 */
const eyeCurve = (x, slope, depth, fall) => slope * x - depth * (1 - Math.exp(x / fall))

// ── Day/night cycle state shared with the debug panel and main.js ─────────────────────────────────────
export const SKY_CYCLE = { playing: false, hour: 12, dayLengthSec: 120 }

// Rod vision (the Purkinje shift): as light falls through the mesopic range, ~5 cd/m² down to ~0.01, colour
// drains toward a cool grey. It goes by each colour's OWN brightness, as an illuminance-equivalent π·L in sun
// units (10⁻³·⁵ ≈ 40 lux … 10⁻⁶·⁵ ≈ 0.04 lux): the twilight glow stays orange while the zenith beside it and
// the moonlit ground turn blue-grey.
const NIGHT_TINT = [0.80, 0.98, 1.45]
const rods = (e) => smooth(-3.5, -6.5, Math.log10(Math.max(e, 1e-12)))
// The sun disc's radiance per unit transmitted sunlight, and the moon's surface radiance per unit
// sunlight (albedo 0.12 / π) — the latter sets how faint the moon is by day.
const DISC_L = 9, MOON_SURFACE_L = 0.04
// Stars are drawn at a fixed displayed radiance (× SKY_PARAMS.stars), fading in with the dark, NOT through the eye: through
// it they dimmed whenever the night was retuned (round 3, owner: "it feels like i can only see the bright ones").
// 0.167 is what the eye gave them on a moonless night through round 2.
const STAR_L = 0.167
// The twilight grade's teal (luminance 1); the warmth ((r − b) / r) over which it hands over to the glow, untinted; and
// the elevations (sines, 3° → 15°) over which it comes in, so the horizon band keeps its own brown-orange all round.
const TEAL = [0.56, 1.12, 1.12], WARM_LO = 0.65, WARM_HI = 0.9, TEAL_EL0 = Math.sin(3 * D2R), TEAL_EL1 = Math.sin(15 * D2R)
const WB_STRENGTH = 0.5
/** three's ACESFilmicToneMapping on a grey input (its colour matrices are identity on grey), already × exposure / 0.6. */
const acesGrey = (v) => Math.max(0, (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081))
// The land's camera exposure (renderer.toneMappingExposure, into ACES): the legacy's day and night values, which
// the headlights, the campfire and every emissive were tuned against.
const LAND_EXPOSURE_DAY = 0.5, LAND_EXPOSURE_NIGHT = 0.36
// Chromatic adaptation: the eye also white-balances to the light it is standing in. This share of the current
// illuminant's cast (against noon's) is taken out, so a twilight that is honestly lilac reads blue-grey, and a
// golden hour keeps half its gold.
const WB_ADAPT = 0.5
/** The light falling on a horizontal surface, rgb, sun units: what the eye adapts its colour to. */
const illuminant = (st) => {
  const sh = Math.max(0, st.sunDir.y), mh = Math.max(0, st.moonDir.y), g = SKY_PARAMS.skyGain
  return [0, 1, 2].map(c => st.eSun[c] * sh + st.eMoon[c] * mh + g * st.eSky[c])
}

const _c = new THREE.Color()
const _v = new THREE.Vector3()
const _m4 = new THREE.Matrix4()

export class SkySystem {
  /**
   * @param {{ scene: THREE.Scene, renderer: THREE.WebGLRenderer, sun: THREE.DirectionalLight,
   *           sunFar?: THREE.DirectionalLight, farSplit?: number, ambient: THREE.HemisphereLight }} deps
   *   sun (+ the terrain cascade sunFar, which carries `farSplit` of the key) and ambient are the scene's
   *   lights; this drives their colour, intensity and the key's direction (sunDirection). scene.fog's
   *   density stays main.js's; its colour is only the fallback for scenes without the sky fog.
   */
  constructor ({ scene, renderer, sun, sunFar, farSplit = 0, ambient }) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping   // the land's curve (TWO CURVES); the sky grades itself
    this.scene = scene
    this.renderer = renderer
    this.sun = sun
    this.sunFar = sunFar ?? null
    this.farSplit = this.sunFar ? farSplit : 0
    this.ambient = ambient
    this.sunDirection = new THREE.Vector3(0, 1, 0)   // KEY-LIGHT direction (sun by day, moon by night); shadows follow it
    this.sunDir = new THREE.Vector3()                // the sun itself, below the horizon too
    this.moonDir = new THREE.Vector3()
    this.onLookApplied = null                        // main.js: re-light the prop impostors
    this._cycle = MOON_PARAMS.phase / 2              // free roam: MOON_PARAMS' default phase, waxing
    this._st = newState()
    this._noonEA = 0                                 // horizontal illuminance at noon, sun units (adaptation reference)
    this._particleNorm = 0
    this._moonOpacity = 0
    this._moonTint = new THREE.Color()
    this._controllers = []
    this._lastTime = (typeof performance !== 'undefined') ? performance.now() : 0

    // The world scene renders with the sky fog; every other scene (the menu stage) keeps three's flat fog.
    scene.onBeforeRender = () => { U.skyGlare.value.w = 1 }
    scene.onAfterRender = () => { U.skyGlare.value.w = 0 }

    this._skyMat = new THREE.ShaderMaterial({
      uniforms: { ...U, skyDisc: { value: new THREE.Vector4() }, skyStarFrame: { value: new THREE.Matrix3() }, skyStars: { value: 0 } },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    })
    this.skyMesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), this._skyMat)
    this.skyMesh.frustumCulled = false
    this.skyMesh.renderOrder = 1e6   // last of the opaque pass: depth-tested, it shades only the bare sky
    scene.add(this.skyMesh)
    scene.background = null

    this.moon = new MoonSystem(scene)
    this.setTimeOfDay(SKY_CYCLE.hour)
  }

  /** The moon's place in its synodic month, 0 new … 0.5 full … 1 new. Sets the disc's phase too. */
  setMoonCycle (cycle) {
    cycle = ((cycle % 1) + 1) % 1
    if (cycle === this._cycle) return
    this._cycle = cycle
    MOON_PARAMS.phase = 1 - Math.abs(1 - 2 * cycle)   // moon.js: 0 new … 1 full
    this.moon.apply()
    this.setTimeOfDay(SKY_CYCLE.hour)
  }

  /** Horizontal radius (m) at which the land is fully fogged — the drawn terrain's. Infinity: no edge. */
  setWorldRadius (r) {
    const f = U.skyFog.value
    if (!(r > 0) || !isFinite(r)) { f.x = 1e8; f.y = 1e9; return }
    // The edge ramp starts at 0.4 r (round 2, owner: "i might prefer if it fades in a little closer to the player";
    // 0.6 r read as a sudden wall). With Normal's haze: ~15 % fogged at 100 m, 37 % at 120, 65 % at 140, 89 % at 160.
    f.x = r * 0.4; f.y = r
  }

  /** The cycle's single entry point: put the sky, its lights and the moon at clock `hour` (0..24, wraps). */
  setTimeOfDay (hour) {
    SKY_CYCLE.hour = ((hour % 24) + 24) % 24
    if (!this._noonEA) this._calibrate()
    this._apply(simulate(SKY_CYCLE.hour, this._cycle, this._st))
    this._refreshGui()
  }

  /** Noon is the reference (re-run when an atmosphere knob moves): its adapted illuminance anchors the eye,
   *  and its direct sunlight is the white point — a camera's "daylight" white balance, applied partly
   *  (WB_STRENGTH), so noon sun reads near-white while dawn and dusk keep their colour. */
  _calibrate () {
    const st = simulate(SOLAR_NOON_H, 0, newState())
    this._noonEA = st.eA
    const l = lum(...st.tSun)
    this._wb = st.tSun.map(t => Math.pow(l / t, WB_STRENGTH))
    const ill = illuminant(st), il = lum(...ill)
    this._noonCast = ill.map(c => il / c)
    this._particleNorm = 0
  }

  /** Eye adaptation: sun units → render units. At noon a horizontal white surface reads π (radiance 1); below it the
   *  displayed brightness against noon's follows eyeCurve, the land's or the sky's. */
  _adaptScale (eH, land = false) {
    const p = SKY_PARAMS, r = Math.max(eH, 1e-12) / this._noonEA, x = Math.min(0, Math.log10(r))
    return Math.PI / this._noonEA * Math.pow(10, land ? eyeCurve(x, 0, p.landDepth, p.landTwilight) : eyeCurve(x, p.skyAdapt, p.skyDepth, p.skyTwilight)) / r
  }

  _apply (st) {
    this.sunDir.copy(st.sunDir); this.moonDir.copy(st.moonDir)   // first: nightFactor() reads sunDir
    // S: the eye (sun units → render units); X: the sky's pre-exposed scale; SL: the land's light, into ACES.
    const p = SKY_PARAMS, S = this._adaptScale(st.eEye), X = S * p.exposure, SL = this._adaptScale(st.eEye, true) * p.landGain
    // White balance, rod vision and the saturation trim: one colour treatment for every natural radiance.
    // `night` is rods() of the light's own brightness.
    const ill = illuminant(st), il = lum(...ill)
    // keep = how much of the cast survives: 0 takes WB_ADAPT of it out (the eye's own balance), 1 keeps all of it.
    const castWB = (keep) => this._wb.map((w, c) => w * Math.pow(il / Math.max(ill[c], 1e-30) / this._noonCast[c], WB_ADAPT * (1 - keep)))
    const wb = castWB(p.skyCast), wbL = castWB(p.landCast)
    // THE TWILIGHT GRADE (round 3, owner 11-09: "i much prefer the blues and greens in the sky during sunrise and sunset in
    // the legacy sky"). A grade, not physics: from the sun 14° up through the twilight, the sky (and so the fog) gets
    // duskSat more saturation, and a teal split tone — the sky above the horizon band that is not the warm glow tinted
    // toward TEAL, the glow left to the saturation's orange. Three RGB wavelengths turn the sky above a sunset mauve where film (and the legacy's
    // Preetham sky) shows the teal; this puts the teal back.
    // It fades out again with the last of the twilight: the moonlit sky is the rods' blue (nightBlue), as the land's is.
    const tw = (1 - smooth(4 * D2R, 14 * D2R, st.sun.el)) * smooth(DARK_EL, DARK_EL + 6 * D2R, st.sun.el)
    const ss = p.skySat + p.duskSat * tw, split = p.dusk * tw
    const treat = (r, g, b, out, night, sat = ss * (1 - night) + p.nightBlue * night, w = wb) => {
      r *= w[0]; g *= w[1]; b *= w[2]
      const l = lum(r, g, b)
      r += (l * NIGHT_TINT[0] - r) * night * 0.9; g += (l * NIGHT_TINT[1] - g) * night * 0.9; b += (l * NIGHT_TINT[2] - b) * night * 0.9
      const l2 = lum(r, g, b)
      out[0] = Math.max(0, l2 + (r - l2) * sat); out[1] = Math.max(0, l2 + (g - l2) * sat); out[2] = Math.max(0, l2 + (b - l2) * sat)
      return out
    }
    // The key light: the sun while any of its disc is up, else the moon. Both through the air.
    const sunKey = lum(...st.eSun) * Math.max(0, st.sunDir.y) >= lum(...st.eMoon) * Math.max(0, st.moonDir.y)
    const e = sunKey ? st.eSun : st.eMoon, kd = sunKey ? st.sunDir : st.moonDir
    const night = rods(st.eA)   // what a surface lit by this light looks like to the adapted eye
    // The land's own white balance, warmer than the sky's (the legacy's sunlit ground read warm, b/r 0.92 against
    // the rebuild's 1.15), handed over to the rods' blue-grey as the night comes in.
    // Rod vision on the land keeps its blue (nightBlue) rather than draining to the sky's grey: the legacy's moonlit
    // blue night, which the owner wants back.
    const wt = p.warmth * (1 - night), tint = [1, 1 - 0.25 * wt, 1 - wt], ls = p.saturation * (1 - night) + p.nightBlue * night
    const key = treat(e[0] * SL * tint[0], e[1] * SL * tint[1], e[2] * SL * tint[2], [0, 0, 0], night, ls, wbL)
    const kmax = Math.max(key[0], key[1], key[2], 1e-9)
    // Shadows from a body at the horizon smear the whole map; hold the direction ≥ 3° up (its light is ~0 there).
    this.sunDirection.copy(kd)
    if (this.sunDirection.y < Math.sin(3 * D2R)) {
      const hl = Math.hypot(kd.x, kd.z) || 1
      this.sunDirection.set(kd.x / hl * Math.cos(3 * D2R), Math.sin(3 * D2R), kd.z / hl * Math.cos(3 * D2R))
    }
    this.sun.color.setRGB(key[0] / kmax, key[1] / kmax, key[2] / kmax, THREE.LinearSRGBColorSpace)
    this.sun.intensity = kmax * (1 - this.farSplit)
    if (this.sunFar) { this.sunFar.color.copy(this.sun.color); this.sunFar.intensity = kmax * this.farSplit }
    // The fill: the sky's own irradiance (× ambient), and the ground lit by everything above it.
    const sky = treat(st.eSky[0] * p.skyGain * SL * tint[0], st.eSky[1] * p.skyGain * SL * tint[1], st.eSky[2] * p.skyGain * SL * tint[2], [0, 0, 0], night, ls, wbL)
    const down = Math.max(0, kd.y)
    const gnd = [0, 1, 2].map(c => GROUND_ALBEDO[c] * p.bounce * (key[c] * down + sky[c]))
    this.ambient.color.setRGB(sky[0] * p.ambient, sky[1] * p.ambient, sky[2] * p.ambient, THREE.LinearSRGBColorSpace)
    this.ambient.groundColor.setRGB(gnd[0], gnd[1], gnd[2], THREE.LinearSRGBColorSpace)
    this.ambient.intensity = 1
    // The land's camera: the legacy's exposure, 0.5 by day to 0.36 at night, on the lamps' own clock (nightFactor).
    this.renderer.toneMappingExposure = LAND_EXPOSURE_DAY + (LAND_EXPOSURE_NIGHT - LAND_EXPOSURE_DAY) * this.nightFactor()
    // THE NIGHT SKY'S LEVEL (round 2's night fog cap, owner 11-08: "rebuild nighttime still isnt dark enough … i think
    // its the fog being brighter than the terrain"). At night the land sits in ACES's toe while the airglow horizon, which
    // the fog is, does not: fogged land read 4.5× (new moon) to 8× (full moon) brighter than the unfogged land beside it,
    // so the far road and every ridge stood out. So the night's own sky (lutN: airglow + moonlight) is scaled until its
    // horizon is nightFog × flat ground (albedo 0.4 under these lights, through the land's ACES; a slope facing the moon
    // is brighter, one facing away darker), coming in over the last 3° of twilight (the sun's own fade). Round 3: the
    // sun's twilight is left as the sky's eye draws it — one scale for the whole sky dimmed the moonlit side to black
    // while the sunset glow still dominated the horizon, then popped it up when the glow went. Fully fogged land still
    // equals the sky behind it, so the world edge stays hidden; the stars and the moon are drawn on top at their own
    // brightness. It is the whole night sky, not a band near the horizon: a hillside rising 20° above the road fogs
    // toward the sky 20° up.
    const keyShare = (this.sun.intensity + (this.sunFar ? this.sunFar.intensity : 0)) * lum(this.sun.color.r, this.sun.color.g, this.sun.color.b) * this.sunDirection.y
    const flat = 0.4 / Math.PI * (keyShare + lum(this.ambient.color.r, this.ambient.color.g, this.ambient.color.b))
    let nh = 0
    for (let i = 0; i < LUT_W; i++) nh += lum(st.lutN[i * 3], st.lutN[i * 3 + 1], st.lutN[i * 3 + 2])
    const zn = p.nightFog * acesGrey(flat * this.renderer.toneMappingExposure / 0.6) / Math.max(nh / LUT_W * p.skyGain * X, 1e-12)
    const nightScale = zn + (1 - zn) * smooth(DARK_EL, DARK_EL + 3 * D2R, st.sun.el)

    // The LUT: radiance × sky gain × adaptation × exposure, as half floats.
    const L = st.lut, N = st.lutN, t3 = [0, 0, 0], g0 = p.skyGain, gN = p.skyGain * nightScale
    let hr = 0, hg = 0, hb = 0
    for (let i = 0, n = LUT_W * LUT_H; i < n; i++) {
      const k = i * 3, r = L[k] * g0 + N[k] * gN, g = L[k + 1] * g0 + N[k + 1] * gN, b = L[k + 2] * g0 + N[k + 2] * gN
      // rods() goes by the light's real brightness, not the level the night is drawn at
      treat(r * X, g * X, b * X, t3, rods(Math.PI * g0 * lum(L[k] + N[k], L[k + 1] + N[k + 1], L[k + 2] + N[k + 2])))
      if (tw > 0 && t3[0] > 0) {
        const up = smooth(TEAL_EL0, TEAL_EL1, ROWS[(i / LUT_W) | 0].y)
        const l = lum(t3[0], t3[1], t3[2]), kt = split * up * (1 - smooth(WARM_LO, WARM_HI, (t3[0] - t3[2]) / t3[0]))
        for (let c = 0; c < 3; c++) t3[c] *= 1 + kt * (TEAL[c] - 1)
        const l2 = lum(t3[0], t3[1], t3[2]) || 1
        for (let c = 0; c < 3; c++) t3[c] *= l / l2
      }
      LUT_DATA[i * 4] = THREE.DataUtils.toHalfFloat(t3[0])
      LUT_DATA[i * 4 + 1] = THREE.DataUtils.toHalfFloat(t3[1])
      LUT_DATA[i * 4 + 2] = THREE.DataUtils.toHalfFloat(t3[2])
      LUT_DATA[i * 4 + 3] = 0x3c00
      if (i < LUT_W) { hr += t3[0]; hg += t3[1]; hb += t3[2] }
    }
    LUT_TEX.needsUpdate = true
    // Fallback flat fog colour for any material without the sky uniforms: the mean horizon, crudely mapped.
    if (this.scene.fog) this.scene.fog.color.setRGB(Math.min(1, hr / LUT_W), Math.min(1, hg / LUT_W), Math.min(1, hb / LUT_W), THREE.LinearSRGBColorSpace)

    // Sun disc + glare, through the same air and the same eye.
    const glare = treat(st.tSun[0] * X, st.tSun[1] * X, st.tSun[2] * X, [0, 0, 0], 0)
    U.skySun.value.set(st.sunDir.x, st.sunDir.y, st.sunDir.z, p.glareG)
    U.skyGlare.value.x = glare[0] * p.glare; U.skyGlare.value.y = glare[1] * p.glare; U.skyGlare.value.z = glare[2] * p.glare
    const su = this._skyMat.uniforms
    su.skyDisc.value.set(glare[0] * DISC_L, glare[1] * DISC_L, glare[2] * DISC_L, Math.cos(p.sunSize * D2R))
    // Stars: a fixed radiance through the adaptation — invisible by day, out by late twilight.
    su.skyStars.value = STAR_L * p.stars * (1 - smooth(-5, -3, Math.log10(Math.max(st.eA, 1e-12))))
    su.skyStarFrame.value.copy(this._starFrame(SKY_CYCLE.hour))


    // The moon disc: its surface radiance through the air and the eye, against the brightness it is drawn at.
    const tm = st.tMoon, tmax = Math.max(tm[0], tm[1], tm[2], 1e-6)
    this._moonTint.setRGB(tm[0] / tmax, tm[1] / tmax, tm[2] / tmax)
    this._moonOpacity = clamp01(MOON_SURFACE_L * lum(...tm) * X / MOON_PARAMS.brightness) * smooth(-0.01, 0.02, st.moonDir.y)
    if (this.onLookApplied) this.onLookApplied()
  }

  /** World → star-sphere rotation at clock `hour`: the sky turns about the pole (37.4° up, due north) at
   *  the sidereal rate; on 21 June right ascension 18 h is on the meridian at local midnight. */
  _starFrame (hour) {
    const lst = (18 + (hour - (SOLAR_NOON_H - 12)) * 1.00274) * 15 * D2R
    const P = _v.set(0, Math.sin(LAT), -Math.cos(LAT))                   // celestial pole
    const M0x = 0, M0y = Math.cos(LAT), M0z = Math.sin(LAT)               // equator on the meridian (south, up)
    const c = Math.cos(lst), s = Math.sin(lst)                            // west is −X
    const X = [c * M0x - s, c * M0y, c * M0z], Y = [s * M0x + c, s * M0y, s * M0z]
    _m4.set(X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, P.x, P.y, P.z, 0, 0, 0, 0, 1)
    return (this._m3 ??= new THREE.Matrix3()).setFromMatrix4(_m4)
  }

  /** Per frame: the sky box and the moon follow the camera; a playing debug cycle advances. */
  update (camera) {
    this.skyMesh.position.copy(camera.position)
    const now = (typeof performance !== 'undefined') ? performance.now() : this._lastTime
    const dtSec = Math.min(0.1, (now - this._lastTime) / 1000)
    this._lastTime = now
    if (SKY_CYCLE.playing && SKY_CYCLE.dayLengthSec > 0) {
      this._playH = (this._playH ?? SKY_CYCLE.hour) + dtSec * (24 / SKY_CYCLE.dayLengthSec)
      if (Math.abs(this._playH - SKY_CYCLE.hour) >= 0.02) this.setTimeOfDay(this._playH)   // ~1 push per 1.2 game-minutes
    } else this._playH = null
    this.moon.update(camera, this.moonDir, this.sunDir, this._moonOpacity, this._moonTint)
  }

  /** 0 = daylight … 1 = night, for the lamps (headlight pools, campfire): sun from 4° above to 6° below. */
  nightFactor () { return clamp01((4 * D2R - Math.asin(this.sunDir.y)) / (10 * D2R)) }

  /** Linear RGB multiplier for the unlit particles (dust/smoke/spray): their irradiance against noon's. */
  particleLight (out) {
    if (!this._particleNorm) {
      const n = newState(), st = simulate(SOLAR_NOON_H, 0, n), S = this._adaptScale(st.eEye, true) * SKY_PARAMS.landGain
      this._particleNorm = 1 / (0.5 * lum(...st.eSun) * S + 0.5 * SKY_PARAMS.skyGain * lum(...st.eSky) * S * SKY_PARAMS.ambient)
    }
    const k = this.sun.intensity + (this.sunFar ? this.sunFar.intensity : 0), a = this.ambient
    const f = (key, sky) => Math.min(1, 0.02 + 0.98 * Math.pow(Math.max(0, (0.5 * key * k + 0.5 * sky * a.intensity) * this._particleNorm), 0.8))
    return out.setRGB(f(this.sun.color.r, a.color.r), f(this.sun.color.g, a.color.g), f(this.sun.color.b, a.color.b), THREE.LinearSRGBColorSpace)
  }

  /** Opacity multiplier for the same particles: their light's luminance against noon's (unlit smoke fades out). */
  particleAlpha () {
    const c = this.particleLight(_c)
    return Math.min(1, lum(c.r, c.g, c.b))
  }

  _refreshGui () { for (const c of this._controllers) c.updateDisplay() }

  /** The free-roam debug folder: the clock, the moon, and the atmosphere's few honest knobs. */
  addGui (gui) {
    const f = gui.addFolder('Sky / Lighting')
    f.close()
    const re = () => this.setTimeOfDay(SKY_CYCLE.hour)
    const recal = () => { this._calibrate(); re() }
    f.add(SKY_CYCLE, 'playing').name('play')
    this._controllers.push(f.add(SKY_CYCLE, 'hour', 0, 24, 0.01).name('hour').onChange(h => this.setTimeOfDay(h)))
    f.add(SKY_CYCLE, 'dayLengthSec', 5, 600, 1).name('day length (s)')
    const moon = { cycle: this._cycle }
    this._controllers.push(f.add(moon, 'cycle', 0, 1, 0.01).name('moon (0 new · .5 full)').onChange(c => this.setMoonCycle(c)))
    const a = f.addFolder('Atmosphere'); a.close()
    a.add(SKY_PARAMS, 'aod', 0, 0.5, 0.005).name('aerosol optical depth').onChange(recal)
    a.add(SKY_PARAMS, 'hazeAfternoon', 0, 2, 0.05).name('afternoon aerosol +').onChange(re)
    a.add(SKY_PARAMS, 'skyGain', 0.5, 5, 0.05).name('sky gain (multi-scatter)').onChange(recal)
    a.add(SKY_PARAMS, 'ambient', 0, 3, 0.05).name('ambient ×').onChange(re)
    a.add(SKY_PARAMS, 'saturation', 0, 1.5, 0.01).name('light saturation').onChange(re)
    a.add(SKY_PARAMS, 'exposure', 0.2, 3, 0.01).name('sky exposure').onChange(re)
    a.add(SKY_PARAMS, 'skyAdapt', 0, 1, 0.01).name('sky eye: unadapted share').onChange(re)
    a.add(SKY_PARAMS, 'skyDepth', 0, 3, 0.01).name('sky eye: depth (decades)').onChange(re)
    a.add(SKY_PARAMS, 'skyTwilight', 0.2, 3, 0.01).name('sky eye: twilight fall').onChange(re)
    a.add(SKY_PARAMS, 'skySat', 0, 2, 0.01).name('sky saturation').onChange(re)
    a.add(SKY_PARAMS, 'skyCast', 0, 1, 0.05).name('sky keeps light cast').onChange(re)
    a.add(SKY_PARAMS, 'duskSat', 0, 2, 0.05).name('twilight: + saturation').onChange(re)
    a.add(SKY_PARAMS, 'dusk', 0, 1.5, 0.05).name('twilight: teal').onChange(re)
    a.add(SKY_PARAMS, 'glare', 0, 3e-3, 1e-5).name('sun glare').onChange(re)
    a.add(SKY_PARAMS, 'glareG', 0.8, 0.99, 0.001).name('glare sharpness').onChange(re)
    a.add(SKY_PARAMS, 'sunSize', 0.27, 3, 0.01).name('sun radius (deg)').onChange(re)
    a.add(SKY_PARAMS, 'stars', 0, 4, 0.05).name('stars').onChange(re)
    a.add(SKY_PARAMS, 'moonAdapt', 0, 1, 0.01).name('eye adapts to moon').onChange(re)
    const l = f.addFolder('Land (ACES)'); l.close()
    l.add(SKY_PARAMS, 'landGain', 0.5, 4, 0.05).name('land gain').onChange(recal)
    l.add(SKY_PARAMS, 'landDepth', 0.5, 3, 0.01).name('night depth (decades)').onChange(re)
    l.add(SKY_PARAMS, 'landTwilight', 0.5, 5, 0.05).name('twilight fall').onChange(re)
    l.add(SKY_PARAMS, 'warmth', 0, 0.6, 0.01).name('warmth').onChange(re)
    l.add(SKY_PARAMS, 'landCast', 0, 1, 0.05).name('keep light cast').onChange(re)
    l.add(SKY_PARAMS, 'nightBlue', 0, 3, 0.05).name('night blue').onChange(re)
    l.add(SKY_PARAMS, 'bounce', 0, 1, 0.01).name('ground bounce').onChange(re)
    l.add(SKY_PARAMS, 'nightFog', 0, 1.5, 0.01).name('night fog ÷ land').onChange(re)
    this.moon.addGui(f)
    return f
  }
}

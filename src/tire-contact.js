/**
 * src/tire-contact.js — FEAT-70: the tire's contact with the ground, solved for the CYLINDER it is
 * (owner ruling 2026-11-03: option A, three lines across the width, the radial normal at edges).
 *
 * It replaces the tire-envelope stencil (main.js queryContacts, 4 rings × 8 directions around the
 * hub). That stencil sampled all around the hub, so it was a SPHERE: a kerb beside the tire lifted
 * the hub 76 mm (real tire: 0), a 15 cm step lifted it 74 mm in one 2 mm step at a ring seam (exact
 * 3 mm), and on real roads it read 9 mm off at p50 / 66 mm at p99 (Spare's measurement, ticket).
 *
 * The tire is a solid cylinder: radius r, width w, axis along the wheel's spin axle A. For three
 * lines across the tread (both edges and the centre) the surface is followed along the rolling
 * direction under the hub, and the point CLOSEST to the axle line wins:
 *   depth  = r − its distance to the axle (exact solid-cylinder penetration at those lines)
 *   point  = the lines' closest points weighted by their depth: the tread's pressure centre, where
 *            physics.js applies the tire's forces. On level ground that is the centre line, at a kerb
 *            under one edge it is that edge. (The deepest point alone sat at an edge on level ground —
 *            the first line wins a tie, a hair of roll picks one — and both drive wheels' push half a
 *            tread off the same side turned the truck 5° in 3 s of straight full throttle, 2026-11-05.)
 *   normal = the surface normal with its in-plane part turned to the RADIAL line from the point to
 *            the axle. On smooth ground the closest point is where the surface is tangent to the
 *            circle, so that IS the surface normal; at an edge it is the line from the edge to the
 *            axle, so a kerb pushes back horizontally (a kerb slows the wheel that hits it). The
 *            surface's tilt along the axle is kept, so a cross-slope still pushes downhill and the
 *            tire's grip holds it, as before.
 * Search per line: 9 coarse samples over [−r, r] (one under the hub, so flat ground is exact), then a
 * golden-section refinement in the bracket of every coarse local minimum (≈1.5 mm at a kink). One
 * minimum on smooth ground: 3 × (9 + 10) = 57 height samples per wheel, vs the stencil's 33 — measured
 * 1.9× its cost parked on a junction pad (397 vs 208 µs a frame for four wheels, wip/feat-70/perf.mjs);
 * 13 + 12 was no more accurate on real roads (p99 2.0 mm against a dense exact cylinder).
 * A hub centre BELOW the ground is a buried wheel, not a contact: the depth there is the half-space
 * measure h + r − cy, unbounded, which is what physics.js's tunnelling failsafe keys on.
 *
 * Approximations, flagged (ticket): one contact per surface, the deepest; a feature narrower than the
 * ~12 cm between lines can be missed (rocks are props with their own query); the lines are vertical
 * sections at the axle's horizontal offsets, so a wheel cambered by roll reads its edge lines a few
 * mm off; the tire's radial stiffness is the shipped tire spring.
 *
 * Pure: no DOM, no engine types, no Three.js. `heightAt(x, z)` and `normalAt(x, z)` are the caller's.
 */

const COARSE = 9                         // odd: one sample sits under the hub
const REFINE = 10                        // golden-section steps per bracket: 18 cm → ≈1.5 mm
const GOLD = (3 - Math.sqrt(5)) / 2       // 0.382 — the golden section of the larger side
const _v = new Float64Array(COARSE)

/**
 * @param {(x: number, z: number) => number} heightAt      ground height
 * @param {(x: number, z: number) => {x,y,z}} normalAt     ground unit normal
 * @param {number} cx,cy,cz   hub centre
 * @param {number} r          tire radius (the caller's effective radius — out-of-round included)
 * @param {number} w          tire width
 * @param {{x,y,z}} A         the spin axle, unit
 * @param {object} out        filled: { depth, nx, ny, nz, px, py, pz }
 * @returns {object|null}     `out`, or null when the tire does not touch the ground
 */
export function tireContact (heightAt, normalAt, cx, cy, cz, r, w, A, out) {
  const h0 = heightAt(cx, cz)
  if (h0 >= cy) {   // buried hub: the half-space measure
    const n = normalAt(cx, cz)
    out.depth = h0 + r - cy; out.nx = n.x; out.ny = n.y; out.nz = n.z; out.px = cx; out.py = h0; out.pz = cz
    return out
  }
  // Rolling direction on the ground: horizontal, perpendicular to the axle's horizontal part.
  const ah = Math.hypot(A.x, A.z) || 1
  const fx = -A.z / ah, fz = A.x / ah
  let best = Infinity, bx = 0, by = 0, bz = 0
  let sw = 0, sx = 0, sy = 0, sz = 0   // the lines' closest points, weighted by their depth
  for (let line = -1; line <= 1; line++) {
    const o = line * w / 2, ox = cx + o * A.x, oz = cz + o * A.z
    let lb = Infinity, lx = 0, ly = 0, lz = 0
    // Squared distance from the surface point at s along this line to the axle line through the hub.
    const rho2 = (s) => {
      const x = ox + s * fx, z = oz + s * fz, y = s === 0 && line === 0 ? h0 : heightAt(x, z)
      const dx = x - cx, dy = y - cy, dz = z - cz, da = dx * A.x + dy * A.y + dz * A.z
      const d2 = dx * dx + dy * dy + dz * dz - da * da
      if (d2 < lb) { lb = d2; lx = x; ly = y; lz = z }
      return d2
    }
    for (let k = 0; k < COARSE; k++) _v[k] = rho2(-r + 2 * r * k / (COARSE - 1))
    // Refine EVERY coarse local minimum, not just the best: an edge's basin can be narrower than the
    // 6 cm spacing, so its one sample can lose to the ground under the hub while the edge itself is
    // closer (a kerb 28 cm ahead read 20 mm low that way).
    for (let k = 0; k < COARSE; k++) {
      if ((k > 0 && _v[k - 1] < _v[k]) || (k < COARSE - 1 && _v[k + 1] < _v[k])) continue
      // Golden-section search on a BRACKETING TRIPLE a ≤ b ≤ c, f(b) ≤ f(a), f(c): b is the best point
      // so far and every probe shrinks the bracket round it. Not the two-interior-point form — with a
      // step face inside the bracket both of its probes can land on the high side, and it walks away
      // from an edge sitting at the bracket's end (a 30 cm step read 45 mm low that way).
      let a = -r + 2 * r * Math.max(0, k - 1) / (COARSE - 1), b = -r + 2 * r * k / (COARSE - 1)
      let c = -r + 2 * r * Math.min(COARSE - 1, k + 1) / (COARSE - 1), fb = _v[k]
      for (let it = 0; it < REFINE; it++) {
        const left = b - a > c - b
        const x = left ? b - GOLD * (b - a) : b + GOLD * (c - b)
        const fx = rho2(x)
        if (fx < fb) { if (left) c = b; else a = b; b = x; fb = fx } else if (left) a = x; else c = x
      }
    }
    const d = r - Math.sqrt(lb)
    if (d > 0) { sw += d; sx += d * lx; sy += d * ly; sz += d * lz }
    if (lb < best) { best = lb; bx = lx; by = ly; bz = lz }
  }
  const rho = Math.sqrt(best)
  if (!(rho < r)) return null
  // Radial unit, point → axle, perpendicular to the axle.
  let ux = cx - bx, uy = cy - by, uz = cz - bz
  const ua = ux * A.x + uy * A.y + uz * A.z
  ux -= ua * A.x; uy -= ua * A.y; uz -= ua * A.z
  const ul = Math.hypot(ux, uy, uz) || 1
  ux /= ul; uy /= ul; uz /= ul
  // The surface normal's tilt along the axle, kept; its in-plane part turned radial.
  const n = normalAt(bx, bz)
  const na = n.x * A.x + n.y * A.y + n.z * A.z
  const np = Math.sqrt(Math.max(0, 1 - na * na))
  let nx = na * A.x + np * ux, ny = na * A.y + np * uy, nz = na * A.z + np * uz
  const nl = Math.hypot(nx, ny, nz) || 1
  out.depth = r - rho; out.nx = nx / nl; out.ny = ny / nl; out.nz = nz / nl
  out.px = sx / sw; out.py = sy / sw; out.pz = sz / sw   // sw > 0: the deepest line is in it
  return out
}

// test/ab-shots.mjs — batch A/B screenshot set for the surface/cover work (the portfolio of 2026-09-24).
//
// One headless Chrome per server; for each CASE the freecam is placed at `cam` looking at `tgt`
// (yaw = atan2(-dx, -dz), the camera.js convention), the HUD is hidden, the sky hour set, and a
// PNG written. Camera heights are ground-relative on the CARVED surface (a RoadSystem is built
// headless for that), so a driver-view on a cut or fill road sits on the road, not inside the hill.
// Run the same list against two servers to get a matched before/after set:
//   node test/ab-shots.mjs 8000 9222 out/before     # main checkout
//   node test/ab-shots.mjs 3754 9333 out/after      # a worktree
//   node test/ab-shots.mjs 3754 9333 out/after 09,25 # only the cases whose id starts with these
//   node test/ab-shots.mjs 3754 9333 out/x 22 "window.terrain._terrainUniforms.uSurfOn.value=0"   # knob A/B
// Not a gate — never run by `npm test`. Seed 6 only (the vantages were scouted on it).
import { writeFileSync, mkdirSync } from 'node:fs'
import { launchChrome, connect, sleep } from './lib/cdp.mjs'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
const [PORT, CDP, OUT] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]]
const ONLY = process.argv[5] ? process.argv[5].split(',') : null   // optional: comma-separated case id prefixes
const EVAL = process.argv[6] || null   // optional: JS run in the page before the shots (knob A/Bs — e.g. "window.terrain._terrainUniforms.uSurfOn.value=0")
mkdirSync(OUT, { recursive: true })
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
const road = new RoadSystem(6, RANGER_PARAMS); if (road.setRadius) road.setRadius(760); road.update(new THREE.Vector3(0, 0, 0))
const { analyticHeight } = makeTerrainHeadless(6, RANGER_PARAMS, road)
const G = (x, z) => analyticHeight(x, z)   // CARVED ground: a camera on a cut/fill road sits on the road, not inside the hill
// helpers: cam/target in world; y ground-relative unless absolute given
const look = (cx, cz, ch, tx, tz, th, hour) => ({ cam: [cx, G(cx, cz) + ch, cz], tgt: [tx, G(tx, tz) + th, tz], hour })
const drive = (px, pz, tx, tz, back = 14, ahead = 40, h = 2.4, hour) => look(px - tx * back, pz - tz * back, h, px + tx * ahead, pz + tz * ahead, 1.0, hour)
const orbit = (tx, tz, az, dist, h, th = 0.5, hour) => look(tx + Math.cos(az) * dist, tz + Math.sin(az) * dist, h, tx, tz, th, hour)
export const CASES = [
  // biomes
  { id: '01-meadow', g: 'Biomes', t: 'Meadow basin', d: 'Flat green basin, the wettest ground rule (rel −7 m). Grass texture + splotch mats + backcountry cover.', ...orbit(-192, -500, 0.4, 16, 2.6) },
  { id: '02-fertile', g: 'Biomes', t: 'Fertile bench', d: 'Flat bench green, forest ground. Same grass map, no basin.', ...orbit(-160, -528, 2.2, 15, 2.4) },
  { id: '03-dirt-slope', g: 'Biomes', t: 'Dirt slope', d: 'Slope 0.27, below treeline: clods + angular pebbles, green in the hollows, ricegrass thinning on.', ...orbit(-176, -528, 1.0, 14, 2.4, 0.3) },
  { id: '04-cliff', g: 'Biomes', t: 'Rock cliff face', d: 'Slope 0.7 at 222 m: fragment texture side-projected so it does not streak.', ...orbit(0, -32, 1.9, 30, 4, 6) },
  { id: '05-alpine', g: 'Biomes', t: 'Above the treeline', d: 'Bare plateau at 281 m, rock by altitude. Zone rocks at full weight.', ...orbit(24, 8, -0.9, 34, 16, 0) },
  { id: '06-peak', g: 'Biomes', t: 'The summit', d: 'The seed-6 peak (281 m) from 80 m out, 25 m up.', ...orbit(0, 0, 3.9, 80, 25, 2) },
  { id: '07-forest-meadow', g: 'Biomes', t: 'Forest meadow, no road', d: 'Backcountry only: the patchiness field with no wall in frame.', ...orbit(-432, -480, 0.7, 18, 2.6) },
  // transitions
  { id: '08-grass-dirt', g: 'Transitions', t: 'Grass to dirt', d: 'Vertex weights 0.5/0.5 — the height contest decides texel by texel.', ...orbit(-128, -576, 1.5, 12, 2.2) },
  { id: '09-dirt-rock', g: 'Transitions', t: 'Dirt to rock', d: 'Rock plates surfacing through dirt, coloured locally.', ...orbit(-160, 176, 2.7, 14, 2.4) },
  { id: '10-grass-rock', g: 'Transitions', t: 'Treeline (grass to rock)', d: 'Altitude rock taking over the green at ~130 m.', ...orbit(560, -384, 0.2, 16, 2.6) },
  { id: '11-knoll', g: 'Transitions', t: 'Knoll in grass', d: 'Local maximum (+4 m over the 40 m mean): the knoll rock rule pokes fragments through.', ...orbit(-160, -560, 3.5, 18, 3) },
  // water
  { id: '12-pond-high', g: 'Water', t: 'Pond from above', d: 'A 50 m pond from 40 m up: shoreline skirt, cover thinning to the water.', ...orbit(139, 341, 2.4, 70, 40, 0) },
  { id: '13-pond-shore', g: 'Water', t: 'Pond shoreline', d: 'Eye level on the skirt.', ...orbit(139, 341, 2.4, 62, 2.4, 0) },
  { id: '14-stream-x', g: 'Water', t: 'Stream crossing (causeway)', d: 'Road over a meander stream, driver view.', ...drive(-268, -386, 1, 0, 24, 30) },
  { id: '15-stream-spawn', g: 'Water', t: 'Stream below the peak', d: 'The crossing at (0,−67), looking upstream.', ...orbit(-0, -67, 1.2, 20, 3) },
  // roads
  { id: '16-pass-drive', g: 'Roads', t: 'The pass, driver view', d: 'Road at 182 m with walls +29 m both sides within 35 m — the highway pass between two narrow peaks.', ...drive(704, 201, 0.83, -0.56, 10, 30, 3.5) },
  { id: '17-pass-high', g: 'Roads', t: 'The pass from above', d: 'Same pass, 70 m up, perpendicular.', ...orbit(704, 201, 0.98, 60, 70, 0) },
  { id: '18-tunnel', g: 'Roads', t: 'Tunnel portal', d: 'Bore at (−108,−70): the cut face and the portal cliff.', ...drive(-108, -88, 0, -1, 34, 30, 3) },
  { id: '19-junction-over', g: 'Roads', t: 'Junction overhead', d: 'Pad, aprons and the beaten-back wall from 55 m.', ...look(-38, 183 + 32, 55, -38, 183, 0) },
  { id: '20-junction-drive', g: 'Roads', t: 'Junction, driver view', d: 'Approach to the (−406,−345) T.', ...drive(-406, -345, 0.95, 0.31, 36, 20) },
  { id: '21-road-meadow', g: 'Roads', t: 'Road through the meadow', d: 'The wall at −80 %, sporadic; backcountry beyond.', ...drive(-154, -512, 0.14, -0.99, 12, 40) },
  { id: '22-road-rock', g: 'Roads', t: 'Road through rock', d: 'No cover (nothing stands on rock); zone rocks in fans.', ...drive(427, -82, 0.79, 0.61, 12, 40) },
  { id: '23-road-high', g: 'Roads', t: 'High point, vista', d: 'Road summit at 259 m, looking out over the range.', ...look(-108, 6, 3, -108, 6 - 120, -20) },
  { id: '24-road-low', g: 'Roads', t: 'Low point, valley floor', d: 'Road at 84 m, the lowest sample in the window.', ...drive(-158, -483, 0.2, -0.98, 12, 40) },
  // close-ups
  { id: '25-cutbank', g: 'Close-ups', t: 'Cut bank', d: 'Engineered cut face: the rock fragment map at 2 m.', ...look(-40, 192 + 18, 4, -40, 192, 0) },
  { id: '26-dirt-close', g: 'Close-ups', t: 'Dirt shoulder, 3 m', d: 'Pebbles, clods, medium rocks and clumps at arm’s length.', ...look(-30, 197 + 14, 3, -30, 197, 0) },
  { id: '27-grass-close', g: 'Close-ups', t: 'Grass at 2 m', d: 'Tuft strokes and the splotch edge up close.', ...orbit(-192, -500, 2.0, 6, 1.6, 0) },
  // distance / light
  { id: '28-far-ring', g: 'Distance', t: 'Far ring and fade', d: 'From 12 m up: the cover thinning into the far ring, medium rocks fading.', ...look(-38, 183 + 30, 12, -38, 183 - 90, 0) },
  { id: '29-dusk', g: 'Distance', t: 'Meadow at 17:30', d: 'Same meadow under a low afternoon sun.', ...orbit(-192, -500, 0.4, 16, 2.6, 0.5, 17.5) },
  { id: '30-morning-pass', g: 'Distance', t: 'The pass at 08:00', d: 'Low morning light across the pass relief.', ...drive(704, 201, 0.83, -0.56, 40, 30, 3, 8) },
]
const APP = `http://localhost:${PORT}/index.html?nomenu=1&nofog=1`
try { const r = await fetch(APP); if (!r.ok) throw 0 } catch { console.error('no server on', PORT); process.exit(1) }
launchChrome(APP, { port: CDP })
const client = await connect({ port: CDP })
await sleep(10000)
for (let i = 0; i < 30; i++) { const r = await client.evalJS(`typeof window.__view==='function'`); if (r.val) break; await sleep(500) }
await client.evalJS(`const st=document.createElement('style'); st.textContent='#hud,#cluster,#teleport-btn,#controls{display:none!important}'; document.head.appendChild(st)`)
if (EVAL) { const r = await client.evalJS(EVAL); if (r.err) console.error('eval:', r.err) }
for (const c of CASES) {
  if (ONLY && !ONLY.some(k => c.id.startsWith(k))) continue
  const [cx, cy, cz] = c.cam, [tx, ty, tz] = c.tgt
  const dx = tx - cx, dy = ty - cy, dz = tz - cz
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz))
  await client.evalJS(`window.__view(${cx}, ${cy}, ${cz}, ${yaw}, ${pitch})`)
  await client.evalJS(`window.sky && window.sky.setTimeOfDay(${c.hour ?? 12.5})`)
  await sleep(9000)
  await client.evalJS(`window.sky && window.sky.setTimeOfDay(${c.hour ?? 12.5})`)
  await sleep(600)
  const shot = await client.cmd('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/${c.id}.png`, Buffer.from(shot.result.data, 'base64'))
  console.log(PORT, c.id)
}
client.close(); process.exit(0)

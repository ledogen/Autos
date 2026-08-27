// GATE (run-all, HEAVY — test:all / desktop only, NEVER npm test): node test/play-area.mjs
//
// BUG-56 workstream D — CAN A STORY RUN START AT ALL?
//
// The owner's third bar, 2026-08-27: settings exist under which NO seed can start a story run, so
// prove a playable, fully connected area is generatable, and run that proof whenever terrain or
// router settings change. That is why this gate runs on settings changes and not on every commit:
// it is minutes per seed, because it routes 144 km2 of world.
//
// THE PLAY AREA, owner-specified: a 3x3 grid of SQUARE tiles 4000 m on a side. Nine regions,
// 12 km x 12 km, one per story region, roughly equal area each.
//
// FIVE FIXED SEEDS, fixed on purpose: a regression has to be attributable, and the numbers have to
// compare across commits. The world is infinite and procedural and there is no standard seed set,
// so these five are this gate's own instrument, nothing more.
//
// The checks live in src/world-validate.js, NOT here, because the game runs the identical routine
// on the player's own seed once at new-game (workstream C's reroll) and the two must not drift.
// GATING: one component · zero condemned edges · zero node-pin violations.
// REPORTED: the grade histogram, the ladder rungs, and per-tile road length — a region with no
// road in it is a region with no missions, which is worth seeing even though it is not a failure.

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { parseWorldSeed } from '../src/seed.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { validatePlayArea, playAreaStreamRadius, STORY_TILE_M, STORY_GRID } from '../src/world-validate.js'

const argv = process.argv.slice(2)
const VERBOSE = argv.includes('--verbose')
const ONLY = (argv.find((a) => a.startsWith('--seed=')) || '').split('=')[1]

const SEEDS = ['6', '3', '7', '20', '11']
const CENTRE = { x: 0, z: 0 }

let fails = 0
console.log(`play-area: ${STORY_GRID}x${STORY_GRID} tiles of ${STORY_TILE_M} m ` +
            `= ${(STORY_GRID * STORY_TILE_M / 1000).toFixed(0)} km square, ` +
            `${((STORY_GRID * STORY_TILE_M / 1000) ** 2).toFixed(0)} km2 · ${SEEDS.length} fixed seeds\n`)

for (const seed of SEEDS) {
  if (ONLY && seed !== ONLY) continue
  const t0 = Date.now()
  const road = new RoadSystem(parseWorldSeed(seed), P)
  road.setRadius(playAreaStreamRadius())
  road.update(new THREE.Vector3(CENTRE.x, 0, CENTRE.z))
  const r = validatePlayArea(road, CENTRE, P)
  const secs = ((Date.now() - t0) / 1000).toFixed(0)

  const pc = (v) => `${(100 * v).toFixed(2)} %`
  const head = `seed ${seed.padEnd(4)} ${String(r.runs).padStart(4)} runs · ${r.km.toFixed(0).padStart(4)} km · ` +
               `components ${r.components} · condemned ${r.condemned.length} · unpinned ${r.unpinned.length} · ${secs}s`
  if (r.ok) console.log(`  ok   ${head}`)
  else { fails++; console.log(`  FAIL ${head}`) }

  console.log(`         grade — over 20 %: ${pc(r.grade.over20)} · over 24 %: ${pc(r.grade.over24)} · ` +
              `over 30 %: ${pc(r.grade.over30)} · worst ${(100 * r.grade.worst).toFixed(0)} %`)
  console.log(`         rungs — cap ${r.grade.rungCap} · fine ${r.grade.rungFine} · relief ${r.grade.rungRelief} · ` +
              `ceiling ${r.grade.rungCeiling} · re-routed ${r.grade.reroutes}`)
  const empty = r.tiles.filter((t) => t.km < 1)
  console.log(`         tiles — road km per region: ${r.tiles.map((t) => t.km.toFixed(0)).join(' ')}` +
              (empty.length ? `   (${empty.length} with under 1 km)` : ''))
  if (!r.ok || VERBOSE) {
    for (const c of r.condemned.slice(0, 8)) console.log(`         CONDEMNED ${c}`)
    for (const u of r.unpinned.slice(0, 8)) console.log(`         UNPINNED  node ${u.node} spread ${u.spread.toFixed(1)} m`)
  }
}

if (fails) {
  console.log(`\nFAIL — ${fails}/${SEEDS.length} seeds cannot start a story run (BUG-56 D)`)
  process.exit(1)
}
console.log(`\nPASS — every fixed seed generates a connected, fully-solved ${(STORY_GRID * STORY_TILE_M / 1000).toFixed(0)} km play area`)

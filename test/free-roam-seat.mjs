// GATE (run-all): node test/free-roam-seat.mjs
//
// BUG-141 (owner, 2026-11-07: "it can still spawn you facing the end of a spur with nowhere to go … it should always
// spawn you on relatively level ground and not right at the end of the spur. Relatively level is like under a 20%
// grade"). Free roam seats the truck with RoadSystem.freeRoamSeat, from the spawn decision's road point. On four
// random seeds from the 100-seed census (wip/bug-141), one per rule today's spawn broke plus one it did not:
//
//   rules   the seat is under 20 % grade (deck, ±4 m), at least 150 m from a dead end (walking through bends), and
//           not facing the short way to a dead end;
//   stays   the seat is on the spawn's own road, within 200 m of the spawn point;
//   clean   where the spawn broke no rule, the seat does not move it (< 1 m).
//
// The spawn DECISION itself (the story region's centre, BUG-121) is world-determinism's, and unchanged.

import { spawnDecision } from './lib/spawn-decision.mjs'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const SEEDS = [
  ['1536055470', 'at a spur\'s dead end, facing it'],
  ['1016364815', 'on a 25 % grade'],
  ['2811484882', 'facing a dead end 2.2 km down a spur'],
  ['672275505', 'clean'],
]
let fails = 0
const check = (label, ok, detail = '') => { console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${detail ? '  ' + detail : ''}`); if (!ok) fails++ }

for (const [seed, what] of SEEDS) {
  const d = spawnDecision(seed, P)
  if (!d.onRoad) { check(`seed ${seed}: spawns on a road`, false); continue }
  const road = d.road, e = road._network.get(d.near.runKey), C = e.polyCum, L = C[C.length - 1]
  const s = road.freeRoamSeat(d.near)
  if (!s) { check(`seed ${seed}: a seat`, false); continue }
  // the seat's arc on the run, and the road each way from it
  let best = { d: Infinity }
  for (let i = 1; i < e.points.length; i++) {
    const a = e.points[i - 1], b = e.points[i], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((s.point.x - a.x) * ex + (s.point.z - a.z) * ez) / l2)) : 0
    const dd = Math.hypot(s.point.x - a.x - t * ex, s.point.z - a.z - t * ez)
    if (dd < best.d) best = { d: dd, s: C[i - 1] + t * (C[i] - C[i - 1]), tx: ex, tz: ez }
  }
  const toA = best.s + road._deadEndReach(d.near.runKey, true), toB = L - best.s + road._deadEndReach(d.near.runKey, false)
  const fwdB = s.tangent.x * best.tx + s.tangent.z * best.tz > 0, ahead = fwdB ? toB : toA, behind = fwdB ? toA : toB
  const moved = Math.hypot(s.point.x - d.x, s.point.z - d.z)
  console.log(`seed ${seed} (${what}): seat ${moved.toFixed(0)} m from the spawn, grade ${(s.grade * 100).toFixed(1)} %, `
    + `dead end ${isFinite(Math.min(toA, toB)) ? Math.min(toA, toB).toFixed(0) + ' m' : 'none'}, ahead ${isFinite(ahead) ? ahead.toFixed(0) + ' m' : 'a junction'}`)
  check(`seed ${seed}: under 20 % grade`, s.grade < 0.2)
  check(`seed ${seed}: at least 150 m from a dead end`, Math.min(toA, toB) >= 150)
  check(`seed ${seed}: not facing the short way to a dead end`, !(ahead < behind))
  check(`seed ${seed}: on the spawn's road within 200 m`, best.d < 0.5 && moved <= 200, `${best.d.toFixed(2)} m off the run, ${moved.toFixed(0)} m moved`)
  if (what === 'clean') check(`seed ${seed}: a clean spawn does not move`, moved < 1)
}
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL FREE-ROAM-SEAT CHECKS PASSED')
process.exit(fails ? 1 : 0)

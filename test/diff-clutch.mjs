// test/diff-clutch.mjs — FEAT-166: the clutch-type LSD (rearDiffMode 'clutch', data/parts.js diffClutchLSD).
//
// On the real stepPhysics, one rear on 0.35 grip, floored to 10 m/s by a driver who holds the line:
//   • new packs sit between the open diff and the helical LSD — the ladder's middle rung;
//   • worn-out packs ARE the open diff: the same run, step for step;
//   • the packs wear with the heat they slip: the damage model takes exactly ∫ diffSlipW dt / durDiffClutch
//     off the 'diff' track (a worn-out rear tire makes the split there, as on the road);
//   • no other diff writes the slip field (a truck without one keeps its state byte-identical);
//   • the shop rebuilds the clutch type straight to 100%, priced pro rata on the gap, and nothing else.

import * as THREE from 'three'
import { drive } from './lib/flat-drive.mjs'
import { DamageModel, DAMAGE_PARAMS } from '../src/damage.js'
import { repairTargets } from '../src/service.js'
import { REPAIRS } from '../data/parts.js'

const fails = []
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }
const to10 = (vs, t, vF) => vF >= 10
const _f = new THREE.Vector3()
const straight = (t, vs) => {
  _f.set(0, 0, -1).applyQuaternion(vs.quaternion)
  return { throttle: 1, steer: Math.max(-0.5, Math.min(0.5, -2 * Math.atan2(-_f.x, -_f.z) - 0.4 * vs.angularVelocity.y)) }
}
const SPLIT = { muScale: [1, 1, 0.35, 1], input: straight, until: to10, tMax: 15 }
let slipSeen = false
const watch = (vs) => { if ('diffSlipW' in vs.drivetrain) slipSeen = true }

const open = await drive({ ...SPLIT, diff: 'open', onStep: watch })
const helical = await drive({ ...SPLIT, diff: 'lsd', onStep: watch })
check(!slipSeen, 'the open and helical diffs never write the clutch-slip field')
const fresh = await drive({ ...SPLIT, diff: 'clutch' })
const worn = await drive({ ...SPLIT, diff: 'clutch', extra: { _diffClutchScale: 0 } })
console.log(`split grip 0–10 m/s: open ${open.t.toFixed(2)} s · clutch new ${fresh.t.toFixed(2)} s · clutch worn ${worn.t.toFixed(2)} s · helical ${helical.t.toFixed(2)} s`)
check(open.t > fresh.t && fresh.t > helical.t, 'new packs sit between the open diff and the helical LSD')
check(worn.t === open.t && worn.state.every((x, i) => x === open.state[i]), 'worn-out packs are the open diff, step for step')

let dm = null, E = 0
await drive({ diff: 'clutch', input: straight, until: to10, tMax: 15,
  onStep: (vs, P, dt) => { if (!dm) { dm = new DamageModel({ params: P }); dm.set('tireRL', 0) } E += (vs.drivetrain.diffSlipW ?? 0) * dt; dm.step(vs, P, dt) } })
const lost = 1 - dm.get('diff'), want = E / DAMAGE_PARAMS.durDiffClutch
console.log(`worn-tire launch: ${(E / 1000).toFixed(1)} kJ slipped → packs −${(lost * 100).toFixed(3)} % (expected −${(want * 100).toFixed(3)} %)`)
check(E > 0 && Math.abs(lost - want) <= 0.01 * want, 'the packs wear with the heat they slip')

check(repairTargets('diff', 0.4, 'diffClutchLSD').join() === '1' && repairTargets('diff', 1, 'diffClutchLSD').length === 0,
  'a worn clutch diff rebuilds straight to 100%')
check(['diffOpen', 'diffLSD', 'diffWelded'].every(id => repairTargets('diff', 0.4, id).length === 0), 'no other diff is rebuilt')
check(REPAIRS.diff.price > 0, 'the rebuild has a price')

if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1) }
console.log('\ndiff-clutch: all PASS')

// test/crash-fatal.mjs — BUG-168 gate: a crash into something rigid is measured as the crash it was, and kills on the
// threshold. The real truck, the real engine, the game's contact → damage step (test/crash-lab.mjs).
//
// Pinned RELATIVE to fatalMph(), so the owner can move the 40 / 65 mph numbers without touching this:
//   §1 a head-on into a rigid wall prices the truck's own Δv: the impact speed plus its small rebound (1.0–1.2×).
//   §2 at the fatal speed it is fatal; at 80 % of it, it is not. Fresh armor and worn.
//   §3 one crash is priced once: an off-centre tree strike outlasts the burst window, and its second burst must
//      not reach back past the first (it did: 69 + 75 mph from a 70 mph hit, fatal at full armor).

import { crash } from './crash-lab.mjs'
import { fatalMph } from '../src/damage.js'

let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }
const maxV = (r) => Math.max(0, ...r.landed.map(l => l.mph))

console.log('§1 a head-on into a rigid wall is priced at the truck\'s own Δv')
for (const mph of [50, 90]) {
  const r = await crash({ target: 'wall', mph })
  const k = maxV(r) / mph
  ok(k >= 1.0 && k <= 1.2, `${mph} mph head-on → ${maxV(r).toFixed(1)} mph equivalent (×${k.toFixed(2)}, the rebound on top)`)
}

console.log('§2 fatal at the threshold, alive at 80 % of it')
for (const armor of [1, 0.3]) {
  const thr = fatalMph(armor)
  const at = await crash({ target: 'wall', mph: thr, armor })
  ok(!!at.fatal, `armor ${armor}: a ${thr.toFixed(0)} mph head-on is fatal (${maxV(at).toFixed(1)} mph equivalent)`)
  const below = await crash({ target: 'wall', mph: 0.8 * thr, armor })
  ok(!below.fatal, `armor ${armor}: a ${(0.8 * thr).toFixed(0)} mph head-on is not (${maxV(below).toFixed(1)} mph equivalent)`)
}

console.log('§3 one crash is priced once')
{
  const r = await crash({ target: 'tree', mph: 70, angleDeg: 60 })
  const sum = r.landed.reduce((s, l) => s + l.mph, 0)
  ok(r.landed.length >= 2, `the off-centre tree strike outlasts one burst (${r.landed.map(l => l.mph).join(' + ')} mph)`)
  ok(sum <= 1.25 * 70, `...and its bursts add up to the one hit's Δv, not twice it (${sum.toFixed(1)} mph from a 70 mph strike)`)
}

console.log(fail ? '\nFAIL — a crash is mis-measured or the fatal rule has drifted' : '\nPASS — rigid crashes price the truck\'s Δv once, and kill at the threshold')
process.exit(fail)

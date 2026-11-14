// test/tire-contact.mjs — FEAT-70: the tire's ground contact solved as a cylinder (src/tire-contact.js).
//
// Synthetic surfaces (Spare's 2026-11-01 measurement, ticket), a 0.368 m × 0.235 m tire heading +x:
//   • rolling onto kerbs, the hub's REST height (depth 0) climbs continuously — no jump per 2 mm of
//     travel bigger than the exact cylinder's own, and within 2 mm of a dense exact solve throughout;
//   • a kerb running beside the tire, outside its width, lifts nothing (the stencil lifted 76 mm);
//   • flat ground is exact (depth h + r − cy, normal up); a cross-slope keeps its tilted normal;
//   • at a kerb edge the normal is the surface's (PERF-39, owner 2026-11-12: the 11-03 radial edge normal popped tires);
//   • a buried hub reads the unbounded half-space depth (physics.js's tunnelling failsafe keys on it).

import { tireContact } from '../src/tire-contact.js'

const r = 0.368, w = 0.235, A = { x: 0, y: 0, z: 1 }   // axle along z: the wheel rolls along x
const UP = { x: 0, y: 1, z: 0 }
const out = {}
const fails = []
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

// A step of height H across the path (edge width `edge`, at angle `ang` to the axle).
const kerb = (H, edge = 0, ang = 0) => (x, z) => {
  const u = x * Math.cos(ang) + z * Math.sin(ang)
  return edge > 0 ? H * Math.min(1, Math.max(0, u / edge)) : (u >= 0 ? H : 0)
}
const upNormal = () => UP
// Hub rest height at (x, 0): bisect cy for depth = 0.
const rest = (h, x, solve) => {
  let lo = -1, hi = 2
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (solve(h, x, m) > 0) lo = m; else hi = m }
  return (lo + hi) / 2
}
const ours = (h, x, cy) => tireContact(h, upNormal, x, cy, 0, r, w, A, out)?.depth ?? 0
// The exact cylinder, dense: 7 lines across the width × 2000 points along each (0.4 mm), min distance to the axle.
const exact = (h, x, cy) => {
  let best = Infinity
  for (let j = 0; j <= 6; j++) {
    const z = -w / 2 + w * j / 6
    for (let i = 0; i <= 2000; i++) { const s = -r + 2 * r * i / 2000, y = h(x + s, z); best = Math.min(best, s * s + (y - cy) ** 2) }
  }
  return r - Math.sqrt(best)
}
const roll = (h, f) => { const o = []; for (let x = -0.45; x <= 0.45 + 1e-9; x += 0.002) o.push(rest(h, x, f)); return o }
const maxJump = (a) => a.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v - a[i])), 0)
const maxErr = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0)

for (const [name, h] of [['sharp 15 cm step', kerb(0.15)], ['15 cm over 5 cm', kerb(0.15, 0.05)],
  ['sharp 15 cm at 30°', kerb(0.15, 0, Math.PI / 6)], ['sharp 30 cm step', kerb(0.30)]]) {
  const a = roll(h, ours), e = roll(h, exact)
  const jump = maxJump(a), eJump = maxJump(e), err = maxErr(a, e)
  console.log(`${name.padEnd(20)} hub climb per 2 mm: ours ${(jump * 1000).toFixed(1)} mm · exact ${(eJump * 1000).toFixed(1)} mm · max error ${(err * 1000).toFixed(1)} mm`)
  check(jump <= eJump + 0.002 && err <= 0.002, `${name}: continuous climb, within 2 mm of the exact cylinder`)
}

for (const gap of [0.15, 0.25]) {
  const h = (x, z) => (z >= gap ? 0.15 : 0)
  const lift = rest(h, 0, ours) - r
  check(Math.abs(lift) < 1e-6, `a 15 cm kerb ${gap * 100} cm beside the centre plane lifts nothing (${(lift * 1000).toFixed(1)} mm)`)
}

const flat = tireContact(() => 0.1, upNormal, 0, 0.4, 0, r, w, A, out)
check(Math.abs(flat.depth - (0.1 + r - 0.4)) < 1e-12 && flat.ny === 1, `flat ground is exact (depth ${flat.depth.toFixed(6)})`)

// The contact point is where physics.js applies the tire's forces, so it is the tread's pressure centre:
// a point at one edge on level ground put both drive wheels' push half a tread off the same side — a
// yaw moment that turned the truck 5° in 3 s of straight full throttle (2026-11-05).
check(Math.abs(flat.pz) < 1e-9, `level ground: the contact point is under the hub, not at an edge (${(flat.pz * 1000).toFixed(1)} mm across)`)
const r1 = 1 * Math.PI / 180, A1 = { x: 0, y: Math.sin(r1), z: Math.cos(r1) }
const rolled = tireContact(() => 0.1, upNormal, 0, 0.4, 0, r, w, A1, out)
check(Math.abs(rolled.pz) < 0.01, `rolled 1°: the contact point stays near the centre (${(rolled.pz * 1000).toFixed(1)} mm across)`)
const half = tireContact((x, z) => (z >= 0.05 ? 0.15 : 0), upNormal, 0, 0.5, 0, r, w, A, out)   // a kerb under the +z edge only
check(Math.abs(half.pz - w / 2) < 1e-9, `a kerb under one edge: the contact point is that edge (${(half.pz * 1000).toFixed(1)} mm across)`)

const cs = 0.2   // cross-slope along the axle: y = 0.2 z
const csN = { x: 0, y: 1 / Math.hypot(1, cs), z: -cs / Math.hypot(1, cs) }
const c = tireContact((x, z) => cs * z, () => csN, 0, 0.3, 0, r, w, A, out)
check(Math.abs(c.nz - csN.z) < 1e-3 && Math.abs(c.ny - csN.y) < 1e-3, `a cross-slope keeps its tilted normal (n ${c.nx.toFixed(3)}, ${c.ny.toFixed(3)}, ${c.nz.toFixed(3)})`)

const k = tireContact(kerb(0.15), upNormal, -0.2, 0.45, 0, r, w, A, out)   // the corner (0, 0.15) is 0.36 m from the axle, the ground under it 0.45
check(k && k.ny === 1, `at a kerb edge the normal is the surface's, not radial (n ${k?.nx.toFixed(3)}, ${k?.ny.toFixed(3)})`)

const b = tireContact(() => 0.5, upNormal, 0, 0.2, 0, r, w, A, out)
check(Math.abs(b.depth - (0.5 + r - 0.2)) < 1e-12, `a buried hub reads the half-space depth (${b.depth.toFixed(3)} m)`)

// A tire lying on its side (axle along the ground normal) touches with its sidewall: the cap, w/2 under the hub.
// Distance to the axle LINE alone read depth ≈ r at any height — the truck rolled onto its side launched (2026-11-06).
const AV = { x: 0, y: 1, z: 0 }
const lying = tireContact(() => 0, upNormal, 0, 0.3, 0, r, w, AV, out)
check(lying === null, `a tire lying 30 cm over the ground does not touch it (depth ${lying?.depth.toFixed(3) ?? 'none'})`)
const flatOn = tireContact(() => 0, upNormal, 0, 0.1, 0, r, w, AV, out)
check(flatOn && Math.abs(flatOn.depth - (w / 2 - 0.1)) < 1e-9 && flatOn.ny > 0.999, `a tire lying with its hub 10 cm up sinks w/2 − 0.1 = ${((w / 2 - 0.1) * 1000).toFixed(1)} mm (${flatOn ? (flatOn.depth * 1000).toFixed(1) : 'none'} mm)`)

if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1) }
console.log('\ntire-contact: all PASS')

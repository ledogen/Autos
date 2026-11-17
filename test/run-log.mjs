// test/run-log.mjs — FEAT-242 gate: the opt-in run logger (src/run-log.js) and its reader (tools/run-log-summary.mjs).
//
//   §1 OFF costs nothing: event()/tick() return before touching the bound state, the damage model builds no wear
//      accumulator and opens no event, and nothing is buffered or downloaded.
//   §2 ON: every line is stamped; tick() samples once per second of sim time; a new game day downloads a part;
//      parts are numbered part01, part02, … and carry the seed; JSON Lines round-trip line for line.
//   §3 damage: continuous wear lands in the route sample by track and cause; an impact and a bump stop that pops a
//      worn tire each log one event with the measured quantity, the threshold it was read against and the
//      condition before → after — the "should that rock have popped my tire" question.
//   §4 the summary script reads a fixture run: jobs by type with pay and deeds, km, money per day, punctures.

import { runLog } from '../src/run-log.js'
import { DamageModel, DAMAGE_PARAMS as D } from '../src/damage.js'
import { summarize, parseLines, report } from '../tools/run-log-summary.mjs'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
const saved = []
runLog.save = (name, text) => saved.push({ name, text })

// A bound context that throws if anything reads it — the proof that an off logger never looks.
const trap = new Proxy({}, { get () { throw new Error('the off logger read its context') } })

console.log('§1 off costs nothing')
{
  ok(runLog.on === false, 'off by default (no saved choice in node)')
  runLog._ctx = trap
  let threw = false
  try { runLog.event('x', { a: 1 }); runLog.tick(5); runLog.start('new') } catch { threw = true }
  ok(!threw && runLog._buf.length === 0 && runLog.count === 0, 'event/tick/start return at their first line: nothing read, nothing held')
  ok(runLog.flush() === null && saved.length === 0, 'nothing to download')
  const d = new DamageModel({ params: {} })
  for (let i = 0; i < 10; i++) d.step({ slipVel: [3, 3, 3, 3], bumpForce: [i < 5 ? 90000 : 0, 0, 0, 0] }, {}, 1 / 60)
  d.applyImpact('front', 1800 * 15, 1800)
  ok(d._wearAcc === undefined && d._evt === undefined && d._peakLog === undefined, 'the damage model never builds its wear accumulator or opens an event')
}

// A small fake world: the truck, a clock, a wallet.
const vs = { position: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: -10 }, quaternion: { x: 0, y: 0, z: 0, w: 1 },
  fuel: { gal: 10 }, drivetrain: { gear: 2, engineRPM: 2000 }, throttle: 0.5, brake: 0 }
const clock = { d: 1, h: 8, day () { return this.d }, hour () { return this.h }, energyH () { return 12 }, fedLeftH () { return 3 } }
let wallet = 100
const ctx = { vs, day: clock, econ: { money: () => wallet }, play: () => 42, seed: () => 'abc 123', mode: () => 'story', onRoad: () => true,
  inv: { snapshot: () => ({ entries: [{ id: 'pack', n: 1 }] }) }, parts: { snapshot: () => ({ fitted: { tireFL: 'stockTire' } }) },
  damage: new DamageModel({ params: {} }) }

console.log('\n§2 on: stamps, the 1 s sample, parts by day')
{
  runLog._ctx = ctx
  runLog.setOn(true)
  const h = JSON.parse(runLog._buf[0])
  ok(h.e === 'header' && h.seed === 'abc 123' && h.wallet === 100 && h.parts.tireFL === 'stockTire' && h.cond.engine === 1,
    'turning it on writes a header with the state right now (seed, wallet, parts, every condition)')
  ok(h.day === 1 && h.hr === 8 && h.play === 42 && h.pos.join() === '0,1,0' && h.spd === 10 && h.hdg === 0,
    'every line is stamped: game day + hour, playtime, position, speed, heading (forward = −Z is 0°)')
  for (let i = 0; i < 8; i++) runLog.tick(0.25)
  ok(runLog._buf.filter(l => JSON.parse(l).e === 'route').length === 2, '2 s of 0.25 s steps = 2 route samples')
  const r = JSON.parse(runLog._buf.at(-1))
  ok(r.fuelGal === 10 && r.wallet === 100 && r.road === true && r.gear === 2 && r.energyH === 12, 'the route sample carries fuel, wallet, road, gear, energy')
  const held = runLog._buf.slice()
  clock.d = 2
  runLog.tick(1)
  ok(saved.length === 1 && /^autos-run-abc_123-[\dT-]+Z-part01\.jsonl$/.test(saved[0].name), `a new game day downloads part01 (${saved[0].name})`)
  const back = parseLines(saved[0].text)
  ok(back.bad === 0 && back.events.length === held.length + 1 && JSON.stringify(back.events[1]) === held[1] && back.events.at(-1).e === 'part',
    'JSON Lines round-trip line for line, closed by a part line')
  ok(runLog._buf.length === 1, 'the buffer is let go after each part (memory stays flat): only the new day\'s sample is held')
  runLog.event('runEnd', { kind: 'towel' })
  ok(saved.length === 2 && saved[1].name.endsWith('-part02.jsonl') && runLog._buf.length === 0, 'the run end downloads part02 by itself')
  ok(parseLines(saved[1].text + '{"e":"cut').bad === 1, 'a cut-off last line is skipped, the rest still parse')
}

console.log('\n§3 damage: wear by cause, events with their thresholds')
{
  const d = ctx.damage
  d.setAll(1)
  for (let i = 0; i < 60; i++) d.step({ slipVel: [3, 0, 0, 0], velocity: { x: 0, y: 0, z: -10 } }, {}, 1 / 60)
  const w = d.drainWearLog()
  ok(w?.tireFL?.slip > 0 && !w.tireFR, `a second of wheelspin on FL is ${(w?.tireFL?.slip * 100).toFixed(3)} % of tireFL, cause "slip"`)
  ok(d.drainWearLog() === null, 'drained once')

  const n0 = runLog.count
  d.applyImpact('front', 1800 * 20 * 0.44704, 1800)
  const im = JSON.parse(runLog._buf.at(-1))
  ok(im.e === 'impact' && Math.abs(im.mph - 20) < 0.01 && im.region === 'front' && im.armorBefore === 1 && im.triggerMph === D.impactMinMph,
    'a 20 mph front hit logs its Δv speed, the armor it met and the trigger threshold')
  ok(im.dmg.armorFront?.[0] === 1 && im.dmg.armorFront[1] < 1, `…with each track's condition before → after (armorFront ${im.dmg.armorFront})`)
  ok(d.drainWearLog() === null, 'the impact\'s wear is on the event, never also in the continuous total')

  d.set('tireFL', 0.2)
  const pN = d.punctureThreshold(0.2)
  for (let i = 0; i < 4; i++) d.step({ bumpForce: [pN + 5000, 0, 0, 0], velocity: { x: 0, y: -4, z: -8 }, strutCompVel: [3, 0, 0, 0] }, { _tireFz: [20000, 0, 0, 0] }, 0.004)
  d.step({ bumpForce: [0, 0, 0, 0], velocity: { x: 0, y: 0, z: -8 } }, {}, 0.004)
  const b = runLog._buf.map(l => JSON.parse(l)).find(e => e.e === 'bumpStop')
  ok(b && b.popped.join() === '0' && b.peakN === Math.round(pN + 5000) && b.punctureN === Math.round(pN) && b.tireCond === 0.2,
    `a bump stop that pops a 20 % tire logs peak ${b?.peakN} N against its puncture threshold ${b?.punctureN} N`)
  ok(b?.fzN === 20000 && b.strutVel === 3 && b.vel.join() === '0,-4,-8', '…with the tire load, the strut closing speed and the truck velocity')
  ok(runLog.count - n0 >= 2, 'one line per event')
  runLog.setOn(false)
  ok(runLog.on === false && saved.at(-1).text.includes('"e":"bumpStop"'), 'turning it off downloads what was held')
}

console.log('\n§4 the summary script on a fixture run')
{
  const ev = (e, day, hr, extra) => ({ e, real: (day * 24 + hr) * 60000, day, hr, pos: [0, 0, 0], spd: 0, ...extra })
  const route = []
  for (let i = 0; i <= 100; i++) route.push(ev('route', 1, 8 + i / 60, { pos: [i * 10, 0, 0], wallet: 100 + i, wear: { tireRL: { slip: 0.0001 } } }))
  const fixture = [
    ev('runStart', 1, 8, { how: 'new', seed: 's1', wallet: 100 }),
    ...route,
    ev('route', 1, 10, { pos: [5000, 0, 0], wallet: 200 }),   // a tow: a 4 km jump is a reseat, not driving
    ev('mission', 1, 8, { state: 'offer', offer: { type: 'delivery' } }),
    ev('mission', 1, 8.1, { state: 'running', offer: { type: 'delivery' } }),
    ev('mission', 1, 8.6, { state: 'done', offer: { type: 'delivery' }, result: { payout: 12.5, points: 1, letter: 'A' } }),
    ev('mission', 1, 9, { state: 'running', offer: { type: 'haul' } }),
    ev('mission', 1, 9.5, { state: 'done', offer: { type: 'haul' }, result: { abandoned: true, payout: 0, points: 0 } }),
    ev('puncture', 1, 9.2, { corner: 2, tripped: 'force', hazardN: 90000, popN: 80000, dmg: {} }),
    ev('sleep', 1, 22, { hours: 8, vibe: 0.6, energyH0: 2, energyH1: 16 }),
    ev('route', 2, 6, { pos: [5000, 0, 0], wallet: 180 }),
  ]
  const s = summarize(fixture)
  ok(s.jobs.delivery?.n === 1 && s.jobs.delivery.pay === 12.5 && s.jobs.delivery.deeds === 1 && Math.abs(s.jobs.delivery.gameH - 0.5) < 1e-9,
    'jobs by type: the delivery paid $12.50 and a deed in half a game hour')
  ok(s.jobs.haul?.abandoned === 1, 'the abandoned haul is counted as one')
  ok(Math.abs(s.km - 1) < 1e-9 && s.teleports === 1, `km ${s.km.toFixed(3)} (the 4 km jump is a reseat, not driving)`)
  ok(s.money[1].start === 100 && s.money[1].end === 200 && s.money[2].end === 180, 'money by day: start and end')
  ok(Math.abs(s.wear['tireRL · slip'] - 0.0101) < 1e-9 && s.punctures.length === 1 && s.sleeps.length === 1, 'wear by cause, punctures, sleeps')
  const text = report(s)
  ok(text.includes('delivery: 1') && text.includes('punctures:') && text.includes('8 h at vibe 0.60'), 'the report prints them')
}

console.log(fail ? '\nFAIL' : '\nPASS')
process.exit(fail)

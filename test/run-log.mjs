// test/run-log.mjs — FEAT-242 gate: the opt-in run logger (src/run-log.js) and its reader (tools/run-log-summary.mjs).
//
//   §1 OFF costs nothing: event()/tick() return before touching the bound state, the damage model builds no wear
//      accumulator and opens no event, and nothing is buffered or downloaded.
//   §2 ON: every line is stamped; tick() samples once per second of sim time; a new game day STORES a part
//      (BUG-199: no download per day); the run end and "Save log now" download ONE file joining every part, named
//      by seed and start; JSON Lines round-trip line for line.
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
  ok(runLog.flush() === null && saved.length === 0 && await runLog.saveNow() === null, 'nothing to store or download')
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
  await runLog._pending
  ok(saved.length === 0 && (await runLog.store.all()).length === 1, 'a new game day stores a part and downloads nothing (Chrome blocks a second automatic download)')
  ok(runLog._buf.length === 1, 'the buffer is let go after each part (memory stays flat): only the new day\'s sample is held')
  runLog.event('runEnd', { kind: 'towel' })
  await runLog._pending
  ok(saved.length === 0 && runLog._buf.length === 0 && (await runLog.store.all()).length === 2, 'the run end stores its part and downloads nothing by itself (the card\'s click does, DEC-481)')
  const e0 = JSON.parse((await runLog.store.all()).at(-1)[1].split('\n').find(l => l.includes('"runEnd"')))
  ok(e0.wallet === 100 && e0.cond.engine === 1 && e0.inv.length === 1, 'the run-end line carries the END state (wallet, conditions, inventory)')
  const held2 = (await runLog.store.all()).map(e => e[1]).join('')
  ok(await runLog.saveNow() && saved.length === 1 && /^autos-run-abc_123-[\dT-]+Z\.jsonl$/.test(saved[0].name), `a click-started save downloads ONE file (${saved[0]?.name})`)
  const back = parseLines(saved[0].text)
  ok(saved[0].text === held2 && back.bad === 0 && back.events.filter(e => e.e === 'part').length === 2 && back.events.some(e => e.e === 'runEnd'),
    'the file is the stored parts joined in order: JSON Lines round-trip, one part line per stored part')
  ok((await runLog.store.all()).length === 0 && runLog.stored === 'nothing stored' && await runLog.saveNow() === null && saved.length === 1, 'the save clears the store: a second click downloads nothing (no duplicate file)')
  ok(parseLines(saved[0].text + '{"e":"cut').bad === 1, 'a cut-off last line is skipped, the rest still parse')
  runLog.setOn(false); await runLog._pending
  runLog.on = false
  // DEC-481: a run going live records by itself; leaving it stores the held lines and the exit line carries the end state
  runLog.enabled = true
  runLog.start('new')
  ok(runLog.on && JSON.parse(runLog._buf[0]).e === 'runStart' && JSON.parse(runLog._buf[0]).how === 'new', 'start() with the choice on records from the first line, no toggle')
  runLog.stop(); await runLog._pending
  ok(!runLog.on && (await runLog.store.all()).length === 1 && (await runLog.store.all())[0][1].includes('"e":"exit"'), 'stop() stores the run with an exit line')
  runLog.enabled = false; runLog.start('new')
  ok(!runLog.on, 'with the choice off start() records nothing')
  runLog.enabled = true
  await runLog.saveNow()   // empty the store for the next sections
  runLog.setOn(true)
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
  await runLog.saveNow()
  ok(runLog.on === false && saved.at(-1).text.includes('"e":"bumpStop"'), 'turning it off then saving has the bump stop in the file')
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

console.log('\n§5 FEAT-324 blocks and stitching')
{
  const { stitch } = await import('../tools/run-log-summary.mjs')
  const at = (e, day, hr, extra) => ({ e, real: 1e12 + (day * 24 + hr) * 3.6e6, play: day * 100 + hr, day, hr, pos: [0, 0, 0], spd: 0, ...extra })
  const cond = (tire, oil) => ({ tireFL: tire, tireFR: 0.9, tireRL: 0.9, tireRR: 0.9, oil, engine: 0.8 })
  const A = [at('runStart', 0, 7, { how: 'new', seed: 's', wallet: 20, fuelGal: 5, cond: cond(0.6, 0.4), parts: { tireFL: 'tireStandard' }, inv: [{ id: 'packedLunch', n: 2 }] }),
    at('item', 0, 7.1, { act: 'grant', id: 'spareTire', n: 1, src: 'start', fits: true }),
    ...[0, 1, 2, 3].map(i => at('route', 1, 8 + i / 100, { pos: [i * 50, 0, 0], wallet: 20, fedH: -1, energyH: 3, wear: { tireFL: { slip: 0.01 } } })),
    at('item', 1, 9, { act: 'grant', id: 'tireStandard', n: 1, src: 'job:reward', fits: true }),
    at('eat', 1, 9.5, { satietyH: 8, fedLeftH0: 5, hungry: false }),
    at('alert', 1, 10, { id: 'w14', text: 'the oil is very dirty', bad: true }),
    at('purchase', 1, 12, { lines: [{ m: 'repair', label: 'Repair Front Springs', price: 4, earn: 0, hours: 1, eat: 0 }] }),
    at('purchase', 1, 13, { lines: [{ m: 'buyToInventory', label: 'Buy Coffee', price: 2, earn: 0, hours: 0, eat: 0 }, { m: 'buyToInventory', label: 'Buy Gas can', price: 9, earn: 0, hours: 0, eat: 0 }] }),
    at('mission', 1, 14, { state: 'running', offer: { type: 'farm' } }),
    at('mission', 1, 15, { state: 'done', offer: { type: 'farm' }, job: { terms: { thresholds: { S: 0.5, A: 0.7, B: 0.8, C: 1 } } }, result: { par: 100, elapsed: 75, ratio: 0.75, letter: 'B', payout: 10, base: 6, tip: 4 } }),
    at('exit', 1, 16, { wallet: 12, fuelGal: 3, cond: cond(0.5, 1), inv: [] })]
  const B = [at('runStart', 1, 16, { how: 'resume', seed: 's', wallet: 12, cond: cond(0.5, 1) }), at('exit', 2, 7, { wallet: 30, cond: cond(0.4, 1), inv: [] })]
  const st = stitch([JSON.stringify(B[0]) + '\n' + JSON.stringify(B[1]), A.map(e => JSON.stringify(e)).join('\n')])   // given out of order
  ok(st.events[0].how === 'new' && st.events.at(-1).day === 2 && st.files === 2, 'several files of one run are stitched in time order, whatever the order given')
  const dupl = stitch([A.map(e => JSON.stringify(e)).join('\n'), A.map(e => JSON.stringify(e)).join('\n')])
  ok(dupl.events.length === A.length && dupl.dup === A.length, 'a file given twice adds nothing')
  const text = report(summarize(st.events), 0, st)
  ok(/COVERAGE\n  from play 7 s \(day 0 07:00\)/.test(text) && !/WARNING/.test(text), 'coverage names where the log starts and ends; a log from the run start has no warning')
  ok(/start day 0 07:00 \(new\).*end day 2 07:00/.test(text) && /tireFL\s+60\.0 % → 40\.0 %/.test(text) && /oil\s+40\.0 % → 100\.0 %/.test(text), 'START and END side by side')
  ok(/income \$10\.00 \(base \$6\.00, tip \$4\.00\) · spend \$15\.00 \(maint \$4\.00, fuel \$0\.00, food \$2\.00, tows \$0\.00, gear\/other \$9\.00\) · net \$-5\.00/.test(text)
    && /first purchase that is not maintenance, fuel or food: day 1 13:00 · Buy Gas can/.test(text), 'money by category per day, and the first purchase that is not maintenance/fuel/food')
  ok(/tireStandard · job:reward/.test(text) && /spareTire: granted 1, gone 0/.test(text), 'every grant with its source; granted-and-unused listed')
  ok(/FL: 60\.0 % → 40\.0 % · 0\.2 km/.test(text) && /projected full life 4 km/.test(text), 'tire: km on it and projected life at the measured rate')
  ok(/oil: minimum/.test(text) === false && /engine: minimum 80/.test(text) === false, 'a track that never went under 50 % is not listed')
  ok(/w14 "the oil is very dirty" ×1 .* fixed|w14 .* no purchase fixed it/.test(text), 'alerts with repeat counts')
  const low = report(summarize([...A.slice(0, 1), at('route', 1, 9, { pos: [0, 0, 0], cond: { ...cond(0.3, 0.4), airFilter: 0.2 } })]))
  ok(/airFilter: minimum 20\.0 % and NO alert/.test(low) && /tireFL: minimum 30\.0 % and NO alert/.test(low) && /oil: minimum 40\.0 % and NO alert|w14/.test(low), 'a track under 50 % with no alert is named')
  ok(/ratio 0\.750 · B/.test(text) && /next rank 0 s faster|next rank 5 s faster/.test(text) && /5 s to spare/.test(text), 'job: ratio, rank, seconds to the next rank threshold and to spare')
  // the owner's 2026-11-22 log: a fragile job at 0.695 of par lettered S on its condition, which the time lines alone grade A
  const frag = report(summarize([at('mission', 1, 15, { state: 'done', offer: { type: 'residence' }, spec: { family: 'fragile', thingId: 'diningChairs' },
    job: { distance: 4995.7, cargoKg: 24, terms: { region: 1, thresholds: { S: 0.652, A: 0.707, B: 0.794, C: 1 } } }, result: { par: 357.34, elapsed: 248.32, ratio: 0.695, letter: 'S', health: 0.9555 } })]))
  ok(/condition 95\.5 % · S on its condition \(lines S 80\.0 % A 73\.0 %/.test(frag) && !/would grade/.test(frag), 'a fragile job is checked on its condition lines, not on time')
  ok(/hungry 0\.\d+ h/.test(text) && /5\.00 h of fed time left when eaten/.test(text), 'hours hungry; the meal with its fed time left')
  const mid = report(summarize([at('header', 1, 16.85, { how: 'on', cond: cond(0.6, 0.4) }), at('route', 1, 17, { pos: [0, 0, 0] })]))
  ok(/WARNING: this log does not start at the run's start/.test(mid), 'a log that starts mid-run says so plainly')
  const old = report(summarize([at('route', 1, 8, { pos: [0, 0, 0], wallet: 5 })]))
  ok(/start: not recorded/.test(old) && /TIRES per wheel[^\n]*\n  not recorded/.test(old), 'an old log without the new fields still summarises, with "not recorded"')
}

console.log(fail ? '\nFAIL' : '\nPASS')
process.exit(fail)

// test/park-brake.mjs — FEAT-194 parts 1 and 2: the parking-brake latch through the REAL updateVehicle, keyboard
// (vehicle.js's own key listeners, fed synthetic keydown/keyup) and pad (gamepad.js's `pad`, as its poll writes it).
//
//   1. A Space tap at rest latches; at speed it does not.
//   2. Manual: latched, the brake pedal (S / LT, tapped or held) never releases it (owner, 2026-11-11). Automatic: S / LT from
//      a parked stop is reverse, i.e. gas, and releases it (DEC-255, owner 2026-11-15).
//   3. Latched, the throttle releases it: W, RT. A Space tap releases it (the lever).
//   4. Manual: a shift that lands in a gear releases it; sitting latched in a gear does not.
//   5. Park lock (a parked menu is up): handbrake on even unlatched; W / RT / a gear cannot release the
//      latch; Space still can. Lock off, W releases as usual.
//   6. Part 3 — no WORLD time passes while the latch is set (day.js clockHeld, the pause path main.js steps the
//      clock through). Latched at rest: the day clock, energy, hunger and an offer's expiry stand still while idle
//      fuel still burns. DEC-289 (owner, 2026-11-15): the job in hand does not — its elapsed, its rank and its
//      deadline run on at the driving rate (spendParked), and the board's slot locks on the moved line, also
//      after a save replay. Released, the clock runs again; the job's elapsed is driven + parked time, par
//      never moves. A handbrake slide holds nothing.
//   8. BUG-249 / DEC-435: only a pedal that can drive releases it — engine running, and on the manual a gear in, clutch out.
//   7. FEAT-217 (DEC-272): the throttle cut (the tutorial's flat) — W / RT give no throttle and W cannot release the latch;
//      the brake and steering still work; off, W drives as before. (DEC-270) routeLeftM reads the arc left, not the crow.
//
// Pure node: DOM stubs only (no THREE scene, no engine).
const listeners = {}
globalThis.document = { addEventListener: (t, f) => { (listeners[t] ??= []).push(f) }, body: { classList: { toggle () {} } } }
globalThis.window = globalThis
globalThis.requestAnimationFrame = () => 0
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true })

const { updateVehicle, setParkLock, setThrottleCut } = await import('../src/vehicle.js')
const { pad } = await import('../src/gamepad.js')
const { makeVehicleState } = await import('../src/vehicle-state.js')
const { RANGER_PARAMS } = await import('../data/ranger.js')

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

const DT = 1 / 250
const key = (k, down) => { for (const f of listeners[down ? 'keydown' : 'keyup']) f({ key: k, shiftKey: false, ctrlKey: false, metaKey: false }) }
const fresh = (params = RANGER_PARAMS) => {
  const vs = makeVehicleState(params)
  vs.parked = false
  return vs
}
const step = (vs, params = RANGER_PARAMS, n = 1) => { for (let i = 0; i < n; i++) updateVehicle(vs, params, DT) }
const tap = (vs, k, params) => { key(k, true); step(vs, params); key(k, false); step(vs, params) }
const parked = (params) => { const vs = fresh(params); tap(vs, ' ', params); return vs }

// 1.
{
  const vs = parked()
  const moving = fresh(); moving.velocity.x = 5; tap(moving, ' ')
  check('1. a Space tap at rest latches; at 5 m/s it does not', vs.parked && !moving.parked, `rest ${vs.parked}, moving ${moving.parked}`)
}
// 2. MANUAL: the brake pedal (keyboard S, pad LT, tapped and held) never releases the latch (FEAT-194, DEC-255).
const MANUAL = { ...RANGER_PARAMS, transmissionType: 'manual' }
{
  const vs = parked(MANUAL)
  tap(vs, 's', MANUAL)
  const afterTap = vs.parked
  key('s', true); step(vs, MANUAL, 500); key('s', false); step(vs, MANUAL)
  check('2. manual, keyboard: S tapped, then held 2 s, leaves the parking brake set', afterTap && vs.parked && vs.handbrake, `tap ${afterTap}, hold ${vs.parked}`)
  pad.active = true
  pad.brake = 1; step(vs, MANUAL, 1); pad.brake = 0; step(vs, MANUAL)
  const lt = vs.parked
  pad.brake = 0.6; step(vs, MANUAL, 500); pad.brake = 0; step(vs, MANUAL)
  check('   manual, pad: LT tapped, then held 2 s, leaves it set', lt && vs.parked, `tap ${lt}, hold ${vs.parked}`)
  pad.active = false
}
// 2b. AUTOMATIC (DEC-255): from a parked stop S / LT is the reverse pedal, so holding it releases the latch.
{
  const k = parked(); key('s', true); step(k, RANGER_PARAMS, 50); key('s', false)
  const p = parked(); pad.active = true; pad.brake = 0.6; step(p, RANGER_PARAMS, 50); pad.brake = 0; pad.active = false
  const lk = parked(); setParkLock(true); key('s', true); step(lk, RANGER_PARAMS, 50); key('s', false); setParkLock(false)
  check('2b. automatic: holding S or LT from a parked stop releases the parking brake (reverse is gas); a park lock still holds it',
    !k.parked && !p.parked && lk.parked, `S ${k.parked}, LT ${p.parked}, locked ${lk.parked}`)
}
// 3.
{
  const w = parked(); tap(w, 'w')
  const rt = parked(); pad.active = true; pad.throttle = 0.4; step(rt); pad.throttle = 0; pad.active = false
  const sp = parked(); tap(sp, ' ')
  check('3. the throttle releases it (W, RT 0.4); so does a Space tap', !w.parked && !rt.parked && !sp.parked,
    `W ${w.parked}, RT ${rt.parked}, Space ${sp.parked}`)
}
// 4. manual: the drivetrain's synchro is mid-shift, then lands (drivetrain.js stepManual writes these).
{
  const land = (vs, gear) => {
    vs.drivetrain = { ...(vs.drivetrain ?? {}), shifting: true, mGear: 0 }; step(vs, MANUAL)
    vs.drivetrain.shifting = false; vs.drivetrain.mGear = gear; step(vs, MANUAL)
  }
  const into1 = parked(MANUAL); land(into1, 1)
  const intoR = parked(MANUAL); land(intoR, -1)
  const toN = parked(MANUAL); land(toN, 0)
  const sitting = parked(MANUAL); sitting.drivetrain = { shifting: false, mGear: 2 }; step(sitting, MANUAL, 100)
  const auto = parked(); auto.drivetrain = { shifting: true, gear: 1 }; step(auto); auto.drivetrain.shifting = false; step(auto)
  check('4. manual, engine running (DEC-435, owner 2026-11-20): a shift landing in 1st or R releases it; into N, or sitting in a gear, does not; the automatic\'s shifts never',
    !into1.parked && !intoR.parked && toN.parked && sitting.parked && auto.parked,
    `1st ${into1.parked}, R ${intoR.parked}, N ${toN.parked}, sitting ${sitting.parked}, auto ${auto.parked}`)
}
// 5.
{
  setParkLock(true)
  const open = fresh(); step(open)
  const w = parked(); tap(w, 'w'); key('w', true); step(w, RANGER_PARAMS, 250); key('w', false); step(w)
  const rt = parked(); pad.active = true; pad.throttle = 1; step(rt, RANGER_PARAMS, 250); pad.throttle = 0; pad.active = false; step(rt)
  const gear = parked(MANUAL); gear.drivetrain = { shifting: true, mGear: 0 }; step(gear, MANUAL); gear.drivetrain.shifting = false; gear.drivetrain.mGear = 1; step(gear, MANUAL)
  const sp = parked(); tap(sp, ' ')
  check('5. park lock: the handbrake is on unlatched; W, RT and a gear cannot release the latch',
    open.handbrake && w.parked && w.handbrake && rt.parked && gear.parked,
    `hb ${open.handbrake}, W ${w.parked}, RT ${rt.parked}, gear ${gear.parked}`)
  check('   …a Space tap still does (the lever)', !sp.parked)
  setParkLock(false)
  step(w); tap(w, 'w')
  check('   lock off, W releases as before', !w.parked && !w.handbrake, `parked ${w.parked}, hb ${w.handbrake}`)
}

// 8. BUG-249 (owner 2026-11-20: "gate the automatic brake release on an action that actually moves the truck") / DEC-435:
//    the pedal releases the latch only when it can drive. Engine off: W, RT, the automatic's reverse pedal and a manual
//    shift landing in a gear all leave it set. Engine on, manual: W in N, or in gear with the clutch held in, leaves it set;
//    in gear, clutch out, W releases.
{
  const off = (params = RANGER_PARAMS) => { const vs = makeVehicleState(params, 'off'); vs.parked = false; tap(vs, ' ', params); return vs }
  const w = off(); key('w', true); step(w, RANGER_PARAMS, 50); key('w', false)
  const rt = off(); pad.active = true; pad.throttle = 1; step(rt, RANGER_PARAMS, 50); pad.throttle = 0; pad.active = false
  const lt = off(); pad.active = true; pad.brake = 0.6; step(lt, RANGER_PARAMS, 50); pad.brake = 0; pad.active = false
  const gear = off(MANUAL); gear.drivetrain = { shifting: true, mGear: 0 }; step(gear, MANUAL); gear.drivetrain.shifting = false; gear.drivetrain.mGear = 1; step(gear, MANUAL)
  const mw = off(MANUAL); mw.drivetrain = { shifting: false, mGear: 1 }; key('w', true); step(mw, MANUAL, 50); key('w', false)
  check('8. engine off: W, RT, the automatic\'s LT (reverse) and a manual shift into 1st all leave the parking brake set',
    w.parked && rt.parked && lt.parked && gear.parked && mw.parked && w.ignition.state === 'off',
    `W ${w.parked}, RT ${rt.parked}, LT ${lt.parked}, gear ${gear.parked}, manual W ${mw.parked}, ignition ${w.ignition.state}`)
  const inN = parked(MANUAL); inN.drivetrain = { shifting: false, mGear: 0 }; key('w', true); step(inN, MANUAL, 50); key('w', false)
  const clutchIn = parked(MANUAL); clutchIn.drivetrain = { shifting: false, mGear: 1 }
  key('Shift', true); key('w', true); step(clutchIn, MANUAL, 50); key('w', false); key('Shift', false); step(clutchIn, MANUAL)
  const drive = parked(MANUAL); drive.drivetrain = { shifting: false, mGear: 1, engineRPM: 2500 }; key('w', true); step(drive, MANUAL, 50); key('w', false)   // revved: the clutch assistant bites
  check('   engine on, manual: W in N or with the clutch held in leaves it set; in 1st with the clutch out, W releases',
    inN.parked && clutchIn.parked && !drive.parked, `N ${inN.parked}, clutch in ${clutchIn.parked}, 1st ${drive.parked}`)
}

// 6. Each step is main.js's order: updateVehicle (the latch), stepFuel (inside stepPhysics), the clock through
//    clockHeld (the camp / service / evening holds off) or, parked, the job's spendParked, then the mission's update.
{
  const { DaySystem, clockHeld } = await import('../src/day.js')
  const { stepFuel } = await import('../src/fuel.js')
  const { MissionSystem, secPerGameH } = await import('../src/mission.js')
  const { OfferBoard } = await import('../src/offer-board.js')
  const { gradeRun } = await import('../src/par.js')
  const { logBoard } = await import('../src/save.js')
  const day = new DaySystem({ setTimeOfDay () {} }); day.start()
  const POIS = [{ id: 'poi:1|2', type: 'foodVendor' }]
  const board = new OfferBoard({ seed: 194, pois: POIS, nowH: day.clockH() })
  const log = logBoard(board, day.clockH())
  const [held, offer] = board.offers('poi:1|2', day.clockH())
  const job = (dueH, offerId) => {
    const ms = new MissionSystem({ getRoad: () => null, getCar: () => ({ x: 0, z: 0 }), teleport () {}, setMapOpen () {},
      getClockH: () => day.clockH() })
    ms.state = 'running'; ms._t0H = day.clockH()
    ms.mission = { par: 300, targets: [], cleared: false, dueH, offerId }   // a demolition site: done only when cleared
    return ms
  }
  const vs = fresh(); vs.fuel.floorGal = 0
  const timed = job(Infinity), due = job(board.take(held.id, day.clockH(), 300).dueH, held.id)   // due 6.5 game h = 390 s on
  let owed = 0   // main.js _parkSpend: the board hears the parked hours once per stop
  const run = (sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) {
    updateVehicle(vs, RANGER_PARAMS, DT); stepFuel(vs, RANGER_PARAMS, DT)
    if (!clockHeld(false, false, false, vs.parked)) day.update(DT)
    else if (vs.parked) { const dH = DT / secPerGameH(); timed.spendParked(dH); if (due.spendParked(dH)) owed += dH }
    if (!vs.parked && owed) { board.spend(held.id, owed); owed = 0 }
    timed.update(DT); due.update(DT)
  } }
  const snap = () => ({ h: day.clockH(), e: day.energyH(), fed: day.fedLeftH(), el: timed.elapsed, gal: vs.fuel.gal })
  run(30)                                                          // 30 s driving (unlatched, at rest is enough)
  tap(vs, ' ')
  const a = snap(); run(400); const b = snap()                     // 400 s parked: ~6.7 game hours if the clock ran
  check('6. latched at rest: the world clock, energy and hunger stand still over 400 s',
    vs.parked && b.h === a.h && b.e === a.e && b.fed === a.fed,
    `parked ${vs.parked}, clock ${a.h}→${b.h}, energy ${a.e}→${b.e}, fed ${a.fed}→${b.fed}`)
  check('   …the offer on the board has not expired', board.isLive(offer.id, day.clockH()), `live ${board.isLive(offer.id, day.clockH())}`)
  check('   …while idle fuel still burns', b.gal < a.gal, `${a.gal} → ${b.gal} gal`)
  const ga = gradeRun(a.el, 300), gb = gradeRun(b.el, 300)
  check('   DEC-289: the job\'s elapsed runs on by the 400 parked s, and its rank with it',
    Math.abs(b.el - a.el - 400) < 0.05 && Math.abs(gb.ratio - ga.ratio - 400 / 300) < 1e-3 && gb.letter !== ga.letter,
    `elapsed ${a.el.toFixed(2)}→${b.el.toFixed(2)}, ratio ${ga.ratio.toFixed(3)}→${gb.ratio.toFixed(3)}, ${ga.letter}→${gb.letter}`)
  check('   …and its 390 s deadline passes while parked', due.mission.expired, `dueH ${due.mission.dueH}, clock ${day.clockH()}`)
  tap(vs, 'w')
  const left = (offer.expiresH - day.clockH()) * 60 + 5            // real s until the offer's expiry, + 5
  const c0 = snap(); run(left); const c = snap()
  check('   released: the clock, energy and hunger run again', !vs.parked && c.h > c0.h && c.e < c0.e && c.fed < c0.fed,
    `clock ${c0.h}→${c.h}, energy ${c0.e}→${c.e}, fed ${c0.fed}→${c.fed}`)
  check('   …the offer expires', !board.isLive(offer.id, day.clockH()))
  check('   …the job\'s elapsed is driven + parked time (30 + 400 s + the release), and its par is untouched',
    Math.abs(c.el - (430 + left)) < 0.05 && timed.mission.par === 300, `elapsed ${c.el.toFixed(2)} vs ${(430 + left).toFixed(2)}, par ${timed.mission.par}`)
  const st = board.slotStates('poi:1|2', day.clockH())[0].state
  const replay = new OfferBoard({ seed: 194, pois: POIS, nowH: log.t0H }); logBoard(replay, log.t0H, log.events)
  check('   …the board\'s slot locked on the moved deadline, and a save replay lands on the same line',
    st === 'locked' && log.events.some(e => e[0] === 'spend') && replay.slotStates('poi:1|2', day.clockH())[0].state === 'locked',
    `slot ${st}, events ${log.events.map(e => e[0])}`)
  const slide = fresh(); slide.velocity.x = 15; key(' ', true); step(slide, RANGER_PARAMS, 50); key(' ', false); step(slide)
  check('   a handbrake slide at 15 m/s never latches, so it never holds the clock',
    !slide.parked && !clockHeld(false, false, false, slide.parked))
}

// 7.
{
  setThrottleCut(true)
  const w = fresh(); key('w', true); step(w, RANGER_PARAMS, 250); key('w', false)
  const rt = fresh(); pad.active = true; pad.throttle = 1; step(rt, RANGER_PARAMS, 250); pad.throttle = 0; pad.active = false
  const lt = parked(); tap(lt, 'w'); key('w', true); step(lt, RANGER_PARAMS, 50); key('w', false)
  const br = fresh(); br.velocity.x = 10; key('s', true); step(br, RANGER_PARAMS, 250); key('s', false)
  setThrottleCut(false)
  check('7. throttle cut: W and RT give no throttle, W does not release the latch, S still brakes',
    w.throttle === 0 && rt.throttle === 0 && lt.parked && br.brake > 0.5, `W ${w.throttle}, RT ${rt.throttle}, latched ${lt.parked}, brake ${br.brake}`)
  const on = fresh(); key('w', true); step(on, RANGER_PARAMS, 250); key('w', false)
  check('   cut off, W gives throttle as before', on.throttle > 0.5, `W ${on.throttle}`)
  const { routeLeftM, polyCumOf } = await import('../src/mission.js')
  const poly = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 }]   // a U: 300 m of road, ends 100 m from its start
  const left = routeLeftM({ poly, polyCum: polyCumOf(poly) }, 1, 1)
  check('   routeLeftM: at the start of a U-shaped 300 m line, 300 m to go (the crow reads 100)', Math.abs(left - 300) < 1e-9, `${left}`)
}

console.log(fails ? `\n${fails} FAILED` : '\npark-brake gate: ALL OK')
process.exit(fails ? 1 : 0)

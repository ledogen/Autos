// test/park-brake.mjs — FEAT-194 parts 1 and 2: the parking-brake latch through the REAL updateVehicle, keyboard
// (vehicle.js's own key listeners, fed synthetic keydown/keyup) and pad (gamepad.js's `pad`, as its poll writes it).
//
//   1. A Space tap at rest latches; at speed it does not.
//   2. Latched, the brake pedal — S tapped or held, LT tapped or held — never releases it (owner, 2026-11-11).
//   3. Latched, the throttle releases it: W, RT. A Space tap releases it (the lever).
//   4. Manual: a shift that lands in a gear releases it; sitting latched in a gear does not.
//   5. Park lock (a parked menu is up): handbrake on even unlatched; W / RT / a gear cannot release the
//      latch; Space still can. Lock off, W releases as usual.
//
// Pure node: DOM stubs only (no THREE scene, no engine).
const listeners = {}
globalThis.document = { addEventListener: (t, f) => { (listeners[t] ??= []).push(f) }, body: { classList: { toggle () {} } } }
globalThis.window = globalThis
globalThis.requestAnimationFrame = () => 0
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true })

const { updateVehicle, setParkLock } = await import('../src/vehicle.js')
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
// 2. keyboard S, then pad LT, tapped and held.
{
  const vs = parked()
  tap(vs, 's')
  const afterTap = vs.parked
  key('s', true); step(vs, RANGER_PARAMS, 500); key('s', false); step(vs)
  check('2. keyboard: S tapped, then held 2 s, leaves the parking brake set', afterTap && vs.parked && vs.handbrake, `tap ${afterTap}, hold ${vs.parked}`)
  pad.active = true
  pad.brake = 1; step(vs, RANGER_PARAMS, 1); pad.brake = 0; step(vs)
  const lt = vs.parked
  pad.brake = 0.6; step(vs, RANGER_PARAMS, 500); pad.brake = 0; step(vs)
  check('   pad: LT tapped, then held 2 s, leaves it set', lt && vs.parked, `tap ${lt}, hold ${vs.parked}`)
  pad.active = false
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
const MANUAL = { ...RANGER_PARAMS, transmissionType: 'manual' }
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
  check('4. manual: a shift landing in 1st or R releases it; into N, or sitting in a gear, does not; the automatic\'s shifts never',
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

console.log(fails ? `\n${fails} FAILED` : '\npark-brake gate: ALL OK')
process.exit(fails ? 1 : 0)

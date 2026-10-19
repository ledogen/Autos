/**
 * Gamepad input (FEAT-125). Polls the browser Gamepad API once per animation frame and exposes:
 *   - `pad`: shaped analog throttle / brake / steer in [0,1] / [0,1] / [-1,1], and `pad.active`;
 *   - buttons, replayed as synthetic keydown/keyup events for the key each one stands in for.
 *
 * Buttons-as-keys is the whole integration for discrete actions: every existing keyboard handler
 * (vehicle.js keys, main.js map/camp/recovery/pump, the inventory/damage screens, camera) receives
 * the same event shape it already handles, so "reachable on the keyboard" == "reachable on the pad"
 * with no per-action wiring. Hold actions (Space handbrake, I ignition, F pump) get keydown on press
 * and keyup on release, exactly like a held key minus autorepeat.
 *
 * Analog axes do NOT go through keys: vehicle.js reads `pad` directly so a partial trigger is a
 * partial pedal (the keyboard ramps are a stand-in for a pedal and must not filter a real one).
 *
 * WHICHEVER MOVED LAST DRIVES: a pad input outside its deadzone (or any button press) sets
 * pad.active; a real (trusted, non-repeat) keydown clears it. A pad resting on the desk never
 * takes over, and a keyboard player is never locked out. Unplugging releases every held key and
 * zeroes the axes, so nothing sticks.
 *
 * Standard-mapping pads only (W3C layout — verified on Xbox One BT and 8BitDo Ultimate 2C BT,
 * see the FEAT-125 ticket). test/pad-test.html shows what any pad actually reports.
 * Does NOT import Three.js or anything from src/.
 */

/** Live-tunable through the debug menu (Vehicle → Controller). */
export const PAD_PARAMS = {
  // Steering assist: ON = full stick reaches the speed-scaled limit (vehicle.js dynamicMaxSteer),
  // the same envelope the keyboard gets. OFF = full stick is full lock at any speed, linear — for a
  // driver who wants the stick to be the wheel.
  steerAssist: true,
  stickDeadzone:   0.08,  // |x| below this reads 0; the rest is rescaled so travel still spans 0..1
  triggerDeadzone: 0.03,
  steerCurve:      1.0,   // response exponent on the stick: 1 = linear, >1 = finer near centre
  steerSlewRate:   6.0,   // rad/s — max wheel-angle rate, so a flicked stick can't step the physics
  // Right stick = camera orbit RATE (not a 1:1 map of the mouse drag): full deflection turns the
  // view at orbitRate; orbitHold seconds after the stick is let go the chase cam takes back over.
  orbitRate: 2.5,         // rad/s at full deflection
  orbitHold: 2.0,         // s
}

export const pad = { active: false, throttle: 0, brake: 0, steer: 0, lookX: 0, lookY: 0 }

// Standard-layout button index → the key it replays. Left stick click (10), LB/RB (4/5) and Home
// (16) are deliberately unbound; LT/RT (6/7) are analog, read below.
const BUTTON_KEYS = {
  0: ' ',     // A — handbrake (hold) / park latch (tap)
  1: 'x',     // B — recovery
  2: 'f',     // X — pump / aim (hold)
  3: 'i',     // Y — ignition (hold)
  8: 'Tab',   // View/Back — inventory
  9: 'm',     // Start/Menu — map
  11: 'c',    // right stick click — camera mode
  12: 'l',    // D-pad up — headlights
  13: 'z',    // D-pad down — camp
  14: 'v',    // D-pad left — damage screen
  15: 'r',    // D-pad right — reset truck
}

const held = new Set()   // button indices whose keydown has been sent and keyup has not

const deadzone = (v, d) => Math.abs(v) < d ? 0 : Math.sign(v) * (Math.abs(v) - d) / (1 - d)

function sendKey (type, key) {
  const code = key === ' ' ? 'Space' : key.length === 1 ? 'Key' + key.toUpperCase() : key
  // Dispatched where a real keystroke lands (the focused element), bubbling, so element-level and
  // document/window-level listeners all see it as they would a real key.
  ;(document.activeElement || document.body).dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }))
}

function poll () {
  // ponytail: every connected pad is merged (max trigger, largest stick, buttons OR'd) rather than
  // picking one — two pads on the desk both work. Per-player pads would need a real assignment.
  let thr = 0, brk = 0, steer = 0, lookX = 0, lookY = 0, any = false
  const down = new Set()
  for (const gp of navigator.getGamepads()) {
    if (!gp || gp.mapping !== 'standard') continue
    any = true
    thr = Math.max(thr, deadzone(gp.buttons[7].value, PAD_PARAMS.triggerDeadzone))
    brk = Math.max(brk, deadzone(gp.buttons[6].value, PAD_PARAMS.triggerDeadzone))
    const s = deadzone(gp.axes[0], PAD_PARAMS.stickDeadzone)
    if (Math.abs(s) > Math.abs(steer)) steer = s
    const lx = deadzone(gp.axes[2], PAD_PARAMS.stickDeadzone), ly = deadzone(gp.axes[3], PAD_PARAMS.stickDeadzone)
    if (Math.hypot(lx, ly) > Math.hypot(lookX, lookY)) { lookX = lx; lookY = ly }
    for (const i in BUTTON_KEYS) if (gp.buttons[i]?.pressed) down.add(+i)
  }
  pad.throttle = thr
  pad.brake = brk
  pad.steer = Math.sign(steer) * Math.abs(steer) ** PAD_PARAMS.steerCurve
  pad.lookX = lookX   // camera.js reads these; looking around never takes the driving away from
  pad.lookY = lookY   // the keyboard, so they do not set pad.active

  for (const i of down) if (!held.has(i)) { held.add(i); sendKey('keydown', BUTTON_KEYS[i]); pad.active = true }
  for (const i of held) if (!down.has(i)) { held.delete(i); sendKey('keyup', BUTTON_KEYS[i]) }
  if (thr > 0 || brk > 0 || steer !== 0) pad.active = true
  if (!any) pad.active = false   // unplugged: the keyboard drives again with no keypress needed

  requestAnimationFrame(poll)
}

if (typeof navigator !== 'undefined' && navigator.getGamepads) {
  // Synthetic events are untrusted, so the pad's own replayed keys never hand control back.
  document.addEventListener('keydown', e => { if (e.isTrusted && !e.repeat) pad.active = false }, true)
  requestAnimationFrame(poll)
}

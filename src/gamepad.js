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

// THE BINDING TABLE (Forza-style layout, owner 2026-10-19 — the FEAT-125 ticket). Rows with a
// `button` (standard-layout index) replay `key` while held; the rest are analog or tap-vs-hold, read
// in poll(), and are here so the Controls & Assists page's chart is generated from this one table and
// cannot drift from what the pad does. LB / A / X are the FEAT-126 manual gearbox's clutch and
// shifts; the automatic ignores them. Left stick click (10) and Home (16) are unbound.
export const BINDINGS = [
  { action: 'throttle',              key: 'W',         pad: 'RT' },
  { action: 'brake / reverse',       key: 'S',         pad: 'LT' },
  { action: 'steer',                 key: 'A / D',     pad: 'left stick' },
  { action: 'look around',           key: 'mouse drag', pad: 'right stick' },
  { action: 'handbrake / park (tap)', key: ' ',        pad: 'RB', button: 5 },
  { action: 'clutch (manual)',       key: 'Shift',     pad: 'LB', button: 4 },
  { action: 'upshift (manual)',      key: 'e',         pad: 'A',  button: 0 },
  { action: 'downshift (manual)',    key: 'q',         pad: 'X',  button: 2 },
  { action: 'ignition (hold)',       key: 'i',         pad: 'Y',  button: 3 },
  { action: 'pump / aim (hold)',     key: 'f',         pad: 'B',  button: 1 },
  { action: 'camera mode',           key: 'c',         pad: 'right stick click', button: 11 },
  { action: 'map',                   key: 'm',         pad: 'Start', button: 9 },
  { action: 'inventory',             key: 'Tab',       pad: 'View (tap)' },
  { action: 'reset truck',           key: 'r',         pad: 'View (hold 1 s)' },
  { action: 'headlights',            key: 'l',         pad: 'D-pad ↑', button: 12 },
  { action: 'camp',                  key: 'z',         pad: 'D-pad ↓', button: 13 },
  { action: 'damage screen',         key: 'v',         pad: 'D-pad ←', button: 14 },
  { action: 'recovery',              key: 'x',         pad: 'D-pad →', button: 15 },
]
const BUTTON_KEYS = Object.fromEntries(BINDINGS.filter(b => b.button != null).map(b => [b.button, b.key]))
// View: a tap (released under VIEW_HOLD_MS) opens the inventory (Tab, sent on RELEASE — only then is
// it known to be a tap); holding it VIEW_HOLD_MS resets the truck (r, keydown at the threshold,
// keyup on release so vehicle.js's per-step keys.r read still sees it held).
const VIEW = 8, VIEW_HOLD_MS = 1000
let viewDownAt = -1      // performance.now() of the press, -1 while up
let viewReset = false    // the hold already fired r this press

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
  let thr = 0, brk = 0, steer = 0, lookX = 0, lookY = 0, any = false, viewDown = false
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
    if (gp.buttons[VIEW]?.pressed) viewDown = true
  }
  pad.throttle = thr
  pad.brake = brk
  pad.steer = Math.sign(steer) * Math.abs(steer) ** PAD_PARAMS.steerCurve
  pad.lookX = lookX   // camera.js reads these; looking around never takes the driving away from
  pad.lookY = lookY   // the keyboard, so they do not set pad.active

  for (const i of down) if (!held.has(i)) { held.add(i); sendKey('keydown', BUTTON_KEYS[i]); pad.active = true }
  for (const i of held) if (!down.has(i)) { held.delete(i); sendKey('keyup', BUTTON_KEYS[i]) }
  if (thr > 0 || brk > 0 || steer !== 0) pad.active = true

  if (viewDown) {
    const now = performance.now()
    if (viewDownAt < 0) { viewDownAt = now; viewReset = false; pad.active = true }
    else if (!viewReset && now - viewDownAt >= VIEW_HOLD_MS) { viewReset = true; sendKey('keydown', 'r') }
  } else if (viewDownAt >= 0) {
    if (viewReset) sendKey('keyup', 'r')
    else if (any) { sendKey('keydown', 'Tab'); sendKey('keyup', 'Tab') }   // not on an unplug mid-press
    viewDownAt = -1
  }
  if (!any) pad.active = false   // unplugged: the keyboard drives again with no keypress needed

  requestAnimationFrame(poll)
}

if (typeof navigator !== 'undefined' && navigator.getGamepads) {
  // Synthetic events are untrusted, so the pad's own replayed keys never hand control back.
  document.addEventListener('keydown', e => { if (e.isTrusted && !e.repeat) pad.active = false }, true)
  requestAnimationFrame(poll)
}

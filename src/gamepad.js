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
  orbitRate: 2.0,         // rad/s at full deflection (FEAT-133: one rate, aiming a paper too)
  orbitHold: 2.0,         // s
  // FEAT-133: with the map open the right stick pans the map under a fixed centre cursor (map2d.js).
  mapPanRate:    600,     // CSS px/s of sheet slide at full deflection
  mapZoomRate:   2.0,     // e-folds/s at a full trigger (RT in, LT out): ×7.4 per second
  // FEAT-133 pad throw: while aiming on a paper route an RB press shorter than throwTapMs throws;
  // held longer it is the handbrake, from that moment.
  throwTapMs: 200,        // ms
}

// menuActive: set by src/menu-nav.js — true while a menu owns the screen (the pad then speaks MENU_KEYS).
// cardActive: set by src/menu-nav.js — true while an in-game card is up (the pad then speaks CARD_KEYS).
// mapActive: set by src/map2d.js — true while the map is open (the pad then speaks MAP_KEYS).
// zoom: RT − LT while the map is open, in [-1, 1] (map2d.js reads it); 0 otherwise.
// canThrow / throwReady: set by main.js — a paper throw is possible (the right stick aims), and
// the reticle is up as well (RB tap throws).
export const pad = { active: false, throttle: 0, brake: 0, steer: 0, lookX: 0, lookY: 0, zoom: 0,
  menuActive: () => false, cardActive: () => false, mapActive: () => false, canThrow: () => false, throwReady: () => false }

// THE BINDING TABLE (Forza-style layout, owner 2026-10-19 — the FEAT-125 ticket). Rows with a
// `button` (standard-layout index) replay `key` while held; the rest are analog or tap-vs-hold, read
// in poll(), and are here so the Controls & Assists page's chart is generated from this one table and
// cannot drift from what the pad does. LB / A / X are the FEAT-126 manual gearbox's clutch and
// shifts; the automatic ignores them. Start pauses and View is the map (owner, 2026-10-19), which
// moved the inventory to D-pad ↑ and the headlights to the left stick click — the D-pad is all
// screens. Home (16) is unbound.
export const BINDINGS = [
  { action: 'throttle',              key: 'W',         pad: 'RT' },
  { action: 'brake / reverse',       key: 'S',         pad: 'LT' },
  { action: 'steer',                 key: 'A / D',     pad: 'left stick' },
  { action: 'look around / map cursor', key: 'mouse',   pad: 'right stick' },
  { action: 'handbrake / park (tap)', key: ' ',        pad: 'RB', button: 5 },
  { action: 'throw paper (aiming)',  key: 'F (hold, release)', pad: 'right stick aims, RB tap' },
  { action: 'clutch (manual)',       key: 'Shift',     pad: 'LB', button: 4 },
  { action: 'upshift (manual)',      key: 'e',         pad: 'A',  button: 0 },
  { action: 'downshift (manual)',    key: 'q',         pad: 'X',  button: 2 },
  { action: 'ignition (hold)',       key: 'i',         pad: 'Y',  button: 3 },
  { action: 'pump / aim (hold)',     key: 'f',         pad: 'B',  button: 1 },
  { action: 'camera mode',           key: 'c',         pad: 'right stick click', button: 11 },
  { action: 'headlights',            key: 'l',         pad: 'left stick click', button: 10 },
  { action: 'pause',                 key: 'Escape',    pad: 'Start', button: 9 },
  { action: 'map',                   key: 'm',         pad: 'View (tap)' },
  { action: 'map: prev / next offer', key: 'Q / E',    pad: 'LB / RB (map open)' },
  { action: 'map: zoom in / out',    key: 'wheel',     pad: 'RT / LT (map open)' },
  { action: 'cards: pick / press',   key: 'arrows / Enter', pad: 'D-pad / A (card up)' },
  { action: 'reset truck',           key: 'r',         pad: 'View (hold 1 s)' },
  { action: 'inventory',             key: 'Tab',       pad: 'D-pad ↑', button: 12 },
  { action: 'camp',                  key: 'z',         pad: 'D-pad ↓', button: 13 },
  { action: 'damage screen',         key: 'v',         pad: 'D-pad ←', button: 14 },
  { action: 'recovery',              key: 'x',         pad: 'D-pad →', button: 15 },
]
const BUTTON_KEYS = Object.fromEntries(BINDINGS.filter(b => b.button != null).map(b => [b.button, b.key]))
// While a menu owns the screen (pad.menuActive, from src/menu-nav.js) the pad speaks the menu's keys
// instead: A = Enter, B = Escape (back), Start = Escape (unpause), D-pad and left stick = arrows with
// hold-to-repeat. Every other button is silent, so A cannot upshift and B cannot pump behind a menu.
const MENU_KEYS = { 0: 'Enter', 1: 'Escape', 9: 'Escape' }
// FEAT-133: while the map is open, the bumpers step its offers (Q / E — LB left, RB right, like tabs)
// and A / X go silent, so paging through offers can never shift a manual gearbox. The rest of the
// layout drives as usual; the right stick is the map's cursor (map2d.js reads pad.lookX/Y).
// The map also holds the truck like a menu does: its triggers are the zoom (pad.zoom).
const MAP_KEYS = { ...BUTTON_KEYS, 4: 'q', 5: 'e' }
delete MAP_KEYS[0]; delete MAP_KEYS[2]
// FEAT-133: while an in-game card is up (offer, result, camp, inventory… — menu-nav.js cardContainer)
// the D-pad moves its highlight, A presses it and B is Escape (back: closes the inventory and damage
// screens). X goes silent with A. Unlike a menu the truck still drives — triggers, stick, RB, LB.
// A card over the open map (the offer is shown on it) takes the map's bumpers too.
const CARD_KEYS = { ...BUTTON_KEYS, 0: 'Enter', 1: 'Escape' }
for (const i of [2, 12, 13, 14, 15]) delete CARD_KEYS[i]
const CARD_MAP_KEYS = { ...CARD_KEYS, 4: 'q', 5: 'e' }
const NAV = [['ArrowUp', 12], ['ArrowDown', 13], ['ArrowLeft', 14], ['ArrowRight', 15]]
const NAV_DELAY_MS = 400, NAV_REPEAT_MS = 120, NAV_STICK = 0.5
const navNext = new Map()   // arrow key → performance.now() of its next repeat, while held
// View: a tap (released under VIEW_HOLD_MS) opens the map (m, sent on RELEASE — only then is it known
// to be a tap); holding it VIEW_HOLD_MS resets the truck (r, keydown at the threshold, keyup on
// release so vehicle.js's per-step keys.r read still sees it held).
const VIEW = 8, VIEW_HOLD_MS = 1000
let viewDownAt = -1      // performance.now() of the press, -1 while up
let viewReset = false    // the hold already fired r this press
// RB, FEAT-133: while pad.throwReady() a press is HELD BACK — released under throwTapMs it throws (F
// down + up: main.js's own throw path), held past it it becomes the handbrake. Otherwise RB is
// plain Space at once, so a handbrake turn off the aim costs no latency at all. Drive layout only.
const RB = 5
let rbAt = -1            // performance.now() of a held-back press, -1 when none
let rbBrake = false      // Space is down for RB

const held = new Map()   // button index → the key whose keydown was sent and keyup has not been

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
  let thr = 0, brk = 0, steer = 0, lookX = 0, lookY = 0, any = false, viewDown = false, rbDown = false
  const menu = pad.menuActive(), card = !menu && pad.cardActive(), map = !menu && pad.mapActive()
  const keys = menu ? MENU_KEYS : card ? (map ? CARD_MAP_KEYS : CARD_KEYS) : map ? MAP_KEYS : BUTTON_KEYS
  const drive = keys === BUTTON_KEYS
  const down = new Set(), nav = new Set()
  for (const gp of navigator.getGamepads()) {
    if (!gp || gp.mapping !== 'standard') continue
    any = true
    thr = Math.max(thr, deadzone(gp.buttons[7].value, PAD_PARAMS.triggerDeadzone))
    brk = Math.max(brk, deadzone(gp.buttons[6].value, PAD_PARAMS.triggerDeadzone))
    const s = deadzone(gp.axes[0], PAD_PARAMS.stickDeadzone)
    if (Math.abs(s) > Math.abs(steer)) steer = s
    const lx = deadzone(gp.axes[2], PAD_PARAMS.stickDeadzone), ly = deadzone(gp.axes[3], PAD_PARAMS.stickDeadzone)
    if (Math.hypot(lx, ly) > Math.hypot(lookX, lookY)) { lookX = lx; lookY = ly }
    for (const i in keys) if (gp.buttons[i]?.pressed && !(drive && +i === RB)) down.add(+i)
    if (gp.buttons[RB]?.pressed) rbDown = true
    if (gp.buttons[VIEW]?.pressed) viewDown = true
    if (menu || card) for (const [k, b] of NAV) if (gp.buttons[b]?.pressed) nav.add(k)
    if (menu) {   // the left stick navigates a menu; on a card it is still steering
      const ax = gp.axes[0], ay = gp.axes[1]
      if (ay < -NAV_STICK) nav.add('ArrowUp'); if (ay > NAV_STICK) nav.add('ArrowDown')
      if (ax < -NAV_STICK) nav.add('ArrowLeft'); if (ax > NAV_STICK) nav.add('ArrowRight')
    }
  }
  pad.zoom = map ? thr - brk : 0
  if (menu || map) { thr = brk = steer = 0 }   // the sticks and triggers are the menu's / map's, not the truck's
  pad.throttle = thr
  pad.brake = brk
  pad.steer = Math.sign(steer) * Math.abs(steer) ** PAD_PARAMS.steerCurve
  pad.lookX = lookX   // camera.js reads these; looking around never takes the driving away from
  pad.lookY = lookY   // the keyboard, so they do not set pad.active

  // A button keeps the key it went down with, so a press that opens or closes a menu still releases
  // the key it sent.
  for (const i of down) if (!held.has(i)) { held.set(i, keys[i]); sendKey('keydown', keys[i]); pad.active = true }
  for (const [i, k] of held) if (!down.has(i)) { held.delete(i); sendKey('keyup', k) }
  if (thr > 0 || brk > 0 || steer !== 0) pad.active = true
  if (map && (pad.zoom || lookX || lookY)) pad.active = true   // the map's cursor is the pad's, unlike the camera

  const now = performance.now()
  if (drive && rbDown) {
    if (rbAt < 0 && !rbBrake) {
      pad.active = true
      if (pad.throwReady()) rbAt = now
      else { rbBrake = true; sendKey('keydown', ' ') }
    } else if (rbAt >= 0 && now - rbAt >= PAD_PARAMS.throwTapMs) { rbAt = -1; rbBrake = true; sendKey('keydown', ' ') }
  } else {
    if (drive && rbAt >= 0 && any) { sendKey('keydown', 'f'); sendKey('keyup', 'f') }   // a tap: throw
    if (rbBrake) sendKey('keyup', ' ')
    rbAt = -1; rbBrake = false
  }
  for (const k of nav) {
    const t = navNext.get(k)
    if (t === undefined || now >= t) {
      navNext.set(k, t === undefined ? now + NAV_DELAY_MS : t + NAV_REPEAT_MS)
      sendKey('keydown', k); sendKey('keyup', k)
    }
  }
  for (const k of navNext.keys()) if (!nav.has(k)) navNext.delete(k)

  if (menu) {   // View is silent in a menu: a press in flight dies quietly (a reset already firing lets go)
    if (viewDownAt >= 0 && viewReset) sendKey('keyup', 'r')
    viewDownAt = -1; viewDown = false
  }
  if (viewDown) {
    const now = performance.now()
    if (viewDownAt < 0) { viewDownAt = now; viewReset = false; pad.active = true }
    else if (!viewReset && now - viewDownAt >= VIEW_HOLD_MS) { viewReset = true; sendKey('keydown', 'r') }
  } else if (viewDownAt >= 0) {
    if (viewReset) sendKey('keyup', 'r')
    else if (any) { sendKey('keydown', 'm'); sendKey('keyup', 'm') }   // not on an unplug mid-press
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

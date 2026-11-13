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
  // Center softening k, 0 … 1.5: out = sign(x)·|x|^(1+k) (steerCurve). 0 = linear, 1 = the parabola x·|x|,
  // 1.5 = |x|^2.5 — always through ±1, so full stick is still full lock. Owner 2026-10-20: 100 % was
  // "almost perfect" and wanted room past it, so the old blend (1−k)·x + k·x·|x| — which goes
  // negative-slope at centre past k = 1 — became a power law; 0 % and 100 % are unchanged. Only with
  // the steering assist OFF: the assist's speed-scaled envelope is the shaping when it is on.
  steerShape:      0,
  steerSlewRate:   4.8,   // rad/s (6.0 → 4.8, −20 % 2026-10-21) — max wheel-angle rate, so a flicked stick can't step the physics
  // Right stick = camera orbit RATE (not a 1:1 map of the mouse drag): full deflection turns the
  // view at orbitRate; orbitHold seconds after the stick is let go the chase cam takes back over.
  orbitRate: 2.0,         // rad/s at full deflection (FEAT-133: one rate, aiming a paper too)
  orbitHold: 2.0,         // s
  // FEAT-175: with the map open the LEFT stick pans the map under a fixed centre cursor (map2d.js), and
  // the right stick's vertical zooms about it.
  mapPanRate:    600,     // CSS px/s of sheet slide at full deflection
  mapZoomRate:   2.0,     // e-folds/s at full deflection (up in, down out): ×7.4 per second
  // FEAT-133 pad throw: while aiming on a paper route an RB press shorter than throwTapMs throws;
  // held longer it is the handbrake, from that moment.
  throwTapMs: 200,        // ms
}

// menuActive: set by src/menu-nav.js — true while a menu owns the screen (the pad then speaks MENU_KEYS).
// cardActive: set by src/menu-nav.js — true while an in-game card is up (the pad then speaks CARD_KEYS).
// mapActive: set by src/map2d.js — true while the map is open (the pad then speaks MAP_KEYS).
// panX / panY: the left stick while the map is open (map2d.js pans with it); 0 otherwise.
// zoom: the right stick pushed up (+) / pulled down (−) while the map is open, in [-1, 1]; 0 otherwise.
// canThrow / throwReady: set by main.js — a paper throw is possible (the right stick aims), and
// the reticle is up as well (RB tap throws). pumpActive: set by main.js — the pump is open, so A
// pumps. hudMenu: set by src/hud-menu.js — the B-hold icon menu ({ open, move, select, cancel }).
// skipHold: set by main.js — the opening can be skipped, so View is held M (FEAT-170).
export const pad = { active: false, throttle: 0, brake: 0, steer: 0, lookX: 0, lookY: 0, panX: 0, panY: 0, zoom: 0,
  menuActive: () => false, cardActive: () => false, cardTabs: () => false, cardDrive: () => false,
  mapActive: () => false, canThrow: () => false, throwReady: () => false,
  pumpActive: () => false, skipHold: () => false, hudMenu: null }

// THE BINDING TABLE (Forza-style layout, owner 2026-10-19 — the FEAT-125 ticket). Rows with a
// `button` (standard-layout index) replay `key` while held; the rest are analog or tap-vs-hold, read
// in poll(), and are here so the settings page's chart is generated from this one table and
// cannot drift from what the pad does. LB / A / X are the FEAT-126 manual gearbox's clutch and
// shifts; the automatic ignores them. Start pauses and View is the map (owner, 2026-10-19), which
// moved the headlights to the left stick click. The side-menu icons (inventory, damage, camp,
// recovery) sit behind ONE button, B held (owner, 2026-10-21), and B + ←/→ is reserved for a later
// action. Their rows carry `B (…)` so every key tab reads "B". The pump left B for A, at the pump only.
// The D-pad drives three actions (owner, 2026-11-03, FEAT-144): ↓ picks up / loads lost bed cargo, ←
// sets the spawn (free roam), → held resets the truck like View's hold. Home (16) is unbound.
export const BINDINGS = [
  { action: 'throttle',              key: 'W',         pad: 'RT' },
  { action: 'brake / reverse',       key: 'S',         pad: 'LT' },
  { action: 'steer',                 key: 'A / D',     pad: 'left stick' },
  { action: 'look around',           key: 'mouse',     pad: 'right stick' },
  { action: 'map: pan',              key: 'mouse drag', pad: 'left stick (map open)' },
  { action: 'handbrake / park (tap)', key: ' ',        pad: 'RB', button: 5 },
  { action: 'throw paper (aiming)',  key: 'F (hold, release)', pad: 'right stick aims, RB tap' },
  { action: 'clutch (manual)',       key: 'Shift',     pad: 'LB', button: 4 },
  { action: 'upshift (manual)',      key: 'e',         pad: 'A',  button: 0 },
  { action: 'downshift (manual)',    key: 'q',         pad: 'X',  button: 2 },
  { action: 'ignition (hold)',       key: 'i',         pad: 'Y',  button: 3 },
  { action: 'pump (hold)',           key: 'f',         pad: 'A (pump open)' },
  { action: 'camera mode',           key: 'c',         pad: 'right stick click', button: 11 },
  { action: 'headlights',            key: 'l',         pad: 'left stick click', button: 10 },
  { action: 'pause',                 key: 'Escape',    pad: 'Start', button: 9 },
  { action: 'back (menus, cards, map)', key: 'Esc',     pad: 'B' },
  { action: 'map',                   key: 'm',         pad: 'View (tap)' },
  { action: 'map: prev / next offer', key: 'Q / E',    pad: 'LB / RB (map open)' },
  { action: 'tabs (service shop)',   key: 'Q / E',    pad: 'LB / RB (shop open)' },
  { action: 'map: zoom in / out',    key: 'wheel',     pad: 'right stick ↑ / ↓ (map open)' },
  { action: 'cards: pick / press',   key: 'arrows / Enter', pad: 'D-pad / A (card up)' },
  { action: 'reset truck',           key: 'r',         pad: 'View or D-pad → (hold 1 s)' },
  { action: 'pick up / load lost cargo (parked)', key: 'g', pad: 'D-pad ↓', button: 13 },
  { action: 'set spawn here (free roam)', key: 'Shift+R', pad: 'D-pad ←', button: 14 },
  { action: 'inventory',             key: 'Tab',       pad: 'B (hold, ↑/↓, release)' },
  { action: 'damage screen',         key: 'v',         pad: 'B (hold, ↑/↓, release)' },
  { action: 'camp',                  key: 'z',         pad: 'B (hold, ↑/↓, release)' },
  { action: 'recovery',              key: 'x',         pad: 'B (hold, ↑/↓, release)' },
  // FEAT-125 pad audit [DEFAULT]: the job's two-press abandon button, mouse-only until now — the B menu's
  // last entry (never pre-selected, hud-menu.js) and J on the keyboard. FEAT-195 (owner, 2026-11-11): its pad
  // binding is B held + ↑ — ↑ from the pre-selection (the top) wraps straight to it — and the keycap says so.
  { action: 'abandon job (parked; twice)', key: 'j',  pad: 'B + ↑ (hold B, ↑, release)' },
]
const BUTTON_KEYS = Object.fromEntries(BINDINGS.filter(b => b.button != null).map(b => [b.button, b.key]))
// While a menu owns the screen (pad.menuActive, from src/menu-nav.js) the pad speaks the menu's keys
// instead: A = Enter, B = Escape (back), Start = Escape (unpause), D-pad and left stick = arrows with
// hold-to-repeat. Every other button is silent, so A cannot upshift and B cannot pump behind a menu.
const MENU_KEYS = { 0: 'Enter', 1: 'Escape', 9: 'Escape' }
// FEAT-133: while the map is open, the bumpers step its offers (Q / E — LB left, RB right, like tabs)
// and A / X go silent, so paging through offers can never shift a manual gearbox. The rest of the
// layout drives as usual. FEAT-175 (owner, 2026-11-06): the sticks are the map's — the left pans
// (pad.panX/Y), the right's vertical zooms (pad.zoom) — and the triggers stay the truck's pedals, always.
// View, which opens the map, sits under the left thumb, so that thumb is off the stick by then: there is
// no steering to hand over. B is Escape there, the general back (owner, 2026-10-20): it closes the map.
const MAP_KEYS = { ...BUTTON_KEYS, 1: 'Escape', 4: 'q', 5: 'e' }
delete MAP_KEYS[0]; delete MAP_KEYS[2]
// FEAT-133: while an in-game card is up (offer, result, camp, inventory… — menu-nav.js cardContainer)
// the D-pad moves its highlight, A presses it and B is Escape (back: closes the inventory and damage
// screens). X goes silent with A. Unlike a menu the truck still drives — triggers, stick, RB, LB.
// A card over the open map (the offer is shown on it) takes the map's bumpers too.
const CARD_KEYS = { ...BUTTON_KEYS, 0: 'Enter', 1: 'Escape' }
for (const i of [2, 12, 13, 14, 15]) delete CARD_KEYS[i]
const CARD_MAP_KEYS = { ...CARD_KEYS, 4: 'q', 5: 'e' }
// BUG-109 (owner, 2026-11-04): a card with tabs (the service shop) steps them on LB / RB — Q / E,
// menu-nav.js — like the map's offers. Parked at the shop, the bumpers have no clutch or handbrake to work.
const CARD_TAB_KEYS = CARD_MAP_KEYS
// BUG-109: a RESULT card has no tabs and nothing to pick until the D-pad puts its highlight on it, so
// the pad drives through it — A / X shift, LB clutch, RB handbrake — and B is back (pad.cardDrive).
// Its D-pad is the card's highlight, never the drive layout's actions.
const RESULT_KEYS = { ...BUTTON_KEYS, 1: 'Escape' }
for (const i of [12, 13, 14, 15]) delete RESULT_KEYS[i]
// The pump is open (pad.pumpActive): A is F, held to pump — parked at the pump, A has nothing to shift.
const PUMP_KEYS = { ...BUTTON_KEYS, 0: 'f' }
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
// B in the drive layout holds the icon menu (src/hud-menu.js via pad.hudMenu): press opens it, D-pad
// ↑/↓ edges walk it, release opens the pick. A B press that began in a menu, card or the map was a
// "back" and stays one: it can never open the icon menu when the layout drops to drive under it.
const B = 1, UP = 12, DOWN = 13, RIGHT = 15
let bMenu = false        // the icon menu is open on this B press
let bSpent = false       // this B press belongs to something else (it was a back)
let dPrev = 0            // last frame's D-pad ↑ (1) / ↓ (2) bits, for edges
// FEAT-170: while pad.skipHold() (the opening can be skipped) View is M itself — down on the press, up on
// the release — so main.js times the hold (skip) and a tap (the map) exactly as it does the key's.
let viewSkip = false     // this press is the skip's M
// D-pad → (FEAT-144): held VIEW_HOLD_MS it resets the truck (r down at the threshold, up on release),
// so a mid-drive tap does nothing. Drive layout only.
let rightAt = -1, rightReset = false

const held = new Map()   // button index → the key whose keydown was sent and keyup has not been
let padShown = false     // body.pad-on, as last written

/** Center softening: sign(x)·|x|^(1+k). Shared with the settings page's plot (main.js). */
export const steerCurve = (x, k) => Math.sign(x) * Math.abs(x) ** (1 + k)

/** The ABS pedal kick-back (src/abs.js pulse): a short buzz in the brake trigger where the pad can
 *  (Xbox 'trigger-rumble'), the whole pad otherwise. Unsupported pads ignore it. */
export function padKick () {
  for (const gp of navigator.getGamepads?.() ?? []) {
    const a = gp?.vibrationActuator
    if (!a) continue
    const trig = a.effects?.includes('trigger-rumble')
    a.playEffect(trig ? 'trigger-rumble' : 'dual-rumble', trig
      ? { duration: 40, leftTrigger: 0.8 }
      : { duration: 40, strongMagnitude: 0.4, weakMagnitude: 0.7 }).catch(() => {})
  }
}

const deadzone = (v, d) => Math.abs(v) < d ? 0 : Math.sign(v) * (Math.abs(v) - d) / (1 - d)

function sendKey (type, key) {
  const shiftKey = key.startsWith('Shift+')   // a chord row ('Shift+R'): the key with Shift held
  if (shiftKey) key = key.slice(6)
  const code = key === ' ' ? 'Space' : key.length === 1 ? 'Key' + key.toUpperCase() : key
  // Dispatched where a real keystroke lands (the focused element), bubbling, so element-level and
  // document/window-level listeners all see it as they would a real key.
  ;(document.activeElement || document.body).dispatchEvent(new KeyboardEvent(type, { key, code, shiftKey, bubbles: true, cancelable: true }))
}

function poll () {
  // ponytail: every connected pad is merged (max trigger, largest stick, buttons OR'd) rather than
  // picking one — two pads on the desk both work. Per-player pads would need a real assignment.
  let thr = 0, brk = 0, steer = 0, lookX = 0, lookY = 0, panX = 0, panY = 0, any = false, viewDown = false, rbDown = false
  const menu = pad.menuActive(), card = !menu && pad.cardActive(), map = !menu && pad.mapActive()
  let keys = menu ? MENU_KEYS
    : card ? (pad.cardDrive() ? RESULT_KEYS : pad.cardTabs() ? CARD_TAB_KEYS : map ? CARD_MAP_KEYS : CARD_KEYS)
    : map ? MAP_KEYS : BUTTON_KEYS
  const drive = keys === BUTTON_KEYS
  if (drive && pad.pumpActive()) keys = PUMP_KEYS
  const down = new Set(), nav = new Set()
  let bDown = false, dpad = 0, rightDown = false
  // A press keeps the meaning it went down with until it is let go (as `held` does for every other button).
  // RB is the drive layout's own (Space, or a held-back throw) when it went down there — rbOwned — and
  // the generic key path's when it went down under a menu or card (held). Parking at mom's opens her
  // sleep card mid-press: the card layout re-sent RB's Space, and the park brake latched and let go again.
  const rbOwned = rbBrake || rbAt >= 0, rbGeneric = (!drive && !rbOwned) || held.has(RB)
  for (const gp of navigator.getGamepads()) {
    if (!gp || gp.mapping !== 'standard') continue
    any = true
    thr = Math.max(thr, deadzone(gp.buttons[7].value, PAD_PARAMS.triggerDeadzone))
    brk = Math.max(brk, deadzone(gp.buttons[6].value, PAD_PARAMS.triggerDeadzone))
    const s = deadzone(gp.axes[0], PAD_PARAMS.stickDeadzone)
    if (Math.abs(s) > Math.abs(steer)) steer = s
    const py = deadzone(gp.axes[1], PAD_PARAMS.stickDeadzone)
    if (Math.hypot(s, py) > Math.hypot(panX, panY)) { panX = s; panY = py }
    const lx = deadzone(gp.axes[2], PAD_PARAMS.stickDeadzone), ly = deadzone(gp.axes[3], PAD_PARAMS.stickDeadzone)
    if (Math.hypot(lx, ly) > Math.hypot(lookX, lookY)) { lookX = lx; lookY = ly }
    for (const i in keys) if (gp.buttons[i]?.pressed && (+i !== RB || rbGeneric)) down.add(+i)
    if (gp.buttons[RB]?.pressed) rbDown = true
    if (gp.buttons[VIEW]?.pressed) viewDown = true
    if (gp.buttons[B]?.pressed) bDown = true
    if (gp.buttons[UP]?.pressed) dpad |= 1
    if (gp.buttons[DOWN]?.pressed) dpad |= 2
    if (gp.buttons[RIGHT]?.pressed) rightDown = true
    if (menu || card) for (const [k, b] of NAV) if (gp.buttons[b]?.pressed) nav.add(k)
    if (menu) {   // the left stick navigates a menu; on a card it is still steering
      const ax = gp.axes[0], ay = gp.axes[1]
      if (ay < -NAV_STICK) nav.add('ArrowUp'); if (ay > NAV_STICK) nav.add('ArrowDown')
      if (ax < -NAV_STICK) nav.add('ArrowLeft'); if (ax > NAV_STICK) nav.add('ArrowRight')
    }
  }
  if (drive && bDown) down.delete(DOWN)   // B held: D-pad ↓ walks the icon menu, it picks nothing up
  pad.panX = map ? panX : 0
  pad.panY = map ? panY : 0
  pad.zoom = map ? -lookY : 0
  // The sticks and triggers are the menu's; on the map only the left stick is (its pan), never the pedals.
  if (menu) thr = brk = steer = 0
  else if (map) steer = 0
  pad.throttle = thr
  pad.brake = brk
  pad.steer = steerCurve(steer, PAD_PARAMS.steerAssist ? 0 : PAD_PARAMS.steerShape)
  pad.lookX = lookX   // camera.js reads these; looking around never takes the driving away from
  pad.lookY = lookY   // the keyboard, so they do not set pad.active

  // A button keeps the key it went down with, so a press that opens or closes a menu still releases
  // the key it sent.
  for (const i of down) if (!held.has(i)) { held.set(i, keys[i]); sendKey('keydown', keys[i]); pad.active = true }
  for (const [i, k] of held) if (!down.has(i)) { held.delete(i); sendKey('keyup', k) }
  if (thr > 0 || brk > 0 || steer !== 0) pad.active = true
  if (map && (pad.zoom || pad.panX || pad.panY)) pad.active = true   // the map's cursor is the pad's, unlike the camera

  const now = performance.now()
  if (rbDown && !rbGeneric) {
    if (!rbOwned) {
      pad.active = true
      if (pad.throwReady()) rbAt = now
      else { rbBrake = true; sendKey('keydown', ' ') }
    } else if (rbAt >= 0 && (!drive || now - rbAt >= PAD_PARAMS.throwTapMs)) { rbAt = -1; rbBrake = true; sendKey('keydown', ' ') }
    // ↑ a held-back press that can no longer throw (a card came up under it) is the handbrake it would have been
  } else if (!rbDown) {
    if (drive && rbAt >= 0 && any) { sendKey('keydown', 'f'); sendKey('keyup', 'f') }   // a tap: throw
    else if (rbAt >= 0 && any) { sendKey('keydown', ' '); sendKey('keyup', ' ') }      // …or, off the drive layout, a brake tap
    if (rbBrake) sendKey('keyup', ' ')
    rbAt = -1; rbBrake = false
  }
  if (drive && bDown && !bSpent) {
    if (!bMenu) { bMenu = true; pad.active = true; pad.hudMenu?.open() }
    if (dpad & 1 & ~dPrev) pad.hudMenu?.move(-1)
    if (dpad & 2 & ~dPrev) pad.hudMenu?.move(1)
  } else if (bMenu) {
    bMenu = false
    if (drive && any) pad.hudMenu?.select()   // released: open the pick
    else pad.hudMenu?.cancel()                // a menu/card took over, or the pad was unplugged
  }
  if (drive && rightDown && !bDown) {
    if (rightAt < 0) { rightAt = now; rightReset = false; pad.active = true }
    else if (!rightReset && now - rightAt >= VIEW_HOLD_MS) { rightReset = true; sendKey('keydown', 'r') }
  } else {
    if (rightReset) sendKey('keyup', 'r')
    rightAt = -1; rightReset = false
  }
  if (!drive && bDown) bSpent = true
  if (!bDown) bSpent = false
  dPrev = dpad
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
    if (viewDownAt >= 0 && viewSkip) sendKey('keyup', 'm')
    viewDownAt = -1; viewDown = false; viewSkip = false
  }
  if (viewDown) {
    const now = performance.now()
    if (viewDownAt < 0) {
      viewDownAt = now; viewReset = false; pad.active = true
      viewSkip = pad.skipHold()
      if (viewSkip) sendKey('keydown', 'm')
    } else if (!viewSkip && !viewReset && now - viewDownAt >= VIEW_HOLD_MS) { viewReset = true; sendKey('keydown', 'r') }
  } else if (viewDownAt >= 0) {
    if (viewSkip) sendKey('keyup', 'm')
    else if (viewReset) sendKey('keyup', 'r')
    else if (any) { sendKey('keydown', 'm'); sendKey('keyup', 'm') }   // not on an unplug mid-press
    viewDownAt = -1; viewSkip = false
  }
  if (!any) pad.active = false   // unplugged: the keyboard drives again with no keypress needed
  // Key hints show the device that last drove (park-badge.js keycap: body.pad-on swaps the labels).
  if (pad.active !== padShown) { padShown = pad.active; document.body.classList.toggle('pad-on', padShown) }

  requestAnimationFrame(poll)
}

if (typeof navigator !== 'undefined' && navigator.getGamepads) {
  // Synthetic events are untrusted, so the pad's own replayed keys never hand control back.
  document.addEventListener('keydown', e => { if (e.isTrusted && !e.repeat) pad.active = false }, true)
  requestAnimationFrame(poll)
}

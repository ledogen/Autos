---
id: FEAT-125
type: feature
status: open
severity: minor
opened: 2026-10-17
relates: FEAT-124 (drive modes — designed to work with OR without analog input), FEAT-50 (fuel — the
  pedal axis), FEAT-01 (input ramps)
---

# FEAT-125: Controller support — analog throttle, brake and steering

## Request

Owner, 2026-10-17. Today all driving input is keyboard (`src/vehicle.js` `keys`): W and S are
binary, with ramps (`throttleRampRate`, `brakeRampRate`, `releaseRampRate`), and steering is A/D.
Add **gamepad support** through the browser's Gamepad API (a polled `navigator.getGamepads()`, read
each frame; there are no events for axes).

## Scope

- **Analog throttle and brake** on the triggers, written straight to `vehicleState.throttle` /
  `.brake`. The keyboard ramps are a stand-in for a pedal and should not filter a real one. This is
  the input the FEAT-50 fuel map and FEAT-124's Normal mode were built to reward.
- **Analog steering** on the left stick, with a deadzone and a response curve.
- Buttons for the existing actions: handbrake / park latch (Space), ignition (I), reset (R), map
  (M), camp (Z), recovery (X), inventory (Tab / 1–4), and pump (F — hold).
- **Keyboard and controller co-exist.** Whichever moved last drives, so a keyboard player is never
  locked out by a controller resting on the desk.
- Prompts show keycaps today (`park-badge.js keycap`). With a controller active, they should show
  the matching button glyphs.

## Acceptance

- A standard-mapping gamepad drives the truck in free roam and story mode with analog throttle and
  steering.
- A partial trigger produces a partial pedal (visible in the HUD THR readout), and the fuel burn
  follows it.
- Unplugging mid-drive drops cleanly back to the keyboard, with no stuck throttle.
- Every story action reachable on the keyboard is reachable on the pad.

## Follow-up (owner, 2026-10-18)

- **Pedal-aware shift schedule, once analog throttle lands.** The automatic upshifts only at the
  engine's `shiftUpRPM` (data/engines.js), whatever the pedal. So at a light foot the truck holds 2nd
  at 55 mph (4000–5100 rpm), and the top gears (4th on the 4R44E, 4th–5th on the 5R55E) need ~110–120
  mph. Light pedal should upshift early, full pedal late. Deliberately deferred until a real
  part-throttle exists to tune it against (feat-vehicle-drivetrain-architecture's "ideally
  throttle-dependent shift points").

## Hardware findings (2026-10-18, Mac M4 + Chrome, via `test/pad-test.html`)

- **Xbox One pad, Bluetooth:** `mapping: standard`, all analog inputs clean.
- **8BitDo Ultimate 2C Wireless, 2.4 GHz dongle:** NOT visible to the browser on macOS. In that mode the
  dongle's HID interfaces declare a keyboard (usage 0x01/0x06; this is what pops macOS's "set up your
  keyboard" wizard) and a vendor page (0xFF7A). There is no gamepad/joystick usage, so the Gamepad API never
  lists it. It is X-input, which macOS has no driver for. Expected to work on Windows.
- **8BitDo Ultimate 2C Wireless, Bluetooth (mode switch → BT):** `mapping: standard`, analog triggers and
  sticks correct. Pairing dropped twice; power-cycling the controller fixed it, and it has been stable since.
  The two extra back shoulder buttons report nothing — out of scope (most pads lack them).
- Both pads use the W3C standard layout, so FEAT-125 binds against standard indices only. There is no
  per-device remap table until a pad that reports `mapping: ""` actually needs one.

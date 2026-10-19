# HANDOFF 2026-10-19: controller → shift schedule → manual gearbox → settings page

```
Worktree: /Users/ledogen/CodeShit/CarGame-feat-125-controller
Branch:   feature/feat-125-controller   (off main 0b0f3cc)
Serve:    http://localhost:3775          (npm run dev -- --port 3775 --strictPort, from the worktree)
State:    859e44b = pad driving + orbit cam, committed. Ticket/handoff edits after it are uncommitted.
          node_modules is a symlink to ../CarGame/node_modules (git-ignored).
```

**Work ONLY in this worktree.** A fresh session starts anchored in the main repo
(`/Users/ledogen/CodeShit/CarGame`), so every edit and command must target the path above. Commit
with `git commit -- <paths>` (shared-tree rule).

## Where things stand

FEAT-125 controller support is working and committed. Read `src/gamepad.js` first; its header is
the design:
- Analog triggers write straight to `vehicleState.throttle` / `.brake`, with no ramps.
- The left stick is position steering, with a slew limit.
- Buttons replay as synthetic key events, so every existing handler works.
- Last-moved wins between keyboard and pad.
- The right stick drives the camera orbit as a rate. 2 s after release, the chase cam takes back over.
- Steering-assist toggle in `PAD_PARAMS`.

Hardware verified on the owner's Mac M4 in Chrome:
- The Xbox One pad (BT) and the 8BitDo Ultimate 2C (BT) both report `mapping: standard`.
- The 8BitDo's 2.4 GHz dongle is invisible on macOS (X-input, no driver).
- `test/pad-test.html` is the hardware dashboard.

Fake-pad end-to-end: `node test/pad-e2e.mjs --port=3775` (a rainy-day script, needs the dev server).
Extend it for the shift buttons and the menu navigation.

## The queue — in this order (owner, 2026-10-19)

All rulings are written into the tickets. **Read the ticket before starting each one.**

### 1. Pad layout re-map (FEAT-125, small) — DONE 2026-10-19

Shipped. `node test/pad-e2e.mjs --port=3775` covers the layout: 16 checks, including View tap/hold and the orbit.

The Forza-style table is in `feat-125-controller-support.md` → "Pad layout — ruling".
- Change `BUTTON_KEYS` in `src/gamepad.js`:
  - RB → Space.
  - B → `f` (pump/aim hold).
  - D-pad → → `x` (recovery).
  - LB / A / X → reserved for clutch / up / down. They are inert until #3 exists.
- **View tap vs hold:** a tap opens the inventory (Tab) and a 1 s hold resets the truck (r). That
  means firing on **release** if the press was under 1 s, or firing `r` at 1 s. This is the only
  non-trivial bit.
- Update the e2e checks: A tap → park becomes RB, and D-pad → reset becomes View-hold.

### 2. Throttle-dependent shift schedule (FEAT-124, re-scoped) — DONE 2026-10-19

Shipped and closed. See the resolution in `.planning/todos/completed/feat-124-drive-modes.md`; the gate is `test/shift-schedule.mjs`.

The ruling is in `completed/feat-124-drive-modes.md` → "Ruling — ONE schedule, no modes". There is no
Sport/Normal.
- Add an EMA of throttle to the drivetrain state.
- The upshift point interpolates from a new per-engine light-load upshift rpm (add it beside
  `shiftUpRPM` in `data/engines.js`) up to `shiftUpRPM` at full average.
- Shift logic: `src/drivetrain.js` around L219–253 (`shiftDownEff`, the anti-hunt check).
- Gate it as a fuel-map-style comparison: a gentle cruise reaches top gear, a floored run
  reproduces today's points.
- The physics fingerprint changes for part throttle. That is expected; re-baseline it.
- Also the ticket's original follow-up: today the 5R55E needs ~110–120 mph for top gear.

### 3. Manual transmission (FEAT-126, new ticket — the big one) — BUILT 2026-10-19, awaiting owner play-test

The sim, the clutch assistant, the controls, the damage track and the cluster readout are all
committed. See the "Build state" section in `feat-126-manual-transmission.md`. Two things are still
owed:
- the run-setting UI (#4 below);
- the owner's play-test.

Try it in free roam: debug → Vehicle → Drivetrain & Brakes → Transmission = M5OD-R1.

The full rulings are in `feat-126-manual-transmission.md`:
- An M5OD-R1 data entry.
- No torque converter.
- A binary clutch.
- A clutch assistant, default ON: it prevents stalls, works the clutch for shifts, and slips for
  launches.
- A sequential R-N-1..5 gate.
- With the assist off, a clutchless shift is rejected and costs ~2 % on a new manual-only
  **transmission** damage track. Stalls hook into FEAT-109.
- Keyboard: Left Shift clutch, E up, Q down. Pad: LB, A, X.

**Three open questions are listed in the ticket. Ask the owner at implementation; don't guess.**
**Plan-mode this one** (multi-file: drivetrain, transmissions data, vehicle input, damage, ignition).

### 4. Settings → Controls & Assists page (FEAT-41)

Add a **Gearbox: automatic / manual** run setting next to the clutch-assistant toggle. Owner ruling:
the manual is a run setting. Story mode applies it at run start (`_startStoryFromModal` in main.js,
where the other per-run resets live). Free roam applies it immediately, the same Object.assign plus
drivetrain reset the debug selector does (`src/debug.js` Transmission onChange).

The rulings are in `feat-game-menus-ui.md` → "Controls & Assists page — rulings":
- Reachable from the main menu (`#mm-settings-panel`, today a stub in `index.html`) **and** a new
  "settings" button in `#pause-menu`.
- Contents:
  - Steering-assist toggle.
  - Clutch-assistant toggle.
  - A read-only binding chart for pad + keyboard.
  - No rebinding, and no feel sliders.
- Persisted in localStorage, with try/catch and fallback to defaults.
- **Pad focus navigation** for settings + main + pause menus (D-pad/stick move, A select, B back).
  gamepad.js must route A/B to menu actions while a menu owns the screen, not to upshift/pump.

## Gates

- `npm test` (affected).
- `npm test -- --browser` once main.js / camera / input are touched; this runs the cdp-smoke, which
  is the only main.js coverage.
- `node test/fingerprint-physics.mjs` around #2 and #3.

Known reds on main: road-tunnel and road-clearance. Nothing here touches them.

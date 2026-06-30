---
id: QUAL-09
type: quality
status: done
opened: 2026-06-30
resolved: 2026-06-30
severity: trivial
source: user-request
note: "Debug-panel ergonomics: the GUI root is a wall of ~13 loose vehicle-physics sliders. Fold all of them into one collapsible top-level 'Vehicle' folder so the root reads as a short list of folders (Vehicle / Terrain / Roads) plus the perf/quality selector + meta. User decisions LOCKED at capture: (1) Root keeps the Quality/perf selector + Terrain + Roads folders + Build marker + Logger hint; only vehicle-physics controls move. (2) Vehicle folder is SUB-GROUPED into Mass & CG / Drivetrain & Brakes / Tires / Suspension. (3) Rename the weightFront slider from 'CG Fwd/Back (front fraction)' to 'CG (front fraction)'. Pure src/debug.js reorg — no params, no main.js, no behaviour change."
---

# QUAL-09: Fold loose vehicle sliders into a top-level "Vehicle" folder

## Symptom / motivation

The debug panel root (`src/debug.js` `initDebug`) currently renders ~13 loose controls before you
reach any folder — Build marker, vehicle selector, two CG sliders, tire stiffness/damping, mass,
friction, three torque sliders, rolling resistance, then the `Tire (Pacejka)` / `Suspension` /
`Terrain` / `Roads` folders, then the Logger hint. The vehicle-physics knobs dominate the root and
bury the world folders.

Group every vehicle-physics control under one collapsible **Vehicle** folder so the root is a short,
scannable list. No params change, no physics change — this is purely how `initDebug` nests its
controllers.

## Scope / what changes

`src/debug.js` `initDebug` only. **Target root layout:**

```
ROOT
  Build                         (meta, read-only — unchanged, stays first)
  Quality selector              (perf tier — stays at root, NOT folded; see PERF-06 note)
  ▾ Vehicle                     (NEW folder)
      Vehicle: <preset>         (the preset dropdown)
      ▸ Mass & CG
      ▸ Drivetrain & Brakes
      ▸ Tires
      ▸ Suspension
  ▸ Terrain                     (unchanged, stays at root)
  ▸ Roads                       (unchanged, stays at root)
  Logger (\ to record)          (read-only hint — unchanged, stays last)
```

### Vehicle folder contents (sub-grouped)

| Subfolder | Controls (current root sliders → move here) | param |
|---|---|---|
| *(folder root)* | Vehicle preset selector | `vehicleState.vehicle` |
| **Mass & CG** | CG Height (m) | `cgHeight` |
|  | **CG (front fraction)** ← renamed from "CG Fwd/Back (front fraction)" | `weightFront` |
|  | Mass (kg) | `mass` |
| **Drivetrain & Brakes** | Max Drive Torque (N·m) | `maxDriveTorque` |
|  | Max Brake Torque (N·m) | `maxBrakeTorque` |
|  | Handbrake Torque (Nm) | `maxHandbrakeTorque` |
|  | Rolling Resistance Cr | `rollingResistanceCoeff` |
| **Tires** | Tire Stiffness (N/m) | `tireStiffness` |
|  | Tire Damping (N·s/m) | `tireDamping` |
|  | Friction Coeff | `frictionCoeff` |
|  | *(fold the existing `Tire (Pacejka)` sliders in here — see below)* | `pacejka*`, `tire*` |
| **Suspension** | *(the existing `Suspension` folder, moved under Vehicle verbatim — all 13 sliders)* | `suspension*`, `arb*`, `bumpStop*` |

**Tire (Pacejka) merge:** the existing top-level `Tire (Pacejka)` folder (B/C/D/E + relaxation /
slip-vel-ref / long·lat stiffness) collapses INTO the new **Tires** subfolder rather than becoming a
third nesting level (`Vehicle > Tires > Pacejka`). Tire Stiffness / Tire Damping / Friction Coeff sit
above the Pacejka block in the same Tires subfolder.

**Suspension move:** the existing `Suspension` folder (8 spring/damper/ARB + 5 travel/offset/bumpstop
sliders) moves under Vehicle unchanged — just re-parent `addFolder('Suspension')` onto the Vehicle
folder instead of `gui`.

### The one rename

`gui.add(params, 'weightFront', ...).name('CG Fwd/Back (front fraction)')` →
`.name('CG (front fraction)')`. The `weightRear = 1 - v` `onChange` is unchanged.

## Implementation notes

- Build the folder tree with lil-gui's `addFolder`: `const vehicleFolder = gui.addFolder('Vehicle')`,
  then `vehicleFolder.addFolder('Mass & CG')`, etc. Move each `gui.add(...)` call to the right
  subfolder object — these are mechanical receiver swaps (`gui.` → `<subfolder>.`), the property,
  range, step, name, and any `onChange` stay byte-identical (except the one CG rename).
- **Stays at root, do not move:** the Build marker (`buildCtrl`, top), the perf/quality selector, the
  `Terrain` folder, the `Roads` folder, and the Logger hint (`_loggerHint`, bottom). Build stays first
  and Logger stays last so the root visually brackets the folders.
- **`controllersRecursive()` already handles nesting.** The vehicle-preset `onChange` and the
  draw-distance/quality `onChange` both call `gui.controllersRecursive().forEach(c => c.updateDisplay())`
  — `controllersRecursive` walks subfolders, so moving sliders deeper does NOT break the preset-refresh
  or display sync. No code change needed there.
- **Canvas overlays + backtick toggle are independent of GUI nesting** — `plotCanvas` / `travelCanvas`
  / `slipCanvas` and the single backtick keydown listener read `params` / DOM, not controller position.
  Leave them as-is.
- Update the leading file-header comment block in `src/debug.js` to describe the Vehicle-folder layout
  (the existing Phase-by-Phase narrative is stale; add a QUAL-09 line, don't rewrite history).
- Keep the inline `D-NN` / phase tags on each moved slider's comment — strip none (CLAUDE.md: comments
  keep the story; the params still exist).

## Constraints / risk

- **No params / data/ranger.js change**, no `main.js` change, no physics change — purely GUI nesting +
  one display-name string. `weightFront` is still the bound property; only its `.name()` label changes.
- **Headless gates unaffected:** `npm test` constructs no GUI and never imports the lil-gui path, so
  the reorg can't regress a gate. Run it anyway to confirm.
- **No reordering of Terrain-vs-Roads** — the Roads folder's "Placed AFTER the Terrain folder — do not
  reorder" invariant is untouched (both stay at root in the same order).
- Default collapsed/open state: lil-gui folders default open; acceptable. (Optional polish: `.close()`
  the Vehicle subfolders so the panel opens compact — Claude's discretion, not required.)

## Acceptance

- [ ] GUI root shows, in order: Build marker, the perf/quality selector, a **Vehicle** folder, the
      **Terrain** folder, the **Roads** folder, the Logger hint — and no loose vehicle-physics sliders
      at the root.
- [ ] **Vehicle** folder contains the preset selector plus four subfolders: **Mass & CG**,
      **Drivetrain & Brakes**, **Tires** (tire stiffness/damping + friction + the former Pacejka
      sliders), **Suspension** (the former top-level Suspension folder's full slider set).
- [ ] The CG front-fraction slider is labelled **"CG (front fraction)"** and still drives `weightFront`
      (moving it updates `weightRear = 1 - v`).
- [ ] Switching the vehicle preset still refreshes every slider (including the now-nested ones) — the
      `controllersRecursive` display sync works across the new subfolders.
- [ ] Backtick still toggles the panel + all three canvas overlays in lockstep; `\` logger hint intact.
- [ ] No params, physics, or `main.js` change; `npm test` stays green.
- [ ] In-browser: panel reads as a short folder list; every moved slider still mutates live physics.

## Files

- `src/debug.js` — `initDebug` folder restructure + the one `.name()` rename + header-comment update.

## Relationships

- **PERF-06** (Master Quality selector, pending) — that ticket adds the top-level **Quality** dropdown
  this ticket reserves a root slot for. Order-independent: if PERF-06 lands first, QUAL-09 leaves its
  Quality dropdown at root untouched; if QUAL-09 lands first, the root already has the Vehicle/Terrain/
  Roads folders and PERF-06 just drops Quality in above them. Neither moves the other's controls. If
  PERF-06 is NOT yet done when QUAL-09 is implemented, the "quality selector" at root is today's
  **Draw Distance** dropdown — which PERF-06 will later promote out of the Terrain folder; QUAL-09 does
  not touch Draw Distance's current location.
- **QUAL-04** (build marker, done) — owns the root `buildCtrl`; QUAL-09 keeps it first at root.

# HANDOFF — merging `feature/ignition` into main — 2026-08-23

**You are merging 5 commits that deliver FEAT-33 (switched ignition + starter) and mint FEAT-70
(engine stall, deferred). This is an easy merge — read §1, then merge.**

Branch: `feature/ignition` @ `95aa553`, worktree `/Users/ledogen/CodeShit/CarGame-ignition`.
Merge base: `fbc9c04`. Tree is clean; every commit is gated.

---

## 1. THE MERGE ITSELF: clean, verified, nothing to resolve

Main has **11 commits** since the merge base (the lone-gas-pump asset work and three planning-doc
updates). **Zero file overlap with this branch** — main touched assets, `data/prop-models.js`,
ART-STYLE.md and three tickets; this branch touched the physics/UI stack, `data/ranger.js` and
`test/`. A `git merge-tree --write-tree main feature/ignition` dry run returns a clean tree with no
conflict list.

So: `bash ~/.claude/skills/worktree/scripts/wt.sh merge ignition` should be a plain `--no-ff` merge
commit with no hand-resolution. **Do not take a whole-file side on anything** — if a conflict appears
that this document did not predict, stop and re-read, because it means main moved after this was
written.

**One caveat that already bit once, on branch creation:** `wt.sh` bases new worktrees on
`origin/main`, which at the time was **50 commits behind local `main`**. This branch was reset onto
local `main` before any work started, so it is fine — but check `git rev-list --count origin/main..main`
before trusting `wt.sh` on the *next* ticket.

---

## 2. WHAT SHIPS

The engine was always on: `stepDrivetrain` floored `engineRPM` at idle unconditionally. It now runs
behind an ignition state machine, keyed to `I`.

| file | what changed |
|---|---|
| `src/ignition.js` | **NEW** (115 lines). Pure OFF/CRANKING/RUNNING state machine. No Three.js, no DOM, no audio. |
| `src/drivetrain.js` | Ignition gate ahead of the combustion path + dead-engine drag through the converter. |
| `src/vehicle.js` | The `I` key (Ctrl/Cmd+I guarded), stepped in `updateVehicle` behind the free-cam and doze gates. |
| `src/cluster.js` | The switch: silver escutcheon, framing detents, three distinct key renderings. Canvas 416×200 → **420×204**. |
| `src/engine-audio.js` | Noise-based starter loop, catch, shutoff; the drone mutes whenever the engine is not firing. |
| `src/main.js` | vehicleState fields, reset + sleep hooks, audio wiring, cluster wiring, `window.__vs` dev handle. |
| `src/logger.js` | `ign` column (0/1/2), appended at the END of the row. |
| `src/debug.js` | "Ignition & Starter" folder incl. the Engine Health slider. |
| `data/ranger.js` | 8 new params (§5). |
| `test/ignition-starter.mjs` + `test/gates.mjs` | **NEW** physics gate, registered. |
| `test/lib/cdp.mjs` | `KEY_CODES` gained `i` so scripted runs can drive the ignition. |

### The five owner rulings this was built to (all 2026-08-22)

These closed five of the ticket's open design questions. They are decisions, not defaults — do not
quietly re-litigate them post-merge.

1. **Spawn:** story mode re-seats you with a **dead** truck; free roam / lab / scenario spawn
   **RUNNING**. Sleeping at camp also kills the key, so you wake to a dead truck.
2. **Stalling is OUT of v1** — deferred behind the manual transmission as **FEAT-70**. The reason is
   worth keeping: a torque converter is precisely the component that makes stalling impossible, so
   stalling an automatic would be inventing a failure the machine does not have.
3. **Kill at any speed.** You really can turn the key off at 50 mph.
4. **Key-off does NOT freewheel** (the owner's own correction, and it was right): a dead engine in an
   automatic left in gear is dragged round by the turbine, so the truck coasts down on pumping and
   friction losses — *more* retardation than idle engine braking — fading out below the converter
   coupling speed.
5. **The starter keeps turning while the key is held**, including after the engine has caught. So the
   crank audio is a LEVEL (`_starterEngaged`), not an edge; catch and shutoff stay one-shot edges.

---

## 3. THE THREE INVARIANTS. Breaking any of these is a regression, not a refactor.

**3.1 — An ABSENT `vehicleState.ignition` means RUNNING.** `stepDrivetrain` reads
`vehicleState.ignition ? vehicleState.ignition.state : 'running'`. Every headless gate builds a
`vehicleState` by hand with no ignition field, so this default is what keeps `drivetrain-climb`,
`debris-coupling`, `measure-vehicle-limits` and the replay harness seeing exactly today's drivetrain
without cranking the truck first. `test/ignition-starter.mjs` asserts it byte-for-byte against the
RUNNING path. **If you ever make the field mandatory, you must touch every gate.**

**3.2 — Entering CRANKING requires a fresh PRESS, never a held key.** This one rule is what stops the
shutoff tap from bouncing straight into a restart when the driver keeps their finger down. Gated.

**3.3 — The doze can never shut the truck off.** `updateVehicle` gates the key behind
`_controlAtten > 0.5`, so a story-mode doze drops the ignition input like every other driver input
(SM-INV-1: inputs drop, they never invert). A stall mid-doze would be a different, harsher game — and
per §2.2 stalling does not exist yet anyway.

---

## 4. VERIFY AFTER MERGING

**Pre-merge state on the branch: `npm run test:all` — all 56 gates green** (wall 551 s, gate-cpu
3109 s, 2026-08-23). So anything red after the merge came from the merge, not from this branch.

```
npm run test:all                 # full suite; the new gate is test/ignition-starter.mjs
node test/ignition-starter.mjs   # or just this one — pure math, milliseconds
```

Then in the browser (`npm run dev`), the four-beat check that exercises the whole chain — input →
`ignition.js` → `drivetrain.js` → `cluster.js` → audio:

1. Tap `I`. Engine dies, tach falls to zero, the key vanishes and you are left with an empty keyhole.
2. Roll away. You should feel the dead engine dragging, and feel it free up as you slow to a stop.
3. Hold `I`. Starter grinds, engine catches after ~0.25 s, key sits at 2 o'clock **while you keep
   holding** and the grind continues over the idle. Release → key springs to 12 o'clock.
4. Debug panel → Vehicle → Drivetrain & Brakes → **Ignition & Starter** → drag **Engine Health** to
   0 and start it again. Four seconds of grinding. That is the whole feature.

This branch was also driven headlessly over CDP through all six transitions with no console errors;
the driver script is in the session scratchpad, not committed.

---

## 5. THE NEW PARAMS (all in `data/ranger.js`, all sliders)

| param | default | what it does |
|---|---|---|
| `ignitionCatchTime` | 0.25 s | crank time before it catches at full engine health |
| `ignitionCatchTimeWorn` | 4.0 s | …and at zero health. The interpolation is the feature. |
| `ignitionCrankRPM` | 250 | speed the starter turns the engine at (makes no drive torque) |
| `ignitionCrankRpmLag` | 0.12 s | RPM lag while the starter picks it up |
| `engineOffDrag` | 90 N·m/1000rpm | dead-engine drag at the crankshaft |
| `engineOffCouplingRPM` | 1100 | above this the converter drags the engine fully |
| `engineOffRpmLag` | 0.7 s | how a killed engine coasts down |
| `engineHealth` | 1 | **NOT a param — lives on `vehicleState`.** See §6. |

---

## 6. THE SEAM SM-3 PLUGS INTO

`vehicleState.engineHealth` ∈ [0,1] is the only wear input. Catch time interpolates
`ignitionCatchTime` → `ignitionCatchTimeWorn` on it. **Nothing writes it today** — it is initialised
to 1 and moved only by the debug slider. When the SM-3 damage/wear model lands
(`feature/damage`, `.planning/story-mode/DESIGN.md`), it writes this field and the ritual starts
telling the player what they are driving before they have moved.

Absent ⇒ reads as 1 ⇒ a single nominal catch time, which is exactly what FEAT-33 specified for the
no-wear-model case. Do not add a second condition input; the ticket is explicit that this must read
the shared model rather than grow a bespoke timer.

---

## 7. LOOSE ENDS (none block the merge)

- **The keyhole slot axis is unconfirmed.** The owner described it as "pointed at the 10 o'clock
  position" and also "angled at the 2 o'clock" — mirrored diagonals, so only one could be built. It
  is on the **10 o'clock axis**, matching the OFF detent. One-word change (`KEY_ANGLE.off` →
  `KEY_ANGLE.start` in `_drawKeyhole`) if the owner wants the other lean.
- **The starter audio is a placeholder.** Owner: *"I'll probably just end up sampling a car starting
  at some point."* It is filtered noise (bandpass ~1.5 kHz for ring-gear teeth, lowpass <240 Hz for
  compression, each amplitude-modulated). Good enough to read as mechanical; not meant to be final.
- **Deferred by the ticket, unchanged:** battery drain / over-crank spiral, and flooding /
  throttle-on-crank. Both were flagged as follow-ons in FEAT-33 and stay that way.
- **FEAT-70** (`.planning/todos/pending/feat-engine-stall.md`) is minted and blocked on the manual
  transmission. Its acceptance section is deliberately a draft — re-derive it at planning.

---

## 8. AFTER THE MERGE

```
bash ~/.claude/skills/worktree/scripts/wt.sh clean ignition
bash ~/.claude/skills/window-title/scripts/title.sh --clear
```

FEAT-33 is already closed into `.planning/todos/completed/` on this branch with its full resolution
note, so the tracker needs no further edit.

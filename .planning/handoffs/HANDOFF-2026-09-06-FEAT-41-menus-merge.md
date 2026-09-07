# HANDOFF — merging `feature/menus` into main — 2026-09-06

**Main is already merged INTO this branch, and the one hazard that merge carried has been checked
and cleared. `git merge feature/menus` from main should be a fast-forward-shaped, conflict-free
merge with nothing to hand-resolve. §1 is the thing to re-check anyway if you are merging days
later; everything after that is what shipped.**

Branch: `feature/menus` @ `e6a222e`+, worktree `/Users/ledogen/CodeShit/CarGame-menus`, dev server
on :8041. Merge base was `4a0016b`; main moved to `29274b2` (FEAT-76 wye→T) during the work, and
`e6a222e` merges that in. Tree is clean.

Delivers **FEAT-41 phase (a)** — the menu shell and the live 3D stage — plus the repo-wide
**RangerSim → AUTOS** rename, and mints **BUG-60**.

---

## 1. THE HAZARD THAT `git merge-tree` DID NOT FLAG (checked, currently clear)

`git merge-tree --write-tree main feature/menus` returned **no conflicts**. That was not the whole
story, and the reason is worth carrying forward.

Main's `30c02ec` (ASSET-34: "square the fender, square the indicators, real front overhang") changed
`ranger.glb`, and with it `data/vehicle-models.js`:

```
targetLength: 4.61   → 4.705
shiftRear:    0.3465 → 0.2990
```

Those two numbers are load-bearing for this branch. `src/stage.js`'s `RANGER_BED` — the open-bed
collider the menu truck uses so rocks land in the bed rather than on a closed tonneau — is expressed
in **body-local metres**, derived from `assets/models/src/ranger.py`'s named constants pushed through
the loader transform in `src/vehicle-model.js`. That transform is exactly
`s = targetLength / max(size.x, size.z)` and `root.position` built from `box.min.y`, `center.z` and
`shiftRear`. Change the model's length or the spec's alignment and every one of those constants
moves — silently, because nothing asserts them.

**Re-measured after the merge. It is fine:** the auto-scale still comes out at exactly `1.0` and the
model root still lands at body-local `(0, −0.651, 0)`, because ASSET-34 lengthened the model and
retuned `targetLength`/`shiftRear` together to hold placement invariant. `RANGER_BED` is unchanged
and correct. Verified in the browser after merging: the truck still settles cocked on its rock
(`strutComp [0.144, 0.073, 0.046, 0.174]`) and all three bed rocks sit on the bed floor at
body-local y ≈ 0.33, z 1.06–2.24 — inside the well (front wall 0.71, tail 2.44).

**If ranger.glb or its spec moves again**, re-derive rather than assume. The procedure is written
into the `RANGER_BED` comment block in `src/stage.js`: load the page and read `root.scale.x` and
`root.position` off the loaded GLB group (`__stage._model.carGroup`'s child with a non-1 scale), then
`body y = <ranger.py Z> − |rootPos.y|`, `body z = −<ranger.py Y>`, x unchanged. The visible assay is
free: if the bed collider drifts, the bed rocks land on the tailgate or fall through the floor.

## 2. What shipped

**`src/stage.js` — `MenuStage`.** The live 3D scene behind the main menu AND the loading screen for
every mode entry. Its own THREE.Scene, camera, Box3D world, `vehicleState`, chassis, truck model and
`DebrisSystem`, so it keeps animating while the real world is reseeded and routed. Runs its own rAF
loop from just after the renderer is built — animating through main.js's remaining top-level awaits —
and `loop()` takes the driving off it on its first frame. Calls `stepPhysics` only, never
`updateVehicle` (whose key state is a module global; the menu truck must not answer to WASD).

**Boot lands on the menu**: free roam · story mode · testing lab · settings. The seed dialog fronts
free roam as well as story, blank with "leave blank for random". Settings is a stub. `#story-loading`
— an opaque full-cover panel — became `#load-caption`, a strip over the stage. Pause gained a
**main menu** entry.

**`?nomenu=1` is the harness bypass.** `test/screenshot.mjs`, `profile.mjs`, `hitch-report.mjs` and
`story-coldload.mjs` all pass it; **any new CDP harness that drives a real page must too**, or it
screenshots a truck on a rock instead of the world.

**Rename**: RangerSim → AUTOS across src, test, data, tools, docs, CLAUDE.md, LICENSE, package.json,
the deploy workflow and the live `.planning` docs. **Deliberately NOT renamed:**
`rangersim-run-export/N` and the `rangersim-run-*.json` filename convention — that tag is stamped
into every recorded run in `runs/`, and changing it orphans them from `runs:add` / `runs:report`.
Historical `.planning` material (phases, milestones, handoffs, bug-captures, completed todos) is left
as written. `window.__rsReady` also kept — internal handle, read by the boot-timing probes.

## 3. Four fixes that fell out of running a second truck

These are the parts a reviewer should actually read, because three of them are in shared code.

1. **`initPhysicsEngine()` was not re-entrant** (`src/physics-engine.js`).
   `if (!_b3) _b3 = await Box3DFactory()` is idempotent for SEQUENTIAL callers only. Two concurrent
   ones each instantiate the WASM module and the second replaces the first's instance, so the first
   world's bodies vanish and `b3World_Step` spins forever on garbage ids — presenting as a totally
   frozen renderer with no error anywhere. Now caches the promise. **Latent on main**; nothing could
   reach it until something else called it during boot.
2. **`_chassisRims` was keyed by the bare body handle** (`src/physics.js`). Handles are per-WORLD
   integers starting at 1, so two trucks in two worlds overwrote each other's rim metadata. Re-keyed
   `WeakMap<engine, Map<chassis, rims>>`.
3. **`createVehicleChassis` gained an opt-in `bed` spec** (`src/physics.js`). The bed is a solid
   tonneau deck in `CHASSIS_PROFILE`, so anything dropped in lands on the lid at rail height. The
   stage passes ranger.glb's real bed; **the world truck keeps the solid deck** (default `null`).
4. **`src/vehicle-state.js` is new** — the canonical `vehicleState` factory. Supersedes the old
   "new fields go in 3 places" convention: main.js and the stage both call it, so they cannot drift.
   Also `createVehicleModel` gained `setHeadlightMode` and a `{ keyBindings: false }` opt-out (a
   second model was answering the `L` key, and its headlight pool washed the stage's foreground).

## 4. Known, deliberate, and NOT to be fixed in the stage

**The front-left tire visibly sinks into its rock** on the way down. This is **BUG-60**
(`.planning/todos/pending/bug-60-wheel-visual-penetration.md`), left in on purpose.

Measured: zero missed contacts over 88 frames in contact, exactly one physics step per rendered frame
(median 17 ms), no jump in body height. The wheel sphere simply overlaps the solid by **55 mm at rest
and 92 mm at the landing peak** — which is what the model currently means by tire deflection, since
`fz = tireStiffness × depth` by construction and `computeStaticEquilibrium` seats the hub at
`wheelRadius − tireComp` deliberately. The truck has always done this; a road surface hides it.

A cosmetic fix was built and **reverted on owner review** (`7200ccc`, reverted by `22dde4a`): squashing
the stage's tire meshes by their own overlap cancelled the intrusion exactly and measured correct per
corner, but it looks wrong — the tire deforms while the steelie inside it stays rigid. **If anyone
draws a deforming tire, the rim has to deform with it or be re-seated**, and that is a
vehicle-renderer change, not a stage one. Owner's ruling is to leave the glitch visible as pressure
to address the seam properly.

## 5. Verification state

- **Gates**: `npm run test:all` — the four standing reds on main (`junction-stitch`,
  `mission-network`, `paper-tour`, `pond-route-around`) and nothing else, matching the pre-change
  baseline captured on this worktree before any edits. Re-run after merging: main gained FEAT-76's
  gates (`promoted-node-id`, `route-sharing-census`, `taper-band-census`) which this branch has
  never had reason to move.
- **`npm run build`** clean.
- **Flows driven end to end over CDP**, repeatedly and after the merge: cold boot → menu; free roam
  (typed seed and blank/random); free roam → pause → main menu → story mode (the owner's stated
  case, and the drop replays); testing lab from the menu and the pause toggle; settings stub; Esc
  behaviour in every state; clicking a mode BEFORE worldgen finishes and holding on the load caption.
- **`test/screenshot.mjs` re-verified** to still capture the world, not the menu, via `?nomenu=1`.

## 6. Still open on FEAT-41

Settings pages (video/quality, audio, controls, the FEAT-39 assists page), the UI-chrome/visual
language pass, the toast generalisation, and one-off scenarios (none exist yet to select). The ticket
`.planning/todos/pending/feat-game-menus-ui.md` carries a build-state section listing exactly what
landed and what did not — it stays **pending**, not completed.

## 7. Merging

```
cd /Users/ledogen/CodeShit/CarGame
git merge --no-ff feature/menus
npm run test:all          # expect the four standing reds, nothing new
npm run dev               # boot should land on the AUTOS menu
```

Then retire the worktree: `bash ~/.claude/skills/worktree/scripts/wt.sh clean menus`.

# HANDOFF — merge `feature/box3d` to main (FEAT-48 Box3D physics + FEAT-36 debris slice)

**For:** the merging agent. **From:** the FEAT-48 implementation session (2026-08-13 → 15).
**State:** feature complete, owner FEEL-SIGNED-OFF (2026-08-15), full suite 51/51 green at every
commit, working tree clean. One owner drive of the final inertia-axis fix may still be pending —
ASK before merging if unclear.

## What this branch is

The FEAT-48 physics-engine migration (Box3D behind the `src/physics-engine.js` adapter seam —
an owner decision that REVERSED CLAUDE.md's hand-rolled-physics rule; CLAUDE.md is amended in
this branch) plus the first FEAT-36 debris slice (throwable barrels/rocks), the QUAL-25 chassis
compound, collider wireframe debug overlay, and a long owner-driven contact-feel shakedown.
~15 commits, `7a042ec..` on `feature/box3d`.

## ⚠ Merge topology — read first

`feature/box3d` was branched from `feature/paper-route`'s tip (`104e207`), which is itself
UNMERGED. Merging this branch to main **carries all of FEAT-61 paper-route with it**. Options:
1. Merge `feature/paper-route` to main first (its own review), then `feature/box3d`.
2. Merge `feature/box3d` directly — main gets both at once.
The owner has driven the paper-route world extensively during this branch's shakedown (every
physics test happened on top of it), which de-risks (2) substantially — but the choice is the
owner's; ask if not already settled.

## Merge mechanics

- `bash ~/.claude/skills/worktree/scripts/wt.sh merge box3d` (worktree at
  `/Users/ledogen/CodeShit/CarGame-box3d`), or manual `git checkout main && git merge --no-ff
  feature/box3d`.
- Expected conflicts vs main: **likely none or trivial** (main hasn't moved since `67b8ea2`;
  verify with `git log main..` / `git log ..main` before assuming).
- `.gitignore` carries a load-bearing negation: `!vendor/box3d/dist/` under the global `dist/`
  ignore — do not "clean it up"; the vendored WASM must stay committed.
- Post-merge, from main: `npm install` (worktrees have own node_modules), `npm run test:all`
  (expect 51/51), `npm run build` (expect the wasm emitted as a hashed asset).
- The owner's dev servers: the worktree served on :8032; main's usual is :8000. After merge the
  worktree can be cleaned (`wt.sh clean box3d`) ONCE the owner confirms nothing else rides there.

## Architecture invariants the merge must not disturb (also in CLAUDE.md + memory)

- `src/physics-engine.js` is the ONLY module importing `vendor/box3d/` — grep `b3` outside it
  must stay clean. Swapping backends (fallback: Rapier) touches only that file.
- `tire.js` Pacejka + `suspension.js` struts are the project; never adopt engine wheel joints.
- MESH == PHYSICS mirrors: terrain chunks (`TerrainPhysics`), road ribbon/pads/tunnels
  (`RoadPhysics`, surface-only triangle filter — skirts deliberately non-collidable), props
  (`PropPhysics`, tilt-baked capsules). All hook-driven from the owning streamers; lab enter/exit
  swaps them for slab+ramp.
- Debris tire contacts ride the adapter's `contactSphere()` (engine narrow-phase manifolds) +
  the tire spring–damper with true closing rate + obstacle enveloping. NO caps/clamps/speed
  terms — that band-aid lineage was deliberately deleted (owner ruling); do not reintroduce.
- The within-step rock-proxy experiment was REVERTED on owner feel (`c03a727` → `6353d10`).
  It stays out unless the owner reopens it.
- Chassis: 4-hull compound + 4 strut-tracking rim cores (debris-only collision), tuned
  mass/inertia via SetMassData with the CORRECTED axis mapping (x=pitch, z=roll — final commit).
  Slab restitution pinned 0; cab/deck carry params.bodyRestitution.

## Owner retune shipped with the inertia fix (2026-08-15, final commits)

The corrected inertia axes (x=pitch, z=roll) come with an owner-tuned chassis setup in
`data/ranger.js`: carcass/relaxation length 0.135, frictionCoeff 0.8 (was 0.9), suspension
stiffness 33000/33000 (rear was 27000), damping 3500/4000 (was 3000/3000), front ARB 4500
(was 5000). The committed feel baseline (`vehicle-feel-box3d.json`, tag `owner-retune-2026-08-15`)
reflects this state. **Post-merge flag:** frictionCoeff 0.9→0.8 shifts overall grip — the FEAT-31
par calibration (`test/calibrate-par.mjs`, PAR_REF.mu lineage) should be RE-RUN before par
fairness matters in story mode; mission gates use frozen PAR_REF constants so nothing fails
loudly, it just drifts (the BUG-41 drift-alarm family).

## Open work that survives the merge (tracked)

- **INFRA-03** — ⏰ owner reminder: run the Box3D determinism hash on the Windows machine
  (`node test/box3d-determinism.mjs --hash-only` vs `test/box3d-determinism.expected`).
- **FEAT-48** ticket: carries the full status ledger; move to completed after merge + the final
  inertia-fix drive. Single-precision range note (~1 mm at 10 km) recorded there.
- **QUAL-25**: open-bed hollow bin awaits a vehicle model with a modeled bed; per-model hull
  data when a second vehicle lands.
- **FEAT-36** remainder: causesDamage flag (adapter `maxContactImpulse` seam exists, unconsumed),
  deterministic world-fixture debris, real barrel/rock art (ASSET-25/26 — current test props are
  declared placeholders).
- `assert-m4-*` re-recordings: OPTIONAL rigor — owner's drive sign-off superseded them.

## Verification surfaces (for post-merge spot checks)

- `npm run test:all` — 51 gates incl. `box3d-determinism-gate` (engine drift alarm) and
  `debris-coupling` (the whole contact-feel contract: fling, firmness, crawl, tree stop).
- `test/vehicle-feel-trace.mjs` — canned maneuvers; committed baseline
  `test/baselines/vehicle-feel-box3d.json` is the CURRENT state (tag
  `owner-retune-2026-08-15`); `vehicle-feel-legacy.json` is the pre-migration reference.
- In-browser: backtick = collider wireframes; debug panel → Vehicle → Physics Props →
  throw barrels/rocks with F.
- Memory file `project_feat48_box3d_landed.md` mirrors all of this for future sessions — update
  its "NOT merged" line after merging.

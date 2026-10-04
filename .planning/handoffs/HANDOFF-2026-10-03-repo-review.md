# HANDOFF 2026-10-03 — whole-repo code review, merged

## State

- Everything is on `main` (`fcedd27` merges the last of it; the first wave was `685a454`). Branch
  `feature/repo-review` + worktree `../CarGame-repo-review` are fully merged — safe to remove with
  `bash ~/.claude/skills/worktree/scripts/wt.sh clean repo-review`.
- Gates: 79/81 on the merged head. `road-tunnel` and `road-clearance` were red before the review
  and still are (BUG-77 / FEAT-77) — not regressions.
- Tickets: **QUAL-34** (`.planning/todos/pending/qual-34-repo-review-leftovers.md`) holds the
  22 owner rulings (all applied, section A) and the behaviour-preserving cleanup nobody got to
  (section B). **BUG-79**: alignment damage is published but never read by `alignment.js`.

## What the review did (ten commits, review-1 … review-10b)

Byte-identical world/physics up to review-9: dead code out (~2,050 lines net), the terrain worker
became a real module (`src/terrain-height.js` + `src/terrain-worker.js`, no more mirrored source
strings anywhere), road build ~16% faster, ground query no longer scales with network size,
bug fixes (water-aware scatter was off in the live game; failed road builds hung the loading
screen; camp dig blinked the terrain ring; stream water didn't rebuild on road adopt; litter-job
leak in the prop streamer; Mass/Body Bounce sliders didn't reach the engine body; …).

review-10/10b are the owner's rulings and DO change behaviour: one shared tire contact law
(`suspension.tireContactForce`) for wheel and rock sides; ONE ground query per wheel per step
(substeps shift Step 1's contacts; an airborne corner still queries every substep); stock
P235/75R15 on a 15 in rim (`rimRadius` 0.1905); damage persists across a story run only (every
free-roam seat resets it; menu stage runs on its own stock params copy); road-quality blend is
one-sided (no snap at 500 m boundaries); tunnel apron camber from `camberProfile`; shadow atlas
after spawn equals a full re-bake; dust/smoke kick rearward; burnout dust works; sizzle layer
deleted; `map-cover` calls `treeClusterPass`; drawn wheels derive from live params each frame.
`frame.physics` 1.87 → 0.95 ms/frame.

## Things to test in play (not yet driven by a human)

Hard landings / drops (query reuse), rocks under the wheel incl. a flat tire (new reaction law),
ride on big hits (13 mm more sidewall), 500 m road-quality boundaries, damage reset on R/teleport
vs persistence in story, dust/smoke direction, prop shadows at the drawn-ring edge after a spawn,
tunnel-mouth aprons, tire/wind audio unchanged.

## Verification tooling (session-local, now gone — rebuild if the review continues)

A world/physics fingerprint (network, profiles, junctions, physics surface, carve tables, every
road tile geometry, stream ribbons, water, POIs, prop placement with the full live sampler set,
900-step physics hash, feel trace) diffed against pristine `main`; a CDP browser smoke (boot,
drive, freecam, map, lab, story, camp); a shadow-atlas pixel hash after a forced full re-bake;
a gate runner on a `git archive` snapshot so the worktree stays editable during the 8-minute suite.
QUAL-34 describes them; promoting the fingerprint into `test/` is the first step.

## Gotchas learned

- Two sessions share the `CarGame` checkout: `git status` there goes stale within seconds, and
  `git merge --autostash` had its stash popped by the other session mid-merge. Prefer merging
  from a worktree, and never stash another session's edits without the owner saying so.
- `wt.sh serve` must run from the main dir; Vite background tasks die at their time limit — start
  with the 2 h maximum.

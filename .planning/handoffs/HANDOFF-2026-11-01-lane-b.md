# Handoff — Lane B, 2026-11-02 (FEAT-158 built, owner calls owed)

**Worktree** `/Users/ledogen/CodeShit/CarGame-machine` · **branch** `feature/machine` · **serve** `:3282`
(if it is down: `npx vite --port 3282 --strictPort` from the worktree). Work ONLY there; own only Lane B's
files. `git merge main` before starting. Tracker page: https://claude.ai/artifact/8P7QDPAaKxKPtJuf6zvRVH
(Lane B rows; `lanes/b` handoff). Supersedes the 2026-11-01 version of this file.

## State

- **FEAT-158 rock grip is BUILT and committed on feature/machine (51b3f330), NOT merged.** Full work
  log + numbers: `.planning/todos/pending/feat-158-rock-grip-crawling.md` (two 2026-11-02 sections).
  - The tire grips every rock it presses (implicit Coulomb per substep, physics.js `rockGrip`); the
    rock grips the road (`proxyGround`: normal + friction, projected Gauss–Seidel); the tire's normal
    push is implicit in the rock's yield (suspension.js); the supports ride with the rock within the
    step, and a lifted base holds nothing (fixed two of the four 50–55 mph flips).
  - Crawl climbs > 5 cm (of 270): front (undriven) 24/150/227, driven rear 120/259/198 at 2/5/10 mph
    (main: 0). Front rocks get bulldozed more than on main — honest for a free wheel (see ticket).
  - `hazardPinchEnergyJ` 800 → **2000 J [DEFAULT]**: pops 0/0/7/11/19/21/45 % at 25–55 mph (signed-off
    BUG-99 curve 0/0/3/6/23/33/53). Pops-on census: 1 flip in 270 at 50 mph (main 0).
  - Physics fingerprint (no debris) identical to main; affected gates 36/36 green.
- BUG-89, BUG-54, FEAT-132, FEAT-138, FEAT-150 were all done on main by Spare while B had no session —
  do not redo them. BUG-92 waits on the owner's USB-pad probe.

## Owed to the owner (FEAT-158)

1. The pinch threshold: 2000 J [DEFAULT] or another row from the ticket's table.
2. 1 flip in 270 hits at 50 mph into a 40 kg rock as tall as the tire's radius — acceptable?
3. Crawl play-test on :3282 (the served tree is the commit above). Merge to main on the owner's OK.

## NEXT

1. FEAT-158: the owner's three calls above, then merge.
2. FEAT-159 throttle assist + traction control (owner inbox 11-02; ticket on main).
3. BUG-92 when the owner's probe lands.

Small leftovers: rare > 2× crawl exits (7 of 810, max 3.0× on a 9 kg rock); `PhysicsEngine.replaceHullLocal`
has no src caller (delete with `collider-seam-churn.mjs`'s rework).

FEAT-94 and FEAT-152 are signed off: don't retune them, and never re-add a spark point light.

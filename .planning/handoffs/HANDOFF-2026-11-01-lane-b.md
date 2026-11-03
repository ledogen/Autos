# Handoff — Lane B, 2026-11-02 evening (FEAT-158 landing, FEAT-159 built, owner calls owed)

**Worktree** `/Users/ledogen/CodeShit/CarGame-machine` · **branch** `feature/machine` · **serve** `:3282`
(if it is down: `npx vite --port 3282 --strictPort` from the worktree). Work ONLY there; own only Lane B's
files. `git merge main` before starting. Commit WIP on the branch at every working step (`wip(NN): …`).
Tracker page: https://claude.ai/artifact/8P7QDPAaKxKPtJuf6zvRVH (Lane B rows; `lanes/b` handoff + agent
name — write your session name there on every resume). Supersedes the earlier 2026-11-02 version.

## State

- **FEAT-158 rock grip: CLOSED** (owner 11-02: crawl "feels good", 2000 J approved, the 50 mph flip
  accepted). Ticket in completed/. The orchestrator is landing `feature/machine` **at 2a515b49 exactly**
  (test:all 118/118, smoke 21/21). Nothing after that hash is part of the landing.
- **FEAT-159 throttle assist + traction control: BUILT on feature/machine, not landed.** Plan and work log
  are in `.planning/todos/pending/feat-159-throttle-assist-and-traction-control.md`.
  - `src/traction.js` (pure) is stepped in `stepPhysics`. It makes a pedal cap that `stepDrivetrain`
    takes the min of, and TC brake pressure on the rears for `getBrakeTorque`.
  - Toggles are OFF in `data/ranger.js` (the gates' baseline). The player defaults are in
    `src/settings.js`: throttle assist ON, TC OFF. There are two settings rows and a debug folder.
  - Gate `test/traction.mjs` 18/18; `--matrix` prints the owner's table.
  - Affected gates 80/80 green including cdp-smoke. Physics fingerprint identical to main.
  - Two plan deviations, both measured and in the work log:
    - The cap is an integral controller; the ABS-style valve lost 19 % of the launch.
    - The assist steps aside on ESC's oversteer test, not on sideslip > 10°.

## Owed to the owner (FEAT-159; also on the tracker's owed list via the orchestrator)

1. **(a)** With the assist on, a floored mid-corner exit on DRY tarmac below ~25 mph is feathered (β 36° →
   9°). Loose ground, a handbrake flick and the U-turn pass through untouched. Accept [DEFAULT], or have
   the assist stand aside past a steering angle (a full-lock junction pull-out then spins too).
2. **(b)** `taSlip` 0.35 [DEFAULT]. 0–30 keyboard 3.52 s vs 3.48 off; tread −29 % keyboard, −63 % pad,
   −93 % reverse. The table is in the ticket.
3. **(c)** `tcSlip` 0.15 [DEFAULT]. Cautious: a dry launch with TC on is ~33 % slower.
4. **(d)** Drive it on :3282 (Settings → throttle assist / traction control; try a keyboard reverse).
Land after the owner's OK: full `test:all` + smoke first, then hand the orchestrator the exact hash.

## NEXT

1. FEAT-159: the owner's calls above, then land.
2. FEAT-162 "the truck's heart" (failures that strand the truck → "you broke down"): PLAN ONLY.
3. BUG-92 when the owner's USB-pad probe lands.

Probe scripts live in `wip/feat-159/` (git-invisible): `harness.mjs` (the gate's drive() exported),
`probe.mjs`, `drift.mjs`, `held.mjs`, `sweep.mjs`, `cam.mjs`. Small leftover: `PhysicsEngine.replaceHullLocal`
has no src caller (delete with `collider-seam-churn.mjs`'s rework).

FEAT-94 and FEAT-152 are signed off: don't retune them, and never re-add a spark point light. Owner ruling
11-02: no hidden input gestures (double press etc.) — "cheesy".

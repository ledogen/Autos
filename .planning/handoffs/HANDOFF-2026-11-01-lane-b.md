# Handoff — Lane B, 2026-11-04 (FEAT-159 landed; BUG-108 and FEAT-162 wait on owner calls)

**Worktree** `/Users/ledogen/CodeShit/CarGame-machine` · **branch** `feature/machine` · **serve** `:3282`
(if it is down: `npx vite --port 3282 --strictPort` from the worktree). Work ONLY there; own only Lane B's
files. `git merge main` before starting (main's `durTire` is now 16050, owner 11-03: merge before touching
damage.js). Commit WIP on the branch at every working step (`wip(NN): …`). Tracker page:
https://claude.ai/artifact/8P7QDPAaKxKPtJuf6zvRVH (Lane B rows; `lanes/b` handoff + agent name — write
your session name there on every resume). Supersedes the 2026-11-02 version.

## State

- **FEAT-158 rock grip:** landed on main (b2d857ce).
- **FEAT-159 throttle assist + traction control:** landed on main (c92a0d44). Owner: (a)(b) accepted;
  "tc too conservative" → tcSlip 0.35 + tcSlipHi 0.6. Ticket in completed/.
- **BUG-108 hit hitch: MEASURED, waiting on the owner** (page item `bug108-nose`). The work log is in the
  ticket.
  - No frame hitch at any hit.
  - Drums, signs and barricades stay inside the momentum bound.
  - The 0.45 m small crate wedges on the collider's bumperless 48° nose ramp: up to 0.98 m/s in one step.
  - Fix on the table: add the drawn bumper's bottom edge (0.49 m) to the nose hull. Measured as an
    experiment and reverted: halves the crate case, and the approach angle goes 45° → 31°.
  - If go, re-run the census + the affected gates (scrape gates especially) before landing.
  - Probes (git-invisible): `wip/bug-108/census.mjs` (`--lats=`, `--trace=kind,mph,lat`),
    `nose.mjs` (BUMP_Y env, needs the one-line hull hook re-added), `browser-probe.mjs` (needs :3282).
- **FEAT-162 the truck's heart: PLAN parked in the ticket, four owner calls on the page.** Recommended:
  - the vital parts are the heart: the engine seizes at 0, and a written-off wheel collapses onto its hub;
  - one `stranded` predicate in recovery.js;
  - auto-end when stranded and broke (DESIGN.md);
  - the title "You broke down.".

## NEXT

1. BUG-108: the owner's sighting details + nose-fix go/no-go → build and measure.
2. FEAT-162: the owner's four calls → P1 terminal states, P2 stranded + ending, P3 cues.
3. BUG-92 when the owner's USB-pad probe lands.

Small leftover: `PhysicsEngine.replaceHullLocal` has no src caller (delete with `collider-seam-churn.mjs`'s
rework). FEAT-94 and FEAT-152 are signed off: don't retune them, and never re-add a spark point light.
Owner ruling 11-02: no hidden input gestures (double press etc.).

# Handoff — Lane B, 2026-11-05 (compute hold; five items built, waiting to land)

**Worktree** `/Users/ledogen/CodeShit/CarGame-machine` · **branch** `feature/machine` · **serve** `:3282`
— **STOPPED under the orchestrator's compute hold: do not restart it, or run heavy gates / sweeps / CDP,
until the hold is lifted** (the owner is playing on this machine). Light single gates are OK. Work ONLY in
the worktree; own only Lane B's files. `git merge main` before starting. Commit WIP at every working step.
Tracker page: https://claude.ai/artifact/8P7QDPAaKxKPtJuf6zvRVH (Lane B rows; `lanes/b` handoff + agent
name — write your session name there on every resume).

## Built on feature/machine, not landed — the orchestrator lands them as one merge after the hold

1. **FEAT-70 tire cylinder contact** (c9d8fe20 … c24bbbfc). The `src/tire-contact.js` solve runs 3 lines
   across the tread, takes the surface point closest to the axle, and turns the normal radial at edges
   while keeping the surface's tilt along the axle. main.js `queryContacts` uses it; physics.js passes
   each wheel's steered axle.
   - Gate `test/tire-contact.mjs`: kerbs within 1.1 mm of the exact cylinder, and a kerb beside the tire
     lifts nothing.
   - Real roads: p99 2.0 mm against a dense exact cylinder (the old stencil was 66 mm). Probes are in
     `wip/feat-70/`.
   - Cost 1.9× the stencil (397 vs 208 µs a frame for four wheels on a junction pad).
   - The physics fingerprint is UNCHANGED: its ground query is its own single probe, which FEAT-70 does
     not touch.
   - **Owed:** the collision-drop lab on :8000 against :3282 (`node test/collision-drop-lab.mjs <port>
     <cdp>`), the affected gates and cdp-smoke, the ticket's work log, and the PERF-24 note (measured: a
     memo-bounded 0.4 ms a frame on a pad).
2. **Open diff $10** (3180c87d).
3. **No keep/sell prompt at the shop** (ea000e4e): a part swapped out goes straight into the inventory.
4. **FEAT-165** (cf385fba, 386698de, 90949098):
   - Old and Standard tires always on every shelf;
   - Old $8 / Standard $18 `[DEFAULT]` (page item `feat165-price`);
   - "Tire FL · Old tire" on diagnostics.
5. **FEAT-166 clutch-type LSD** (26efa8cc, add05d70, 4f41a2d2). New packs sit between open and helical,
   worn packs ARE the open diff, they wear with slip heat, and the rebuild goes straight to 100 %. Gate
   `test/diff-clutch.mjs`. Owner numbers `[DEFAULT]` are in the ticket.

Landing needs, after the hold (head a8d67a8b; FEAT-70's gate is registered and its work log, with the
four fragile points, is in the ticket):
1. restart :3282;
2. `npm run test:all -- --browser` (or the affected subset, ~89 gates plus cdp-smoke);
3. the collision-drop lab: `node test/collision-drop-lab.mjs 8000 9431` (main) against `… 3282 9432`
   (branch). The DROP numbers stay in family; the collision half should match;
4. hand the orchestrator the exact hash.

## Waiting on the owner

- **BUG-108** (page item `bug108-nose`). The 0.45 m crate wedges on the collider's bumperless 48° nose.
  The fix (add the drawn bumper's 0.49 m edge) is measured and reverted; the probes are in
  `wip/bug-108/`.
- **FEAT-162** (`feat162-calls`). The plan is in the ticket.

## NEXT

FEAT-70's held checks → landing → BUG-108 on go → FEAT-162 on its calls → BUG-92 when the USB probe lands.
FEAT-94 and FEAT-152 are signed off: don't retune them, and never re-add a spark point light. No hidden
input gestures.

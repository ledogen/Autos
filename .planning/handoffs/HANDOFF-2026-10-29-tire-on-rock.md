# Handoff — tire-on-rock physics (BUG-99), Lane B, 2026-10-29

**Worktree** `/Users/ledogen/CodeShit/CarGame-machine` · **branch** `feature/machine` · **serve** `:3282`
(if it is down: `npx vite --port 3282 --strictPort` from the worktree). Work ONLY there; own only Lane B's
files. `git merge main` before starting. The owner tests on :3282 because main moves as other lanes merge.

## The job

Make tire-on-rock physics honest, so the FEAT-93 puncture feels fair and fun. The full brief,
**with the owner's words verbatim**, is `.planning/todos/pending/bug-99-tire-on-rock-physics.md`.
Read it first, all of it.

In one line: popping a tire on a rock at speed should usually flip nothing. Below 30 mph, no pop; past
45, a pop most of the time. It must **fall out of the physics, never from a speed rule.** Fix the
flips first, then the one-frame stutter, then the rocks yeeted at a crawl.

## State

- `feature/machine` is merged to main at 4b5eb7c1 (FEAT-93, FEAT-94, FEAT-152, BUG-98). The full
  suite was 108/110 with only the known reds (road-tunnel, road-clearance).
- The owner has signed off FEAT-94 (flat → rim grind + side panel) and FEAT-152 (sparks): rates,
  sound and sparks are all good. Do not retune them. Never re-add a point light for the sparks
  (tried and removed).
- FEAT-93's own check is effectively this ticket: the owner's verdict is that the pop rate is
  roughly right and the flips are wrong.

## How to work it

1. **Measure before changing anything.** Build a headless rock-strike census: rock sizes × approach
   angles × 10/20/30/40/50 mph on flat ground. Use `test/damage-hazard-puncture.mjs` as the rig to
   lift. Record pop, wheel damage, peak roll angle, rock exit speed, and per-step chassis velocity.
   That table is the baseline and the proof.
2. **Test the leads in the ticket**, the rigid core on the chassis first. Verify each one; the filing
   session only read the code, it did not measure.
3. **Plan mode before the fix.** It touches `src/physics.js` and possibly `src/physics-engine.js` (the
   adapter seam — engine types stay inside it) and the suspension. Bring the owner 2–3 options with
   census numbers and a recommendation. The owner prefers the simplest honest design.
4. **Prove it.** Re-run the census, run `test/fingerprint-physics.mjs` (a change is expected; explain
   it), then `npm run test:all`. Then the owner play-tests on :3282.

## After this

FEAT-132 (the stranded motorist's haul fetch), FEAT-138 hi-lift once the owner gives torque +
cooldown, then the bugs BUG-89, BUG-54, BUG-92 (see HANDOFF-2026-10-24-consolidation-and-alpha-lanes.md
§ Lane B).

Before the owner /clears you: commit, set your task rows on the tracker page
(https://claude.ai/artifact/8P7QDPAaKxKPtJuf6zvRVH), rewrite `lanes/b`'s handoff there.

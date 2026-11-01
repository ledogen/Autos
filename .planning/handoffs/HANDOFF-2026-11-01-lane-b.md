# Handoff — Lane B, 2026-11-01 (BUG-99 merged)

**Worktree** `/Users/ledogen/CodeShit/CarGame-machine` · **branch** `feature/machine` · **serve** `:3282`
(if it is down: `npx vite --port 3282 --strictPort` from the worktree). Work ONLY there; own only Lane B's
files. `git merge main` before starting. Tracker page: https://claude.ai/artifact/8P7QDPAaKxKPtJuf6zvRVH
(Lane B rows; `lanes/b` handoff). Supersedes `HANDOFF-2026-10-30-lane-b.md`.

## State

- **BUG-99 is CLOSED and MERGED to main (1929f16a)** on the owner's OK — "the popping feels fair. And
  natural." Ticket + full work log: `.planning/todos/completed/bug-99-tire-on-rock-physics.md`.
- What shipped since 10-30: punctures pop on the WORK the carcass absorbs past full squash, through a
  leaky integrator (`hazardPinchEnergyJ` 800 J, `hazardPinchTauS` 50 ms — rate, not total, splits a
  tire); and the rock proxy hands the engine the ground's half of a sandwiched rock (`proxyGround`),
  which removed the 20–30 mph pop hump, a hidden flip and rocks thrown at 282 m/s.
- Census (`node test/census-rock-strike.mjs --big`): pops 0 % below 35 mph, then 3/6/23/33/53 % at
  35/40/45/50/55; 0 flips (0.6–1.0× rocks). Physics fingerprint (no debris) identical to main;
  test:all 110/112, the known reds road-tunnel and road-clearance.

## NEXT

1. **FEAT-158 rock grip / crawling** (`.planning/todos/pending/feat-158-rock-grip-crawling.md`) — the
   owner wants it, as its own ticket, without risking what BUG-99 got right. The first attempt is
   parked on `wip/bug99-rock-grip` (48f2c41d): road friction in the proxy + a second tire patch on
   the rock face. It failed because a gripped light rock pivots and the proxy's explicit per-substep
   coupling slingshots it. Start with an IMPLICIT tire–rock–road solve per substep, then re-land the
   parked pieces. The acceptance numbers are in the ticket (crawl baseline: 0/270 climbs).
2. FEAT-132.
3. FEAT-138 hi-lift (APPROVED: 10.5 N·m per kg for up to 3 s, cut at the balance point, 5 s real-time
   cooldown; its shelf likelihood tier is still owed by the owner).
4. BUG-89, BUG-54, BUG-92.
5. FEAT-150.

Small leftovers: an 88 kg (1.3×) rock hit dead-centre at 50 mph rolls the truck (pre-existing; check
the sizes the game spawns); rare ~2× crawl exits on light rocks; `PhysicsEngine.replaceHullLocal` has
no src caller (delete with `collider-seam-churn.mjs`'s rework).

FEAT-94 and FEAT-152 are signed off: don't retune them, and never re-add a spark point light.

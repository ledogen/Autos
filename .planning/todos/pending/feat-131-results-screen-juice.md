---
id: FEAT-131
type: feature
status: open
severity: minor
opened: 2026-10-19
source: owner, 2026-10-19 — "need more juice in the post mission screen and bg music for the rank timer to build suspense"
relates: FEAT-87 (live rank timer — shipped; heartbeat + glass break), FEAT-120 (§ Payout coin and grade stingers — todo)
---

# FEAT-131: Post-mission screen juice + rank-timer suspense music

## Request
The post-mission (results) screen feels flat. Add juice to the reveal, and a background music bed
under the live rank timer that builds suspense as the run approaches/passes each grade threshold.

## Acceptance
- [ ] Rank timer has a music bed (synthesized, like the rest of `src/*-audio.js`) whose tension
      rises toward the next grade cutoff; drops/resolves when a grade is lost or the job ends.
- [ ] Results screen reveal is staged (count-ups, timed stingers per grade) — fold in FEAT-120's
      "Payout coin and grade stingers" item rather than duplicating it.
- [ ] Owner play-test sign-off on feel.

---
id: DEC-002
status: standing
decided: 2026-10-15
area: economy
governs: SM-INV-2, FEAT-29, src/par.js, data/offers.js, par
supersedes:
---

# DEC-002: There is exactly one par, and it comes from the road

**Ruling.** Par never scales with the car: there is exactly ONE par, derived from route geometry, and it never scales with the car or with run age. A loaded job's contract slack (haul × 1.1, freight × (1 + 0.0007·kg)) stretches what the job is held to, not par.

**Why.** If a better build raised par, every upgrade would hand back its own reward and the flywheel stalls; a better car raises payout, not lowers risk.

**Replaces.** The run-duration par clause ("Par MAY scale with run duration", RATIFIED 2026-07-19), retired 2026-07-29/08-01; `parEffective` deleted.

**Source.** DESIGN.md § Invariants, SM-INV-2 (job-contract slack note, owner 2026-10-15; run-duration clause retired 2026-07-29). Owner's words.

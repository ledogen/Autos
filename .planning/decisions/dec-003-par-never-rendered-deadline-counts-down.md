---
id: DEC-003
status: standing
decided: 2026-10-31
area: story
governs: SM-INV-3, FEAT-87, FEAT-113, FEAT-139, FEAT-141, src/rank-timer.js, par, deadline
supersedes:
---

# DEC-003: Par is never shown; the deadline and the next rank line may count down

**Ruling.** Par itself is never rendered as a number or a clock, and timers stay one flavour, never the driver of all missions. The HUD counts down to the job's DEADLINE ("Due in: 2h 05m"), and a courier job may print "finish in x:xx or better for S rank" until its rank bar appears.

**Why.** Putting par on the HUD makes the whole game a time trial; the rank boundaries are par's player-facing surface, shown as proximity, glanceable and peripheral.

**Replaces.** "Never a countdown" for the deadline (2026-10-15 and 2026-10-21 §7 "The HUD deadline is a clock time, never a countdown"), reversed 2026-10-23; "nothing downstream may render them as digits" (FEAT-87 / R-34), reversed 2026-10-31 (Q-6); the never-live rank clause of 2026-08-01, retired 2026-08-17.

**Source.** DESIGN.md § Invariants, SM-INV-3 [RATIFIED as amended 2026-07-16; amendments 2026-08-17, 2026-10-15, 2026-10-23, 2026-10-31]; design-amendments-2026-08-17.md §3; memory project_rulings_2026_10_31 (Q-6). Owner's words.

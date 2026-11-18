---
id: DEC-364
status: draft
decided: 2026-11-17
area: economy
governs: FEAT-184, DEC-360, src/economy.js, src/main.js, src/offer-board.js, dayTier, expeditionGrade, minDay, tutorial, day counter
supersedes: 
---

# DEC-364: The day renumbering moves no economy number

**Ruling.** DEC-360 renumbers the run (tutorial day 0, free will day 1) for the player's eyes only. For the same time since free will opened, every economy output equals the pre-renumbering one: dayTier, expeditionGrade, minDay gates, the fuel-price jitter and the moon phase all read `econDayOf(day) = day - 1` (offer-board's minDay gate reads `floor(clockH / 24)`). New code keyed on the day number takes `econDayOf(daySystem.day())`. This removes the "costs rise one day sooner" side effect DEC-360 flagged; that sentence in DEC-360 no longer holds.

**Why.** A renumbering is not a rebalance; the owner's ask was familiarity ("base one"), not cheaper-sooner or dearer-sooner costs.

**Replaces.** DEC-360's side-effect note (record frozen; this one amends it).

**Source.** Orchestrator brief to lane a, 2026-11-17, from the open question on card tutorial-test-drives. Draft until the owner confirms.

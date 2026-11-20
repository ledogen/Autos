---
id: DEC-459
status: standing
decided: 2026-11-20
area: world
governs: BUG-226, BUG-100, DEC-054, src/main.js, onSeedRejected, _resolveSeed, loading card, refused seed
supersedes: 
---

# DEC-459: A refused seed re-rolls to a seed derived from it, and the loading card says so

**Ruling.** "Yes to both (recommended)" (card choice). The two proposals were: "1) Re-roll to a seed DERIVED from the refused one, so everyone who types 914219767 lands on the same replacement world, every time. 2) Name the swap on the loading card (\"seed 914219767 could not be built: playing 2152877108\")."

**Why.** A typed seed the game refuses (DEC-054) played a different random world on every start, so a shared typed seed did not share a world (DEC-012 held only for the played seed). A derived re-roll restores that; the card line removes the silent swap.

**Replaces.** BUG-100's random re-roll (`_resolveSeed('')`, `Math.random`) for a refused typed seed. DEC-054 (refuse a condemned road) stands; only what replaces the refused seed changes.

**Source.** Owner, card bug226-refused-seed-reroll, answered 2026-11-20. Owner's choice of the option text above.

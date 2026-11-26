---
id: DEC-502
status: standing
decided: 2026-11-25
area: world
governs: BUG-258, BUG-266, src/terrain-height.js, ridgeRoundM, coarseOctaveOffset, ridges, terrain, noise
supersedes: 
---

# DEC-502: Round the natural ridges over 4 m; keep the noise's grain

**Ruling.** The owner, 2026-11-25. On the card `bug258-ridges-b-pick`: "1. Build (B) at 4 m: round the natural ridges over about 4 m". On the card `bug266-straight-ridges-pick`: "2. Build only (B) 4 m (the BUG-258 card): it halves the straight ridges and leaves the layout alone", with the note "real mountains have grain too. i like that artifact of our generation. B does what i need".

So `ridgeRoundM` = 4 becomes the world's default. The per-octave offset and rotation (`coarseOctaveOffset`) is not built: the shared peaks and the grid-aligned grain stay.

**Why.** Measured on 80 paired regions, (B) at 4 m removes the sawtooth skyline and moves the world little (streams +4.7 %, ponds −10 %, roads ±0.2 %). The offset fix moves it more (streams −14 %, ponds +33 %, every spawn) and does not make ridges less straight.

**Replaces.** Nothing. `ridgeSharpness` is untouched.

**Source.** `answered/bug258-ridges-b-pick.answer.json` and `answered/bug266-straight-ridges-pick.answer.json`, 2026-11-26T00:23Z. The owner's words.

---
id: DEC-298
status: standing
decided: 2026-11-16
area: ui
governs: QUAL-36, FEAT-87, src/rank-timer.js, src/main.js _updateRankTimer _promiseRows, src/debug.js, index.html #rank-timer
supersedes: DEC-292
---
# DEC-298: The rank UI is B, all as text; variant A is deleted

**Ruling.** "B: all as text" and "the rank letter was resized previously and doesnt fit nicely in its box next to "rank:" anymore i think the letter should be a little bigger and centered." The DEED / ITEM text rows stay, coloured by how close the reward is to being lost. The scroller bands that carry the deed, the item mark and the minimised "S rank x:xx" timer are gone, along with the "Rank UI" debug dropdown and `?rankui=`.

**Why.** The owner A/B-tested both builds of DEC-292 and picked B. The tile still held the 12 px word size from DEC-180, so the letter sat small and low in its box; it is a 46 px square again with a 34 px letter centred by flex.

**Replaces.** DEC-292's A/B switch (its "neither explains the tip" stands).

**Source.** Owner, owed card rankui-ab, 2026-11-16 07:35 UTC. Owner's words; the file list is the agent's.

---
id: DEC-256
status: standing
decided: 2026-11-15
area: ui
governs: src/camera.js, test/camera-follow-clock.mjs
supersedes: 
---
# DEC-256: Chase camera speed trail keeps updating while the player orbits

**Ruling.** "I think it would be smoother if it changed its follow distance at all times even when you're rotating it". The speed-based follow distance (the lerp's lag) updates continuously during drag / aim / stick orbit, so recentring does not jump.

**Why.** The orbit froze its radius at drag-start, so a speed change showed as a sudden jump on recentre.

**Replaces.** The frozen orbit radius.

**Source.** Owner, 2026-11-15 inbox / owed card. Owner's words.

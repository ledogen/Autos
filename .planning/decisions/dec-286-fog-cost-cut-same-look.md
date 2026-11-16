---
id: DEC-286
status: standing
decided: 2026-11-15
area: perf
governs: FEAT-180, src/sky.js, fog, sky-coloured fog, fog cube
supersedes:
---

# DEC-286: Confirm the fog's GPU cost, then make it cheaper with the same look

**Ruling.** "confirm the suspect, then make it cheaper with the same look (recommended)". The suspect is the
sky-coloured fog (every fogged pixel evaluating the sky's haze and grade itself), thought to carry the rebuild's
~9 % extra GPU work. Confirm it with a paired GPU A/B, then cut its cost without changing what the fog looks like.

**Why.** The lighting rebuild measured +9 % GPU active cycles after landing (FEAT-180 Log, 2026-11-14); the owner keeps
the rebuild's fog look (DEC-196) and wants the cost back.

**Replaces.** Nothing.

**Source.** Card feat180-gpu-cost, 2026-11-15, no note. Owner's words.

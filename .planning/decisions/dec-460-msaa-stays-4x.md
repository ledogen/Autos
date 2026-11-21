---
id: DEC-460
status: standing
decided: 2026-11-20
area: perf
governs: PERF-53, MSAA, anti-aliasing, src/main.js, renderer
supersedes: 
---

# DEC-460: Anti-aliasing stays at MSAA 4x; the 2x build does not land

**Ruling.** "Back to 4x" (card choice, perf53-aa-options). The card's bench: "MSAA 2x saves nothing measurable. GPU active cycles, 4x vs 2x: drive 792 vs 780 Mcyc/s, map 730 vs 743, parked 769 vs 768. All inside the noise band. GPU watts on the drive went UP, 1.90 to 2.48 W."

**Why.** On the Mac, 2x gains no GPU cycles; the extra full-screen copy that 2x needs cancels the two fewer samples. The owner's scope was speed at today's look, and there is no speed to buy.

**Replaces.** Nothing replaces it. Branch land/perf-53-msaa2 does not land; exp/perf-53-noaa never lands. Caveat on the card: Mac GPU at a 60 fps cap only, not the owner's Windows card at 165 fps.

**Source.** Owner, card perf53-aa-options, answered 2026-11-20. Owner's choice.

---
id: DEC-121
status: standing
decided: 2026-11-13
area: economy
governs: FEAT-107, SM-INV-2, src/par.js, rain, par
supersedes:
---

# DEC-121: A wet day prices par with that day's grip

**Ruling.** When rain lands, par is computed with that day's grip (μ). Before rain is built, ask the owner how a mission is handled when the weather changes mid-way; the owner's suggestion is that the weather latches until the mission ends.

**Why.** A safe driver in the wet should be held to what the wet road allows (agent reading of FEAT-107).

**Replaces.** For weather only, "It scales with nothing" (DESIGN.md SM-INV-2). DEC-002 stands otherwise: par never scales with the car or with run age.

**Source.** "Par uses that day's μ." (FEAT-107); the owner chose it in the deep dive INFRA-10-conflicts, 2026-11-13, with the note "When it comes to build rain, ask me about how we handle a mission where the weather changes mid-way. suggestion: weather latches until the mission ends." Agent wording, owner approved 2026-11-13.

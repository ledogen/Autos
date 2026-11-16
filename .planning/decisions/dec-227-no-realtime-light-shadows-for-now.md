---
id: DEC-227
status: standing
decided: 2026-11-15
area: perf
governs: FEAT-226, src/main.js, src/vehicle-model.js, headlights, bay light, light shadows, shadows
supersedes:
---
# DEC-227: No real-time shadows from lights for now; the bay light is ticketed only

**Ruling.** "just ticket the bay light. kill realtime shadows for now"

**Why.** The owner asked for a cost estimate of shadows on lights (the service bay light contained by its walls, and headlight shadows as a High+ option). The estimate: headlight shadows +8 to 30 % GPU at night and no prop shadows without more work; the bay light a few percent. Unmeasured.

**Replaces.** Nothing. The sun's shadows are untouched. FEAT-223 (shadows on the truck itself) is a separate ticket and is not ruled on here.

**Source.** Chat, 2026-11-15. Owner's words.

---
id: DEC-073
status: standing
decided: 2026-09-25
area: perf
governs: BUG-72, src/road.js, pooled geometry
supersedes:
---

# DEC-073: Never setAttribute on pooled geometry

**Ruling.** Never call `setAttribute` (replace a vertex buffer) on pooled geometry.

**Why.** It leaks the old buffer's video memory every reuse (BUG-72).

**Replaces.** Nothing.

**Source.** memory project_bug72_pooled_geometry_vram_leak. Date from the memory note. Agent wording.

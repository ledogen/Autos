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

**Why.** Replacing a vertex buffer on a mesh that is reused leaves the old buffer allocated on the graphics card each time, so video memory grows until the tab dies. That was BUG-72, measured, and the fix is to write into the existing buffer.

**Replaces.** Nothing.

**Source.** memory project_bug72_pooled_geometry_vram_leak. Date from the memory note. Agent wording, owner approved 2026-11-13.

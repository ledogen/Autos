---
id: DEC-115
status: draft
decided: 2026-11-05
area: assets
governs: .planning/research/ASSETS.md, blender, generators
supersedes:
---

# DEC-115: Blender exports run headless, each generator writing into its own checkout

**Ruling.** Every generator exports headless (`blender -b --python-exit-code 1 --python <script>`) and writes into its own checkout; never drive the owner's GUI Blender with a fresh scene.

**Why.** Headless runs are repeatable and can't disturb the owner's open file.

**Replaces.** Nothing yet: this record is a draft until the owner rules.

**Source.** .planning/research/ASSETS.md (2026-11-05); memory EXPANDED.md, project_hero_ranger_asset line. Agent wording.

**Conflict.** A: "Exports run headless" (.planning/research/ASSETS.md (2026-11-05)) · B: "headless blender NEVER exports — use GUI via blender-mcp" (memory EXPANDED.md, project_hero_ranger_asset line)

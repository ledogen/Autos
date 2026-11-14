---
id: DEC-057
status: standing
decided: 2026-08-19
area: world
governs: SM-INV-12, src/save.js, worldgen
supersedes:
---

# DEC-057: Every world is generated cold; no worldgen data in saves

**Ruling.** Every world is generated from scratch at load; a save carries the seed and knobs, never worldgen data.

**Why.** A save that cached the world could disagree with the generator.

**Replaces.** Nothing.

**Source.** memory feedback_cold_generation_only. Date from the memory note. Agent wording, owner approved 2026-11-13.

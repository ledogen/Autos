---
id: DEC-055
status: draft
decided: 2026-10-19
area: world
governs: SM-INV-13, SM-INV-12, src/road.js, region wall
supersedes:
---

# DEC-055: Story mode only prunes or restores roads, never builds them

**Ruling.** The story layer may trim roads (at a region wall) and restore them; it never adds a road the world did not generate.

**Why.** The world stays a pure function of seed and knobs (SM-INV-12).

**Replaces.** Nothing.

**Source.** DESIGN.md SM-INV-13 (amended 2026-10-19). Agent wording.

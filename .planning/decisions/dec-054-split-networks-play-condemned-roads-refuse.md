---
id: DEC-054
status: draft
decided: 2026-08-27
area: world
governs: BUG-100, BUG-85, src/world-validate.js, condemned road
supersedes:
---

# DEC-054: A split network never refuses a seed; a condemned road does

**Ruling.** A road network split into pieces no longer refuses a seed; a road that can't be given a drivable profile (a condemned edge) still refuses it at story entry, failing safe and saying so.

**Why.** "FAIL SAFE AND SAY SO": a road the truck can't drive must not reach the player silently.

**Replaces.** Refusing split networks (retired by BUG-85).

**Source.** completed/bug-100-seed-2881088386-two-condemned-roads.md (owner, 2026-08-27, quoted there). Agent wording.

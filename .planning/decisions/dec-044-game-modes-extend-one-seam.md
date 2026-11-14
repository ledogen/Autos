---
id: DEC-044
status: standing
decided: 2026-07-26
area: repo
governs: FEAT-43, src/main.js, window.__setGameMode, game modes
supersedes:
---

# DEC-044: Game modes fork through window.__setGameMode

**Ruling.** Story and free roam fork through the existing `window.__setGameMode` seam; extend it, never invent a second mode mechanism.

**Why.** One seam keeps every mode-gated restriction in one place.

**Replaces.** Nothing.

**Source.** MILESTONES.md SM-1 ("Extend the existing `window.__setGameMode` seam"); DESIGN.md § Game modes. Owner's words.

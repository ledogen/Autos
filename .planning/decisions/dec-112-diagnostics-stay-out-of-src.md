---
id: DEC-112
status: draft
decided: 2026-06-21
area: repo
governs: CLAUDE.md, src/, test/, diagnostics
supersedes:
---

# DEC-112: No diagnostic plumbing in the running game

**Ruling.** Per-frame probes and one-off bug instrumentation stay out of `src/`; diagnostics run externally against the headless harness in `test/`.

**Why.** `src/` is a shippable, bare-minimum engine.

**Replaces.** Nothing yet: this record is a draft until the owner rules.

**Source.** CLAUDE.md § src/ is the product (2026-06-21); memory feedback_phase_housekeeping (2026-05-28). Agent wording.

**Conflict.** A: "No diagnostic plumbing in the frame loop." (CLAUDE.md § src/ is the product (2026-06-21)) · B: "Debug variable loggers — HUD overlays, console readouts, or any in-game display" (memory feedback_phase_housekeeping (2026-05-28))

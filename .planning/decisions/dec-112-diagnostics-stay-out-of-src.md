---
id: DEC-112
status: standing
decided: 2026-06-21
area: repo
governs: CLAUDE.md, src/, test/, diagnostics
supersedes:
---

# DEC-112: No diagnostic plumbing in the running game

**Ruling.** Per-frame probes and one-off bug instrumentation stay out of `src/`; diagnostics run externally against the headless harness in `test/`.

**Why.** `src/` is a shippable, bare-minimum engine.

**Replaces.** "Debug variable loggers — HUD overlays, console readouts, or any in-game display" (memory feedback_phase_housekeeping (2026-05-28)).

**Source.** CLAUDE.md § src/ is the product (2026-06-21); memory feedback_phase_housekeeping (2026-05-28). Agent wording, owner approved 2026-11-13 under DEC-125.

---
id: DEC-097
status: draft
decided: 2026-07-14
area: process
governs: test/gates.mjs, npm test
supersedes:
---

# DEC-097: No heavy gates for trivial changes

**Ruling.** A slider or tooltip change does not run the heavy gates; `npm test` already runs only the affected ones.

**Why.** Gate time is a shared budget.

**Replaces.** Nothing.

**Source.** memory feedback_no_heavy_gates_for_trivial. Date from the memory note. Agent wording.

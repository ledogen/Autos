---
id: DEC-096
status: draft
decided: 2026-11-07
area: process
governs: test/run-all.mjs, test/cdp-smoke.mjs, CPU
supersedes:
---

# DEC-096: A lane's heavy jobs use at most two processes

**Ruling.** On the shared 10-core Mac a lane's heavy jobs run at most 2 processes (run-all pools 8: use `--serial` / `--only` when lanes are busy).

**Why.** Load 94 once failed main's smoke.

**Replaces.** Nothing.

**Source.** memory feedback_shared_cpu_cap (orchestrator, 2026-11-07). Date from the memory note. Agent wording.

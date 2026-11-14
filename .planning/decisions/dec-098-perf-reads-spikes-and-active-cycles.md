---
id: DEC-098
status: standing
decided: 2026-11-12
area: perf
governs: PERF-40, test/playtest-bench.mjs, test/lib/ioreport.py
supersedes:
---

# DEC-098: Perf A/Bs read spikes, and GPU load by active cycles

**Ruling.** Read per-second spikes (median, p99, worst, share over a threshold), never phase averages alone; compare GPU load by active cycles (busy % × MHz), never by GPU ms or raw watts. A drive that did not stream is invalid.

**Why.** Averages hide the stutter the player feels; watts move with heat.

**Replaces.** Nothing.

**Source.** memory feedback_perf_spikes_not_averages; CLAUDE.md § Diagnostic tools (PERF-40). Date from the memory note. Agent wording, owner approved 2026-11-13.

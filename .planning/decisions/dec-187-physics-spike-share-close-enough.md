---
id: DEC-187
status: standing
decided: 2026-11-14
area: perf
governs: PERF-42, PERF-43, PERF-49, src/road.js, physics spikes, junction carve
supersedes:
---
# DEC-187: The junction physics spikes are left at ~5 %; the per-frame physics budget is the target instead

**Ruling.** "leave it, 5 % is close enough" — and: "i think we're looking at the wrong thing. instead of worrying about the spikes we should be worried about the physics taking 3ms per frame. that feels like a huge budget. i feel like we can get down to 1-2 ms without me perceiving a difference."

**Why.** The pooled spike share is 5.18 ± 2.17 % against a 5 % target, inside its noise band. The whole-frame physics cost is the bigger lever.

**Replaces.** PERF-42's open recommendation to reopen PERF-43's levers 1 and 2; they stay unbuilt.

**Source.** Owner, on the perf42-reopen-carve card, 2026-11-14. Owner's words. The budget question is PERF-49.

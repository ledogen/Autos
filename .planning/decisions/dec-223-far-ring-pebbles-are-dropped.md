---
id: DEC-223
status: standing
decided: 2026-11-14
area: perf
governs: PERF-44, data/flora.js, src/props/prop-system.js, props, scatter
supersedes:
---

# DEC-223: Far-ring pebbles are dropped

**Ruling.** "ship it (farLitter false by default)": the far prop ring (chunks 64 m and more away) gets no pebbles or medium rocks. `scatter.cover.farLitter` stays as the switch, default `false`.

**Why.** The shader already shrinks those rocks to nothing by about 77 m, and they were 17–26 % of the frame's triangles on three seeds. The GPU saving (about 2–3 %) is below this machine's measuring noise, so the call was made on the screenshot sheets.

**Replaces.** Nothing.

**Source.** Owed card `perf44-budget`, answered 2026-11-14.

---
id: DEC-077
status: standing
decided: 2026-07-14
area: repo
governs: vite.config.js, package.json, src/main.js, stack
supersedes:
---

# DEC-077: Three.js + vanilla JS + Vite; the do-not-use list

**Ruling.** Three.js r184 and vanilla JS bundled by Vite, browser only, no backend; no physics engine outside the adapter, no dat.GUI, no global `<script>` Three.js, no Web Workers for physics, no OffscreenCanvas, no Euler angles for body rotation; a fixed-timestep accumulator loop; the `test/*.mjs` gates stay pure-node.

**Why.** Light, installable-free and maintainable by LLM sessions.

**Replaces.** Nothing.

**Source.** CLAUDE.md § Constraints and § Technology Stack (dates from git: 2026-05-10 browser only, 2026-06-24 do-not-use, 2026-07-14 Vite). Owner's words.

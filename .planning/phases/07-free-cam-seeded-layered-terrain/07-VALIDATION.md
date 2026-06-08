---
phase: 07
slug: free-cam-seeded-layered-terrain
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-07
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — RangerSim has no test runner (vanilla JS, no build system). Exit-gate tests run as plain-JS assertion functions executed in the browser console or a tiny `tests/` harness page. |
| **Config file** | none |
| **Quick run command** | open `index.html` (via `npx serve .`), run gate assertions in DevTools console |
| **Full suite command** | same — run P7-1 (seedFor determinism) + P7-2 (height-agreement) assertion blocks |
| **Estimated runtime** | < 5 seconds (pure-function assertions) |

---

## Sampling Rate

- **After every task commit:** Re-run the relevant gate assertion (seed determinism / height-agreement) if the task touched seed or height code
- **After every plan wave:** Run both exit-gate assertion blocks (P7-1, P7-2)
- **Before `/gsd:verify-work`:** P7-1 and P7-2 must both pass; success-criteria 1–5 visually confirmed from free-cam
- **Max feedback latency:** ~10 seconds (manual console run)

---

## Per-Task Verification Map

> Populated by the planner from PLAN.md tasks. Key automated gates:

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (seed) | TBD | TBD | SEED-01/03 | — | N/A | unit (P7-1) | `seedFor(s,tag,x,z)` returns identical stream for identical inputs across calls/reloads | ❌ W0 | ⬜ pending |
| (height) | TBD | TBD | TERR-01/TERR-02 | — | N/A | unit (P7-2) | `sampleHeight(x,z) ≈ bilinear(chunk.heights)*amp` at ≥5 world positions (tol ≤ 1e-3) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] A minimal assertion harness for the two exit gates (P7-1 seedFor determinism, P7-2 height-agreement) — plain JS, no framework install
- [ ] P7-1: `seedFor()` determinism test must pass before any other generator consumes it
- [ ] P7-2: height-agreement test (`sampleHeight == bilinear(chunk.heights) * amp` at ≥5 positions)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Same `?seed=lone-pine` reproduces same terrain to the eye | SEED-01/03 | Visual procedural-terrain equivalence is not unit-assertable | Load `?seed=lone-pine`, refresh, compare; change seed → terrain visibly differs |
| Seed field edit regenerates without full page reload | SEED-02/04 | Requires live DOM + Worker round-trip | Type new seed in debug field, press Enter, confirm terrain rebuilds in place |
| Free-cam decouples from truck; truck idles below | CAM-01/02 | Requires interactive input + visual | Press Shift+C, fly WASD, confirm truck idles on terrain below |
| No camera snap returning chase↔free-cam | CAM-03 | Visual smoothness | Toggle free-cam off, confirm smooth transition, no jump |
| Eastern-Sierra character + fine texture bounces truck; 60fps | TERR-03/04/05/06 | Visual + perceptual + perf | From free-cam observe escarpments/valley floors; drive open ground at speed (suspension unsettles); stats.js holds 60fps |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

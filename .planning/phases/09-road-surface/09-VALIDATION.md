---
phase: 9
slug: road-surface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-11
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vanilla JS browser harnesses (existing pattern: `test/test-road.html`, `test/test-road-seam.html`) |
| **Config file** | none — inline `<script type="module">` assertions in HTML harnesses, console PASS/FAIL output |
| **Quick run command** | open `test/test-road-carve.html` in browser, read console |
| **Full suite command** | open `test/test-road-carve.html` + `test/test-road-mesh.html`; read PASS/FAIL assertions in console |
| **Estimated runtime** | ~5 seconds per harness (manual browser open) |

---

## Sampling Rate

- **After every task commit:** Open the relevant harness, assert console shows PASS
- **After every plan wave:** All harnesses green + in-game drive-on-road check
- **Before `/gsd:verify-work`:** All harnesses green + in-game junction visual check
- **Max feedback latency:** ~10 seconds (browser open + console read)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| W0 harness | — | 0 | (exit gate) | — | N/A | height-agreement + carve-continuity | open `test/test-road-carve.html` | ❌ W0 | ⬜ pending |
| BUG-08 | — | 0 | (stability) | — | N/A | window-invariance assertion | open `test/test-road-carve.html` | ❌ W0 | ⬜ pending |
| SURF-05 | — | 1 | SURF-05 | — | N/A | carve-continuity (no vertical step) | open `test/test-road-carve.html` | ❌ W0 | ⬜ pending |
| SURF-04 | — | 1 | SURF-04 | — | N/A | height-agreement on-road | open `test/test-road-carve.html` | ❌ W0 | ⬜ pending |
| SURF-01 | — | 2 | SURF-01 | — | N/A | smoke (mesh appears) | open `test/test-road-mesh.html` | ❌ W0 | ⬜ pending |
| SURF-03 | — | 2 | SURF-03 | — | N/A | unit (crown/camber normal check) | open `test/test-road-carve.html` | ❌ W0 | ⬜ pending |
| SURF-07 | — | 3 | SURF-07 | — | N/A | smoke (junction render) + unit (footprint poly) | open `test/test-road-mesh.html` | ❌ W0 | ⬜ pending |
| SURF-02 | — | 4 | SURF-02 | — | N/A | smoke visual (asphalt colors) | open `test/test-road-mesh.html` | ❌ W0 | ⬜ pending |
| SURF-06 | — | 4 | SURF-06 | — | N/A | manual inspection (in-game jolts) | in-game | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Plan/Wave columns are finalized by the planner; this map reflects the research-recommended wave structure.*

---

## Wave 0 Requirements

- [ ] `test/test-road-carve.html` — **EXIT GATE.** Height-agreement test (carveBlend result identical in `_flushPendingQueue` vertex write and `sampleHeight`/`analyticHeight` return, including on-road positions) + carve-continuity test (`sampleHeight` stepped across the carve boundary shows no vertical step discontinuity; steep-but-continuous cut faces ALLOWED, only degenerate vertical seams disallowed) + window-invariance assertion for BUG-08 (same world-coordinate road geometry across shifted streaming windows).
- [ ] `test/test-road-mesh.html` — smoke harness: ribbon mesh appears, asphalt vertex colors visible, junction footprint rendered without z-fighting.
- [ ] Framework install: none needed — reuse the existing browser-harness pattern (`test/test-road.html`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Truck rides on road surface (no float/sink) | SURF-04 | Requires live physics + suspension response in-browser | Drive onto a road in-game; confirm contact probes sit on the visible mesh |
| Camber banks toward inside of curve | SURF-03 | Visual confirmation of bank direction on real curves | Drive a curved road section; confirm surface tilts inside-low (verified on geometry, not body-roll) |
| Pothole/crack micro-jolts (stretch) | SURF-06 | Felt response, no automatable assertion | Drive slowly on a low-quality road stretch; feel vertical jolts |
| Junction stable while flying past | SURF-07 | Re-stream pop is a visual/temporal artifact | Fly past a junction at speed; confirm no pop/rebuild |

---

## Validation Sign-Off

- [ ] All tasks have a harness assertion or Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated/harness verify
- [ ] Wave 0 covers all MISSING references (both harnesses built first)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner finalizes per-task map)

**Approval:** pending

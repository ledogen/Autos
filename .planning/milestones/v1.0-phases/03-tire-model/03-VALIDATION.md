---
phase: 3
slug: tire-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-29
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — browser-only project, no test runner |
| **Config file** | None — Wave 0 gap |
| **Quick run command** | Open `index.html` via HTTP server; observe visually |
| **Full suite command** | Same — no automated test suite exists |
| **Estimated runtime** | ~2 minutes per manual smoke pass |

---

## Sampling Rate

- **After every task commit:** Open in browser, confirm no NaN/explosion/freeze
- **After every plan wave:** Full manual smoke per checklist below
- **Before `/gsd-verify-work`:** All 10 manual-smoke behaviors verified
- **Max feedback latency:** 2 minutes (browser open + drive test)

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| M3-01 | wheelOmega[i] changes when throttle applied from rest | manual-smoke | Console: `vehicleState.wheelOmega` while throttling | ❌ Wave 0 | ⬜ pending |
| M3-02 | slipRatio ≈ 0 at free-rolling, ≈ 1 at full wheelspin | manual-smoke | Console: `vehicleState.wheelDebug[i]` | ❌ Wave 0 | ⬜ pending |
| M3-03 | Front wheels exhibit slip angle during cornering (HUD shows > 0°) | manual-smoke | Visual — HUD slip indicator | ❌ Wave 0 | ⬜ pending |
| M3-04 | Rear wheelspin under full throttle from standstill | manual-smoke | Visual — wheel RPM diverges in HUD | ❌ Wave 0 | ⬜ pending |
| M3-05 | Friction circle prevents total force exceeding μ·Fz | manual-smoke | Console: compare Flat²+Flong² vs (μ·Fn)² | ❌ Wave 0 | ⬜ pending |
| M3-06 | Space key initiates and sustains drift on rear axle | manual-smoke | Visual — oversteer develops, controllable | ❌ Wave 0 | ⬜ pending |
| M3-07 | Slip angle HUD changes color green→orange→red during cornering | manual-smoke | Visual | ❌ Wave 0 | ⬜ pending |
| M3-08 | THR/BRK readout responds to W/S keys | manual-smoke | Visual | ❌ Wave 0 | ⬜ pending |
| M3-09 | Pacejka curve plot visible, dot moves when cornering | manual-smoke | Visual — backtick open, corner car | ❌ Wave 0 | ⬜ pending |
| M3-10 | Changing B/C/D sliders produces different drift feel | manual-smoke | Open debug, change sliders, drive | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- None that block implementation — no new test infrastructure needed
- All validation is manual observation per the 5 success criteria in ROADMAP.md

*Existing HTTP server (VS Code Live Server or `npx serve .`) covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rear wheelspin visible | M3-01, M3-04 | Real-time physics sim, no test harness | Floor throttle from rest; watch wheel RPM HUD diverge from speed |
| Handbrake drift | M3-06 | Continuous physical feel | Hold Space in corner; confirm rear slip, no spin-out |
| Slip angle HUD color | M3-07 | Visual color threshold | Increase cornering speed; confirm green→orange→red |
| Pacejka curve plot | M3-09 | Canvas rendering | Backtick open; corner car; confirm dot moves along curve |
| Friction circle coupling | M3-05 | Physics observable only at limit | Hard throttle + steer; confirm no explosive lateral force |

---

## Validation Sign-Off

- [ ] All 10 requirements have manual-smoke verify instructions
- [ ] No test framework needed — pure observational validation
- [ ] Wave 0 gap: none (no infrastructure blocked)
- [ ] All ROADMAP success criteria (1-5) covered by manual verifications above
- [ ] `nyquist_compliant: true` set in frontmatter when all manual checks pass

**Approval:** pending

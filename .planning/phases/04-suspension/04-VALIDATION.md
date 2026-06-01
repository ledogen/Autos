---
phase: 4
slug: suspension
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-31
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Scenario-driven playback (data/scenarios/*.json replayed via in-game scenario runner — same harness used since Phase 2) |
| **Config file** | none — scenarios are JSON files in `scenarios/` |
| **Quick run command** | Manual: open `index.html`, load scenario, observe HUD assertions logged to console |
| **Full suite command** | Manual: replay all `m4-*` scenarios in sequence |
| **Estimated runtime** | ~5 seconds per scenario, ~30 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Replay any scenario whose assertions intersect the task's `files_modified`
- **After every plan wave:** Replay all `m4-*` scenarios end-to-end
- **Before `/gsd-verify-work`:** Full `m4-*` suite must pass console-asserted checks
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-XX | 01 | 1 | M4-01..M4-04 | — | N/A | scenario | replay `scenarios/m4-04-static-vs-braking.json` | ❌ W0 | ⬜ pending |
| 04-01-XX | 01 | 1 | M4-02 | — | N/A | scenario | replay `scenarios/m4-02-asymmetric-bump.json` | ❌ W0 | ⬜ pending |
| 04-01-XX | 01 | 1 | M4-05 | — | airborne wheel contributes zero Pacejka force | scenario | replay `scenarios/m4-05-wheel-lift-ramp.json` | ❌ W0 | ⬜ pending |
| 04-01-XX | 01 | 1 | M4-06 | — | N/A | scenario | replay `scenarios/m4-06-bump-response.json` | ❌ W0 | ⬜ pending |
| 04-02-XX | 02 | 2 | M4-08, M4-09 | — | N/A | manual | open debug panel, adjust sliders, observe Fz live | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scenarios/m4-02-asymmetric-bump.json` — drive over a one-sided bump; assert opposite-corner Fz transient bounded, no NaN
- [ ] `scenarios/m4-04-static-vs-braking.json` — static load distribution then 0.8g brake; assert front Fz rises, rear Fz falls, total Fz ≈ m·g
- [ ] `scenarios/m4-05-wheel-lift-ramp.json` — drive one wheel up a curb; assert that wheel's Pacejka Fx/Fy go to 0 when tireFz ≤ 0
- [ ] `scenarios/m4-06-bump-response.json` — single bump; assert hub oscillation damped within 1.5s (ζ≈0.4 target)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visible nose-dip on braking | M4-01 (success criterion #1) | Visual, requires human judgment | Brake hard from 30 m/s, observe body pitch on chase cam |
| Visible body roll in corner | M4-07 (success criterion #1) | Visual, requires human judgment | Sustain 0.6g cornering, observe outward body roll |
| Sliders change feel live | M4-09 (success criterion #5) | Subjective driving feel | Drive while moving `suspensionStiffnessFront` slider 0.5× to 2× |
| Per-wheel Fz visible in debug HUD | M4-08 (success criterion #3) | UI inspection | Open debug panel, accelerate/brake/turn, watch four Fz values change |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (scenario replay) or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without scenario assertion
- [ ] Wave 0 covers all MISSING scenario references (4 new `m4-*` JSON files)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 scenarios exist and pass

**Approval:** pending

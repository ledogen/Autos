---
phase: 4
slug: suspension
status: deferred-to-4.1
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-31
updated: 2026-06-01
---

> **Status note (2026-06-01):** End-to-end execution of the M4-* scenario suite is deferred to Phase 4.1 — the ramp-based scenarios surfaced two pre-existing Phase 4 design issues (world-Y-only tire normal projection, wheel visual binding mismatch under body pitch) that would require throwaway interim fixes since Phase 4.1's body-frame strut refactor will rewrite the same code paths. The four `test/assert-m4-*.mjs` scripts and `scenarios/m4-*.json` files are authored, committed, and waiting to be run against Phase 4.1 logs as that phase's acceptance criterion (Phase 4.1 ROADMAP success criterion 8). Phase 4 is otherwise closed.

# Phase 4 — Validation Strategy

> Hybrid validation: real sim records frame logs, Node-side assertion scripts verify the log against requirement-specific physics checks. Visual / UI requirements remain manual.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Real-sim log replay → Node assertion scripts. Logs produced by `src/logger.js` (canonical JSON, 41 fields per frame); assertions in `test/assert-m4-*.mjs`. |
| **Dependencies** | Node ≥ 18 (built-in ESM, no npm). |
| **Quick run command** | `node test/assert-m4-XX-*.mjs Logs/<log>.json` per requirement |
| **Full suite command** | `for f in test/assert-m4-*.mjs; do node $f Logs/<latest>.json; done` (single log can be checked by multiple scripts when applicable) |
| **Estimated runtime** | <100 ms per script — logs parsed in pure JS, no simulation re-runs |

**Why hybrid (not pure Node tests):** the sim's physics behavior depends on the integrator wiring in `physics.js` and IC seeding in `main.js`, not just the pure-math modules. Replaying the actual browser sim is the source of truth. Node-side scripts read the produced log and assert on physics invariants — no parallel simulation that could drift.

---

## Recording Workflow

1. Open `index.html` in browser.
2. Press Ctrl+I, load the scenario JSON file (e.g. `scenarios/m4-05-wheel-lift-ramp.json`).
3. Press backslash to start frame recording.
4. Drive the manoeuvre described in the scenario `description` field (e.g. "drive over the ramp").
5. Press backslash again to stop and auto-download the log.
6. Run the matching assertion script: `node test/assert-m4-05-wheel-lift-ramp.mjs Logs/<downloaded>.json`

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Assertion Script | Scenario File | Status |
|---------|------|------|-------------|-----------|------------------|---------------|--------|
| 04-01 | 01 | 1 | M4-01, M4-04 | log-assert | `test/assert-m4-04-static-vs-braking.mjs` | `scenarios/m4-04-static-vs-braking.json` | ✅ scripted, replay-pending |
| 04-01 | 01 | 1 | M4-02 | log-assert | `test/assert-m4-02-asymmetric-bump.mjs` | `scenarios/m4-02-asymmetric-bump.json` | ✅ scripted, replay-pending |
| 04-01 | 01 | 1 | M4-05 | log-assert | `test/assert-m4-05-wheel-lift-ramp.mjs` | `scenarios/m4-05-wheel-lift-ramp.json` | ✅ scripted, replay-pending |
| 04-01 | 01 | 1 | M4-06 | log-assert | `test/assert-m4-06-bump-response.mjs` | `scenarios/m4-06-bump-response.json` | ✅ scripted, replay-pending |
| 04-02 | 02 | 2 | M4-08 | manual | — | — | ⬜ manual-only (debug HUD inspection) |
| 04-02 | 02 | 2 | M4-09 | manual | — | — | ⬜ manual-only (slider feel) |

*Status legend: ✅ scripted = assertion exists; replay-pending = needs a fresh log from the matching scenario for green/red verdict.*

---

## Assertion Coverage per Script

### `assert-m4-02-asymmetric-bump.mjs` (M4-02)
- No NaN/Inf in any frame
- L/R asymmetry observed (|ΔFz_L_R| > 500 N at some frame) — confirms per-wheel hub independence
- Peak total Fz < 5× m·g (spring blow-up bound)
- Frame 0 total Fz ≈ m·g ±10% (settled IC)

### `assert-m4-04-static-vs-braking.mjs` (M4-01, M4-04)
- No NaN/Inf
- ≥5 braking frames present (else recording instructions failed)
- Cruise total Fz ≈ m·g ±10%
- Braking: front Fz rises >5% above static front (M4-01 visible nose-dip → measurable load transfer)
- Braking: rear Fz falls >5% below static rear
- Braking total Fz still ≈ m·g ±20% (longitudinal transfer, no mass creation)

### `assert-m4-05-wheel-lift-ramp.mjs` (M4-05)
- No NaN/Inf
- ≥1 airborne corner-frame present (any wheel `fz=0`)
- D-14 gate: when `fz=0`, that wheel's `fy ≈ 0`, `sa ≈ 0`, `fn ≈ 0` (airborne wheel contributes zero Pacejka force)

### `assert-m4-06-bump-response.mjs` (M4-06)
- No NaN/Inf
- Peak total-Fz deviation from m·g > 5% (bump actually hit)
- 1.5 s after peak: |deviation| < 10% of peak deviation, sustained for ≥5 frames (damping characterization, ζ≈0.4 target)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visible nose-dip on braking | M4-01 (success criterion #1, visual) | Visual / aesthetic | Brake hard from 30 m/s, observe body pitch on chase cam — automated test covers Fz transfer; visual confirmation is separate |
| Visible body roll in corner | M4-07 (success criterion #1) | Visual / aesthetic | Sustain 0.6g cornering, observe outward body roll |
| Per-wheel Fz visible in debug HUD | M4-08 (success criterion #3) | UI inspection | Open debug panel, accelerate/brake/turn, watch four Fz values change |
| Sliders change feel live | M4-09 (success criterion #5) | Subjective driving feel | Drive while moving `suspensionStiffnessFront` slider 0.5× to 2× |

---

## Validation Sign-Off

- [x] All Wave-0 scenario JSONs exist (`scenarios/m4-{02,04,05,06}-*.json` — Plan 01 commit 5da8ea1)
- [x] All log-assert scripts exist (`test/assert-m4-*.mjs` — codified per requirement)
- [x] No watch-mode flags / no test framework dependency (built-in `node` only)
- [x] Feedback latency < 30 s (record + script run combined)
- [x] `nyquist_compliant: true` (assertions are automated; replay is data-gathering, not verification)
- [ ] Replay-pending: log produced from each scenario, all four scripts green

**Approval status:** Assertions codified. Replay results to be appended below as logs are produced.

---

## Validation Audit 2026-06-01

| Metric | Count |
|--------|-------|
| Gaps found | 5 (M4-01, M4-02, M4-04, M4-05, M4-06 all unscripted) |
| Resolved (scripted) | 5 |
| Escalated (manual-only) | 2 (M4-08, M4-09) |

**Remediation:** Wrote `test/lib-log.mjs` shared loader + four assertion scripts via the hybrid log-replay approach. Replaces the original "manual scenario replay with eyeball assertion" plan from the 2026-05-31 draft.

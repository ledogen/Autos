---
id: PERF-09
type: perf
status: closed-invalid
severity: none
created: 2026-07-13
closed: 2026-07-13
---

# ~~Failed worker routes re-dispatch loop~~ — INVALID: no loop; measured "idle grind" was the cold-load warm tail

## Resolution (closed same day, disproven by direct measurement)

The PERF-08 Phase-2 idle traces showed the 4 road-worker threads ~58–65 % busy at idle and this
ticket hypothesized a failed-route re-dispatch loop (`ingestRoutedConnections` skips `!prims`
without negative-caching; `_warmScan` gates on `.has()`).

**Both legs of the hypothesis failed under scrutiny:**

1. `arcPrimitiveConnect` NEVER returns null — corridor-disc walls trigger the QUAL-14 escape
   hatch (retry without discs), and an uncaptured goal falls back to closest-expanded-node +
   straight stub. The `if (!prims) continue` branch in `ingestRoutedConnections` is unreachable
   from the worker (kept as a defensive guard).
2. Direct probe (`window.__road()` dispatch-counter wrap, 60 s idle at Normal, seed 6): dispatches
   stop at 227 by t≈15 s, `_pendingRoutes` drains to 0 by t≈25 s, `_lastWarmCenter` is set, no key
   is ever dispatched more than twice. The warm system converges and the pool goes fully quiet.

**What the traces actually measured:** the cold-load warm tail. The spawn-band warm + movement
prewarm legitimately route ~227 jobs over the first ~25 s after load; the profile harness's
30 s idle trace window began ~10 s after navigation, so ~17 s of tail overlapped ~30 s of window
≈ the observed ~57 % busy. Scenario runs that started later in the timeline (Low/High presets,
drive) showed proportionally lower worker busy — same tail, later window.

## Follow-ups

- Harness: idle scenario needs a warm-drain wait (`__road().pending === 0 && lastWarm`) before
  opening the measurement window — else worker-busy numbers measure load, not steady state.
  (Fixed in test/profile.mjs alongside this closure.)
- `.planning/perf/FINDINGS.md` corrected: true steady-state idle has workers ~0 % busy; the
  thermal budget at steady state is renderer main (~18–30 %) + GPU.
- The `window.__road()` probe stays in the ?prof=1 block — useful for any future routing-churn
  question.
- Optional future nicety (not scheduled): the ~25 s × ~3 cores post-load warm tail is real
  one-time thermal cost; PREWARM_MARGIN scope could shrink it if it ever matters.

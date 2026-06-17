---
id: QUAL-03
type: quality
severity: major
status: open
opened: 2026-06-15
source: scribe-session
tags: [refactor, tech-debt, architecture, road]
---

# QUAL-03: Road system is too large/complex — re-architect around a constrained-spline + swept-cross-section model

## Concern

`src/road.js` is over **3× the size of the next-largest module** (~2k LOC) and has become hard to
build on and hard to fit in context. The intent of a road system is conceptually simple; the current
implementation has accreted "band-aids on band-aids," especially around forcing a spline solution when
the terrain offers no clean way out of a deep valley.

## Desired mental model (user's framing — this is the target architecture)

A road is two cleanly-separated concerns:

1. **Centerline = a robust meandering-spline generator** constrained by a small set of criteria that
   define the road's behavior/personality, primarily:
   - **max grade** (longitudinal steepness limit)
   - **min radius** (tightest allowed corner)
   The generator draws a smooth, drivable centerline that *respects* these limits rather than producing
   sharp kinks/loops that later passes have to excise.

2. **Surface = sweep a cross-section arc (road camber) along the centerline**, with **superelevation
   (banking) into corners**. Critically: **back-to-back alternating corner directions must be handled
   naturally** — the bank transitions smoothly through the inflection between a left and a right corner
   **without discontinuities** (C1/C2 continuity of the bank/normal along the sweep). This should fall
   out of the formulation, not require special-case patching.

## Suspected root of the bloat

- Much of the complexity is **brute-forcing the centerline** when terrain gives no obvious valley exit
  (deep-valley "get out" problem), then layering corrective passes (loop removal, self-crossing
  excision, turn-angle limiting, smoothing, re-pointing viz, per-tile grade smoothing...) on top.
- The hypothesis: a **smarter up-front formulation** — generate a centerline that is grade/radius-valid
  *by construction* — removes the need for most of the corrective passes, collapsing the line count.

## Goal

- Substantially **reduce `road.js` size** and make it maintainable / context-friendly for future LLM
  sessions to build on.
- Same or better road quality (smooth, drivable, no loops/kinks/banding) with far less code.

## Open questions for the design pass (flesh out before any rewrite)

- Is the "by-construction valid centerline" approach achievable given the deterministic, chunk-streamed,
  seed-driven terrain (router must use pure `coarseHeight`, never chunk-load-order-dependent sampling)?
- How does the valley-exit case get solved cleanly (switchbacks where grade forces them) without the
  current brute-force search? Is this where most of the 2k lines actually live?
- Does the decal-ribbon-on-top + terrain-carved-below pivot (current Phase 9 direction) coexist with a
  swept-cross-section camber model, or does it replace part of it?

## Architectural insight (scribe assessment — validates the user's framing)

The user's mental model is not a simplification — it is **how production road/track systems are
actually built**, and the path to the line-count reduction:

- **Valid-by-construction centerline.** Bake the max-grade and min-radius limits into the *generation*
  step so the generator is structurally incapable of emitting an invalid centerline (no sharp kinks,
  loops, or over-steep grades to fix afterward).
- **Swept cross-section + curvature-driven superelevation.** Extrude the camber profile along the
  spline; make **bank angle a continuous function of local curvature**. Then the "back-to-back
  alternating corners with no discontinuity" requirement **falls out for free**: where curvature
  passes through zero (the inflection between a left and a right corner) the bank is naturally flat —
  no special-casing needed. Continuity of the road normal/bank is guaranteed by deriving it from a
  continuous curvature signal.
- **Why this collapses the line count.** Most of the current corrective passes — `_removeLoops`,
  `_removeSelfCrossings`, turn-angle limiting (`_limitTurnAngle`/`roadMaxTurnDeg`), per-tile grade
  smoothing, viz re-pointing — exist **only to clean up a centerline that was allowed to be invalid
  in the first place**. If the generator cannot produce an invalid centerline, that entire corrective
  layer disappears. This is the most likely home of a large fraction of the ~2k lines.

### Honest caveat (don't over-promise the LOC reduction)

- The **valley-exit / switchback case is the genuinely hard part**. "Valid by construction" when the
  terrain traps the route in a deep valley may *still* require real search/optimization to find a
  grade-legal way out — that could legitimately be a few hundred lines no matter how clean the design.
- The key diagnostic question for the rewrite: is that search **isolated** (one well-bounded module
  you can reason about) or **tangled** through the whole file? The win is isolating it, not pretending
  it vanishes.
- No concrete LOC target should be committed until `road.js` is actually read — this assessment is
  from the design discussion, not a code audit.

## ⚠️ Coordination note

The coding agent is **actively in Phase 9 (Road Surface)** right now — this is a *forward-looking
re-architecture*, NOT an interrupt. Reconcile against in-flight Phase 9 work (decal pivot, BUG-14,
continuous-profile design) before acting; likely a post-Phase-9 milestone item. Captured via scribe
session — promote/plan deliberately, don't let it collide with active road work.

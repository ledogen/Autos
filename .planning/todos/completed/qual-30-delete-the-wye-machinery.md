---
id: QUAL-30
type: quality
status: completed
severity: medium
---

# QUAL-30 — delete the wye machinery FEAT-76 retired

## RESOLUTION — closed 2026-09-06

**1 415 lines out of `src/road.js`** (10 062 lines remain), across four commits with gates green
between each. `npm run test:all` on the result: **67 of 68 gates green**, failing only
`junction-stitch`, which is BUG-56's own bar and has been red throughout. `mission-network` went
GREEN in the process — its stale section-0 cull control now reads zero, so it leaves the standing-red
list after all, contrary to what the BUG-41 handoff expected.

| stage | deleted |
|---|---|
| the registrars — `_v2RegisterMerged`, `_v2RegisterMidSpan`, `_v2DepartureHold`, `_v2WinCamber`, `_v2WinnerView` | 821 |
| `_v2BundleSolve` + the `bundle` parameter, guards and branch it fed | 215 |
| `_v2BuildTaper` + `TAPER_LADDER` / `RFLOOR` / `RFLOOR_MIN` and the band fields on every variant | 215 |
| `cededSpans` / `departureSpans` as concepts, incl. `_applyDepartureCamber` | 220 |

### The design question the ticket gated on: answered YES

Disjoint pairs (BUG-55 shape E) route through the T promotion. `_v2PromoteMidSpan` never reads a
shared node — it works off `spec.winner` and the variants' `wIn`/`wOut`/`lIn`/`lOut` — and a disjoint
spec is already that shape. Verified on seed 6 at r2400, the one case in the battery where
`_v2DisjointFor` actually fires: byte-identical geometry. Both pairs decline to promote exactly as
they declined to register, so that class resolves nothing either way — but through one path now.

### THE FINDING: the machinery was not dead, and the ticket's premise was wrong

`_v2RegisterMerged` and `_v2RegisterMidSpan` had no live builder call, which is why this ticket
recorded them as dead. They were still being **dry-run by `_v2CededExtents`** to discover how far a
merge's taper band would reach — and that answer steers `_v2ShoveFor` and `_v2PairCensus`. Dead as
builders, **alive as an oracle**. So the deletion could not be geometry-neutral, and was not.

The sanction is computed purely now: the spec's fork arc plus the widest departure blend any rung can
choose. Deliberately conservative, and deliberately NOT the promotion probe, which swaps
`this._network` while `_v2ShoveFor` and `_v2PairCensus` call into this during assembly.

Net effect across the battery: seeds 6, 20 and 3 byte-identical; seeds 7 and 67 gain Ts (5→7, 10→11)
and lose shoves; seed 11 nets 9 Ts where it had 9 before, having gone 11 and back. **More real
intersections, less deflection.** Sharing census unchanged at 8 pairs / 447 m / 0.2% of network.

`_v2BundleSolve` was the same shape of problem and worse: it was still bending through roads so the
fork DECKS its losers pinned to would agree, for forks that no longer exist — against FEAT-76's own
ruling that the through road does not move. It was overriding 2 to 7 winner profiles per seed.
Removing it left topology untouched on every seed and moved only those profiles.

### Two traps, recorded so they are not repeated

- **`band.joinCum` is not `lCut`.** Two guards read the band's join, which sits PAST the fork.
  Re-expressing them on the bare fork made the tangle guard stricter, it rejected forks the band join
  had cleared, and the pairs it dropped ran unsanctioned: 66 sample pairs under 9.5 m, worst 0.7 m,
  `graph-topology` GRAPH-CORRIDOR-CLEARANCE red at seed 6 (4060,2268). The right extent is fork plus
  departure blend — the same reach the sanction uses, for the same reason.
- **Cutting a block by its comment boundary took a declaration with it.** Excising the resolver's
  ceded block removed `const latDist = Math.abs(pr.signedLat)`, which belonged to the code *after* it.
  Network geometry stayed byte-identical, so only the carve gates saw it — `carve-mesh-smoothness`,
  `road-smoothness`, `shoulder-lateral-continuity`, `graph-topology`.

### Corrections to this ticket's own inventory

- **`offCurveSpans` STAYS.** FEAT-76 listed it for deletion; that was wrong twice over.
  `_v2RegisterShoved` owns it for the BUG-57 shove rung independently, and the T's departure blend
  needs it for the same honest reason — points off the primitive.
- **`_v2CededExtents` survived**, rewritten. It was not on the delete list and should not have been.

### `wye-release` rewritten, not deleted

Its gating subject stopped existing, so it would have passed vacuously on an empty set. It now gates
the T's descendant question — departure clearance — and reports what the original reported.
Measured: 60 departures across the battery, every one clearing one road width 12–20 m from its node,
median 16. It fails outright if it finds no departures, so it cannot go vacuous again.

The residual it reports is FEAT-76's known residue: 5 samples where a departure still overlaps its
trunk with a deck step the ground cannot slope, worst 1.83 m at seed 11 (−1426,692). BUG-56 ladder
work, not this ticket.

### Also closed by this

The adjacent bug FEAT-76 recorded and deliberately left — **wye departures not drawing on the map
view** — goes with `cededSpans`, exactly as predicted. `map2d.js`'s `_surfaceSlices` no longer
subtracts anything from the drawn polyline.

---
# QUAL-30 — delete the wye machinery FEAT-76 retired

FEAT-76 shipped the T promotion and closed on it. **The deletion it also called for did not land**, and
this is where it lives now rather than being lost at close. The owner's reason for opening FEAT-76 was
half shape and half maintenance:

> i just want them promoted to real intersections so we don't have to maintain this weird wye specific
> intersection machinery and can just do "new leg departs from old road, blend and ship"

The shape half is done. The machinery is still in the file, and it is now **dead in the live path** —
`_assembleGraphEdges` registers a merge loser plain and hands it to `_v2PromoteTs`; nothing calls
`_v2RegisterMerged` to build geometry any more. Dead code in `src/` is against the project's own
convention ("A retired approach gets deleted, not parked"), so this is a real ticket, not tidying.

## What is dead, and what is only nearly dead

| Method | Line (at close) | Status |
|---|---|---|
| `_v2RegisterMerged` | 5059 | dead in the live path; still called `dry` from `_v2DisjointFor` and `_v2BundleSolve` |
| `_v2BuildTaper` | 3328 | live only as the band-sizing step inside `_v2NodeMerges.tryFrac` and `_v2MidSpanPair` — the T ignores the band it produces |
| `_v2DepartureHold` | 5008 | dead — a T has no hold |
| `_v2WinCamber` | 4991 | dead (`_v2CamAtArc` is still used by the T's seam test — keep that one) |
| `_v2BundleSolve` / `_v2WinnerView` | 4516 / 4684 | exist to negotiate fork DECKS across a bundle of merges; a T has no fork deck |
| `_v2RegisterMidSpan` | 4745 | still live for disjoint (shape E) pairs |
| `cededSpans`, `departureSpans` | — | delete the concept, including from `exportNetwork`/`adoptNetwork` |
| `offCurveSpans` | — | **KEEP.** `_v2RegisterShoved` owns it independently for the BUG-57 shove rung, and the T's departure blend uses it for the same honest reason (points off the primitive). FEAT-76's ticket listed it for deletion; that was wrong. |

Inside `_v2NodeMerges`: `TAPER_LADDER`, `RFLOOR`, `RFLOOR_MIN` and the per-band variant loop all go.
`FORKWIN` stays (it windows the abreast search). `tryFrac` should push ONE variant per fraction
carrying `{wCut, lCut, forkPt, region}`; the `ownLeft` and tangled-span guards currently read
`band.joinCum` and want `lCut` instead. `_v2MidSpanPair` is the same edit with two forks.

## The one design question to settle first

`_v2DisjointFor` (BUG-55 shape E — two runs that share NO node yet carve the same dirt) resolves via
`_v2MidSpanPair` + `_v2RegisterMidSpan`. Its spec shape is already the one `_v2PromoteMidSpan` consumes,
and mid-span promotion does not need a shared node — so **routing disjoint pairs through the promotion
should just work**, at which point `_v2RegisterMidSpan` and `_v2RegisterMerged` both go. Verify that
before deleting either. The census measures 0-2 disjoint pairs per seed at 1400 m, so the class is thin
and easy to check but also easy to break silently.

## Gates that read the retired fields

Rewrite rather than delete: `wye-release` (its whole subject — the ceded strand's release distance —
stops existing; what should survive is R8 itself, "two roads may not carry independent decks within one
road width"), `crossing-census`, `crossing-rung-parity`, `overlap-census`, `capture-classify`,
`network-worker-parity` (field list), `test/taper-band-census.mjs` (its header still says "taper band"
where it now measures T departure blends).

Consumers that lose a special case: `map2d.js:1732` (`_surfaceSlices` subtracts ceded spans to stop
double ink) and `poi.js:849` (skips POIs on ceded stretches). The adjacent map-render bug FEAT-76 noted
— wye departures not drawing on the map view — should disappear with `cededSpans`; confirm it does.

## Acceptance

- [ ] `_v2RegisterMerged`, `_v2BuildTaper`, `_v2DepartureHold`, `_v2WinCamber`, `_v2BundleSolve`,
      `_v2WinnerView` gone; `_v2RegisterMidSpan` gone or justified in one line
- [ ] `cededSpans` / `departureSpans` gone as a concept, export/adopt included; `offCurveSpans` kept
- [ ] Deleted lines reported. FEAT-76 estimated ~1 100
- [ ] Gates green between each method, not just at the end
- [ ] `bench-worldgen` before/after — a regression needs an owner ruling
- [ ] The map view draws every road it should (the FEAT-76 adjacent bug, closed by this or re-ticketed)

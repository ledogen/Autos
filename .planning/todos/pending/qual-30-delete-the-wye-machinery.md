---
id: QUAL-30
type: quality
status: pending
severity: medium
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

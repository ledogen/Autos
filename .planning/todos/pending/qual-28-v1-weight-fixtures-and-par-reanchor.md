---
id: QUAL-28
type: quality
status: open
opened: 2026-09-05
severity: minor
source: QUAL-27 router-v1 residue audit — the code cull landed; this is the half that needs an
  owner decision (owner, 2026-09-05: "I'll want input on how we map the new router to weights…
  the old one after par reanchor was pretty much perfect and we should seek to replicate it")
relates_to: QUAL-27 (the v1 cull that found these), FEAT-68 (router v2 — v1's weights died with it),
  FEAT-29/FEAT-30 (par oracle + calibration harness — the reanchor being cited),
  test/lib/road-headless.mjs (the fixture carrying the phantom weights),
  data/ranger.js `roadV2` (the v2 price list these must map onto)
---

# QUAL-28: v1 weight fixtures still in the gates — and the par-reanchor character we want back

Two halves. The first is mechanical cleanup blocked only on the second, which is an owner call.

## Half 1 — the gates are asserting against parameters that no longer exist

`test/lib/road-headless.mjs` builds `TEST_PARAMS` with the whole v1 arc-lattice weight family:

```
maxRoadGrade, roadWDist, roadWAlt, roadWGrade, roadWOver, roadWTurn,
roadArcHardRadius, roadArcGentleRadius, roadArcHeurWeight
```

None of these is defined in `data/ranger.js` any more — FEAT-68 deleted the router that priced with
them. Nothing reads them. Worse, several gates read parameters through a `?? default` that now
*always* takes the fallback, so the number they assert against is a hard-coded constant wearing a
deleted parameter's name:

| Reader | Reads | Actual value |
|---|---|---|
| `test/road-minradius.mjs:94` | `roadArcHardRadius ?? 8` | always 8 |
| `test/centerline-curvature.mjs:49` | `roadArcHardRadius ?? 8` | always 8 |
| `test/replay.mjs:110` | `roadArcHardRadius ?? 8` | always 8 |
| `test/graph-topology.mjs:143` | `roadSelfClearMargin ?? 3` | always 3 |
| `test/graph-topology.mjs:144` | `roadSelfClearGap ?? 80` | always 80 |
| `test/graph-topology.mjs:171` | `roadCorridorExempt ?? …roadGraphGoalBlend ?? 60…` | always the fallback |

Rainy-day scripts are in the same state — they still RUN (verified 2026-09-05), they just measure
against phantoms: `test/route-character.mjs` divides its headline discriminator by
`roadGraphMaxGrade` (gone → always 0.20), and `test/road-character.mjs:20` / `test/dump-network.mjs:8`
document `roadWGrade=` / `roadArcHeurWeight=` overrides that do nothing.

**The work:** delete the phantom fixture keys, and for each reader above decide between (a) inline
the number as an honest fixed bar with a comment saying so, or (b) re-derive it from the v2 knob that
now governs the same thing. That decision is Half 2.

## Half 2 — OWNER INPUT NEEDED: how the v2 prices map onto what v1 was tuned to

This is the reason Half 1 is not just a delete.

**The owner's position, 2026-09-05:** *the v1 router after the par reanchor was pretty much perfect,
and we should seek to replicate it.* That is the target. v2 is not being asked to be different — it
is being asked to land in the same place, reached by a different mechanism.

The two vocabularies are not the same shape, which is why this needs a ruling rather than a
translation table:

- **v1 priced abstractly.** ~15 interacting weights (`roadWDist`, `roadWAlt`, `roadWGrade`,
  `roadWOver`, `roadWTurn`, …) over a heading-binned arc lattice. They had no units. What they did
  was learned by driving.
- **v2 prices physically.** ~5 knobs in `RANGER_PARAMS.roadV2`, each with a real unit: money per
  metre (`cRoadM`), per metre per metre of depth (`cCutM`, `cFillM`), per radian of direction change
  (`cTurn`), quadratic grade discomfort (`wGrade`, minimised at g* = 1/√wGrade). Elevation is bought
  with money, never faked with length.

So there is no key-for-key mapping. What there is:

1. **`roadWTurn` → `cTurn`** is already an acknowledged lineage (the comment on `cTurn` says so).
   v1 ran `roadWTurn: 120` in the fixture; v2 ships `cTurn: 45`. Different units, and the owner
   already retuned `cTurn` by eye (55 → 45, 2026-08-21).
2. **`roadWGrade: 400` → `wGrade: 180`.** v2's is the one with a defensible physical reading
   (g* ≈ 7.5%, forest-road grade).
3. **`roadWAlt` / `roadWDist` / `roadWOver` have no v2 counterpart at all** — the corridor stage is
   heading-free and the profile stage is exact, so valley-seeking and overshoot-penalty are emergent
   rather than priced. Nothing to map.

**The questions for the owner, in order:**

- Which par-reanchor-era behaviour is the "pretty much perfect" one we are replicating — is it a
  characterisable number set (grade distribution, turn-radius histogram, straight-span share, detour
  ratio — all of which `test/road-character.mjs` already reports), or is it a driven feel that only
  a checkpoint A/B can settle?
- If it IS characterisable: are those numbers the acceptance bar for v2's knobs, i.e. do we retune
  `roadV2` until `road-character.mjs` on v2 matches the v1-at-reanchor report? (That would need a
  v1-era character report captured from git history to compare against — worth doing before the
  branch gets any older.)
- For the gate readers in Half 1: is the min-radius floor (8 m) a fixed physical bar that should be
  a named constant in the gate, or should it track `roadMinTurnRadius`? Same question for
  `graph-topology`'s self-clearance distances, which no longer have a governing parameter at all.

**Do not answer these by guessing.** Half 1 stays open until Half 2 is ruled, because inlining the
wrong constant now makes it permanent.

## Acceptance

- [ ] Owner has ruled on what "replicate the par-reanchor character" means operationally.
- [ ] Every phantom key is gone from `test/lib/road-headless.mjs`.
- [ ] Every `?? default` on a deleted parameter is either an honest named constant or re-derived
      from a live v2 knob — no reader names a parameter that does not exist.
- [ ] `route-character.mjs` / `road-character.mjs` / `dump-network.mjs` report against v2 knobs.
- [ ] `npm run test:all` green.

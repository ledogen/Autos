---
id: QUAL-23
type: quality
status: open
opened: 2026-08-02
severity: minor
source: user-request (wiggly vs smooth switchbacks — captures 1785652698974 / 1785652782706, seed 0)
relates_to: FEAT-13 windiness stage, QUAL-19 corridor tune, QUAL-21 (stroke routing — REJECTED,
  do not re-attempt prescribed headings), FEAT-28 region gating, BUG-40
blocked_by: nothing (BUG-40 is fixed; see the warning below before raising wiggliness anywhere)
---

# QUAL-23: make routing character (wiggly vs smooth) a controllable per-region factor

## Why

The user likes the wiggly stretches — they read visually as "be careful here" and are fun — and wants
them as a deliberate, tunable factor ("later regions have more wiggly road chance") rather than a
coin flip. Their read was that the single router is responding to two different input criteria. It is.

## What the wiggle actually is (measured, not theorised)

The arc-primitive router's per-metre cost is

    wDist + wGrade·g² + wOver·max(0, g − maxGrade) + wAlt·height + wCurv·κ²

and `_routeOptsBetween` already names the lever in a comment: *"The SOFT grade target is the dominant
windiness lever."* With `roadGraphMaxGrade` = 0.12 and `roadWOver` = 19000, exceeding the cap is
ruinous, so the router cannot climb directly — it must buy LENGTH, and inside a corridor the only way
to buy length is to switchback.

The predictor is the **forcing ratio** = endpoint grade demand ÷ `roadGraphMaxGrade`
(`test/route-character.mjs`, run against a place capture):

| capture | demand | forcing ratio | detour | wiggle |
|---|---|---|---|---|
| wiggly (−222, 304) | 28.6% | **2.39** | ×4.35 | curvature sign flip every 53 m, 122°/100 m |
| smooth (957, −1083) | 17.4% | **1.45** | ×1.84 | every 139 m, 90°/100 m |
| bump site (42, 614) | 3.0% | **0.25** | ×1.23 | every 144 m, 48°/100 m |

Note the "smooth" route crosses ROUGHER ground than the wiggly one (26.2% vs 17.4% mean raw |dH/ds|).
It is not smoother because the terrain is kinder — it is smoother because it is allowed to spend 13%
mean grade going nearly straight up, while the wiggly one must gain 2.4× more height than the cap
permits and pays for it in switchbacks. The bimodal "either wiggly or smooth" feel is that ratio
crossing 1.

## Proposal

Character stays EMERGENT from the cost model — no injected noise, no prescribed headings (QUAL-21 was
A/B-rejected for exactly that). Vary the two knobs per region:

- **`roadGraphMaxGrade`** — the primary dial. Lower it and more edges cross forcing ratio 1, so more
  stretches switchback. Raise it and roads run straight and steep.
- **`roadGraphWTurn`** (1750) — the secondary dial: once length is forced, this sets whether it comes
  out as tight hairpins (low) or long sweeping traverses (high).

## Consequences to design around

- Both are `^road`-prefixed, so they ARE in `routeCacheSig` (`src/route-store.js`). Per-region values
  mean folding the region into the cache key and re-baking `data/route-cache-default.json.gz`.
- A region boundary must not cut an edge whose two endpoints would route under different weights, or
  the same edge routes differently depending on which side asks — a window-invariance breach (D-16).
  Simplest resolution: key the weights off the EDGE (e.g. its canonical endpoint pair), not the query.
- **Wigglier regions mean more tight kinks, which is exactly the geometry that bred BUG-40.** Re-run
  `test/deg2-hump-census.mjs` on any seed after raising wiggliness, and watch the fillet-apex residual
  BUG-40 deliberately left in place.

## Acceptance

- [ ] `roadGraphMaxGrade` / `roadGraphWTurn` resolvable per region, edge-keyed (not query-keyed)
- [ ] `routeCacheSig` includes the region mapping; bundled route cache re-baked
- [ ] `test/route-character.mjs` shows the forcing ratio / detour / sign-flip rate moving as intended
      between a low-wiggle and a high-wiggle region on the same seed
- [ ] `npm run test:all` green — especially restream-invariance and the graph cull-radius invariance
      gates (the region mapping must not make routing window-dependent)
- [ ] `test/deg2-hump-census.mjs` shows no new approach above 0.20 m of hump in the wiggly region

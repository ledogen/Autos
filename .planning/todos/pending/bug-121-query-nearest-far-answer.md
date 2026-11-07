---
id: BUG-121
type: bug
status: open
opened: 2026-11-07
severity: major
source: Lane A, found building BUG-118 (the tutorial GPS re-plan), reported to the orchestrator 2026-11-07
owner: Spare (road.js), after the BUG-105 loop trim lands
relates_to: BUG-118 (its smoke works around this by seating on the road), FEAT-63 (paper re-plan)
---

# BUG-121: `queryNearest` answers a far road point when the query is off every footprint

## What happens

`roadSystem.queryNearest(x, z)` answers a point up to ~160 m away when the query sits outside every road
footprint (half-width + shoulder, about 7.5 m). Inside a footprint the answer is right.

## Cause (Lane A's reading; not yet confirmed in road.js)

The D4 arm rule prefers any sample the query would be "interior" to, judged from that sample's tangent
alone. Nothing bounds how far along the road that sample is. So from about 12 m off a road, a sample
100 m up a bend whose straight continuation passes through the point beats the real nearest road.

## Evidence

- Seed 6 (test seed), `CarGame-run-shape/wip/bug118-qn.mjs`: 50 of 81 queries from POI markers answered a
  point more than 5 m farther than the POI's own road point; worst 164 m.
- The smoke hit it at the burger joint's pad: the answer was 108 m away.
- Re-measure on random seeds before and after (no default seed).

## Exposed callers

`main.js` `_resetToRoad` (the evening's R) · `paper-route.js` `roadOrigin` (FEAT-63 re-plan + BUG-118) ·
`main.js` spawn resolution (~691/723) · `poi.js:888` · `terrain.js:1458` · `camp.js` · `demolition.js`.

## Sketched fix (Lane A; not measured)

Count a sample as interior only if its distance is ≤ footprint + about 2 m (the sample spacing). Queries
inside a footprint are unchanged.

## Acceptance

- [ ] A headless probe on random seeds: every off-footprint query answers within a few metres of the true
      nearest road point (brute force over the network as the reference).
- [ ] A gate pins it (random-seed sample, reported as a sample).
- [ ] `fingerprint-world` on main vs the fix: any changed window is explained (poi.js and terrain.js read
      `queryNearest`, so POI or carve placement may move).
- [ ] BUG-118's smoke workaround (strayCheck seats on the road) can drop back to an off-road stray.

## Fixed on `land/bug-121` (Spare, 2026-11-07), waiting on the owner

**The fix (`road.js` `queryNearest`).**
- A sample is interior only when the query sits **beside** it: `|signedLat| ≤ footprintHW` and also
  `|along| ≤ ds`, the sample spacing.
- An interior sample therefore lies within `intR2 = footprintHW² + ds²` of the query. That radius bounds the tangent
  work, and it makes the slice skip exact: skip when no sample can beat `extBestD2` and none can be interior.

**Probe** (`wip/bug-121/probe.mjs`, 4 random seeds, 627 queries per offset):

| offset | answers > 5 m past the nearest road, main → fix | worst | µs per query |
|---|---|---|---|
| 0–7 m | 0 → 0 | +0.9 m both | 45–69 → 37–71 |
| 9–40 m | 512–557 → **0** | +189 m → **+0.2 m** | 65–77 → **35–37** |

**Gate:** `query-nearest`, registered. Two random seeds; no answer may be more than 2 m past brute force. On main it
fails with 1585 answers.

**Fingerprint vs main `bdaa307c`:** ALL IDENTICAL in all six windows (network through props).

**The visible change is the spawn.** `resolveSpawn`, and its replica `test/lib/spawn-decision.mjs`, take the nearest
road to the seed's probe point, which is usually off the road. The spawn is the story region's centre.

- The spawn moves 15 / 101 / 263 / 264 m on random seeds, and 199 m on the owner's 386773705. Confirmed in the app:
  `__map2d()._getRegion()` moves exactly as predicted, and mom's house stayed put on both seeds checked.
- The roster re-rolls with the circle. On 4 random seeds: 131 places the same, 3 moved, and the rest on different
  pads (`wip/bug-121/poidump.mjs`).
- **The keep-out is not a cause:** 17,525 sites were checked on both sides and 0 decisions flipped.
- Aside, not BUG-121: most keep-out rejections (91 of 101 on main) have no other run within `lat` by brute force,
  most likely the site's own road answering under a different run key. Worth its own look.

**Owner sheet:** https://claude.ai/artifact/5Nvi71xzeE4mJyFg7utHFT, tracker item `bug121-spawn`:
- (a) land it, and every world's spawn moves once;
- (b) land it but keep today's spawn on the old lookup;
- (c) hold.

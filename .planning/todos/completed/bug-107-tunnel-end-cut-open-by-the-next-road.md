---
id: BUG-107
type: bug
status: closed
severity: minor
opened: 2026-11-03
source: owner screenshot, seed 19 at (−1210, 1837) on the re-seat + cut build (:3896): "that tunnel mouth is broken for
  some reason". The BUG-67 re-assessment (proto/node-reseat) confirmed the same geometry on main.
relates: BUG-67 (where it was found), BUG-81 (portal framing), the carve (road cut over a bore)
---

# BUG-107 — a tunnel that ends at a node is cut open from above by the next road's cutting

## What

On seed 19, the bore of `g:-3,2,1:-2,2,0` ends exactly at the degree-2 node `-3,2,1`, 32 m deep. The open road that
leaves that node is in a cutting, and its carve runs over the tube's last 36 m: a tunnel never owns the terrain surface
above it. That leaves the hill only 1.5 m above the tube top 8 m from the portal, so you see open sky past the portal
through the tube.

## Acceptance

- [x] At seed 19 (−1210, 1837), the hill above the tube holds its cover up to the portal (no sky through the tube).
- [x] A census says how many bores end under another road's cutting.

## Measured (Spare, 2026-11-05) — the cover over the tube is the bore's own funnel; the screenshot is needed

`wip/bug-107/census.mjs --site`: at seed 19, both real portals of `g:-3,2,1:-2,2,0` (span 459–543 m of a 543 m run, so
the 543 end IS the node `-3,2,1`). The drawn skin's height over the tube's crown (centre / −4 m / +4 m):

| in from the portal | 4 m | 8 m | 12 m | 16 m | 24 m | 32 m |
|---|---|---|---|---|---|---|
| cover (m) | 1.5 / 1.7 / 1.7 | 1.5 / 2.5 / 2.5 | 6.3 / 7.3 / 7.3 | 11.1 / 12.1 / 12.1 | 20.7 / 21.8 / 21.7 | 30.3 / 31.9 / 30.8 |

Both ends read the same, and the numbers are the bore's own mouth funnel (`_boreNotchCS`): the BUG-81 item 5 mound
holds 1.5 m at the portal line, then the lifted cut floor climbs 1.2 m per metre until the raw hill caps it. So the
ground over this tube is the tunnel's own carve, not the next road's cutting — the ticket's "1.5 m above the tube top
8 m from the portal" is that same mound. Either the owner saw something the cover cannot show (a shader skin-hole edge
at a node-end portal, the cutting's side walls beside the tube), or this is the designed funnel and the call is
whether the funnel should start further in. **Owed before any fix:** the owner's screenshot (seed 19, (−1210, 1837)).
The census over 10 seeds is ready for whichever measure that settles on.

## Root cause and fix (Spare, 2026-11-07, land/bug-107)

Reproduced on main 6120fe2d: from the owner's spot there is sky beside the tube, and from above a sky-coloured hole
in the ground at the mouth. The cover numbers above were right; the next road's cutting is not the cause. The hole is
**missing geometry**:

1. **No lining and no ring at the mouth.** The bore of `g:-3,2,1:-2,2,0` ends AT node `-3,2,1`, a sharp degree-2 bend
   drawn as a connector strip (`_junctionCarveArcs`, trim 10 m). `road-mesh.js` built a slice's tunnel meshes AFTER the
   QUAL-10 junction trim, and a slice the trim drops whole `continue`d past them. Here that is the run's last slice
   [537.55, 543.16]: its 5.6 m of lining and the portal ring were never built, while the terrain shader still cut the
   skin for the mouth. Second, the span runs 2 cm past the run (543.18 on 543.16), so the strict `s < sHi` gave the ring
   to no slice anyway, and the proud lip's exact-end test failed.
2. **A floor gap.** The apron started under the ribbon's edge (halfWidth − 0.8 from the run's line). Over a connector
   strip the asphalt leaves that line, and the sky showed through between the strip's edge and the apron.

**Fix (`src/road-mesh.js` only, meshes only):**
- the tunnel block runs BEFORE the trim, on the untrimmed slice;
- spans are clamped to the run, and the run's last slice holds an end at L;
- the apron floors the whole bore from the centreline (0.3 m under the ribbon, never seen).

**Census** (`wip/bug-107/endcensus.mjs`, 20 seeds, R 1500, pond no-go): 389 mouths. 9 sit inside a junction trim. In
2 of them the trim dropped the slice that holds the mouth, so main drew no ring: seed 19, and random seed 24316861 at
(123, 375). No bore ends under another road's cutting.

**Evidence:**
- Shots, before/after, seed 19 portal + overhead and 24316861: https://claude.ai/artifact/H9Zjf9UVCkuhq7i9mxU64k.
  An ordinary portal (the same tunnel's other end) is unchanged.
- Gates: affected (road-pad-fill) green. cdp-smoke 25/25, zero console errors, on the second run. The first run timed
  out in "save" at 55 s under load; it took 34 s on the rerun.
- `fingerprint-world` vs main 6120fe2d: only `tiles` differs (5 windows; the apron is in every tube). Network,
  profiles, junctions, poi, surface, carve, water and props are identical.

Seen on the way, not chased: large dark boulders hanging in the air over this portal, on main too.

Closed on landing.

## Landed (orchestrator, 2026-11-07)

Merge of 6955dd41 on main (tree identical): cdp-smoke 25/25 on the merged tree; fingerprint-world: tiles only.

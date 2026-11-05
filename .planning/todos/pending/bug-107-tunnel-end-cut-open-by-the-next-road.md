---
id: BUG-107
type: bug
status: open
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

- [ ] At seed 19 (−1210, 1837), the hill above the tube holds its cover up to the portal (no sky through the tube).
- [ ] A census says how many bores end under another road's cutting.

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

---
id: BUG-131
type: bug
status: open
opened: 2026-11-07
severity: minor
source: Spare, found measuring BUG-121 (2026-11-07)
owner: Spare (poi / road), after BUG-130
relates_to: BUG-121 (queryNearest), the POI other-road keep-out (poi.js _otherRoadNear, owner 2026-09-07)
---

# BUG-131: the POI keep-out rejects sites for being near their OWN road

## What happens

`poi.js` `_otherRoadNear` asks `queryNearest(cx, cz, lat)`, a radius equal to the site's own offset `lat`. The site
sits exactly `lat` from its road, so the nearest 2 m spline sample of its own road often lands just outside that
radius. `queryNearest` then falls back to the raw polyline vertices, and that fallback returns `runKey: ''` (unknown).
`hit.runKey === ownKey` fails, the distance is just under `lat`, and the site is rejected as if another road were
there.

## Measured (`wip/keepout/probe.mjs` in CarGame-land-bug127)

Random seeds 332051823 and 2686853654, story regions: 9,480 keep-out checks and 43 rejections. **39 are this case**
(the hit has an empty key at a distance equal to `lat`); 4 are genuinely another road.

## Fix (to build)

Either query at `lat + 2.5` (the spline path answers with the run key; a sample 2.5 m out still marks the own road),
or have the fallback return the key of the run it iterates (`this._network` entries). It moves POIs and houses, so it
goes to the owner as a before/after sheet once built.

## Acceptance

- [ ] The probe: false rejections 39 → 0, the 4 real ones kept.
- [ ] The POI diff on random seeds (what moved, by how far), the owner's sheet.

## Built (Spare, 2026-11-07, land/bug-131)

`poi.js` `_otherRoadNear` queries `lat + 2.5`. The rule is unchanged: nothing but the site's own road may pass inside
`lat`. The fallback stays keyless on purpose, because `paper-route.js` `roadOrigin` reads `runKey ''` as "no road" and
bails.

- **Probe** (332051823 + 2686853654): rejections 43 → 4, the 4 real ones kept.
- **Brute-force truth** (`wip/bug-131/poidump.mjs` LOGKO=1: another run's polyline within `lat`, on the four seeds that
  change): main refuses 119 clear sites and 20 real ones; the fix refuses 0 clear sites and the same 20 real ones. Neither
  keeps a site with another road inside `lat`.
- **What moves** (12 random seeds, story regions; `wip/bug-131/diff.mjs`): 8 identical. 3219742435: a residence 24 m and
  a paper house 38 m. 3706666706: two paper houses to other roads. 1092637990: the farm to another road and one paper
  house. 3226146326: mom's house 295 m to the next road, and the roster re-rolls.
- **`fingerprint-world` vs main 06a4d9f3:** poi differs in the seed6 and seed11 story windows. Surface, carve and water
  differ in seed6 story only, which is where the moved POI pads carve. Everything else is identical.
- **Gates** (affected 18): 17 green. **paper-tour fails**: the top route on seed 6 goes 14.77 → 16.39 km against the
  15.5 km hard limit. A house the keep-out wrongly refused is now a customer, up a side road. Nothing bounds the top
  route's length (15 customers picked by road distance, within 5 km). On 12 random seeds, main's top route is already
  over 15.5 km on 2 (16.45, 18.36 km) and over 14 km on 7. The fix changes 3: 11.94 → 16.55, 13.45 → 12.94 and
  15.16 → 14.82 km.

**Owner's call**, item `bug131-keepout` (sheet https://claude.ai/artifact/NJMwVz3f1cuArzVN7YnnYZ):
(a) land now, seed-6 budget check becomes a measurement and a ticket bounds the top route;
(b) bound the route first, then land this with the check kept;
(c) hold.

---
id: BUG-131
type: bug
status: open — built on land/bug-131 (95c4fc5c); the owner said land it (bug131-keepout (a), 2026-11-07), route length as a new ticket — landing pending
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

---
id: FEAT-99
type: feature
status: open
severity: minor
opened: 2026-10-07
source: owner, 2026-10-07 — "Places and Missions" (pois.md § Places and Missions)
relates: FEAT-98, FEAT-67
---

# FEAT-99: Class name forms

Step 2 of **Places and Missions** (pois.md).

## Scope

- Each class owns several name forms in `data/offer-names.js`: residence "the Hadley place" /
  "Hadley house" / "Hadley's"…, farm "Hadley farm"…, doctor one form ("Dr. Pruitt"), school
  "… School" / "… Academy", motorist = the person.
- Re-sort the existing names into the classes. Add person-less names ("Bits & Bobs General Store").
- Remove `farm`, `quarry`, `dairy` from `PLACE_NOUNS` (owner-approved 2026-10-07): a roadside name
  must not promise a farm that isn't there.

## Acceptance

- Every POI's card name comes from its class's forms; names stay deduplicated within a region and
  a pure function of the seed.

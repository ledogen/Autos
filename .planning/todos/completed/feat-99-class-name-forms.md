---
id: FEAT-99
type: feature
status: closed
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

## Resolution (2026-10-07)

- `NAME_FORMS` (data/offer-names.js) holds each class's name forms as templates with `{first}`,
  `{last}`, `{the}`, `{adj}` and `{biz}` slots; a slot-less form is a whole person-less name. It
  replaces `SOURCES[].nameForm` and the owned/plain/home/person branches in `offer-board.js`.
- Business classes list their rolled form ×3 so person-less names stay the exception. Person-less
  names are PLACEHOLDERS (two each for the general store, food vendor and auto shop).
- A class with no forms (the stranded motorist) is named by its one person.
- `HOUSEHOLDS` (residence, farm): one surname per household, and no two households in a region
  share one ("Pruitt's" + "Pruitt house" read as one family twice).
- `farm`, `quarry`, `dairy` left `PLACE_NOUNS`.
- Gated in offer-board (§11, 300 seeds): every name comes from its class's forms; households unique.

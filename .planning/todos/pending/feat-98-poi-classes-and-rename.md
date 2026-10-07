---
id: FEAT-98
type: feature
status: open
severity: major
opened: 2026-10-07
source: owner, 2026-10-07 — "Places and Missions" (pois.md § Places and Missions)
relates: FEAT-99..104 (the rest of Places and Missions), FEAT-67 (offer board), FEAT-91 (haul yards), FEAT-96 (farm)
---

# FEAT-98: POI classes, tags and the key rename

Step 1 of **Places and Missions**. Design: `.planning/story-mode/pois.md` § Places and Missions.

## Scope

- `POI_ROSTER` (`src/poi.js`) becomes the class roster: 9 required (generalStore, foodVendor,
  autoShop ×2, gasStation ×2, tackleShop, workSite, the haul yard), 12 additional (residence ×5,
  farm ×3, office, school, doctor, strandedMotorist), plus the mom and Larry fixtures. 23 in R1.
- Each row carries its class tag; mom = `residence`+`mom`, Larry = `residence`+`larry`.
- Rename the keys: `burgerJoint` → `foodVendor`, `serviceShop` → `autoShop`, `missionGiver` →
  the additional classes. Update `data/offers.js` `SOURCES`/`pools`, `offer-board.js`, cargo.md,
  pois.md (delete each planned row that goes live). The dashboard's warning strip is the checklist.
- Residence draws today's `missionGiver` model pool. office / school / doctor / workSite stand on
  placeholder markers until ASSET-68..71 ship. strandedMotorist's car visibility is FEAT-102.
- Job behaviour stays as today until FEAT-101; new classes post with a provisional 1 slot.

## Acceptance

- Region 1 places 23 POIs on seeds 6, 11, 90 (pad census 2026-10-07: 41–54 viable pads).
- No old key remains in `src/` or `data/`; dashboard warning strip empty.
- `npm test` affected gates green (story-poi, world-determinism).

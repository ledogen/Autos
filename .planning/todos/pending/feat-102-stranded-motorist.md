---
id: FEAT-102
type: feature
status: open
severity: minor
opened: 2026-10-07
source: owner, 2026-10-07 — "Places and Missions" (pois.md § Places and Missions)
relates: FEAT-98, FEAT-101, ASSET-18 broken-down car
---

# FEAT-102: Stranded motorist

Step 5 of **Places and Missions**.

## Scope

- A permanent pad (worldgen). The ASSET-18 broken-down car shows **only while the motorist has a job
  open**; an idle pad is an empty lay-by (believably empty).
- 0–1 jobs: a passenger to the auto shop (cargo.md: strandedMotorist → autoShop / any).
- **Deferred, long-term:** after their job the motorist moves somewhere else on the map.

## Acceptance

- Car appears/disappears with the offer, deterministically; no collider left behind when hidden.

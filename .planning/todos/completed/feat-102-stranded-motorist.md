---
id: FEAT-102
type: feature
status: closed
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

## Resolution (2026-10-08)

- **The motorist's jobs (owner, 2026-10-08):** one at a time (budget cap 1) — a ride to an auto
  shop, or a FETCH of a spare tire (from an auto shop) or a jerry can (from a gas station). The jerry
  can is also a courier item (gas station → anyone); the spare tire is fetch-only.
- **Fetch (FEAT-89's shape, first slice):** `fetchBy` / `fetchFrom` on THINGS; the board's
  `destWish` asks strictly for the pickup and flags `fetch`; `mission.js` `fetchRoute` builds the
  outbound + the outbound reversed, one par with a stop at the pickup. **The pickup is a park**:
  "park to acquire mission item" → acquired on the brake latch → "get back to the stranded
  motorist!"; the return is a drive-up arrival. The HUD names the leg; the map shows Pickup/Return.
- **The tackle shop** posts fetches of the general-store sundries (owner, 2026-10-07).
- **Presence:** roster `showWhileJob`; main.js `_updatePoiPresence` hides the car, ring, park
  trigger, map marker and collider (engine sync + `queryContact`) unless a slot there is live or
  taken; it re-appears only once the truck is 15 m clear.
- Gated: offer-board (motorist's three jobs and their cards, fetch wishes, tackle shop), story-poi
  §7c on the real planner (pickup class, mirrored return, one par, park-only pickup, single settle,
  hidden marker not solid / not answering). In-browser (seed 6): busy motorist shown; after its job
  ends — hidden, not solid, no park trigger; a tackle-shop fetch card reads right.
- **Deferred (unchanged):** after their job the motorist moves elsewhere on the map (SM-4).

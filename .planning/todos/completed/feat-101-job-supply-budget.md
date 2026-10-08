---
id: FEAT-101
type: feature
status: closed
severity: major
opened: 2026-10-07
source: owner, 2026-10-07 — "Places and Missions" (pois.md § Places and Missions)
relates: FEAT-98, FEAT-67 (slots, expiry, cancel lock), test/economy.mjs
---

# FEAT-101: Job supply — always-on sources, the region budget, the lock rule

Step 4 of **Places and Missions** (pois.md § Job supply).

## Scope

- **Always on, outside the budget:** Larry 1, haul yard 2, food vendor 2–3.
- **Budget ≈ 12** live jobs shared by every 0–2 place (required shops + additional classes;
  motorist cap 1). A refill lands on a uniformly random eligible place (unlocked, under cap).
- **Lock rule (reverses 2026-09-27):** completion and cancel both lock the slot for a fresh full
  expiry from that moment. `minEmptyH` folds into this where it can.
- Board stays a pure function of (seed, POI list, clock, completion/cancel log) — SM-INV-12.

## Acceptance

- Headless: board size holds near 17–18 across a simulated day; completing a job never shortens
  the time to the next budget offer.
- `test/economy.mjs` re-run; any change to the break-even day reported to the owner, not retuned.

## Resolution (2026-10-07)

- SOURCES split: `slots` rows are always-on (Larry 1, haul yard 2, food vendor 2–3 rolled per POI);
  `cap` rows share `BUDGET_JOBS = 12` (general store, auto shop, gas station, job site, residence,
  farm, doctor at cap 2; motorist cap 1). A refill lands on a uniformly random eligible giver:
  something to post, under cap, no locked budget slot parked there.
- Lock rule: completion and cancel both lock for a fresh full life from that moment. A locked budget
  slot parks on its place (blocking new budget jobs there), then refills elsewhere. Budget events
  replay in global time order, so lazy == stepped still holds.
- Larry (owner, this session): never expires, no timer, `lockH: 12` after a round. `minEmptyH` gone.
- The gas station posts (propane); the tackle shop does not — nothing in THINGS comes from it.
- `OfferBoard.isGiver()` keeps an empty budget giver a grey diamond on the map.
- Gated (offer-board): 17–18 live with no player over 10 days × 3 seeds, caps never exceeded, every
  giver hosts at some point; lock lengths (budget, always-on, Larry, cancel); finishing never brings
  the next budget offer sooner (200 seeds vs an untouched twin); lazy == stepped with a completion
  interleaved. A mutation back to the old timer rule fails 6 checks.
- In-browser (seed 6, story mode): 17 live; empty budget givers report as givers; Larry's card has
  no expiry. `test/economy.mjs`: ALL OK, unchanged (pay math only — break-even day not affected).

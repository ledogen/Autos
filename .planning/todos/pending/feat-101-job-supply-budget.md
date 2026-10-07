---
id: FEAT-101
type: feature
status: open
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

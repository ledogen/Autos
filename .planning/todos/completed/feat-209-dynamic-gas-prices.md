---
id: FEAT-209
type: feature
status: completed
severity: minor
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "we should have dynamic gas prices. Not only should they scale with the run, but they should also Very relative to one another So one station is always offering the best deal. I want this mostly just for eye candy. Make the variance plus or minus 5%"
relates: FEAT-168 (economy pass: the day-1 price and day tier), src/fuel-stop.js, src/main.js (the one `fuelStop.open` call), data/ranger.js (`fuelPricePerGal`)
---
lane: Spare

# FEAT-209: Dynamic gas prices — each station within ±5 % of the day's price

## Next steps
Built on feature/spare, landing request with the orchestrator. Owner: pull into two different stations on the same day and compare the $/gal on the pump face; answer the two open questions.

## Summary
Every station gets its own price, within ±5 % of the run's current price, so one station is always the best deal. Mostly eye candy (owner).

## Description
- The price already scales with the run: `fuelPricePerGal` × the day tier, computed in one place in `src/main.js` where the nozzle goes in.
- Add a per-station factor in [0.95, 1.05], a pure function of the world seed and the station's id, so it is the same every time you look and needs nothing in the save.
- `[DEFAULT]` the factor is re-drawn each day, so the best deal moves ("dynamic").
- The pump face shows its own price. Any other place a fuel price is shown (the map, a sign) reads the same function.

## Tracker
- [x] One function gives a station's price: day price × a seeded factor in ±5 % (`stationPriceFactor` in `src/fuel-stop.js`)
- [x] The pump face and the sale use it (the price is locked at nozzle-in; the face shows `fuelStop.price`, the sale charges it, the jerry cans fill on the same counter)
- [x] A gate (`test/fuel-stop.mjs` §9): factors stay inside ±5 %, differ between stations, and are stable for a given seed, station and day

## Decisions
- 2026-11-13, owner: variance ±5 %; mostly eye candy; prices keep scaling with the run.

## Open questions
- Do prices move each day (`[DEFAULT]`, built) or stay fixed per station for the run? Fixing it is one edit: drop `day` from the seed.
- Should the map show each station's price, so the best deal can be shopped for? Not built: today the price only shows on the pump face once the nozzle is in.

## Files
`src/fuel-stop.js` · `src/main.js` · `test/`

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.
- 2026-11-13 (Spare): built. Factor = 0.95 + 0.1 × mulberry32(seedFor(worldSeed, 'fuelPrice', hash32(poiId), day)), no save field. The pump face is the only place a fuel price shows; the tow has its own price and does not use fuel's.

## Resolution (2026-11-14)
Owner, card feat209-look: "fine as built" — prices re-drawn daily per station (DEC-130). Closed.

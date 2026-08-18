---
id: FEAT-67
type: feature
status: open
severity: major
opened: 2026-08-17
source: owner ruling 2026-08-17 — "i want the player to search and optimize the missions they run
        based on the rewards. i think we go the other direction and update planning."
relates: FEAT-53 (the spine this extends), FEAT-46 (POI job source), FEAT-61 (self-pricing
        precedent), FEAT-65 (must state terms the same way), FEAT-16 (2D map surface)
invariants: SM-INV-3 (never-live clause RETIRED by this pass), SM-INV-4, SM-INV-8, SM-INV-14
amends: design-amendments-2026-08-17.md §1, §2, §3 — folded into DESIGN.md + missions.md
---

# FEAT-67: The visible offer board — stated terms, named bonuses, live rank boundaries

**Reverses shipped behaviour.** FEAT-53 deliberately shipped a *single hidden offer per POI* to dodge
the board-discovery question. That question is now answered the other way, so the dodge is spent.

## Request

Make mission terms legible **before** the drive, so the player can plot an optimal chain a mission or
two ahead and then be held to the time it needs. Three pieces, ratified 2026-08-17:

1. **Offers state their terms** — pay range `$MIN–$MAX`, named bonus item, the rank that earns it
   (B/A/S, variable per mission), and when the offer re-rolls (visible timer or day boundary).
2. **Bonus rewards are named and may tier across ranks** — e.g. tire at B; tire + rear suspension at
   A; both + front at S. Not one flag.
3. **Rank boundaries are shown live** during the drive — when S lapses to A, A lapses to B.

## Design constraints (binding — from the amendment)

- **Boundary proximity, NOT a running countdown.** Never render `3:41 remaining` — SM-INV-3 names
  that exact string, and only its *never-live* clause was retired, not its thesis. Show the rank
  you're on track for and how close the next demotion is.
- **Glanceable and peripheral.** The read costs a fraction of a second. It is a mission-terms
  surface — site it with the run HUD (`#run-hud`), never layered over the road.
- Payout stays **continuous** underneath (SM-INV-4). Crossing a boundary costs a little, never a
  cliff. The letters remain a skin over a smooth curve.
- Terms still **lock at accept** (FEAT-53 ruling: tier AND thresholds). A displayed range must be the
  range you will actually be graded against once accepted.

## Mission archetypes this must support

1. Higher payout, no bonus item.
2. Lower payout, with a bonus item.
3. **Pays $0 cash, settles entirely in rank-gated parts.** Legal per the SM-INV-4 exception. Mission
   points still ride on rank, not payout, so this still advances region access — that is what keeps
   it a real choice rather than a trap.

## Open — needs an owner ruling before Phase B

**What are MIN and MAX?** The raw curve runs `0` (ratio 1.2) to `cap × parBase` (cap 3.0), so a
literal range reads `$0–$189` and says nothing. **Recommendation: quote the C-to-S band** — pay at the
C threshold as MIN, at the S threshold as MAX. It describes realistic outcomes and moves correctly
with the day tier and the tightening rank ramp. Not decided.

Second, smaller: **is the timer per-offer or global?** A visible per-offer expiry lets the player race
one specific job; a single day-boundary re-roll is simpler and is what ships today.

## Shape

- **Phase A — offer model.** `_offers` in `src/mission.js` grows: inspectable without parking, an
  expiry, a `bonus` field (item id + required rank + optional per-rank tiers), and a derived pay
  range. Must **recompute from the tier/threshold tables**, never cache numbers — FEAT-53 Phase D
  will retune those tables.
- **Phase B — pre-drive surface.** Terms visible without parking. Map (FEAT-16) is the natural home
  for "what's out there"; the POI card carries the detail.
- **Phase C — live boundary readout.** On `#run-hud`, under the constraints above.
- **Phase D — bonus settlement.** Award named/tiered items at settle, per achieved rank. Items die
  with the run (SM-INV-8).

## Acceptance

- [ ] An offer's pay range, named bonus, required rank and re-roll time are all readable before accept
- [ ] Bonus tiers resolve per achieved rank; a $0-cash mission settles items only and still pays points
- [ ] Live readout shows boundary proximity and never renders a bare countdown string
- [ ] Displayed range matches what settlement actually pays at the C and S thresholds
- [ ] Terms lock at accept; the displayed range is the graded range
- [ ] Range recomputes from `ECONOMY_PARAMS` — a tier/threshold retune moves it with no code change
- [ ] Gates: extend `test/economy.mjs` (range endpoints track thresholds; $0-cash still scores points)
      and `test/story-poi.mjs` (§7 single-offer expectations updated for the new model)
- [ ] `npm run test:all` green pre-commit

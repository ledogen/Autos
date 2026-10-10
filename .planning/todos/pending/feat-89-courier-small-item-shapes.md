---
id: FEAT-89
type: feature
status: open
severity: major
opened: 2026-09-29
source: owner, 2026-09-29 — "within the small item delivery class there should be point to point
  and also drop off to multiple locations and also a mode where you go out and back — 'go fetch
  this for me'"
relates: FEAT-88 (the large-item / bed class — the other half of the same ruling), FEAT-67 (offer
  board — where the shape is rolled and shown on the card), FEAT-61 / paper route (the only
  multi-stop mission today; its tour ordering is the reusable piece), FEAT-53 (payout), FEAT-87
  (live rank timer — must hold across a multi-leg mission)
invariants: SM-INV-3 (no par countdown), SM-INV-4 (payout continuous in par ratio)
design: missions.md §3a point-to-point; §3 two-class amendment of 2026-09-29; §8 vendor jobs
  (the market-stall "fetch fertiliser and bring it back" is the out-and-back first written down,
  2026-08-25 — its open question "one par or one per leg" is answered below: one par, two legs)
---

# FEAT-89: Courier — small items in the cab, in three shapes

## Ruling (owner, 2026-09-29)

Delivery is two classes split by where the item rides (see FEAT-88 for the table). This ticket is
the **small-item class**: the thing rides in the cab, nothing can bounce out, so it is scored on
**time versus par** — the existing margin axis, the existing `delivery` family on the offer board.

**Name: Courier** (owner, 2026-09-29 — over *delivery*, too ambiguous; *run*, collides with the
roguelike run; *errand*, does not flow and speech-to-text mishears it). "A courier job." The code
family key `delivery` in `data/offers.js` / `offer-board.js` is renamed to `courier` as part of this
ticket, so the card, the map diamond legend and the code agree.

**Courier is near-universal (owner, 2026-10-06):** "pretty much any POI can" post courier jobs.
Every `SOURCES` row lists it unless the place has a reason not to. Larry's house stays papers-only,
because he is the paper route. The firewood yard and the new `farm` (FEAT-96) gain it.

## Fetch shipped in FEAT-102 (2026-10-08)

The fetch shape is built: `THINGS[].fetchBy` / `fetchFrom`, `OfferBoard.destWish` → `fetch`,
`mission.js` `fetchRoute` (the outbound reversed, one par with a stop at the pickup), `acquire()`.
**The pickup is a PARK** (owner, 2026-10-08): pull up, park, the item is acquired instantly —
"park to acquire mission item", then "get back to …!". The return is a drive-up arrival. Posting
it: the stranded motorist (spare tire, jerry can) and the tackle shop (the store sundries). Still
open here: multi-drop, and the `delivery` → `courier` family rename.

## Posting rule (owner, 2026-10-07)

> "Go fetch me something … [it] posts and receives the same things that [a courier job] receives."
> Terminology stays **courier** and **fetch** (owner, same day — not "one-way / two-way").

- A fetch is posted by a place that **receives** that thing as a courier destination, and ends back
  there: the school receives class notes, so a fetch from the school is "fetch class notes from a
  residence or farm and bring them back". The pickup is drawn from that thing's givers (`pools`);
  the return is the poster.
- **The tackle shop's first jobs are fetch** (owner, 2026-10-07): the general-store sundries —
  lightbulbs, screws, nails, duct tape, paper towels, toilet paper, rope, string, paper — go from
  the store to anyone as courier jobs, and the tackle shop fetches them. Until fetch is built the
  tackle shop posts nothing.
- **The office and school post nothing at all, fetch included** (owner, 2026-10-07 — answering
  the conflict with their receive-only ruling). Fetch comes only from receivers that are already
  sources: e.g. the general store fetching empty propane, a farm fetching tractor keys.

## The three shapes

One family, one scoring axis, **three route shapes**. A shape changes where you go, not what is
measured. The offer's `spec` (seeded, `offer-board.js`) gains a `shape` field; the card names it.

| Shape | Route | Exists today | Par |
|---|---|---|---|
| **Point-to-point** | giver → destination | **Yes** — the `delivery` family as built (FEAT-67: POI or roadside destination) | one leg |
| **Multi-drop** | giver → stop 1 → stop 2 → … (2–4 stops) | No | the whole tour, ordered, priced once |
| **Fetch** | giver → pickup → back to the giver | No | out + back, two legs, one par |

**Multi-drop** is the paper route's tour with the throwing taken out: several named customers, the
order chosen for you, par is the whole thing. `paper-route.js` already plans an ordered multi-stop
tour and prices it once (*"a route is ONE route with many stops, not many routes"*) — reuse the
ordering, not the coverage scoring. Each stop is an arrive-and-hand-over at a POI (park in the
start zone, as the giver works today), never a throw. Stops are POIs with people
(`offer-board.js` names), so the card can say who gets what.

**Fetch** is the out-and-back: the giver wants something from a place, you drive there, pick it up,
and bring it home. The pickup is a POI (shop, house, roadside). The mission settles at the giver,
not at the far end. Its distinct feel is that you *know the road home* — the second leg is the
first one reversed, so the player who learned it outbound is rewarded on the way back. Nothing
extra to score; par covers it.

## What has to be built

1. **Multi-leg missions in `mission.js`.** Today a mission is one planned route with one arrive
   radius and one settle. A leg list — each with its own destination POI and arrive test, settle
   only after the last — is the core change. Par is the sum over the legs of the same par oracle
   (`src/par.js`), planned once at offer time so the card can price it (FEAT-67 prices at accept).
2. **Shape roll in `offer-board.js`.** `spec()` draws a shape for `delivery` from a weighted table
   (point-to-point stays the most common), and for multi-drop draws the stop count and stop POIs
   from the same reachable-destination band it already uses; for fetch draws the far POI and sets
   the return leg to the giver. Deterministic from the offer's own seed stream, as everything on
   the board is.
3. **The card.** Shape and stops named: "3 stops — Nadia, the Halvorsens, the pump house" /
   "fetch a part from the yard and bring it back". Pay is still one par-based number.
4. **Progress on the HUD.** The GPS assist (`src/gps.js`) and the story map marker point at the
   *current* leg's destination; the FEAT-87 rank bar runs on the whole-tour par and must not reset
   between legs.
5. **Cancel and lockout** (FEAT-67's rules) unchanged — one mission, however many legs.

## Open questions for the owner

- **Stop count and weights** for multi-drop (suggest 2–4, weighted toward 2), and the share of
  offers each shape takes. n=1 feel decides this, not a spreadsheet — ship a guess and tune live.
- **Does fetch pay more for the return?** Recommendation: no. Par is two legs long, base scales
  with par (SM-INV-4), so it already pays roughly double a one-way of the same distance.
- **Can a multi-drop stop be a roadside drop** (no POI), as point-to-point can today? Recommend
  POIs only for now — a hand-over needs someone to hand to.

## Not in scope

- Anything in the bed — FEAT-88.
- The paper route's coverage/accuracy scoring; multi-drop borrows its ordering only.
- Perishable/spoilage on cab items (items.md §4 "milk") — quest fiction, separate.

## Acceptance

- [ ] The family is `courier` in code and on the card (renamed from `delivery`); a courier offer
      rolls one of three shapes deterministically from its seed stream; the card names the shape
      and its stops.
- [ ] Multi-drop: the mission arrives at each stop in order, settles once after the last, and par
      is the whole tour priced at offer time (headless: plan the tour, assert par = sum of legs).
- [ ] Fetch: the mission arrives at the far POI, then settles at the giver; the return leg re-uses
      the outbound route reversed.
- [ ] GPS assist and the story map point at the current leg; the rank bar runs on tour par with
      no reset between legs; no countdown is ever rendered (SM-INV-3).
- [ ] Point-to-point offers are unchanged in behaviour (existing offer-board / mission gates green).

## Related code

- `src/mission.js` — `planOffer` / `_roll`, `ARRIVE_RADIUS`, the single-settle guard; where legs go.
- `src/offer-board.js` — `spec()`, `BUILT_FAMILIES`, `DEST_POI_CHANCE`, the destination band.
- `src/paper-route.js` — the ordered tour planner to borrow.
- `src/par.js` — the par oracle, summed per leg.
- `src/gps.js`, `src/map2d.js` — current-leg marker.

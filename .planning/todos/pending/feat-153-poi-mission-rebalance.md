---
id: FEAT-153
type: feature
status: open
severity: major
opened: 2026-10-29
source: owner, 2026-10-29 (orchestrator inbox) — "We need to rebalance items, bonds, and delivery, source, and destinations. There are some incredibly underutilized POIs like the school and office that I suspect a player will very rarely visit. With the goal of fun in mind, it's probably good to give each POI type its own either types of missions or more receipt than provide mission types, etc. But optimizing the pool for the most fun and variety and groovy gameplay is the goal"
relates: FEAT-100 (tagged destinations), FEAT-101 (job budget), FEAT-102 (fetch), FEAT-96/97 (freight/fragile pools), FEAT-69 (SM-3 re-price), data/offers.js THINGS / REWARDS / SOURCES, src/offer-board.js _rollSpec / destWish, .planning/story-mode/pois.md § Job supply, cargo.md
---
lane: Spare

# FEAT-153: POI mission rebalance — every POI type earns its visits

## Where the pool sits today (census, 300 seeded boards, the test/offer-board.mjs roster of 23 POIs)

16.5 live offers per board (12 budget + Larry + yard + the vendor's 2–3).

| Posts (share of live offers) | | Ends at | per board |
|---|---|---|---|
| residence ×5 | 21.9 % | roadside spot | 4.71 |
| food vendor | 15.1 % | any POI (untagged) | 3.19 |
| farm ×3 | 12.9 % | general store / gas station | 2.12 |
| auto shop ×2 | 8.9 % | residence | 2.01 |
| gas station ×2 | 8.6 % | work site | 0.64 |
| Larry (papers) | 6.1 % | farm | 0.38 |
| firewood yard | 6.1 % | auto shop | 0.35 |
| doctor | 4.8 % | gas station | 0.21 |
| general store | 4.2 % | **office** | **0.13** |
| tackle shop | 4.1 % | **school** | **0.10** |
| work site | 4.1 % | food vendor | 0.01 |
| motorist | 3.4 % | | |

So the office sees a job on one board in eight and the school one in ten — each has exactly ONE
thing that can end there (`deck`, `classNotes`), both sourced only from a household, and a
household's delivery draw is one row in ~14. The doctor, tackle shop and general store each post
about 4–5 %. Households and the food vendor together post half of everything, and 29 % of all jobs
end at a roadside spot, not a POI at all. The FAMILY-FIRST draw (owner 2026-10-12) means a
household's four families split its posts evenly, which is why residence:fragile (7.9 %) outposts
every single other giver's delivery.

Script that produced it: a 40-line census over `OfferBoard` (seed, roster, nowH 6), tallying
`spec(o).family`, the thing's `to`, and `destKind`. Worth keeping as a gate once the targets are set.

## What the owner is asking for

Each POI type should have its own reason to be visited: its own mission types (as a giver), or
more things that end there (as a receiver), chosen for variety and fun rather than for the
believability tags alone. This reverses or amends the 2026-10-07 ruling that the office and school
post nothing and only receive.

## Owner-only questions (asked back 2026-10-29, unruled)

1. Do the office and school become givers (`cap: 1`, delivery only), or stay receive-only with
   more things sent to them? Recommendation: givers — a receive-only POI can only ever be reached
   through someone else's draw, and at one row in fourteen it stays invisible however the pool is
   weighted.
2. The placeholder jobs below are mine; the owner writes the words.

## Proposal (placeholders, for the owner to rule on)

- **School** (giver, cap 1): "the field-trip permission slips" → HOME; "the science-fair project" →
  residence, FRAGILE; receives `classNotes` from ANY_GIVER, not only HOME.
- **Office** (giver, cap 1): "the signed contracts" → workSite / autoShop / farm; "the payroll
  envelope" → generalStore / gasStation; receives `deck` from ANY_GIVER.
- **Doctor**: already a giver; add "a specimen for the lab" (very fragile, time-critical, → office?)
  so its posts have a shape of their own instead of the generic ANY_GIVER note.
- **Tackle shop**: its fetches stay; add one outbound thing (bait → residence/roadside already
  exists) so it is a destination too.
- **Roadside share**: DEST_POI_CHANCE 0.5 → 0.65 pulls roadside from 29 % to ~20 % and puts those
  jobs at POIs. Owner's call — roadside spots are content too.
- Keep the budget at 12; do not add a per-POI visit quota (that is an injected rule — the fix is
  the pool, so the character emerges from it).

## Acceptance

- [ ] Owner has ruled on questions 1–2 and the placeholder jobs are replaced by the owner's words.
- [ ] The census script lands as a gate (`test/offer-census.mjs`) with a floor per POI type: no
      POI type with a model ends fewer than N jobs per board (N ruled; 0.3 proposed = one in three
      boards) and no giver posts under 3 %.
- [ ] `data/offers.js` carries the new things / SOURCES rows; pois.md § Job supply and cargo.md
      updated to match.
- [ ] offer-board, story-poi, paper gates green; cdp-smoke passes.

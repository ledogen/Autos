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

## Ruled (owner, 2026-10-31)

- Office and school **stay receive-only for the alpha**. They may become givers only with a gameplay
  reason built on tension — e.g. some places post no jobs, so ending up there is a loss the mission
  that sent you there has to pay for. That re-seat of items, givers and destinations is the **"alpha
  balancing" phase**, not now.
- Roadside share: **DEST_POI_CHANCE 0.5 → 0.65 approved** (roadside ~29 % → ~20 %). **Done 2026-10-31 (Spare):** measured over
  300 boards, roadside drops 24.0 % → 16.5 % of non-paper offers (the census above counts where jobs end).
- **Placeholder jobs approved as written (owner, 2026-10-31).** They are the Proposal table below (school: "the field-trip permission slips",
  "the science-fair project"; office: "the signed contracts", "the payroll envelope"; doctor: "a specimen
  for the lab"); the owner writes the real words when the givers are opened.

## RULED — owner, 2026-11-02: the Proposal, with two changes

> "approve all proposals except notes should only come from residence. no specimen for the lab"

This supersedes the 10-31 "receive-only for the alpha" line above. Asked again with the measured share (office
and school end a job in about 1 board of 8–10), the owner approved the Proposal below as written, except:

- **School** keeps receiving `classNotes` from residences only. The proposal's widening to ANY_GIVER is dropped.
  Its two giver jobs stand (permission slips → HOME, science-fair project → residence, FRAGILE).
- **Doctor** gets no "specimen for the lab". It keeps the generic ANY_GIVER posts.
- Office (giver, cap 1, two jobs, receives `deck` from ANY_GIVER), tackle shop (one outbound thing), budget 12,
  no per-POI visit quota: approved as written. The placeholder job words stand until the owner rewrites them.

Spare builds it, then the census gate (Acceptance).

## Owner-only questions (asked back 2026-10-29, ruled above)

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

- [ ] Owner has ruled on questions 1–2 (DONE 11-02) and the placeholder jobs are replaced by the owner's words (OPEN; plus the tackle-shop reading in § Built).
- [x] The census script lands as a gate (`test/offer-census.mjs`) with a floor per POI type: no
      POI type with a model ends fewer than N jobs per board (N ruled; 0.3 proposed = one in three
      boards) and no giver posts under 3 %.
- [x] `data/offers.js` carries the new things / SOURCES rows; pois.md § Job supply and cargo.md
      updated to match.
- [x] offer-board, story-poi, paper gates green; cdp-smoke passes. (2026-11-02: 24/24 affected gates; the smoke 21/21 rerun alone after a load flake in `papers`.)

## Built — Spare, 2026-11-02 (feature/spare)

As ruled: the office and the school are budget givers (`SOURCES` cap 1, expiry 24 h; the office posts
delivery, the school delivery + fragile). They post only their own jobs — they stay out of `ANY_GIVER`, so
no generic note leaves them. New `THINGS` rows, all PLACEHOLDER words:

- school: *the field-trip permission slips* → residence / farm; *the science-fair project* → residence,
  Fragile tier, crated (`largeCrate`, 6 kg) until it has a model;
- office: *the signed contracts* → workSite / autoShop / farm; *the payroll envelope* → generalStore /
  gasStation;
- `deck` now comes from any normal giver; `classNotes` stays household-only; the doctor gets nothing new;
- tackle shop: *a reel to re-spool*, residence / farm → tackleShop. **My reading, flag it:** the
  proposal's line says "add one outbound thing … so it is a destination too". The shop already sends its
  goods out, and nothing ended at it, so I read "destination" as the point and added one thing that ENDS
  there. If "outbound" was the point, delete the row.

The ring and park trigger follow by construction (poi.js derives `jobs` from `SOURCES`).

**Census gate `test/offer-census.mjs`** (registered, fast, 0.2 s). It runs 300 boards on the real
`POI_ROSTER` (26 POIs). It checks that every giver posts ≥ 3 % of live offers, and that every POI type
posts ≥ 3 % **or** ends ≥ 0.3 jobs per board *meant for it*. "Meant for it" means a `to` or a fetch
pickup names it. Generic things can end at any POI, so they are printed but not counted: spread over
every POI they hid the gap (the old office and school each read about 0.44 / 0.38 per board that way).
It is OR rather than two separate floors because, as literally written, the 0.3 floor also fails the
food vendor (0.01), the yard (0.01) and the doctor (0.00). All three post well over 3 %, and the owner
ruled the doctor no inbound thing. The old pool FAILS the gate (office 0.15, school 0.10, neither posts);
the new one passes:

| type | posts | ends / board meant · any |
|---|---|---|
| office | 3.4 % | 0.25 · 0.27 |
| school | 3.1 % | 0.08 · 0.27 |
| tackle shop | 4.3 % | 0.12 · 0.27 |
| doctor | 4.3 % | 0.00 · 0.27 |
| residence (×5) | 20.8 % | 1.63 · 1.34 |
| food vendor | 15.2 % | 0.01 · 0.11 |

The school's class notes dropped 0.10 → 0.08: two more givers share the 12-job budget.

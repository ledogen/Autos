---
id: FEAT-67
type: feature
status: open
severity: major
opened: 2026-08-17
refined: 2026-09-25 (owner planning pass — rulings folded into the body)
source: owner ruling 2026-08-17 — "i want the player to search and optimize the missions they run
        based on the rewards. i think we go the other direction and update planning."
relates: FEAT-53 (the spine this extends), FEAT-46 (POI job source), FEAT-61 (paper route — Larry +
        customers), FEAT-65 (must state terms the same way), FEAT-16 (2D map surface), FEAT-60 (map
        glyphs), FEAT-87 (live rank timer — split out of this ticket 2026-09-25)
invariants: SM-INV-3, SM-INV-4, SM-INV-8, SM-INV-14
amends: design-amendments-2026-08-17.md §1, §2 — and the 2026-09-25 rulings below
---

# FEAT-67: The story map as a mission board — hover a POI, read its offers

> **Keys renamed 2026-10-07 (FEAT-98):** `burgerJoint` → `foodVendor`, `serviceShop` → `autoShop`.
> `missionGiver` is retired: its five slots became the additional classes (pois.md § Places and
> Missions) and its model pool is now `residence`. A farm also carries the `residence` tag.

**Reverses shipped behaviour.** FEAT-53 shipped a *single hidden offer per POI*, and
`data/map-icons.js` still says "finding out what a marker offers is what driving to it is for". Both
are superseded: the story-mode world map becomes the place the player shops for work.

## What the player sees

Hover a mission-source POI on the story map → **one card for one offer**, and that offer's route
drawn on the map. **Q / E cycle** to the previous / next live offer at that POI (the card and the
drawn route follow). Only one route is ever drawn at a time; everything else on the map stays as it
is. That is the whole anti-clutter strategy: detail lives on hover, the map at rest keeps its feel.

The card reads as a sentence, then the terms:

> **Deb** at Burger Barn needs **two bags of takeout** delivered to **the Hadley farm**.
> Base pay **$48** · **3.2 km** · **40 kg** · expires in **18 min**
> Bonus: **Chili dog** — **A or better**

- **Base pay — a single number: what an at-par drive pays**, labelled **"Base pay"** on the card
  (rulings 2026-09-25 / 2026-09-26; replaces the 2026-08-17 `$MIN–$MAX` range and closes that open
  question). Quoting the floor is deliberate: a player is happy to end up earning more. The curve underneath stays continuous (SM-INV-4);
  faster pays more, the card just quotes the par point. Note par is the **C/D boundary**, so this is
  the *least* a passing drive pays: at the par point m = 0.5, at the B line m = 1.0 (2× the quote),
  at S ≈ 1.27 (≈ 2.5× the quote).
- **Distance** — the route length, pickup to destination.
- **Cargo weight** (ruling 2026-09-26) — the load's real mass. It changes how the truck drives.
- **No drive time from the player to the POI** (ruling 2026-09-26): judging whether you can make it
  there before expiry is the player's job.
- **Expiry** — when this offer disappears from the board.
- **Bonus** (optional) — a named item and the minimum rank that earns it. D never earns a bonus.
- **Offer counter** (e.g. `2 / 4`) when the POI has more than one, so Q/E is discoverable.

Under each mission-source icon on the map at rest: a **small timer showing the shortest time until
any of its slots turns over** (an offer expiring, or a recycle ending). That is the moment a new
offer appears there. It is the only always-on addition.

## The offer model (ruled 2026-09-25)

- **POIs have a place name and people.** A mission source is a *place* ("Burger Barn", "Grandma's")
  with one or more named **people** who each post offers. Names come from generated lists, fixed for
  the run once rolled.
- **Destinations are mostly POIs, not always.** Most deliveries end at another POI (so the "place"
  in the sentence is a real named spot). Some end mid-road (DESIGN.md "Where missions and POIs
  live" still holds for those) and need a generated place name ("Mile 4 pullout").
- **Slots, not a posting rate** (ruling 2026-09-26). Each source POI has a fixed number of **slots**,
  and **every slot is always full**. There is no separate posting pace: when an offer expires, a new
  one is rolled into its slot straight away. So the expiry length IS the turnover rate.
  - **Completion keeps the original clock** (ruling 2026-09-27, replaces the 12–24 h recycle). A
    taken offer's expiry timer keeps running. After completion the slot stays empty until that
    original expiry, then rolls a new offer. Completed after expiry → re-rolls at completion.
  - **Cancel penalty** (ruling 2026-09-27, revised same day — replaces `min(2R, R + 24 h)`):
    cancelling a taken offer locks the slot for the offer's **full expiry length L**
    (`expiresH − bornH`), counted **from the moment of cancel** — lock ends at `nowH + L`. The time
    left on the original timer plays no part, so cancelling an offer that has already expired is
    not free (the old formula gave 0 lockout at R = 0). The giver is unhappy with you and won't
    offer work. Without it, accepting jobs you don't mean to finish would be free.
  - **Cancel is a button, and only a button** (ruling 2026-09-27). Canon: the player character
    phones the customer and cancels on them. It is the ONLY thing that abandons a job:
    - Route freedom — driving off the route, going anywhere, leaving the region never cancels.
    - Story mode can't be stopped once started, except by quick save (run-shape.md: save on quit,
      load deletes). A quick save suspends the run with the job still active; it is not a cancel.
    - So `board.abandon` has exactly one caller: the cancel button. The pause-menu exits that end
      story mode today (`pm-menu` / `pm-lab` / `pm-story`) end the whole run and drop the board with
      it — they never call `abandon`. Replacing them with quick save is the save system's job, not
      this ticket's.
    - The button covers both built families: a delivery job (`missionSystem`) and a paper round
      (`paperRouteSystem`) — neither has a mid-job cancel today.
  - These two are the only ways a slot is ever empty.
  - *Single-slot* (Grandma's): one offer at a time. What she needs varies (medication, groceries),
    and so does the reward. *Multi-slot* (food): several live at once, so the player picks the best.
- **Every offer expires.** Reaching the POI before expiry is the player's problem.
- **Expiry noise: ±30 %** on every rolled expiry length.
- **Slots are desynchronised.** Missions must never all turn over at once. At world start each slot
  is given a random *age*, uniform over its rolled length, so it starts partway through its life.
  That lands on roughly what simulating a couple of weeks of warm-up would produce, at no cost.
  (Starting every timer at half its length would line them all up — the thing to avoid.)
- **Timers run on the game day clock.** Sleeping or camping burns offers.
- **Accept by driving to the POI and parking** (as today). The map is for shopping, never accepting.
- **One active mission at a time.** No concurrent contracts.
- **Terms lock at accept** (FEAT-53 ruling: tier AND thresholds). The quoted base pay and bonus gate
  are exactly what the run is graded against.
- **Not every POI is a mission source.** Some stores are just stores; the gas station probably has
  none. Sources are chosen per POI type, as a way to enrich the world through missions tied to shops
  (a "favor" relationship is floated, not decided — out of scope here).

## Bonus rewards (ruled 2026-09-25)

- **Gate per offer: C+, B+, A+, or S-only.** High-skill play chases S-only offers because they carry
  the best rewards at real risk of missing them; cautious play takes B+ and C+ offers. **D never
  earns a bonus** — D exists to tell you that you were slow.
- **Rewards are themed to the source.** Burger Barn → food for a fast finish; Grandma → a themed
  gizmo or consumable; the (rare) auto parts store → a spare tire or similar vehicle part.
- Tiering across ranks (tire at B, + rear suspension at A…) from the 2026-08-17 amendment stays legal.
- **Scope here: named and displayed, the grant is stubbed.** Settlement records which bonus was earned;
  real inventory effects wait for the items system. Items die with the run (SM-INV-8).

## Source table (ruled 2026-09-26)

Expiry lengths below are the centre value; each roll gets ±30 %. Units are game time.

| Source | Slots | Offer expiry | Notes |
|---|---|---|---|
| Gas station | — | — | Not a source |
| General store | 2 | 1 day | |
| Food (burger joint etc.) | 3 | 2 h | Fast turnover, pick the best |
| Larry's (paper route) | 1 | 3 days | |
| Auto service station | 1 | 2 days | |
| Generic POI (today's orange diamond) | 1 | 1–3 days | Centre rolled per POI in 1–3 d, then ±30 % |

After completion a slot waits out the offer's original expiry; after a cancel, the offer's full expiry length from the moment of cancel.

## Content tables (the big authoring job — owner co-authors the lists)

The owner writes the word lists; code supplies the grammar and seeds the picks. New data files, one
table each, all seed-driven:

- **Person names:** `[firstname] "[nickname]"? [lastname]` — the nickname is optional, e.g.
  `Deb Hadley`, `Earl "Two-Tone" Pruitt`. First names split into **male** and **female** lists (ruling
  2026-09-26); sex is rolled first and will also pick the RPG-style character portrait from the
  matching pool (portraits not built yet), so name and picture always agree.
- **POI names**, two forms:
  - `[person firstname]'s [adjective]? [business type]` — e.g. `Deb's Burgers`, `Earl's Honest Tires`.
  - `["the"]? [adjective]? [business type / pseudonym]` — pseudonyms like tires, cheese, meatball,
    sandwich, gas, shoppe, market, mart — e.g. `The Meatball`, `Big Mart`.
- **Things** — per source family: takeout, groceries, medication, parts, lumber… each with a sentence
  phrase ("two bags of takeout") and, later, the freight/fragile hooks.
- **Places** — names for mid-road destinations, picked at random from a fixed list (`LANDMARKS`)
  or `the [lastname] [place noun]`. Every landmark must be **believably empty** — it must not promise
  an object that will not be there. Names derived from real road features (crest, creek crossing)
  were considered and ruled out 2026-09-26: keep it a plain list.
- **Reward pools** — per source family, drawing from `.planning/story-mode/items.md` (consumables,
  tools, parts), each entry with the rank gate(s) it may appear at.
- **Source table** — the table above, plus which thing/reward pools each source draws from.

## Rulings 2026-09-26 (plan review)

- **Food vendor, not the burger joint you were fired from.** `foodVendor` reads as *any food
  vendor*. You deliver ready-made meals as an independent contractor (a Grubhub-style gig), not as
  staff, so opening.md's "never work there again" holds. Later regions add more vendors (donuts,
  hot dogs, pizza) under rolled names. Food jobs are the bottom of the barrel: short, low-paying,
  posted often — filler for the last hours of a day.
- **Larry's slot empties after a round like everyone else's, and the income floor moves.** You can't deliver a second paper
  to the same customer on the same day. The floor is now the board itself: there are always more
  offers live than the player can finish before one turns over. This amends missions.md's
  "reliably available" paper-route floor.
- **Larry is just "Larry"** and posts papers only.
- **Bonus share 25 %.** A bonus offer **pays less cash** (`BONUS_PAY_MULT`, placeholder 0.5): take it
  only if you want the item. This is a multiplier on the whole payout line, so pay stays continuous.
- **Gates are equally likely** (C/B/A/S 25 % each). Reward value will track gate difficulty through an
  item rarity ladder (common → legendary) once items are fleshed out.
- **Destinations: 50 % POI, 50 % roadside.** Destination POIs use the same name lists.
- **People per POI:** usually 1, sometimes 2, rarely 3 (weights 0.75 / 0.20 / 0.05).
- **Service shop things:** muffler, wheel bearings, drive shaft, body panel, windshield (fragile —
  waits for that family), hubcap, tailgate, headlight, taillight.
- **Giver naming by model** (ruling 2026-09-27): many generic givers are not homes (an RV, a
  broken-down car, later a hitchhiker). Each giver model carries a flag in `data/prop-models.js`:
  home-style models get "the Hadley place"; the rest are named by the person alone.
- **Bonus pay cut confirmed** at 0.5×.
- **Pronouns:** phrases stay neutral ("their prescription").
- **Smaller calls — proposed defaults accepted:** completion = any settled result, D included; Larry's
  card shows base pay only; hovering an offer mid-mission temporarily replaces the drawn route; an
  empty or recycling diamond draws grey; same seed gives the same board.

## Map icon changes (bundled here)

- **Larry's POI → the newspaper glyph** (`NEWSPAPER` in `data/map-icons.js`), replacing the house.
- **Newspaper customers → small white diamonds** off-route (today they are white *circles*). The
  on-route newspaper glyph stays as it is unless re-ruled.
- **Diamond colour by mission family** (ruling 2026-09-26, a table lookup, not code):
  simple delivery = **green**, fragile cargo = **orange**, papers = **white**, demolition / smash the
  props (FEAT-65) = **red**, freight = **blue** (ruling 2026-09-26).
  **Only diamonds take a family colour.** Glyph POIs (burger, store, service, Larry) keep their own
  glyph colour. Diamonds are single-slot, so a diamond's colour is simply its current offer's family
  and a mixed-colour case never arises. **Food posts standard delivery only** (ruling 2026-09-26).

## Freight on the card (ruled 2026-09-26)

Freight (missions.md §3c) is not a simple delivery with a heavier box. It is paid a **flat rate by
mass × distance**, with no margin, and the load's mass is what makes it hard: you can't corner, the
brakes fade, and it overheats on long climbs. So the freight card differs from the others:

- **Pay line is flat**, not base pay: `Pays $X flat` from the mass × distance rate. Nothing on a
  freight card is par-based.
- **Cargo weight carries the offer.** It is the number the player chooses on, so it is shown
  prominently.
- **Bonus rule: left open.** Time is the wrong axis for a mission meant to be driven slowly. Load
  condition or truck wear are candidates; this is decided when freight is built. FEAT-67 only has to
  leave room on the card for a freight bonus line.
- **Freight is not built yet.** FEAT-67 ships the card layout and colour so a freight offer drops in
  as data; it does not implement freight.

## Deferred / not in this ticket

- **Live rank timer during the drive → FEAT-87** (was Phase C here).
- Player capabilities that expand what the map shows over time (e.g. seeing further, seeing offers
  before visiting a region) — noted direction, not scoped.
- Favor/reputation with shops — floated, not decided.
- Real item grants (Phase D proper) — waits for the items/inventory system.

## Shape

- **Phase A — offer model.** `_offers` in `src/mission.js` becomes a per-POI board: people, always-full slots,
  noisy expiry, completion wait and cancel lockout on the game clock, bonus (item + gate + optional tiers), and a par-pay figure that
  **recomputes from `ECONOMY_PARAMS`, never cached** (FEAT-53 Phase D will retune those tables).
- **Phase B — content tables.** People / things / places / reward pools / source table, seed-rolled.
- **Phase C — map surface.** Hover card, Q/E cycling, single drawn route, turnover timer under
  sources, Larry + customer icon changes.
- **Phase D — settle.** Record the earned bonus per achieved rank (grant stubbed).

## Acceptance

- [x] (awaiting owner review) Hovering a mission-source POI on the story map shows a card: person, thing, place, base pay,
      distance, cargo weight, expiry, and bonus + rank gate when present; the offer's route is drawn
- [x] Q / E cycle through a POI's live offers; the card and route follow; only one route is drawn
- [x] Sources show the shortest slot-turnover time under their icon; non-source POIs show nothing new
- [x] Every slot is always full except after a completion (until the original expiry) or a cancel
      (locked `nowH + L`, L = the offer's full expiry length — never free, even past expiry); expiry rolls ±30 %
      on the game clock; slots start desynchronised (no two slots of a POI turn over together at load)
- [x] Offers are accepted only by driving to the POI; only one mission can be active at a time
- [x] An active job (delivery or paper round) can be cancelled only by an explicit cancel button
      ("call the customer"); leaving the route or region never cancels
- [x] The quoted base pay equals what settlement pays for an at-par drive, from `ECONOMY_PARAMS`
- [x] The card supports a flat-pay variant (freight) with no par-based figures, and a blue diamond
- [x] D never earns a bonus; a gate of X+ is earned at X or better
- [x] Larry's POI draws the newspaper glyph; customers draw as small white diamonds off-route
- [x] Gates: extend `test/economy.mjs` (base pay tracks the tables; bonus gate resolution) and
      `test/story-poi.mjs` (§7 single-offer expectations → the board model)
- [ ] `npm run test:all` green pre-commit

## Open (owner's call)

- **Freight's bonus measure** (load condition? truck wear?), decided when freight is built.
- Fold these rulings into missions.md "The job board — discovery and expiry" (still marked OPEN).
- The list contents themselves (owner authoring session).

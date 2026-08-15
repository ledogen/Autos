---
id: FEAT-61
type: feature
status: open
severity: major
opened: 2026-08-04
source: SM-2 milestone — first real mission type (plan-mode session 2026-08-04)
relates: FEAT-53, FEAT-59, FEAT-60, FEAT-46, FEAT-43, FEAT-29
invariants: SM-INV-2, SM-INV-3, SM-INV-4, SM-INV-12, SM-INV-14
plan: .planning/handoffs/HANDOFF-2026-08-04-paper-route.md
handoff: .planning/handoffs/HANDOFF-2026-08-15-paper-route-merge.md
prev_handoff: .planning/handoffs/HANDOFF-2026-08-11-paper-route-playable.md
amended: 2026-08-05 (owner rulings — scoring simplified, houses split from the POI roster)
---

# FEAT-61: The paper route — SM-2's first real mission type

## Request

`missions.md` §2 calls the paper route *"the first real mission type"* and the carrier of the
**coverage** axis; `opening.md` makes **Uncle Larry** the person who hands it over and the gate on
better routes. SM-2's spine (FEAT-53) is built and owner-verified, so the economy this scores into
already exists.

As of the 2026-08-05 ratification it is also **the income floor** — the day job is destroyed in the
opening, so this is the only reliably-available earner. It must be reliably poor and never dead-end a
run at zero.

**Outcome:** from Larry's place you take a route, hear him explain it once, drive a loop landing rolls
on their targets, and get paid per paper by how well you placed it. Run it clean and fast and he gives
you a bigger route.

**Base plan:** `.planning/handoffs/HANDOFF-2026-08-04-paper-route.md`. The owner rulings of 2026-08-05
amend it and are authoritative where they disagree; this ticket carries the amended design.

## Phase A — the two doc amendments [DONE]

Both landed in `missions.md`:

1. **The route has a deadline** — §2's *"not a timer, it's an inventory and a sunset"* struck and
   replaced with a par-derived, diegetic clock under SM-INV-3's timer-flavor allowance.
2. **Accuracy is the fifth scoring axis** — a row in the scoring-axes table, the status board moved
   from "Four" to "Five", and the design act stated as such rather than smuggled in.

## Scoring [OWNER-RULED 2026-08-05 — supersedes the handoff's `ratioEff` model]

The handoff folded coverage, accuracy and time into one effective ratio through `payoutFor()`.
Over-built. **Flat rate per delivery, scaled by accuracy** — the shape `missions.md` §3b/3c already
use, licensed by DESIGN.md's *"not every mission type is scored on margin… rank is computed
per-axis."*

### Accuracy — confirmed

    TARGET_R  = 3 m            (6 m diameter)
    ACC_FLOOR = 0.30
    q(d)      = 1 − (1 − ACC_FLOOR) × (d / TARGET_R)      d ≤ TARGET_R
              = 0, not a delivery, paper spent            d >  TARGET_R

Dead centre `q = 1.00`; the worst throw that still counts `q = 0.30`; linear between. **The 1 m ring
is decoration** — the metric is continuous distance from the centre point.

*Accepted discontinuity:* 2.99 m pays 0.30 of a paper, 3.01 m pays nothing. A delivery is binary; the
cliff is the property line.

### Payout

    delivered      = papers inside a customer's circle
    effDeliveries  = Σ q(dᵢ)                              (≤ delivered ≤ customers)
    spot           = FLAT × q(dᵢ)                         banked AS EACH PAPER LANDS
    payout         = FLAT × customers × expedite(ratio)   settled at the bell — TIME ONLY

- **Partial routes pay.** No coverage multiplier — deliveries made are money kept, which is what an
  income floor means.
- **`FLAT` is par-anchored** [owner-ruled]: `FLAT = k × parRoute × dayTier(day) × PAPER_W /
  customers`, `PAPER_W = 0.6`. A perfect route at par pays ~60% of a point-to-point at par, and it
  tracks the day tier instead of decaying to irrelevance by day 15.
- **Expediency bonus, completed routes only** — you cannot finish early without finishing:

      ratio    = elapsed / parRoute
      expedite = BONUS_MAX × clamp((TOLERANCE − ratio) / (TOLERANCE − EXPEDITE_FULL), 0, 1)
                 …and 0 unless every customer was delivered

  `EXPEDITE_FULL = 0.70`, `BONUS_MAX = 7/6`. **Superseded numbers** (`EXPEDITE_ON = 0.90`,
  `BONUS_MAX = 0.40`) kept here only as provenance — see the Rank section for what replaced them
  and why the two are locked together.

### Rank — SUPERSEDED [AMENDED 2026-08-14, owner]

> **ACCURACY PAYS, THE CLOCK GRADES.** The rank is now **`gradeRun(elapsed / par)`** — the par
> ratio, gated on full coverage — and accuracy is confined to scaling the per-delivery rate. Par is
> a **B** and B contains par (SM-INV-3's amendment holds here too); dawdling is a C. The expediency
> bonus grows to **0.70** and applies to the **full** flat (`n × FLAT`) rather than the
> accuracy-scaled sum, which is what makes a rim-scraping blast pay about what a methodical drive at
> par pays. On the scaled sum the same equivalence needs 233%, which is not a tunable number.
>
> `gradeRun()` IS now called by this mission; `payoutFor()` still is not. See `missions.md` §2 for
> the full amendment and its arithmetic.
>
> **STATUS: IMPLEMENTED 2026-08-14** (`daaa665`). `letterFor` and `PAPER_PARAMS.rank` are deleted;
> `scoreRoute` grades through `gradeRun()`. Two further owner amendments landed on top of it:
>
> - **Par scales with coverage** [2026-08-15, `d2f773f`]. An incomplete round is graded against
>   `par × coverage` rather than handed a flat D — skipping people cannot buy time, because it
>   shrinks the clock you are held to by exactly as much.
> - **Accuracy is paid ON THE SPOT and $0 sits at the BELL** [2026-08-15, `2cc0926` / `588d786`].
>   Accuracy money is banked as each paper lands (`EconomySystem.addSpot`), so the end-of-route
>   settlement is a pure function of time. The bonus ramps from `tolerance` down to `expediteFull` —
>   there is no `expediteOn` constant, so the payout floor and the deadline cannot drift apart — and
>   `bonusMax` is **7/6**, forced by the equivalence now that par is only partly into the ramp.
>
> **Owner-confirmed 2026-08-15: "payout curve is good".**

The superseded model, for provenance: `score = coverage × meanAccuracy`, thresholds
`C ≥ 0.50 · B ≥ 0.75 · A ≥ 0.90 · S ≥ 0.98`; one of nine ⇒ `score ≈ 0.11` ⇒ **D**, and it still paid
for that one. `pointsFor(letter)` is called unmodified either way — a bad route earns money and no
good deeds — and `EconomySystem.settle()` remains the single money path.

### Par prices the stops [FIXED 2026-08-14]

A delivery pins the reference driver to **zero** at the porch (`stop` on the segment; the one place
`par.js`'s `vMin` floor does not apply) and charges **no dwell** — the cost is the braking and the
re-acceleration, derived from the truck's own figures, measured at 3.0–6.0 s per stop and varying
with the road either side of the house. Before this, par drove straight past every porch at 73 km/h
and the expediency bonus was unreachable by construction.

## Deadline, stock, tiers

- **Deadline** `parRoute × PAPER_TOLERANCE` (1.2). Soft by construction — the bell only stops you
  earning more.
- **Tier ladder 4 → 9 → 12 → 15** [owner-ruled: go to 15 houses]. One perfect route advances one
  tier. `paperRouteTier` lives on the **run layer** — re-earned every run.
- **Spares interpolate:** +100% at tier 1 (4 customers ⇒ 8 papers) → +30% at tier 4 (15 ⇒ ~20).

## Houses [OWNER-RULED 2026-08-05, plus one implementation finding]

15 newspaper customers in a **1 km radius**, separate from the FEAT-60 roster.

**The finding that shapes this: houses must not be lay-by pads.** Measured on seed 6, the viable pad
pool holds **43 pads region-wide but only 8 within 1 km** — and FEAT-60's `nearSpawn` slots (mom's,
Larry's) consume two of those. 15 house *pads* inside 1 km is geometrically impossible, and relaxing
the radius to reach it would silently defeat the ruling.

It is also the wrong shape. **A customer is a target you throw at from the road** — you never park at
one, never open an offer, never interact. So a house needs no pad, no earthwork, no `setPoiPads`
entry:

- **Sited along edges, not one-per-edge.** Reuses `_placeOnEdge`'s shoulder-offset math and the same
  water / junction reject battery, but walks each edge at a minimum arc spacing, so a ~640 m edge can
  carry several customers — which is what a residential road looks like anyway.
- **Count is hard, radius relaxes** — FEAT-60's rule, same shape as `_pickNearSpawn`.
- **Zero contact with the carve.** No pads means the FEAT-46 determinism guarantee and the
  `story-poi` gate are untouched by this feature. This is the main reason to prefer it.
- **Structurally invisible to ordinary missions.** Houses live in their own list, so the mission
  planner reading `poiSystem.list()` cannot target them. The owner's "most missions must not go to
  houses" needs no weighting hack — it falls out.

### Versatile tagging [owner-ruled]

FEAT-60 gave each POI a single `type`. Mom must be *a roster POI, a newspaper customer, and somewhere
you can sleep* at once, so `type` alone can't carry it. POIs gain **`tags`** (a string array) beside
`type`; `type` stays the roster slot and primary identity.

- **Mom** — `type: 'momsHouse'`, `tags: ['newsCustomer', 'sleepable']`. She is a customer.
- **Larry** — `type: 'larrysHouse'`, no `newsCustomer` tag. He is the mission *start*; delivering to
  the man who gave you the papers is nonsense.
- **Houses** — `tags: ['newsCustomer']`.

Customer pool = the 15 houses + mom.

## Presentation [OWNER-RULED 2026-08-05]

- **Target ring** 6 m diameter reusing the existing ring pool, plus a **1 m centre ring** as an aim
  point.
- **The thrown paper freezes where it lands** as visual feedback. Needs a despawn rule (route end)
  and a live cap.
- **Achieved accuracy is displayed on landing.**
- **Orange POI rings are suppressed for the duration of any mission.** FEAT-60 already cut them to a
  50 m near-field; this adds mission-time suppression on top. Houses never draw one.

## Scope

- `src/dialogue.js` + `#dialogue-panel` — sequential cards, **no dialogue options**, `.dlg-key`
  glyphs, `seen` on the run layer.
- `src/throw.js` — hold-**F** aim (camera seam), release to launch, projectile with gravity **and
  quadratic drag** (drag added 2026-08-07, reversing the first ruling) inheriting vehicle velocity,
  `spawnModel('newsRoll')`, tumbling in flight, frozen where it lands. The solver returns the flown
  path so the renderer replays the arc that produced the score rather than a second one.
- `src/poi.js` — `tags`, and the house pass (`buildHouses`) beside the roster.
- `src/main.js` — target + centre rings, mission-time ring suppression, accuracy readout.
- `src/paper-route.js` — sibling of `MissionSystem`: tour + one `computePar()`, deadline, delivery
  detection, flat-rate settlement, tier advance.

**Out of scope:** modelled houses/mailboxes (FEAT-60), box-physics on the roll, the burger-joint
opening and the walk-to-Larry tutorial.

## Acceptance

- `q(0) = 1.0`, `q(3) = 0.30`, linear; `d > 3 m` is not a delivery.
- **Partial routes pay** — 1 of 9 pays for the one. *(Amended 2026-08-15: the LETTER is now the par
  ratio against a par scaled by coverage, so 1-of-9 taking full time is a D but 1-of-9 in a ninth of
  the time is not — skipping people cannot buy time.)*
- **The expediency bonus is unreachable without full coverage.**
- **One par, one oracle** (SM-INV-2): `computePar()` once over the tour.
- **`payoutFor()` is not called**; `settleFlat()` + `addSpot()` are. *(Amended 2026-08-14:
  `gradeRun()` IS now called — the rank is the par ratio, through the same function every other
  mission type grades with.)*
- **Houses generate always**, deterministic and window-invariant; the tier only chooses customers
  (SM-INV-12). *Amended 2026-08-11 (owner): the rings are per-rung and HARD — 1.0 / 1.5 / 2.0 /
  2.0 km — and they no longer relax outward to chase the count. Placement fills them innermost
  first from `houseRungs()`, which is what makes each rung servable and makes the nesting
  structural. `poiHouseCount` and `poiHouseR` no longer exist; the ladder is the source of truth.*
- **OWNER-VERIFIED DIFFICULTY, PAR AND PAYOUT — [MET 2026-08-15].** The owner drove the route
  across four sessions and ruled: *"par on paper route feels good"* and *"payout curve is good"*.
  Both were wrong when first driven and both were fixed against measurement rather than taste —
  see "Par prices the stops" and the scoring amendments above.
  - Still feel-tuned rather than calibrated, and NOT blocking: `throwSpeed = 16`, `dragK = 0.033`
    (one drive, 2026-08-07), and FEAT-63's re-plan knobs (`RR_OFF_M` 45 m, `RR_OFF_S` 2 s,
    `RR_MIN_SHOW_S` 0.4, `RR_STALE_M` 50) which were reasoned about and never felt. The debug
    folder in Phase F is what turns these from guesses into dials.
- **Houses never appear in `poiSystem.list()`** — the structural form of "most missions don't go to
  houses".
- **Mom carries both tags**; Larry carries no `newsCustomer`.
- **Gates** (subsystem `story`): `paper-route.mjs` (accuracy curve, partial payout, bonus gating,
  ranks, spares, no NaN at zero deliveries), `paper-houses.mjs` (heavy — count met, window-invariant,
  off water/junctions, tier-independent, absent from `list()`), `throw.mjs` (ballistics + freeze
  point). `story-poi`, `mission-network`, `economy`, `par-oracle`, `day-clock` stay green;
  `npm run test:all` before merge.

## Phases — state at 2026-08-15

**A — Docs** [DONE, `c95a2cc`] · **B — Dialogue** [DONE, `8624861`] · **C — Houses** [DONE,
`39e433c`] · **D — Throw** [DONE, `07a073d`] · **E — The mission** [DONE — part 1 `e99fe1e`,
part 2 `5400b1a`] · **F — Gates + housekeeping** [PARTIAL — the only thing left before merge]

> **THE MISSION IS FINISHED AND OWNER-APPROVED** as of 2026-08-15, bar Phase F. Par, the payout
> curve and the scoring model are all owner-ruled and implemented. What follows in this section is
> the historical record of how it got there; **`### What remains` below is the only live list.**

**THE MISSION IS PLAYABLE AND THE OWNER HAS DRIVEN IT** (2026-08-10/11): *"pretty hard lol — very
challenging in a good way hard"*, and hard enough that they asked for it as a menu-launchable
scenario (FEAT-62). Five owner drives found and fixed: the target rings lying (every region customer
wore one, so 12 of 16 were decoys), the missing staging threshold, GPS not following the route, the
tour driving whole streets and turning around, the guidance going blank at a turnaround, and the
free-roam teleport dragging the region centre with it. All closed; see the handoff.

Remaining before merge: `test/paper-houses.mjs`, a debug folder for `PAPER_PARAMS`/`THROW_PARAMS`/
`poiHouse*`, the MILESTONES SM-2 paragraph, and the merge itself (which brings FEAT-60 with it).

### Phase E part 2 — what landed

`PaperRouteSystem` (`src/paper-route.js`), a sibling of `MissionSystem`:
`idle → planning → offer → running → done`. Larry's roster row is `jobs: true` and the park trigger
branches on his type; the briefing plays *over* the routing, and the offer is held until both
finish. Stock is spent at release and refunded when the solver produces no flight; a landing credits
one customer once; the route ends on the bell, the last porch, or the last paper LANDING. It settles
through `settleFlat` and moves the ladder. New DOM: `#paper-panel` / `#paper-hud`, sharing the
mission panel's chrome by selector.

**Two things the ruling assumed that measurement contradicted:**

1. **Tour routing is not expensive — it is 1–4 ms.** Every edge in the region is already routed when
   the region goes live, so the tour is cache hits. The hold-the-offer-behind-the-briefing design is
   kept anyway (it costs nothing and it is the right shape), but the risk is closed.
2. **A stop is a STREET, not a junction.** The first tour visited each customer's nearest edge
   *node*; the new `test/paper-tour.mjs` gate caught that this left **five of six customers never
   approached** — a house sits mid-edge, up to most of a 640 m street from either junction. A stop is
   now the customer's edge, entered at the near junction and left at the far one, so the whole street
   is driven. Everyone on a street the route drives is on the route.

### The supply problem [FIXED — BUG-44]

The ratified **15 customers inside 1 km** was not being met: at the live 2500 m region radius the
placement pass produced 6 / 11 / 4 customers on seeds 6 / 11 / 42. Two causes, both fixed:

- **`poiHouseSpacing` 90 m → 30 m.** The parameter was documented as house *spacing* but is really
  the **candidate step** — how often the walk looks — while `poiHouseMinSep` (80 m) is what actually
  decides how far apart chosen customers end up. A severe reject battery (97% of sites fail the
  flat-ground test, because unlike a lay-by pad nothing carves a target circle flat) over a coarse
  sample yields almost nothing. At 30 m all three seeds place the full 15, with the closest chosen
  pair still 99–197 m apart. Costs ~110 ms once per region, behind the loading screen.
- **Customers may not sit on an edge that straddles the region wall.** The tour plans on the same
  region-filtered graph the missions do, so such a customer is unroutable and the route skips them
  silently, forever — three of seed 6's sixteen. The ring relax now stops at
  `radius − REGION_MARGIN`. This is the one place "count is hard, distance relaxes" must yield.

The cliff cap, the target radius and the ring geometry were all left untouched.

**Route sizes that fall out** (seed 6, live region radius): tier 1 = 4 customers / 2.61 km /
par 2:32 · tier 2 = 9 / 15.7 km / 14:44 · tier 3 = 12 / 17.9 km / 17:42 · tier 4 = 15 / 23.0 km /
23:49. Whether a 24-minute top-tier route is the right size is a play judgement — see the open
questions.

`feature/poi-models` (FEAT-60) was merged into this branch first, so the roster and the house pass
were built together rather than reconciled afterwards. `npm run test:all` green, 46 gates.

### What remains — PHASE F ONLY [live list, 2026-08-15]

Phase E part 2 is built in full — the state machine, the tour and its one par, the throw wired to
the route, the result card and the tier advance. Everything below is the housekeeping.

1. **`test/paper-houses.mjs`** — the heavy house gate: count met per rung, window-invariance from
   two stream centres, never on water or a junction pad, tier-independence (SM-INV-12), and houses
   absent from `poiSystem.list()`. Verified by hand in Phase C and never gated. Register it in
   `test/gates.mjs` beside `paper-tour.mjs` (subsystem `story`, cost `heavy`).
2. **A debug folder** for `PAPER_PARAMS`, `THROW_PARAMS` (`throwSpeed`, `dragK`), the `poiHouse*`
   knobs, and FEAT-63's `RR_*` re-plan knobs. None are on sliders and the phase-housekeeping rule
   says they should be — several are feel-tuned by one drive, and two were never felt at all.
3. **The MILESTONES SM-2 paragraph.**
4. **Merge** (brings FEAT-60 with it) — see `.planning/handoffs/HANDOFF-2026-08-15-paper-route-merge.md`.

### First drive — four fixes [2026-08-09]

The owner drove it. Four things came back, all fixed:

1. **Typo** in Larry's first card ("Here's what you ya gotta do").
2. **The route now STAGES.** Accept no longer starts the clock — Larry's marker takes the same green
   threshold a POI job uses (`START_ZONE_R`, now exported from `mission.js`), and the route begins
   when you drive out of it. Same ring, same words, same promise.
3. **GPS follows the route.** `gpsSystem.getRoute` returns the tour while carrying, so the guidance
   is the route the par was computed over. No re-routing and no fallback was needed — the tour is
   already baked as segments, which is exactly what the overlay consumes.
4. **THE DELIVERY BUG — the target rings were lying.** A region holds 16 customers and a tier-1
   route visits four, but `_rebuildPoiMarkers` lit a green circle on *every* customer. Twelve of the
   sixteen targets on screen were decoys: a paper landed dead centre in one scored nothing, and
   because the miss read-out was distance-gated it said nothing either, which reads exactly like a
   broken mission. Now only the route's **undelivered** customers are lit (a ring going out is the
   delivery confirmation), and on a route a throw **always** answers.

The scoring path itself was never broken — but nothing pinned it, which is why a lying renderer
could not be told apart from a broken mission. `test/paper-tour.mjs` now drives a whole route
headlessly through `PaperRouteSystem`: offer → staging → threshold → a paper dead centre credits at
q = 1.00 and moves the counter → a second paper on the same porch is spent not double-counted → a
paper on an off-round customer scores nothing → the last porch ends it → S, settled, next rung.

### Live checks — mostly RUN as of 2026-08-15

The owner has driven the route across four sessions. What remains unverified by eye, and is worth a
look during the merge smoke test rather than being treated as a blocker:

- Larry's cards advance on any key and do not replay within a run.
- Hold F actually rotates the view onto a porch, and the roll leaves on the camera heading with the
  truck's velocity added.
- The 6 m rings and 1 m pips sit on believable ground at all 15 houses.
- Orange rings vanish once a job is taken and come back when it settles.

## Risks

- **Tour routing cost — resolved by ruling:** assume expensive; **hold the briefing cards until
  routing completes**. Best case invisible, worst case a short pause after accepting.
- **FEAT-60 merge — resolved:** `feature/poi-models` was merged into this branch on 2026-08-05
  before any code was written, so the roster and the house pass were built together rather than
  reconciled afterwards.

## Where the work happens

Worktree `/Users/ledogen/CodeShit/CarGame-paper-route`, branch `feature/paper-route`.

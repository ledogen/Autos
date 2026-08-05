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
    payout         = FLAT × effDeliveries × (1 + expedite)

- **Partial routes pay.** No coverage multiplier — deliveries made are money kept, which is what an
  income floor means.
- **`FLAT` is par-anchored** [owner-ruled]: `FLAT = k × parRoute × dayTier(day) × PAPER_W /
  customers`, `PAPER_W = 0.6`. A perfect route at par pays ~60% of a point-to-point at par, and it
  tracks the day tier instead of decaying to irrelevance by day 15.
- **Expediency bonus, completed routes only** — you cannot finish early without finishing:

      ratio    = elapsed / parRoute
      expedite = BONUS_MAX × clamp((EXPEDITE_ON − ratio) / (EXPEDITE_ON − EXPEDITE_FULL), 0, 1)
                 …and 0 unless every customer was delivered

  `EXPEDITE_ON = 0.90`, `EXPEDITE_FULL = 0.70`, `BONUS_MAX = 0.40`. Tunable.

### Rank (per-axis; SM-INV-4 untouched)

`score = coverage × meanAccuracy`, `coverage = delivered / customers`. One of nine ⇒ `score ≈ 0.11` ⇒
**D**, *and it still pays for that one*. Thresholds `C ≥ 0.50 · B ≥ 0.75 · A ≥ 0.90 · S ≥ 0.98`.
`pointsFor(letter)` is called unmodified — a bad route earns money and no good deeds.

**`payoutFor()` and `gradeRun()` are not called by this mission.** Both are par-ratio machinery for
margin-scored types. `EconomySystem.settle()` remains the single money path.

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
- `src/throw.js` — hold-**F** aim (camera seam), release to launch, gravity-only projectile
  inheriting vehicle velocity, `spawnModel('newsRoll')`, freeze on landing.
- `src/poi.js` — `tags`, and the house pass (`buildHouses`) beside the roster.
- `src/main.js` — target + centre rings, mission-time ring suppression, accuracy readout.
- `src/paper-route.js` — sibling of `MissionSystem`: tour + one `computePar()`, deadline, delivery
  detection, flat-rate settlement, tier advance.

**Out of scope:** modelled houses/mailboxes (FEAT-60), box-physics on the roll, the burger-joint
opening and the walk-to-Larry tutorial.

## Acceptance

- `q(0) = 1.0`, `q(3) = 0.30`, linear; `d > 3 m` is not a delivery.
- **Partial routes pay** — 1 of 9 yields a **D** and a non-zero payout.
- **The expediency bonus is unreachable without full coverage.**
- **One par, one oracle** (SM-INV-2): `computePar()` once over the tour.
- **`payoutFor()`/`gradeRun()` are not called**; `settle()` is.
- **15 houses generate always** inside 1 km (radius relaxing only if the network cannot supply),
  deterministic and window-invariant; the tier only chooses customers (SM-INV-12).
- **Houses never appear in `poiSystem.list()`** — the structural form of "most missions don't go to
  houses".
- **Mom carries both tags**; Larry carries no `newsCustomer`.
- **Gates** (subsystem `story`): `paper-route.mjs` (accuracy curve, partial payout, bonus gating,
  ranks, spares, no NaN at zero deliveries), `paper-houses.mjs` (heavy — count met, window-invariant,
  off water/junctions, tier-independent, absent from `list()`), `throw.mjs` (ballistics + freeze
  point). `story-poi`, `mission-network`, `economy`, `par-oracle`, `day-clock` stay green;
  `npm run test:all` before merge.

## Phases — state at 2026-08-05

**A — Docs** [DONE, `c95a2cc`] · **B — Dialogue** [DONE, `8624861`] · **C — Houses** [DONE,
`39e433c`] · **D — Throw** [DONE, `07a073d`] · **E — The mission** [PART 1 DONE, `e99fe1e`] ·
**F — Gates + housekeeping** [PARTIAL]

`feature/poi-models` (FEAT-60) was merged into this branch first, so the roster and the house pass
were built together rather than reconciled afterwards. `npm run test:all` green, 46 gates.

### What remains — Phase E part 2

The scoring core is built and gated (`test/paper-route.mjs`, 45 checks). What is NOT built is the
mission around it, because it needs live driving to verify honestly:

1. **`PaperRouteSystem`** — the state machine `idle → offer → briefing → running → done`, a sibling
   of `MissionSystem` rather than a mode inside it (`src/mission.js` is 871 lines shaped end-to-end
   around one start and one end, and four gates pin its settle path).
2. **The tour + par.** Nearest-neighbour tour from Larry over `poiSystem.customers()`, legs built
   with `mission.js`'s graph adjacency + Dijkstra, concatenated, and **one** `computePar()` over the
   whole thing (SM-INV-2). Per the ruling: assume it is expensive and **hold the briefing cards
   until routing completes** — the player reads two cards while it runs, which is free cover.
   `mission.js`'s `MAX_EDGES = 9` cap does not apply to a 15-stop tour; measure before trusting it.
3. **Wiring the throw to the route** — today `_throwRoll()` scores against the nearest customer and
   prints the distance, which proved the rings and the ballistics agree. It needs to instead consume
   stock, record the delivery against a specific customer (once each), and end the route on the bell
   or the last paper.
4. **The result card + tier advance**, settling through `EconomySystem.settleFlat`.
5. **Housekeeping (F):** a `paper-houses.mjs` heavy gate (count met, window-invariance, off water and
   junctions, tier-independence, absent from `list()`), a debug folder for `PAPER_PARAMS`/
   `THROW_PARAMS`/`poiHouse*`, and the MILESTONES SM-2 paragraph.

### Live checks nobody has run yet

Everything below Phase A is gate-verified and **has not been driven**:

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

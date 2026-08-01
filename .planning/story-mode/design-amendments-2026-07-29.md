# Proposed amendments — DESIGN.md, 2026-07-29

*Written in the doc's ratification ritual so it can be folded in directly. All five decisions below
came from the project owner on 2026-07-29. Wording is a proposal; the decisions are not.*

> **STATUS: FOLDED IN 2026-07-29. DESIGN.md is current — read it, not this.** All five amendments
> have been written into DESIGN.md as the "Ratification pass 2026-07-29" (SM-INV-12 rewritten,
> SM-INV-8 narrowed, SM-INV-11 re-keyed, SM-INV-2 flagged for retirement, new SM-INV-14/15, new
> "The garage" and "Run shape and saving" sections, Open Q3 resolved, Tensions table updated) and
> into MILESTONES.md SM-4/SM-5. **This file is now the provenance record and the fuller argument
> for each decision, not a live override.** If it ever disagrees with DESIGN.md, DESIGN.md wins.
>
> **Three things below were superseded on 2026-08-01 and must not be built from this file:**
> (a) `payout = absoluteSecondsUnderPar` and `XP = parGeometric × (1 + k·marginRatio)` — payout is now
> **continuous in the par ratio** with a par-scaled base, and **XP is retired** in favour of mission
> points; (b) `parEffective` — the run-duration par clause is **retired**, the ramp moved to the rank
> thresholds; (c) **~10–15 days per run** — corrected to **7–8** (the old figure divided target hours
> by the sky cycle); and **~10 regions** — corrected to **6 regions** (20–23 points total; same
> 2500 m radius, fewer and longer chapters).
> See DESIGN.md "Ratification pass 2026-08-01".

**Read this first if you're an agent working in the codebase.** Four of these change or revert
`[RATIFIED]` rules.

---

## Proposed ratification pass 2026-07-29 (project owner)

Five amendments. (1) **Worldgen decoupled from meta-progression** — the 2026-07-16 widening is
reverted; `metaState` is no longer an input to worldgen (SM-INV-12 rewritten, SM-INV-8 narrowed,
SM-INV-11 re-keyed). (2) **XP is run-layer** — it does not survive death; XP velocity is a within-run
head start against the cost curve, not meta-progression. (3) **Meta-progression is unlocked starting
vehicles**, not characters-with-perks; the roster is a garage. (4) **No in-run vehicle purchase** —
the game is about maintaining one rig, not acquiring a better one. (5) **Run shape fixed**: 24-minute
days, ~10 regions, 4–6 hours to beat, suspend-and-resume saving.

---

## 1. SM-INV-12 — Determinism discipline: worldgen is meta-free *(rewritten)*

**[RATIFIED 2026-07-29, superseding the 2026-07-16 widening]**

Three layers, not two:

- **Worldgen is a pure function of `(worldSeed, coords)`.** Terrain, router output, POI placement and
  the road network are identical for every player on a given seed, forever, regardless of unlocks.
  **No meta-progression input reaches worldgen.**
- **Run-layer world state is a pure function of `(worldSeed, runState, coords)`**, where `runState`
  carries **run age and run progress** only. This is where escalation lives — parameter states,
  consumed POIs, story-tier weirdness. It **resets completely on run reset**. Same discipline as
  before: `runState` advances at day/sleep/mission boundaries, **never mid-stream, never per-frame.**
- **Run-layer randomness stays free**: mission dressing, jalopy rolls, ambush timing.

`metaState` still exists and is still versioned. It holds **unlocked starting vehicles and story
keys** (§3) and never touches generation.

**Seed policy [RATIFIED 2026-07-29]:** a new game rolls a **random seed** by default; the player may
**enter a custom seed** to replay a specific world. Because worldgen is meta-free, a given seed
generates identically for every player at every stage of progress — which is what makes seed sharing
and daily seeds meaningful at all.

Headless gates pin a default `runState` exactly as they previously pinned `metaState`; live-reactive
systems stay flag-gated (FEAT-26 precedent). Determinism is *stronger* under this rule, not weaker.

## 2. SM-INV-8 — What survives death *(narrowed)*

**[RATIFIED premise; scope amended 2026-07-29]**

Not parts, not money, not the car — **and no longer the world, and no longer XP.** What persists is
**player literacy** (reading the truck, reading the weirdness) and **the garage** (unlocked starting
vehicles, story keys).

> Struck: "world state (permanent unlocks, generator parameter states) persists." Permanent unlocks
> persist as garage entries, not as terrain.

**Consequence:** the rare campsite is in every world from run 1, reachable by anyone. A discovery buys
**knowing where it is**. Under the old model the world changed for you; now only you changed.

## 3. XP is run-layer *(new rule — candidate SM-INV-14)*

**[RATIFIED 2026-07-29]**

**XP does not survive death.** It resets with the run, along with the map, the truck and the money.

Rationale, and why this is load-bearing: persistent XP would let run 50 clear region 1's gate
instantly. That is a power floor and SM-INV-9's litmus test forbids it. XP is not meta-progression —
it is a **within-run pacing resource**, and its real function is *positional*:

> A strong day-one buys region 2 on day two. Because service and parts costs escalate with run age
> (Open Q9A), arriving early means arriving **before the country gets expensive** — a wider margin
> for something to go wrong. **XP is not progress. It is a head start against the cost curve.**

This is the mechanism that makes fast driving matter for *survival* rather than only for cash, and it
does it without a rendered clock (SM-INV-3 intact).

**Scoring [PROPOSED — needs owner OK]:**

```
XP    = parGeometric × (1 + k · marginRatio)     # base for the road, multiplied by how well you took it
payout = absoluteSecondsUnderPar                 # scaled by seconds saved, not by ratio
```

Base-from-par keeps long, hard roads worth more than short easy ones and makes the job count per
region fall out on its own (see `run-shape.md`). The margin term is what the owner asked for: driving
a fast route unlocks the next region sooner. **The only hard constraint: XP must never increase with
time taken.** Any formulation where slow driving earns more XP reopens the gate-farming exploit.

*Note:* with cost escalation carrying the difficulty ramp, **SM-INV-2's run-duration par clause looks
redundant** — DESIGN.md Q9 already anticipates retiring it. Recommend retiring it, which collapses
`parGeometric` and `parEffective` into a single par and removes a whole class of bookkeeping.

## 4. The garage — meta-progression is starting vehicles *(model replaced)*

**[RATIFIED 2026-07-29]**

Replaces "spirits as permanent world additions" as the *mechanism* of meta-progression.

**What you unlock between runs is a starting vehicle.** You pick one and run the whole game in it.
The roster is a garage, not a cast.

**Guardrail — lateral, never upward.** Unlocked vehicles must be **different, not better**
(SM-INV-10: described, never scored; SM-INV-9: breadth, never floor). Each is a trade — a van with
cargo room and poor cooling; something light and quick with no bed for freight; something durable and
slow. The litmus test is unchanged: *does it raise the floor / make late runs comfortable?* If a
vehicle is simply stronger than the starting Ranger, it's illegal regardless of framing, and
SM-INV-7's first-run winnability is what it breaks.

This is a **simplification** of the previous roster-of-characters-with-perks model, and it is much
easier to keep honest: a vehicle's differences are physical and visible, where a perk's are
numerical and quiet.

*Status of spirits:* DESIGN.md's spirit system is **not deleted** — it is deferred. The *roster
mechanism* is now vehicles; how spirits and classes relate to it needs its own pass. Do not build
spirit-unlock plumbing against this amendment.

## 5. No in-run vehicle purchase *(new rule — candidate SM-INV-15)*

**[RATIFIED 2026-07-29]**

**You cannot buy a different car during a run.** Parts, yes — deeply. Vehicles, no.

Three reasons, all owner-stated and all worth preserving in the code comments that will inevitably
ask "why not just add a dealership":

1. **It doesn't survive its own economy.** A new vehicle's price is impossible to justify against a
   player who can barely keep the current one running.
2. **It would dilute the default car.** A purchasable upgrade path is a strong enough pull that
   everyone chases it, and the starting rig — the identity of the entire project — becomes the thing
   you escape rather than the thing you keep alive.
3. **The game is about maintaining a rig, not acquiring one.** This is the *car is your horse*
   keystone stated as a rule. You do not trade horses; you keep one alive.

**What replaces it as aspiration:** deep parts customization within one vehicle (a crappy jalopy
becomes a sweet rig), and unlocked *starting* vehicles at the meta layer (§4) — which are chosen
before the run, not bought during it.

## 6. Run shape *(new mechanics section — see `run-shape.md`)*

**[RATIFIED 2026-07-29]** ~10 regions at current region size · **4–6 hours** to beat · **24-minute
days** (~10–15 days per run) · full trail chain completable in one run (SM-INV-7) · **saving is
suspend-and-resume**: one slot, written on quit, **deleted on load**, deleted on death. Resuming is
not restoring. SM-INV-1 is intact — death is still permanent; the save is a pause that survives
closing the browser.

---

## Downstream edits required in DESIGN.md

| Location | Change |
|---|---|
| *Tensions* table, row "generators are pure fns of `(worldSeed, coords)`" | Revert the 2026-07-16 resolution; original hard rule stands, `runState` added as a run-layer input |
| *The world: regions, story states, spirits* | "Story = parameter states keyed off metaState" → **keyed off run progress**; spirits-as-world-additions → deferred, see §4 |
| *The car: jalopy + parts* | Add §5 (no vehicle purchase) and §4 (unlocked starting vehicles) |
| SM-INV-8 | Narrow per §2 |
| SM-INV-11 | Re-key mechanism to run progress; the ambient/authored split is unchanged |
| SM-INV-2 | Recommend retiring the run-duration par clause (§3 note) |
| Open Q3 (region unlock persistence) | **Resolved** — run-layer, resets on death |
| Open Q9 | Q9A (cost escalation) is the operative difficulty ramp; Q9B unaffected |

**Cost recorded honestly:** the line *"the player accumulated the weirdness voluntarily by going too
far; there is no button to put it back"* is no longer literally true of the world. The accumulation
moves into the player's reading of it. Something real is given up here.

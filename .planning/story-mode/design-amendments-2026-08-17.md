# Amendments — DESIGN.md / missions.md, 2026-08-17

*Written in the doc's ratification ritual so it can be folded in directly. All five decisions below
came from the project owner on 2026-08-17, in answer to the four open questions that were gating
SM-2's remaining mission types. Wording is a proposal; the decisions are not.*

> **STATUS: FOLDED IN 2026-08-17.** DESIGN.md and missions.md carry these as the "Ratification pass
> 2026-08-17". This file is the provenance record and the fuller argument. If it ever disagrees with
> DESIGN.md, **DESIGN.md wins.**

**Read this first if you're an agent working in the codebase. Three of these reverse `[RATIFIED]`
rules, and one of them reverses shipped code.**

| # | Decision | What it overturns |
|---|---|---|
| 1 | **The board is visible.** Pay range and bonus item are shown before you drive. | missions.md owner leaning 2 (2026-07-29, "missions are not visible from the map") **REVERSED**. Also reverses FEAT-53's shipped single-hidden-offer model. |
| 2 | **Bonus rewards are named, rank-gated, and may be tiered** across B/A/S. | DESIGN.md "an **item** reward whose identity is not stated up front" **REVERSED** — the identity is now stated up front, and that is the point. |
| 3 | **A live rank/time indicator is reinstated.** | SM-INV-3 amendment's "result-card only, **never live**" clause (2026-08-01) **REVERSED**. The largest of the five. |
| 4 | **Fragile is graded, not binary.** | missions.md §3b's standing recommendation **OVERRULED** (owner's authority; the risk it names is accepted, see below). |
| 5 | **Non-margin mission types price themselves.** | SM-INV-4 gains an explicit, bounded exception. Ratifies freight's flat rate and formalises what FEAT-61 already shipped. |

---

## 1. The board is visible — optimization is now a design goal, not a failure mode

**The ruling.** *"I want the player to search and optimize the missions they run based on the
rewards."*

Before accepting, the player is shown, per offer:

- a **pay range `$MIN–$MAX`** — the band the payout curve can actually land in,
- the **bonus reward item**, by name, if the mission carries one,
- the **rank required** to earn it (B, A or S — variable per mission),
- **when the offer re-rolls**, as a visible timer or a day boundary.

**What this overturns.** missions.md recorded two owner leanings on 2026-07-29: (1) missions expire
and re-roll, (2) missions are not visible from the map. **Leaning 1 survives and is strengthened**
— re-roll is now explicitly visible so it can be planned against. **Leaning 2 is reversed
outright.** The old argument was that hidden missions convert deliberation into driving, because the
cost of searching is driving. The owner's counter-position is that the *deliberation itself* is the
gameplay being sought here: choosing which two-or-three-mission chain to run, with real numbers, is
the decision the run economy should be built around.

The "partial information via POI identity" proposal (POI type telegraphs mission family, specifics
stay hidden) is **superseded** — it was a mitigation for a problem that no longer exists. POI type
still telegraphs family, but now as flavour on top of stated terms, not as a substitute for them.

**What this overturns in code.** FEAT-53 shipped **single offer per POI, no reroll, visible only on
arrival**. That was explicitly scoped as a way to *dodge* this question ("Dodges the open
board-discovery/expiry question"). The question is now answered the other way, so the dodge is spent
and `_offers` needs to grow: offers must be inspectable without parking, must carry an expiry, and
must expose their terms.

**Weighted mission archetypes this unlocks** — the owner's own three, recorded verbatim in intent:

1. **Higher payout, no bonus item.** Straight cash.
2. **Lower payout, with a bonus item.** You trade money for kit.
3. **Pays nothing, settles entirely in parts** — e.g. a spare tire at B, a tire + rear suspension at
   A, a tire + rear + front suspension at S. Cash-free, rank-laddered.

Archetype 3 is the sharpest new thing on the board: it makes a mission whose *entire* value is
conditional on how well you drive it, and it is why decision 5's "$0 cash is legal" clause exists.

**Open (needs a ruling before implementation): what MIN and MAX actually are.** The raw payout curve
runs from `0` (at ratio 1.2) to `cap × parBase` (cap 3.0), so a literal range reads `$0–$189` and
tells the player nothing. **Recommendation: quote the C-to-S band** — the pay at the C threshold as
MIN and at the S threshold as MAX — so the range describes realistic outcomes and moves correctly
with the day tier and the tightening thresholds. Flagged, not decided.

## 2. Bonus rewards are named, rank-gated, and tiered

**The ruling.** *"a 'bonus reward' item if applicable. The bonus reward will only be awarded if they
score better than a certain rank: B, A or S (variable)."*

DESIGN.md previously specified an item reward "whose identity is not stated up front". That is
reversed: **the identity is stated up front, and the rank required is stated with it.** An unnamed
reward cannot be planned toward, and planning is now the point.

The gating rank is **per-mission, not global** — one mission's bonus lands at B, another's at S.
Rewards may **tier across ranks** (archetype 3 above), so a single mission can pay out differently
at B, A and S rather than being one flag.

**Unchanged:** item rewards still die with the run (SM-INV-8). Bonus objectives remain legal under
SM-INV-3 for the original reason — they name a standard, not a time — and decision 3 now supplies
the standard's live readout.

## 3. A live rank/time indicator is reinstated — ⚠ the biggest reversal

**The ruling.** *"this also suggests we need to reintroduce a timer to give the player an idea of
when it goes from S to A and A to B rank based on time."*

The player sees, during the drive, where the **rank boundaries** fall in time — when S lapses to A,
when A lapses to B.

**What this overturns.** The 2026-08-01 SM-INV-3 amendment made the rank **result-card only, never
live**, and gave the reason inline: *"a live rank is a countdown by proxy and re-breaks this
invariant."* SM-INV-3's whole thesis is that par on the HUD turns the game into a time trial. This
ruling accepts that consequence knowingly, because decisions 1 and 2 changed the premise: **once a
player is banking on an S-rank part reward, a hidden boundary is not tension, it is a guess.** A
reward you can plan toward but cannot track is worse than no reward.

**The tension is real and is recorded, not resolved.** SM-INV-3's original fear — the player watches
the HUD instead of the road, and the fatigue/attention design that depends on eyes-out erodes — is
not refuted by this ruling, it is *traded against* legibility. The mitigation that keeps most of
SM-INV-3 alive is presentation, so this is a design constraint on implementation rather than a free
hand:

- Show **boundary proximity, not a running countdown** — the rank you are currently on track for,
  plus a sense of how close the next demotion is. Not `3:41 remaining`, which is the exact string
  SM-INV-3 names.
- Keep it **glanceable and peripheral**, so the read costs a fraction of a second, not a fixation.
- It is a **mission-terms surface**, so it belongs with the run HUD, not layered over the road.

**SM-INV-3's surviving core:** timers must never become the driver of *all* missions, and payout
stays continuous underneath (SM-INV-4) — the letters remain a skin over a smooth curve, so crossing a
boundary costs a little, never a cliff. **What is retired is only the never-live clause.**

## 4. Fragile is graded — accumulated shock scales the payout

**The ruling.** Graded, over missions.md §3b's standing recommendation of binary.

Cargo condition degrades with vertical shock — bump-stop over-travel and suspension-velocity spikes,
the same signals SM-3's suspension wear reads — and **condition on arrival scales the payout**. A bad
pothole costs money rather than ending the job.

**The risk missions.md named, accepted knowingly:** *"a graded ceiling collapses the axis back onto
margin, since the player pushes hard and eats the penalty."* If restraint is merely a price, fragile
stops being a distinct axis and becomes point-to-point with a tax. **Two levers keep it honest, and
implementation should reach for them before reaching for binary:**

- **Make the gradient steep and superlinear in shock**, so pushing hard is not a small tax but the
  loss of most of the fee. Restraint survives if the penalty outruns the time saved.
- **Keep a floor at zero, and let a catastrophic single impact bottom it out** — graded need not mean
  gentle, and a hard enough hit can still take the whole fee without a separate binary rule.

Fragile stays the mission type that makes surface class matter (paved detour vs dirt shortcut), which
is unaffected by this ruling.

## 5. Non-margin mission types price themselves — SM-INV-4's bounded exception

**The ruling.** Ratified as recommended.

**SM-INV-4 continues to govern margin missions**: point-to-point payout is a continuous linear
function of the par ratio, anchored +20%/par/−20%, and bare completion pays ~nothing. **Missions
scored on a different axis carry their own payout shape**, stated by the mission type:

- **Freight (mass)** — flat rate by mass × distance, paid on delivery. A loaded truck has no margin
  to score, so a margin curve cannot govern it.
- **Coverage** — flat × accuracy. **Already shipped**: FEAT-61's paper route prices itself and does
  not call `payoutFor`. This decision formalises existing code rather than authorising new licence.
- **Restraint (fragile)** — flat, scaled by cargo condition on arrival, per decision 4.
- **Cash-free missions are legal** — a mission may pay $0 and settle entirely in rank-gated items
  (archetype 3). This is the one genuinely new clause; SM-INV-4's "pays ~nothing" floor was written
  about *poor performance*, not about a mission designed to pay no cash at all.

**What does NOT bend:** rank is still computed per-axis, so every type produces a letter and every
type can carry a bonus objective. The day tier still multiplies. Mission points (SM-INV-14) are still
awarded on rank, not on payout, so a $0 mission still advances region access — which is exactly what
makes archetype 3 viable rather than a trap.

---

## Consequences to carry forward

**Reverses shipped behaviour** (FEAT-53 phases A–C): the single hidden offer per POI. Offers now need
inspectable terms, an expiry, and a bonus-reward field. This is new implementation work, not a bug.

**Unblocks:** fragile (decision 4), bonus objectives (decisions 2 + 3), freight (decision 5). All
three were listed on FEAT-53 as "gated on open owner questions". The gate is lifted; the remaining
dependency for freight is SM-3's wear model, which is a build-order dependency, not a design one.

**Does not touch:** FEAT-53's Phase D balancing pass, still the only open item on that ticket and
still blocked on SM-3 costs by design. Decision 1's pay-range display *reads* the tier and threshold
tables, so it should be built to recompute from them rather than caching numbers.

**Newly relevant to FEAT-65** (demolition missions): it is a fourth axis, so decision 5 tells it to
price itself, and decisions 1–3 tell it to state its terms and bonus up front like everything else.

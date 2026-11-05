---
id: FEAT-162
type: feature
status: open
severity: major
opened: 2026-11-02
source: owner, 2026-11-02, answering item E of the Sid Meier review (.planning/story-mode/review-sid-meier-2026-11-02.md):
  "might be better to devise part failures that genuinely strand the vehicle so we can cue the ending off that +
  recovery cost. right now the vehicle is never truly stranded so it just falls on the player to click recovery >
  broke down vs give up > you gave up. just a thought: maybe a 'heart' for the car that gets damaged by driving on
  fully busted rims or suspension or engine or crashing without armor. that health bar actually kills you 'you broke
  down'"
relates: FEAT-146 (the run ends: broke / towel), src/damage.js, src/recovery.js, FEAT-94 (driving on a flat wrecks
  that corner), SM-INV-1 (death), SM-INV-10 (described, not scored), the tow-or-limp predicament (DESIGN.md)
---
lane: B — idea stage; plan first, owner rules

# FEAT-162: The truck's heart — failures that genuinely strand it

## What

Today the truck is never truly stranded. The "broke" ending only happens when the player opens
recovery and can't pay. Otherwise it's the player's choice between that and "give up". Nothing in the
machine itself ends the run.

The owner's idea: a **heart**, one terminal health for the truck. Abuse damages it:

- driving on fully busted rims, suspension or engine;
- crashing without armour.

When the heart gives out, the truck is stranded for real. If recovery is unaffordable, the run ends as
**"you broke down"**.

## Questions for the plan (Lane B proposes, owner rules)

- What feeds the heart, and at what rates? Is it physical (e.g. energy into already-destroyed parts) or bookkeeping?
- Is it shown? SM-INV-10 says described, not scored: a gauge, words ("the truck is dying"), or sound and smoke only?
- Can it be repaired, and at what price compared with the parts?
- How does it meet the existing endings: a stranded truck → recovery cost → broke card (with FEAT-160's reason line)?
- Make sure "give up" stays a choice, not the default way out (the review's point E: players quit before the recovery arrives).

## Acceptance

- [ ] Plan in this ticket; the owner rules.
- [ ] A truck driven to death strands for real, and the run-end card names why.

## Plan — Lane B, 2026-11-04 (for the owner's ruling)

### What the code does today (survey, file:line in the work notes)

- **No part at 0 % stops the truck.** At their floors:
  - engine ×0.4 torque (×0.2 with overheat), and it always starts (ignition.js:45-47);
  - tires ×0.55 grip;
  - a written-off rim is just 4 cm of out-of-round (FEAT-94's "can still end in a breakdown" was
    never built);
  - springs ×0.5, dampers ×0.25, brakes ×0.25.
- **The only true stranding is an empty tank with no gas can.**
- **A rolled truck** with fuel, no hi-lift and no money has no end button at all.
- **"Broke" needs a click** ("end run — you broke down", main.js:5123). DESIGN.md (Death & the tow
  decision) says an unaffordable recovery ends the run *automatically*.

### Recommended: the heart is the truck's own vital parts — no new meter

The owner's "heart" is real, and it already exists as condition. Today it just never reaches a
terminal state. So: give the two parts a breakdown is really made of a terminal state at 0, and let
the existing wear feed them. That keeps it emergent: no bar is injected, and the failure comes out of
the cost model. It also makes the stale comments at damage.js:222 and :1478 ("an engine at 0 never
catches") true again.

1. **The engine seizes at 0.**
   - A running engine that hits 0 dies: a knock, a bang, then silence.
   - It never catches again: `catchTime` is ∞, the same path a dry tank uses.
   - It is fed by what already wears it:
     - **overheat:** a dead radiator holds about 130 °C, and the engine is gone in ~50 s of hard
       driving (`durOverheat` 1000 °C·s);
     - **a choked filter:** wear ×20 below 20 %;
     - **load wear;**
     - **front crashes past dead armour,** which reach the engine and radiator directly.
   - So "crashing without armour" kills the truck through its parts.
2. **A written-off wheel collapses at 0.** This is FEAT-94's end state, finally terminal.
   - That corner drops onto its hub: contact radius ~0.15 m on steel, and the hub can't turn.
   - The truck drags that corner; it does not drive.
   - A spare in the bed fixes it (the tire-and-wheel swap that already exists). With no spare, the
     truck is stranded.
   - "Driving on fully busted rims" is exactly how a wheel gets there: FEAT-94 wears the rim on a flat
     over ~1 km.
3. **Suspension stays a limp, not a death.** A broken spring puts that corner on its bump stop, which
   is drivable, as on a real truck. Bump-stop slams on a dead spring already wear the wheel, so abuse
   there ends in (2).

**Stranded** (one predicate in recovery.js) means any of:
- dry with no can;
- the engine seized;
- a wheel collapsed and no spare;
- on its side or roof with no hi-lift.

**Stranded and no affordable tow → the run ends by itself**, per DESIGN.md.
- The title is the owner's: **"You broke down."**
- FEAT-160's reason line names the cause: "the engine seized — the tow was $12.90, you had $0.00".
- Give up stays a choice in the pause menu, and is never the only door. The rolled-and-broke case gets
  its ending through the stranded predicate.

**Shown as described, never scored** (SM-INV-10):
- HUD words at the edge only: "the engine is knocking" below ~20 %, "the wheel is cracking" below ~20 %,
  then "the engine seized" / "the wheel gave out".
- Sound and smoke: a knock rising with rpm, then the existing steam, then the bang.
- The service screen keeps its %.

**Lives mode** floors condition at 25 % (SM-INV-1), so it never seizes. That is consistent.

### The alternative (if the owner wants the literal bar)

A new **frame** track, one terminal health, fed by:
- energy into written-off rims;
- bump-stop slams on dead springs;
- running a 0 % engine;
- crash energy past dead armour.

At 0 the truck is dead. It is simpler to explain, but it is bookkeeping: a bar the physics doesn't
need, and a second number standing between the parts and the ending.

### Phases (each lands on its own; numbers measured before each)

- **P1 — terminal states** (damage.js, ignition.js, physics.js wheel contact):
  - engine seize;
  - wheel collapse;
  - a headless gate: drive with a dead radiator until it seizes (time to seize); drive on a flat until
    the wheel collapses (km); the truck can't climb a 5 % grade on a collapsed corner.
  - Physics fingerprint unchanged (healthy truck).
- **P2 — stranded + the ending** (recovery.js, main.js):
  - the predicate;
  - auto-end with the reason line;
  - the "You broke down." title;
  - the rolled case;
  - a cdp-smoke step.
- **P3 — cues:** HUD words, the knock (FEAT-120 has the engine synth to hang it on), the bang.

### Owner calls

1. **The heart: the vital parts** [recommended], or a new frame bar.
2. **Auto-end when stranded and broke**, as DESIGN.md says [recommended], or keep the button.
3. **Title "You broke down."** replaces "The truck is dead." [recommended: your words].
4. **What a seized engine costs to fix** at a shop: a rebuild or swap, priced with FEAT-69's re-price.
   Placeholder: 3× the engine's full-wear repair. A collapsed wheel is a new wheel at the shop's wheel
   price.

## Amended 2026-11-05 (owner, first playthrough) — get the wheel collapse right, and add roadside tire repair

"my run ended from a big crash, but it really was doomed about a day prior from a flat tire. due to the damage
model in game the flat tire didnt actually stop me from driving for about an entire day so i think the planned
changes for the 'stuck worn rim' are important to get right. maybe we couple them with a 'roadside tire repair'
feature that lets the player trade time and money to get a messed up tire and/or rim fixed (for more than the cost
of an equivalent set at the service shop)."

- **(2) above is a priority, not a footnote.** A flat must end in a collapsed wheel within FEAT-94's ~1 km of
  rim wear, so "a flat doesn't stop you for a day" can't happen.
- **(5) Roadside tire repair** joins this ticket. It's a Recovery-chip call-out beside the tow, for when you're
  parked with a flat, a ruined tire or a collapsed wheel. A mobile tire service comes out and fixes the tire
  and/or the rim on the spot.
  - **Money:** dearer than the shop. `[DEFAULT]` (the shop's price for the same new part(s) + its labour) × 1.5,
    plus the tow's $10 call-out, all × the day tier.
  - **Time:** `[DEFAULT]` the tow's wait (3 h + 0.5 h/km from the nearest shop), then the fitting hours.
  - It never needs a spare. It's what turns "a wheel collapsed and no spare" from stranded into an expensive
    afternoon. You're **stranded** only when you can't afford it either.

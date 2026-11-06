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

## Ruled 2026-11-06 (owner, feat162-calls): "all four as proposed" — "written off wheel should mean after wheel hits 0%"

1. The heart = the vital parts. 2. Auto-end when stranded and broke. 3. Title "You broke down." 4. A seized
engine costs 3× its full-wear repair at the shop (placeholder until FEAT-69's re-price); a collapsed wheel is a
new wheel at the shop's price.

## Work log

**2026-11-06, Lane B — P1 built (feature/machine a5bbacaf … 5860e182).** Physics fingerprint identical
(the healthy truck is untouched).

**P1a, the wheel collapse.** A wheel track at exactly 0 collapses (1 % still stands; Lives mode floors above it).
- damage.js publishes `params._wheelCollapseR[i]`: 0.18 m `[DEFAULT]`, the folded rim. That corner's grip becomes
  `wheelCollapseMu` 0.5 `[DEFAULT]` (steel sliding on the road, ×0.5 of a tire's), and its contact rate is the full
  rate (steel, not a flat's air). A new wheel (the spare, the shop) stands it back up.
- suspension.js `effectiveWheelRadius` returns that radius. Every contact query goes through it, so the corner
  drops: the hub rides ~0.15 m up.
- physics.js locks that hub at ω = 0, on the ground and in the air (the folded rim jams it and reacts any torque).
- vehicle-model.js draws the wheel at its contact radius (MESH == PHYSICS).
- How a wheel gets there is unchanged (FEAT-94, signed off): a flat shreds its tire in ~2 km at 50 km/h, then the
  rim goes in ~1 km. Per km it costs as the speed, so limping at 25 km/h doubles both. "A flat didn't stop me for a
  day" can't happen any more: at 0 % the wheel is down.
- Measured (gate `wheel-collapse`, 20 s of full throttle from rest, open diff, flat ground at μ 0.8; healthy:
  139 km/h):

  | Collapsed corner | Flat | Up 5 % |
  |---|---|---|
  | rear-left (driven) | 8.0 km/h | 13.6 km/h |
  | front-left | 107.6 km/h | 87.7 km/h |

  A collapsed REAR strands the truck by itself: the open diff spins the good wheel. A collapsed FRONT does not.
  The corner droops, its load moves to the diagonal (~2 kN left on it), and ×0.5 sliding steel on that is ~0.8 kN,
  which the engine out-pulls. Measured alternatives (front-left, grip × the road's): ×1.0 → 68 km/h flat, stuck up
  5 %; ×1.5 → stuck on the flat. With the radius ground lower, the body takes ground contact through the engine:
  0.10 m → 72 km/h, 0.06 m → 35 km/h. **Owner call `feat162-front-drag` (sent to the orchestrator): dig in like a
  tire [rec.] · 1.5× · keep sliding steel · the complete model.** P1a's landing waits on it.
- Approximation, flagged: the debris-only rim core (BUG-99) stays full size on a collapsed corner. Rocks still
  meet a whole rim there.

**P1b, the engine seize.** The engine track at exactly 0 is a seized engine. This reverses 2026-10-22's "a worn
engine always starts" at 0 only (0.1 % still starts, gutless).
- ignition.js `seized()`: a running engine that seizes shuts off on the spot (the dry tank's `'shutoff'` path), and
  `catchTime` is ∞.
- drivetrain.js, automatic: it reads 0 rpm cranking or rolling. Approximation, flagged: the converter's drag is
  still the dead engine's curve, standing in for a stalled impeller's fluid brake.
- drivetrain.js, manual: in gear with the clutch biting, the clutch slips against the locked flywheel at its
  capacity. It brakes the rear axle at 450 N·m × the ratio (2467 N·m in 2nd), so the rears lock in the low gears.
  Dip the clutch and it rolls free. Coulomb friction, regularised over 1 rad/s of slip so a stopped truck doesn't
  chatter.
- What gets it there is unchanged: overheat (`durOverheat`), the choked filter, load wear, front crashes past dead
  armour. Measured: a dead radiator under full load takes a new engine to 0 in **111 s** (the plan's ~50 s once at
  130 °C, plus the warm-up).
- Gates: `wheel-collapse` and `engine-seize` (new). `ignition-starter` §3 now pins "0 never catches".

**2026-11-06, Lane B — P2 built on P1 (feature/machine 28a0aa15 + the at-shop rule), not landed** (it waits on P1, which waits on
`feat162-front-drag`). 66/66 affected node gates green; the cdp-smoke's broke-down step is rewritten for the
auto-end and is the orchestrator's to run on landing.

- **Stranded** (recovery.js `recoveryCard` → `why`): dry with no can · the engine seized · more collapsed wheels
  than spares that can go on (a sound wheel, and air or a plug kit) · on its side or roof with no hi-lift.
- **Each option cures only its own.** The shop tow cures anything. The fuel tow cures the tank, and a rolled
  truck, since any tow truck sets it on its wheels. The tire service cures the wheels. Options can cure it
  *between them*: dry plus a collapsed wheel is the fuel tow and the tire service, priced as their sum (with at
  most four options, every set is tried). `canEnd` = stranded, and the wallet can't cover the cheapest curing set.
- **The auto-end** (main.js `_checkStranded`, 10 Hz poll): `canEnd` held for `STRANDED_REST_S` 3 s `[DEFAULT]` of
  sim time with the truck still (< 0.5 m/s). A truck still rolling, or limping on a rim, is still trying. An open
  pump, shop, inventory or damage screen holds it. The manual "end run" button is gone (ruling 2).
- **The card:** title **"You broke down."**; FEAT-160's line names the cause and the cheapest cure, e.g. "the
  engine seized — the tow was $12.90, you had $0.00". The Recovery card's headline uses the same words.
- **The mobile tire service** (amendment 5), on the Recovery card whenever a corner has a flat, a dead tire (0) or a
  collapsed wheel, and a shop is in the region:
  - A dead tire or wheel → the stock part, new, plus the shop's fitLabour (2 hub + 2 bead). A sound flat → the
    shop's patch.
  - Price: (that) × `roadsideMarkup` 1.5 `[DEFAULT]` + `towFlat`, all × the day tier. A collapsed corner on day 1
    is $58: (18 + 8 + 6) × 1.5 + 10.
  - Time: the shop tow's hours (3 h + 0.5 h/km), then the fitting.
  - The dead parts go with the service. Each would sell for half its price × 0.
- **At the shop** (ruling 4):
  - A seized engine is rebuilt only whole, to the cap, at `SEIZED_REPAIR_X` 3 × the full-wear price ($207 on day
    1, vs $69). There's no cheap first step that frees it.
  - A collapsed wheel has no repair: it's replaced.
  - `wheelSteel` joined the always-stocked rows `[DEFAULT]`, so a tow to any shop is a way out of a collapsed wheel.
- **Already at a shop** `[DEFAULT — the orchestrator's reading of the owner's rule "stranded and no affordable tow
  → the run ends by itself", whose intent is that no affordable cure ends the run; the owner can overrule]`:
  - The 0 km "tow" to the shop you're parked at cures nothing but a roll.
  - The shop's own bench and shelf are the cure: the ×3 rebuild or an engine off the shelf, a wheel plus its
    fitting (main.js `_shopCures`).
  - So you're towed in with a seized engine and can't afford an engine: close the service screen, and 3 s later
    the run ends.
  - Pinned in `test/recovery.mjs` §3b.

**2026-11-06, Lane B — P3 built (feature/machine c3dbd7b8), not landed.**

- **Words** (main.js `_machineWords`, the 10 Hz poll; a `#machine-word` toast, Story family, 18 px, 4 s then a
  1 s fade): the engine and each wheel speak twice.
  - Crossing below 20 % (`KNOCK_FROM` `[DEFAULT]`): "the engine is knocking" / "the front-left wheel is
    cracking", in `--warn`.
  - At 0: "the engine seized" / "the front-left wheel gave out", in `--bad`.
  - Repaired back above the line, it can speak again. The first poll of a drive only takes the levels in, so
    loading a run doesn't announce what the truck already was. Nothing is shown in between: no gauge
    (SM-INV-10). Lives mode floors at 25 %, so it never speaks there.
- **The knock** (`src/knock-audio.js`, new): a worn rod bearing, once per crank revolution.
  - Built as an impulse-train wavetable at rpm/60 ringing a 1.8 kHz bandpass (Q 6).
  - It starts at a quarter strength at 20 % and grows to full at 0 %; throttle hardens it (×0.35 → ×1).
  - It follows the engine sound's on/volume.
- **The bang:** the running engine's seize (ignition `'shutoff'` while `seized`) plays a noise hit over an
  80 → 35 Hz thump, then the existing shutoff silence. The hood steam stays the overheat's own cue (FEAT-51).
- FEAT-120's sound list has both: the dashboard's ▶ plays `knock-sweep` (10 % engine, 800 → 4000 rpm) and the bang.
- The cdp-smoke's broke-down step now checks "the engine is knocking" at 10 %.
- **Owed (the owner's ear):** the knock and the bang are first cuts.

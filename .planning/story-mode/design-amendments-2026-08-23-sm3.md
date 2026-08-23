# Amendments — DESIGN.md "Damage, wear & repair", 2026-08-23

*Written in the doc's ratification ritual so it can be folded in directly. The structural decisions
came from the project owner on 2026-08-19 (the SM-3 ratification); the metric corrections below came
out of implementing and driving it, 2026-08-20 to 2026-08-22. Wording is a proposal; the decisions
are not.*

> **STATUS: FOLDED IN 2026-08-23.** DESIGN.md carries these inline. This file is the provenance
> record and the fuller argument. If it ever disagrees with DESIGN.md, **DESIGN.md wins.**

DESIGN.md's damage section was an owner brain-dump from 2026-07-19 with mechanism proposals attached.
Most of it survived contact with the build intact — one framework, per-component 0–100% condition,
honest signals only, out of the hot loop, per-run state (SM-INV-8), time+intensity never distance
(SM-INV-5). What follows is only where the shipped model and the ratified milestone differ from it.

| # | Amendment | What it changes |
|---|---|---|
| 1 | **Suspension is TWO tracks: springs and dampers.** | DESIGN.md's single "Suspension" track, whose stated effect was damping only. |
| 2 | **Four new classes: armor, wheels, headlights, alignment.** Wheels are separate from tires. | DESIGN.md has none of them. Armor in particular changes how every other impact track behaves. |
| 3 | **Brakes wear on ENERGY, not on time.** | DESIGN.md's `∫(brake torque × time)` **REVERSED** — it wore pads while parked on a hill. |
| 4 | **The suspension trigger sub-question is closed**, and split: springs on bump-stop PEAK FORCE per event, dampers on strut velocity above a floor. | DESIGN.md left it open ("both are honest"). Neither answer was quite right. |
| 5 | **The fatal-crash metric is Δv, measured off the vehicle.** | DESIGN.md's Δv-over-Δt was the *fallback*; it is now the primary, and the contact-impulse route it was a fallback to is what failed. |
| 6 | **The air filter is not in the ratified track list.** | DESIGN.md gives it a whole paragraph and calls the diagnostic screen's main job flagging it. **This one is an open question for the owner, not a decision.** |

---

## 1. Suspension is two tracks, and springs matter as much as dampers

**The ruling** (owner, 2026-08-19, in the SM-3 ratification). Springs and dampers are separate
0–100% tracks, front pair and rear pair each, and they are damaged by different things and show it
differently:

- **springs** — damaged by bump-stop force, effect is spring rate falling;
- **dampers** — damaged by suspension displacement rate, effect is damping rate falling.

DESIGN.md said "wear primarily degrades **shock damping**", which folds the spring away. In play they
are quite different failures: a dead damper is floaty and poorly controlled, a dead spring sits the
truck down on its stops. Keeping them apart is what makes "the suspension is shot" mean something
specific enough to diagnose.

**One shipped detail worth writing down.** Spring rate bottoms out at **50% of stock**, not zero. At
25% the truck sat on its bump stops and stopped being drivable (owner, 2026-08-20). A real spring
never yields flat — it always keeps some elastic — so half rate is both the playable floor and the
honest one.

## 2. Armor, wheels, headlights and alignment

Four classes DESIGN.md does not have. **Armor is the one that matters structurally**, because it is
not a component the player repairs for its own sake — it is the damage *routing* mechanism. Every
impact is aimed at one of four regions (front bumper, left side, right side, rear bumper), the armor
there takes its own damage, and **what reaches the components behind it is scaled by how intact that
armor was BEFORE the hit**. That is why the same 30 mph tap costs ten times more into an already
crushed bumper. Nothing in DESIGN.md's per-component list expresses that coupling.

**Wheels are separate from tires**, and the distinction is physical rather than bookkeeping: a tire
wears and punctures, a wheel *bends*. A bent wheel's effect is radial runout — it goes out of round,
up to 0.04 m peak-to-peak — which the sim already models as real geometry, so the wheel shakes at
speed rather than carrying a hidden penalty.

**Alignment gets REAL static geometry** (owner, 2026-08-19). Toe and camber are genuine vehicle
parameters with stock 2002 Ranger values, and damage perturbs them from there. This shifted the
handling baseline of every vehicle knowingly: *a truck that has never had alignment is a truck that
cannot lose it.*

## 3. Brakes wear on energy, not on time — REVERSES DESIGN.md

**DESIGN.md:** "Wear = **∫(brake torque × time)** (N·m·time)."

**Shipped:** ∫(brake torque × wheel speed × time) — the friction *energy* the pads dissipate.

**Why it had to change.** The owner caught the rear pads wearing while the truck simply sat on a hill
with the brakes holding it (2026-08-22). A stationary pad slides nothing, dissipates nothing, and
loses no material, so torque×time is the wrong quantity rather than a wrong coefficient.

Energy is strictly better than the speed floor that would also have fixed the symptom: it needs no
threshold, standstill is zero *by construction*, and it gets the middle right too — a crawl-speed
drag costs far less than the same torque at 60 mph. The units of `durBrake` are joules per axle now,
not N·m·s.

**Unchanged:** pairs not corners, so the player can mix pad grades front vs rear and tune brake bias;
pads described never scored (SM-INV-10); impact **never** damages brakes.

## 4. The suspension trigger sub-question, closed

**DESIGN.md** left it open: *"either bump-stop over-travel past a distance or a suspension-velocity
component threshold (open sub-question, both are honest; probably the bump-stop force)."*

**Resolved, and split by track:**

- **Dampers — suspension displacement RATE above a no-harm floor.** The second option, and it was
  right. The floor placement is the load-bearing part: measured on the lab's coarse rumble lane the
  strut peaks at 1.3–1.4 m/s, while the flat drag strip peaks at 0.09, so a floor of 0.10 m/s reads
  exactly zero on smooth ground and real wear on washboard.
- **Springs — bump-stop PEAK FORCE, per event.** The first option, but *not* integrated over time,
  which is the part neither DESIGN.md nor the first implementation got right. Hammering the ramp at
  30–40 mph, plainly bottoming the suspension, cost almost nothing: a landing spike is enormous but
  lasts ~15 ms, so a force×time integral barely saw it, while a long gentle lean on the stops
  accumulated forever. What takes the set out of a spring is peak **stress**, once. Each contact is
  now one event priced on its peak, square-law.

**A consequence worth recording, because it bit twice.** The tire spring sits upstream of everything
here. Making the tire carcass progressive (see §5) multiplied bump-stop forces about fivefold, and
*every threshold calibrated against the old forces had to be re-measured rather than reasoned about*
— springs first, then the alignment crosstalk, each found only by driving. `test/collision-drop-lab.mjs`
exists to make that chain visible in one table.

## 5. The fatal-crash metric: Δv, measured off the vehicle

**DESIGN.md:** "a deceleration / G threshold (e.g. Δv ≈ 60 mph shed in ~0.1 s). Acknowledged hard to
tune… **a raw Δv-over-Δt threshold is the fallback**."

**Shipped:** the fallback is the primary. An impact's severity is the vehicle's own velocity change
across the collision, `J = m·|Δv|`, and 60 mph equivalent is the fatal threshold.

**Why the contact-impulse route failed.** It was tried first, because pricing on impulse rather than
speed is what makes a glancing clip at 60 mph cost almost nothing while a square hit costs
everything. But the engine's accumulated normal impulse is **not** net momentum transfer — it
includes the impulses the solver spends pushing penetration back out, which move nothing. Measured
against owner captures it read a 60 mph strike as 104 and a 30 as 65, a little over 2× both times.

**Δv keeps the property the impulse model was chosen for.** A glance barely deflects the truck, so it
still prices as the small hit it is. It is the same quantity, measured off the body instead of off
the solver. (The old code comment warning that reading Δv off the body would lose the glancing-blow
behaviour was simply wrong, and is gone.)

**Also amended: armor's own curve.** DESIGN.md implies one damage shape for everything. Body panels
were re-anchored on 2026-08-20 to a *floored square law* — nothing at all below 10 mph, saturating at
80, damage as the square of speed over the floor — because they were about 4× too sensitive at low
speed and a parking-lot tap must be free. Square-law is the honest shape for sheet metal, which
deforms by absorbing energy. **The components kept the original two-point law.**

> **Note, unresolved:** death is still at 60 mph while armor now saturates at 80, so total armor loss
> and death are no longer the same impact. That coincidence was deliberate in the original
> calibration. Nobody has ruled on whether it should be restored.

## 6. The air filter — OPEN, for the owner

DESIGN.md gives the air filter a track, a mechanism (does ~nothing until ~20%, then sharply
accelerates engine wear), a tie to FEAT-38 dust exposure, and the *headline job of the diagnostic
screen*: "the **air-filter warning** the critical, can't-miss one."

**The ratified SM-3 track list does not contain it.** Engine damage there is front impact, coolant
above 105 °C, and a slow f(rpm, torque, load). Twenty-six tracks in eight classes, no filter.

This is recorded as a **disagreement, not a decision** — it needs a ruling:

- **dropped**, and DESIGN.md's paragraph is struck along with the diagnostic screen's stated purpose; or
- **deferred**, and it is a known gap in SM-3 with a ticket, still owning the diagnostic screen; or
- **restored** into the track list, in which case it wants a class and a damage source.

The same status applies to two other DESIGN.md items the ratified list carries but the build has not
reached: **tire puncture** (binary, on a wear→fragility curve) and the **head-gasket overheat
integral** (which DESIGN.md itself flags as a proposal needing owner OK). Both are unimplemented
rather than contradicted — they are listed here only so the gap is visible.

---
id: FEAT-161
type: feature
status: open
severity: major
opened: 2026-11-02
source: owner, 2026-11-02 — agreed with item C of the Sid Meier review (.planning/story-mode/review-sid-meier-2026-11-02.md):
  "agree this would be better. the 'hardness' comes from the cost (wear but no cash reward) right now. but its not a
  fun cost its attrition"
relates: FEAT-103 (the expedition camp + requisition), FEAT-157 (one line per mission type), FEAT-65 (demolition
  line), the 2026-10-26 ruling that the connector road stays ordinary in the alpha
---
lane: A — PLAN FIRST, owner picks

# FEAT-161: The finale is the hardest drive of the run

## What

Meier: winning is fun, and a run should climb to its peak. In the alpha the rank thresholds never
tighten, and the camp's five requisition lines are ordinary trips on an ordinary road with no pay.
Their only cost is wear without a cash reward. The owner calls that attrition, not a fun cost. So the
hardest drive of the run lands somewhere in the middle.

Make the last stretch the run's high point. The difficulty should come from the driving, not from
grinding.

## Plan first (Lane A → owner)

Propose 2–3 options with what each touches. Candidates from the review, not ruled:

- the connector road to the camp gets its danger in the alpha (reverses the 10-26 "ordinary" ruling — owner's call);
- the lines escalate: the last one is the heaviest or most fragile load of the run;
- a staged arrival beat at the camp (sound, a camera beat, the crew), so the win lands.

Pay is not the lever: money is worthless once the run is won.

## Options (Lane A, 2026-11-02) — the owner picks

Today: the five lines open together at 6 good deeds, in any order, each counts at C or better, no
pay (data/offers.js REQUISITION; src/offer-board.js `openLines`). The connector is an ordinary road
(FEAT-103, ruled 10-26). So the last drive of the run is whichever line the player left, at the
same gate as the first.

### 1. A sixth line: the expedition's last load (recommended for the alpha)

When the five are done, the camp posts **one more line, the final load**: the heaviest or most
fragile thing the run asks for, from the farthest source, counted at **B or better** instead of C. It
is the only line that cannot be taken early, so it is always the last drive, and the run climbs to it.

- **The load** (owner names it; placeholders): the pallet of cinder blocks for the camp's footing
  (freight, 785 kg — already a THINGS row, the heaviest load in the game, well past the tires' rated
  knee), or the expedition's radio in the pelican case (fragile, top tier; the model ships, it has no
  shipper yet). Both are existing models.
- **Measure:** its mass and fragility gate against the median budget job over many seeds (an
  offer-board census, like the HAUL_STOCK one). Target: mass ≥ the 90th percentile, or the top
  fragile tier, and the B gate.
- **Footprint:** one REQUISITION row with `after: 'lines'` and `gate: 'B'`; `openLines` skips it until
  the five are done; the card's deed line reads the row's gate instead of the fixed 'C'; the HUD and
  the win (FEAT-146) already count every line. No world change, no other lane's files. ~1 day.

### 2. The lines climb: one at a time, easiest first

The same five lines, opened **one after another** in a fixed order that climbs: the crew (no load)
→ the signs → firewood → camp gear (fragile) → fuel (a 172 kg strapped drum), each gate one step
tighter than the one before (C, C, C, B, B). The last line is the fuel run.

- **Measure:** the same census; the fuel drum is already heavier than most freight.
- **Footprint:** an `order` on each REQUISITION row and a `gate`; `openLines` opens the next on each
  delivery; the HUD's lines row shows only the open one. Changes the 10-19 ruling (all five open at
  once, any order) — owner's call. Removes the player's choice of order, which is the cost. ~1 day.

### 3. The connector gets its danger now (reverses the 10-26 ruling)

Bring part of FEAT-103's post-alpha connector into the alpha: the worst `roadQuality` (potholes,
already in both the ribbon and the physics) and coarse undulation on the road from the last junction
to the camp. Four of the five lines end at the camp and the fifth starts there, so every finale
drive crosses it.

- **Measure:** the connector's pothole density and vertical roughness against the median road.
- **Footprint:** road-quality.js (a per-edge override for the connector), road.js / road-mesh.js
  for the undulation (MESH == PHYSICS), par.js (par only knows curves and grade, so it would
  under-time the connector — the 10-26 question 2). Raises FEAT-46's same-road question (free roam has
  no camp, so it builds a different road). Dirt grip would add tire.js, Lane B's. Several days and
  two lanes; the most "the driving is the difficulty" of the three.

### With any of them: the arrival beat

When the last line delivers, stage the win instead of cutting to the card: the camera swings onto
the camp, the crew is there, and FEAT-131's grade stinger plays (its P1 sounds are already planned).
It does not make the drive harder, so it is not an option on its own — it is what makes the win land.
Footprint: main.js's win flow (FEAT-146), camera.js's focus override (the camp scene uses it), and
FEAT-131's sound. ~half a day once FEAT-131 P1 lands.

**Recommendation:** 1 + the arrival beat for the alpha; 3 stays the beta step-up FEAT-103 already
designs. 1 keeps the order free and adds the climb without touching the world.

## Acceptance

- [ ] Options in this ticket with footprints; the owner picks.
- [ ] The chosen version built; the final delivery is measurably harder than the median job (a number in the ticket).

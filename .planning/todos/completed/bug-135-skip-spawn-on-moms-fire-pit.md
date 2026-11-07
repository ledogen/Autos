---
id: BUG-135
type: bug
status: closed
severity: major
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox (playtest)
relates: FEAT-170 (the tutorial opening at mom's; its skip), ASSET-76 (the fire pit), FEAT-66 (camp gear)
---
lane: A

# BUG-135: a skipped tutorial starts the truck on top of mom's fire pit

Owner, verbatim: "I just spawned into the story mode, skipped the tutorial, and found my truck parked over the
cinder block fire pit. I was literally completely immobilized because I couldn't drive off of it. Move the starting
spawn out of mom's yard."

## Acceptance

- The run's starting spawn is out of mom's yard (the owner's fix), for both the skipped and the played opening.
- A check over random seeds: every story start's truck spot is clear of props and colliders (the fire pit
  included), and the truck can drive off it.
- The smoke's opening step still passes.

## Fixed (Lane A, 2026-11-07, feature/run-shape)

**Cause.** A skip seated the truck with the same rule as the burger joint's start: 2.8 m in from the pad's centre,
toward the road. On mom's pad that strip is her trailer's **yard**, the two strips either side of the door path where
her lawn furniture is scattered (FEAT-71). Measured over 12 random seeds, that seat was blocked on **4**: twice by her
fire pit (362666972, 1644388938), twice by her propane tank (1701194613, 3991702986). Larry's pad has the same yard
plus his van, and the paper scenario seated the truck there by the same rule.

**Fix** (`src/poi.js` `startSeat`, which `main.js` `_seatAt` now uses): a POI whose model has a yard never takes the
truck on its pad. The truck parks in the **road's near lane in front**, at the mission start point (`q.roadX/Z`, a
quarter of the paved width off the centreline), facing along the road. That is inside her 25 m start zone, so the
casserole stages as before. The burger joint has no yard and keeps its lay-by seat, so a played opening starts where it
always did. Sleeping at mom's never moves the truck, so a played run's only start seat is the joint's.

**Proof:**
- **Gate `test/story-start-clear.mjs`** (story, heavy). On story regions built as entry builds them, the truck's
  footprint (2.0 × 5.4 m) at every start seat (the joint, mom's, Larry's) overlaps no POI solid (marker boxes, Larry's
  van, every yard item) and no solid prop (trees, rocks, boulders, logs, bushes, scattered with the game's samplers).
  Its seeds: **362666972**, the report's shape (the old seat on mom's fire pit, which the gate must see); 1701194613
  (the old seat on her propane tank); 1; 1780111592; and two random per run. Over the 12-seed probe, the new seats
  were clear on all 12.
- **Smoke:**
  - after the skip, the truck drives off (5 s of throttle, more than 10 m);
  - the played opening's truck drives off the joint the same way;
  - the story step's "at mom's" check is now her 25 m start zone.
- **Gates:** the affected set was 31/31 green. `story-start-clear` passed alone: the old seat was blocked on 3 of its 6
  seeds (362666972 and 1 on her fire pit, 1701194613 on her propane tank), and the new seats were clear on all 6.
- **The smoke** ran three times under heavy load from other lanes (load averages 20–60). Each failure was a different
  known-flake step:
  - `drive`, at load ~60;
  - `pad`, at ~44;
  - `endings` (pad B and the Recovery card), at ~20.
  Every step passed in at least one run. `pad` was rerun alone through the slot: PASS. It includes the View-hold skip
  onto the new seat. On the world where `pad` had failed (461745062), mom's new seat measures 9.6 m from her marker
  (inside the 25 m start zone) and 2.5 m off the centreline: the near lane, as built.

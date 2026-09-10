---
id: BUG-66
type: bug
status: pending
severity: low
opened: 2026-09-10
source: >
  the six remaining road-clearance rows after the 2026-09-10 pass, all at promoted-T forks:
  seed 6 (−2799,450) (−68,320) (−4,1533) (−182,933) (−1258,1040), seed 11 (647,−647).
---

# BUG-66 — a T side road leaving a trunk on a tall fill trips the clearance rule for 4–16 m

## What happens

Every remaining `road-clearance` row is a promoted-T pair (one key is a fork vertex): the side
road just past its departure band sits 24–28.3 m from the trunk while the rule asks 28.5 m,
because the two decks are 6–15 m apart in height — the trunk rides a fill or cut and the side road
has already dropped off it. Rows are 4–16 m long and 0.2–4.6 m short of the rule. Several of these
Ts shipped as `promote-residual` ("best available T — departure grade 34–41 % > cap"), so the
height split IS the steep departure the probe already condemned.

## Where the fix belongs

Not the throat (the geometric throat, owner ruling 2026-09-10, already exempts the junction's own
geometry — these rows start after the pavements have parted) and not the rule. The side road
should carry the trunk's deck a little longer before it drops — the FEAT-82 hold recovery exists
for graph nodes; a T fork has no hold (by FEAT-76 design). Either give the departure a short deck
hold sized by the height split, or let `_v2DepartureAccepts` price earthwork reach the way it
prices departure grade so the fork ranking prefers a station where the decks are closer.

## Acceptance

- [ ] `road-clearance` green across the battery (the six rows above, and nothing new)
- [ ] `junction-stitch` green; `promoted-node-id` unchanged T count (19 core)

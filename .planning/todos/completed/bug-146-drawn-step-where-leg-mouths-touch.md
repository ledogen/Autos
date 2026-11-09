---
id: BUG-146
type: bug
status: closed
severity: minor
opened: 2026-11-08
source: Lane B, BUG-144's remainder
relates: BUG-144 (the pad's own tear between legs: fixed), BUG-82 (ribbon weld), BUG-105 (overlap join)
---
lane: Spare

# BUG-146: a drawn step where two nearly parallel legs' mouths touch

BUG-144 fixed the pad's own tear between two legs' bands. What is left is in the DRAWN ribbons: where two nearly
parallel legs' mouths touch, 28.7 m out from their node, their own decks differ by 0.20 m (seed 1353361482, at
(26.3, 721.3)) and 0.12 m (seed 917338424, at (99.4, −1015.8)). Past the mouths the pad must coincide with each
ribbon, so the pad can't remove it. The step is 0.143 and 0.124 m per 5 cm, at one corner per node.

junction-edge-lip names these two sites as its one exception (within 0.5 m of two touching ribbon edges).

## Acceptance

- The two legs' decks are drawn together where their mouths touch (a ribbon-level weld, or an overlap join), with no
  step over the designed lip.
- The gate's named exception is removed, and both sites pass.

## Resolution (Spare, 2026-11-08, land/bug-146)

Not a ribbon weld: the ribbons should never have touched. BUG-59's ruling is "pave the gore to where the pavements
part", and the per-leg cutback's parting walk (`_legPartingReach`, shared with the deck hold) reads polyline VERTICES
4 m apart and stops at the plane hold's 30 m. At both sites the walk ended at 27.9 m, one vertex short: the
pavements parted (1 m daylight, the walk's own test) only at 31.2 m (1353361482) and 32.4–32.7 m (917338424), so the
inner edges crossed between the cutback and the mouth, where the pad's ribbon mask is already fully on.

1. **The pad paves out to the real parting.** `_detectNodeJunctions`: where the pavements have not parted by the
   mouth, the cutback marches out 0.25 m at a time to where they do, capped at RULE_NODE_WINDOW − halfWidth (35 m), so
   the mouth stays inside the window the pad projects its legs in. The deck hold keeps the walk, so profiles do not
   move. 16 of 193 padded legs (9 of 64 nodes) on 12 seeds move, +2.75 to +4.75 m; every other leg is untouched
   (`wip/bug-146/moved.mjs`).
2. **The ribbon mask eases along the ribbon's own station.** `_padRibbonMask` read the ease off the polyline foot's
   `arcS`, which on the inside of a polyline kink jumps segments at the bisector (1 m, 4.9 m out on 917338424's 12°
   kink). The moved mouth put an ease on that kink and tore the pad 0.11 m. The station now comes from
   `_legDeckTop`'s section solve (continuous in position). This also took main's worst non-excepted tear on the gate
   seeds, 0.075 m, to 0.037 m.
3. **A through road's back chord walks the true edges where it would bite the pavement.** `_junctionRingWeld` joins
   two nearly opposite legs' mouth corners (cosine below −0.85) with one straight chord. That is exact only while both
   legs run straight out to their mouths. A moved mouth on a bending leg put the chord 2.1 m inside both pavements
   beside node 917338424 (−110.7, −463.7), a bite of dirt in the road. Main already bit 0.84 m at (100.8, −986.6) and
   0.73 m at 1353361482 (−72.3, 41.4), where a long mouth meets an opposite leg. Where a true-edge point stands more than
   0.3 m outside the chord, the ring now walks the true edges, as an open back does. Leg-edge points outside their own
   ring on seeds 917338424, 1353361482 and 563927844 (`wip/bug-146/ring-bite.mjs`): main 74, branch 3. The 3 are one
   mouth-corner point at 917338424 (−204.2, −536.3), identical on main. On 9 more random seeds: main 93 (worst 1.61 m),
   branch 11 (worst 0.78 m, the same point on main). The fix reaches past BUG-146: main's straight chord also bites
   ordinary T's whose mouths nothing moved, 1.48 m at seed 11's node (−472.8, −62.0) and 1.30 m at seed 7's
   (255.8, 192.6). Both go to 0.

junction-edge-lip: exception removed, PASS. Worst tear 0.037 m per 5 cm (main 0.075 outside the exception, 0.143 at
the two sites), steepest 0.166 m per 0.25 m (main 0.193), rim lip 0.158 (same), worst leg lip 0.199 m (main 0.237). Before fix 3 it
was 0.244 m, at the chord bite at 917338424 (−110.7, −463.7).

On 9 random seeds the gate's checks fail identically on main and the branch, line for line: a 9.46 m pad tear at
749163472 (557.3, 717.0) and rim lips of 0.28–0.39 m at 1074499174 (742–746, 420–432). Both pre-existing, now
BUG-148 and BUG-149. Seed 169372896, which BUG-150's note in the gate keeps out of SEEDS: main's 0.080 m pad tear
at (372.8, −263.2) goes to 0.038 m, leaving only BUG-151's 1.8 cm poke.

**What else moves (fingerprint-world vs main b5974909).** Network, profiles and POIs are identical in all six windows.
Junctions differ in 5 windows: 3 from moved mouths, 2 (seed 6 ponds, seed 7) from fix 3 re-walking a through road's
back. Surface, carve and tiles differ in 5, because fix 2 shifts the ease on every curving leg. Water differs in 1, in
the stream-mesh half only: the ponds-and-streams data half is identical, and a stream bank's blend reads the carve
beside a pad. Props differ in 1, because the scatter's pad test reads the ring. Measured on the pad surface, 0.5 m grid
over ring + 2 m (`wip/bug-146/pad-delta.mjs`):
- Nodes with no moved leg: max |Δ| 0.092 m (seed 6), 0.159 (seed 11), 0.150 (seed 7), 0.114 (917338424). Medians
  1–2 cm, except seed 7's one node and 917338424 at 0.11–0.15 m.
- Seed 11's 0.159 m and seed 7's 0.150 m are main's 1.48 m and 1.30 m chord bites being paved (fix 3).
- The 0.108 m at 917338424 (−212, −543) is main's own 0.075 m tear going away.
- The 0.114 m at (410.8, 307.7) is smooth on both trees, the pad hand-off sitting where the ribbon's sections put
  it. The only step there is the ring's designed 0.15 m rim, the same on both.
- Moved nodes: up to 0.27 m (the gore now paved).

**bore-junction-clearance MAX_IN_PAD 19 → 20.** Seed 18's node (164.7, 6.3) moves its mouths 14.5 → 17.5 m. Its reach
circle (ringMaxR + shoulder + toe, the carve's bound) grows 29.4 → 32.3 m and takes in the portal of
g:-1,0,1:0,0,2 29.9 m away, 12.4 m past the ring. The carved ground within 8 m of that portal is identical to the
last 0.1 mm (`wip/bug-146/portal-ground.mjs`): a grown circle, not a cut headwall. This follows the 18 → 19 precedent
(BUG-63).

## Landed (orchestrator, 2026-11-09)
Merged to main as 44ae96fd (land/bug-146 @ 32b0e8e8): affected gates 69/69 green, plus the 14 that main's diff reached 14/14 on the merged tree; landing smoke on main PASS 26/26, zero console errors. MAX_IN_PAD now 20; BUG-147 (lane B) lands next and sets it to 18 under its shared-bore-aware variant.

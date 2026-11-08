---
id: BUG-144
type: bug
status: open
severity: minor
opened: 2026-11-08
source: Lane B, BUG-137's scans
relates: BUG-137 (causeway-T cliff), BUG-122/123 (junction-edge steps), road.js _padRibbonMask
---
lane: B

# BUG-144: the pad tears where two nearly parallel legs' mouth bands meet

`_padRibbonMask` takes the heavier leg's own deck. Two nearly parallel legs, 28 m out from a big node, disagree by
0.13–0.23 m, so the pad steps where one band hands over to the other.

- Seed 1353361482 at (26.3, 721.3): 0.19 m per 5 cm.
- Seed 917338424 at (99.4, −1015.8): 0.14 m per 5 cm.

Probe: `CarGame-machine/wip/bug-137/mask-legs.mjs <seed> x,z`.

## Acceptance

- No step over the designed lip across a hand-over between two legs' bands at either site.
- junction-edge-lip (or a sibling check) covers both seeds; fingerprint-world shows only the pads that move.

## Root cause and fix (Lane B, 2026-11-08, `land/bug-145-144`) — the pad's tear fixed; the drawn step is BUG-146

**Cause:** `_padRibbonMask` handed the pad the deck of whichever leg's band weighed more (`v > m` → that leg's
`_legDeckTop`). Where two nearly parallel legs' bands meet — 28 m out from a big node, the legs' decks 0.13–0.23 m
apart — the winner flipped across the gap and the pad stepped there.

**Fix:** the decks are blended, not picked. In the gap between the two pavements each deck is weighted by
v / (its distance past its own edge), so each leg is exact at its own edge and the gap is a straight ramp between
the two; where pavements overlap, by v × the depth inside each, which meets the one-leg case continuously at either
edge. With one leg in range it is that leg's deck, as before. At (26.3, 721.3) the 0.19 m tear is now a ramp of
≤ 5 cm per 12.5 cm.

**What remains is BUG-146 (Spare, the ribbon level).** Right at the two legs' mouths (28.7 m out) their DRAWN ribbons'
edges touch, 0.20 m (1353361482) and 0.12 m (917338424) apart in height. Past the mouths the pad must coincide with
each drawn ribbon, so no pad composition can remove a step the ribbons have: 0.143 and 0.124 m per 5 cm, one corner
per node.

- **The gate:** `junction-edge-lip`'s tear check (SMOOTH) now covers whole pads, not just T trunks; BUG-146's two
  sites are a named exception (tears within 1.5 m of them reported, not failed). Elsewhere the worst tear on the three
  seeds is 0.075 m per 5 cm (BUG-137's node, the side road's mouth ramp onto its own deck — a ramp, under 0.08).

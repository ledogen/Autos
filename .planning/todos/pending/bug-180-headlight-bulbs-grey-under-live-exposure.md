---
id: BUG-180
type: bug
status: open
severity: minor
opened: 2026-11-15
source: owner, 2026-11-15 — "One side effect of the exposure adjustment fix is The actual headlight bulbs themselves only get to a medium gray and never get bright white. Interestingly, the taillights still glow a bright red though."
relates: FEAT-221, FEAT-14, src/vehicle-model.js, src/exposure.js
---
lane: Spare

# BUG-180: Lit headlight bulbs read medium grey, not white, under live exposure

## Next steps
Orchestrator: land `land/lights-1116`. Owner: a night look at the bulbs (wip/lights-1116/bug180-sheet.png in the spare worktree).

## Summary
The headlight lens emissive (1.4 low, 2.2 high, halogen tan) sat in the middle of the ACES curve, so it read tan at
the night exposure and grey-brown whenever the live meter (FEAT-221) stopped down. The tail lamp uses the same
mechanism; it only looked right because a saturated red at half value still reads as bright red. Fixed by putting
the lamp's radiance where a real bulb's is: high on the ACES shoulder, so it reads white at any exposure.

## Description
Both lenses are plain toneMapped MeshStandard emissives: emissive colour × emissiveIntensity × exposure into ACES.
Nothing is special-cased. Brightest pixel on the bulb, test seed 6, 23:00, camera 7 m ahead of the nose
(`wip/lights-1116/bulb.mjs`; `k025` = live exposure held at its 2-stop night floor, the worst it can pick):

| lamp | before k=1 | before k=0.25 | after k=1 | after k=0.25 |
|---|---|---|---|---|
| low beam | 199,157,103 | 98,63,32 | 255,252,246 | 248,236,213 |
| high beam | 222,187,136 | 131,89,49 | 255,254,250 | 251,243,228 |
| low, left lamp at 5 % condition | 139,96,55 | 50,30,13 | 252,245,232 | 234,208,164 |

The values match three's ACES fit computed offline. New `lensLow 30, lensHigh 45`; the reverse lens (white, same
greying) `lensReverse 2.5 → 20`. Damage dim and flicker still multiply the lens linearly, as they do the beam.

## Tracker
- [x] Cause found (lens radiance mid-curve; tail red only looks fine by saturation)
- [x] Lit bulb reads white at night down to the meter's floor
- [x] Low, high and a damaged lamp checked
- [ ] Owner look at night

## Open questions
- On the lens itself a weak or flickering lamp now shows mostly as a warmer white (252,245,232 vs 255,252,246 at
  k = 1); the beam pool still dims fully. Recommendation: keep it, that is how a clipped real bulb looks.

## Files
`src/vehicle-model.js`

## Log
- 2026-11-15: 2d23a05b on land/lights-1116. Before/after: wip/lights-1116/before-*.png, after-*.png, bug180-sheet.png.

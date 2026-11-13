---
id: BUG-160
type: bug
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-11 inbox, marked "top priority right now" — "A front right wheel gave out after maybe a meter of air and landing down on the front I didn't even hear the tire pop So that's pretty interesting I think we should double check when a wheel fails versus where the tire fails A wheel with a tire on it should be quite resilient It's only after the puncture that it should be relatively fragile"
relates: [BUG-140, FEAT-193]
---
lane: B

# A wheel fails on a ~1 m landing with the tire still inflated

## What

A front-right wheel failed after roughly 1 m of air, landing nose-down. No tire pop was heard first.
The owner's rule: **an inflated tire protects the wheel.** A wheel with air in its tire should be quite
resilient. Only after the puncture, running on the rim, should the wheel be relatively fragile.

To find out: the order of the two failure checks in `src/damage.js` (does wheel damage see the same impact
load as the tire, with no cushion from the inflated carcass?), the thresholds for each, and whether the tire
did pop silently (a missing sound is a second bug). Reproduce headless: a 1 m drop, nose-down, on a healthy
tire and wheel.

## Acceptance

- [ ] Headless: the drop height / impact load at which (a) an inflated tire pops, (b) the wheel under an inflated
  tire fails, (c) the wheel under a flat tire fails. Report the three numbers before and after.
- [ ] With an inflated tire the wheel survives every landing the tire survives, and by a clear margin beyond it.
- [ ] A flat-tire wheel is fragile (today's behaviour or the owner's number).
- [ ] If the tire did pop without a sound, the pop is audible.
- [ ] Physics fingerprint re-pinned only if the step changed; damage gates green.

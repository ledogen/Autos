---
id: BUG-161
type: bug
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-12 inbox — "I was driving a fragile mission with a marble statue as the payload I Noticed that Occasionally the marble statue would lag slightly behind the car It would also appear to push the rear end down and Slow the car a little bit seems like some sort of physics glitch. It was intermittent and only occurred a couple times about two or three seconds Each time this was on a three or four kilometer mission I Want to say that it seemed like it happened more often in positive G maneuvers like hitting a dip Or anytime the road curved upwards, but I'm not sure about that"
relates: [PERF-42]
---
lane: B

# Fragile cargo (marble statue) lags behind the truck, squats the rear and slows it

## What

Intermittent, 2–3 s at a time, a couple of times on a 3–4 km fragile mission. The statue drifts behind
the truck, the rear end is pushed down and the truck slows. The owner suspects positive-g moments (a dip, a
road curving upward) but is not sure.

Two candidate causes to separate: (1) the cargo's hold on the bed (its joint or contact) stretching under
high vertical load, so the mass acts behind the axle and drags; (2) a slow physics step (PERF-42's spike
seconds) letting the cargo body fall behind the chassis. Reproduce headless with the statue's real mass over
a dip at speed and log the cargo's offset from its bed seat and the rear strut loads.

## Acceptance

- [ ] Reproduced headless, with the cause named (hold stretch vs slow step vs other).
- [ ] The cargo's offset from its seat stays within the hold's slack over a dip at mission speed.
- [ ] No rear squat or speed loss beyond what the statue's static mass explains.

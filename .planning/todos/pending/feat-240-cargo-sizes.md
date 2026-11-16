---
id: FEAT-240
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "Let's add a post-alpha feature, which is cargo of different sizes. This will be the system that prevents you from loading 12-foot boards into the back of your pickup truck."
relates: FEAT-204, FEAT-114, FEAT-91, FEAT-96, cargo.md
---
lane: unplaced (post alpha)

# FEAT-240: Cargo of different sizes — what fits which cargo area

## Next steps
Nobody: post alpha. Design it before building (an owner deep dive), together with the roof rack's two forms.

## Summary
Cargo gets a size, and a cargo area gets a size. Some loads cannot go in a small cargo area at all, such as
12-foot boards in a pickup bed. It is also how the game will handle different vehicles.

## Description
The owner's note in full (inbox, 2026-11-16):

> Let's add a post-alpha feature, which is cargo of different sizes. This will be the system that prevents you from
> loading 12-foot boards into the back of your pickup truck.
>
> We might keep the overloaded idea, where there are custom mounting positions that put the car all out of balance,
> but that will tie into this system. There will be some loads that just can't be loaded in small cargo areas. It's
> how we handle cars.
>
> This can absorb the conflict we have right now with the roof rack being just extra item storage as opposed to a
> way to hold longer cargo. That way to hold longer cargo can be added later. Maybe we'll have a utility roof rack
> for long cargo and a roof rack with containers that'll be for inventory or something like that.

Read as: (1) every cargo type carries dimensions, every cargo area (bed, roof rack, later vehicles) a capacity
envelope, and an offer that does not fit is refused or cannot be taken; (2) the "overloaded" idea may stay as custom
mounting positions that unbalance the truck, tied into this system; (3) the roof rack's conflict (item storage
versus long cargo) is settled here: possibly a utility rack for long cargo and a container rack for inventory.

## Tracker
- [ ] Owner design pass (deep dive): sizes, envelopes, what a refused load looks like on the offer card
- [ ] Cargo dimensions on every cargo type (cargo.md)
- [ ] Cargo-area envelopes per vehicle and per fitted rack
- [ ] The roof rack split: long-cargo rack and container rack
- [ ] Overloaded mounting positions and their effect on balance

## Open questions
- Does the alpha's roof rack (FEAT-204) stay item storage until this lands?

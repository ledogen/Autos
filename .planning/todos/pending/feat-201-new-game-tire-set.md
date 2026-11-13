---
id: FEAT-201
type: feature
status: open
severity: minor
opened: 2026-11-12
source: owner, 2026-11-12 inbox — "I've noticed that sometimes in a new game you spawn with both rear tires as old tires and it Makes the car pretty squirrely. I think an elegant solution to this is On every new game, let's just make sure the player only gets one old tire and it's in the front This way the car still drives quite well But you do have some debt to take care of at some point Let's also I guarantee the player spawns with a spare tire and it's an old used tire"
relates: [FEAT-168]
---
lane: B

# New game: exactly one old tire, on a front corner, plus an old spare

## What

Every new game: three good tires, one old tire on a front corner, and one old used tire in the inventory as
the spare. Never an old tire on the rear axle at the start.

## Acceptance

- [ ] Over 50 new games on random seeds: one old tire, always front; an old spare present every time.
- [ ] The run-start gate asserts it.

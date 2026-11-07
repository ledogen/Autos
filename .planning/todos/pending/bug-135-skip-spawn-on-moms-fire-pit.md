---
id: BUG-135
type: bug
status: open
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

---
id: BUG-162
type: bug
status: open
severity: minor
opened: 2026-11-12
source: owner, 2026-11-11 inbox — "There's no mission expiry timer for hall missions" (hall = haul)
relates: [FEAT-91]
---
lane: Spare

# Haul missions show no expiry timer

## What

Other mission types show how long the offer is good for ("available for:" / "time limit:", the standing
wording). Haul missions show nothing.

## Acceptance

- [ ] A haul offer shows its expiry the same way the other types do, on the card and in the run overlay ("due in").
- [ ] If a haul has no expiry by design, say so in the report instead and ask the owner.

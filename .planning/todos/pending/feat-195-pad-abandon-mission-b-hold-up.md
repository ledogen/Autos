---
id: FEAT-195
type: feature
status: open
severity: minor
opened: 2026-11-12
source: owner, 2026-11-11 inbox — "I still don't know how to abandon a mission on controller I think It should be triggered by holding B and going up"
relates: [FEAT-125]
---
lane: Spare

# Controller: abandon a mission with B-hold + up

## What

There is no discoverable way to abandon a job on the pad. The owner's binding: hold B (the side menu's hold)
and press up. It must be shown on screen wherever the side menu shows its bindings — no hidden gestures.

## Acceptance

- [ ] B-hold + up abandons the current job (with the same confirm the keyboard path has), including an expired one.
- [ ] The binding is printed in the B-hold menu; pad-e2e covers it.

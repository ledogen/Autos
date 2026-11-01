---
id: BUG-101
type: bug
status: open
severity: minor
opened: 2026-11-01
source: owner, 2026-11-01 — FEAT-103 requisition fuel delivery, machine under heavy load
relates: FEAT-96 (strapped freight), FEAT-97 (fragile), src/physics.js, src/debris.js, test/cdp-smoke.mjs
---

# Freight cargo collider and mesh lag a step behind the chassis while driving

## Owner's report (2026-11-01, verbatim)

> With debug menu open, the collider box for the fuel drum in the bed lags slightly behind the truck.
> Seems like it's just updating its position every frame or every couple frames while the truck
> moves smoothly. Not the end of the world, but I did notice that it would visually lag behind the
> truck on occasion as well. I assume this has to do a little bit with the performance impact of all
> the testing that's currently being performed. Make a new bug ticket for it. Maybe it's something
> that's better can take care of rather quickly. It seems like the position of Freight cargo is not
> perfectly welded to the chassis of the truck while driving.

The machine was running two full gate batteries at the time (all cores), so frame time was long.

## Likely shape

A strapped load is a body of its own, joined to the bed. If its mesh is written from its body
transform BEFORE the physics step while the chassis mesh is written AFTER (or the reverse), the load
reads one fixed step behind the truck — invisible at 60 fps, a visible lag when a frame carries
several fixed steps. Check the order mesh transforms are copied in the frame loop, and whether the
load's debug box uses interpolated or raw body state. A load that is physically welded (strapped,
intact) could also simply be parented to the chassis mesh for rendering and only use its body for
the strap-break / damage model.

## Acceptance

- Under a simulated heavy frame (e.g. 4 fixed steps per render frame in the headless harness, or a
  throttled Chrome in the smoke), the strapped load's mesh and debug box move in the same frame as
  the chassis — no visible offset in a screenshot pair.
- No change to the strap-break or damage behaviour (FEAT-96/97 gates green).

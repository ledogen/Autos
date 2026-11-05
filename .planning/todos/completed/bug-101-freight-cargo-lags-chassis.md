---
id: BUG-101
type: bug
status: closed
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

## Cause and fix — Spare, 2026-11-01

**Not a physics lag, a debug-draw one.** The strap is a rigid weld (frequency 0) and freight-strap
already gates it: a 400 kg load drifts < 5 mm in the bed on a rough road at 15 m/s. The load's MESH is
posed like every debris mesh — interpolated at the truck's own render alpha (`debris.js update()`), so
truck and load are drawn at the same instant. The COLLIDER BOX was not: `PhysicsWireframes.update` read
every non-vehicle dynamic body straight from the engine, on a comment that "debris meshes are posed
from the raw engine transform too" — true once, stale since debris got interpolation. So the freight's
box sat at the current physics step while the load and truck were drawn up to a step earlier: ~0.5 m
at 30 m/s, and jumping frame to frame under load, when a frame carries several steps or the PERF-32
catch-up budget zeroes the alpha. That is the owner's "updating every couple frames".

Fix: `DebrisSystem.meshOf(body)`; the wireframes take the drawn pose for any body it answers
(`update(cameraPos, vehiclePose, poseOf)`), the engine otherwise. Measured live
(`wip/bug-101/wireprobe.mjs`: a barrel thrown at 30 m/s, wireframes on, CPU throttled 6×, 149 frames):
box ↔ mesh **0.000 m** at worst; the raw engine pose the box used before sits up to **0.508 m** off.
Affected gates 16/16 green, smoke included. If the owner still sees the load itself trail the bed,
that is a new observation — the weld and the mesh interpolation both measure clean.

## Pinned headlessly + resolution (Spare, 2026-11-05) — CLOSED

The step order is right, and now a gate says so. main.js snapshots the truck's render pose (`_prevRenderPos`) and
every debris body's (`DebrisSystem.beforeStep`) on EVERY fixed step, just before `stepPhysics`, and draws both at
the same alpha (`debrisSystem.update(_renderAlpha)`), so the strapped load and the bed are drawn at the same
instant however many steps a frame carries. `freight-strap` check 6 drives the welded 400 kg load at 15 m/s on the
rough road at 1–4 steps per frame and every alpha, restating main.js's truck interpolation: the drawn load sits
0.89 mm off its strap pose in the drawn bed. Snapshotting once per frame instead (the failure the ticket guessed)
puts it 689 mm behind, and the check fails — tried (`wip/bug-101/strap-once.mjs`). The collider box was the
11-01 fix (`DebrisSystem.meshOf`: the wireframes draw the interpolated pose). Strap and damage behaviour untouched
(freight-strap's other checks unchanged, all green).

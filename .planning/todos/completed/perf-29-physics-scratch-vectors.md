---
id: PERF-29
type: perf
status: cancelled
opened: 2026-07-28
closed: 2026-07-28
severity: trivial
source: external prompt audit (Babylon-style perf tenets compared against src/)
relates: [PERF-28 (cancelled alongside — same audit), PERF-26/27 (where our hitches actually come from)]
resolution: "CANCELLED un-implemented, same day it was opened. Removes an allocation load V8's
scavenger already handles for ~free, in exchange for real silent-corruption risk in the physics
integrator. Do not re-open on 'zero allocations in the render loop' grounds — that tenet targets a
bottleneck we do not have."
---

# PERF-29 (CANCELLED): Scratch-vector the physics step

Proposed hoisting the ~22 `THREE.Vector3` / `Quaternion` intermediates allocated per `stepPhysics`
call in `src/physics.js` to module-scope scratch objects, e.g. `physics.js:292`:

```js
totalTorque.add(new THREE.Vector3().crossVectors(rMount, suspBodyForce))
```

At the fixed 60 Hz step that is ~1,300 short-lived objects/sec.

## Why this is not a win (the reason it was cancelled)

The tenet it came from — "zero allocations in the render loop, a 12 ms GC pause is a visible
hitch" — is about a **major** GC. V8 is generational: objects that die young are reclaimed by the
scavenger, whose cost is proportional to *survivors*, not to garbage produced. ~1.3k tiny,
immediately-dead objects per second does not drive promotion and does not produce a major GC.

Our measured hitches (PERF-26/27) trace to worldgen streaming — terrain chunk builds, route
solving, the reseed double world build. Not GC. There is no pause here to remove.

## The risk side, which is not zero

Module-scope scratch reused across two live values in the same expression silently corrupts the
result — no crash, no error, just wrong forces. This codebase's most expensive historical bugs are
exactly that shape: three compensating sign errors in the tire slip-angle math, and the damper sign
inversion in the suspension. Taking on that class of risk inside the integrator to buy an
unmeasurable allocation saving is a bad trade at any profiling result.

## Where the pattern IS correct

Allocation avoidance earns its keep where volume is genuinely large and the code is not
safety-critical numerics — see `road-carve.js:638`, where the router's search heap uses
module-scope parallel arrays specifically to avoid per-node allocation. That was driven by
measurement in a path doing orders of magnitude more work. The distinction is volume + measurement,
not principle.

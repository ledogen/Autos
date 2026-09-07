---
id: BUG-60
type: bug
status: pending
severity: medium
opened: 2026-09-06
source: >
  owner, seeing the menu stage's front-left tire visibly sink into the rock it lands on (FEAT-41).
  Owner's framing, and the reason this ticket exists rather than a cosmetic patch in stage.js:
  "the true elephant in the room, which is our box3d to internal physics schema conversion layer
  misbehaving."
relates_to: >
  src/physics-engine.js (THE adapter seam), src/physics.js (stepPhysics / qcPlus / contact
  assembly), src/suspension.js (tire spring, WHEEL_SOFT_BAND, effectiveWheelRadius),
  src/vehicle-model.js (the rigid wheel mesh), FEAT-48 (the Box3D cutover),
  FEAT-41 (where it became visible), QUAL-25 (wheel hard cores)
---

# BUG-60: a loaded wheel is drawn rigid while the tire model penetrates the surface

## Symptom

On the FEAT-41 menu stage the truck is dropped so its front-left wheel lands on a rock. The tire
**visibly sinks into the rock** — a quarter of it disappears — twice, as the suspension oscillates,
before settling into a pose that looks fine. Against terrain the same thing happens and nobody has
ever seen it, because a road surface hides the intersection at the contact patch. A discrete convex
solid is the first thing in this project to show it.

## Measured (FEAT-41 stage, seed-independent — it is the vehicle, not the world)

Instrumented every physics step of the drop:

- **Zero missed contacts** — 88 consecutive frames in contact, no dropouts.
- **Exactly one physics step per rendered frame**, median frame 17 ms, max 31 ms. No pacing artefact,
  no catch-up, no jump in body height between frames.
- **Penetration of the wheel sphere into the solid: 55 mm at rest, 92 mm at the landing peak.**
  Tire radius is 368 mm, so the peak is a quarter of the wheel.
- `rimForceRoad` stays 0 throughout, so this is entirely inside the modelled soft band — the carcass
  never bottoms out onto the rim.

So the contact chain is behaving. The penetration is not an error term; it is what the model
currently *means* by tire deflection.

## Why it is not simply "the model is right, the picture is wrong"

`fz = tireStiffness × depth` by construction: the query hands the solver a sphere of `wheelRadius` at
the hub, and the sphere's overlap IS the deflection. `computeStaticEquilibrium` agrees and seats the
hub at `wheelRadius − tireComp` deliberately. Internally consistent.

What is NOT settled, and is what this ticket is for, is whether that convention still holds its shape
across the adapter seam after FEAT-48. The wheel is analytic on one side of the seam and an engine
body on the other, and the two describe the same wheel differently:

- the **soft path** treats the wheel as a sphere of `wheelRadius` whose overlap is rubber;
- the **engine path** carries a hard core at `wheelRadius − WHEEL_SOFT_BAND` (QUAL-25) that collides
  with debris only;
- `contactSphere` returns depth along the contact NORMAL, while the analytic terrain probe returns a
  vertical height difference. Those are the same number on flat ground and diverge on a slope — and
  the whole stack consumes them through one `{normal, depth, contactPoint}` shape as if they were
  interchangeable.

92 mm of penetration on a tire whose entire soft band is 150 mm is worth checking against that.
Owner's read is that the conversion layer is misbehaving; the measurements above neither prove nor
refute it — they establish that whatever is happening is deterministic, contact-complete, and inside
the soft band, which rules out the cheap explanations.

> **HANDOFF: `.planning/handoffs/HANDOFF-2026-09-06-BUG-60-collider-seam.md`** — reproducer,
> baseline numbers, the patch, the verification bar, and the dead ends already burned.
> Reproduce with `node test/bug60-rock-contact.mjs` (needs `npm run dev`).

## ROOT CAUSE FOUND 2026-09-06 — `destroyBody` leaks shape-keyed maps; the rock's collider stops answering

**Owner was right: it is the adapter.** Earlier passes on this ticket chased the wrong thing (tire
deflection and occlusion, kept below for the record). The real defect is reproducible and is in
`src/physics-engine.js`.

### The symptom, measured

The front-left wheel settles INSIDE the rock, at ground height, with the rock drawn around it — and
sometimes hops ~10 cm frame to frame on the way there. In 40 scripted drops, ~10 ended with the
wheel at hub height 333 mm (resting on the ground plane) instead of 579 mm (on the rock), reporting
**no rock contact for 228 of 252 frames**. The solver is asking the right question — traced its own
calls: query centred 13 mm from the rock's axis, wheel radius, real 96 mm overlap — and getting
nothing back. An identical query issued immediately afterwards also returns nothing, so it is not a
stale read.

### What is NOT wrong

- Rock body transform: **unchanged and correct** (−1.035, −0.055, −1.052) after failure.
- `_shapeToHandle` still maps the rock's shape key to the rock's handle.
- The hull data is intact: a **2.0 m** query sphere still returns exactly the right depth (1860 mm,
  matching a cap top at y = 0.26).
- The query is not order-dependent: the same call repeated 8× with far queries, debris-group queries
  and small probes interleaved returns 28 mm every single time.

### What IS wrong

The same shape, at the same place, answers a 2.0 m sphere correctly and a 0.368 m sphere not at all.
Probing before and after failure inverts exactly:

| probe | fresh page | after failure |
|---|---|---|
| r 0.368 at the rock's SURFACE (y 0.60) | **28 mm** | **null** |
| r 0.368 low, reaching past the body origin (y 0.10) | 528 mm | 528 mm |
| r 0.05 at the BODY ORIGIN (y −0.055) | null | **365 mm** |
| r 0.05 at the SURFACE (y 0.25) | null | null |

After the fault the shape only answers queries that reach its **body origin**, and the 365 mm it
reports there is exactly `0.315 + 0.05` — a shape of the cap's half-height centred on the origin
rather than the authored geometry. Before the fault it answers at its surface and is silent at its
origin. The collider has stopped being where it is drawn.

### The trigger, and the leak behind it

**One `DebrisSystem.clear()` + respawn cycle is enough** — reproduced after as few as 1 reset, and
within 9 every time. That churn is the only thing happening between "works" and "does not".

`destroyBody` prunes ONE of the three shape-keyed maps:

```js
for (const s of rec.shapes) this._shapeToHandle.delete(this._shapeKey(s))
_b3.b3DestroyBody(rec.id)
```

`_shapeHulls` and `_shapeSizeR` are never pruned. Measured live: `_shapeToHandle.size` **19** against
`_shapeHulls.size` **24** — five stale entries for shapes that no longer exist. Keys are
`shapeId.index1 * 0x10000 + generation`, and Box3D recycles shape slots, so a newly created debris
shape can be issued a key that a stale entry already occupies; `_register` then writes the new hull
over whatever was there. `contactSphere`'s hull branch reads straight out of that map:

```js
const hull = this._shapeHulls.get(this._shapeKey(shapeId))
if (!hull) return true
```

so a shape can end up narrow-phased against hull data that is not its own.

### Why it looks rock-only

Nothing else in the project puts a long-lived STATIC hull in the same id space as bodies being
created and destroyed every few seconds. Terrain is heightfields and meshes (skipped by
`contactSphere`'s type switch entirely), the chassis is rebuilt with the world, and debris churns
against debris. The menu stage is the first place a permanent hull shares that space with a
revolving door of temporary ones.

### Fix direction

`destroyBody` must prune `_shapeHulls` and `_shapeSizeR` with the same loop that prunes
`_shapeToHandle`; on current code they grow for the life of the process. Then confirm whether that
alone closes it, or whether the key itself needs to be collision-proof — `index1 * 0x10000 +
generation` silently aliases once `generation` exceeds 65535, and nothing asserts it does not.

### Acceptance

- `destroyBody` leaves no entry in ANY shape-keyed map for a destroyed shape; assert
  `_shapeToHandle.size === _shapeHulls.size` after a create/destroy cycle.
- A permanent static hull keeps answering wheel-sized queries at its surface across ≥100 debris
  create/destroy cycles. The menu stage is the reproducer: 40 drops with zero runs ending at hub
  height 333 mm.
- Consider whether `_shapeKey` should carry `generation` in its own field rather than added.

---

*Everything below is the earlier investigation. It explains why penetration is normal and why you
only ever SEE it on a rock — both still true, and both a separate matter from the defect above.*

## INVESTIGATED 2026-09-06 — the visual is not a bug; a different seam asymmetry is

### The contact sources agree. There is no conversion discrepancy behind this symptom.

Measured on the stage at rest, where ONE wheel is on the rock (engine hull path, `contactSphere`)
and the other three are on the flat plane (analytic path). Same truck, same frame:

| wheel | contact source | depth | Fz | Fz/depth |
|---|---|---|---|---|
| FL | **rock** — engine hull | 48.1 mm | 5215 N | 108 510 N/m |
| RR | plane — analytic | **53.5 mm** | 5938 N | 110 904 N/m |
| FR | plane — analytic | 22.5 mm | 2261 N | 100 484 N/m |
| RL | plane — analytic | 16.6 mm | 1680 N | 101 263 N/m |

**The rear-right wheel is 53 mm inside the flat ground — deeper than the front wheel is inside the
rock.** Effective stiffness is the same on both paths, and the spread (100k → 111k) tracks LOAD, not
contact source: the two lightly loaded plane wheels sit at 100–101k and the two heavily loaded ones
(one on each path) at 108–111k. That is the progressive term, present identically on both.

### Why the tire is inside anything at all

The tire IS the overlap. `queryContacts` hands the solver a sphere of `wheelRadius` at the hub and
`fz = tireStiffness × depth`, so depth is not an error term — it is what this model MEANS by tire
deflection. `computeStaticEquilibrium` seats the hub at `wheelRadius − tireComp` deliberately, so a
wheel mesh has always been ~39 mm inside the road at static load.

The drawn geometry is consistent with that: drawn rim outer radius 0.203 m against a physics hard
core at `wheelRadius − WHEEL_SOFT_BAND` = 0.218 m, so the core is 15 mm OUTSIDE the drawn rim, and
there is 165 mm of drawn sidewall against a 150 mm modelled soft band. Every penetration measured
here (48–92 mm) is inside rubber the model says is compressed. **The rim never clips.**

### Why it shows on a rock and never on ground or roads: occlusion, not physics

A road or a plane keeps going toward the camera without falling away, so from any viewpoint above
it, the surface hides everything beneath it — the submerged half of the contact patch is behind the
road mesh. Occlusion is total at any angle above horizontal.

A rock is convex and small: its surface falls away from the contact point in every direction, so the
submerged rubber is exposed the moment the rock's silhouette stops covering it. Quantified for the
menu stage: the flat cap is ~0.87 m across (~0.43 m from contact patch to edge) and the camera sits
~14° above the contact point, so the cap can hide at most 0.43 × tan 14° ≈ 107 mm — and only with
the wheel centred on it. The wheel actually sits ~0.22 m forward of centre, which leaves far less
cap between viewer and contact. Hence 48–92 mm shows.

That is the whole of it: **the rock is simply the first thing in this project shaped so that you can
see the inside of a contact patch.**

### The one thing that IS wrong at the seam (not this bug — but real)

`contactSphere` returns depth **along the contact normal**; the analytic terrain query returns a
**vertical** overlap, `(groundH + r) − cy`. Measured directly by pushing a wheel-radius sphere
straight DOWN by 50 mm at points along the rock:

| surface normalY | engine depth | `push × normalY` (along-normal) | vertical |
|---|---|---|---|
| 1.00 (flat cap) | 50.0 mm | 50.0 mm | 50.0 mm |
| 0.92 (flank) | **46.9 mm** | 46.0 mm | 50.0 mm |
| 0.90 (flank) | **45.8 mm** | 45.0 mm | 50.0 mm |

Confirmed along-normal. It does not bite in this symptom because the wheel rests on the flat cap,
where `normalY = 1` and the two conventions coincide exactly. It bites on a SLOPE: the two sources
price identical geometry differently, the analytic/terrain path reporting `1/cos θ` more deflection
and therefore more tire force — **10% at 25°, 41% at 45°** — while `qcPlus` unions both into one
`{normal, depth, contactPoint}` list that the tire model consumes without distinction.

So the owner's instinct pointed at something real; it is just not what makes the tire appear inside
the rock. **This is the thing to fix, and fixing it will not change the appearance.**

## Do NOT fix it in the stage

A cosmetic fix was built and **reverted on owner review** (`7200ccc`, reverted `22dde4a`): the stage's
tire meshes were squashed by their own re-queried overlap, which cancelled the intrusion exactly
(55 mm → ~0) and measured correct per corner. It looks wrong — the tire deforms while the steelie
inside it stays rigid, and the eye reads that immediately. Recorded so nobody rebuilds it: if the
tire is ever drawn deforming, **the rim has to deform with it or be re-seated**, and that is a
vehicle-renderer change, not a stage one.

The stage keeps the glitch on purpose until this is addressed.

## Acceptance

- ~~A statement of what the wheel's contact geometry MEANS on each side of the seam~~ — **ANSWERED
  above.** They agree on depth-per-newton and disagree on the DEPTH CONVENTION: along-normal from
  the engine, vertical from the analytic probe, conflated in `qcPlus`.
- ~~Either the penetration is confirmed correct, or the seam is corrected~~ — **the penetration is
  confirmed correct**; the visible intrusion is an occlusion consequence, not a defect.
- **What remains**: decide the one true depth convention and make both sources speak it. Vertical is
  what the tire spring wants (it is a vertical spring on a hub); along-normal is what a contact
  solver naturally produces. Whichever is chosen, terrain and debris/prop contacts must agree, or a
  wheel on a 45° prop face is priced 41% softer than the same wheel on a 45° hillside.
- Whatever the outcome, re-run the FEAT-41 stage drop: the front-left tire on the rock is the
  cheapest visual assay this project has for wheel-contact truth, and it costs nothing to look at.

## Reproduce

`npm run dev`, land on the main menu, watch the front-left wheel meet the rock. To measure rather
than watch, wrap `window.__stage._queryContacts` and sample `depth` per step — the stage exposes
itself as `window.__stage` for exactly this.

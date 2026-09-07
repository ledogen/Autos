# HANDOFF — BUG-60: a static hull stops answering contact queries — 2026-09-06

**You are fixing a real defect in `src/physics-engine.js`. It is diagnosed, it is reproducible in
one command, and no code has been changed yet. Read §3 before you write anything — three separate
defects are described and only ONE of them is the suspected cause; do not fix all three in one
commit and lose the ability to tell which mattered.**

State: main @ `226b640` + the reproducer commit. Ticket:
`.planning/todos/pending/bug-60-wheel-visual-penetration.md` (its lower half is an earlier,
SUPERSEDED investigation — §5 explains what to ignore).

---

## 1. Reproduce it — one command

```
npm run dev                 # one shell
node test/bug60-rock-contact.mjs --port=8000 --drops=40
```

Exits 1 when reproduced. Current baseline on main:

```
shape-keyed maps   live shapes 19 · _shapeToHandle 19 · _shapeHulls 108 · _shapeSizeR 108
                   (at boot: 19 / 18 / 18)
_hulls retained    328 → 11608
fell through the rock: 9 of 30 drops
  run  3  hub 333 mm  (on the rock ≈ 579)  rock contact lost on 228 of 252 frames
```

**That is your target: 0 of 40, and `_shapeHulls` == `_shapeSizeR` == `_shapeToHandle`.**

The visible symptom: the menu stage's front-left wheel settles *inside* the rock, at ground height,
with the rock still drawn around it — and sometimes hops ~10 cm frame-to-frame on the way there.
Wheel hub sits at 579 mm on the rock and 333 mm on the ground; a run ending at 333 fell through.

## 2. What is and is not broken — measured, so you do not have to re-derive it

**Not broken.** After a failure the rock's body transform is unchanged and correct
(−1.035, −0.055, −1.052). `_shapeToHandle` still maps its shape key to its handle. The hull data is
intact — a **2.0 m** query sphere still returns exactly the right depth (1860 mm, matching a cap top
at y = 0.26). The query is not order-dependent: the same call repeated 8× with far queries,
debris-group queries and small probes interleaved returns 28 mm every time.

**Broken.** The same shape at the same place answers a 2.0 m sphere and not a 0.368 m one. Probing
before and after inverts exactly:

| probe | fresh page | after failure |
|---|---|---|
| r 0.368 at the rock's SURFACE (y 0.60) | **28 mm** | **null** |
| r 0.368 low, reaching past the body origin (y 0.10) | 528 mm | 528 mm |
| r 0.05 at the BODY ORIGIN (y −0.055) | null | **365 mm** |

After the fault the shape only answers queries that reach its **body origin**, and the 365 mm it
reports there is exactly `0.315 + 0.05` — a shape of the cap's half-height centred on the origin
rather than on the authored geometry. Before the fault it answers at its surface and is silent at
its origin. The collider has stopped being where it is drawn.

**Trigger**: one `DebrisSystem.clear()` + respawn cycle is enough. Reproduced after as few as 1
reset, always within 9.

## 3. The three defects. Fix ONE first.

### (a) SUSPECTED CAUSE — `destroyBody` prunes one of three shape-keyed maps

`replaceHullLocal` already does this correctly, two methods away in the same file. `destroyBody`
forgot two lines:

```js
  destroyBody (handle) {
    const rec = this._bodies.get(handle)
    if (!rec) return
    this._rev++
-   for (const s of rec.shapes) this._shapeToHandle.delete(this._shapeKey(s))
+   // ALL THREE shape-keyed maps, not just the handle lookup — see replaceHullLocal, which already
+   // does this. Keys are index1+generation and Box3D RECYCLES shape slots, so a stale _shapeHulls
+   // entry is hull data waiting to be read for a DIFFERENT, live shape.
+   for (const s of rec.shapes) {
+     const k = this._shapeKey(s)
+     this._shapeToHandle.delete(k)
+     this._shapeHulls.delete(k)
+     this._shapeSizeR.delete(k)
+   }
    _b3.b3DestroyBody(rec.id)
```

`contactSphere`'s hull branch reads straight out of `_shapeHulls`, so a shape narrow-phased against
someone else's hull explains the symptom shape exactly. **Do this one alone, then re-run §1.** If it
goes 0/40, you are done and (b) and (c) become separate tickets.

### (b) `_shapeKey` can alias

`_shapeKey (shapeId) { return shapeId.index1 * 0x10000 + shapeId.generation }` collides silently
once `generation` passes 65535, and nothing asserts it does not. The wheel rim cores churn ~420 hull
replacements per 7-second drop (`updateWheelRims` → `replaceHullLocal`, 4 mm threshold), each
bumping a recycled slot's generation — a slow fuse, not a hypothetical. Widen the shift or assert
the bound.

### (c) `_hulls` grows without bound

Measured 328 → 11608 in 30 drops, ~380 per drop, pruned only by `dispose()`. Every hull
`replaceHullLocal` ever builds is retained, and that runs whenever a strut moves 4 mm — so this
leaks continuously while DRIVING, not just on the stage. `addCylinder`'s comment says the shape
*copies* the hull data ("hull data is shared/copied by the shape; free on dispose"), which would
mean these can be destroyed right after shape creation instead of hoarded. **Verify that against the
vendored bindings before touching it** — a wrong call here is a use-after-free that will present as
random garbage collisions, which is much worse than a leak.

## 4. Verification bar

1. `node test/bug60-rock-contact.mjs --port=8000 --drops=40` → **0 fall-throughs, 0 stale entries.**
2. Add a gate. The cheap, pure-node one is worth more than the browser reproducer: build a
   `PhysicsEngine`, create a static hull body, then create and destroy debris bodies in a loop, and
   assert after each cycle that `_shapeToHandle.size === _shapeHulls.size === _shapeSizeR.size` AND
   that a sphere query at the static hull's surface still returns the same depth it did on cycle 0.
   That is `test/gates.mjs` with `subsystem: 'physics'`. It needs no browser — `initPhysicsEngine()`
   works headless, which is how the existing `box3d-determinism-gate` runs.
3. `npm run test:all` — compare against main's standing reds before you start, they move.

## 5. Dead ends already burned — do not repeat these

- **The tire is SUPPOSED to be inside things.** `fz = tireStiffness × depth` by construction and
  `computeStaticEquilibrium` seats the hub at `wheelRadius − tireComp`. A loaded wheel sits ~39 mm
  inside a flat road at rest and ~90 mm at a landing peak. Measured in the same frame: the rear-right
  wheel is 53 mm inside the flat ground while the front-left is 48 mm inside the rock. **That is not
  this bug** and the lower half of the ticket explains it at length.
- **Do not fix this in `src/stage.js`.** Owner ruling. The stage is the reproducer, not the patient.
- **Do not draw a deforming tire.** It was built and reverted on owner review (`7200ccc` →
  `22dde4a`): squashing the tire mesh cancels the intrusion exactly and measures correct per corner,
  but the steelie inside it stays rigid and the eye catches it instantly. If anyone revisits it, the
  rim has to deform or be re-seated too — a vehicle-renderer change.
- **`getTransform` writes `.x/.y/.z`, it does not call `.set()`.** A probe shim using `.set()`
  silently reports `[0,0,0]` for every body, which looks exactly like "the body moved to the origin".
  Cost me a wrong conclusion; use a real `THREE.Vector3`.
- Already ruled out, with measurements: shape eviction from `_shapeToHandle`, body-id aliasing,
  order-dependence of `contactSphere`, deep-overlap/containment degeneracy (a sphere pushed straight
  down through the cap keeps contact from y 0.628 to −0.10 without a single loss), and frame pacing
  (one physics step per rendered frame, median 17 ms, no jump in body height).
- **Related history worth knowing**: the rock's hull originally came from a non-indexed 240-point
  array describing a 42-point solid, and Box3D built a hull from it that only reported contacts at
  DEEP overlap — shallow ones came back empty and the truck settled straight through. Deduping to
  unique vertices fixed that. Different bug, same family, same file. If you touch `addHull`, that is
  the failure mode to keep in mind.

## 6. Why it only shows on the rock

Nothing else in this project puts a long-lived STATIC hull in the same id space as bodies being
created and destroyed every few seconds. Terrain is heightfields and meshes, which `contactSphere`'s
type switch skips outright; the chassis is rebuilt with the world; debris churns against debris. The
menu stage is the first place a permanent hull shares that space with a revolving door of temporary
ones — which is also why fixing this matters beyond the menu: FEAT-71/72/74 will scatter static POI
and road-furniture hulls through a world where debris spawns and despawns constantly.

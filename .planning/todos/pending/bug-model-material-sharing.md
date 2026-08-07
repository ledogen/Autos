---
id: BUG-43
type: bug
status: pending
severity: major
opened: 2026-08-05
relates: FEAT-59, FEAT-60, ASSET-21
---

# BUG-43: every spawn of a model shares one set of materials, so per-instance recolour bleeds

`spawnModel()` returns `rec.template.clone(true)` (`src/model-service.js`). `Object3D.clone()` copies
the scene graph but **shares materials by reference** — so every instance spawned from a registry key
points at the *same* `THREE.Material` objects.

Recolouring one instance therefore recolours all of them.

## Why it matters now

FEAT-60 (`feature/poi-models`) spawns `trailerHomeA` for **both** `momsHouse` and `larrysHouse`. The
whole point of ASSET-21 is per-instance recolour — its ticket: *"one body colour driven across
cyan → yellow → white so a row of trailers reads as a park rather than a copy-paste."* As things
stand a park of trailers is guaranteed to be a copy-paste, and the two story houses can never differ.

This is not trailer-specific. It hits any future asset with a recolourable zone.

## Reproduction (headless, no game needed)

```js
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
// ... parse assets/models/trailer-home-a.glb into `template` ...
const a = template.clone(true), b = template.clone(true)
grab(a, 'TrailerBody') === grab(b, 'TrailerBody')   // → true
grab(a, 'TrailerBody').color.setRGB(0.88, 0.76, 0.28)
grab(b, 'TrailerBody').color.getHexString()          // → f1e290, bled through
```

Confirmed 2026-08-05: the GLB itself is fine — it loads clean, all 8 materials present, names intact
and substring-matchable exactly as `src/vehicle-model.js` matches vehicle paint. The defect is purely
in the clone semantics.

## Fix sketch — needs a ruling before implementing

Cloning materials for *every* spawn is wasteful: most assets never recolour, and each clone is a
separate draw-call state. Prefer opt-in, declared in `data/prop-models.js` next to the asset:

```js
trailerHomeA: {
  url: 'assets/models/trailer-home-a.glb',
  recolor: ['TrailerBody', 'TrailerAccent'],   // ← spawnModel clones ONLY these, per instance
  collision: { ... },
}
```

`spawnModel()` then walks the clone and replaces just the named materials with `.clone()`s, so the
other six stay shared. That also documents the recolour contract in the registry, where a placement
author will actually look, instead of only in the asset ticket.

Open question for the owner: should the substring matching that `vehicle-model.js` uses for paint be
reused here (`'Body'` matching `TrailerBody`), or should `recolor` list exact names? Exact names are
less surprising; substring is consistent with the existing vehicle path.

## Acceptance

- [ ] Two instances spawned from one registry key can be given different `TrailerBody` colours, and
      neither bleeds into the other.
- [ ] Materials NOT named in `recolor` remain shared between instances (assert identity, so the fix
      cannot silently regress into cloning everything).
- [ ] A gate covers it — headless, `GLTFLoader.parse()` on the shipped `.glb`, no DOM needed. The
      repro above runs in pure node today.
- [ ] `mom's house` and `larry's house` visibly differ in-game once FEAT-60 lands.

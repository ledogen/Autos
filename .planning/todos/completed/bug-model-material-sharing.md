---
id: BUG-43
type: bug
status: closed
closed: 2026-10-04
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

- [x] Two instances spawned from one registry key can be given different `TrailerBody` colours, and
      neither bleeds into the other.
- [x] Materials NOT named in `recolor` remain shared between instances (assert identity, so the fix
      cannot silently regress into cloning everything).
- [x] A gate covers it — headless, `GLTFLoader.parse()` on the shipped `.glb`, no DOM needed. The
      repro above runs in pure node today.
- [x] `mom's house` and `larry's house` visibly differ in-game once FEAT-60 lands.

## Resolution (2026-10-04)

The mechanism had already shipped on 2026-08-21 as FEAT-59's curated palettes (`d660a10`). It
resolved the open question the way this ticket leaned: opt-in, declared in `data/prop-models.js`,
**substring** matching like the vehicle paint path, and only the named materials swapped. Each
palette colour is built once at load and shared by every spawn of that variant, so it costs no
per-spawn material clones. What was still missing:

- `trailerHomeA` declared no palette. It now carries ASSET-21's cyan / yellow / white
  (`TrailerBody` + `TrailerAccent`, in lockstep).
- Nothing passed a `variant`. The POI roster now stamps `q.modelVariant`. A slot can pin it
  (mom = 0 cyan, Larry = 1 yellow, so the two never match); otherwise it's
  `hash32('poi-variant:seed:id')`. `_rebuildPoiMarkers` passes it to `spawnModel`.
- Gate `test/model-variant.mjs` runs the real `buildPalette` + `instantiate` path on a
  `GLTFLoader.parse` of the shipped `.glb`.

Owner verified in-game 2026-10-04: mom's house is cyan, Larry's is yellow.

---
id: ASSET-90
type: asset
status: closed
severity: minor
opened: 2026-11-17
closed: 2026-11-17
source: owner, 2026-11-17 (inbox 20261117103006-j5xw) — "Let's also remake a campfire model that doesn't have the three logs, just ashes at the bottom."
relates: FEAT-264, DEC-393, ASSET-24, assets/models/campfire.glb, src/campfire.js
---
lane: C

# ASSET-90: The dead campfire — ashes only, no logs

## Next steps
Closed: the `.glb` shipped (DEC-083). The owner's look is on the owed card `asset90-dead-campfire-look`; a "changes" answer is a new round on the generator.

## Summary
**Camp gear** — the burnt-out state of the ASSET-24 fire pit (`campfire.glb`), shown after a long sleep at a camp (FEAT-264).
The same stone ring as `campfire.glb`, with the three logs and the coal bed gone: a grey ash heap inside the stones, a few
paler fragments and two charred stubs no taller than the ring. Cold: nothing in it glows.

**Resolution (2026-11-17):** shipped `assets/models/campfire-dead.glb`, 434 tris (live 472), swapped in by `setDead`.

## Description
| Field | Value |
|---|---|
| Tri budget | at most the live model's own count (472); built at 434 |
| Materials | `FireAsh`, `FireStone` (the live model's, by name), `FireCinder` (paler fragments), `FireChar` (stubs, crumbs). No `FireLog`, no `FireCoal` |
| Real size | 0.708 × 0.158 × 0.675 m: the live footprint; the ring's tallest stone is the top, the heap peaks at 0.058 m |
| Origin | base-seated at y = 0, centred on the ring, `FireFlameAnchor` kept at (0, 0.085, 0) |
| Collision | none, as ASSET-24 |

Built by `build_dead()` in `assets/models/src/campfire.py`, which shares `make_ring_parts()` with `build()`, so the ring
is the live one stone for stone. Running the file headless (`blender -b --python-exit-code 1 --python assets/models/src/campfire.py`)
exports both; the live `campfire.glb` comes out byte-identical. `src/campfire.js` loads `campfireDead` beside `campfire`
and `setDead` swaps which one is visible.

## Tracker
- [x] `.glb` at `assets/models/campfire-dead.glb`, flat-shaded, within the tri budget (434 of 472).
- [x] Same footprint and origin as `campfire.glb`; `camp-gear.mjs` checks it on the pad.
- [x] `src/campfire.js` swaps it in on `setDead(true)` (model registry entry `campfireDead`; hides the live model).
- [x] Review render beside the live model: `wip/asset-90/sheet.jpg` (live / old dead / new dead, day and dusk, wide and close).
- [ ] The owner's look (owed card `asset90-dead-campfire-look`).

## Links
DEC-393 (the fire dies after a sleep over two hours) · DEC-083 (closes when the .glb ships).

## Files
`assets/models/src/campfire.py` · `assets/models/campfire-dead.glb` · `data/prop-models.js` · `src/campfire.js` ·
`test/camp-gear.mjs` · `test/cdp-smoke.mjs` (step `deadFire`)

## Log
- 2026-11-17, lane p: shipped on `land/asset-90-dead-campfire`. Smoke `boot,story,deadFire` PASS (a real 8 h camp sleep
  shows the dead model, a new camp relights). In full sun the paler cinders barely separate from the ash: left for the look.
- 2026-11-17 (lane p, round 2): owner "good so far but add subtle smoke particle effects to the extinguished fire" — the dead fire now smokes (smoke.js `FIRE_SMOKE`, anchored at FireFlameAnchor), and cooking at it relights it (DEC-397). Sheet wip/asset-90/sheet-r2.jpg.

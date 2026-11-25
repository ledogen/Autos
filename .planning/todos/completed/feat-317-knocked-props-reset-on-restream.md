---
id: FEAT-317
type: feature
status: closed
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "Right now when you knock down lawn furniture, it stays down for the remainder of the run. It would cost less memory and be more fun for the player if it reset every time that area of the world restreamed."
relates: FEAT-149, FEAT-251, FEAT-268, FEAT-275, FEAT-65, DEC-473, DEC-394, DEC-429, src/main.js
---
lane: unplaced

# FEAT-317: A knocked prop stands again when its area restreams

## Next steps
Orchestrator: land `land/props-1120`. Owner: a drive past a yard, knock something, drive away until the yard drops out, come back.

## Summary
Knocked lawn furniture, farm drums and crates and mailboxes (the `_ornaments` of main.js) stayed knocked for the whole
run. Now a knocked one lies where it fell only while the terrain chunk under it is built; when that chunk streams out,
the model stands again at its solved pose. Demolition targets are untouched.

## Description
### Where the knocked state lived
Not in a list and not in the save. `_updateOrnaments` (main.js) swaps a model for a sleeping debris body inside 60 m and
back past 120 m; on the way back it copied the body's resting pose onto the model, so the yard's own `Object3D`
transform WAS the knocked state, kept until `_rebuildPoiMarkers` (the next run or a reload).
Memory: `_ornaments` holds one entry per knockable satellite of the region, 45 and 47 on seeds 3200351065 and
2711103901 (wip/feat-317/count.mjs). The entries and the models exist whether anything is knocked or not, and the
knocked pose overwrote 7 numbers already there. So the old behaviour cost about 0 bytes extra, and it did not grow with
drive length. This change does not save memory; the gain is the play.

### Now
When an ornament has no body and `terrainSystem.hasChunkAt` is false under it (the same test that hides its yard,
BUG-164), its model is put back to `sat.x/y/z` and `sat.yaw`. No flag, no list.

### Demolition
Demolition targets are not ornaments: `_site.targets[i].smashed` is the job's latch (FEAT-65), saved with the run
(`s.smashed`), and a smashed target is never shown again while the job lives. Nothing here touches it. Barricade rows
already stand again past 200 m (FEAT-154).

## Tracker
- [x] A knocked ornament stands again once its chunk is dropped (main.js `_updateOrnaments`)
- [x] Comments updated (main.js, poi.js `_shoulderMailbox`); DEC-473 written
- [x] Demolition targets unchanged
- [ ] Owner drive

## Decisions
- 2026-11-20, owner: DEC-473 (the ruling above, verbatim).

## Files
`src/main.js` · `src/poi.js` · `.planning/decisions/dec-473-knocked-props-stand-again-when-their-area-restreams.md`

## Log
- 2026-11-20: built on land/props-1120 @ 0003abf9. Affected gates 42/42 green (serial, 2598 s); cdp-smoke 42 steps PASS
  (first run hit a CDP timeout in "demolition" at load 8-9, retry green); pad-e2e ALL OK. No headless gate reaches
  main.js's poll and no smoke step knocks an ornament: the stand-again itself is unverified until the owner's drive.
- 2026-11-24: CLOSED. Owner drove it, card feat317-props-reset-drive: "Works".

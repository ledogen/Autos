---
id: PERF-34
type: perf
status: done
severity: major
opened: 2026-09-29
closed: 2026-09-29
source: owner — "driving really quickly on the m4 macbook air (unloaded) im getting stuttering at terrain loads … the m4 needs to have no issue whatsoever keeping up at 200mph"
relates: PERF-26 (hitch attribution), PERF-33 (streaming scheduler), FEAT-84/85 (the litter passes), FEAT-25 (bed-rock boost passes)
---

# PERF-34: stutter at terrain loads when driving fast — the hard scatter

## Reproduction (the part that took the longest)

Headless on the same M4: the freecam `stream` sweep at 89 m/s (200 mph) does NOT hitch — not on
main, not on the branch, not at retina pixel counts (2560×1600 @2×), not with textures on or
off, not at CPU ×2. The TRUCK does: `test/hitch-report.mjs --scenario=stream --truck --speed=89`
(new flag — the truck is teleported along the sweep, so the chase camera and PropSystem's
synchronous `ensureChunk` 3×3 are the ones exercised). Branch, CPU ×1: **47 hitches / 40 s,
100–180 ms each, every one `frame.props.update` with `props.hardScatter ×2–3`**; main: 3 hitches.
The full scatter of one chunk was 55–60 ms in play against 5.6 ms in `bench-scatter` (its fixture
has a small network and no water) — so the 3 ms/frame drip built ~3 chunks/s against the ~7/s
the truck needs, and the hard path fired on nearly every row.

## Where the 55 ms went (timed buckets, now permanent: `sampler.*`, `props.hard.*`, `props.commit.*`)

| bucket (per 3 chunks) | ms | why |
|---|---|---|
| `sampler.streamAt` | 43–54 | `streamChannelAt` walks a whole centreline per call; the FEAT-25 bed-rock boost passes ask hundreds of times per chunk, on ground with no stream in sight |
| `sampler.waterAt` | 12–16 | `pondSkirtAt` lattice lookups, same pattern |
| `sampler.heightAt` | 2–6 | the litter's ground grid: 289 nodes × 5 carved-height queries (`analyticNormal` + height) |
| commit (instances, colliders, bake mark) | ~1 | not the problem |

## The fix (three cuts, all pinned byte-identical by the props gate)

1. `ensureChunk` scatters the BASE passes only (trees, collidable rocks, boulders, bushes, logs —
   what the 3×3 exists for) and queues the litter (cover + zone rocks) exactly like a bbonly→near
   promotion. The cover and pebbles land a few frames after the ground.
2. `WaterSystem.waterNearBBox` once per chunk; where no pond/stream is within reach both
   generators swap the samplers for constant "no" and the boost passes skip (their own seeded
   streams, so placements are identical).
3. The litter ground grid samples the carved height once per node (+1 apron) and takes slope from
   central differences over its own grid (`terrainSystem.groundClassify`): 361 queries, not 1,445.
4. Litter-only jobs yield `LITTER_DEFER` (1.5 chunks) in the PERF-33 queue so the truck's own
   chunk's litter cannot starve the base scatter of the chunks ahead (the first cut alone still
   left `hardScatter ×3` on every crossing for exactly this reason).

## Result

| run (40 s, 89 m/s, truck) | hitches > 24 ms | max | p99 |
|---|---|---|---|
| branch before | 47 | 180 ms | 51 ms |
| branch after | **4** | 30 ms | 18.4 ms |
| branch after, CPU ×2 | 12 | 40 ms | 18.5 ms |
| main | 3 | 105 ms | 18.4 ms |

None of the remaining hitches was in the scatter. The residual `road.streamNetwork` 20–30 ms
frames (one per band, every ~5 s at 200 mph) were pinned by two more buckets to
`road.dispatch.pondDiscs`: gathering the pond discs for the worker's 760 m request window forced
the water system's LAZY cell detection (lattice scan + rim casts + stream traces) synchronously
inside `road.update`. Fix: `RoadNetworkClient` takes an optional `warmRegion` and primes those
caches through `WaterSystem.warmRegion` in ≤2 ms slices between frames, posting the build only
once the region reports warm (stale-until-replaced, so the delay is free).

| run (40 s, 89 m/s, truck) | hitches > 24 ms | max | p99 |
|---|---|---|---|
| + dispatch pre-warm, CPU ×1 (two runs) | **0, 0** | 22 ms | 18.2 ms |

## Gotchas learned

- The hitch harness must carry the truck; a freecam never takes the hard path.
- `bench-scatter` numbers are not play numbers — its fixture has no water and a small network.
- Poking a terrain uniform in an A/B is overwritten by `_syncSurfacePalette` on the next chunk
  build; set `_params` and call it.
- `sunShear` is the one sampler NOT timed (called at commit, not scatter).

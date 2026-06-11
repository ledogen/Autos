---
id: PERF-01
type: perf
severity: major
status: open
opened: 2026-06-10
phase_origin: 08-road-routing
---

# PERF-01: Load/spawn time regressed after the valley-trunk replan (reload + R-reset)

## Symptom

Flagged during Phase 08 UAT (2026-06-10). Load time is noticeably longer than before the
Phase-8 valley-trunk replan, on a real browser via GitHub Pages:
- **Reload** (full page load) — particularly slow.
- **R-reset** (respawn) — slower than before.

User hypothesis (plausible): the road system is building **all / more splines than needed**,
possibly streaming **beyond the terrain draw distance**, whereas the old per-tile router only
materialized roads for nearby tiles on demand.

This is a deferred diagnostic — flagged for a dedicated load-time pass later, NOT a Phase-08 blocker
(all UAT items passed). Performance constraint of record is 60fps runtime (CLAUDE.md); load/spawn
latency is not a phase exit gate but is a real UX regression worth fixing before Phase 9 builds the
ribbon mesh on top of this stream.

## Suspected causes (to confirm with a diagnostic, not yet proven)

### Suspect A — `ensureTile` re-streams the whole network per call (primary suspect)

`08-06-SUMMARY.md` notes: *"`ensureTile` re-streams per call and clears `this._tiles`."* If true,
every `ensureTile(tileX,tileZ)` rebuilds the full streaming network (`_streamNetwork` +
`_sliceNetwork`) rather than reusing an already-streamed network for the same center. Repeated
`ensureTile` calls over a region then do O(tiles) redundant full-network streams.

### Suspect B — CR-01 fix amplified spawn-time streaming (regression I introduced)

`resolveSpawn` (`src/main.js`) now warms `Math.ceil(200 / CHUNK_SIZE) = 4` tiles each way — a **9×9
= 81-tile** region (was 3×3 = 9). If each warmed tile triggers an `ensureTile` that re-streams the
network (Suspect A), R-reset went from ~9 to ~81 full-network streams. **CR-01 was a correctness fix
(spawn now finds the sparse trunk within 200 m), but its warm loop should warm the network ONCE over
the radius, then slice — not call a re-streaming `ensureTile` per tile.** This is the most likely
reason R-reset specifically got slower after the fix landed.

### Suspect C — stream radius exceeds terrain draw distance

`_streamNetwork(center)` streams a fixed radius (08-06 cited ~640 m). If that radius is larger than
the terrain draw distance, the road system builds + slices splines for ground the player can't see.
Confirm the stream radius vs the terrain draw distance and clamp the former to the latter.

### Suspect D — initial reload builds the network before first paint

On reload, the first `update(streamCenter)` + `resolveSpawn` run synchronously before the first
frame, so all of the above costs are paid up front (worse than R-reset, matching the report).

## Diagnostic plan (when picked up)

1. Instrument `_streamNetwork`, `_sliceNetwork`, `ensureTile`, `queryNearest` with `performance.now()`
   call counts + cumulative ms; log totals on reload and on one R-reset.
2. Confirm/deny Suspect A: does `ensureTile` rebuild the network when called repeatedly for the same
   center? Count `_streamNetwork` invocations per spawn.
3. Compare the stream radius constant against the terrain draw-distance constant (Suspect C).
4. Capture a Performance-tab profile of reload and R-reset; identify the dominant self-time function.

## Candidate fixes (pending diagnosis — do not apply blind)

- **Memoize the stream by center**: skip `_streamNetwork`/`_sliceNetwork` when `this._networkCenter`
  already covers the requested tile within radius, so repeated `ensureTile` calls reuse the network.
- **Warm once in `resolveSpawn`**: stream the network a single time over the spawn radius, then slice
  + `queryNearest` over `this._tiles`, instead of looping `ensureTile` per tile (fixes the CR-01
  amplification while keeping the CR-01 correctness win).
- **Clamp stream radius to terrain draw distance** (Suspect C).
- Consider deferring/idle-time streaming of far splines so first paint isn't blocked (Suspect D).

## Files

- `src/road.js` — `_streamNetwork`, `_sliceNetwork`, `ensureTile`, `queryNearest`, `this._networkCenter`
- `src/main.js` — `resolveSpawn` (warm loop, `Math.ceil(200 / CHUNK_SIZE)`), render-loop `roadSystem.update(streamCenter)`

## Notes

- Cross-references `08-REVIEW.md` WR-06 (per-call allocation in the 60fps `queryNearest` path) — same
  hot-path family, but PERF-01 is about *load/spawn* streaming volume, not per-frame allocation.
- Whatever radius/streaming decision comes out of this should be settled BEFORE Phase 9, since the
  ribbon mesh will be generated from the same stream and inherit its cost.

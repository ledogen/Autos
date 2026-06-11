---
id: PERF-01
type: perf
severity: major
status: resolved
opened: 2026-06-10
resolved: 2026-06-11
resolved_by: "quick task 260610-pl6 — commit f377235 (resolveSpawn single warm call)"
phase_origin: 08-road-routing
---

> **RESOLVED 2026-06-11 (user-confirmed)** — `resolveSpawn` warm loop replaced with a single
> `roadSystem.ensureTile(baseTX, baseTZ)` (quick task `260610-pl6`, commit `f377235`).
> Spawn/reload streaming dropped from ~40 redundant 640 m network rebuilds to 1.
> User confirmed in-browser (GitHub Pages) that load time "feels good" after the fix and the
> truck still spawns on the road. The secondary reload cost (render-loop first stream) was NOT
> pursued — load time is acceptable; reopen a new todo only if it regresses.


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

## CONFIRMED ROOT CAUSE (read-only code diagnostic, 2026-06-10)

`resolveSpawn` (`src/main.js`) warms the spawn region by calling `roadSystem.ensureTile` **per tile**
across a `warmBlk = Math.ceil(200 / CHUNK_SIZE) = 4` → **9×9 = 81-tile** grid. Each `ensureTile(tx,tz)`
re-centers `_streamNetwork` on *that tile's* center (`(tx+0.5)*64, (tz+0.5)*64`), tiles 64 m apart.
`_streamNetwork` is move-gated at `PROTO_REGEN_MOVE = 96` m, but consecutive tile-center drift exceeds
96 m, so **~40 of the 81 calls trigger a full network rebuild + re-slice** over `this._proto.radius =
640 m`. This runs on every reload (synchronously before first paint → worst case) and every R-reset.

A single `_streamNetwork(spawnCenter)` already covers a 640 m radius — so all 81 tile centers (max ±256 m
from spawn) fall inside ONE stream. The per-tile warm loop is entirely redundant; ~40 of the rebuilds
are wasted work.

**CR-01 amplified this** (regression introduced this session): the warm loop was 3×3 (±64 m, ~1–2
rebuilds) before CR-01 widened it to 9×9 (±256 m, ~40 rebuilds) — a ~20–40× spawn-streaming increase.
CR-01's *intent* (don't miss an in-radius road 2–3 tiles away) is correct; its *mechanism* (warm per
tile via a re-streaming `ensureTile`) is the bug.

### Fix (high confidence)
Replace the 81-call warm loop in `resolveSpawn` with a SINGLE `roadSystem.ensureTile(baseTX, baseTZ)`
(one 640 m stream covers the 200 m query radius), then `queryNearest(baseX, baseZ, 200)` as today.
`queryNearest`'s own 9×9 read over `this._tiles` (CR-01) is cheap (no streaming) and stays — so CR-01's
correctness win is preserved while spawn streaming drops from ~40 rebuilds to 1. Verify in-browser that
the truck still spawns on the road (UAT test 3) and that reload/R-reset time drops.

### Secondary (verify after primary fix)
- Reload-only cost beyond spawn: the render-loop `roadSystem.update(streamCenter)` first stream +
  initial terrain build also runs before first paint (Suspect D below) — re-measure once the warm-loop
  fix lands; may already be acceptable.

## Suspected causes (original hypotheses — Suspect A/B now CONFIRMED above)

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

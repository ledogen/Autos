# HANDOFF 2026-10-03 — playtest follow-up after the repo review

Everything below is on `main` (`fce6a38`). Worktree `../CarGame-review-followup` (branch
`feature/review-followup`) is fully merged — remove with `wt.sh clean review-followup`.
Read `HANDOFF-2026-10-03-repo-review.md` first for the review itself.

## Landed

1. **Hard landings launched the truck** (owner capture `autos-capture-1791092005752.json`).
   Reconstructed against the real terrain: the strut ran 14 cm past its travel, the undercarriage
   slab corner went 1 cm into the hill at 150 km/h, and the engine threw it out (vy −2.5 → +1.8,
   roll −1 → −6 rad/s in one step). Three model errors in `suspension.js`:
   - the bump/droop stops acted on the hub only — their reaction on the body was never applied;
   - the stop was a linear 330 kN/m penalty; now progressive (`bumpStopProgressiveM`), damped on
     compression (`bumpStopDamping`), integrated implicitly;
   - the terrain tire damper used `−strutCompVel` as the closing speed (right only for a body at
     rest); it now uses the hub's true closing speed on the contact normal, implicitly, with a
     rim-strike damping ramp past half the soft band.
   Headless drop ladder: extreme landing overshoot 0.23 → 0.08 m, slab clear; rebound 1.9 (slab in
   the ground) → 3.9 m/s. Medium/mild landings unchanged within 5 %. 17 physics gates pass.
   **Owner should feel-test**: big jumps now bounce higher than before but stay flat and do not
   launch. Two new sliders under Suspension. Headless drop script is session-local; rebuild from
   `test/lib/engine-ctx.mjs` + `stepPhysics` if needed (flat ground, truck at `rest + h`, `vy`, `vz`).
2. **Road tile blinking** out/in ahead of the truck: stale and dirty tiles were disposed then
   re-queued. `ensureRoadTile(x, z, true)` rebuilds in place; old meshes come down after the new
   ones are up (`road-mesh.js`).
3. **Teleport fell onto raw terrain, road popped in under the truck**: `_reseatTruckAtSpawnInner`
   now awaits `netClient.buildNow` at the destination before seating (the cold spawn always did).
   Arrival 0.7 s after the key; ground under the truck constant from the first frame.

4. **R after Shift+R did nothing**: `RoadNetworkClient.buildNow` attached its waiter after
   `request()` had already completed the entry (window already held). Fixed; verified in-browser.
5. **Captures carry `session`** (both P and `\`): game mode, truck state, damage, story, streaming
   state, sky, recent hitches — see `_captureSession()` in main.js. The owner's capture seed is in
   `world.seed`; `session.gameMode` answers the free-roam-vs-story question for the hitch below.
6. Owner: "collisions are good now" (debris reaction law, review-10).

## Closed unreproduced — the fixed-spot ~250 ms hitch after spawn (owner, 2026-10-04)

The owner could not reproduce it after the tile-rebuild and teleport fixes; assume good. If it
returns, press P at the spot — the capture's `session` block now records mode, streaming state
and recent hitches. Diagnosis notes kept below.

Diagnosis so far (seed 3219501713, free roam, `?hitch=1`): one 91 ms frame at ~6.8 s into the
drive with only 3 ms of frame CPU — work BETWEEN frames. Candidates, in order:
- The play client's `onAdopted` (main.js ~4722) runs in the worker's message handler, unbudgeted:
  `owePropSweep()` is cheap, but when `lastAdoptDirty()` is non-null it calls
  `terrainSystem.recarveInPlace(dirty, {burst:false})` + `roadMeshSystem.invalidateRegions(dirty)`.
  Headless the first full-band adopt had 0 dirty regions and cost 12 ms, so in free roam this is
  not it — but in STORY the region is 2800 m and the owner's hitch may be there.
- The coverage widening (228 → 320 m) re-stamps tiles AND terrain chunks (`builtRoadCovered`): the
  chunk recarve pass runs in the frame budget, but check `terrain.recarve` tags in the hitch report.
- GC after the adopt (Vector3 per network point + typed-array copies).
Repro: `node <hitchdrive.mjs>` (session-local; boot with `?prof=1&hitch=1&nomenu=1&seed=…`, hold W
20 s, read `window.__hitches()`); ask the owner for the seed and whether it was story mode.
Cheapest likely fix: build the FULL play band in `resolveSpawn`'s recenter (currently
`_recenterR = min(radius, 228)`), so no second adopt lands a few seconds into the drive.

## Other owner feedback recorded

- Props through the road right after a respawn, gone a moment later: the BUG-71 sweep working as
  designed; the teleport ordering fix above should remove the cause for teleports. Watch for it on
  R-respawn.
- Vehicle preset dropdown is a stub ("(WIP)"); chassis geometry still fixed per model.
- BUG-79 (alignment damage not wired) and QUAL-34 (review leftovers) are the open tickets.

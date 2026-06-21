# RangerSim capture schema (game ↔ harness bridge)

A **capture** is the single artifact that turns an in-sim "this is broken HERE / THIS happened"
observation into a deterministic, replayable bug report. You mark it in-game, send the JSON, and
`node test/replay.mjs <capture.json>` reproduces it headlessly and reports.

Defined + built/validated in `src/capture.js` (pure module — the game and the harness both use it).
Schema version: **1** (`rangersimCapture: 1`).

## Why it reproduces

The road network is a **pure function of `(seed, params, world-coords)`** — `new RoadSystem(seed, params)`
rebuilds the *real* game road headlessly (it derives the same seeded coarse-height itself; no terrain
worker needed). So `world.seed` + `world.params` is the whole reproduction key for the road/surface
class. `observed` records what the live game resolved, so replay can **diff** and prove reproduction.

## Envelope (discriminated by `kind`)

```jsonc
{
  "rangersimCapture": 1,
  "kind": "place" | "event",
  "complaint": "free text — what's wrong (human/LLM signal)",
  "world": {                       // reproduction context (shared by both kinds)
    "seed": 6,                     // uint32 worldSeed — drives RoadSystem repro
    "seedString": "lone-pine",     // human seed (reference only)
    "params": { /* finite-number fields of RANGER_PARAMS (road + terrain scalars) */ }
  },

  // ── kind === "place" — a SPATIAL bug (kink, fold, grade bump, tear) ──────────────
  "place": {
    "mark":   { "x": -55.7, "z": 170.1 },               // where you marked (truck pos = window center)
    "region": { "x0": -155.7, "x1": 44.3, "z0": 70.1, "z1": 270.1 },  // ±PLACE_REGION_HALF (100 m) box to probe
    "streamCenterHistory": [ { "t", "x", "z" }, ... ],  // recent centers (tear/event repro; NOT needed
                                                        //   for place repro — road is window-invariant)
    "observed": {                  // what the LIVE game resolved at the mark (the diff target)
      "hit": 1,
      "runKey": "0:-5",            // canonical run key
      "arcS": 1586.68,             // run-global arc position
      "gradeY": 108.46,            // physics surface height (what the truck drives on)
      "camber": 0.1047,            // banking (rad)
      "minRadius": 7.55,           // local centerline turn radius (m) — small ⇒ kink/fold
      "groundY": 108.4,            // optional: terrain.analyticHeight at mark   (verified Phase 5)
      "wheelGroundY": [ ... ]      // optional: analyticHeight under each wheel   (verified Phase 5)
    }
  },

  // ── kind === "event" — a TEMPORAL bug (launch, drift, glitch) ────────────────────
  "event": {
    "t0": 234.4, "t1": 238.6,
    "initialState": { "position", "velocity", "quaternion", "angularVelocity" },
    "streamCenterHistory": [ { "t", "x", "z" }, ... ],
    "inputTimeline":       [ { "t", "steer", "thr", "brk" }, ... ],
    "fields": [ /* telemetry column names */ ],
    "frames": [ /* telemetry rows — the OBSERVED trajectory to diff against */ ]
  }
}
```

## How to capture (in-game)

- **`p` → place capture.** Drive to the bad spot, press `p`. Downloads `rangersim-capture-<ts>.json`
  with `kind:"place"` (incl. `observed` from `debugSampleAt` + the live terrain sample).
- **`\` → event capture.** Press `\` to start recording, drive through the bug, press `\` to stop.
  Downloads `rangersim-capture-<ts>.json` with `kind:"event"` (world + initial state + input timeline +
  the columnar telemetry in `event.frames`). (Falls back to a raw `rangersim-log` if no capture
  context is registered.)

## How to replay (headless)

```
node test/replay.mjs <capture.json>
```

- **place** (Phase 4, live):
  1. **Reproduction diff** — rebuild the road mark-centered, recompute `observed`, compare → match = reproduced.
  2. **Surface window-invariance** — build from two stream centers; assert geometry + `gradeY` identical
     (the real tear). `arcS`/`runKey` reparameterization across bands is reported as INFO, not a failure
     (it is internal + atomic in the live game; the drivable surface is what must be invariant).
  3. **Fold metric** — local centerline turn radius at the mark; flags sharp kinks (< 0.6 × design min).
- **event** (Phase 5): replays `inputTimeline` through a headless physics loop from `initialState` and
  diffs the trajectory vs `event.frames` → first-divergence frame = the bug.

## Round-trip gate

`test/replay-selftest.mjs` (in `npm test`) builds a road headless, makes a place capture, replays it,
and asserts the reproduction diff is exactly zero — keeps `src/capture.js` + `replay.mjs` honest in CI.

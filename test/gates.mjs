// test/gates.mjs — canonical gate registry + per-gate metadata for run-all.mjs.
//
// Single source of truth for the pass/fail gate list (test/ also holds libs and rainy-day
// scripts that are NOT gates — see run-all.mjs header). `npm test` runs AFFECTED gates only:
// run-all.mjs computes each gate's transitive import closure live from disk and intersects it
// with your working-tree changes, so a physics edit runs the physics gates, a prop-slider tweak
// runs the prop gates, and a skybox edit runs nothing. `npm run test:all` runs everything.
//
// The fields here are the human- + agent-readable layer:
//   subsystem  coarse label for the selection report + for hand-picking `--only` sets.
//   cost       'fast' = no network worldgen (physics / props / isolated primitive math);
//              'heavy' = full road/terrain/water generation. Advisory only (rough, not measured);
//              it warns when an affected set will be slow. Selection does NOT use cost.
//   extraDeps  repo-relative paths a gate depends on but does NOT `import` (text mirrors, JSON
//              assets) — the import-closure can't see these, so list them or the gate won't be
//              selected when that file changes. Treated as exact-file triggers (their own imports
//              are NOT followed — the coupling is to the file's literal content).
//
// Adding a gate: add an entry here AND write test/<file>. Keep this list in run order.

export const GATES = [
  { file: 'arc-router.mjs', subsystem: 'road', cost: 'fast', extraDeps: [],
    desc: 'arc-primitive router valid-by-construction: reaches goal, detours peaks, min-radius, determinism (search-time now report-only)' },
  { file: 'road-dequantize.mjs', subsystem: 'road', cost: 'fast', extraDeps: [],
    desc: 'BUG-16+FEAT-20 de-quantize refit: shortcut straightens the bow, κ-filter clothoids, switchbacks preserved, endpoint-exact (timing report-only)' },
  { file: 'road-minradius.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'BUG-12: DENSE realized centerline min-radius the ribbon sweeps (incl. capture fixtures) — the fold metric' },
  { file: 'centerline-curvature.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'EXACT per-primitive min-radius + two-center invariance (construction-level, complements road-minradius realized geometry)' },
  { file: 'defect-b-grade.mjs', subsystem: 'road', cost: 'fast', extraDeps: [],
    desc: 'smoothGradeInPlace window-invariance + grade-flip collapse + ramp-preserved (defect B)' },
  { file: 'invariance.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'two-center network invariance: arcS + gradeY stable across streaming windows' },
  { file: 'road-band-coverage.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'Mechanism B: R-scaled band covers the disc — runs do not drop out on fly-over (hit+gradeY invariant)' },
  { file: 'restream-invariance.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'same-instance re-stream (cache reuse) invariance — within-cell skip preserves cache; drive-in == fresh' },
  { file: 'ribbon-carve.mjs', subsystem: 'terrain', cost: 'heavy', extraDeps: [],
    desc: 'synthetic ribbon↔carve agreement (dump-free; replaced seam-grade.mjs)' },
  { file: 'road-smoothness.mjs', subsystem: 'terrain', cost: 'heavy', extraDeps: [],
    desc: 'collision surface has no invisible step the visual ribbon lacks (carve continuity)' },
  { file: 'road-tunnel.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'FEAT-40: taut-string summit cut fires on seed 6, bores stay driveable (grade/C0), physics floor vs raw-hill skin diverge only in-bore, spans window-invariant' },
  { file: 'shoulder-lateral-continuity.mjs', subsystem: 'terrain', cost: 'heavy', extraDeps: [],
    desc: 'BUG-15: carve cross-section is C0 across the shoulder edge (no camber-tilt cliff → no airborne/slam in hairpins)' },
  { file: 'road-fill-support.mjs', subsystem: 'terrain', cost: 'heavy', extraDeps: [],
    desc: 'BUG-15 (fill): physics footprint matches the mesh embankment extent — car does not drop through a raised fill shoulder' },
  { file: 'carve-mesh-smoothness.mjs', subsystem: 'terrain', cost: 'heavy', extraDeps: [],
    desc: 'QUAL-07 net: REAL _buildCarveTable whole-surface has no catastrophic spikes/tearing (spike% + worst 2nd-diff bounded vs baseline)' },
  { file: 'road-apex-sliver.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'BUG-21: no off-road sliver at a shared hairpin anchor (radial end-fallback) — no jolt crossing run boundaries' },
  { file: 'replay-selftest.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'capture↔replay round-trip (Phase 4 place path) — guards src/capture.js + replay.mjs tooling' },
  { file: 'prop-shadow-alignment.mjs', subsystem: 'props', cost: 'fast', extraDeps: ['src/main.js', 'src/terrain.js'],
    desc: 'PERF-07: bake-camera UV == terrain-sampler UV per axis (the twice-shipped mirror bug), shear == sun-ray ground hit, prop ring ⊂ atlas' },
  { file: 'route-worker-sync.mjs', subsystem: 'road', cost: 'fast', extraDeps: ['src/road-carve.js', 'src/road-worker.js'],
    desc: 'PERF-03 WS-A: worker routing copy (road-worker.js ROAD_WORKER_SOURCE) byte-identical to road-carve.js canonical' },
  { file: 'route-bundle-parity.mjs', subsystem: 'road', cost: 'heavy', extraDeps: ['data/route-cache-default.json'],
    desc: 'QUAL-14: bundled default-world route cache == live router output (regenerate the asset on any router change)' },
  { file: 'route-merge.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'FEAT-10: no collinear duplicates + connectivity (graph emits each edge once)' },
  { file: 'crossing-classifier.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'FEAT-07/08/11/13: bounded crossing classifier == brute force (feeds FEAT-19 carve widening) + once-per-build identity' },
  { file: 'road-graph.mjs', subsystem: 'road', cost: 'fast', extraDeps: [],
    desc: 'FEAT-13 v2: Delaunay/Urquhart primitives — empty-circumcircle, Urquhart⊇MST (connected), order-invariant' },
  { file: 'graph-topology.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'FEAT-13 v2: blue-noise + Urquhart: reachability (known-accepted 78% red, see BUG-35), window-invariance, direction variety, step-free surface, junction-at-grade' },
  { file: 'graph-cull-radius-invariance.mjs', subsystem: 'road', cost: 'heavy', extraDeps: [],
    desc: 'BUG-25: crossing cull is render-radius- + approach-history-invariant (320 m vs 1500 m edge sets agree; drive-out-and-back reproduces the network)' },
  { file: 'props.mjs', subsystem: 'props', cost: 'fast', extraDeps: [],
    desc: 'FEAT-06: prop geometry sanity + scatter determinism/window-invariance + slot accounting' },
  { file: 'prop-road-clearance.mjs', subsystem: 'props', cost: 'fast', extraDeps: [],
    desc: 'BUG-23: no hard-collidable prop (centre-or-overhang) on the road footprint (inflated keep-out)' },
  { file: 'rock-collision-proxy.mjs', subsystem: 'props', cost: 'fast', extraDeps: [],
    desc: 'BUG-22: ROCK hard-contact sphere proxy fits the visible surface (no overshoot air-gap → no spurious sideways shove)' },
  { file: 'rock-collision-mesh.mjs', subsystem: 'props', cost: 'fast', extraDeps: [],
    desc: 'BUG-22c: BOULDERS collide vs their actual triangle mesh (exact visible surface, no sphere overshoot)' },
  { file: 'penetration-failsafe.mjs', subsystem: 'physics', cost: 'fast', extraDeps: [],
    desc: 'BUG-24: catastrophic-penetration failsafe fires only on true tunnels (depth>2·wheelRadius = wheel fully swallowed), not resolvable deep contact — no teleport on the shoulder step or in the sub-2R band' },
  { file: 'body-contact-energy.mjs', subsystem: 'physics', cost: 'fast', extraDeps: [],
    desc: 'BUG-27: hard body slams honor params.bodyRestitution without amplifying it (sampled-once bias, accumulated-impulse solver, tamed Baumgarte) — no phantom spin/launch, no energy gain, rest stable' },
  { file: 'drivetrain-climb.mjs', subsystem: 'physics', cost: 'fast', extraDeps: [],
    desc: 'FEAT-23: auto-trans + torque-converter climbs 20–30% grades from a stop, no drive/brake oscillation; accel tapers; 4-gear progression, no shift hunting' },
  { file: 'mission-network.mjs', subsystem: 'story', cost: 'heavy', extraDeps: [],
    desc: 'story missions route ONLY over the post-cull registered network (raw Urquhart has ~15% phantom edges), use the registered centerline object, and edgeParData reports the registered runKey either way round' },
  { file: 'par-oracle.mjs', subsystem: 'story', cost: 'fast', extraDeps: ['src/main.js'],
    desc: 'FEAT-29 par oracle: SM-INV-2 (par never reads the car), determinism, independent time-marched check, SIGNED grade (downhill faster), curvature monotonicity, mid-edge arc-range splitting, junction penalty, spawn-heading convention' },
  { file: 'gps-route.mjs', subsystem: 'story', cost: 'fast', extraDeps: ['src/main.js'],
    desc: 'FEAT-39 GPS assist route bake: travel order (reversed edges + partial first/last ranges), turn sign (+ve = right) + the straight deadband, windowed progress monotonic + full-scan re-acquire, 3-D arc from gradeAt' },
  { file: 'lab-timing.mjs', subsystem: 'story', cost: 'fast', extraDeps: [],
    desc: 'FEAT-31 testing-lab gates: skidpad lap time + derived mu vs closed form, no phantom laps from line jitter, staged drag start (hold-still + count, false start voids, unstaged crossings inert), braking measured 100→0 in the strip corridor and voided by throttle' },
  { file: 'water-invariance.mjs', subsystem: 'water', cost: 'heavy', extraDeps: [],
    desc: 'FEAT-22/17/18: basins/saddles/ponds/streams deterministic + window-invariant; ponds rim-contained; streams descend + end at basins; submerged hook' },
  { file: 'pond-route-around.mjs', subsystem: 'water', cost: 'heavy', extraDeps: [],
    desc: 'FEAT-17: roads route AROUND ponds — setWaterNoGo filter + arc rejection: zero centerline points/nodes in any pond+skirt disc' },
  { file: 'stream-carve.mjs', subsystem: 'water', cost: 'heavy', extraDeps: [],
    desc: 'FEAT-18: stream channels cut bed+banks (C0, bounded, descending); every road×stream crossing holds road grade (ribbon-deck) with the channel notch continuous both sides' },
  { file: 'stream-bed-drape.mjs', subsystem: 'water', cost: 'heavy', extraDeps: [],
    desc: 'FEAT-25: cobble bed ribbon drapes the carved channel — dry shoulders above the waterline, center under water, deterministic' },
]

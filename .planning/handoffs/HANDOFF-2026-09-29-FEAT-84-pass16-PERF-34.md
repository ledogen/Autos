# HANDOFF — FEAT-84 pass 16 + BUG-74 cut side + PERF-34 (200 mph) — 2026-09-29

Supersedes `HANDOFF-2026-09-28-FEAT-84-85-revert-and-state.md` for STATE. The 09-27 handoff still
holds the shader rule order; read it after this one.

**Branch `feature/roadside-cover`** (worktree `/Users/ledogen/CodeShit/CarGame-roadside-cover`,
dev `:3754`; main's is `:8000`). **main (`321acf3`) is MERGED IN** at `66a9716` (PERF-33 scheduler,
BUG-72/73/76/78 — needed before measuring stutter; three conflict hunks resolved as unions).
Commits since the 09-28 handoff: `b1e561f` (pass 16 + BUG-74 cut side + rock tumble + PERF-34
first cut), `66a9716` (merge), `504f487` (PERF-34), then the dispatch pre-warm. NOT merged to
main, NOT pushed. Gates: every affected run green; `npm run test:all` not run this session.

## The owner's perf bar (binding)

"the m4 needs to have no issue whatsoever keeping up at 200mph or we aren't hitting the
performance target … if this is not resolvable we will def have to abandon the graphics package."
Measured on an M4 (same class as the Air): **0 hitches / 40 s at 89 m/s, two runs, max frame
22 ms** (`node test/hitch-report.mjs --scenario=stream --truck --speed=89 --port=3754`). Retina
(`--window=2560,1600 --dpr=2`): 2 frames at 24–25 ms, GPU-side. CPU ×2: ~10 frames at 30 ms, all
off-CPU on shadow-bake frames. Before: 47 hitches of 100–180 ms. Ticket: `completed/perf-34-*.md`
has the whole chain (hard scatter → water samplers → litter starvation → dispatch pre-warm).

**The one thing to remember about measuring:** a FREECAM sweep never hitches — only the truck
takes PropSystem's synchronous `ensureChunk` path. `--truck` teleports the truck along the sweep.
The `drive` scenario only reaches ~40 mph. `bench-scatter` is not a play number (no water, tiny
network). Uniforms poked in an A/B are re-synced per chunk — set `_params` and call
`_syncSurfacePalette()`.

## Visual state (pass 16, owner rulings 2026-09-28)

- Dirt 0x7c6346, rock 0x59544f (owner's picks).
- The coverage rules read a TRUE height rank (normal maps' .b, `_rankOf`): the min–max height had
  made the rock front a cliff (0.4 % → 60 % of the tile between share 0.5 and 0.8) and left the
  floor / pebble dials dead. γ 2 → 6 keeps the approved curve. Dirt .b is a per-PEBBLE rank so
  "N % of the pebbles grey" flips whole pebbles. Grey pebbles take the rock albedo flecks.
- **OPEN, owner's decision:** the grey pebbles still read brown because 0x59544f is a WARM grey;
  a neutral 0x555555 of the same lightness reads grey at once (`shots/neutral`). Cool the rock
  picker (one colour, per the "a pebble is a rock" ruling) or give pebbles the small-rock prop grey.
- BUG-74 cut side: rock by excavation depth, fade centred on the crossover (`roadCutRockFade` 2 m,
  slider); the tan strip was the shader's local-colouring pull lacking the carve exemption; the
  road-mesh skirt takes the same fade. Class 1 (fill toe vs natural rock, seed w) still open.
- Rocks tumble (`rockTiltMax` 1.0, slider); boulders stay yaw-only (mesh collider).

## Open, in order

1. Owner: rock colour decision (above); judge the ballast bench + pebbles in play.
2. Merge to main when the owner says so; then close FEAT-84/85 and BUG-74 class 2.
3. `npm run test:all` on the desktop before the merge.
4. Residuals under CPU ×2 (off-CPU 30 ms on bake frames) — not attributable with the harness;
   reduce only if the Air shows it.

# Overnight handoff — 2026-07-07 visual-polish session

**Branch:** `worktree-visual-polish` at `.claude/worktrees/visual-polish` (based on main 9ee962a).
All work committed per feature; `npm test` 30/31 at every commit (the 1 red is the pre-existing
accepted GRAPH-REACHABILITY, QUAL-14/15). Nothing pushed; merge to main after morning verify.

## Shipped (commits, in order)

1. **61bf8c9 feat(24)** — meadow meander streams. Windiness = down-valley drift (16 m gradient,
   64 m valley-scale fallback on flats) + Van der Pol limit-cycle deviation oscillator, phase
   driven by the fine terrain field. Slope-driven per-point channel width (wide/lazy meadows,
   narrow chutes). Spawn rate ~−45 % (`streamKeepFraction` 0.55 + minDrop 22/minLen 160).
   New **Water GUI folder** (9 sliders → Path-B full rebuild). Route bundle REGENERATED
   (new water params change routeCacheSig — parity verified 0 mismatches). stream-carve
   CHANNEL-CUT spec now one-sided (bed may incise deeper than streamDepth through hummocks).
2. **3311b9f fix(BUG-32)** — water draw distance = terrain ring ((ring+1)×64 m), ribbons
   window-clipped as spans, rebuilt only on 64 m window crossings.
3. **be17af9 fix(BUG-33)** — stream water no longer paints roads: span suppression via
   roadBlendAt + composed-ground ceiling backstop (pads). Verified at YOUR capture site
   (testig −679/750): water-over-road verts 8 → 0. Physics was already correct.
4. **f0ed4a8 feat(25)** — riverbed cobbles: procedural bed-texture ribbon (stone-texture.js)
   under the water + `streamChannelAt` scatter sampler (no trees/hard rocks in channels;
   smallRock boost ×3 in beds/banks — measured 3.28× density). Opus-implemented, reviewed.
5. **e6cb248 feat(15)** — fallen logs: general `sphereVsCapsule`, 'logCapsule' collidable with
   world endpoints baked from the placement transform, two-point terrain grounding + pitch via
   the tilt machinery, road/pond/channel/cliff rejects. props.mjs section 6 covers it.
6. **(this wrap-up commit) QUAL-18 + PERF-07** — see below.

## PERF-07 shadow bake — IMPLEMENTED, needs your eyes

Measured (test/perf-prop-shadows.mjs, unlocked-fps A/B/A): **prop shadow casting costs
1.86 ms/frame on the M4** (6.72→4.86 ms). Bake adopted per your pre-approval:
- Props default `castShadow=false`; baked contact-shadow blobs (`src/props/prop-shadow-blobs.js`,
  one instanced ground-decal mesh; elongated blobs under logs) stand in for grounding.
- Live checkbox **'Realtime prop shadows'** in the prop GUI → `setShadowCasting(v)` flips
  casting + blob visibility for A/B comparison.
- Params: `FLORA_PARAMS.shadows { castRealtime:false, blobOpacity:0.32, blobScale:1.15 }`.
- Implemented by an Opus subagent to spec; I stopped it right at the end (wrap-up request) —
  its own accounting checks + props/prop-road-clearance gates + syntax all pass, and the
  final browser A/B run result is in the wrap-up commit message / ticket.
- **QUAL-18 shadow edge fade** (`src/shadow-fade.js`, installed in main.js): shadow intensity
  dissolves over the outer 28 % of the ±220 m shadow box — the hard moving cutoff line is gone.
  Shader-chunk patch; fails soft with a console warning if a three.js upgrade changes the chunk.

## MORNING VERIFY LIST (in-game, seed 6 + seed testig)

1. **Meadow meanders**: fly the flats — windy? Dials: Water folder (Meander strength/wavelength/
   amplitude, keep fraction). Sliders trigger a FULL rebuild (few seconds).
2. **Streams vs roads** at testig −679/750 (your capture): no blue on the lane; water passes
   under crossings.
3. **Riverbed cobbles + channel rocks**: creek beds near spawn.
4. **Fallen logs**: drive over a small one (suspension absorb), into a big one (block/deflect).
   Density dial: `logsPerChunk` in data/flora.js (no GUI slider yet — housekeeping item).
5. **Shadows**: prop GUI checkbox A/B — do blobs read OK vs realtime? Any shimmer/z-fight?
   Edge fade: drive and watch the old hard shadow line (should be a dissolve now).
6. `?seed=` a couple of fresh seeds for general worldgen sanity.

## NOT DONE (queued, in priority order)

- **FEAT-06c impostors** (task ready to spec to an Opus agent; prop-system is now stable to
  build on). The ticket is unchanged.
- **FEAT-11 tunnels** — DESIGN FINDING recorded here: "surface-only suppress-the-cut" cannot
  show a bore opening — the terrain heightfield can't hold a hole/overhang. A real v1 needs:
  keep the cut, then span it with a procedural ROOF-LID mesh (arch between the cut rims,
  terrain-toned) + portal faces + dark interior walls; physics note: a truck dropped onto the
  roof from above would fall through (lid is visual-only) — acceptable v1, document in ticket.
- **Housekeeping**: GUI sliders for logsPerChunk/streamRockBoost/blobOpacity; HUD/log audit of
  tonight's new params.

## Gotchas for the next session

- Water params (`RANGER_PARAMS.water`) are part of `routeCacheSig` — ANY change ⇒ regenerate
  `data/route-cache-default.json.gz` (scratchpad script pattern `gen-default-route-cache.mjs`,
  run from the worktree root so `three` resolves; bake radius 1160; ~30 s).
- The worktree has NO node_modules — node resolves from the MAIN checkout's. Fine, but versions
  must match index.html's importmap (they do).
- `test/screenshot.mjs` now takes `--port=` (serve the worktree with `npx serve . -l 8017`,
  or :8000 serves the MAIN checkout — wrong code!).
- `test/perf-prop-shadows.mjs` is the PERF-07 harness (not a gate) — needs the unlocked-fps
  flags baked into it; vsync-locked runs show zero delta.
- Memory file `project_feat24_meander_streams.md` has the full mechanism + iteration lessons.

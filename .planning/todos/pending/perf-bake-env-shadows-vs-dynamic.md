---
id: PERF-07
type: perf
status: open
opened: 2026-06-30
severity: minor
source: user-idea
note: "Idea, perf-uncertain — MEASURE before committing. Consider pre-baking environment lighting/shadows
(static AO / contact shadows / lightmaps) for props instead of every prop being a real-time shadow
CASTER in the sun's shadow pass. Today every scattered prop has castShadow=true (prop-system.js:74) →
all trees/rocks/bushes re-render into the 2048² directional shadow map every frame. Tradeoff: lose easy
dynamic day/night shadow movement — user is fine sampling/re-baking infrequently for a big perf win at
little visual cost. NOTE: the shadow DITHERING the user also mentioned is a SEPARATE issue with a cheaper
standalone fix — captured as BUG-29 (texel-snap the shadow camera); don't justify the bake on that alone."
---

# PERF-07: Pre-bake environment shadows for props instead of real-time shadow casting

## Idea

Every scattered prop is currently a **real-time shadow caster**: `mesh.castShadow = true` in
`src/props/prop-system.js:74` (and `receiveShadow = true`). So every instanced tree/rock/bush is
re-rendered into the single directional sun's **2048×2048** shadow map (`src/main.js:476–506`) every
frame. With dense scatter that shadow pass can be a real cost on the iGPU floor the project targets.

Proposal: **pre-bake** the environment lighting/shadows for props — static ambient occlusion / baked
contact shadows / lightmaps — so props stop participating in the dynamic shadow pass. Accept losing
free dynamic day/night shadow motion; re-bake (or sample) infrequently instead.

User is explicit they're **not sure it's actually a win** — so this is a MEASURE-FIRST investigation,
not a commitment.

## MEASURED 2026-07-07 (overnight session, worktree visual-polish)

`test/perf-prop-shadows.mjs` (headless CDP, A/B/A castShadow toggle, unlocked frame rate,
M4/Metal, Normal quality, spawn vantage, 400 frames/phase):

    A  cast=on : mean=6.72 ms  p50=7.10  p95=7.50
    B  cast=off: mean=4.86 ms  p50=4.80  p95=7.00
    A' cast=on : mean=6.72 ms  (A/A' spread 0.00 — clean)
    → prop shadow casting costs ≈ 1.86 ms/frame (~28 % of the render) on the FAST machine.

NOTE: a vsync-locked run reads exactly 16.67 ms in every phase — measure with
--disable-frame-rate-limit (baked into the harness) or the delta is invisible.

DECISION: bake adopted (user pre-approved "implement if win"). castShadow=false default +
baked contact-shadow blobs (prop-shadow-blobs.js), live 'Realtime prop shadows' toggle in the
prop GUI for A/B. Remaining before close: user visual verify of blob grounding + a morning
re-measure on the iGPU floor if available.

## USER VERIFY 2026-07-08 — FAILED, defaults reverted to realtime casting

User (on Chrome 148, where rendering works — see BUG-34 for the separate Chrome-150 disaster):
"shadows are currently totally busted there's just a half-artifact present. either implement
baked shadows that look good or revert to the old working cast shadows."

Action taken 2026-07-08: reverted the DEFAULTS to the old working look — castRealtime: true
(props cast realtime again, blobs hidden) and the QUAL-18 shadow-edge fade uninstalled
(bundled in the same commit, unverifiable independently — reopened as its own ticket).
The blob system + GUI toggle stay in the tree as the A/B harness for the next attempt.

The 1.86 ms/frame measurement stands — the bake is still worth having, but the blob look must
be iterated WITH a working visual loop. (The loop is working again same-day: the "Chrome 150
renders black" scare was the screenshot tool's camera sitting under the terrain — BUG-34
closed as a tool defect, screenshot.mjs now places the camera ground-relative.) Next attempt:
iterate blob opacity/scale/shape against screenshots, and only flip the default back when the
user signs off on the look.

## Measure first (don't bake blind — per CLAUDE.md, prove perf claims headlessly/with the profiler)

- The frame loop already has a perf harness (`perfAdd`/`perfDump`, auto-dumps at frame 180 / 600 —
  `src/main.js:1351–1354`). Add a shadow-pass timing read (or use a Chrome GPU trace per
  [[reference_inbrowser_verify_cdp]] / [[project_perf05_driving_stutter]] for the trace gotcha) and
  compare: props `castShadow = true` vs `false`, on Normal/High quality, on a mid GPU.
- Quantify what the shadow pass actually costs with dense props before deciding the bake is worth it.
  PERF-05 found driving stutter was render/GPU-bound — the shadow pass is a plausible contributor, so
  this is worth measuring, but confirm.

## Options if measurement says it's worth it

- **Drop prop shadow CASTING, add cheap fake contact shadows.** Set props `castShadow = false`; give each
  a baked soft contact-shadow blob (a dark radial decal/quad under the trunk/base, or AO baked into the
  ground/terrain vertex colour where props sit). Removes all props from the shadow pass; keeps grounding.
- **Baked AO / lightmap into terrain + impostors.** Bake static AO from the prop field into the terrain
  shading; pairs naturally with FEAT-06c impostors ([[project_feat06_props_scope]] — already in scope for
  baked in-browser impostors). Distant props as impostors with baked lighting cost ~nothing.
- **Keep dynamic shadows only for near/hero props.** Cast from the closest N props (or only big trees
  near the vehicle); bake/fake the rest. Hybrid keeps some dynamism where it's visible.
- **Infrequent re-bake for day/night.** If a coarse day/night is still wanted, re-bake the static
  lighting on a timer / on time-of-day step (QUAL-02 SkySystem `setTimeOfDay`, [[project_qual02_skybox]])
  rather than per-frame — the user's "sample less frequently" suggestion.

## Tradeoffs / constraints

- **D-01 procedural-only / no asset files:** any bake must be generated at runtime (canvas/DataTexture/
  vertex AO), not shipped texture files — same discipline as markings (BUG-28) and FEAT-06c impostors.
- **Lose free dynamic day/night shadows** from props (user accepts). The sun's shadow direction currently
  tracks `SkySystem.sunDirection` (`main.js:1313`); baked prop shadows won't follow it without a re-bake.
- **Window-invariance / streaming:** baked data must be a pure fn of seed/coords so a prop's baked shadow
  is identical regardless of when its chunk streamed in.

## Acceptance

- A measured before/after of the shadow pass cost (numbers recorded here) justifying the change — or a
  decision NOT to, recorded here.
- If adopted: props no longer in the dynamic shadow pass; grounding/AO still reads well; measurable frame
  win on the target GPU; window-invariant; no asset files; `npm test` green.

## Related

- **BUG-29** shadow dithering (`bug-shadow-shimmer-texel-snap.md`) — the OTHER thing the user mentioned;
  separate root cause (non-texel-snapped shadow camera) with a cheaper standalone fix. The bake would
  also remove prop-shadow shimmer by eliminating those casters, but BUG-29 fixes the dither for ALL
  dynamic shadows independently — don't justify PERF-07 on the dither alone.
- **FEAT-06 / 06c** props scatter + baked impostors ([[project_feat06_props_scope]]) — the natural home
  for baked prop lighting.
- **PERF-05** driving stutter is render/GPU-bound ([[project_perf05_driving_stutter]]) — context for why
  the shadow pass is worth measuring; includes the Chrome-trace gotcha.
- **PERF-06** Quality selector already gates `sun.castShadow` per tier (`main.js:868–872`).
- **QUAL-02** SkySystem / time-of-day ([[project_qual02_skybox]]) — the day/night the bake trades against.

## INTERACTION WITH PERF-16 (2026-07-14) — PERF-16 does NOT cover this; it raises PERF-07's value

PERF-16 (shipped, 803c174) made the sun shadow pass on-demand (`renderer.shadowMap.autoUpdate =
false`, re-armed only when the shadow can change). One might assume that subsumes the prop-caster
cost — it does NOT for this game:

- PERF-16's re-arm includes a **vehicle-in-motion trigger** (`main.js:1763`): velocity > 0.05 m/s
  marks the shadow dirty EVERY frame. RangerSim is always in motion by design, so during actual
  driving the shadow pass re-renders every frame — same as the old always-on behavior.
- PERF-16's measured win (renderer −5.2pp / GPU −3.5pp) was the **Idle Normal (parked)** scenario;
  it applies to spawn/cold-load/pause/vista, not steady-state play.
- Therefore the ~1.86 ms/frame prop-caster cost this ticket measured is **still paid every frame you
  drive**. The only way to cut it is fewer casters (this ticket's bake), because you cannot make the
  render less frequent while the truck is moving (Three re-renders the whole shadow camera / all
  casters, not just the truck).

Net: the always-in-motion reality makes PERF-07 the real steady-state shadow lever, not a parked-only
nicety. Still blocked on the same thing as before — the baked contact-shadow blobs must LOOK
acceptable (2026-07-08 user reject) before the `castRealtime` default can flip. See
[[perf-16-shadow-hud-throttle]].

## BAKE-ALIGNMENT REGRESSION FIXED (2026-07-15)

The per-chunk baked atlas (prop-shadow-bake.js, shipped a52c62e) had its shadows falling in the
WRONG direction and detached from the props (user report, seed 6). Root cause: the bake ortho
camera mirrored the **Z (top/bottom) axis** vs the terrain sampler — a true top-down map (world
+X→U, +Z→V) is an IMPROPER view, so exactly one ortho axis must be mirrored; with up=+Z the
downward look-at already gets +X→+U right, but +Z→+V came out flipped. Fix: negate ONLY top/bottom,
`OrthographicCamera(C/2, -C/2, -C/2, C/2)`.

VERIFICATION was iterative and worth recording: a first attempt flipped BOTH ortho axes, which
only MOVED the mirror from Z to X (shadows still misaligned, just on the other axis) — the
low-angle A/B didn't expose it, but a straight-down per-axis shear probe did (+X shear → shadow to
−X). The per-axis probe (bake with uShearXZ=(±k,0)/(0,±k) at pitch≈−1.52, screen-right=+X,
screen-down=+Z) is the decisive test; the real-sun baked-vs-realtime A/B confirms the final look.
Both now agree: baked shadows anchor at the base and match the realtime cast in direction/length.
props gate green. Alignment fix only — the `castRealtime` default-flip decision is unchanged and
still needs the user's sign-off on the baked LOOK.

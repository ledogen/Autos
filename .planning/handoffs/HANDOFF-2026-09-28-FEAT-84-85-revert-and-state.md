# HANDOFF — FEAT-84/85 surface pass: state after the BUG-74 revert — 2026-09-28

Supersedes `HANDOFF-2026-09-27-FEAT-84-85-surface-pass.md` for STATE; that file still holds the
shader rule order (steps 1–8), the rulings table for passes 5–15 and the artifact regen recipe —
read it after this one. This file is what changed since, and what the owner ruled last.

**Branch `feature/roadside-cover`** (worktree `/Users/ledogen/CodeShit/CarGame-roadside-cover`,
Vite dev `:3754`; main's own dev server is `:8000`). ~27 commits ahead of main, NOT merged, NOT
pushed, main merged in at `69f94dc` (main = `d3e72b7`). Gates: `npm test` green except the
standing `road-clearance` red (BUG-69/70, same two pairs as main).

## The last ruling (2026-09-28) — read this before touching the roadwork seam

"didn't work. revert all attempts at smoothing the transition except dithering." Reverted in
code (not by `git revert` — the commits were mixed with unrelated fixes; the hunks were restored
by hand to the dither-commit state): signed carve weight / fill-as-dirt, fill relief ramping with
the feather, cut-ness by depth, the cut-rule deletion + `roadCutRockDepth`. **Kept:** the biome
dither (0.5 / 0.3), BUG-75 border normals, QUAL-32 matte terrain, BUG-73 in-place attributes.

State of the carve zone now: `aSurf.w` = UNSIGNED carve weight; cut = rock 1 + cutout colour +
rock albedo forced; fill = dirt 1 + fill colour; engineered zones exempt from the rock mix, the
dither, the stones and the under-rock green (all `× (1 − vSurf.w)`); `isFill = delta > 0`.
**BUG-74 is OPEN.** Three ideas were tried on the carve weight and all rejected as "still
abrupt". The next attempt must be a different idea. The owner's own words: "just blur it or fade
it", "use the height wiring to bring the rocks below the dirt" — i.e. let the transition happen in
the HEIGHT CONTEST (the rock map's fragments losing to dirt over distance from the road), not in
colour or classification. Also on record: "I'm trying to avoid engineering it into a ton of rules
stacked on rules" and "not sure the complexity was worth it" — prefer deleting a rule to adding a
softer one; three attempts in one evening was too many.

## What DID land since the 09-27 handoff (all kept)

| commit | what |
|---|---|
| `880e7a4` (partly) | **BUG-75 fixed**: `_computeGridNormals(geom, cx, cz)` samples the carved `analyticHeight` one cell outside the chunk for its border rows → no more straight shading step across chunk edges (all three call sites pass cx, cz). **QUAL-32 fixed**: `terrainSpecular` 0 / `terrainShininess` 4, road 0x0a0a0a / 20, Terrain Look → "Sun shine (terrain)" slider. |
| `360faa4` | **BUG-73**: the flat olive TILE the owner caught (a chunk drawn with no relief/rock/stones = `aSurf` not bound for its draw, reads (0,0,0,1)). CPU data audited clean under fast freecam churn (`test/chunk-audit.mjs`) → GPU binding state on a recycled pooled geometry. Fix: the vertex writer writes INTO the existing colour/aSurf attributes (like the normals code) instead of replacing attribute objects. Unproven headless; ticket names the next suspect (three's VAO cache on pool reuse — force a fresh geometry on reuse). |
| `618f706` | dither defaults 0.5 / 0.3 (owner), `test/chunk-audit.mjs`. |
| this commit | the revert + tickets + this handoff. |

## Artifact

https://claude.ai/artifact/Nw9S3vUKvWByigaqY9SBmL — Version 10 shows the (now reverted) cut-by-
depth look on the road scenes (18, 20–22, 25, 26); regenerate once the tree is what the owner
wants to show. Recipe in the 09-27 handoff (`test/ab-shots.mjs`, JPEG q78, publish `after/*.jpg`
to the same URL). Don't sleep the laptop mid-capture.

## Open, in order

1. BUG-74 roadwork seam — open, needs a NEW idea (above). Reproduce spots: seed w (197, 616) fill
   skirt vs rock; seed 1666428418 (−1391, −536) cut→fill crossover; seed 656320315 (650, −254).
2. Merge to main when the owner says so (`wt.sh merge roadside-cover`), then close FEAT-84/85.
3. BUG-73 — watch for another flat tile; run `test/chunk-audit.mjs` and dump the uniforms too.
4. GPU cost on the Air still unmeasured (Terrain Look → "Surface textures (A/B)" + stats panel).
5. Unruled proposals: sage as soft-drag collidable; grass↔dirt dither; High/Ultra coverDensity.

## Gotchas (new this pass)

- A screenshot pasted into the terminal may not render in the message but is still saved under
  the session's `images/` folder — check there before saying it didn't arrive.
- `window.__terrainSystem()` is the terrain handle (`window.terrain` is the lab's).
- The road mesh has its OWN smooth shoulder lip (`roadDirtColor`, fbm bump only) — any roadwork
  transition idea has to account for that strip, which the terrain shader never sees.

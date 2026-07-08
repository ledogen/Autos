---
id: BUG-34
type: bug
status: closed
opened: 2026-07-08
closed: 2026-07-08
severity: critical
source: claude-investigation
resolution: "FALSE ALARM — the renderer was never broken. Every 'white screenshot' came from
test/screenshot.mjs's fixed default camera Y (110 m): the seed-6 spawn region terrain is
150–190 m, so the camera sat INSIDE the mountain — terrain backfaces cull away, leaving only
the camera-centred Sky box (white frame; pure black with the sky hidden). It reproduced on
'both builds, headed and headless, every ANGLE backend' precisely BECAUSE it was
vantage-dependent, not build- or browser-dependent; the Chrome 148-vs-150 framework
observation was a real fact but a red herring, 'confirmed' by a minimal three-scene test that
never used the broken vantage. FIX (same day): screenshot.mjs now derives the camera Y from
the headless raw terrain height under the camera + look target (ground + --height), explicit
[y] positional still overrides; verified — seed-6 spawn renders correctly on Chrome 150,
realtime shadows and all, 61 fps."
note: "Kept as a closed ticket (not deleted) because the investigation narrative is a useful
what-not-to-do: a camera-inside-terrain white frame perfectly mimics a catastrophic renderer
regression. Before blaming the browser/GPU, verify the camera is ABOVE the terrain
(rawHeightWorld at the vantage) — 30 seconds that would have saved the whole rabbit hole."
---

# BUG-34: ~~Chrome 150 renders the world black~~ — CLOSED: camera was underground (tool defect)

## What actually happened (2026-07-08)

Chasing the shadow-regression report, `test/screenshot.mjs` returned all-white frames at the
spawn vantage on both the worktree AND the pre-overnight main checkout. The investigation
escalated through: headless compositing (`Page.captureScreenshot`), a `canvas.toDataURL`-in-rAF
grab (same white), swiftshader/no-ANGLE/headed launches (same), scene-state probes (healthy:
188 draw calls, 2.3 M tris, sane lights/uniforms/programs), an unlit override material (still
black), and the running-Chrome-148 vs on-disk-150 framework discovery — a compelling,
internally-consistent, WRONG theory.

The tell that finally cracked it: prop world matrices at y≈155 next to a camera at y=150.
`rawHeightWorld(-20, 92)` = 152.6 m; the tool's default camera Y was 110 + 40 = 150.

## Fixed

- `test/screenshot.mjs`: ground-relative camera Y by default (headless `rawHeightWorld` sample
  under camera + target, + `--height`); explicit `[y]` still wins. Prints the derived Y.

## Residual truths worth keeping

- The user's running Chrome holds framework 148 while the disk binary is 150 — irrelevant to
  rendering, but a real dynamic to remember when comparing "my browser vs a fresh launch".
- `canvas.toDataURL` inside a rAF callback (Runtime.evaluate awaitPromise) is a valid
  WebGL-canvas grab without preserveDrawingBuffer — kept in the session scratchpad pattern.

---
id: BUG-34
type: bug
status: open
opened: 2026-07-08
severity: critical
source: claude-investigation
note: "Discovered 2026-07-08 while chasing the shadow-regression report: every freshly launched
Chrome instance on this machine is 150.0.7871.46 (auto-updated on disk 2026-07-04) and renders
the game as PURE BLACK terrain/props under a blown-out white sky. The user's own Chrome still
renders fine only because its long-running process has framework 148.0.7778.216 loaded — the
moment they relaunch Chrome, the game goes white for them too."
---

# BUG-34: Chrome 150 renders the world black (sky blown-out white) — game unplayable on current Chrome

## Symptoms (reproduced 2026-07-08)

- Fresh Chrome 150 launch (headless OR headed, fresh profile), either server (main checkout at
  9ee962a on :8000 or worktree-visual-polish on :8017), spawn vantage:
  - Whole frame is near-white with faint diagonal gradient bands.
  - Hiding the Sky mesh (`window.sky.sky.visible = false`) reveals PURE BLACK everywhere —
    terrain/props/truck draw (renderer.info: ~188 calls, ~2.3 M tris) but shade to black.
  - So: all lit-material fragments come out black; the addons Sky shader comes out white
    (looks like tone mapping and/or lighting is broken wholesale).
- NOT environmental: reproduces with `--use-angle=metal`, `--use-angle=swiftshader`, no ANGLE
  flag, headed and headless. WEBGL_debug_renderer_info confirms the real M4 Metal ANGLE device,
  context not lost, shadowMap enabled/PCF.
- No console errors, no shader-compile warnings, 60 fps — it renders confidently and wrong.
- Chrome 148 (user's running instance) renders correctly. 149 untested (binary no longer on disk).

## Impact

- The game is effectively broken on stock up-to-date Chrome — GitHub Pages visitors on
  Chrome ≥150 (and the user, after their next Chrome relaunch) get a white screen.
- The CDP screenshot/verify harness (test/screenshot.mjs, reference_inbrowser_verify_cdp) is
  unusable for visual work until this is fixed — it always launches the on-disk 150 binary.

## Leads / where to start

- Three r184 + Chrome 150: check three.js issue tracker for Chrome 150 / ANGLE regressions first
  — if it's a known upstream bug, the fix may be a three patch bump or a documented workaround.
- The split (unlit Sky shader = white, every lit material = black) smells like the LIGHTS UBO /
  `WebGLRenderer` uniform-buffer path breaking under 150 (lights all zero → black), with the sky's
  HDR output then unmapped (tone mapping chunk no-op → >1 values clip to white). Verify by
  probing a lit material's onBeforeRender light uniforms, or forcing `renderer.toneMapping = 0`
  and a MeshBasicMaterial override scene — basic materials should survive if it's the lights UBO.
- `Page.captureScreenshot` in 150 headless also stopped compositing the WebGL canvas (returns the
  page WITHOUT canvas content) — the scratchpad workaround grabs `canvas.toDataURL` inside a rAF
  callback (see scratchpad `shot-canvas.mjs` from the 2026-07-08 session). Fold that into
  test/screenshot.mjs when fixing this ticket, so the harness works either way.

## Acceptance

- Root cause identified (ours vs upstream Chrome/three) and recorded here.
- Game renders correctly on Chrome 150 (or a pinned workaround ships + upstream bug link).
- test/screenshot.mjs produces a correct non-white screenshot on the current Chrome binary.

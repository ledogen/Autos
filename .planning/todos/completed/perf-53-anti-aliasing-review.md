---
id: PERF-53
type: perf
status: closed
severity: minor
opened: 2026-11-18
source: owner, inbox, 2026-11-18
---
lane: engine & world

# PERF-53: Review how the game does anti-aliasing and whether it can be cheaper or better

## Next steps
Closed 2026-11-20. MSAA stays 4x (DEC-460). 2x measured as no saving on the Mac.

## Summary
Owner: "Dropping a note to look into how we/3js handles anti-aliasing and if it can be optimized better"

Scope (owner, 2026-11-18): "for aa i want to specifically look for performance speed improvements. im happy with the
visual quality". The goal is today's look for less GPU cost, not a better look.

## Description
Owner's note above. A measurement and a proposal first; no change without the owner's pick.

**Today (measured 2026-11-18, headless Chrome, ANGLE Metal on the M4, the owner's canvas 1045 x 613 CSS px at dpr 2).**
`antialias: true` gives the default framebuffer MSAA 4x (`gl.SAMPLES` 4, `MAX_SAMPLES` 4; RGBA8 renderbuffers offer 4 and 2).
Normal's 1200-line cap gives pixel ratio 1.958: drawing buffer 2045 x 1200 = 2.45 Mpx (native 2090 x 1226, 4 % more),
so 9.8 M colour samples a frame. High/Ultra are native; Low is 720 lines (ratio 1.17). No post pass on the main frame;
FEAT-221's exposure meter copies the drawn frame every 2nd frame (its cost with MSAA on vs off is not measured).
Already anti-aliased without MSAA: lane paint and dashes (fwidth smoothstep, road-mesh.js). The impostor trees use
alpha-to-coverage (prop-impostor.js), which needs MSAA: with MSAA off their cut-out edge shows a pale outline. 3D props are
faceted geometry, no alpha-tested foliage. So without MSAA the aliasing is geometric edges (antenna, trunks, silhouettes)
plus that impostor outline.

**Rough cost (parked fixed view, seed 48213, ?ae=0, 2 boots per option, GPU active cycles from test/lib/ioreport.py;
background GPU 3-29 Mcyc/s; repeat spread ~10 %; not a calibration).** Today 4x ~460 Mcyc/s · MSAA 2x (Chrome's
`--webgl-msaa-sample-count=2`, no copy) ~409 (-11 %) · off ~365 (-21 %) · off + FXAA ~400 (-13 %) · off + SMAA ~424 (-8 %).
FXAA/SMAA were measured over a copy of the canvas (a real build renders into a target instead); a shipped MSAA 2x needs an
explicit 2-sample render target plus a copy to the screen, which gives part of its saving back.
Look (sheet `wip/perf-53/sheet.jpg` in this worktree, 2x crops, seeds 48213 + 2650391; 907114 spawned in a tunnel, too dark
with exposure off): MSAA 2x matches today; off stair-steps the antenna and trunks and outlines far trees; FXAA keeps the
outline and a broken antenna; SMAA is close except the outline. Implementation caveat found: three's stock OutputPass tone
maps the sky (`toneMapped: false`) and greys it, so any render-target build must keep tone mapping in the scene pass.
Harness: `wip/perf-53/aa.mjs` (variants installed from outside the page; nothing in src/).

## Tracker
- [x] What is used today, and its cost (rough, parked; the bench read is owed)
- [x] Cheaper options with look crops: MSAA 2x, MSAA off, off + FXAA, off + SMAA (sheet below)
- [x] PERF-40 ceiling bench (today vs MSAA off), orchestrator, quiet machine
- [x] Owner picks

## Decisions
- 2026-11-18, owner: "for aa i want to specifically look for performance speed improvements. im happy with the visual
  quality". Quality-only options (alpha-to-coverage, a higher sample count) are out. The render-resolution cap stays
  declined (PERF-41, owner 2026-11-13: "res cap shouldnt be necessary to get the game super snappy").
- 2026-11-20, owner: "Back to 4x" (DEC-460).

## Open questions

## Links
PERF-40, PERF-41.

## Files
src/main.js (renderer setup)

## Log
- 2026-11-18 minted by the orchestrator from the inbox.
- 2026-11-18 review (land/perf-53-aa-review, docs only): MSAA 4x at 2045 x 1200; rough parked cost above; sheet + card
  `perf53-aa-options`. Bench not run (orchestrator's call: lanes busy). Unverified: driving cost, exposure-meter copy cost.
- 2026-11-20: PERF-40 bench ran (2026-11-19 23:07, 4 of 4 sessions valid, this Mac, one seed, A-B-A-B): MSAA 2x saves nothing. GPU active cycles 4x vs 2x: drive 792 vs 780 Mcyc/s, map 730 vs 743, parked 769 vs 768 (inside noise); GPU watts on the drive 1.90 to 2.48 W; main-thread work unchanged. The full-screen copy 2x needs cancels the saved samples.
- 2026-11-20: owner, card perf53-aa-options: "Back to 4x". DEC-460. Branch land/perf-53-msaa2 does not land. Nothing open: the Windows card at 165 fps was not measured, the owner chose 4x anyway. Closed.


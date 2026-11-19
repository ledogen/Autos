---
id: BUG-229
type: bug
status: closed
severity: minor
opened: 2026-11-18
source: owner, 2026-11-18 (card bug217-shadow-seam-look) — "Now when the near map draws grass at the crest of a hill, the course map terrain doesn't quite line up with it so there's a little seam, a little disconnect. Same place in the tutorial world around the same time you can see this."
relates: BUG-217, PERF-41, src/main.js
---
lane: Engine & world

# BUG-229: Grass shadows from the near map and terrain shadow from the coarse map do not line up at a hill crest

## Next steps
Owner look (card `bug229-crest-seam-look`). On "land it": remove the TEMP `?b229fnb` probe in src/main.js (next to
`sunFar.shadow.normalBias`), re-run affected gates, land land/bug-229-crest-seam.

## Summary
BUG-217 round 2 moved the terrain out of the near shadow map (hills cast in the coarse map only). The owner accepted
it ("Good: land it") and reported this follow-on: at the crest of a hill the near map still draws the grass's shadow
while the coarse map draws the terrain's, and the two do not quite meet: "a little seam, a little disconnect".

## Tracker
- [x] Reproduced at the owner's spot (capture 2, hour 8): the crest at x 4..31, z 366..399.
- [x] Cause named, with the measured offset: the far map's normalBias 0.5 m; its half-dark line sat 1.75 m inside the true shadow.
- [x] Fixed on land/bug-229-crest-seam (normalBias 0): 0.25 m. Sheet `wip/bug-229/sheet.jpg`.
- [ ] Owner has looked.

## Decisions
- **Cause.** Measured against analytic sun rays (the terrain's own height function, ray by ray, `wip/bug-229/ray.mjs`)
  across the crest: the coarse map's half-dark line sat 1.75 m inside the true shadow; the near map's shadows (grass,
  and terrain before round 2) sit at 0.25 m. Toggles: far normalBias 0 → 0.25 m; depth bias −0.0005 → −0.0001 no
  change; far map 4096 / 8192 at the old bias 1.5 m (texel size is not it); grass-only bias no change. normalBias lifts
  each lookup 0.5 m off the ground and past a crest the sun ray skims the slope (~15°), so ~0.5/tan 15° ≈ 1.9 m.
- **Fix.** `sunFar.shadow.normalBias = 0`. The depth bias (1.3 m along the ray) already prevents self-shadowing: no
  acne at 6.2 / 6.9 / 8 / 12.5 / 17.8 h. No GPU cost: same shader, same passes, draw calls and triangles unchanged.
- **Rejected.** Terrain back in the near map: near pass 34 → 54 draw calls, 1.19 → 1.35 M triangles, every moving
  frame, and BUG-217's sliding second edge returns.

## Log
- 2026-11-18 minted by the orchestrator from the owner's card note.
- 2026-11-18 fixed on land/bug-229-crest-seam (e86af7d2, src/main.js): crest edge 1.75 → 0.25 m inside the true shadow.
  TEMP `?b229fnb=0.5` = the old look for the owner's A/B. Tools + sheet: wip/bug-229/ (shots, ray, prof, sheet).
  Merged main (6464c7aa). Affected gates 14/14 green (run-all exit 0); cdp-smoke PASS 40 steps; pad-e2e ALL OK. Logs wip/bug-229/. Card owed/bug229-crest-seam-look.json.

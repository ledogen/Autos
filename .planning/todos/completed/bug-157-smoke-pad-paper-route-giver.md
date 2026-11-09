---
id: BUG-157
type: bug
status: closed
severity: minor
opened: 2026-11-09
source: orchestrator, 2026-11-09 — cdp-smoke pad step after BUG-140's landing
relates: test/cdp-smoke.mjs (pad step), BUG-124 (an earlier pad-pick bug)
lane: Spare
---

# BUG-157: the smoke's pad step parks at a paper-route giver and expects an offer card

## What

cdp-smoke's `pad` step, on random world 3397198020/K, logs `no plain giver with two offers` and falls back to a giver
whose one offer is a paper route. Parking there shows the paper-route prompt ("PARK Space RB to take the paper
route") and no offer card, so the step fails:
`parking at the giver opened no offer card: {"parked":true,"hb":true,"v":0,"m":"idle","onJob":false,"offers":1,"d":5.5,"prompt":"PARKSpaceRBto take the paper route", ...}`.

Deterministic: `SMOKE_PAD_SEED=3397198020 SMOKE_STEPS=boot,pad node test/cdp-smoke.mjs` fails on main 51a932bf AND on
961311ec (before BUG-147/140), so it is older than tonight's landings.

## Acceptance

- Decide which side is wrong: the test's giver pick (a paper-route-only giver is not a "plain" giver), or the game
  (a giver with one paper-route offer should open the card on park like every other giver). Name the evidence.
- Fix that side; the replay above passes; a pad-step run on a few other random seeds still passes.

## Resolution (Spare, 2026-11-10)

**The test was wrong, not the game.** The picked giver on 3397198020/K is the **firewood yard**
(`poi:1360315,-165762,-1|2,0,0@0`, at 1459.8, -109.2), not anything of Larry's. Nothing else stands within 60 m of it.

- The firewood yard is a haul giver with a FEAT-88 **drop zone** (`poi.js` POI_ROSTER `drop`). Its offers open only
  with the truck's BED over that rectangle (`main.js _inPoiSpot` → `_bedOverDrop`). That is the designed rule.
- The smoke's `PAD_SEAT` seats a `park`-box POI properly, but seats every other POI by its marker toward the road.
  It never puts the bed over a drop zone. So the truck sat 5.5 m from the marker, `_poiInReach()` returned null,
  and no card opened.
- The "to take the paper route" prompt was a red herring. `#poi-prompt` was hidden. A hidden element keeps its last
  text, and `innerText` still returns it. The text was left over from Larry's, earlier in the step.
- The smoke's two other giver picks (the save step and the generic-giver step) already skip `q.drop`. The pad
  step's pick was the only one that didn't.

**Fix (test only, `test/cdp-smoke.mjs`):** the pad step's giver pick also skips `q.drop`. Its failure diagnostic now
reports `promptShown`, so a stale prompt can't be misread again. No `src/` or `data/` change.

**Proof (`SMOKE_STEPS=boot,pad`, each through `tools/chrome-slot.sh`):** 3397198020 now passes; it failed before the
fix on this branch. Three fresh random seeds pass: 2139678081, 2482958385 and 1604887789. All three paged LB/RB.

Not covered by the smoke, before or after: parking with the bed over a drop zone and getting the card in the browser.
That is a coverage gap, not this bug.

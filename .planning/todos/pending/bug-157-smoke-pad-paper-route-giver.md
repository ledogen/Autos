---
id: BUG-157
type: bug
status: open
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

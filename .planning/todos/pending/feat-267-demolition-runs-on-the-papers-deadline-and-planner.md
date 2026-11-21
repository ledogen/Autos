---
id: FEAT-267
type: feature
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "demolition should follow the papers, timer, and route planning. I'm happy with the clustered placement of the barrels. ... i think we just make demo a straight hurried job."
relates: FEAT-65, FEAT-266, FEAT-256, DEC-399, DEC-398, DEC-020, src/demolition.js, src/paper-route.js, src/mission.js, data/offers.js
---
lane: SM-3 missions

# FEAT-267: Demolition runs on the papers' deadline and route planner

## Next steps
Built on `land/feat-267-demolition-deadline`, then DEC-403's pay per target on `land/feat-267-pay-per-target` (see Log).
The owner drives a demolition job on the play build and answers the owed card `feat267-demolition-drive` (the slack
number, the par stretch, the words). DEC-430's own sign pool is built on `land/dec-430-demolition-signs`: the owner looks
at the sheet and answers the owed card `dec430-demolition-signs-look`.

## Summary
A demolition job becomes a hurried job like a paper round: one deadline for the whole job, priced from the planned
tour through its targets, a rank on time with the rank bar, and the GPS following the shortest tour through the
targets still standing, turning back for a missed one when that is the shorter way. The 40 s per-hit window goes.
The clustered placement of the targets stays as it is.

## Description
Today (FEAT-65): before the first smash the job is a drive under its due-in deadline; the first smash starts a 40 s
window that every smash refills; when it runs out the job settles on the share smashed; no rank bar (DEC-178, now
superseded by DEC-399).

To build, mirroring the paper round as FEAT-266 leaves it:
- Deadline from the tour's par through the job's targets, with demolition's own slack.
- Slack: "slightly easier than Courier because you have to slow down and drive off the road to hit barrels". Courier
  is the reference; the number is the builder's default until the owner confirms it on the drive card.
- Rank on time against that deadline, with the rank bar, as a hurried job.
- The guide is the shortest tour from the truck through the targets still standing (DEC-398's rule).
- Only the job's own targets are shown (already true: FEAT-256's count in the sentence stays).
- Open for the builder to state, not decide: what a job that ends at the deadline with targets standing pays (today:
  the share smashed), and how the share smashed and the time rank combine into one letter. The paper round's own
  rule (coverage and time) is the model; anything it does not answer goes on the card as a question.

## Tracker
- [x] One deadline from the planned tour; the 40 s hit window removed (code, saves, HUD line, run log)
- [x] Rank bar and time rank as a hurried job; the letter's rule stated
- [x] GPS follows the remaining tour and turns back for a missed target when shorter
- [x] Slack set slightly easier than courier's, number on the card (1.25 vs 1.0 [DEFAULT])
- [x] Gates and the smoke's demolition step updated; saves from before still load
- [x] DEC-403: the base paid a share per target as each falls; the tip on time at the settle; an expiry or abandon keeps the shares
- [ ] Owner drives a demolition job
- [ ] DEC-430: the work site's sign line wears its own orange work-zone signs, never a road sign (built; owner look owed)

## Decisions
- 2026-11-17, owner: DEC-399.
- 2026-11-17, owner: DEC-403 (pay per target, tip on time only).
- 2026-11-18, owner: DEC-430 (demolition signs from their own pool, visually distinct from road signs).

## Files
`src/demolition.js` · `src/mission.js` · `src/par.js` · `data/offers.js`

## Log
- 2026-11-17: minted by the orchestrator from the owner's ruling in chat.
- 2026-11-17 (lane s): built. Deadline par × 2.25 (`DEADLINE_SLACK.demolition` 1.25 [DEFAULT]; courier 1.0 = par × 2). Letter = time
  (gradeRun), only with every target down; at the deadline with any standing the job expires unpaid (DEC-004, the paper fare's rule).
  Guide = paper-route.js `planGuideJob` (shared with the paper re-plan) over one stop a cluster (`siteStops`), leg via `tourLeg`.
  Impatient / Patient now apply. RANK_TABLE.demolition, hitWindowS, nearestTarget/guideTo, lastHitS gone. Clean-run model:
  wip/feat-267/clean-run.log (9 sites, 0.69–0.72 par at 40 km/h). 41/41 affected gates, full smoke 38/38 (zero console
  errors), pad-e2e ALL OK. Sheet wip/feat-267/sheet.jpg. Owed: feat267-demolition-drive.
- 2026-11-17 (lane s): DEC-403 built on land/feat-267-pay-per-target. economy.js `sharesPaid` / `payTarget` (a share banked per fall,
  `mission.sitePaid` saved with the job), settle pays only the rest (the tip); expire/cancel results carry the kept shares.
  Gates: economy.mjs + offer-board.mjs extended; 41/41 affected green (wip/feat-267/gates-r2.log). Full smoke 38/38 zero console
  errors (smoke-r2.log, no board demolition offer live at that hour; the step subset smoke-demo-r2.log took one: $0.50 a
  share, expiry keeps $1.00), pad-e2e ALL OK. Sheet
  wip/feat-267/sheet-r2.jpg (full clear: $10 → $18.99 = base $5.25 + tip $3.74 exactly).
- 2026-11-20 (lane s): DEC-430 on land/dec-430-demolition-signs. oldSignLine's 7 ASSET-31 road signs → 4 work-zone signs
  (road-signs.py: worker, arrow, blank, striped board; BarrierOrange; same 4x4 + blank, 13 kg, SIGN_POST_BOX, no tags).
  demolition-site gate asserts no demolition kind is a sign-*.glb and no work-*.glb is pooled. Turn-back signs untouched
  (hand-painted ply on stakes, already distinct). Sheet CarGame/wip/dec-430/sheet.jpg (seed 518277).

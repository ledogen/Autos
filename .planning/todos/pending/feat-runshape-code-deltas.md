---
id: FEAT-54
type: feature
status: open
opened: 2026-08-02
severity: minor
source: run-shape.md "Code deltas owed to the 2026-08-02 ruling" (capture-before-tuning mandate)
relates_to: >
  run-shape.md [2026-08-02 ratification — 20-day run, 16 h waking day, clock pauses in
  shops/service/camp], FEAT-47 (day clock), FEAT-53 (economy spine — the tier/rank deltas here
  are Phase D item 2's ratified *length*; steepness still waits on SM-3 costs), FEAT-43/FEAT-28
  (region radius ladder), SM-INV-2 (ramp lives in tier+letters, par never moves)
---

# FEAT-54: Code deltas owed to the 2026-08-02 run-shape ruling

run-shape.md's "Code deltas owed" table: shipped values were derived from the retired 7–8-day
figure and must move to the ratified 20-day shape. This ticket is the capture the doc mandates
("No ticket yet — capture before tuning").

## Applied 2026-08-02 (the mechanical deltas, same session that minted this)

- [x] `day.js` `fullEnergyH` 18 → **16** (16 + 8 h sleep closes the 24 h day; 18 drifted dawn
      2 h/night).
- [x] `day.js` ladder: **owner ruled keep 4/2/0 energy-remaining** (sleepyAtH 4, tiredAtH 2
      unchanged) — stages now onset at 12/14/16 h awake; "last 4 h risky, last 2 dangerous"
      is the ratified constant.
- [x] `day.js` sleep rates → **4/3 and 8/3** (mean 2.0 ⇒ 8 h × 2.0 = 16 = full from empty;
      best still exactly 2× worst; best/worst full-from-empty still 6 h / 12 h).
- [x] `economy.js` `rankTightenDays` 8 → **20** (the letter ramp spans the ratified run).
- [x] `economy.js` `dayTierTable` 8 → **30 entries**: shipped ×1.15 curve through day 8 (2.66),
      then soft approach to the **~5× asymptote (owner-picked 2026-08-02)** —
      `tier(d) = 5 − 2.34·e^((8−d)/7)`, ~4.9 by day 30. Still Phase-D-provisional in steepness.
- [x] `economy.js` k commentary re-illustrated for the 20-day shape (region-1 day ≈ 2 jobs
      ≈ $130-190; the stale "2.7-job day" example is gone).
- [x] Gates re-pinned in step: `day-clock.mjs` (16/4/2, rates 4/3 & 8/3 with FP-safe epsilons,
      ladder 12/14/16, scenario hours), `economy.mjs` (table length 30, clamp at day 30,
      day-20 letter check), `gates.mjs` desc.

## Still owed (the open remainder — this ticket's live scope)

- [ ] **`story.js` `REGION_RADIUS_M` per-region ladder** — flat 2500 becomes region 1 of a
      ladder growing with depth on a sparser grid. The actual radii are OPEN (run-shape.md:
      derive from the par bands; **run `test/region-radius-curve.mjs` before committing radii**).
      Not in `routeCacheSig` ⇒ no re-bake. Interacts with FEAT-28's per-unlock budget.
- [ ] **Repairs need a time cost alongside the money cost**, applied as a clock skip (the
      shops/service/camp pause ruling) — plumbing arrives with SM-3's repair economy; capture
      only, do not build early.
- [ ] **The map must be reachable from the shop / service / camp screens** (UI reachability,
      probably lands with FEAT-41 menus).
- [ ] `sky.js` `dayLengthSec` 120 disagrees with day.js's 1440 — **day.js is the authority**
      (pre-existing; sky's value is a free-roam demo cadence). Decide whether story mode should
      drive sky's cycle off DAY_PARAMS instead of the local constant.

## Acceptance

- Applied section: `npm test` green on day-clock + economy (done in the applying commit).
- Remainder: each box closes with its owning system (FEAT-28/41, SM-3) or its own decision;
  close this ticket when the list is empty or every remaining line has moved to a real owner.

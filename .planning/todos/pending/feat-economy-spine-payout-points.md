---
id: FEAT-53
type: feature
status: open
opened: 2026-08-01
severity: major
source: SM-2 milestone entry (planning session 2026-08-01)
relates_to: >
  SM-2 (MILESTONES.md "The Wager" — this is its first pass), DESIGN.md "The performance model"
  [RATIFIED 2026-08-01], SM-INV-2/3/4/12/14, FEAT-47 (day clock — dayTier reads runState.day),
  FEAT-46 (POI pads — the job source), FEAT-29 (par oracle — gradeRun), feat-par-calibration.md
  (the Phase D measurement rig)
---

# FEAT-53: Economy spine — payout, wallet, mission points ("good deeds")

The SM-2 first pass, scoped by the owner 2026-08-01: **economy spine only**, on the existing
point-to-point missions. Implements the ratified performance model — it does not design it.

```
ratio  = elapsed / par
payout = parBase × dayTier × clamp((1.2 − ratio)/0.2, 0, cap)      parBase = k × par
```

## Owner rulings recorded here (2026-08-01 planning session)

- **Scope**: economy spine only. Paper route (coverage), fragile (restraint), bonus objectives,
  consumables → follow-up tickets at next SM-2 sitting.
- **Job board**: **single offer per POI, no reroll** — park → one job → accept or walk away;
  re-parking re-presents the SAME offer; it re-rolls only at a day boundary. Dodges the open
  board-discovery/expiry question (missions.md — still owner-open).
- **Terms lock**: dayTier AND rank thresholds both freeze at ACCEPT (the spec mandated only
  dayTier; owner ruled lock both — the contract you took is the contract you're graded on).
  The 1 a.m. accept buying tomorrow's rate stays a feature (ratified; "do not fix").
- **Theming**: mission points display as **"good deeds"** (½ glyph, never "3.5"). Display-layer
  only — internally they are SM-INV-14 mission points.
- **Quick Job pays nothing** — it is the calibration rig; `fromPoi` is the discriminator. It
  keeps regenerate/retry; paid jobs have neither (`PAID_JOB_DO_OVERS` const flag, story.js
  DEBUG_LOCKOUT style).

## What shipped (phases A–C, 2026-08-01)

- **`src/economy.js`** (new, imports nothing): `ECONOMY_PARAMS`, `RANK_COLOR`, pure
  `dayTier`/`rankThresholds`/`payoutFor`/`pointsFor`, `runEconomy` (run-layer SIBLING of
  day.js's `runState` — the wallet moves at settlement, not a day boundary, so it must not
  widen runState's contract), `EconomySystem` (terms/settle/snapshot/addGui), `formatDeeds`.
- **`src/par.js`**: `gradeRun(elapsed, par, thresholds = RANK_THRESHOLDS_DEFAULT)` — thresholds
  injected by economy.js's day ramp; the ramp lives in the LETTERS, par never moves (SM-INV-2).
- **`src/mission.js`**: `getTerms`/`onSettle` deps (optional — headless gates unchanged); terms
  stamped at accept; settle-once on arrival (`_settled` double-pay guard, throw-proofed);
  `_offers` cache keyed `${poiId}|${day}` (accept consumes; `clearOffers()` from
  `invalidatePlan()` + region live/exit — entries hold live centerlines); `PAID_JOB_DO_OVERS`
  gating regenerate/retry on `fromPoi` jobs.
- **`src/main.js` + `index.html`**: result card (rank letter in ratified colours
  D·C·B·A·S = red·orange·yellow·white·blue, payout + good-deeds lines, "test job — no pay" on
  Quick Job, retry/regen hidden on paid jobs); `#run-hud` top-right (story-only, always visible
  while region live — owner ruling; own element so the SM-INV-3 running surface is untouched);
  `Story · Economy` GUI folder; `window.__economy`.
- **Gates**: `test/economy.mjs` (33 checks: SM-INV-4 anchors, zero floor, parBase ∝ par,
  points/payout monotone in elapsed, tier/threshold shape, B-contains-par every day, terms
  lock, runState narrowness, purity); `test/story-poi.mjs` §7 single-offer + §8 do-over
  lockout.

## ⚠ PROVISIONAL tunables (Phase D — the owner's balancing pass, NOT done)

```
k = 0.30 $/s (re-derived 2026-08-02, see below) · cap 3.0
dayTierTable ~×1.15/day → 2.66 @ day 8
rankDayLate { S:0.74, A:0.88, B:1.02, C:1.15 } reached day 8 (linear from day 1)
```
The SHAPE is ratified. **k was re-derived 2026-08-02 (Phase D item 1)** against the
FEAT-30-recalibrated par scale: 310 anchored POI-job rolls over three seed-6 region slices
(story-poi-style headless worlds, R 1200, forced POI density) gave par p10 129 s / median 210 s /
p90 352 s (mean 226 s, mean leg 3.9 km) ⇒ k 0.30 lands the target — median day-1 par job $63,
mean $68, a 2.7-job day ≈ $170-185. The tier/rank tables remain Claude-picked placeholders.
run-shape.md: the cost-escalation curve, the day tier and the threshold ramp are ONE balance
problem — tune together, against real drives (the feat-par-calibration.md rig is the natural
home). Gate-pinned constraints any retune must keep: tier(1)=1, thresholds tighten
monotonically, **B > 1.0 on every day**.

## Acceptance (A–C)

- [x] POI job pays `k·par·tier` at par exactly; 1.2 ratio pays 0; floor at 0 (gate)
- [x] Points 1/½/0 at B+/C/D, integer halves, never increase with time taken (gate)
- [x] Terms (tier + thresholds) frozen at accept, settle honors them across midnight (gate)
- [x] Single offer per (POI, day): identical object on re-park, accept consumes, day re-rolls (gate)
- [x] regenerate/retry inert on paid jobs, live on Quick Job (gate)
- [x] Quick Job settles nothing; free roam runs no economy code
- [x] Rank colours on result card only; `case 'running'` untouched (SM-INV-3)
- [x] `runState` stays `{ day }` — wallet lives in `runEconomy` (gate-pinned)
- [x] `npm test` green (economy + story-poi + par-oracle + mission-network + gps-route)
- [x] `npm run test:all` green pre-commit (44/44 at e8a7c02; 45/45 at 92da8e4)
- [x] Live drive-through: owner drove the full flow 2026-08-01/02 — "flow is good,
      everything feels good"

## HANDOFF — state as of 2026-08-02 (phases A–C DONE and owner-verified; D open)

**On main:** `e8a7c02` (spine) · `212c3a1` (fix: quick-job accept teleports again — _launch's
setSpawn write clobbered the async teleport's spawn override; setSpawn now fires only on the
no-seat POI path. Latent since FEAT-46; keep the pattern in mind for any future _launch caller).

**Landed alongside, same day (interacts with Phase D):**
- **FEAT-30 par recalibration** (`041761b`, ticket CLOSED in `todos/completed/`): PAR_REF mu
  0.62→0.90, accel→3.0, brake→7.0, fitted to 20 labelled drives via `test/calibrate-par.mjs`
  (re-runnable when new runs land in `runs/`). Every par shrank ~15-19% ⇒ payouts (k·par) shrank
  with them and ratios rose. **k = 0.35 was picked against the OLD par scale — Phase D must
  re-derive it** (target: typical day-1 job at par ≈ $60-70, day of 2.7 par jobs ≈ break-even
  against whatever SM-3-era costs get authored).
- camp-view merge (`04c8798`), junction-flow merge (`92da8e4`) — no economy interaction.

**What Phase D still owes (the only open work on this ticket):**
1. ~~Re-pick `k` against the recalibrated par~~ — DONE 2026-08-02: k 0.35 → **0.30**, derived
   from a 310-roll headless par sample (method + numbers in the PROVISIONAL section above and
   in the economy.js derivation note; gate pin updated in step).
2. Balance `dayTierTable` + `rankDayLate` against real multi-day runs — run-shape.md: tier, rank
   ramp and cost escalation are ONE problem; SM-3 costs don't exist yet, so a full balance pass
   may want to wait for them (owner's call whether to hold D until SM-3 opens).
3. Gate-pinned constraints any retune must keep: tier(1)=1 · thresholds tighten monotonically ·
   **B > 1.0 every day** (`test/economy.mjs` fails loudly on all three).

**Where things live:** economy math+state `src/economy.js` (imports nothing; PROVISIONAL block
at top) · seams in `src/mission.js` (terms at accept, settle-once at arrival, `_offers` cache,
`PAID_JOB_DO_OVERS`) · surfaces in `src/main.js` (`_renderMissionUI` done-case, `_renderRunHud`)
+ `index.html` (`#run-hud`, `.mp-pay`) · gates `test/economy.mjs` + `test/story-poi.mjs` §7-8 ·
harness hook `window.__economy` · owner rulings recorded above in this ticket.

**Next SM-2 sittings (separate tickets to mint, not Phase D):** paper route → fragile → bonus
objectives → consumables (order per MILESTONES SM-2). Open owner questions that gate them:
job-board discovery/expiry, fragile binary-vs-graded, bonus loot-only-vs-points.

## Deferred / follow-ups (next SM-2 sitting)

- Paper route (coverage axis, the uncle, day-fraction budget) — needs a delivery-fan generator.
- Fragile (restraint axis) — vertical-shock plumbing shared with SM-3 suspension wear.
- Bonus objectives ("a little extra for an A", item reward) — needs items to exist.
- Consumables (coffee as an item) so lazy-day-negative holds against real running costs.
- Camping mid-mission `survivesNight` flag (job-dependent — ratified 2026-07-19; today the
  payout math punishes an overnight on any job via elapsed, which is a fine interim).
- Phase D tuning (above). Open owner questions that gate later passes: board discovery/expiry,
  fragile binary-vs-graded, bonus loot-only-vs-points, freight flat-rate vs SM-INV-4.

---
id: BUG-168
type: bug
status: done
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "Not sure if this is a bug or if it just hasn't been built yet, but I've noticed you can't die from impact"
relates: FEAT-146 (the run ends), SM-INV-1, DEC-034, src/damage.js (`fatalMphBare` 40, `fatalMphFull` 65, `fatalEnabled`), src/main.js (`_endRun('crash')`)
---
lane: B

# BUG-168: The owner cannot die from an impact — the fatal-crash rule exists but does not fire in play

## Next steps
Done. Owner picked 40 bare / 65 full (DEC-167); landed with the one-crash-priced-once fix.

## Summary
The rule works and the hit is measured right: a head-on into a rigid wall is priced at the truck's own Δv (velocity change), which is the impact speed plus about 12 % rebound. The thresholds are out of reach in play. A story jalopy's armor is 50–90 %, so it needs 80–96 mph of Δv to die, which is a 71–85 mph square hit. Roads are designed for at most 63 mph. One real defect turned up on the way, in the other direction: a long hit was priced twice. Fixed.

## Description
### How the hit is measured
`feedContact` (src/damage.js) holds a burst of contact steps (≤ 60 ms, `impactHoldMaxCrash`) and prices it on the truck's own Δv across the burst. The start velocity is reached back 10 steps (167 ms) to before the contact began. `v_eq = |Δv|`, compared with `fatalMph(armor before the hit)` = 60 + 40 × armor mph. Every region with armor (front, left, right, rear) runs the check; a vertical push (ground, roof) has no region and never does.

### The table (headless, `node test/crash-lab.mjs`, after the fix)
The real truck coasts in on flat ground. Obstacles are built the way the game builds them: static, restitution 0, friction 0.8. Wall/building = a POI hull; tree = a 0.35 m capsule; face = a 70° terrain cliff. Glancing = path at 30° to the face, and for the round tree, a hit 0.75 m off centre (the bumper corner). Each cell = the largest landed burst in mph of Δv, then the result at armor 100 % / 70 % / 30 % (thresholds 100 / 88 / 72).

| target, angle | 50 mph | 70 mph | 90 mph | 110 mph |
|---|---|---|---|---|
| wall head-on | 56 · alive/alive/alive | 79 · alive/alive/DEAD | 103 · DEAD ×3 | 126 · DEAD ×3 |
| wall glancing | 15 · alive | 21 · alive | 26 · alive | 34 · alive |
| building head-on | 56 · alive | 79 · alive/alive/DEAD | 103 · DEAD ×3 | 126 · DEAD ×3 |
| building glancing | 43 · alive | 61 · alive | 79 · alive/alive/DEAD | 96 · alive/DEAD/DEAD |
| tree head-on | 59 · alive | 70 · alive | 108 · DEAD ×3 | 132 · DEAD ×3 |
| tree off-centre | 49 · alive | 69 · alive | 90 · alive/DEAD/DEAD | 110 · DEAD ×3 |
| 70° terrain face | 42 · alive | 59 · alive | 75 · alive/alive/DEAD | 93 · alive/DEAD/DEAD |

Reading it: Δv tracks the impact speed honestly. A glancing wall hit sheds little (the normal component, then a second slap), which is the ratified "a glance costs little" property. A cliff face costs less than a wall because the truck rides up it.

### Cause
1. **Thresholds out of reach (the owner's symptom).** Jalopy armor rolls 50–90 % (`JALOPY_COND.armor`), so the fatal Δv is 80–96 mph, a 71–85 mph square hit into something rigid. The truck tops out at 104 mph on the flat and 96 mph on a 5 % grade (full throttle, headless). Par's design speed is capped at 28 m/s = 63 mph, so on these roads the owner rarely holds the speed it takes, and a glancing hit never gets there at any speed.
2. **Not suppressed.** A run ends from a fatal hit in a LIVE story run (`storySystem.isActive() && !isEntering()`) and in the paper scenario (its own card). Free roam, the menu, and a run's entering phase never end. Lives (DEC-001's difficulty clause) are not built, so nothing intercepts it.
3. **Defect found and fixed (over-pricing, not under).** A hit that outlasts the 60 ms window banks and starts a second burst at once. That burst's 10-step reach-back landed before the first burst began, so the same Δv was priced twice, the second time against armor the first had lowered. Measured: a 70 mph off-centre tree strike landed 69 + 75 mph and was fatal at full armor. The fix: a banked burst's velocity is the next burst's floor. Now 69 + 7 mph. A glancing 110 mph wall scrape went from 32 + 64 to 32 + 34.

### Approximations to flag
- The fatal check is per burst, and a burst is at most 60 ms. A long scrape is several smaller hits, never one big one. Real crash pulses run 70–150 ms; the engine's rigid contacts finish a head-on inside 1–2 steps, so this only matters for glancing hits.
- The rebound (≈ 12 % on a rigid wall) counts toward Δv. That is the correct injury measure, but it means the damage screen's "N mph impact is fatal" reads about 10 % above the approach speed that kills.
- Seen in passing, not this ticket: FEAT-170's evening leg skips wear (`damage.step`) but not `feedContact`, so a crash on the safe drive still costs armor and can kill.

## Tracker
- [x] Table: object × speed → equivalent speed, fatal or not
- [x] Cause named: thresholds out of reach (plus a double-count, fixed)
- [x] Fix for the measurement defect; a threshold proposal for the owner
- [x] A gate: a head-on at the fatal speed into a rigid wall is fatal, at 80 % of it is not (`test/crash-fatal.mjs`)
- [x] Owner: fatal speeds — 40 / 65 (DEC-167)

## Open questions
- **The fatal speeds (owner's number, DEC-034).** Lane B recommends bare 40 / full 65 mph of Δv, keeping the armor scaling. At jalopy armor (50–90 %) that is 52–62 mph of Δv, a 47–55 mph head-on. A square hit at road speed (≤ 63 mph) kills, a 40 mph tree strike does not, and a glancing scrape never does. Reasoning: real frontal-crash data puts the fatality risk for a belted occupant steeply rising past Δv ≈ 40 mph and near even around 50–55 mph (approximate; NASS-CDS-style risk curves). The current 60 / 100 sits above anything the roads let you hold.
- Where and at what speed did it happen? Free roam never ends a run, by design.

## Files
- `src/damage.js` — `feedContact`: the banked burst trims the velocity ring (BUG-168 comment)
- `test/crash-lab.mjs` — the instrument (rainy-day): `node test/crash-lab.mjs [--mph=] [--armor=] [--target=] [--angle=]`
- `test/crash-fatal.mjs` — the gate, pinned relative to `fatalMph()` so the owner's numbers can move

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.
- 2026-11-13: Lane B: reproduced headless, table above, cause = thresholds out of reach; double-count fixed in `feedContact`; gate `crash-fatal` added.
- 2026-11-14: Lane B: fatalMphBare/Full 60/100 → 40/65 (DEC-167, supersedes DEC-034) on land/phys-1114. Affected gates 21/21 green; crash-fatal: 65 mph head-on at full armor is fatal, 52 is not. Closed.

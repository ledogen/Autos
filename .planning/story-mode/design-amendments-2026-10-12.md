# Amendments — progression, run shape, lives and armor, 2026-10-12

*Written in the doc's ratification ritual so it can be folded in directly. Every decision below is
the project owner's, given in the 2026-10-12 "explain it to a friend" pass. Wording is a proposal;
the decisions are not.*

> **STATUS: FOLDED IN 2026-10-12.** DESIGN.md carries these inline. This file is the provenance
> record and the fuller argument. If it ever disagrees with DESIGN.md, **DESIGN.md wins.**

The owner opened by describing the game as they would to a friend they used to race with, and
then answered the questions that description raised. The through-line: **the game must be
finishable by a player who drives safely with urgency**, and **the difficulty ramp lives on the
driving side** (longer, steeper, weather), not only in the economy.

| # | Amendment | What it changes |
|---|---|---|
| 1 | **Finishable if you drive safe.** Consistent par with no crashes covers gas, repairs and the upgrades needed to keep up with later regions. | Makes explicit what SM-INV-7 implied. The economy may not be tuned so that only the fast survive. |
| 2 | **Send-it early power.** A risky early mission may hand a large upgrade or a lot of money. | Run-layer only; SM-INV-7/9 untouched. Names the "rip" lane the owner wants next to the "chill" lane. |
| 3 | **Three regions, three bosses, ~12–14 days per run.** | DESIGN.md's **6 regions / 20 days** (2026-08-01/02). The authored point and day budgets (`6·6·6·4·3·2`, `4·4·4·3·3·2`) are **owed a re-cut**, owner to author. |
| 4 | **Concentric-ring layout.** Intensity rises toward the origin. R1 a ~30° sector on the outer gentle ring, R2 an equal-area parallel-sided band one ring in, R3 the centre disc. Today's steepness **is** region 2. Road character varies by ring; region 2's ring keeps today's ratified road defaults. | "Growing with depth on a sparser grid". Not a QUAL-29 retune: defaults stand, a radial term is new. Radii still open (IDEAS.md). |
| 5 | **Region 3 throws you back out.** Its jobs often send you to region 2, sometimes region 1. | A destination weight on the offer picker. No new system. |
| 6 | **Bridge site is the first boss. The log drag is demoted** to a free-roam toy or a one-off scenario. | missions.md "Main mission = log drag". The blocker is spawning the log reliably on random roads. |
| 7 | **Difficulty settings for story mode:** lives, free tows, assists, and inflation split into **three knobs** — damage scaling, gas scaling, upgrade/item costs. | A new settings surface; the economy is no longer one slider. |
| 8 | **A lost life:** reset to the road, cargo lost, vehicle condition **floored at 25%**. Out of lives = death as before. **Respawn is dev / free-roam only; story mode has none.** | SM-INV-1 and SM-INV-8 gain a lives clause. Death's meaning is unchanged. |
| 9 | **Armor raises the survivable crash speed, scaled by the hit panel's condition.** No armor ≈ 60 mph fatal, full armor ≈ 100 mph. Condition drops after each hit, so the ceiling drops with it. | `fatalMph: 80` and the 2026-08-23 ruling that total armor loss and death are the same impact. Open question 8's second half is resolved. |
| 10 | **Heavier loads are the safe player's lane.** Freight driven fast rewards less than courier driven fast; par is geometric, a loaded truck is slower against it. | Confirms the shipped shape; no change. |
| 11 | **Rewards:** repair kits (subsystem-specific, or engine + tires split from the rest), some fuel back, food as an energy multiplier. | items.md candidates, not yet tickets. |
| 12 | **Roadmap fences:** Ranger-only alpha; multiplayer stays on the roadmap and no physics/sync code may block it; traffic is a post-alpha stretch goal and, if it comes, physics-simulated, never scripted. Roster direction after alpha: 4Runners, Jeeps, wagons, SUVs. | Scope. |

---

## 1–2. Finishable if safe; send it for early power

The owner's words: *"I want the game at a fundamental level to be finishable if you just drive safe.
You can't drive slow, but if you just drive safely and with an urgency you should be able to finish
the game just fine."* And in the same breath: *"you should be able to send it and get an insane
upgrade or a lot of money early on so you can build your heart faster, just so you can risk your
life harder."*

Two lanes, both legal. Neither touches meta-progression, so SM-INV-7 (every run technically
winnable) and SM-INV-9 (unlocks change rules, never balance sheets) stand. What changes is the
tuning constraint on the economy: the lazy-day-negative identity (open question 4) still holds, but
**a par day with no crashes must fund the run**, not merely break even on a treadmill.

## 3–5. Three regions on rings

*"I think there's three regions total, and that's three boss fights."* Days: *"maybe 12 to 14."*
The six-region shape was sized by "what one surviving run can reopen"; three is comfortably inside
that and halves the authored content.

The ring layout (IDEAS.md, 2026-10-12, with a live sketch at the artifact linked there): terrain
intensity is a function of distance from the origin, rising inward, which is a radial term on the
`noiseRegional` modulator in `src/terrain-height.js` and therefore meta-free (SM-INV-12). Regions
are placed by angle on those rings. Region 2's angle is derived from equal area with region 1; the
owner asked for region 2's sides to be **parallel** so the gate into region 3 is not a pinch.

Worked example on the owner's slider settings: centre radius 1.5 km, rings 1.8 km deep, region 1 a
50° sector from 3.3 to 5.1 km out (area ≈ 6.6 km²), region 2 a band 3.2 km wide from 1.5 to 3.3 km
out of equal area, region 3 the 1.5 km disc. At those numbers the band is wider than the centre disc
so the gate is the whole circle. **Radii are not ratified.**

Region 3 "throws you back out": *"it was hard to get back into the good economy of the map — not
always and not super far, but maybe it throws you back into region two a lot more than it throws you
around in region three, unless you're lucky."*

## 6. The log drag steps down

*"I actually think the log tug is something we should build as like a free-roam toy or maybe a
scenario. What I don't like about it is how hard it will be to spawn the log nicely for the player.
Due to the random nature of the roads it would be hard to prevent the log from rolling down and
getting stuck somewhere that makes the mission impossible."* And later: *"You could still lose that
log, and going down the steep hills would suck too."* The bridge site (missions.md, 2026-09-30) is
the region-1 boss because it is a plain delivery. The beat/labor split survives on the bridge site.

## 7–8. Lives, tows, three inflation knobs

Respawn exists today for development and stays in free roam. Story mode has no respawn. Instead
the difficulty settings carry **lives**: *"when you crash, you either lose a life or you die
completely."* A lost life: *"reset to road and cargo lost… maybe we reset car back to 25%"*,
confirmed as a **floor** on vehicle condition (a healthier truck keeps what it has). Free tows are a
separate count. Assists are their own toggles. Inflation is **three** settings, not one: damage
scaling, gas scaling, and upgrade/other item costs.

SM-INV-1 is unchanged in what death *is*. The lives clause is a setting that converts some deaths
into a penalty short of death; the default ("the way the game was meant to be played") has no lives.

## 9. Armor and the fatal speed

*"Armor should protect you from dying up to higher speeds. Right now 60 miles an hour should be
with no armor, and then maybe up to 100 if you're full armor. Armor should be calculated from the
panel that it hits."* Scaling: *"scale by condition on hit — condition is continuous in that it
lowers after a hit."* So the fatal threshold is a function of the hit panel's armor condition at the
moment of impact, 60 mph at 0% to ~100 mph at 100%, and each hit that lands lowers the next ceiling.
This replaces the 2026-08-23 coincidence rule (death = total armor loss at one speed). The shipped
`fatalMph: 80` is a single number and must become that function; the impact pass already knows the
region hit.

## 10–12. Confirmations and fences

Freight as the safe lane confirms the shipped FEAT-96 shape. The reward list goes to items.md as
candidates. Multiplayer and traffic are recorded as fences on the roadmap, not as work.

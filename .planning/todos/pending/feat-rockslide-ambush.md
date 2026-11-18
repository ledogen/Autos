---
id: FEAT-26
type: feature
status: open
opened: 2026-07-15
updated: 2026-11-18
severity: minor
source: user-idea; alpha ruling owner 2026-11-17 (DEC-400)
relates: FEAT-36, FEAT-48, FEAT-93, FEAT-27, FEAT-103, DEC-400, DEC-425, DEC-395, src/rockslide.js, src/debris.js
---
lane: hazards (u)

# FEAT-26: Rock slides — timed tumbling rocks that try to hit the truck

## Next steps
Orchestrator: land `land/feat-26-rockslides` (main merged in, DEC-425 built). Owner: the story drive (owed card `feat26-rockslides-story-drive`).

## Summary
A rock slide off a road cut: 5–15 rocks in a 3 m patch on the cut face, released so they cross the truck's lane as it gets there.
Free roam: about one per 20 km driven (a memoryless draw). Story mode (DEC-425): only on three of the five requisition lines, flagged per run by the seed, one slide each.
Only on cuts steep enough to deliver rocks and visible from the approach. The rocks fade in over 0.5 s.
Built on the debris bodies (FEAT-36) and the wear model; no spirit ties (DEC-400). The run save keeps only which lines have had their slide.

## Description

### As built (2026-11-17, `src/rockslide.js`)
- **Rocks:** the world's own rock blob (prop-geometry `makeBlob`, the scatter's rock generator and colour), six variants, blob radius 0.15–0.32 m, granite 2650 kg/m³ → about 35–330 kg. Rounder than the scatter's medium rock (1.1 × 0.9 × 1.0 against 1.25 × 0.7 × 1.0): flat blobs slide and stop in the ditch. No model file and no placeholder: `test-rock.glb` is not used. Hazard rocks (FEAT-93 punctures apply).
- **Candidacy** (computed near the truck from the road polyline and ground heights; no generator change): at a 5 m station, the ground across the road rises from a toe within 8 m of the deck edge (and within 2.5 m of deck height), every 1 m step at ≥ 35°, for ≥ 4 m; the fall line points across the road (along-road share ≤ 0.5). Sight: from every truck position 10 m apart over max(stopping distance, v·T) + 10 m (stopping distance = 1.5 s reaction + braking at 6 m/s²), the line from eye height 1.3 m to the impact point and to the patch clears the ground. Not within 40 m of a run end (junction pads), not with a tunnel in the approach, not at a POI apron or junction pad. Trees are not checked.
- **Batch:** 5–15 rocks, uniform, laid in the 3 m patch on the face, centre half a patch below the top of the face and never more than 12 m above the toe; released at 6 m/s down the fall line with the rolling spin that matches it (the "optional slope-aligned velocity": the study says it adds consistency, so it is on).
- **Timing:** arrival model T = −0.48 + 0.69·√drop + lat / 5.1 s (drop = patch height above the toe, lat = toe → the truck's lateral position). Release when the truck is v·T from the impact point along its run. No release below 5 m/s (the pick is held); the pick is dropped if the truck turns off the run or round. It aims at the truck: no deliberate miss.
- **Rate:** the distance to the next arming is exponential, mean 20 km. P(two within 2 km) = 1 − e^(−0.1) = 9.5 %; P(none in 40 km) = 13.5 %. Armed, the director takes the next candidate ahead that the truck is still far enough from (candidates cover ~17 % of road per direction, so the wait is a few hundred metres). Off in the tutorial and the lab.
- **Fade:** each slide gets its own material with `alphaHash` (a per-pixel dithered discard against the opacity, so no transparency sorting) ramped 0 → 1 over 0.5 s. Debris casts no shadow, so nothing pops. The shader is compiled at boot (lazily it cost one 267 ms frame at the first spawn; after the fix the worst frame in the second after a spawn is 16.7 ms).
- **Budget and cleanup:** the rocks are pinned debris (outside the 12-body throw cap). The owner's 2026-10-15 rule: they stay where they land and go once their ground chunk is unloaded AND 1.5 game hours have passed; unloaded sooner, they are frozen (taken out of the engine) and woken when the ground streams back. At most 4 slides; past that the oldest unloaded one goes. Never removed in view.
- **Debug:** backtick panel → *Physics Props (FEAT-36)* → **Rock Slide Now (FEAT-26)**: arms a slide at the next candidate ahead; parked, it releases at once at the nearest candidate within 80 m.

### Story mode (DEC-425, 2026-11-18)
- **Rule:** no slide in story outside a running requisition mission. `storySlideLines(seed, lineIds)` (src/rockslide.js) shuffles the board's lines with a seeded draw and flags the first three; each gets an arm point drawn in 0.15–0.6 of its route. `storySlideGate` arms the director while that line's mission is `running`, the truck is past the arm point, and more than 100 m of route is left. The director then uses the free-roam candidacy and timing unchanged. A release marks the line in `fired`.
- **Saved:** `fired` (the lines that have had their slide) rides the run save as `slidesFired`: run progress, so a reload or an abandon and retake neither fires a line twice nor dodges it (the save is a rolling autosave, so without it a reload just after a slide would arm it again). Which lines are flagged is never saved: it is derived from the seed on every load.
- **Route preference not built:** on 30 random seeds every one of the 150 lines reached a qualifying cut after its arm point (census below), so "prefer lines whose route passes a site" changes nothing. If a flagged line's route has no site left, it simply gets no slide.
- **Census** (wip/feat-26/story-census.mjs: the region as story builds it, the five lines planned, a kinematic driver at 20 m/s in the right lane along the route feeding the real director and gate; 30 random seeds): slides per run min 3 / median 3 / max 3 (30 of 30 runs got 3). Line routes 4.4–6.4 km (median per line). Trigger point, median metres into the mission: firewood 2170, crew 1490, signs 1290, fuel 2120, gear 1530; all lines p10/p50/p90 780 / 1630 / 3280 m (about 0.3–0.4 of the route). Other story driving: 463 ordinary offers, 1846 km, zero slides. Free roam on the same roads: 90 slides, one per 20.5 km.
- Debug: `__rockslide.lines` (flagged lines and arm fraction), `__rockslide.fired`. The debug button still forces a slide anywhere and marks no line.
- **Hits on the story slides** (wip/feat-26/story-hit.mjs: 20 of the census's flagged slides re-found in a real world, test/lib/rockslide-hit.mjs's truck held at 72 km/h in the census lane, never braking; 2 skipped, the run before the cut too short for the rig): 17 released, 5 touched the truck (29 %; face-side lane 3/9, far lane 2/8). Rock impacts landed 0.5–4.4 m/s of Δv; worst wear on a touch 57 points summed over all tracks (front armour −20 %), 2 punctures; no fatal. Bigger impacts in the log (8–19 m/s) are the test driver leaving the road at bends, not rocks.
- **By line type** (the code, not a loaded scripted run): signs and crew carry nothing, so a hit is truck wear and lost time only. Fuel: the strapped drum; a rock can strike it like any bed load. Firewood: loose bundles, which a rock or the jolt can knock out (lost bundles grade the line down). Camp gear: the Fragile crate takes the g it feels; reading the chassis's own g step by step as a stand-in, the crate broke on every touched slide, but it also broke on 3 of 12 untouched drives at bends, so that stand-in overstates it. A real loaded run is unverified.

### Slope study (test/rockslide-study.mjs; `--real` + test/rockslide-study-sum.mjs)
Real cuts, 30 random seeds, 452 km of road, 180 slides × 8 configs (per rock: lane = crossed the face-side lane centre; short = rests off the deck on the face side; over = rests past the far deck edge):

| config | rocks | lane | short | over | slides with ≥1 / ≥3 in lane | t_lane p10/p50/p90 s |
|---|---|---|---|---|---|---|
| medRock shape v0 0 | 1746 | 23 % | 62 % | 5 % | 71 % / 39 % | 3.9 / 4.8 / 6.1 |
| medRock shape v0 2 | 1674 | 28 % | 55 % | 7 % | 75 % / 47 % | 3.3 / 4.1 / 5.2 |
| medRock shape v0 4 | 1914 | 33 % | 49 % | 9 % | 83 % / 58 % | 2.8 / 3.5 / 4.5 |
| medRock shape v0 6 | 1788 | 42 % | 41 % | 12 % | 93 % / 69 % | 2.3 / 3.1 / 4.1 |
| round v0 0 | 1860 | 38 % | 44 % | 11 % | 82 % / 59 % | 3.8 / 4.5 / 5.8 |
| round v0 2 | 1920 | 42 % | 42 % | 12 % | 87 % / 68 % | 3.2 / 4.0 / 5.0 |
| round v0 4 | 1914 | 46 % | 37 % | 15 % | 92 % / 70 % | 2.7 / 3.5 / 4.6 |
| **round v0 6 (built)** | 1890 | 52 % | 32 % | 18 % | **98 % / 81 %** | 2.2 / 3.1 / 4.2 |

Along-road spread at the lane: p90 7.6–8.6 m. Arrival fit residual |t − T|: p50 0.41 s, p80 0.72 s, p90 1.0 s. Without initial speed the rocks do NOT reliably reach the road: the carve's toe sits 4–8 m out from the deck edge on every seed, and that flat run-out stops most rocks.
Every candidate toe was 4–8 m from the deck edge; by face height (round, 6 m/s): drop < 6 m 34 % of rocks reach the lane, 6–8 m 48 %, ≥ 10 m 60 %.

Planar slopes (box face meeting a flat road, deck edge 3 m past the toe, round rocks r 0.23 m; lane % and median time):

| angle | H 3 m | H 5 m | H 8 m | H 12 m |
|---|---|---|---|---|
| v0 0: 25° / 35° / 45° / 50° | 0 / 0 / 0 / 3 % | 0 / 0 / 8 / 7 % | 6 / 25 / 44 / 31 % | 14 / 57 / 60 / 63 % (10.2 / 5.8 / 4.2 / 3.6 s) |
| v0 6: 25° / 35° / 45° / 50° | 33 / 29 / 24 / 7 % | 33 / 52 / 48 / 28 % | 53 / 67 / 64 / 33 % | 69 / 72 / 83 / 83 % (5.0 / 3.5 / 2.8 / 2.4 s) |

Size (45°, 8 m, v0 0/2/4/6): r 0.15 m 31/25/27/33 %, 0.23 m 44/33/50/64 %, 0.32 m 19/40/38/65 %. Full grid: `node test/rockslide-study.mjs`.

### Candidacy census
Same 30 seeds: 255 m of candidate stations per km of road in either direction (seed range 194–317), 170 m per km per travel direction. The 20 km rate is easily met.

### What a hit does (test/rockslide-hit.mjs: real truck, the real director, held speed, never braking; 4 seeds × 3 cuts × 2 lanes)
| speed | slides | touched the truck | rock impacts landed (Δv max) | condition lost, sum of all tracks p50 / max | punctures | fatal |
|---|---|---|---|---|---|---|
| 40 km/h | 24 | 14 (58 %) | 2 (3.3 m/s) | 0.6 / 13 points | 1 | 0 |
| 60 km/h | 24 | 9 (38 %) | 9 (3.5 m/s) | 3.7 / 19 points | 3 | 0 |
| 80 km/h | 23 | 9 (39 %) | 15 (7.0 m/s) | 27 / 140 points (two wheel write-offs) | 5 | 0 |
The face-side lane is hit more often than the far lane (19/36 against 13/35). A rock never landed more than 7 m/s (16 mph) of Δv; the fatal floor is 40 mph bare (DEC-167), so a slide cannot kill outright from full health at ordinary speeds. Four 80 km/h drives crashed with no rock touching them: that is the test driver (it does not slow for curves), not the slides.

### Cost
Engine step (Box3D, real cut, node): no slide p50 0.012 ms / max 0.55 ms; 15 rocks rolling p50 0.085 / p99 0.98 / max 2.2 ms; settling p50 0.040 / p99 1.26 / max 4.9 ms. Whole physics step in the hit runs: p50 12.07 ms before → 12.03 ms during a slide. Browser frames (1280×800 headless): worst frame per second around a spawn 16.7–16.8 ms on four seeds after the boot compile.

### Before DEC-400 (kept for the record; DEC-400 and the section above win)
## ⚑ STATUS 2026-08-15 — UNBLOCKED; the substrate is on main

The dependency this ticket carried is **discharged**. FEAT-09 no longer exists as the plan: the
rigid-body core is **Box3D behind the `src/physics-engine.js` adapter seam** (FEAT-48), and dynamic
debris shipped as **FEAT-36** (`src/debris.js`, merged to main with FEAT-48). FEAT-48 is closed;
**FEAT-36 stays open** on scope this ticket does not need — `causesDamage`, world-fixture spawn,
stacking, real art — so treat its substrate as available, not its ticket as done. Read every
"FEAT-09 Phase 3" reference below as **FEAT-36 on the FEAT-48 adapter**.

**Build against the adapter, never against the engine** — no `b3*` import outside
`physics-engine.js`. That is a hard project rule, not a preference.

**What `src/debris.js` already hands this ticket for free** (do not rebuild any of it):

- Dynamic bodies with convex-hull colliders from a GLB's own vertices, density-derived mass/inertia.
- **Tumbling** — real inertia tensors; the hand-rolled solver could not do this, the engine does.
- **Rock↔terrain contact during the descent**, so rocks bounce down the slope rather than free-fall.
  The "cheaper scripted-fall then hand off to dynamic" open question below is **moot** — take the
  honest tumble.
- **Rock↔vehicle two-way coupling** carrying real momentum into the truck, gated by
  `test/debris-coupling.mjs`. Rock↔rock comes with the engine too.
- Sleeping/settling, plus a **hard count cap with oldest-reclaim** (currently 12) — the concurrent-cap
  acceptance line has a working precedent, though an event of 6–13 bodies will want its own budget
  rather than sharing the throw cap.
- Placeholder `test-rock.glb` (20 tris) to prototype against; real boulder/med-stone art is
  FEAT-06 palette work or its own ASSET ticket.

**What is genuinely left, and it is all director logic, not physics:** slope selection, release
timing / lead / intentional inaccuracy, telegraphing, event rate keyed to Highway favour, spawn-out-
of-view, and cleanup against streaming.

**Still blocked, but only in part:** "what can a hit actually do" — there is still **no wear/damage
model** (SM-3). The impulse-report seam exists (`PhysicsEngine.maxContactImpulse`, and FEAT-36's
deferred `causesDamage` flag is exactly this consumer). Build the hazard so it *shoves* now and let
damage subscribe later; do not block the ticket on SM-3.

#### Request (user)

Random rockslide events that attempt to hit the player as they drive past. Each event spawns a
batch of rocks on a higher slope above the road that tumble down toward the road, **timed to
intercept** the player's line as they drive by:

- **1–3 medium rocks** + **5–10 small rocks** per event.
- Rocks originate higher up the slope and roll/tumble down under gravity.
- Spawn/release timing is chosen to try to arrive at the road as the player crosses that stretch —
  a near-miss-or-hit ambush, not a static hazard.

#### ⚠ Story-mode consumer added 2026-08-02: this is THE HIGHWAY'S ANGER

`spirits-and-pacts.md` #05 (rebuilt 2026-08-02) ratifies that the Highway's boon has two halves —
**camber** (the engineering) and **hazard suppression** (the upkeep). Together they make his boon
*maintenance*, which is exactly and completely what a road authority does for a driver.

**The mechanism is this ticket with its event rate keyed to favour. Nothing else changes.**

- **Disfavour raises the per-distance event probability; favour lowers it.** That is the entire hook.
  It reads the day's favour; it never advances it.
- **Rocks do not persist** [owner, 2026-08-02] — *"a couple of medium rocks, not impassable… we could
  clear them and just have it be that the chance of a rockslide occurring at any random time is higher
  as disfavour with the highway grows."* So **this ticket** stays **rigid-body debris (FEAT-09), never
  carves**, and costs nothing against FEAT-52's pass-2 carve budget.

  ⚠ **This ticket is one of three Highway hazard classes, not all of them** [corrected 2026-08-02 —
  an earlier note wrongly implied the Highway's hazards were carve-free across the board]. The other
  two: **potholes**, which need no new work at all (`roadQuality` × `potholeAmplitude` is a live dial
  that already ships, `src/road-quality.js` / `src/road.js:4184`, D-03/SURF-06); and **washouts** — a
  stream crossing's causeway scoured out — which **are** carves and **do** share FEAT-52's budget. See
  `spirits-and-pacts.md` #05 "The boon, part 2".
- **⚠ HE MUST NEVER BLOCK HIMSELF.** *A road wants traffic* is the stated basis of his entire boon, so
  neglect makes the drive **worse, never impossible** — a couple of medium rocks to pick a line
  around, not a wall. Same shape as the ratified "flat is the floor, not off-camber."

  **This also kills a death spiral:** if a slide could block the road, the player would be forced
  around it → that reads as an intentional non-shortcut skip → more disfavour → more slides. It cannot
  happen if he never blocks. **Do not soften this rule for drama.**
- **Never materialise an event inside the player's view.** Spawn ahead beyond some distance, or on a
  slope above a segment not yet in frame.
- The **Trigger model** open question below is answered for this consumer: **flag-gated live-reactive**,
  same precedent as doze/ambush timing, gates pin a default `runState`.

**FEAT-27 (static rockslide)** stays available for authored one-offs but is **not** the favour
mechanism — a persistent pile needs world state the 2026-08-02 no-world-memory ruling excludes.

#### Why this links to FEAT-09

This is a **gameplay layer on top of FEAT-09 Phase 3** (dynamic debris). The rocks are exactly the
"loose object pushed/rolls when driven over, two-way coupling, rests stably, doesn't destabilize
vehicle feel" rigid bodies FEAT-09 defines — plus:
- a **spawner/director** that picks a slope + release time (the ambush logic), and
- **rock-vs-vehicle** contact carrying real momentum into the truck (impulse strong enough to
  shove / potentially roll it — the honest-physics core value), not just wheel-bump normal force.

FEAT-09 is the substrate; FEAT-26 should NOT reimplement a rigid-body system. If FEAT-26 is picked
up first, that's a signal to build FEAT-09 Phase 3 as its foundation rather than a bespoke one-off.

> **Owner ruling 2026-10-15 — cleanup.** Resting rocks stay where they land and despawn once their
> chunk is unloaded and an hour or two of game time has passed. Same rule as dead deer (FEAT-111).

#### Open questions (scope in plan mode when picked up)

- **Trigger model.** Fully random along any qualifying slope, or seeded/deterministic like the rest
  of worldgen? Ambush timing that reacts to live player position is inherently non-deterministic —
  decide whether that breaks replay/gate determinism and, if so, gate it behind a runtime flag so
  headless gates stay deterministic (cf. FEAT-09 "Determinism" risk).
- **Slope selection.** Need a source slope above the road with enough height/steepness for a
  believable tumble. Reuse road-carve grade data / terrain sampling to find a qualifying uphill
  face adjacent to the current road stretch? Min grade + min vertical drop thresholds.
- **Release timing / aiming.** Estimate player arrival at the impact stretch from current speed +
  centerline arc distance, then back-solve release time from rock fall/roll time. How much "lead"
  and how much intentional inaccuracy (it should threaten, not guarantee a kill — mostly near-miss).
- **Rock physics fidelity.** Full FEAT-09 tumbling rigid bodies, or a cheaper scripted-fall-until-
  near-road → hand-off-to-dynamic approximation for the long descent? Bounded cost — an event is
  6–13 bodies; cap concurrent events.
- **Rock-vs-vehicle impact.** What can a hit actually do — nudge, spin, roll, damage (no damage
  model exists yet)? Medium rock momentum vs the Ranger's mass: tune so a direct medium hit is
  genuinely dangerous but a small rock is a thud.
- **Rock-vs-terrain during descent.** Do rocks collide/bounce off the slope on the way down
  (needs terrain contact source in the broad-phase) or free-fall then land? Bouncing reads far
  better but costs the rock↔terrain narrow-phase.
- **Cleanup / lifecycle.** Rocks that come to rest on/beside the road — despawn on stream-out,
  linger as static debris (become FEAT-09 Phase 2 static contacts), or fade? Avoid unbounded
  accumulation.
- **Telegraphing.** Any warning (dust, sound, small pebbles first) so it's a dodgeable event and
  not an unfair instakill? Design/feel call.

#### Acceptance (when picked up)

- (old) An event spawns 1–3 medium + 5–10 small rocks on a qualifying slope above the current road.
- (old) Rocks tumble down under gravity and interact with the vehicle via the FEAT-09 dynamic-debris
      contact path (two-way coupling; a hit imparts real momentum to the truck).
- (old) Release timing meaningfully attempts to intercept the player (hits/near-misses happen when
      driving through; a stationary/very-slow player is not perfectly tracked — it's an ambush of a
      passing car).
- (old) Concurrent-event and per-event body counts are capped; rocks clean up on stream-out.
- (old) Determinism story resolved: either seeded, or the live-tracking event is flag-gated so
      headless road/physics gates stay green and deterministic.
- (old) Vehicle feel not destabilized when no event is active (rainy-day physics asserts green).

## Tracker
- [x] Slope study: planar 25–50° and real cuts on 30 seeds; thresholds, arrival model, the v0 answer (in Description)
- [x] Candidacy computed at runtime from road + ground; census 255 m/km
- [x] Director: memoryless rate (mean 20 km), timed release, holds when slow, drops the pick on a turn-off; own budget; cleanup per the owner's rule
- [x] 0.5 s alpha-hashed fade, shader compiled at boot
- [x] A hit through the contact → damage path; no fatal at 40–80 km/h
- [x] Debug trigger (Physics Props folder) + smoke step
- [x] Gates: rockslide-director (pure), rockslide-physics (real cuts, 7/8 on time)
- [x] Owner drive (2026-11-18): "it works amazing. def merge" (DEC-425)
- [x] DEC-425: story slides only on three seeded requisition lines, one each; `fired` in the run save; gate §7
- [x] Story census on 30 seeds: 3 slides every run; zero in 1846 km of other story driving; free roam one per 20.5 km
- [ ] Owner: the story drive (card `feat26-rockslides-story-drive`)
- [ ] Rock art (ASSET ticket owed if the blob is not enough) · a slide sound (FEAT-120)

## Decisions
- 2026-10-15, owner: "Resting rocks stay where they land and despawn once their chunk is unloaded and an hour or two of game time has passed. Same rule as dead deer (FEAT-111)." Built with 1.5 h.
- 2026-11-17, owner (DEC-400): rock slides in the alpha, no spirit ties; visible approach, steep side slope, timed to hit, 5–15 rocks in a 3 m patch, optional slope-aligned velocity, 0.5 s fade, about once per 20 km.
- 2026-11-18, owner (DEC-425): "it works amazing. def merge. in story mode we only want rockslides during the expedition camp missions. ~3 slides in the whole run. maybe just quietly flag 3 of the exped missions to trigger them or something." Free roam keeps DEC-400's rate (the old card's question: not answered, stays as built). Round rocks and 1.5 h cleanup stay as built (not answered).

## Open questions
- The rocks are hard to see from 40 m out on the chase camera (the sheet). Left as is; open.

## Links
DEC-400 · owed card `feat26-rockslides-drive` · sheet `wip/feat-26/sheet.jpg` (git-invisible, lane worktree)

## Files
`src/rockslide.js` · `src/debris.js` (code-built templates, shared material, setEnabled) · `src/main.js` · `src/debug.js` · `test/rockslide-director.mjs` · `test/rockslide-physics.mjs` · `test/rockslide-study.mjs` · `test/rockslide-study-sum.mjs` · `test/rockslide-hit.mjs` · `test/lib/rockslide-real.mjs` · `test/lib/rockslide-hit.mjs` · `test/cdp-smoke.mjs` (rockslide step)

## Log
- 2026-11-17: built on `land/feat-26-rockslides`. Affected gates 22/22 green (serial); smoke `SMOKE_STEPS=boot,rockslide` PASS, zero console errors, truck touched on slide 1. Fingerprints: neither harness imports debris.js, rockslide.js or main.js, so physics/world identity holds by construction (not re-run against main).
- Unverified: trees in the sight line; a slide while the truck is reversing; behaviour at a crossing where the truck changes run mid-approach (the pick is dropped).
- 2026-11-18: main merged in (no conflicts). DEC-425 built (story gate, `fired` in the run save, gate §7); the smoke's rockslide step now re-seats the truck at its boot pose (it had left it among the rocks and failed `drive`). Affected gates 22/22 green (serial); full smoke PASS 39 steps (load 9.95 at start); physics fingerprint identical to main. Slide rocks carry no FEAT-268 crush strength (Infinity): they never crush.
- Unverified: a hit with the real loads aboard (firewood bundles, the strapped drum, the Fragile crate's strap); a slide in the browser on a real requisition drive (the census is headless and kinematic).

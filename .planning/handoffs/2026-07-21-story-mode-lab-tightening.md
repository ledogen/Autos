# Handoff — tightening story mode + the testing lab

**Written 2026-07-21** at the end of the session that built FEAT-29 (par oracle), FEAT-31 (testing
lab), and most of FEAT-30 (par calibration). Everything below is on `main`, **unpushed** — 16
commits from `b4b5899` to `cd3a59c`.

Read `.planning/story-mode/DESIGN.md` first. Its invariants override any ticket, including
everything here.

---

## 1. What exists now

| file | role |
|---|---|
| `src/par.js` | FEAT-29 par oracle. `computePar(segments, ref)` over **arc ranges**, `PAR_REF`, `gradeRun`, `formatTime`. Pure math, no THREE/DOM. |
| `src/mission.js` | `MissionSystem` — planner, state machine, `exportRun()`, `headingToFace()`. |
| `src/lab.js` | `LabSystem` — flat testing world, drag strip, braking, 3 skidpads, 3 rumble lanes, `rumbleSurface()`. |
| `src/road.js` | seams: `networkGraph()`, `edgeParData()`, `warmBandComplete()`. |
| `src/main.js` | wiring: `enterLab`/`exitLab`, `_plannerWarm`/`_startPlannerWarm`, `makePlanner`, `_renderMissionUI`, `_renderLabUI`, seed field. |
| `runs/` | versioned run library + `lab-baselines.json`. `npm run runs:add` / `runs:report`. |
| `test/bake-route-bundle.mjs` | regenerates `data/route-cache-default.json.gz`. **Committed on purpose** — it used to live in a scratchpad, which is why the asset kept drifting. |
| `test/measure-vehicle-limits.mjs` | headless vehicle envelope (no AI driver). |

**Gates:** `par-oracle` (fast), `mission-network` (heavy), `lab-timing` (fast),
`route-bundle-parity` (heavy). `npm test` selects ~23 gates when road.js changes (~165 s wall).

---

## 2. Landmines — read before touching anything

These all shipped as real bugs this session. Each was invisible in review.

1. **Heading convention.** `_seatOnGroundPlane` puts the front axle at body-local −Z, so a truck
   seated at `h` faces **`(−sin h, −cos h)`**. To face a tangent `(tx, tz)` you need
   `atan2(−tx, −tz)`. Missions shipped with `atan2(tx, tz)` and spawned **every** player backwards.
   Use `headingToFace()` in mission.js. Pinned in `par-oracle`.
2. **Never plan on raw Urquhart.** `_streamNetwork` = `_assembleGraphEdges` **then** `_cullNetwork`.
   The world is Urquhart *minus* the cull; ~15% of nearby raw edges do not exist. Use
   `RoadSystem.networkGraph()` (post-cull registered network). `missionGraph()` was deleted for
   being a plausibly-named footgun. Pinned in `mission-network`.
3. **`edgeParData` must return the REGISTERED key.** Edges are stored under whichever endpoint order
   was seen first, and `roadQuality` **hashes** the runKey — the reversed spelling silently yields a
   different surface-quality series for the same tarmac. Pinned in `mission-network`.
4. **`smoothstep(e0, e1, x)` with `e1 < e0` is a legal descending edge.** An `if (e1 <= e0) return`
   guard silently flattened every rumble lane to zero. Only `e0 === e1` needs guarding.
5. **Mesh must sample the same analytic function physics uses.** `rumbleSurface()` is read by both.
   Also watch *tessellation*: a drifting sample grid clipped the med lane's crests to 93% of spec,
   and 4 uniform z-rows interpolated a 25 cm feather across 1.5 m. Lanes are whole-crest with
   non-uniform z rows for this reason.
6. **`RoadSystem.update()` needs a real `THREE.Vector3`** (it calls `distanceTo`). mission.js is
   deliberately THREE-free, so main.js owns the streaming call.
7. **Bake rings must derive from `MISSION_PLAN_RADIUS`.** A stale literal above it silently shipped a
   bigger network than the game asks for.
8. **Rebake + re-run `route-bundle-parity` after any router or road-param change**, in the same
   commit. The sig covers params but cannot see router code changes.
9. **`par.js` may never read a vehicle quantity** (SM-INV-2). `par-oracle` asserts par is
   bit-identical after mutating all 181 `RANGER_PARAMS`.

---

## 3. Known clunkiness — the actual worklist

### Story mode

| # | issue | notes |
|---|---|---|
| S1 | **Non-default seeds are slow.** The bundle only covers seed 6. Other seeds fall back to a blocking cold path (~15-20 s) until the background warm finishes, with **no progress UI**. | Highest-value fix. Either surface warm progress, or block story-mode entry behind a real progress bar instead of a frozen frame. |
| S2 | **`_applyStorySeed` guesses with `setTimeout(2500)`** that the world rebuild is done. Fragile. | Should be event-driven off the rebuild completing. |
| S3 | **Cold open still ~0.6–0.76 s**; 0.19 s a few seconds later. Residual is the bundle fetch racing the click. | Could await the bundle load before allowing entry. |
| S4 | **Bundle is 3.64 MB gzipped** and only helps one seed. | Real download cost for a web game. Worth checking whether solo entries or float precision can be trimmed. |
| S5 | **`distanceToGo` is crow-flies.** On a winding route it *increases* while you drive correctly. | Remaining arc length along the planned route would be honest. It also made my own verification test useless once. |
| S6 | **Arrival is a 28 m radius** with no check you got there via the road. | You can cut across country and still complete. |
| S7 | **Planner re-streams on 700 m drift**, throttled 20 s. Driving a 5 km mission crosses that repeatedly. | Audit for thrash; the warm is worker traffic but not free. |
| S8 | **`regenerate` is a testing affordance.** DESIGN.md: real story mode has **no do-overs**. | Must not survive into shipped story mode. |
| S9 | Seed field has **no validation feedback** for a bad seed. | |
| S10 | Export gives only a button-label change as confirmation. | Easy to double-export or think it failed. |
| S11 | `runs:report`'s expected-ratio table (`very_fast 0.82 … very_slow 1.25`) is **a guess**. | It is the axis everything is fitted against — worth deriving rather than assuming. |

### Lab

| # | issue | notes |
|---|---|---|
| L1 | **No grade test.** Par's `g·sinθ` term is unvalidated against a human. The lab floor is flat; the D-19 ramp is present but **untimed**. | Listed as a follow-up in the FEAT-31 ticket. |
| L2 | **Skidpad gives no live feedback** — you eyeball the ring, and only learn the lap time afterwards. | A live radius/speed readout would make limit-finding far less fiddly. |
| L3 | **Distance posts have no numerals** (no font atlas). You count posts. | Works, but it is a workaround. |
| L4 | Lab panel shows **best-only**; no per-run history surface, though `LabSystem.results()` keeps 12. | |
| L5 | **`measure-vehicle-limits` is a LOWER bound on cornering**, not a ceiling. Its settled-trim test (radius drift <12%, speed held <12%) rejects the ragged, throttle-steered line a human actually corners on — humans beat it by 15-25%. | A smarter trim search would make it a real reference. See §5. |
| L6 | Braking test arms on brake input above ~97 km/h. There is **no in-world feedback** that a run armed. | |

### Cross-cutting

- **BUG-25 watch.** The crossing cull is window-sensitive in principle. I verified edge sets are
  strictly nested (`play ⊂ map ⊂ planner`) at *one* centre, and that drop-point roads survive a
  play-sized re-stream (8/8). **Not proven globally.**
- Gates are heavy: a road.js touch selects 23 gates, ~165 s wall.

---

## 4. FEAT-30 (par calibration) is the open ticket

`PAR_REF` is currently `mu 0.62 / accel 2.8 / brake 5.5 / vMax 28 (flat terminal) / vCeil 46`.

**`mu 0.62` is provisional** = human skidpad ≈0.73 × 0.85. The 0.85 is a guess and is *the* number
still missing.

**The hard problem, and it is not a small one:** the skill spread is enormous and **non-uniform**.
From `runs/lab-baselines.json`:

| radius | expert | novice | ratio |
|---|---|---|---|
| 25 m | μ 0.743 | μ 0.708 | 1.05× |
| 60 m | μ 0.724 | μ 0.220 | 3.3× |
| 150 m | μ 0.647* | μ 0.225 | 2.9× |

\* power-limited, excluded from grip fits.

At tight radii both drivers sit near the truck's limit; at medium/large radii they differ by 3×.
**A single `k` cannot serve both.** Caveat recorded in that file: the novice's large-pad laps are
almost certainly not limit laps (they lapped the 25 m pad *faster in absolute speed* than the 60 m
pad), so μ 0.220/0.225 is a floor on effort, not a grip ceiling.

Method: drive missions → the result card's felt prompt → `npm run runs:add` → `npm run runs:report`.
The report correlates the residual against descent fraction (grade/drag), curvature (μ), and
straight fraction (accel/vMax/drag) to say *which* knob is wrong.

---

## 5. Measurements already taken — do not redo these

- **Routing is ~99% of the cost of building a network.** Cold 2200 m stream 19.5 s; identical stream
  with the route cache populated **0.21 s**. This single fact drove the whole caching design.
- **Planner coverage vs radius** (default spawn): 1200 → 4.0×3.6 km (38 edges) · **1400 → 4.6×4.2 km
  (49)** · 1800 → 5.6×4.8 km (74) · 2200 → 6.3×6.2 km (94).
- **Geometry is free at lab scale.** 6→48 samples/crest took 43 k → 309 k triangles with **no**
  measurable frame-time change (dt p50 16.6→16.6 ms, vsync-locked). The budget to guard is
  terrain/props at world scale (PERF-22), not the lab.
- **Stock truck envelope** (headless): 0–100 9.48 s · 400 m 16.98 s · vMax 46.3 m/s · braking
  7.04 m/s² · skidpad μ 0.51–0.66 across R 8–103 m, mean 0.577.
- **Lab vs headless agree** to 2–4% (400 m, 0–100, braking decel), which is what makes the headless
  numbers usable at all.
- **Grade response after the drag-balance fix:** 1500 m straight at −15% is 14.6% faster than flat,
  +15% is 40.9% slower, peak 124 km/h downhill vs 101 flat. Corner-limited sections stay
  grade-neutral — correct, grip not gravity sets corner speed.
- **Rumble physics response** (body Y peak-to-peak): strip 0.009 m · small 0.022 · med 0.074 ·
  large 0.144.
- **Story-mode open latency:** 14.8 s → 3.0 s → **0.63–0.76 s** cold, 0.19 s at T+3, regenerate
  0.15–0.3 s. `_proto.cls` plateaus at 153 within 2 s (it used to climb 86 → 262 over 25 s).

---

## 6. Design constraints that will bite

- **SM-INV-2** — par never scales with the car. Tune `PAR_REF`, never the vehicle. A *frozen* model
  fitted once offline is legal; one that keeps learning from player drives is not (it would encode
  whatever truck they were in, and par would scale with the car through the back door).
- **SM-INV-3** — par is never a countdown. The in-run HUD shows elapsed + distance only; par appears
  in the result card.
- **SM-INV-4** — payout is margin against par; bare completion pays ~nothing.
- **"Where missions and POIs live"** (ratified 2026-07-20) — endpoints are arbitrary `(edge, arcS)`
  points, **never** snapped to graph nodes. Par integrates over arc ranges; path search splices
  endpoints in; arrival is a radius on a point.
- Grid world (D-18/D-19) is **deleted**. The lab replaced it. The ramp survived as a lab feature.

---

## 7. Where the data lives

- `runs/` — mission exports (`rangersim-run-export/2`: full 2 m topology + 10 Hz driven trace +
  `felt` label + `driver`). `runs/README.md` documents the schema.
- `runs/lab-baselines.json` — expert vs novice lab results + the headless reference.
- Tickets: `.planning/todos/pending/feat-par-calibration.md` (FEAT-30) is the live one.
  FEAT-29 and FEAT-31 are in `completed/` with full resolutions.

---

## 8. Suggested order of attack

1. **S1** (non-default seed load + progress UI) — the biggest felt clunkiness.
2. **S5/S6** (distance-to-go and arrival honesty) — cheap, and S5 actively misleads.
3. **L2** (live skidpad feedback) — unblocks better calibration data, which unblocks FEAT-30.
4. **L5** (make the headless harness a real reference rather than a lower bound).
5. **FEAT-30 itself** — but only once there are enough felt-labelled runs, and with eyes open about
   the non-uniform skill spread in §4.

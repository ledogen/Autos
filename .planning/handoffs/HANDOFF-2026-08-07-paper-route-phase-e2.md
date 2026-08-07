# HANDOFF — FEAT-61 paper route, Phase E part 2 onward — 2026-08-07

**Read `.planning/todos/pending/feat-paper-route.md` first — it is the spec.** This handoff is the
state of play and the next moves. The original approved plan is
`.planning/handoffs/HANDOFF-2026-08-04-paper-route.md`, partly superseded (its header says how).

## Where the work lives

- **Worktree** `/Users/ledogen/CodeShit/CarGame-paper-route`, branch **`feature/paper-route`**.
  `node_modules` installed. Dev server: `npm run dev -- --port 3661 --strictPort`.
- **`feature/poi-models` (FEAT-60) is merged into this branch** and is NOT on main. Merging this
  branch back therefore delivers both. That was deliberate — both features touch `src/poi.js`
  generation, and doing it first meant building the roster and the house pass together instead of
  reconciling them afterwards.
- Gates: `npm test` (affected) / `npm run test:all` (46, last full run green).

## What is built

| Phase | Commit | |
|---|---|---|
| A — docs | `c95a2cc` | deadline + accuracy axis amendments in `missions.md` |
| B — dialogue | `8624861` | `src/dialogue.js`, `data/dialogue.js`, the card |
| C — houses | `39e433c` | 15 customers, POI `tags`, target rings |
| D — throw | `07a073d` | `src/throw.js`, aim seam in `camera.js` |
| E part 1 | `e99fe1e` | `src/paper-route.js` scoring + `test/paper-route.mjs` |
| fixes | `5140ef3` `2a60806` `2806ea5` `7a5bab0` `fa43509` | see below |

**Owner-verified live:** the dialogue card, the throw, the rings, ring suppression, map markers.

**Gate-verified only (55 checks in `test/paper-route.mjs`):** all scoring algebra and ballistics.

## Phase E part 2 — the mission itself

Everything below is unbuilt. The scoring core is done and pinned; this is the machine around it.

1. **`src/paper-route.js` grows a `PaperRouteSystem`** — `idle → offer → briefing → running → done`.
   A **sibling** of `MissionSystem`, not a mode inside it: `src/mission.js` is ~870 lines shaped
   end-to-end around one start and one end, and four gates pin its settle path.
2. **The tour and its par.** Nearest-neighbour tour from Larry over `poiSystem.customers()`; legs via
   `mission.js`'s graph adjacency + Dijkstra (`legCandidates`, ~line 670); concatenate the segments
   and call `computePar()` **once** over the whole thing (SM-INV-2 — one par, one oracle).
   - Ruled: **assume it is expensive and hold the briefing cards until routing completes.** The
     player reads two cards while it runs, which is free cover.
   - `mission.js`'s `MAX_EDGES = 9` cap is a Quick Job constraint and does not apply to a 15-stop
     tour. Measure before trusting it.
3. **Wire the throw to the route.** `_throwRoll()` currently scores against the *nearest* customer
   and prints the distance — that was Phase D's proof that the rings and the ballistics agree. It
   needs to consume stock, credit a specific customer **once**, and end the route on the bell or the
   last paper. `stockForTier()` and `deadlineFor()` are ready.
4. **Result card + tier advance**, settling through `EconomySystem.settleFlat(payout, letter)` and
   `advancesTier(result, customers)`.

## Phase F — housekeeping

- **`test/paper-houses.mjs`** (heavy, live `RoadSystem`): count met, window-invariance from two
  stream centres, never on water or a junction pad, tier does not change what exists (SM-INV-12),
  and **houses absent from `poiSystem.list()`**. All of these were verified by hand during Phase C
  but are not yet a gate. Register it in `test/gates.mjs` beside `paper-route.mjs`.
- **Debug folder** for `PAPER_PARAMS`, `THROW_PARAMS` (`throwSpeed`, `dragK`) and the `poiHouse*`
  knobs. None are on sliders — the phase-housekeeping rule says they should be.
- **MILESTONES SM-2 paragraph** — update when the mission actually runs.
- **`_clearThrownRolls()`** is wired to region exit only; it should also fire at route end.

## Gotchas found the hard way — do not re-derive these

- **`sampleRoadTopY` is the graded APRON sampler, not a ground query.** It extrapolates the road-top
  plane sideways and returns a finite Y almost everywhere out to ~35 m from the centerline. Measured
  on seed 6 it is **4–13 m** off the real surface in the 10–20 m lateral band — which is exactly
  where the houses sit. Anything asking "what is the ground here" away from the asphalt wants
  `terrain.analyticHeight` (the road-CARVED surface, earthwork included). `camp.js` ~line 361
  carries the same warning; `_throwGroundY` in `main.js` is the fixed pattern.
- **`analyticHeight` is `roadClearanceMargin` (~0.15–0.25 m) BELOW the asphalt** on the ribbon, so
  anything resting on the road needs the one-shot correction `_resolveLanding` does. The honest
  "am I on asphalt" test is `queryNearest` + `lateral <= roadHalfWidth`, ~25 µs — fine once, a
  dropped frame if run per integration step.
- **Only 8 viable lay-by PADS exist inside 1 km on seed 6** (43 region-wide), two of which FEAT-60
  spends on mom and Larry. This is why customers are roadside targets with no pad, no earthwork and
  no `setPoiPads` entry — and therefore zero contact with the carve.
- **The house ring relaxes to ~1.24 km**, not the ruled 1 km: only 10 viable sites exist inside 1 km,
  19 inside 1.25 km. Count is hard, distance relaxes (FEAT-60's rule). Tightening `poiHouseSpacing`
  to ~50 m would force 15 inside 1 km but reads suburban on a rural road.
- **`poiHouseLat` and `poiHouseTargetR` are coupled** — the offset exists so a paper landing on the
  tarmac cannot score. The gate pins `lat − R > shoulder edge`; nothing else does.
- **A look-drag may only start on the render canvas** (`camera.js` mousedown). It takes a pointer
  lock now, so any looser test makes overlays unclickable — that regression already happened once.

## Open questions for the owner

- **`FLAT`'s `paperW = 0.6`** and the bonus/rank constants (`EXPEDITE_ON/FULL`, `BONUS_MAX`, rank
  thresholds) are all proposals, unbalanced against real play.
- **`throwSpeed = 16` m/s and `dragK = 0.033`** give ~22 m of range at 12 m/s driving. Feel-tuned by
  one drive, not calibrated.
- Whether the ring should hard-stop at 1 km (see above).

## Loose end outside this worktree

The FEAT-61 ticket amendments written in **main's checkout** on 2026-08-05 are still uncommitted
there and are superseded by this branch's copy. Merging back will conflict on that one planning file;
take this branch's version. Nothing else diverges.

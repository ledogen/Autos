# HANDOFF — FEAT-61 paper route, Phase E part 2 onward — 2026-08-07

> **SUPERSEDED 2026-08-11** by `HANDOFF-2026-08-11-paper-route-playable.md` — the mission is built
> and driven. Everything below is history except the **gotchas** section, which is still accurate and
> still worth reading before touching this code.
>
> **SUPERSEDED IN PART, later the same day.** Phase E part 2 is built — see the ticket's "Phase E
> part 2 — what landed". Still live here: the gotchas, the open questions on the tuning constants,
> and Phase F. Two of this document's assumptions were measured and found wrong: **tour routing is
> 1–4 ms**, not expensive (the region's edges are already routed), and **a tour stop is a STREET,
> not a graph node** (a node-based tour left five of six customers never approached). The real
> problem turned out to be customer SUPPLY — **BUG-44**, which needs an owner ruling before the tier
> ladder means anything.

**Read `.planning/todos/pending/feat-paper-route.md` first — it is the spec.** This handoff is the
state of play and the next moves. The original approved plan is
`.planning/handoffs/HANDOFF-2026-08-04-paper-route.md`, partly superseded (its header says how).

> **Revised 2026-08-07, later the same day.** Everything through Phase E part 1 is now **merged to
> `main` and pushed** — the section below has changed the most, so re-read it even if you saw the
> morning version.

## Where the work lives

- **Worktree** `/Users/ledogen/CodeShit/CarGame-paper-route`, branch **`feature/paper-route`**.
  `node_modules` installed. Dev server: `npm run dev -- --port 3661 --strictPort`.
- **`feature/paper-route` and `main` are identical** at `37489ef`. The branch was merged to main as
  a fast-forward and then fast-forwarded back, so there is no divergence to reconcile and no merge
  commit between them.
- **Keep Phase E2 on the branch.** `main` auto-deploys to GitHub Pages on every push
  (`.github/workflows/deploy.yml`, `on: push: branches: [main]`), so work-in-progress on main goes
  live. The branch costs nothing now that it tracks main exactly.
- Gates: `npm test` (affected) / `npm run test:all` (46, green at `37489ef`).

## What is built — all of it now on main

| Phase | Commit | |
|---|---|---|
| A — docs | `c95a2cc` | deadline + accuracy axis amendments in `missions.md` |
| B — dialogue | `8624861` | `src/dialogue.js`, `data/dialogue.js`, the card |
| C — houses | `39e433c` | 15 customers, POI `tags`, target rings |
| D — throw | `07a073d` | `src/throw.js`, aim seam in `camera.js` |
| E part 1 | `e99fe1e` | `src/paper-route.js` scoring + `test/paper-route.mjs` |
| fixes | `5140ef3` `2a60806` `2806ea5` `7a5bab0` `fa43509` | see the gotchas below |
| FEAT-60 merge | `b93643c` | poi-models folded in — three conflicts, resolved as recorded below |

**Owner-verified live:** the dialogue card, the throw, the rings, ring suppression, map markers.

**Gate-verified only (55 checks in `test/paper-route.mjs`):** all scoring algebra and ballistics.

**Deployed:** the live Pages build now contains the houses, rings, dialogue and throw with **no
mission to start them** — a player can throw a paper at a house and nothing happens. That is Phase
E2's absence, not a bug.

## What changed around the feature on 2026-08-07

None of this is FEAT-61 code, but all of it changes assumptions the morning's handoff made:

- **FEAT-60 is closed** (`.planning/todos/completed/feat-poi-models.md`, with a resolution note).
  The `feature/poi-models` branch and its worktree are **deleted** — fully merged, nothing unique.
  Its old dev server on `:3914` is gone with it.
- **BUG-42 was minted twice**, in worktrees that could not see each other. Owner ruled:
  **BUG-42 = the junction-legs bug** (deg-3 junction on the map, dead end in the world);
  **BUG-43 = the material-sharing bug**, renumbered. Do not re-file either under the other number.
- **BUG-43 blocks the recolour convention** and touches this feature directly: `spawnModel()`
  returns `template.clone(true)`, and `Object3D.clone()` shares **materials by reference**, so every
  instance of a registry key points at one `THREE.Material` set. FEAT-60 spawns `trailerHomeA` for
  both mom's and Larry's houses — recolouring one recolours both. ASSET-21's recolour acceptance box
  is unticked and blocked on it.
- **`ART-STYLE.md` exists** (`.planning/research/`) and CLAUDE.md points at it — read before
  modelling anything.
- **The FEAT-61 ticket loose end is resolved.** Main's uncommitted older copy was confirmed
  superseded (diffed line by line — same rulings, looser wording) and discarded; the branch's copy
  is the one on main. There is nothing left to reconcile.

### Merge decisions a future session must not casually undo

The FEAT-60 merge had three conflicts. Two of the resolutions look like deletions and are not:

- **`getMomsHouse` stays deleted.** FEAT-60 removed that channel deliberately — mom arrives through
  `getPois()` now. Resurrecting it re-creates the two-mom's-houses bug (`c5e9cab`): FEAT-45 pinned
  her to the region centre while the roster sited a real one hundreds of metres away, so the pink
  pin and the building were different places.
- **The map legend stays gone** (`84ef695` — dropped in favour of the scale bar). FEAT-61's "paper
  customer" legend row went with it. The green customer dots still draw, *under* the roster glyphs,
  which is what lets mom read as a landmark and a customer at once. Re-adding a legend is a new
  decision, not a merge repair.
- **`poi.js` carries both `jobs` and `tags`** — orthogonal. `jobs` = does parking here open an
  offer; `tags` = what this POI participates in.

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
5. **Flip Larry's `jobs` to true.** `POI_ROSTER` marks him `jobs: false` today with a comment naming
   this phase as the one that earns the change — FEAT-60's rule is that a marker must not wear the
   "park here for a job" ring until its mechanic can answer. E2 is that mechanic.

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
- Whether the house ring should hard-stop at 1 km (see above).
- Whether the customers want a map label now that the legend is gone.

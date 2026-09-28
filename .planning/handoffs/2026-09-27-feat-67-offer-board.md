# Handoff — FEAT-67 mission board (2026-09-27)

**Worktree:** `/Users/ledogen/CodeShit/CarGame-feat-67` · **branch:** `feature/feat-67` (off main `c5212f2`).
Do ALL work inside the worktree (absolute paths, `git -C`). Preview server not started yet — start it
at Phase C: `bash ~/.claude/skills/worktree/scripts/wt.sh serve feat-67`.

**State:** planning is DONE and owner-signed. No product code is written. The branch holds the
refined ticket, the FEAT-87 split, the owner's name lists, and design-doc amendments.

## Read first (in this order)

1. `.planning/todos/pending/feat-67-visible-offer-board.md` — **the spec. Every ruling is binding.**
   The "Rulings 2026-09-26 (plan review)" section and the offer-model section carry the late changes.
2. `data/offers.js`, `data/offer-names.js` — the content tables the generator consumes. The owner
   authors these lists; code supplies grammar and seeded picks. Don't rewrite the owner's words.
3. `.planning/todos/pending/feat-87-live-rank-timer.md` — NOT this ticket. Don't build it here.
4. CLAUDE.md "Communicating with the owner" — the owner is an engineer, not a programmer: gloss
   JS/browser/CS terms inline in one clause, never simplify physics/maths.

## Rulings in one screen (details in the ticket)

- Hover a source POI on the story map → one offer card + that offer's route. **Q/E cycle** offers.
  Only one route drawn at a time. Timer under each source = shortest time until a slot turns over.
- Card: `Deb at <POI> needs <thing> delivered to <place>` · **Base pay $X** (payout at par, ratio
  1.00; label "Base pay") · km · **kg** · expiry · `Bonus: <item> — <gate> or better`. No
  player→POI drive time. Freight (NOT built) = flat-pay variant, blue — card must support it.
- **Slots** per source (`SOURCES`), every slot always full; expiry ±30 %; slots desynchronised at
  world start (random age uniform over the rolled lifetime). All timers on the **game clock**.
- **After completion:** the offer's original expiry keeps running; slot stays empty until it ends,
  then re-rolls (completed after expiry → re-roll at completion). **No 12–24 h recycle** (retired).
- **After cancel:** slot locks for the offer's full expiry length L from the moment of cancel
  (`nowH + L`). Cancel is an explicit button only ("call the customer"); leaving the route/region
  never cancels; pause-menu exits end the run, they are not cancels. (Owner ruling 2026-09-27,
  settles questions 1 and 3 below.)
- Accept only by driving to the POI and parking. **One active mission at a time.** Terms lock at accept.
- Bonus: 25 % of offers; gates C/B/A/S equally likely; "X or better"; **D never earns**; bonus
  offers pay **0.5×** cash (`BONUS_PAY_MULT`, a multiplier on the whole curve → still continuous).
  Grant is **stubbed** — record only.
- Destinations 50 % POI / 50 % roadside (`LANDMARKS` or `the <last> <place noun>`).
- People per POI: 1 / 2 / 3 at 0.75 / 0.20 / 0.05. Sex rolled first (male/female lists) — will
  later pick the portrait pool.
- `burgerJoint` = ANY food vendor, gig delivery (not staff) — opening.md amended. Delivery only.
- Larry: just "Larry", papers only, one slot, empties like everyone else. **Income floor = the
  board itself** — missions.md amended.
- Only **diamonds** (missionGiver) take family colour: delivery green, fragile orange, papers white,
  demolition red, freight blue. Glyph POIs keep their colour. Empty/locked diamond = grey.
- Larry's glyph → `NEWSPAPER`; paper customers off-route → small white diamonds.
- Giver naming by model: flag each `missionGiver`-tagged model in `data/prop-models.js` — home
  models get "the Hadley place", others (RV, broken-down car, future hitchhiker) just the person.
- Completion = any settled result, D included. Same seed → same board. Hovering an offer mid-mission
  temporarily replaces the drawn route.

## Resolve with the owner BEFORE Phase A code (each has a proposed default)

1. ~~Abandon hole at R ≈ 0.~~ **SETTLED 2026-09-27:** lockout = full lifetime L from cancel.
2. ~~Larry can paper twice in a day.~~ **SETTLED 2026-09-27:** per-source `minEmptyH` in `SOURCES`
   (Larry 24, others 0) — a slot never re-rolls sooner than that after a completion.
3. ~~What counts as "abandon"?~~ **SETTLED 2026-09-27:** only the cancel button. Phase A adds
   it (delivery + paper round); `board.abandon` has that one caller.
4. ~~Giver-model naming.~~ **SETTLED 2026-09-27:** `giverName: 'home' | 'person'` — trailer home →
   'home' ("the Hadley place"); Winnebago + broken car → 'person', **just the name** ("Earl").

## Code map (verified 2026-09-26 by a read-only planning pass; re-check line numbers)

- `src/mission.js` — `_offers` Map keyed `${poiId}|${day}` (`:190-196`), `enterFromPoi`
  (`:224-249`), accept deletes it (`:291`), `_roll` (`:563-784`: `buildGraphAdj` → straight-line
  Dijkstra `legCandidates` LEG 1500–4000 m, MAX_EDGES 9 → `edgeParData` → `computePar`), end is
  ALWAYS a random mid-edge point (`:695-698`); all randomness is `Math.random` (`:634-696`).
  Terms freeze at `:289`; settle `:481-500`; `PAID_JOB_DO_OVERS=false` (`:70`); staging /
  `START_ZONE_R` (`:64, 340-343`).
- `src/economy.js` — `payoutFor` (`:196-201`), `settle` rounds (`:298`), `terms()` (`:276-288`).
  **Must import nothing** (pinned by `test/economy.mjs`). Base pay =
  `Math.round(payoutFor(par, 1, terms.payTier))` (× `BONUS_PAY_MULT` when bonused).
- `src/poi.js` — ids `poi:${ka}|${kb}` (`:277`); `jobs` flag hand-set in `POI_ROSTER`
  (`:164-197`), drives park trigger + orange rings; roster = Larry, Mom, 2 gas, 2 service,
  1 burger, 1 store, 1 tackle, 5 missionGiver.
- `src/paper-route.js` — `open(giver)` (`:963`, `planTour` ~120 ms), `accept` (`:1013`), `finish`
  → `settleFlat` (`:1379`). Park branch in `main.js:3258`.
- `src/day.js` — `_hour` + `runState.day` (`:97-174`); `sleep`/`advanceMinutes` (`:246-312`).
  **No absolute clock accessor** — add `clockH() = (day−1)·24 + _hour`. 1 game-h = 60 s real.
- `src/map2d.js` — draw order `_drawCustomers` → `_drawPois` → `_drawMission` (`:1097-1101`);
  `_drawPois` `:2217`; `_drawCustomers` `:2142`; `_hoverX/_hoverY` recorded `:984`; screen→world
  transform duplicated in `_onWheelEvent`/`_drawCursorCoords` (`:1132`) — factor it out.
  Listeners attach in `show()` / detach in `hide()` (`:690-694, 735-739`). **Q/E are unbound** everywhere.
- `data/map-icons.js` — `larrysHouse` uses `HOUSE`; the `missionGiver` comment ("finding out… is
  what driving to it is for") is superseded — rewrite it.
- No save system exists (`main.js:410-419`) → the board needs no persistence.
- Built families: **delivery and papers only.** fragile/demolition/freight have no code — they must
  simply never roll (a `BUILT_FAMILIES` set in code), not be built.

## Architecture (from the plan; owner has seen it)

**New `src/offer-board.js`** — pure (no THREE, road, DOM). Imports only `data/offers.js`,
`data/offer-names.js`, `src/seed.js` (`djb2`, `mulberry32`), `src/economy.js`. Owns slots,
timers, seeded rolls, name grammar, family filter, card view-model. Add to `LAYOUT.md`.

- **Lazy timers:** every query calls `advance(nowH)` (idempotent, only moves forward) — no per-frame
  tick. A sleep jump replays expiries with cheap lifetime-only draws.
- **Seeded streams:** `mulberry32(djb2(\`offer:${seed}:${poiId}:${slot}:${k}:${stream}\`))`, streams
  `life` / `spec` / `route`; per-POI streams for name, people, and the `[lo,hi]` expiry centre.
  Board = f(seed, POI list, frozen network, clock, completion/abandon log).
- **Offer record:** `{ id: \`${poiId}#${slot}#${k}\`, poiId, slot, k, family, thing, massKg, person,
  bonus|null, bornH, expiresH, route: null|…, dest: null|… }` — route/dest filled lazily and
  deterministically.
- **Slot states:** `live` → `taken` (hidden, original timer keeps running) → on settle `empty until
  expiresH` / on cancel `locked until now + L`.
- `economy.js` gains `basePay(par, payTier)`, `RANKS`, `bonusEarned(letter, gate)`.

## Phases (commit at each boundary; `npm test` while working, `npm run test:all` pre-commit)

**A — offer model.** New board module; `day.clockH()`; `poi.js` derives `jobs` from
`postsOffers(type)` (delete the hand-set flags); `mission.js` `_roll(anchor, {rng, dest})` with an
anchored-end branch (enter the destination POI's edge from the nearer node — never drive past and
back); `planOffer`; `enterFromPoi` presents board offers, `cycle(delta)`, accept guards `isLive`;
**delete** `_offers`, `clearOffers`, offerKey plumbing, the anchored `regenerate()` branch and the
regenerate half of `PAID_JOB_DO_OVERS` (no dead code). Paper route: `open(giver, offer=null)`.
`main.js`: build the board in `onRegionLive`, drop on exit/seed change (replace `clearOffers` at
`:195, 708, 4534, 4573`); park trigger with no live offers shows the turnover time; route pump next
to the paper reroute pump (`:5610`); `onSettle` → `board.complete`; new cancel button (delivery + paper) → `board.abandon`.
Gates: **new `test/offer-board.mjs`** (register in `test/gates.mjs`, subsystem story, cost fast):
determinism; slot counts; always-full; lifetimes within ±30 %; desync (no shared `expiresH` at t0;
age/L uniform over 2000 seeds); lazy == stepped (one 30 h jump vs 1800 one-minute steps); completion
waits out the original expiry; abandon lockout formula; taken offers hidden; only built families
roll; import scan. `test/day-clock.mjs`: `clockH` continuous across midnight. `test/story-poi.mjs`
§6/§7/§8 and `:479` rewritten for the board (see the ticket's acceptance list).

**B — generation.** Person (sex first), POI names (owned/plain/fixed + the giver-model flag),
dedupe names within a region, place names (`#` → 1–9), thing/mass/bonus rolls, card view-model
(`gateText` "S only" / "X or better"; freight → `flatPay`). Gates in `offer-board.mjs`.

**C — map.** `FAMILY_COLOR` table in `data/map-icons.js`; Larry → `NEWSPAPER`; customers → white
diamonds; `getBoard()` view from main.js (map2d stays economy-free); hover hit-test; Q/E listener in
`show()`/`hide()`; `_drawOfferCard` clamped to the sheet; one route; turnover timer text. Verify in
the browser (CDP / `run` skill), not in a gate.

**D — settle.** `settle`/`settleFlat` compute `award` via `bonusEarned`, push to
`runEconomy.awards`; result card line "Bonus: Chili dog ✓" / "missed (needed A or better)".
`test/economy.mjs`: basePay == settle at ratio 1; doubling `k` doubles basePay (never cached);
bonusEarned truth table; **money identical with/without a bonus record** apart from `BONUS_PAY_MULT`.

## Risks

- Food offers live ~2 real minutes: `accept()` must re-check `isLive`; the parked panel re-selects.
- Route memos hold centerlines — free them on region exit / seed change / roll-off.
- Deriving `jobs` adds rings + prompts at burger/store/service — check `_updateMissionRings`.
- Larry's `planTour` (~120 ms) must go through `planTourJob` slices, never block on hover.
- Cargo mass is display-only (truck doesn't carry it yet) — expected, not a bug.

## Working rules for this effort (owner memory)

- Serial implementation, one agent on shared code; subagents with `model: opus`.
- Commit only at phase boundaries; `git commit -- <paths>`.
- Conflicts between docs/decisions → ASK, don't annotate around them.
- Fix root causes; prove with the headless gates.

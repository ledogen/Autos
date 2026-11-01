---
id: FEAT-65
type: feature
status: open
severity: major
opened: 2026-08-17
source: owner — "I've had a new idea for a type of mission... generally speaking this mission type
        would be called 'destroy all the props'. instead of the existing p2p type missions these will
        originate at the mission giver POIs and send the player to go nail some barrels, maybe smash
        some sinister signs or destroy a bunch of mailboxes"
relates: FEAT-61, FEAT-53, FEAT-46, FEAT-60, FEAT-36, FEAT-48, FEAT-59, ASSET-22, ASSET-29, ASSET-30, ASSET-31
invariants: SM-INV-3, SM-INV-4, SM-INV-11, SM-INV-12, SM-INV-14
amended: 2026-08-17 (owner ruling — par charges no stops for this mission type)
amended: 2026-11-01 (owner rulings — deeds yes, mailboxes out, shoulder site, share-smashed rank,
         two board dressings + the camp's turn-back signs; approved plan below)
lane: A
---

> **ALPHA SCOPE (owner, 2026-10-31): build demolition before the alpha** — it is the fifth line of the
> camp requisition (FEAT-157: haul, freight, courier, fragile, prop smash). Lane A, after FEAT-157's
> four built lines. `BUILT_FAMILIES` in src/offer-board.js gains 'demolition' the day it ships.

# FEAT-65: Demolition missions — "destroy all the props"

> **2026-11-01: the rulings below are made and the slice-1 plan is APPROVED** — see
> § "Approved plan — slice 1 (owner, 2026-11-01)" at the end. Where it and the August text above it
> disagree (the pad, gradeRun(ratio ÷ coverage), mailboxes), the approved plan wins.

## Request

> I've had a new idea for a type of mission. I think generally speaking this mission type would be
> called "destroy all the props". instead of the existing p2p type missions these will originate at
> the mission giver POIs and send the player to go nail some barrels, maybe smash some sinister signs
> or destroy a bunch of mailboxes (could be fun with a bat out the window mechanic) but I'm not sure
> how we would frame that as a "good deed"
>
> we'll need to sort out how to spawn props with orientation. for barrels and similar we probably need
> to generate a pad or make really sure the location they're spawned doesn't launch them (road clipping
> failsafe?) stacking barrels, etc would be sick too.
>
> obviously these missions will pay a slight damage toll on the vehicle but the payout should make it
> worth it

**Outcome:** a giver POI sends you to a site off the road with a set of objects on it. You flatten
them with the truck, paid per object, graded on the clock. The site is carved flat so nothing
launches; the repair bill is what the physics says it cost you.

## This is NOT a new scoring axis — it is coverage inverted

`missions.md` is explicit: *"Adding a fifth axis is a design act. Adding a fifth dressing is a content
act."* This is a **content act**. Coverage measures *how much of a fixed inventory you place before
the budget runs out*; demolition measures *how many of a fixed set you remove before the budget runs
out*. Same shape, same scoring block the paper route already ships:

```
coverage = smashed / total
rank     = gradeRun(ratio ÷ coverage)      the par ratio, par scaled by the job you did
payout   = FLAT × n × expedite(ratio)      per-object, banked ON IMPACT (FEAT-61's paid-on-the-spot rule)
```

Consequences, all of them good:

- **No invariant amendment.** SM-INV-4's continuous payout, `parBase = k × par`, `dayTier` locked at
  accept, tightening rank thresholds — all unchanged. `economy.js` needs nothing new.
- **No new economy tuning.** `k` is still the one number.
- **Points work for free.** SM-INV-14's 1 / ½ / 0 for B+ / C / D falls straight out of `gradeRun()`,
  because rank is computed per axis (`missions.md` "Rank is the surface").
- **`missions.md` needs one row of dressing, not a sixth axis row.**

**Par does NOT charge stops for this type** [OWNER RULING 2026-08-17]. The paper route pins the
reference driver's speed to **zero** at every customer — a true halt, the one place the `vMin` floor
does not apply — because a delivery costs coming to rest and pulling away again (FEAT-61, 2026-08-14).
**A demolition target is not a stop.** You hit it on the move; the whole point of the type is that you
never lift.

**This needs no formula change — the stop is already opt-in.** `sampleRoute()` charges a halt only
where the *caller* sets `stop: true` on a segment (`src/par.js:166`); junction caps and the curvature
envelope are the only things it derives on its own. So the demolition tour builds its segments
**without the flag** and par is the pure geometric drive time through the site. Nothing in `par.js`
moves.

**Consequence — par is now optimistic, and that is the thing to measure.** A clean racing line through
the site is *not* the line that hits every target: the player deviates to line each one up and eats a
collision impulse on each contact, and par sees neither. So real elapsed exceeds geometric par by an
amount that grows with target count — which makes this type **tighter than a point-to-point on the
same road**, not looser. Measure that gap on a real site before picking a rank tolerance or the FLAT
rate; do not assume it is small.

**If it needs a per-target cost, the lever is a cap, not a stop.** The same machinery already supports
a plain `{ i, v }` speed cap with no `stop` flag (`computePar`'s cap loop, which floors caps at `vMin`
and skips the stop branch). That prices *"slow enough to line it up and take the hit"* without pricing
a halt, it is physically honest, and it is a caller-side value rather than a change to the oracle.
**Prefer that over a fudge factor on the tolerance** — a cap is a speed the player can be shown to
have beaten; a tolerance constant is a number somebody picked.

## The "good deed" framing

The honest answer: **the deed is *removal*, and removal is already a sanctioned virtue in this game.**
Clearance — the log-drag main mission — is *"objects removed from a blocked trail"* and nobody reads
it as vandalism. Demolition is clearance's civilian cousin: sanctioned destruction of property, for
someone who cannot do it themselves.

| Dressing | The deed |
|---|---|
| **Barrels / drums** | A rancher's leaking drums on an old landing; the county will fine him. Crush them flat so he can haul them out in one trip. |
| **Road signs** | A sign line the highway crew condemned before repaving. Or: *"some kids turned them all around — knock them down before somebody drives into the river."* |
| **Derelict structures** | A collapsed stand/stall the owner can't afford to have hauled. |

**The giver's line stays mundane.** SM-INV-11's wall holds: a giver can tell you the milk's at the
store, never why the trees lean. The person hiring you has an ordinary reason.

**"Sinister signs" is the late-region version of the same mission.** The owner's own phrase hooks
straight into the ambient escalation: signs that point wrong, that weren't there yesterday, that a
giver won't quite explain. The *mechanic is identical* — only the dressing and the giver's evasiveness
change. That is a free escalation path and it is the right shape: the ambient world-story stays
emergent (SM-INV-11), the mission stays a mission.

## Owner rulings needed

> **Both RULED (owner, 2026-11-01).** 1: **deeds yes** — removal is the deed, played straight (the
> recommendation, not the joke). 2: **(a) mailboxes stay out** — a mailbox is a paper-route target only.

**1. Points display as "good deeds" (FEAT-53, owner theming).** A result card reading *"+1 good deed"*
after flattening a row of barrels is either a joke the game is deliberately making — which could be
excellent, and rhymes with the Roamer's unsettled motives (Open Q1) — or a tonal leak. Ratified
theming, so it is an owner call. **Nothing else in this ticket depends on the answer.**

**2. Mailboxes conflict with the paper route.** Mailboxes are the paper route's *target* — the income
floor, Uncle Larry's job, the thing you throw *into* — and `ASSET-22 / asset-rural-mailbox.md` is one
model serving both. Making them a paid demolition target in the same world flips the asset's reading.
Three ways out:

- **(a) Recommended — keep mailboxes out.** Signs, drums, propane tanks (ASSET-05), gnomes, flamingos.
  The bat joke survives entirely on signs.
- **(b)** Scope smashing to explicitly *derelict* boxes on an abandoned road — a different visual state
  of the same model, which costs an asset variant.
- **(c)** Accept the collision deliberately as tonal texture.

## Spawning: pads solve it, and the machinery exists

The owner's launch instinct is right, and the project already has the answer.

**A demolition site is an off-network-layer product on a carved pad.** The 2026-08-01 ratification
made spurs, dispersed-camping areas, logging sites, POIs and cuts **one generator**; `poi.js` already
carves a flat lay-by pad (`_poiPadCarve`) with a known surface Y and, critically, **zero carve
authority inside the road's own cross-section** — the ribbon is bit-identical with or without a pad
beside it. On flat ground of known height, spawning is arithmetic rather than a gamble.

Rules for the spawner:

- **Place base at `padY + ε`, upright quaternion, zero linear velocity, ASLEEP.** Wake on a proximity
  radius. Sleeping spawn is not just a perf win — it is what stops the player watching a stack settle
  and slump from 100 m away.
- **Yaw from the site PRNG**, reusing the existing pad convention (`modelYaw`; model −Z faces the
  road). Per-object yaw jitter on top so a row does not read as a lattice.
- **SM-INV-12: placement is pure `(worldSeed, coords)` and window-invariant**, keyed to the **site id**
  the way `_pickStable` is — never to how many pads happen to be in the window. Whether an object has
  been smashed is **run-layer** state, moving at mission boundaries.
- **Road-clipping failsafe:** never spawn inside the ribbon cross-section. Mirror the pad carve's own
  zero-authority rule rather than inventing a second test. A resolve-then-seat step against the
  **carved** surface (not raw terrain) is the belt to the pad's braces.
- **Everything must stay drivable-through.** The 2026-08-02 Shortcut ruling is that nothing may ever
  block the road; an object heavy enough to stop the truck is a blockage that forces a detour. An
  18 kg drum is fine. A concrete-filled anything is not. This bounds the mass of every demolition
  prop and it is a hard rule, not a preference.

`debris.js` (FEAT-36 / FEAT-48) already does the hard part and needs no rework: convex hull from the
GLB's own vertices, bbox-recentred, density-derived mass and inertia, two-way wheel coupling for free
through `stepPhysics`'s qcPlus overlap. `drumClosed` is in `DEBRIS_TYPES` today at ρ 86 → 18 kg.

## Stacking

Fun, and the genuinely risky part. Two hard constraints:

1. **`DEBRIS_CAP` is 12 with oldest-reclaimed** (`src/debris.js:39`). A 3-2-1 pyramid plus anything
   else live blows the cap and starts **silently deleting mission objects** — which is a scoring bug,
   not a visual one. Mission objects need their own pool, or a raised cap with mission bodies exempt
   from reclamation. **Do not ship stacking without fixing this first.**
2. **Resting stacks are the worst case for solver stability.** Spawn asleep in an exact lattice with
   small overlap-free gaps; wake on approach. Keep the first slice to a 3-2-1 pyramid and prove it
   sits still for 60 s before scaling up.

## The damage toll — free, honest, and SM-3

Nothing here should author damage values. **The wear/condition model does not exist yet** (DESIGN.md:
*"There is no damage model today"*; it is SM-3, and we are in SM-2). When it lands it reads impact
magnitude with a no-harm floor, so the toll arrives **for free and honest**: hitting an 18 kg drum
square at 60 km/h costs whatever the physics says it costs. Emergent over injected.

That makes the skill expression the real content: **the same money for the clean line that kisses each
barrel and the wrecking-ball line that ploughs through — different repair bill.** A decision the
player makes with the throttle, needing zero new economy.

**Ship the mission on SM-2 without the toll; it gains teeth at SM-3 with no rework.** Explicitly do
not stub a placeholder damage number to stand in — that is exactly the injected value the model exists
to replace.

## Deferred: the bat out the window

The throw plumbing exists (`throw.js` aim/launch/ballistics; accuracy is already the ratified fifth
axis and would slot in as a per-unit rate scaler). But a bat is a **held item with a swing arc, reach
and a melee contact test** — its own mechanic, its own ticket, and it lands better once there is
something to swing it at. **V1 is "hit it with the truck,"** which is the version that is nearly free.

## Scope

**Slice 1 — the mission, no stacking, no toll.**
- Site generation on a POI pad: N objects (drums), seeded placement + yaw, spawned asleep.
- Mission type in `mission.js`: accept at a giver POI, stage-then-cross-threshold (the ratified POI
  start ritual — **no countdown**), per-object payout banked on impact, settle on completion or bell.
- Rank via `gradeRun(ratio ÷ coverage)`; points via the existing 1 / ½ / 0 ladder.
- Result card reuses FEAT-53's.

**Slice 2 — stacking.** Debris pool/cap fix first, then the 3-2-1 pyramid.

**Slice 3 — dressing breadth.** Signs (ASSET-31 road furniture), the sinister-sign late-region variant.

**Slice 4 — the bat.** Separate ticket when opened.

## Acceptance

- [ ] Owner ruling on the "good deeds" framing recorded here.
- [ ] Owner ruling on mailboxes recorded here.
- [ ] `missions.md` gains a **dressing** entry for demolition under coverage — explicitly NOT a sixth
      axis row, with the coverage-inverted argument stated so a later session does not re-litigate it.
- [ ] Demolition segments are built **without** `stop: true` — par charges no halts (owner ruling).
      A gate asserts a demolition tour and a point-to-point over the same geometry price identically.
- [ ] The gap between geometric par and real elapsed (aiming deviation + collision impulses)
      **measured** on a real site and recorded, before any tolerance constant or FLAT rate is picked.
- [ ] A demolition site spawns deterministically: same `(worldSeed, coords)` → same object positions
      and yaws, **window-invariant** across streaming entry direction. Gate it the way `story-poi` /
      `camp-zones` are gated.
- [ ] No object ever intersects the road cross-section; road centerlines bit-identical with and
      without demolition sites (the FEAT-46 parity gate, extended).
- [ ] Objects spawn at rest and stay at rest — no launch, no drift over 60 s of headless stepping.
- [ ] Every demolition prop is drivable-through at road speed (Shortcut no-blockage rule).
- [ ] Mission objects are never reclaimed by `DEBRIS_CAP`.
- [ ] Payout/rank/points flow through the existing `economy.js` path unchanged — **no new economy
      constants beyond the per-object FLAT and the tour tolerance.**
- [ ] No authored damage values anywhere in the mission.

## Open

- **Budget shape.** The paper route has a par-derived, diegetically-framed deadline (SM-INV-3's timer
  allowance, "before the coffee"). Demolition has no equivalent natural fiction. Is there a clock at
  all, or is the expediency bonus the only time term? Leaning: **no bell, expediency only** — the
  economy already supplies pressure via the cost curve and the finite day (`missions.md` §3b's
  argument for fragile applies verbatim).
- **Do partially-smashed objects count?** Binary (flattened / not) is the recommendation, for the same
  reason binary is recommended for fragile breakage — a graded ceiling collapses the axis.
- **Where does the site live relative to the giver?** A lay-by pad is small (14 × 8 m); a barrel field
  may want a logging landing or a spur terminus, which is the same off-network generator but a bigger
  footprint than `poi.js` currently carves.

## Approved plan — slice 1 (owner, 2026-11-01; BUILT 2026-11-02, see below)

### Context

The camp requisition is one line per mission type (FEAT-157). Four are built. The fifth is prop smash,
and the owner ruled 2026-10-31 that demolition is built before the alpha. Today `demolition` sits in
the tables (colour, badge, SOURCES) but has no code, and `BUILT_FAMILIES` keeps it from ever rolling.

**Owner rulings, 2026-11-01 (this session):**
- **Deeds:** demolition earns good deeds like every type. Removal is the deed, played straight.
- **Mailboxes:** kept out. They stay a paper-route target only.
- **Site:** targets stand on the **shoulder** along about **1 km** of road. They are static until the
  truck hits them, then they are live physics. No pads, nothing on the deck.
- **Rank:** the share smashed, its own axis (FEAT-138). This supersedes the ticket's August
  "time ratio ÷ coverage".
- **Dressings, slice 1:** the farm's scrap drums, and the work site's old sign line. The camp gives
  its own line: the turn-back signs.
- **Order:** FEAT-65, then FEAT-66.

### Design

#### The job's shape: an ordinary board job whose last kilometre is the site
- Demolition is a normal `MissionSystem` job with a **roadside** destination. Roadside legs are
  already 1.95–5.2 km (`mission.js` LEG_MIN/LEG_MAX), so a 1 km site always fits at the end.
- The targets stand along the **last `siteM` (1000 m) of the planned route**, on the shoulder:
  `roadHalfWidth` 5 m plus half the 2.5 m `roadShoulderWidth`, so about 6.25 m off the centreline,
  on either side.
- Arriving at the end settles the job, exactly as for any roadside job. Par is the route's own
  geometric par, with no stops (the 2026-08-17 ruling). Time pays the tip as on every job.
- The card names the place: "Earl needs **his old drums crushed** along **the Miller place**."

#### "Static until hit": sleeping bodies
- This reuses FEAT-154's barricade manager (`main.js _placeBarricades / _updateBarricades /
  _standRow`). A target far from the truck is a plain model. Within 120 m it becomes a debris body at
  exactly that pose (pinned, so outside `DEBRIS_CAP`), and is **put to sleep at once**
  (`physicsEngine.sleep`, already in the adapter).
- A sleeping body does not integrate. It cannot slide off a sloped shoulder or drift, and costs
  nothing per step. When the truck's hull or a wheel touches it, the engine wakes it: live physics.
- The manager gains a per-pose `kind`, so drums, signs and barricades share one code path.
- **Smashed** = the body has moved more than 0.3 m, or tilted more than 25°, from its placed pose.
  This is latched at the 10 Hz poll. A graze that wakes a target but doesn't move it doesn't count.
- Past 200 m the body is removed. A smashed target stays gone. An unsmashed one stands again as a
  model, so you can come back for it.
- **No `noDamage`.** Hitting a target costs what the wear model says it costs (the owner's original
  "slight damage toll", emergent, no authored number).

#### Placement: pure, seeded, headless-testable — new `src/demolition.js`
`siteTargets({ road, terrain, water, poly, polyCum, key, dressing, P })` returns
`[{ kind, x, y, z, yaw }]`:
- `key` = `demo:${seed}:${offerId}`. Arc positions are drawn along the last `siteM` of the polyline,
  with clusters per the dressing, a side per cluster, and yaw jitter. y = `terrain.analyticHeight`
  (the carved surface the physics rides), the lowest point under the footprint.
- **A candidate is rejected and redrawn (bounded retries)** if:
  - it is on any road deck (`road.sampleRoadTopY != null`, i.e. a junction or a crossing road);
  - it is within `nodeClearM` (30 m) of a junction node;
  - it is in water;
  - the shoulder is steeper than `maxSlope`;
  - it is more than 1 m above or below the deck (a bridge, causeway or tunnel).
- A site can come out a few targets short. Scoring uses the count actually placed.
- It is computed at plan time in `main.js _planOne` and stored as `m.targets`, so the card can say
  "12 drums".
- `DEMOLITION_PARAMS` (siteM, shoulder offset, nodeClearM, maxSlope, smash thresholds, the on/off
  radii) lives in the module.

#### Scoring and pay — existing plumbing, one new row
- `economy.js RANK_TABLE.demolition: [{ S: 1.0, A: 0.9, B: 0.75, C: 0.6 }]`, the share smashed.
  **PROVISIONAL**, the owner tunes it.
- `onSettle`: `result.letter = amountGrade(smashed / placed, rankTable('demolition'))`. Pay is the
  line × the share smashed, haul's rule (`payMult × aboard / bundles`). The deed follows the letter
  (1 at B+, ½ at C).
- `offer-board.js`:
  - `gateLine` 'demolition' → "if 75%+ smashed".
  - `deedLine` → "Deed: 1 if 75%+ smashed · 1/2 at 60%+".
  - `card()` stops nulling the deed for demolition.
  - The card's terms show the target count and "pay per target smashed".
  - `BUILT_FAMILIES` gains 'demolition'.
- `data/offers.js DEADLINE_SLACK.demolition = 1.0` (courier's). Placeholder.

#### Content (placeholders — the owner writes the words)
- **THINGS**, each with a `targets: { kinds, n: [lo, hi], cluster: [lo, hi] }` key:
  - `scrapDrums`, farm: "his old drums crushed". `barrel` (drumClosed) + a new `drumOpen` debris row,
    8–12, clusters of 1–3.
  - `oldSignLine`, work site: "the old sign line knocked down". The six warning signs, singly on one
    side, plus a cluster of 2–4 `roadBarrier`s. 6–9 in all.
- **SOURCES:** farm and workSite gain 'demolition'. Residence keeps it in its list but posts none,
  since no thing pools it (yard junk wasn't chosen for this slice).
- **DEBRIS_TYPES** gains `drumOpen` (as `barrel`) and the six signs (`massKg` ~15 each, aluminium
  plate + U-channel post; hull from the GLB as every debris type).
- **The camp's line** replaces `reqFood`: `reqSigns`, family demolition, `from: 'expeditionCamp'`
  (the camp gives it), phrase "the turn-back signs knocked down".
  - Its targets are crates (`smallCrate`) and drums **until the painted-board asset ships**.
  - A new **ASSET ticket** gets minted for the board: hand-painted plywood on two stakes, its words in
    an atlas like the gas station's.
  - The stained-drum variant waits with that asset.

#### The camp line's plumbing
- `offer-board.js`:
  - `openLines` gives a demolition line `destKind: 'roadside'`.
  - `destWish` sends only non-demolition lines to the camp; a demolition line plans roadside.
  - `_lineCard`'s sentence reads "…needs the turn-back signs knocked down along <place>." Its deed is
    "Counts if 60%+ smashed". (`_at` already lists a line once when its source is the camp.)
- `mission.js _roll`: an anchor on an edge with **one** node on the planners' graph (the camp's road,
  cut at the wall) exits through that inner node, where today it returns null. Every roster POI has
  both nodes on, so nothing else changes. The expedition-camp gate's "ordinary offers plan the same"
  check pins that.
- The line settles like the others: C or better counts. The result's `need` reads "60%+ smashed".

#### HUD, result card, save
- `_missionKind` → 'demolition' when `j.targets`.
- `_promiseRows` gets a demolition branch: the live share smashed against the table, worded
  "75%+ smashed".
- `_lineRows` and the money rows get a "Smashed 9 / 12" row, like haul's "Firewood delivered".
- **Save (FEAT-42):** the job save carries the smashed indices. A resume re-plans the route (seeded),
  re-places the same targets, and does not stand the smashed ones.
- **Job end** (settle, cancel, expire): the site stays until the truck is 200 m from each target
  (no pop in view), then goes.

#### Docs
- **FEAT-65 ticket:** the rulings above recorded; the scope rewritten to this slice (on-shoulder,
  share-smashed; the pad, gradeRun(÷coverage), stacking and the bat noted as superseded or later).
- **missions.md:** a demolition row (share smashed, its own axis).
- **FEAT-157:** the fifth line built; the type mix acceptance ticked.
- **LAYOUT.md:** `src/demolition.js` added.
- Tell the orchestrator the mission-board edits (data/offers.js, offer-board.js).

### Files

| File | Change |
|---|---|
| `src/demolition.js` (new) | `DEMOLITION_PARAMS`, `siteTargets()`, `smashedAt(pose, body)` |
| `src/main.js` | `_planOne` places targets; the barricade manager takes per-pose kind + sleep + smashed latch; site lifecycle; onSettle letter/pay; HUD + result rows; save/resume |
| `src/offer-board.js` | BUILT_FAMILIES, gateLine/deedLine/card, the line's roadside dest + card |
| `src/mission.js` | one-node anchor exit (the camp) |
| `src/economy.js` | `RANK_TABLE.demolition` |
| `src/debris.js` | `drumOpen` + six sign rows |
| `data/offers.js` | THINGS `scrapDrums` / `oldSignLine`, SOURCES farm/workSite, REQUISITION `reqSigns`, DEADLINE_SLACK |
| tests | new `test/demolition-site.mjs` gate (registered in `test/gates.mjs`); expedition-camp, offer-board, cdp-smoke extended |

### Verification
1. `git merge main` first (FEAT-89's multi-drop touched mission.js and offer-board.js).
2. **New gate `test/demolition-site.mjs`** (seeds 1, 6, the story region as built). For every
   demolition offer and the camp line:
   - the targets are identical across two builds;
   - at least `n.lo − 2` targets are placed;
   - every target is off every deck, between the deck edge and the shoulder's outer edge, on the
     ground (within 5 cm of `analyticHeight`), within the slope limit, inside the last 1 km of its
     route, 30 m or more from any junction, and not in water;
   - the camp line plans **from** the camp.
3. **expedition-camp:** the type mix is one each of haul, courier, freight, fragile, demolition. The
   demolition line goes camp → roadside; the four others still go source → camp. Ordinary offers plan
   the same.
4. **offer-board:** demolition rolls at farms and work sites, and its card reads "%+ smashed".
5. **cdp-smoke:** take a demolition job and teleport to the site start.
   - The near targets are bodies and asleep: `debrisSystem.awakeCount` stays put for 2 s.
   - Kick one (`__debris` velocity): the HUD reads 1 smashed.
   - Teleport to the end: the result card reads "Smashed 1 / n" with a D.
   - Take the camp line at the camp: no approach state, the targets are out on its route.
6. `npm test`, then the full smoke.
7. **Owner, in game:** drive a site. Does a sleeping target ever wake before it's touched (e.g. when
   the terrain chunk under it rebuilds as you stream in)? This is the one physics risk. If it does,
   the fallback is to spawn the body only inside ~25 m ahead of the truck.

### Placeholders the owner owns
The words, the target counts, the rank-table numbers, the deadline slack, the sign mass, and the
painted board's design (its own ASSET ticket).

## Built — slice 1 (2026-11-02, feature/run-shape)

As the approved plan, with these specifics:
- **`src/demolition.js`** (new, pure): `DEMOLITION_PARAMS`, `TARGET_TYPES`, `siteTargets(route, dressing,
  key, world)`. It walks the route's own `segments` backwards from the end, on the road's real
  centreline (the 25 m map polyline is too coarse to offset 6.25 m on a curve).
  - **Deck test:** a spot is rejected when another road's centreline (`road.queryNearest`) is nearer
    than its own. `sampleRoadTopY` can't serve here: it answers across the whole carve footprint,
    shoulder included (it returned a height 10 m out).
  - **Cost:** 1–3 ms per site.
- **Target kinds:** `barrel` and `roadBarrier` are DEBRIS_TYPES. The open drum, the small crate and the
  seven road signs load on first use (`debrisSystem.load(kind, spec)`), never at cold boot.
- **Sign mass:** 13 kg (a 4x4 timber post + its blank).
- **`main.js`:**
  - `_planOne` places `m.targets` with the plan, so the card counts them.
  - The site manager (`_placeSite` / `_updateSite` / `_siteCount`) is FEAT-154's model↔body swap plus
    `physicsEngine.sleep` right after the spawn.
  - **Smashed** = moved 0.3 m from the spawn pose, or tilted 25°, latched at 10 Hz.
  - The settle letters the share smashed and pays the line × that share.
  - HUD: a "Site n / N smashed" row, and the deed rung reads as a goal, not "lost" (the axis climbs).
  - The result card gets a "Smashed n / N" row.
  - The save carries the smashed indices, and a resume re-places the same site.
- **`mission.js`:** an anchor with one node on the planners' graph (the camp) exits through it.
- **`offer-board.js`:**
  - `BUILT_FAMILIES` gains demolition.
  - The badge is `Dm`.
  - gateLine / deedLine read "N%+ smashed".
  - A demolition job is always roadside.
  - The card reads "…needs **his old drums crushed** along **<place>**", with "N to smash · pay per
    target smashed".
  - The camp's line plans out to roadside and is named by its place.
- **Content:** `scrapDrums` (farm), `oldSignLine` (work site; signs face the traffic on the right, the
  barricades lie along the road), `reqSigns` (the camp; crates + drums until ASSET-77, the painted
  board, ships).
- **Gates:**
  - New `test/demolition-site.mjs`: every dressing placed on every planned route, seeds 1 and 6.
  - expedition-camp: the type mix and the camp line planning out.
  - offer-board: demolition rolls only at farms and work sites, and the card's wording.
  - cdp-smoke's new `demolition` step: take the camp line at the camp → the site stands → the targets
    near the truck are bodies and stay asleep 2 s → a kicked one counts smashed on the HUD → arriving
    settles with "Smashed 1 / N".

**Acceptance (August list), as it now stands:**
- framing and mailboxes: ruled.
- missions.md: a demolition row as its own axis (the "coverage dressing" framing was superseded by the
  2026-11-01 share-smashed ruling).
- par: built without `stop: true` (it is an ordinary roadside route).
- determinism: gated.
- road clearance: gated (off every deck).
- at rest: by construction (asleep), smoke-checked for 2 s.
- drivable-through: 18 kg drums, 13 kg signs, 10 kg barricades.
- the cap: pinned bodies.
- economy: one rank row (`RANK_TABLE.demolition`), no new constants.
- damage values: none authored.

**Still owed:**
- The par-vs-elapsed gap, measured on a real drive.
- **The owner's in-game look:** does a sleeping target ever wake before it is touched, e.g. when the
  terrain chunk under it rebuilds? If it does, the fallback is to spawn bodies only ~25 m ahead of the
  truck.
- The words, the counts and the rank row, all placeholders.
- ASSET-77.

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
blocked_on: two owner rulings (see "Owner rulings needed") — the framing and the mailbox conflict.
            The damage toll is a forward dependency on SM-3, not a blocker.
---

# FEAT-65: Demolition missions — "destroy all the props"

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

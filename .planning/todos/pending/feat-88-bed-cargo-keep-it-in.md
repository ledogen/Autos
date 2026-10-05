---
id: FEAT-88
type: feature
status: open
severity: major
opened: 2026-09-29
source: owner, 2026-09-29 — "a mission type where a physical prop is dropped in the bed of the
  truck and the goal is to not let it bounce out"
relates: FEAT-89 (the other delivery class — small items in the cab: point-to-point, multi-drop,
  fetch), FEAT-36 (closed — the debris system the cargo body IS), FEAT-83 (world-placed debris —
  shares the despawn/lifecycle work), FEAT-41 (menu stage — the only place the open-bed well is
  wired today), FEAT-67 (offer board — where the family rolls), FEAT-53 (payout), FEAT-38 (surface
  class — the route decision this type exists to make real), SM-3 (damage model — the shock signal
  §3b reads today), ASSET-27 pallet / ASSET-28 crate / ASSET-29 plastic barrel / ASSET-30 steel
  drum (the cargo models — 29 and 30 shipped, 27 and 28 open)
invariants: SM-INV-4 (payout continuous in outcome, floor at zero), SM-INV-10 (a load, never a
  stat), SM-INV-12 (determinism — the drop must be seeded)
design: missions.md §3b fragile / §6 cargo integrity; items.md §4 cargo; design-amendments-2026-08-17 §4 (graded, not binary)
---

# FEAT-88: Haul — a large item rides in the bed, and the job is to keep it there

## Ruling (owner, 2026-09-29): two delivery classes, split by where the item rides

Delivery is **two classes**, told apart by the one thing the player can see from the driver's seat:

| Class | Name (ruled 2026-09-29) | Rides | Scored on | Ticket |
|---|---|---|---|---|
| **Small item** | **Courier** | in the cab | time vs par (margin) | FEAT-89 |
| **Large item** | **Haul** | in the bed, as a rigid body | aboard at arrival, roughness, mass | **this ticket** |

A cab item cannot bounce out, so it is scored on time alone. A bed item is physical, so the driving
is the score. **Mass is a continuum inside the large-item class**, not a third type: a light crate is
pure restraint, a full drum loads the springs and is what §3c called freight. This **amends
missions.md §3** (three types → two classes) — noted there under the same date. The telemetry-based
fragile signal (suspension shock standing in for a vase you cannot see) is **retired**: everything
fragile is a body in the bed, and "eggs" is a small light crate.

## Request

A mission type where a **physical prop is dropped into the bed of the truck** at the giver and the
goal is to **not let it bounce out** before the destination. No fiction-side rule, no telemetry proxy:
the cargo is a rigid body riding in an open bed well, the truck's own motion throws it about, and
the player's driving is what keeps it aboard.

## Why this is cheap to build and why it is worth it

Every mechanism already exists on main, in three separate places that have never been joined:

1. **The cargo body.** `src/debris.js` (FEAT-36) spawns hull-collided rigid bodies with
   density-derived mass, two-way coupling with the truck (a rock in the bed loads the rear
   springs, `test/debris-coupling.mjs`), and Box3D sleep so a settled body costs nothing.
   `DEBRIS_TYPES` already has a barrel and a rock; ASSET-29/30 shipped drum models.
2. **The open bed.** `createVehicleChassis()` in `src/physics.js` takes an `opts.bed` well —
   floor pan, four walls, wheelhouse boxes — and the menu stage (`src/stage.js`, `RANGER_BED`)
   already passes one so its beat sheet can drop rocks into the bed. **The world truck does not:**
   `src/main.js` constructs the chassis with no bed, so in play the deck is still the QUAL-25
   solid tonneau slab and anything dropped on it rolls straight off. The physics.js header note
   ("this vehicle has NO OPEN BED") was written against hilux.glb and is stale for ranger.glb,
   which has a modelled open bed with a floor, rails and a tailgate.
3. **The mission family.** `src/offer-board.js` already carries `fragile` in its family tables
   (card, colours, giver lists) and deliberately keeps it out of `BUILT_FAMILIES` until the
   mission ships. missions.md §3b defines fragile as *restraint* — scored on shock into the cargo,
   flat rate, slowness is the cost — and §6 folds "arrive with the eggs unbroken" into it.

So the delivered feature is: wire the bed into the world truck, spawn a seeded cargo body into it
at accept, read the body's state at the destination, and let the family roll. The physics is the
mission. This is the emergent-over-injected version of §3b: instead of reading suspension
telemetry and calling it "shock to the vase", the vase is in the bed and you can watch it.

## Design position (recommendation — owner ratifies)

**This is the physical form of §3b fragile, not a fifth axis.** items.md §4: adding a cargo is a
content act, adding a scoring axis is a design act. Keep it on the fragile axis so the FEAT-38
argument (paved detour vs dirt shortcut, because of the cargo) holds unchanged, and so the offer
board's existing fragile card is the card.

**The signal is the body, not the telemetry.** Graded per the 2026-08-17 ruling, steep and
superlinear, floor at zero:

- **Aboard at delivery** — the body's centre is inside the bed well when the mission settles. The
  fee is paid, graded down by how rough the ride was (below).
- **Roughness** — accumulated *cargo* shock, read from the cargo body's own contact impulses
  against the bed floor and walls (the engine already reports these; `feedContact` in
  `src/damage.js` is the precedent for turning a contact stream into a peak-priced event). A body
  that lifts off the floor and slams back down is the pothole beat; a body that slides into the
  bedside on a corner is the cornering beat. Superlinear in the peak, so one big launch costs most
  of the fee and gentle chatter costs nothing.
- **Out of the bed** — the body leaves the well (over a rail, or over the tailgate under braking
  from a bounce). This is the catastrophic-impact floor from the ruling: the fee goes to zero.
  Whether the mission *ends* there or the player can go back for it is the open question below.

Nothing about the load is a number on the HUD (SM-INV-10). The player judges the cargo by looking
in the mirror / chase camera and by feeling the rear springs load, which is already true today.

**Mass is real.** A steel drum in the bed shifts the CoG and loads the rear axle through the
existing coupling. That is the §3b/§3c seam: a light crate is pure restraint, a full drum starts to
be freight. Don't tune the mass to make the mission easier; pick cargo whose real mass is right.

## What has to be built

1. **Bed well on the world truck.** Pass a bed spec to `createVehicleChassis()` from `main.js`.
   The numbers belong to ranger.glb, so `RANGER_BED` moves out of `stage.js` into
   `data/vehicle-models.js` as per-model hull data (the QUAL-25 option-2 path the physics.js
   header already asks for) and both callers read it from there. The bed rail is currently ~55 mm
   low against reference (handoff 2026-09-25) — whatever the model says, the collider follows it.
   Verify the world truck's driving feel is untouched: the well is collision-group debris-only
   like the wheel cores, never terrain.
2. **Cargo spawn at accept.** A `DEBRIS_TYPES` entry per cargo (crate, drum, barrel; pallet later)
   spawned into the well from `(seed, offerId)` with `spin` overridden so the drop is
   deterministic (SM-INV-12) — FEAT-83's rule: `hash32`, never `Math.random()`. Drop it from
   ~0.3 m above the floor so the player sees and feels it land. The body must be exempt from
   `DEBRIS_CAP` oldest-reclaim while the mission is live, or an evening of F-key throws deletes
   the cargo.
3. **The read.** Per fixed step while the mission is live: is the body's centre inside the well
   (body-local AABB test against the bed spec), and what was its peak contact impulse this step.
   Accumulate the roughness score in `src/mission.js` alongside the existing driven trace. No
   diagnostic plumbing in the frame loop beyond that one read.
4. **Settle.** On arrival, aboard × roughness → fee via the graded curve, floor zero. The card in
   `offer-board.js` already knows how to show a flat fee. Add `fragile` to `BUILT_FAMILIES`.
5. **Lifecycle.** The body despawns on settle, cancel, or run end. If the player drives away with
   it after settling it becomes ordinary debris. This is the same despawn discipline FEAT-83 needs
   for world fixtures — build it once, in `debris.js`, so both consume it.
6. **`causesDamage` off for cargo.** FEAT-83's flag: a crate bouncing in the bed must not feed the
   chassis wear model. Wire the flag if FEAT-83 hasn't landed it yet.

## Open questions for the owner

- **Bounced out: over, or go back for it?** Simplest is *the fee is zero, the mission ends, the
  body stays on the road as debris*. The alternative — stop, park within a few metres, press the
  interact key to reload it — is a small amount of UI but a much better beat (you *watch* the drum
  bounce down the embankment and decide whether it's worth the climb). No pickup mechanic exists
  today. Recommendation: ship "it's over" first, ticket the reload as a follow-up.
- ~~Does the telemetry-based §3b still get built for light cargo?~~ **Resolved 2026-09-29 by the
  two-class ruling above: no. Everything fragile is a body in the bed.**
- ~~The family key.~~ **Ruled: `haul`.** `data/offers.js` / `offer-board.js` carry `fragile` and
  `freight` as separate families today; both collapse into one `haul` family (one colour, one
  card) as part of this ticket. FEAT-89 renames `delivery` → `courier` on its side.
- **Tailgate.** Closed and solid today. A dropped tailgate (bed open at the rear) would be a real
  lever — you'd load a longer thing but braking hard throws it out the back. Not for this ticket;
  noted because the well spec already has `gateZ` as its own slab.
- **Cargo straps** (items.md §2, IDEA): the natural item hook. Straps would stiffen the coupling —
  a soft constraint between body and bed rather than free contact. Out of scope; note the seam.
  → **Ticketed as FEAT-90** (ratchet straps, 2026-09-30): owner's shape is a rigid weld, not a soft
  coupling, and it wants multi-body hauls.

## Not in scope

- The freight mass-menu at the giver (pick a heavier item for more pay — items.md §1a) — still
  needs its own ratification. It is the heavy end of THIS class now, so it lands as a follow-up
  here, not as a separate type.
- World-placed debris and despawn-with-streaming in general — FEAT-83. This ticket needs only
  "despawn on mission end", which is the trivial case.
- New cargo art. ASSET-27 pallet / ASSET-28 crate are their own tickets; a shipped drum (ASSET-30)
  is enough to build and prove this against.
- Any HUD readout of cargo condition (SM-INV-10). The mirror is the readout.

## Acceptance

- [ ] World truck carries the open-bed well; a body dropped into it from above lands on the floor
      and is held by the rails and tailgate. `RANGER_BED` lives in `data/vehicle-models.js`, read
      by both the stage and the world truck. Driving feel unchanged (existing physics gates green).
- [ ] Accepting a fragile offer spawns the cargo into the bed deterministically: same seed, same
      offer, identical resting pose after settle, asserted headlessly in the shape of
      `test/debris-stack.mjs`.
- [ ] A headless gate drives a scripted rough section with the cargo aboard and asserts: gentle
      driving keeps the body seated and scores near full fee; one hard crest launch scores a large
      fraction off (superlinear); the body leaving the well scores zero.
- [ ] The cargo body is immune to `DEBRIS_CAP` reclaim while its mission is live and is gone after
      settle / cancel / run end (body count returns to baseline).
- [ ] The cargo never feeds the chassis wear model (`causesDamage` off).
- [ ] `haul` (replacing `fragile` + `freight`) is in `BUILT_FAMILIES` and rolls on the offer board
      with a flat fee on its card;
      settling pays it graded per the above, continuous, floored at zero (SM-INV-4).
- [ ] No number describing the cargo appears on the HUD (SM-INV-10).

## Related code

- `src/physics.js` — `createVehicleChassis({ bed })`, the well builder; stale "NO OPEN BED" header.
- `src/stage.js` — `RANGER_BED` (to move), the rock-drop beat that proves the well works.
- `src/main.js` — the chassis construction with no bed; `feedContact` call on the fixed step.
- `src/debris.js` — `DEBRIS_TYPES`, `spawn()` with `spin` override, `DEBRIS_CAP`.
- `src/physics-engine.js` — `isAwake/wake/sleep`, contact reporting; the only engine seam.
- `src/offer-board.js` — `BUILT_FAMILIES`, the fragile card that already exists.
- `src/mission.js` — driven trace, settle, where the roughness accumulator goes.
- `test/debris-coupling.mjs`, `test/debris-stack.mjs` — the gates to model the new ones on.

## As built — first slice, firewood (2026-10-04, `feature/haul-firewood`)

The owner ruled the pay rule on 2026-10-04. **It supersedes the roughness grading above:**

- **Pay = (Base pay + time tip) × (pieces aboard at delivery ÷ pieces in the offer).** The ordinary
  par line, with no separate shock score: a bounce that matters throws a piece out, and that piece's
  share is lost. A lost piece never ends the mission. The empty-bed floor is zero (SM-INV-4).
- **The max scales per piece** (`HAUL_PAY_PER_BUNDLE`, 1/8 of a delivery each). Load size is what
  makes the market pull between careers.
- **Pieces that miss the bed at the yard are lost pay too.** The loader drops the offered count
  whatever happens.

What exists:

- **Offers.** The `haul` family is built and rolls only at the `firewoodYard` POI (`data/offers.js`).
  Each offer rolls 7–12 bundles on its own `bundles` stream, so existing offers don't move.
- **Accept.** Accepting goes to a new `'loading'` mission state. Park inside the yard's bay (drawn as
  a low curtain: orange outside, green inside) and the bundles drop over the bed on a 0.3 s stagger
  (`main.js` `_haulStep`, `debris.js` `bedDropPoints`).
- **Debris.** Bundles are pinned debris (outside `DEBRIS_CAP`) and `noDamage` (filtered in
  `maxContactImpulse`). They're removed on settle, on cancel and when the job ends.
- **Result card.** It shows "Firewood delivered N / M".
- **Gates.** `test/haul-load.mjs` is new. `offer-board.mjs` §15 and `economy.mjs` §8b are extended.

Still open in this ticket: the crate / drum / barrel cargo for the other givers, and retiring the
dead `fragile` / `freight` keys into `haul`.

---
id: FEAT-110
type: feature
status: cancelled
closed: 2026-10-14
resolution: "CANCELLED — closed by the owner 2026-10-14. Straps do not work as an item: rocks and firewood
  bundles cannot be strapped, haul's loose-load chaos is the point, and an item held at one giver and
  missing at the next feels arbitrary. Straps stay as fiction on the strapped families (freight,
  fragile). Straps as a paid gate on fragile work is recorded in IDEAS.md, unratified."
severity: minor
opened: 2026-09-30
source: owner, 2026-09-30 — "ratchet straps … secure loose cargo from a haul mission so that it
  doesn't move around the bed of the truck … freeze the rigid body to the truck body, but the mass
  and centre of gravity will persist … a relatively valuable and late game item … ideally allow
  multiple items to be carried in a haul mission at the same time, or multiple haul missions to be
  accepted concurrently, so … a strap can be used on one object and another object can be loose"
relates: FEAT-88 (Haul — the bed cargo this item acts on; hard prerequisite), FEAT-67 (offer board —
  carries the "one active mission at a time" rule this ticket may amend), FEAT-66 (camp gear slots —
  nearest thing to an item-slot system today), FEAT-36 (debris — the cargo body), FEAT-53 (payout)
invariants: SM-INV-10 (described, never scored), SM-INV-9 (no item raises the floor), SM-INV-8
  (items die with the run), SM-INV-12 (determinism)
design: items.md §1 "Cargo straps" row + the four rules; IDEAS.md "Item: cargo straps" 2026-07-29;
  missions.md §3b
requires: FEAT-88 shipped (world-truck bed well, cargo spawn, roughness read)
---

# FEAT-110: Ratchet straps — lock a haul load to the bed (PARKED — weak as specified)

> **Renumbered 2026-10-12:** was FEAT-90, a duplicate id. Older docs citing FEAT-90 for this ticket mean FEAT-110.

> **2026-10-06:** strapped cargo now exists as a property of two mission types, not as an item:
> FEAT-96 freight and FEAT-97 fragile weld their load to the bed, and FEAT-96 builds the weld joint
> this ticket's option A describes. Weakness 2 below is now literal: fragile IS the strapped slot.
> Straps as an item for loose haul loads stay parked.

## Status: parked, 2026-09-30 — the idea is weak, keep it for a better solution later

Owner, on reading the conflicts below: *"I'm not sure if the straps truly belong. Leave it there,
mention that it's weak and why it's weak, and maybe I can come up with a better solution later."*
Do not build from this ticket until the owner re-opens it with a new shape.

**Why it is weak.**

1. **A rigid strap deletes the mission it serves.** Haul (FEAT-88) *is* the restraint axis: the
   driving is the score because the load can move. A strapped body can't move, so it has no bed
   contacts, a perfect roughness score, and no way to leave the well. Each strap turns one body back
   into dead weight — the job becomes margin-only, which is exactly the collapse items.md rule 4 and
   IDEAS.md 2026-07-29 warn about.
2. **Fragile already occupies the "strapped" slot.** The retired fragile mode was, in effect, a
   strapped load: the item couldn't leave, and the only signal was shock passed through from the
   chassis. So "straps that still take shock" (fix 2 below) just rebuilds fragile inside haul as an
   item. The item would re-create a mission mode the two-class ruling (FEAT-88, 2026-09-29)
   deliberately removed, rather than add a new choice.
3. **The fixes each lean on something that doesn't exist yet.** Scarcity needs multi-body hauls.
   Consumables need an item system and a shop. Shock-while-strapped needs a second scoring signal
   in FEAT-88. None of them makes the strap interesting by itself.

**What the owner floated (not ruled):**

- **Consumable straps.** You bring enough for a specific job, which rewards foresight (checking
  the offer card, how many bodies, before leaving the store). This is the strongest of the three:
  it moves the decision to *before* the job, where rule 4 wants it.
- **Strapped still takes shock**, as a damage axis on the cargo — a partial blend of fragile into
  haul. Weakened by point 2 above.

Leading candidate if it comes back: **consumable + multi-body hauls**, so a job with more bodies
than straps you brought still makes you read the road.

**Alternative accepted 2026-09-30: the rubber bed mat and the bedliner** (`items.md` §7). They raise only the
cargo-to-floor friction, so the load stops sliding but can still bounce — it reduces the risk
instead of deleting it, which is the thing the rigid strap couldn't do.

## Request

An item that **secures one loose haul cargo body to the truck** so it cannot slide, bounce or leave
the bed. Mechanically simple: the cargo body is frozen to the chassis. Its **mass and centre of
gravity stay exactly where they were** and keep acting on the truck — a strapped steel drum still
loads the rear springs, still raises the CoG, still pushes the truck wide in a corner. The strap
removes the *relative* motion, nothing else.

It is a **relatively valuable, late item**, wanted by players who run haul work. This promotes the
items.md "Cargo straps" row from IDEA to a spec, and answers that row's open question: **a reusable
tool, one strap per body** (owner's framing — "valuable" and "multiple straps" both read as kept
kit, not a consumable). Confirm below.

## Mechanism — recommendation: a rigid weld joint through the adapter

Two ways to "freeze" a body to the chassis in Box3D; both exist in the vendored bindings:

| Option | How | For | Against |
|---|---|---|---|
| **A. Weld joint (recommended)** | `b3CreateWeldJoint` between cargo and chassis at the cargo's current pose, zero softness (rigid). New adapter method beside `createDistanceJoint` in `src/physics-engine.js`. | The cargo stays its own body, so its mass and inertia couple to the chassis exactly as before — nothing in `physics.js` that reads chassis mass changes. Unstrap = `destroyJoint`. Same seam the log-drag rope already uses. | A solver joint, not a true merge: a very heavy body on a hard landing can show a few mm of joint give. Worth measuring, not worth designing around. |
| B. Absorb into chassis | Destroy the cargo body, add its shape to the chassis, `b3Body_ApplyMassFromShapes`. | Mathematically exact rigid merge. | Changes chassis mass/inertia at runtime — any cached chassis mass in `physics.js` (suspension, tire load, drivetrain) goes stale. Unstrap has to rebuild the body. Much wider blast radius. |

Freeze **where it lies**: the joint is made at the body's pose at the moment of strapping, so a
drum that has slid against the bedside stays against the bedside. Strapping happens at rest (see
"When can you strap" below), so the pose is settled and deterministic.

**What the roughness read does with a strapped body.** FEAT-88 scores ride quality from the cargo's
own contact impulses against the bed. A welded body makes no bed contacts, so it scores as a
perfect ride and can never leave the well. That is exactly what the owner described — and it is the
design conflict below.

## Design conflict — owner's ruling needed before build

**items.md rule 4 / IDEAS.md 2026-07-29:** *"An item should enable a harder choice, not make an easy
one safe … if [straps] ever remove the need to read the road surface, the restraint axis is gone and
the type collapses back onto margin."* The earlier shape was a *softer* coupling — the cargo sees
less shock than the truck — not a rigid lock.

A rigid strap, as specified, makes a strapped haul immune to rough roads. Three ways to reconcile,
recommendation first:

1. **Scarcity carries the choice (recommended; the owner's own framing).** Straps are few and
   expensive; hauls carry **several bodies**; you never have enough straps for all of them. The
   decision becomes *which* load to lock (the heavy drum that would hurt most, or the light crate
   most likely to bounce out) and the loose ones still make you read the road. Mass is still real,
   so a strapped heavy load still makes the truck worse to drive. This keeps rule 4 intact *only if*
   multi-body hauls ship with it — see the next section.
2. **Strapped ≠ perfect.** Keep the weld, but let the roughness read also sample the *chassis*
   vertical/lateral acceleration at the strap point while strapped, at a reduced weight — the goods
   inside the crate still get shaken. Honest (it's what actually happens to strapped freight), but
   adds a second signal to FEAT-88's scoring.
3. **Accept it.** Straps are the late-run reward that makes hauls safe. This amends items.md rule 4
   for this item and needs a line in DESIGN.md / items.md saying so.

Also check against **SM-INV-9** ("does it make late runs comfortable?") and **SM-INV-8** — items die
with the run, so "late game" here means *late in a run / expensive in-run*, never a meta unlock.

## Multiple cargo — two routes, recommendation first

The owner wants a strap on one object and another object loose. That needs more than one body in
the bed at once. Two ways:

1. **Multi-body haul, one mission (recommended — simplest).** A single haul offer can roll 1–N
   bodies (e.g. two drums, or a drum and three crates). Scoring stays per-mission: aboard fraction
   and roughness aggregated over the bodies (mass-weighted is the natural choice). No change to
   FEAT-67's **"One active mission at a time. No concurrent contracts."** rule. This is a FEAT-88
   extension — the spawn already takes `(seed, offerId)`, it just needs an index per body.
2. **Concurrent haul missions.** Two accepted hauls ride together. **Directly overturns the FEAT-67
   ruling** and touches the offer board, mission settle, map, and the HUD's single-mission
   assumptions. Much bigger; its own ticket if wanted.

Either way, the bed well's floor area (ranger short bed ≈ 1.8 m × 1.4 m) bounds N physically —
a pallet takes the whole floor.

## Proposed interaction (to confirm)

- **When can you strap:** parked (speed ≈ 0), cargo bodies asleep or near-rest. At the giver
  immediately after load is the main moment; mid-route re-strapping after a load has shifted is the
  same action. No strapping while moving.
- **How:** one interact key near the bed straps the nearest unstrapped body if you have a free
  strap; again to unstrap. No aiming UI.
- **Readout:** none on the HUD (SM-INV-10). The strap is **visible** — a thin flat-coloured band
  mesh over the load to the nearest bed rail anchor, per ART-STYLE — so the mirror/chase cam shows
  what's locked.
- **Settle:** unstrap is automatic on mission settle/cancel before the cargo despawns (FEAT-88
  lifecycle); the strap returns to the player's kit.
- **Stowed mass:** a set of straps is a few kg (items.md rule 2) — real, trivial.

## Not in scope

- An item/inventory system. None exists on main (FEAT-66 camp gear slots is the nearest). This
  ticket needs only "the player owns K straps", which can be a count on run state until the item
  system lands. Don't build the item system off this ticket (IDEAS.md says the same).
- Where straps are bought/found and their price — economy/shop pass, owner's call.
- Concurrent missions (route 2 above) — separate ticket if chosen.
- A strap model/asset beyond a procedural band mesh.

## Open questions for the owner

- **The rule-4 conflict** above — option 1, 2 or 3?
- **Multi-body haul vs concurrent missions** — route 1 or 2?
- **Reusable tool vs consumable vs wears out** — recommended: reusable, K per kit, lost only with
  the run. (Do straps ever fail — a heavy drum on a hard landing snapping one? Nice beat, adds a
  break threshold; out of scope unless wanted.)
- **Source**: shop-only, found, or a haul-mission bonus reward (items.md "won on a bonus objective")?

## Acceptance

- [ ] `physics-engine.js` gains a weld-joint method (rigid), used only via `physics.js` / debris
      handles — no engine types leak past the seam (grep check).
- [ ] Strapping a cargo body at rest freezes it to the chassis at its current pose; a headless gate
      drives a rough scripted section (the FEAT-88 rough gate) and asserts the strapped body's
      bed-local pose drifts < a few mm and it never leaves the well.
- [ ] Mass/CoG persist: the same gate asserts rear-axle static load and chassis-plus-cargo CoG with
      the body strapped match the unstrapped-at-rest values within tolerance.
- [ ] Mixed load: one strapped + one loose body in the same haul; the loose one still slides and can
      still leave the well; scoring follows the ruled aggregation.
- [ ] Unstrap/settle/cancel destroys the joint before the cargo despawns; body count and joint count
      return to baseline.
- [ ] Deterministic: same seed, same offer, same strap timing → same outcome (SM-INV-12).
- [ ] No strap or cargo number on the HUD (SM-INV-10); the strap is visible on the load.
- [ ] items.md "Cargo straps" row updated from IDEA to the ruled shape; IDEAS.md entry points here.

## Related code

- `src/physics-engine.js` — `createDistanceJoint` / `destroyJoint` (the pattern to copy);
  `b3CreateWeldJoint` is in `vendor/box3d/dist/box3d.d.ts`.
- `src/debris.js` — cargo bodies (FEAT-88 spawn).
- `src/mission.js` — FEAT-88 roughness/aboard read and settle.
- `src/offer-board.js` — haul family; multi-body roll if route 1.

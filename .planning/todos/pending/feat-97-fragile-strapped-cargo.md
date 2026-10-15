---
id: FEAT-97
type: feature
status: open
severity: major
opened: 2026-10-06
source: owner, 2026-10-06 — "fragile is an item strapped to the bed of the truck (physics locked to
  body) might be heavy or might be light but is sensitive to shock. examples - panes of glass, an
  ornate vase, an upright piano, sculpture, artwork, security xray machine, or as a catch all - large
  pelican case or crate with flavor text cargo inside. you are tipped on delivery speed * cargo health
  and your flat reward is also * cargo health." Follow-ups the same day: a sound per damaging hit;
  at zero health the job fails and "abandon job is replaced with cleanup cargo which costs the
  player an hour"; the first slice uses the crate and a pelican case.
relates: FEAT-96 (Freight — builds the strapped-cargo layer this ticket stands on; HARD
  prerequisite), FEAT-88 (Haul — the share-aboard pay this mirrors), FEAT-110 (ratchet straps, parked),
  FEAT-38 (surface class — the paved-vs-dirt choice this type makes real), FEAT-67 (offer board),
  ASSET-28 crate · ASSET-39 pelican case (first slice) · ASSET-40..45 (the named items, later)
invariants: SM-INV-4 (continuous pay, floor at zero), SM-INV-10 (no cargo number on the HUD),
  SM-INV-12 (determinism)
design: missions.md §3 (amendment 2026-10-06) and §3b; design-amendments-2026-08-17 §4 (graded,
  steep, superlinear, floor at zero); items.md §4 cargo
requires: FEAT-96 shipped (weld joint, strapped spawn, clean-up action)
---

# FEAT-97: Fragile — shock-sensitive cargo strapped to the bed

> **Keys renamed 2026-10-07 (FEAT-98):** `burgerJoint` → `foodVendor`, `serviceShop` → `autoShop`.
> `missionGiver` is retired: its five slots became the additional classes (pois.md § Places and
> Missions) and its model pool is now `residence`. A farm also carries the `residence` tag.

> **Amended 2026-10-14 (owner) — read before building.** Fragile's **tip and bonus item are both
> earned by cargo condition**, not by the clock (design-amendments-2026-10-14.md §4). Base pay stays
> × health. The tip becomes a share of the tip pool set by health (whole near perfect condition,
> nothing below a floor — the curve is the owner's to set), and the letter that gates the bonus item
> reads health, not the clock. The clock still runs for the delivery deadline (FEAT-113). Add a
> `furniture` tag to the dining chairs, dining table, mirror, wardrobe and piano for FEAT-116's
> furniture pad. Where this block disagrees with the text below, this block wins.

> **Ruled 2026-10-15 (owner) — tiers pulled toward sturdy.** "A floor of 1.0 is silly because it
> takes damage constantly." GLASSWARE 1.0 / 3.5 → **1.15 / 4.0**, DELICATE 1.1 / 4.5 → **1.2 / 4.75**,
> STURDY unchanged 1.3 / 5.5. The windshield moves to DELICATE (laminated; it "felt way too
> delicate"), keeping its glass sound. The calibration table's "dirt at par pace: glass a clear
> loss" row is relaxed: ±4 cm washboard now NIBBLES glassware (~1 % per 5 s, was 9 %); a 1 m crest
> landing still destroys it.

> **Ruled 2026-10-15 (owner), later the same day — the base is guaranteed.** Condition drives the
> tip ONLY; base pay is not × health. *"An item at 25 % condition wouldn't even be worth carrying."*
> Supersedes "Base pay stays × health" (10-14) and "(Base + tip) × health" below. 75 % pays base +
> half the tip; ≤ 50 % pays the base; destroyed fails the job ($0).

> **Ruled 2026-10-15 (owner) — the tip curve and the shippers.** The tip share is linear in
> condition: **100 % condition = the whole tip, 50 % = no tip**, `tipShare = clamp((h − 0.5) / 0.5, 0, 1)`.
> Shippers are in cargo.md § "Rulings (owner, 2026-10-15)". Both blockers are cleared.

## Request

A delivery whose load is **strapped to the bed and breaks under shock**. It can be light (a vase,
a framed painting) or heavy (an upright piano, an airport x-ray machine). The load cannot move, so
it never leaves the bed. Every jolt the truck takes passes straight into it. This is missions.md
§3b's *restraint*, and the type that makes surface class (FEAT-38) matter: the paved detour versus
the dirt shortcut, chosen because of the cargo.

**Pay = (Base pay + tip) × cargo health.** Health runs from 1 to 0 and only goes down. The tip is the
ordinary clock tip, so speed still pays, but every pothole you take at speed comes out of both
halves. Pay is continuous and floored at zero (SM-INV-4). It is the same shape as haul's
"× share still aboard".

## The shock signal — the weld force, not suspension telemetry

The cargo is welded to the chassis (FEAT-96). Each fixed step, read the force the weld exerts on the
cargo (`jointForce`) and divide it by the cargo's mass. That gives the specific force on the item.
Remove the static 1 g of gravity, and what is left is the **acceleration the item actually feels,
in g**.

- It is honest physics, not a proxy. A pothole, a crest landing, a kerb strike, a crash and a
  rollover all reach the item through the strap, so one signal covers every way of breaking it.
- It does not depend on mass. A heavy piano and a light vase feel the same g over the same bump,
  and differ only in what they can take. Mass still matters to the truck.
- Ignore the weld torque for now. `ponytail:` a sharp yaw jolt that rotates the item without
  translating it does not count. Add the torque term only if a real case shows the gap.

**Price each shock event on its peak, square-law, the way `src/damage.js` prices bump-stop hits.** A
burst of steps above the item's floor is one event. Each item carries two numbers in its
`data/offers.js` entry:

- `shockFloorG` — below this the item takes no harm (calm driving is free).
- `breakG` — one hit this hard destroys it.

`health -= ((peak − floor) / (break − floor))²`, clamped to [0, 1]. That is the 2026-08-17 ruling's
"steep and superlinear, floor at zero": gentle chatter costs nothing, and one big launch costs most
of the job.

**Calibrate by scenario, not by guessing g values** (a headless gate, below):

| Scenario | Every item | Glass / vase | Pelican case |
|---|---|---|---|
| Paved road at par pace | no loss | no loss | no loss |
| Dirt road at par pace | — | a clear loss | little or none |
| A crest launch at speed | — | destroyed | a large loss |
| A rollover | destroyed | destroyed | destroyed |

## What the player sees and hears

- **A sound per damaging hit** (owner, 2026-10-06). Each item has a sound kind (glass clink, crate
  thud, piano strings jangling, case knock). The gain scales with that event's health cost, so a
  near-miss is a tick and a bad one is a crash. Calm driving is silent.
- **The cargo blinks red on each damaging hit** (owner, 2026-10-06), alongside the sound. The
  flash is on the load itself, as a red tint over the whole model, so it needs nothing special in
  any asset. A bigger health cost gives a longer or stronger blink.
- **No HUD number** (SM-INV-10). The sound and the blink are the only readouts, and both are on
  the load.
- **Result card:** a "Cargo condition N%" row, then Base pay and Tip, each already × health.

## Health reaches zero → the job fails on the spot

Owner, 2026-10-06. The job ends with the cargo destroyed and pays $0. The load stays strapped in the
bed as dead weight. The HUD's "abandon job" button has already become **"clean up cargo"** (FEAT-96).
Pressing it removes the load and costs **one hour** on the day clock. Until then no new job can be
accepted, because there is still only one job at a time.

## Things

**First slice (owner, 2026-10-06): the catch-all crate and a pelican case, with the contents in the
flavour text.** For example: "a crate of lab glassware", "a case of survey instruments", or
"grandma's vase, crated". `vase` and `windshield` already exist as `fragile` entries in
`data/offers.js`. They render as the crate until their own models ship.

**The full roster, tiered from early to late game, is `.planning/story-mode/cargo.md`.** It adds
ASSET-59..64 and the crate's text-only contents (fine china, milk bottles, canning jars).

Each specific item gets its own model later. A suggested mass is given for each.

| Item | Asset | Mass | Fragility |
|---|---|---|---|
| Large crate (catch-all) | ASSET-28 | 15–60 kg | per contents |
| Pelican case (catch-all) | ASSET-39 | 15–40 kg | tough |
| Panes of glass on an A-frame | ASSET-40 | 60–120 kg | most fragile |
| Ornate vase | ASSET-41 | 3–8 kg | most fragile |
| Upright piano | ASSET-42 | 200–270 kg | moderate |
| Sculpture | ASSET-43 | 40–200 kg | moderate |
| Framed artwork, crated | ASSET-44 | 10–30 kg | fragile |
| Security x-ray machine | ASSET-45 | 300–400 kg | moderate |

> **Masses superseded (2026-10-11):** every modelled item now has ONE as-built mass, counted off
> the model — cargo.md § Fragile. The ranges above were pre-model suggestions.

Mass is real (FEAT-96), so the piano and the x-ray machine are freight-heavy as well as fragile.
Those are the hardest jobs of the type.

## Rulings (owner, 2026-10-06)

- **Good deeds follow health**, as a haul's follow the share delivered: `haulPointsFor(health)`,
  so more than 2/3 earns 1, 1/3 to 2/3 earns ½, and less earns 0.
- **The letter blends the clock and health**, the same way haul's blends the clock and the load.
- **Givers:** `generalStore` and `residence`, as listed today.
- **Zero health:** the job fails on the spot and the clean-up button is how it ends. Clean-up
  locks the giver's slot as abandon does (FEAT-96).

## Rulings (owner, 2026-10-10)

- **Ship the whole roster**, not the crate + pelican-case first slice. All 13 named models are in
  `data/freight.js` (ASSET-39..45, 59..64).
- **`cargo.md` decides who posts, and a blank "from" posts nowhere** (the FEAT-96 ruling). Most
  fragile rows are blank today, so the owner still has to name their shippers before they roll.
- **Everything is R1** for now.
- `jointForce` is built here, its first user (moved from FEAT-96).

## Progress (2026-10-15)

Built in `feature/sm3-fragile`:
- `physics-engine.js` `jointForce` (Box3D `b3Joint_GetConstraintForce`). It reads as the strap's
  force ON the load: +m·g up at rest, so felt g = |F/m + g| / 9.81 is 0 at rest. Free fall reads
  1 g, so every floor sits at ≥ 1 g: airtime is free, the landing is what costs.
- `src/fragile.js`: pure tracker, damage.js's peak-and-decay event shape, square-law cost.
- 17 fragile things in `data/offers.js` on three tiers (felt g, floor / break):
  GLASSWARE 1.0 / 3.5, DELICATE 1.1 / 4.5, STURDY 1.3 / 5.5 (retuned the same day — see the top block). Routes per the 10-15 ruling; the
  autoShop now posts fragile (the windshield, crated). The pelican case and x-ray machine have no row.
- Pay `splitFragilePayout` (base guaranteed, condition drives the tip), letter `fragileGrade`, deeds `haulPointsFor(health)`. A fragile load
  takes freight's per-kg par and pay terms but not its time slack or tip multiplier.
- Hit sounds `playCargoHit` (glass clink → full break at ≥ ⅓ cost, thud, piano jangle) and a red
  emissive blink on the load's own cloned materials.
- At zero the job is failed: it can't be delivered, and the button reads "cargo destroyed · clean
  up" (+1 h). **Deviation:** no result card on failure. The button is the readout.
- `test/fragile-cargo.mjs`. Measured on the rig: paved slalom 0.55–0.62 g · ±4 cm washboard at
  15 m/s 1.06 g (240 kg panes) to 1.36 g (9 kg vase) · 1 m crest 4.6–4.8 g · rollover 11–31 g.
  Mass is real, so heavy glass rides the washboard better than a vase.
- Browser: debug-loading the vase and dropping the truck 3 m blinks it red and fades; no errors.
  A full story-mode fragile job has NOT been driven yet.

## Acceptance

- [x] Per step, the shock read is the weld force ÷ mass with gravity removed, priced per event on
      the peak, square-law, with per-item `shockFloorG` / `breakG` in `data/offers.js`.
- [x] A headless gate drives the four calibration scenarios above and asserts each row.
- [x] Pay is the guaranteed Base + a tip set by health (2026-10-15), continuous, floored at zero;
      `economy.mjs` covers it.
- [~] Zero health fails the job on the spot ($0; the cancel button reads "cargo destroyed", no result card), and clean-up
      removes the load and costs 1 h.
- [x] Each damaging event plays its item's sound with gain ∝ cost, and blinks the load red.
      Calm driving is silent and the load stays unlit.
- [x] `fragile` is in `BUILT_FAMILIES`. No cargo number on the HUD (SM-INV-10).
- [x] Good deeds are `haulPointsFor(health)`; the letter reads health (2026-10-14), and gates the
      bonus item.
- [x] The `furniture` tag is on the five furniture items.
- [x] Same seed, same offer, same inputs → the same health at delivery (SM-INV-12).

## Related code

- `src/physics-engine.js` — `jointForce` (FEAT-96).
- `src/damage.js` — the bump-stop event pricing to copy (peak per event, square-law, no-harm floor).
- `src/engine-audio.js` — one-shot helpers for the hit sounds.
- `src/economy.js` — `haulPointsFor`; the pay rows.
- `data/offers.js` — the `fragile` things (`vase`, `windshield`).

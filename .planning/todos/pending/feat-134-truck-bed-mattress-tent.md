---
id: FEAT-134
type: feature
status: open
severity: minor
opened: 2026-10-20
source: owner, 2026-10-19/20 — truck-sleep design pass (feature/truck-sleep). "I kinda like the mattress idea and bed tent but it's kind of an insane option."
relates: FEAT-45 (camping zones + vibe), FEAT-66 (camp gear slots), ASSET-23..26 (camp gear), FEAT-88 (haul — loose bed cargo), FEAT-96/97 (freight / fragile — strapped bed cargo), SM-INV-6 (amended 2026-10-19: you can always sleep in the truck), SM-INV-9 (rules not balance sheets)
---

# FEAT-134: Truck-bed mattress / bed tent — sleep in the bed, graded like a campsite

> ⚠ **POTENTIALLY CONTROVERSIAL — LEANING "DON'T", OR ONLY AS A PARTY-PACK ITEM.** Read the
> objections below before opening this. They are the owner's, and several of them may be reasons
> not to build it at all.

## The idea
A mattress or bed tent fitted in the truck bed. You sleep in the bed instead of the cab, and the spot
is graded like a campsite instead of getting the flat truck rate (`truckSleepRateH`, 1 h/h):

- **Flatness** comes from **the truck's own roll and pitch** as parked, not from a dug 6 m pad. Park
  level and you sleep well. It falls out of the physics, so nothing has to be injected.
- **Shade, water and view** are scored the same way as a campsite, at the truck's position.
- **Cost: the item takes up the bed.** While it's fitted you can't carry haul, freight or fragile
  loads. A courier-only build can carry it; a haul build can't.

The appeal: with dirt roads and overlanding coming, a player could drive out somewhere good,
off the camp-zone network, and get the full campsite bonuses.

## Objections (owner, 2026-10-20) — why this may be a bad idea
1. **It writes off a whole class of items.** For a player who adopts it, none of the usual camping
   items matter: the camp gear (FEAT-66 slots, ASSET-23..26), the fire, the pad. One item replaces
   a category.
2. **It threatens the integrity of off-road travel.** Nothing currently *requires* the player to
   leave the route. Off-road is open terrain we don't control: it isn't graded, sited or balanced
   the way camp zones and POI pads are. An item that pays you to sleep out there makes uncontrolled
   terrain a reward surface.
3. **It changes runs a lot.** Camping's three-layer model (region flag → valid location → site
   quality, DESIGN.md) is bypassed: the zone gate stops meaning anything for this player.
4. **It could easily be overpowered combined with other items.** Mattress + cooler + fishing gear
   + a good off-road build could make camp zones optional for good. Check that against SM-INV-9
   (rules, not balance sheets) and SM-INV-7 (no comfortable late runs).

## Possible framing if it's kept
As a **party-pack item**: a rare, run-defining pick that deliberately changes what the run is about
(an overlanding run), not something in the ordinary item pool. That keeps the standard camping
economy intact for normal runs.

## Prerequisites before this is worth deciding
- Dirt roads / overlanding exist, and the off-road grip split is decided (owner's plan: dirt keeps
  today's off-road slip factor, true off-road gets more slippery).
- The item economy has a place for run-defining items, if "party pack" becomes a real category.

## Acceptance (only if the owner decides to build it)
- [ ] Owner ruling recorded: build / don't build / party-pack only.
- [ ] If built: bed-sleep vibe = flatness from the parked truck's roll/pitch + campsite shade,
      water and view; with the item fitted, the bed refuses haul / freight / fragile cargo.
- [ ] If built: the objections above are each answered in the ruling, not left open.

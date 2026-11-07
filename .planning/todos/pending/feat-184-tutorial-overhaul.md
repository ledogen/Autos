---
id: FEAT-184
type: feature
status: open
severity: major
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox
relates: FEAT-170 (today's tutorial evening at mom's), FEAT-147 (opening), FEAT-104 (stores: food is buyable),
  FEAT-93/94 (punctures, flats), FEAT-50 (fuel), FEAT-162 (wear and damage)
---
lane: A

# FEAT-184: the tutorial overhaul — alpha

Owner, verbatim: "The tutorial could probably be expanded It doesn't tell you how to change a tire, it doesn't tell
you how to eat food from your inventory, it doesn't tell you how to refuel at a fuel station It doesn't tell you about
wear and damage mechanics, etc. I think we expand it to be a bit longer Maybe you suffer a flat tire and have to change
it Maybe you have to go purchase a new spare or something And I'm not sure all of this will even make sense to happen
in the randomly generated world Maybe we should freeze a seed for this purpose or custom build a world to put all the
points of interest closer together So it's more manageable or something In general, tutorial needs and overhaul I'd
like to mark it to do before alpha"

Listed in MILESTONES.md § Release cuts → Alpha (owner: "before alpha").

## First: a plan with the owner's choices (Lane A)

Nothing gets built before the owner picks. The plan gives each choice with a recommendation:

- **The lessons, in order:** the flat and the spare (and buying one), eating from the inventory, refuelling at a
  pump, wear and damage, and anything else a run needs.
- **The world:** today's random world, a pinned tutorial seed, or a hand-built tutorial world with its points of
  interest close together. Give the cost and risk of each. The no-default-seed rule (CLAUDE.md) covers the
  player's run; a tutorial world is the owner's suggested exception.
- **Its length.**

## Acceptance

- [ ] The plan, answered by the owner.
- [ ] Then: set by the plan.

## The plan — three choices for the owner (Lane A, 2026-11-07)

**What today's tutorial teaches.** The firing at the burger joint, then mom's call. The evening drive home is the
"safe leg": the clock holds and nothing wears. On that drive it teaches the gas, brake and steering, the damage screen
(V) halfway, and parking with the handbrake near hers. Then the night at mom's, breakfast, her job card and the map,
the casserole to Larry's, and Larry's welcome (the deeds, the camp). First-use cards cover the rest the first time it
happens: the pump, the auto shop, sleepiness and camp, the rank bar. Nothing teaches a flat, the spare, eating from
the inventory, a refuel as an action, or what wear does.

**What is cheap to build.** A flat on cue is one flag on one corner (`damageModel.flat`), so a scripted puncture costs
almost nothing in any world. The routes to "the nearest gas station / auto shop" use the planner every job already
uses.

### Choice 1 — the lessons, in order

Recommended order. **New** marks a lesson that doesn't exist today.

*The evening, on the safe leg (no clock, no wear):*
1. **New: the ignition.** Hold I to start (today the first card is the pedals).
2. The pedals, steering and the GPS line (today's).
3. **New: refuel.** The tank starts low and the way home passes the nearest gas station: park at a pump, fill, pay.
4. **New: the flat.** Halfway home a tire goes flat on cue. Pull over and park, open the damage screen (V), read the
   flat corner, fit the spare. This replaces today's halfway card, and it teaches **wear and damage** on the same
   screen: the bars, their colours, what wears and what breaks.
5. Park at mom's and sleep (today's).

*The morning, on the real clock:*
6. **New: eat from the inventory.** Breakfast becomes an action: open the inventory (Tab) and eat one of mom's packed
   lunches, or press its quick key. Today the breakfast is automatic.
7. Mom's card and the map (today's).
8. **New: buy a spare.** You are riding on your spare. Her card sends you by the nearest auto shop on the way to
   Larry's: park in the bay, buy a mounted tire (the shop card already explains the shop).
9. The casserole to Larry's, and his welcome (today's).

The first-use cards stay for everything after: the job board, the rank bar, a store, camp, the camp's requisition.

*Alternatives:* put the flat on the morning drive instead (real stakes, real clock); drop the spare purchase and leave
it to the shop's first-use card (shorter); add a store stop for food (FEAT-104 made food buyable).

### Choice 2 — the world

| | **(a) The run's own world** (recommended) | **(b) A pinned tutorial seed** | **(c) A hand-built tutorial world** |
|---|---|---|---|
| What it is | The tutorial plays in the random world the run uses. Its stops are whatever is nearest: the nearest pump, the nearest auto shop. | One fixed seed, chosen because its stops sit close together. Every tutorial player gets that world. | An authored little map: its roads, ground and places laid by hand. |
| The player learns | Their own home: mom's, Larry's, the roads they will drive all run. | A world they leave. The run is a different world, so mom's and Larry's move. Or the tutorial world *is* the run, and every player who takes the tutorial plays the same world. | A world they leave, the same as (b). |
| Cost | Moderate. The scripted flat; routes via the nearest stops; the new cards; a census and a gate (like the casserole's) that every stop plans within a distance budget on random seeds. | Moderate. Pick and pin a seed, plus a gate on its distances. The story opening has to choose: it plays twice, or only in the tutorial world. | Large. The world is procedural end to end (roads routed, ground carved, places sited on pads). An authored world needs its own roads, ground and placement, a loader, and upkeep every time the world systems change. Weeks, not days. |
| Risk | The distances vary by seed. Some seeds may put the pump or the shop far off. The census measures it; past a budget, that lesson falls back to its first-use card. | Every world-generation change reshuffles it. BUG-121 moved every region once today, and BUG-131 moved houses. The gate catches it, and then a new seed has to be picked. | Highest. A second world to keep working. |
| The no-default-seed rule | Kept. | Your exception. | Your exception. |

**Recommendation: (a).** It teaches the world the run is played in, keeps one world, and needs no new world pipeline.
The scripted flat and the "nearest stop" routes make it manageable on any seed. Before building, I'd measure on random
seeds how far mom's is from her nearest pump and auto shop, so the distance budget is set from numbers.

### Choice 3 — its length

Today's tutorial is roughly 10–15 minutes played, an estimate, not timed.
- **(a) +5 min:** add the ignition, the flat, the refuel and eating (lessons 1, 3, 4, 6). No shop errand.
- **(b) +10 min (recommended):** all nine lessons, the spare purchase included. The refuel and the shop are stops on
  drives the tutorial already makes.
- **(c) A full first day:** (b) plus a store stop and a night at camp.

The hold-M skip stays (owner, 2026-11-06). The words on every new card are the owner's (FEAT-148); placeholders until then.

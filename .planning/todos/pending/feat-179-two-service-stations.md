---
id: FEAT-179
type: feature
status: open
severity: major
opened: 2026-11-06
source: owner, 2026-11-06 playtest (via the orchestrator) — "There should always be two service stations on the map, I think my current seed has one.3-8-6-7-7-3-7-0-5"
relates: FEAT-164 (camp-reach guarantee — the gate pattern), SM-3 (parts / service / shop), feedback_cold_generation_only
---
lane: Spare

# FEAT-179: the story map always has two service stations

The owner's seed 3867737305 seems to have one service station. Every story world should have at least two.

## Plan (orchestrator, 2026-11-06)

1. **Measure:** how many service stations random seeds get inside the alpha's 2500 m story circle.
2. **Guarantee two:** at generation time (cold, pure: nothing saved).
3. **Gate it:** follow FEAT-164's `camp-reach` pattern.

**Lead (Lane C's audit, via the orchestrator, 2026-11-06):** the roster already gives every seed TWO auto shops
(`poi.js` `autoShop`). So on 3867737305, find out first whether the second one fails to place, lands outside the
circle, or sits where the owner never drove. Do that before adding any guarantee.

## Acceptance

- [ ] The census: the count per random seed, and how often it is under two.
- [ ] Every story world has ≥ 2 service stations in the circle, seed 3867737305 included.
- [ ] A gate pins it on random seeds.

## The lead, checked (Spare, 2026-11-07)

A headless census (`wip/feat-179/census.mjs`) built the story region the way the game does: the spawn decision,
the 2800 m warm-up, the main piece, then `PoiSystem.build`. It covered the owner's seed and 12 random ones
(`wip/feat-179/seeds.txt`).

**Every seed gets the full roster:** 2 auto shops, 1 gas station and 4 gas pumps, all inside the circle. Nothing
fails to place. The coverage picker (`_pickCoverage`) halves its spacing floor until a pair exists, so 2 auto
shops are certain once the pool holds two pads.

**The owner's seed 3867737305:**

| place | where | straight-line distance from centre | road distance from mom's house |
|---|---|---|---|
| auto shop | west | 745 m | 0.56 km |
| auto shop | east | 1382 m | 2.89 km |
| gas station | north-east, near the rim | 2289 m | 5.74 km |

**Across the 12 random seeds (medians):**

- The nearer auto shop is 1.44 km by road from mom's house, and the farther one is 3.19 km (7.66 km at worst).
- The gas station is 2.58 km by road (9.08 km at worst).

**The map hides nothing.** `map2d.js` has no fog of war: every POI is drawn from the start. On the full map the
owner's seed shows two "Auto" icons and one "Station" icon (`data/map-icons.js` labels). So "I think my current
seed has one" most likely means the **gas station**. In American usage a service station is a gas station, and
the map labels it "Station". The roster places one on purpose (FEAT-50, owner 2026-10-16: it is the convenience
store on a farm pad).

**The owner's call (asked 2026-11-07):**

- (a) **Auto shops:** already two on every seed. Nothing to build.
- (b) **Gas station → two:** set `count: 2` and site them by coverage, like the auto shops. Each needs a farm pad,
  and falls back to the cube on a lay-by when no farm pad is free.
- (c) **Something else** by "service station".

Then a gate pins the count on random seeds.

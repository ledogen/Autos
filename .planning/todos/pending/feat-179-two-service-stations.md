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

The owner's seed 386773705 (typed "3-8-6-7-7-3-7-0-5"; first transcribed as 3867737305) seems to have one service station. Every story world should have at least two.

## Plan (orchestrator, 2026-11-06)

1. **Measure:** how many service stations random seeds get inside the alpha's 2500 m story circle.
2. **Guarantee two:** at generation time (cold, pure: nothing saved).
3. **Gate it:** follow FEAT-164's `camp-reach` pattern.

**Lead (Lane C's audit, via the orchestrator, 2026-11-06):** the roster already gives every seed TWO auto shops
(`poi.js` `autoShop`). So on 386773705, find out first whether the second one fails to place, lands outside the
circle, or sits where the owner never drove. Do that before adding any guarantee.

## Acceptance

- [ ] The census: the count per random seed, and how often it is under two.
- [ ] Every story world has ≥ 2 service stations in the circle, seed 386773705 included.
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

### Correction (2026-11-07, same day): wrong seed, wrong reading

- **The seed.** The owner typed "3-8-6-7-7-3-7-0-5", which is **386773705**. The census above ran on 3867737305, a
  transcription with an extra 3, so its first table is a random seed, not the owner's world.
- **The word.** ASSET-82 (owner, 11-06) calls the auto shop's model "the service station asset": the two-car bay
  with the scissor lift. So "service station" is the **auto shop**, and the gas-station reading above is withdrawn,
  along with the (a)/(b)/(c) call (pulled before the owner saw it).
- **Next:** census 386773705 and find out why its world shows one auto shop.

### The owner's seed, counted (2026-11-07)

`wip/feat-179/census.mjs --seeds=386773705`, region centre (−35, 426):

| place | position | distance from centre | road distance from mom's house |
|---|---|---|---|
| auto shop | (−301, 560), by spawn | 298 m | about 0 km (her node) |
| auto shop | (1663, −247), east, near the rim | 1827 m | 4.07 km |
| gas station | (−327, −1575) | 2023 m | 3.78 km |

Both auto shops are placed. The map draws every POI (`map2d.js` `_drawPois` skips only an absent motorist), so it
should show two "Auto" icons. The second one is 4 km by road toward the east rim, and a gas pump sits on the same
road edge about 500 m short of it. A story-map screenshot on this seed is owed (`wip/feat-179/mapshot.mjs`, waits on a
quiet box).

**Gate:** `expedition-camp` now also checks for two auto shops inside the wall (`320c6d03`). It needs no extra build,
because that gate already builds the full roster on seeds 1 and 6. PASS on both.

### The map is why the owner saw one (2026-11-07)

A story run on 386773705 (`wip/feat-179/mapshot.mjs`) puts both auto shops in the map's own POI list. The map hides
the second in two ways:

1. **It opens framed on the current route**, about 2 km across. Only the near shop is in frame; the second is 2.4 km
   further east.
2. **Zoomed out, the doctor's blue diamond (71 m away) covers the east shop's pale wrench.** `_drawPois` draws in
   roster order, and the doctor comes after the auto shop.

Owner page: https://claude.ai/artifact/N3x8Co14XVye6XLkbXLpnf (shots in `wip/feat-179/shots/`). Tracker item
`feat179-map`:
- (a) leave it, and close on the gate;
- (b) pictogram places draw over the plain diamonds;
- (c) the map opens on the whole region.

**Smoke on the lane head `88b5dc3a`** (main `be546ce9` merged, run through `tools/chrome-slot.sh`): PASS, 25 steps,
zero console errors.

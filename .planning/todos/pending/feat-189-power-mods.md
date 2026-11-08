---
id: FEAT-189
type: feature
status: open
severity: minor
opened: 2026-11-08
source: owner, item setup page (https://claude.ai/artifact/HUjbtiQTyByViNedWtxhpu) answers 2026-11-08 19:27–19:57Z — `powermods` + one card per mod
relates: FEAT-121 (item tracker, § Power mods), FEAT-190 (engine swaps + tank), FEAT-191 (the turbo / supercharger sim), FEAT-192 (rarity tiers), items.md §3b
---
lane: B (build) · C (fold into items.md / FEAT-121 + the page)

# FEAT-189: power mods — ten engine mods, multiplicative, with slots

The ten pieces split out on 2026-10-24 now have the owner's figures. `data/engines.js` says "an engine upgrade
is a PATCHED entry … there is no modifier layer yet; build one when the first upgrade exists". This is that first
upgrade.

## Rules (owner, 2026-11-08, `powermods` card)

- **They multiply:** "multiplicative power mods is more accurate" (1.03 × 1.30 = +33.9 %).
- **One ECU slot:** chip tune OR race ECU.
- **One forced-induction slot:** turbo OR supercharger.
- **Exhaust ladder:** "stock > sport > open headers > race. the open headers are loudest and a lil sketchy. not
  the most powerful". One exhaust at a time.
- **Power targets**, verbatim: "to give you an idea of how much power overall the mods should add: 4 banger maxed
  out with a turbo should be like 275hp. v6 turbo like 350 max and the v8 turbo like 425. supercharged will sit
  about 25hp lower but have the instant torque".
- Sold at the auto shop. Rewards from the auto shop, stranded motorists and residences (per mod below).
- The old flat "+3 % per rung" (10-22) is superseded by the per-mod gains below.

## The mods (owner's answers, 2026-11-08)

The owner typed rarity into each card's free-text box; FEAT-192 makes rarity its own field.

| Mod | Gain | Other effects | Rank gate | Rarity | Price | Found | Reward from |
|---|---|---|---|---|---|---|---|
| Cold-air intake | +3 % | "wears faster than the paper filter but can be rebuilt for cheap" | C–B | common | $12 | rare roadside find | auto shop, residence, motorist |
| Light flywheel | — | inertia −25 % (0.135 kg·m² on the V6's 0.18) | C–B | common | $15 ("$15 install. flywheel is a pain") | rare roadside find | auto shop, residence, motorist |
| Sport exhaust | +5 % | even across the range; "a little deeper than stock" | C–B | uncommon | $15 | rare roadside find | motorist, residence, auto shop |
| Chip tune | +5 % | redline +350 rpm | B–A | uncommon | $15 | rare roadside find | auto shop, residence, motorist, Larry's house |
| Open headers | +8 % | "slight midrange losses all the power gain at the peak. hotter. sound"; more heat per unit of fuel | C–B | rare | $15 | rare roadside find | auto shop, residence, motorist, Larry's house |
| Cams | +8 % | low end −5 %, redline +250 rpm | B–A | rare | $25 + labour ("getting in the engine is expensive labor. like $15 which is also where engine repair should start") | barn find | auto shop, residence |
| Race exhaust | +12 % | "small midrange bump big top end bump" | A–S | epic | $35 | barn find | motorist, auto shop, residence |
| Race ECU | +8 % | flat gain, redline +750 rpm | A–S | epic | $35 | barn find | motorist, auto shop, residence |
| Supercharger | +20 % | +25 kg; instant torque (FEAT-191) | A–S | legendary | $60 | barn find | auto shop, residence, motorist |
| Turbo | +30 % | +20 kg; boost from ~2500 rpm, ~1 s lag — both "just a guess", the sim decides (FEAT-191) | A–S | legendary | $60 | barn find | motorist, residence, auto shop |

Sold at: the auto shop, every mod.

## Open (bring to the owner with numbers, not before the build)

- **The gains don't reach the targets.** The best legal stack (race exhaust, cold-air intake, cams, race ECU,
  turbo) multiplies to ×1.75. That puts the I4 (143 hp) at ~250 hp against 275, and the Vulcan V6 (~145 hp) at
  ~254 hp against 350. Is the target or the per-mod gain the anchor? (FEAT-191's per-engine turbo could close it.)
- **Which V6?** The 350 hp V6 target is ×2.4 on the Vulcan 3.0 but ×1.7 on the Ranger's 4.0 L SOHC (207 hp),
  which is close to the I4's ×1.9 and the V8's ×2.0. Under FEAT-190 the V6 is a mod, so it may be the 4.0.
- The light flywheel's 0.135 kg·m² was written against the V6. Apply −25 % to whichever engine is fitted.
- Engine labour $15 is also "where engine repair should start": that's the FEAT-69 repair re-price.

## Acceptance

- [ ] A modifier layer: the fitted mods patch the engine entry (torque curve shape, redline, inertia, heat per
      fuel), multiplicatively, and the fuel table rebuilds from the patched entry (FEAT-50 contract).
- [ ] Slots enforced: one exhaust, one ECU, one forced induction.
- [ ] ITEMS + REWARDS + shop rows for all ten (a ruled reward needs both rows, items-setup rule).
- [ ] A headless gate: each mod's peak-power change matches its card; stacks multiply.
- [ ] items.md §3b and FEAT-121 § Power mods carry the figures.

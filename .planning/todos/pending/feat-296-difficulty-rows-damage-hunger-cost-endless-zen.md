---
id: FEAT-296
type: feature
status: open
severity: major
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "I'd like to expand the casual difficulty selection mode. To keep it simple for now we can add another modifier called damage. The current damage setting will be known as medium. Casual should set it to low. We only need to build low and medium damage for now. I'd like low damage to both reduce wear and slightly increase the activation energy needed for damage events to trigger. For example popping a tire should require a harder rim strike. Damaging the suspension should require a higher bump stop load and the resulting damage should be capped a little bit lower. I think you get the idea. We can add a hunger row. The current hunger scaling will be known as normal hunger and casual will set hunger to low. On low hunger your hunger can deplete slightly lower and the energy scaling can be cut in half so being hungry doesn't cost you as much energy. Let's go ahead and add a cost scaling row. The current scaling is known as medium, which pairs with the classic game mode, and the casual players will get low scaling so that the costs of parts, repairs, and fuel go up less each in-game day. There should be a damage row setting for none but this won't be the default for any of the presets. Let's also add a Zen mode. This will have low-cost scaling, low damage, and every other setting will be the same as classic. Then add an endless row. This will prevent the game from ending when you beat the expedition camp. The player can just keep playing and taking missions forever. All modes will have endless disabled by default except for Zen mode, which has it enabled. Go ahead and build this prototype and suggest some other rows we can add to scale systems to an easier difficulty."
relates: DEC-433, DEC-046, DEC-151, FEAT-41, FEAT-69, FEAT-250, src/world-presets.js, src/settings.js, src/damage.js, src/day.js, src/economy.js
---
lane: unplaced (scribe: free lane; touches damage, hunger and the economy, so Opus for the build)

# FEAT-296: Difficulty rows: damage, hunger, cost scaling, endless; Zen mode

## Next steps
A lane builds the prototype the owner asked for ("Go ahead and build this prototype"): the rows below, wired into Casual and Classic, plus Zen. Then it lists extra rows to propose (below, a first set from the scribe). Owner answers the Open questions on one card.

## Summary
Expand the Casual/Classic difficulty choice into a set of named rows. The current behaviour becomes the "medium / normal" value of each row, Casual lowers them, and a new Zen mode lowers cost and damage and turns Endless on.

Owner's words (the full note, DEC-433 holds the ruling):
> I'd like to expand the casual difficulty selection mode. To keep it simple for now we can add another modifier called damage. The current damage setting will be known as medium. Casual should set it to low. We only need to build low and medium damage for now. I'd like low damage to both reduce wear and slightly increase the activation energy needed for damage events to trigger. For example popping a tire should require a harder rim strike. Damaging the suspension should require a higher bump stop load and the resulting damage should be capped a little bit lower. I think you get the idea. 
> 
> We can add a hunger row. The current hunger scaling will be known as normal hunger and casual will set hunger to low. On low hunger your hunger can deplete slightly lower and the energy scaling can be cut in half so being hungry doesn't cost you as much energy. 
> Let's go ahead and add a cost scaling row. The current scaling is known as medium, which pairs with the classic game mode, and the casual players will get low scaling so that the costs of parts, repairs, and fuel go up less each in-game day. 
> There should be a damage row setting for none but this won't be the default for any of the presets. 
> Let's also add a Zen mode. This will have low-cost scaling, low damage, and every other setting will be the same as classic. 
> Then add an endless row. This will prevent the game from ending when you beat the expedition camp. The player can just keep playing and taking missions forever. All modes will have endless disabled by default except for Zen mode, which has it enabled. 
> 
> Go ahead and build this prototype and suggest some other rows we can add to scale systems to an easier difficulty.

### Rows asked for (the scribe's table of the owner's words)
| Row | Values | Classic | Casual | Zen |
|---|---|---|---|---|
| Damage | none / low / medium | medium (today) | low | low |
| Hunger | low / normal | normal (today) | low | normal |
| Cost scaling | low / medium | medium (today) | low | low |
| Endless | off / on | off | off | on |

Damage `none` exists as a row value but is the default of no preset. Zen: "low-cost scaling, low damage, and every other setting will be the same as classic."

### What each value does (owner's examples)
- Damage low: "both reduce wear and slightly increase the activation energy needed for damage events to trigger. For example popping a tire should require a harder rim strike. Damaging the suspension should require a higher bump stop load and the resulting damage should be capped a little bit lower." Medium is today's damage. Low needs: a wear multiplier below 1, higher thresholds on each damage event, a lower per-event cap on suspension.
- Hunger low: "your hunger can deplete slightly lower and the energy scaling can be cut in half so being hungry doesn't cost you as much energy." Reading: the hunger floor is a bit higher (hunger depletes less far), and the energy cost of being hungry is halved.
- Cost scaling low: "the costs of parts, repairs, and fuel go up less each in-game day." Medium is today's per-day ramp.
- Endless: "prevent the game from ending when you beat the expedition camp. The player can just keep playing and taking missions forever."

### Scribe's first list of further rows to suggest (owner's call; the owner asked for suggestions)
Tire wear rate (low / normal), fuel burn (low / normal), job deadlines / par slack (generous / normal), tow cost and free tows (see DEC-046 lives and tows), the damage-alert level, stamina / energy drain per hour, camp-menu sleep quality, the price of repairs separate from parts, and assists (ABS, traction, throttle assist: FEAT-159). Each is a number that already exists and would be scaled by a row.

### What the code has today (for the builder)
- The "difficulty" setting in `src/main.js` (`worldPreset`, options casual / classic) is a WORLD preset today (`src/world-presets.js`: Casual = terrain 80 %, POI spacing 80 %, road grade 290; Classic = 100 / 100 / 180). It sets the world, not the rules. A rules layer (damage, hunger, cost, endless) is new and sits beside it. Whether Casual's rule rows are tied to the world code (`6/C`) is a build decision to put to the owner.
- Damage constants: `src/damage.js` (spring: `springBumpRefDmg`, `springBumpExp`, `springBumpRefNFront/Rear`; damper: `durDamper`, `damperVelFloor`; impacts' floors).
- Hunger and day clock: `src/day.js`. Costs: `src/economy.js`, `data/parts.js`.

## Description
(See Summary.)

## Tracker
- [ ] Rows exist in the settings and in Casual / Classic / Zen presets: damage, hunger, cost scaling, endless
- [ ] Damage low: wear multiplier down, event thresholds up (tire rim strike, suspension bump-stop load), suspension cap lower
- [ ] Damage none exists, default of no preset
- [ ] Hunger low: floor higher and energy scaling halved
- [ ] Cost scaling low: the per-day ramp of parts, repairs and fuel flatter
- [ ] Endless: beating the expedition camp does not end the run; on by default for Zen only
- [ ] Zen preset: low cost scaling, low damage, everything else Classic, Endless on
- [ ] The builder lists more rows to suggest (the scribe's first list above is a seed)
- [ ] A gate holds the preset table and the Classic identity (Classic must be bit-exact today's behaviour: fingerprint-physics + fingerprint-world)
- [ ] Owner has looked

## Open questions
- CONFLICT, DEC-046: it already rules "lives, free tows, assists, and inflation split into damage, gas and upgrade-and-item knobs" as the story difficulty settings. The new rows (cost scaling = parts, repairs, fuel) overlap its inflation knobs; is the new Cost row the same thing as DEC-046's inflation knobs, or a second layer? Not resolved here.
- CONFLICT, DEC-151: the tutorial disables damage and fuel. Presets must not change the tutorial; the tutorial stays damage-off whatever the row says.
- How low is "low"? The owner gave direction, not numbers: wear multiplier, threshold raise, suspension cap, hunger floor raise, cost ramp. Needs numbers (the builder proposes, the owner approves) per feedback_no_rebalance_from_n1.
- Do the rows show in the main menu, the settings, or both, and can a player mix rows freely (a custom difficulty) or only pick the presets? The owner wrote "presets" and "rows".
- "Endless" and Zen: what does the end-of-run screen show when the camp is beaten in an Endless run (a milestone toast, no end)? Not given.

## Links
DEC-433.

## Files
`src/world-presets.js` · `src/settings.js` · `src/main.js` (worldPreset menu) · `src/damage.js` · `src/day.js` · `src/economy.js` · `data/parts.js`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.

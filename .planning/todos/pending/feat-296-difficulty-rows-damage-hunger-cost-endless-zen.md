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
Owner said "land it" (2026-11-20, DEC-475) and asked for death / fuel burn / free tows rows and "off" on hunger and cost; built on `land/feat-296-difficulty`. Land it. Owner to confirm DEC-475's readings (what death off does; Classic's 1 free tow; Casual's 3) and tune the [DEFAULT] numbers.

### As built (2026-11-20)
| Row | Levels | What the level writes (src/difficulty.js) |
|---|---|---|
| damage | none · low · **medium** | medium: today. low: wear ×0.6 [DEFAULT] (every class, events too) · every damage onset ×1.25 [DEFAULT] (bump-stop floor and 3 % hit, alignment floor/full, worn-tire puncture forces, rim pinch-flat and yield, rock pop force and pinch energy, crash armor/wheel floor and full speed) · one bump event takes at most 5 % off a spring or wheel [DEFAULT] (3 % after the ×0.6). none: the truck takes nothing (the tutorial's own lock). Fatal crash speed unchanged. |
| hunger | low · **normal** | low: 1 h of grace past empty before the drain starts [DEFAULT] (the word stays "peckish"), the hungry extra drain halved: ×1.125 → ×1.25 instead of ×1.25 → ×1.5. 6 h past empty costs 1.0 h of energy instead of 2.5 h. |
| hunger off | (DEC-475) | off: hunger does nothing (DAY_PARAMS.hungerOn false: no word, no bar, no extra drain). |
| cost scaling | off · low · **normal** | the cost curve's per-day growth: normal 1.065 (day 12 ×2.0, day 20 ×3.3; "medium" before DEC-475, an old save reads as normal), low 1.035 [DEFAULT] (day 12 ×1.46, day 20 ×1.92), off 1 (day-1 prices all run). Parts, repairs, fuel, food and the tow all ride it. |
| fuel burn | off · low · **normal** | × RANGER_PARAMS.fuelBurnScale: low ×0.5 [DEFAULT], off ×0 (the tank never drains). |
| free tows | **1** · 3 · 5 · 10 · infinite | the run's first N tows cost $0 (main.js _towQuote; count saved). The row has no 0, so Classic now has one free tow. |
| death | **on** · off | off: a fatal crash or a breakdown is DEC-001's lost life (main.js _loseLife): the job in hand is abandoned, every part floored at 25 % and the tires reinflated, the tank to ¼ if lower, the truck on the nearest road. Winning and giving up still end the run. |
| endless | **off** · on | on: reaching the expedition camp shows the win card once (summary, grade) with one button, "keep playing"; the save stays, the board keeps posting, prices keep climbing; the run ends only by death or the towel. |

Presets (the setup page's "difficulty" row, easiest first): **zen** = Classic but damage low, cost low, endless on · **casual** = casual world, damage low, hunger low, cost low, fuel low, 3 free tows [DEFAULT] · **classic** = today, plus 1 free tow. Death is on in every preset. Any other mix reads "custom". The rule rows show on story's setup page only; the run copies them at start (run state, saved, never in the world code), the pause menu shows `world 6/K · zen` (or `· custom`: the rows list only on the summary, they widened the pause box), the summary has a "difficulty" row. The tutorial plays Classic whatever the rows say (DEC-151); the run's rules switch on at Larry's welcome.

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
- [x] Rows exist in the settings and in Casual / Classic / Zen presets: damage, hunger, cost scaling, endless
- [x] Damage low: wear multiplier down, event thresholds up (tire rim strike, suspension bump-stop load), suspension cap lower
- [x] Damage none exists, default of no preset
- [x] Hunger low: an hour of grace past empty and energy scaling halved (reading; see Open questions)
- [x] Cost scaling low: the per-day ramp of parts, repairs and fuel flatter
- [x] Endless: beating the expedition camp does not end the run; on by default for Zen only
- [x] Zen preset: low cost scaling, low damage, everything else Classic, Endless on
- [x] The builder lists more rows to suggest (on the card)
- [x] A gate holds the preset table and the Classic identity (`test/difficulty.mjs`; fingerprint-physics identical; no worldgen file touched)
- [x] DEC-475: death on/off, fuel burn normal/low/off, free tows 1/3/5/10/infinite, hunger and cost "off", cost medium → normal
- [x] The pause menu as wide as main's (it named the custom rows inline)
- [ ] Owner has confirmed DEC-475's readings (death off, Classic 1 free tow, Casual 3)
- [ ] Owner has tuned the [DEFAULT] numbers
- [x] Owner has looked (2026-11-20: "good. land it.")

## Open questions
- Hunger low, two readings of "your hunger can deplete slightly lower": built = the counter may fall 1 h below empty before hunger bites (a grace); the scribe's reading = a floor the counter stops at. Owner's pick.
- Damage none: the truck takes nothing, so no fatal crash and no breakdown — with endless on, the run then ends only by the towel or going broke. Fine for a non-preset row?
- CONFLICT, DEC-046: it already rules "lives, free tows, assists, and inflation split into damage, gas and upgrade-and-item knobs" as the story difficulty settings. The new rows (cost scaling = parts, repairs, fuel) overlap its inflation knobs; is the new Cost row the same thing as DEC-046's inflation knobs, or a second layer? Not resolved here.
- CONFLICT, DEC-151: the tutorial disables damage and fuel. Presets must not change the tutorial; the tutorial stays damage-off whatever the row says.
- How low is "low"? The owner gave direction, not numbers: wear multiplier, threshold raise, suspension cap, hunger floor raise, cost ramp. Needs numbers (the builder proposes, the owner approves) per feedback_no_rebalance_from_n1.
- Do the rows show in the main menu, the settings, or both, and can a player mix rows freely (a custom difficulty) or only pick the presets? The owner wrote "presets" and "rows".
- "Endless" and Zen: what does the end-of-run screen show when the camp is beaten in an Endless run (a milestone toast, no end)? Not given.

## Links
DEC-433.

## Files
`data/difficulty.js` · `src/difficulty.js` · `src/settings.js` · `src/main.js` (worldPreset menu, _runRules, _endRun) · `src/damage.js` (springEventCap) · `src/day.js` (hungerGraceH) · `src/economy.js` (dayTierCurve) · `index.html` · `test/difficulty.mjs`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
- 2026-11-20: prototype on `land/feat-296-difficulty`: `data/difficulty.js` + `src/difficulty.js`, setup rows, run state, endless card, debug folder. `test/difficulty.mjs` 25/25, fingerprint-physics identical, affected gates 81/81, smoke 42/42 (endings step covers endless; flake on try 1), pad-e2e OK. Sheet `wip/feat-296/sheet.jpg`. Card `feat296-difficulty-try`; dev server :3296.
- 2026-11-20 (r2, DEC-475): death / fuel burn / free tows rows, hunger and cost "off", cost medium → normal; pause box as wide as main's (212 / 296 px; a custom mix's inline rows made it 528). `test/difficulty.mjs` 32/32, affected gates 81/81, pad-e2e OK, smoke: every step green in some run (smoke5 to opening, smoke9 endings + skipMenus/newRun/pad PASS); opening fails FEAT-305 "mom does not point at the Shop tab" on main too (probe of f62356ff), save / paperScenario load flakes. Death off found a latent `_tutLine` throw outside a GPS leg (06dd045a). Sheet `wip/feat-296/sheet-2.jpg`.

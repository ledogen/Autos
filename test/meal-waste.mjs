// test/meal-waste.mjs — BUG-211 (owner 2026-11-17: "Eating one potato took me to full and then eating another didn't seem
// to increase my hunger any further"). Before eating, the inventory says when a meal would add nothing ('too full') or only
// part of itself ('nearly full'). A warning, never a refusal (the opening's scripted peanuts eat on cue). The rule is DaySystem.mealGainH, the one eat() itself applies,
// so the refusal can never disagree with what eating does. Pure node: DaySystem + InventorySystem, no world.
import { DaySystem, DAY_PARAMS, MEAL_NONE_H as NONE_H } from '../src/day.js'
import { InventorySystem } from '../src/inventory.js'
import { ITEMS, foodHoldH } from '../data/items.js'

let fails = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); if (!ok) fails++ }

const day = new DaySystem({ setTimeOfDay: () => {} })
day.start()
const potH = ITEMS.potatoCooked.hold
// Hungry: the run's starting meal used up, plus an hour.
day.advanceMinutes((DAY_PARAMS.mealHoldH + 1) * 60)
check('starts hungry', day.hungry(), `fedLeft ${day.fedLeftH().toFixed(2)} h`)
check('mealGainH on an empty stomach is the whole meal', Math.abs(day.mealGainH(potH) - potH) < 1e-9)
day.eat(potH)
check(`one cooked potato (${potH} h) fills to its hold`, Math.abs(day.fedLeftH() - potH) < 1e-9, day.hungerWord())
const gain2 = day.mealGainH(potH), left1 = day.fedLeftH()
day.eat(potH)
check('eat() adds exactly what mealGainH said', Math.abs(day.fedLeftH() - left1 - gain2) < 1e-9,
  `gain ${gain2.toFixed(2)} h, fedLeft ${left1.toFixed(2)} → ${day.fedLeftH().toFixed(2)} h`)

// The inventory, wired as main.js wires it: the eat effect plus the BUG-211 note.
const NOTE = { all: 'too full', some: 'nearly full' }   // main.js _MEAL_NOTE's shape
const note = (h) => NOTE[day.mealWaste(h)] ?? null
const inv = new InventorySystem({ slotCap: () => 8,
  effects: { eat: (e) => day.eat(foodHoldH(e.id, false)) },
  notes: { eat: (e) => note(foodHoldH(e.id, false)) } })
inv.start()
inv.grant('potatoCooked', 2)
const nOf = () => inv.list().filter(r => r.id === 'potatoCooked').reduce((k, r) => k + r.n, 0)
// Fill to where a potato adds nothing (the hold rule: already there; a stacking rule, FEAT-250: at its cap).
for (let i = 0; i < 20 && day.mealGainH(potH) >= NONE_H; i++) day.eat(potH)
check('a potato that would add nothing says "too full" before it is eaten', day.mealGainH(potH) < NONE_H && inv.list().find(r => r.id === 'potatoCooked').note === 'too full',
  `gain ${day.mealGainH(potH).toFixed(2)} h, ${day.hungerWord()}`)
check('…and is still eaten when the player insists (a scripted beat eats on cue)', inv.use('potatoCooked') === true && nOf() === 1)
inv.grant('potatoCooked', 1)
// Two hours later part of the potato would land: it is eaten, with the partial-waste warning.
day.advanceMinutes(120)
const g = day.mealGainH(potH)
const r2 = inv.list().find(r => r.id === 'potatoCooked')
check('partly wasted: warned "nearly full", eaten', g >= NONE_H && r2.note === 'nearly full' && inv.use('potatoCooked') === true && nOf() === 1,
  `gain ${g.toFixed(2)} of ${potH} h`)
// Hungry again: no note, the meal is all there.
day.advanceMinutes(10 * 60)
check('hungry: no note, eaten whole', inv.list().find(r => r.id === 'potatoCooked').note === null && inv.use('potatoCooked') === true && nOf() === 0)
// Hunger off (the debug toggle): never refused.
DAY_PARAMS.hungerOn = false
check('hunger off: nothing is ever wasted', day.mealWaste(potH) === null)
DAY_PARAMS.hungerOn = true

console.log(fails ? `\nFAIL: ${fails}` : '\nALL OK')
process.exit(fails ? 1 : 0)

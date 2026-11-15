// test/poi-night.mjs — FEAT-214: the night-light rules, and that every shop/pump/residence model
// still carries a lamp material the table matches (a re-export that renames one silently drops it).
import fs from 'fs'
import { lampsOn, NIGHT_PARAMS as P } from '../src/poi-night.js'
import { PROP_MODELS } from '../data/prop-models.js'
let bad = 0
const ok = (c, m) => { if (!c) { bad++; console.error('FAIL', m) } }
for (const h of [19, 20, 3, 6.9]) ok(lampsOn('shop', h), `shop lit ${h}`)
for (const h of [7, 12, 18.9]) ok(!lampsOn('shop', h), `shop dark ${h}`)
ok(lampsOn('home', 19) && lampsOn('home', 22.9), 'home lit 19..23')
ok(!lampsOn('home', 23) && !lampsOn('home', 2), 'home off after 23')
ok(lampsOn('home', 23.5, true) && lampsOn('home', 2, true), 'home keeps on while offering/delivering')
ok(!lampsOn('home', 12, true) && !lampsOn('home', 18, true), 'daylight: nothing lit')
const names = (k) => { const b = fs.readFileSync(PROP_MODELS[k].url); const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString()); return (j.materials ?? []).map(m => m.name) }
const want = { serviceStation: 'ShopLight', gasStation: 'StationLamp', burgerJoint: 'BurgerLight', generalStore: 'StoreSign', tackleShop: 'TackleSign', gasPump: 'PumpGraphic', trailerHomeA: 'Curtain', winnebago: 'Curtain' }
for (const [k, s] of Object.entries(want)) ok(names(k).some(n => n.includes(s)), `${k} has a ${s} material`)
console.log(bad ? `FAIL ${bad}` : 'PASS poi-night')
process.exit(bad ? 1 : 0)

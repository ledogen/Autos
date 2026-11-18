// Census (FEAT-69, DEC-406): the OFFERED freight-job mass as the board deals it — every freight offer
// live on 40 seeded boards over 5 game days, through OffscreenBoard code (OfferBoard.offers/spec).
// Not a gate. Prints median, share >= 300 kg, a 100 kg histogram and the share per load.
import { OfferBoard } from '../src/offer-board.js'
import { POI_ROSTER } from '../src/poi.js'
const SEEDS = 40, DAYS = 5, T0 = 6
let n = 0
const pois = POI_ROSTER.flatMap(r => Array.from({ length: r.count }, () => {
    n += 2
    return { id: `poi:${n - 1}|${n}`, type: r.type, tags: [r.type, ...(r.tags ?? [])] }
}))
const kg = [], byThing = {}
for (let seed = 1; seed <= SEEDS; seed++) {
    const b = new OfferBoard({ seed, pois, nowH: T0 })
    const seen = new Set()
    for (let d = 0; d < DAYS; d++) for (const id of b.sources()) for (const o of b.offers(id, T0 + 24 * d)) {
        const key = `${seed}|${id}|${o.id ?? o.key ?? JSON.stringify(o)}`
        if (seen.has(key)) continue
        seen.add(key)
        const sp = b.spec(o)
        if (sp.family !== 'freight') continue
        kg.push(sp.massKg); byThing[sp.thingId] = (byThing[sp.thingId] ?? 0) + 1
    }
}
kg.sort((a, b) => a - b)
const ge = kg.filter(x => x >= 300).length
console.log(`freight posts ${kg.length} · median ${kg[kg.length >> 1]} kg · >=300 kg ${(ge / kg.length * 100).toFixed(1)} %`)
const hist = {}
for (const x of kg) { const k = Math.floor(x / 100) * 100; hist[k] = (hist[k] ?? 0) + 1 }
for (const k of Object.keys(hist).sort((a, b) => a - b)) console.log(`${String(k).padStart(4)}-${+k + 99}: ${(hist[k] / kg.length * 100).toFixed(1)} %`)
for (const [t, c] of Object.entries(byThing).sort((a, b) => b[1] - a[1])) console.log(`  ${t.padEnd(18)} ${(c / kg.length * 100).toFixed(1)} %`)

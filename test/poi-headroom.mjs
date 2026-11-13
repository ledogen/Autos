// GATE: EVERY POI GETS ITS OWN PAD, WITH ROOM TO SPARE.
//
// Owner, 2026-11-07 (layby-fallback): "we need to make sure we always have enough headroom to spawn pads
// for all POIs." The census (test/poi-pad-census.mjs, 100 random seeds) found no slot ever falling back
// to a lay-by and none unplaced. The tightest margins, in pads still free once the roster took its picks:
//   farm pad  2468999461   12 usable for 4 needed, 3 left (the thinnest of the hundred)
//   lay-by    2669965563   42 usable for 22 needed, 15 left
// Each seed's story region is built as main.js builds it (test/lib/story-region.mjs), and every seed
// must hold: 0 fallbacks, 0 unplaced, and at least 1 pad of every kind left over. `--seed=<s>` runs one seed.
// Fixed seeds only: a gate must be reproducible, and a random seed that fails once can't be re-run
// (orchestrator, 2026-11-07). To look wider, run the census over fresh random seeds.
//
// Heavy: a full region per seed, ~44 s of CPU each (~88 s).
import { buildStoryRegion } from './lib/story-region.mjs'

const THIN = ['2468999461', '2669965563']
const ONLY = (process.argv.find((a) => a.startsWith('--seed=')) || '').split('=')[1]
const seeds = ONLY ? [ONLY] : THIN

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

for (const s of seeds) {
    const t0 = Date.now()
    const r = buildStoryRegion(s)
    console.log(`seed ${s}  ${((Date.now() - t0) / 1000).toFixed(0)} s  · ` +
                Object.entries(r.kinds).map(([k, v]) => `${k} ${v.usable} usable / ${v.needed} needed / ${v.left} left`).join(' · '))
    const fb = r.slots.filter((x) => x.fallback), miss = r.slots.filter((x) => x.missing)
    check('no slot falls back to a lay-by', !fb.length, fb.map((x) => `${x.slot} ×${x.fallback}`).join(', '))
    check('every slot is filled', !miss.length, miss.map((x) => `${x.slot} short ${x.missing}`).join(', '))
    for (const [k, v] of Object.entries(r.kinds))
        check(`a ${k} pad is left over (${v.left})`, v.left >= 1, `${v.usable} usable for ${v.needed} needed`)
}

if (fails) { console.log(`\npoi-headroom: ${fails} FAIL`); process.exit(1) }
console.log('\npoi-headroom: all ok')

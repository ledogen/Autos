// GATE: THE SEED IS AN ABSOLUTE DETERMINISM MACHINE.
//
// Owner ruling, 2026-08-10: "world generation strictly determined by the world seed, not also the
// player location — treat seeds as absolute determinism machines". This gate is what makes that a
// property of the codebase rather than a belief about it.
//
// The claim has three links, and all three are asserted here because breaking any one breaks it:
//
//   1. THE SPAWN IS A PURE FUNCTION OF THE SEED. It is resolved by probing the streamed road network
//      (`queryNearest` at two tier radii), so it *could* depend on what happened to be streamed when
//      the probe ran — a session that drove 3 km, or warmed a 2500 m story region, holds far more
//      network than a cold boot. It must not.
//
//   2. THE REGION CENTRE IS THE SPAWN. Story entry reseats before it captures the centre — both
//      branches, `applySeed` on a seed change and `reseat` when the seed is already loaded
//      (story.js `enter` → `_beginWarm`). So the centre inherits link 1's purity, and where the
//      player was standing when they opened the menu cannot reach world generation.
//
//   3. WHAT THE REGION CONTAINS IS A PURE FUNCTION OF (SEED, CENTRE). The registered network graph,
//      the POI candidate pool, the roster and the newspaper customers must be identical from any
//      prior streaming history. This is the link BUG-25's window-bounded crossing cull threatens —
//      it can flip whole edges on a re-stream, and a flipped edge is a pad that exists or doesn't.
//
// Heavy: builds real streamed, routed networks several times over.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

// The streaming histories a real session actually produces before story mode is (re-)entered.
// `null` is the cold boot every other history is compared against.
//
// COST IS THE REASON THIS IS SPLIT, and the split is stated rather than hidden. Laying down a wide
// history is itself a full stream, so running every seed against every history costs 18 minutes —
// which would make this the slowest gate in the suite by 6x and get it skipped. Instead: every seed
// meets the CHEAP histories (a play-radius stream, which is what an ordinary session leaves), and a
// subset meets the WIDE ones (which is what a warmed story region leaves). The wide case is the one
// that actually threatens the claim, so it keeps real seeds — it just does not need ten of them.
const CHEAP = [
    ['idled at spawn (320 m)',  { x: 0, z: 0, r: 320 }],
    ['drove 3 km away (320 m)', { x: 3000, z: 0, r: 320 }],
]
// WIDE means "wider than the play radius, centred somewhere else" — that is the shape of the threat
// (a bigger window feeds a different edge set to BUG-25's crossing cull), and 1500 m carries it. A
// 2500 m pre-stream was measured and adds nothing but eight minutes.
const WIDE = [
    ['a warmed 1500 m region, off-centre', { x: 800, z: -600, r: 1500 }],
]

// ── 1. the spawn is a pure function of the seed ─────────────────────────────────────────────────
// Five seeds, not fifteen. Every probe streams the spawn tier band (~1160 m) before it can answer,
// so seeds are the gate's main cost driver — and the property under test is structural, not
// per-seed: a spawn that survives a history on five seeds is not going to fail on a sixth for a
// reason five did not expose. Measured: 15 seeds cost 11 minutes, these five cost ~4.
const SEEDS = [6, 90, 42, 777, 31337]
const WIDE_SEEDS = [6, 90]
{
    let moved = 0, offRoad = 0, probes = 0
    for (const seed of SEEDS) {
        const head = spawnDecision(seed, RANGER_PARAMS)
        if (!head.onRoad) { offRoad++; continue }
        const histories = CHEAP.concat(WIDE_SEEDS.includes(seed) ? WIDE : [])
        for (const [name, pre] of histories) {
            probes++
            const d = spawnDecision(seed, RANGER_PARAMS, { pre })
            const same = d.onRoad && d.x === head.x && d.z === head.z && d.heading === head.heading
            if (!same) {
                moved++
                check(`seed ${seed}: spawn survives "${name}"`, false,
                    d.onRoad ? `moved ${Math.hypot(d.x - head.x, d.z - head.z).toFixed(2)} m` : 'went off-road')
            }
        }
    }
    check('the spawn is identical under every prior streaming history', moved === 0,
        `${moved} of ${probes} probes moved`)
    console.log(`       ${probes} probes: ${SEEDS.length} seeds x cheap histories,`
        + ` ${WIDE_SEEDS.length} of them x wide histories`
        + `${offRoad ? ` (${offRoad} seed(s) spawn off-road — the terrain fallback, not a failure)` : ''}`)
}

// ── 2/3. what the region CONTAINS is a pure function of (seed, centre) ──────────────────────────
//
// Fingerprints the whole placement layer, not just the roster: the graph it reads, the pool it
// selects from, and every choice made out of that pool. A difference anywhere here means two
// players on one seed — or one player entering twice — get different worlds.
function regionFingerprint (seed, C, pre) {
    const road = new RoadSystem(seed, RANGER_PARAMS)
    if (pre) { road.setRadius(pre.r); road.update(new THREE.Vector3(pre.x, 0, pre.z)) }
    // 1600 m, not the live 2500: this gate asserts HISTORY-INDEPENDENCE, and the radius is not the
    // variable under test — story-poi.mjs uses the same window for the same reason. At 2500 the
    // gate ran 11 minutes and would have been the slowest in the suite by 4x.
    const R = 1600
    road.setRadius(R)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    const terrain = makeTerrainHeadless(seed, RANGER_PARAMS, road)
    const water = new WaterSystem(seed, RANGER_PARAMS, (x, z) => terrain.rawHeightWorld(x, z))
    const poi = new PoiSystem({
        getRoad: () => road, getWater: () => water, getTerrain: () => terrain,
        getSeed: () => seed, getParams: () => RANGER_PARAMS,
    })
    poi.build(C, R)
    poi.buildHouses(C, R)
    const g = road.networkGraph()
    const idKey = (id) => `${id[0]},${id[1]},${id[2]}`
    const edges = [...new Set(g.edges.map(([a, b]) => [idKey(a), idKey(b)].sort().join('|')))].sort()
    return {
        edges:     edges.join(','),
        edgeCount: edges.length,
        pool:      poi.pool().map(q => q.id).sort().join(','),
        poolCount: poi.pool().length,
        roster:    poi.list().map(q => `${q.type}@${q.id}`).sort().join(','),
        customers: poi.houses().map(h => h.id).sort().join(','),
    }
}

// Each fingerprint builds a FULL 2500 m region (road + terrain + water + POI + houses), so this is
// the expensive half and it buys coverage carefully: two seeds, against the one history that
// actually threatens the claim — a warmed story region, which is exactly the re-entry case the
// owner hit. The cheap histories are covered by the spawn section above, and a spawn that does not
// move cannot move the region.
for (const [seed, C] of [[6, { x: 4500, z: 600 }], [90, { x: -72.27, z: 140.48 }]]) {
    const head = regionFingerprint(seed, C, null)
    console.log(`       seed ${seed}: ${head.edgeCount} edges · pool ${head.poolCount}`)
    for (const [name, pre] of [WIDE[0]]) {
        const d = regionFingerprint(seed, C, pre)
        check(`seed ${seed}: the registered network survives "${name}"`,
            d.edges === head.edges, `${head.edgeCount} → ${d.edgeCount} edges`)
        check(`seed ${seed}: the POI candidate pool survives "${name}"`,
            d.pool === head.pool, `${head.poolCount} → ${d.poolCount} pads`)
        check(`seed ${seed}: the roster survives "${name}"`, d.roster === head.roster)
        check(`seed ${seed}: the newspaper customers survive "${name}"`, d.customers === head.customers)
        // The floor under all of it — asserted on ONE seed, because "the same inputs give the same
        // answer" is not seed-specific and each build is ~45 s.
        if (seed === 6) {
            const again = regionFingerprint(seed, C, pre)
            check('the same (seed, centre, history) built twice is byte-identical',
                again.edges === d.edges && again.pool === d.pool && again.roster === d.roster
                && again.customers === d.customers)
        }
    }
}

// ── 4. THE LIVE PATH MUST NOT BYPASS resolveSpawn ──────────────────────────────────────────────
//
// Everything above measures `resolveSpawn`, which is pure in the seed. The live game can SKIP it:
// `_reseatTruckAtSpawnInner` checks `_spawnOverride` FIRST, and a free-roam teleport leaves one set.
// The region centre is then captured from wherever the truck landed, so the world follows the player
// — teleport to Larry's, exit to free roam, re-enter the same seed, and every POI has moved (owner,
// 2026-08-11). No headless harness can see that: it is main.js/story.js wiring, not worldgen.
//
// So this is a SOURCE-TEXT check, in the same spirit as paper-route.mjs's SM-INV-4 guard. It is
// crude on purpose — it cannot prove the wiring works, only that the load-bearing line is still
// there. The measurements above are worthless in practice if it is ever deleted.
{
    const { readFileSync } = await import('node:fs')
    const story = readFileSync(new URL('../src/story.js', import.meta.url), 'utf8')
    const main  = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    check('story entry drops the free-roam spawn override (the seed decides where the world is)',
        /clearSpawnOverride\??\.?\(\)/.test(story),
        'src/story.js enter() no longer calls clearSpawnOverride')
    check('…and main.js supplies it', /clearSpawnOverride\s*:/.test(main))
    check('…and it is dropped BEFORE the world settles, not after',
        story.indexOf('clearSpawnOverride') < story.indexOf('this._d.applySeed(seed)'),
        'the override must be gone before applySeed/reseat runs, or the reseat still honours it')
    // The trap that made this necessary: the override is consulted ahead of resolveSpawn.
    check('the spawn override is still consulted ahead of resolveSpawn (this check is still needed)',
        main.indexOf('if (_spawnOverride)') < main.indexOf('resolveSpawn(worldSeed'),
        'if this flipped, re-read whether the guard above is still the right shape')
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL WORLD-DETERMINISM CHECKS PASSED')
process.exit(fails ? 1 : 0)

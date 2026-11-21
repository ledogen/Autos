// GATE (BUG-226, DEC-459): a refused seed re-rolls to a seed DERIVED from it (seed.js rerollSeed), so every player who
// types it lands on the same replacement world. Two cold story-region builds of a seed the story check refuses
// (DEC-054) each reach the same replacement, and the replacement builds playable. The swap itself is main.js
// onSeedRejected (read from source: it must call rerollSeed and never draw Math.random for a refused seed).
// Heavy: routes three regions (~25 s each).
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed, rerollSeed } from '../src/seed.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

let fails = 0
const check = (label, ok, detail = '') => { console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`); if (!ok) fails++ }

// What story entry does for a seed: spawn, warm the region, validate. Cold = a fresh RoadSystem each call.
const playable = (str) => {
    const seed = parseWorldSeed(str), sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
    const road = new RoadSystem(seed, P); wirePondNoGo(road, seed, P)
    road.setRadius(REGION_WARM_RADIUS_M); road.update(new THREE.Vector3(C.x, 0, C.z))
    return validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P).playable
}

const REFUSED = '914219767'   // BUG-226's seed: one road cannot be given a drivable profile
const a = rerollSeed(REFUSED), b = rerollSeed(REFUSED)
check(`${REFUSED} is refused on this build`, playable(REFUSED) === false, 'pick another refused seed (the ticket lists 873064618)')
check('the replacement is the same on every call, a number, and a different seed', a === b && /^\d+$/.test(a) && a !== REFUSED, `${a} ${b}`)
check(`replacement ${a} builds playable`, playable(a) === true, 'a chained refusal would re-roll again, deterministically; pick another seed for this gate')
check('a text seed re-rolls too', rerollSeed('w') === rerollSeed('w') && rerollSeed('w') !== rerollSeed('x'))
const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
const fn = src.slice(src.indexOf('onSeedRejected: (seed, report) =>'), src.indexOf('hidePauseMenu: () =>'))
check('onSeedRejected re-rolls through rerollSeed, not a random draw', fn.includes('rerollSeed(seed)') && !fn.includes('_resolveSeed(') && !fn.includes('Math.random'))
console.log(fails ? `FAIL (${fails})` : 'PASS')
process.exit(fails ? 1 : 0)

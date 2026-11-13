// test/network-client-world.mjs — BUG-152: every build request the network client posts describes ONE world.
// Its seed is the seed of the road the entry is FOR, and its pond discs are that same seed's. The client is
// driven through the reseed race that re-sited the story POI roster about one session in 40: the menu world's
// road keeps streaming through the 150 ms rebuild debounce while the live seed already names the story world.
// Before the fix the client posted the LIVE seed beside the old water's discs, so the worker minted the story
// seed's instance with the menu world's ponds and kept them (BUG-106: the pond store only grows). A fake Worker
// records the posts; a fake water hands out discs that name their world. No worldgen.
import { RANGER_PARAMS } from '../data/ranger.js'

const posted = []
globalThis.Worker = class { postMessage (m) { posted.push(m) } }
const { RoadNetworkClient } = await import('../src/road-network-client.js')

const S0 = 1707064627, S1 = 336086702   // the probe's odd session: menu seed → the story seed
let liveSeed = S0, waterSeed = S0
const pond = (seed) => [seed % 100000, 0, 10]   // one disc whose x names the world it came from
const client = new RoadNetworkClient({
  getSeed: () => liveSeed,
  getParams: () => RANGER_PARAMS,
  // main.js's _pondDiscs contract: the world asked for, or null when the water on hand is another world's
  // (a 4-argument call is the main-thread router's, which always reads the water on hand).
  getPondDiscs: (x0, z0, x1, z1, seed) => seed === undefined || (seed >>> 0) === waterSeed ? pond(waterSeed) : null,
})
let adopted = []
const road = (seed) => ({
  _worldSeed: seed, routeEpoch: () => 1, holdsWindow: () => false, setNetworkDispatcher () {},
  adoptNetwork (data) { adopted.push({ road: seed, data }) },
})
const reply = (seed) => client._onReply({ type: 'network', client: 'play', epoch: 1, seed, data: { seed } })

let bad = 0
const check = (ok, what) => { if (!ok) { bad++; console.log(`  ✗ ${what}`) } }
const coherent = (m) => m.pondDiscs[0] === m.seed % 100000
const within = (p) => Promise.race([p, new Promise(r => setTimeout(() => r('never resolved'), 200))])   // a lost waiter must fail, not hang

// 1. The menu world streams: one build in flight.
const road0 = road(S0)
client.register('play', road0)
client.request('play', { x: 224, z: 288, radius: 320 })
check(posted.length === 1 && posted[0].seed === S0 && coherent(posted[0]), 'the menu world posts its own build')
// 2. Story entry flips the live seed; the old road is still registered and asks for the truck's window.
liveSeed = S1
client.request('play', { x: 347.232, z: 327.239, radius: 320 })
reply(S0)   // the menu build lands stale and the queued one posts
check(posted.length === 2, 'the queued menu build posts when the stale reply lands')
check(posted[1]?.seed === S0, `a request carries its road's seed, not the live one (posted ${posted[1]?.seed}, road ${S0})`)
check(posted.every(coherent), "a request's pond discs are its own seed's")
reply(posted[1]?.seed)
check(adopted.length === 0, 'no stale reply is adopted')
// 3. The rebuild swaps the road before the water: a request in that gap must not post.
const road1 = road(S1)
client.register('play', road1)
const n = posted.length
const gap = await within(client.buildNow('play', -32, -32, 672))
check(posted.length === n && gap === false, 'a request whose world has no water yet is stale, never posted')
// 4. Once the world is whole the story road builds normally and adopts.
waterSeed = S1
const live = client.buildNow('play', -32, -32, 672)
check(posted.length === n + 1 && posted.at(-1).seed === S1 && coherent(posted.at(-1)), 'the story road posts its own world')
reply(S1)
check(await within(live) === true && adopted.length === 1 && adopted[0].road === S1, 'and adopts it')

const ok = bad === 0
console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} network client posts one world per build request\n        ${posted.length} posts · ${posted.map(m => `${m.seed}/${m.pondDiscs[0]}`).join(' ')} · ${bad} wrong`)
process.exit(ok ? 0 : 1)

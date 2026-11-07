// CENSUS (not a gate): node test/poi-pad-census.mjs --seed=<s>   → one JSON line on stdout
//
// Does every roster slot get its OWN pad kind, and how much room is left? For one seed it builds the story
// region as main.js does and prints test/lib/story-region.mjs's headroom: per roster slot placed on its own
// pad kind / fell back to a lay-by / not placed, and per pad kind usable / needed / left.
// test/poi-headroom.mjs gates the thinnest seeds this found.
//
// Fan it out over seeds two at a time (lanes share one machine: at most 2 heavy processes per lane), each
// seed to its own file:
//   node -e 'for(let i=0;i<100;i++)console.log(Math.random()*2**32>>>0)' > seeds.txt
//   mkdir -p out; while read s; do while [ $(pgrep -f '^node test/poi-pad-census' | wc -l) -ge 2 ]; do sleep 5; done
//     node test/poi-pad-census.mjs --seed=$s > out/$s.json & sleep 2; done < seeds.txt; wait
// Heavy: routes a full region per seed (~35 s of CPU).
import { buildStoryRegion } from './lib/story-region.mjs'

const s = (process.argv.find((a) => a.startsWith('--seed=')) || '').split('=')[1]
if (!s) { console.error('usage: --seed=<s>'); process.exit(2) }
const r = buildStoryRegion(s)
console.log(JSON.stringify({
    seed: s, playable: r.rep.playable, stranded: r.rep.stranded.length, camp: r.out.some((q) => q.type === 'expeditionCamp'),
    cubes: r.out.filter((q) => !q.modelKey).map((q) => q.type),
    slots: r.slots, kinds: r.kinds,
}))

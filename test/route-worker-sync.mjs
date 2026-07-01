// test/route-worker-sync.mjs — PERF-03 Workstream A determinism gate.
//
// Road routing (arcPrimitiveConnect + dubins helpers + search scratch) is copied VERBATIM from the
// canonical src/road-carve.js "ROUTE SYNC" region into the dedicated road-network Worker
// (ROAD_WORKER_SOURCE in src/road-worker.js) so it can run off the main thread. (QUAL-08 moved this
// mirror out of the terrain Worker — terrain is now heightfield-only, see BUG-26.) The pre-warmed route cache is only safe if the
// worker's routes are byte-identical to the main-thread synchronous fallback — i.e. the two copies of
// the code agree. This gate asserts that, catching copy drift (the one new failure mode WS-A adds).
//
// The worker copy lives inside a backtick template literal, so backticks (and ${) in the routing
// COMMENTS are escaped at splice time; this gate reverses that escaping before comparing. The only
// other allowed difference is the leading `export ` on arcPrimitiveConnect, which the worker drops.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const carve   = readFileSync(join(ROOT, 'src/road-carve.js'), 'utf8')
const worker  = readFileSync(join(ROOT, 'src/road-worker.js'), 'utf8')

const START    = '// ── arcPrimitiveConnect search scratch'
const CARVE_END = '// ROUTE SYNC END'
const WORK_END  = '// ROUTE SYNC END (verbatim mirror'

function region(src, start, end, label) {
  const a = src.indexOf(start), b = src.indexOf(end)
  if (a < 0 || b < 0) {
    console.error(`[FAIL] could not locate ROUTE SYNC region in ${label} (start@${a}, end@${b})`)
    process.exit(1)
  }
  return src.slice(a, b).replace(/\s+$/, '')
}

// Canonical: drop the export keyword the worker copy can't have.
const canon = region(carve, START, CARVE_END, 'road-carve.js')
  .replace(/^export function arcPrimitiveConnect/m, 'function arcPrimitiveConnect')

// Worker copy: reverse the template-literal escaping applied when it was spliced in.
const copy = region(worker, START, WORK_END, 'road-worker.js ROAD_WORKER_SOURCE')
  .replace(/\\\$\{/g, '${')
  .replace(/\\`/g, '`')
  .replace(/\\\\/g, '\\')

if (canon === copy) {
  console.log('[PASS] ✓ ROUTE-SYNC — worker routing copy is byte-identical to road-carve.js canonical')
  console.log(`        (${canon.split('\n').length} lines verified)`)
  console.log('\nROUTE-WORKER-SYNC GATE: 1 pass, 0 FAIL — exit 0')
  process.exit(0)
}

let i = 0
while (i < canon.length && i < copy.length && canon[i] === copy[i]) i++
console.error(`[FAIL] ✗ ROUTE-SYNC drift at offset ${i} (lengths canon=${canon.length} copy=${copy.length})`)
console.error('  canonical: ' + JSON.stringify(canon.slice(Math.max(0, i - 50), i + 50)))
console.error('  worker   : ' + JSON.stringify(copy.slice(Math.max(0, i - 50), i + 50)))
console.error('\nROUTE-WORKER-SYNC GATE: 0 pass, 1 FAIL — exit 1')
process.exit(1)

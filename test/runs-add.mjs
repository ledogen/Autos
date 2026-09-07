// test/runs-add.mjs — import exported story-mode runs into a versioned run library.
//
// The in-game "export run" button drops a file in the browser's download directory. This moves it
// into the library under a canonical, sortable name and refuses to overwrite. See runs/README.md.
//
//   npm run runs:add                        # every rangersim-run-*.json in ~/Downloads -> runs/
//   npm run runs:add -- <file|dir> [...]    # explicit paths
//   npm run runs:add -- --dir=runs-v2 ...   # import into a DIFFERENT library
//   npm run runs:add -- --router=v1 ...     # override the stamped router version (see below)
//
// WHY --dir EXISTS (BUG-41 Stage 2): a corpus is only fittable against the ROADS it was driven on.
// PAR_REF was fitted 2026-08-16 on router-v1 roads; v2 took over 2026-08-18 with measurably
// different corners, and par's dominant dial is corner speed. So the v1 corpus in `runs/` must stay
// intact as the historical record AND must never be averaged into a v2 fit — two libraries, and
// `calibrate-par.mjs [runsDir]` already takes the directory to fit.
//
// Every run also carries `road_router` so the split survives files being moved or merged later.
// Exports from 2026-09-06 on are stamped at capture (main.js, from road.js ROAD_ROUTER_VERSION);
// anything older is backfilled HERE, from the router this build ships, and the import log says so
// per file. That default is right for a fresh download and wrong for re-importing an archived v1
// run — pass --router explicitly in that case.
//
// Not a gate.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, unlinkSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import { homedir } from 'node:os'
import { ROAD_ROUTER_VERSION } from '../src/road.js'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const flag = (name) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}
const RUNS = resolve(ROOT, flag('dir') ?? 'runs')
const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const KEEP = process.argv.includes('--keep')     // don't delete the source file
const ROUTER = flag('router') ?? ROAD_ROUTER_VERSION

if (!existsSync(RUNS)) { console.error(`no such library directory: ${RUNS}\n(create it first — an accidental typo must not silently start a new corpus)`); process.exit(1) }
console.log(`library: ${RUNS}`)

const sources = []
for (const a of (args.length ? args : [join(homedir(), 'Downloads')])) {
  const p = resolve(a)
  if (!existsSync(p)) { console.error(`no such path: ${p}`); continue }
  if (statSync(p).isDirectory()) {
    for (const f of readdirSync(p)) if (/^rangersim-run-.*\.json$/.test(f)) sources.push(join(p, f))
  } else sources.push(p)
}
if (!sources.length) { console.log('nothing to import (looked for rangersim-run-*.json)'); process.exit(0) }

// Next free sequence number, so the library reads in the order it was driven.
const existing = readdirSync(RUNS).filter(f => f.endsWith('.json'))
let seq = existing.reduce((m, f) => Math.max(m, parseInt(f.slice(0, 4), 10) || 0), 0)

let added = 0, skipped = 0
for (const src of sources) {
  let run
  try { run = JSON.parse(readFileSync(src, 'utf8')) } catch { console.log(`skip (unparseable): ${basename(src)}`); skipped++; continue }
  // Accept any run-export version (/1 pre-baked terrain+corners, /2 raw topology rows). runs-report
  // derives the calibration features from whichever shape a run carries.
  if (!/^rangersim-run-export\/\d+$/.test(run.format ?? '')) { console.log(`skip (not a run export): ${basename(src)}`); skipped++; continue }

  // Same route + same time = same run; don't let a re-download duplicate the dataset.
  const dup = existing.find(f => {
    const o = JSON.parse(readFileSync(join(RUNS, f), 'utf8'))
    return o.result?.elapsed_s === run.result?.elapsed_s
      && o.route?.distance_m === run.route?.distance_m
  })
  if (dup) { console.log(`skip (already in library as ${dup}): ${basename(src)}`); skipped++; continue }

  // Stamp WHICH ROADS this was driven on if the capture did not (exports predating 2026-09-06).
  // Recorded per file in the log so a wrong assumption is visible at import time, not discovered
  // months later inside a fit.
  let stamped = ''
  if (!run.road_router) { run.road_router = ROUTER; stamped = `   [road_router=${ROUTER}, backfilled]` }
  else if (run.road_router !== ROUTER) { stamped = `   ⚠ road_router=${run.road_router}, library default ${ROUTER}` }

  const felt = run.felt ?? 'unlabelled'
  const km = ((run.route?.distance_m ?? 0) / 1000).toFixed(1)
  const name = `${String(++seq).padStart(4, '0')}-${felt}-${run.result?.letter ?? 'x'}`
             + `-${Math.round(run.result?.elapsed_s ?? 0)}s-${km}km.json`
  writeFileSync(join(RUNS, name), JSON.stringify(run, null, 2) + '\n')
  existing.push(name)
  if (!KEEP) { try { unlinkSync(src) } catch {} }
  console.log(`added ${name}${run.felt ? '' : '   ⚠ no `felt` label — of little calibration use'}${stamped}`)
  added++
}
console.log(`\n${added} added, ${skipped} skipped · library now ${readdirSync(RUNS).filter(f => f.endsWith('.json')).length} runs`)

// test/runs-add.mjs — import exported story-mode runs into the versioned run library (runs/).
//
// The in-game "export run" button drops a file in the browser's download directory. This moves it
// into runs/ under a canonical, sortable name and refuses to overwrite. See runs/README.md.
//
//   npm run runs:add                        # every rangersim-run-*.json in ~/Downloads
//   npm run runs:add -- <file|dir> [...]    # explicit paths
//
// Not a gate.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, unlinkSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import { homedir } from 'node:os'

const RUNS = resolve(new URL('..', import.meta.url).pathname, 'runs')
const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const KEEP = process.argv.includes('--keep')     // don't delete the source file

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
  if (run.format !== 'rangersim-run-export/1') { console.log(`skip (not a run export): ${basename(src)}`); skipped++; continue }

  // Same route + same time = same run; don't let a re-download duplicate the dataset.
  const dup = existing.find(f => {
    const o = JSON.parse(readFileSync(join(RUNS, f), 'utf8'))
    return o.result?.elapsed_s === run.result?.elapsed_s
      && o.route?.distance_m === run.route?.distance_m
  })
  if (dup) { console.log(`skip (already in library as ${dup}): ${basename(src)}`); skipped++; continue }

  const felt = run.felt ?? 'unlabelled'
  const km = ((run.route?.distance_m ?? 0) / 1000).toFixed(1)
  const name = `${String(++seq).padStart(4, '0')}-${felt}-${run.result?.letter ?? 'x'}`
             + `-${Math.round(run.result?.elapsed_s ?? 0)}s-${km}km.json`
  writeFileSync(join(RUNS, name), JSON.stringify(run, null, 2) + '\n')
  existing.push(name)
  if (!KEEP) { try { unlinkSync(src) } catch {} }
  console.log(`added ${name}${run.felt ? '' : '   ⚠ no `felt` label — of little calibration use'}`)
  added++
}
console.log(`\n${added} added, ${skipped} skipped · library now ${readdirSync(RUNS).filter(f => f.endsWith('.json')).length} runs`)

// GATE: every inline <script> in the owner's tracker pages (.planning/pages/*.html) parses.
//
// The pages are hand-edited JS inside HTML and published as artifacts. A single missing comma once
// shipped the Alpha Lanes tracker dead ("connecting to the store…", 2026-11-01). Parse only — vm.Script
// compiles the code without running it, so the page's browser globals are never touched.
import { readdirSync, readFileSync } from 'node:fs'
import { Script } from 'node:vm'

const DIR = new URL('../.planning/pages/', import.meta.url)
let fails = 0, n = 0
for (const f of readdirSync(DIR).filter(f => f.endsWith('.html'))) {
  const html = readFileSync(new URL(f, DIR), 'utf8')
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
  scripts.forEach((code, i) => {
    n++
    try { new Script(code, { filename: `${f}#script${i}` }); console.log(`[ ok ] ${f} script ${i}`) }
    catch (e) { fails++; console.log(`[FAIL] ${f} script ${i}  ${e.message}`) }
  })
}
if (!n) { console.log('[FAIL] no inline scripts found — the glob or the regex is wrong'); fails++ }
console.log(fails ? `${fails} FAILED` : `PASS (${n} scripts)`)
process.exit(fails ? 1 : 0)

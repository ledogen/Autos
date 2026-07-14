// test/run-all.mjs — the `npm test` entry point. Runs headless gates, each in its own node
// child process (so a process.exit(1) in one gate doesn't abort the runner, and gates stay
// isolated). Exits non-zero if ANY gate fails.
//
// SELECTION (default = AFFECTED): `npm test` runs only the gates whose code your working tree
// actually touched. It builds the src/data/test import graph live from disk, computes each gate's
// transitive reachable-file set (+ manifest extraDeps for import-invisible coupling), and selects
// gates whose set intersects `git diff` (vs HEAD, incl. untracked). So a physics edit runs the
// physics gates, a prop-slider tweak the prop gates, a skybox edit nothing. Keeps the nominal loop
// fast; the full suite is a deliberate pre-commit / desktop action.
//   (no flags)     affected mode (default)
//   --all          every gate (also: `npm run test:all`) — run before commits / in CI
//   --only=<substr>[,<substr>]   explicit subset by gate-name substring
//   --serial       one-at-a-time (pool=1), e.g. to time a single gate without pool contention
// If not in a git repo / git is unavailable, affected mode falls back to running ALL gates (safe).
//
// PERF-08: selected gates run CONCURRENTLY on a small pool (isolated pure-node processes — no
// ports, no shared files, deterministic math), cutting wall time toward the slowest gate. Output
// is buffered per gate and printed whole on completion so logs stay grouped. Slowest gates are
// summarized at the end — if the suite creeps, the table names the culprit.
//
// The gate list + per-gate metadata (subsystem / cost / description / extraDeps) live in
// test/gates.mjs — add gates there.

import { spawn, execFileSync } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { GATES } from './gates.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))   // .../test
const ROOT = dirname(HERE)                             // repo root
const rel = abs => relative(ROOT, abs).split('\\').join('/')   // repo-relative posix path

// ── Import graph (live from disk) ────────────────────────────────────────────
// Scan src/, data/, test/ for relative `import ... from '...'` / `import('...')` edges and build
// file → {imported files}. Only relative specifiers matter (bare 'three' / 'node:*' are ignored).
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g
function walk (dir, exts, out = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full, exts, out)
        else if (exts.some(e => name.endsWith(e))) out.push(full)
    }
    return out
}
function buildGraph () {
    const files = [
        ...walk(join(ROOT, 'src'), ['.js']),
        ...walk(join(ROOT, 'data'), ['.js']),
        ...walk(join(ROOT, 'test'), ['.mjs']),
    ]
    const graph = new Map()
    for (const abs of files) {
        const src = readFileSync(abs, 'utf8')
        const deps = new Set()
        for (const m of src.matchAll(IMPORT_RE)) {
            try { deps.add(rel(resolve(dirname(abs), m[1]))) } catch {}
        }
        graph.set(rel(abs), deps)
    }
    return graph
}
// Transitive files a gate depends on. extraDeps are exact-file triggers: added but NOT traversed
// (the coupling is to that file's literal content, e.g. a text mirror — not its imports).
function reachable (gate, graph) {
    const start = `test/${gate.file}`
    const seen = new Set([start])
    const stack = [start]
    while (stack.length) {
        for (const dep of graph.get(stack.pop()) || []) if (!seen.has(dep)) { seen.add(dep); stack.push(dep) }
    }
    for (const d of gate.extraDeps || []) seen.add(d)
    return seen
}
function gitChanged () {
    try {
        const run = a => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).split('\n')
        return new Set([
            ...run(['diff', '--name-only', 'HEAD']),
            ...run(['ls-files', '--others', '--exclude-standard']),
        ].map(s => s.trim()).filter(Boolean))
    } catch { return null }   // not a git repo / git unavailable
}

// ── Gate selection ───────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const SERIAL = argv.includes('--serial')
const ALL = argv.includes('--all')
const LIST = argv.includes('--list')   // print the selection and exit (don't run) — preview what a change hits
const only = argv.find(a => a.startsWith('--only='))?.slice(7).split(',')
// --changed=<a,b,...> overrides the git diff (preview selection for a hypothetical edit set).
const changedOverride = argv.find(a => a.startsWith('--changed='))?.slice(10).split(',').map(s => s.trim()).filter(Boolean)

let gates, header
if (ALL) {
    gates = GATES
    header = `mode: ALL — ${gates.length} gates`
} else if (only) {
    gates = GATES.filter(g => only.some(s => g.file.includes(s)))
    if (!gates.length) { console.error(`--only matched no gates`); process.exit(1) }
    header = `mode: --only — ${gates.length}/${GATES.length} gates`
} else {
    const changed = changedOverride ? new Set(changedOverride) : gitChanged()
    if (changed === null) {
        gates = GATES
        header = `mode: AFFECTED — ⚠ not a git repo / git unavailable, running ALL ${gates.length} gates`
    } else {
        const graph = buildGraph()
        gates = GATES.filter(g => [...reachable(g, graph)].some(f => changed.has(f)))
        const bySub = {}
        for (const g of gates) bySub[g.subsystem] = (bySub[g.subsystem] || 0) + 1
        const heavy = gates.filter(g => g.cost === 'heavy').length
        const subs = Object.entries(bySub).map(([s, n]) => `${s}:${n}`).join(' ') || '—'
        header = `mode: AFFECTED — ${gates.length}/${GATES.length} gates selected [${subs}]`
            + `${heavy ? ` · ${heavy} heavy` : ''} · from ${changed.size} changed file(s)`
        if (!gates.length) {
            console.log(`\n${'═'.repeat(64)}`)
            console.log(header)
            const srcChanged = [...changed].filter(f => f.startsWith('src/') || f.startsWith('data/'))
            console.log(`no gates cover these changes${srcChanged.length ? `: ${srcChanged.slice(0, 8).join(', ')}` : ''}`)
            console.log(`(edits to glue/entry code like src/main.js are gate-free by design) · run \`npm run test:all\` for full coverage`)
            console.log(`${'═'.repeat(64)}`)
            process.exit(0)
        }
    }
}

// --list: show the selection and exit without running (preview what a change hits).
if (LIST) {
    console.log(header)
    for (const g of gates) console.log(`  ${g.cost === 'heavy' ? '⛰' : '·'} ${g.file.replace('.mjs', '').padEnd(32)} [${g.subsystem}]`)
    process.exit(0)
}

// ── Run ──────────────────────────────────────────────────────────────────────
const POOL = SERIAL ? 1 : Math.max(2, Math.min(8, availableParallelism() - 2))

const runGate = gate => new Promise(resolve => {
    const t0 = performance.now()
    const child = spawn('node', [join(HERE, gate.file)], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', d => out += d)
    child.stderr.on('data', d => out += d)
    child.on('close', status => {
        const secs = (performance.now() - t0) / 1000
        console.log(`\n${'━'.repeat(64)}\n▶ ${gate.file} — ${secs.toFixed(1)}s ${status === 0 ? '✓' : '✗ FAILED'}\n${'━'.repeat(64)}`)
        process.stdout.write(out)
        resolve({ gate: gate.file, status, secs })
    })
})

console.log(header)
const queue = [...gates]
const results = []
const suiteT0 = performance.now()
await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, async () => {
    while (queue.length) results.push(await runGate(queue.shift()))
}))

const failed = results.filter(r => r.status !== 0).map(r => r.gate)
const suiteSecs = (performance.now() - suiteT0) / 1000
const cpuSecs = results.reduce((s, r) => s + r.secs, 0)
console.log(`\n${'═'.repeat(64)}`)
console.log(`slowest gates: ${[...results].sort((a, b) => b.secs - a.secs).slice(0, 5).map(r => `${r.gate} ${r.secs.toFixed(0)}s`).join(' · ')}`)
console.log(`wall ${suiteSecs.toFixed(0)}s (pool ${POOL}) · gate-cpu ${cpuSecs.toFixed(0)}s · ${header}`)
if (failed.length) {
    console.log(`RUN-ALL: ${gates.length - failed.length}/${gates.length} gates green — FAILED: ${failed.join(', ')}`)
    process.exit(1)
}
console.log(`RUN-ALL: all ${gates.length} gates green ✓`)

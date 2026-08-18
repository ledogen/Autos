// GATE: every debug-panel slider binds to a property that actually exists.
//
// WHY THIS EXISTS. lil-gui's `add(obj, 'prop')` on a missing property logs "gui.add failed" and
// then throws on the next line — which aborts initDebug() ENTIRELY. One stale slider therefore
// takes out the whole debug panel, and nothing else in the suite can see it: no gate imports
// debug.js (it needs THREE + lil-gui + a DOM), and the bundler is happy because the property is
// only named in a string.
//
// It has already happened once: the 2026-08-17 paper-route reshape deleted paperW / bonusMax /
// expediteFull, and the panel kept binding a slider to paperW. The game booted, the panel did not.
//
// Method: parse `.add(IDENT, 'prop')` out of debug.js, resolve IDENT through debug.js's own import
// statements, import that module for real, and check the property is there. Modules that cannot be
// imported headlessly (THREE, DOM) are REPORTED and skipped rather than failing — the point is to
// cover the pure parameter objects, which is where deletion-drift actually happens.
import { readFileSync } from 'node:fs'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

const src = readFileSync(new URL('../src/debug.js', import.meta.url), 'utf8')

// 1. what debug.js imports, and from where
const imports = new Map()          // local name -> module specifier
for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
    for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/).pop().trim()
        if (name) imports.set(name, m[2])
    }
}

// 2. every (object, property) pair the panel binds a control to
const bindings = []
for (const m of src.matchAll(/\.add\(\s*([A-Za-z_$][\w$]*)\s*,\s*'([^']+)'/g)) {
    bindings.push({ obj: m[1], prop: m[2] })
}
check('found slider bindings to check', bindings.length > 0, `${bindings.length}`)

// 3. resolve and verify the imported ones
const skipped = new Set()
let checked = 0
const seenModules = new Map()
for (const b of bindings) {
    const spec = imports.get(b.obj)
    if (!spec) continue                                   // a local defined inside debug.js
    if (!seenModules.has(spec)) {
        try { seenModules.set(spec, await import(new URL(`../src/${spec.replace(/^\.\//, '')}`, import.meta.url))) }
        catch (e) { seenModules.set(spec, null); skipped.add(`${spec} (${e.message.split('\n')[0]})`) }
    }
    const mod = seenModules.get(spec)
    if (!mod) continue
    const target = mod[b.obj]
    check(`${b.obj}.${b.prop} exists (slider would otherwise kill the whole panel)`,
        target != null && Object.prototype.hasOwnProperty.call(target, b.prop),
        target == null ? `${b.obj} not exported by ${spec}` : `no such property on ${b.obj}`)
    checked++
}
check('at least the paper-route params were reachable to check', checked > 0, `${checked} verified`)
for (const s of skipped) console.log(`       (skipped, not headless-importable: ${s})`)

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL DEBUG-SLIDER CHECKS PASSED')
process.exit(fails ? 1 : 0)

// test/lib/param-overrides.mjs — `k=v` command-line RANGER_PARAMS overrides for the road workbench
// tools (road-character.mjs, dump-network.mjs).
//
// QUAL-28: the v2 price list lives NESTED at RANGER_PARAMS.roadV2, so the old flat-key-only parser
// could not reach the knobs that actually govern the road any more. `cTurn=45` set a top-level key
// nothing reads — the same phantom-parameter failure the gates had. Dotted keys fix that:
//
//   node test/road-character.mjs roadV2.cTurn=60 roadV2.wGrade=120
//
// A bare v2 knob name is also accepted and routed into roadV2 (`cTurn=60`), because typing the
// prefix every time is friction and there is no top-level key of that name to be ambiguous with.

import { RANGER_PARAMS } from '../../data/ranger.js'

const V2_KEYS = new Set(Object.keys(RANGER_PARAMS.roadV2 ?? {}))

/**
 * Split argv into reserved tool args and RANGER_PARAMS overrides.
 * @param {string[]} argv        — process.argv.slice(2)
 * @param {object}   reserved    — mutated in place; its keys are the tool's own args (seed, cx, out…)
 * @returns {object} overrides — flat keys plus a `roadV2` sub-object where applicable
 */
export function parseParamArgs(argv, reserved) {
    const overrides = {}
    for (const a of argv) {
        const m = a.match(/^([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)?)=(.+)$/)
        if (!m) continue
        const [, key, raw] = m
        if (key in reserved) {                       // string-valued tool args (out=) keep their text
            reserved[key] = typeof reserved[key] === 'string'
                ? raw
                : (raw === 'true' ? true : raw === 'false' ? false : Number(raw))
            continue
        }
        const v = raw === 'true' ? true : raw === 'false' ? false : Number(raw)
        const dot = key.indexOf('.')
        if (dot > 0) {
            const group = key.slice(0, dot), leaf = key.slice(dot + 1)
            ;(overrides[group] ??= {})[leaf] = v
        } else if (V2_KEYS.has(key)) {
            ;(overrides.roadV2 ??= {})[key] = v
        } else {
            overrides[key] = v
        }
    }
    return overrides
}

/**
 * Merge overrides onto RANGER_PARAMS, one level deep so a nested group (roadV2) is PATCHED rather
 * than replaced wholesale — overriding cTurn alone must not drop cRoadM and the rest of the prices.
 */
export function withOverrides(base, overrides) {
    const out = { ...base }
    for (const [k, v] of Object.entries(overrides)) {
        out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object')
            ? { ...base[k], ...v }
            : v
    }
    return out
}

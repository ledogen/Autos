// src/leaderboard.js — FEAT-62: best times per scenario, behind a storage hook.
//
// Pure: no DOM, no clock, no storage of its own. Times are kept sorted fastest-first, capped at
// `size`, keyed by the scenario's `id` (data/scenarios.js — which is why a shipped id never changes).
//
// ── THE STORE HOOK ────────────────────────────────────────────────────────────────────────────────
// Everything persistent goes through ONE object, the `store`, with two synchronous methods:
//
//     store.load(key)        → Array<Entry> | null      (null = nothing saved under that key)
//     store.save(key, list)  → void                      (list is a fresh array; keep it as given)
//
//     Entry = { elapsed: number /* s, the fixed-step clock */, at: string /* ISO date of the run */ }
//     key   = `${STORE_PREFIX}${scenarioId}`  e.g. "autos-scenario-times/1:ranger-descent"
//
// main.js passes `localStore()`: each scenario's list is its own localStorage key, beside
// autos-settings/1 and FEAT-42's run slot autos-run/1 — NOT inside the run slot, which a new game
// clears and a death deletes, while best times outlive every run. `memoryStore()` is the
// session-only store the gates use.
//
// Notes for any other adapter:
//   • Keep it SYNCHRONOUS from this side. If the backing store is async (IndexedDB — a browser
//     database whose calls return promises, i.e. answers that arrive later), read every key once at
//     boot into memory and write through on save; never make submit() wait on disk mid-run.
//   • The `/1` in STORE_PREFIX is the schema version. Changing the Entry shape means bumping it and
//     either migrating or dropping old lists — never reading an old shape as the new one.
//   • These are run results, not world data: nothing here describes the world, so it does not fall
//     under the "every world generated cold, no worldgen in saves" rule.
//   • load() output is treated as untrusted: anything that is not a finite positive time is dropped.

export const STORE_PREFIX = 'autos-scenario-times/1:'
export const LEADERBOARD_SIZE = 10

/**
 * localStorage, one key per scenario. Storage can be missing, blocked (private window, previews) or
 * hold junk, as settings.js says: a failed read is an empty board and a failed write keeps the
 * session going without it. load() output is filtered by entries() regardless.
 */
export function localStore (storage = globalThis.localStorage) {
  return {
    load: (key) => { try { return JSON.parse(storage.getItem(key)) } catch { return null } },
    save: (key, list) => { try { storage.setItem(key, JSON.stringify(list)) } catch { /* blocked / full */ } },
  }
}

/** Session-only memory (the gates; nothing survives a reload). */
export function memoryStore () {
  const m = new Map()
  return {
    load: (key) => m.get(key) ?? null,
    save: (key, list) => { m.set(key, list) },
  }
}

export class Leaderboard {
  /**
   * @param {object} [o]
   * @param {{load:Function, save:Function}} [o.store] — the persistence hook (see header)
   * @param {number} [o.size] — entries kept per scenario
   */
  constructor ({ store = memoryStore(), size = LEADERBOARD_SIZE } = {}) {
    this._store = store
    this._size = size
  }

  /** @returns {Array<{elapsed:number, at:string}>} fastest first (a copy — safe to keep) */
  entries (scenarioId) {
    const raw = this._store.load(STORE_PREFIX + scenarioId)
    if (!Array.isArray(raw)) return []
    return raw
      .filter(e => e && Number.isFinite(e.elapsed) && e.elapsed > 0)
      .map(e => ({ elapsed: e.elapsed, at: String(e.at ?? '') }))
      .sort((a, b) => a.elapsed - b.elapsed)
      .slice(0, this._size)
  }

  /** @returns {number|null} the best time in seconds, or null if none */
  best (scenarioId) {
    return this.entries(scenarioId)[0]?.elapsed ?? null
  }

  /**
   * Record a finished run.
   * @returns {{rank:number|null, newBest:boolean}} rank is 1-based, null if it missed the board
   */
  submit (scenarioId, elapsed, at = new Date().toISOString()) {
    const list = this.entries(scenarioId)
    const prevBest = list[0]?.elapsed ?? Infinity
    const entry = { elapsed, at }
    list.push(entry)
    list.sort((a, b) => a.elapsed - b.elapsed)
    const kept = list.slice(0, this._size)
    this._store.save(STORE_PREFIX + scenarioId, kept)
    const idx = kept.indexOf(entry)
    return { rank: idx < 0 ? null : idx + 1, newBest: elapsed < prevBest }
  }
}

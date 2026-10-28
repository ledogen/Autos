// src/save.js — the story run's ONE save slot (FEAT-42; run-shape.md "Saving", RATIFIED 2026-07-29).
//
// Suspend-and-resume, NOT a checkpoint: written by the pause menu's "save & exit", and READING IT
// DELETES IT. takeRun() is the only reader and it removes the record before it parses it, so a crash
// mid-resume cannot leave a reloadable copy behind — there is deliberately no loadRun that leaves the
// record in place, and no export (a downloadable run save is a reload button with extra steps).
//
// The world is never in here: every resume regenerates it cold from the seed (owner, 2026-09-22).
// Same storage discipline as settings.js — storage can be missing, blocked or hold junk, and every
// failure lands on "no save", which for a run save is the correct direction (the run is gone).

const KEY = 'autos-run/1'
export const RUN_SAVE_VERSION = 1

/** Write the run. Returns false when storage refused it (blocked, full) — the caller says so. */
export function putRun (data, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify({ v: RUN_SAVE_VERSION, data })); return true } catch { return false }
}

/** Read AND delete the run. The data, or null (none, corrupt, or another version — all discarded). */
export function takeRun (storage = globalThis.localStorage) {
  let raw = null
  try { raw = storage.getItem(KEY); storage.removeItem(KEY) } catch { return null }
  try {
    const rec = JSON.parse(raw)
    return rec?.v === RUN_SAVE_VERSION && rec.data ? rec.data : null
  } catch { return null }
}

/** Is there a run to continue? A yes/no only — nothing reads the run without consuming it. */
export function hasRun (storage = globalThis.localStorage) {
  try { return storage.getItem(KEY) != null } catch { return false }
}

/** Discard the run (a new game over it). */
export function clearRun (storage = globalThis.localStorage) {
  try { storage.removeItem(KEY) } catch { /* blocked → there was nothing to clear */ }
}

// ── The mission board's history ─────────────────────────────────────────────────────────────────
// OfferBoard is a pure function of (seed, roster, creation hour) and the calls made on it, and each
// mutator advances the board's own clock to its nowH. So the board's history IS its call list: wrap
// every mutator once, where the board is built, log the calls that took (a truthy return), and a
// resume rebuilds the board and replays them. Every caller is covered without touching one — a new
// mutator only has to be named here and return truthy when it changed something.
const BOARD_OPS = ['take', 'complete', 'abandon', 'openLines']

/** Wrap `board`'s mutators to log into the returned { t0H, events }, after replaying `events` onto it. */
export function logBoard (board, t0H, events = []) {
  const log = { t0H, events: [] }
  for (const op of BOARD_OPS) {
    const f = board[op]
    if (typeof f !== 'function') continue
    board[op] = (...a) => { const r = f.apply(board, a); if (r) log.events.push([op, ...a]); return r }
  }
  for (const [op, ...a] of events) board[op](...a)
  return log
}

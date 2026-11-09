// src/save.js — the story run's ONE save slot (FEAT-42; run-shape.md "Saving").
//
// A ROLLING autosave, NOT a checkpoint (owner, 2026-10-29, amending the 2026-07-29 "written on quit,
// deleted on load"): main.js overwrites this one record about once a second while a run is live, and
// again the instant the tab is hidden or closed — so a closed tab, a browser crash, a lid close or a
// power cut costs about a second, never the run. There is never more than one record and it is never
// older than "now", so there is no earlier state to scum back to; that, not deleting on load, is what
// keeps death permanent. A resume therefore reads the record and leaves it — a crash during the
// resume's own load must not lose the run either. No export (a downloadable save is a reload button).
//
// The world is never in here: every resume regenerates it cold from the seed (owner, 2026-09-22).
// Same storage discipline as settings.js — storage can be missing, blocked or hold junk, and every
// failure lands on "no save", which for a run save is the correct direction (the run is gone).

import { RENAMED } from '../data/parts.js'

const KEY = 'autos-run/1'
// A part id the catalog retired (data/parts.js RENAMED, FEAT-176), quoted as a key or a value, anywhere in the record.
const RETIRED = new RegExp(`"(${Object.keys(RENAMED).join('|')})"`, 'g')
export const RUN_SAVE_VERSION = 1

/** Write the run. Returns false when storage refused it (blocked, full) — the caller says so. */
export function putRun (data, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify({ v: RUN_SAVE_VERSION, data })); return true } catch { return false }
}

/** The saved run, or null. A corrupt or other-version record is DISCARDED (the run is gone — never half-restored). */
export function loadRun (storage = globalThis.localStorage) {
  let raw = null
  try { raw = storage.getItem(KEY) } catch { return null }
  if (raw == null) return null
  try {
    const rec = JSON.parse(raw.replace(RETIRED, (_, id) => `"${RENAMED[id]}"`))
    if (rec?.v === RUN_SAVE_VERSION && rec.data) return rec.data
  } catch { /* corrupt */ }
  clearRun(storage)
  return null
}

/** Is there a run to continue? */
export function hasRun (storage = globalThis.localStorage) {
  try { return storage.getItem(KEY) != null } catch { return false }
}

/** Discard the run: a new game over it, or the run's end. */
export function clearRun (storage = globalThis.localStorage) {
  try { storage.removeItem(KEY) } catch { /* blocked → there was nothing to clear */ }
}

// ── The mission board's history ─────────────────────────────────────────────────────────────────
// OfferBoard is a pure function of (seed, roster, creation hour) and the calls made on it, and each
// mutator advances the board's own clock to its nowH. So the board's history IS its call list: wrap
// every mutator once, where the board is built, log the calls that took (a truthy return), and a
// resume rebuilds the board and replays them. Every caller is covered without touching one — a new
// mutator only has to be named here and return truthy when it changed something.
const BOARD_OPS = ['take', 'complete', 'abandon', 'openLines', 'openFirst']   // FEAT-147: the first job

/** Wrap `board`'s mutators to log into the returned { t0H, events }, after replaying `events` onto it. */
export function logBoard (board, t0H, events = []) {
  const log = { t0H, events: [] }
  for (const op of BOARD_OPS) {
    const f = board[op]
    if (typeof f !== 'function') continue
    board[op] = (...a) => { const r = f.apply(board, a); if (r) log.events.push([op, ...a]); return r }
  }
  // BUG-152: a faithful replay takes every event (the board is pure, and only calls that took were
  // logged). One that no longer takes is dropped from the new log and every later save carries the
  // loss: a roster re-sited between sessions lost mom's take + complete and her casserole came back.
  // An integrity check at load, so any future drift is loud instead of quiet.
  const dropped = events.filter(([op, ...a]) => !board[op](...a)).length
  if (dropped) console.error(`[save] board replay dropped ${dropped} of ${events.length} events`)
  return log
}

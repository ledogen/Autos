/**
 * src/run-log.js — FEAT-242 (DEC-358, DEC-481): the run logger.
 *
 * A shipped debug feature, ON by default from a story run's first moment (DEC-481; the debug panel's toggle is the
 * off switch; DEC-358 is the recorded exception to CLAUDE.md's "no diagnostic plumbing in src/"). `enabled` is the
 * choice, `on` is "recording right now": start() raises it at a run's go-live, stop() drops it when the run is left. When on, the game's existing events call `runLog.event(type, data)` and the fixed step
 * calls `runLog.tick(dt)`, which takes ONE route sample per second of sim time. Every line is stamped with the
 * game day and hour, real time, run playtime and the truck's position, speed and heading.
 *
 * COST WHEN OFF: every call site is `runLog.on && runLog.event(...)`, so an off logger is one boolean test and
 * the payload object is never built. `event()` and `tick()` also return at their first line when off.
 *
 * OUTPUT (BUG-199): JSON Lines (one JSON object per line), so a truncated file still parses up to its last line.
 * Chrome blocks the second automatic download from a page, so the log is NOT downloaded per game day. The buffer
 * is written into IndexedDB (the browser's built-in database: it survives a reload or a crash) as a numbered part
 * at each new game day, once a minute of sim time, on `pagehide`, when logging goes off and at the run's end, then
 * emptied so memory stays flat. ONE file, `autos-run-<seed>-<startISO>.jsonl`, is downloaded from main.js's click
 * handlers (save & exit, the run-end card's button) and from the debug button "Save log now" (a click-started
 * download is never blocked). It joins every stored part in order, then clears them, so a run saved twice and won
 * leaves three files, each self-contained (its own runStart header); `tools/run-log-summary.mjs` stitches several.
 * Parts of a run left without a save stay stored across a reload and ride in the next download.
 * Nothing else is kept in localStorage/IndexedDB besides the on/off choice, and nothing is uploaded anywhere.
 *
 * The run's state is read through handles main.js binds once (`runLog.bind`). Its one import is the build marker.
 */

import { resolveBuild } from './version.js'

const PREF_KEY = 'autos-runlog/1'   // the on/off choice only — never the log itself (size)
const SAMPLE_S = 1                  // route sample period [s of sim time]
const COND_EVERY = 60               // every Nth route sample also carries every track's condition

const r1 = (v) => Math.round(v * 10) / 10
const r3 = (v) => Math.round(v * 1000) / 1000

/** The primitive fields of `o` (numbers rounded to 4 significant decimals' worth, strings, booleans): a flat
 *  copy safe to JSON-encode, for objects that also hold geometry or back-references. */
export function scalars (o) {
  const out = {}
  if (!o) return out
  for (const k in o) {
    const v = o[k], t = typeof v
    if (t === 'number') out[k] = Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : String(v)
    else if (t === 'string' || t === 'boolean') out[k] = v
  }
  return out
}

function _loadPref () {
  if (typeof window === 'undefined') return false   // headless (node gates): no browser storage to read
  try { return window.localStorage.getItem(PREF_KEY) !== '0' } catch { return true }   // DEC-481: on unless switched off
}
function _savePref (on) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(PREF_KEY, on ? '1' : '0') } catch { /* blocked storage: this session only */ }
}

/** The browser download: a Blob URL on a temporary <a download> clicked in code. */
function _download (name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)   // late: a revoke right after click can cancel a big file
}

const KEY_W = 5   // part number padding in a store key: `<iso>|<seed>|<00001>` sorts in series then part order

/** Where parts wait until saved. IndexedDB in the browser; a plain Map where there is none (node gates, blocked
 *  storage), so the logger never throws over storage. All methods return promises. */
function _makeStore () {
  const mem = new Map()
  const memStore = {
    put: async (k, v) => { mem.set(k, v) },
    all: async () => [...mem].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    del: async (ks) => { ks.forEach(k => mem.delete(k)) },
  }
  if (typeof indexedDB === 'undefined') return memStore
  let db = null
  const open = () => db ??= new Promise((res, rej) => {
    const r = indexedDB.open('autos-runlog', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('parts')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const run = async (mode, f) => {
    const d = await open()
    return new Promise((res, rej) => {
      const t = d.transaction('parts', mode), st = t.objectStore('parts'), out = f(st)
      t.oncomplete = () => res(out?.result)
      t.onerror = t.onabort = () => rej(t.error)
    })
  }
  return {
    put: (k, v) => run('readwrite', st => st.put(v, k)).catch(() => memStore.put(k, v)),
    all: async () => {
      try {
        const keys = await run('readonly', st => st.getAllKeys()), vals = await run('readonly', st => st.getAll())
        return keys.map((k, i) => [k, vals[i]]).sort((a, b) => (a[0] < b[0] ? -1 : 1))
      } catch { return memStore.all() }
    },
    del: (ks) => run('readwrite', st => ks.forEach(k => st.delete(k))).catch(() => memStore.del(ks)),
  }
}

export const runLog = {
  enabled: _loadPref(),   // the player's choice (DEC-481: default on)
  on: false,              // recording right now: a live run (start) with the choice on, or switched on by hand
  _inRun: false,          // a story run is live (start .. stop)
  count: 0,          // events recorded since logging went on (the debug line)
  part: 0,           // parts stored in this series
  store: _makeStore(),
  stored: 'nothing stored',   // the debug line: what "Save log now" would download
  _pending: Promise.resolve(),   // the store writes, in order
  save: _download,   // (name, text) — swapped by the node gate; the smoke stubs the anchor click instead
  _buf: [],          // JSON lines not yet stored
  _ctx: null,        // handles from main.js (bind)
  _acc: 0,           // sim seconds since the last route sample
  _n: 0,             // route samples taken
  _day: null,        // the game day of the last sample (a new one stores a part)
  _seed: 'noseed',
  _iso: null,        // the file series' start, filename-safe

  /** main.js, once: { vs, day, econ, inv, parts, damage, play(), seed(), mode(), onRoad(), settings() }. */
  bind (ctx) {
    this._ctx = ctx
    resolveBuild().then(v => { this._build = v })
    this._refresh()   // parts of an unfinished run, stored before this boot
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush('pagehide'))
      window.__runLog = this   // dev handle — test/cdp-smoke.mjs reads and drives the logger
    }
  },

  /** The debug checkbox. On: a header line with the state right now (a mid-run start). Off: store what is held. */
  setOn (on) {
    on = !!on
    this.enabled = on
    _savePref(on)
    if (on === this.on) return
    if (!on) { this.flush('off'); this.on = false; return }
    this.on = true
    this.count = 0
    this._newSeries()
    this.event('header', this._header('on'))
  },

  /** A run went live (onRegionLive): close the last series, start a new one, write the run's opening state (DEC-481:
   *  the jalopy as rolled, wallet, fuel, inventory), then record until stop(). */
  start (how) {
    this._inRun = true
    if (!this.enabled) return
    this.flush('newRun')
    this._newSeries()
    this.on = true
    this.count = 0
    this.event('runStart', this._header(how))
  },

  /** The run was left (region exit: save & exit, the menu, the run-end card): store what is held and stop recording. */
  stop () {
    this._inRun = false
    if (!this.on) return
    this.event('exit', this._state())   // the END block of the summary
    this.flush('exit')
    this.on = false
  },

  _newSeries () {
    this.part = 0
    this._n = 0
    this._acc = 0
    this._day = null
    this._prune()
    this._seed = String(this._ctx?.seed?.() ?? 'noseed').replace(/[^\w.-]+/g, '_')
    this._iso = new Date().toISOString().replace(/[:.]/g, '-')
  },

  _header (how) {
    const c = this._ctx
    if (!c) return { how }
    return { how, mode: c.mode?.(), seed: c.seed?.(), build: this._build ?? null, ua: globalThis.navigator?.userAgent,
      settings: c.settings?.(), ...this._state() }
  },

  /** The truck and the player as they are now: what the START and END blocks of the summary compare (FEAT-324). */
  _state () {
    const c = this._ctx
    if (!c) return {}
    const f = c.vs.fuel
    return {
      parts: c.parts?.snapshot().fitted, cond: this._cond(), flat: c.damage?.flat.slice(),
      inv: c.inv?.snapshot().entries, wallet: c.econ?.money(), fuelGal: f ? r3(f.gal) : null,
      energyH: c.day && r3(c.day.energyH()), fedH: c.day && r3(c.day.fedLeftH()),
    }
  },

  _cond () {
    const d = this._ctx?.damage?.condition
    if (!d) return null
    const o = {}
    for (const k in d) o[k] = Math.round(d[k] * 1e4) / 1e4
    return o
  },

  /** Record one event. `data`'s keys sit beside the stamp's; keep them off e/real/play/day/hr/pos/spd/hdg. */
  event (type, data) {
    if (!this.on) return
    const c = this._ctx
    const line = { e: type, real: Date.now() }
    if (c) {
      const vs = c.vs, p = vs.position, v = vs.velocity, q = vs.quaternion
      line.play = r1(c.play?.() ?? 0)
      line.day = c.day?.day()
      line.hr = c.day && r3(c.day.hour())
      line.pos = [r1(p.x), r1(p.y), r1(p.z)]
      line.spd = Math.round(Math.hypot(v.x, v.y, v.z) * 100) / 100
      // Heading in degrees, main.js's convention (_currentHeading): the yaw of the truck's forward (−Z) axis.
      const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
      line.hdg = r1(Math.atan2(-fx, -fz) * 180 / Math.PI)
    }
    if (data) Object.assign(line, data)
    if (type === 'runEnd' || type === 'campWon') Object.assign(line, this._state())   // the END block if the card is never clicked
    this._buf.push(JSON.stringify(line))
    this.count++
    if (type === 'runEnd' || type === 'campWon') this.flush(type)   // stored; the card's button click downloads it
  },

  /** From the fixed step: one route sample per SAMPLE_S of sim time, and a part at each new game day. */
  tick (dt) {
    if (!this.on) return
    this._acc += dt
    if (this._acc < SAMPLE_S) return
    this._acc -= SAMPLE_S
    const c = this._ctx
    if (!c) return
    const day = c.day?.day()
    if (this._day != null && day !== this._day) this.flush('day')
    this._day = day
    if (this._n && this._n % COND_EVERY === COND_EVERY - 1) this.flush('minute')   // a crash loses at most a minute
    const vs = c.vs, f = vs.fuel, dtr = vs.drivetrain
    this.event('route', {
      mode: c.mode?.(), road: this._road(),
      fuelGal: f ? r3(f.gal) : null, energyH: c.day && r3(c.day.energyH()), fedH: c.day && r3(c.day.fedLeftH()),
      wallet: c.econ?.money(), gear: dtr?.gear, rpm: dtr ? Math.round(dtr.engineRPM) : null,
      tempC: c.damage && r1(c.damage.engineTempC), thr: r3(vs.throttle ?? 0), brk: r3(vs.brake ?? 0),
      wear: c.damage?.drainWearLog() ?? null,
      cond: ++this._n % COND_EVERY === 0 ? this._cond() : undefined,
    })
  },

  _road () { try { return this._ctx.onRoad?.() ?? null } catch { return null } },   // the camp index may not exist yet

  /** Store what is held as the next numbered part, then let it go. A no-op with nothing held. */
  flush (why = 'manual') {
    if (!this._buf.length) return null
    this._buf.push(JSON.stringify({ e: 'part', real: Date.now(), why, part: this.part + 1, lines: this._buf.length }))
    const key = `${this._iso ?? 'nostart'}|${this._seed}|${String(++this.part).padStart(KEY_W, '0')}`
    const text = this._buf.join('\n') + '\n'
    this._buf = []
    this._pending = this._pending.then(() => this.store.put(key, text)).then(() => this._refresh()).catch(e => console.warn('[run-log] store failed', e))
    return key
  },

  /** Download every stored part (after storing what is held) as ONE file named for the newest series, then empty the
   *  store. Call it from a click handler (a click-started download is never blocked: BUG-199). */
  async saveNow () {
    this.flush('save')
    await this._pending
    const all = await this.store.all()
    if (!all.length) return null
    const [iso, seed] = all.at(-1)[0].split('|')
    const name = `autos-run-${seed}-${iso}.jsonl`
    try { this.save(name, all.map(e => e[1]).join('')) } catch (e) { console.warn('[run-log] download failed', e); return null }
    await this.store.del(all.map(e => e[0]))
    await this._refresh()
    return name
  },

  async _refresh () {
    const all = await this.store.all()
    const bytes = all.reduce((n, e) => n + e[1].length, 0)
    this.stored = all.length ? `${all.length} parts, ${(bytes / 1048576).toFixed(1)} MB` : 'nothing stored'
  },

  /** Keep the three newest series; older ones are dropped when a new one begins. */
  async _prune () {
    await this._pending
    const all = await this.store.all()
    const series = [...new Set(all.map(e => e[0].split('|').slice(0, 2).join('|')))]
    const drop = new Set(series.slice(0, -3))
    if (drop.size) await this.store.del(all.map(e => e[0]).filter(k => drop.has(k.split('|').slice(0, 2).join('|'))))
  },
}

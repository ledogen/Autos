/**
 * src/run-log.js — FEAT-242 (DEC-358): the opt-in run logger.
 *
 * A shipped debug feature, OFF by default (DEC-358 is the recorded exception to CLAUDE.md's "no diagnostic
 * plumbing in src/"). When on, the game's existing events call `runLog.event(type, data)` and the fixed step
 * calls `runLog.tick(dt)`, which takes ONE route sample per second of sim time. Every line is stamped with the
 * game day and hour, real time, run playtime and the truck's position, speed and heading.
 *
 * COST WHEN OFF: every call site is `runLog.on && runLog.event(...)`, so an off logger is one boolean test and
 * the payload object is never built. `event()` and `tick()` also return at their first line when off.
 *
 * OUTPUT: JSON Lines (one JSON object per line), so a truncated file still parses up to its last line. A part is
 * downloaded by itself, with no prompt, at each new game day, at the run's end, on `pagehide` (best effort: a
 * closing page may not finish it) and from the debug button; the buffer is emptied after each part so memory
 * stays flat. Files: `autos-run-<seed>-<startISO>-partNN.jsonl` in the browser's download folder. Nothing is
 * written to localStorage/IndexedDB except the on/off choice, and nothing is uploaded anywhere.
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
  try { return window.localStorage.getItem(PREF_KEY) === '1' } catch { return false }
}
function _savePref (on) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(PREF_KEY, on ? '1' : '0') } catch { /* blocked storage: this session only */ }
}

/** The browser download. Browsers allow a download started by script (a Blob URL on a temporary <a download>
 *  clicked in code); Chrome asks ONCE per site to "allow multiple downloads", after which parts land silently. */
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

export const runLog = {
  on: _loadPref(),
  count: 0,          // events recorded since logging went on (the debug line)
  part: 0,           // parts downloaded in this file series
  save: _download,   // (name, text) — swapped by the node gate; the smoke stubs the anchor click instead
  _buf: [],          // JSON lines not yet downloaded
  _ctx: null,        // handles from main.js (bind)
  _acc: 0,           // sim seconds since the last route sample
  _n: 0,             // route samples taken
  _day: null,        // the game day of the last sample (a new one downloads a part)
  _seed: 'noseed',
  _iso: null,        // the file series' start, filename-safe

  /** main.js, once: { vs, day, econ, inv, parts, damage, play(), seed(), mode(), onRoad(), settings() }. */
  bind (ctx) {
    this._ctx = ctx
    resolveBuild().then(v => { this._build = v })
    if (this.on) this._newSeries()   // on from the saved choice: a series from boot (a run's start begins its own)
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush('pagehide'))
      window.__runLog = this   // dev handle — test/cdp-smoke.mjs reads and drives the logger
    }
  },

  /** The debug checkbox. On: a header line with the state right now (a mid-run start). Off: download what is held. */
  setOn (on) {
    on = !!on
    if (on === this.on) return
    if (!on) { this.flush('off'); this.on = false; _savePref(false); return }
    this.on = true
    _savePref(true)
    this.count = 0
    this._newSeries()
    this.event('header', this._header('on'))
  },

  /** A run went live (onRegionLive): close the last series, start a new one, write the run's opening state. */
  start (how) {
    if (!this.on) return
    this.flush('newRun')
    this._newSeries()
    this.event('runStart', this._header(how))
  },

  _newSeries () {
    this.part = 0
    this._n = 0
    this._acc = 0
    this._day = null
    this._seed = String(this._ctx?.seed?.() ?? 'noseed').replace(/[^\w.-]+/g, '_')
    this._iso = new Date().toISOString().replace(/[:.]/g, '-')
  },

  _header (how) {
    const c = this._ctx
    if (!c) return { how }
    const f = c.vs.fuel
    return {
      how, mode: c.mode?.(), seed: c.seed?.(), build: this._build ?? null, ua: globalThis.navigator?.userAgent,
      settings: c.settings?.(), parts: c.parts?.snapshot().fitted, cond: this._cond(), flat: c.damage?.flat.slice(),
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
    this._buf.push(JSON.stringify(line))
    this.count++
    if (type === 'runEnd') this.flush('runEnd')
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

  _road () { try { return this._ctx.onRoad?.() ?? null } catch { return null } }   // the camp index may not exist yet

  /** Download what is held as the next numbered part, then let it go. A no-op with nothing held. */
  flush (why = 'manual') {
    if (!this._buf.length) return null
    this._buf.push(JSON.stringify({ e: 'part', real: Date.now(), why, part: this.part + 1, lines: this._buf.length }))
    const name = `autos-run-${this._seed}-${this._iso ?? 'nostart'}-part${String(++this.part).padStart(2, '0')}.jsonl`
    const text = this._buf.join('\n') + '\n'
    this._buf = []
    try { this.save(name, text) } catch (e) { console.warn('[run-log] download failed', e) }
    return name
  },
}

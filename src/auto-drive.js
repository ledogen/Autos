// src/auto-drive.js — FEAT-293 (DEC-428): the debug panel's "Driving AI". The consumer that puts src/autopilot.js in the
// player's seat: it builds a route on the LIVE road network from where the truck stands, steps the driver once per
// physics step (main.js, before updateVehicle) and hands its controls to src/vehicle.js setAutoDriver, so they take the
// player's own path (pedals, steering envelope, ignition, park latch, clutch assistant, a doze's slack hands). It never
// writes a force or a pose.
//
// HAND-BACK: any deliberate driving input gives the truck back at once and unticks the box — a driving key (W A S D,
// Space, Shift, E, Q, I: caught in the capture phase, so a key pressed with the debug panel focused still counts; the
// pad's buttons arrive as the same keys, src/gamepad.js), a pad pedal, or the left stick past 0.15. Camera, map, pause and
// menu inputs are not driving inputs. When the AI gives up (its `trouble`: on its side, a flat, out of fuel, stuck three
// times…) it latches the park brake, says why in the status line and hands back — unless "reset when stuck" is ticked:
// then the game re-seats the truck 40 m on along its route (the teleport, a tow) and it drives on.
// A teleport or an R reset under it (the truck moving > 30 m in one step) starts a fresh route from the new spot.
//
// Story systems run as for a player: the clock, fuel, energy and hunger go on; a doze drops its hands (SM-INV-1).

import { makeRoute, createAutopilot } from './autopilot.js'
import { setAutoDriver } from './vehicle.js'
import { pad } from './gamepad.js'

const DRIVE_KEYS = new Set(['w', 'a', 's', 'd', ' ', 'shift', 'e', 'q', 'i'])

export const autoDrive = {
  on: false,
  resetWhenStuck: false,
  status: 'off',
  _h: null, _ap: null, _route: null, _n: 0, _x: 0, _z: 0, _statusT: 0, _last: '', _settle: 0,

  /** main.js: { road() → RoadSystem, region() → { x, z, r } | null, params, vs, flat() → bool, seed() → number,
   *  teleport(x, z, heading) } */
  attach (h) { this._h = h },

  setOn (v) {
    if (!v) { this._off(this.on ? 'off' : this.status); return }
    if (!this._h || this.on) return
    this.on = true; this._last = ''
    this._start()
  },

  _start () {
    const { road, region, params, vs, seed } = this._h, r = road(), reg = region()
    let st = ((seed() ^ (++this._n * 0x9e3779b1)) >>> 0) || 1
    const rng = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    const q = vs.quaternion, fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
    const keep = reg ? (x, z) => Math.hypot(x - reg.x, z - reg.z) < reg.r - 150 : undefined
    this._route = makeRoute(() => r._network.values(), rng, { x: vs.position.x, z: vs.position.z, dir: { x: fx, z: fz } }, { keep })
    if (!this._route.path.length) { this._off('stopped: no road here'); return }
    const inBore = (x, z) => { const nr = r.queryNearest(x, z, 15); return !!nr && !!r.tunnelSpanAt?.(nr.runKey ?? '', nr.arcS ?? 0, -20) }
    this._ap = createAutopilot({ car: params, route: this._route, inBore, flat: this._h.flat })
    this._ap.locate(vs.position)
    this._x = vs.position.x; this._z = vs.position.z
    setAutoDriver(null)
  },

  _off (why) {
    this.on = false; this._ap = null; this._route = null
    setAutoDriver(null)
    this.status = why
  },

  /** Hand the truck back because the player drove (a key, a pedal, the stick). */
  takeOver (what) { if (this.on) this._off(`off: you took the wheel (${what})`) },

  /** Once per physics step, before updateVehicle. */
  step (vs, dt) {
    if (!this.on || !this._ap) return
    if (pad.active && (pad.throttle > 0.05 || pad.brake > 0.05 || Math.abs(pad.steer) > 0.15)) { this.takeOver('pad'); return }
    const p = vs.position
    if (Math.hypot(p.x - this._x, p.z - this._z) > 30) { this._start(); this._settle = 1 }   // teleported / reset under it
    this._x = p.x; this._z = p.z
    if (this._settle > 0) { this._settle -= dt; setAutoDriver(null); return }
    const c = this._ap.step(vs, dt)
    setAutoDriver(c)
    if (c.trouble) {
      this._last = c.trouble
      if (this.resetWhenStuck && this._h.teleport) {
        const pose = this._ap.resume(40)
        this._settle = 2
        setAutoDriver(null)
        this._h.teleport(pose.x, pose.z, pose.heading)
        this._x = pose.x; this._z = pose.z
      } else { vs.parked = true; this._off(`stopped: ${c.trouble}`); return }
    }
    if ((this._statusT -= dt) <= 0) { this._statusT = 0.25; this.status = this._line(vs) }
  },

  _line (vs) {
    const ap = this._ap, v = Math.hypot(vs.velocity.x, vs.velocity.z) * 3.6, n = ap.nextTurn()
    const next = !n ? '' : n.turn === null ? ` · dead end in ${n.m} m` : ` · next: ${n.turn === 180 ? 'U-turn' : n.turn > 10 ? `left ${n.turn}°` : n.turn < -10 ? `right ${-n.turn}°` : 'straight on'} in ${n.m} m${n.exits > 1 ? ` (${n.exits} ways)` : ''}`
    return `${ap.state} · ${v.toFixed(0)} → ${(ap.vT * 3.6).toFixed(0)} km/h${next}${this._last ? ` · last: ${this._last}` : ''}`
  },
}

// Keyboard hand-back: the capture phase, ahead of lil-gui's stopPropagation and of everything else.
globalThis.document?.addEventListener('keydown', e => {
  if (!autoDrive.on || e.repeat || e.ctrlKey || e.metaKey) return
  const k = e.key === ' ' ? ' ' : e.key.toLowerCase()
  if (DRIVE_KEYS.has(k)) autoDrive.takeOver(k === ' ' ? 'Space' : k.toUpperCase())
}, true)

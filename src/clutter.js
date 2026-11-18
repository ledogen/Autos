/**
 * src/clutter.js — FEAT-278: world clutter goes in AFTER the loading screen and streams in, nearest first.
 * Zero imports.
 *
 * Owner (2026-11-17): "I think world clutter can go in after the initial loading screen. Since the player doesn't see it
 * all at once, it can stream in slowly right after a new game is started."
 *
 * The queue holds what to spawn, never where it goes: placement stays with the system that solves it (poi.js solves the
 * yards, deterministic in the seed), so streaming changes WHEN a piece appears, never WHICH or WHERE. main.js fills it
 * behind the loading screen, opens it once every model it names has loaded (so a clone never waits on a fetch and never
 * lands as a burst when one resolves), and drains it from the PERF-33 streaming block once the screen is gone.
 *
 * Today's clutter is the POI yards (FEAT-71 lawn furniture and yard clutter, ~45 a region). Signs (FEAT-72/279) and
 * mailboxes (FEAT-280) are meant to come in through the same add().
 *
 * Not instanced, on purpose (measured 2026-11-18): the clutter is many DIFFERENT models a few copies each (yards ~20
 * models over ~45 pieces; ASSET-22's eleven mailbox flavours of 3–7 primitives), so one InstancedMesh per model × primitive
 * would draw every one of them every frame, region-wide, against ~10 draw calls today with per-object frustum culling
 * and the BUG-164 yard cull. Instancing pays for many copies of ONE mesh in view, which is the prop system's grass and
 * rocks (src/props/prop-system.js).
 */

export class ClutterQueue {
  constructor () {
    this._items = []
    this._open = false
    this._gen = 0
  }

  /** Drop everything still pending and close the queue (a rebuild, a region exit). */
  reset () {
    this._items.length = 0
    this._open = false
    this._gen++
  }

  /** Queue one piece at world (x, z); `spawn()` builds it. */
  add (x, z, spawn) { this._items.push({ x, z, spawn }) }

  /** Open the queue once `ready` resolves — unless a reset() came first (a load from an older rebuild opens nothing). */
  openWhen (ready) {
    const gen = this._gen
    return Promise.resolve(ready).then(() => { if (gen === this._gen) this._open = true })
  }

  get pending () { return this._items.length }

  /**
   * Spawn nearest to (px, pz) first until `deadline` (a performance.now() time), always at least one per call so the
   * stream finishes on a frame whose budget is already spent. Returns how many spawned.
   */
  drain (px, pz, deadline, now = () => performance.now()) {
    if (!this._open) return 0
    const items = this._items
    let n = 0
    while (items.length) {
      // ponytail: a linear nearest scan per spawn (n² over a stream: 2k ops at today's ~45, 40k at ~200); sort once if clutter grows past ~2000
      let bi = 0, bd = Infinity
      for (let i = 0; i < items.length; i++) {
        const d = (items[i].x - px) ** 2 + (items[i].z - pz) ** 2
        if (d < bd) { bd = d; bi = i }
      }
      const it = items[bi]
      items[bi] = items[items.length - 1]
      items.pop()
      it.spawn()
      n++
      if (now() >= deadline) break
    }
    return n
  }
}

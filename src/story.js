// ── Story Mode (FEAT-43) — sandboxed gamemode environment ─────────────────────────────────
//
// Story mode FORKS free roam (DESIGN.md "Game modes", SM-INV-12/13). This module owns the whole
// story-mode lifecycle so future divergences — POIs (next slice), trail-closed barriers (FEAT-28),
// baked per-region parameter states — land HERE and never reach into free roam's frame loop.
//
// What this v1 does:
//   • enter(seed): switch to story mode, (re)seed the world if the seed changed and re-seat the
//     truck at the canonical seed spawn (the region CENTER), lock out debug tooling, surface the
//     Quick Job button. Same deterministic world CONTENT as free roam (SM-INV-12).
//   • Behind a loading screen, PRE-ROUTE the whole region once, then FREEZE THE ROUTER: the play
//     RoadSystem is widened to the region, every connection in it is warmed on the road Worker, the
//     network is registered once at that wide radius, and from then on the frame loop makes no
//     roadSystem.update() / warmRoutes() calls at all. That is the FEAT-43 perf + correctness win.
//   • Bound the region with a hard circular wall at REGION_RADIUS_M around the spawn.
//
// WHY ROUTING ONLY (owner decision, 2026-07-25 — "Option A"): routing and terrain have inverted
// cost profiles. Routing is expensive to COMPUTE (~20 s cold at a 2.2 km radius, O(R²)) and almost
// free to HOLD (~50 cached centerlines). Terrain is cheap to compute (~5.5 ms/chunk) and ruinous to
// hold — 65×65-vert meshes at ~230 KB each, so a frozen 5×5 km region would pin ~6,200 chunks ≈
// 1.4 GB. So we freeze the expensive-and-window-fragile half and let terrain/props/water/ribbons
// keep streaming around the player exactly as in free roam. They build against the frozen network,
// so the roads are identical everywhere the player drives, and memory stays bounded.
//
// Determinism (SM-INV-12): post-BUG-25 the crossing cull is a pure function of (seed, params,
// region) computed on a static wide graph with a 3072 m margin — proven by the HARD-passing
// graph-cull-radius-invariance + restream-invariance gates. Registering the network once at the
// WIDE radius is therefore a safe superset of what the 320 m play window would ever show: boundary
// edges can only ever keep a real redundant road, never invent or delete one. The one hard
// requirement is that warmBandComplete() reach true BEFORE the freeze, or edges the player drives
// to would have no routed centerline.
//
// Isolation discipline: this module holds NO worldgen and imports nothing. It coordinates the
// existing systems through the `deps` adapter main.js passes in, and carries only story-layer state
// (region geometry + boundary + freeze flag). REGION_RADIUS_M is a story-layer value and is NOT
// a road* param — changing it never re-routes the world.

// The play area. Single tunable: the hard wall sits here, and the router is warmed to
// REGION_RADIUS_M + WARM_MARGIN_M so the network is complete right up to (and just past) the wall.
export const REGION_RADIUS_M = 2500   // m — a 5 km-wide bounded region
const WARM_MARGIN_M = 300             // m — route past the wall so the boundary roads are whole
// THE radius the entry warm routes to — and therefore the radius the bundled route cache must
// cover, or half the region routes live behind the loading screen. test/bake-route-bundle.mjs
// imports this so the bake target can never silently fall behind the region again (it did: the
// bake stopped at 1700 m while entry asked for 2800, leaving 104 of 216 in-band edges uncached).
export const REGION_WARM_RADIUS_M = REGION_RADIUS_M + WARM_MARGIN_M

// Story mode is DESIGNED to lock the debug GUI out (DESIGN.md "Game modes"): a shipped story run
// has no sliders. While the mode is a sandbox under construction, though, the panel is the only way
// to inspect what the frozen region actually built — so the lockout is held OFF (owner decision
// 2026-07-26), alongside the matching teleport allowance in main.js's isTeleportEnabled().
// The whole mechanism (debug.js setDebugLockout + the force-hide hook) stays wired and exercised;
// flip this to true to close the mode up. Teleport is the sibling switch — flip both together.
const DEBUG_LOCKOUT = false

// Grace after enter() before the region center is captured: the reseat/reseed is async, so the
// truck is not at the spawn yet. deps.reseat()/applySeed() return promises we await, and this is
// only the belt-and-braces floor + ceiling around them.
const SETTLE_MIN_MS = 400
const SETTLE_MAX_MS = 20000    // if a rebuild throws, don't hang the loading screen forever
const WARM_PUMP_MS  = 250      // warmBandComplete() rebuilds a band graph — pump it, don't spin it
const WARM_MAX_MS   = 180000   // cold uncached seed at this radius can be minutes; still bounded

export class StorySystem {
  /**
   * @param {object} deps - adapter into main.js (keeps this module free of engine imports):
   *   setGameMode(mode)          — flip window.__setGameMode
   *   getWorldSeed()             — current numeric worldSeed
   *   applySeed(seedStr)         — reseed + regenerate the world; resolves when the rebuild settles
   *   clearSpawnOverride()       — drop any free-roam teleport spawn point, so the SEED decides
   *                                where the truck seats and therefore where the region centres
   *   reseat()                   — re-seat the truck at the canonical seed spawn; resolves when seated
   *   setDebugLockout(locked)    — hide + disable the debug GUI while true
   *   hidePauseMenu()            — close the pause menu
   *   setQuickJobVisible(v)      — show/hide the in-mode Quick Job button
   *   setLoading(visible, text)  — the mode-entry loading overlay
   *   getVehiclePosition()       — {x,z} of the truck (region-center source, sampled post-reseat)
   *   isMissionActive()          — true while a Quick Job is accepted/counting/running
   *   pumpRegionWarm(c, r)       — widen the play RoadSystem to r around c and pump one warm step;
   *                                returns true once every connection is routed AND the network has
   *                                been registered once at that radius (i.e. safe to freeze)
   *   releaseRegion()            — restore the play RoadSystem's normal streaming radius
   *   onRegionLive(c, r)         — FEAT-46: the region is routed and about to be handed over. Place
   *                                POIs here (optional; free roam has none)
   *   onRegionExit()             — FEAT-46: drop the POIs and their pads on the way out (optional)
   */
  constructor (deps) {
    this._d = deps
    this._R = REGION_RADIUS_M
    this._active = false
    // 'idle' | 'settling' | 'warming' | 'rejected' | 'live'. `rejected` is a TERMINAL entry state:
    // the region is built and frozen behind the disclaimer, so "start anyway" costs nothing to
    // honour and typing a new seed just re-enters (the token invalidates this attempt).
    this._phase = 'idle'
    this._seed = null
    this._report = null
    this._center = null       // {x,z} — region center; captured post-reseat
    this._frozen = false      // true ⇒ the frame loop makes NO road stream/route calls
    this._armed = false       // the wall only clamps once the player has been inside the region
    this._elapsed = 0         // ms in the current phase
    this._pumpAcc = 0         // ms since the last warm pump
    this._token = 0           // invalidates in-flight enter() async work on a re-enter/exit
  }

  isActive () { return this._active }
  /**
   * THE freeze gate the frame loop reads. True ⇒ skip roadSystem.update()/warmRoutes() entirely.
   * False during entry (the region is still warming) and in free roam.
   */
  isRoutingFrozen () { return this._frozen }
  /**
   * THE gate the frame loop's two road-stream calls read. True in BOTH of the states where the loop
   * must keep its hands off the play RoadSystem:
   *   • 'warming' — pumpRegionWarm has already widened the radius to the region and marked the proto
   *     dirty. A loop update() here would synchronously stream that whole enlarged band on the main
   *     thread, every frame, which is a hard hang (the same trap _spawnWarmActive exists to avoid).
   *   • frozen — the region is registered and must stay registered; an update() would narrow the
   *     network back to a 320 m window around the player and silently undo the freeze.
   */
  isRoadStreamSuspended () { return this._frozen || this._phase === 'warming' || this._phase === 'rejected' }
  /**
   * True while the mode is loading (reseat/reseed settling, or the region routing warm running).
   * Callers that also use the road Worker (the Quick Job planner pre-warm) hold off while this is
   * true so the two warms don't fight for the same worker pool and stretch the loading screen.
   */
  isEntering () { return this._active && this._phase !== 'live' }
  /**
   * A deliberate teleport happened (map double-click, free-cam button, Shift+R). Disarm the wall
   * the same way an active Quick Job does: the player ASKED to be somewhere, so don't clamp them
   * back on the next tick. It re-arms the instant they are inside the region again, so this
   * loosens the fence for the jump only — it never turns it off.
   */
  notifyTeleport () { this._armed = false }

  /** Region center + radius — for the 2D map boundary overlay and future POIs / FEAT-28 barriers. */
  region () { return this._center ? { x: this._center.x, z: this._center.z, r: this._R } : null }

  /**
   * Enter story mode with the given seed. Seed '6' (the pre-baked default) ships with a bundled
   * route cache, so its region warm is near-instant; any other seed triggers a full deterministic
   * rebuild and pays a one-time routing warm behind the loading screen. Either way the truck is
   * re-seated at the canonical seed spawn so the region centers there predictably.
   */
  enter (seedStr) {
    const seed = (seedStr == null || seedStr === '') ? '6' : String(seedStr).trim()
    const token = ++this._token
    this._d.setGameMode('story')
    this._d.hidePauseMenu()
    this._d.setDebugLockout(DEBUG_LOCKOUT)

    this._active = true
    this._frozen = false
    this._center = null
    this._elapsed = 0
    this._pumpAcc = 0
    this._armed = false
    this._phase = 'settling'
    // THE SEED DECIDES WHERE THE WORLD IS BUILT, AND NOTHING ELSE (owner, 2026-08-11).
    //
    // A free-roam teleport leaves a spawn override behind, and main.js's reseat honours it ahead of
    // the seed's own resolveSpawn. The region centre is then captured from wherever the truck landed
    // (`_beginWarm` below), so the whole region — every POI, every newspaper customer, the wall —
    // follows the PLAYER rather than the seed. Reproduced: teleport to Larry's, exit to free roam,
    // re-enter the same seed, and Larry's house is gone because the region re-centred on the spot he
    // used to occupy. Dropping the override here is what makes a seed an absolute determinism
    // machine in the live path, which test/world-determinism.mjs asserts headlessly.
    this._d.clearSpawnOverride?.()
    this._d.setLoading(true, 'entering the region…')
    // Quick Job stays hidden until the region is live — its planner would fight the region warm
    // for the road Worker, and there is nothing to drive to yet.
    this._d.setQuickJobVisible(false)

    this._seed = seed          // the disclaimer names the seed that was refused
    const reseed = this._d.applySeed && String(this._d.getWorldSeed()) !== seed
    const settled = reseed ? this._d.applySeed(seed) : this._d.reseat()
    Promise.resolve(settled)
      .catch(e => { console.warn('[story] world settle failed', e) })
      // (FEAT-68 removed the baked story-region route cache that used to be imported here — the
      // region warm now routes for real on the worker pool, ~2.8 s at 4x throttle.)
      .then(() => {
        if (this._token !== token || this._phase !== 'settling') return   // superseded
        this._beginWarm()
      })
  }

  /** Settle done: the truck is at the spawn, so that IS the region center. Start the routing warm. */
  _beginWarm () {
    const p = this._d.getVehiclePosition()
    this._center = { x: p.x, z: p.z }
    this._phase = 'warming'
    this._elapsed = 0
    this._pumpAcc = WARM_PUMP_MS   // pump immediately on the next frame
    this._d.setLoading(true, 'building the region…')
  }

  /**
   * Warm done: is this seed actually playable on the CURRENT router and terrain parameters?
   *
   * Owner ruling 2026-08-27, replacing the earlier deterministic-reseed plan: do NOT reroll the
   * seed. Fail safe and say so. The player typed a seed and loaded a parameter set; if those two
   * are not compatible the honest answer is a disclaimer and a prompt for a different seed, not a
   * world quietly swapped underneath them. That also means story mode does not need the nine-tile
   * play area the reroll would have required, which is the whole point — the architecture stays as
   * small as story mode currently is while the design is still being decided.
   *
   * The check is HARD FAILURES ONLY (owner): the region's road graph is severed, or an edge exists
   * that nothing could give a profile to even after workstream C's grade-hard re-route. A steep but
   * solved seed is a playable seed. Node-pin violations do NOT count — those are a bug in our
   * geometry rather than a property of the seed, and blaming the player for our defect would be
   * wrong (see src/world-validate.js, `playable` vs `ok`).
   *
   * It necessarily runs HERE, after the warm, and not when the seed is typed: you have to route the
   * region to know whether it routes. That is the cost of the check being honest.
   */
  _checkSeed () {
    let report = null
    try {
      report = this._d.validateRegion?.(this._center, REGION_RADIUS_M) ?? null
    } catch (e) {
      // A throwing validator must not strand the player on a loading screen. Enter, and say so.
      console.warn('[story] seed validation threw — entering anyway', e)
      this._goLive(); return
    }
    if (!report || report.playable) { this._goLive(); return }
    this._phase = 'rejected'
    this._report = report
    this._d.setLoading(false)
    this._d.onSeedRejected?.(this._seed, report)
  }

  /**
   * The player chose "start anyway" at the disclaimer. Story mode is a sandbox while it is being
   * built, and going to LOOK at what broke is a legitimate thing to want; the warning has already
   * been shown, so this is an informed choice rather than a silent one.
   */
  acceptRejectedSeed () {
    if (this._phase !== 'rejected') return
    console.warn('[story] entering a seed the region check rejected —', this._report?.components,
                 'components,', this._report?.condemned?.length ?? 0, 'condemned')
    this._goLive()
  }

  /** True while the entry disclaimer is up: entered, warmed, and refused. */
  isSeedRejected () { return this._phase === 'rejected' }

  /**
   * Warm done (or timed out): freeze the router and hand the region to the player.
   * @param {boolean} frozen — false on the degraded paths (settle threw / warm timed out), where the
   *   mode enters with streaming still live so missing roads fill in as the player drives.
   */
  _goLive (frozen = true) {
    this._phase = 'live'
    this._frozen = frozen
    // FEAT-46: POIs are placed HERE — after routing is complete and (normally) frozen. That ordering
    // is what makes the ratified "POIs never influence routing determinism" rule structural rather
    // than merely intended: placement can only ever READ a finished network, never feed it. Still
    // behind the loading screen, because it re-bakes the carve tables of the chunks already built
    // around the spawn so the new pads are actually flattened in them.
    this._d.onRegionLive?.(this._center, this._R)
    this._d.setLoading(false)
    this._d.setQuickJobVisible(true)
  }

  /** Leave story mode: unfreeze + restore streaming, restore debug, free-roam mode, reseat. */
  exit () {
    if (!this._active) return
    this._token++            // abandon any in-flight entry work
    this._active = false
    this._phase = 'idle'
    this._frozen = false
    this._center = null
    this._report = null
    this._d.setLoading(false)
    this._d.setQuickJobVisible(false)
    this._d.onRegionExit?.()  // FEAT-46: drop the POIs + their pads BEFORE the carve re-bakes below
    this._d.releaseRegion()   // back to the 320 m play window BEFORE the loop resumes streaming
    this._d.setDebugLockout(false)
    this._d.setGameMode('freeroam')
    void this._d.reseat()
  }

  /**
   * Per-frame tick (render rate). Drives the entry state machine, then keeps the player inside the
   * boundary — except while a Quick Job is live (the wall is suspended so the job's teleport-to-start
   * and drive aren't clamped) and until the player is actually back inside the region afterwards.
   * @param {number} dtSeconds - wall-clock frame time
   * @param {object} vehicleState - mutated in place at the boundary (position + velocity)
   */
  update (dtSeconds, vehicleState) {
    if (!this._active) return
    const dtMs = dtSeconds * 1000
    this._elapsed += dtMs

    if (this._phase === 'settling') {
      // The promise above is the real signal; this only bounds a rebuild that threw or never fired.
      if (this._elapsed > SETTLE_MAX_MS) {
        console.warn('[story] world settle timed out — entering with the current position as center')
        this._beginWarm()
      }
      return
    }

    if (this._phase === 'warming') {
      if (this._elapsed < SETTLE_MIN_MS) return   // let the post-reseat frame land first
      this._pumpAcc += dtMs
      if (this._pumpAcc < WARM_PUMP_MS) return
      this._pumpAcc = 0
      let done = false
      try {
        done = this._d.pumpRegionWarm(this._center, REGION_WARM_RADIUS_M)
      } catch (e) {
        console.warn('[story] region warm failed — entering unfrozen', e)
        this._goLive(false)
        return
      }
      if (done) { this._checkSeed(); return }
      if (this._elapsed > WARM_MAX_MS) {
        // Don't strand the player on a loading screen. Enter UNFROZEN so the loop keeps streaming
        // and the missing roads fill in as they drive — degraded, but playable and honest.
        console.warn('[story] region warm timed out — entering with streaming still live')
        this._goLive(false)
      }
      return
    }

    // ── live: the boundary ──────────────────────────────────────────────────────────────────
    // A Quick Job teleports the truck up to the planner radius and expects a free drive — don't
    // fence it. The wall re-arms only after the player is back inside the region.
    if (this._d.isMissionActive && this._d.isMissionActive()) { this._armed = false; return }

    const dx = vehicleState.position.x - this._center.x
    const dz = vehicleState.position.z - this._center.z
    const d = Math.hypot(dx, dz)
    if (d <= this._R) { this._armed = true; return }
    if (!this._armed) return   // outside but not yet armed (returning from a mission) — let them in
    // Hard wall: clamp back onto the circle and kill the outward velocity component.
    const nx = dx / d, nz = dz / d
    vehicleState.position.x = this._center.x + nx * this._R
    vehicleState.position.z = this._center.z + nz * this._R
    const vOut = vehicleState.velocity.x * nx + vehicleState.velocity.z * nz
    if (vOut > 0) { vehicleState.velocity.x -= vOut * nx; vehicleState.velocity.z -= vOut * nz }
  }
}

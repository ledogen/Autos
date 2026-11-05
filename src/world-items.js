// src/world-items.js — FEAT-143: items lying in the world. Phase 1 is the player's own drops: an
// inventory entry put down behind the tailgate lies where it lands, and the inventory's "Nearby on the
// ground" strip (and FEAT-144's D-pad ↓) picks it back up within REACH_M of a parked truck (owner,
// 2026-11-03: "yes to all").
//
// Run-layer state is a plain module object, the runInventory pattern, and it rides the save: a drop
// is PLAYER state (SM-INV cold generation — world spawns, phase 3, will come from the seed instead and
// save only what was taken). Each item carries its FULL inventory entry, so a part's condition, a can's
// gallons and a pack's contents come back exactly as they went down. main.js owns the bodies and models
// (debris.js, the FEAT-149 model↔body swap); this module is pure, so the gate runs it in node.

export const runWorldItems = { items: [] }   // { entry, x, y, z, q: [x, y, z, w] } — q is the resting pose

// One reach for the pick-up and for FEAT-144's reload of lost bed cargo (owner, 2026-11-03: "one button,
// one reach rule for both", "parked within a couple meters"). [DEFAULT] 3 m — the owner owes 3 vs 8.
export const REACH_M = 3

/** Lay `entry` in the world at `pose` ({ x, y, z, q }). Returns its index. */
export function place (entry, pose) {
    runWorldItems.items.push({ entry, x: pose.x, y: pose.y, z: pose.z, q: pose.q ?? [0, 0, 0, 1] })
    return runWorldItems.items.length - 1
}

/** Where item `i` came to rest (main.js, when its body sleeps or swaps back to a model). */
export function rest (i, pose) {
    const it = runWorldItems.items[i]
    if (!it) return
    it.x = pose.x; it.y = pose.y; it.z = pose.z
    if (pose.q) it.q = pose.q
}

/**
 * Plan distance from item `it` to the truck at (x, z): to its footprint when `fp` is given, else to the
 * point. The reach is "parked within a couple meters" OF THE TRUCK — measured from its centre, a thing
 * set down behind the tailgate (2.5 m back) would start out of a 3 m reach.
 * @param {{fx: number, fz: number, front: number, rear: number, half: number}} [fp] - the truck's unit
 *   forward in plan, how far its nose and tail stand ahead of and behind (x, z), and its half width [m].
 */
function gap (it, x, z, fp) {
    const dx = it.x - x, dz = it.z - z
    if (!fp) return Math.hypot(dx, dz)
    const a = dx * fp.fx + dz * fp.fz, s = dx * fp.fz - dz * fp.fx   // ahead, and to one side
    return Math.hypot(Math.max(0, a - fp.front, -fp.rear - a), Math.max(0, Math.abs(s) - fp.half))
}

/** Indices of the items within `r` of the truck at (x, z) in plan (`fp`: see gap), nearest first. */
export function near (x, z, r = REACH_M, fp = null) {
    return runWorldItems.items
        .map((it, i) => [i, gap(it, x, z, fp)])
        .filter(([, d]) => d <= r)
        .sort((a, b) => a[1] - b[1])
        .map(([i]) => i)
}

/** Pick item `i` up: removes it and returns its entry, or null. */
export function take (i) {
    const it = runWorldItems.items[i]
    if (!it) return null
    runWorldItems.items.splice(i, 1)
    return it.entry
}

/** A save's list, or none for a new run. */
export function restoreWorldItems (items) {
    runWorldItems.items = Array.isArray(items) ? items.map(it => ({ ...it, q: [...(it.q ?? [0, 0, 0, 1])] })) : []
}

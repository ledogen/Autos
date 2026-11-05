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

/** Indices of the items within `r` of (x, z) in plan, nearest first. */
export function near (x, z, r = REACH_M) {
    return runWorldItems.items
        .map((it, i) => [i, Math.hypot(it.x - x, it.z - z)])
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

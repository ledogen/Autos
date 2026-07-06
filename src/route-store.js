// src/route-store.js — QUAL-14 perf: IndexedDB persistence for the per-connection route cache.
//
// Routed centerlines are pure functions of (worldSeed, road/terrain params) — that is the QUAL-08
// worker-cache invariant, so persisting them is risk-free: a signature over every routing-relevant
// param guards identity, and on a hit the next session imports the primitives instead of paying the
// arc search at all (second visit's cold load ≈ instant; the map becomes usable immediately over
// explored ground). One record per seed (latest params win — tuning sessions don't accrete stale
// bands). Fire-and-forget everywhere: private mode / quota / missing indexedDB degrade to routing
// as usual, never to an error the game sees.
const DB_NAME = 'rangersim-routes', STORE = 'bands', DB_VER = 1

function _openDb() {
    return new Promise((resolve, reject) => {
        const rq = indexedDB.open(DB_NAME, DB_VER)
        rq.onupgradeneeded = () => rq.result.createObjectStore(STORE)
        rq.onsuccess = () => resolve(rq.result)
        rq.onerror = () => reject(rq.error)
    })
}

/** Load the persisted route cache for `seedKey`; null unless its signature matches `sig` exactly. */
export async function loadRouteCache(seedKey, sig) {
    if (typeof indexedDB === 'undefined') return null
    try {
        const db = await _openDb()
        const rec = await new Promise((resolve, reject) => {
            const rq = db.transaction(STORE).objectStore(STORE).get(seedKey)
            rq.onsuccess = () => resolve(rq.result)
            rq.onerror = () => reject(rq.error)
        })
        db.close()
        return rec && rec.sig === sig ? rec.data : null
    } catch { return null }
}

/** Persist the route cache for `seedKey`, replacing any previous record for that seed. */
export async function saveRouteCache(seedKey, sig, data) {
    if (typeof indexedDB === 'undefined') return
    try {
        const db = await _openDb()
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite')
            tx.objectStore(STORE).put({ sig, data }, seedKey)
            tx.oncomplete = resolve
            tx.onerror = () => reject(tx.error)
        })
        db.close()
    } catch { /* quota / private mode — degrade to routing as usual */ }
}

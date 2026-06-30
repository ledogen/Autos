// src/version.js — build marker shown in the debug panel (QUAL-04).
//
// Goal: confirm at a glance WHICH build the browser actually loaded. GitHub Pages takes ~30–60 s
// to redeploy after a push and the browser may serve a cached `main.js`, so "is this the new code?"
// is otherwise a guess. A hand-stamped constant solves nothing — it silently goes stale the moment
// you forget to bump it (which is exactly what happened to the previous value here).
//
// Approach (no build system, no asset files, ~zero runtime cost): at panel init we fetch the SERVED
// `main.js` and read its `Last-Modified` / `ETag` response header. The browser answers from the same
// HTTP cache entry the ES module was loaded from, so the header identifies the build that is actually
// RUNNING — if the page is executing a stale cached bundle, the marker reads the stale date, which is
// precisely the signal we want. One request at panel-open; nothing in the frame loop.
//
// `import.meta.url` is this module's own URL; `main.js` sits beside it in src/, so this resolves to the
// served entry bundle regardless of where the app is hosted (GitHub Pages subpath, localhost, etc.).
const BUILD_PROBE_URL = new URL('./main.js', import.meta.url).href

function fmt (date) {
  // Compact UTC stamp, e.g. "2026-06-30 14:23 UTC" — unambiguous across the human's timezone.
  const p = n => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ` +
         `${p(date.getUTCHours())}:${p(date.getUTCMinutes())} UTC`
}

/**
 * Resolve a short build identifier for the actually-loaded bundle.
 * Reads main.js's Last-Modified (preferred — human-readable) or ETag (fallback) response header.
 * Never throws; returns an 'unknown …' string on any failure so the panel always renders something.
 * @returns {Promise<string>}
 */
export async function resolveBuild () {
  try {
    // HEAD is cheapest; some static hosts answer it poorly, so fall back to a 1-byte ranged GET
    // (still no real payload) which every static host — including GitHub Pages — handles.
    let res = await fetch(BUILD_PROBE_URL, { method: 'HEAD' })
    if (!res.ok) res = await fetch(BUILD_PROBE_URL, { headers: { Range: 'bytes=0-0' } })

    const lastMod = res.headers.get('Last-Modified')
    if (lastMod) {
      const d = new Date(lastMod)
      return isNaN(d.getTime()) ? lastMod : fmt(d)
    }
    const etag = res.headers.get('ETag')
    if (etag) return 'etag ' + etag.replace(/["']/g, '').replace(/^W\//, '').slice(0, 12)

    return 'unknown (no Last-Modified/ETag header)'
  } catch {
    return 'unknown (build probe failed)'
  }
}

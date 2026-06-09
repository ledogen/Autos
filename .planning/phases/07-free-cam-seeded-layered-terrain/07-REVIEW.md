---
phase: 07-free-cam-seeded-layered-terrain
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - data/ranger.js
  - index.html
  - src/camera.js
  - src/debug.js
  - src/main.js
  - src/seed.js
  - src/terrain-worker.js
  - src/terrain.js
  - src/vehicle.js
findings:
  critical: 1
  warning: 7
  info: 4
  total: 12
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the Phase 7 free-fly camera, seeded world-seed module, three-layer seeded
terrain (Blob Worker + main-thread analytic path), terrain debug sliders, canonical
spawn resolver, and Esc pause / grid-world tuning mode.

The seed math (`djb2` / `seedFor` / `mulberry32`) is sound and injection-free, and the
analytic-vs-worker height pipeline is structurally consistent (same algorithm, same seed
derivation, same `terrainAmplitude` application site). I empirically verified the simplex
noise stays bounded below 1.0 across 200 seeds × 500k samples, so the latent
`Math.pow(1-|n|, …)` NaN path is not reachable at the shipped scale constant — noted as
Info, not a blocker.

The one true BLOCKER is a structured-clone / determinism contract failure on the debug
seed field: the debug panel's seed input is a free-text string, but `parseWorldSeed`
hashes the *string* while the URL `?seed=` path can be parsed as a *number* — the two
entry points can produce different worlds for the same visible value, and worse, the
debug panel never re-syncs its display seed to the URL seed, so the field lies about the
active world. Several WARNING-level robustness gaps exist around pointer-lock promise
rejection, the WORKER_SOURCE byte-sync contract, and the freecam `Shift` key being shared
between boost and the `Shift+C` mode toggle.

## Critical Issues

### CR-01: Debug seed field and URL seed use divergent parse paths — same text yields different worlds

**File:** `src/main.js:32-33`, `src/main.js:683`, `src/seed.js:36-39`, `src/debug.js:138-141`

**Issue:** `parseWorldSeed` branches on JS type:
```js
export function parseWorldSeed(input) {
  if (typeof input === 'number') return (input | 0) >>> 0   // integer path
  return djb2(String(input))                                // string path
}
```
The URL path passes a *string* from `URLSearchParams.get('seed')` (always a string or
`null`), so it always takes the `djb2` branch — fine. But the contract documented in
`seed.js:32-39` claims an "Integer path" exists for `?seed=` ("Used at startup (URL
?seed= param)"). That integer branch is **unreachable from the URL** because
`URLSearchParams.get` never returns a `number`. So a user who shares `?seed=12345`
expecting the documented `(12345 | 0) >>> 0 = 12345` world instead gets
`djb2("12345")` — a completely different world than the same numeric seed entered through
any future numeric API or reproduced from a logged integer seed. The integer determinism
guarantee (SEED-01/03) is silently broken for all-digit seeds.

Compounding this, the debug seed field (`debug.js:138`) hardcodes its display default to
`'lone-pine'`:
```js
const _seedState = { seed: 'lone-pine' }
```
If the app was loaded with `?seed=desert`, the panel still shows `lone-pine`. Opening the
panel and touching any other control leaves the field displaying a seed that is **not** the
active world. If the user then edits the field, `changeSeed('lone-pine'-derived-edit)`
regenerates a world unrelated to the one they were driving. The field is authoritative on
`onChange` but never initialized from `worldSeed`, so it actively misreports state.

**Fix:** (1) Make `parseWorldSeed` deterministic regardless of caller type by coercing
all-digit strings to the integer path, so URL and field agree:
```js
export function parseWorldSeed(input) {
  if (typeof input === 'number') return (input | 0) >>> 0
  const s = String(input)
  if (/^-?\d+$/.test(s)) return (parseInt(s, 10) | 0) >>> 0   // numeric text → integer path
  return djb2(s)
}
```
(2) Initialize the debug field from the live seed and re-sync it on every Path-B
regenerate. Pass the initial seed text into `initDebug` and store the field controller so
`changeSeed`/`debouncedRebuildFull` can call `controller.setValue(currentSeedText)`. At
minimum, seed `_seedState.seed` from `_urlSeed ?? 'lone-pine'` instead of a hardcoded
literal.

## Warnings

### WR-01: WORKER_SOURCE and terrain-worker.js are NOT byte-identical — violates the T-07-03-SYNC contract

**File:** `src/terrain.js:271` (embedded), `src/terrain-worker.js:227`

**Issue:** The header comments in both files assert byte-equality
("byte-equality check in Task 1 automated verify block", `terrain.js:25-26`). They are not
equal. `diff` of the embedded `WORKER_SOURCE` (terrain.js lines 45–272) against
`terrain-worker.js` shows the standalone file has one extra comment line the embedded
copy lacks:
```
> 227:    // Transfer heights buffer to main thread (zero-copy transferable)
```
The runtime worker is the *embedded* `WORKER_SOURCE` string, so behavior is unaffected
today — but the stated invariant that they are byte-identical is false, which means any
future automated byte-equality gate will fail (or, worse, was never actually run). This
defeats the entire reason `terrain-worker.js` exists as a separate file (it is dead at
runtime — only the embedded string is used).

**Fix:** Re-sync the two so they are genuinely byte-identical (add the missing comment to
the embedded copy or remove it from the file), and add the promised automated
byte-equality check to CI/verify so the contract is enforced rather than asserted.

### WR-02: `requestPointerLock()` / `exitPointerLock()` promises are unhandled — uncaught rejection on failure

**File:** `src/camera.js:92`, `src/camera.js:162`, `src/camera.js:167`

**Issue:** All three pointer-lock calls ignore the returned promise. In current browsers
`requestPointerLock()` rejects (and logs an "Uncaught (in promise)" error) when the lock
cannot be acquired — most commonly when it is called too soon after a previous
`exitPointerLock()` (the browser enforces a short cooldown), or when the document is not
focused. The `Shift+C` enter/exit toggle (`camera.js:128-133`) makes rapid enter→exit→enter
cycles trivial to trigger, and the `click`-to-recapture handler (`camera.js:89-93`) can
fire during that cooldown. Each failure spams the console and leaves the user in freecam
with no mouse-look and no error surfaced.

**Fix:** Attach a `.catch` that no-ops or retries:
```js
canvas.requestPointerLock()?.catch(() => {})   // optional chaining: older browsers return undefined
document.exitPointerLock()                       // returns void; fine as-is
```

### WR-03: Freecam `Shift` is overloaded — boost key collides with the `Shift+C` mode toggle

**File:** `src/camera.js:108`, `src/camera.js:119`, `src/camera.js:128`, `src/camera.js:190`

**Issue:** `Shift` is tracked in `freecamKeys.shift` (used as the fly-boost modifier,
`camera.js:190`) AND is the modifier for `Shift+C` to exit freecam (`camera.js:128`). When
the user holds `Shift` to boost and taps `C` to leave freecam, `_exitFreecam()` runs but
`freecamKeys.shift` remains `true` (the `Shift` keyup may arrive after mode already
changed, or the user keeps holding it). On the next freecam entry the camera silently
flies at `FREECAM_BOOST` (100 m/s) instead of base speed until `Shift` is released and
re-pressed. There is no `keyup`-gated reset of `freecamKeys` on mode entry/exit.

**Fix:** Zero `freecamKeys` on freecam entry and exit:
```js
function _resetFreecamKeys () {
  for (const k in freecamKeys) freecamKeys[k] = false
}
// call _resetFreecamKeys() at the top of _enterFreecam() and _exitFreecam()
```

### WR-04: Pause-menu button wiring throws if any `pm-*` element is missing

**File:** `src/main.js:824-826`

**Issue:**
```js
document.getElementById('pm-resume').addEventListener('click', () => _hidePauseMenu())
document.getElementById('pm-grid').addEventListener('click', () => enterGridWorld())
document.getElementById('pm-return').addEventListener('click', () => returnToWorld())
```
These dereference `getElementById(...)` with no null guard. If any of the three button ids
is renamed or removed from `index.html` (or the markup is reordered so the script runs
before they exist), this throws a `TypeError` at module-evaluation time, which aborts the
*entire* `main.js` module — the sim never starts, with only a cryptic console error. Every
other DOM lookup in this file (`_showPauseMenu`, the HUD spans) is null-guarded; these
three are the lone unguarded sites.

**Fix:** Guard each, consistent with the rest of the file:
```js
document.getElementById('pm-resume')?.addEventListener('click', () => _hidePauseMenu())
document.getElementById('pm-grid')?.addEventListener('click', () => enterGridWorld())
document.getElementById('pm-return')?.addEventListener('click', () => returnToWorld())
```

### WR-05: `getFreecamPosition()` leaks the live internal Vector3 by reference

**File:** `src/camera.js:263-265`, `src/main.js:919-920`

**Issue:** `getFreecamPosition()` returns the module-private `freecamPos` instance, not a
clone. `main.js` currently only reads `.x/.z` from it via `terrainSystem.update(streamCenter)`,
so it is safe *today*. But this exposes mutable internal camera state across the module
boundary: any future caller that does `getFreecamPosition().set(...)` or passes it to a
function that mutates its argument (e.g. `vehicleState.position = getFreecamPosition()`
followed by physics writes) would corrupt the freecam position with no indication. Given
the render loop already swaps `vehicleState.position` to an interpolated clone
(`main.js:910`), an aliasing accident here is plausible.

**Fix:** Return a copy, or document the read-only contract explicitly and freeze intent:
```js
export function getFreecamPosition () { return freecamPos.clone() }
```
If the per-frame allocation is a concern, keep the reference but add a clear
`@returns {THREE.Vector3} DO NOT MUTATE — live internal state` and have `main.js` read
components rather than retaining the reference.

### WR-06: `resolveSpawn` "expanding spiral" can wander hundreds of metres and the no-flat fallback re-uses an already-rejected point

**File:** `src/main.js:120-161`

**Issue:** The candidate generator is described as a "deterministic expanding spiral" but
is actually a sawtooth: `nx = (i % 5) * 80 * (±1) + candX` and
`nz = floor(i/5) * 80 * (±1) + candZ`. The Z term grows unbounded with `i` (verified
offsets span −720 m … +720 m over 50 tries), so a "flat spawn" can be selected up to
~720 m from the intended start offset — the truck can spawn far from where the seed
nominally places it, undermining the SEED-driven spawn determinism the function is meant
to provide. Separately, the `!found` fallback (`main.js:147-151`) sets
`chosenX/Z = candX/candZ`, which is exactly the `i = 0` candidate that was already tested
and rejected for being too steep — so the documented "fall back to origin" (comment at
`main.js:116`, `main.js:148` log says "falling back to origin") does **not** fall back to
origin; it falls back to a known-steep point. The truck can spawn embedded in a slope.

**Fix:** Make the fallback honest — fall back to literal origin (or the flattest candidate
seen, tracking `bestNormalY`), not the first rejected point:
```js
if (!found) {
  console.warn('[resolveSpawn] No flat spawn in', MAX_TRIES, 'tries — using flattest candidate')
  chosenX = bestX; chosenZ = bestZ      // track best normal.y during the loop
}
```
and bound the search radius so spawn stays near the seeded offset.

### WR-07: `analyticHeight` returns 0 before `reinitWorker`, but physics may sample it during that window

**File:** `src/terrain.js:483-487`, `src/main.js:691-697`

**Issue:** `analyticHeight` guards with `if (!this._noiseCoarse) return 0`. The constructor
calls `reinitWorker` synchronously (`terrain.js:372`), so the closures exist before
construction returns — good. However `_reseatTruckAtSpawn()` → `resolveSpawn()`
(`main.js:697`, `main.js:135-154`) calls `analyticNormal`/`analyticHeight` and the contract
comment (`terrain.js:475`, `terrain.js:484`) states analytic height "never returns 0 for
unloaded chunks." The `return 0` fallback silently violates that contract if the call
order is ever perturbed (e.g. a future refactor that constructs `TerrainSystem` lazily, or
moves `_reseatTruckAtSpawn` earlier). A silent `0` would seat the truck at sea level inside
the terrain. This is a latent correctness trap masked only by current call ordering.

**Fix:** Make the precondition explicit rather than silently returning a wrong value:
```js
analyticHeight(wx, wz) {
  if (!this._noiseCoarse) throw new Error('analyticHeight called before reinitWorker — call order bug')
  ...
}
```
or have `resolveSpawn` assert `terrainSystem._noiseCoarse` exists before probing.

## Info

### IN-01: Latent `Math.pow` NaN in `coarseHeight` is unreachable at the shipped scale constant but fragile

**File:** `src/terrain.js:288-294` (and worker copy `terrain.js:188-195`, `terrain-worker.js:144-151`)

**Issue:** `coarseHeight` computes `Math.pow(1.0 - Math.abs(n), ridgeSharpness)`. If the
simplex noise `n` ever exceeded 1.0 in magnitude, `1 - |n|` goes negative and
`Math.pow(negative, 1.6)` yields `NaN`, which would propagate into chunk heights and
directly into physics contacts via `analyticHeight`. I empirically verified `|n|` stays
below ~0.998 across 200 seeds × 500k samples (the `70.0` scale constant in `createNoise2D`
keeps it bounded), so this is **not reachable today**. But it depends entirely on that
magic constant and the gradient table never changing.

**Fix (defensive):** Clamp the base to non-negative:
```js
const ridged = Math.max(0, 1.0 - Math.abs(n))
```

### IN-02: `terrain-worker.js` is dead code at runtime — only the embedded `WORKER_SOURCE` string executes

**File:** `src/terrain-worker.js` (entire file)

**Issue:** The worker is spawned from the inlined `WORKER_SOURCE` Blob (`terrain.js:355-357`).
`terrain-worker.js` is never imported or fetched at runtime; it exists solely as a sync
reference. This is intentional per the header, but it means a stale edit there (see WR-01)
has zero runtime effect and is easy to miss in review. Worth a one-line note in the file
header that it is a reference-only mirror, never loaded.

### IN-03: `parseWorldSeed` is imported in `terrain-worker.js`/`WORKER_SOURCE` but never called

**File:** `src/terrain-worker.js:26-29`, `src/terrain.js:70-73` (embedded), `src/seed.js:36`

**Issue:** The worker copies carry a full `parseWorldSeed` body but the worker only ever
receives an already-parsed numeric `worldSeed` over `postMessage` and calls `seedFor`
directly (`terrain-worker.js:196-198`). `parseWorldSeed` is dead inside the worker. Keeping
it preserves the verbatim-copy contract, but it is unused weight and an extra surface to
keep in sync.

**Fix:** Acceptable to keep for copy-fidelity; optionally note "unused in worker context"
at its definition there.

### IN-04: HUD `SLIP` label still shows a degree glyph though the value is m/s

**File:** `index.html:81`, `src/main.js:937-942`

**Issue:** The HUD markup initializes `SLIP: <span id="slipVal">0.0&deg;</span>` with a
degree symbol, but `main.js:940` overwrites it with `slipMps.toFixed(2) + ' m/s'` (the
`sa` field stores slip *velocity* magnitude, per the comment at `main.js:934-936`). The
initial frame shows `0.0°` and then flips to `m/s` — minor cosmetic inconsistency / stale
unit in the static markup.

**Fix:** Change the static initializer to `0.00 m/s` to match the runtime unit.

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---
id: INFRA-07
type: infra
status: completed
closed: 2026-10-15
opened: 2026-10-15
severity: major
source: review-2 whole-repo code review (owner ruling 2026-10-15: "write a ticket on how to fix this")
relates_to: INFRA-01 (the Windows runner this gate should eventually run on), PERF-08 (test/lib/cdp.mjs), QUAL-34 / review-2 (the motivating regression, facb92d)
---

# INFRA-07 — `cdp-smoke`: an in-browser behaviour gate for the code no gate imports

## Why

The review-2 pass (2026-10-15) found the suite's one structural hole: **no gate imports
`src/main.js`** — the frame loop, the fixed-step accumulator, every mode transition (free roam / story
/ lab / menu stage / teleport / reseed / `R`), the HUD, the debug panel. 92 gates pin worldgen and
physics to the byte; none of them notice if the truck does not drive. Proof: the only regression an
executor introduced in that pass — a hoisted closure that missed one caller (`_hintAt` in the
tunnel-wall contact query) — threw on every wheel query, 1,131 console errors in 30 s, truck immobile,
**and every affected gate was green**. It was caught by an ad-hoc CDP smoke and fixed in `facb92d`.
The FEAT-113 session's rank-bar-keeps-running-on-an-expired-job bug is the same class.

Pixel diffs are NOT the answer (GPU/driver/font/timing flake; they test looks, not behaviour). The
answer is a cheap behavioural smoke: boot, drive, switch every mode, assert the obvious.

## What exists already (reuse, do not rebuild)

- `test/lib/cdp.mjs` — `launchChrome(url, {port, headed, audio, windowSize, extraArgs})`,
  `connect({port})`, `sleep`. Port-based CDP (Chrome DevTools Protocol — Chrome's remote-control
  channel); `connect()` does not care who launched Chrome. `CHROME` path and `--use-angle=metal` are
  macOS-hardcoded (INFRA-01 §D asks for env-vars; do that here, defaults unchanged).
- Scripts that already drive the game this way and are the pattern to copy: `test/screenshot.mjs`
  (`?nomenu`, `__view`, waits), `test/bug76-browser-probe.mjs`, `test/box3d-determinism-browser.mjs`,
  `test/ab-shots.mjs`, `test/camp-view.mjs`, `test/map-shot.mjs`. Memory note
  `reference_inbrowser_verify_cdp` (freecam = Shift+C).
- Dev handles on `window` that survive review-2 R-20 (everything else was deleted — do not reach for
  `__poi`/`__board`/`__mission`/`__terrainSystem`): `__view __vs __car __tp __teleport __road
  __roadSys __world __story __terrain __map2d __damage __damageHUD __debris __propPhysics
  __physicsEngine __physWireframes __setGameMode __rsReady __props __renderer __barrelCube __hitches
  __hitchDump __hitchReset __perfData __lever __q __ri`. Read them; add a handle only if a scenario
  below cannot be observed otherwise, and then name it in the ticket close-out.
- The app needs an HTTP origin (ES modules break on `file://`): `npm run dev` on :8000, or `vite
  preview` on a built `dist/`. The gate must work when :8000 is ALREADY serving (the normal dev state)
  and must start its own server otherwise.

## Design

`test/cdp-smoke.mjs`, registered in `test/gates.mjs`:

```js
{ file: 'cdp-smoke.mjs', subsystem: 'app', cost: 'heavy', browser: true,
  desc: 'boot, drive, every mode transition, zero console errors — the main.js gate',
  extraDeps: ['src/main.js', 'index.html', 'vite.config.js'] }
```

`run-all.mjs` gains a `--browser` opt-in: gates with `browser: true` are skipped (and listed as
"skipped: needs --browser") unless the flag is present or `CDP_SMOKE=1` is set. `npm test` on the Air
therefore never launches Chrome; `test:all --browser` and the INFRA-01 runner do. Honour the existing
`--serial` flag (one Chrome at a time).

**Scenario list** (one function each, run in this order in ONE Chrome session; total budget ≤ 90 s):

| # | step | assert |
|---|---|---|
| 1 | open `/?nomenu&seed=6` | `__rsReady` within 15 s; `__vs` has finite position; no console error |
| 2 | hold W 8 s | truck moved ≥ 40 m; speed HUD text parses to a number > 0; wheel loads finite |
| 3 | brake to stop, press `R` | position re-seated near the spawn; speed → 0; damage state fresh (free roam) |
| 4 | `__teleport` 600 m along a road (`__road`), wait 5 s | ground under the truck exists (no fall-through: `y` above terrain height −1 m) |
| 5 | open map (M), drag, close | `#map` element toggles; cursor class resets; no error |
| 6 | enter freecam (Shift+C), fly, exit | camera heading within 10° of the truck within 1 s of exit (review-2 R-11) |
| 7 | enter the lab (`__setGameMode` or the menu path), wait 3 s, exit | truck on the lab slab (not free-falling: `y` stable over 1 s); exit returns to the world |
| 8 | story entry (menu path or `__story`), wait for the region build | `__story` state = running; a POI exists; mission HUD visible |
| 9 | camp make / break (the story camp keybind or `__story` hook) | clock freezes then resumes; `R` while camped closes the camp first (review-2 R-12) |
| 10 | backtick toggles wireframes in story; debug panel honours `_debugLockout` | no error (review-2 R-13) |
| 11 | accept the nearest offer if one is advertised, drive 50 m | rank/mission HUD shows one job; `isOnJob()` true; expiry text present |

Throughout: a CDP `Runtime.consoleAPICalled` + `Runtime.exceptionThrown` listener; **any** `error`
level or uncaught exception fails the gate with the first message and the step it occurred in.
Collect `performance.now()` per step and print them (report-only — wall clock is not an assertion).

**Flake policy:** every wait is a condition poll with a ceiling (`until(fn, ms)`), never a fixed
sleep alone. If Chrome is not found, the gate reports `SKIP (no Chrome at $CHROME)` — not a failure —
so the suite stays green on a box without it.

**Keep it small:** one file, ≤ 300 lines, helpers in `test/lib/cdp.mjs` only if two scripts share them.
No framework, no page-object layer, no screenshots in the gate (keep `screenshot.mjs` for humans).

## Acceptance

- [x] `test/cdp-smoke.mjs` exists; `node test/run-all.mjs --list` shows it as `browser` and `npm test`
      (no flag) skips it with a one-line notice; `npm run test:all -- --browser` runs it.
- [x] Reverting `facb92d`'s fix (locally, do not commit) makes the gate RED at step 2 with the
      `_hintAt` ReferenceError in the report; restoring it makes the gate GREEN. This is the gate's
      self-check — record the two outputs in the close-out note.
- [x] Runs ≤ 90 s wall on the M4 Air with `npm run dev` already serving :8000, and also when nothing is
      serving (it starts `vite preview` or `vite --port` itself and shuts it down).
- [x] `test/lib/cdp.mjs` `CHROME` path and ANGLE backend are env-overridable (`CHROME_BIN`,
      `CDP_ANGLE`), macOS defaults unchanged; the gate runs on the INFRA-01 Windows runner with
      `--use-angle=d3d11` (that box can be done later; the env seam is done now).
- [x] Any new `window.__*` handle is listed in the close-out and in LAYOUT.md's main.js row.
- [x] CLAUDE.md "Diagnostic tools" gets one line; LAYOUT.md's test/ row gets one line.

## Non-goals

Pixel/screenshot comparison; frame-time assertions (PERF-08 owns timing); audio; multi-seed sweeps
(seed 6 only — determinism gates own seeds). Mobile/Safari. Anything that needs a human eye.

## Resolution (2026-10-15, branch `feature/infra-07`)

`test/cdp-smoke.mjs` (≈250 lines) runs all 11 steps in one Chrome session, 68–80 s wall on the M4 Air.
Five consecutive runs were green after the one flake was fixed (below).

**Self-check (facb92d's fix reverse-applied, then restored):**

```
steps: boot 5.4s
FAIL: 1 console error(s); first in step "boot":
  ReferenceError: _hintAt is not defined
    at queryContacts (src/main.js:2010:67)
    at stepPhysics (src/physics.js:620:24)
    at loop (src/main.js:6665:5)
---
steps: boot 8.6s · drive 8.2s · reset 0.1s · teleport 5.0s · map 0.9s · freecam 4.1s · lab 7.1s · story 20.0s · camp 9.1s · backtick 0.3s · offer 11.8s
PASS: 11 steps, zero console errors
```

It goes red in step 1, not step 2: the throw fires on the first physics step, before any driving.

**Deviations from the design, and why:**
- **Always starts its own Vite** on a free port, rooted at the gate's own checkout, and never reuses
  :8000. On this machine :8000 is usually serving a *different* worktree, so reusing it would test
  the wrong code. The CDP port is also picked free (9222 may be the owner's own debugging Chrome).
  The "already serving" and "nothing serving" cases therefore behave identically.
- **extraDeps are `src`, `data`, `index.html`, `vite.config.js`**, not just `src/main.js`. The smoke
  boots everything main.js imports, so any app edit selects it. That costs nothing, because it is
  held back unless `--browser` is passed.
- **No `?prof=1`.** `__story`, `__tp`, `__road` and `__world` only exist under it, but the smoke
  should run the shipped path. Story "live" is read from the DOM instead: run HUD up, load stage
  down, `__map2d()._getPois()` non-empty. Teleports use the always-on `__teleport`.
- **Step 9 (camp) uses mom's doorstep.** It is the one camp face reachable without a zone hunt.
  The FEAT-118 hold (clock frozen with the panel up) and R-12 (R closes it, then the clock resumes)
  are both asserted there.
- **Step 10 (backtick):** story does not hold the debug lockout (debug.js says so), so the
  assertion is R-13's "one gate". The panel and the wireframes flip together and flip back.
- **Step 11 (offer):** picks a plain `delivery` giver (no drop zone, no park box) with a live offer.
  It parks on the pad and accepts via `#mp-accept`, then asserts the mission HUD and the abandon
  button. It then cranks the engine (story seats it OFF, FEAT-33), releases the brake, and drives
  from the road point beside the pad. The pad itself pinned the truck at full throttle. The gate
  asserts the HUD leaves "leave the green circle". **Expiry text is not asserted:** this branch's
  HUD has none (FEAT-113's deadlines are uncommitted WIP on main). Add the check when that lands.
- The speed-HUD check in step 2 became "moved ≥ 40 m + finite strut state". The speed read-out is
  the gauge-cluster canvas; there is no text to parse.

**The one flake, fixed:** an offer still in `generating` shows `#mp-accept` with no `display` of its
own inside a hidden `#mp-actions` row, so a click landed before the offer existed. Visibility
checks use `checkVisibility()` (true only when the element is actually rendered).

**New `window.__*` handle:** `__cam` (the render camera), for step 6's tail-bearing check. Listed in
LAYOUT.md's main.js entry.

**Infra:** `run-all.mjs --browser` / `CDP_SMOKE=1`. Without either, `browser: true` gates are held
back in every mode, with "skipped: cdp-smoke (needs --browser)" in the header. `--list` tags them
`browser`. `test/lib/cdp.mjs` takes `CHROME_BIN` / `CDP_ANGLE` (defaults unchanged), and its
`evalJS` now reports the exception's description rather than a bare "Uncaught". The Windows runner
leg (`CDP_ANGLE=d3d11`) is still for INFRA-01 to do.

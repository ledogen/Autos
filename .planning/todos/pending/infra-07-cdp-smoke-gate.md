---
id: INFRA-07
type: infra
status: pending
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

- [ ] `test/cdp-smoke.mjs` exists; `node test/run-all.mjs --list` shows it as `browser` and `npm test`
      (no flag) skips it with a one-line notice; `npm run test:all -- --browser` runs it.
- [ ] Reverting `facb92d`'s fix (locally, do not commit) makes the gate RED at step 2 with the
      `_hintAt` ReferenceError in the report; restoring it makes the gate GREEN. This is the gate's
      self-check — record the two outputs in the close-out note.
- [ ] Runs ≤ 90 s wall on the M4 Air with `npm run dev` already serving :8000, and also when nothing is
      serving (it starts `vite preview` or `vite --port` itself and shuts it down).
- [ ] `test/lib/cdp.mjs` `CHROME` path and ANGLE backend are env-overridable (`CHROME_BIN`,
      `CDP_ANGLE`), macOS defaults unchanged; the gate runs on the INFRA-01 Windows runner with
      `--use-angle=d3d11` (that box can be done later; the env seam is done now).
- [ ] Any new `window.__*` handle is listed in the close-out and in LAYOUT.md's main.js row.
- [ ] CLAUDE.md "Diagnostic tools" gets one line; LAYOUT.md's test/ row gets one line.

## Non-goals

Pixel/screenshot comparison; frame-time assertions (PERF-08 owns timing); audio; multi-seed sweeps
(seed 6 only — determinism gates own seeds). Mobile/Safari. Anything that needs a human eye.

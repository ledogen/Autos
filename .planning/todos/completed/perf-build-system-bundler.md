---
id: PERF-04
type: perf
status: completed
opened: 2026-06-25
resolved: 2026-07-14
resolution: "SHIPPED as PERF-20 item 5. Vite adopted (three+simplex from npm, byte-identical to the
  retired CDN importmap pin); index.html importmap removed; vite.config.js aliases three/addons/→
  three/examples/jsm/, base:'./' for GH-Pages subpath, es2022 target (main.js top-level await), copy
  plugin ships the two runtime-fetched assets (data/route-cache-default.json.gz + assets/models/
  hilux.glb) into dist/ at unchanged paths. version.js probe → self import.meta.url. GitHub Actions
  deploy workflow added (USER must flip Pages Source → 'GitHub Actions'). CLAUDE.md 'no build system'
  constraint rewritten. Both Blob workers (terrain WORKER_SOURCE + road ROAD_WORKER_SOURCE) survive
  bundling untouched — boot-diag confirmed all 3 terrain workers + road routing spin up in dev AND
  built. npm test gates stay pure-node (unaffected). DEVIATIONS from the original plan: (1) debug.js
  code-split NOT done — the import-waterfall win is fully realized by bundling alone; lazy-splitting
  the debug layer is an optional byte-trim follow-on, not required for the cold-load goal. (2) The
  'strip src/perf.js on close' followup is SUPERSEDED — the PERF-08 ?prof=1 profiling harness now
  depends on src/perf.js perfMark, so it STAYS. QUAL-04 relationship: version.js still probes the
  served bundle's Last-Modified (now the hashed chunk), so the build marker keeps working."
severity: minor
source: user-request
note: "DECISION ticket, not a blind do — adopting a bundler OVERRIDES the documented CLAUDE.md 'no build system / opens from GitHub Pages without install' constraint. Needs explicit sign-off before implementing; CLAUDE.md + the deploy flow update in the same change. Targets COLD first-load only (the black-screen-before-first-paint), NOT runtime fps — see PERF-05 for the runtime stutter, which a bundler does nothing for."
followup: "PROBE CLEANUP OWNED HERE (handed off from PERF-05, completed 2026-06-25): the TEMP perfAdd/perfDump/perfMark harness (src/perf.js + imports in terrain.js/road.js/road-mesh.js/main.js, tagged 'TEMP perf triage (D-arc)') was retained because main.js's perfMark calls instrument the cold load this ticket targets. When PERF-04 closes (or is declined), strip the whole harness per CLAUDE.md 'src/ is the product' — remove src/perf.js, the 4 imports, the frame perfAdd buckets, the auto-dump block (main.js ~1164-1167), and the load perfMarks. The frame-loop console.log CLAUDE.md objected to is already gone (PERF-05 Tier 1)."
---

# PERF-04: Adopt a bundler (Vite) to cut cold first-load time

## Symptom / motivation

Cold hard-refresh load on a mid/low-end Windows laptop (Intel Ultra 7 266 / Arc 140) is ~8 s of black
screen vs ~2.5 s on an M4 Air. A chunk of that is the *delivery path*, independent of CPU:

- `index.html` ships ~20 unminified, heavily-commented `src/*.js` files discovered via an **import
  waterfall** (each `import` is a fresh network hop the browser can't predict until it parses the
  importer).
- Three.js r184 (~1 MB+ uncompressed) + simplex-noise are pulled from a **third-party CDN**
  (`cdn.jsdelivr.net`) via the importmap (`index.html:64`) — an extra DNS/TLS/latency hop, and the
  whole module is downloaded whether we use 30% or 100% of it (no tree-shaking possible on a prebuilt
  CDN blob).
- Every comment and long identifier is shipped as-is (no minification).

A bundler (Vite) collapses this into a small number of content-hashed, tree-shaken, minified files
served from our own origin: one-ish download instead of a 20-hop waterfall, far fewer bytes, no CDN
hop, near-instant repeat loads via content-hash caching. This is the "delivery half" of the device-2
black screen. (The "CPU half" — synchronous cold routing — is separate; see PERF-01/PERF-05.)

## Scope / what changes

- Add `package.json` deps (`three`, `simplex-noise`) + `vite` devDep (npm already present — `npm test`).
- Add `vite.config.js`; remove the importmap from `index.html`; `src/` ES-module imports mostly as-is.
- `npm run build` → `dist/`; `npm run dev` replaces `npx serve .` for local dev.
- **Code-split the debug layer** (`src/debug.js` + lil-gui/stats.js addons) so it loads lazily and is
  not in the critical-path bundle blocking first paint.
- **Deploy flow change**: GitHub Pages must serve built `dist/` instead of the repo root. Recommended:
  a GitHub Action that builds on push (keeps the publish step "git push → it builds itself"). Alt:
  commit `dist/`, or a `gh-pages` branch. **This is the one decision the user must make.**

## Constraints / risk

- **Overrides a documented project constraint.** CLAUDE.md states "no build system — must open from
  GitHub Pages without install." Adopting Vite breaks "clone and it just runs" (now needs
  `npm install`). Update CLAUDE.md in the same change.
- **Terrain Worker is a Blob from a `WORKER_SOURCE` template string** (`src/terrain.js`), not a separate
  file — bundlers sometimes mishandle Workers. The build does NOT change this pattern, but the verify
  step MUST confirm the Worker still spins up and terrain streams (don't assume).
- Headless gates (`npm test`, `test/*.mjs`) import `src/` directly via node ESM — they must keep working
  unchanged (Vite is a publish step, not a runtime dependency of the gates). Verify `npm test` green
  after.

## Acceptance

- [ ] User has signed off on overriding the "no build system" constraint and chosen the deploy mechanism.
- [ ] `npm run build` produces a `dist/` that loads and plays identically (truck spawns, terrain + road
      stream, Worker alive, debug panel still openable).
- [ ] Cold first-load (measured on the Windows machine) is meaningfully shorter than baseline; the
      *delivery* portion (module fetch + parse, per perf marks before first paint) drops.
- [ ] `npm test` stays green (gates import `src/` directly, unaffected by the build step).
- [ ] CLAUDE.md updated to reflect the build step + new local-dev (`npm run dev`) and deploy flow.

## Files

- `index.html` (remove importmap, point at built entry), new `package.json` / `vite.config.js`,
  new `.github/workflows/*` (if Action deploy), `CLAUDE.md` (constraint + workflow update),
  `src/main.js` (lazy-import `debug.js` for code-split), `src/debug.js`.

## Relationships

- **QUAL-04** (visible build marker, open) — *combines directly*. QUAL-04 exists to work AROUND the
  no-build constraint ("needs no build system"); with a bundler the build id is free (the content-hash
  in the output filename, or a Vite `define`-injected commit SHA). If PERF-04 lands, QUAL-04 collapses
  to a near-trivial follow-on. If PERF-04 is declined, QUAL-04 stands as written.
- **PERF-01/02/03** (completed) — those cut the road/terrain *generation* cost on the main thread. PERF-04
  is orthogonal: it cuts code *delivery* cost. Both feed the same "snappy cold load" goal from different
  angles.
- **PERF-05** (driving stutter) — explicitly NOT addressed by this ticket. Bundling does nothing for
  runtime fps. Filed separately so the two are not conflated.

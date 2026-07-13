---
id: INFRA-01
type: infra
status: open
opened: 2026-07-13
severity: minor
source: user-request
note: "OPTIONAL / action-if-needed reference ticket. Not blocking. Filed so the road-trip test-offload plan is captured; pull the trigger only if battery/feedback-loop pain actually bites. The immediate, zero-infra relief (selective `npm test -- --only=` + treating the full suite as pre-commit-only) needs NONE of this — that's the first Acceptance box and can be adopted today. The Windows-machine integration below is the heavier follow-on."
---

# INFRA-01: Offload test execution to a networked Windows machine (thin-client dev)

## Motivation

Running the test harness on the M4 MacBook Air during a road trip (Starlink + a 1 kWh battery
also powering a fridge) is both a **battery** problem and a **feedback-loop** problem:

- **Battery.** The `test/` workload has two tiers with very different power cost:
  - The **`npm test` gate suite** (`test/run-all.mjs`, ~34 pure-node gates, pooled) pegs every
    core for minutes. On a **fanless** Air on battery this is the worst-case load: it thermally
    throttles (so it also runs *slower* than plugged-in) AND drains hard. Reported 10-15 min runs.
  - The **PERF-08 profiling harness** (`test/profile.mjs`, `test/trace-report.mjs` via
    `test/lib/cdp.mjs`) launches **real headless Chrome rendering terrain via WebGL** — sustained
    GPU, the classic laptop battery hog. (Tier 3; only just started being used.)
- **Feedback loop.** Treating the full 34-gate suite as a per-change gate injects a 10-15 min delay
  between "request a feature" and "see it tested," which hampers iteration. The full suite's real job
  is catching what you *didn't* think you touched — that's a **pre-commit** action, not an inner-loop
  one.

Goal: keep an interactive Claude Code terminal session on the MacBook while the heavy lifting (Chrome
+ node + the gate suite, and Claude Code's own process) runs on a networked desktop. Make the Air a
thin client that only renders a terminal.

## Available hardware / target

- **Desktop:** Windows PC, NVIDIA RTX 3070 Ti, left powered on at home. Reachable over Starlink via
  **Tailscale** (NAT traversal, no port-forwarding).
- **Client:** M4 MacBook Air, terminal only.
- **Repo is ~10 MB** — sync cost is negligible; git is a fine bridge, but the authoritative working
  copy Claude edits should live where Claude runs (the desktop) to avoid edit/test drift.

## Key finding — the harness is already ~90% ready

`test/lib/cdp.mjs` was built **port-based**: `connect({ port })` (cdp.mjs:59) speaks CDP to
`http://localhost:<port>/json/list` and does not care who launched Chrome or where. Only
`launchChrome()` (cdp.mjs:23) is Mac-hardcoded:

- `CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'` (cdp.mjs:16) — macOS path.
- `--use-angle=metal` (cdp.mjs:29) — macOS-only ANGLE backend.

So "attach to a Chrome running elsewhere" is nearly free; there is no harness rewrite.

## Plan / what changes

### A. Thin-client stack (no code changes)
1. **Tailscale** on the Mac and the Windows PC → PC reachable over Starlink's NAT.
2. **WSL2 (Ubuntu)** on the PC hosts the Linux side: node, the repo clone, and Claude Code itself.
   The `.mjs` harness is POSIX-shaped and runs unmodified. Use WSL2 **mirrored networking** so the
   tailnet address reaches into WSL and WSL↔Windows `localhost` works bidirectionally (needed for
   the native-Chrome attach in option C-2).
3. **sshd inside WSL2**, then **`mosh` + `tmux`** from the Mac:
   - `mosh` (UDP, local echo) rides out Starlink latency + satellite-handoff dropouts.
   - `tmux` keeps a running gate/profiling job alive across a full disconnect — reattach, don't restart.
4. From the Mac: `mosh <pc-tailnet-name>` → `tmux attach` → `claude`. Compute is on the PC; the Air
   renders a terminal.

### B. Tier 1 (gate suite) offload — the main battery + feedback win
- **Immediate, no infra (do this regardless):** iterate with the *existing* filter —
  `npm test -- --only=<substr>[,<substr>]` (run-all.mjs:62) — running only the gates for the
  subsystem under edit (e.g. `--only=props,prop-road`; `--only=arc-router,road-minradius,centerline`).
  Inner loop drops from 10-15 min to seconds. Reserve the **full** `npm test` for **pre-commit**.
- **On the PC:** run the full pre-commit sweep in the WSL2 session — more cores, plugged in, no thermal
  throttle → wider pool + full clocks, and zero laptop battery. `run-all.mjs` POOL scales with
  `availableParallelism()` automatically (run-all.mjs:68).
- **Diagnostic to capture before optimizing a single gate:** the runner prints
  `slowest gates: … · wall Xs (pool P) · gate-cpu Ys` (run-all.mjs:101). If `gate-cpu ≫ wall×pool`
  → pool-bound, the PC's core count directly shortens wall. If one gate dominates the wall → a single
  heavy-worldgen "pig" worth optimizing/down-sampling (helps `--only` too). *(Grab this line first.)*
- **Optional nicety:** a changed-files→gates map to auto-pick the `--only` set from the working tree.
  Manual `--only` is ~90% of the win; only build this if the manual selection becomes a chore.

### C. Tier 3 (Chrome/WebGL profiling) offload — two options, pick per GPU-fidelity need
- **C-1 (simplest): Chrome inside WSL2.** May fall back to SwiftShader (software) WebGL. Fine for
  functional gates and CPU/worldgen timings (the bulk of PERF-08 attribution); frame-time numbers
  would NOT be GPU-true. Requires only the cross-platform `launchChrome` edit (Chrome-linux path +
  swap `--use-angle=metal` → vulkan/SwiftShader as available).
- **C-2 (GPU-true, recommended): Chrome native on Windows, harness attaches.** Launch Windows Chrome
  with `--use-angle=d3d11 --remote-debugging-port=9222`; the WSL2 harness calls `connect({ port: 9222 })`
  against it (reaching the Windows host via WSL2 mirrored-networking localhost). Frames render on the
  3070 Ti — **more stable and representative than the Air's integrated GPU** ever was.

### D. Small code changes needed for C (the only edits to `src`/`test`)
- `test/lib/cdp.mjs`: env-var the `CHROME` binary path and the `--use-angle=<backend>` flag (default
  to today's macOS values so local behaviour is unchanged). ~2 lines.
- `test/profile.mjs` + `test/trace-report.mjs`: add an **attach mode** (e.g. `--attach` / `CDP_PORT`
  env) that skips `launchChrome` and goes straight to `connect({ port })` against an already-running
  Chrome. ~a few lines each. `connect()` itself needs no change.
- No `src/` changes. No gate changes (gates never launch Chrome).

## Acceptance

- [ ] **(no infra, adopt now)** Inner-loop testing uses `npm test -- --only=<affected gates>`; the full
      34-gate `npm test` is run only pre-commit — feedback delay per change is seconds, not 10-15 min.
- [ ] Tailscale reaches the PC over Starlink; `mosh <pc>` → `tmux` → `claude` gives an interactive
      Claude Code session whose Bash/node/Chrome all execute on the PC (verify: `uname -a` / `nproc`
      report the desktop, not the Air).
- [ ] Full `npm test` runs green in the WSL2 session and is meaningfully faster than the throttled
      on-battery Air run (paste the `wall Xs (pool P) · gate-cpu Ys` line before/after).
- [ ] The MacBook stays cool / low-drain during a full suite run (workload is on the PC).
- [ ] **(if Tier 3 offload is wanted)** `cdp.mjs` is env-parametrized and `profile.mjs`/`trace-report.mjs`
      support attach mode; a profiling run + trace capture completes against remote/native Chrome and
      writes a valid trace. Local macOS launch behaviour is unchanged (defaults preserved) — verify a
      local run still works.
- [ ] **(if C-2)** Chrome renders on the 3070 Ti (`--use-angle=d3d11`, not SwiftShader) — confirm via
      `chrome://gpu` / trace GPU-process activity, so frame numbers are GPU-true.

## Files

- `test/lib/cdp.mjs` (env-var CHROME path + angle backend; `connect()` unchanged),
  `test/profile.mjs`, `test/trace-report.mjs` (attach mode).
- No `src/` changes. No `run-all.mjs` change (`--only` + POOL scaling already exist).
- Docs: optionally note the remote-test workflow in `CLAUDE.md` / a `test/README` if it becomes the norm.

## Relationships

- **PERF-08 profiling harness** (shipped, `test/profile.mjs` / `trace-report.mjs` / `lib/cdp.mjs`,
  parallel gate runner) — this ticket rides on the port-based CDP design PERF-08 established; the
  attach-mode edits are the natural extension of it. See memory `project_perf08_harness_findings.md`.
- **PERF-04** (bundler, open) — unrelated to test execution, but note both tickets reference the same
  Windows machine as a *target device* (PERF-04 for cold-load measurement, INFRA-01 as the test host).
  The PC being set up here doubles as PERF-04's measurement rig.
- Not a game/runtime change — pure dev-infrastructure. `src/` (the product) is untouched except via
  the tiny `test/` attach-mode edits, consistent with CLAUDE.md "diagnostics live in test/, not src/".

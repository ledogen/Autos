---
id: INFRA-08
type: infra
status: open
severity: major
opened: 2026-11-05
source: orchestrator + Lane C, 2026-11-05 night — every landing smoke that failed tonight failed on wall-clock checks under load, never on code (the same code passed alone each time)
relates: INFRA-07 (cdp-smoke), test/cdp-smoke.mjs, CLAUDE.md ("wall-clock assertions are report-only")
---
lane: B

# INFRA-08: cdp-smoke fails on machine load, not on code

With all lanes at full CPU (and the owner gaming on the same GPU), landing smokes failed at:
- `drive`: "truck moved 24.8 m in 8 s of W (need ≥ 40)" (line ~164). The sim runs behind wall-clock time under load.
- `story` / resumed run / new run / opening: "never went live (45 s)" (lines ~262, 805, 933, 1010). Load stretched it to 38–44 s.
- `papers`: "an RB tap while aiming on a live round threw no paper". The aim and tap are held for wall-clock ms, so they are short of the sim time the throw needs.

Each of those passed on a rerun alone. A smoke must still fail on a real hang, so the fix is not "report only". Measure
progress in **sim time / sim distance** instead of wall time, and keep generous wall-clock ceilings only as hang guards.

## Acceptance

- [ ] `drive` asserts distance per **simulated** second (or waits on the sim until N m, with a hang ceiling).
- [ ] The "went live" waits keep a hang ceiling but scale with a measured boot factor (e.g. boot ms vs a baseline), or wait on progress events rather than a fixed 45 s.
- [ ] The papers aim/tap hold for sim time, not wall ms.
- [ ] Proof: the smoke passes 3/3 with a full `npm run test:all` running beside it, and still fails fast on an injected hang.

## Work log

### 2026-11-05/06 — Lane B (feature/machine)

**What changed (test/cdp-smoke.mjs, plus one line in src/main.js):**

- **A sim clock for the smoke.** `window.__simT = () => simTime` in main.js is INFRA-08's test hook. It is a read-only
  getter defined once at load, like `__car`; nothing runs per step. No existing clock fits:
  - `simTime` reaches the page only through the capture download (`_captureSession`).
  - The day clock stops while camp or the service screen is up, and jumps on `advanceMinutes`.
  - Vehicle state carries no clock.
- **`untilSim(fn, s)` / `simFor(s)`** poll until a condition holds or until the SIM has run `s` seconds.
  - If the sim stops stepping for 10 s × stretch, that counts as a hang and the run fails right there.
  - Users: `hold` (the `drive` 8 s and `offer` 6 s throttle holds), `seat()`'s settle, the `teleport` and `lab`
    settles, the camp clock-resume check, the edge's run to the fade, papers' roll-off, and the crash-resume roll.
- **`__teleport` + a guessed `sleep(2000–4000)` → `seat()`.** That covers `teleport`, three in `camp`, two in
  `expedition`, and one in `offer`. `seat()` waits for the reseat promise (it awaits a network build) and then settles
  for 1 sim-s.
- **Papers: the tap was too LONG, not too short.** gamepad.js times an RB tap in WALL ms (`throwTapMs` 200). A press
  held longer becomes the handbrake. Under load, the smoke's "3 frames + 80 ms + a CDP round trip" ran past 200 ms.
  - Now RB is pressed for one pad poll and let go in-page on the next frame
    (`__fp.b[5] = 1; requestAnimationFrame(() => { __fp.b[5] = 0 })`).
  - The poll's rAF callback was queued in the previous frame, so it runs first and sees the press.
- **Every `until` ceiling is a hang guard that stretches with how slow the box is.** The stretch factor is the larger
  of:
  - the boot step's time over an idle boot (`BOOT_IDLE_S` 3.5 s, this Mac's 3.3–3.5 s);
  - the 1-min load average per core, if that climbs later.
  - Past `TOO_SLOW` = 10× idle (a 35 s boot), the run stops at boot: "a hang, or a box too loaded to judge the code —
    rerun alone".
  - The summary line prints the stretch.

**Why the boot, not the load average.** The first design scaled ceilings by load average per core. It failed 3/3 at
boot. The box then had two full suites, Spare's `--cpu-prof` bench, and the owner's game (Seed, about 2.5 cores plus
the GPU).
- A bare boot took 157 s, 47× idle, while load per core read 3–4×.
- A frame-counting probe shows why. The boot, like a story load, builds the world a slice per rendered frame. The
  headless page drew only 12–14 fps with a suite and the game running, so the build crawled at load 1.8/core.
- Boot time therefore predicts story-load time: a 13 s boot (3.7×) went with a 4.1× story load earlier that night.
  The load average sees none of the GPU.

| Box state | Boot | × idle |
|---|---|---|
| idle (earlier landing smokes) | 3.3–3.5 s | 1 |
| 2026-11-05 landing failures | 7.5–13 s | 2–4 |
| owner's game only | 21 s | 6 |
| game + one full suite | 59 s | 17 (12–14 fps) |
| game + two full suites + Spare bench | 157 s | 47 |

At 17×, a full smoke would run more than an hour and prove nothing, so the 10× cap stands (orchestrator, 2026-11-06).

**Proof so far:**
- Injected hang (`window.requestAnimationFrame = () => 0` at the start of `drive`, game-only box, 6×): FAIL in
  `drive`, "the sim stopped stepping, 0.00 of 8 sim-s in". The stall guard fired after 60 s (10 s × 6); total run 86 s.
- Too-loaded refusal: 6/6 runs beside a full suite plus the game stopped at boot in 36 s with the rerun-alone message.

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

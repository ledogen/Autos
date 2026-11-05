---
id: BUG-111
type: bug
status: closed
severity: minor
opened: 2026-11-05
source: Spare, found while fixing BUG-110 (feature/spare a2c5173c)
relates: BUG-110 (the spawn replica now injects the pond no-go; this is the region network's half), main.js setWaterNoGo
---
lane: Spare

# BUG-111: story gates build their region network without the pond no-go

A test-harness fidelity gap, not a game bug. main.js injects the pond no-go (`setWaterNoGo`) before the
first stream, so the game's roads route around ponds. BUG-110 made the headless spawn replica do the same.
The gates' REGION networks still don't: world-determinism, region-pieces, expedition-camp,
demolition-site and camp-edge-census. So near a pond, the roads they measure aren't the game's.

Wiring it in moves what those gates measure, so it is its own pass. Each gate's pins get re-read and
re-justified, never bumped blind.

## Acceptance

- [ ] Every story gate's region network is built with the game's pond no-go (one shared helper, not five copies).
- [ ] Each gate's moved pins are listed with old → new and why, in this ticket.
- [ ] All five gates green.

## Built (Spare, 2026-11-05) — what moved, gate by gate

One helper, `test/lib/pond-no-go.mjs` (`wirePondNoGo(road, seed, params)`, called right after `new RoadSystem`);
`spawn-decision.mjs` uses it too. Wired into world-determinism, region-pieces, expedition-camp, demolition-site,
camp-edge-census, and camp-reach (new from Lane A, same pattern). Before/after runs in `wip/bug-111/`:
- **region-pieces** — nothing moved (same pieces and stranded km on all seven seeds).
- **world-determinism** — still all passed (it asserts history-independence, which the no-go does not touch).
  Seed 6's region pool is 20 → 22 viable pads (roster 18 → 20/26); seed 90's 20 → 21 (houses placed 10 → 7).
- **expedition-camp** — same camps. Steepest deck under a barricade 14.2° → 14.0°; requisition pars reqCrew
  328 → 336 s, reqSigns 204 → 201 s. Green.
- **demolition-site** — went RED, and rightly: "a farm or work site posts a demolition offer on some seed's
  board" was 1 → 0. Seed 1's real 06:00 board posts none; its one offer existed only on the pond-blind roads.
  A scan of seeds 2–8 with the no-go (`wip/bug-111/demo-scan.mjs`): 4 → 2, 5 → 1, 8 → 2, the rest 0. The gate's
  seeds are now ['8', '6'] (seed 1 only repeated the camp line seed 6 already covers). Green, 2 offers.
- **camp-edge-census** — a JSON census, not a gate; its rows move with the roads, as they should.

## Resolution (2026-11-05) — CLOSED

Landed on main bdf2ff5e: every story gate's region network (world-determinism, region-pieces, expedition-camp,
demolition-site, camp-edge-census, camp-reach) is built with the game's pond no-go through one helper; the moved
pins are listed above (demolition-site now samples seed 8). Suite on main 125/125.

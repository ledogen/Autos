---
id: BUG-63
type: bug
status: pending
severity: major
---

# BUG-63 — leaving the road and rejoining it beats a par computed on the route you were given

Found 2026-09-07 while re-cutting the rank bands (see
`.planning/story-mode/design-amendments-2026-09-07-band-recut.md`). Split out of that work
deliberately: the band re-cut fixed the letters, this is the hole underneath them and it needs its
own ruling.

## The defect

`computePar` prices the **routed centerline** — an arc range per edge, in travel order. The mission
timer measures **wall-clock from start to finish**. Nothing anywhere checks that the truck was
anywhere near the route in between. So the cheapest way to beat par is not to drive well, it is to
not drive the route: cut across country between two points of the network and rejoin.

## The existence proof

`runs-v2/0015-very_fast-S-105s-2.8km.json`, ratio **0.668** — comfortably the best score in the
entire 18-run library, and the only S under the pre-2026-09-07 bands. Measured frame-by-frame
against the topology the export carries:

| | |
|---|---|
| routed distance | 2761.6 m |
| driven path (XZ) | 2274 m |
| route arc never approached within 10 m | **s 1224 → 1696 — 471 m, 17% of the route** |
| peak distance from the centerline | **210 m** |

Every other capture in the library stays inside ~2 m mean / 12 m max of the line, so this is not
corner-cutting on road width — it is a cross-country shortcut. Par charged the driver for 2762 m of
road geometry they did not drive.

Left in `runs-v2/` on purpose (it is real recorded data), but it is **excluded from every
calibration** and `test/economy.mjs` now pins the day-20 S threshold against the best *honest* drive
(0.740) with a comment saying why.

## Why it is not just "the player being clever"

Under SM-INV-4 payout is continuous margin against par, so this is not a leaderboard curiosity — it
is the highest-paying strategy in the game, it scales with how bad the terrain shortcut is allowed
to be, and it gets better the more the router prefers switchbacks over the direct line. It also
silently poisons the run library: any threshold or `PAR_REF` fit that swallows a shortcut run is
fitting an exploit.

## Acceptance

The ruling is the owner's — this is a design call, not a tuning one, and the three obvious options
are not equivalent:

1. **Fail / void the mission** on leaving a corridor around the route. Harshest, simplest, and it
   fights the "roads are a choice, not a rail" feel the whole road system is built on.
2. **Re-price against the route actually driven** — par the path, not the plan. Honest, keeps
   off-road legal, and is the most work (par would need to price arbitrary terrain, which it cannot
   do today: it reads road curvature and the routed design elevation).
3. **A soft corridor** — off-route distance accrues a time penalty, or the par credit for skipped
   arc is withheld. Tunable, and the only one that leaves a deliberate shortcut as a *tradeoff*
   rather than a cheat or a free win.

Whichever lands, the acceptance test is the same and is already available headlessly: replaying
`0015`'s trace against its route must NOT produce the best score in the library, and the five honest
captures alongside it must be unchanged to within float noise. Add it as a gate in `test/gates.mjs`
under the `story` subsystem.

Related: the [Shortcut spirit](../../story-mode/spirits-and-pacts.md) is explicitly about legitimate
route-shortening (*a shorter route, not a modified par*) — whatever is chosen here has to leave that
mechanic intact.

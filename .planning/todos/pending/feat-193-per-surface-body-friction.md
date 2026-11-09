---
id: FEAT-193
type: feature
status: landed 51a932bf with BUG-140 — open only for the owner's feel drive + the scope call
severity: minor
opened: 2026-11-09
source: owner, 2026-11-08 tracker owed side-slide-lever — "can i have body grip on all offroad surfaces bumped to 1.0 mu. onroad leave 0.5 mu. simplified dig in"
relates: BUG-115, BUG-116, BUG-140
lane: Spare (physics files are Lane B's; Spare builds it while B is on the road-surface landings)
---

## What

The owner's pick on BUG-115/116's side-slide levers: the "simplified dig-in". Instead of a new ploughing force
(lever (b)), the body's friction depends on what it slides on:
- **Off-road** (terrain heightfield, every off-road surface): body μ = **1.0**.
- **On-road** (the road deck): body μ stays **0.5** (today's flank value, BUG-116).

This is the per-surface cab friction BUG-115 § "Follow-up idea" recorded: a rolling truck on dirt grips and
tumbles on; on asphalt it skids along. MESH == PHYSICS still holds: the surface is the collider it touches,
not a second lookup.

## Acceptance

- [x] Body-vs-terrain contacts use μ 1.0, body-vs-road 0.5; tires and props unchanged. Tunable in the debug menu.
- [x] Measured, headless: BUG-116's side-slide numbers (stop distance along and across, rolls on vs stops) on dirt and on
  road, before → after.
- [x] The physics fingerprint is re-pinned in the same commit (one re-pin with BUG-140).
- [ ] One feel drive owed to the owner (shared with BUG-140's).

## Built (Spare, 2026-11-09) — land/bug-140, with BUG-140

**How.** Box3D mixes friction by geometric mean, √(μa·μb), with no per-pair override in the bindings, so one flank μ
cannot be 1.0 on dirt (μ 0.8) and 0.5 on asphalt (μ 0.9). Instead the road deck got its own collision group:
`GROUP_ROAD` (`src/physics-engine.js`, `addRoadMesh`; `src/terrain-physics.js` RoadPhysics builds every road-tile triangle
with it — ribbons, pads, bore linings). Each flank hull (BUG-116, the slab's hip) is now two coincident hulls:
- the **off-road** copy sees `GROUP_TERRAIN | GROUP_STATIC` (heightfield, lids, static props) at shape μ 1.0²/0.8 → pair 1.0;
- the **road** copy sees `GROUP_ROAD | GROUP_DEBRIS` at 0.5²/0.9 → pair 0.5 on asphalt. A loose rock (μ 0.7) meets it at
  0.44, about BUG-116's 0.47, so props are as good as unchanged.
The surface is the collider the flank touches — no lookup. Tires never see engine materials (unchanged by
construction). Params `bodyGripOffroad` 1.0 / `bodyGripRoad` 0.5 (ranger.js); sliders "Body Grip off-road (μ)" and
"Body Grip road (μ)" under Vehicle → Drivetrain & Brakes, beside Body Bounce (`setBodyGrip`, physics.js).

**Scope read: the flank only.** The cab (0.3, the owner's BUG-115 roof call) and the slab's bottom and bumpers (0.1,
BUG-27b — a bumper grazing a shoulder must slide) are unchanged. The ticket's "body μ stays 0.5 (today's flank value)"
says the flank; extending 1.0 to the cab or the slab is the owner's call.

**Side-slide, before → after** (`wip/bug-140/side.mjs`: on its right side on flat ground, the game's contact and
open-bed chassis; dirt = heightfield μ 0.8, road = road-deck mesh μ 0.9):

| | 15 m/s along its length | 15 m/s across, roof-first, no spin | still rolling (8–12 m/s × 2.5–3.5 rad/s): roll on / mean slide |
|---|---|---|---|
| dirt, main | 20.4 m | 25.9 m, stops on its side | 6/9 · 15.8 m |
| **dirt, after** | **11.8 m** | **18.2 m**, stops on its side | **9/9** · 15.0 m |
| road, main | 19.5 m | 24.7 m, stops on its side | 6/9 · 15.2 m |
| **road, after** | **20.1 m** | **25.6 m**, stops on its side | **3/9** · 14.8 m |

On dirt the truck grips and tumbles on; on asphalt it skids — the contrast the ticket asked for. BUG-140's A + 2 moves
none of these (dirt at 0.5 on the branch: 20.4 m / 25.9 m / 6 of 9, identical to main). The road's 6 → 3 of 9 is the
grip, not BUG-140: main's flank (shape μ 0.31, tuned against dirt's 0.8) met the road's 0.9 at **0.53**, not 0.5; at
`bodyGripRoad` 0.53 the branch gives main's 6/9 back. The three 3 rad/s cases sit on that edge.
`test/side-slide.mjs` now pins the split (road slide > 1.3× dirt's; `lib/engine-ctx.mjs` `road: true` builds the deck).

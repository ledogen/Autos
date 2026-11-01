---
id: BUG-93
type: bug
status: closed
severity: major
opened: 2026-10-25
source: owner, 2026-10-25 — "still a lot of terrain holes near tunnel portals. there's also grass/prop shadows inside the tunnels that shouldnt be there. i propose a lot of trying stuff and verifying with screenshots that the gaps are closed."
relates: BUG-81 (portal seal + the launch), BUG-77 (span domain), BUG-67 (bore portal inside a junction), FEAT-40 (tunnels), FEAT-85 (grass cover — prop-scatter skips `bore` samples already), PERF-07 (baked prop shadows)
---
lane: Spare

# BUG-93: Terrain holes at tunnel portals; grass and prop shadows inside the bores

## Two symptoms, one place

1. **Holes.** Around a portal the terrain mesh and the bore lining / portal ring leave gaps you can see
   through — still, after BUG-81's seal work. The owner sees "a lot" of them.
2. **Shadows inside.** Grass clumps and props cast (or bake — PERF-07's atlas) shadows onto the bore
   floor and walls. There is no sky in a tunnel; nothing should shade there. The scatter already skips
   bore samples (`prop-scatter.js` `if (s.bore) continue`) — so either the skip misses the portal
   approach band, or the shadow pass (the baked shear atlas, or the cast-shadow map) still reaches in.

## Method (the owner's ask)

Iterate with screenshots. `node test/screenshot.mjs <x> <z> [--seed=]` frames any world point from
the freecam; the known portal sites are in the road-tunnel gate's region (BUG-77's run on seed 6) and
whatever the owner captures next (press the capture key at a hole; `node test/replay.mjs` reads it).
Before/after pairs per attempt; keep the pair that closes the gap, revert the rest (visual
regression → revert first, standing rule).

## Progress — 2026-10-31 (Spare): five defects found and fixed; owner's look owed

Found on seed 6's eight live portals with a live-page probe, not by eye alone: `wip/bug-93/holemap.mjs`
casts a vertical ray grid across a mouth inside the running game, re-applies the terrain shader's
tunnel discard to terrain hits, and prints what each cell's ground IS (T terrain · R road · L lining ·
P ring · `.` nothing). `portalshots.mjs` frames every portal the page built; `pick.mjs` names the
object under a pixel. Before/after pairs are in `wip/bug-93/`.

1. **Ring feet floated** (daylight under a leg on the cambered low side / the neck's dip). The arch
   ended at h = 0. Now each row runs straight down 2 m below grade (`buildPortalRing` LEG) — the
   ring stands on whatever ground is there. Colliders follow (RoadPhysics mirrors the geometry).
2. **Missing proud lip** (a 2 m hole across the mouth on the high side). A slice only built its bore
   piece for overlaps > 0.5 m, so a mouth 0.25 m before a slice boundary got no lip at all. A slice
   holding a span END now always builds its piece (`road-mesh.js` tile loop).
3. **A line of sky across the mouth** seen from inside. The apron sits 5 cm under carve dirt; the
   terrain just outside the cut started above it, and the open step faced into the bore. The lip's
   outer ring now sits 6 cm ABOVE carve dirt (`LIP_RISE`) so the apron ends on the dirt.
4. **A ragged gravel shelf over the apron** inside the mouth (low side of a cambered bore). The
   shader cut stopped 0.3 m under grade; the apron runs lower there. Now 1.2 m (`TUNNEL_CUT_FLOOR`);
   the flat outer cap keeps the ground outside. The hole map is unchanged by it (no new holes).
5. **Rocks and grass hanging in the mouth** — the "prop shadows inside" (`pick.mjs`: the specks were
   instanced litter rocks 1–5 m up). The scatter stood them on the analytic height there — the
   mouth-funnel notch — which the shader then cuts. New optional sampler `skinCut` =
   `TerrainSystem.tunnelCutAt`, the shader's capsule test in JS (the three constants are shared, so
   the two cannot drift), checked at every placement AFTER its draws: nothing else moves.

**Tried and reverted:** aiming the cut capsule along the chord instead of the tangent. It did nothing
for the lit patch it was meant for (that patch is the lining itself, lit near the mouth — correct) and
its tilted cap opened a sliver at the leg.

**Left:** at lat ±8 m inside the hill, the 0.45 m strip between the lining's wall foot and the cut's
radius has no surface — enclosed by the wall, the ring band and the hill, so not visible from the
road or above. No owner capture has been tried yet (none filed).

Gates: affected 42/44 (road-tunnel, road-clearance = the known reds, identical to main), cdp-smoke
19/19.

**Rechecked 2026-11-01** after BUG-81 item 4 moved every portal inward (portalCover 2 → 6): the
hole map on all eight seed-6 portals shows no gap at the mouth or outside it — only the hidden
wall-foot strip inside the hill, as before. Nothing left for Spare here but the owner's look.

## Acceptance

- [x] (8 seed-6 portals, owner's look owed) At every portal of the gate region and the owner's captures, no see-through gap between
      terrain, lining and ring from road level or above (screenshot pairs in the ticket's resolution).
- [x] No grass, prop or baked prop shadow inside a bore span or on its floor.
- [x] MESH == PHYSICS holds (terrain-physics mirrors the same fix); road-tunnel gate not worse than
      its known red (BUG-77).

## CLOSED — owner, 2026-11-01: "b93 looks fixed. nice."

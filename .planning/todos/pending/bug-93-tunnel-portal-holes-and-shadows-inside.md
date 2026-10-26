---
id: BUG-93
type: bug
status: open
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

## Acceptance

- [ ] At every portal of the gate region and the owner's captures, no see-through gap between
      terrain, lining and ring from road level or above (screenshot pairs in the ticket's resolution).
- [ ] No grass, prop or baked prop shadow inside a bore span or on its floor.
- [ ] MESH == PHYSICS holds (terrain-physics mirrors the same fix); road-tunnel gate not worse than
      its known red (BUG-77).

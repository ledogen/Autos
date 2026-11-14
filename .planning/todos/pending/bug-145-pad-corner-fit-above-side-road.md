---
id: BUG-145
type: bug
status: open
severity: minor
opened: 2026-11-08
source: Lane B, BUG-137's scans
relates: BUG-137 (same node), road.js _mergeCarve (the 0.55 m duck cap), BUG-122 (the 0.15 m designed edge)
---
lane: B

# BUG-145: a pad corner stands 0.95 m above its side road, and the duck cap leaves a 0.54 m drop

Seed 917338424, BUG-137's node. In the corner between the side road and the trunk at (−212.4, −540.8), the pad's
fitted surface stands 0.95 m above the side road's own surface. `_mergeCarve`'s 0.55 m duck cap then holds the dirt
beside the pad's edge 0.4 m low: a 0.54 m drop at the edge, where 0.15 m is designed.

## Acceptance

- The pad's corner fit follows the side road there, and the edge drop is the designed ~0.15 m.
- The cause named: the corner fit, or the cap.

## Root cause and fix (Lane B, 2026-11-08, `land/bug-145-144`)

**The cap, not the corner fit.** Mesh and physics merged the pad's dirt with the leg's under DIFFERENT caps:
the terrain mesh (`terrain.js _buildCarveTable` → `_mergeCarve`'s default) at `PAD_DUCK_CAP` 1.2 m, physics
(`_sampleCarveWorld`) at `PAD_DUCK_CAP_PHYS` 0.55 m. At this corner the pad's dirt stands 0.95 m over the side road's,
so the DRAWN dirt followed the pad — the designed 0.15 m drop at the asphalt edge — while physics held its dirt 0.4 m
lower: a 0.54 m drop only the wheel could feel. The 0.55 cap guarded against the old free-sampled duck field's jumps
at crease lines; PERF-25 made the pad surface resolve-free and continuous, so that reason is gone.

The corner fit itself is right: it bridges a trunk climbing at 15 % and a side road falling away, and it is drawn so.

**Fix:** one cap, `PAD_DUCK_CAP` 1.2, for mesh and physics — MESH == PHYSICS at the rim again.
- **The gate:** `junction-edge-lip` gains RIM — the pad's own edge between its legs, every 0.5 m of ring away from the
  legs' pavements: physics 5 cm inside minus 5 cm outside ≤ 0.25 m. Main fails it 3 times at this corner (0.46–0.55 m);
  the fix passes on all three seeds (218 rim points, worst 0.158 m).
- `shoulder-lateral-continuity` (the 0.70 m plaza tolerance the old cap guarded) passes, worst 0.064 m;
  `road-smoothness` and `bank-steps` pass.

---
id: BUG-122
type: bug
status: open
opened: 2026-11-07
severity: major
source: Lane B's drive soak (test/drive-soak.mjs, on feature/machine), reported to the orchestrator 2026-11-07
owner: Spare (road / carve), after BUG-121
relates_to: BUG-82 (pads weld to ribbons), BUG-74 (roadwork seam), the asphalt clearanceMargin lip
---

# BUG-122: the asphalt edge lip doubles (0.15 → 0.31 m) on a junction approach

## What happens

Away from junctions the asphalt edge stands the designed ~0.15 m lip (clearanceMargin) above the carved
shoulder dirt. On a junction approach the junction's ruled top rises while the shoulder dirt beside it stays
down, so the lip doubles to ~0.31 m. A wheel riding the shoulder that climbs back on takes a hard hit.

## Evidence (seed 6, the test seed; re-check on random seeds)

- Run `g:-298049,-987064,-1:-1,-2,1`, its south leg ~15 m before the junction node (−298, −987), east edge at
  about (−299.7, −1002.1). The physics ground (carved terrain, what `queryContacts` returns) drops 0.31 m within
  0.1 m laterally: −0.220 at 4.9 m from the centreline, −0.531 at 5.0 m (hub-relative).
- `sampleRoadTopY − dirt` grows 0.15 → 0.29 over the last 2 m before that point.
- The soak's front-right wheel climbs back on at 15.1 m/s: strut load 4.9 → 75.5 kN in one 1/60 s step, hub up
  18 cm, a 2.8 m/s jolt. Reproduces on replay.
- Capture: `CarGame-machine/wip/drive-soak/try4/6-strut-1.json`;
  `SOAK_TRACE=2 node test/drive-soak.mjs --replay=<capture>` prints the cross-section.
- Contrast: the soak's other flag at (−302.5, −945.9), 9.9 m/s, 56 kN, is the normal 0.14 m lip, the designed kerb.

## Acceptance

- [ ] Root cause named: why the junction's top rises without the shoulder carve following it.
- [ ] Along every junction approach on a random-seed sample, the edge lip stays at the designed ~0.15 m
      (MESH == PHYSICS: mesh and collider agree).
- [ ] A gate pins it (sampled, reported as a sample).
- [ ] The capture replays without the strut spike; `fingerprint-world` changes are explained.

## Root causes and the fix (Spare, 2026-11-07, `land/bug-122`)

**How common, on main:** `wip/bug-122/census.mjs` walked every ringed junction's legs on random seeds 1353361482 and
369055107: 52 leg edges, both sides, 2–30 m out. The edge lip is physics 5 cm inside the asphalt edge minus 5 cm
outside.

| | lip > 0.25 m on main | after the fix |
|---|---|---|
| beside the pad | 46 / 52 edges (median worst 0.30 m) | 7 / 52 (median worst 0.17 m) |
| past the ring, on the approach | 36 / 52 (median 4 m long, up to 22 m) | 8 / 52 (up to 6 m) |

The capture point (seed 6): lip 0.31 → 0.163 m.

**Three causes:**

1. **The pad's `PAD_DIRT_EXTRA` ran past its ring.** That 0.15 m of armor under the pad's asphalt carried on through
   `_junctionPadCarve`'s rim-hold band and ramp. Every pad rim dropped clearance + extra (0.30 m), and the ramp dragged
   that drop up to 22 m along the approach ribbons' edges. The `_sampleCarveWorld` comment called 0.30 "the same as a
   ribbon shoulder", which was true when clearance was 0.25; it is 0.15. **Fixed:** the extra applies only inside the
   ring.
2. **Physics rode an invisible ribbon beside some pads.** A trimmed leg is drawn from its mouth outward
   (`road-mesh.js` trimOf), but physics took "on the ribbon" from the lateral distance alone. Where the pad's ring
   sits inside the ribbon's edge line (up to ~0.5 m), the wheel rode an undrawn ribbon top up to ~0.35 m above the
   dirt there. **Fixed:** `_ribbonDrawnAt` applies the mesh's own trim rule, at PADDED ends only, with 1 m of slack at
   the mouth chord (`RIBBON_MOUTH_SLACK`).
   - Deg-2 (ringless) ends are left alone. Their trimmed outer corner is dirt in the mesh too, and the first version
     of the fix tripped `road-smoothness` there.
   - Without the slack, the mouth-chord slivers on curving legs dipped clearance into the dirt: 85 extra
     `vertical-curvature` junction kinks.
3. **Outside the ring, leg and pad dirt merge by MIN.** Where their tops differ, the lip grows by the difference.
   **Not fixed here:** minted as BUG-123.

**Owner-visible:** the dirt beside every pad rim stands 0.15 m higher. Before/after from road height:
https://claude.ai/artifact/TX882is4eteCgAvS4Qb9DB (no ruling needed, per the orchestrator).

**The capture replay** waits on Lane B's soak batch (`test/lib/world-rig.mjs` + `src/world-contacts.js`) reaching
main.

**Follow-up (noted, not built):** at deg-2 connector bends, the trimmed legs' outer corner is dirt in the mesh while
physics still rides the leg's ribbon top there.

**Fix 1's risk, measured:** raising the dirt outside the ring could let terrain triangles straddling the ring edge
poke up through the pad. `wip/bug-122/poke.mjs` rebuilds the mesh's vertex dirt as `terrain.js` `_buildCarveTable`
does, on the 1 m grid, interpolated at 8,536 points up to 1.5 m inside the rings (worst of the two triangle
splits). It compares that with the pad top (`_nodeSurfaceTop`).

| | dirt above the pad | tightest margin |
|---|---|---|
| main | 0 | 16.7 cm below |
| with the fix | 0 | 11.8 cm below |

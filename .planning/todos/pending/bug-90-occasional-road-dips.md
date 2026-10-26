---
id: BUG-90
type: bug
status: fixed-pending-playtest
severity: minor
opened: 2026-10-19
source: owner, 2026-10-19 — "dips in road are wack occasionally"
---

# BUG-90: Occasional bad dips in the road surface

## Symptom
Now and then the road has a dip that looks/feels wrong. No capture yet — location, seed and
kind (vertical kink, carve fold, junction/causeway seam) unknown.

## Captures (owner, 2026-10-25)
"was heading -x, -z thru this point and got vaulted and flipped at relatively low speed. turns out
you fall through the road ribbon slightly which exacerbates the crest significantly."
- `autos-capture-1792957491413.json` — place, seed 477662008, mark (197.3, 999.1). The flip.
- `autos-capture-1792957624450.json` — event, the re-drive (no flip, ~10 m/s).

## Root cause
The mark is the inside of a **deg-2 kink**: node (188.0, 1003.4), runs `g:253976,1043421,-1:0,1,2`
and `g:-99596,507271,-1:0,1,2`, joined by a 39.7 m connector. `_buildDeg2Ribbon` draws a full-width
(±halfWidth) asphalt strip along the connector fillet, and the fillet cuts the inside of the bend
PAST both runs' ribbon edges. `_sampleCarveWorld` rode the asphalt deck only where the **run's**
|lat| < halfWidth, so out there it read the dirt bench, `roadClearanceMargin` = 0.15 m below the
drawn asphalt. Driving the inside line: run ribbon → drop 0.15 m under visible asphalt → 0.15 m lip
back up onto the next leg's ribbon, right on the crest.

Probe (physics `analyticHeight` vs a raycast into the real headless road mesh, per wheel, along the
event trajectory): agreement ±2 cm across the lane, **+14…+20 cm** (ribbon above physics) on every
wheel sample at run |lat| 5.0–7.3 m. Physics there matched the recorded `*_gh` columns to 0.000 m.

Not every deg-2 node; every deg-2 node's INSIDE CORNER: the new gate measured exactly 0.150 m on
all 50 connectors in 4 windows (seeds 6, 3, 7 and the capture's).

## Fix
`src/road.js` `_sampleCarveWorld`: the on-ribbon decal branch also fires on the connector strip
(`co.lat < halfWidth`). Potholes stay run-ribbon only (the strip is drawn smooth).

## Verification
- `test/connector-deck.mjs` (new gate): every off-run strip point, |physics − sampleRoadTopY|
  0.150 m → 0.000 m.
- Event replay, same recorded inputs, old vs fixed surface: all-wheel-airborne frames 8 → 3, peak
  tire Fz 37.4 → 30.7 kN. (The replay's terrain self-check now reports 0.150 m vs the old capture —
  the surface changed by exactly the clearance, as intended.)

## Residual — NOT fixed (BUG-40's documented apex residual)
The connector's own design surface humps **0.31 m above the node height** at the apex (188.19 vs
187.88; both legs fall away from the node). Leg `…07271` banks 4° at the node → 15° within ~20 m,
and the inside-corner apex sits 3–5 m out on that leg's HIGH edge, so `_connectorDesignAt`'s
lateral term climbs +0.09 → +0.59 m in ~4 m as the weight hands from leg A to leg B. Drawn
geometry, mesh == physics — a road-design question, not this bug. That is the remaining crest the
3 airborne frames come from.

## Acceptance
- [x] Root cause found from a capture; fix proven headlessly (gate + replay).
- [ ] Owner play-test of the same corner on feature/spare.

## Next session — the crest (owner 2026-10-26)

> "i want to attempt fixing the crest itself but have the next agent re-digest the code and propose
> several solutions to me as a fix"

**The deliverable is a proposal, not a patch.** Re-read the connector code from scratch — do not
take this session's reading on trust; verify it with the tools below. Then bring the owner **3–4
candidate fixes**, each with:
- the mechanism, in a short paragraph;
- which function(s) change;
- the predicted effect at THIS corner, as numbers (design top vs node, launch g, airborne frames);
- the blast radius: how many other connectors move and by how much (census, not n=1), and which
  gates are at risk;
- the risk, and a recommendation.

**Implement nothing until the owner picks.**

### What this session measured (verify it)
The crest is in the connector's DESIGN surface itself. Mesh and physics agree on it
(`connector-deck` is green). `node test/deg2-apex-decomp.mjs wip/bug-90/autos-capture-1792957491413.json`:

| s (m) | leg A weight | A lateral xs | B lateral xs | B camber | design top vs node |
|---|---|---|---|---|---|
| 15.1 | 98 % | +0.10 | +0.75 | 6.0° | −0.12 |
| 17.6 | 86 % | +0.09 | +0.84 | 8.1° | +0.03 |
| 20.2 | 50 % | +0.03 | +0.77 | 10.1° | **+0.24** |
| 22.7 | 6 % | −0.05 | +0.63 | 11.3° | **+0.31** |
| 25.1 | 1 % | −0.12 | +0.48 | 12.3° | +0.10 |
| 27.5 | 1 % | −0.20 | +0.31 | 13.0° | −0.17 |

Both legs' centreline grades fall away from the node (187.88). Leg A is near-flat in bank at its
end. Leg B banks 4° at the node and 15° about 20 m on. The connector apex cuts the inside of the kink
and sits 3–5 m out on leg B's HIGH side (B's curve reverses the kink's direction). So when the
weight hands from A to B (s ≈ 17–23 m), B's camber·lat fold of +0.6…0.8 m arrives within about 5 m.
That is the BUG-40 § Residual "apex ridge", seen at real speed: the owner was vaulted at ~10 m/s on
the inside line.

### Read first (src/road.js unless noted)
- `_connectorDesignAt`: the two-leg blend. Weights are 1/(gap² + XS_SOFT²), with the BUG-40
  off-end fade (`XS_OFF_FADE`). It blends grade AND lateral fold with the same weights.
- `_runGradeAt`: one leg's grade + xs. The camber lever arm is capped at
  `halfWidth + roadCarveExtraWidth` (BUG-40).
- `_connectorCarve` → `_withConnectorTop` / `sampleRoadTopY` → `_sampleCarveWorld`: how the design
  becomes the carve, the drawn strip and the wheel surface. A fix that goes through
  `_connectorDesignAt` moves all three together (MESH == PHYSICS by construction).
- `_buildDeg2ArcGeom` / `_pushDeg2Core`: where the fillet centreline is fitted, i.e. how far the
  connector cuts the corner. `camberProfile` / `_buildCamberProfile`: how fast a leg's bank ramps.
- `src/road-mesh.js` `_buildDeg2Ribbon`: the strip sweep (9 columns, Y = sampleRoadTopY).
- History (`.planning/todos/`): completed `bug-40-deg2-connector-hump.md` (§ Residual names this
  crest), `bug-86-acute-deg2-elbow-teardrop.md`, `qual-deg2-node-kink.md` (QUAL-16, the connector itself),
  `qual-24-deg2-chain-merge.md`, `qual-junction-arc-fill.md`; pending `qual-31-deg2-connector-in-play-area.md`.

### Tools
- `node test/deg2-apex-decomp.mjs <place-capture>`: the table above, for any deg-2 node near a mark.
- `node test/deg2-launch-metric.mjs <place-capture>`: vertical g along leg → connector → leg at
  20 m/s (scale by (v/20)²). Note it rides the connector CENTRELINE; the owner drove the inside line.
- `node test/deg2-hump-census.mjs <seed> <R>`: the BUG-40 census. It measures along the LEGS'
  centrelines, so it under-reads an apex crest. Extend it or write the census you need.
- `node test/replay.mjs wip/bug-90/autos-capture-1792957624450.json --surface-changed`: replays the
  owner's re-drive inputs on the CURRENT surface (the self-check now reports instead of aborting).
  Old surface → sink fix: airborne frames 8 → 3, peak tyre Fz 37.4 → 30.7 kN. The crest fix should
  move these again.
- `node test/connector-deck.mjs` (gate): physics == drawn strip. Must stay green.
- Captures: `wip/bug-90/` (git-invisible copies of the owner's two Downloads files).

### Standing rulings that bound the options
- NEVER re-add a longitudinal grade smoother (FEAT-68 sign-off). A fix must address the
  cross-section handover / fillet geometry, not low-pass the profile.
- MESH == PHYSICS: any change lands in the shared design function, never physics-only.
- n=1 is not a calibration signal: show what each option does across the connector census
  (seeds 6, 3, 7 + this capture's world), not just at this corner.
- Road character (cTurn 45 / wGrade 180) stands; do not reach for router knobs.

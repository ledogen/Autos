---
id: BUG-90
type: bug
status: closed
closed: 2026-10-27
resolution: "Fixed on feature/spare (0c4d6684 connector sink, 3b8b5e5c apex crest + clamped station-corner sag + vertical-curvature ceiling gate). Owner play-tested 2026-10-27: 'feels good'. Junction-zone one-track sags pinned as BUG-97."
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

## Crest proposal (2026-10-26, awaiting the owner's pick — nothing implemented)

Tools: `wip/bug-90/crest-tools/` (git-invisible). `census.mjs` drives 5 parallel lines (−3.5…+3.5 m)
leg tail → connector → leg tail on every deg-2 connector in 7 windows (seeds 6×2, 3, 7, 20, 11 + the
capture world; 91 connectors) and reports **v_lift** = √(g/κ), the speed at which the worst crest over
one wheelbase unloads the wheels, against **v_corner** = √(0.8·g·R_min) of the fillet. `patch.mjs`
applies each candidate as a runtime patch (`BUG90_VARIANT`, `KINK_MIN`, `PLUS_REV`, `ORPHAN`);
`compare.mjs` diffs variants; `probe.mjs` decomposes one connector. The § Next session table
re-verified exactly (apex +0.314 m at s = 22.7).

**Two mechanisms, not one.**
1. *Bank*: a leg whose HIGH edge faces the kink's inside (where the fillet cuts) — this corner.
2. *Grade*: on the inside of a kink a point projects behind the node on one leg and past it on the
   other, so on a through grade G the legs disagree by G·(a+b) and the sharp handover packs that into
   ~3 m. Seed 7 (−1423,558): 114° hairpin on 10–17 % grades, 1.67 m packed into 2.7 m.
   Plus a real bug feeding it: **orphaned promoted Ts** (promoted id, side road gone, degree 2) —
   `_v2PromotedRole` returns null with < 3 strands, so both legs are ANCHORs and get NO junction blend
   at all (seed 7 −1423,558 and seed 11 −923,−1316, the two worst connectors in the census).

| Option | Capture corner v_lift | Crest-limited (v_lift < v_corner) | v_lift < 12 m/s | Connectors moved > 2 cm | Made worse |
|---|---|---|---|---|---|
| baseline | 9.7 m/s (corner 9.0) | 17 / 91 | 7 | — | — |
| A: bank-only, crest-side legs flat at deg-2 (+orphan) | 21.7 | 7 | 3 | 53 (mean 0.27 m) | 2 (worst 19.5→13.4, still > corner) |
| B: full pad-plane at EVERY deg-2 node (+orphan) | 21.7 | **2** | **0** | 77 (mean 0.79 m) | 7, all small, none below corner |
| C: plane above 60° kink, A below (+orphan) | 21.7 | 7 | 0 | 57 (mean 0.34 m) | 3 small |
| D: longer leg handover (±4 m) | 11.7 | 15 | 4 | 59 (mean 0.06 m) | 0 |

Full-leg-tail check (κ over the whole 25 m tails, catches FEAT-82 recovery crests): B 18→4,
A 18→8, no new tail crests. The remaining sub-12 m/s crest under B (seed 6 4143,−420) is a leg hill,
unchanged by any option. Replay of the owner's re-drive: baseline loses all-wheel contact (frame 207,
peak front Fz 20.6 kN after); A and B both keep contact (peak 5.0 / 15.0 kN).
Dropped: fading the connector's imported bank toward the node (`fade`) — 13 connectors worse.
Gates at risk for A/B/C: road-smoothness, junction-stitch, road-grade, shoulder-lateral-continuity,
connector-deck, road-apex-sliver, node-pin, restream-invariance, par/story route gates.

### Owner's dips 2 and 3 (2026-10-26) — the acceptance pair
Captures `wip/bug-90/autos-capture-1793048132292.json` (**dip 2**, seed 2840746967, mark −169,−625:
"unacceptable — bottomed the suspension, bounced the front end into the air, at having-fun speed") and
`…1793048382266.json` (**dip 3**, mark 1762,−616: "acceptable — high g at speed, would damage cargo, but
fun and fair"). Tools: `crest-tools/dipprobe.mjs` (profile + κ through a mark), `corner-sim.mjs`.

| | where | shape | κ over the wheelbase | vertical radius |
|---|---|---|---|---|
| dip 1 (BUG-90 crest) | deg-2 connector apex | crest | ~0.10 /m | ~10 m |
| dip 2 | mid-run, 280 m from either node, 8 m fill over a stream valley | −22 % → +1.4 % at ONE vertex | 0.059–0.10 /m | ~17 m |
| dip 3 | 21 m before a deg-2 node (junction-blend sag) | −18 % → +8.6 % over ~25 m | 0.012–0.021 /m | ~50–65 m |

**Dip 2 is a different class: FEAT-81 built ≠ priced.** `roundCrests` approved the station corner
(Δg 0.234 over a ~10 m station = R 43 m, a legal 1 g sag at ~20 m/s). `_v2GradePts`' ROUND THE
STATION CORNERS pass then realises it on the 4 m polyline with a low-pass CLAMPED to ±0.25 m per
sample — every sample near the corner wanted > 0.25 m, all saturated, and the corner was LIFTED
+0.250 m intact instead of rounded (raw 125.275 → shipped 125.525 at vertex 70, grade −22.0 → +1.4
still at one vertex). Offline sim (`corner-sim.mjs`, reproduces the shipped pass to ≤ 2.4 cm on
clean runs): unclamped, dip 2 goes R 17 m → **R 74 m** (κ 0.059 → 0.0135). Census over ~86 km
(seeds 6, 3, 7, 20, 11 + the capture world): 8 features with κ ≥ 0.03 /m, all clamp-saturated sags
(one crest), all ≤ 0.012 unclamped; unclamping moves the deck p99 ≤ 0.15 m, max 0.43 m.

**Dip 3 under each fix:** connector option C and A — bit-identical (κ, heights). Option B flattens it
(−20 % → −15 %, far side +8.6 % → flat) — kills a dip the owner wants kept. Corner-rounding fix —
untouched (dip 3's routed profile is R 510 m there; its sag is the junction blend).

## Part 2 — implemented (owner picked C + the corner fix + the gate, 2026-10-26)
All in `src/road.js`:
1. **≥ 60° deg-2 kinks get the ≥3-way pad-plane treatment** (`DEG2_PLANE_KINK`, was the > 120°
   elbow line in `_runEndpointJunctions`): both legs held on one shared plane, so they agree where
   the fillet's inside line crosses them (the grade mechanism).
2. **Gentler kinks: a crest-side leg runs its bank off to flat** (`_applyJunctionBlend` `bankCrest`,
   fed the kink's `inside` direction by `_runEndpointJunctions`): a leg whose high edge faces the
   kink's inside goes flat at the node; a leg banked into the bend keeps it (the bank mechanism).
3. **Orphaned promoted Ts** (graph degree 2) fall through to the deg-2 treatment instead of returning
   ANCHOR with no blend.
4. **Station-corner rounding keeps its ±0.25 m clamp only within ±2 stations of a bore**
   (`_v2GradePts`) — elsewhere the clamp translated a big corner instead of rounding it (dip 2).

Verified against the scratch-patch predictions: connector census identical (your corner v_lift
9.7 → 21.7 m/s; crest-limited 17 → 7; < 12 m/s 7 → 0). Dip 2 now −18.5 % → +6.4 % over ~24 m,
κ ≤ 0.016 /m on the centreline (was 0.074). Dip 3 byte-identical. Dip 1 apex now 0.36 m BELOW the
node (was +0.31 above).

New gate `test/vertical-curvature.mjs` (the owner's slope-rate yardstick, CEILING form): PASS on the
fix; on main it fails all four checks (open-road sharpest 0.085 /m = dip 2; junction sharpest 0.189 /m
= the seed-7 orphaned-T hairpin; counts 52 / 226 vs ceilings 17 / 200). The pinned junction-zone
population is **BUG-97** (owner ruling needed).

## Closed 2026-10-27
Owner drove dips 1–3 on :3885 after 3b8b5e5c: "feels good". Dip 3 kept as is (fun and fair). The
remaining junction-zone population (≈200 one-wheel-track sags, 0.03–0.10 /m) is BUG-97, pinned by the
`vertical-curvature` ceilings until the owner rules.

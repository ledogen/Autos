---
id: BUG-116
type: bug
status: open — built and landed; waiting only on the owner's drive (folded into bug115-look)
severity: minor
opened: 2026-11-06
source: owner, 2026-11-06 playtest — after the side-landing launch hotfix (bb585d65)
relates: BUG-89 (sidewall scrub), BUG-115 (cab μ, proto/bug-115-cab-mu), BUG-27b (body μ 0.1), FEAT-70 (tire cylinder contact)
---

# BUG-116: A truck on its side skates — body friction on its sides

## What happens

Since bb585d65 a tire lying on its side carries only its honest sidewall load. Before that, FEAT-70's
cylinder solve read a full tire radius of phantom depth on its side, and that launched the truck. Now
a truck on its side slides **132 m from 15 m/s** on flat ground (headless, through the game's tire contact).
BUG-89's target was under 40 m. It only looked met because the tires carried fake load:

- **On its side, the tires carry about a quarter of the weight** (about 4.4 kN of about 17 kN). They
  already scrub at the tire's μ (BUG-89, physics.js Step 2.6).
- **The body carries the rest at the body's pair μ 0.1** (BUG-27b). The parts that touch on flat ground
  are the bed side, the sills and the tire faces, out to about 0.83 m. The cab (0.78 m half-width) does
  not touch, so BUG-115's cab μ 0.5 alone changes nothing here (measured: still 131.6 m).

## The owner's direction (2026-11-06, verbatim intent)

1. **Weight on the sidewalls sees the same μ as the tires.** It already does: BUG-89's scrub uses
   `frictionCoeff × _tireMuScale`. Keep it, and check it still holds after bb585d65's blend to the
   plane solve.
2. **Weight on the side of the body grips enough to promote rolling**, so the truck doesn't slide on its
   side forever. The lever is the friction on the body's side hulls (bed side, sills). The cab prototype
   sets a pair μ of about 0.5. Roof or side metal on asphalt or dirt is roughly 0.4–0.6.
3. **Body friction depends on the terrain it slides on.** The owner posted this as a separate suggestion
   on the tracker page. **Don't read the page until the owner's playtest is over.** Fold that note in
   here when it is.

## Acceptance

- 15 m/s along its length on its side stops in a believable distance. Re-pin `test/side-slide.mjs`
  through the game's tire contact (`src/tire-contact.js`), not its own simple one. Its 26.9 m pass is
  that stand-in contact's number, not the game's.
- A sideways slide tends to roll the truck rather than skate it.
- No change to an upright truck. The slab's glancing μ 0.1 stays wherever BUG-27b needs it (grounding
  on the undercarriage, bumpers). Prove it with `node test/fingerprint-physics.mjs`.
- Decide together with BUG-115 (the `bug115-roof` call), since both are the same body-μ question.

- [x] Stops in a believable distance; `test/side-slide.mjs` re-pinned through `src/world-contacts.js` → `tire-contact.js`
      and the game's open-bed chassis: **20.4 m** from 15 m/s (was 108 m through the game's contact).
- [x] A sideways slide tends to roll: on its side and still rolling, 6/9 roll on (was 3/9), mean slide 16 m (was 37 m).
- [x] Upright unchanged: `node test/fingerprint-physics.mjs` ALL IDENTICAL to main.
- [x] Decided with BUG-115: the cab stays at the owner's 0.3; the flank takes 0.5 (below).
- [ ] The owner drives it — one drive with BUG-115's roof look (the orchestrator asks; no separate owed item).

## Repro

wip probe (scratchpad, 2026-11-06): settle the truck on its right side on flat ground through
`tireContact`, set v = 15 m/s along its length, measure the distance to a stop.
`test/side-slide.mjs`'s harness, with its `qc` swapped for main.js's footprint path, is the gate's shape.

## Work log

**2026-11-07, Lane B — built (land/bug-116).** Three causes, not one.

1. **The body.** On its side the truck rests on the lower slab's FLANK — the hip, 0.85 m out. The tires' faces stop at
   0.83 m, the bed side at 0.82, the cab at 0.78. At the slab's BUG-27b 0.1 it skated. The flank is now its own hull
   (shape 6, two per slab part, between the approach and departure chamfers) at **pair μ 0.5**, and the slab stands 2 cm
   inside it. The slab's bottom plane (undercarriage scrapes) and the bumper ends keep 0.1. The flank hull stops 5 cm
   above the undercarriage plane, so a scrape never reaches it.
2. **The sidewall scrub was off.** The ticket's first direction did *not* hold after bb585d65. A tire lying at 87° puts
   cos 87° of its load on its strut, a few newtons. BUG-89's gate (`tireFz <= 0`) read that as "Pacejka owns it", so
   its 3–4 kN of sidewall load slid frictionless. The gate is now the tire's tilt: the scrub acts on the load along the
   spin axle (only a sidewall carries that; a kerb's push is radial, in the wheel plane). It fades in from tire-contact's
   TILT_HI (35°) to lying flat. An upright tire on the fingerprint's bumps leans up to 19° against a bump's flank, still
   on its tread, so a fade from TILT_LO (15°) changed the fingerprint; from TILT_HI it is identical.
3. **The tilted tire's lever arm.** Step 2.6 applied a tire's off-strut load at the HUB (D-06a). With the scrub working,
   a truck on its side then stood on a base 0.18 m wide instead of the tires' 0.55 m, and tipped onto its wheels on a
   12° slope (statically it needs tan⁻¹(0.55 / 0.85) = 33°). A tilted tire's load and scrub now act at its real
   contact, the rim edge of its ground-side cap (the same point tire-contact's plane solve finds), faded by the same tilt.

The flank pair μ across the band (probe `wip/bug-116/side-probe.mjs`, all three causes fixed; 15 m/s on its side along
its length; the still-rolling grid is 8/10/12 m/s sideways × 2.5/3/3.5 rad/s, roof-first):

| flank pair μ | 15 m/s, lengthwise | still rolling: roll on | mean slide |
|---|---|---|---|
| main (0.1) | 108 m | 3/9 | 37.3 m |
| 0.4 | 24.3 m | 3/9 | 16.3 m |
| **0.5 (built)** | **20.5 m** | **6/9** | **15.7 m** |
| 0.6 | 17.8 m | 6/9 | 15.1 m |

0.5 is the lowest value in the band that doubles the tumbles; 0.4 halves the slide but rolls no more often than main.

Other measurements: lying flush on its side across 15° it holds (0.05 m in 10 s; main slid 18 m and ended on its
wheels). Wheels-first on its side at 15 m/s it trips back onto its wheels as on main (19.6 m; main 28.8 m). Roof-first
on smooth flat ground it slides 26 m and leans onto its bed side; tipping it onto its roof needs μ > 0.97 / 0.78 ≈ 1.2
about the cab-roof edge, so nothing in the band does that without a trip. An upright truck sliding sideways is unchanged
(its tires skid; a trip on smooth ground needs (track/2)/h ≈ 1.2).

Gates: affected 24/24 green (cdp-smoke left to the landing). `hilift`: side on slopes 10/12 in one press (main 12/12),
12/12 in two. The truck now holds its slope instead of half-tipping on its own. Physics fingerprint ALL IDENTICAL.

**Per-surface body friction (the owner's BUG-115 idea): not built — not a small step.** Terrain (0.8) and road (0.9)
are already separate engine materials, but a lower road-only body μ means lowering `ROAD_FRICTION` for every engine
body on the road (debris, cargo, rocks), or a vendor-binding rebuild to expose Box3D's friction callback
(per-material-pair μ). Either is its own ticket after the owner's drive.

**2026-11-08, owner (owed side-slide-lever):** "can i have body grip on all offroad surfaces bumped to 1.0 mu. onroad leave 0.5 mu. simplified dig in" → FEAT-193.

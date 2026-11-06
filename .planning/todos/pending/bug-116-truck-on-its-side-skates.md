---
id: BUG-116
type: bug
status: open
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

## Repro

wip probe (scratchpad, 2026-11-06): settle the truck on its right side on flat ground through
`tireContact`, set v = 15 m/s along its length, measure the distance to a stop.
`test/side-slide.mjs`'s harness, with its `qc` swapped for main.js's footprint path, is the gate's shape.

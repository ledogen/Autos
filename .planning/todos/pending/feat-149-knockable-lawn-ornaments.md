---
id: FEAT-149
type: feature
status: open
severity: minor
opened: 2026-10-25
source: owner, 2026-10-25 — "smashing into specific lawn ornaments should trigger them to become physics objects and roll/bounce away (gnomes, beach balls, flamingo). others should have collision but not budge (brick firepit)"
relates: FEAT-71 (yard scatter — placed these as static dressing), FEAT-36 (dynamic props), ASSET-01/02/03 (the three models), ASSET-08 (the fire pit), ASSET-76 (fire pit re-export)
---
lane: C → Spare (2026-11-02: Lane C has no session; Spare took it, says so to C)

# FEAT-149: Knockable lawn ornaments — gnomes, beach balls and flamingos roll away; the fire pit stands

## What

Two classes of yard satellite (src/poi.js dressYard → main.js renders them):

- **Knockable** — `gnome`, `beachBall`, `flamingoUp` / `flamingoDown`: hit by the truck they become
  rigid bodies (src/debris.js, the adapter seam) and roll, bounce and tumble away. Light things:
  a ceramic gnome ~4 kg, a beach ball ~0.1 kg, a plastic flamingo on wire legs ~0.3 kg.
- **Solid** — everything else in the pool (`firePit`, `pottedPlant`, …): collision as today, never moves.

Note the provenance: FEAT-71 carries the owner's 2026-09-22 ruling that satellites are static
dressing and no rigid bodies belong in *that* ticket. This ticket is the owner's 2026-10-25 reversal
for a named subset; it does not reopen FEAT-71.

## How (the simplest shape)

- A `knockable: { massKg }` field on the three registry entries in data/prop-models.js; nothing else
  in the pool changes.
- Keep the static mesh until first contact. On a chassis contact (PhysicsEngine.maxContactImpulse
  already gives the step's peak impulse and point — FEAT-120's impact seam), swap the mesh for a
  debris body of the same model at the same pose (DebrisSystem.load with the registry spec, hull from
  the GLB as every debris type) and give it the truck's contact velocity. Cheaper than a live body
  per ornament in every yard streamed.
- Bodies count against DEBRIS_CAP like any other; a knocked ornament that settles stays where it lies
  for the session. No damage to the truck (a gnome is not a rock): `causesDamage: false`.
- The beach ball is a sphere collider already; the gnome and flamingo are hulls.

## Acceptance

- [ ] Drive through a residence yard: gnome / beach ball / flamingo roll away on contact; the fire pit
      and potted plant stop the truck as today.
- [ ] A knocked ornament never pops the truck up or damages it.
- [ ] Headless: the yard solver (poi-yard gate) is unchanged — placement is identical, only the
      runtime response differs. No engine types outside physics-engine.js (grep).
- [ ] 60 fps budget: no body exists until something is hit.

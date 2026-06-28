---
id: BUG-22
type: bug
status: open
opened: 2026-06-27
severity: medium
source: user-observation
relates_to: [FEAT-06b, FEAT-09]
note: "User: rock collisions aren't accurate enough — they can bump the truck off a road unexpectedly,
especially huge rocks/boulders. Likely the single-sphere hard-contact approximation (FEAT-06b) is too
coarse for large/partially-buried rocks: the bounding sphere overshoots the visible mesh, so the truck
hits 'air' near a big rock and gets shoved sideways."
---

# BUG-22: Rock collisions inaccurate — huge rocks bump the truck off the road unexpectedly

## Observed

Driving near rocks — **especially huge rocks/boulders** — the truck gets bumped/shoved off the road
when it doesn't look like it actually touched the rock. The collision response feels imprecise: the
hit fires earlier or harder than the visible rock surface warrants, kicking the vehicle sideways and
off the road.

## Likely cause (investigate before fixing)

FEAT-06b models rocks/boulders as a **single hard sphere contact** (`queryProps` emits a sphere
`contactPoint`; the solver resolves it as a rigid sphere). For:

1. **Huge / partially-buried boulders (up to ~20 m dia)** a single sphere is a poor fit for the
   *exposed* surface — the bounding sphere overshoots the visible mesh, so the truck collides with
   empty space around the rock and gets a large impulse from a contact normal that points the wrong
   way. The bigger the radius, the bigger the spurious sideways shove.
2. **Contact normal / penetration depth** from a coarse sphere can be near-tangential when grazing a
   large rock, producing a high lateral impulse (the "bump off the road").
3. Rocks placed near the **road shoulder** make any spurious early/over-strong contact directly
   translate into being pushed onto/off the ribbon.

## Acceptance

- [ ] Reproduce: drive past a large boulder near a road and confirm the off-road bump fires without a
      true mesh-surface contact (capture a scenario log if possible).
- [ ] Tighten the rock collision proxy so the contact matches the *visible/exposed* surface — e.g.
      shrink the effective radius to the exposed cap, use a buried-offset, or a better proxy than a
      single full-radius sphere for large/partially-buried rocks.
- [ ] Verify the contact normal + penetration produce a plausible (non-sideways-launching) impulse
      when grazing a large rock.
- [ ] No regression on small/medium rock hard contacts or the bush soft-drag / small-rock pass-through
      classes (FEAT-06b).

## Notes

- Built on the FEAT-06b collision splice (commits 0932f0e + eb064df) and the FEAT-09 contact pipeline
  (`queryContacts` / `queryProps` → per-contact resolve in `main.js`).
- Huge buried boulders were explicitly scoped in FEAT-06b to "use the *exposed* surface" — this bug is
  evidence that the single-sphere proxy doesn't honor that for the largest props.

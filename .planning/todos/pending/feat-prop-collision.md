---
id: FEAT-06b
type: feature
status: open
opened: 2026-06-26
severity: minor
source: user-decision
parent: FEAT-06
depends_on: [FEAT-06 (props must exist + be placed first), FEAT-09 (contact pipeline — props are a new contact source)]
note: "Collision behavior for the procedural props. Three distinct interaction classes (settled with
user 2026-06-26): hard contacts, a unique SOFT-DRAG class for bushes, and decorative no-op. Builds on
the existing queryContacts → per-contact resolve architecture (= the FEAT-09 pipeline)."
---

# FEAT-06b: Prop collision + interaction (trees, rocks, boulders, bushes)

Make the FEAT-06 props physically interactive. Three interaction classes, by design:

## Interaction classes (settled 2026-06-26)

1. **Hard contacts** — the truck can hit/be stopped by:
   - **Trees** — trunk modeled as a capsule/cylinder contact (canopy is non-colliding).
   - **Large rocks** — collidable rigid contact.
   - **Huge buried boulders (up to ~20 m dia)** — large, partially-buried collidable surfaces;
     behave closer to terrain features than props. Contact uses the *exposed* surface.
2. **Soft drag (bushes — UNIQUE class)** — bushes are NOT a hard collision. While the truck overlaps
   a bush volume, apply a **resistive force proportional to velocity, capped at a low ceiling
   (~200 N, tunable)**, opposing the velocity direction. Never a rigid stop — you push through,
   you just feel it drag. Model: `F = -clamp(k · |v|, 0, F_max) · v̂`, `F_max ≈ 200 N`.
   **Drag scales with bush SIZE** (bushes are 0.5–1.5 m; bigger bush → more drag, scale `k` and/or
   `F_max` by size within the cap).
3. **Decorative (no-op)** — **small rocks (all < 0.1 m)**: no collision, drive straight over.

## Scope

- Register collidable props (trees, large rocks, boulders) as a **contact source** feeding the
  existing `queryContacts` → contact list → per-contact resolve path (the FEAT-09 architecture —
  reuse it, don't fork it). Each prop contributes a simple analytic contact shape (capsule/sphere),
  not its render mesh.
- Add the **bush soft-drag volume** as a separate, non-rigid interaction (proximity/overlap test →
  velocity-proportional capped force accumulated into the body, not a contact-resolve impulse).
- Spatial query: props are per-chunk; collision lookup must be local (only test props near the
  truck), not a global scan — reuse/extend the chunk indexing from FEAT-06.

## Parameterization (captured 2026-06-26; remaining = trunk capsule)
- **Rock size split**: small (< 0.1 m) = no-collide; everything larger collides, up to ~20 m boulders.
- **Rock burial**: 20–90% buried → collision is against the **exposed cap** only, not the full blob.
- **Bush**: 0.5–1.5 m; soft-drag `F = -clamp(k·|v|, 0, F_max)·v̂`, `F_max ≈ 200 N`, **k/F_max scale
  with bush size**.
- **STILL TO TUNE (user, planning)**: trunk capsule radius/height per species; exact `k` and the
  size→drag curve; large-rock contact radius vs. exposed-cap shape. Expose tunables in the debug menu.

## Acceptance

- Truck collides convincingly with trees, large rocks, and buried boulders (stops / deflects;
  rollover possible on a boulder — consistent with the honest-physics core value).
- Driving through a bush applies a felt-but-gentle drag (≤ ~200 N), never a hard stop or launch.
- Small rocks are pass-through (no contact).
- Collision cost stays local (no global prop scan per frame); 60 fps holds in dense foliage.
- Deterministic: same world seed → same collidable layout (matches FEAT-06 scatter).

## Notes

- Blocked on FEAT-09 landing the dynamic/extra contact-source extension (props are exactly the
  "new contact source" FEAT-09 anticipates). If FEAT-09 stalls, the static-prop subset (trees/rocks
  as fixed contacts) can still land against the current `queryContacts` path.

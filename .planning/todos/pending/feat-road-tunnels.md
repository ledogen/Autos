---
id: FEAT-11
type: feature
status: open
opened: 2026-06-27
severity: minor
source: user-observation
phase_origin: earthwork-routing
note: "Request, scoped not built. Surfaced right after earthwork routing landed (FEAT-10): the
deviation-capped design line now drives roads through deep CUTS where terrain rises above the road
(see capture — a deep slot cut between two ridges). Where the cut would be very deep, a TUNNEL reads
far better than an open trench. Tunnels are the natural partner to the earthwork deviationCap."
---

# FEAT-11: Road tunnels — bore through a ridge instead of a deep open cut

## Context

Earthwork routing (FEAT-10) lets the road hold a gentle design line and CUT through ground that rises
above it, bounded by `roadDeviationCap`. Where the terrain above the road is tall, the result is a deep
open slot/trench (the user's 2026-06-27 capture: road threading a deep cut between two ridges). The user
likes the earthwork direction and wants the deep-cut case to become a **tunnel** — the road passes
*through* the ridge, terrain roof intact above it — instead of an open canyon. This is the cut-side
counterpart to FEAT-08 (overpasses, the fill/crossing side) and pairs directly with the earthwork
`deviationCap`: a cut deeper than a threshold → tunnel.

## Desired behaviour

- Where the design grade runs more than `~tunnelMinCover` metres BELOW raw terrain over a sustained
  length, mark that span as a TUNNEL: keep the road surface (drive-through), but DON'T carve the open
  cut — leave the terrain roof above it (a portal at each end where the cut depth crosses the threshold).
- Reads as a bored tunnel: dark interior, portal faces at the ends, terrain continuous over the top.
- Deterministic + window-invariant (a pure function of seed/coords/params + the design line), same
  discipline as the rest of the road surface (no stream-order dependence).

## Open design questions (decide at planning)

- **Detection:** along each run, find spans where `rawTerrain − designGradeY > tunnelMinCover` (the cut
  depth that warrants a tunnel vs an open cut). Reuse the earthwork design line already computed in
  `_streamNetwork` / the router `designH`. A min span length avoids flickering tiny tunnels.
- **Carve interaction:** the terrain carve (`_buildCarveTable` / `_sampleCarveWorld`) currently cuts the
  trench down to the design grade. Inside a tunnel span it must NOT cut the roof — suppress the cut above
  the road bore, keep raw terrain. The drivable/physics surface stays the design grade (so the truck
  drives through level). Mind the CARVE SYNC sites.
- **Geometry/visual:** portal rings + a tube/interior, or just suppress-the-cut + a dark portal decal?
  No-asset constraint → procedural (extruded ring + darkened interior). Could ship visual-only first
  (suppress cut + portals) and refine lighting later.
- **Lighting:** interior should darken (the other worker's lighting pass may matter here).
- **Tunnel vs switchback vs deep-cut:** today a too-deep cut hits the deviationCap and the road
  switchbacks instead. Tunnels RAISE the effective cut allowance for spans that qualify — so the router
  may need to know a tunnel is permissible there (cost a tunnel span cheaper than a deep open cut /
  switchback). Or keep routing as-is and only change the SURFACE (open cut → tunnel) post-hoc. Decide.

## Acceptance

- A road crossing a ridge taller than the cut threshold passes through a tunnel: terrain roof intact
  above, road continuous and drivable through, portals at the ends.
- Deterministic + window-invariant; `npm test` stays green (carve gates, smoothness, fill/cut support).
- Tunable threshold (`tunnelMinCover`, min length) — likely a debug slider, USER-OWNED param set.

## Related

- FEAT-10 earthwork routing (the design line + deviationCap that creates the deep cuts) —
  [[project_earthwork_routing]].
- FEAT-08 road self-overpasses (the fill/crossing-side grade separation) — `feat-road-self-overpass.md`.
- QUAL-06 carve staircase / `qual-unify-carve-surface.md` (carve-surface polish near the same code).

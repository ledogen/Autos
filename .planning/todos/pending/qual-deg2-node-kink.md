---
id: QUAL-16
type: quality
status: open
opened: 2026-07-06
severity: minor
source: user-request
depends: QUAL-11
note: "Little discontinuities at degree-2 graph nodes: the two edge centerlines meet at a real
heading KINK. Either force arrival tangents in the router or blend the two segments with the
junction machinery (user: probably cleaner). Two p-dumps captured 2026-07-06."
---

# QUAL-16: Degree-2 node kinks — blend the two segments like a mini-junction

## Evidence (two p-dumps, seed 6, 2026-07-06)

- `Logs/rangersim-capture-1783352676265.json` — mark (-1136.7, 668.6). Probe: two run endpoints
  welded at (-1138, 667), away-headings 135.7° / -8.0° → **36.3° centerline kink**.
  (Runs `g:-3,1,1:-2,1,0` end + `g:-1,0,1:-2,1,0` end.)
- `Logs/rangersim-capture-1783352665084.json` — mark (-586.2, 560.5). Probe: endpoints welded at
  (-586, 562), away-headings 157.7° / -41.4° → **19.1° kink**.
  (Runs `g:-1,0,1:-2,1,0` start + `g:-1,0,0:-1,0,1` end.)
- Probe tool pattern: scratchpad probe-deg2.mjs (headless RoadSystem; lists endpoints + away
  headings near a mark). Replay the captures with `node test/replay.mjs <capture.json>`.

## Root cause

Each graph edge is routed INDEPENDENTLY between site positions; nothing makes the two edges of a
degree-2 pass-through arrive anti-parallel. Existing seam treatments don't fix a heading kink:
- `roadJoinWeldLength` (6 m) blends the ribbon CROSS-SECTION frame toward the shared node heading
  (`_edgeTerminalHeading`) so edge vertices meet — it seals the wedge gap but the centerline
  (and the driven path) still corners sharply;
- `_applyJunctionBlend` reconciles GRADE (C0 in Y) at d≥2 nodes — says nothing about heading;
- degree-2 nodes intentionally keep camber/banking (only d≥3 flattens) — but the curvature spike
  at the kink slews camber abruptly right where the truck crosses the node.

## Options

**A. Force tangent ends (router-level).** Give both edges a shared target heading at the node
(the `_edgeTerminalHeading` both already agree on) and make the router END each edge tangent to
it — the GRAPH-NODE-DEPARTURE machinery (leave-bearing vs chord) shows the router already shapes
departures, so this is symmetric goal-side work. Natural blend, no extra geometry. BUT: it
re-routes the world (route cache regen, feel re-verify), risks fighting the honest-grade/
clearance cost model at exactly the spots it's already stressed, and QUAL-15 wants router changes
too — don't stack two router campaigns.

**B. Blend the two segments with the junction machinery (PROBABLY CLEANER — user).** Treat a
degree-2 node whose kink exceeds a threshold (e.g. >8–10°) as a mini-junction: cut both ribbons
back (existing `_buildRoadTile` cutback path), and fill the gap with the QUAL-11 edge-tangent
fillet surface — with n=2 legs the boundary is just: leg A's end cross-section, fillet arc to
leg B on the inside of the bend, leg B's end cross-section, fillet/spline back on the outside.
The fill rides `sampleRoadTopY` exactly like QUAL-11 pads (mesh == collision free). Camber: ease
banking → 0 over the cutback zone (small, local — unlike d≥3 the reach is the cutback, not Rj)
OR keep the existing camber-preserving behavior if the filled surface reads fine; decide by eye.
The physics centerline still corners, but the SURFACE is continuous and wide there — same
tradeoff as real junction pads, and the same one QUAL-11 already accepts.

Recommendation: **B**, sequenced AFTER QUAL-11 so it reuses the fillet-boundary + lift-fill code
path with n=2 instead of growing a parallel implementation. If QUAL-11's machinery lands clean,
this is mostly a gating change (`_detectNodeJunctions` currently skips clusters with < 3 legs —
admit 2-leg clusters above the kink threshold) plus the n=2 boundary case.

## Acceptance

- No visible kink/notch/shelf at the two captured marks (screenshot sweep before/after at
  (-1138, 667) and (-586, 562), seed 6).
- Only kinked deg-2 nodes get pads (straight pass-throughs stay untouched ribbons — no pad spam
  along every road).
- Window-invariant, mesh == collision, once-per-build cached; npm test green (watch
  road-smoothness + camber-continuity: the cutback/blend must not introduce collision steps).
- New params (kink threshold, if exposed) get sliders + regen the route bundle if `road*`-prefixed.

## Related

- QUAL-11 (`qual-junction-arc-fill.md`) — the fillet boundary + non-planar fill this reuses;
  hard-won simplicity/fallback constraints live there.
- QUAL-13 resolution (completed) — sloped pad planes + adaptive grade blend; the deg-2 grade
  line (FEAT-19 through-axis) already handles Y continuity, this ticket is about XZ heading.
- QUAL-15 — router-level terrain awareness; if Option A ever happens it belongs in that campaign.

---
id: FEAT-30
type: feature
status: open
opened: 2026-07-16
severity: minor
source: user-request
relates_to: FEAT-18 (stream crossings — causeway decision, 6c8d230), FEAT-22/17 (water generation), FEAT-06 (prop palette)
note: "Causeway crossings ship the embankment fill but nothing SHOWS the water passing under it —
the stream ribbon stops at one shoulder and resumes at the other. Fix is a PIPE PROP sitting on the
embankment face, black-capped so the bore reads dark. Explicitly NOT a hole in the terrain: no
carve change, no bore, no terrain roof — the pipe is decoration on an untouched causeway."
---

# FEAT-30: Visible culvert pipe where a road crosses a stream

## Context

Road×stream crossings are **causeways**: the road embankment fills the stream channel back to
`gradeY` un-suppressed, and the stream is notionally culverted underneath (user's call 2026-07-16,
worktree `feature/river-road-artifacts`, commit 6c8d230 — the `(1−sw)` notch-and-bridge suppression
was dropped at both mesh sites, so MESH == PHYSICS and the ribbon deck seats on filled terrain).
See [[project_stream_crossing_causeway]] — do NOT re-introduce bridge/abutment/deck-skirt geometry
here; the causeway is the chosen look and this ticket decorates it.

What's missing is the *evidence* of the culvert. Today the water ribbon is suppressed across the
span (BUG-33) and resumes on the far side, so at ground level a stream runs into a plain earth
embankment and reappears on the other side with nothing connecting them. One pipe end poking out of
each face is all it takes to read as engineered drainage instead of a glitch.

## Scope (user's call 2026-07-16 — keep it this simple)

**A pipe model with a black fill inside it, sitting on the embankment face. That's the whole feature.**

- **No terrain bore.** The causeway carve is not touched — no hole, no tunnel, no roof, no local
  apron/grading. The terrain under the road stays exactly as the causeway leaves it.
- **No real tube interior.** A short cylinder with a black cap (or equivalent dark-disc trick) at the
  inboard end. The darkness IS the culvert; nothing is modelled behind it. At driving speed nobody
  can tell, and there's nothing to light.
- **No headwall/collar/apron** unless a pipe end alone looks wrong in-game — decide by eye later,
  not up front.

## Desired behaviour

- Each road×stream crossing places **two pipe props**, one at each embankment face, axis along the
  stream's flow direction, seated where the stream ribbon terminates at the channel bed.
- Bore reads dark — a black cap inside the pipe mouth, so it looks like it goes somewhere.
- The two ends agree: same diameter, outlet a touch lower than the inlet so it reads as draining
  downhill.
- The stream ribbon meets the pipe mouth rather than fading out in open ground.
- Purely visual. No carve change, no drivable/physics-surface change, no collision needed (the pipe
  is small and sits off the driving line).

## Open design questions (decide at planning)

- **Where the geometry lives:** pipe props at a road/water intersection, but the crossing set is
  discovered by the road/water systems, not the prop scatter. Options: a small instanced pool driven
  by a crossing list, or a FEAT-06 palette entry placed by a dedicated (non-random) placer. Prefer
  whichever keeps placement a pure function of seed/coords (window-invariance — no stream-order
  dependence).
- **Finding the crossings + orientation:** the causeway work already resolves where a run's carve
  overlaps a stream channel (`sw` in `_composeCarvedY` / `sampleHeight`). Reuse that span rather than
  re-deriving it. Axis from the stream tangent; position from where the embankment slope meets the
  channel bed. Both pipe ends come from one crossing record.
- **Seating on the slope:** the pipe end has to look half-buried in the face, not floating in front of
  it or sunk out of sight. Probably just push it into the slope along its axis until it's mostly
  swallowed — check what the causeway slope actually looks like at the bed.
- **Sizing:** one diameter for all streams, or scaled by channel width / stream order? Single size is
  simpler; check it against the widest streams the generator makes before committing.

## Acceptance

- Driving up to a road×stream crossing shows a dark-mouthed pipe end in the embankment face on both
  sides, aligned with flow, seated at the channel bed, with the stream ribbon meeting the mouth.
- Deterministic + window-invariant: same crossing → identical pipe placement regardless of stream
  order or chunk window.
- Causeway carve, drivable surface, and physics untouched — MESH == PHYSICS still holds. (A diff that
  touches the carve sites means the ticket has been misread.)
- `npm test` stays green (`stream-carve` BRIDGE-DECK / CHANNEL-UNDER, `carve-mesh-smoothness`).
- Any new tunables (pipe diameter, embed depth, invert drop) exposed as sliders — USER-OWNED param set.

## Related

- The causeway decision + the gates guarding it: [[project_stream_crossing_causeway]]
  (worktree `feature/river-road-artifacts`, 6c8d230, unmerged as of this ticket).
- Water generation (stream carve is MAIN-THREAD ONLY; ribbon-deck bridges are the retired approach):
  [[project_water_generation_landed]].
- FEAT-11 road tunnels — the actual bore-a-hole-in-terrain ticket. Deliberately NOT coupled to this
  one: culverts are a prop, tunnels are terrain surgery (`feat-road-tunnels.md`).
</content>

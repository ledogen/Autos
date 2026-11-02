---
id: BUG-94
type: bug
status: open
severity: minor
opened: 2026-10-26
source: owner, 2026-10-26 — "The mask for the moon phase needs to be a larger diameter because you can still see the glowing halo around the mask."
relates: QUAL-02 (day/night, moon), src/moon.js
---
lane: C → Spare (2026-11-02: Lane C has no session; Spare took it, says so to C)

# BUG-94: Moon phase — the halo glows around the UNLIT limb, outlining the masked disc

## What

`src/moon.js` FRAG: the glow ring is `uHalo · exp(-(r−1)·26) · (1 − disc)`, computed from the disc
radius alone, so it wraps the whole circle. The lit part is `albedo · level · disc` where `level` is
the terminator mask. On any phase under full, the glow still rings the dark half, so the eye sees a
full circle outlined in light with a crescent inside it — exactly the "mask over a full disc" the
header says must not happen.

The owner's words ask for a larger mask diameter; the root cause is that the halo ignores the
terminator. Fix the halo, not the mask radius: scale the glow by the lit fraction of the limb near
that angle (e.g. multiply `glow` by the same `lit` smoothstep evaluated at the limb point
`p / r`, or by a widened/blurred version of it), so the glow falls off with the terminator and the
dark limb has NO ring. Keep `(1 − disc)`.

## Acceptance

- [ ] phase 0.42 (default) at night: no visible ring on the dark side of the moon; the lit limb keeps its glow.
- [ ] phase 1.0: unchanged full halo. phase 0: nothing drawn (or earthshine only when dialled up).
- [ ] The Moon GUI folder still drives it live (halo, phase sliders).

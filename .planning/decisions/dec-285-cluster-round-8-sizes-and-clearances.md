---
id: DEC-285
status: standing
decided: 2026-11-15
area: ui
governs: FEAT-34, src/cluster.js
supersedes:
---

# DEC-285: round 8 — speed labels +20 %, frame's right edge halfway to the key, redline and numerals clear of the ticks, four lamps one apparent size, fuel/temp symbols off the needle heels

**Ruling.** The owner's note on round 7, verbatim: "kph and mph should increase size by 20%. reduce the width of the frame but only by bringing the right edge halfway to the key. move the redline arc outward radially its a little too close to the tick marks. make the tire and light indicators slightly smaller and the engine and brake indicators slightly larger so they are all the same apparent size move all numbers and letters inward slightly from the tick marks very slightly since they nearly touch. move the gas symbol and temp symbol slightly down since they ride the heel of the needle they mark"

Built as (layout px, `src/cluster.js` constants): km/h 7 → 8.4 px, MPH 9 → 10.8 px (`KMH_PX`, `MPH_PX`). The key's outer (indent) edge is 20 from its centre and the frame's right edge 54 from the corner arcs' centre, i.e. 34 apart; the right edge moves in half of that, `FRAME_IN` 17 (W 511 → 494). The key stays where it is, so it is now 17 right of the corner arcs' centre (round 7's centring cannot hold once only the edge moves). Tach redline arc radius scaleR + 2.5 → + 4.5 (`REDLINE_R`; 67.5 → 69.5), clearance to the tick ends 1 → 3. Lamp glyph scales (`LAMP_K`): brake 1.00 → 1.10, tire 1.00 → 0.88, check engine 1.25 → 1.42, headlamp 1.40 → 1.28, so all four have a bounding box of about 13 × 13 geometric mean. Numerals and pod letters 1.5 further in (`NUM_IN`). Fuel and temp symbols 3 lower (`ICON_DY` 13 → 16).

**Why.** Round 7 look.

**Replaces.** Round 7's key-at-arc-centre (DEC-284) where the edge moved; DEC-284 otherwise stands, and DEC-268's dial sizes are untouched. The 12 px floor does not apply: the cluster is a real object (UI-STYLE.md).

**Source.** Owner, 2026-11-15, words verbatim.

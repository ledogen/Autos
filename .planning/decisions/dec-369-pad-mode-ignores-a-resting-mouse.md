---
id: DEC-369
status: draft
decided: 2026-11-17
area: ui
governs: FEAT-255, src/gamepad.js, src/menu-nav.js, src/map2d.js
supersedes:
---
# DEC-369: Any pad input puts the UI in pad mode; a resting mouse is ignored until it moves

**Ruling.** "If someone accidentally just leaves the mouse hanging somewhere on the UI and then presses buttons on a pad, we should ignore where the mouse is... It'd be better if just pushing a button on the controller started ignoring the mouse till it moved."

**Why.** A resting mouse locked a menu highlight, and on the map held the centre cursor on its own spot until the mouse was moved.

**Replaces.** Nothing. Generalises FEAT-133's "the mouse takes the hover back only when it really moves" (map cursor) to every hover reader through one flag, `pad.mouseLive`.

**Source.** Owner, inbox 20261117094918-eomo, 2026-11-17. Wording of Replaces is agent's; draft until the owner has looked.

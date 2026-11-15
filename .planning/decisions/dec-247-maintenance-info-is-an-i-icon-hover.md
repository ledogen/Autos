---
id: DEC-247
status: standing
decided: 2026-11-15
area: ui
governs: FEAT-213, FEAT-212, src/service-screen.js, maintenance info
supersedes:
---
# DEC-247: Maintenance info is an (i) icon: hover, or the pad highlight

**Ruling.** "maintenance menu info text should in an (i) icon hover". The (i) is a small button (so the D-pad and stick reach it); the text shows while it is hovered or carries the pad highlight (.nav-focus, drawn like hover). No click toggle, no hidden gesture.

**Why.** Reaching it on a pad has to need no gesture: the highlight IS the hover (menu-nav treats it so everywhere).

**Replaces.** The "(i) About" row that toggled its text open on press (FEAT-213).

**Source.** Owner, inbox, 2026-11-15.

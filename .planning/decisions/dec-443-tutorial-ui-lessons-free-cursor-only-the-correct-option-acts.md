---
id: DEC-443
status: standing
decided: 2026-11-19
area: ui
governs: FEAT-305, FEAT-184, tutorial, src/tut-gate.js, src/menu-nav.js, lessons, quest outline
supersedes: 
---

# DEC-443: Tutorial UI lessons: the whole UI is navigable, only the correct option acts, the quest element has its own outline

**Ruling.** "For tutorial missions about interacting with the UI. We should always allow the player to navigate the entire UI and not constrain where their cursor can go. If they try to interact with the wrong option, nothing should happen. If they try to interact with the correct option, then it will let them through. The quest UI element should have a different outline." And: "It's a little difficult to differentiate the selector outline from the quest UI element outline. This was especially the case when mom was telling you to set your alarm clock because of how small and clustered the UI is. I think it will get a lot better when we let the player move around the whole UI instead of forcing the button but maybe tone down the quest UI element a little"

**Why.** Forcing the cursor onto one button makes the UI feel stuck and hides the layout the lesson teaches.

**Replaces.** Replaces the cursor-forcing lessons. Does not supersede DEC-151 (the tutorial traps the player): a wrong option still does nothing.

**Source.** Owner, FEAT-292 card note, answered 2026-11-19. Owner's words.

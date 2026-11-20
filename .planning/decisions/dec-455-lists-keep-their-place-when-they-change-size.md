---
id: DEC-455
status: standing
decided: 2026-11-20
area: ui
governs: BUG-247, FEAT-196, FEAT-212, src/service-screen.js, index.html, settings, pause menu, auto shop
supersedes: 
---

# DEC-455: A list that changes size keeps its top line where it is and grows downwards

**Ruling.** "Anytime we're scrolling a list that changes size, we should try to keep the cursor in the same place as the size changes. Otherwise, it's really hard to keep track of where the selected item is. For example, in settings for center softening, when that graph pops open, the whole list moves. So, we should pin the top line of the list. And when it grows to accommodate center softening, it should grow downwards. I previously submitted similar feedback for the auto shop lists, I think."

**Why.** A panel centred on the screen re-centres when its height changes, so every row above and below the one that grew jumps. The fix is in the shared layout (the panel's top is anchored), not in one row.

**Replaces.** Nothing.

**Source.** Owner, inbox note 20261120083245-n7vo, 2026-11-20. Owner's words. The earlier auto-shop note is 20261112055232-8l6d (FEAT-196: options appear only once an item is selected).

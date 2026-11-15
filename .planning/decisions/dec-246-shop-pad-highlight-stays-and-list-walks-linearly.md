---
id: DEC-246
status: standing
decided: 2026-11-15
area: ui
governs: FEAT-212, src/menu-nav.js, src/service-screen.js, pad navigation
supersedes:
---
# DEC-246: Pad: the highlight stays after expanding or collapsing a line, and the list walks one item at a time

**Ruling.** "i would prefer after expanding/unexpanding a line on pad if the green selection highlight was still present" and "scrolling up from the bottom of the maintenance list on pad jumps back to the bottom of the page every time the selection reaches the top … fix it so it linearly scrolls up one item at a time just like it scrolls down". Built: menu-nav puts the highlight back on the same index after an Enter that re-rendered the card; the shop card's up / down hold at the first and last item instead of wrapping; a resting pointer no longer re-targets the highlight when the list scrolls under it.

**Why.** The shop re-renders its innerHTML on every press, so the highlighted node was detached and only the next D-pad press found it again. The wrap at the card's top (map button) sent the highlight to the back button at the bottom. The pointerover part is unverified in a real window (headless Chrome fires no scroll-induced pointer events).

**Replaces.** Nothing (the wrap stays for every other card).

**Source.** Owner, owed card feat212-cart-look, 2026-11-15.

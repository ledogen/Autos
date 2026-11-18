---
id: DEC-379
status: standing
decided: 2026-11-17
area: economy
governs: FEAT-250, FEAT-230, FEAT-121, data/items.js, src/inventory.js, src/inventory-screen.js, src/main.js, spoilage, fresh clock, cooler, Ice King, ice, food, groceries
supersedes: DEC-338
---

# DEC-379: A cooler has four slots and a stack is one; cooked groceries spoil in 24 h

**Ruling.** "Let item stack inside coolers. A stack of items only counts as one slot and the coolers offer four slots.
Cooked groceries should also spoil in 24h outside a cooler."

What stands from DEC-338 (the owner's words there, 2026-11-16): freshness is a bar at 6 o'clock on the thumbnail; the
burger, chili dog and packed lunch chill too; "i dont want one bad item to spoil the stack. the spoil timer should
simply be slowed when items are in the fridge"; ice melts in one day in the inventory and lasts 72 h in the cooler
(120 h in the Ice King).

Readings (the lane's):
- Each iced cooler chills 4 slots of food, the Ice King first; a slot is one inventory entry, so a whole stack chills
  together (a capped stack spread over two slots takes two). Slots fill in inventory order. Every unit still ages on
  its own, and the oldest is eaten first.
- Cooked groceries keep 24 h, slowed in a cooler like any food (×1/4, ×1/8).
- From DEC-338, unchanged: every food with a fresh time chills; ice is not food; a bag used into a cooler lasts 72 h /
  120 h scaled by what it had left; a cooler with no ice chills nothing; a new cooler comes empty; the cooler's
  thumbnail shows its ice on the same bar. The rates are DEC-367's ×1/4 and the Ice King's ×1/8.

**Why.** At 4 units a cooler, a stack of 5 left one out.

**Replaces.** DEC-338's reading that a cooler chills 4 units, and its reading that cooked groceries keep.

**Source.** Owner, owed card fresh-clock-look (FEAT-230), 2026-11-17. Owner's words; readings marked.

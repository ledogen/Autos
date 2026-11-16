---
id: DEC-338
status: standing
decided: 2026-11-16
area: economy
governs: FEAT-230, FEAT-121, data/items.js, src/inventory.js, src/inventory-screen.js, src/main.js, spoilage, fresh clock, cooler, Ice King, ice, food
supersedes:
---

# DEC-338: Freshness is a bar on the thumbnail, every unit spoils on its own, the cooler slows it, ice melts in a day

**Ruling.** Owner's answers to the five slice-2 calls (1 how the player sees freshness; 2 what the cooler chills; 3 the
stack rule; 4 the Ice King's capacity, built as 4; 5 ice in the inventory never melting, a new cooler empty):
"1. freshness should be shown with a progress bar at 6 oclock over the item thumbnail
2. burger chili dog and packed lunch should benefit from refigeration too.
3. a bigger stack stays warm? ages as oldest unit? i dont want one bad item to spoil the stack. the spoil timer should simply be slowed when items are in the fridge
4. approve
5. ice should melt in one day (just reuse spoilage and have it spoil quick. ice lasts 72hrs in the cooler tho (just give it the same spoilage cooler buff as food."

Readings (the lane's, not the owner's words):
- 2: every FOOD with a fresh time chills, so the cooked potato and the raw groceries bag do too. Cooked groceries have no
  fresh time ruled, so they keep. Ice is not food: a bag lying beside a cooler still melts.
- 3: each unit of a stack carries its own age and goes alone. A cooler chills `holds` units (4, the cooler and the Ice
  King); a stack of 5 has 4 chilled and its oldest out, which goes first. The oldest unit is eaten first.
- 5: a bag melts in 24 h in the inventory. Used into a cooler it lasts 72 h (Ice King 120 h), scaled by what the bag had
  left. The owner's "same buff as food" (×1/6, ×1/8) would make 144 h / 192 h; his stated 72 h and the ruled 120 h win.
  A cooler with no ice left chills nothing (as built). A new cooler still comes empty.
- 1: the cooler's thumbnail shows its ice left the same way, while it has any.

**Why.** Slice 2 had shipped defaults the owner had not seen: whole-stack ageing, a stack too big to chill, ice that
never melted, and no way to see freshness.

**Replaces.** The branch defaults listed in FEAT-230's Open questions (2026-11-16): `chill` on groceries and fish only,
whole stacks up to 4, a stack at its oldest unit's age, ice that never melts.

**Source.** Owner, owed card feat230-fresh-clock, 2026-11-16. Owner's words; readings marked above.

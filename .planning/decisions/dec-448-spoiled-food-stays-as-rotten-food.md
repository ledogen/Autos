---
id: DEC-448
status: standing
decided: 2026-11-19
area: economy
governs: FEAT-306, FEAT-230, data/items.js, src/inventory.js, spoilage, fresh clock, food
supersedes: 
---

# DEC-448: Spoiled food is not deleted; it stays in the inventory renamed "rotten <name>"

**Ruling.** "When food expires we shouldn't delete it from the player's inventory. We should just change the name to say "rotten packed lunch." That way the player is reminded that they waited too long and the food went bad"

**Why.** A silent deletion teaches nothing; a rotten item in the bag reminds the player they waited too long.

**Replaces.** DEC-338 / DEC-379's "a unit at freshH is gone" (the unit now becomes its rotten twin). Nothing else in them changes: the clock, the cooler rates and the bar stand. Ice still melts away (it is not food).

**Source.** Owner, inbox note 20261119221238-tpgg, 2026-11-19. Owner's words. What a rotten item can do (eat, sell, drop) is the agent's reading, in FEAT-306's Open questions.

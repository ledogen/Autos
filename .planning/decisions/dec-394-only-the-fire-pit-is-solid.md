---
id: DEC-394
status: standing
decided: 2026-11-17
area: world
governs: FEAT-251, FEAT-149, FEAT-71, data/prop-models.js, src/poi.js, src/main.js, lawn furniture, fire pit, knockable
supersedes:
---

# DEC-394: Of the lawn furniture only the fire pit is solid; everything else is knocked flying as a rigid body with mass

**Ruling.** "The only thing I want players to actually collide with is the fire pit. Otherwise at a bare minimum we need to make them pass through everything else, but I'd rather it use the demolition system and spawn in a rigid body physics object when the player bumps into the lawn ornament. So it can have mass and hit the truck and tumble."

**Why.** A grill, a propane tank or a potted plant stopped the truck like a wall.

**Replaces.** FEAT-149's split, where only the gnome, the beach ball and the flamingos were knockable and the rest of the yard was a fixed collider.

**Source.** FEAT-251 (owner, 2026-11-17). Owner's words.

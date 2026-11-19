---
id: DEC-409
status: standing
decided: 2026-11-17
area: roads
governs: BUG-200, FEAT-82, src/road.js, _recoverFromHold, junction recovery, grade
supersedes:
---

# DEC-409: A junction's recovery is held to the design maximum grade

**Ruling.** "E: hold the junction recovery to the design maximum (recommended)" — E as put to him on card bug200-hairpin-grade-pick: a junction's recovery (the blend from the level junction deck back to the road's own grade) is never steeper than 24 % or the road's own solved grade where that is steeper; the old 38 % ceiling pass runs only where no tight recovery fits.

**Why.** On seed 688224244 the router built the hairpin's climb at 22 %, but the junction's deck hold kept 7.5 m level and the recovery then caught up at the 38 % ceiling. The 32-seed census found the same at about 1 road run in 11, at junctions of every kind. E removes the cause where it is made and adds no road and no pass over the whole profile.

**Replaces.** Nothing. It is a cap on the junction's own recovery, not a grade smoother (DEC-065 stands), and the 38 % hard ceiling does not move (DEC-047).

**Source.** ledorepo `answered/bug200-hairpin-grade-pick.json`, 2026-11-17. Choice in the owner's words; the description of E is the investigating agent's, approved by him.

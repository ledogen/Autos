---
id: BUG-53
type: bug
status: closed-merged
severity: major
opened: 2026-08-20
closed: 2026-08-20
relates: FEAT-68 (absorbed into — the work lives there)
---

# BUG-53: road edges overlap each other away from junctions — MERGED INTO FEAT-68

**Resolution (2026-08-20): absorbed, NOT fixed.** The defect is real and open. Its full record —
the owner's ranked fix preference (delete a leg > trim to the crossing > legitimise it), the
crossing census (11/13/4 real mid-span crossings on seeds 6/20/11, ALL node-sharing, zero
disjoint), the 244 m / 0.1 m seed-6 overlap case, and the acceptance checklist — moved verbatim
into the **"BUG-53 (absorbed 2026-08-20)" section of
`.planning/todos/pending/feat-68-router-v2-teardown.md`**, where it is next-step 2 of the CURRENT
HANDOFF.

Merged so the corridor-router work has ONE handoff document instead of two that must be
reconciled. Census tool: `node test/crossing-census.mjs` on the `feature/corridor-router` worktree.

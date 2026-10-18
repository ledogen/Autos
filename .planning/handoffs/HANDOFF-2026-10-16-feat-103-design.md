# HANDOFF 2026-10-16 — FEAT-103 design (the R1 conclusion), plus the open FEAT-74 branch

```
FEAT-103 design:  main — /Users/ledogen/CodeShit/CarGame  (planning docs only; no code is expected)
Open branch:      /Users/ledogen/CodeShit/CarGame-feat-74   feature/feat-74   http://localhost:3704
State:            main clean at handoff. feature/feat-74 committed (fafa2e3), NOT merged: waiting on
                  the owner's preview and BUG-88 (below).
```

**FEAT-103 is a design conversation, done on main in `.planning/` only.** Any code for FEAT-74 or
BUG-88 goes ONLY in the worktree above. The next session starts anchored in the main repo, so every
edit and command for that branch must target `/Users/ledogen/CodeShit/CarGame-feat-74`.

## The next session: FEAT-103 design

The owner will start a design conversation on **how region 1 concludes**. It is not a build.
`.planning/todos/pending/feat-103-job-site-poi.md` is marked DESIGN OPEN. Read first:

- `feat-103-job-site-poi.md`: what is ruled and the four open questions.
- `missions.md` § "Main missions: region unlock (the boss)" and § "The second shape: the bridge
  site — deliver x of y" (~line 744). The tally design, the foreman giver, both careers pointed at
  one place.
- `pois.md` § "The job site and the bosses".
- `DESIGN.md` **SM-INV-1** (and its 2026-10-12 lives clause), **SM-INV-13** (the gate is a place),
  SM-INV-7 (every run is winnable).

**Ruled 2026-10-16:**
- Region 1 only, for now.
- It is the R1 boss, the way out of region 1. The simplest shape is a bridge build with a foreman.
- It is gated by good deeds: unavailable before the gate, always available after it, and outside
  the job budget.
- R1's boss is the bridge (MILESTONES 2026-10-12). The log drag is a toy; the old docs now say so.

**The owner's open threads (theirs to answer, not yours):**
1. **What failing costs.** The owner floated "the bridge mission would probably kill you". **Flag
   this up front: SM-INV-1 says death is crash or breakdown ONLY, with no other fail states.** A boss
   that kills the run on failure needs an invariant amendment, or it takes the owner's alternative:
   opportunity cost (fail, start over, the days run out).
2. **Bridge or not for R1.** The bridge's natural suppliers, lumber and rock, are the R2 and R3 haul
   yards (FEAT-91). So either the yards get rearranged, or the bridge moves later and R1's boss
   becomes e.g. a **camp or expedition searching for the road out of town**.
3. **A new mission shape**: bring many *different* items from around the region into one progress
   bar (or several) for a larger reward. The bridge tally is the first instance.
4. How many good deeds open it.

## Landed today (all on main unless noted)

| Commit | What |
|---|---|
| `5cb7ee9` | Haul is scored on the **count delivered** (no speed tip; the bonus item is a stated count target). FEAT-114 unblocked. FEAT-88 closed (haul = firewood, lumber, rock; per-load data → FEAT-91, rates hand-set per yard tier). FEAT-103 re-scoped. Log-drag references aligned with MILESTONES. |
| `f8dfb6e` | Haul good deeds follow the count target. Freight's bonus pool is **the trucker build** (missions.md, amendments §16). One produce-stall farm of three. |
| `fafa2e3` (branch) | FEAT-74 built: the produce stall is its own farm POI on a lay-by; a registry-tag consumer gate in `dist-assets.mjs`; BUG-88 filed. |

## feature/feat-74: what is left

- **The owner's preview** at :3704: does the produce stall read as a farm on a lay-by, and is it
  seated right (seat 2.0, the deck-only collision box)? Gates prove it stands on graded ground; it
  has not been checked by eye.
- **BUG-88 (known red, not caused by FEAT-74):** story-poi §7a, seed 6. Two live fetches of "a ball
  of string" at the tackle shop, and the only general store is excluded as a duplicate, so the
  second card has no route. It is latent on main; the roster change just moved the board's draws
  onto it. **It needs an owner ruling** (three options are in the ticket). Merge feat-74 with it
  red, or fix it on the branch first: the owner's call.
- Every other affected gate is green (17/18; cdp-smoke not run).

## Still open elsewhere

- **Freight's bonus item:** what *earns* it is still unruled (the pool is ruled). The owner wants
  **a separate conversation on mission rewards in general**: the major categories, and how much they
  overlap and cross-pick. Today `REWARDS` pools by source POI, not by family.
- **FEAT-122 inventory:** built on `feature/feat-122` (`CarGame-feat-122`), all four questions
  answered, merge pending. MILESTONES' "Next up" is updated to match.
- **Next SM-3 build:** FEAT-114 (haul quantity + rate bonus + count target), now unblocked.

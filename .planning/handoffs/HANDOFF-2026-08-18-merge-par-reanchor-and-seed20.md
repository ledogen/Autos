# HANDOFF 2026-08-18 — merge `feature/par-reanchor`, then `feature/seed20-road`

**For:** an agent doing the merges. **Owner has approved both.**

You are merging two independent feature branches into `main`, then pushing. They do not conflict —
that is measured, not assumed (see §4). The work is mostly mechanical; the parts that need judgement
are flagged with ⚠.

---

## 1. State of the world

| tree | branch | status |
|---|---|---|
| `CarGame/` | `main` | **4 commits ahead of `origin/main` and UNPUSHED.** Push these too. |
| `CarGame-par-reanchor/` | `feature/par-reanchor` | 15 commits, tree clean, **ready** |
| `CarGame-seed20-road/` | `feature/seed20-road` | 1 commit vs main, **tree DIRTY — see ⚠ below** |

⚠ **`CarGame-seed20-road/` has uncommitted work in progress:**

```
 M .planning/todos/pending/feat-region-gated-connectivity.md
 M src/road-carve.js
 M src/road-worker.js
 M test/site-rank-sweep.mjs
?? .planning/todos/pending/bug-52-planner-chord-weights.md
?? test/grade-cap-survey.mjs
```

**Do not merge that branch until someone owns those changes.** Merging `feature/seed20-road` takes
commit `f6771bf` only; the working-tree edits above are NOT in it and will be left stranded in that
worktree. `src/road-carve.js` and `src/road-worker.js` are a **CARVE/ROUTE SYNC pair** (CLAUDE.md) —
they must move together in one commit or the `route-worker-sync` gate fails. Confirm with whoever
owns that tree before touching it. If in doubt, **merge par-reanchor only** and stop; it is
self-contained.

---

## 2. What `feature/par-reanchor` is (15 commits, `c6dcc4d..385d43d`)

The par re-anchor plus FEAT-53's Phase D. Par now means **the slowest drive that is still a pass**
(the C/D boundary) instead of the middle of the B band.

- `par = referenceTime × PAR_SLACK` (1.15) — splits the physics from the standard; `PAR_REF.mu`
  0.90 → 0.80.
- Thresholds **S 0.72 · A 0.76 · B 0.80 · C 1.00**, with **C pinned at 1.0 on every day**.
- Break-even moved to the B/C boundary; par pays half a day's maintenance. `k` 0.30 → 0.24 → **0.024**
  (a ×0.1 currency rescale the owner asked for).
- **Per-region payout multiplier** 1 → 12 (inert until FEAT-28/SM-4 supplies a real region index).
- Paper route reshaped: **the fare IS `payoutFor`**, tips ride on top.
- Paper rounds can be recorded for calibration at all (report card + export); first round in `runs/`.
- **FEAT-53 closed**, **FEAT-64 minted** for what it could not close.

**Reversals it carries** — all recorded as dated amendments in `DESIGN.md` / `missions.md`, not
silently dropped. If you hit any of these as a "wait, that contradicts the docs", the reversal is
intentional:
1. "B contains par" (2026-08-01) → **par is a C**.
2. The paper route's confirmation of that (2026-08-14) → reversed too, game-wide.
3. "paper-route.js never calls `payoutFor`" → **it does now**, deliberately.
4. The accuracy/speed equivalence (2026-08-14) → retired; speed out-earns accuracy.
5. Gate pin "B > 1.0 every day" → **"C === 1.0 every day"**.

## 3. What `feature/seed20-road` is (1 commit, `f6771bf`)

Escape-score site ranking replacing valley snap, plus BUG-51 (cliff-assault edges). Adds five
`roadSite*` keys to `RANGER_PARAMS` and **regenerates both route-cache bundles** —
`data/route-cache-default.json.gz` and `-region.json.gz` — because those keys feed `routeCacheSig`.
Its four new `test/*.mjs` files are **rainy-day scripts, not gates** (nothing added to `gates.mjs`).

---

## 3b. ⚠⚠ THE MAIN WORKTREE IS ALSO DIRTY — read this before §4

Discovered while committing this handoff, and it changes the picture. `CarGame/` (main) has
substantial **uncommitted** work from another agent:

```
 M .planning/story-mode/DESIGN.md            (+48)
 M .planning/story-mode/missions.md          (+35)
 M .planning/todos/pending/feat-economy-spine-payout-points.md   (+48)   ← FEAT-53
 M CLAUDE.md
 M tools/dashboard/app.html · tools/dashboard/index.mjs
RM .planning/todos/pending/asset-tent.md -> completed/
?? .planning/story-mode/design-amendments-2026-08-17.md
?? feat-64-paper-throw-audio · feat-65-demolition-missions
?? feat-66-camp-gear-slots · feat-67-visible-offer-board
```

**§4's "no conflicts" was measured against main's COMMITTED state (`bf65a57`) and is still true for
it. It does not cover the working tree above.** Three overlaps are real:

1. **FEAT-53's ticket is modified in main (+48) while `feature/par-reanchor` CLOSES and MOVES it** to
   `completed/`. That is a modify/rename collision. Git will likely ask; the answer is almost
   certainly *keep the closure and fold their edits into it*, but **read their 48 lines first** —
   they may be recording a decision the closure should carry.
2. **`DESIGN.md` (+48) and `missions.md` (+35) are edited in main**, and par-reanchor amends both
   heavily (the par re-anchor, SM-INV-3/4, the paper payout reshape). Textual conflict is likely.
   Both sides are *design rulings*, so resolve by **preserving both intents** — do not take a side.
   There is also an untracked `design-amendments-2026-08-17.md` that probably explains their edits;
   read it before resolving.
3. **FEAT-64 was an ID collision, already fixed on my side.** Their `feat-64-paper-throw-audio` is
   uncommitted, so it was invisible to me when I minted mine. Mine is now **FEAT-68**
   (`3a940a0`), with FEAT-53's closure note and `MILESTONES.md` updated to match. Nothing to do —
   recorded so nobody "fixes" it back.

**What to do:** get that work committed (or ask its owner to) BEFORE merging either feature branch.
Merging into a dirty tree with overlapping design docs is how a ruling gets silently reverted. If
they cannot be reached, `git stash` in the main worktree is NOT sufficient — the FEAT-53
modify/rename still needs a human decision.

---

## 4. Conflict analysis — measured, not assumed

Probed with `git merge --no-commit --no-ff` in a scratch tree, both directions:

- **par-reanchor ↔ main's COMMITTED state (`bf65a57`): no conflicts.** ⚠ Not its working tree — see §3b.
- **par-reanchor ↔ seed20-road: no conflicts.** The only file both touch is `src/debug.js` — theirs
  at lines ~413 and ~609, mine at ~740 (the Paper Route folder). Auto-merges.
- Nothing else overlaps. par-reanchor does not touch routing, `road.js`, `ranger.js` or the route
  caches; seed20-road does not touch the economy, par or the mission UI.

⚠ **One real interaction, and it is a feature, not a hazard.** par-reanchor adds a new gate,
`test/debug-sliders.mjs`, which verifies every `gui.add(OBJ, 'prop')` in `debug.js` binds to a
property that actually exists. After the merge it will also check seed20-road's new sliders. If it
fails, that branch has a slider bound to a `RANGER_PARAMS` key that is not there — a real bug (it
throws and kills the whole debug panel while the game still boots). Fix the binding; do not weaken
the gate. Verified passing on the integrated combination (§5).

---

## 5. Verification already done

- `feature/par-reanchor` alone: **54/54 gates green**, build clean.
- Owner drove a paper round, a POI job and a Quick Job on it — all three settled correctly.
- **A throwaway integration branch (`main` + par-reanchor + seed20-road) was built and the full
  suite run on it.** Result stamped below. That branch was deleted; rebuild it yourself, do not
  look for it.

> **INTEGRATION SUITE RESULT (2026-08-18): ALL 54 GATES GREEN ✓** — `main` + `feature/par-reanchor`
> + `feature/seed20-road` merged into a scratch branch, `npm run test:all`, wall 314 s, exit 0.
> Build clean. The two interaction-risk gates were spot-checked individually and both pass:
> `debug-sliders` (seed20-road's sliders all bind to real properties) and `route-bundle-parity`
> (5 pass — its regenerated caches still match live router output after the merge).
>
> This is the strongest signal in this document: the combination is not merely conflict-free, it is
> green. The remaining risk is §1's uncommitted work, which this probe did NOT include.

---

## 6. The merge

Order matters only because par-reanchor is verified and self-contained; do it first so a problem in
seed20-road cannot be confused with one in it.

```bash
ROOT=/Users/ledogen/CodeShit/CarGame

# 1. par-reanchor
git -C "$ROOT" checkout main
git -C "$ROOT" merge --no-ff feature/par-reanchor
cd "$ROOT" && npm run test:all          # expect 54/54

# 2. seed20-road — ONLY after §1's ⚠ is resolved
git -C "$ROOT" merge --no-ff feature/seed20-road
cd "$ROOT" && npm run test:all          # expect 54/54; watch debug-sliders + route-bundle-parity

# 3. push — remember main was already 4 commits ahead of origin
git -C "$ROOT" push origin main
```

`npm run test:all`, not `npm test`: affected-mode selects off the working diff and will under-select
after a merge commit.

⚠ **`route-bundle-parity` is the gate most likely to bite** on the seed20-road merge. It asserts the
bundled route caches match live router output. seed20-road regenerated both bundles for its own
`ranger.js` changes; if anything else has since altered a `road*` param, they need regenerating
again. That gate is `heavy` and will be selected automatically.

## 7. Cleanup

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh clean par-reanchor
# seed20-road: only once its in-flight work is committed or deliberately discarded
```

## 8. Known-open, deliberately not fixed — do not "fix" these in passing

- **FEAT-68** (renumbered from 64 — see §3b.3) carries what FEAT-53 could not close: `dayTierTable` is unbalanced against SM-3's
  repair costs (they do not exist yet), no multi-day run has been recorded, and the **27-point run
  budget needs a recount** — SM-INV-14's wording is unchanged but its economics moved when par
  became a C. `run-shape.md` flags it provisional in place.
- **The region multiplier is inert.** `EconomySystem`'s `getRegion` dep returns 1 (`main.js`);
  multi-region progression is FEAT-28/SM-4. One line changes when that lands.
- **Two owner-labelled "slow" drives sit 0.10 apart in ratio** and were given the same letter — par
  pricing two routes differently for the same felt pace. Recorded in `src/par.js`. Needs more
  labelled runs; it is a par question, not an economy one.
- **The paper standard rests on n=1.** One recorded round, and it looks right. Do not retune off it —
  the owner reverted exactly that mistake on 2026-08-17.
- **`speed out-earns accuracy` on the paper route** is intended, not a bug. `PAPER_PARAMS.paperTip`
  (0.30) is the one dial if that changes.

## 9. If something goes wrong

Both branches are unpushed, so nothing is public yet. `git merge --abort` during a conflicted merge,
or `git reset --hard origin/main` on `main` — **but note main's own 4 unpushed commits would go with
it**, so prefer `git reset --hard bf65a57` to keep them.

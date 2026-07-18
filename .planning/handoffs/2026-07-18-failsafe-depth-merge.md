# Merge handoff — `feature/failsafe-depth`

**Date:** 2026-07-18
**Branch:** `feature/failsafe-depth`
**Worktree:** `/Users/ledogen/CodeShit/CarGame-failsafe-depth` (served on :3164)
**Tip:** `87dd261` — single commit
**Base / merge-base with main:** the pre-drift main (before the docs-only ticket commits below)
**Recommended merge:** `--no-ff` into `main`

## TL;DR

Two physics-feel changes, one commit, headless-verified. Widen the catastrophic-penetration
failsafe so it only fires on a fully-swallowed wheel, and make body/undercarriage slams actually
rebound (real, tunable restitution instead of the BUG-27 fully-plastic thud). Merge is **clean** —
no file overlap with anything that has landed on main since the branch started.

## What changed (6 files, +192 / −92)

| File | Change |
|------|--------|
| `src/physics.js` | (1) Step-1 failsafe trigger `depth > wheelRadius` → `depth > 2·wheelRadius`. (2) Body-contact solver: restitution **bias** — sample each contact's approach velocity ONCE pre-solve, drive `vn` toward the fixed target `−e·vnApproach` instead of recomputing `−(1+e)·vn` per pass. New `BODY_RESTITUTION_DEFAULT = 0.21` and `REST_VEL_THRESHOLD = 1.0`. |
| `data/ranger.js` | New `bodyRestitution: 0.21` param. |
| `src/debug.js` | New Drive-folder slider **Body Bounce (restitution)** (0–0.6), read live per contact. |
| `test/penetration-failsafe.mjs` | Re-aimed: scenario B now asserts NO teleport in the `wheelRadius..2·wheelRadius` band (old threshold fired there); C keeps the true-tunnel rescue. |
| `test/body-contact-energy.mjs` | Re-aimed: dropped "e_eff ≈ 0" (that was BUG-27's workaround stated as a goal) for the stronger invariant — sweep restitution × impact speed, assert `e_eff` TRACKS the request (upper bound = the amplification regression, fires at any e incl. 0; lower bound = bounce delivered), plus ballistic-apex and no-energy-gain. Sweep reads the shipped default so retuning the param retunes the gate. |
| `test/gates.mjs` | Two gate descriptions updated to match the above. |

## Why the restitution change is more than a number

BUG-27 pinned body restitution to 0 because the solver **amplified** it: `dN = −(1+e)·vn` off the
CURRENT `vn` every pass, re-applied across 8 Gauss-Seidel passes × 6 coincident undercarriage probes,
so a nominal 0.05 came out at ~0.15 and launched the car. `e = 0` is simply the one value that
formulation handles correctly (driving `vn → 0` is idempotent). The bias reformulation converges to a
constant target, so `e` means what it says at any pass/probe count — **request 0.21, measure e_eff
0.214–0.218** at −5 / −8 / −12 m/s. That is what makes restitution a safe, tunable parameter now.

Reported via capture `1784269989221`: a 10 m drop went `vy −11.13 → +0.011` in ONE step (wheel forces
only account for ~0.2 m/s of that) — the body solver was eating all 11 m/s. Struts also blow through
their 0.25 m travel on a drop that big (`rl_sc 0.2676`), which is why the body probes reach ground.

## Verification

- `npm test` in the worktree: **17/17 affected gates green** (all 3 physics gates + the heavy
  road/terrain/water set pulled in by the `data/ranger.js` edit).
- `body-contact-energy` sweep confirms `e = 0` still gives the plastic thud (e_eff 0.007–0.017) and
  `e = 0.21` is honored, no launch, no energy gain, rest stable.
- **Headless only.** The *feel* of 0.21, and how the two changes interact on real terrain, are
  unproven. Worktree is live on :3164 for a drive-test before or after merge.

## Merge-cleanliness (checked 2026-07-18)

Main drifted 4 commits ahead of the branch base since it started — **all docs/tickets**
(`7366b70` BUG-36, `a75c459` FEAT-35..37, `b892091` FEAT-31..34, `14d5efb` FEAT-30). None touch any of
the branch's 6 files. `git merge-tree` shows no conflict markers. Expect a clean `--no-ff`.

Note the branch touches `src/physics.js`, NOT `src/road.js` / `src/terrain.js` / carve, so it also does
**not** collide with the in-flight road-routing workstream.

## Merge steps

```bash
bash /Users/ledogen/.claude/skills/worktree/scripts/wt.sh merge failsafe-depth
# raw equivalent:
#   git -C <root> checkout main && git -C <root> pull --ff-only
#   git -C <root> merge --no-ff feature/failsafe-depth
```

Then, once satisfied:

```bash
bash /Users/ledogen/.claude/skills/worktree/scripts/wt.sh clean failsafe-depth   # removes worktree + branch
```

## Related / follow-ups

- **BUG-36** (already on main, `7366b70`): two road-fills meet at a knife-edge spine and a wheel clip
  makes the *widened* failsafe teleport the truck onto the spine. Documented there as **independent of
  this change** — the ~3 m penetration trips any threshold and the snap is single-frame, so this merge
  neither causes nor fixes it. The cheaper of its two proposed fixes (make the failsafe block a lateral
  bank-clip instead of teleporting vertically) would live in `physics.js` and build directly on this.
- **BUG-27** history is the reason the gate was re-aimed rather than re-baselined; see the long comment
  block atop `test/body-contact-energy.mjs`.
- The branch name undersells its contents: it holds both the failsafe threshold AND the restitution
  work. Worth a note if it isn't merged promptly.

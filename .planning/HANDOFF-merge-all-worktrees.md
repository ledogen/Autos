# Handoff: merge all outstanding work into main

Written 2026-07-27. Survey is accurate as of that moment — **re-run the survey commands in §1
before you start**, because two of the three trees had uncommitted work that may have moved.

**AMENDED 2026-07-26 (session that did the `src/camera.js` work and investigated `roadWOver`)** —
two things below were wrong or missing when this was first written:

1. §3's instruction to commit `roadWOver: 18500 → 19000` as a routine atomic change is **not
   safe**. That change is BLOCKED — see the new §0 below, read it before touching `data/ranger.js`.
2. §3 asked for a description of the `src/camera.js` diff — supplied inline at that section.

You are merging two feature branches plus loose work-in-progress in the main tree. The mechanical
part is easy; four things are not, and they are the reason this document exists:

- **`roadWOver: 19000` fails a gate with a real, reproduced physics defect — do not commit it
  as-is.** §0.
- **`data/route-cache-default.json.gz` is modified in two trees at once and is a binary.** Git
  cannot merge it. Picking a side leaves a cache that silently fails its signature check. §5.
- **`src/main.js` is edited by both branches**, in ~5 overlapping regions. All are additive on both
  sides, so the resolution is "keep both", but you have to actually look. §4.
- **Two different tickets both claim `id: PERF-26`.** §6.

---

## 0. BLOCKED: `roadWOver: 19000` — do not land without a fix

The owner asked to bump `roadWOver` (`data/ranger.js`) 18500 → 19000 "anyway" after seeing it drive
fine on a spot check. It was then re-baked into the route cache and investigated properly, and
that investigation found a real, reproduced defect — this is not the known/accepted plaza-ramp
measurement artifact from `905ef27`.

**What's wrong:** at `roadWOver: 19000`, `test/shoulder-lateral-continuity.mjs` fails on seed 6:
a 2.83 m height step at lateral 1.8 m (well inside the drivable road+shoulder footprint, tol
0.70 m), at world `(883.7, 907.7)`, on run `g:1,0,0:1,1,2`, arcS≈1557. That point is a real
on-road station, ~31.5 m from a junction node — inside the junction ruled-blend's fade zone
(`JN_FADE_IN=22` → `JN_FADE_OUT=34` in `src/road.js`).

**Confirmed physical, not just numerical:** teleported the truck to that exact station with the
correct road heading (`window.__tp(883.69, 907.72, 1.5820874993547969)` under `?prof=1`) — it
immediately tips off the road edge onto the embankment slope. Driving a few metres past the
station and the road is fine again; it's a knife-edge single-station defect, which is exactly why
a normal drive-by (the owner's spot check landed ~50 m away, near `908,953`) can miss it entirely
while it's still a real hazard if a player's wheel line happens to cross it.

**Best-guess root cause (unconfirmed, needs real investigation):** the junction ruled inter-leg
blend (`_carveDirtY` in `src/road.js`, the `JN_FADE_IN`/`JN_FADE_OUT` region around line ~4200)
fades toward a shared plaza grade by radial distance to the node. At 79% faded toward the pure
single-leg surface it should be close to continuous — but the barycentric sibling-gap weighting in
that blend is plausibly sensitive to small lateral shifts near this radius, and raising
`roadWOver` (interacting with `905ef27`'s already-raised `roadDeviationCap`/`roadGraphDeviationCap`,
8→10) likely pushed the sibling leg's grade far enough apart that the fade stops being C0 through
this zone. **Not fixed. Not diagnosed further than this.**

**What to do:**
- Default to **not** landing `roadWOver: 19000`. Revert `data/ranger.js` to `18500` and drop the
  re-bake, unless someone has since fixed the junction-blend continuity issue and reverified
  `shoulder-lateral-continuity.mjs` green.
- If the owner wants to pursue 19000 anyway, that's real `src/road.js` carve work (the junction
  blend has already been fought over hard — see `project_junction_fillet_merge_pending`,
  `project_qual11_qual16_pad_v2` in the owner's memory), not a config bump. Don't re-attempt it as
  a quick tolerance loosening in the test — the gate is correctly catching a driving hazard here.
- Either way, `data/ranger.js` and `data/route-cache-default.json.gz` stay a single atomic unit
  (unchanged from the rest of this doc) — just make sure whatever value ships has a clean
  `shoulder-lateral-continuity` run behind it, not just `route-bundle-parity`.

---

## 1. State of the three trees

Re-run this first:

```bash
git worktree list
git -C /Users/ledogen/CodeShit/CarGame               status --short
git -C /Users/ledogen/CodeShit/CarGame-story-mode    status --short
git -C /Users/ledogen/CodeShit/CarGame-stream-hitch  status --short
git branch -v
```

What it showed when this was written:

### `main` — `/Users/ledogen/CodeShit/CarGame` @ `905ef27`
Uncommitted, not on any branch:

| file | change |
|---|---|
| `src/camera.js` | 3 hunks, +44/-16 — chase-cam drag-orbit snap fix, finished + verified, see §3 |
| `data/ranger.js` | `roadWOver: 18500 → 19000` — **BLOCKED, see §0**, do not land as routine |
| `data/route-cache-default.json.gz` | re-baked, 3338043 → 3692864 bytes — tied to the blocked change above |
| `.planning/todos/pending/feat-stream-culvert-visual.md` | ticket edit (dupe-id fix, unrelated, harmless) |

The `ranger.js` + `.gz` pair go together: `roadWOver` matches `^road` in `routeCacheSig()`
(`src/route-store.js:22`), so changing it invalidates the bundled cache, and the re-bake is the
response. **Treat those two files as one atomic change** — but per §0, the value they should carry
is very likely `18500` (i.e. revert both), not `19000`.

### `feature/story-mode` — `/Users/ledogen/CodeShit/CarGame-story-mode` @ `272e7ce`
**ahead 2, behind 1.** The big one. Two commits (`f49657d` a `_detectJunctions` memo fix,
`272e7ce` FEAT-43 story-mode sandbox) touching 9 files / +988 lines, including a new `src/story.js`
that does not exist on main, plus `index.html`, `src/debug.js`, `src/map2d.js`, `src/road.js`,
`src/main.js` (+189).

It also carries **substantial uncommitted work**: `src/main.js`, `src/mission.js`,
`src/route-store.js`, `src/story.js`, `test/bake-route-bundle.mjs`, `test/mission-network.mjs`,
another `route-cache-default.json.gz` re-bake (3821355 → 8711187 — much larger, it covers the
story-mode region), and an untracked ticket `perf-26-cold-load-budget.md`.

Being *behind 1* matters: it does not have `905ef27`, which changed road params in `data/ranger.js`.
So its baked cache was made against **older** road params than main now has. See §5.

### `feature/stream-hitch` — `/Users/ledogen/CodeShit/CarGame-stream-hitch` @ `af0d620`
**ahead 4, clean.** PERF-26 streaming-hitch work. 4 commits, +253 lines in `src/`:

| file | change |
|---|---|
| `src/perf.js` | +141 — per-frame hitch attribution (the diagnostic layer) |
| `src/terrain.js` | +84 — the actual fix: resumable carve table |
| `src/main.js` | +32 — 9 small additive hunks, mostly wiring the diagnostic |
| `src/props/prop-system.js`, `src/road-mesh.js` | +9 — one-line `perfEvent()` tags |
| `test/hitch-report.mjs` | new, +146 — CDP harness, not a gate |

All 40 gates were green on this branch at `57b9a0e`. There is an untracked `node_modules` symlink
in that worktree (pointing at main's) and a gitignored `perf-runs/` — both are disposable.

---

## 2. Recommended order

**Land story-mode first, stream-hitch second.** Story-mode is the larger and more entangled change
and needs main merged into it anyway (it is behind 1). Stream-hitch's `main.js` contribution is 9
small insertions that are easy to re-apply against a file that has moved under them; the reverse
order means hand-resolving the 189-line story-mode diff against a moved file, which is worse.

```
-1. resolve the roadWOver blocker    (§0 — revert to 18500 unless it's since been fixed)
0. commit main's WIP        (§3)
1. merge feature/story-mode (§4a)  → verify → re-bake cache (§5) → gates
2. merge feature/stream-hitch (§4b) → verify → gates
3. renumber the duplicate ticket (§6)
4. clean up worktrees (§7)
```

Do **not** batch the two merges before verifying. If something breaks you want to know which merge
did it.

---

## 3. Step 0 — deal with main's loose work

Main's working tree must be clean before any merge. Commit it; do not stash it, because the
`ranger.js` ↔ `.gz` pairing is easy to lose in a stash:

```bash
cd /Users/ledogen/CodeShit/CarGame
# roadWOver: see §0 first — do NOT commit 18500 -> 19000 as routine. Revert to 18500 (and drop
# the re-bake) unless the junction-blend issue in §0 has been fixed and reverified.
git checkout -- data/ranger.js data/route-cache-default.json.gz   # if reverting per §0

git add src/camera.js .planning/todos/pending/feat-stream-culvert-visual.md
git commit -m "fix(camera): stop chase-cam drag-orbit snapping toward the car at speed"
```

`src/camera.js` is a **finished, verified bug fix**, not WIP — safe to commit as-is:

The chase-cam drag-orbit (hold left mouse to orbit around the car) re-projected the camera at a
fixed nominal radius (`ORBIT_RADIUS`, ≈6.5 m — the design offset length) whenever a drag started,
instead of the camera's actual current distance from the car. The follow-mode lerp lags behind the
car under acceleration, so the real gap grows well past 6.5 m; clicking to orbit then instantly
snapped the camera back to the fixed 6.5 m radius — the long-standing "camera snaps toward the car
when you grab it while driving fast" bug. Fix: track the camera's actual distance in a new
`orbitRadius` variable, synced every follow-mode frame alongside `orbitTheta`/`orbitPhi`, and use
it (not the fixed constant) when placing the camera in orbit mode.

Verified via headless CDP: reproduced the bug on pre-fix code (camera-to-car distance snapped
9.45 m → 6.67 m, a 4.1 m jump, on mousedown while accelerating), confirmed the fix holds the
distance steady (9.3 m → 9.28 m, no jump) under the same conditions. No gate covers `src/camera.js`
(camera/input glue, not physics/road) — this is expected per this project's gate scope; verification
was live in-browser.

The `.planning/todos/pending/feat-stream-culvert-visual.md` edit is unrelated and not mine — it
renames a duplicate ticket id (`FEAT-30` → `FEAT-44`; there were two pending tickets both claiming
`FEAT-30`, see `feat-par-calibration.md` vs `feat-stream-culvert-visual.md`). Already correct,
just uncommitted — bundle it into the same commit or its own, either is fine.

If the camera work is unfinished, commit it on a throwaway branch instead of main rather than
stashing it indefinitely — but as of this writing it's done.

---

## 4. The merges

### 4a. story-mode

```bash
cd /Users/ledogen/CodeShit/CarGame-story-mode
git status --short                     # commit or discard the WIP FIRST — see below
git merge main                         # resolve here, in the worktree, not on main
```

The uncommitted work in that tree is real feature work (mission/story/route-store + the bake
script). Commit it on `feature/story-mode` before merging main in, so that conflicts are
resolved once, in one place, with git able to help.

Merging `main` into the branch first (rather than the branch into main) means conflicts get
resolved in the worktree where the story-mode author's context lives, and `main` only ever sees a
finished merge. When it is clean:

```bash
cd /Users/ledogen/CodeShit/CarGame
git merge --no-ff feature/story-mode
```

Expect conflicts in `data/ranger.js` (main changed `roadWOver`; story-mode's base predates it —
**take main's value**) and in `data/route-cache-default.json.gz` (§5).

### 4b. stream-hitch

```bash
cd /Users/ledogen/CodeShit/CarGame
git merge --no-ff feature/stream-hitch
```

`src/main.js` will conflict. Both sides only ADD; the resolution is to keep both, every time.
The five regions to expect, with the reason each side touched them:

| region (main-line coords) | stream-hitch adds | story-mode adds |
|---|---|---|
| ~28–46, imports | `perf.js` imports (`perfEnableHitchLog`, `perfFrameBegin/End`, `perfEvent`, …) | a `story.js` import |
| ~1464–1474, inside `if (_PROF) {` | `__hitchDump` / `__hitches` / `__hitchReset` dev handles | its own dev handles |
| ~2471, end of the fixed-step accumulator | `perfAdd('frame.physics', …)` closing the `_ptP` timer | an adjacent hunk |
| ~2589–2646, streaming block | `perfEvent()` on the shadow re-arm; `perfEvent('shadow.bake')` | story-mode gating |
| ~2810, end of `loop()` | `perfFrameEnd(renderer.info.programs?.length ?? -1)` | — |

Two things that will break silently if you resolve carelessly:

- `perfFrameBegin()` must stay the **first** statement in `loop()` and `perfFrameEnd(...)` the
  **last**, after `renderer.render(...)`. They bracket the frame; if story-mode's merge moves work
  outside that bracket, the hitch report under-reports it as unattributed time.
- The `const _ptP = performance.now()` immediately above the `while (accumulator >= PHYSICS_DT)`
  loop and its `perfAdd('frame.physics', ...)` immediately below must stay paired.

No conflicts expected outside `main.js`: stream-hitch's other files (`perf.js`, `terrain.js`,
`prop-system.js`, `road-mesh.js`) are untouched by story-mode. `src/road.js` is touched by
story-mode only.

---

## 5. The route cache — the part most likely to go wrong

`data/route-cache-default.json.gz` is a **binary that three different states have modified**:

| tree | size | baked against |
|---|---|---|
| main HEAD (`905ef27`) | 3338043 | `roadWOver: 18500` |
| main uncommitted | 3692864 | `roadWOver: 19000` |
| story-mode base | 3821355 | pre-`905ef27` road params |
| story-mode uncommitted | 8711187 | pre-`905ef27` params + story-mode region coverage |

`routeCacheSig()` hashes seed + every `^road|^water|^pond|^stream|^coarse|^w[A-Z]` param. Any
mismatch means the cache **misses silently** — the game still works, it just routes on demand and
the cold load gets much slower. That is a soft failure you will not notice by looking at the screen,
which is exactly why it needs to be handled deliberately.

**Do not resolve this conflict by picking a side.** At either conflict, take any version to get the
merge to complete, then once ALL merges are done and `data/ranger.js` has its final merged values:

```bash
cd /Users/ledogen/CodeShit/CarGame
node test/bake-route-bundle.mjs        # writes the .gz in place; takes a while
node test/route-bundle-parity.mjs      # the gate that catches exactly this drift
git add data/route-cache-default.json.gz && git commit -m "chore: re-bake route cache after merges"
```

Note story-mode modified `test/bake-route-bundle.mjs` itself (its bake covers the story-mode
mission-planning region — that is why its `.gz` is ~8.7 MB). Re-bake with the **merged** version of
that script, so the result covers both the spawn band and the story-mode region.

Context worth having: per the project's own notes the bundled cache is a **dev convenience, not a
player-facing load-time optimization** — and there is an open ticket arguing it currently makes cold
load *worse* for real players. So if the re-bake is painful, a missing cache is not a crisis. Do not
let it block the merge; just do not pretend a stale one is fine.

---

## 6. Ticket ID collision — `PERF-26` is claimed twice

| file | subject | state |
|---|---|---|
| `.planning/todos/pending/perf-26-streaming-hitch.md` | streaming hitches / resumable carve | committed on `feature/stream-hitch` |
| `.planning/todos/pending/perf-26-cold-load-budget.md` | cold load on older machines | **untracked** in the story-mode worktree |

Both were opened 2026-07-26 in parallel worktrees, which is how they collided.

**Renumber the cold-load one to PERF-27.** It is a single untracked file with zero references from
code. The streaming-hitch ID is stamped into inline comments across `perf.js`, `main.js`,
`terrain.js`, `prop-system.js` and `road-mesh.js`, so renaming that one means touching ~15 code
sites for no benefit.

Caveat for whoever does it: the owner's memory index already records PERF-26 as the cold-load
ticket, so that note needs the same correction, or the next session will be confused.

---

## 7. Verification and cleanup

After **each** merge, not just at the end:

```bash
cd /Users/ledogen/CodeShit/CarGame
npx vite build --logLevel warn      # catches a bad import resolution immediately
npm run test:all                    # full suite — the merges touch road, terrain and story gates
```

`npm test` alone selects only gates affected by the git diff, which is not what you want after a
merge. Use `test:all`. Baseline: all 40 were green on `feature/stream-hitch` before this handoff.

Then a real drive, because the gates do not cover feel or anything visual:

```bash
npm run dev
# drive; then confirm the PERF-26 work survived the merge:
#   load with ?hitch=20, drive a few hundred metres, run __hitchDump() in the console
#   expect terrain.chunk lift near 0 ms; a lift of +7 ms or more means the resumable
#   carve was lost in the merge
node test/hitch-report.mjs --scenario=stream --cpu=4 --duration=45   # optional, needs the dev server
```

Cleanup once merged and verified:

```bash
cd /Users/ledogen/CodeShit/CarGame
bash ~/.claude/skills/worktree/scripts/wt.sh clean stream-hitch
bash ~/.claude/skills/worktree/scripts/wt.sh clean story-mode
git worktree list                   # should show only the main tree
```

Do not run `clean` on story-mode until its uncommitted work is committed and merged — that command
removes the folder and deletes the branch.

---

## 8. What is NOT in scope here

The PERF-26 streaming-hitch ticket lists remaining work (road ribbon tile cost, prop LOD-swap
outliers) with a **recorded dead end**: per-segment ribbon slicing was implemented, measured to do
nothing, and reverted. Read `.planning/todos/pending/perf-26-streaming-hitch.md` before touching
`road-mesh.js` for performance reasons, so that experiment is not repeated.

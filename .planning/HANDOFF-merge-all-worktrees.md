# Handoff: merge all outstanding work into main

Written 2026-07-27. Survey is accurate as of that moment — **re-run the survey commands in §1
before you start**, because two of the three trees had uncommitted work that may have moved.

You are merging two feature branches plus loose work-in-progress in the main tree. The mechanical
part is easy; three things are not, and they are the reason this document exists:

- **`data/route-cache-default.json.gz` is modified in two trees at once and is a binary.** Git
  cannot merge it. Picking a side leaves a cache that silently fails its signature check. §5.
- **`src/main.js` is edited by both branches**, in ~5 overlapping regions. All are additive on both
  sides, so the resolution is "keep both", but you have to actually look. §4.
- **Two different tickets both claim `id: PERF-26`.** §6.

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
| `src/camera.js` | 3 hunks, +44/-16 — chase-camera work |
| `data/ranger.js` | `roadWOver: 18500 → 19000` |
| `data/route-cache-default.json.gz` | re-baked, 3338043 → 3692864 bytes |
| `.planning/todos/pending/feat-stream-culvert-visual.md` | ticket edit |

The `ranger.js` + `.gz` pair go together: `roadWOver` matches `^road` in `routeCacheSig()`
(`src/route-store.js:22`), so changing it invalidates the bundled cache, and the re-bake is the
response. **Treat those two files as one atomic change** — never land one without the other.

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
git add data/ranger.js data/route-cache-default.json.gz
git commit -m "tune(road): roadWOver 18500 -> 19000 + route cache re-bake"
git add src/camera.js .planning/todos/pending/feat-stream-culvert-visual.md
git commit -m "feat(camera): <describe the chase-camera change>"
```

Read `git diff src/camera.js` before writing that second message — nobody has described what that
change does, so do not invent a message for it. If the camera work is unfinished, commit it on a
throwaway branch instead of main rather than stashing it indefinitely.

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

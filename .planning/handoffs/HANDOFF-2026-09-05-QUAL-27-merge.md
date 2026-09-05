# HANDOFF — merging `feature/router-v1-cull` into main — 2026-09-05

**You are merging 3 commits that deliver QUAL-27 (the v1-router residue cull) and mint QUAL-28.
Git reports this merge as CLEAN. It is not. There is exactly ONE thing to hand-resolve, it is four
lines, and `git merge` will not flag it. Read §1 before you type anything.**

Branch: `feature/router-v1-cull` @ `88dbff5`, worktree `/Users/ledogen/CodeShit/CarGame-router-v1-cull`.
Merge base: `7d9bdcd`. Main is 4 commits ahead of that base at time of writing (`480a8db`).
Branch tree is clean; all three commits are gated.

---

## 1. THE ONE RESOLUTION: four orphaned `CLS.BRIDGE` lines in `corridor-router.js`

`git merge-tree --write-tree main feature/router-v1-cull` returns a tree with **no conflicts**
(exit 0, no conflict list). Do not trust that.

**Why.** This branch deleted bridges from the v2 vocabulary — `CLS.BRIDGE`, `bridgesOn`,
`cBridgeM` and `cAbutment` are gone from `src/corridor-router.js` and `data/ranger.js` (owner
ruling, §3). At the same time, main's `420ed8e` (PERF-31 W3) hoisted the profile DP's per-station
terms out of its inner loop — and in doing so **copied the abutment transition test into four new
call sites** that did not exist when this branch forked. Git merges the two changes textually
without complaint, because they are different hunks. The result references an enum member and a
price that no longer exist.

I resolved the two ORIGINAL sites on this branch. These four are main's copies, and they are
yours. In the merged tree they land at lines 658, 806, 838 and 892, each one identical and each
one immediately after a `cPortal` line:

```js
                if (kBore !== jBore) sc += C.cPortal
                if ((clsK === CLS.BRIDGE) !== (clsJ === CLS.BRIDGE)) sc += C.cAbutment   // ← DELETE
```

**Resolution: delete the four `CLS.BRIDGE` lines. Keep every `cPortal` line.** That is exactly
what this branch did to the two original sites (in `makeStepCost` and `priceProfile`).

**How urgent is it, honestly:** not a fire. `CLS.BRIDGE` evaluates to `undefined` after the cull,
and `classOf` now only ever returns 0–3, so `(clsK === undefined) !== (clsJ === undefined)`
reduces to `false !== false` — the branch never fires and `C.cAbutment` is never read, so there is
no `NaN` and no cost change. It is dead code referencing a deleted enum, not a live bug. But it is
dead code referencing a deleted enum in the hottest loop in the router, so it goes.

**Verify you got them all**, from the merged working tree:

```bash
grep -nE "CLS\.BRIDGE|C\.cAbutment|C\.cBridgeM|C\.bridgesOn" src/corridor-router.js
```

Expected after resolution: **one hit only**, the explainer comment at ~line 480
(`// at Infinity via bridgesOn:false — the same Infinity, one class and three knobs lighter.`).
Anything else is a survivor.

### Nothing else collides

I swept the merged tree for every symbol this branch deleted. Full results:

| Symbol | Survivors in merged tree | Verdict |
|---|---|---|
| `CLS.BRIDGE`, `C.cAbutment` | 4 each, `corridor-router.js` | **← §1, fix these** |
| `bridgesOn` | 1, `corridor-router.js` | explainer comment, keep |
| `isConvexPolygon`, `triangulateConvexFan` | 1 each, `road-carve.js` | explainer comment, keep |
| `RoadRouteWorker` | `road-worker.js` (its own class), `road-network-worker.js` (nested pool import) | correct, keep |
| `MinHeap`, `PROTO_CELL`, `PROTO_DIRS`, `_protoTurnSteps`, `USE_CENTERLINE_RIBBON`, `slicePrimitives`, `USE_WORKER_ROUTING`, `_warmTileBand`, `setRouteWorker`, `warmRoutes(`, `warmSpawnBand(`, `kappa0`, `kappa1` | **zero** | clean |

`makePrimitive` is now 5-arg. All three call sites in the merged `corridor-router.js` (lines 1310,
1314, 1321) already pass 5 arguments, so main's W3 work introduced no arity problem.

File overlap between main and this branch is `data/ranger.js`, `src/corridor-router.js`,
`src/main.js`, `src/map2d.js`. Only `corridor-router.js` needs a human.

---

## 2. THE MERGE

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh merge router-v1-cull
```

Main's working tree had three uncommitted asset files (`assets/models/ranger.glb`,
`assets/models/src/ranger.blend`, `assets/models/src/ranger.py`) when this was written. They do
not overlap anything here, but `wt.sh merge` runs `git checkout main` — confirm with whoever owns
that asset work before switching branches under it.

After the merge commit, apply §1, then commit the fix on main as a follow-up (do not amend the
merge commit — the four lines are main's code, and the history reads better with the reason
attached):

```
fix(QUAL-27): drop the orphaned abutment tests PERF-31 W3 copied into the hoisted DP loops
```

**Do not take a whole-file side on anything.** If a textual conflict appears that this document
did not predict, stop and re-read — it means main moved after this was written.

---

## 3. WHAT THE BRANCH ACTUALLY DID

Three commits, net **−369 lines**, `road.js` −248.

### `7b8979e` refactor(QUAL-27) — the cull

**Dead code, zero references.** `MinHeap` (v1's A* open set), `PROTO_CELL` / `PROTO_DIRS` /
`_protoTurnSteps` (the 10 m A* grid and its 8-way turn-penalty state — declaration-only), the
always-true `USE_CENTERLINE_RIBBON` flag folded out, three dead `centerline.js` imports in
`road.js`, `slicePrimitives`, `isConvexPolygon` + `triangulateConvexFan` (`earClip` is the live
triangulator and handles convex rings too), and four orphan `ROAD_INFO` tooltips in `debug.js`
(`roadGraphCullCrossings`, and `'0'`/`'1'`/`'2'` for the retired `roadArcRadii` turn palette).

**Clothoids deleted (owner ruling).** A centerline primitive is now CONSTANT curvature: one
`kappa` field, not a `kappa0`→`kappa1` ramp, and `makePrimitive` is 5-arg. The Euler-spiral third
case existed for v1's Dubins terminals and its box-filter refit; v2's stage 3 is `lineArcFit`,
which only ever emitted `kappa0 === kappa1`. Measured on seeds 6/20/11 at 900 m: **553 line, 463
arc, 0 clothoid.** It cost a Fresnel table per primitive plus a branch in the two hottest samplers
(`primPose`, `Centerline._poseInto` — every ribbon, carve and physics query goes through them) for
a case that never occurred. `centerline.js` 375 → 296 lines. A future G2 upgrade re-adds the ramp.

**Bridges stripped (owner ruling: strip, don't park).** `fillMax` is now simply the fill CEILING —
above it `stationRateCls` returns `Infinity`, which is bit-for-bit what `bridgesOn: false` already
produced, one class and three knobs lighter. **This is the change §1 is about.**

**The main thread's route-worker pool: deleted.** Since PERF-30 every main-thread warm path was
`netClient`-guarded (`main.js` warmRoutes / `_warmTileBand` / `pumpRegionWarm`, the mission pump,
`map2d._pump`), so the pool spawned 2–4 module workers, seeded their noise fields at boot and on
every seed change, and **was never handed a single job**. Gone with it: `USE_WORKER_ROUTING`,
`_warmTileBand`, `map2d.setRouteWorker`, and — because nothing called them any more —
`RoadSystem.warmRoutes()` and `RoadSystem.warmSpawnBand()`. `_warmScan` lost its per-call job/eval
budgets and its resume cursor, since every surviving caller passed `Infinity` for both.

`RoadRouteWorker` itself **stays**: the network Worker's nested pool (PERF-31 W2.2) is now its only
consumer. `warmBandComplete()` stays — that is what the network Worker calls. **Do not
reintroduce a second main-thread pool.**

### `0df9474` fix(QUAL-27) — captures were building a different road

`serializableParams()` copied numbers, booleans and number-arrays. `roadV2` — the entire v2 price
list — is a nested object, so it was silently dropped from every capture. `replay.mjs` does
`new RoadSystem(seed, params)` with no merge over `RANGER_PARAMS`, so each key fell back to
`road.js`'s inline `?? default`. Sharpest divergence: the game ships `roadV2.vSmoothM = 15` (15 m
of vertical corner rounding) while `road.js` reads `?? 0` — so every replayed collision surface had
none of it.

Third instance of this bug class; the function's own comments describe the first two (booleans,
then `roadArcRadii`), and `map2d._paramSig` hit the identical `"[object Object]"` blind spot. So it
is now structural rather than a branch per discovered type: recurse plain objects and arrays, keep
every JSON-safe value type, drop only functions and class instances.

### `88dbff5` docs(QUAL-27) — and QUAL-28

`CLAUDE.md` and `LAYOUT.md` both still documented the terrain Worker as carrying a verbatim copy of
the road router (`arcPrimitiveConnect` + Dubins helpers in a `ROUTE SYNC` region) policed by a
`test/route-worker-sync.mjs` gate. FEAT-68 deleted all three and the gate file is not on disk — so
the one instruction a new session would follow when touching routing was to maintain a mirror that
does not exist. Replaced with the no-mirror fence, the two Workers and their nesting, and the
parity gates that pin the seams which genuinely can still drift.

**QUAL-28** (`.planning/todos/pending/`) holds the half of the audit that needs an owner decision
rather than a delete — see §5.

---

## 4. VERIFICATION — what I ran, and what you should re-run after §1

### The bar that licensed the vocabulary cuts

Network geometry is **byte-identical** to main's base across seeds 6/20/11/7/3 — sha256 over every
run's polyline plus its `tunnelSpans`:

```
BASELINE (7d9bdcd)  18ac9334d2e2f84ff369b0aaf739d1c2700cf0fe8ee6f684be22211527cc009f
BRANCH   (88dbff5)  18ac9334d2e2f84ff369b0aaf739d1c2700cf0fe8ee6f684be22211527cc009f
```

**Re-run this after resolving §1.** Main's W3 hoist changes the DP's arithmetic grouping, so the
post-merge hash will NOT match the numbers above — that is expected and is main's business, not
this branch's. What you are checking is that the merged tree matches **main's own** post-W3 hash.
So: take the hash on `main` before merging, take it again after §1, and require equality.

The script is not committed (it is a scratch harness). Drop it at `test/_netdump.mjs` in each tree,
run, then delete:

```js
import * as THREE from 'three'
import { createHash } from 'node:crypto'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
const h = createHash('sha256')
for (const seed of [6, 20, 11, 7, 3]) {
  const r = new RoadSystem(seed, RANGER_PARAMS)
  r.setRadius(900)
  r.update(new THREE.Vector3(0, 0, 0))
  const keys = [...r._network.keys()].sort()
  h.update(`seed ${seed} runs ${keys.length}\n`)
  for (const k of keys) {
    const e = r._network.get(k)
    h.update(k + '|')
    for (let i = 0; i < e.points.length; i++) {
      const p = e.points[i]
      h.update(`${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)};`)
    }
    h.update('|' + JSON.stringify(e.tunnelSpans ?? null) + '\n')
  }
}
console.log(h.digest('hex'))
```

It takes ~5 min per tree. It must live under `test/` — a `/tmp` script cannot resolve `three`.

### Gates

`npm run test:all` on the branch: **63/67 green**, 797 s wall. `npx vite build` passes.

**Four gates are RED, and all four are RED on main's base too.** I verified this on a detached
worktree at `7d9bdcd` — same gates, same failing checks:

| Gate | Status | Note |
|---|---|---|
| `junction-stitch` | standing red | Documented in `test/gates.mjs`: "RED until the departure pass lands" (BUG-56). |
| `mission-network` | standing red, 4 checks | **This gate is nondeterministic run-to-run.** Three runs of unmodified main gave 31/42, 29/37, 28/36 identical segments. Compare which checks fail, never the counts. |
| `paper-tour` | standing red, 2 checks | par growth + tier-2 customer overlap. Untouched by this branch. |
| `pond-route-around` | standing red, 1 check | `NON-VACUOUS` only. The control asserts that *without* water the router goes through the pond — the corridor router does not seek valley minima the way v1's `wAlt` term did, so it no longer fires. The two real checks (`ROUTE-AROUND`, `DRY-NODES`) pass. |

**Baseline before blaming a change.** Create a detached worktree at whatever main's tip is, symlink
`node_modules` into it, and run the gate there.

### Live check

The branch is served at **http://localhost:3151** (`npm run dev -- --port 3151 --strictPort` from
the worktree). Not owner-driven yet. Worth a drive after the merge: the clothoid and bridge cuts
are proven byte-identical headlessly, but the route-pool deletion changes **boot** — confirm the
game still reaches driving, and that cold spawn and story-region entry still animate their loading
screens rather than freezing.

---

## 5. AFTER THE MERGE

**Clean up:**

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh clean router-v1-cull
bash ~/.claude/skills/window-title/scripts/title.sh --clear
```

Kill the dev server on :3151 first. Note the worktree has a `node_modules` **symlink** into the main
checkout (added so the gates would run) — `wt.sh clean` removes the worktree directory, which
removes the link, not the target. Harmless, but do not `rm -rf` the worktree by hand without
checking that.

**Do not close FEAT-68** — it is open on its own terms (character sign-off, cold-load budget) and
this cull is not what closes it.

**QUAL-28 is the follow-on and it needs the owner, not an agent.** Half 1 is mechanical: delete the
v1 weight family still sitting in `test/lib/road-headless.mjs` (`roadWDist`, `roadWAlt`,
`roadWGrade`, `roadWOver`, `roadWTurn`, `roadArc*`), and fix six gate readers that take a
`?? default` on a parameter that no longer exists — `roadArcHardRadius ?? 8` in three gates,
`roadSelfClearMargin`/`roadSelfClearGap`/`roadCorridorExempt` in `graph-topology.mjs` — each of
which is currently a hard-coded constant wearing a deleted parameter's name.

Half 1 is blocked on Half 2, which is the owner's call: **how v2's ~5 physical prices map onto the
character v1 had after the par reanchor**, which the owner considers the target to replicate. There
is no key-for-key mapping (v1's ~15 unitless weights vs v2's priced knobs; `roadWAlt` / `roadWDist`
/ `roadWOver` have no v2 counterpart at all — those behaviours are emergent now). Do not inline the
constants before that is ruled, because inlining the wrong one makes it permanent.

One item there is time-sensitive: if the "pretty much perfect" character is characterisable in
numbers, `test/road-character.mjs` already reports exactly those (straight-span share, turn-radius
histogram, grade distribution, crest accel) — and capturing a v1-era report from git history only
gets harder as the branch ages.

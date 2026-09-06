# HANDOFF — BUG-41, diagnosed — 2026-09-05

**BUG-41 is not an elevation bug. It is an ARC-DOMAIN bug, and it makes par price a road up to
6.4% SHORTER than the one the player drives. The alarm that caught it describes a different
failure than the one that is actually happening — read §1 before you touch either.**

Diagnosed on `main` @ `529ef9b` (post router-v1-cull merge). Read-only; nothing was changed.
Target gate: `test/mission-network.mjs` §7 (currently RED, 2 of its 3 BUG-41 checks).

---

## 1. WHAT IS ACTUALLY WRONG

`edgeParData()` hands consumers a sampler whose arc domain is **`clArc`** — the arc length of the
edge's PRE-MERGE routed centerline. The run's real geometry is its polyline, whose arc length is
**`polyCum`**. For an ordinary run the two coincide. For a run that has been merged/ceded onto
another (BUG-53/55/57 — `offCurveSpans`), its points follow the winner's course, and the two
domains come apart.

Consequences, both measured (§2):

1. **`centerline.length` is wrong** — par prices `clArc`'s length, the player drives `polyCum`'s.
   Measured on 11 of 51 runs (seed 6, 1400 m at the spawn band): short by 0.19% to **6.39%**,
   worst `g:2,1,2:3,1,0` at −41.5 m and `g:-1,2,0:0,2,1` at −46.5 m.
2. **`gradeAt(s)` is indexed differently from `runProfile(s)`** — so the same `s` names two
   different physical points, up to **17.3 m apart** along the road.

Effect (2) is what the gate trips on. Effect (1) is the one that matters to the game: par time is
what missions are scored and paid against, so on merged runs par holds the player to a time
computed for a road shorter than the one in front of them.

### The alarm's own text is misleading — do not follow it literally

`mission-network.mjs:216-231` says a FAIL means par "silently starts pricing hills the truck does
not climb, at a magnitude nobody measured". That is NOT what is happening. The elevations agree
fine. Compared at matched XZ instead of matched `s`, the worst run's disagreement collapses:

```
run g:1,0,0:1,1,2, L=805 m
  max |dY| at the SAME ARC s (the gate's method) : 3.156 m
  max |dY| at the SAME XZ POSITION               : 0.298 m
  max arc-domain offset between the two          : 17.3 m
```

**The WONTFIX ruling itself was not wrong.** Its premise — interior agreement to within
centimetres — still HOLDS on road that has not been merged. Bucketing every interior sample by
span class:

| stretch | samples | p99 | max | mean |
|---|---|---|---|---|
| **plain road** | 2760 | **0.265 m** | 1.666 | 0.017 |
| ceded + offCurve + departure | 78 | 2.399 | 2.399 | 0.885 |
| offCurve + departure | 58 | **3.156 m** | 3.156 | 1.163 |
| tunnel | 8 | 0.002 | 0.002 | 0.002 |

Plain road still passes the originally licensed bar (`iP99 < 0.5`, `iMax < 2.0`). 100% of the
drift is inside the merge machinery. The 2026-08-03 ruling simply never contemplated runs that
would later be re-seated onto another run's course — that machinery did not exist yet.

### Why this is not a one-line fix

`road.js` `edgeParData()`:

```js
const clOf = (hit) => hit.offCurveSpans ? _pointSampler(hit.points, hit.clArc) : hit.centerline
```

The `clArc` there is **deliberate**. The BUG-53 comment immediately above it says the shim hands
consumers "a points-backed sampler **in the same arc domain**" — i.e. it preserves `clArc` on
purpose so existing `s` values keep meaning what they meant before the merge. Consumers of that
domain are `mission.js`, `gps.js`, `poi.js` (`.pointAt(s)` and `.length`) plus `par.js`.

So switching it to `polyCum` is a **domain change with consumers**, not a typo fix. Whoever takes
this must decide, and probably ask the owner, whether:

- (a) the sampler re-parameterises to `polyCum` (true driven arc) and every consumer moves with it
  — correct, but par times on merged runs change, which moves mission payout/scoring; or
- (b) par keeps `clArc` for continuity and only `.length` is corrected — narrower blast radius,
  but leaves two live arc domains in the same object, which is what produced this bug; or
- (c) something else — but "leave both domains and silence the gate" is not on the list.

`PAR_REF` was calibrated (FEAT-30) through this sampler, so (a) shifts the fit. It is 11 of 51
runs at ≤6.4%, so the shift is small but real — quantify it before shipping.

---

## 2. REPRODUCING THE MEASUREMENTS

All three scripts were written to `test/`, run, and deleted (they must live under `test/` — a
`/tmp` script cannot resolve `three`). Rebuild them from this section as needed; each takes
~1 min on seed 6 at 1400 m centred (139, 341).

**A. bucket interior divergence by span class** — proves the drift is confined to the merge
machinery. For each `road._network` entry with `cellA`/`cellB`, take
`ed = road.edgeParData(e.cellA, e.cellB)`, then for `s` from 250 to `L-250` step 4 record
`|ed.gradeAt(s) - road.runProfile(s, ed.key).gradeY|`, tagging each sample by whether `s` falls
inside `e.cededSpans` / `e.offCurveSpans` / `e.departureSpans` / `e.tunnelSpans`.

**B. same-arc vs same-position** — proves it is a domain mismatch, not an elevation error. For the
worst run (`g:1,0,0:1,1,2`), compare `ed.gradeAt(s)` against `runProfile` sampled at (i) the same
`s`, and (ii) the run arc `polyCum[i]` of the polyline point nearest to `ed.centerline.pointAt(s)`.

**C. length audit** — the one that matters. Per run, print `ed.centerline.length` against
`e.polyCum[e.polyCum.length - 1]`. Expect 11 off-curve runs short by 0.19–6.39%.

---

## 3. PREREQUISITE — fix the referee first

`mission-network` is BUG-41's own gate and it currently has a **nondeterministic check**: "mission
segments use the REGISTERED centerline object" returned 30/38 then 27/34 on an unchanged tree
(this session), and 31/42, 29/37, 28/36 in the QUAL-27 handoff's runs. A check whose denominator
wanders cannot tell your fix from noise.

**Make that check deterministic (or drop it) before starting**, or you will not be able to read
your own result. It is independent of everything else here.

The gate's other two failing checks are BUG-41's and should be expected to go green with the fix.
Note the third BUG-41 check (`peak |Δelevation| <= 45 m`) PASSES today at 6.5 m and should stay
passing — if it moves, something else broke.

**Also fix the gate's comparison itself.** Even after the code fix, comparing two samplers at the
same `s` is only valid while their domains agree; the gate should either compare at matched
positions or assert the domains are identical. As written it will silently mis-measure again the
next time a stage re-seats a run.

---

## 4. SEQUENCING — this CAN be parallelised

Two efforts are live on main: **QUAL-28** (`feature/qual-28-weights`, Half 1 WIP on a worktree —
test fixtures; Half 2 is an owner ruling on road character) and **FEAT-76**, already ruled blocked
behind QUAL-28 (`a0289b5`).

**BUG-41 is par-side, and par never feeds routing.** Routing is a pure function of terrain and the
`roadV2` prices; par only reads the road that was built. So a BUG-41 fix cannot move the character
metrics QUAL-28 is being judged against, and QUAL-28 cannot invalidate the *shape* of this
diagnosis. **Safe to run in parallel on its own worktree.**

Two caveats, neither blocking:

- QUAL-28 Half 2 retunes `roadV2` → different roads → different merge set → **the NUMBERS here
  move** (how many runs are off-curve, and by how much). The defect and the fix stay valid; only
  the magnitudes need re-measuring after QUAL-28 lands. Re-run §2C then.
- File overlap with QUAL-28 is near-zero (they are in `test/lib/` + gate readers; this is
  `src/road.js` `edgeParData`, `src/par.js`, `test/mission-network.mjs`). The historical collision
  risk on this project has been *measurement* ambiguity, not merge conflicts — and here there is
  none, because the two efforts are measured by different instruments.

**Do NOT** take the carve-side route (changing the built surface so the two series agree). That
would change geometry, which WOULD collide with QUAL-28's character bar and would force this
serial. The measurements above say the surface is fine — it is the bookkeeping that is wrong.

---

## 5. WHAT "DONE" LOOKS LIKE

- [ ] Owner (or a reasoned call) on §1's (a)/(b)/(c) — this is a domain change with four consumers.
- [ ] `ed.centerline.length` equals the run's true driven length on off-curve runs (§2C shows 0%).
- [ ] `mission-network` §7's two BUG-41 checks green; the third still passing.
- [ ] The gate no longer compares two samplers at the same `s` without asserting the domains match.
- [ ] Par-time delta on merged runs quantified, and the `PAR_REF` fit checked against it.
- [ ] `npm run test:all` — expect the standing reds only (`junction-stitch` until BUG-56's
      departure pass; `paper-tour`, which is a separate SM-INV-12 violation, see below;
      `pond-route-around`'s `NON-VACUOUS` control, which encodes v1 valley-seeking).

## 6. NOT YOURS, BUT FOUND ALONGSIDE

- **`paper-tour`** — both its failures share one cause: tier 3 drops a tier-2 customer
  (`house:7,2,1|7,3,0:3`), violating **SM-INV-12**; that shortens tier 3's route (11.00 → 10.39 km)
  which is what trips the separate par-growth check (78 → 661 → **655** → 979). Design invariant,
  owner's call.
- **`pond-route-around`** — only the `NON-VACUOUS` control fails; the two real checks pass. The
  control asserts the un-injected router drives through ponds because "a pond floor is a valley
  minimum", which was v1's `wAlt` term. Re-express it for v2 as "the injected network differs from
  the un-injected one" — do not simply delete it, or `ROUTE-AROUND` can pass vacuously.

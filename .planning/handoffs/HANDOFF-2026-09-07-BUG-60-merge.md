# HANDOFF — BUG-60/61/62 collider seam, ready to merge — 2026-09-07

**Branch `feature/bug-60`, worktree `CarGame-bug-60`, two commits, tree clean. Merge is
conflict-free against main @ `977c344` (verified with `git merge-tree`).**

```
de51353  fix(BUG-61,BUG-62): retire the shape-keyed maps; hull data is owned per slot
b866c48  fix(BUG-60): the broad phase drops a healthy static hull under shape churn
```

Three tickets closed, all moved to `.planning/todos/completed/`. Owner drove the build and signed
off: menu-stage jitter and drop-through gone, rock strikes at speed feel good.

---

## 1. What was actually wrong (the previous handoff's diagnosis was not it)

`HANDOFF-2026-09-06-BUG-60-collider-seam.md` named `destroyBody` pruning only `_shapeToHandle` as
the suspected cause and said to fix that alone and re-run. Done, and it moved nothing:
**13/40 before, 13/40 after**, with the maps balanced at boot values throughout. Real leak, fixed,
gated — but it was bookkeeping that happened to show up in the same numbers.

The defect: **the engine's world broad phase intermittently stops reporting a perfectly healthy
shape while shapes are created and destroyed near it.** At every failing sample the rock's body
transform, shape id, hull data, a per-body `b3Body_OverlapShape` and the raw
`b3CollideHullAndSphere` were all correct — the wheel measured **295–324 mm inside the rock** while
`contactSphere` returned nothing — and a 2 m query found the same rock in the same frame.

The trigger is ours: `updateWheelRims` → `replaceHullLocal` rebuilds four wheel-core hulls **every
step** (a hull has no setter), ~1000 shape create/destroys per second. Kill the churn, or move it
away from the rock, and the fault never appears. Debris create/destroy is not involved; nor are
contact pairs — the cores already filter to `GROUP_DEBRIS`, so they never pair with static geometry.

`b3World_RebuildStaticTree` was tried and **rejected**: it repaired a weaker headless approximation
but neither the gate nor the browser reproducer.

## 2. The fix

The engine is vendored WASM, so it lands at the seam.

**`contactSphere` enumerates its own candidates** — a sphere reject about each body origin against
`rec.reach[]`, a per-shape bounding radius recorded at registration — instead of trusting
`b3World_OverlapShape`. Walking bodies is O(n) where an index is O(log n), so the first cut cost
19.6 µs/call at 126 bodies; caching body poses per step (`_bodyXf`) took it to **3.6 µs at 126 and
1.6 µs at 14**, against a flat ~2.4 µs for the engine query it replaces — i.e. faster in the small
worlds this actually runs in, ~0.23 ms per 60 Hz frame at 126 bodies.

**`_shapeHulls` and `_shapeSizeR` are gone.** Each was read in exactly one place. Hull data and the
tire size hint now live on the body record indexed by shape slot, so they die with the body and
cannot alias. `_shapeToHandle` survives — engine contact callbacks hand you a shape id and nothing
else — with its key widened to `2**32` (BUG-61: the old `0x10000` multiplier let a recycled slot's
climbing generation reach the next slot's key in ~20 minutes of driving).

**The hull leak (BUG-62) was the global `this._hulls` array** holding a hard reference to every hull
ever built, reclaimed only by `dispose()`, i.e. never during play. That array is deleted; each body
frees its own hull when a slot is replaced or the body dies. 400 000 rebuilds per core (~2 h of
driving) with RSS flat at ~32 MB; browser reproducer **hulls held 18 → 18**, was 294 → 11 288.

## 3. Two traps recorded in the code — do not re-litigate them

- **`b3DestroyHull(hull)` and `hull.delete()` are ALTERNATIVES, not a pair.** Calling both is a
  double free that corrupts the WASM allocator, and it hides: 60 000 standalone hulls accepted both
  calls quietly and looked like the tidiest option by RSS, while through the adapter the next
  `b3CreateHull` went out of bounds on the **fifth** wheel-core rebuild. The previous handoff's
  warning was exactly right. Destroy only — the reason is at `_freeHull`.
- **Do not "optimize" `contactSphere` back onto `b3World_OverlapShape`.** The O(n) loop is
  deliberate and measured. The rationale is in the method's doc comment.

## 4. New invariants this fix depends on

1. **Bodies move only via `step()` or `setTransform`.** The per-step pose cache assumes it. Anything
   that moves a body by another route must invalidate `rec.xfStamp`.
2. **Group filtering tests `shape.categoryBits & query.maskBits` only** — one direction of the
   engine's two-way rule. Equivalent today because no shape sets `collidesWith: 0`; it is a
   narrowing, not a reproduction.

## 5. Gates

**`test/collider-seam-churn.mjs`** (registered, `physics`, `fast`) — pure node, ~15 s, no browser,
and it fails deterministically **from cycle 0** on the old code. That replaces a ten-minute browser
loop that only reproduced ~30% of the time. It asserts: the static hull answers the same surface
depth every cycle; a debris body under the wheel stays visible to the `qcPlus` query
(`GROUP_DEBRIS` + `dynamicOnly` — the path a wheel rolling over a loose rock takes); hulls retained
do not grow per cycle; `_shapeToHandle` retains no dead shape; and the 65535/65536 boundary is swept
against `_shapeKey` as the pure function it is.

`test/bug60-rock-contact.mjs` (rainy-day, needs the dev server) updated for the new storage — it
read the deleted `_hulls` array.

**Verification:** browser reproducer **0/40** (was 9/30, 13/40 on re-measure) · all 8 physics gates
green · `npm run test:all` **68/69**, the one red being `junction-stitch.mjs`, which fails
identically on main (BUG-56/QUAL-26) — checked, not assumed.

## 6. A side effect the owner spotted, confirmed and measured

Owner's read after driving: *"we might be slightly more resistant to suffering wheel damage from a
fast collision with loose rocks."* **Real, and it falls out of this work — but it is the opposite of
fast.** A/B of the identical rock strike through the real `stepPhysics`, pre-fix tree vs fixed tree:

| mph | peak `rimForceRoad` pre → fixed | rim damage per rock |
|---|---|---|
| 10 | 103 833 → 52 460 N | **6.53% → 0%** |
| 12 | 112 081 → 53 117 N | **8.45% → 0%** |
| 15 | 123 499 → 53 845 N | **11.38% → 0%** |
| 18 | 71 491 → 53 848 N | 0.87% → 0% |
| 20–45 | unchanged (54–61 kN) | ~0% either way |

The road-track yield is 60 037 N (18 × static wheel load). Pre-fix, dropped contacts let the wheel
sink past `WHEEL_SOFT_BAND`; when the contact reappeared the depth was already through the band and
the rim took a spike of 104–123 kN — **well past yield**. Post-fix the tire tracks the rock
continuously and the peak settles at ~52–54 kN, **below yield**, so nothing is banked. The erratic
pre-fix peaks (104, 112, 123, 71 kN with no monotonic trend) are themselves the signature of dropped
contacts.

At 20 mph and above the two are byte-identical: the peak is set by impact dynamics, and the fix
changes nothing. What likely reads as "better at speed" is contact CONTINUITY — the tire sees the
rock on 18/29 steps instead of 5/29 at 30 mph — so the hit is cleaner and less random, not softer.

Note the pre-fix absurdity this removes: hitting a rock at **15 mph cost 11.4% of a wheel while
45 mph cost 0.03%.** Slow strikes were the expensive ones. That is gone.

**This is a damage-model input change, not a retune** — no `DAMAGE_PARAMS` value moved. If the
calibration wants revisiting now that low-speed strikes are free, that is a separate owner call;
n=1-per-speed here is a measurement, not a calibration signal.

## 7. Still open, untouched

- **Tires not fully settling (carcass jitter).** Owner observed it and scoped it out of this work;
  it predates the fix and is unrelated to the broad phase. Nearest existing note is the low-speed
  tire slosh in the active-suspension bug list.
- `junction-stitch.mjs` red on main (BUG-56 / QUAL-26) — someone else's lane.

## 8. Merge

```
bash ~/.claude/skills/worktree/scripts/wt.sh merge bug-60
bash ~/.claude/skills/worktree/scripts/wt.sh clean bug-60
```

Main moved to `977c344` while this branch was open (menu-stage parallax, ASSET-34 bumper,
QUAL-26 notes). No file overlap with this branch and `git merge-tree` reports clean. `src/stage.js`
did change on main, and the BUG-60 reproducer drives that stage — worth one post-merge run of
`node test/bug60-rock-contact.mjs --port=<port> --drops=40` to confirm it still reads 0/40.

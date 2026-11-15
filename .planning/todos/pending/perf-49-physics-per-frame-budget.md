---
id: PERF-49
type: perf
status: open
severity: minor
opened: 2026-11-14
source: owner, 2026-11-14, perf42-reopen-carve card — "i think we're looking at the wrong thing. instead of worrying about the spikes we should be worried about the physics taking 3ms per frame. that feels like a huge budget. i feel like we can get down to 1-2 ms without me perceiving a difference. what are the main levers? i like the dense point sampling for rolling over obstacles things slowly but i think it provides little utility at high speeds except maybe high impact and collision handling (tire pop stability)"
relates: PERF-42, PERF-43, PERF-45, PERF-48, DEC-187, DEC-089, src/tire-contact.js, src/physics.js, src/road.js
---
lane: Lane B (the physics files are theirs); the Perf lane measures

# PERF-49: The physics budget per frame — the levers, ranked

## Next steps
Built on `land/perf-49` (worktree CarGame-land-phys, :3282), one commit per lever, NOT landed (DEC-208). The owner
drives kerbs on the branch vs main (owed card `perf49-kerb-drive`); levers 1 and 2 are bit-identical, so only lever C
can change feel. Lever 2 measured at noise: the owner may drop it (commit `git revert`-able on its own).

## Summary
The owner wants physics cut from "3 ms a frame" to 1–2 ms with no felt difference. This ticket is the answer as a
proposal, from numbers already on file (PERF-42/43/48, COST-MAP-2026-11.md, the PERF-42 verdict run). No new
benches were run (owner, 2026-11-14: token cap). Nothing is built.

## Description

### What a frame costs today (driving, this M4 Air, unprofiled)
- **Median: about 0.9 ms a frame.** Physics was 57 ms/s mean driving, per-second median 50 (COST-MAP bucket table).
  At 60 frames a second, 50–57 ms/s is 0.8–0.95 ms a frame.
- **In work, about 0.6 ms a frame.** The PERF-42 verdict counted ~340 million retired instructions (Minstr) per
  moving second of physics at the median. At a performance core's ~10 billion instructions a second that is ~34 ms/s.
  The ms figure is higher because macOS runs a lightly loaded game on a slower clock (COST-MAP's "clock trap": the same
  work reads 1.6–3.3× more ms).
- **3 ms a frame is a spike second, not the typical one.** p99 seconds read 144–184 ms/s (2.4–3.1 ms a frame); the
  worst 229–325 ms/s. Those are the junction seconds the owner just ruled close enough (DEC-187).
- So the owner's 3 ms is one of: a junction second, the slow-clock trap, or a slower machine (the Windows one). Which
  one changes the target: if it is a frame-time readout in the game under light load, the same build reads ~1 ms on a
  busy core.

### Where it goes (driving, profiled, COST-MAP § physics)
| part | share of physics | ≈ ms/s of the 57 |
|---|---|---|
| road carve stack (`road.js`: the height of the road surface under each sample) | 48 % | 27 |
| Box3D (the rigid-body engine, WebAssembly) | 18 % | 10 |
| terrain noise (`terrain-height.js`) | 7 % | 4 |
| POI pad contacts | 4 % | 2 |
| our vehicle model (Pacejka tyres, struts, `tire-contact.js` itself) | < 5 % | < 3 |
| the rest (glue, unattributed) | ~18 % | ~10 |

The tyre maths is not the cost. **The ground under the tyre is.** Each wheel's tread solve asks for ~65 ground heights
per step: 3 lines across the tread × (9 coarse samples spanning ±r along the rolling direction, ~6 cm apart, + 10
golden-section refine steps round each local minimum), + 2 normals of 4 heights (`tire-contact.js`). The road carve +
terrain noise (55 % of physics, ~31 ms/s) scale with that count. On flat road one refine runs per line, so 30 of the
65 samples are refine.

### The levers, ranked by saving (all estimates, none measured)
| # | lever | est. saving, driving | what it risks | exact? |
|---|---|---|---|---|
| A | **Height lattice**: sample the road + terrain once onto a cached fine grid per wheel area and read the grid (COST-MAP lever 9) | ~25 ms/s (~45 %) | MESH == PHYSICS breaks at the mm level at kerb lips and deck edges (the grid smooths a step face); every carve edge case reappears as grid resolution | **approximation** |
| B | **Owner's lever: sample density falls with speed.** E.g. above ~15 m/s, coarse 9 → 5 and refine 10 → 4: 65 → 35 samples a wheel-step | ~10–14 ms/s (~20–25 %), only while fast | see "The owner's lever" below: impacts and tyre pops at speed | **approximation** |
| C | **Edge-adaptive refine** (alternative to B): skip the golden-section refine when the 9 coarse samples of a line fit a smooth curve within a tolerance (say 1 mm), and take the closest point from a parabola through the 3 samples round the minimum. Full refine wherever the coarse row sees an edge, at any speed | ~11–14 ms/s (~20–25 %): plain road is ~81 % of moving seconds | an error bounded by the tolerance on smooth ground (sub-mm); edges, kerbs and potholes keep today's solve | **approximation, bounded** |
| D | Box3D substeps 8 → 4 (`ENGINE_SUBSTEPS`, physics.js) | ≤ ~5 ms/s (part of Box3D's 10) | measured: a worst-case flat frame slam rebounds more (effective restitution 0.21 → 0.30, `test/body-contact-energy.mjs`); 8 was chosen for that | **worse fidelity** |
| E | PERF-43 levers 1–2 (the junction carve's per-sample maths, exact) | ~2–4 ms/s mean; mostly the p99 | none (exact) | exact; but DEC-187 left the spikes |
| F | Parked only: stop the tyre carcass creeping at rest (0.4–6.7 mm/s through `SLIP_EPSILON`), so a parked tyre's ground query repeats and can be memoised exactly (PERF-45 §1) | ~30 ms/s **parked**, 0 driving | a change in the friction floor (Lane B's tyre model); fixes a non-Newtonian creep rather than approximating | exact once rest is still |

Not offered: a physics step below 60 Hz (every force loop's stability margin), an engine raycast wheel or vehicle
controller (DEC-075), physics in a Worker (CLAUDE.md). Fewer ground queries per step: already one per wheel per step,
reused across the four suspension substeps (`qcPlus`); nothing left there.

**Reachable:** C + D ≈ 15–19 ms/s off 57, about −30 %: ~0.9 → ~0.65 ms a frame median. A instead of C ≈ −45 %. If the
owner's 3 ms read scales the same, 3 → ~2 ms. Getting to a third of today needs A, the largest approximation.

### The owner's lever: what dense sampling buys at speed
- **Agreed in part.** At 25 m/s the wheel travels 0.42 m per 16.7 ms step, more than half the ±r window it samples.
  At speed the step rate, not the sample spacing, limits how finely an obstacle is seen (Forza moved to 360 Hz contact
  for this reason). So dense spatial sampling buys less at speed than at a crawl.
- **Where it still matters: impacts.** A sparse row can miss an edge whose basin is narrower than the spacing (the code
  records a kerb 28 cm ahead read 20 mm low that way). Then the depth jumps between steps as the edge crosses sample
  points, and the force jumps by depth error × the tyre's radial stiffness. That is the tyre-pop failure: a sudden
  large contact force at a kerb or pothole strike.
- **A speed threshold is a seam.** Crossing it changes the contact depth on the same ground, which is a force step.
  It would need hysteresis, or a blend (which costs both solves).
- **Lane recommendation: C rather than B.** It saves about the same on the road, never thins the solve at an edge, and
  has no speed seam. Both are approximations (DEC-089: flagged as such); C's error has a stated bound.

### Unmeasured (what the next agent measures first)
- Every saving above. Measure headless: `test/fingerprint-physics.mjs`'s run for the identity/drift, and the PERF-42
  spot tools for µs per wheel query, before any bench.
- What share of driving is above 15 m/s on the bench route (sets B's saving).
- How often a coarse row on plain road is smooth to 1 mm (sets C's saving).
- The kerb-graze bench (pops 3/4/8, no flips) under B or C: the impact case the owner named.

## Tracker
- [x] The levers listed with estimated savings and risks, from the numbers on file
- [ ] Owner: where the 3 ms is read, and which lever(s) to try
- [x] The pick measured headless (retired instructions per step, contact error, kerb-graze unchanged) — Log 2026-11-14
- [ ] Built by Lane B, or closed
- [x] Lever C (edge-adaptive refine) built and measured: physics stays around 0.9 ms a frame
- [x] PERF-43 levers 1 and 2 (lever E, exact) built and measured
- [x] All three test well (gates, fingerprint-physics, measured per-second spikes) — lever 2 saves nothing measurable
- [ ] The owner drives kerbs and judges game feel BEFORE any of them lands (DEC-208)

## Open questions
- Where is "3 ms per frame" read: the in-game readout, a profile, or the Windows machine?
- Which levers to try? Recommendation: C first (bounded approximation, no speed seam), D only with the slam gate
  re-read, F when parked heat matters. A only if a third of today's cost is the real target.
- "the perf-43 levers ... add in lever C. all three": read as PERF-43 lever 1, lever 2 and lever C. If the owner meant another three (A, B, C), say so in the note box.
- Airborne spike (land/perf-49-spikes): only approximations are left. The candidate is an airborne early-out: skip a
  tread line's refine (or re-use an empty answer across substeps) when its coarse clearance is over a margin m (~0.1 m).
  It misses a contact only where the ground rises more than m between two coarse samples 9 cm apart, and then catches it
  one substep (4 ms) later. Expected: the airborne steps drop ~50–75 %. Build it, or leave the worst at ~90 M?

## Links
- `.planning/perf/COST-MAP-2026-11.md` § physics and § 3 (the split and the professional practice).
- PERF-42 (completed) § Verdict for the work numbers; PERF-45 § 1 for the parked creep.

## Files
`src/tire-contact.js` (`TIRE_CONTACT`, `treadContact`) · `src/physics.js` (`ENGINE_SUBSTEPS`, `SLIP_EPSILON`) · `src/road.js`

## Log
- 2026-11-14 (Perf lane): minted from the owner's PERF-42 note; levers written from numbers on file, no new runs.
- 2026-11-14: scribe recorded the owner's answer.
- 2026-11-14 (Lane B): built on land/perf-49. Measured headless: test/drive-soak's drive (3 pinned random seeds × 1.5 km,
  real world rig + the game's stream cache), retired instructions per physics step from xnu's thread counters (main
  → branch: median 6.40 → 4.34 M, p90 19.3 → 12.0, p99 53.5 → 38.1, worst 126 → 125; same-code noise ±2 %).
  C (bee1aaf4) approximation: median −28 % / p90 −40 % / p99 −28 %; vs the refine |Δdepth| worst 0.0095 mm, pressure
  centre median 0.09 / worst 1.4 mm; kerb-graze identical (pops 3/4/8, rim 12, 0 flips), 57 → 30 samples a query.
  Lever 1 (0e0f6beb) exact: median −7 %, spikes flat. Lever 2 (2acc9f02) exact, ≈ 0 (only 7 % of blends repeat a point).
  Exact = drive full-state sha256 identical + fingerprint-world ALL IDENTICAL. Gates: C 28/28, 1 75/75, 2 75/75. Tools: wip/perf-49/.
  Not covered: the worst steps (~125 M, a seed-759313244 junction at 12 m/s) — no lever reaches them.
- 2026-11-14 (Lane B, land/perf-49-spikes): the worst steps are the truck AIRBORNE off a junction's fill (seed 759313244
  (−402, 1488), 10 m off the centreline, 1–2 m up, 3 s): every wheel's query is empty, so each substep re-asks the full
  tread solve (16–20 a step × 61 samples), and off the deck beside a junction every sample re-resolves (hint not solo).
  Exact cuts: 5bf86440 (substep 0 reuses Step 1's empty answer at its own hub; band tangents cached per run), d1d3e1dc.
  Worst 129.6 → 88–90 M, p99 39.1 → 29.1–29.5, median flat (repeat noise ±1.5 %); drive sha256 + fingerprint-world identical.

## Decisions
- 2026-11-14, owner (card perf49-physics-budget): "0.9ms / frame is chill. chase the perf-43 levers to try to keep it to that. ive got tokens and a charger for days so im happy to invest in stability here now. add in lever C. all three must test well and i need to drive curbs to check game feel before they land" (DEC-208).

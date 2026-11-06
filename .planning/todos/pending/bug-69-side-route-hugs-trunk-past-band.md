---
id: BUG-69
type: bug
status: pending
severity: minor
opened: 2026-09-20
source: >
  road-clearance residue after BUG-66's B7 departure test (feature/bug-65-66, 2026-09-14).
  Battery row: lone-pine (−68,320), 28.3 m vs a 28.5 m rule over 4 m, 60 m past the T at
  (−127,335). Fresh-window rows of the same shape: seed 1625430154 (−899,694) 2.1 m short
  over 8 m, (−1686,1354) 0.1 m short over 4 m.
relates_to: BUG-66 (closed — the T-mouth mechanism, which does not reach this),
  QUAL-26 (sibling-clearance routing — the actual lever, currently banked as OPTIONAL),
  FEAT-77 (the second routing pass)
---

# BUG-69 — past the band the side road's OWN ROUTE hugs the trunk, and no fork station fixes it

## What happens

At lone-pine (−68,320) the side road leaves its T cleanly — B7 (BUG-66) passes at the mouth — and
then, on its own routed line, runs 24–28 m from the trunk for 60 m while diving at 38 % on 5–7 m of
its own fill. The rule asks 28.5 m; it gets 28.3 m over a 4 m stretch.

**It is not the junction's fault and moving the junction cannot fix it.** Traced on the branch:
`_clearOver` is 1.16 for all 12 candidate fork stations that build, and the further stations are
rejected by the prefilter under the same rule. Every station on that trunk carries the identical
shortfall, because past the departure band the side is no longer pinned to the trunk — it is on the
line the router chose, and the router priced that line without knowing the trunk was there.

A longer deck hold is not the answer either: at the parting point the side's own profile sits 14 m
below the trunk surface, so holding it out to clearance would put it on a 15–20 m viaduct.

## Where the fix belongs

**The routing layer, not the junction layer.** This is exactly QUAL-26's measurement: price the
winner's corridor as occupied within the proximity rule and re-route the sibling. A0 measured that
across all 59 battery departures — 59/59 still connect, 49/59 then leave the winner clear, median
length cost 1.00×, worst 1.30×, zero unroutable. QUAL-26 is banked as OPTIONAL on a *band-smoothness*
trigger; this ticket is a second, independent reason to open it, and the one that would take
`road-clearance` green.

Cheaper alternative worth measuring first: apply the occupancy price only to the ~60 m immediately
past a T's departure band (where the side is still inside the trunk's reach) rather than to the whole
corridor — a narrower change than QUAL-26's full pass, and it is the only stretch these rows occupy.

## Owner's read, 2026-09-20

Plates 3 and 4 "might technically violate but are playable as is". So this is worth green, not worth
a viaduct — severity minor, and the gate stays red on it under the 2026-09-14 ruling ("true clearance
is necessary to enforce; leave red or fix verifiably" — no length threshold, no report-only).

## Acceptance

- [ ] lone-pine (−68,320) leaves the trunk ≥ 28.5 m clear for its whole run, without a viaduct
- [ ] the two fresh-window rows of the same shape (seed 1625430154) clear too
- [ ] road length cost stays inside QUAL-26's measured envelope (median ≤ 1.01×, worst ≤ 1.30×)
- [ ] `promoted-node-id` T count unchanged; `junction-stitch`, `restream-invariance`,
      `world-determinism`, `road-connectivity` green

## Measured — Spare, 2026-11-01 (lane: Spare; nothing built — a fix re-routes the world)

**The rows still exist on today's roads** (`wip/bug-69/rows.mjs`, the gate's own walk and rule):
lone-pine (−68, 320) 0.17 m short over 4 m; seed 1625430154 (−1686, 1354) 0.07 m over 4 m and
(−3536, 2306) 0.34 m over 4 m — all three are FEAT-77 ruling (a) near-misses now, reported, not gated —
and seed 1625430154 (−899, 694) **2.06 m short over 8 m**, a real miss (not in the gate's battery).

**How common, across worlds** (`wip/bug-69/census.mjs`, seeds 1–12 at 1400 m: 176 close pairs): 3
near-misses and 6 real misses, every one two legs of one node, in four classes:

| class | rows | worst |
|---|---|---|
| **this ticket's** — the side dives 10–22 m below the trunk right beside it | seed 2 (1619, −620), seed 5 (991, −1263), seed 12 (−814, −361) | 3.5 m short over 48 m |
| a registered at-grade CROSSING 250 m from the shared node | seed 4 (1637, 406) | (the walk does not exclude crossings — a gate gap, not a road defect) |
| a `~p` parallel half (BUG-63) running 22.8 m from its sibling | seed 4 (1239, −1118) | 5.7 m short over 148 m |
| **two legs OVERLAPPING** — centrelines 5.8 m apart with 5.1 m of height between them, pavements on top of each other for ~160 m, no crossing registered | seed 10 (1566, −949) | 22.7 m short over 164 m |

So this ticket's own class is ~1 in 4 seeds, 1.4–3.5 m short over 8–48 m, and the owner has read it
as "playable as is". The census found a worse, separate defect: seed 10's two legs of one node drawn
on top of each other (overhead shot: `wip/bug-69/seed10-overlapping-legs.png` — one wide road with two
centre lines). That one needs its own ticket.

**Next step needs a go:** the ticket's narrow fix (an occupancy price on the ~60 m past a T's departure
band) re-routes edges, so every world moves. Not built.

## Case study for the owner — Spare, 2026-11-06 (owner: "i need to see this in its own case study artifact please")

**BUG-105 did not change this class.** Seeds 1–12 re-run on main `14c6feb6`: seed 2 (1619, −620) 1.43 m short over 8 m,
seed 5 (991, −1263) 2.55 m over 8 m, seed 12 (−814, −361) 3.50 m over 48 m, plus seed 12 (−821, −1596) 2.11 m over
4 m. It is banks-only contact, which BUG-105 reports and does not chase. Seed 10's overlapping legs, the worse
defect this census found, are gone: BUG-105 fixed them.

**On random seeds** (BUG-105's 140-window census, census 10): **25 rows** are two legs of one junction with the side
10–23 m below, short of the rule by 1.0–6.2 m over 4–144 m.

**The ticket's narrow fix has nothing to act on.** The price past a T's departure band was prototyped (`58e5b8ff`,
reverted): it changed no row. Today's rows are mostly not a T's side road. They are two plain legs of one junction
that leave at a narrow angle and part only 100–150 m out, one climbing, one descending. FEAT-77 already names one
the loser and re-routes it, but the re-route comes back identical (seed 12: pass 1 = pass 2). The berth is graded,
`wClear · (1 − d/req)`, so at 25 m against the 28.5 m the rule wants it costs ~1.5 per metre. That is less than the
grade the leg would buy by going round.

**The lever that works: a stronger berth between legs of one junction.** Prototype `474b6d42` on
`proto/bug-69-past-band` (worktree `CarGame-bug69`): a loser re-routing against a leg of its own junction carries
`wClear` ×10 in its occupancy payload. Seed 12: both misses clear. Seeds 2 and 5 do not move, because they are
other mechanisms:
- seed 2 is a T's departure;
- seed 5's legs are 15–22 m apart for the first 100 m, the junction's own ground. A T is forecast but none ships.

Census of the prototype over the 140 windows is running (what clears, GRAZE must stay 4, the footprint).

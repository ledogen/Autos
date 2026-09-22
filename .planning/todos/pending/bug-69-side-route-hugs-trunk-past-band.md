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

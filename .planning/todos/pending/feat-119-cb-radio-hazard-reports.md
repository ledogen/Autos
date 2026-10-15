---
id: FEAT-119
type: feature
status: open
severity: minor
opened: 2026-10-15
source: owner, 2026-10-15 — "I like the CB radio that warns you of hazards." Picked when the radio
  forecast was retired (a forecast changed no decision; see FEAT-107 and IDEAS.md "Radio").
relates: items.md §"CB radio" (the original entry, "blocked until the hazard system exists"),
  FEAT-26 (rockslide ambush), FEAT-27 (static rockslide), FEAT-111 (deer at dawn/dusk),
  spirits-and-pacts.md #05 (the Highway: washouts, and the "hazard intel only, never mission intel" line),
  FEAT-34 (instrument cluster, where a radio module would sit)
requires: at least one hazard system shipped (FEAT-26, FEAT-27 or FEAT-111). Nothing to report until then.
invariants: SM-INV-12 (reports, misses and phantoms all come from the run's seeded random numbers, so
  the same run gives the same reports), SM-INV-10 (spoken/captioned words, no
  hazard meter), feedback_emergent_over_injected (the report describes a hazard that exists; it never
  creates one)
---

# FEAT-119: CB radio — hazard reports

## Request

A CB radio in the truck that warns you of hazards on the roads ahead: a rockslide on the grade, deer
out by the creek, a washed-out crossing. Hazard intel only, never mission intel (items.md's line).

## Shape (proposal, not ratified)

- **Reports what is really there.** Hazards are placed by the run-layer schedule. The CB reads that
  schedule and names the ones within some radius of the truck, in rough words ("rocks down on the
  north grade"), not map pins.
- **Captions are the true copy.** Voice, if any, is the browser's built-in text-to-speech
  (`speechSynthesis`), whose voices vary by OS, so the caption carries the meaning.

## Owner ruling 2026-10-15

- **An upgrade item**, bought, not stock.
- **Imperfect on purpose.** Some false positives (a report with no hazard) and some false negatives
  (a hazard with no report), "to keep it spicy".
- **Warns 100–500 m ahead.**

This amends the "reports what is really there" bullet above: the real hazards are still the source,
but the CB is allowed to drop some and invent some.

## When to fire (proposal)

The owner flagged this as the hard part. The road system already has the two pieces it needs:
`RoadSystem.queryNearest(wx, wz)` puts the truck on a road run at an arc position, and
`networkGraph()` gives the junctions and edges.

1. **About once a second**, put the truck on its road and note which way along the run it is heading.
2. **Walk the road forward up to 500 m**, taking *every* branch at a junction, and collect the
   hazards on that stretch. That is a few tens of edges, so it is cheap.
3. **Each hazard draws its own warning distance** in 100–500 m from the run's seeded random numbers.
   It fires once, when the road distance to it drops below that number.
4. **False negatives:** each hazard rolls once whether the CB will ever report it.
5. **False positives:** phantom reports are placed on the same forward walk, but only where the
   hazard is plausible (rocks on a steep cut, deer at dawn or dusk). An implausible lie gives itself away.
6. **Branches give some free noise.** A warning about a hazard on a side road you then don't take reads
   like a false alarm without being one.
7. **Off-road:** no reports until the truck is back near a road.

## Open (owner)

- False-positive and false-negative rates. Proposal: ~10–20% each, tuned by feel.
- Does it report deer (a moving hazard) or only things that sit still?

## Acceptance

- Reports fire 100–500 m ahead along the road, measured as road distance, not straight-line distance.
- Real reports match placed hazards; phantom reports land only where that hazard type is plausible.
- Same seed + same run state → same reports (headless, flag-gated with the hazard timing).

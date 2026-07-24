---
id: BUG-38
type: bug
status: open
opened: 2026-07-24
severity: minor
source: user-request
relates_to: tire smoke (src/smoke.js, feature/tire-envelope merge 9d32b35), dust (src/dust.js
  onRoadFactorAt), FEAT-38 (dirt roads — future second surface class)
note: "Tire smoke currently has NO on-road/off-road gating by design (src/smoke.js header: 'happens
  on ANY surface (pavement included — that is where burnouts read strongest)'). User wants it
  suppressed off the paved ribbon — i.e. on raw/off-road terrain ('dirt') — reversing that design
  call for the off-road case specifically."
---

# BUG-38: Tire smoke should not appear on dirt/off-road terrain

## Observed

Tire smoke (`src/smoke.js`, `TireSmokeSystem`) currently emits identically regardless of surface —
it is gated only by contact-patch slip × normal force (`sa` × `fn`), with no on-road/off-road factor.
A hard-slipping wheel off the paved road smokes exactly as it would on pavement.

## Desired behaviour

Tire smoke should only appear on paved (asphalt) road surface. On dirt / raw off-road terrain, the
slipping wheel should kick up dust (already handled by `src/dust.js`) instead of — or without —
smoke.

## Fix direction

`src/dust.js` already has `onRoadFactorAt(x,z)` (currently used to *suppress* dust ON the paved
ribbon — see `feat-dirt-roads.md`/FEAT-38 for the plan to invert it for a future dirt-road surface
class). Tire smoke needs the **opposite gating**: multiply smoke emission by an on-road factor that
is ~1 on pavement and ~0 off-road. `src/main.js` (~line 2518-2521) currently passes smoke's ground
sampler "verbatim" with the comment "smoke has no on-road fade, so no third callback" — this is the
line to change, adding a third callback (or reusing dust's paved-factor callback directly) so smoke
fades to zero off the ribbon.

Note there is currently only one off-road surface (raw terrain); FEAT-38 (dirt roads, not yet built)
will introduce an actual "dirt" road surface class distinct from raw terrain. This ticket only needs
paved-vs-not-paved gating today; if/when FEAT-38 lands, confirm dirt-road surface also suppresses
smoke (it should, being unpaved).

## Acceptance

- [ ] A wheel slipping hard while off the paved road (on terrain) does not emit smoke.
- [ ] A wheel slipping hard on the paved road still emits smoke as today (no regression to the
      on-road burnout look).
- [ ] Transition at the road edge is not a hard pop — reuse dust's existing feathered edge-band
      logic/shape if practical, rather than inventing a second one.
- [ ] `npm test` stays green; no new per-frame cost beyond the existing ground-sample callback.

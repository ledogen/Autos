---
id: BUG-38
type: bug
status: completed
closed: 2026-09-21
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

- [x] A wheel slipping hard while off the paved road (on terrain) does not emit smoke — AMENDED by
      the owner 2026-09-21 to a FLOOR of 0.15 rather than zero: a dirt burnout does smoke, thinly.
- [x] A wheel slipping hard on the paved road still emits smoke as today (measured 1.000, unchanged).
- [x] Transition at the road edge is not a hard pop — reuses `looseSurfaceFactor`'s existing 1.5 m
      shoulder feather; no second edge-band shape was invented.
- [x] No new per-frame cost beyond the existing callbacks.

## RESOLUTION — 2026-09-21, `feature/bug38-smoke`

**Owner ruling: floor, not zero — `smokeOffRoadFloor = 0.15`.**

Re-checked first: the bug was still entirely real at `9b38013`. `smoke.js` had no surface term
anywhere (`slipFactor × loadFactor × amount`, nothing else) and `main.js` still carried the
"smoke has no on-road fade, so no third callback" line this ticket named.

**The fix direction above was stale on two counts, both in our favour:**

1. **The helper to reuse is not `dust.js`'s `onRoadFactorAt`** — that is only the parameter name
   inside dust. The live shared function is `looseSurfaceFactor(x, z)` (`src/main.js`): ~0.1
   (`dustPavedFactor`) on the ribbon, 1 off it, feathered over a 1.5 m band into the shoulder,
   riding the memoized `carveHint` the physics path already warmed. Dust, dirt-spray and tire audio
   all take it forward; smoke now takes the SAME callback and reads it inverted. One shared feather,
   so the acceptance's no-pop criterion came free.
2. **`src/dirt-spray.js` did not exist when this was filed.** It already throws clods off-road under
   `LOOSE_FLOOR = 0.25` on that same factor, so the off-road half of "kick up dust instead of smoke"
   was already shipping — what the owner was seeing was a slipping dirt wheel doing BOTH.

**Implementation.** `smoke.js` takes an optional 5th arg `looseFactorAt` and maps it to a pavedness
multiplier normalised against `dustPavedFactor` itself — so the ribbon lands on exactly 1 and raw
terrain on exactly the floor, and retuning `dustPavedFactor` cannot drift it. Sampled per WHEEL at
the contact patch, not at the body: two wheels straddling the road edge must not smoke alike. The
term multiplies `targetIntensity`, so the existing `RAMP_TIME` easing smooths the surface transition
on top of the geometric feather. Omitting the callback still means pavement, which is what
the headless gates get.

**Measured** (identical slipping + loaded wheel, only the surface differs; steady-state intensity):

| surface | loose factor | smoke intensity |
|---|---|---|
| paved ribbon | 0.1 | **1.000** |
| shoulder feather | 0.55 | 0.575 |
| raw terrain | 1.0 | **0.150** |
| no callback (lab) | — | 1.000 |

Monotone across the edge; `dirt/paved = 0.150` hits the floor exactly.

**Also corrected, since the old design call was documented in four places:** `smoke.js`'s header
("happens on ANY surface"), `data/ranger.js`'s block comment ("Works on any surface, unlike dust,
which is why there's no on-road fade knob here"), and two `debug.js` tooltips. New slider
**FX → Smoke Off-Road** (0–1) exposes the floor; 1 restores the pre-BUG-38 behaviour exactly.

**FEAT-38 (dirt roads) note, as this ticket asked:** when a dirt road surface class lands it should
read as unpaved here and take the floor. `looseSurfaceFactor` keys off `carveHint`, so a dirt road
that reports itself unpaved gets the right answer with no change to `smoke.js`.

## AMENDMENT — the testing lab is its own surface (owner ruling, 2026-09-21)

The first cut of this fix gave smoke a lab special-case (`_labActive ? null : looseSurfaceFactor`),
leaning on the "no callback → pavement" default so a lab burnout would still read as a burnout.
**Owner: "lab should be considered as its own surface and it can share the pavement effect class
for now."** That is a decision about the surface model, not about smoke, so it belongs in the one
function that decides it — and the special-case is gone.

`looseSurfaceFactor` (`src/main.js`) now has an explicit lab branch returning `dustPavedFactor`,
above the `!roadSystem` fallthrough. Those two cases had been sharing a line and they are NOT the
same thing: no roadSystem means genuinely raw terrain with nothing streamed yet, and stays 1. The
lab is a bare instrumented plate — neither road nor terrain — and now says so.

**This changes the lab for all four FX consumers, which is the point of the ruling.** They all read
the one function, so they cannot disagree about what the tyre is standing on. At `loose = 0.1`:

| consumer | in the lab, before | in the lab, now |
|---|---|---|
| tire smoke | full (via the special-case) | full — unchanged, now for a stated reason |
| dust (`dust.js`) | full | `loose01` normalises to 0 → the paved haze |
| dirt spray (`dirt-spray.js`) | firing (1 > `LOOSE_FLOOR` 0.25) | **off** — 0.1 is below the floor |
| tire audio (`tire-audio.js`) | dirt (`loose` 1) | screech (`paved` 0.9) |

So the lab stops throwing clods off a flat test plate and stops playing dirt roll under a car on
what is effectively tarmac. "For now" is the owner's word and is load-bearing: when the lab wants
its own effect character (a bare concrete plate is not asphalt), it is one branch in one function,
and nothing else moves.

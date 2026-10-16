---
id: FEAT-112
type: feature
status: open
severity: major
opened: 2026-10-14
source: owner, 2026-10-12 / 2026-10-14 — "overloads need a mission card soft warning and hard warning
  based on the current truck configuration. That means building a long bed upgrade comes with the
  overload criteria as a function per upgrade. Verdicts should be fits, warning or overload. Can be
  triggered by size or weight."
relates: FEAT-67 (offer board — the card this writes on), FEAT-96 (freight — the strapped loads and
  their as-built masses), FEAT-88 (haul — loose loads), FEAT-114 (haul quantity — reads these limits),
  FEAT-115 (bed upgrades — the functions this composes), cargo.md (masses), data/freight.js (load models)
invariants: SM-INV-12 (the verdict never feeds the board's roll), SM-INV-10 (words on the card, no
  handling stat), SM-INV-15 (an upgrade is not a different vehicle)
design: design-amendments-2026-10-14.md §2–3; missions.md § Load verdicts; items.md §3f (the load-rating parts)
rulings: owner 2026-10-16 — weight overload starts at the manufacturer's rating; heavy-duty springs, LT /
  load-range-E tires and heavy-duty dampers raise it; overloaded tires pop on a hard hit through the
  existing worn-tire puncture path; no cargo is too long yet, but length overload must exist (12 ft
  boards in a pickup, 8 ft boards in a car).
  owner 2026-10-16 (2nd) — soft limit at the manufacturer's capacity, with a message; hard cap just
  above the cinder blocks, ~820 kg ("cinder blocks are dangerous, but drivable"; heavier freight
  later is what the cap refuses); tires poppable from ~600 kg.
  owner 2026-10-16 (3rd) — soft-limit message "Warning: this load exceeds the recommended weight
  limit"; the weakest part sets the limits; the 4 ft overhang overload line stands.
---

# FEAT-112: Load verdicts — fits, warning or overload, for the truck as configured

## Request

Every offer card says whether the job fits the truck **as it is configured right now**. Size or
weight can trigger a verdict. The seed decides the board for every vehicle and configuration
(SM-INV-12); the verdict is a display and an accept gate only.

## Rulings (owner, 2026-10-16)

1. **Soft weight limit = the manufacturer's payload capacity** (570 kg on the stock Ranger). Past it
   the card warns, with a message, and the job can be taken.
2. **Hard weight cap ≈ 820 kg** on the stock truck, just above the cinder blocks (785 kg). Past it
   the job cannot be taken. Nothing in today's catalog reaches it; heavier freight later will.
3. **Parts raise the limits:** heavy-duty springs, LT / load-range-E tires, heavy-duty dampers
   (items.md §3f).
4. **Overloaded tires pop on a hard hit**, through the worn-tire puncture path, **from ~600 kg**.
5. **Length overload is real but unused today.** No current cargo is too long. It still ships, proven
   on fixtures: 12 ft boards (3.66 m) in the stock bed, 8 ft boards (2.44 m) in a car.

### The verdict ladder

| Verdict | Triggers | Accept? |
|---|---|---|
| **Fits** | inside every limit | yes |
| **Warning** | mass past the soft limit (*"Warning: this load exceeds the recommended weight limit"*), any overhang past the tailgate, a loose load on an open deck | yes; the physics and the tire risk are the penalty |
| **Overload** | mass past the hard cap (*"too heavy"*), too long or too wide for the space | **no** |

On the stock truck: concrete (670 kg), cinder blocks (785 kg) and four drums (804 kg) are warnings
on weight; the railway ties (2.70 m, riding tilted onto the gate) overhang it 0.86 m and are a
warning on length (owner, 2026-10-16: the overhang rule wins). Every other current load fits.

## Outline

### 1. Truck configuration (data)

One `STOCK` config per vehicle, next to its model data. The Ranger's, measured off the model
(data/vehicle-models.js `bed`):

| Field | Ranger stock | Source |
|---|---|---|
| bed inner length | 1.84 m | front wall to tail, = the real 6 ft short bed |
| width between walls | 1.40 m | real: 1.38 m |
| width between wheelhouses | 1.09 m | real: 1.02 m |
| rail height above floor | 0.41 m | |
| overhang, warning | > 0 m past the tailgate | |
| overhang, overload | > 1.22 m (4 ft, the US red-flag line; owner-confirmed) | puts a 12 ft board 1.82 m out → overload; an 8 ft board 0.61 m out → warning |
| containment | `sides` | |
| soft weight limit | **570 kg** | the manufacturer's capacity: 2002 Ranger regular-cab 4x2, ~1,260 lb. data/offers.js already cites "~500–570 kg" |
| hard weight cap | **820 kg** | owner, just above the cinder blocks |
| tire pop onset | **600 kg** | owner |

ASSET-27's ~1.5 m-between-the-arches assumption is wrong for this model: it is 1.09 m. Anything
sized against 1.5 m needs a look when it meets a verdict.

A car's config has a cargo space sized to its trunk/cabin, so an 8 ft board is too long. No car
config exists yet; the gate uses a fixture.

### 2. Upgrades are functions

`config = upgrades.reduce((c, u) => u.apply(c), STOCK)` (reduce = fold the list left to right, each
upgrade handed the config the previous one returned). This ticket ships the fold and the stock config.
FEAT-115 ships the bed parts; items.md §3f's load-rating parts use the same hook.

**The weakest part sets the limits** (owner). Springs, dampers and tires each carry a soft limit and
a hard cap; the truck's are the minimum over the three, the way a real GVWR is set. Stock: all three
at 570 / 820 kg. Buying heavy-duty springs alone moves nothing; the package does. The tires also carry
the pop onset (600 kg stock), which only LT tires move.

### 3. Cargo carries size and form

Each bed load gets dimensions (L × W × H, off its model) and a form: `boxed`, `loose` or `long`.
Freight and fragile rows in data/freight.js; haul is per piece × the chosen count (FEAT-114).
Courier rides in the cab and always fits.

### 4. `loadVerdict(config, cargo) → { verdict, reasons }`

Pure, headless, in its own small module. Reasons are card words: *this load exceeds the recommended weight limit*, *too heavy*, *overhangs*,
*too long*, *too wide*, *will spill*. Worst reason sets the verdict.

### 5. The card

`offerBoard.card()` adds the verdict and its reason. Overload disables accept and says why. The card
reads the live config; nothing about the verdict feeds the roll.

### 6. Overloaded tires pop — the existing puncture path

Today (src/damage.js `_landBumpStop`): a tire pops when a bump-stop hit's peak force exceeds
`punctureThreshold(condition)`. Above 50 % condition it cannot pop at all.

The overload hook caps the condition the curve reads, and nothing else:

```
cap(m) = 1                                     below the pop onset (600 kg)
       = 0.50 → 0.10, linear from 600 kg to the hard cap (820 kg)
pop if peakN ≥ punctureThreshold(min(condition, cap(bed mass)))
```

A worn tire stays as worn as it is; the load only matters when it is worse than the wear. Past
600 kg a fresh tire reads as a 50 % tire, which is the first point the curve can pop at all. The
existing anchors, determinism and the replay identity with an empty bed are untouched. LT tires
move both ends of the ramp up.

| Load | Reads as | Hit that pops a fresh tire |
|---|---|---|
| ≤ 600 kg | fresh | none |
| concrete, 670 kg | 37 % | ~78 kN |
| cinder blocks, 785 kg | 16 % | ~48 kN |
| four drums, 804 kg | 13 % | ~38 kN |

Heavier cargo also makes bigger bump-stop hits on its own, which is emergent. Springs and dampers
need no hook: heavy-duty parts change the real spring and damper rates, so squat and bottoming are
physics.

## Calibration — done 2026-10-16

`node test/calibrate-overload-puncture.mjs` (rainy-day, ~1 s, deterministic). The fragile gate's
rig: real `stepPhysics`, a cinder-block pallet of the given mass welded in the bed at its real size
and seat, wheels on analytic surfaces (the gate's washboard, the lab's rumble-lane profile, drops).
Peak rear bump-stop force, kN:

| Input | 0 kg | 570 | 670 | 785 | 820 |
|---|---|---|---|---|---|
| paved slalom, 45 mph | 0.0 | 0.0 | 2.0 | 4.5 | 5.3 |
| washboard ±4 cm, 34 mph | 0.0 | 5.6 | 8.7 | 12.1 | 13.3 |
| washboard ±6 cm, 25 mph | 0.0 | 7.9 | 10.8 | 14.4 | 15.5 |
| medium rumble, enters at 20 mph | 0.0 | 0.0 | 0.0 | 1.2 | 6.2 |
| large rumble, enters at 20 mph | 0.0 | 5.1 | 13.9 | 23.6 | 25.1 |
| large rumble, enters at 40 mph | 0.0 | 0.0 | 10.0 | 13.0 | 10.8 |
| drop 0.5 m, parked | 0.0 | 14.0 | 18.2 | 23.7 | 24.9 |
| drop 0.9 m, parked | 2.8 | 35.9 | 44.3 | **53.1** | **56.3** |
| crest landing 1 m, 34 mph | 5.7 | 2.9 | 3.1 | 1.3 | 0.1 |
| **fresh-tire pop threshold, 10 % ramp** | none | none | 77.9 | 47.8 | 30.0 |

Bold = pops. Notes on the inputs:

- Rumble lanes scrub speed fast (the large lane at 785 kg holds ~10 mph), so those rows are entry
  speeds; the peak comes from the first crests.
- The 1 m crest landing at speed lands nose-first (throttle in the air pitches the body), so the
  front takes it (~26 kN) and the rear barely touches.
- No real-road drive: the washboards stand in for rough unpaved road.

**Reading at 785 kg (cinder blocks):** everything ordinary stays at or under ~24 kN, half the 48 kN
threshold. Only the 0.9 m drop pops a tire. That is "dangerous but drivable". **The 10 % far end
stays.**

**Reading at 670 kg (concrete):** the threshold is 78 kN and the hardest input reaches 44 kN, so
nothing in this set pops. The ramp's onset at 600 kg is real but, in practice, tires start to be at
risk somewhere past ~760 kg. If concrete should also risk a tire on a hard hit, the ramp has to fall
faster near the onset; that is the owner's call.

**Real-road check (optional, in-browser):** in a dev page with `?prof=1`, paste into the console to
peak-hold the bump force every physics step (the readout samples at 10 Hz and misses short hits):

```js
(() => { const d = window.__damage, step = d.step.bind(d)
  window.__pk = [0, 0, 0, 0]
  d.step = (vs, p, dt) => { for (let i = 0; i < 4; i++)
    window.__pk[i] = Math.max(window.__pk[i], Math.abs(vs.bumpForce?.[i] || 0)); return step(vs, p, dt) }
})()
pk  = () => window.__pk.map(f => (f / 1000).toFixed(1)).join('  ')   // FL FR RL RR, kN
rst = () => { window.__pk = [0, 0, 0, 0] }
```

Load **Debris → Load Cargo → Pallet of cinder blocks** at 785 kg, `rst()`, drive an unpaved road
as you would loaded, `pk()`. Under ~48 kN rear confirms the table.

## Acceptance

- [x] `loadVerdict` is pure and headless; a gate covers fits / warning / overload for size and for
      weight, and a composed upgrade changing the verdict.
- [x] Length fixtures: a 12 ft board is an overload in the stock bed; an 8 ft board is a warning in
      the bed and an overload in a car fixture.
- [x] Weight: concrete (670 kg), cinder blocks (785 kg) and four drums (804 kg) are warnings on the
      stock truck, with the soft-limit message; a fixture at 830 kg is an overload; every other
      current load fits (the railway ties excepted — they overhang, see the ladder).
- [x] Every posted bed load has dimensions and a form; the gate fails on a missing one.
- [ ] The card shows the verdict and reason; overload disables accept with the reason.
- [x] Same seed → the same board whatever the configuration (SM-INV-12).
- [x] A fresh tire under 600 kg still cannot pop; over 600 kg it can, on the ramp above.
      Pinned beside test/damage-filter-puncture.mjs; physics fingerprint unchanged with an empty bed.

## Implementation (2026-10-16, branch feature/feat-112)

- `src/load-verdict.js` — `truckConfig` (stock + upgrade fold), `loadVerdict`, `tireCondCap`. Pure.
- `data/vehicle-models.js` `ranger.load` — the stock rating; bed size derives from `bed`.
- `data/freight.js` — a `form` per row; sizes are the models' `PROP_MODELS` collision sizes.
- `src/damage.js` — `tireCondCap` field, read by `_landBumpStop`; set each step by main.js from the
  strapped load's mass. Physics fingerprint identical with an empty bed.
- `offerBoard.card()` words a verdict the caller hands it; main.js computes it (`_offerVerdict`), so
  the board never sees the truck. Map hover card gains a row; the parked panel a line, and accept is
  disabled on an overload.
- Gate `test/load-verdict.mjs`; a capped-condition case in `test/damage-filter-puncture.mjs`.

## Open — the owner's

None. Concrete (670 kg) never popping a tire in practice is fine as calibrated (owner, 2026-10-16).

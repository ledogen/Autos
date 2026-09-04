# HANDOFF 2026-08-19 (b) — SM-3 damage model, slice 2 mostly done

> **SUPERSEDED 2026-08-23 by `HANDOFF-2026-08-23-damage-merge.md`.** Read that one. Several damage
> SOURCES named below were later found to be the wrong quantity and were replaced — brakes, springs,
> wheels and the impact metric all changed after driving them. Kept as the record of how slice 2
> stood.

Supersedes the movement notes in `HANDOFF-2026-08-19-damage-model.md`; everything that handoff says
about the SEAM, the rulings, and the "do not rediscover these" list still stands and is not repeated
here.

**Worktree:** `/Users/ledogen/CodeShit/CarGame-damage` · **branch** `feature/damage` · **dev server**
`http://localhost:3686` (`npm run dev -- --port 3686 --strictPort`). The `node_modules` symlink is
already in place.

---

## What landed this session

### `b0e6cb5` / `b77dfc6` — the out-of-round + alignment port

The owner's uncommitted `feature/out-of-round` work was committed on that branch (`b0e6cb5`) and
cherry-picked here (`b77dfc6`) on the owner's ruling to take ALL of it, not just the runout half.
It brings `src/alignment.js` (static toe/camber, mirrored per side, pure math) and per-revolution
`params.wheelRunout`, plus a real alignment sheet on the Ranger: `toeFront +0.10°`,
`camberFront −0.50°`, `camberRear −0.30°`, `camberThrustCoeff 0.9`.

**The expected gate rebaseline did not happen.** `npm run test:all` was green on all 56 gates
immediately after the port — the shipped alignment values are mild enough that nothing tripped. That
is worth knowing before someone spends an afternoon looking for it.

`_toeOffsetDeg` / `_camberOffsetDeg` are still unconsumed. Slice 3 adds them on top of the static
values in `physics.js`, where `toeOffset()` and `camberLean()` are already called.

### `ac1b108` — collisions are connected (slice 2 item 1)

`applyImpact()` finally has a caller. Three pieces:

- **`physics-engine.js`** — `maxContactImpulse()` now returns `{impulse, point, normal}`, the point
  and normal in BODY-LOCAL frame, all three read off the same hardest manifold point so magnitude
  and position always describe one event. Engine types stay behind the seam. The contact/manifold
  scratch structs are cached on the instance; this runs every physics step.
- **`physics.js`** — `classifyImpactRegion(point, normal)`, pure, exported. The **normal** picks the
  face; the **point** picks which end of it. Two things worth not re-deriving:
  - The manifold normal's SIGN depends on which shape the engine labelled A, so only its magnitudes
    are usable. That is why the point is needed at all.
  - A predominantly vertical normal returns `null`. There is no floor or roof armor region, so a
    landing is not an armor impact — it is suspension work. Without this, every bump is a crash.
  - The front/rear split is the bumper mid-point, not the CG. On a pickup the CG sits well forward,
    and a CG-relative split would put the boundary inside the cab.
- **`damage.js`** — `feedContact(region, impulseNs, mass, dt)`, the new entry point the game loop
  calls. `applyImpact()` is now what an impact goes through once one has been *recognised*.

**`feedContact` is the load-bearing part and the least obvious.** A contact is not an impact. The
engine reports a manifold on every step a body is touching anything, at 250 Hz. Without gating, a
parked truck is "hit" by its own weight 250 times a second and destroys its own front bumper in
about 18 seconds of sitting still. Two guards, both pinned by the gate:

- a floor at `impactMinMph: 2` — resting reads 0.09 mph equivalent, so the margin is wide;
- **peak-hold**: the burst is tracked, and banked ONCE when contact drops below the floor (or after
  `impactHoldMax: 0.25 s`, which turns a sustained scrape into repeated hits rather than one that
  never ends). Peak, not sum — the model prices how hard the hit was, not how long the truck leant
  on what it had already hit. The region travels with the peak.

`main.js` wires it right after `damageModel.step()` and logs one line per landed impact. That log is
deliberate — until the slice-3 GUI exists it is the only way to tell from the driver's seat that a
hit registered — but it is a `console.log` in `src/`, so it is the owner's call whether it stays.

### Per-wheel runout + wheel wear (slice 2 items 2 and 3)

- `damage.js` publishes `params._wheelRunout[i]`, **linear in that wheel's condition** to the
  ratified **0.04 m peak-to-peak** at zero, and ADDING to the `params.wheelRunout` slider so the
  slider still works standalone with damage off.
- `suspension.js` gained `wheelRunoutOf(corner, params)` — the one place that resolves slider vs
  damage — and `effectiveWheelRadius` goes through it. `physics.js` spins the wheel phase if ANY
  wheel is out of round.
- **Wheel damage source: strut ACCELERATION** above `wheelAccelFloor: 60 m/s²`. Same family as the
  damper signal, one derivative up — the damper is worn by how fast the strut moves, the wheel is
  bent by how hard that motion is arrested. Differenced inside `damage.js` from the already-published
  `strutCompVel`, so the seam did not widen. Impact damage through the armor was already wired via
  the `wheelFL..RR` region lists.

**Gates:** `test/damage-contact-wiring.mjs` and `test/damage-wheel-runout.mjs`, both registered in
`test/gates.mjs`, both green, both fast and pure-node.

### `46a6cc6` — the V-key damage readout

Slice 2 was not evaluable: condition, wear rates and a tenth-of-a-second impact are all invisible
from the driver's seat, and the debug panel showed one component at a time through a dropdown.
`src/damage-hud.js`, toggled with **V**, hidden by default, free while hidden, 10 Hz when visible.
Three panes — CONDITION (all 26 tracks, green→red, two columns, with wear rate in %/min beside
each), SIGNALS (the raw per-corner inputs against the floors they must clear, red when over), and
IMPACTS (the last six landed hits, replacing the console.log).

The wear RATE is the load-bearing half: condition says where you are, the rate says what the drive
you are doing right now is costing. It is measured by differencing conditions over a moving window
rather than asking the model, so it always describes what actually happened.

**This is the diagnostic readout, not the ratified GUI.** The top-down schematic replaces the
CONDITION pane in slice 3; SIGNALS and IMPACTS are development instruments and go with it.

---

## What the first drive already showed

Verified in-browser by driving off the road. **The wiring is real**: the truck took a 13.8 mph LEFT
impact then a scrape series, with armor pass-through climbing 10% → 39% as that side crushed. That
is the ratified armor rule visible in live play, which is what slice 2 existed to deliver.

Two things came out of it that are the owner's to judge:

- **A scrape banks a lot of small hits.** Five seconds against the roadside cost the left armor
  ~35%, as ten separate 2-3.5 mph impacts at the `impactHoldMax` cadence. Each one is individually
  correct; the question is whether the cadence makes scraping too expensive.
- **A rollover pushes the wheel and damper signals hard over their floors** — strut acceleration hit
  101 m/s² against a floor of 60, with wheel wear reading 40%/min and damper 24%/min. That is the
  open fidelity question showing up on the very first crash, and the SIGNALS pane is there to judge
  it. Whether those floors are right is exactly what the washboard drive has to settle.

---

## What is NOT done, and what to raise

**These carry over unchanged from the previous handoff and are still open:**

- Behavioural gates for the spring / damper / brake wear tracks. None written.
- The **damper fidelity question** is still unanswered, and the new wheel track now inherits it and
  makes it worse: differencing `strutCompVel` (a 4-substep explicit-Euler quantity) to get
  acceleration amplifies whatever noise is in it. Two floors — `damperVelFloor` and the new
  `wheelAccelFloor: 60` — are currently holding the noise back on faith. **The washboard drive is
  the test. If the signal is not honest, report it as a finding; do not substitute a proxy.**
- **`durWheel: 4.0e5` is chosen, not fitted**, exactly like the spring and damper rates. There is no
  conversion from game feel to a wheel-bending rate, so it awaits a drive. `test/calibrate-wear.mjs`
  fits `durTire` and `durBrake` only.
- **DESIGN.md still needs its amendment** — `.planning/story-mode/DESIGN.md` § "Damage, wear &
  repair" disagrees with the ratified SM-3 in three places. Still deliberately not done
  unilaterally. Precedent: `design-amendments-2026-08-17.md`.
- **No ticket exists for this work.**
- The two sanity numbers (320 h of hard driving leaves tires at 9%, brakes at 47%; the brake constant
  is fitted to the FRONT axle) are still worth the owner's eye.

**New, and needing the owner:**

- **Rim-sphere impacts were left to fall out of the geometry rather than special-cased.** The
  chassis is a QUAL-25 compound of four hulls plus four rim spheres, and a wheel strike classifies
  by the same point/normal rule as everything else — so a front wheel clipped head-on reads as
  `front`, and one scraped along a curb reads as its own side. That is the sensible answer, but it
  IS the judgement call the previous handoff flagged, and it was made by not making it. Worth a look
  during the drive.
- **`impactMinMph: 2` and `impactHoldMax: 0.25` are chosen, not ratified.** They are the numbers
  that decide what counts as a crash at all, so they deserve a drive before they are trusted.

## Slice 3 — unchanged from the previous handoff

Thermal / FEAT-51 · headlight flicker on g-force · consuming `_toeOffsetDeg` / `_camberOffsetDeg`
on top of the now-real static geometry · the damage GUI (**ask the owner for the reference image**)
· death, both fail states (`DamageModel.fatalImpact` is set and still has no consumer).

**Before any of it: the owner drives slice 2.** That was ruling 4 and it has not changed.

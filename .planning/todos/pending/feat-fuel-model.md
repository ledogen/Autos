---
id: FEAT-50
type: feature
status: open
opened: 2026-07-30
severity: minor
ratified: 2026-08-01 — "there should 100% be fuel in the game and gas stations" (owner)
relates_to: >
  FEAT-49 (gauge cluster — the needle this feeds, shipped), FEAT-23 (drivetrain — rpm/load source),
  DESIGN.md "Fuel and gas stations" [RATIFIED 2026-08-01] (the design of record),
  items.md §1 (fuel + jerry can rows), FEAT-21 (POI variety — gas stations are a POI type),
  FEAT-52 (off-network generator — POI siting), SM-INV-1 (running dry is NOT a new fail state),
  SM-INV-5 (wear is time+intensity; fuel is the distance axis it deliberately omits)
---

# FEAT-50: Fuel consumption model

## Request

A real fuel model so the cluster's fuel gauge (FEAT-49) reads an honest level. The gauge side is
already wired — `GaugeCluster.setFuelLevel(frac 0..1)` rotates the needle; this ticket owns the
tank state and burn rate.

## Scope sketch

- Tank state on the vehicle (gallons; 2002 Ranger ≈ 16.5 gal — pick the sim truck's real spec).
- Burn rate driven by the drivetrain: a function of engine RPM and throttle/load (idle burn when
  stopped, rising with power output). Simple two-term model is fine; it must feel plausible, not
  be a BSFC map.
- Feed `setFuelLevel(tank / capacity)` from the main loop.
- Story-mode hooks are **no longer open questions** — ratified 2026-08-01, see DESIGN.md "Fuel and
  gas stations". The rulings this ticket must respect:
  - **Fuel is purchasable at gas stations**, which are a **POI type** — cheap, common and quick,
    against the town service station's expensive-rare-slow. Siting rides FEAT-21/FEAT-52.
  - **Running dry is NOT a new fail state.** It is the existing **breakdown predicament** (SM-INV-1):
    immobilised, get fuel to the truck (jerry can) or pay for recovery (tow); the run ends only under
    the rule that already exists — can't continue *and* can't afford recovery. **Do not implement
    running dry as a direct kill.**
  - **Fuel price is a natural carrier for Q9A cost escalation** (price per gallon rising with run
    age). Don't build the escalation here; just don't hard-code a constant price that fights it.
  - Free roam: a debug refill (or no-consequence floor) is fine, and the assists/debug surface owns it.

## Why this earns its place (recorded so it isn't re-litigated)

`items.md` carried a standing **"Fuel? Not in the design — NOT DESIGNED"** row until 2026-08-01. That
row is struck, and the reason fuel fits is worth keeping:

> **SM-INV-5 keeps wear off the distance axis on purpose** — wear is time and intensity, never
> kilometres. That is right for wear, but it left a driving game with no cost for *going far*.
> **Fuel is that missing axis.** Wear prices how hard and how long; fuel prices how far.

Two free consequences: burn as `f(rpm, load)` means a par-beating drive costs fuel *and* wear (which
sharpens the two-driving-modes split), and the fuel needle is the **one perfectly legible gauge** —
the opposite of the air filter, which does nothing until it does. Fuel teaches the player to read the
cluster before the subtle tracks start mattering.

## Acceptance

- Needle falls over time in proportion to driving intensity; idling burns visibly slower than
  full-throttle climbs.
- Deterministic given the same driving inputs (no RNG in the burn).
- **Running dry immobilises, never kills.** The truck stops; the player is in the tow-or-fix
  predicament. No direct run-end path exists in this ticket (SM-INV-1).
- Burn responds to load, not just rpm — a loaded climb costs visibly more than the same rpm on the
  flat (this is what makes freight's fuel bill a real thing later).
- Refuelling exists at at least a placeholder station and fills the tank for money.
- Price is read from a parameter, not hard-coded, so Q9A escalation can drive it later.
- Free roam unaffected by default (debug refill / no-consequence floor).
- Tunables (capacity, burn coefficients, price) exposed as USER-OWNED sliders; HUD/log audited.

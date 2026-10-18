---
id: FEAT-50
type: feature
status: done
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

## Resolution (2026-10-17, branch `feature/gas-pump-poi`)

**Shipped**, with the owner's 2026-10-16 rulings folded into DESIGN.md "Fuel and gas stations".
- **The burn:**
  - `data/engines.js` holds the engine registry (the Vulcan 3.0's torque curve + fuel-model inputs).
  - `src/fuel.js` builds the rpm × pedal table by the Willans line and drains the tank each step,
    × `fuelBurnScale` 7.
  - Landed on the real-data bands: idle 0.33 gal/h, best BSFC 282 g/kWh at 1750 rpm and 85 % pedal,
    27 / 25 / 21 mpg steady at 55 / 60 / 70.
  - An empty tank kills the engine, and it cannot catch.
  - Free roam floors at 5 % and never runs dry.
- **Places:** a `gasPump` POI (ASSET-14, ×4, coverage-sited). Pump zones on both sides. No offers,
  never a destination. `gasStation` ×1 stays the store, now FEAT-123.
- **The pump visit** (`src/fuel-stop.js`): handbrake opens it, hold F pumps, handbrake down pays.
  1.65 gal/s, so 10 s for a full tank. It has rolling drum counters and synthesized sounds
  (`src/pump-audio.js`, FEAT-120 rows).
- **Running dry:** a Recovery chip shows once parked. The tow costs (flat + per-km) × dayTier and
  clock hours. Can't pay → "you broke down" → main menu.
- **Gates:** `fuel-map`, `fuel-stop`, and `story-poi` coverage for n > 2. `offer-board` checks that no
  offer wishes for a pump.
- **Not done here:**
  - The low-fuel sputter: spec'd in FEAT-120, built later.
  - A pedal-aware shift schedule: FEAT-23's box upshifts at a fixed 5400 rpm, so a light foot saves
    on the pedal axis only. Listed as owed in DESIGN.md.
  - The emergency-gas grant: still stubbed.

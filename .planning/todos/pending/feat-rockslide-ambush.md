---
id: FEAT-26
type: feature
status: open
opened: 2026-07-15
severity: minor
source: user-idea
relates_to: FEAT-09 (generic contact pipeline → dynamic debris — the physics substrate this needs), FEAT-06 (prop palette — boulder/med-stone meshes to reuse)
depends_on: FEAT-09 Phase 3 (dynamic rigid-body debris + two-way coupling)
---

# FEAT-26: Random rockslide ambushes — timed tumbling rocks that try to nail the player

## Request (user)

Random rockslide events that attempt to hit the player as they drive past. Each event spawns a
batch of rocks on a higher slope above the road that tumble down toward the road, **timed to
intercept** the player's line as they drive by:

- **1–3 medium rocks** + **5–10 small rocks** per event.
- Rocks originate higher up the slope and roll/tumble down under gravity.
- Spawn/release timing is chosen to try to arrive at the road as the player crosses that stretch —
  a near-miss-or-hit ambush, not a static hazard.

## ⚠ Story-mode consumer added 2026-08-02: this is THE HIGHWAY'S ANGER

`spirits-and-pacts.md` #05 (rebuilt 2026-08-02) ratifies that the Highway's boon has two halves —
**camber** (the engineering) and **hazard suppression** (the upkeep). Together they make his boon
*maintenance*, which is exactly and completely what a road authority does for a driver.

**The mechanism is this ticket with its event rate keyed to favour. Nothing else changes.**

- **Disfavour raises the per-distance event probability; favour lowers it.** That is the entire hook.
  It reads the day's favour; it never advances it.
- **Rocks do not persist** [owner, 2026-08-02] — *"a couple of medium rocks, not impassable… we could
  clear them and just have it be that the chance of a rockslide occurring at any random time is higher
  as disfavour with the highway grows."* So this stays **rigid-body debris (FEAT-09), never carves**,
  and the Highway's hazards cost **nothing** against FEAT-52's pass-2 carve budget. The two spirits'
  hazard systems are mechanically unrelated, deliberately.
- **⚠ HE MUST NEVER BLOCK HIMSELF.** *A road wants traffic* is the stated basis of his entire boon, so
  neglect makes the drive **worse, never impossible** — a couple of medium rocks to pick a line
  around, not a wall. Same shape as the ratified "flat is the floor, not off-camber."

  **This also kills a death spiral:** if a slide could block the road, the player would be forced
  around it → that reads as an intentional non-shortcut skip → more disfavour → more slides. It cannot
  happen if he never blocks. **Do not soften this rule for drama.**
- **Never materialise an event inside the player's view.** Spawn ahead beyond some distance, or on a
  slope above a segment not yet in frame.
- The **Trigger model** open question below is answered for this consumer: **flag-gated live-reactive**,
  same precedent as doze/ambush timing, gates pin a default `runState`.

**FEAT-27 (static rockslide)** stays available for authored one-offs but is **not** the favour
mechanism — a persistent pile needs world state the 2026-08-02 no-world-memory ruling excludes.

## Why this links to FEAT-09

This is a **gameplay layer on top of FEAT-09 Phase 3** (dynamic debris). The rocks are exactly the
"loose object pushed/rolls when driven over, two-way coupling, rests stably, doesn't destabilize
vehicle feel" rigid bodies FEAT-09 defines — plus:
- a **spawner/director** that picks a slope + release time (the ambush logic), and
- **rock-vs-vehicle** contact carrying real momentum into the truck (impulse strong enough to
  shove / potentially roll it — the honest-physics core value), not just wheel-bump normal force.

FEAT-09 is the substrate; FEAT-26 should NOT reimplement a rigid-body system. If FEAT-26 is picked
up first, that's a signal to build FEAT-09 Phase 3 as its foundation rather than a bespoke one-off.

## Open questions (scope in plan mode when picked up)

- **Trigger model.** Fully random along any qualifying slope, or seeded/deterministic like the rest
  of worldgen? Ambush timing that reacts to live player position is inherently non-deterministic —
  decide whether that breaks replay/gate determinism and, if so, gate it behind a runtime flag so
  headless gates stay deterministic (cf. FEAT-09 "Determinism" risk).
- **Slope selection.** Need a source slope above the road with enough height/steepness for a
  believable tumble. Reuse road-carve grade data / terrain sampling to find a qualifying uphill
  face adjacent to the current road stretch? Min grade + min vertical drop thresholds.
- **Release timing / aiming.** Estimate player arrival at the impact stretch from current speed +
  centerline arc distance, then back-solve release time from rock fall/roll time. How much "lead"
  and how much intentional inaccuracy (it should threaten, not guarantee a kill — mostly near-miss).
- **Rock physics fidelity.** Full FEAT-09 tumbling rigid bodies, or a cheaper scripted-fall-until-
  near-road → hand-off-to-dynamic approximation for the long descent? Bounded cost — an event is
  6–13 bodies; cap concurrent events.
- **Rock-vs-vehicle impact.** What can a hit actually do — nudge, spin, roll, damage (no damage
  model exists yet)? Medium rock momentum vs the Ranger's mass: tune so a direct medium hit is
  genuinely dangerous but a small rock is a thud.
- **Rock-vs-terrain during descent.** Do rocks collide/bounce off the slope on the way down
  (needs terrain contact source in the broad-phase) or free-fall then land? Bouncing reads far
  better but costs the rock↔terrain narrow-phase.
- **Cleanup / lifecycle.** Rocks that come to rest on/beside the road — despawn on stream-out,
  linger as static debris (become FEAT-09 Phase 2 static contacts), or fade? Avoid unbounded
  accumulation.
- **Telegraphing.** Any warning (dust, sound, small pebbles first) so it's a dodgeable event and
  not an unfair instakill? Design/feel call.

## Acceptance (when picked up)

- [ ] An event spawns 1–3 medium + 5–10 small rocks on a qualifying slope above the current road.
- [ ] Rocks tumble down under gravity and interact with the vehicle via the FEAT-09 dynamic-debris
      contact path (two-way coupling; a hit imparts real momentum to the truck).
- [ ] Release timing meaningfully attempts to intercept the player (hits/near-misses happen when
      driving through; a stationary/very-slow player is not perfectly tracked — it's an ambush of a
      passing car).
- [ ] Concurrent-event and per-event body counts are capped; rocks clean up on stream-out.
- [ ] Determinism story resolved: either seeded, or the live-tracking event is flag-gated so
      headless road/physics gates stay green and deterministic.
- [ ] Vehicle feel not destabilized when no event is active (rainy-day physics asserts green).

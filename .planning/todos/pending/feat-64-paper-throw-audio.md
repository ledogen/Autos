---
id: FEAT-64
type: feature
status: open
severity: minor
opened: 2026-08-17
source: owner — "we should add sound effects to the paper delivery mission. There should be a
        throwing whoosh sound effect and a sound effect of when the paper hits something."
relates: FEAT-61, FEAT-62, FEAT-36
---

# FEAT-64: Paper-throw audio — a whoosh on release, an impact on landing

## Request

> we should add sound effects to the paper delivery mission. There should be a throwing whoosh
> sound effect and a sound effect of when the paper hits something.

Right now the paper route is silent. The throw is the mission's one verb and it currently has no
audible confirmation at either end of the arc — you press the key, a roll appears, it lands. Both
moments already exist in code as discrete events; they just don't make a noise.

## The two events (they already exist — nothing new to detect)

| Sound | Fires at | Code seam |
|-------|----------|-----------|
| **Whoosh** — release | the instant the roll leaves the cab | `_throwRoll()` in `src/main.js` (~2500), right after `_flying.push(...)` |
| **Impact** — landing | when the replayed flight reaches `tEnd` | `_updateThrownRolls()` in `src/main.js`, the branch that seats the roll and shows the readout |

Both are one call each. Nothing about the ballistics, scoring, or `throw.js` changes — this is
strictly a sound layer hung off the existing events.

## Constraints

- **Procedural, not sampled.** The repo ships no audio files (`assets/` is models only) and all
  three existing voices — `engine-audio.js`, `tire-audio.js`, `wind-audio.js` — are synthesized
  WebAudio graphs. Adding a first `.wav`/`.ogg` would open a new asset pipeline (fetch path,
  `vite.config.js` copy plugin, licensing/credits) for two short sounds. Synthesize them.
- **Share the AudioContext.** Import `getAudioContext` from `engine-audio.js` like the other two
  modules do; keep an own master gain so the mix is tunable independently.
- **One-shots, not always-running generators.** Unlike the tyre/wind engines these are transient
  events, so nodes ARE created per throw — but they are short and rare (a throw is a keypress, not a
  frame). Disconnect on `onended` so nothing accumulates over a fifteen-house route.
- **No new per-frame work.** The landing test is already in the flight loop; do not add a second one.

## Sound design (starting point, tune by ear)

- **Whoosh**: filtered noise burst, ~150–250 ms, bandpass sweeping down (≈1.5 kHz → 400 Hz) with a
  fast attack and exponential decay. Level and brightness can scale with launch speed
  (`launchVelocity` magnitude) so a hard throw sounds harder than a lob — cheap, and it makes the
  throw-strength feel legible.
- **Impact**: short, dry, ~80–150 ms. A newsprint roll is a soft slap, not a crack — a low-passed
  noise click with a slight body resonance. Vary pitch/level slightly per throw so a route doesn't
  become a metronome.

**Surface variation is optional and explicitly a stretch.** `_resolveLanding()` already knows whether
the paper came down on the road ribbon, so a duller thud on grass vs a sharper slap on asphalt is
nearly free if it sounds better. Ship the single impact first.

## Scope note — the debug projectiles

`_throwRoll()` also launches barrels/rocks via `debrisSystem` (FEAT-36) when
`throwProjectile !== 'paper'`. Those are dynamic engine bodies with real collisions, and giving them
impact audio is a *different* ticket (it needs contact events off the physics adapter, not a
precomputed landing time). Reuse the whoosh on release if it's a one-liner; do not chase their
impacts here.

## Acceptance

- [ ] Pressing throw plays a whoosh at release, audible over engine + tyre noise at normal driving
      speed and not louder than either.
- [ ] The impact sound fires when the roll visually touches down — same frame as the readout, not
      early (at release) and not late (after it has come to rest).
- [ ] Both are procedural; no new asset files, no new fetch path in `vite.config.js`.
- [ ] Fifteen throws in a row leave no accumulating WebAudio nodes (spot-check node count / verify
      one-shots disconnect on `onended`).
- [ ] Levels are exposed in the debug menu alongside the other audio gains, so they can be tuned
      live and muted independently.
- [ ] Muting/pausing (the `pageActive` gate that already governs engine audio) silences these too —
      no whoosh from a backgrounded tab.

## Verification

Live, in-game: run a paper route and throw. This is a feel change — the headless gates have no ear
and no `AudioContext`, so do not add a gate for it. Confirm no console errors on first throw before
any other audio has started (the AudioContext resume path).

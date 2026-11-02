---
id: FEAT-163
type: feature
status: open
severity: minor
opened: 2026-11-02
source: owner, 2026-11-02, listening to FEAT-120's batch-2 synth takes: "tunnel reverb needs a different ticket. it
  should be a literal reverb effect on the actual audio track. it cant be a layered sound."
relates: FEAT-120 (split out of its "Tunnel reverb" section), the master bus (FEAT-120 camera-aware mix and FEAT-131
  P3's duck hook need the same one), BUG-81 (tunnel portals), src/engine-audio.js
---

# FEAT-163 — tunnel reverb is a real reverb on the game's mix

Inside a bore, everything the player hears gets the tunnel's echo: the engine, the tires, the impacts, the wind.
It is an effect applied to the actual mix, never an extra sound layered on top of it.

## Design

- **A master bus.** Today every audio module connects straight to `ctx.destination` (the speakers). Add one
  `getMasterBus()` export in `src/engine-audio.js` and point every module at it, so one effect can act on the
  whole mix. The camera-aware mix (FEAT-120) and FEAT-131 P3's duck hook use the same bus: build it once.
- **The reverb.** A `ConvolverNode` (the browser's built-in reverb: it applies a space's echo fingerprint, the
  impulse response, to whatever passes through it) sits on a send from the master bus. Its wet gain is 0 outside
  and crossfades up over ~0.3 s [DEFAULT] at the portals.
- **The impulse response is generated, not recorded.** FEAT-120's prototype has one: RT60 (the time for the echo
  to fall 60 dB) 1.5 s, darkening as it decays, plus the flutter echo between the walls every 53 ms for a 9 m
  bore. Source: `/Users/ledogen/CodeShit/CarGame-content/wip/audio-render/proto-b2.js` (git-invisible, that
  worktree only).
- **The trigger** is the camera (the listener) inside a bore span, read from the road system's bore spans, not the
  truck's position: in chase view the camera leaves the portal after the truck does.

## Acceptance

- [ ] Every audio module routes through the master bus; nothing connects to `ctx.destination` directly.
- [ ] Inside a bore, the engine, tires and impacts all carry the echo; outside, the dry mix is unchanged.
- [ ] No pop or click at the portals (the crossfade).
- [ ] An enable/volume control beside the audio sliders (FEAT-120's rule).
- [ ] Owner listens in a tunnel.

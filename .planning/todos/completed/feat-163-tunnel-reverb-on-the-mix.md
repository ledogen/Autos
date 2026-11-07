---
id: FEAT-163
type: feature
status: done
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
  bore. Source: `tools/audio-proto/proto-b2.js` (tracked since 46bf4649; it was the
  git-invisible wip/audio-render/).
- **The trigger** is the camera (the listener) inside a bore span, read from the road system's bore spans, not the
  truck's position: in chase view the camera leaves the portal after the truck does.

## Acceptance

- [x] Every audio module routes through the master bus; nothing connects to `ctx.destination` directly.
- [x] Inside a bore, the engine, tires and impacts all carry the echo; outside, the dry mix is unchanged.
- [x] No pop or click at the portals (the crossfade).
- [x] An enable/volume control beside the audio sliders (FEAT-120's rule).
- [x] Owner listens in a tunnel. (2026-11-07, feat120-listen: "tunnel reverb ... is good")

## Built — Spare, 2026-11-02 (feature/spare)

- **The master bus.** `engine-audio.js getMasterBus()` is the ONLY node on `ctx.destination`. World sounds (engine,
  tires, wind, gearbox, pump, contacts, ambience, bed-cargo hits) feed `getWorldBus()`. UI sounds (the rank bar's
  heartbeat and glass, the result card) feed the master directly.
- **The reverb.** A `ConvolverNode` sits on a send from the world bus, with the generated IR from the prototype
  (RT60 1.5 s, darkening as it decays, the 53 ms wall flutter). It crossfades in and out with a 0.1 s time
  constant (~0.3 s), and it comes BEFORE the cab lowpass, so in hood view the tunnel is heard through the glass.
  The send is connected only while the listener is in a bore and for 2.5 s after it leaves: a convolver costs CPU
  whether it is heard or not.
- **The trigger.** `main.js _listenerInBore()` tests the camera, not the truck, with the surface resolver's own
  ownership rule: on a bore span of the nearest run (`carveHint` → `tunnelSpanAt`) and below the tube's apex
  (gradeY + tunnelBoreRadius). It uses only the road system's public calls, so road.js is untouched.
- **The UI stays dry** — a tunnel does not echo the result card or the rank bar's heartbeat. If the owner wants them
  in the echo too, it is a one-line move: route UI to the world bus.
- **Controls:** Tunnel Reverb, Tunnel Reverb Level (wet 0.9 [DEFAULT]).
- **Offline check** (`wip/feat-120/demo.js demoTunnel`): an engine and four bump-stop clunks, into a bore at 2 s and
  out at 6 s. A clunk inside keeps a ~0.3 s tail at about −29 dB, where outside it drops straight back to the −34 dB
  engine floor. Neither portal crossing shows a step in the 100 ms envelope. Take for the owner:
  `CarGame/wip/audio/tunnel-reverb/in-game-reverb-2026-11-02.wav`. Owed: the owner's listen in a real tunnel.

## Resolution (2026-11-07)

The owner listened in game: "tunnel reverb and pump handle is good" (feat120-listen). That was the last open box, so
FEAT-163 is closed. The verdict is also recorded in FEAT-120's Tunnel reverb entry.

---
id: FEAT-120
type: feature
status: open
severity: minor
opened: 2026-10-15
source: owner, 2026-10-15 — sound-effects gap review. Owner's list (handbrake, impacts, material
  contacts, object collisions, rock slide, engine-sim bake) plus suggestions the owner kept. Cut by the
  owner: cab controls, chassis creak, parts breaking off, per-part hit sounds (only the body is hit
  today), damaged-engine sounds (no good source), road furniture. Wading water → wet ground for now.
relates: FEAT-23 (engine drone), FEAT-33 (ignition audio), FEAT-36 (wear model / contact readout),
  FEAT-64 (paper-throw audio), FEAT-87 (glass/heartbeat synthesis style), FEAT-88/96/97 (bed cargo),
  FEAT-26/27 (rockslides)
---

# FEAT-120: Sound-effects pass — every sound, by where it comes from

**This ticket is the sound tracker's data.** `npm run dash` → **Sounds** reads it live: each `##`
below is a source, each `###` is one sound, and the line under the heading is
`status: todo|wip|shipped|cut · group: … · play: …`. Keep that shape when editing. Takes (recordings,
library pulls, bakes) go in `wip/audio/<sound-slug>/` (git-invisible; drag-and-drop onto a card puts
them there) and are promoted to `assets/audio/<sound-slug>/` when the game uses them.

`play:` is either `<module>.js <export>` (a one-shot: the tab imports the real `src/` module and calls
it, after the module's `ensure*` export if it has one) or the name of a preview driver in
`tools/dashboard/app.html` (`engine-sweep`, `wind-sweep`, `crank`) for voices that need driving.

## How to source

**Variety is made at playback, not in the field.** Every one-shot plays with random pitch ±5–10%,
gain ±3 dB, and a different take than last time. 4–6 takes per sound is enough. Impacts are stored as
three layers (**transient** = the initial crack, **body** = the thud of the struck object, **tail** =
debris/rattle), and one random take of each is mixed per hit: 5 takes per layer gives 125 distinct
hits from 15 files.

**Recording kit.** A phone is fine for close one-shots; a handheld recorder (Zoom H1n, ~$100) is
cleaner and has less automatic gain control (the phone turning loud sounds down, which flattens
impacts). A **piezo contact mic** (~$15–20) clipped to metal records vibration *through* the panel,
not the air: huge, clean metal sounds with no background noise. Record close and dry (outdoors away
from walls, or in a closet full of clothes). 10–20 takes per sound, varied force, a second of
silence between takes.

**Editing.** Audacity (free): trim, high-pass at ~60 Hz to kill rumble, normalise, one file per take.

**Licences.** Sonniss GDC bundles (free yearly drops, royalty-free for games, no credit needed) are
the best single library source. Freesound.org filtered to **CC0** (public domain). CC-BY is fine but
each file needs a line in `assets/audio/CREDITS.md`. Avoid **NC** (non-commercial), including the BBC
Sound Effects archive. AI generators (ElevenLabs SFX, Stable Audio Open) are a fallback for the
impossible-to-stage ones — check each tool's terms.

**Suggested order.** (1) All the Synthesize items first — they need nothing from the owner.
(2) One contact-mic session on metal: it unlocks the whole impact system. (3) Pull the ambiences from
Sonniss. (4) The engine bake whenever there's a Windows afternoon.

**The impact seam.** `PhysicsEngine.maxContactImpulse()` (FEAT-36 wear model) already gives the
step's peak normal impulse and the body-local point, so loudness is free. **Open:** it does not say
*what* was hit. Material needs either the other shape's handle out of the adapter (handles only, no
engine types) or a lookup from contact point → terrain / road / prop class.

## Synthesize

### Engine drone
status: shipped · group: truck · play: engine-sweep
FEAT-23 oscillator stack in `src/engine-audio.js`. The preview sweeps 800 → 5000 rpm at full throttle,
then cuts the ignition. To be replaced or layered by the engine-sim bake below.

### Starter crank and catch
status: shipped · group: truck · play: crank
FEAT-33, `src/engine-audio.js`. Preview holds the starter ~1.4 s, then fires the catch.
- **2026-10-19 (`feature/starter-sounds`):** the crank RPM is now real dynamics (`drivetrain.js`
  `stepStart`: starter torque line, compression ripple, manifold-fed catch flare, cold fast idle), and
  the FEAT-33 chug beats at the live compression rate (rpm/60 × cylinders/2), so it lands on the
  tach's ripple. Solenoid click + pinion clunk on engage and a clack on release were added.
- **Tried and reverted by the owner, don't re-propose as-is:** an RPM-keyed gear-mesh whine (read as a
  slide whistle), a noise mesh band (fuzz), a motor growl, and a commutator-buzz synth spectrally
  fitted to a real 2000 Ranger cold start (matched to 0.2 dB per third-octave above 300 Hz, same
  143 Hz periodicity and 8 Hz pulse — still "sounds bad"). Synthesis has hit its ceiling here: the
  next step is a **recording** of a real starter (fuel-pump relay pulled, ~10 s cranks), played at
  `playbackRate = rpm / recordedRpm` over the engine-sim crank take. The offline render harness that
  measured the fits is `wip/audio-render/render.html` (git-invisible).

### Engine shutoff
status: shipped · group: truck
FEAT-120 (2026-10-19): the engine coasting down unfired after the key is cut — the engine-sim motoring
rows (crank/motor loads) tracking the falling rpm in `src/engine-audio.js` `updateBake`. The FEAT-33
synth key-off thump is deleted. No preview: it needs a live rpm to follow.

### Tyre slip (screech and dirt tear)
status: shipped · group: truck
`src/tire-audio.js` slip voices. No preview: the voice needs a full per-wheel vehicle state to drive it.

### Tyre rolling noise
status: shipped · group: truck
`src/tire-audio.js` blacktop and dirt rolling engines. No preview, same reason.

### Rim grind
status: shipped · group: truck
`src/tire-audio.js` grind voice (FEAT-94, owner 2026-10-27): once a flat tire is run down to 0 the rim
is on the road. Bandpassed noise, centre rising with road speed, pulsed once per wheel turn (a rim run
flat is out of round); duller and quieter on dirt. Reads `vehicleState.rimOnRoad` from the damage
step. No preview: it needs a live wheel to follow. A recorded steel-on-concrete take could replace it.

### Tyre blowout
status: shipped · group: truck · play: tire-audio.js playTireBlowout
SM-3 damage model puncture burst.

### Wind
status: shipped · group: world · play: wind-sweep
`src/wind-audio.js`, airspeed-driven. Preview sweeps 0 → 45 m/s and back.

### Heartbeat
status: shipped · group: ui · play: heartbeat-audio.js playHeartbeat
FEAT-87 rank-timer lub-dub on a synthesized kick.

### Glass break (rank tile)
status: shipped · group: ui · play: glass-audio.js playGlassBreak
FEAT-87 tempered side-window pop.

### Gear grind (missed shift)
status: shipped · group: truck · play: gearbox-audio.js playGearGrind
FEAT-126 shift forced with the clutch in: a clash, then bandpassed noise chopped at the tooth-passing
rate (engine rpm/60 × 8, sagging 20 %) over the pulse train itself. ~0.4 s.

### Rod knock (a dying engine)
status: shipped · group: truck · play: knock-sweep
FEAT-162 P3: below 20 % the engine knocks — a wavetable impulse train at crank rate (rpm/60) ringing a
1.8 kHz bandpass (Q 6), louder toward 0 % and with throttle. Preview: 10 % engine, full throttle, 800 →
4000 rpm. `src/knock-audio.js`.

### Engine seize bang
status: shipped · group: truck · play: knock-audio.js playSeizeBang
FEAT-162 P3: the running engine seizes at 0 % — a lowpassed noise hit (250 ms) over an 80 → 35 Hz thump,
then the existing shutoff silence.

### Paper throw whoosh and impact
status: todo · group: story
Tracked in FEAT-64. Whoosh = bandpassed noise with a fast pitch sweep; impact = short thump + paper
slap (noise burst, highpassed).

### Bump-stop clunk
status: shipped · group: contacts · play: contact-audio.js playBumpStop
A strut reaching full compression (`suspension.js` travel limit; the event is raised in `physics.js`).
Low sine thump (~90 → 50 Hz in 40 ms) + a short metallic click (bandpassed noise ~2 kHz, 10 ms).
Level ∝ closing speed at the stop.
- **Prototype 2026-10-31, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto.js`, rendered as a take in `wip/audio/bump-stop-clunk/`. Not in `src/` or wired yet; trigger: the per-corner peak bump-stop force damage.js already tracks (`_bumpPeak`), so physics.js needs no new event.
- **Owner's ear, 2026-11-02:** KEEP — "cheap but acceptable for now". Wire it.
- **In game 2026-11-02 (Spare):** `src/contact-audio.js` `playBumpStop`, on the fixed step: ONE clunk per bump-stop contact, played the step its force stops rising, sized by that peak (silent under 2 kN, full at 30 kN). Sliders: Contact Sounds, Bump / Landing Volume.

### Landing thud
status: shipped · group: contacts · play: contact-audio.js playLanding
After air. Reuse the heartbeat kick body (`heartbeat-audio.js`) pitched down, level ∝ vertical speed at
touchdown, plus a suspension-rattle tail. Fires once per landing, not per wheel.
- **Prototype 2026-10-31, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto.js`, rendered as a take in `wip/audio/landing-thud/`. Not in `src/` or wired yet; trigger: all four wheels back in contact after air, level from the vertical speed.
- **Owner's ear, 2026-11-02:** KEEP — "cheap but acceptable for now". Wire it.
- **In game 2026-11-02 (Spare):** `contact-audio.js` `playLanding`: the first wheel back down after ≥ 0.25 s with all four off, level from the vertical speed (silent under 1 m/s, full at 8 m/s).

### Underbody and bumper scrape
status: wip · group: contacts
Sustained while the hull is in sliding contact with ground. Noise through a resonant bandpass
(Q ~8, centre 800–2500 Hz rising with sliding speed) plus random gain flutter for grit. Rock/road:
brighter; dirt: lowpassed and quieter.
- **Prototype 2026-11-02, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto-b2.js`, rendered as a take in `wip/audio/underbody-and-bumper-scrape/`. Not in `src/` or wired yet. The take is the bumper on rock (bright ring, re-rolled every frame for grit) sliding up to 5 m/s and back, then the belly on dirt (muffled ring, the low drag leads). The ring is two bands, the panel's first mode and one at 2.3× it. Trigger: hull sliding contact (speed + force) out of the adapter; the material read is the impact seam's open question.
- **Owner's ear, 2026-11-02:** REDO — "wildly bad". Consider a contact-mic recording or a CC0 library take of steel dragging on rock/asphalt instead.
- **Not redone by synthesis (2026-11-02):** the owner's note points at a recording — a contact-mic take or a CC0 library take of steel dragging on rock / asphalt. Owed: that take (dropped on this card), then the voice plays it, speed and load driving rate and level.

### Gravel ping
status: wip · group: world
Stones flicking the wheel wells on dirt/gravel. Reuse the tinkle grains from `glass-audio.js`
(short high sine pings), lowered to 1.5–4 kHz, random rate ∝ wheel speed on loose surfaces.
- **Prototype 2026-11-02, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto-b2.js`, rendered as a take in `wip/audio/gravel-ping/`. Not in `src/` or wired yet. The take ramps the wheel speed 1 → 20 m/s and back down: 0.7 pings/s per m/s, each ping a 1.5–4 kHz sine with a sheet-metal partial at 2.4×.
- **Owner's ear, 2026-11-02:** REDO — "sounds more like a xylophone than gravel strikes". Pitched sine pings read as notes. Reference (ear and spectrum only, never shipped — copyright): https://www.youtube.com/watch?v=s0pqv_p1UvU. Gravel strikes are unpitched broadband ticks on sheet metal over a continuous tire crunch.
- **Redo prototype 2026-11-02 (Spare), `tools/audio-proto/proto-b3.js` (not wired):** unpitched — every strike is a 1–4 ms broadband click ringing ONE fixed, inharmonic wheel-well panel (1.15 / 2.73 / 4.38 / 6.9 kHz), so a stone changes loudness and brightness, never a note; under it a granular tread crunch. Built from the ticket's description: the reference download was refused (HTTP 403, and a retry was blocked as bot-check circumvention). Take: `wip/audio/gravel-ping/redo-2026-11-02.wav` — owner's ear owed; a clip of the reference dropped on this card would let the next pass match it.

### Reverse gear and diff whine
status: wip · group: truck
Sine at shaft speed × tooth count, so it's physically exact for free. Reverse (straight-cut): loud,
~25 teeth on the reverse idler. Diff: quiet, ring-gear teeth (~41) × driveshaft speed, mostly on
overrun (coasting off-throttle with the engine braking).
- **Prototype 2026-11-02, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto-b2.js`, rendered as a take in `wip/audio/reverse-gear-and-diff-whine/`. Not in `src/` or wired yet. Two takes. Reverse: ~17 mesh events per engine rev (countershaft ≈ 0.68 × input × 25 teeth), so 800 rpm ≈ 230 Hz and 2800 rpm ≈ 790 Hz; louder under throttle, with a once-per-countershaft-rev wobble. Manual box only: an automatic's reverse is a helical planetary and barely whines. Diff: the Ranger's 3.73 final drive is 41:11, so the mesh rate is 41 × AXLE speed (= 11 × driveshaft speed; the line above had it as 41 × driveshaft, which is 3.7× too high). 30 m/s ≈ 530 Hz; the take coasts 30 → 9 m/s on overrun, then back on the throttle, where it drops to a quarter.
- **Owner's ear, 2026-11-02:** REDO the reverse whine to the reference: https://www.youtube.com/watch?v=-bBiqmdEjbM at 1:50–1:53 (ear and spectrum only, never shipped). The diff whine was not judged separately.
- **Not redone yet (2026-11-02):** the redo is defined by the reference clip, and its download was refused (HTTP 403). Owed: the clip (1:50–1:53) dropped on this card, then the whine is matched to its spectrum.

### Brake squeal
status: shipped · group: truck · play: contact-audio.js playBrakeSqueal
Only at low speed (< 15 km/h) under moderate brake pressure, with a random chance per stop so it isn't
every time. Sine 2–4 kHz with slight vibrato, fast attack, fades as the truck stops.
- **Prototype 2026-10-31, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto.js`, rendered as a take in `wip/audio/brake-squeal/`. Not in `src/` or wired yet; trigger: a stop from under 15 km/h with moderate pedal, random chance per stop.
- **Owner's ear, 2026-11-02:** KEEP, but make it QUIET.
- **In game 2026-11-02 (Spare):** `contact-audio.js` `playBrakeSqueal`, QUIET (10 dB under the take, its own slider, Brake Squeal Volume): a 35 % roll per stop [DEFAULT] as the truck slows through 15 km/h on a 0.15–0.7 pedal; re-armed above 6 m/s. Take: `wip/audio/brake-squeal/in-game-quiet-2026-11-02.wav`.

### Wet ground
status: wip · group: world
Stands in for wading for now. Spatter layer on wet surfaces: noise bursts (lowpassed ~1.5 kHz) at a
rate ∝ wheel speed, plus a soft squelch on wheel load spikes.
- **Prototype 2026-11-02, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto-b2.js`, rendered as a take in `wip/audio/wet-ground/`. Not in `src/` or wired yet. The take ramps 0.5 → 12 m/s and back with four squelches. Spatter: 2.5 bursts/s per m/s, fusing at speed into a continuous spray hiss whose level goes as speed^1.5. Squelch: a noise band sliding 450 → 140 Hz over 0.16 s.

### Grass and brush swish
status: shipped · group: world
Off-road over vegetation. Bandpassed noise (~3 kHz, broad) with slow random gain swells, level ∝ speed.
Needs a flora-density read at the bumper.
- **Prototype 2026-11-02, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto-b2.js`, rendered as a take in `wip/audio/grass-and-brush-swish/`. Not in `src/` or wired yet. The take ramps 0 → 11 m/s and back. Blades: ~3 kHz broad band, brighter with speed. Stems on the bumper: a ~900 Hz band. Both swell at random every 0.25–0.75 s (clumps).
- **Owner's ear, 2026-11-02:** KEEP, but it "needs attack and release": each brush hit gets a sharp onset and a tail, instead of symmetric swells. Confirm the read on the next listen.
- **In game 2026-11-02 (Spare), with attack and release:** `src/ambient-audio.js`. Discrete brush hits (a ~10 ms attack, a 0.12–0.3 s tail) over a quiet bed, at 0.6 hits/s per m/s through full cover. The cover read is the terrain's own green share (`groundAt().green`, the rule that paints it), off the road only. Take: `wip/audio/grass-and-brush-swish/in-game-attack-release-2026-11-02.wav` — the owner's confirming listen is owed.

### Tunnel reverb
status: cut · group: world
A ConvolverNode (adds a space's echo to a signal) faded in on the master bus while in a bore. The
impulse response (the space's echo fingerprint) is generated, not recorded: ~1.5 s of stereo noise
under an exponential decay, a little brighter early. Crossfade over ~0.3 s at the portals.
- **Prototype 2026-11-02, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto-b2.js`, rendered as a take in `wip/audio/tunnel-reverb/`. Not in `src/` or wired yet. The take is the engine drone plus a bump-stop clunk: outside, into a bore at 2 s (with a throttle blip inside), out at 6 s. The generated echo: RT60 (time to fall 60 dB) 1.5 s, darkening as it decays, plus the tunnel's own flutter echo between the walls, every 53 ms (9 m bore). Wiring needs a master bus: every module connects straight to `ctx.destination` today, so it becomes a `getMasterBus()` export in engine-audio.js that they all connect to.
- **Owner's ear, 2026-11-02:** MOVED to its own ticket, FEAT-163: "it should be a literal reverb effect on the actual audio track. it can't be a layered sound."

### Night crickets
status: shipped · group: world
Pulsed sine 4–5 kHz chirps in groups of 3–5, several voices at slightly different rates; fade in at
dusk from the day clock.
- **Prototype 2026-11-02, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto-b2.js`, rendered as a take in `wip/audio/night-crickets/`. Not in `src/` or wired yet. The take is 4 voices fading in over 2 s. Carrier 4.2–5 kHz, chirps of 3–5 pulses at ~30 pulses/s, each voice at its own 1.6–2.6 chirps/s; one close voice, the rest quieter and darker. Always-running oscillators, gains scheduled a frame ahead: no nodes per chirp.
- **Owner's ear, 2026-11-02:** KEEP. Play ONLY under 5 mph, and fade in slowly (~10 s [DEFAULT]). Above 5 mph they fade out.
- **In game 2026-11-02 (Spare):** `ambient-audio.js`, on the sky's own night (`sky.js nightWeight`, the keyframes setTimeOfDay blends). Only under 5 mph: a 10 s swell in [DEFAULT] (linear, squared — an exponential sounded full in ~4 s), 1.5 s out. Take: `wip/audio/night-crickets/in-game-10s-fade-2026-11-02.wav`.

### Dialogue text blips
status: todo · group: story
One short square/triangle blip per few characters, pitch per speaker.

### Payout coin and grade stingers
status: shipped · group: story · play: result-audio.js playCoin
Coin: two quick high sine pings (~2.6 / 3.9 kHz) on payout and wallet changes. Stingers: short
musical hits on the D / par / S card reveal, rising in pitch and length with the grade.
- **Prototype 2026-10-31, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto.js`, rendered as a take in `wip/audio/payout-coin-and-grade-stingers/`. Not in `src/` or wired yet; trigger: the coin on payout and wallet changes, the stinger on main.js `_revealResult`; stingers are five figures, D one low note up to S a run into a held chord.
- **Owner's ear, 2026-11-02:** KEEP ("i like coin and stingers"). FEAT-131 P1 builds result-audio.js FROM this take.
- **In game 2026-11-02 (Spare) — FEAT-131 phase 1, coin + stinger only:** `src/result-audio.js`. A coin as each paid dollar row lands; the grade's stinger a beat after the last row (heard, never printed). UI path, straight out — not the world bus. P1's tick train, clack and thud: built 2026-11-05, their own entries below.

### Result tick train
status: wip · group: story · play: result-audio.js playTickTrain
FEAT-131 P1, `src/result-audio.js`. The speed tip counting up on the result card: a counter wheel's tick
(6 ms of noise bandpassed at ~3.2 kHz) at ~12 a second for the count-up's 0.7 s, loud to soft as the
ease-out settles.
- **In game 2026-11-05 (Spare), synthesized, not owner-heard:** starts as the tip row lands, under its coin.

### Deed tally clack
status: wip · group: story · play: result-audio.js playClack
FEAT-131 P1, `src/result-audio.js`. The deed tally flipping old → new: a wood block — sines at ~980 Hz
(60 ms) and ~2.65 kHz (30 ms) on a 4 ms click. Silent when the tally does not move ("no deed").
- **In game 2026-11-05 (Spare), synthesized, not owner-heard.**

### Rank timer music bed
status: wip · group: story · play: rank-bed
FEAT-131 P3, `src/rank-music.js` — the game's only music. Starts with the rank bar: a minor triad of
detuned saws (A2) through a lowpass that opens 220 → 2400 Hz on the bar's intensity²; an arpeggio of
the triad an octave up, four notes per heartbeat, stepping on the heartbeat oscillator's own phase. A
line passing lifts it a semitone; the bonus lost drops it (filter shut, −5 semitones over 0.4 s, then
back); the C/D line thins it to the heartbeat alone; the job's end lifts the third to major and fades
it into the result card's stinger.
- **In game 2026-11-05 (Spare), synthesized, not owner-heard.** ▶ plays an 8 s approach to a line, the line, then the resolve.

### Miss thud
status: wip · group: story · play: result-audio.js playThud
FEAT-131 P1, `src/result-audio.js`. A miss landing on the result card ("no deed", an item missed, a load
that never arrived — never a cost like stock bought): a dull knock, sine 110 → 50 Hz over 0.22 s, under
50 ms of noise lowpassed at 320 Hz.
- **In game 2026-11-05 (Spare), synthesized, not owner-heard.**

### Pump nozzle
status: shipped · group: story · play: pump-audio.js playNozzle
FEAT-50, `src/pump-audio.js`. The nozzle seating as the pump opens: sine thunk 170 → 55 Hz in 70 ms
under a short lowpassed noise scuff. Also the nozzle out when a visit settles with nothing pumped.
- **Owner's ear, 2026-11-02:** "bad but fine. i can load other sounds for it" — stays; the owner may drop a take on its dashboard card.

### Pump flow (motor hum + gas)
status: shipped · group: story
FEAT-50, `setPumpFlow(on)`. Held while F pumps: a 62 Hz sawtooth motor with a 5 Hz wobble, lowpassed
to a hum, a 62 Hz sine reinforcing its fundamental, under resonant bandpassed noise around 900 Hz for the gas going in
(2026-10-20: was 118 Hz / no sub / 1.4 kHz and louder; owner wanted more bass, less level). Built once, gain-ramped
so it spools up and down. Needs driving (on/off), so no one-shot preview.
- **Owner's ear, 2026-11-02:** good, stays.

### Pump gallon click
status: shipped · group: story · play: pump-audio.js playGallonClick
FEAT-50. One tick per whole gallon, the mechanical counter's detent: a 12 ms highpassed noise tick
over a tiny low knock. (Was a three-partial struck-bell ding until 2026-10-20 — owner: "the dinging
should be reduced to a click".)
- **Owner's ear, 2026-11-02:** good, stays.

### Pump auto-shutoff
status: shipped · group: story · play: pump-audio.js playShutoff
FEAT-50. Tank full or wallet reached: a hard double clack, two highpassed noise bursts 45 ms apart.
- **Owner's ear, 2026-11-02:** good, stays.

### Pump register (sale final)
status: wip · group: story · play: pump-audio.js playRegister
FEAT-50. Handbrake down: a mechanical ka-chunk (low thunk + two noise bursts) then a bright till ding.
**Redo (owner, 2026-10-26): it should be a cash-register cha-ching** — the drawer-bell ring (two
struck partials, ~2.4 and ~3.2 kHz, 0.4 s) with the drawer sliding open and hitting its stop
underneath, not the current single ding. Synthesize or library (CC0); keep the `playRegister` entry
point and the handbrake-down trigger.
- **Built 2026-10-31, waiting for the owner's ear:** the cha-ching is in `src/pump-audio.js` (three key-lever
  clacks; the bell at 2.4 + 3.2 kHz, each a detuned pair so it shimmers, 0.4 / 0.3 s; the drawer rolling
  open under it and hitting its stop at +0.24 s). Same entry point and trigger. Render:
  `wip/audio/pump-register-sale-final/synth-cha-ching.wav`.
- **Owner's ear, 2026-11-02:** REDO — the 10-31 build is not cha-ching enough: "aim for more of a cha-ching". Reference: https://www.youtube.com/watch?v=4kVTqUxJYBA (ear and spectrum only, never shipped). Do not land 6b67588d's register as is.
- **Redone 2026-11-02 (Spare) to the reference, read off its spectrum:** ~0.2 s of key/gear clatter (cha); a bell on the reference's inharmonic partials 2.1 / 4.8 / 7.4 / 7.75 / 10.9 kHz, the 2.1 kHz ringing ~1 s (ching); the drawer released, rolled and slammed, coins settling. Replaces 6b67588d's take. Take: `wip/audio/pump-register-sale-final/redo-2026-11-02.wav` — owner's ear owed.

### Low-fuel sputter
status: wip · group: truck · play: engine-audio.js playSputterPop
FEAT-50 follow-up, built 2026-10-17 — the mechanic (`src/fuel.js` stepSputter, a real torque dip read
by drivetrain.js) and the sound together: the drone drops out for the stumble's length (firing=false)
and `playSputterPop(depth)` marks each one. The spec it was built to: Starts when the tank holds about **2 real minutes** of fuel at the running-average burn
(src/fuel.js has the rate). Sputters average one every **10 s**, more often as the tank empties, and each
is a matching momentary **torque loss** in the drivetrain — the engine actually stumbles, the sound only
reports it. Sound: the engine drone cutting for a few firing events (gain dips on the oscillator stack in
engine-audio.js) with a low pop or two (short lowpassed noise bursts), timed to the torque dip.
- **Owner's ear, 2026-11-02:** REDO — "sounds like nothing to me". It should be a gaseous exhaust event: a pop, bang or misfire, ideally tied to engine speed (each pop on a firing event at the current rpm).
- **Redone 2026-11-02 (Spare):** the stumble now POPS in the exhaust 2–5 times on the firing grid at the live rpm (rpm/60 × cylinders/2), more and louder the deeper it goes, and the re-light is a bang; each pop a crack (lowpassed noise), a thump (130 → 55 Hz) and the pipe ringing (~250 Hz). Take: `wip/audio/low-fuel-sputter/redo-2026-11-02.wav` (deep, 2000 rpm) — owner's ear owed.

### Camera-aware mix
status: shipped · group: mix
Not a sound, a bus: in cab view, lowpass the outside world (~2 kHz) as if heard through glass; in
chase view the engine leads the mix instead of the tyres.
- **Prototype 2026-11-02, waiting for the owner's ear:** synthesized in `tools/audio-proto/proto-b2.js`, rendered as a take in `wip/audio/camera-aware-mix/`. Not in `src/` or wired yet. The take is the engine at 3000 rpm plus wind at 25 m/s: chase view, then hood view (camera.js `hood`: there is no separate cab view) from 2.5 to 5 s through a 2 kHz lowpass, then chase again. Needs the same master bus as the tunnel reverb.
- **Owner's ear, 2026-11-02:** KEEP ("has always sounded pretty good"). Wire it with the master bus.
- **In game 2026-11-02 (Spare):** the WORLD bus, `engine-audio.js getWorldBus()` — engine, tires, wind, gearbox, pump, contacts, ambience and bed-cargo hits all route through it; UI sounds (heartbeat, rank glass, result card) do not. `setCabView` lowpasses it to 2 kHz in hood view. FEAT-163's reverb goes on the same bus.

## Record

### Truck body impact (metal)
status: todo · group: contacts
The shared body layer for every hit. Contact mic taped inside a door panel or bumper (junkyard panel,
or your own truck). Hit it with: open palm, fist in a glove, a rubber mallet, a rock, a 2×4. 15 takes
each, light to hard. This one session unlocks the whole impact system.

### Material transients (rock, wood, dirt, post)
status: todo · group: contacts
The transient layer per material. Air mic, close. Rock: drop/strike rocks onto rock. Wood: 2×4 on a
log / stump. Dirt: rock or boot into packed earth. Metal post: steel fence post hit with a bar.
10 takes each. Prop-on-prop and debris knocks reuse these.

### Handbrake
status: todo · group: truck
Any car with a lever handbrake. Phone ~10 cm from the lever. 15 slow pulls (ratchet clicks), 15 fast,
15 releases (button + drop clack). Cut each into its own file.

### Damage rattles
status: todo · group: truck
Loose panels rattle louder with damage × road roughness. Contact mic on a loosely bolted panel (or a
sheet-metal offcut on a bolt), shake it at different intensities: 30 s of each. Loop it, gain-driven by
suspension activity.

### Flat tyre flap and panel bang
status: todo · group: truck
Driving on a flat, two stages that follow FEAT-94's damage (owner, 2026-10-27). While the flat tire
still has condition left: the carcass FLAPPING. Once it hits 0 (the tire has come apart): the loose
tread BANGING on that side's body panel, the moment the panel starts taking damage (under the
synthesized Rim grind above, which starts at the same moment). Both are one hit
per wheel turn, so the rate is keyed on that wheel's rpm (`wheelOmega`), and gain rises with speed.
Flap: slap a deflated inner tube / tyre on asphalt rhythmically. Bang: swing a strip of tread or
rubber flap against a sheet-metal panel (contact mic on the panel). One-shot takes, light to hard,
retriggered per wheel turn rather than a fixed loop. Follows on from `playTireBlowout`.

### Stream and pond splash
status: todo · group: world
Throw a rock or bucket of water into a puddle / bucket / stream, varied sizes. Close mic, keep it out
of the spray. 10 takes.

### Bed cargo slide and thump
status: todo · group: story
Loose haul cargo (FEAT-88). Slide boxes, firewood bundles, a toolbox across a truck bed or plywood
floor; drop them from 10–30 cm. Contact mic on the bed floor gets the boom.

### Strap creak
status: todo · group: story
Strapped freight (FEAT-96/97). A ratchet strap tensioned over a box, flexed by hand: creaks and
groans, plus the ratchet itself. 20 takes.

### Ratchet strap click
status: todo · group: story
Accepting a freight or fragile job (FEAT-96/97): the strap going on — a ratchet strap clicking tight,
6–10 clicks slowing to the last hard one. The owner records this one (2026-10-25). Plays once at
accept, from the bed (camera-aware mix).

### Ratchet strap release
status: todo · group: story
The same strap let off at the job's end — the pawl flipped, the strap whipping slack, the hook dropped
on the bed floor. The owner records it with the click. Plays once on the result card.

### Log drag
status: todo · group: story
The log-drag mission. Drag a log or heavy branch across dirt and gravel with a rope, steady and in
bursts. 30 s per surface, loopable.

### Tent zip
status: todo · group: story
Camp. Open and close a tent zip, slow and fast. 10 takes each.

### Axe (splitting yard)
status: todo · group: story
Split firewood: the strike, the split, the pieces falling. 20 takes; the yard ambience loop is built
from these at random intervals.

### Fuel can pour (glug)
status: todo · group: story
Owner, 2026-10-22: a "glug glug glug" for pouring the jerry can and the emergency gas into the tank
(items.md §1; both are a 10 min parked pour). Tip a can or a big bottle of water into a funnel: the
glug is air bubbling back up the spout. Slow and fast tilts, 10 takes, plus a 10 s loopable run.

## Library

### Rock slide
status: todo · group: world
FEAT-26/27. Impossible to stage. Sonniss / CC0 Freesound "rockfall", "landslide", layered with the
material transients above. AI generator as a fallback.

### Day birds
status: todo · group: world
Day ambience and the camp morning. CC0 / Sonniss forest dawn chorus; pick dry recordings with no
traffic. Faded by the day clock.

### Wind in trees
status: todo · group: world
Ambient loop, level by wind and tree density. Sonniss forest wind beds.

### Fire crackle
status: todo · group: story
Campfire loop. Plenty of clean CC0 ones; 30 s+ so the loop period hides.

### Sawmill
status: todo · group: story
Yard ambience (R2): saw whine, log handling, a diesel loader. Positional, distance-faded.

### Quarry crusher
status: todo · group: story
Yard ambience (R3): crusher rumble, conveyor, rocks dropping. Positional, distance-faded.

## Engine bake

### Engine
status: wip · group: truck
AngeTheGreat's open-source engine simulator, recorded on the Windows desktop (its releases are
Windows-only). Job sheet: `.planning/handoffs/HANDOFF-2026-10-17-engine-sim-bake.md`. Branch
`feature/engine-audio` carries the takes between machines.
- **Model:** the game's 3.0 Vulcan V6 (`data/engines.js` `vulcan30`), not the 4.0 Cologne.
- **Dry, muffler-less.** engine-sim renders the manifolds + Y-pipe. The muffler and tailpipe are the
  game's, applied after the pitch-shift, so a muffler is a swappable part and its resonances stay
  fixed in Hz instead of sliding with the playback rate. engine-sim's own muffler impulse response
  (the recorded echo fingerprint it convolves the exhaust pulse with) is replaced by a unit impulse,
  which passes the signal through unchanged.
- **Grid:** 8 rpm points spaced geometrically (750 → 5500, ratio ≈ 1.33, so no loop is shifted more
  than ±15 %) × 3 loads (off / part ~30 % / full) + free idle = 25 loops of ≈ 2 s.
- **Loop length:** each loop must be a **whole number of engine cycles** (one 4-stroke cycle = 2 revs
  = 0.1 s at 1200 rpm). Any other length makes the firing rhythm stumble at the seam.
- **Files:** loops + `manifest.json` in `assets/audio/engine/` (FLAC; ships). Raw takes, the `.mr`
  script, the cutter and notes in `assets/audio/src/engine/` (committed, never ships).
- **Runtime:** play the nearest recordings, `playbackRate = rpm / rpmMeasured` covers the gaps,
  crossfade between neighbours by RPM and load, then the muffler. First sample assets: add
  `assets/audio/engine/` to the `vite.config.js` copy plugin (fetched by URL, not ES-imported, same as
  the `.glb` files).

### Engine muffler reference
status: wip · group: truck
Three takes through engine-sim's **stock** muffler impulse response: free idle, 2340 part, 4140 full.
The grid has dry loops at the same three points, so this card and the Engine card A/B straight away.
Target for tuning the in-game muffler: dry loop + our muffler should land near these. Lives in
`assets/audio/src/engine-muffler-reference/` (committed, never ships).

### Engine-sim crank and start takes
status: todo · group: truck
The starter layer above sits on the engine-sim piston/valve sound underneath it. Requested from the
Windows bake 2026-10-18: `vulcan30_crank_dry` (ignition OFF, S held ~5 s, settled crank rpm logged,
cut on whole 720° cycles so it loops), `vulcan30_start_1..3_dry` (crank → catch → 4 s of flare and
settle, uncut, to check the game's flare shape against), one `vulcan30_crank_stock` for the A/B.
Keep engine-sim's starter at 70 lb·ft / 500 rpm; the game's starter (150 N·m / 280 rpm after the
owner's cadence pass) cranks slower, which `playbackRate = rpm / recordedRpm` absorbs.

## Acceptance

- Every sound above is `shipped` or `cut` (with a reason).
- Each new voice has an enable/volume control beside the existing audio sliders.
- No per-frame node creation for sustained voices: always-running generators with modulated gains, as
  `tire-audio.js` does. One-shots may create nodes per event.
- Sample assets load and play on the GitHub Pages build, not just `npm run dev`.

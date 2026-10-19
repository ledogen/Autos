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

### Paper throw whoosh and impact
status: todo · group: story
Tracked in FEAT-64. Whoosh = bandpassed noise with a fast pitch sweep; impact = short thump + paper
slap (noise burst, highpassed).

### Bump-stop clunk
status: todo · group: contacts
A strut reaching full compression (`suspension.js` travel limit; the event is raised in `physics.js`).
Low sine thump (~90 → 50 Hz in 40 ms) + a short metallic click (bandpassed noise ~2 kHz, 10 ms).
Level ∝ closing speed at the stop.

### Landing thud
status: todo · group: contacts
After air. Reuse the heartbeat kick body (`heartbeat-audio.js`) pitched down, level ∝ vertical speed at
touchdown, plus a suspension-rattle tail. Fires once per landing, not per wheel.

### Underbody and bumper scrape
status: todo · group: contacts
Sustained while the hull is in sliding contact with ground. Noise through a resonant bandpass
(Q ~8, centre 800–2500 Hz rising with sliding speed) plus random gain flutter for grit. Rock/road:
brighter; dirt: lowpassed and quieter.

### Gravel ping
status: todo · group: world
Stones flicking the wheel wells on dirt/gravel. Reuse the tinkle grains from `glass-audio.js`
(short high sine pings), lowered to 1.5–4 kHz, random rate ∝ wheel speed on loose surfaces.

### Reverse gear and diff whine
status: todo · group: truck
Sine at shaft speed × tooth count, so it's physically exact for free. Reverse (straight-cut): loud,
~25 teeth on the reverse idler. Diff: quiet, ring-gear teeth (~41) × driveshaft speed, mostly on
overrun (coasting off-throttle with the engine braking).

### Brake squeal
status: todo · group: truck
Only at low speed (< 15 km/h) under moderate brake pressure, with a random chance per stop so it isn't
every time. Sine 2–4 kHz with slight vibrato, fast attack, fades as the truck stops.

### Wet ground
status: todo · group: world
Stands in for wading for now. Spatter layer on wet surfaces: noise bursts (lowpassed ~1.5 kHz) at a
rate ∝ wheel speed, plus a soft squelch on wheel load spikes.

### Grass and brush swish
status: todo · group: world
Off-road over vegetation. Bandpassed noise (~3 kHz, broad) with slow random gain swells, level ∝ speed.
Needs a flora-density read at the bumper.

### Tunnel reverb
status: todo · group: world
A ConvolverNode (adds a space's echo to a signal) faded in on the master bus while in a bore. The
impulse response (the space's echo fingerprint) is generated, not recorded: ~1.5 s of stereo noise
under an exponential decay, a little brighter early. Crossfade over ~0.3 s at the portals.

### Night crickets
status: todo · group: world
Pulsed sine 4–5 kHz chirps in groups of 3–5, several voices at slightly different rates; fade in at
dusk from the day clock.

### Dialogue text blips
status: todo · group: story
One short square/triangle blip per few characters, pitch per speaker.

### Payout coin and grade stingers
status: todo · group: story
Coin: two quick high sine pings (~2.6 / 3.9 kHz) on payout and wallet changes. Stingers: short
musical hits on the D / par / S card reveal, rising in pitch and length with the grade.

### Pump nozzle
status: shipped · group: story · play: pump-audio.js playNozzle
FEAT-50, `src/pump-audio.js`. The nozzle seating as the pump opens: sine thunk 170 → 55 Hz in 70 ms
under a short lowpassed noise scuff. Also the nozzle out when a visit settles with nothing pumped.

### Pump flow (motor hum + gas)
status: shipped · group: story
FEAT-50, `setPumpFlow(on)`. Held while F pumps: a 118 Hz sawtooth motor with a 5 Hz wobble, lowpassed
to a hum, under resonant bandpassed noise around 1.4 kHz for the gas going in. Built once, gain-ramped
so it spools up and down. Needs driving (on/off), so no one-shot preview.

### Pump gallon bell
status: shipped · group: story · play: pump-audio.js playGallonBell
FEAT-50. One ding per whole gallon, like the mechanical pumps' bell: three inharmonic partials
(1 : 2.76 : 5.40) on a 0.7 s decay.

### Pump auto-shutoff
status: shipped · group: story · play: pump-audio.js playShutoff
FEAT-50. Tank full or wallet reached: a hard double clack, two highpassed noise bursts 45 ms apart.

### Pump register (sale final)
status: shipped · group: story · play: pump-audio.js playRegister
FEAT-50. Handbrake down: a mechanical ka-chunk (low thunk + two noise bursts) then a bright till ding.

### Low-fuel sputter
status: shipped · group: truck · play: engine-audio.js playSputterPop
FEAT-50 follow-up, built 2026-10-17 — the mechanic (`src/fuel.js` stepSputter, a real torque dip read
by drivetrain.js) and the sound together: the drone drops out for the stumble's length (firing=false)
and `playSputterPop(depth)` marks each one. The spec it was built to: Starts when the tank holds about **2 real minutes** of fuel at the running-average burn
(src/fuel.js has the rate). Sputters average one every **10 s**, more often as the tank empties, and each
is a matching momentary **torque loss** in the drivetrain — the engine actually stumbles, the sound only
reports it. Sound: the engine drone cutting for a few firing events (gain dips on the oscillator stack in
engine-audio.js) with a low pop or two (short lowpassed noise bursts), timed to the torque dip.

### Camera-aware mix
status: todo · group: mix
Not a sound, a bus: in cab view, lowpass the outside world (~2 kHz) as if heard through glass; in
chase view the engine leads the mix instead of the tyres.

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

### Flat tyre flap and rim grind
status: todo · group: truck
Flap: slap a deflated inner tube / tyre on asphalt rhythmically. Grind: drag a steel rim or hubcap
edge on concrete (contact mic on the rim). Rate ∝ wheel speed. Follows on from `playTireBlowout`.

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

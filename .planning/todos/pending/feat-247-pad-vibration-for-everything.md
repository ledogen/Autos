---
id: FEAT-247
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "I just noticed vibration working for the first time Specifically it's working on 2.4 gigahertz 8-bit doh wireless 2c controller on the 2.4 gigahertz mode on Windows and I felt it on ABS triggering with the ABS setting on. Turned ABS off and it doesn't really vibrate for anything so I don't typically notice it. We should definitely add vibrations for everything. Make a new card to address vibration. Remind me how to reproduce it and then we can begin testing for feel."
relates: BUG-92, FEAT-136, src/gamepad.js
---
lane: unplaced

# FEAT-247: Controller vibration for everything, not only ABS

## Next steps
Owner drives it with the owed card `feat247-vibration-feel` and tunes the gains in `RUMBLE_GAINS` (src/pad-rumble.js). Landing: `land/rumble-runlog`.

## Summary
Rumble works on the owner's 8BitDo 2C (2.4 GHz dongle, Windows) but only ABS triggers it. Add vibration for the rest of the truck's events, then tune by feel with the owner.

## Description
Known working setup: 8BitDo Ultimate 2C, 2.4 GHz mode, Windows, Chrome, ABS setting on, brake hard. BUG-92 (rumble silent) stays open for the setups where nothing is felt.

## Tracker
- [x] Inventory of rumble sources today
- [x] New sources built, each with its own strength
- [x] One master strength setting
- [x] Owed card says how to reproduce each
- [ ] Owner has tuned the feel

## Log
- 2026-11-17 lane a: built on land/rumble-runlog: src/pad-rumble.js (one mixer, per-source gains, master on the settings page), hooks in main.js/vehicle.js/contact-audio.js; gate pad-rumble. Cargo strikes: no signal. Unverified: any real controller.
- 2026-11-17: owner (inbox 20261118053713-tte5): on Windows, the 8002 server, the pad rumbles constantly on a plain road. Minted BUG-206.
- 2026-11-18 BUG-206 (454deaff): `rough` now reads loose ground (gravel, dirt) × speed, asphalt silent; new `jolt` = high-passed strut velocity ÷ speed (kerb, pothole, rock). A smooth cruise commands exactly zero.
- 2026-11-20 lane c, owner (owed card): "reduce vibration gain for driving in dirt. a persistent rumble is ok but you cant really feel the curb strike on reentering the road due to the continuous rumble on shoulder driving." Also: "a flat tire should pulse vibration in motion ... 'ka-thunk' ... tied to the period of the tire rotation ... fade in in amplitude from 5mph to 15 mph ... failed tire and failed wheel are perfect as is". Headless shoulder drive + re-entry (10/15/20 m/s on a flat shoulder, mark 2040 of the 2093184417 world): strike peak over shoulder rumble, weak motor, 1.72x / 1.02x / 1.92x before (jolt-only 0.16/0.06/0.04 on both motors); 14.4x / 5.8x / 5.4x after (strong 1.0 / 0.59 / 0.40). Change (01b61ad0): rough 0.40->0.15; jolt 0.40->1.00 with JOLT_SLOPE_FULL 0.3->0.10 (the sim's kerb reads slope 0.06..0.14, so a gain alone could not reach 3x; mix does not saturate); jolt peak held between 50 ms sends; flat = one pulse per wheel turn (phase of the flat wheel), fade 5..15 mph. Gate pad-rumble green with new asserts; pad-e2e ALL OK. OPEN: rumble-cruise (asphalt cruise must be silent) FAILS at 80 km/h: a held jolt 1.0/1.0 is sent at t=39.9 s at ~9 m/s; not yet traced (heavy run on hold). Not landed.

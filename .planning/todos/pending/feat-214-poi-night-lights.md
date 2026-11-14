---
id: FEAT-214
type: feature
status: open
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "add light sources to main POIs. mainly the shops and gas pumps since they're open 24hr should have point sources hidden in believeable places i.e. the auto shop has overhead lights. they should switch on after ~7pm. if residences have a good place to hide the light we can install them there too but they should switch off again around 11pm unless they offer a mission or you're delivering there."
relates: FEAT-180 (the lighting review, still open: the owner is choosing between two builds), BUG-164 (a POI draws only where terrain is built), src/sky.js, src/poi.js, data/prop-models.js
---
lane: Spare

# FEAT-214: Lights at POIs after dark — shops and pumps all night, residences until 11 pm

## Next steps
Waits on the FEAT-180 lighting pick, since both candidate builds change how night is lit. Then the Spare lane, starting with the cost measurement below.

## Summary
Places light up at night. Shops and gas pumps are open 24 hours, so their lights come on around 7 pm and stay on. A residence's light goes off around 11 pm unless it is offering a mission or the player is delivering there.

## Description
- **Where:** light sources hidden in believable places on the model: overhead lights at the auto shop, the pump canopy, a porch light. Each POI model needs a named mount point or a data entry for the position.
- **When:** on after about 19:00. Shops and pumps stay on. Residences off at about 23:00, except a residence with a live offer or the player's delivery target.
- **Residences only where the model has a good place to hide the light.**
- **Cost, to measure before building:** in Three.js every real point light adds work to every lit material's shader (the program the GPU runs per pixel), whether or not the light reaches that pixel. So the number of live lights must be small and fixed: a pool of a few lights assigned to the nearest lit POIs, with a glowing (emissive) fixture and a ground glow sprite for the rest. Measure the frame cost of 1, 2 and 4 pooled lights with the PERF-40 bench before choosing.

## Tracker
- [ ] Cost of 1 / 2 / 4 pooled point lights measured (GPU active cycles, main-thread work)
- [ ] Light positions for the auto shop, gas pump, gas station, general store, food vendor
- [ ] On at ~19:00; shops and pumps all night
- [ ] Residences: on at ~19:00, off at ~23:00 unless offering a mission or the delivery target
- [ ] Fixtures glow at any distance; real lights only on the nearest few

## Open questions
- Should the lights' on-time follow the sky (dusk) instead of a clock time?

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.

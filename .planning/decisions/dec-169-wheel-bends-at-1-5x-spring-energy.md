---
id: DEC-169
status: standing
decided: 2026-11-14
area: physics
governs: BUG-160, src/damage.js, wheelBumpEnergyMult, rimPinchRoadMult, rimInflatedMult, wheel damage, bump stop
supersedes:
---

# DEC-169: An inflated wheel takes some damage from 1.5x the impact energy that starts spring damage

**Ruling.** "tires feel good wheels do not seem to take damage from impacts unless the tire lets go. thoughts? i wouldnt mind some wheel damage triggering 50% above the amount of energy as it takes to damage the springs 24 and 4 are fine"

**Why.** With the BUG-160 rim-strike fix a wheel under air only bent past about an 8 m drop, so ordinary hard landings never touched it. A bump-stop event through an inflated tire now also prices the wheel, from the hit that stores 1.5x the stop energy of the spring's no-harm hit (front 15.7 kN, rear 7.6 kN), on the spring's curve.

**Replaces.** The 2026-11-11 reading "the wheel survives every landing the tire survives" (BUG-160 acceptance). The pinch pop (rimPinchRoadMult 24) and the rim-strike path stand.

**Source.** Owner, 2026-11-14, note on BUG-160. Main had rimInflatedMult 2, not 4; left at 2 pending the owner.

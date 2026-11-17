---
id: DEC-373
status: standing
decided: 2026-11-17
area: physics
governs: FEAT-204, data/parts.js, src/vehicle-model.js, src/parts.js, src/physics.js, light bar, headlight, roof rack, bull bar, mass
supersedes:
---

# DEC-373: The light bar burns on high beam only; the bolt-ons carry their real mass

**Ruling.** "Low beams should not turn on the light bar, only high beams should turn it on. Anyway, we can add part
masses to these since they are Explicitly modeled that shouldn't be that tricky."

**Why.** Not stated. A driving-lamp bar on the low beam blinds oncoming traffic; the owner's look at the wired mods.

**Replaces.** The light bar half of DEC-342 (draft): it burned with the headlights on low and high, and turned the low
beam's cutoff off. The masses (agent's figures from real parts, sources in data/parts.js): roof rack 16 → 13 kg, bull bar
22 → 16 kg, light bar 8 → 10 kg (DEC-342's were placeholders). A fitted bolt-on's mass now loads the chassis (params.fittedKg,
added at the CG like stowed kit), the tire load cap and the job load check.

**Source.** Owed card feat204-wire-look, 2026-11-17. Owner's words.

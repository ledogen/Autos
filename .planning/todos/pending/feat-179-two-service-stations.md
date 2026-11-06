---
id: FEAT-179
type: feature
status: open
severity: major
opened: 2026-11-06
source: owner, 2026-11-06 playtest (via the orchestrator) — "There should always be two service stations on the map, I think my current seed has one.3-8-6-7-7-3-7-0-5"
relates: FEAT-164 (camp-reach guarantee — the gate pattern), SM-3 (parts / service / shop), feedback_cold_generation_only
---
lane: Spare

# FEAT-179: the story map always has two service stations

The owner's seed 3867737305 seems to have one service station. Every story world should have at least two.

## Plan (orchestrator, 2026-11-06)

1. **Measure:** how many service stations random seeds get inside the alpha's 2500 m story circle.
2. **Guarantee two:** at generation time (cold, pure: nothing saved).
3. **Gate it:** follow FEAT-164's `camp-reach` pattern.

## Acceptance

- [ ] The census: the count per random seed, and how often it is under two.
- [ ] Every story world has ≥ 2 service stations in the circle, seed 3867737305 included.
- [ ] A gate pins it on random seeds.

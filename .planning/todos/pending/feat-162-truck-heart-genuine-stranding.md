---
id: FEAT-162
type: feature
status: open
severity: major
opened: 2026-11-02
source: owner, 2026-11-02, answering item E of the Sid Meier review (.planning/story-mode/review-sid-meier-2026-11-02.md):
  "might be better to devise part failures that genuinely strand the vehicle so we can cue the ending off that +
  recovery cost. right now the vehicle is never truly stranded so it just falls on the player to click recovery >
  broke down vs give up > you gave up. just a thought: maybe a 'heart' for the car that gets damaged by driving on
  fully busted rims or suspension or engine or crashing without armor. that health bar actually kills you 'you broke
  down'"
relates: FEAT-146 (the run ends: broke / towel), src/damage.js, src/recovery.js, FEAT-94 (driving on a flat wrecks
  that corner), SM-INV-1 (death), SM-INV-10 (described, not scored), the tow-or-limp predicament (DESIGN.md)
---
lane: B — idea stage; plan first, owner rules

# FEAT-162: The truck's heart — failures that genuinely strand it

## What

Today the truck is never truly stranded. The "broke" ending only happens when the player opens
recovery and can't pay. Otherwise it's the player's choice between that and "give up". Nothing in the
machine itself ends the run.

The owner's idea: a **heart**, one terminal health for the truck. Abuse damages it:

- driving on fully busted rims, suspension or engine;
- crashing without armour.

When the heart gives out, the truck is stranded for real. If recovery is unaffordable, the run ends as
**"you broke down"**.

## Questions for the plan (Lane B proposes, owner rules)

- What feeds the heart, and at what rates? Is it physical (e.g. energy into already-destroyed parts) or bookkeeping?
- Is it shown? SM-INV-10 says described, not scored: a gauge, words ("the truck is dying"), or sound and smoke only?
- Can it be repaired, and at what price compared with the parts?
- How does it meet the existing endings: a stranded truck → recovery cost → broke card (with FEAT-160's reason line)?
- Make sure "give up" stays a choice, not the default way out (the review's point E: players quit before the recovery arrives).

## Acceptance

- [ ] Plan in this ticket; the owner rules.
- [ ] A truck driven to death strands for real, and the run-end card names why.

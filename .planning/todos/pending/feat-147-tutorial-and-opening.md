---
id: FEAT-147
type: feature
status: open
severity: major
opened: 2026-10-23
source: owner, 2026-10-22 — "need to finish tutorial and basic story"; 2026-10-23 — the basic story (the firing, the uncle, the expedition camp ending) is "good enough for alpha"
relates: opening.md (the firing, the uncle), FEAT-146 (the run end), FEAT-103 (the camp — the story's end), FEAT-67 (offer board), FEAT-104 (shop), FEAT-118 (camp pause), FEAT-50 (fuel), design-amendments-2026-10-23-release-cuts.md
---

# FEAT-147: Tutorial and the opening — fired, the uncle, the first day

**Alpha.** A new player today lands in story mode with no reason to drive and nothing telling them
how the loop works. The alpha's story is three beats, and this ticket builds the first two:

1. **The firing** (opening.md "The firing"): the run opens on the player losing the burger-joint
   job. Short, authored, then over — they can never work there again.
2. **The uncle** (opening.md "The uncle"): he hands over the first job. He is the tutorial's voice.
3. **The expedition camp** (FEAT-103) ends the run. Not this ticket.

## What the first day teaches

Taught by the uncle's jobs as they happen, not by a manual up front. Each item appears once, when
the player first needs it:

- [ ] reading the map and the offer board, and taking a job;
- [ ] driving it to the drop and reading the result card (par, rank, pay);
- [ ] fuel — the gauge and the pump;
- [ ] the shop and the service screen — what repairs cost;
- [ ] sleep — finding ground, making camp, and why the day is the budget;
- [ ] the goal — good deeds open the expedition camp, and the camp ends the run.

## Acceptance

- [ ] A new story run opens on the firing, then the uncle, without a menu detour.
- [ ] Every item above is shown exactly once, at its first use, and can be dismissed.
- [ ] A returning player can skip the whole opening (a run-setup toggle, default on for a first run).
- [ ] UI per UI-STYLE.md: the uncle speaks through Story cards (the existing dialogue channel).

## Open

- ~~How the firing is shown~~ **RULED (owner, 2026-10-31): a graphic-novel-style scene — background
  art with dialogue cards over it** (the Story card channel). Not a staged in-world scene.
- Whether the tutorial jobs are scripted or just the first real offers with prompts on top.

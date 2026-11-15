---
id: DEC-194
status: standing
decided: 2026-11-14
area: process
governs: lanes, owed cards, tools/dashboard, LANE-AGENT-BRIEF
supersedes: DEC-101
---
# DEC-194: No "prefer pile-neutral work" rule; owed cards are ordered by the work they open

**Ruling.** "We should probably get rid of that rule that says 'prefer work that adds no debt.' It all has to go through me at some point. I can do my best to triage things manually anyway, so let's delete that rule for now. I like that blockers are up top because they are truly more critical. It would be nice if the other tickets were classified in a similar way. So the order that I address them is the order that most quickly opens work."

**Why.** Every piece of work reaches the owner eventually, so holding work back to keep the pile short only idles the lanes. What helps is the order of the pile: the card whose answer opens the most work comes first.

**Replaces.** DEC-101. In practice: the size of the owed pile never decides what a lane builds. Every owed card carries `order` (1 = its answer opens the most work), and a card whose answer opens follow-on work (a held landing, a next round, a build waiting on a number) carries `blocks` naming that work, which puts it in the page's top group. A card that is only a look at work already on main carries no `blocks`. The orchestrator sets both when it files or re-ranks cards.

**Source.** Owner, in chat with the orchestrator, 2026-11-14. Owner's words; the "in practice" paragraph is the orchestrator's reading of them.

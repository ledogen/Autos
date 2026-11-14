---
id: INFRA-14
type: infra
status: closed
severity: minor
opened: 2026-11-12
source: owner, 2026-11-12 — the "ledorepo" brief (sculpting a personal Jira: tracker + lanes + deep-dive forms)
relates: INFRA-11, .planning/handoffs/HANDOFF-2026-10-25-orchestrator.md, .planning/handoffs/LANE-AGENT-BRIEF.md
---
lane: unplaced (tooling — orchestrator or a Spare agent; touches no game code)

# INFRA-14: ledorepo — nobody clears a session by hand

## Next steps
None. Closed 2026-11-14: the orchestrator applies the handoff text in `wip/infra-14/orchestrator-handoff-patch.md`
(branch infra/infra-14-context) when it lands this.

## Summary
The owner wants lane context managed the way "spawn a subagent for X" manages it: the worker lives, reports, and
is wiped, with results on disk. Since 2026-11-09 this is already the rule: lanes are the orchestrator's background
subagents, one task per agent, and a fresh agent is the clear. What is still manual: clearing the **orchestrator**
(it flags itself at ~300k tokens) and any **side session** the owner opens directly (the perf session has run for
a day). This ticket closes the remaining gap. Plan mode is not the tool: it clears context only once, at plan
approval, and cannot be triggered on a schedule.

## Tracker
- [x] The orchestrator keeps no state in its context that is not also on disk. After INFRA-11 its whole state is
      the tracker files + its handoff's "Current state" section, so a clear costs one word ("orchestrator").
- [x] Session auto-compact (already set at 400k) is the backstop; the handoff says so and the "ready for a clear"
      message is dropped unless a merge is mid-flight.
- [x] Side work (a perf investigation, a tooling job like this one) is started as an orchestrator subagent by
      default, so the owner has one terminal. A separate window is the exception, for work that needs a quiet
      machine or days of its own context.
- [x] The lane tracker shows each running agent's task and start time (it has the "now" line already), so
      closing the other terminals loses no visibility.

## Decisions
- 2026-11-12, owner: the only session still cleared by hand is **the orchestrator**. Lanes are solved (11-09).

## Log
- 2026-11-14: boxes 1–3 are handoff rules: the "ready for a clear at ~300k" drill is dropped (auto-compact at 400k is
  the backstop; a merge or smoke is written into § Current state before it starts), side work is spawned as a
  subagent with its own lane row and `.now` line. Box 4 was already built: the Lanes tab renders each `.now` line
  (`running: <task> · since <HH:MM> · <agent id>`, `tools/dashboard/app.html` ~l.1199); added an On-wake step that
  clears stale `running:` lines (four were stale under the 11-14 hold). No code changed.

## Files
`.planning/handoffs/HANDOFF-2026-10-25-orchestrator.md` · `.planning/handoffs/LANE-AGENT-BRIEF.md`

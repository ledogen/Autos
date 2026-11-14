---
id: DEC-095
status: standing
decided: 2026-11-09
area: process
governs: .planning/handoffs/LANE-AGENT-BRIEF.md, lanes
supersedes:
---

# DEC-095: Lanes are the orchestrator's subagents, one task per agent

**Ruling.** Every lane runs as a background subagent of the orchestrator, one task per agent, following LANE-AGENT-BRIEF.md; subagents run on opus; the owner is never asked to paste into or clear lanes.

**Why.** A fresh agent per task is the clear; nobody has to watch context.

**Replaces.** Owner-driven lane windows (before 2026-11-08/09).

**Source.** CLAUDE.md § Workflow (date from git 2026-11-08); memory feedback_lanes_are_subagents (owner, 2026-11-09). Owner's words.

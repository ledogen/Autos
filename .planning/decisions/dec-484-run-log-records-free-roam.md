---
id: DEC-484
status: standing
decided: 2026-11-24
area: process
governs: BUG-257, FEAT-242, src/run-log.js, run log, run logging, free roam
supersedes: 
---

# DEC-484: The run logger keeps recording free roam

**Ruling.** "Good, keep logging free roam". With the debug panel's *Run logging* switch on, a free-roam session is recorded as well as a story run. A free-roam log holds no story fields, and a change of world or mode closes the series and opens a new one (BUG-257, as built).

**Why.** The owner looked at BUG-257 as built and kept the behaviour. DEC-481 said a story run logs by default and was silent on free roam.

**Replaces.** Nothing standing. It fills the gap DEC-481 left open.

**Source.** Owner, owed card `bug257-runlog-look`, 2026-11-24. The option text is the orchestrator's wording, picked by the owner.

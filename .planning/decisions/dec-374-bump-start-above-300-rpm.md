---
id: DEC-374
status: standing
decided: 2026-11-17
area: physics
governs: FEAT-258, FEAT-33, src/ignition.js, data/ranger.js, starter, ignition, bump start
supersedes:
---

# DEC-374: Bump start — an engine already turning above 300 rpm starts on the key press

**Ruling.** "You should be able to bump start your car in neutral. The way we can handle this is if the engine speed is
already above 300 rpm when you press the starter it will just instantly start the engine. You don't have to hold it for
the minimum cranking time."

**Why.** Not stated beyond the request: a rolling truck can be started without the crank.

**Replaces.** Nothing. The catch time (FEAT-33) still applies below 300 rpm. The starter's own spin-down after a released
crank does not count as already turning (agent's reading: crank speed is 450 rpm, so otherwise a tap-release-tap would
start any engine at once and the worn-engine catch time would mean nothing).

**Source.** Inbox 20261117100618-vea0, 2026-11-17. Owner's words.

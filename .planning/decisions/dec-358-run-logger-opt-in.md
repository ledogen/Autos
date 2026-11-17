---
id: DEC-358
status: standing
decided: 2026-11-16
area: process
governs: FEAT-242, src/, debug menu, run log, diagnostics, CLAUDE.md conventions
supersedes: 
---

# DEC-358: An opt-in run logger lives in the game

**Ruling.** Owner, inbox, 2026-11-16: "I started reading the feat 69 Deep dive and I think you could one-shot a Pretty smart logger that would pull a lot
more data out of our runs I think we can add a debug menu option For run logging if enabled It'll start recording data
about a run including Where you go, what missions you do, how much wear the vehicle sees, specific events that trigger
wear And the associated damage What items you purchase when you eat, when you sleep Basically pull as much information
out of the game as possible Then it can auto download the JSON log Every day or after every mission I'll leave it up
to you how frequently That way I can enable logging and just play and not have my session interrupted by Forms or
having to press a key or manage a file Everything that's relevant will automatically be saved so then I can say Hey at
the end of this log I hit a rock And I don't think it should have popped my tire Let's adjust the threshold and you
can see exactly what event triggered the damage I think you can be as information dense as possible And if necessary I
can ask you to pull it back later since we've never had an issue with log file sizes. Something like 1 GB per run is
probably permissible Unless... Chrome struggles downloading the file or Logging adds significant performance overhead
or something like that"

**Why.** The owner wants to play uninterrupted and have every relevant event on file, so a call like "that rock should not have popped my tire" can be traced to the exact event and threshold.

**Replaces.** Nothing. It is an explicit exception to CLAUDE.md § "src/ is the product" (no diagnostic plumbing in the frame loop): the logger is a shipped, opt-in debug feature, off by default, and records from events rather than per-frame probes wherever it can.

**Source.** ledorepo `inbox/20261116232650-uv93.json`.

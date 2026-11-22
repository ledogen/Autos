---
id: DEC-481
status: standing
decided: 2026-11-21
area: process
governs: FEAT-242, FEAT-324, src/run-log.js, run log, tools/run-log-summary.mjs, BUG-199
supersedes: DEC-358
---

# DEC-481: The run log starts by itself with a story run and downloads when the run is saved and exited or won

**Ruling.** Owner, chat, 2026-11-21: "improve the logging tool add the things youre missing also it should start logging automaticcally and automatically download when you save and exit or win". Logging is ON by default and begins at the very start of a story run, tutorial included; the debug panel's toggle stays as the only off switch. The one file downloads at save-and-exit and at the run's end (win, and the other endings); no gate on a dev flag or host. DEC-392 (parts in IndexedDB, ONE file per download) stands.

**Why.** The owner's last log began 15 minutes in and missed the tutorial and day 1, because logging was opt-in. Asked whether the automatic download should be gated for the public build: "im the only one who plays this shit", so it is not gated.

**Replaces.** DEC-358's "opt-in, off by default" (its other rulings, the one in-`src/` diagnostic exception and event-based recording, carry on in this record). DEC-392's "downloads at the run's end" is widened, not replaced: it also downloads at save-and-exit.

**Source.** Owner in chat 2026-11-21; gating answer relayed by the coordinator the same day.

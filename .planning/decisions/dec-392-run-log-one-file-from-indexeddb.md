---
id: DEC-392
status: standing
decided: 2026-11-17
area: process
governs: BUG-199, FEAT-242, src/run-log.js, run log
supersedes: 
---

# DEC-392: The run log is kept in the browser and saved as one file

**Ruling.** Owner, 2026-11-17: "I actually had a much longer much more typical gameplay log But lost it because chrome freaked out about downloading multiple files". The run logger keeps its parts in IndexedDB, downloads ONE `.jsonl` at the run's end, and offers a "Save log now" button (and the stored parts of an unfinished run after a reload). DEC-358 otherwise stands: opt-in, off by default, the one diagnostic that ships in `src/`.

**Why.** Chrome blocks the second automatic download from a page; the blocked part, and the owner's long run, was lost.

**Replaces.** DEC-358's "auto download the JSON log every day or after every mission" (the per-day download). That record's status stays `standing`: only that sentence of its Ruling is overridden.

**Source.** BUG-199 ticket `source:`.

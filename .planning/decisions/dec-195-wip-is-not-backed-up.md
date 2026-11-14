---
id: DEC-195
status: standing
decided: 2026-11-14
area: process
governs: INFRA-13, ~/CodeShit/ledorepo/backup.sh, wip/
supersedes:
---

# DEC-195: wip/ is not backed up

**Ruling.** "dont back up wip". The ledorepo backup leaves `wip/` (66 MB of in-progress models and audio) out.

**Why.** It is large binaries; the backup is a small private repo of state and rulings.

**Replaces.** INFRA-13's open question (back `wip/` up if small, else external disk / Time Machine).

**Source.** Owner, 2026-11-14, in chat, relayed by the orchestrator to the ledorepo agent. Owner's words.

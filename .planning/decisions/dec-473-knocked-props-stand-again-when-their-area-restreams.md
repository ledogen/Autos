---
id: DEC-473
status: standing
decided: 2026-11-20
area: world
governs: FEAT-317, FEAT-149, FEAT-251, FEAT-268, src/main.js, _updateOrnaments, lawn furniture, knockable, mailbox
supersedes:
---

# DEC-473: A knocked prop stands again when its area of the world restreams; no knocked list is kept for the run

**Ruling.** "Right now when you knock down lawn furniture, it stays down for the remainder of the run. It would cost less memory and be more fun for the player if it reset every time that area of the world restreamed."

**Why.** A knocked prop stayed down for the rest of the run. Standing it again when its area streams back is more fun, and keeps no knocked state.

**Replaces.** FEAT-149's "a knocked gnome stays knocked for the session" (a code comment, no record). Demolition targets are not covered: their smashed state belongs to the job (FEAT-65, DEC-403) and they never stand again mid-job. Agrees with DEC-429 ("they just respawn next time").

**Source.** Owner, via the orchestrator, 2026-11-20. Owner's words.

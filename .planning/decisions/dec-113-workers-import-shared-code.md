---
id: DEC-113
status: draft
decided: 2026-10-02
area: repo
governs: src/terrain-worker.js, src/terrain.js, src/road-network-worker.js, src/road-route-worker.js, workers
supersedes:
---

# DEC-113: Every worker imports the code the main thread runs; nothing is mirrored

**Ruling.** Every Worker is a real ES module that imports the main thread's code; nothing is pasted into a source string and there is no sync rule (the no-mirror fence).

**Why.** Worker/main parity by construction.

**Replaces.** Nothing yet: this record is a draft until the owner rules.

**Source.** CLAUDE.md § Workers (2026-10-02); memory project_terrain_worker_constraints (2026-06-21). Agent wording.

**Conflict.** A: "Every Worker is a real ES module that imports the code the main thread runs." (CLAUDE.md § Workers (2026-10-02)) · B: "WORKER_SOURCE is the SOLE worker source." (memory project_terrain_worker_constraints (2026-06-21))

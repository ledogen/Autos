---
id: DEC-078
status: standing
decided: 2026-06-21
area: repo
governs: src/, CLAUDE.md, dead code, comments
supersedes:
---

# DEC-078: No dead code; comments keep the ticket tags

**Ruling.** A retired approach is deleted, not parked behind a comment; BUG/D/CR tags and invariant explainers stay inline until the code they describe is gone.

**Why.** Git history and .planning/ hold the story; tags in src/ prevent regressions.

**Replaces.** Nothing.

**Source.** CLAUDE.md § src/ is the product (date from git). Owner's words.

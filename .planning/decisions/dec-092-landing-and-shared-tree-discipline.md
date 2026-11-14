---
id: DEC-092
status: draft
decided: 2026-11-07
area: process
governs: git, landing, main
supersedes:
---

# DEC-092: Landing discipline: verify the base, commit by path, never push unasked

**Ruling.** Before a landing claim, run `git diff --stat <base> main -- src test`; commit with `git commit -- <paths>`, never `git add` a set; never push unless asked; one agent per worktree.

**Why.** A shared tree once produced a commit with another session's files.

**Replaces.** Nothing.

**Source.** memory feedback_verify_base_before_landing_claim and feedback_shared_worktree_commits (2026-07-27/28). Date from the memory note. Agent wording.

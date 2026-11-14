---
id: DEC-116
status: draft
decided: 2026-11-02
area: process
governs: git, worktrees, executors
supersedes:
---

# DEC-116: Uncommitted changes in your worktree are yours: commit them, never discard

**Ruling.** Leftover uncommitted changes are committed (or flagged), never discarded with `git checkout --`, `reset` or `stash`.

**Why.** An uncommitted tree is lost work after a crash; other sessions may own it.

**Replaces.** Nothing yet: this record is a draft until the owner rules.

**Source.** memory feedback_commits (owner, 2026-11-02); memory feedback_check_tree_before_executor (2026-06-10). Date from the memory note. Agent wording.

**Conflict.** A: "uncommitted changes in your worktree are YOURS: commit them, never discard them." (memory feedback_commits (owner, 2026-11-02)) · B: "discard leftovers with `git checkout --`" (memory feedback_check_tree_before_executor (2026-06-10))

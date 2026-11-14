---
id: DEC-092
status: standing
decided: 2026-11-13
area: process
governs: git, landing, main
supersedes:
---

# DEC-092: Commit whenever; push only at the owner's command

**Ruling.** Agents are free to commit whenever; push is at the owner's command only. In a shared tree commit by path (`git commit -- <paths>`), and run `git diff --stat <base> main -- src test` before claiming a landing.

**Why.** A shared tree once produced a commit with another session's files.

**Replaces.** Nothing.

**Source.** memory feedback_verify_base_before_landing_claim and feedback_shared_worktree_commits (2026-07-27/28). Date from the memory note. Owner, 2026-11-13: "agents are free to commit whenever. push is at my command only". Agent wording, owner approved 2026-11-13.

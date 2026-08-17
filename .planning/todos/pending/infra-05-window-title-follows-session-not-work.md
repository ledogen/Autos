---
id: INFRA-05
type: infra
status: open
opened: 2026-08-16
severity: minor
source: user-observation 2026-08-16 — "this window should be using my rename skill but the title still
  shows :8000 :8010? why don't we have a worktree name and port?"
relates_to: INFRA-04 (the window-title skill this extends), the `worktree` skill
  (~/.claude/skills/worktree/scripts/wt.sh), ~/.claude/skills/window-title/scripts/title.sh,
  ~/.claude/settings.json (SessionStart + Stop hooks)
---

# INFRA-05: the window title follows the SESSION, not the work

## Summary

The title labels the checkout the Claude session is *anchored in*. When an agent works in a sibling
worktree — created by the `worktree` skill, which is the normal flow — the session stays anchored in
main, so the title reads `CarGame  :8000 :8010` while the actual work and dev server are
`CarGame-par-reanchor  :3872`.

**Nothing is broken.** Every component does exactly what INFRA-04 built it to do. The gap is that
"which tree is this session anchored in" and "which tree is this session working on" were the same
question when INFRA-04 shipped, and they are not any more.

## Reproduction (100%, no special setup)

1. From a session anchored in main, run `bash ~/.claude/skills/worktree/scripts/wt.sh new <slug>`.
2. Start that worktree's dev server on its derived port.
3. Run `bash ~/.claude/skills/window-title/scripts/title.sh <worktree-path>` — the title **does**
   change, and the script prints `window title: CarGame-<slug>  :<port>`.
4. End the turn. The title reverts to `CarGame  :8000 :8010`.

## Root cause — measured, not inferred

The `Stop` hook re-runs `title.sh` **with no arguments at the end of every turn**:

```json
"Stop": [{ "hooks": [
  { "type": "command",
    "command": "bash \"$HOME/.claude/skills/window-title/scripts/title.sh\" >/dev/null 2>&1 || true",
    "async": true } ] }]
```

`title.sh` line 15: `DIR="${1:-${CLAUDE_PROJECT_DIR:-$PWD}}"`. No argument ⇒ `CLAUDE_PROJECT_DIR` ⇒
the main checkout. So the hook recomputes main's label and main's ports and overwrites whatever a
manual call set, within seconds, every turn.

Verified directly on 2026-08-16:

```
$ title.sh --print                                    # what the hook computes
CarGame  :8000 :8010
$ title.sh --print /Users/ledogen/CodeShit/CarGame-par-reanchor
CarGame-par-reanchor  :3872
```

Port attribution is correct in both cases — it is by listening-process cwd, longest-matching
worktree path (INFRA-04 fact #2). Confirmed live:

| port | pid | cwd |
|---|---|---|
| 8000 | 35184 | `/Users/ledogen/CodeShit/CarGame` (main's dev server) |
| 8010 | 11155 | main — the `npm run dash` dashboard |
| 3872 | 87487 | `/Users/ledogen/CodeShit/CarGame-par-reanchor` |

**The write itself is not the problem, and a fixer should not go hunting there.** `title.sh`
distinguishes success from failure explicitly — success prints `window title: <t>` on stdout, failure
prints `window title (NOT written — no reachable tty): <t>` on **stderr and exits 1**. The manual call
printed the success form, so the osascript path worked. This is purely an overwrite-ordering problem,
not a delivery problem. (INFRA-04 fact #1 — OSC-on-stdout can't reach the terminal — is real but is
NOT what is happening here; the osascript-by-tty path is working fine.)

## Why this is worth fixing

With parallel worktrees the title is the only at-a-glance way to tell windows apart, and right now
every window anchored in main reads identically regardless of what it is doing. Worse, it advertises
**main's** ports: on 2026-08-16 the owner had a stale main dev server on :8000 alongside the worktree's
:3872, and the title actively pointed at the wrong one — a real "am I testing the build I think I am"
hazard, not just cosmetics.

## Options (owner's call — do not pick one unilaterally)

1. **Run Claude Code from inside the worktree** for worktree work. `CLAUDE_PROJECT_DIR` becomes the
   worktree, the hook labels it correctly with no code change, and the divergence cannot arise.
   Zero implementation; a workflow change. Probably what INFRA-04 tacitly assumed.
2. **State file the hook prefers over cwd.** `wt.sh serve` (and `wt.sh new`) stamps something like
   `~/.claude/run/window-title/<session-or-tty>` with the worktree path; `title.sh` reads it when no
   argument is given, falling back to `CLAUDE_PROJECT_DIR`. Makes the title follow the *work*. Needs
   a keying decision (tty is the natural key since that is already what the writer resolves) and a
   staleness rule so a finished worktree does not pin the title forever.
3. **Leave it**, now that the semantics are written down: the title is session identity, and a
   session anchored in main serving a sibling worktree is simply outside what it reports.

Option 2 is the only one that needs code. If it is chosen, note that `wt.sh clean` must clear the
stamp, or the next task in that window inherits a title for a worktree that no longer exists.

## Acceptance

- A window whose agent is working in `CarGame-<slug>` and serving `:<port>` shows that worktree and
  that port in the title, and **still shows it after the turn ends** (the current failure).
- A window genuinely working in main still reads `CarGame  :8000 :8010`.
- `wt.sh clean` leaves no stale attribution behind.
- If option 1 or 3 is chosen instead: record the ruling in INFRA-04's ticket and in the
  `window-title` SKILL.md, so the next agent does not re-derive this from scratch.

## Notes for whoever picks this up

- `CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1"` is already set in `~/.claude/settings.json` env; without
  it Claude Code overwrites the slot every turn (INFRA-04 fact #3). Leave it alone.
- Terminal.app's stock profile wraps the custom title with cwd/process/dimensions. Cosmetic, known,
  documented in INFRA-04 as the user's call — unchecking everything but "Custom title" in
  Window → Title cleans it up. Not part of this ticket.
- The `worktree` skill already tells agents to run `title.sh <worktree-path>` after `new`/`clean`.
  That instruction is currently ineffective for anything but the remainder of the current turn —
  worth correcting in the skill whichever option is chosen.

---
id: INFRA-04
type: infra
status: completed
severity: minor
opened: 2026-08-15
closed: 2026-08-15
source: user-request
relates: worktree skill (~/.claude/skills/worktree), tools/dashboard (INFRA dev tooling lane)
---

## Resolution (2026-08-15)

Built at `~/.claude/skills/window-title/` (SKILL.md + `scripts/title.sh`). Title format
`<worktree>  :<port> :<port>`, e.g. `CarGame  :8000 :8010`. Three parts of the ticket's plan
did not survive contact with the environment:

1. **`printf '\033]0;…'` on stdout cannot work from a tool call or hook** — that shell has no
   controlling terminal, so the escape lands in captured output. The script instead resolves the
   tty of the nearest ancestor process that has one, and sets Terminal.app's tab custom title by
   tty over AppleScript, with an OSC-to-`/dev/ttysNNN` fallback for other emulators.
2. **Port attribution by "this session's shells" finds nothing** — dev servers are reparented to
   launchd (PPID 1) the moment their launching shell exits. Attribution is by the listening
   process's **cwd**, with the longest matching worktree path winning so a nested worktree's
   server is never credited to main.
3. **Claude Code writes its own OSC title every turn** and would overwrite ours, so
   `env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1"` is now set in `~/.claude/settings.json`.

The stretch goal was taken, not deferred: `SessionStart` + `Stop` hooks in
`~/.claude/settings.json` run the script automatically, so the title tracks reality with no
manual invocation. The `worktree` skill now re-runs it after `serve`/`new`/`clean`.

Verified: main checkout → `CarGame  :8000 :8010`; a throwaway worktree serving :8077 →
`CarGame-titletest  :8077` with main correctly *not* showing :8077; non-repo dir → basename.
Known cosmetic issue documented in SKILL.md: Terminal.app's stock profile wraps the custom title
with working directory, active process, and dimensions.

# INFRA-04: `window-title` skill — label the agent's terminal at a glance

## Request

With several agents running in parallel (worktrees + dev servers), the terminal windows are
indistinguishable. Make a **Claude Code skill** whose whole job is: the agent works out **which
worktree it is in** and **which port(s) it is serving on**, and writes that into the **terminal
window title**, so the user can tell which agent is doing what at a glance.

## Behaviour

- **Acquire the worktree**: repo + branch/worktree identity — `git rev-parse --show-toplevel` for
  the directory (basename is usually the label), `git branch --show-current` for the branch. Main
  checkout vs. worktree should be distinguishable (e.g. `CarGame` vs `CarGame-feature-box3d`).
- **Acquire the port(s)**: whatever this session is actually serving — the Vite dev server
  (`npm run dev`, :8000 default), the dashboard (`npm run dash`, :8010), the worktree skill's
  per-worktree preview ports. Detection can be honest-but-simple: ports of listening processes
  owned by this session's shells (`lsof -iTCP -sTCP:LISTEN`), or just the ports the agent knows it
  started. No port → omit that part.
- **Write the title**: standard OSC escape (`printf '\033]0;%s\007'`) — works in Terminal.app,
  iTerm2, and most emulators. Suggested format: `<worktree> [:<port>...]` — short, front-loaded,
  e.g. `CarGame-topo-map :8001` or `CarGame :8000 :8010`.
- **When it runs**: on skill invocation (`/window-title`), and the skill's instructions should tell
  the agent to re-run it after starting/stopping a server or switching worktrees. (A hook-based
  always-on variant is a stretch goal — see notes.)

## Acceptance

- Skill exists at `~/.claude/skills/window-title/` (user-level — it must work from any worktree),
  with the standard skill layout (SKILL.md with trigger description).
- Invoking it in the main checkout sets the title to the repo name + any live ports; invoking it
  in a worktree shows the worktree identity instead.
- Degrades gracefully: no git repo → directory basename; no ports → worktree only.
- One escape write, no daemon, no polling loop left running.

## Notes

- This is **user-level tooling, not repo code** — the deliverable lives in `~/.claude/skills/`.
  This ticket tracks the work because the repo is where the multi-agent workflow lives.
- The `worktree` skill is the natural integration point (it already assigns per-worktree ports);
  a one-line "then run /window-title" in its flow may be all the automation needed.
- Stretch: a `settings.json` hook (session-start / after-Bash) that keeps the title fresh without
  manual invocation — needs the update-config skill lane; keep out of scope for v1.
- Title hygiene: some shells (via `PROMPT_COMMAND` / precmd) rewrite titles on every prompt and
  will fight the escape — if the title doesn't stick, that is why; document rather than battle it.

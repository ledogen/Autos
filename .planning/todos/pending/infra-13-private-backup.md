---
id: INFRA-13
type: infra
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-12 — the "ledorepo" brief (sculpting a personal Jira: tracker + lanes + deep-dive forms)
relates: INFRA-11
---
lane: unplaced (tooling — orchestrator or a Spare agent; touches no game code)

# INFRA-13: ledorepo — private GitHub backup of memory, skills, hooks and the tracker data

## Next steps
Owner: allow the hourly schedule (the launchd agent was blocked by the session's permission check on 2026-11-13).
Until then the backup runs only when someone runs `~/CodeShit/ledorepo/backup.sh`.

## Summary
Measured 2026-11-12: **nothing outside the game repo is backed up.** `~/.claude` is not a git repository, Time
Machine has no destination, and the `gh` command-line tool is not installed. At risk: the memory folder (164 files,
956 KB — every owner ruling and preference), the three hand-made skills (worktree, window-title,
blender-game-asset; 4.6 MB), the `worktree-pin.sh` hook, and `~/.claude/settings.json`. Also `wip/` (git-invisible
by design: in-progress models, audio takes, the item-setup handoff) and 7 commits on main that are not pushed.
The project CLAUDE.md and all of `.planning/` are safe once pushed: they are in the public game repo.

## Tracker
- [x] A private repo holds a copy of: the CarGame memory folder, `~/.claude/skills/` (minus `synced/`),
      `~/.claude/hooks/`, `~/.claude/settings.json`, the project's `.claude/settings.local.json` and `RESUME.md`,
      and the INFRA-11 tracker data if the owner rules it private.
- [ ] (script done 2026-11-13, schedule NOT installed) One script (`backup.sh`: copy with rsync, commit, push) run hourly by launchd. It commits only when
      something changed.
- [x] Nothing secret goes up: the script copies an explicit list of paths, never all of `~/.claude` (which holds
      session transcripts, login state and caches).
- [x] A restore was tried once on a scratch folder and the memory index loads.
- [ ] Decide `wip/`: it holds large binaries (Blender files, audio). Size it first; back it up here only if small,
      otherwise a plain external-disk / Time Machine answer.
- [ ] Turn on Time Machine or an equivalent whole-disk backup — the cheap, complete answer to "the laptop died".

## Decisions
- 2026-11-12, owner: the private repo is the ledorepo repo itself (see INFRA-11 § Decisions); the backup is a
  folder in it.
- 2026-11-13, owner: unpushed commits on main (7 on 2026-11-12; a push deploys Pages) are an accepted risk for
  now. **Loose end**, not work: no second remote is built. Revisit before closing this ticket.

## Files
`~/.claude/projects/-Users-ledogen-CodeShit-CarGame/memory/` · `~/.claude/skills/` · `~/.claude/hooks/` ·
`~/.claude/settings.json` · `wip/`

## Log
- 2026-11-13: the owner created `git@github.com:ledogen/ledorepo.git` (private). Cloned to `~/CodeShit/ledorepo`.
  `backup.sh` copies every project's memory folder (CarGame, AgenticFortress, alienhunt), the three hand-made
  skills, the hook, `settings.json`, and CarGame's `.claude/settings.local.json` + `RESUME.md`. First backup
  pushed (200 files, 1.1 MB). Restore check: a fresh clone's CarGame memory folder is byte-identical to the live one.
  Grepped the copied paths for keys and passwords first: none.
- `wip/` is 66 MB; not backed up yet (tracker box above still open). Time Machine still off.

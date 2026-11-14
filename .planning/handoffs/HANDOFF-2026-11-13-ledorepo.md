# Handoff — ledorepo (the owner's tracker tooling), 2026-11-13

Worktree: none open. All work so far is landed on main (/Users/ledogen/CodeShit/CarGame), not pushed.
Branch:   cut a new one per ticket, `infra/infra-NN-<slug>`, worktree `CarGame-<slug>`, off local main.
Serve:    the live tracker is http://localhost:8010/ (phone: http://m4air:8010/ over Tailscale). Use :8011 with
          `LEDOREPO_DATA=<a copy of the data folder>` for a dev copy. Never restart :8000 (main's game server).
State:    clean. Work ONLY in a worktree: a new session starts anchored in the main checkout.

Resume word: `ledorepo`. Read this, then CLAUDE.md § "Communicating with the owner".

## What "ledorepo" is
The owner's personal Jira: the dashboard in `tools/dashboard/` (this repo, public) + the private repo
`~/CodeShit/ledorepo` (git@github.com:ledogen/ledorepo.git) holding the tracker's DATA
(`projects/cargame/`: inbox, owed, lanes, dives, answered) and the BACKUP of Claude Code state (`backup/`).
The file-by-file data contract is the comment above `DATA` in `tools/dashboard/index.mjs`.
Owner rulings: the app stays in this repo until a second project needs it; only data is private; reachable
anywhere (Tailscale, Mac = `m4air`); Lanes is the home tab; hooks, not launchd, for anything scheduled.

## Done (all closed, in completed/)
- INFRA-11 Lanes tab on local files (the claude.ai Alpha Lanes artifact is dead; never read or write it).
- INFRA-12 deep dives: `.planning/dives/<TICKET-ID>-<slug>.html` + `<dive-q>` tags, `tools/dashboard/dive.js`.
- INFRA-09 ticket template `.planning/todos/TEMPLATE.md`; ticket pages render in the fixed section order.
- Backup: `~/CodeShit/ledorepo/backup.sh`, run by hooks in `~/.claude/settings.json` (SessionStart + Stop with
  `--hourly`; PreCompact + SessionEnd always). A SessionStart hook also starts the dashboard on :8010.
- INFRA-10 decision records: `.planning/decisions/dec-NNN-<slug>.md`, 132 standing, Decisions tab, the freeze
  check `tools/dashboard/decisions.check.mjs`, rules in CLAUDE.md § Workflow. The records beat every other doc
  (owner 11-13) and the losing text is corrected at its source (DEC-127). The backfill's ledger is
  `.planning/decisions/conflicts.json`. Next free id: ask the orchestrator (Lane A minted from DEC-146).

## Next, in order
1. **INFRA-14** — the orchestrator's state is now all in files, so a clear costs one word. Remaining: tidy its
   handoff (drop the "ready for a clear at ~300k" drill or keep it only mid-merge) and make side work its
   subagents by default. Small; the handoff is the orchestrator's file — send it the text, it applies.
2. **INFRA-13** — waits on the owner: `wip/` (66 MB) backed up or not; Time Machine. Unpushed commits on main
   are an accepted loose end (owner).

## Working with the orchestrator (peer session; find it with ListAgents, it answers to "orchestrator")
- It owns main's merges, `HANDOFF-2026-10-25-orchestrator.md`, `LANE-AGENT-BRIEF.md`, and every agent-side file
  in the data folder. To land: SendMessage it the branch + which of its files you changed, wait for "go", merge
  `--no-ff`, restart :8010 only, reply "done" with the hash. Never push. Never merge while it has a smoke running.
- Take its side on any conflict in its handoff's "## Current state" section.
- Ticket ids: INFRA numbers are free for this work (next INFRA-15); ask it before minting BUG/FEAT/PERF.

## Checks
- `node tools/dashboard/data-api.check.mjs` — the page may write only its own files.
- Browser checks were scratch scripts (headless Chrome via `test/lib/cdp.mjs`, through `tools/chrome-slot.sh`,
  against a COPY of the data on :8011). Never run a write test against the live data folder.

# Handoff — ledorepo (the owner's tracker tooling), 2026-11-13 (updated 11-14)

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
- INFRA-10 decision records: `.planning/decisions/dec-NNN-<slug>.md`, Decisions tab, the freeze check
  `tools/dashboard/decisions.check.mjs`, rules in CLAUDE.md § Workflow. The records beat every other doc
  (owner 11-13) and the losing text is corrected at its source (DEC-127). The owner's conflicts dive
  (`.planning/dives/INFRA-10-conflicts.html`) is answered, applied and marked taken; the backfill's ledger is
  `.planning/decisions/conflicts.json`. Lanes mint records now (143 on 11-14: 140 standing, 1 draft,
  2 superseded). Next free id: `ls .planning/decisions | tail -1`, then confirm with the orchestrator.
  Both lane follow-ups are done: `campDeeds` is 6 (DEC-120), the BUG-164 draw rule is DEC-135.

## INFRA-10 leftovers (none blocks anything; raise each when its area is next touched)
Owner's to rule:
1. Spare change: DESIGN.md / items.md still say compressor −30 min and quick-jack −1 h beside DEC-105
   (2 h bare, 30 min with tire iron + floor jack). FEAT-203's open question.
2. ART-STYLE.md's small-scatter (250–500 tris) and mid-structure (700–1800) budgets vs DEC-114's ~1000 floor.
3. SM-INV-14's heading says "points"; DEC-014 says good deeds.
4. CLAUDE.md's commit rule became "commit whenever, push only at the owner's command" (DEC-092) and replaced
   "main gets commits only at a task boundary". The owner was told and has not objected.
5. Rain (DEC-121, owner's note): before building rain, ASK how a mission is handled when the weather changes
   mid-way. The owner's suggestion: weather latches until the mission ends.
Backfill gaps (no record exists, so nothing guards these):
- `spirits-and-pacts.md` and `IDEAS.md` were not read; run-shape, missions, items, cargo, pois, opening were
  skimmed; tickets outside the alpha cut were only grepped.
- Par grip is 0.72 in code and 0.80 in DESIGN.md. "Hunger is a word, never a gauge" has no record.
- DEC-067 (T beats no T) and DEC-072 (map adopt path) were deleted at the owner's word; memory says ask
  before changing junction promotion.

## Next, in order
1. **INFRA-13** — waits on the owner: Time Machine (or an equivalent whole-disk backup). `wip/` is decided: not
   backed up (DEC-195, owner 11-14). Unpushed commits on main are an accepted loose end (owner).
   INFRA-14 closed 11-14 (branch infra/infra-14-context; the orchestrator applies
   `wip/infra-14/orchestrator-handoff-patch.md` to its handoff when it lands).

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

---
id: INFRA-11
type: infra
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-12 — the "ledorepo" brief (sculpting a personal Jira: tracker + lanes + deep-dive forms)
relates: INFRA-12, INFRA-13, .planning/pages/alpha-lanes.html, .planning/handoffs/HANDOFF-2026-10-25-orchestrator.md, tools/dashboard/
---
lane: unplaced (tooling — orchestrator or a Spare agent; touches no game code)

# INFRA-11: ledorepo — the lane tracker runs locally (inbox, owed, lanes) instead of as a claude.ai artifact

## Summary
The Alpha Lanes tracker is a page hosted on claude.ai with its data (inbox, owed answers, lane status) in
Anthropic's artifact database. Move it into the local dashboard app (`npm run dash`, :8010) with the data as files
on disk, so it is in git, backed up (INFRA-13), linkable to tickets, and readable by agents with a plain file read.
The owner's loop must survive unchanged: slam thoughts into the intake box while playtesting, answer the owed
items inline later, autosave throughout.

## Next action
Owner: answer "where does the data live" and "do you answer away from the Mac" (asked in chat 2026-11-12).

## Decisions
- 2026-11-12, owner: the app and its private data live in their **own private repo**, not the public game repo.
  Tickets and decision records stay in the game repo beside the code. The owner will use it on other projects.
  Open: one generic `ledorepo` or one per project — recommended one generic repo: the app at the top, a folder per
  project (`projects/cargame/` holding inbox, owed, dive answers and that project's memory backup), and a small
  config line per project giving the path of its checkout.
- 2026-11-12, owner: must be usable **anywhere**, not only at the Mac. So: Tailscale (a private network between the
  owner's devices) on the Mac and phone, the server listening on the Tailscale address only, and the Lanes page
  laid out for a phone screen.

## Progress
- [ ] Step 0, independent of the rest: every ticket id on the current artifact links to
      `http://localhost:8010/#/t/<ID>` (the dashboard already has that route).
- [ ] The dashboard gains a **Lanes** tab with the artifact's three parts: the lane board (now line, tasks), the
      **inbox** box, and the **owed** cards with their choice buttons and note box. Autosaves on every keystroke pause.
- [ ] Storage is one small JSON file per item (`inbox/<timestamp>.json`, `owed/<id>.json`, `lanes/<id>.json`), so
      the owner typing and an agent replying never write the same file. The dashboard stops being read-only **for
      this data directory only**; it still never edits a ticket.
- [ ] The orchestrator handoff's "On wake" and LANE-AGENT-BRIEF read and write those files instead of the artifact
      db. The publish ritual (read every line, `page-scripts.mjs`, republish) is deleted.
- [ ] Reachable from the owner's phone over Tailscale; the intake box and owed cards are usable at phone width.
- [ ] One-time import of the artifact's `inbox`, `owed`, `lanes`, `tasks` collections; the artifact gets a banner
      pointing at the local page and is then left alone.
- [ ] The server starts at login (a launchd agent — macOS's way to keep a small program running), so the page is
      always there.

## Detail — what the artifact costs today (orchestrator, 2026-11-12)
- **Publish ritual.** After every clear the orchestrator must re-read all 452 lines of the page (~25k tokens,
  three reads) before it may publish, though it only changes two JavaScript arrays.
- **State split three ways.** The lane and owed lists live in the page's HTML source, the answers and inbox in the
  page database, the tickets in the repo. One owner answer costs a database read, a ticket edit, an array edit and
  a republish. Answered owed documents are never deleted (75 now, most stale).
- **Write races.** Each database write needs a version number, and lane agents race the orchestrator on the same
  `lanes/<id>` document. The `tasks` rows drift from the arrays.
- A missing comma once shipped the page dead (hence `test/page-scripts.mjs`).

So the local design must have **one** home per fact: lists and answers as data files, never in the page source.
An answered owed item moves to an `answered/` folder so "what is new" is a directory listing.

## Open questions
- Cut over at a quiet moment: the orchestrator and its agents write the artifact db all day. Who calls the window?
- Does the item-setup artifact (Lane C's) move too, or stay until its work is done? Recommended: stay.

## Files
`tools/dashboard/index.mjs` · `tools/dashboard/app.html` · `.planning/pages/alpha-lanes.html` (retired) ·
`.planning/handoffs/HANDOFF-2026-10-25-orchestrator.md` · `.planning/handoffs/LANE-AGENT-BRIEF.md`

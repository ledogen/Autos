# Lane agent brief (owner, 2026-11-09)

You are a **lane agent**: a background subagent of the orchestrator (the main-checkout session, `CarGame :8000`).
**One agent = one task.** When your task is done you hand off, report, and stop. The orchestrator then starts a
fresh agent for the lane's next task. That fresh start IS the /clear — so never roll a second task into the same
agent, and never wait around for one.

The owner does not talk to you. The orchestrator does. CLAUDE.md applies in full.

## Start

1. Your prompt names your lane id (`a` / `b` / `c` / `s`), worktree, branch, port and the ONE task. Read your
   handoff: the file `/Users/ledogen/CodeShit/ledorepo/projects/cargame/lanes/<id>.handoff.md` (plain markdown, yours alone to write; the tracker's Lanes tab
   at http://localhost:8010 shows it). Then read the task's ticket.
2. Work ONLY in your worktree. **Your Bash working directory does not persist between calls**: start every Bash
   call with `cd <worktree> && …` (or use `git -C <worktree>`), and give Read/Edit absolute paths. An edit in
   `/Users/ledogen/CodeShit/CarGame/` (main) is a mistake unless the orchestrator asked for it.
3. Merge main first if you're behind (`git merge main`), unless the branch is a landing branch already under review.
4. **Before planning**: read the decision records that govern what you will touch
   (`grep -l -e <ticket id> -e <file> -e <subsystem word> .planning/decisions/*.md`) and list any conflict with the
   task in your report BEFORE starting work. A conflict is the owner's call.

## While you work

- **Tickets** you write or touch follow `.planning/todos/TEMPLATE.md` (fixed sections, fixed order; keep `Next steps`
  and the `Tracker` boxes current: the owner reads those two first).
- **Commit WIP at every working step**: `git commit -m 'wip(NN): …' -- <paths>` (never `git add` a set).
- **CPU**: at most 2 heavy processes (`run-all --serial` or `--only`; Chrome only via `tools/chrome-slot.sh`).
  Never kill another lane's process. **No cdp-smoke on a branch**: the orchestrator smokes main after each merge.
- **A job over ~10 min** (a gate run, a soak, a census): start it detached, `nohup <cmd> > <log> 2>&1 &`, and wait
  on the log (a Monitor until-loop on its last line). It then outlives you if you stop, and the next agent reads the log.
  **Every wait loop carries a time limit** (`timeout 900 bash -c 'until …; do sleep 20; done'`, or a counter): on 2026-11-17
  the orchestrator found 51 loops up to 4.6 days old, each waiting on a log line or a `pgrep` that could never come true.
  Wait on YOUR job's pid or YOUR log, never on "no run-all anywhere on the machine" (another lane's run keeps it alive).
- **Need the orchestrator mid-task** (another lane's file, merge order, a landing slot)? `SendMessage` to `main`,
  then carry on with whatever doesn't depend on the answer.
- **Owner-only calls** (design, economy numbers, words in the world's voice, a look or a drive): never block on
  them and never invent them. Put the question in your report, with your recommendation, and stop at that boundary.
  If the call has several linked questions or needs a table or a picture, write it as a **deep dive**: copy
  `.planning/dives/TEMPLATE.html` to `.planning/dives/<TICKET-ID>-<slug>.html` (rules in its comment), commit it,
  and name the file on your report's OWED line; the orchestrator puts it on the owner's page.
- **A dev server for an owner look**: `nohup npx vite --port <your port> --strictPort > <log> 2>&1 &` in your
  worktree, and name it in the handoff. Stop servers nobody is looking at.

## Token discipline (owner, 2026-11-14: "max completion at satisfactory quality", paced over the week)

Every tool round re-sends your whole context, so cost grows with what you have READ, not with what you write.
- **Read narrowly.** `grep -n` first, then Read with `offset`/`limit`. Never read a whole large file (main.js, a long
  ticket) to find one function. Of a ticket read Next steps, Tracker, Decisions; the Log only if you need it.
- **Never print a job's output into your context.** Gates, smokes, builds: `> <log> 2>&1`, then `tail -5` or
  `grep -c FAIL`. Open more of the log only on a failure.
- **Test instead of re-reading.** Write the smallest failing check, make it pass, run the affected gates. Do not
  re-read code to convince yourself; a green gate is the proof.
- **The rulings are made.** Build to the ticket and its DECs. No option surveys, no alternatives nobody asked for,
  no exploration beyond the files the task touches.
- **Write short.** A ticket Log entry is ≤ 5 lines (hash, gates, what is unverified). No diary, no restating the
  plan. One before/after screenshot pair per owner look, no artifact pages unless the orchestrator asks.
- **Stop early when it grows.** If the task turns out about twice what the prompt implied, land the coherent slice
  and put the rest in NEXT.

## Stop — when ANY of these is true

1. **The task is done**: a landing request is ready, or a look / measurement / proposal is ready for the owner.
2. **You're blocked** on the owner or on another lane.

## On stop: hand off, then report

1. Commit everything (WIP is fine). Long jobs may keep running detached; name their logs.
2. **Rewrite `/Users/ledogen/CodeShit/ledorepo/projects/cargame/lanes/<id>.handoff.md`** (the Write tool; no versions, nobody else writes
   it). Then write ONE line, `stopped (<done|blocked>): <one line> · <HH:MM>`, to `lanes/<id>.now` in the same folder (overwrite the whole file: it holds exactly one line, never append): the
   page shows it as the lane's "now" line. Touch no other file in that folder. The handoff is a resume
   prompt, NOT a diary: **≤ 40 lines, rewritten whole every time**. History belongs in tickets and commits. Sections:
   - `STATE` — worktree, branch, head, clean or not, servers / detached jobs running + their logs.
   - `NEXT` — the one next task and its first command.
   - `WAITING ON` — owner calls and other lanes' items, one line each.
   - lane-specific rules only if they aren't in this brief or CLAUDE.md.
3. **Your final message is the report to the orchestrator, ≤ 15 lines**, exactly these heads:
   ```
   DONE:     what, with hashes
   LANDING:  branch @ hash · `git diff --stat <merge base> main -- src test data` · affected gates N/N green — or none
   OWED:     owner questions, one line each with your recommendation — or none
   NEXT:     the task the next agent should take
   STOPPED:  done / blocked
   ```

## Owed cards: say what the answer opens (DEC-194)

If the owner's answer to your card opens follow-on work (a held landing, a next round, a build waiting on a
number), add `"blocks": "<that work, in plain words>"` to the card's JSON. A card that is only a look at
finished work carries no `blocks`. The orchestrator sets `order`.

**Owed cards with a list (owner, 2026-11-17):** put every numbered item or option on its own line (a real `\n` in the JSON `text`). A list inside a paragraph is hard to read on the page.

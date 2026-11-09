# Lane agent brief (owner, 2026-11-09)

You are a **lane agent**: a background subagent of the orchestrator (the main-checkout session, `CarGame :8000`).
**One agent = one task.** When your task is done you hand off, report, and stop. The orchestrator then starts a
fresh agent for the lane's next task. That fresh start IS the /clear — so never roll a second task into the same
agent, and never wait around for one.

The owner does not talk to you. The orchestrator does. CLAUDE.md applies in full.

## Start

1. Your prompt names your lane id (`a` / `b` / `c` / `s`), worktree, branch, port and the ONE task. Read your
   page handoff: `ArtifactData get`, url `https://claude.ai/artifact/8P7QDPAaKxKPtJuf6zvRVH`, collection `lanes`,
   doc `<id>` (field `handoff`; keep its `version` for the write at the end). Then read the task's ticket.
2. Work ONLY in your worktree. **Your Bash working directory does not persist between calls**: start every Bash
   call with `cd <worktree> && …` (or use `git -C <worktree>`), and give Read/Edit absolute paths. An edit in
   `/Users/ledogen/CodeShit/CarGame/` (main) is a mistake unless the orchestrator asked for it.
3. Merge main first if you're behind (`git merge main`), unless the branch is a landing branch already under review.

## While you work

- **Commit WIP at every working step**: `git commit -m 'wip(NN): …' -- <paths>` (never `git add` a set).
- **CPU**: at most 2 heavy processes (`run-all --serial` or `--only`; Chrome only via `tools/chrome-slot.sh`).
  Never kill another lane's process. **No cdp-smoke on a branch**: the orchestrator smokes main after each merge.
- **A job over ~10 min** (a gate run, a soak, a census): start it detached, `nohup <cmd> > <log> 2>&1 &`, and wait
  on the log (a Monitor until-loop on its last line). It then outlives you if you stop, and the next agent reads the log.
- **Need the orchestrator mid-task** (another lane's file, merge order, a landing slot)? `SendMessage` to `main`,
  then carry on with whatever doesn't depend on the answer.
- **Owner-only calls** (design, economy numbers, words in the world's voice, a look or a drive): never block on
  them and never invent them. Put the question in your report, with your recommendation, and stop at that boundary.
- **A dev server for an owner look**: `nohup npx vite --port <your port> --strictPort > <log> 2>&1 &` in your
  worktree, and name it in the handoff. Stop servers nobody is looking at.

## Stop — when ANY of these is true

1. **The task is done**: a landing request is ready, or a look / measurement / proposal is ready for the owner.
2. **You're blocked** on the owner or on another lane.

## On stop: hand off, then report

1. Commit everything (WIP is fine). Long jobs may keep running detached; name their logs.
2. **Rewrite `lanes/<id>.handoff`** (`ArtifactData update`, `if_version` = the version you read). It is a resume
   prompt, NOT a diary: **≤ 40 lines, rewritten whole every time**. History belongs in tickets and commits. Sections:
   - `STATE` — worktree, branch, head, clean or not, servers / detached jobs running + their logs.
   - `NEXT` — the one next task and its first command.
   - `WAITING ON` — owner calls and other lanes' items, one line each.
   - lane-specific rules only if they aren't in this brief or CLAUDE.md.
3. Update your task rows (collection `tasks`, doc `<lane>-<TICKET_ID>`, `{status, note}`) if they changed.
4. **Your final message is the report to the orchestrator, ≤ 15 lines**, exactly these heads:
   ```
   DONE:     what, with hashes
   LANDING:  branch @ hash · `git diff --stat <merge base> main -- src test data` · affected gates N/N green — or none
   OWED:     owner questions, one line each with your recommendation — or none
   NEXT:     the task the next agent should take
   STOPPED:  done / blocked
   ```

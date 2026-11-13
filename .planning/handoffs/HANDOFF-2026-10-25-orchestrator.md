# Handoff — the orchestrator agent (standing brief; trimmed to what is live, 2026-11-09)

Worktree: /Users/ledogen/CodeShit/CarGame (the main checkout)
Branch:   main — the INTEGRATION branch; lanes land into it, small fixes commit straight on it
Serve:    http://localhost:8000 (`npm run dev`), dashboard http://localhost:8010 (`npm run dash`)
History:  every dated "State …" log from 10-25 to 11-09 was cut on 2026-11-09. Read it with
          `git show 365e01ca:.planning/handoffs/HANDOFF-2026-10-25-orchestrator.md` if you ever need it.

You are the **orchestrator**: the one session the owner talks to. You run the lanes as your own subagents,
land their work on main, and keep the tracker page current. Read this file, then `CLAUDE.md` § "Communicating
with the owner" (an engineer, not a programmer: gloss code and platform terms inline, never physics, maths,
git or design). Resume word: `orchestrator`. Window title `CarGame  :8000`.

## Lanes are YOUR subagents (owner, 2026-11-09)
The owner no longer talks to lanes, pastes their prompts or clears them. **You run each lane as a background
subagent, one task per agent; the fresh agent IS the clear.** Their rules: `.planning/handoffs/LANE-AGENT-BRIEF.md`
(they read it themselves; never retype it). No context watching (owner: "no need to watch context like a hawk…
just spawn a new subagent for task").
- **Spawn** (Agent tool, `model: opus`, general-purpose, NO `isolation` — they use the lane worktrees below):
  `You are Lane <X> (lane id <id>). Read /Users/ledogen/CodeShit/CarGame/.planning/handoffs/LANE-AGENT-BRIEF.md
  and follow it. Worktree <path>, branch <branch>, port <port>. Your task: <ONE task>.` plus anything the page
  handoff doesn't have yet (an owner answer verbatim, a gate run still alive + its log). Size a task to be worth
  the ~48k an agent costs to start: bundle small items, and do one-liners yourself on main.
- **The page's "now" line** = the one-line file `/Users/ledogen/CodeShit/ledorepo/projects/cargame/lanes/<id>.now`. At spawn write `running: <task> · since <HH:MM> · <agent id>`; the
  agent overwrites it with `stopped (<done|blocked>): <one line> · <HH:MM>` when it hands off.
- **On a report** (the agent's final message, ≤ 15 lines): LANDING → land it (below); OWED → one `owed/<id>.json` file each (§ The tracker);
  then spawn a FRESH agent for NEXT. Never SendMessage a finished agent to continue: that revives its whole
  context. Messages to a RUNNING agent are fine (an answer, an order); agents can SendMessage you as `main`.
- **Never idle a lane while owner-free alpha work exists** (owner 11-07: "what is everyone waiting on?"). With 10+
  owed items, give lanes pile-neutral work (gates, perf, closing on evidence, making a pending call cheaper).
- At most one agent per worktree. Lane C gets an agent only when an owner answer gives it work.
- **Your own context**: when you pass ~300k at a quiet moment (no merge or smoke mid-flight), let running agents
  finish or note them in § Current state, rewrite that section, and tell the owner "orchestrator ready for a clear".

## On wake
1. `bash tools/lanes.sh` — every worktree's branch, ahead/behind, uncommitted files (a lane's WIP: never discard).
2. The tracker's data folder `/Users/ledogen/CodeShit/ledorepo/projects/cargame/` (§ The tracker). New owner input is a directory listing:
   `cd /Users/ledogen/CodeShit/ledorepo/projects/cargame && ls inbox | sed 's/\.reply//' | sort | uniq -u` lists inbox items with no reply yet;
   `ls owed/*.answer.json` lists answered owed items → `cat` each, act, record it in the ticket, then
   `mv owed/<id>.json owed/<id>.answer.json answered/`. Re-list after every relay: answers arrive while you work.
3. Four-line board summary to the owner, then drain the inbox. Each item, in order:
   - **Can it just be done?** (a wording, CSS, a number, a doc fix, a one-function change no lane is in) → do it on
     main, `npm test`, `git commit -- <paths>`, fast-forward the lanes. If a running lane owns the file, message it.
   - **Otherwise a ticket**: `.planning/todos/pending/<class>-<NN>-<slug>.md`, frontmatter `id`, `type`,
     `status: open`, `severity`, `opened`, `source: owner, <date> — "<their words>"`, `relates:`, a `lane:` line,
     `## What`, `## Acceptance`. Next free number: `grep -h '^id:' .planning/todos/*/*.md | sort -t- -k2 -n | tail`.
   - **Owner-only** (design, economy numbers, words in the world's voice; the owner writes dialogue, FEAT-148) →
     ask back in one line with a recommendation; never invent.
   Write each one's `inbox/<id>.reply.json` = `{"status": "done|ticket|question", "reply": "<hash / id + lane / the question>", "handledAt": "<ISO time>"}` (a `question` stays in the owner's open list until you rewrite the reply), and
   report each in chat as done (hash) / ticket (id, lane) / question.

## The lanes
| Lane | Worktree | Branch | Port | Owns |
|---|---|---|---|---|
| A — the run has a shape | CarGame-run-shape | feature/run-shape | 3731 | story.js, camp.js, dialogue, poi.js (camp type), story sections of main.js |
| B — the machine bites back | CarGame-machine + `CarGame-land-<ticket>` | feature/machine, land/bug-NNN | 3282 | damage.js, tire.js, recovery.js, parts.js, service*.js, data/parts.js, data/stock-weights.js, physics gates — and road-surface bugs it found (BUG-147/153/154/155) |
| C — content | CarGame-content | feature/content | 3774 | assets/, wip/, src/*-audio.js, data/items.js rows + thumbnails, items.md, FEAT-120/121 |
| Spare — front of mind | `CarGame-land-<ticket>` off main | land/<ticket> | 3887–3889 | whatever the task touches; tells the owning lane |
All worktrees are siblings of this checkout (`/Users/ledogen/CodeShit/`); each `node_modules` is a symlink to
main's. Mission-board code (offer-board.js, mission.js, paper-route.js, economy.js, the map card) is yours or
Spare's. Restart a dead server from its worktree: `npm run dev -- --port <port> --strictPort`.

## Landing
- **Check the base first**: `git diff --stat <lane's merge base> main -- src test data`. If main has code since the
  lane's gate run and it touches the lane's gates, the lane re-runs those gates before you merge.
- A and C: `git merge --no-ff <branch>`. B and Spare: their `land/<ticket>` branches (cut off main, cherry-picked;
  never merge feature/machine whole — it carries parked soak WIP). Single picks: `git cherry-pick -x`.
- Then ONE load-gated smoke on main, in the background:
  `while [ "$(sysctl -n vm.loadavg | awk '{print int($3)}')" -gt 15 ]; do sleep 60; done; tools/chrome-slot.sh node test/cdp-smoke.mjs > <log> 2>&1`
  **Never merge into main while a smoke runs** (this checkout serves the files). Agents never smoke.
- A step that fails at high load is a flake until it fails alone (`SMOKE_STEPS=boot,<step>`); a random-seed pad-step
  miss has twice been a real bug, so replay it with `SMOKE_PAD_SEED=<n>` first.
- Pass → fast-forward the lanes (`for s in run-shape machine content spare; do git -C /Users/ledogen/CodeShit/CarGame-$s merge -q --ff-only main; done`;
  a diverged lane merges main itself), close the ticket, and have the land worktree removed.
- **Never push** without the owner's word: pushing deploys Pages. origin = d7dc18e1 (pushed 11-08 on the owner's
  word); every landing since is unpushed. `npm run test:all` before a push or on request (no known red since 11-01).
- CPU: a shared 10-core Mac. Each lane ≤ 2 heavy processes; every headless Chrome through `tools/chrome-slot.sh`
  (two machine-wide slots). For a batch of landings, call a landing window (lanes hold Chrome, gates and soaks).

## The tracker (INFRA-11: local files, no artifact, no publish)
- **The owner's page** is the dashboard's home tab, http://localhost:8010/ (`npm run dash`; a SessionStart hook
  starts it). It polls the folder every 5 s, so a file you write shows up by itself. There is no page source to
  edit and nothing to publish.
- **The data** is `/Users/ledogen/CodeShit/ledorepo/projects/cargame/` — in the owner's PRIVATE repo, never in this one. One writer per file:
  | File | Writer | Contents |
  |---|---|---|
  | `inbox/<id>.json` | owner | `{text, at}` |
  | `inbox/<id>.reply.json` | you | `{status, reply, handledAt}` |
  | `owed/<id>.json` | you | `{kind: decide\|drive\|make, tk, blocks?, text, options?, order?}` — blockers render on top; `order` sorts within a group |
  | `owed/<id>.answer.json` | owner | `{choice, note, at}` |
  | `answered/` | you | owed pairs you have acted on (moved, not deleted) |
  | `lanes/<id>.json` | you | `{name, goal, wt, branch, port, owns, tasks: [{id, what, status: todo\|doing\|done\|blocked, note?}]}` — one line per task; delete closed rows |
  | `lanes/<id>.now` | you at spawn, the agent at stop | the one "now" line |
  | `lanes/<id>.handoff.md` | that lane's agent | its resume prompt |
  Write JSON with the Write tool (whole file). Never write a file the owner owns. The folder is committed and
  pushed by the ledorepo backup hooks; you never commit it.
- **Item setup** https://claude.ai/artifact/HUjbtiQTyByViNedWtxhpu — Lane C's; answers in db `answers` (e.g.
  `answers/_rarity`); its handoff `wip/_items-setup/HANDOFF.md`.
- **Mission-feel review** https://claude.ai/artifact/YHLoevQnoJ1y5BYmksVVVZ — done; Q-6 (courier countdown digits) unruled.

## Standing rulings you will be asked about
Pay reads "Pay $x – $y based on speed"; haul "Bundle costs · sells for"; "available for:" / "time limit:". Deeds
are numerals in the story blue; the run overlay is ONE box of promise lines showing the tier held and its own
condition ("DEED 1 · 18+ bundles"), "due in" in the top readout, a lost reward struck through; no letter on any
result card; the tip is speed on every type (fragile docks the base). The expedition camp is its own POI type; the
construction site stays a client. Freight earns at least ½ a deed. REPAIR_CAP 80 %, sport springs $15, hi-lift
torque 10.5 N·m/kg × ≤ 3 s, 5 s cooldown. Alpha = the 2500 m circle, a polished demo. No default seed (CLAUDE.md
§ Seeds). The owner never orders the lanes' work; you do. Later rulings live in each ticket and in memory
`project_rulings_2026_10_31`.

## Gotchas
- `zsh` aborts `for f in <glob>` with no match (use `bash -c 'shopt -s nullglob; …'`); write `"${T}:path"`, not
  `"$T:path"` (`:t` is a zsh modifier); zsh does not word-split `$VAR` (use `${=VAR}`). No `timeout` on this Mac.
- Python `re.sub` replacement strings eat backslashes: pass a function. In the page, `\uXXXX` works only inside
  script strings; the HTML lists need real characters.
- `git commit -- <paths>` always. The window title follows a worktree via
  `bash ~/.claude/skills/window-title/scripts/title.sh <path>`.
- Owner rules: n = 1 is not a calibration signal; a visual regression → revert first; fix the root, not the symptom.

## Current state (2026-11-13, after the INFRA-11 cutover; rewrite, don't append)
- **PERF HAS PRIORITY (owner 11-12, repeated 11-13): hold the lanes whenever the perf session needs a quiet machine.**
  The perf session is peer `cargame-70` (NOT your subagent; SendMessage it). PERF-43 is CLOSED by the owner and landed
  (main 8acdea46, `test:all --browser` 149/149, log wip/orch/testall-8acdea46.log). It now starts PERF-41 (terrain
  shader GPU cost) in `CarGame-perf41`, branch perf/perf-41-terrain-shader, port 8041, and will ask for a quiet
  window per Chrome GPU A/B.
  - **The hold drill**: it sends one line; you SIGSTOP the lanes' heavy node jobs (list:
    `ps -Ao pid,command | grep -E 'CarGame-(machine|land-[0-9]+|run-shape)/test/|test/drive-soak|test/run-all\.mjs --serial|wip/(feat|bug)'`,
    save the pids), check no chrome-slot job runs, reply "held", tell running agents to start nothing; on its done
    message `kill -CONT` the pids and message "released". Paused gates resume cleanly.
  - It no longer owns road.js's carve stack (PERF-43 closed); BUG-156 is yours to land. Still tell it before landing
    road.js / terrain shader changes. Tickets routed to it: BUG-164, PERF-46.
  - The owner lets it land and push its own work from its window. You never push without the owner's word to you.
  - Lane rule in every spawn prompt: ≤ 2 heavy processes; `pgrep -f 'node test/playtest-bench'` before a heavy job.
- **Main = 0f20d2cd; origin = be5da36e.** Unpushed (owner's word needed): PERF-43 close 8acdea46 · FEAT-198 +
  FEAT-200 a7837ddc (+ smoke fix 1f66acb7) · FEAT-197 0fca6cd4 · FEAT-195 692ceba5 · BUG-161 d2c5e2ef · BUG-156
  3ba37902 · BUG-161b 6739947a (WELD_SLOP 10 mm) · FEAT-199 a2922b9c (item reward = a choice, capped at the job's
  pay) · INFRA-11 5b8c0e88 (tracker = the dashboard's Lanes tab; not smoked, it touches tools/ and docs only).
  Each game landing smoked 26/26 (logs wip/orch/smoke-*.log).
- **INFRA-11 cutover DONE 11-13.** The artifact is dead state: never read or write it. Tooling peer
  `lanes-tab-dashboard` did it. Lane B's running agent holds the OLD brief: when it reports, write its handoff and
  now-line into `lanes/b.handoff.md` / `lanes/b.now` yourself, and update its rows in `lanes/b.json`.
  The lanes/*.json task lists were imported whole and are long: prune closed rows as you touch them.
- **Running**: Lane B agent — FEAT-201 (new game: one old tire on a front corner + an old spare; 50-seed gate) and
  FEAT-194 parts 1–2 (brake pedal never releases the parking brake; parked menus set it), worktree `CarGame-machine`,
  landing branch land/feat-201 (`CarGame-land-201`). Next for B: FEAT-196, then BUG-166 after `bug166-shock`.
- **Idle**: Lane A (FEAT-194 part 3 waits on `handbrake-clock`); Spare (nothing queued; feature/spare holds old
  unlanded docs/tests, so it needs `git merge main`, not a fast-forward); Lane C owner-gated.
- **Perf session**: PERF-41 in `CarGame-perf41`, not ready (the owner picks levers in its window: ~6 % terrain GPU
  cycles at the exact picture, ~14 % with baked noise). It will ask for a ~30 min bench hold.
- **Owed (25 files in owed/)**, newest: bug166-shock, handbrake-clock, bug160-numbers, bug163-ladder, feat199-price,
  feat196-wheel-repair. Not there: the owner's look at the hunger box (CarGame-run-shape/wip/feat198/*.png) and a
  real-mouse drag; hunger was once ruled "a word, never a gauge".
- **Tickets to tidy**: BUG-160 (closes on `bug160-numbers`) and BUG-161 (the owner's 2–3 s statue symptom is
  unexplained; wants a capture-key capture and whether fps dropped) stay in pending/.
- **Held branch**: FEAT-34 round 3 land/feat-34 @ e49bc289 (waits on `feat34-r3-look`; re-test on main first).
- **Worktrees**: `CarGame-bug67` needs the owner's `! git worktree remove --force`. Perf keeps `-perf37`, `-perf41`,
  `-perf43`, `-main0758`. Lighting pick keeps `-f180-preview`, `-land-feat180*`. In use: `-land-201`.
- **Clock note**: the machine clock is PST; agents' system date runs a day ahead. Git/mtimes are the truth.

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
- **Model and effort (DEC-193, owner 11-14):** physics and world-gen tasks `model: opus`, default effort. Routine
  tasks (UI restyles, number changes, bookkeeping, tooling) `model: sonnet`, `effort: medium`. Pace: at most two
  lane agents at a time, tasks sized ~100k and grouped by code area; ask the owner for the meter reading between batches.
- **The page's "now" line** = the one-line file `/Users/ledogen/CodeShit/ledorepo/projects/cargame/lanes/<id>.now`. At spawn write `running: <task> · since <HH:MM> · <agent id>`; the
  agent overwrites it with `stopped (<done|blocked>): <one line> · <HH:MM>` when it hands off.
- **On a report** (the agent's final message, ≤ 15 lines): LANDING → land it (below); OWED → one `owed/<id>.json` file each (§ The tracker);
  then spawn a FRESH agent for NEXT. Never SendMessage a finished agent to continue: that revives its whole
  context. Messages to a RUNNING agent are fine (an answer, an order); agents can SendMessage you as `main`.
- **Never idle a lane while owner-free alpha work exists** (owner 11-07: "what is everyone waiting on?"). With 10+
  owed items, give lanes pile-neutral work (gates, perf, closing on evidence, making a pending call cheaper).
- At most one agent per worktree. Lane C gets an agent only when an owner answer gives it work.
- **Your own context**: no watching and no "ready for a clear" message. Session auto-compact (400k, the owner's
  setting) is the backstop. A clear or a compact costs one word ("orchestrator") because nothing lives only in your
  context: an owner ruling goes into its ticket or a DEC in the same change, a spawn into its `.now` line, and
  § Current state is rewritten at each landing, spawn and owner answer. Before a merge or a smoke, write it into
  § Current state (branch @ hash, the smoke's log path), so a compact mid-flight resumes from the file.
- **Side work is a subagent too** (INFRA-14): a perf investigation, a tooling job (ledorepo), a one-off study. Spawn
  it like a lane, with its own `lanes/<id>.json` + `.now` line so the board shows it (e.g. `l` for ledorepo). The
  owner then needs one terminal. A separate window is the exception: work that needs a quiet machine (a PERF-40
  bench window) or days of its own context.

## On wake
1. `bash tools/lanes.sh` — every worktree's branch, ahead/behind, uncommitted files (a lane's WIP: never discard).
   A `lanes/<id>.now` line that says `running:` for an agent you are not running is stale: overwrite it with
   `stopped (blocked): <one line> · <HH:MM>`.
2. The tracker's data folder `/Users/ledogen/CodeShit/ledorepo/projects/cargame/` (§ The tracker). New owner input is a directory listing:
   `cd /Users/ledogen/CodeShit/ledorepo/projects/cargame && ls inbox | sed 's/\.reply//' | sort | uniq -u` lists inbox items with no reply yet;
   `ls owed/*.answer.json` lists answered owed items → `cat` each, act, record it in the ticket, then
   `mv owed/<id>.json owed/<id>.answer.json answered/`. Re-list after every relay: answers arrive while you work.
3. Four-line board summary to the owner, then drain the inbox. Each item, in order:
   - **Can it just be done?** (a wording, CSS, a number, a doc fix, a one-function change no lane is in) → do it on
     main, `npm test`, `git commit -- <paths>`, fast-forward the lanes. If a running lane owns the file, message it.
   - **Otherwise a ticket**: `.planning/todos/pending/<class>-<NN>-<slug>.md`, copied from
     `.planning/todos/TEMPLATE.md` (INFRA-09: fixed sections in a fixed order — Next steps, Summary, Tracker
     always; `source: owner, <date> — "<their words>"`; a `lane:` line). When you touch an older ticket, move it
     to that order. Next free number: `grep -h '^id:' .planning/todos/*/*.md | sort -t- -k2 -n | tail`.
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
  | `dives/<slug>.answers.json` | owner (the dive page) | `{status: opened\|partial\|submitted, openedAt, submittedAt, answers: {<question id>: {choice, note}}}` |
  | `dives/<slug>.taken` | you | empty file: "acted on"; the dive page goes read-only |
- **A deep dive** (INFRA-12) is an explainer that is also the answer form. Write one instead of a plain owed item
  when the call has more than one linked question, or a choice that needs a table or a picture. The document is
  `.planning/dives/<TICKET-ID>-<slug>.html` in THIS repo: copy `.planning/dives/TEMPLATE.html` (its comment has the
  rules), write plain HTML, and put a `<dive-q id="…" options="a | b | c">` under each explanation that asks
  something. Commit it, then point an owed item at it: `"dive": "<TICKET-ID>-<slug>"` in `owed/<id>.json` (its
  card shows the dive's status instead of buttons; give it no `options`). The ticket's page links it by itself.
- **Submitted dives on wake**: `grep -l '"submitted"' dives/*.answers.json`, minus those with a `.taken` beside
  them → read the answers, act, record each ruling in the ticket, `touch dives/<slug>.taken`, and move the owed
  pair to `answered/`. Never edit a dive's document after the owner has opened it: a follow-up is a new dive.
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

## Current state (2026-11-15 evening; rewrite, don't append)

Older state paragraphs: `git show dd6d07f1:.planning/handoffs/HANDOFF-2026-10-25-orchestrator.md`.

**Main:** 5efe7acb + docs, last full smoke 26/26 (wip/orch/smoke-1115j.log). NOT pushed (nothing since 736266b5).
**Landed 11-15 (all local):** small-1115, run-shape x4 (FEAT-184 errand, smoke fixes, FEAT-217 notes, BUG-178 smoke trace),
shopui-1115, BUG-173 (closed), gps-1115 (DEC-275), FEAT-221 exposure + BUG-174/175/177, PERF-49 (closed), BUG-176
(open until the owner rubs a rock), PERF-48 terrain bake hybrid on by default (DEC-234; off on Low, `?terrainBake=0`),
land/tutorial-1116 (snack errand: mom's $3, peanuts, eat at a camping area; manager's line; reset grace 20 m; both
anti-dodge gates; DEC-276, 277, 281, 282).

**RUNNING (spawned 11-15 ~16:45-17:30; one task each):**
- a · CarGame-run-shape · feature/run-shape · Opus: BUG-178 root fix. Cause is the game: the tow's faked park edge is
  spent by the first `_updateParkTriggers` poll before the shop is in reach (orchestrator's reading, to be verified);
  1 failure in 54 runs, so proof must be a forced repro, not a green streak.
- p · CarGame-perf · feature/perf · Opus: FEAT-180 fog cost ("confirm the suspect, then make it cheaper with the same
  look"). Its DEC: next unused >= 280.
**Lanes s, b, c, u free.** FEAT-34 gauge round 7 is built on feature/machine (e53ae2ad + 73a2165b, DEC-284; rounds 5-7
land together on the owner's approval, card feat34-r7-look). Tutorial cards filed: tutorial-test-drives (stays OPEN until
the owner signs off; act on each note), tutorial-lines (five placeholder lines + the $3 peanuts price).
BUG-179 minted (owner capture Logs/autos-capture-1794791342440.json, seed 1684703087: two legs diverge in height, tear
at the interface; replay reproduces; unplaced, a candidate for Lane C while BUG-171 waits).
Owner asked for a cost estimate of light shadows (bay light contained by walls; headlight shadows as a High+ option):
estimate given in chat, nothing built; fits the Spare queue with FEAT-223.
**Built, waiting on the owner:** BUG-171 option 2 on land/bug-171 (CarGame-content, src/road.js +8/-4, stacked on
land/bug-158b which is already on main). Dive BUG-171-option2-gore-steps + pictures are on main as docs; card
bug171-option2-look. The answer becomes DEC-260, then build the pick on land/bug-171.
**Queue:** FEAT-223, FEAT-224 (cost first). Lanes c, u free. Next free orchestrator DEC: 227-229, then 285.
**HELD:** PERF-50 (Windows machine), QUAL-33 (ask before changing T promotion), a PERF-40 bench window.
**Owed cards open:** bug171-option2-look, top-items-path, qual36-cash-line, feat215-arrow-look, lighting-bundle-look
(then close FEAT-221, BUG-174, BUG-175, BUG-177), bug176-rub, plus the older ones in owed/.
**Dev servers up:** :8000 main (loopback) · :8001 main on Tailscale (Windows: http://m4air:8001) · :3731 Lane A ·
:3885 Spare · :8010 dashboard.
**Gotcha learned 11-15:** agents can stall for hours on a background wait that never wakes them. If a lane is silent
past its expected time, read its log files; if the job is done, SendMessage it the log path and tell it to report.
**Worktrees:** CarGame-land-gps holds pictures for feat215-arrow-look (keep until answered); CarGame-land-176 can go
once bug176-rub is answered.

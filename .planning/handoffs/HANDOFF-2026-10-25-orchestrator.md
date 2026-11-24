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

## Current state (2026-11-24 01:30; rewrite, don't append)

**NIGHT OF 11-24 (the owner is away until ~07:00; cron check-ins at 04:41 and 06:41 in this session).** All 27 card answers and the 7 inbox notes are acted on and filed; `ls owed/*.answer.json` is empty.
- 04:41 check-in 2 of 3: no new owner answers, inbox empty, main clean and docs-only since smoke 6 (no smoke needed). BUG-259 agent alive, 2 WIP commits (recovery grade held to the design maximum; no earthwork over an underground junction). Nothing to land.
- 04:32: BUG-239 NOT reproduced headless (headless Chrome's audio clock does not advance; with the clock patched, the first and second start after a dialogue get identical gain commands). Card `bug239-starter-fade-facts` owed (input path; first start only or every dialogue). Probe scripts kept in main's wip/bug-239/. Lane p left EMPTY on purpose: the only owner-free task left is FEAT-224 (ambient occlusion cost study), a GPU measurement that needs a quiet machine, so it starts after BUG-259 stops and main's smoke is done.
- 04:28: TRACKER AUDIT (read-only agent, 156 tickets): most 'built on land/X, awaiting landing' Next-steps lines are stale, the branches are merged. Closed on evidence: BUG-198, BUG-199, FEAT-261, FEAT-275, FEAT-278 (and FEAT-284 earlier). About 45 more are on main and held open only by an owner look/drive box (e.g. BUG-181/189/196/197/218, FEAT-185/186/187/203/204/216/233/236/247/258/259/287/292): they close when their cards are answered; QUAL-36 still owes the missions.md type table. Truly unmerged: FEAT-180 rounds 4/5 (land/feat180-next, land/feat-180, land/feat180-dusk; card feat180-r5-look), land/feat-212 + land/feat-212b (check before deleting). Owner-free work found: BUG-239 (started, Sonnet, `land/bug-239-starter-fade` in CarGame-bug239, port 3891, lane p), then FEAT-224 (truck-only shadow caster study; check FEAT-223 first).
- 04:22: BUG-258 study REPORTED (proto/bug-258-jagged-edges @ 39952246 in CarGame-bug258; prototypes behind params that are all off, nothing lands). Card `bug258-jagged-pick` owed. Its fix (A) (a junction leg's bank cut off at the 36 m reach, a cliff up to 3 m, 27 per world) is in every option but 'leave it': build it after BUG-259 stops (both edit road.js) once the owner picks. BUG-261 minted for the other ground steps. BUG-241 measured: a rule question, card `bug241-clock-map-pick` owed, worktree removed. FEAT-284 closed (was on main since 11-18). BUG-241 repro agent (Sonnet) started: `land/bug-241-clock-map` in CarGame-bug241, lane p; facts + a rule card, no rule change.
- 04:16: FEAT-302 driveway rework REPORTED (proto/feat-302-pad-driveway @ 052cf2ed in CarGame-feat302, does not land). Card `feat302-driveway-rework-pick` owed: it asks the marking colour AND whether a driveway mouth may raise the shoulder (the story-poi gate's ratified rule fails at 6 of 24 770 probes; gate left untouched). BUG-259 agent (Opus) started: `land/bug-259-tunnel-x` in CarGame-bug259, port 3890, lane s. BUG-258 study still running (lane p).
- **On main, green at 012d3dcc** (smoke 42 steps `wip/smoke/smoke-1124e.log`, pad ALL OK `wip/smoke/pad-1124e.log`), play build :8002 rebuilt from it at 02:45: numbers batch (DEC-485..490), FEAT-318, FEAT-327 (DEC-492), FEAT-326 rock rest-cost, FEAT-299 (DEC-493), BUG-234 (closed; follow-ups BUG-259). Card `landed-1124-look` covers the lot.
- **BUG-260 GPS reroute also on main, green** (3a1cf7db, smoke `wip/smoke/smoke-1124f.log`), play build rebuilt 03:10, card `bug260-reroute-drive`; the ticket stays open for the drive.
- **Running:** c agent, FEAT-302 driveway rework on proto/feat-302-pad-driveway (CarGame-feat302; prototype, comes back as a sheet + pick card, touches road.js/road-carve.js/poi.js) · p agent, BUG-258 measurement on proto/bug-258-jagged-edges (CarGame-bug258; no src change, comes back as a sheet + pick card).
- **Owner's drive owed:** `feat326-boss-proto-drive` — the boss slide prototype, proto/feat-326-boss @ 74a8e2c3 in CarGame-rockcost, dev server :3889 left up for it. Slice 2 (tuning, pad binding) waits on that drive.
- **Queued:** BUG-259 tunnel X junctions (Opus; touches road.js, so start it only after the FEAT-302 agent stops). Then nothing owner-free is queued: mint from the ratified backlog (memory feedback_no_idle_lanes).
- **Lesson:** a lane's gates do not read main.js or the smoke's expectations; `node --check` every changed file before merging, and a ruling that changes a default needs its smoke/pad-e2e assertion updated in the same change. Three smokes were lost to that tonight.
- **FEAT-326 research is DONE and on main** (ticket § Research; harness test/rigid-body-ceiling.mjs). Cards feat326-rock-count-pick and feat326-collider-pick ask the owner; the boss prototype lane waits on them. Next free DEC: 494.


**Main** (head: `git log -1`; this section was written at 1be0b280 + this docs commit). origin/main is still 63217458 (11-18): NOTHING pushed since. Play build :8002 = main.

**Landed on main 11-22..24** (newest first): 1be0b280 seed link prefills the seed box (DEC-483) · e29b4135 BUG-257 run log in free roam · c80df6c5 PERF-55 bench `--quality=` / `--window=` + the preset cost ticket · 40fd8a1f run-log reader stitch fix · 3cfd64bf BUG-256 smoke opening flake · 3431dedb notes-1122 (BUG-255 shop scroll, DEC-482 air filter halved) · 1e6251d8 run-log reader grades fragile/haul on their own axis. Earlier (11-20..22) is in `git log`.

**THE ARC TRIAL (the owner's active thread; read both tickets first).**
- The owner wants a run in three parts: maintenance days → upgrade days → boss. The current flow is named **"the 5-mission expedition camp"** and stays untouched on main. The redesign's working label is "arc trial"; the owner names it later.
- **FEAT-325, the first trial build**: branch `proto/arc-trial` in `/Users/ledogen/CodeShit/CarGame-arc` (head 0cdfff99), served at **http://m4air:8005** (`python3 -m http.server 8005 --bind 100.111.133.99 --directory wip/play-build`, cwd CarGame-arc; rebuild = `npm run build && rsync -a --delete dist/ wip/play-build/` there). Gates, smoke and pad green at 408198fe; the DEC-483 cherry-pick on top was not re-smoked. Four Old tires 40–60 %, shocks/springs 30–50 % with doubled life, I4 start at −10 % (188 N·m), V6 always in the shop at $60, tires $6/$10/$15/$15, seven power mods (sliders in the debug panel), instant duct tape and zip ties. The ending is still the 5-mission camp. It contradicts DEC-408, DEC-441, DEC-302 on the branch on purpose: write superseding records ONLY if the owner adopts the trial. Never land it on main without the owner's word. All new part names/descriptions are placeholders awaiting the owner's wording.
- **Waiting on the owner:** card `feat325-arc-trial-play` (order 1): play :8005, send the run log. The log sizes the boss clock and the mod prices (n=1 is a sizing guide, not a calibration).
- **FEAT-326, the blasting-run boss**: DESIGN ONLY, settled over nine question rounds, all in the ticket with the owner's quotes. One pass-or-fail mission: reach a cut-off party past five rock slides on a constant-par road stretch, 12 charges, blast and thread the gap before nightfall, retriable, off the road 25 m for 5 s or a reset fails the attempt, rubble deleted on completion, a preparation card (truck + food) first. New oblong stackable rocks in ~7 sizes; the round rocks stay for the live slide. The owner cleared DEC-425 ("we can change or remove dec-425"): the change that builds the boss writes the superseding record. Prototype first, then the owner drives it.
- **Running:** the rigid-body ceiling research (worktree `/Users/ledogen/CodeShit/CarGame-rb`, branch `scratch/feat-326-rigid-body-ceiling`, measurement only, no `src/` change). Its report lands in a `## Research` section of the ticket ON THAT BRANCH; bring that docs section to main, relay the recommended rock count, then brief the boss prototype lane (Opus). If the agent is gone after a clear, read the branch: its harness and findings are committed there.

**PERF-55 (answered the owner's "why does High lag on the M4 Air"):** resolution, not shadows. At the owner's full-screen canvas High renders 3420 × 2214 and pins the GPU (45 fps, 14 W, heavy thermal pressure in 2 min); Normal is 60 fps at under half the GPU. 76 % of High − Normal is resolution, 0.4 % shadows. Card `perf55-high-res-pick`: cap High at 1400 lines (recommended) / 1600 / native. No preset number changes without the owner. `pmset -g therm` reads nothing on Apple silicon; the bench reads thermal pressure through notifyutil.

**On branches, not landed:** `land/smoke-fake-audio` @ aadc2879 (trial inconclusive) · `proto/feat-302-pad-driveway` @ 0ce5dbd7 (tutorial-seed gate red; card `feat302-pad-sizes-pick`) · `proto/bug-64-walls` (docs; card `bug64-walls-pick`) · `land/bug-234-x-junction` @ eca35cd3 (card `bug234-built-drive`, dev server :3282 kept for it) · `proto/feat-299-camp-run` @ 5158a851 · `land/wave2-1120` @ 84183427 · `scratch/perf-55-levers` (never lands). Merged and removable once the owner answers `worktree-cleanup-pick`: 13+ worktrees, plus CarGame-bug257, CarGame-perf55, CarGame-seedlink.

**Servers running (11-24):** 8000, 8001 (main dev), 8002 (play build), 8005 (arc trial), 8010 (dashboard), 3282 (BUG-234 drive). Every other lane server was stopped at the owner's word on 11-24; start one only when a card needs it.

**Waiting on the owner** (`ls owed`): feat325-arc-trial-play, perf55-high-res-pick, bug257-runlog-look (open: should the debug switch log free roam at all; DEC-481 is silent), feat302-pad-sizes-pick, bug64-walls-pick, worktree-cleanup-pick, bug234-built-drive, feat299-camp-run-pick, feat318-poi-regions-look, perf54-map-backdrop-rate, bug208-camp-highlight-pick, the look/confirm cards. Also open in chat: whether worn tires/dampers/springs should alert; balance tweaks wait for more run logs (FEAT-69 holds two logs of the owner's run and the point that gear has no pull, which the arc trial answers).

**Bench rule:** always `--fake-audio`. Compare GPU by active cycles, never watts. To reproduce the owner's screen use `--window=1710,1194`.

**Next free ids** (verify by grep): DEC-484 · BUG-258 · FEAT-327 · PERF-56 · ASSET-93 · QUAL-37 · INFRA-16.

**Lessons:** a full browser smoke takes ~19 min here: never cap one under 25 min. A lane that leaves a detached smoke behind has broken its brief; wait on the pid, do not start a second. `?seed=` pins the world and (DEC-483) prefills the seed box; it never starts a run. A stitched run log needs `tools/run-log-summary.mjs` given both files. Merge in separate small commands. In zsh `for x in $var` does not split. A `git merge --no-commit` then an edit leaves that edit unstaged: `git add` it. Finished subagents can be closed with TaskStop when they still show as held open.

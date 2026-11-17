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

## Current state (2026-11-17 03:30, second night intake; rewrite, don't append)

Older state: `git show 96af103c:.planning/handoffs/HANDOFF-2026-10-25-orchestrator.md`.
Worktree: `CarGame` (main), dev servers :8000 loopback / :8001 Tailscale, play build :8002 (below).
**Owner, 03:10:** "keep the agents busy for at least a couple hours… Feel free to take it all the way up to 100% usage
tonight. I have a reset in the pocket." So the two-agent cap is OFF for tonight: one agent per free worktree, grouped by
code area. A one-shot timer fires at 07:13 with the word "orchestrator" (session-only cron).

**Main:** 53cc3b6b + docs, NOT pushed. **SMOKE RED on main (04:00):** step "service" fails alone
(`SMOKE_STEPS=boot,story,service`: "the corner swap did not queue on the cart"), after merging land/pad-menus (ac4a06c2)
and land/missions-1117 (53cc3b6b; one conflict in `_updateParkTriggers` resolved by hand). A Sonnet agent in
CarGame-land-gps on land/smoke-service-fix is finding the cause (game or smoke). LAND NOTHING ELSE until it is green,
and never merge while a smoke runs (the 03:22 smoke died to exactly that). Last green smoke: 9b6e3daa
(wip/orch/smoke-1117-abs2.log); play build :8002 = 9b6e3daa. Landed tonight: e7239312 offer card "from" · BUG-191 ABS
(6a74de22; card bug191-abs-drive) · DEC-367 cooler ×1/4 (6c4280e8) · pad/menu batch FEAT-252/254/255, BUG-192/193 (card
pad-menus-look; DEC-368/369 are DRAFT) · missions batch FEAT-256/257, BUG-194/195 (card missions-1117-look; DEC-370/371).
BUG-199 ticketed (run log part lost to Chrome's multiple-download block).
**RUNNING (six agents; each mints its own tickets from the ids given, writes one owed card, never lands):**
- Lane A, CarGame-run-shape, land/tut-round3 (Sonnet): make tutorial round 3 landable = economy unchanged by the day
  renumber (day 0 tutorial, runs start day 1) + the smoke's card steps. Round 3 itself is built @ b69b124b, DEC-359..363.
- Lane B, CarGame-machine, land/bug-179 (Opus): finish chained forks: the seed-4243617325 regression (1.5 → 25.3 m), the
  dead-end spurs, 10th example, sheet, fingerprint, card bug179-chained-forks-look. Owner signs off BEFORE main (DEC-366).
- UI batch 2, CarGame-spare-base, land/ui-1117 (Sonnet): FEAT-248 UI scale, FEAT-262, FEAT-263, gradient, plot labels,
  white 10 % line. DEC-383..384. Card ui-1117-look.
- Budget, CarGame-land-211d, land/feat-69-budget (Sonnet): the FEAT-69 dive answers (300 kg freight line, the two lists,
  oil change $6, pace). DEC-385..390. Card feat69-freight-lists.
- Lane p, CarGame-perf, land/machine-1117 (Opus): FEAT-258, BUG-196, BUG-197, FEAT-204 (toolbox out, light bar on high
  beams, part masses), FEAT-259 (standard tires + stock turnover; numbers to the owner). DEC-372..375.
- Lane C, CarGame-content, land/food-1117 (Opus): FEAT-250 hunger counter (+ cooler stack slots, 24 h spoil, $0.35/h),
  FEAT-260 store foods, BUG-198 three free meals, FEAT-261 coffee. DEC-376..382. Card food-1117-numbers BLOCKS landing.
**LANDING ORDER when they report:** most touch src/main.js, so land one at a time, each merging main first, one smoke
each (or one smoke per pair if the diffs are disjoint). Lane A first (tutorial), then U, s2, p. Lane B and Lane C wait
for the owner (sign-off / numbers).
**QUEUE (tickets NOT minted yet unless an id is shown; next free ticket ids FEAT-262.., BUG-199..):**
1. UI batch 2 (Sonnet): FEAT-248 UI scale Small/Big · sharper main-menu gradient (inbox aktp) · centre-softening plot axis
   labels "axis" + "steering" (7ehx) · FEAT-262 maintenance menu names the tire type (o1a3) · FEAT-263 diagnostic screen
   reachable from the maintenance menu (lfg2) · the 10 % line on the fragile damage indicator white, not gray (fw8s).
2. FEAT-235 cluster (Sonnet; land/feat-235 = V1, land/feat-235-r2 = V2): back to V1 + V2's ignition location and frame
   shape, V1's two-tone pod/gauges, bottom notch narrower, left pod bottom edge down (owed/feat235-cluster-r2-look.answer.json).
3. FEAT-69 dive (SUBMITTED, no .taken): S line for a player 30 % slower · freight deed line 300 kg, median freight job
   300 kg, pay scales with weight: SEND the list of freight ideas above 300 kg + how many are needed, and all freight
   under 50 kg · pace 1.5–2 jobs a day · oil change $8 → $6 · run length 6 until the recorded run.
4. Tutorial round 4 (after A lands): seed re-search for a gentler Larry's → gas station grade (Opus) · mention in the
   tutorial that time does not pass while parked with the handbrake (answered/tutorial-test-drives.answer-2026-11-17b.json)
   · his answers to the three questions on the tutorial card.
5. FEAT-264 campfire dead after > 2 h of sleep (no flames, no smoke) + ASSET-90 an ash-only campfire model, no logs (j5xw).
6. FEAT-247 pad vibration for everything (card with reproduce steps) · FEAT-246 chase-camera collision.
7. FEAT-249 shade past the far shadow map (Opus) · FEAT-251 lawn furniture knocks over (Opus).
**BUILT, HELD for the owner (not on main):** land/feat-243-particle-shade @ 069b416f (CarGame-spare): dust/smoke/spray
read the far shadow map (round 2). Card feat243-particle-shade-look; his answer file there is blank (opened only).
**Waiting on the owner:** the owed pile. feat242-runlog-try and feat243 answer files are blank. BUG-189 pad check.
**Owed by the orchestrator:** (1) PERF-40 bench re-run (host audio clock stalled; `sudo killall coreaudiod` is the
owner's). (2) Lane-table rows in MILESTONES.md for FEAT-230, 231, 233, 236, 238, 223, 239, 241..264. (3) Register
test/pad-e2e.mjs in the smoke's browser run. (4) A stale shell loop from 11-14 in CarGame-spare: harmless, left alone.
**Play build for the owner's Windows machine:** http://m4air:8002 = a FROZEN production build of main ea373576 in
`wip/play-build/`, served by `python3 -m http.server 8002 --bind 100.111.133.99 --directory wip/play-build` (started by
the orchestrator; it dies with a reboot). Refresh on his word: `npm run build && rsync -a --delete dist/ wip/play-build/`.
**Next free DEC:** 391 (332-336 unused; 372-390 are handed to tonight's agents, see RUNNING).
**Gotchas (keep):** (1) agents stall or re-report in loops on background waits: ask for ONE report, TaskStop a finished
agent that keeps waking, above all when a new agent shares its worktree. (2) Owed and dive answers save as the owner
types: act only when the file is 3 min stale. (3) DIVE answers land in ledorepo `dives/<slug>.answers.json`: at every
intake list those with no `.taken` beside them (a submitted dive sat a day unseen on 11-16); `partial` = not submitted.
(4) Give each agent explicit DEC ids, and check new record files are git-ADDED (an agent left three untracked and
main's check failed). (5) A smoke can time out or misread under 4+ agents: re-run alone before believing it.
(6) test/gpu-reset.mjs defaults to port 3885 (the spare lane's server): pass the port of the checkout you mean.
(7) Dialogue cards stream in: a key press on a streaming card only fills it; the smoke's card reader dedupes for that.
(8) Never kill caffeinate; no broad kill/pkill (the permission system refuses it).

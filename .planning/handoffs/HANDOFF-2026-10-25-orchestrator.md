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

## Current state (2026-11-13, after the INFRA-11 cutover; rewrite, don't append)

**Decision records (INFRA-10, on main 14aaa9da):** `.planning/decisions/dec-NNN-*.md` are the ground truth and beat
DESIGN.md, tickets and memory (owner 11-13, per the ledorepo session). A new owner ruling (chat, owed card, a taken dive)
becomes a DEC in the same change that acts on it; a standing record is frozen, a change of mind is a new DEC with
`supersedes`. Check: `node tools/dashboard/decisions.check.mjs`.

**TOKEN CAP (owner, 11-14 ~03:25): hold lifted ("start the lanes", plus the ledorepo agent for INFRA-14, "dont back up
wip"), then: "try to keep it token lean stop at 40% weekly usage (weve used 30% since the reset 15hrs ago)".** The
orchestrator cannot read the usage meter. So: the five agents below are the whole batch; spawn NO follow-up agent
without asking the owner where the meter stands. Land what they report, yourself.

**Agents (pace: two at a time, DEC-193 for model/effort):**
- RUNNING Spare (CarGame-land-211d, Opus): the map bundle (FEAT-211/210, BUG-163 line, FEAT-199 pricing). DEC 175–184.
- RUNNING B (new CarGame-land-phys, land/phys-1114, Opus): BUG-168 speeds, BUG-166, BUG-160 wheel damage, BUG-167,
  one commit each. DEC 167–172. Their four cards are already in answered/.
- DONE A: FEAT-184 landing 2 SLICE 1 on feature/run-shape @ 5b3301eb (gates 9/9; NOT landing-ready, do not merge).
  DEC-153, 155–160. Dives marked taken. Next agent = slice 2 (list in lanes/a.handoff.md and the ticket's Next steps);
  start it when Spare reports. Owner card: tutorial-slice2 (Larry's words, DEC-158 reading, the 24 h filler).
- DONE Perf: frame cap + PERF-49 merged. Next: the terrain bake prototype (Opus). Owner card: perf49-physics-budget.
- DONE B (first task): cart + My Items tree + spacing merged; owner card feat212-cart-look. CarGame-land-212c/212d
  hold the look pictures in wip/: remove the worktrees only after the owner has looked.
- DONE ledorepo: INFRA-14 closed. INFRA-13 waits on the owner (Time Machine).
Orchestrator DECs used: 190–193; next free for it: 194.

**Main:** cart smoke fixed (test-only) and green on boot,story,service. Merged feature/perf (frame cap) + land/feat-212d; FULL smoke in flight, log wip/orch/smoke-capshop.log: check it. Old line follows.
(check it passed 26/26). Not pushed. Closed 11-14 on card answers: BUG-140, FEAT-193, BUG-154, FEAT-209. Tickets
minted: FEAT-215 (GPS U-turn arrow, Spare), FEAT-216 (damage alerts, B). Inbox fully replied; 2gdr (FEAT-204, "4x more
slots": 4 more or 4 times?) still waits on the owner. DEC-136, the :8001 Windows server and the Tailscale-only
dashboard are as before (see git log e3b0584a for detail).

**Answered cards still in owed/ = the queue (answers inside; move each to answered/ when an agent takes it):**
- B: bug166-shock (yes, a crash breaks it), bug167-creep (fix it), bug168-speeds (40 / 65), bug160-numbers (wheel
  damage at 50 % above the spring-damage energy; "24 and 4 are fine": check the slider), feat34-r3-look (wider, bigger
  gauges, convex top), FEAT-216, the diagnostics engine glyph (inbox oc8a: squatter V6), FEAT-213, 203, 207.
- Spare: feat180-pick (the rebuild wins; long tuning note; worktree .claude/worktrees/agent-a963…, servers :3887/:3890
  can stop), QUAL-36 dive (submitted, NOT taken), FEAT-215, feat131-listen (remove the music bed, DEC-192), FEAT-214.
- Perf: perf48-terrain-bake (build the prototype).
- C: feat182-try (backpack flavour text should hint at the daypack's function).
- feat202-look came back empty (no choice, no note): asked the owner to confirm "no change".
- A after this task: INFRA-15 (parked, repro in git show fac4aebe), FEAT-205.
Unanswered cards: bug92-usb, feat120-clips, feat120-straps, feat167-descs, givers-lines, pad-test, run-review.
Lesson kept: a census with worker pools blew the 2-heavy cap (load 54) and failed main's smokes.

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

## Current state (2026-11-24 23:00; rewrite, don't append)

**NIGHT OF 11-24/25. The owner is asleep.** His words at 22:55: "file arc · check in every hour and make sure nothing silently stalls · rb is fine · dont push · lift the hold". Hourly cron eae1bcac (minute :17, this session only). NO PUSH. The older bullets below this block are history from 11-24; where they disagree with this block, this block wins.

- **00:00 — BUG-258 (A) MERGED (0476fa73), smoke RUNNING:** its 103 affected gates were green; fingerprint vs main differs in surface + carve (expected), water in 3 windows and props in 1 (ground height near junction banks moved; network, profiles, junctions, poi, tiles identical). On main now, unsmoked until this run ends: BUG-265 (7eb28163) + BUG-258 (A). Smoke logs `wip/smoke/smoke-1125a.log`, `wip/smoke/pad-1125a.log` (the background job first runs `--only=junction-bank-cliff`). When green: rebuild :8002, one look card covering both (BUG-265 for the owner's pad; BUG-258 (A) with the cliff counts 45/61/46 → 0, worst 6.41 m). If it freezes in step 1 again, check the load first.
- **BATCH `land/batch-1125` (CarGame-batch) = main + BUG-241 (61653eb8) + FEAT-182 packs (f2abe5a5, DEC-500) + the BUG-263 test pin (0c87c130).** Its full affected gates are RUNNING in the background, log `CarGame-batch/wip/gates-batch.log`. When green AND no smoke is running: merge `land/batch-1125` into main, `node --check`, smoke + pad-e2e, rebuild :8002, then cards: a look card for the packs that also asks the open question (the page's "rare roadside find" has no system in code: build one or drop it?), a drive card for BUG-241.
- **Boss slice 2 DONE:** proto/feat-326-boss @ 76d2f72d (CarGame-rockcost, :3889 up), 8 static rocks a side out to ±24 m, 48 of 48 drive-arounds held, proof + 16 gates green; drive card `feat326-boss-slice2-drive` owed (order 1); DEC-499 (RB tap throws). Next for the boss: the route pick (a slide needs a hillside or a drop beside it).
- **AGENTS RUNNING (2):** s agent, BUG-259 slice 3 (Opus, `land/bug-259-tunnel-x` in CarGame-bug259, started 00:00) · c agent, BUG-264 campfire light (Sonnet, `land/ui-small-1125` in CarGame-uismall, port 3893; FEAT-328 and FEAT-329 follow on the same branch, one agent each).
- **BUG-263 NOT REPRODUCED:** shelf, cart and subtotal all scale on day 5 on main and on the arc build; card `bug263-shop-price-facts` owed (a saved-and-resumed run is the path not checked). Its test pin `land/bug-263-shop-price` @ 0c87c130 (test/service.mjs + a new smoke step `shopprice`) is to be merged with the NEXT batch, never while a smoke runs (it edits cdp-smoke.mjs).
- **Answers filed 23:44:** `landed-1124-look` "All good" (FEAT-327 closed) · `feat305-tutorial-r5-play` "Good: land it" (already on main; its four questions unanswered) · `run-review` removed at the owner's word · packs: "use my numbers where possible".
- **QUEUE, road.js jobs, ONE at a time, Opus (after slice 3):** BUG-262 (DEC-495) → the BUG-258 follow-up measurement (edges AGAINST THE SKY sheet; stream census for fix (B): "does it boost stream formation 30%?"; no src change) → FEAT-302 rework 3 (DEC-498, CarGame-feat302) → BUG-261.
- **QUEUE, small fixes, Sonnet, one beside the road job:** BUG-264 → FEAT-328 → FEAT-329 → INFRA-16 (plan first, the plan is an owed card) → FEAT-224 (needs a quiet machine).
- **ARC TRIAL** (proto/arc-trial in CarGame-arc, :8005): main merged in at c699e388, then the owner's run changes (see the FEAT-325 ticket log on that branch). The merged build has NOT been smoked: run `tools/chrome-slot.sh node test/cdp-smoke.mjs` in CarGame-arc when the machine has room, and fix what it shows on that branch. Card `feat325-arc-trial-play` filed.
- **Owed cards now:** `landed-1124-look`, `bug260-reroute-drive`, `bug239-starter-fade-facts`, plus the older ones. Next free ids: DEC-501 · BUG-266 · FEAT-330 · INFRA-17.

- **Main is green at d3a3a692 + docs** (smoke 7: 42 steps, zero console errors, `wip/smoke/smoke-1124g.log`; pad-e2e ALL OK, `wip/smoke/pad-1124g.log`). Play build :8002 rebuilt from it at 06:02. origin/main is still 63217458 (11-18): NOTHING pushed.
- **Landed overnight** (newest first): BUG-259 slice 1 (d3a3a692, DEC-494, gate `tunnel-x-junction`: no earthwork over an underground junction, no terrain through the X, recovery grade 48 % → 24 %, chamber tunnel-dark) · BUG-260 GPS re-plan off route (3a1cf7db) · BUG-234 X junctions · FEAT-299 camping areas (DEC-493) · FEAT-326 rock rest-cost · FEAT-327 Big UI notes (DEC-492) · FEAT-318 · the numbers batch (DEC-485..490) · DEC-484, DEC-491.
- **ARC TRIAL (proto/arc-trial in CarGame-arc, :8005 rebuilt 11-24 night) — the owner played run autos-run-3996330376 (broke on day 5 after a flip) and ruled in chat; all applied on that branch ONLY and logged in the FEAT-325 ticket there:** shop always stocks the Standard tire instead of the Old one, plus stock pads and shoes, plus the Rucksack ($20) · tire labour $3 loose / $1 mounted or corner swap (HUB 0.5, BEAD 1) · Standard tire $8 · tire slip wear × 0.75 (durTire 25680) · air filter $2.50, oil change $4 · heated beans 5 h at $1.25, cooked groceries 12 h at $2.95 (prices moved to keep DEC-407) · worn springs/shocks alerts w15..w18 (words [DEFAULT], NOT driven in a browser). These contradict DEC-408 and narrow FEAT-216 for the trial; records are written only if the trial's numbers are kept. New: BUG-263 (shop shows the day-1 part price), card `feat182-packs-figures`.
- **Intake 22:30, tickets minted from the inbox (all replied):** BUG-264 campfire light above the pot · BUG-265 (major) RB on the result card closes it · FEAT-328 POI name on its map card · FEAT-329 map zooms out a little further · INFRA-16 merge the item setup page into the tracker's Items tab. Routine lanes (Sonnet), BUG-265 first. **FEAT-182 packs:** the owner filled the item setup page; figures are in the ticket (§ Owner's figures); the Rucksack's price and shelf conflict with DEC-487 and tonight's chat, asked in chat; build (Sonnet) once answered, with a decision record. Next free ids: DEC-501 · BUG-266 · FEAT-330 · INFRA-17.
- **HEAVY-TESTING HOLD (owner, 19:32: "hold any heavy testing i wish to play the 8005 build").** Both agents were messaged to kill their gate / proof runs and pause; no gate, smoke, census or browser job starts until the owner says the play session is over. Light work (docs, cards, code edits) is fine.
- **BUG-258 (A) is BUILT, gates PENDING (paused by the hold):** `land/bug-258-bank-cliff` @ 4c48e68b in CarGame-bug258a. New gate `junction-bank-cliff` fails on main 3/3 (45 / 61 / 46 cliffs, worst 6.41 m) and passes on the branch (0 cliffs, deck 0.000 m). When the hold lifts, in CarGame-bug258a: `node test/fingerprint-world.mjs --out=/tmp/fp-b.json --compare=<a fresh main fingerprint>` then `node test/run-all.mjs --serial --changed=src/road.js,test/junction-bank-cliff.mjs,test/gates.mjs,test/bug258-crease-census.mjs > wip/bug258a-runall.log` (105 gates, 1.5–2 h serial); then `node --check`, merge, smoke + pad-e2e, rebuild :8002. The other steps it saw (up to 9 m, 30–40 m off the road) are BUG-261's.
- **FEAT-326 boss slice 2 is BUILT, UNMEASURED (paused by the hold):** proto/feat-326-boss @ 18fadd9f in CarGame-rockcost (main merged in), live on :3889. Three static shoulder rocks a side (3.0 × 1.5 × 1.95 m vs the largest loose rock 2.4 × 1.2 × 1.56 m), pile poured on the 10 m asphalt with a 2.5 m fill (a guess), `BOSS.cooldownS` 3 s with a readiness line, RB tap throws. RB CLASH for the card: RB is already the handbrake / park tap (Professor) or the side menu (Ventura Highway); a hold past 200 ms still does that, a quick tap during the boss no longer parks. When the hold lifts, in CarGame-rockcost: `node test/boss-slide-proof.mjs --reps=1 --sites=4 > wip/feat-326/block-after.log` and `node test/run-all.mjs --serial --changed=src/boss-slide.js,src/main.js,src/debug.js,test/boss-slide-proof.mjs > wip/feat-326/gates2.log`; put the after-numbers into `wip/feat-326/card-2.json`, then write it as the owed drive card.
- **`bug259-slice2-weld-pick` FILED from chat (owner 19:50: "for bug259 take the answers from the conversation we just had"):** DEC-495 + slice 3. Owner 19:55: "sure land it now (after i lift the hold)". FIRST job when the hold lifts: merge `land/bug-259-tunnel-x` @ the slice-2 head (gates 102/102 green; the branch also carries the slice-3 ticket note), `node --check`, gate `--only=tunnel-x-junction`, smoke + pad-e2e, rebuild :8002, look card.
- **Intake 19:32, filed:** `bug241-clock-map-pick` → option 1, DEC-497 (map open while stopped under 5 km/h holds the clock); small build queued (a `clockHeld` input + a gate in test/park-brake.mjs) · `bug259-slice1-look` → "Good" · `feat302-driveway-rework-pick` → "Change", DEC-498 (inherit the ground texture or gravel; driveway is a physics surface; allowed through the story-poi check; meets the POI parking lot; lone trailer home gets a parallel level driveway with sloped ends); rework 3 queued, ticket Next steps updated. Next free ids: DEC-499 · BUG-264 · FEAT-328.
- **HOLD LIFTED (owner, 19:15: "go").** Answers taken at 19:17 and filed: `bug258-jagged-pick` ("Build (A) only … put it on main"; "the sheet is useless i need to see the jagged edge against sky"; "2 new streams appearing in 6 spots is worrying (does it boost stream formation 30%?)") and `feat326-boss-proto-drive` (DEC-496).
- **RUNNING (2):** p agent, BUG-258 fix (A) the junction bank cliff, for landing: `land/bug-258-bank-cliff` in `/Users/ledogen/CodeShit/CarGame-bug258a` (Opus). On its report: `node --check`, merge, its gate, smoke + pad-e2e, rebuild :8002 · c agent, FEAT-326 boss slice 2 (static shoulder rocks, the pile blocks the road, 3 s throw delay, RB throws): `proto/feat-326-boss` in CarGame-rockcost, dev server :3889 stays up, PROTOTYPE, never lands; comes back with a drive card draft `wip/feat-326/card-2.json`.
- **QUEUED, in order (road.js, so one at a time):** BUG-259 slice 3 (owner 19:30: "a lot of the road surface inside the tunnels is covered by ground texure / there is z fighting. make an effort to clean that up too"; on `land/bug-259-tunnel-x` on top of slice 2, ticket updated ON THAT BRANCH; Opus; census tunnels on random seeds, no seed was given) → BUG-262 (the owner's "go" was for it; Opus; start when BUG-258 (A) has landed) → the BUG-258 follow-up measurement the owner asked for: a sheet of the jagged edge AGAINST THE SKY (silhouette views) and a stream census for fix (B) on ~50 random seeds answering "does it boost stream formation 30 %?" (no src change) → BUG-261. Not road.js, can run beside one of those: FEAT-302 rework 3 (Opus, CarGame-feat302; it does touch road carve code, check before pairing) · BUG-241 build (Sonnet).
- **BUG-259 slice 2 is BUILT, NOT LANDED:** `land/bug-259-tunnel-x` @ c5a9a748 in `/Users/ledogen/CodeShit/CarGame-bug259` (5 commits ahead of main). Pad paved to the legs' asphalt (reach past a lane edge 1.57 / 7.29 / 4.37 m → 0.00), gravel shoulder round the chamber, tubes meet on the bisecting miter plane (`tubeMiterPlane`), gate `tunnel-x-junction` checks 7-9. It conflicts with DEC-068 at the 3° crossing (seed 2280440363 near (19, −42)): 0 of 4 legs welded, main had 2 of 4. Card `bug259-slice2-weld-pick` asks. Its full affected gate set is GREEN, 102 of 102 (log `CarGame-bug259/wip/bug-259/gates-s2-full.log`, finished 18:53 after the machine slept through the day). To land after the pick: `node --check`, merge, smoke + pad-e2e, rebuild :8002. Unminted: a ticket for sunlight reaching inside bores (seam line at 1960791808, lit wall at 2280440363, both also on main).
- **BUG-262 minted with DEC-495 (owner, 11-24 evening, in chat):** a crossing under the 12° near-parallel limit merges into one road, underground too; an underground junction sits at least 10 m from a portal. The 3° X on seed 2280440363 is the case. Queued for an Opus lane once the hold lifts; it is the root fix behind card `bug259-slice2-weld-pick`. Also answered and NOT yet acted on (hold): `feat326-boss-proto-drive` — "def too easy to drive around the slides."
- **Lane p is empty.** The one owner-free task left is FEAT-224 (ambient-occlusion cost study, FEAT-223 is closed): a GPU measurement that needs a quiet machine.
- **New cards owed tonight** (all written): `bug259-slice2-weld-pick` · `feat302-driveway-rework-pick` (marking colour + may a driveway mouth raise the shoulder: the story-poi gate's ratified rule fails at 6 of 24 770 probes, gate untouched; proto/feat-302-pad-driveway @ 052cf2ed in CarGame-feat302, does not land) · `bug258-jagged-pick` (the owner's site is natural knife ridges, not earthworks; fixes A/B/C; proto/bug-258-jagged-edges @ 39952246 in CarGame-bug258, prototypes behind params that are off) · `bug241-clock-map-pick` (a rule question: only the latched brake holds the clock, the map does not) · `bug239-starter-fade-facts` (not reproduced headless; needs the owner's input path; probe scripts in main's wip/bug-239/) · `bug259-slice1-look` · `bug260-reroute-drive` · `landed-1124-look`.
- **Still owed from before:** `feat326-boss-proto-drive` (proto/feat-326-boss @ 74a8e2c3 in CarGame-rockcost, dev server :3889 left up; FEAT-326 slice 2 waits on it) · `feat325-arc-trial-play` (:8005) · the ~11 older cards.
- **Queued behind owner picks:** BUG-258's build (fix (A), the junction bank cliff, is in every option but "leave it") → then BUG-261 (ground steps at carve handovers; same `_carveCrossSection`) · FEAT-302's landing build · BUG-241's small build · BUG-239's fix.
- **Tracker audit (04:28, read-only agent, 156 tickets):** most "built on land/X, awaiting landing" Next-steps lines are stale, the branches are merged. Closed on evidence: FEAT-284, BUG-198, BUG-199, FEAT-261, FEAT-275, FEAT-278. About 45 more are on main and open only for an owner look/drive box; they close as their cards are answered. QUAL-36 still owes the missions.md type table. Truly unmerged: FEAT-180 rounds 4/5 (land/feat180-next, land/feat-180, land/feat180-dusk; card `feat180-r5-look`); land/feat-212 + land/feat-212b look like docs copies, check before deleting.
- **Lesson:** a lane's gates do not read main.js or the smoke's expectations; `node --check` every changed file before merging, and a ruling that changes a default needs its smoke/pad-e2e assertion updated in the same change.
- **Next free ids:** DEC-501 · BUG-266 · FEAT-330 · INFRA-17.


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

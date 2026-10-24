# Handoff 2026-10-24 — main is the integration branch, and the alpha in four lanes

Main checkout: /Users/ledogen/CodeShit/CarGame (branch `main`, :8000, dashboard :8010) — INTEGRATION ONLY: nobody
builds features here; lanes merge into it at task boundaries (`git merge --no-ff feature/<lane>` from main, gates first).
State: clean after 7e298f52; every old branch (mission-recut, game-feel, parts, sleepy-steer) is merged and deleted.

**One worktree per lane** (owner, 2026-10-24 second pass: one shared tree "sounds annoying", worktrees have been fine
save for test load). Each lane's session works ONLY in its own worktree, merges main in often (`git merge main`),
and lands at a task boundary. The main checkout stays free for the items session (cargame-11) and merges.

| Lane | Worktree | Branch | Serve |
|---|---|---|---|
| A — the run has a shape | /Users/ledogen/CodeShit/CarGame-run-shape | feature/run-shape | http://localhost:3731 |
| B — the machine bites back | /Users/ledogen/CodeShit/CarGame-machine | feature/machine | http://localhost:3282 |
| C — content and polish | /Users/ledogen/CodeShit/CarGame-content | feature/content | http://localhost:3774 |
| Spare — front of mind | /Users/ledogen/CodeShit/CarGame-spare | feature/spare | http://localhost:3885 |

Each worktree's `node_modules` is a symlink to the main checkout's. Dev servers were started 2026-10-24
(`npm run dev -- --port <port> --strictPort` from the worktree; restart the same way if one is gone).
Heavy gates: run `npm test` in your worktree; leave `npm run test:all` to the merge into main, one lane at a time.

## What landed today (2026-10-24)

| Merge | Brought | Conflicts |
|---|---|---|
| 2e0e1aed `feature/mission-recut` | FEAT-138 every type ranks on its own axis · FEAT-114 haul picker · FEAT-139 freight + fragile tiers, per-tier km easing, 1.5× breaks with `onePctG` | data/items.js (kept main's plug-kit flavor + the bed mat row) |
| 6fba599a `feature/game-feel` | the mission-feel review, rounds 1–3 (R-01..R-34, every row kept): promise lines, pay wording, deed numerals in story blue, freight ½-deed floor, live bad news, shop "For sale" + new-stock clock, result reveal, courier rank bar near the goal, no letter on any result card | 35 hunks: the review's surfaces over mission-recut's committed fragile data; also fixed 64a51b84's unescaped apostrophe in test/gates.mjs that broke `npm test` on main |
| 4e7095d4 `feature/parts` | zip ties, duct tape, the (plastic) jerry can, the $5 exchange floor, the owner's likelihood table | data/items.js (kept main's chili-dog flavor + the branch's spareTire row) |
| 7f0120e1 docs | Q-2 ruling: the expedition camp is its own POI type; the construction site stays a client | — |

Worktrees `CarGame-game-feel`, `CarGame-mission-recut`, `CarGame-parts` and their branches are deleted;
their dev servers (:3776, :3554, :3115) stopped. Review page (verdicts, all keep):
https://claude.ai/artifact/YHLoevQnoJ1y5BYmksVVVZ · item setup page: https://claude.ai/artifact/HUjbtiQTyByViNedWtxhpu

`feature/sleepy-steer` (20 % slower steer, drowsy steering ×0.75 → ×0.5) merged 2d59aa2c on the owner's word; gone too.
Owner rulings 2026-10-24 (7e298f52): REPAIR_CAP 80 % and sport springs $15 ratified; FEAT-137 shelf numbers
approved; FEAT-138 hi-lift cooldown 5 s real time, torque derivation in the ticket (10.5 N·m/kg × 3 s proposed).

## Where the alpha stands

Alpha = the 2500 m story circle, one region, a polished demo (MILESTONES.md § Release cuts). Of its
table, after today:

- **Done / on main:** FEAT-114, FEAT-104 + FEAT-137 (shelf numbers still [DEFAULT]), FEAT-122, FEAT-139,
  FEAT-109, FEAT-67 (11 of 12 boxes), FEAT-91's R1 yard, FEAT-125 (pad play-test owed), FEAT-77 in progress.
- **Not started, and the alpha cannot ship without them:** FEAT-103 (the win), FEAT-146 (the endings +
  summary), FEAT-147 (the opening + tutorial). These three are the critical path — today a run has a
  start and no end.
- **Started or small:** FEAT-93/94 (punctures, flat), FEAT-128, FEAT-66, FEAT-132, FEAT-129, FEAT-133 (2 boxes).
- **Big and parallel-safe:** FEAT-120 (sound pass), the five alpha models (ASSET-71 camp, 69 office, 70
  doctor, 73 school, 32 uncle's van).
- **Waits on run data:** FEAT-69 (the economy re-cut needs multi-day runs through a finished loop).
- **Owner rulings owed, no code until then:** FEAT-138's torque proposal (10.5 N·m/kg × 3 s) and its
  likelihood tier; Q-6 courier digits (recommended no).
- **SM-3's old "Next up" items 7 (FEAT-115 bed upgrades, FEAT-116 cargo protection) are not in the alpha
  table → later.** They drop out of the build order.
- **Bugs default to alpha** (13 open): BUG-54, 58, 63, 64, 67, 69, 73, 74, 77, 81, 89, 90, 92.

## The four lanes

Each lane is its own worktree (table above). The rule that keeps the merges clean: **each lane owns its
files**, main.js edits stay inside the lane's own functions, and nobody edits another lane's files without
a message. Merge main into the lane often; land the lane into main at a task boundary with the gates green.

### Lane A — the run has a shape (critical path)

Owns: src/story.js, src/camp.js, src/dialogue.js, data/dialogue.js, src/poi.js (new camp type),
the story sections of main.js, FEAT-146's summary card, FEAT-147's cards.

1. **FEAT-103 alpha slice** — the expedition camp as its own POI type on the circle's edge at the end of a
   road, a five-line requisition behind 6 deeds (ECONOMY_PARAMS.campDeeds), completing it = the win.
   No FEAT-28, no wall. The construction site stays a client (ruled 2026-10-24).
2. **FEAT-146** — death card, towel button in the pause menu, win card, one summary → main menu.
3. **FEAT-147** — the firing, the uncle, the first-day prompts; FEAT-148's plumbing (flavor table, hide
   the `[flavor line]` stub) rides along. The owner writes the words.
4. Then FEAT-128 (engine off at camp), FEAT-66 (camp gear renders).

### Lane B — the machine bites back (physics / damage / parts)

Owns: src/damage.js, src/tire.js, src/recovery.js, src/parts.js, src/service*.js, data/parts.js,
data/stock-weights.js, the physics gates.

1. **FEAT-93 + FEAT-94** — hazard punctures at any condition; driving on a flat wrecks the corner and
   says so (no percentage).
2. **FEAT-132** — the stranded motorist's haul fetch (wheel + tire in the bed).
3. **FEAT-138 hi-lift** once the owner gives torque + cooldown; parts leftovers once ruled.
4. Bugs in its files: BUG-89 (rolled truck slides), BUG-54 (chassis launched), BUG-92 (ABS rumble).

### Lane C — content and polish (assets / sound / items)

Owns: assets/, wip/, src/*-audio.js, data/items.js rows + thumbnails, items.md, FEAT-120/121.

1. **The five alpha models** — ASSET-71 (camp; Lane A needs it to replace the placeholder), ASSET-32
   (uncle's van; Lane A's opening), then ASSET-69/70/73.
2. **FEAT-120** sound pass, source by source (the dashboard's Sounds tab is the tracker).
3. Item-setup rulings → live rows (the standing items loop), FEAT-129 favicon.

### Spare — whatever is front of mind

The owner's play-tests and anything they surface; the alpha bugs not owned above (BUG-90 road dips,
BUG-77 tunnels + FEAT-77 clearance — both known red gates; BUG-64/67/81 road geometry); FEAT-133/136
controller finish; FEAT-42 saves (suspend/resume) late in the alpha; FEAT-69 once Lane A gives a finishable run.
Two mission-board tickets sit here too, each its own task (owner, 2026-10-24: "split them properly"):
- **FEAT-141 Papers, "any N against a deadline"** (major): every customer is deliverable from the start; the
  plotter finds the shortest route covering N and that par × 1.5 is the deadline; the GPS draws it; the round
  ends at N or expires; "bell" leaves the code and docs. Files: paper-route.js, the paper planner, the GPS line.
- **FEAT-142 Giver traits** (minor): a TRAITS table, 0–2 per offer from the offer's own seeded stream, shown
  bottom-left of the card; each trait moves the quoted pay/terms at accept and settle (Off the books gives no
  deed; The right thing to do gives +½ at C or better). Nothing exists in code yet. Open owner question:
  Wholesale on freight. Files: offer-board.js card(), data/offers.js, test/offer-board.mjs.

## Resume prompts (paste one per session)

- **A:** "Worktree /Users/ledogen/CodeShit/CarGame-run-shape, branch feature/run-shape, serve :3731. Work ONLY there. Read .planning/handoffs/HANDOFF-2026-10-24-consolidation-and-alpha-lanes.md § Lane A, then .planning/todos/pending/feat-103-job-site-poi.md. Build FEAT-103's alpha slice. Own only Lane A's files; merge main in before you start."
- **B:** "Worktree /Users/ledogen/CodeShit/CarGame-machine, branch feature/machine, serve :3282. Work ONLY there. Read the handoff § Lane B, then feat-93-hazard-punctures-any-condition.md and feat-94-driving-on-a-flat.md. Build FEAT-93 then FEAT-94. Own only Lane B's files."
- **C:** "Worktree /Users/ledogen/CodeShit/CarGame-content, branch feature/content, serve :3774. Work ONLY there. Read the handoff § Lane C. Model ASSET-71 (the expedition camp) per .planning/research/ASSETS.md and ART-STYLE.md, then ASSET-32. Own only Lane C's files."
- **Spare:** "Worktree /Users/ledogen/CodeShit/CarGame-spare, branch feature/spare, serve :3885. Work ONLY there. Read the handoff § Spare. Ask the owner what is front of mind; default to BUG-90."

## Gates

Full suite on the merged main (4e7095d4): 105/107, the two known reds road-tunnel (BUG-77) and road-clearance
(FEAT-77). `node test/cdp-smoke.mjs`: 15/15 after it learned to read off the R-11 intro cards and the "For sale"
heading (400dea6b). It flakes under load; rerun alone.

**Tracker page** (lanes, per-task status, agent per lane): https://claude.ai/artifact/8P7QDPAaKxKPtJuf6zvRVH

# Handoff 2026-10-24 — one folder, and the alpha in four lanes

Worktree: /Users/ledogen/CodeShit/CarGame (the only checkout)
Branch:   main
Serve:    http://localhost:8000 (`npm run dev`), dashboard :8010 (`npm run dash`)
State:    clean after 7f0120e1; `feature/sleepy-steer` is the one branch left (owner's call, below)

Work ONLY in this checkout. Every session starts here. Commit with `git commit -- <paths>`, small and
often, and run `npm test` before each commit — four sessions share one working tree now.

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

**Left for the owner:** `feature/sleepy-steer` (d739b7f3, one commit: 20 % slower steer, drowsy steering
×0.75 → ×0.5; 77 commits behind, conflicts in src/main.js). Merge-and-resolve, or delete the branch and
the `CarGame-sleepy-steer` worktree (:3767).

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
- **Owner rulings owed, no code until then:** FEAT-137 [DEFAULT] shelf numbers; parts' REPAIR_CAP 80 %
  and sport spring/shock $15; FEAT-138 hi-lift torque/cooldown; Q-6 courier digits (recommended no);
  sleepy-steer.
- **SM-3's old "Next up" items 7 (FEAT-115 bed upgrades, FEAT-116 cargo protection) are not in the alpha
  table → later.** They drop out of the build order.
- **Bugs default to alpha** (13 open): BUG-54, 58, 63, 64, 67, 69, 73, 74, 77, 81, 89, 90, 92.

## The four lanes

The rule that makes four sessions in one folder work: **each lane owns its files**, main.js edits stay
inside the lane's own functions, and nobody edits another lane's files without a message. Shared files
(main.js, index.html, data/items.js, data/offers.js) are edited in small hunks and committed at once.

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
controller finish; FEAT-141/142 (papers deadline, giver traits) if the owner wants them in the alpha;
FEAT-42 saves (suspend/resume) late in the alpha; FEAT-69 once Lane A gives a finishable run.

## Resume prompts (paste one per session)

- **A:** "Work in /Users/ledogen/CodeShit/CarGame on main. Read .planning/handoffs/HANDOFF-2026-10-24-consolidation-and-alpha-lanes.md § Lane A, then .planning/todos/pending/feat-103-job-site-poi.md. Build FEAT-103's alpha slice. Own only Lane A's files."
- **B:** "… § Lane B, then feat-93-hazard-punctures-any-condition.md and feat-94-driving-on-a-flat.md. Build FEAT-93 then FEAT-94. Own only Lane B's files."
- **C:** "… § Lane C. Model ASSET-71 (the expedition camp) per .planning/research/ASSETS.md and ART-STYLE.md, then ASSET-32. Own only Lane C's files."
- **Spare:** "… § Spare. Ask the owner what is front of mind; default to BUG-90."

## Gates

Full suite on the merged main: see the owner's recap (run after 4e7095d4). Known reds: road-tunnel
(BUG-77), road-clearance (FEAT-77). `node test/cdp-smoke.mjs` flakes under load; rerun alone.

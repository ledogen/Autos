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
- **The page's "now" line** = `lanes/<id>.agent`. At spawn write `running: <task> · since <HH:MM> · <agent id>`; the
  agent overwrites it with `stopped (<done|blocked>): <one line> · <HH:MM>` when it hands off.
- **On a report** (the agent's final message, ≤ 15 lines): LANDING → land it (below); OWED → the page's `OWED` array;
  then spawn a FRESH agent for NEXT. Never SendMessage a finished agent to continue: that revives its whole
  context. Messages to a RUNNING agent are fine (an answer, an order); agents can SendMessage you as `main`.
- **Never idle a lane while owner-free alpha work exists** (owner 11-07: "what is everyone waiting on?"). With 10+
  owed items, give lanes pile-neutral work (gates, perf, closing on evidence, making a pending call cheaper).
- At most one agent per worktree. Lane C gets an agent only when an owner answer gives it work.
- **Your own context**: when you pass ~300k at a quiet moment (no merge or smoke mid-flight), let running agents
  finish or note them in § Current state, rewrite that section, and tell the owner "orchestrator ready for a clear".

## On wake
1. `bash tools/lanes.sh` — every worktree's branch, ahead/behind, uncommitted files (a lane's WIP: never discard).
2. The tracker page db (url below), read with `out_dir` so it stays out of context: `lanes` (handoff + now line),
   `tasks` (`<lane>-<TICKET>`: {status, note}), **`owed`** (the owner's answers to OWED items: doc = item id,
   `{choice, note, at}` → act, record it in the ticket, drop the item from `OWED`, republish) and **`inbox`** (the
   owner's typed items: `{text, at, status:'new'}`). Re-query `owed` after every relay: answers arrive while you work.
3. Four-line board summary to the owner, then drain the inbox. Each item, in order:
   - **Can it just be done?** (a wording, CSS, a number, a doc fix, a one-function change no lane is in) → do it on
     main, `npm test`, `git commit -- <paths>`, fast-forward the lanes. If a running lane owns the file, message it.
   - **Otherwise a ticket**: `.planning/todos/pending/<class>-<NN>-<slug>.md`, frontmatter `id`, `type`,
     `status: open`, `severity`, `opened`, `source: owner, <date> — "<their words>"`, `relates:`, a `lane:` line,
     `## What`, `## Acceptance`. Next free number: `grep -h '^id:' .planning/todos/*/*.md | sort -t- -k2 -n | tail`.
   - **Owner-only** (design, economy numbers, words in the world's voice; the owner writes dialogue, FEAT-148) →
     ask back in one line with a recommendation; never invent.
   Update each inbox doc `{status: done|ticket|question, reply: '<hash / id + lane / the question>', handledAt}`, and
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

## The pages
- **Alpha Lanes tracker** https://claude.ai/artifact/8P7QDPAaKxKPtJuf6zvRVH — source `.planning/pages/alpha-lanes.html`
  (`LANES[].tasks` one line per row, closed rows to the "Closed since" list; `OWED` objects `{id, kind:
  decide|drive|make, tk, blocks?, text, options?}`, blockers render on top). To publish: `Artifact read` the url and
  Read every line of the saved file (the tool refuses otherwise), edit the source, run `node test/page-scripts.mjs`
  (the page once shipped dead from a missing comma), publish the source with `url:`.
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

## Current state (machine clock Mon 11-09 ~00:25 PST; the owner said good night — overnight run; rewrite, don't append)
- **Main** 438f3781: BUG-147 LANDED 09ea7d66 (smoke 26/26) · **BUG-140 + FEAT-193 LANDED 51a932bf** (smoke: "edge" flaked
  once, then passed alone ×2 and in the full re-run; the re-run's one miss = pre-existing pad pick → BUG-157). Unpushed
  since d7dc18e1 (origin). Never push. Spare's physics probes kept in main's wip/bug-140-probes/.
- **Clock note**: the machine clock is PST; agents' system date runs a day ahead. Git/mtimes are the truth.
- **Agents RUNNING**:
  - A (22:35) — BUG-152 NOT closed: soak 6/6 wins but seed 336086702 resumed twice with a different POI roster
    (2 in ~55, timing-dependent). Root-causing in CarGame-run-shape.
  - Spare (00:25) — BUG-157 in CarGame-land-157 (smoke pad step: fallback giver's only offer is a paper route;
    deterministic on 3397198020, also on 961311ec).
- **B: landing request IN** — land/bug-155 @ 49c5e0be, merged with main 51a932bf by me → 6caadf81. Its own run: 83/83
  green. I'm running the 58 gates both diffs reach (--only, log CarGame-land-155/wip/bug-153/gates-overlap-140.log).
  Green → merge, smoke, close BUG-153/154/155 + BUG-149 (its lip now 12.8–17.6 cm, bar 0.25 m), remove CarGame-land-153
  and CarGame-soak9pre. B's NEXT: FEAT-34 round 3 (feature/machine 1ed40292) — Chrome shots for the owner's look.
  New BUG-156 (gore cliff 0.47 → 0.86 m at 1074499174 (737.7, 442.1), minor).
- **Owner's photo page** for 153/154/155: https://claude.ai/artifact/HLqtsmsrjVJJVqrEpkMpr8 (source scratchpad
  road-seams/). Its one call: the ribbon-frame band bar 2.5 cm (measured 2.3; whole-lane worst 4.3, was 35.7).
- **Page publish owed** (one publish): DROP owed hunger-numbers, bug67-miter-look, bug140-drop, side-slide-lever
  (answered + recorded 33f1a202). ADD: bug140-feel (drive on :8000 — drops, rock props, rollovers dirt vs road; rebound
  7–10 % flat, was 81 % at 5 m) + Spare's calls (FEAT-193 flank only? road 0.5 vs old 0.53? accept flat rebound?
  fragile vase keeps 60 % not 43 % — accept?) + road-seams photos & band bar (link above). Closed rows: 146, 147, 140.
- **Landing queue**: BUG-153+155 (+154, 149) → BUG-157 → BUG-152 fix → FEAT-34 round 3 (shots first).
- **Waiting on the owner**: the lighting pick (round 5 land/feat180-next :3887 vs proto/lighting-redesign :3890);
  tutorial-* ×5 (FEAT-184); the item page (FEAT-192 rarity ×4, V6/V8/tank, tarp → Lane C); the rest of `OWED`.
- **Worktrees**: CarGame-bug67 needs `! git worktree remove --force /Users/ledogen/CodeShit/CarGame-bug67` from the
  owner. Lighting pick keeps CarGame-f180-preview, -land-feat180, -land-feat180-dusk, -land-feat180-next.
  In use: -land-153, -land-155 (B), -land-157 (Spare), -soak9pre, -spare-base.

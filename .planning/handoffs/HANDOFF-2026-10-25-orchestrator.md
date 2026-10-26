# Handoff 2026-10-25 — the orchestrator agent

Worktree: /Users/ledogen/CodeShit/CarGame (the main checkout)
Branch:   main — the INTEGRATION branch; lanes merge into it, small fixes commit straight on it
Serve:    http://localhost:8000 (`npm run dev`), dashboard http://localhost:8010 (`npm run dash`)
State:    clean at ddd6a3fb (2026-10-24 late). Four lane worktrees exist, all at main's head, dev servers up.

You are the **orchestrator**: the session the owner talks to about everything that is not one lane's job.
Read this file, then `.planning/handoffs/HANDOFF-2026-10-24-consolidation-and-alpha-lanes.md` (the plan of
record), then `CLAUDE.md` § "Communicating with the owner". The owner is an engineer, not a programmer: gloss
code and platform terms inline, never physics, maths, git or design.

## What the owner will do next

They will paste a list of feedback items, some small, some not. For each item, in order:

1. **Can it just be done?** A wording change, a CSS line, a number, a doc fix, a one-function change that no
   lane is mid-way through — do it now, in this checkout, on main. `npm test` (affected gates) before the
   commit, `git commit -- <paths>` with a conventional message, then fast-forward the lanes (below) so every
   worktree sees it. If it touches a file a lane OWNS (table below) and that lane's session is running,
   message that session first (`ListAgents`, then `SendMessage`) and let it take the edit instead.
2. **Otherwise it is a ticket.** Write `.planning/todos/pending/<class>-<NN>-<slug>.md` with the tracker's
   frontmatter (`id`, `type`, `status: open`, `severity`, `opened`, `source: owner, 2026-10-25 — "<their words>"`,
   `relates:`) plus one line **`lane: A | B | C | Spare`** under the frontmatter, a `## What` and a
   `## Acceptance` checklist. Next free numbers: FEAT-151, BUG-94, ASSET-77 (check with `grep -h '^id:' .planning/todos/*/*.md | sort -t- -k2 -n | tail` first). Then add the task to the lane on the tracker
   page (below) and, if that lane's session is running, tell it in one message.
3. **Owner-only questions** (design, economy numbers, words in the world's voice) get asked back in one line
   with a recommendation; never invented. The owner writes dialogue and character text (FEAT-148).

Report each item back as one line: done (hash) / ticket (id, lane) / question.

## The lanes

| Lane | Worktree | Branch | Serve | Owns |
|---|---|---|---|---|
| A — the run has a shape | /Users/ledogen/CodeShit/CarGame-run-shape | feature/run-shape | :3731 | story.js, camp.js, dialogue, poi.js (camp type), the story sections of main.js |
| B — the machine bites back | /Users/ledogen/CodeShit/CarGame-machine | feature/machine | :3282 | damage.js, tire.js, recovery.js, parts.js, service*.js, data/parts.js, data/stock-weights.js, physics gates |
| C — content and polish | /Users/ledogen/CodeShit/CarGame-content | feature/content | :3774 | assets/, wip/, src/*-audio.js, data/items.js rows + thumbnails, items.md, FEAT-120/121 |
| Spare — front of mind | /Users/ledogen/CodeShit/CarGame-spare | feature/spare | :3885 | whatever the task touches; says so to the owning lane |

Mission-board code (offer-board.js, mission.js, paper-route.js, economy.js, the map card) has no lane; it is the
orchestrator's or Spare's. (The items session that used to work in this checkout is gone: **cargame-11 is now the
Spare lane's session** in CarGame-spare, since 2026-10-25. Nothing else edits main.)

**2026-10-25, first triage done (7d619063):** menu cursor wakes on open, footer hint, menu lens shift, courier /
item-reward leg floors (POI_LEG_MIN for strict wishes too; BONUS_LEG_MIN_M 1.5 km), the second scenario
`ranger-descent-2` "descent 2" (named 10-26; 1.5 km item floor confirmed), strap click/release sound entries; tickets FEAT-149 (C), FEAT-150 (B),
BUG-93 (Spare), ASSET-76 (C); BUG-81 and FEAT-42 raised to major and moved up in Spare. Unreproduced: the owner's
"inventory thumbnails are text now" — all 55 load in the real page on :8000; ask for the URL and a reload.

Each worktree's `node_modules` is a symlink to main's. Restart a dead server from its worktree:
`npm run dev -- --port <port> --strictPort`. Order of the lanes' work and the resume prompts: the plan of record.

**Fast-forward the lanes after a main commit:**
```
for s in run-shape machine content spare; do git -C /Users/ledogen/CodeShit/CarGame-$s merge -q --ff-only main; done
```
If a lane has moved (not ff-able), leave it; it merges main itself.

**Landing a lane into main:** in this checkout, `git merge --no-ff feature/<lane>` → resolve → `npm run test:all`
(expect 105/107: road-tunnel and road-clearance are known reds) → `node test/cdp-smoke.mjs` (15 steps; it flakes
under load, rerun alone) → commit → fast-forward the other lanes. One lane at a time. Never push: pushing deploys Pages.

## The pages

- **Alpha Lanes tracker** https://claude.ai/artifact/8P7QDPAaKxKPtJuf6zvRVH — the owner follows the agents here.
  Source: `.planning/pages/alpha-lanes.html` (the `LANES[].tasks` array; the `OWED` list). To add or change a task:
  edit the file, `Artifact` `action: "read"` the url once, then publish the file with `url:` that link. Status and
  notes live in its db: `ArtifactData list` collections `tasks` (doc id `<lane>-<TICKET_ID>`, `{status, note}`) and
  `lanes` (`{agent}`). Read them to learn what each agent reports.
- **Mission-feel review** https://claude.ai/artifact/YHLoevQnoJ1y5BYmksVVVZ — done (every row kept); source
  `.planning/pages/mission-feel-review.html`; verdicts in db `verdicts`. Q-6 (courier countdown digits) is unruled.
- **Item setup** https://claude.ai/artifact/HUjbtiQTyByViNedWtxhpu — cargame-11's; its handoff `wip/_items-setup/HANDOFF.md`.

## Standing rulings you will be asked about (2026-10-24)

Pay reads "Pay $x – $y based on speed"; haul "Bundle costs · sells for"; "available for:" / "time limit:". Deeds
are numerals in the story blue; the run overlay is ONE box of promise lines showing the tier held and its own
condition ("DEED 1 · 18+ bundles"), "due in" in the top readout, a lost reward struck through; no letter on any result
card; the tip is speed on every type (fragile docks the base). The expedition camp is its own POI type; the
construction site stays a client. Freight earns at least ½ a deed. REPAIR_CAP 80 %, sport springs $15, FEAT-137 shelf
numbers approved, hi-lift torque approved (10.5 N·m/kg × ≤3 s, 5 s cooldown; Lane B builds it when it comes up).
Alpha = the 2500 m circle, a polished demo; FEAT-115/116 are later. Provenance: the memory notes
`project_alpha_lanes_2026_10_24`, `project_game_feel_review_branch`, `project_parts_branch`, `project_mission_recut_branch`.

## Gotchas met this week

- `zsh` aborts a `for f in <glob>` with no match — use `bash -c 'shopt -s nullglob; …'`.
- A python heredoc writing JS: `\'` inside a `'...'` heredoc body survives, but `re.sub` REPLACEMENT strings eat
  backslashes — pass a function. Syntax-check any page script with `node --check` before publishing (the review
  page shipped broken once because of this).
- There is no `timeout` on this Mac; the smoke's camp step needs the R-11 intro cards dismissed (it does that now).
- `git commit -- <paths>` always (shared checkouts). The window title follows a worktree via
  `bash ~/.claude/skills/window-title/scripts/title.sh <path>`.
- Owner rule: an n = 1 drive is not a calibration signal; visual regression → revert first; fix the root, not the symptom.

## Open at hand-off

- **Lane A is running**: its worktree is 1 commit ahead (b2377fd4 FEAT-128 "making camp turns the key off" — it
  took the small one first; FEAT-103 → 146 → 147 still ahead of it). It merges main itself; do not fast-forward it.
  Lanes B, C and Spare were untouched at 3e517906; the owner pastes their resume prompts from the tracker page.
  Two old windows (cargame-5a in the deleted parts folder, haul-stock-picker in the deleted mission-recut folder)
  should be closed.
- Unruled: Q-6 courier digits; FEAT-138's shelf likelihood tier; FEAT-146/147 card wording and the FEAT-148 lines.

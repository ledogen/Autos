---
id: INFRA-16
type: infra
status: open
severity: minor
opened: 2026-11-24
source: owner, 2026-11-24 (inbox) — "we have an items tab in the tracker and we have an item setup artifact. lets merge them into the items tab of the lanes tracker"
relates: INFRA-11, FEAT-121, FEAT-182, tools/dashboard, wip/_items-setup
---
lane: free lane

# INFRA-16: Merge the item setup page into the tracker's Items tab

## Next steps
A routine lane (Sonnet), via plan mode first (it moves where the owner's rulings are stored). Read `wip/_items-setup/HANDOFF.md` and the `DATA` contract comment in `tools/dashboard/index.mjs`.

## Summary
Item rulings live in two places: the tracker's Items tab (the dashboard, :8010) and the item setup page (a claude.ai artifact with its own database, source in `wip/_items-setup/`). The owner wants one: the Items tab.

## Description
- The item setup page holds per-item questions and the owner's answers (slots, reach, price, rarity, where sold, reward ranks and givers, thumbnail verdicts) in the artifact's database, collection `answers`.
- The tracker keeps its state as one small JSON file per item in the owner's private repo (`~/CodeShit/ledorepo/projects/cargame/`).
- Wanted: the Items tab asks the same questions and stores the answers as files there; the existing answers are migrated; the artifact is retired once nothing reads it.
- Keep the rule from the setup page: a ruling must go LIVE (an ITEMS row and a REWARDS row), not only into a document.

## Tracker
- [ ] Plan approved by the owner
- [ ] Items tab shows each item's questions and saved answers
- [ ] Existing answers migrated from the artifact's database
- [ ] Lanes read the answers from the files; the artifact retired
- [ ] Owner's look

## Decisions
None yet.

## Open questions
None.

## Links
INFRA-11 (the Lanes tab) · FEAT-121 (the items list) · FEAT-182 (packs, answered on the setup page 11-24)

## Files
`tools/dashboard/` · `wip/_items-setup/`

## Log
- 2026-11-24: minted by the orchestrator from the owner's inbox.

## Plan (agent's, 2026-11-25; awaits the owner's approval on card `infra16-plan`)

- **Answers** become files in the private repo: `items/<docId>.json`, shape `{"answers": {...}, "at": "<ISO>"}`, doc ids as on the artifact (`<itemId>`, `_global`, `_stock`, `_rarity`, `_lines`, `thumb_<id>[_r<N>]`). Autosave = the owed-answer contract (`DATA_DIRS` + `PAGE_PUT` in `tools/dashboard/index.mjs`, `saveItemAnswer` copied from `saveAnswer` in `app.html`).
- **Questions** stay one source: `wip/_items-setup/items-data.js` moves unchanged to `tools/dashboard/items-questions.js` (it comes under version control). `THINGS_FOR_LINES` is dropped; `index.mjs` already imports `THINGS`.
- **Unread rule:** `items/<docId>.taken.json` = `{"at": ...}`, written by the orchestrator after a ruling is folded and made live; a card is new when `answers.at` differs from `taken.at`. Intake lists untaken items answers like the dives.
- **Steps, each lands alone:** (1) server plumbing + `data-api.check.mjs` · (2) move the questions + `items-questions.check.mjs` (every LIVE id exists in `data/items.js`, every reward-pool id has a STOCK row) · (3) port the question rendering into `app.html` (~300 lines from `page.html`): a Questions fold per item card, a Setup fold on top for globals / likelihood / rarity / price · (4) thumbnail verdicts · (5) unread badge · (6) migration by the orchestrator: export the artifact's `answers` collection, one-shot `tools/items-import.mjs`, docs before 2026-11-08T20:00Z marked taken, spot-check 5 · (7) docs (DATA contract, LAYOUT.md, fold procedure into items.md) · (8) retire the artifact and `wip/_items-setup/`.
- **Size:** about 450 added lines, 2 existing files + 3 new. No `src/` change, no `npm test` gate affected.
- **Owner's calls (recommendation first):** phone must work · migrate all thumbnail verdicts, show the latest round · setup tables as a fold at the top of the Items tab · delete the artifact right after the migration is verified.
- 2026-11-25: plan answered: "1. desktop only / 2. drop old / 3. fold / 4. delete once checked". Build started (lane u, land/infra-16-items-tab).

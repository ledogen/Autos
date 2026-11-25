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

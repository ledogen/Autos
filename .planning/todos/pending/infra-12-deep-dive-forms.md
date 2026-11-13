---
id: INFRA-12
type: infra
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-12 — the "ledorepo" brief (sculpting a personal Jira: tracker + lanes + deep-dive forms)
relates: INFRA-11 (requires), INFRA-10, .planning/pages/mission-feel-review.html (the nearest existing example)
---
lane: unplaced (tooling — orchestrator or a Spare agent; touches no game code)

# INFRA-12: ledorepo — deep-dive documents that are also the answer form

## Next steps
Blocked on INFRA-11 (needs the local tracker and its writable data directory).

## Summary
When a problem is complex, an agent writes an explainer page for the owner. Today the explanation is one artifact
and the answer goes somewhere else (the owed card's note box, or chat). Make them one local document: explanation
with the multiple-choice and free-response fields inline where each choice is explained, autosaved, with a Submit
button. The owed card in the lane tracker shows where the owner is with it.

## Tracker
- [ ] A deep dive is one HTML file in the repo (`.planning/dives/<ticket-id>-<slug>.html`), served by the dashboard.
      Agents write ordinary HTML plus two custom tags: a choice field and a free-text field, each with a question id.
      One shared script (~100 lines) wires them: load saved answers, autosave on change, Submit.
- [ ] Answers save to `dives/<slug>.answers.json` beside the inbox/owed data: `{status, opened_at, submitted_at,
      answers: {<question id>: {choice, note}}}`.
- [ ] Status is derived from what the owner did, never set by hand: **not opened** → **opened, not started** (page
      loaded) → **partial** (any field has a value) → **submitted** (button pressed). The owed card shows it and
      links to the dive.
- [ ] A submitted dive is frozen: the document and its answers are not edited again. A follow-up is a new dive.
- [ ] The dive is listed in the Links of its ticket(s) automatically (the dashboard matches the ticket id in the
      filename); a ruling that comes out of it becomes a DEC (INFRA-10) citing the dive as its source.
- [ ] The orchestrator's wake drill reads submitted dives the same way it reads owed answers.

## Open questions
- Can the owner reopen a submitted dive to change an answer before the agent has acted on it? Recommended: yes,
  until the orchestrator marks it "taken".

## Files
`.planning/dives/` (new) · `tools/dashboard/dive.js` (new, the shared script) · `tools/dashboard/index.mjs`

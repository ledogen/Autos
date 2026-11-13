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
Build per the approved plan (in Description). Worktree `CarGame-dives`, branch `infra/infra-12-deep-dives`, dev port 8011.

## Summary
When a problem is complex, an agent writes an explainer page for the owner. Today the explanation is one artifact
and the answer goes somewhere else (the owed card's note box, or chat). Make them one local document: explanation
with the multiple-choice and free-response fields inline where each choice is explained, autosaved, with a Submit
button. The owed card in the lane tracker shows where the owner is with it.

## Description
**The approved plan (owner sign-off 2026-11-13).** Where it differs from the Tracker boxes below, the plan wins.

### Context

Your phone item arrived as a file, so INFRA-11 is closed. This is the next ticket.

When a problem is complex, an agent writes you an explainer page. Today the explanation is one artifact
and your answer goes somewhere else (an owed card's note box, or chat). You asked for one document: the
explanation with multiple-choice and free-text fields inline where each choice is explained, autosaved, a
Submit button, and a status on the owed card that follows what you actually did: **not opened / opened,
not started / partial / submitted**. It must live in the repo and on your server, not at Anthropic.

It builds directly on the Lanes tab: same server, same private data folder, same one-writer-per-file rule.

### How a deep dive works

**The document** is one HTML file an agent writes: `.planning/dives/<TICKET-ID>-<slug>.html`
(e.g. `FEAT-194-handbrake-clock.html`). Ordinary HTML — headings, tables, inline diagrams, screenshots —
plus **one custom tag** wherever a decision is asked:

```html
<dive-q id="clock" options="pause everything | a job's clock keeps running | not now"></dive-q>
<dive-q id="why"></dive-q>      <!-- no options = a free-text box only -->
```

Every `<dive-q>` with options also gets a note box under its buttons. The file loads one shared script,
`/dive.js`, which does everything else: styles the page to match the dashboard, draws the fields, loads
your saved answers, autosaves (600 ms after you stop typing, and at once when you leave a box), and adds
the Submit button and a "back to the tracker" link. An agent writing a dive never writes form code.

**Your answers** save to the private folder, `…/ledorepo/projects/cargame/dives/<slug>.answers.json`:
`{status, openedAt, submittedAt, answers: {<question id>: {choice, note}}}`.

**The status** is set by the script from what you did, never by hand:

| Status | Means |
|---|---|
| not opened | no answers file exists |
| opened | you loaded the page (the script writes the file on first load) |
| partial | at least one field has a value |
| submitted | you pressed Submit |

**After Submit** the page shows "Submitted <time>" with a **Reopen** button. You can change answers until
the orchestrator has acted on it; it marks that by writing an empty file `dives/<slug>.taken`, after which
the page is read-only. A follow-up question is a new dive, never an edit of an old one.

### Changes

**1. `tools/dashboard/dive.js`** (new, ~120 lines) — the shared script described above. Defines the
`<dive-q>` element (a custom element: a tag whose behaviour a script supplies), injects the stylesheet
using the dashboard's colour tokens, phone-width safe (16 px boxes), talks to `/data`.

**2. `tools/dashboard/index.mjs`**
- Serve `.planning/dives/*.html` at `/dives/<file>` (and images beside them, `.png/.jpg/.svg`).
- Add `dives/<slug>.answers.json` to the page's write allow-list, and `dives` to the folders `GET /data`
  returns. `.taken` stays agent-only.
- The indexer scans `.planning/dives/`, reads each file's `<title>`, and attaches the dive to every ticket
  whose id starts the filename, so it appears on that ticket's page automatically.

**3. `tools/dashboard/app.html`**
- **Owed card:** an owed item may carry `"dive": "<slug>"`. Its card then shows the status tag and one
  button, "open the deep dive", instead of choice buttons and a note box (the dive is the form). The card
  dims as answered when the dive is submitted.
- **Ticket page:** a "Deep dives" list in the links block, each with its status.

**4. `.planning/dives/TEMPLATE.html`** — a short worked example agents copy: one explained choice with a
small diagram, one free-text question.

**5. Instructions** — orchestrator handoff § The tracker: one table row for `dives/` and two lines (when
to write a dive instead of a plain owed item: more than one linked question, or a choice that needs a
picture; on wake, submitted dives are `grep -l '"submitted"' dives/*.answers.json` minus the `.taken`
ones → act, record rulings in the ticket, write `.taken`, move the owed pair to `answered/`). Lane brief:
one line pointing at the template. CLAUDE.md § Workflow: one sentence.

### Deliberately simple (say so if you want more)

- **A dive is a page of its own**, opened from the card, not embedded inside the Lanes tab. It gets the
  whole screen, which is what a diagram needs on a phone.
- **Dive documents are in the public game repo** (`.planning/` already is); only your answers are private.
- **No "decision record" is minted automatically** from a submitted dive. That is INFRA-10's job; until
  then the orchestrator records the ruling in the ticket as it does today.
- **No per-question status** on the card, only the document's overall status.

### Order of work

1. Worktree `CarGame-dives`, branch `infra/infra-12-deep-dives`, dev dashboard on :8011 against a copy of
   the data. WIP commits each step.
2. Server routes + the check. 3. `dive.js` + the template. 4. Owed card + ticket page. 5. Instructions.
6. Land on main at a quiet moment agreed with the orchestrator, restart :8010 (never :8000), and tell it
   to re-read § The tracker. No data migration this time.
7. As the first real use, convert one currently owed multi-part item into a dive, chosen with the
   orchestrator, so you see a real one rather than the template.

### Verification

- `node tools/dashboard/data-api.check.mjs`, extended: a `dives/x.answers.json` write round-trips; a write
  to `dives/x.taken` or `dives/../x` is refused.
- Headless Chrome on the template dive against scratch data, asserting each status in turn: no file before
  load → `opened` after load → `partial` after one click → note text saved within a second → `submitted`
  after Submit → Reopen returns it to `partial` → with a `.taken` file present every field is disabled.
- The owed card for a scratch item with `"dive"` shows each of the four statuses as the above proceeds,
  and the ticket page lists the dive.
- A phone-width screenshot of the template dive for you.
- `npm test` (affected gates) and the dashboard's other tabs still load.

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

<!-- The ticket template (INFRA-09, owner 2026-11-13). EVERY ticket uses these sections in THIS order. Copy from
     the `---` line down. Always present: Next steps, Summary, Tracker. Leave the others out when empty; never
     reorder or rename them. The dashboard shows every ticket in this order; older tickets are converted when
     next touched, not in a sweep. Classes and frontmatter: CLAUDE.md § Workflow. This file is not a ticket
     (the dashboard skips it: no `id` it recognises). -->
---
id: FEAT-NN
type: feature
status: open
severity: major
opened: YYYY-MM-DD
source: owner, YYYY-MM-DD — "<their words>"
relates: FEAT-NN, BUG-NN, src/file.js
---
lane: <A / B / C / Spare / unplaced>

# FEAT-NN: Title

## Next steps
One or two lines: who (owner / which lane) does what next. Rewrite it every time the ticket moves.

## Summary
Two to four plain lines. What it is and why.

## Description
Free-form: the spec, the investigation, measurements. The only section with no fixed shape; use `###` inside it.

## Tracker
- [ ] The acceptance checkboxes. They are the progress bar on the ticket's page.

## Decisions
- YYYY-MM-DD, owner: a ruling on this ticket, in their words where they exist. Append-only.

## Open questions
- What the owner still has to answer.

## Links
Anything `relates:` cannot carry: a deep dive, a handoff, a capture.

## Files
`src/…` · `test/…`

## Log
- YYYY-MM-DD: dated work notes, append-only. Hashes, gate results, what was verified and what was not.

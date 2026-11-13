---
id: INFRA-09
type: infra
status: open
severity: minor
opened: 2026-11-12
source: owner, 2026-11-12 — the "ledorepo" brief (sculpting a personal Jira: tracker + lanes + deep-dive forms)
relates: INFRA-10, INFRA-11, tools/dashboard/
---
lane: unplaced (tooling — orchestrator or a Spare agent; touches no game code)

# INFRA-09: ledorepo — one section order for every ticket

## Next steps
Build: the template file and the dashboard rendering below. The section list is ruled.

## Summary
Tickets today use ~40 different `##` headings (133 × Acceptance, 34 × Request, 27 × What, 16 × Spec, then a long
tail). The owner wants Jira-style fixed sections in a fixed order, so any ticket parses at a glance.
This ticket is written in the proposed order as a sample.

## Description
The order, top to bottom. This ticket and INFRA-10..14 are written in it.
1. **Title** — the `# ID: title` line.
2. **Next steps** — one or two lines: who (owner / lane) does what next.
3. **Summary** — 2–4 plain lines. What and why.
4. **Description** — free-form: spec, investigation, measurements. The only section with no fixed shape.
5. **Tracker** — the acceptance checkboxes. They are the progress tracker.
6. **Decisions** — dated owner rulings on this ticket, append-only; links to DEC-NN records (INFRA-10).
7. **Open questions** — what the owner still has to answer.
8. **Links** — tickets, decisions, deep-dive forms (INFRA-12), handoffs.
9. **Files** — the paths this touches.
10. **Log** — dated, append-only work notes.
Sections 4 and 6–10 are left out when empty; 1, 2, 3 and 5 are always present.

## Tracker
- [x] Section list ratified by the owner (2026-11-13).
- [ ] `.planning/todos/TEMPLATE.md` exists; the orchestrator handoff and LANE-AGENT-BRIEF point at it (one line each).
- [ ] The dashboard renders the known sections in the fixed order whatever order the file has them in, shows
      Next steps + Summary + a progress bar (ticked / total boxes) at the top, and lists non-conforming tickets
      on its existing offenders report.
- [ ] Open tickets are converted **when next touched**, not in one sweep (142 open; a sweep is churn for
      tickets nobody will read this month). Completed tickets are never converted.

## Decisions
- 2026-11-13, owner: organised like a Jira page — title, next steps, summary, description, tracker, links.
  No diagram section ("immutable diagrams" was a typo).

## Open questions
- Should `relates:` in the frontmatter be the single source for Links (the dashboard renders it), with no
  hand-written list? Recommended: yes, one place.

## Files
`.planning/todos/TEMPLATE.md` (new) · `tools/dashboard/index.mjs` · `tools/dashboard/app.html`

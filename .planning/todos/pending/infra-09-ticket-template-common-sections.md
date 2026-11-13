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

## Summary
Tickets today use ~40 different `##` headings (133 × Acceptance, 34 × Request, 27 × What, 16 × Spec, then a long
tail). The owner wants Jira-style fixed sections in a fixed order, so any ticket parses at a glance.
This ticket is written in the proposed order as a sample.

## Next action
Owner: confirm or edit the section list below, and say what "immutable diagrams" means (see Open questions).

## Progress
- [ ] Section list ratified by the owner.
- [ ] `.planning/todos/TEMPLATE.md` exists; the orchestrator handoff and LANE-AGENT-BRIEF point at it (one line each).
- [ ] The dashboard renders the known sections in the fixed order whatever order the file has them in, shows
      Summary + Next action + a progress bar (ticked / total boxes) at the top, and lists non-conforming tickets
      on its existing offenders report.
- [ ] Open tickets are converted **when next touched**, not in one sweep (142 open; a sweep is churn for
      tickets nobody will read this month). Completed tickets are never converted.

## Proposed order
1. **Summary** — 2–4 plain lines. What and why.
2. **Next action** — one line: who (owner / lane) does what next.
3. **Progress** — the acceptance checkboxes. They are the progress tracker.
4. **Decisions** — dated owner rulings on this ticket, append-only; links to DEC-NN records (INFRA-10).
5. **Diagram** — optional.
6. **Detail** — free-form: spec, investigation, measurements. The only section with no fixed shape.
7. **Links** — tickets, decisions, deep-dive forms (INFRA-12), handoffs.
8. **Files** — the paths this touches.
9. **Log** — dated, append-only work notes.

## Open questions
- "Immutable diagrams": does that mean a diagram an agent may not redraw without the owner's sign-off, or
  something else?
- Should `relates:` in the frontmatter become the single source for Links (the dashboard renders it), with the
  `## Links` section dropped? Recommended: yes, one place.

## Files
`.planning/todos/TEMPLATE.md` (new) · `tools/dashboard/index.mjs` · `tools/dashboard/app.html`

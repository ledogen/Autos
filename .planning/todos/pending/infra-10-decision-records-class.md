---
id: INFRA-10
type: infra
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-12 — the "ledorepo" brief (sculpting a personal Jira: tracker + lanes + deep-dive forms)
relates: INFRA-09, .planning/story-mode/DESIGN.md (SM-INV-1..15), CLAUDE.md, memory MEMORY.md § Standing do-nots
---
lane: unplaced (tooling — orchestrator or a Spare agent; touches no game code)

# INFRA-10: ledorepo — decision records (DEC-NN): the axioms in one place

## Next steps
Owner: answer the backfill question below.

## Summary
The project's ground truth is spread over DESIGN.md (SM-INV-1..15), eight `design-amendments-*.md` files, CLAUDE.md,
the memory folder's "standing do-nots", and rulings buried in tickets — about 10,400 lines in `story-mode/` alone,
written by and for LLMs. The owner cannot find the axioms, and agents report after the fact that a request
contradicted nine earlier rulings. Fix: an architecture decision record (ADR — one short file per decision: the
ruling, the date, why, what it replaced) as a ticket class, shown in the tracker and in the Links of every ticket it
governs.

## Tracker
- [ ] New class `decision`, ids `DEC-NN`, files `.planning/decisions/dec-NN-<slug>.md`. Frontmatter: `id`, `status`
      (`standing` / `superseded`), `decided` (date), `supersedes`, `governs` (ticket ids, file paths, subsystems).
      Body: **Ruling** (one or two sentences, the owner's words where they exist) · **Why** · **Replaces** · **Source**.
- [ ] A record is never edited after it is decided; a change of mind is a new DEC that supersedes it. (This is the
      "immutable" part.)
- [ ] Dashboard: a **Decisions** tab (standing only by default, grouped by subsystem, one line each — the page the
      owner reads to see the ground truth); every ticket page lists the DECs whose `governs` names it.
- [ ] Backfill: SM-INV-1..15, the memory "standing do-nots", the orchestrator handoff's "standing rulings", and
      CLAUDE.md's hard rules each become a DEC that quotes its source. The source documents stay; they cite the DEC id.
- [ ] The check that prevents "you went against 9 things": before planning a ticket, an agent reads the DECs that
      govern the files and subsystems it will touch and lists any conflict **before** work starts (one line in
      LANE-AGENT-BRIEF and the orchestrator handoff).

## Decisions
- 2026-11-12, owner: **backfill all** existing rulings, not only new ones.

## Open questions
- Backfill everything now (roughly 60–100 records, one agent task, then an owner skim), or only record decisions
  from here on? Recommended: backfill — the old rulings are the ones being violated.
- When a DEC and DESIGN.md disagree, which wins? Recommended: the DEC, because it is dated and DESIGN.md is prose.

## Files
`.planning/decisions/` (new) · `tools/dashboard/index.mjs` · `tools/dashboard/app.html` · CLAUDE.md § Workflow

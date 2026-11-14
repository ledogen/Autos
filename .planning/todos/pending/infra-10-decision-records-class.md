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
Owner: answer the deep dive `INFRA-10-conflicts` (5 axioms, 2 cases, 10 wording approvals; owed card).
ledorepo session, after the submit: each approved axiom becomes its own DEC; the 18 conflict drafts and the 44
agent-worded drafts flip to `standing` (or are corrected first); then DESIGN.md's SM-INV headings and memory's
standing do-nots cite their DEC ids; close.

## Summary
The project's ground truth is spread over DESIGN.md (SM-INV-1..15), eight `design-amendments-*.md` files, CLAUDE.md,
the memory folder's "standing do-nots", and rulings buried in tickets — about 10,400 lines in `story-mode/` alone,
written by and for LLMs. The owner cannot find the axioms, and agents report after the fact that a request
contradicted nine earlier rulings. Fix: an architecture decision record (ADR — one short file per decision: the
ruling, the date, why, what it replaced) as a ticket class, shown in the tracker and in the Links of every ticket it
governs.

## Description
The plan the owner approved 2026-11-13 (it wins over the Tracker wording below where they differ).

### Context

The project's rulings are spread over DESIGN.md (SM-INV-1..15), eight `design-amendments-*.md` files, CLAUDE.md,
the memory folder and ticket bodies. The owner cannot find the axioms, and agents discover conflicts after the
work is done. INFRA-10 puts every standing ruling in one short file each, shows them on one dashboard tab, and
lists them on every ticket they govern.

Owner rulings so far: backfill everything (2026-11-12). Today (2026-11-13): **a DEC beats DESIGN.md** when they
disagree; scope is **project + process** rulings (nothing about the owner personally); **current rulings only**
(overturned ones are named in the successor's "Replaces" line, not given their own record); **conflicts are
settled by open alpha-cut tickets first**, then by the owner: 5 detailed axioms + up to 30 single cases.

### The record format (this is what needs sign-off)

File: `.planning/decisions/dec-NNN-<slug>.md` (three digits so they sort; about 60–100 expected).

```markdown
---
id: DEC-014
status: standing            # draft | standing | superseded
decided: 2026-07-16         # the date of the ruling, not of the backfill
area: story                 # one of: story · economy · world · roads · physics · perf · assets · ui · process · repo
governs: FEAT-114, FEAT-138, src/mission.js, par
supersedes:                 # a DEC id, when this one replaces an earlier record
---
# DEC-014: Par is never rendered as a countdown

**Ruling.** Par is never shown as a countdown; timers are one authored mission flavour, not the driver.
**Why.** One or two sentences, from the source.
**Replaces.** What it overturned, if anything ("the live par clock, design-amendments-2026-10-14").
**Source.** DESIGN.md § Invariants, SM-INV-3 (owner, 2026-07-16; amended 2026-10-15).
```

Rules:
- **Ruling** is one or two sentences: the owner's words where they exist, otherwise an agent's wording that the
  owner approved (owner, 2026-11-13). **Source** says which ("owner's words" / "agent wording, owner approved
  <date>"). A record that needs more than two sentences is two records, except an axiom (step 5), which is as
  long as it needs to be.
- `governs` mixes ticket ids, file paths and plain subsystem words. An agent finds its records with
  `grep -l <file or word> .planning/decisions/*.md`.
- `draft` = a backfilled record whose sources conflict and the owner has not yet ruled. `standing` = decided, and from then on the file is frozen
  except for its `status:` line. A change of mind is a new DEC with `supersedes:`; the old one flips to `superseded`.
- SM-INV-N numbers stay as names people already use; each maps to exactly one DEC.

### Build steps

Worktree `CarGame-decisions`, branch `infra/infra-10-decision-records`, dev dashboard on :8011 with
`LEDOREPO_DATA=<copy>`. Commit at every step.

0. Copy this plan into the INFRA-10 ticket (Description) and record today's rulings under Decisions.
1. **Dashboard, server** (`tools/dashboard/index.mjs`): read `.planning/decisions/*.md` inside `indexTickets()` as
   pseudo-tickets, the same way `indexMilestones()` already does for SM-N. Reuse `parseFrontmatter`, `titleOf`,
   `blurbOf`. Add `DEC` to `TICKET_RE` and `TYPE_FROM_PREFIX`, `decision` to `CANON_TYPE`, `draft/standing/superseded`
   to `CANON_STATUS`. Parse `governs`; for each ticket id in it push the DEC onto `t.decisions` (same shape as the
   existing `t.dives` loop).
2. **Dashboard, page** (`tools/dashboard/app.html`): add `DEC` to the page's `TICKET_RE` so every `DEC-014` in any
   ticket becomes a link. A `#/decisions` route + `viewDecisions()`: standing only by default (a toggle shows
   draft / superseded), grouped by `area`, one line each (id · ruling title · date). A "decisions" row in
   `viewTicket`'s Links block beside "deep dives". Decisions stay out of the Tickets list and its open counts.
   A DEC's own page is the existing `viewTicket` (it already renders any markdown body).
3. **Check** `tools/dashboard/decisions.check.mjs` (plain node, like `data-api.check.mjs`): ids unique, required
   frontmatter present, `area` in the list, every `supersedes` target exists and is marked `superseded`, and a
   non-draft record's file is unchanged since the commit that made it `standing` apart from the `status:` line
   (found with `git log -S"status: standing"` — the "pickaxe" search, which lists commits that added that text).
4. **Backfill** — one opus subagent, one task, writing records from the CURRENT planning: DESIGN.md SM-INV-1..15
   and its ratification passes; the eight amendments files; MEMORY.md § Standing do-nots and the `feedback_*` /
   `project_*` ruling files (process and project only); the orchestrator handoff's "Standing rulings"; CLAUDE.md's
   hard rules (seams, Do-NOT-use list, seeds, asset rules, workers fence); the `## Decisions` sections of tickets.
   Each record quotes its source. Duplicates across sources collapse to one record citing all of them.
   **Conflict rule (owner, 2026-11-13):** where two sources disagree and one is a ruling in an OPEN ticket in the
   alpha cut (MILESTONES.md § Release cuts — read here as "pre-alpha"), the ticket wins, because it is the more
   recent. The record is written `standing` with the losing text in **Replaces**. A record with no conflict is
   also written `standing`. Only a conflict the rule cannot settle (two alpha tickets disagree, or neither side
   is a ticket) is written `draft`, with both sides quoted, and goes to step 5.
   The agent also returns a conflict ledger: every conflict found, how it was settled, and by which source.
5. **Owner conflict pass** — the owner's budget is **5 axioms + up to 30 single cases**. The agent clusters the
   unsettled conflicts by root cause. The five clusters that settle the most conflicts each become one axiom
   question: the conflict stated plainly, the cases it would settle listed under it, and a detailed ruling the
   agent has already DRAFTED (`<dive-q options="approve | change">`; the note box takes the owner's rewrite or
   edits). The next 30 by number of open alpha tickets touched become single questions
   (`<dive-q options="A | B">`, the two sides quoted, the agent's recommended side first). All in one deep dive, `.planning/dives/INFRA-10-conflicts.html`, linked from an owed card.
   The same page lists, read-only, the conflicts the ticket rule already settled, so a wrong auto-settle is
   visible. On submit: each axiom becomes its own DEC (the approved draft, or the owner's rewrite; `governs` = everything it settled);
   each case flips its draft to `standing`. Anything past the budget stays `draft`, shown on the Decisions tab
   under "unsettled", and is asked when a ticket next touches it.
6. **Wire it into the rules** (after the conflict pass):
   - CLAUDE.md § Workflow: the `decision` class, the freeze rule, "DEC wins over DESIGN.md", and the pre-work check
     ("before planning, read the DECs that govern the files you will touch; list conflicts first").
     CLAUDE.md § Story Mode: "the invariant wins" becomes "the DEC wins".
   - One line each in `LANE-AGENT-BRIEF.md` and the orchestrator handoff (its files: send the text, it applies),
     including "a taken dive's rulings become DECs".
   - DESIGN.md: each `SM-INV-N` heading gains its `(DEC-NNN)`. Memory § Standing do-nots: same.
   - `.planning/research/LAYOUT.md`: the new folder.
7. Land through the orchestrator (branch + which of its files changed, wait for "go", `--no-ff`, restart :8010
   only). Close INFRA-10.

### Not doing
- No YAML library, no schema file: the lenient `parseFrontmatter` already there is enough.
- No superseded-history records (owner ruling). No record-by-record skim of the 60–100: the owner sees conflicts only. No editing UI: records are files.
- No game-side gate in `test/gates.mjs`; the check is a dashboard check.

### Verification
- `node tools/dashboard/decisions.check.mjs` passes; edit a `standing` record's body and it fails.
- `node tools/dashboard/data-api.check.mjs` still passes.
- On :8011: Decisions tab lists records grouped by area; a governed ticket's page shows its decisions row; a
  `DEC-NNN` in a ticket body is a link; Tickets tab counts are unchanged from :8010.
- The conflict ledger accounts for every draft (each is in the dive or listed as past the budget).
- The conflicts dive saves and submits against the COPY of the data folder.

## Tracker
- [x] Class `decision`, `DEC-NNN`, `.planning/decisions/dec-NNN-<slug>.md`, format in CLAUDE.md § Workflow.
- [x] The freeze: `tools/dashboard/decisions.check.mjs` (format, supersedes links, no edit after standing on main).
- [x] Dashboard: Decisions tab by area; a ticket page lists the records that govern it; `DEC-NNN` links anywhere.
- [x] Backfill: 121 records (DEC-001..015 = SM-INV-1..15), ledger `.planning/decisions/conflicts.json`
      (9 settled by the open-alpha-ticket rule, 5 axioms over 16 drafts, 2 cases).
- [x] The read-before-planning rule: CLAUDE.md; lines sent to the orchestrator for LANE-AGENT-BRIEF + its handoff.
- [ ] Owner's answers applied: axioms become DECs, 62 drafts resolved to `standing`.
- [ ] Source documents cite the DEC ids (DESIGN.md SM-INV headings, memory § Standing do-nots).

## Decisions` sections of tickets.
   Each record quotes its source. Duplicates across sources collapse to one record citing all of them.
   **Conflict rule (owner, 2026-11-13):** where two sources disagree and one is a ruling in an OPEN ticket in the
   alpha cut (MILESTONES.md § Release cuts — read here as "pre-alpha"), the ticket wins, because it is the more
   recent. The record is written `standing` with the losing text in **Replaces**. A record with no conflict is
   also written `standing`. Only a conflict the rule cannot settle (two alpha tickets disagree, or neither side
   is a ticket) is written `draft`, with both sides quoted, and goes to step 5.
   The agent also returns a conflict ledger: every conflict found, how it was settled, and by which source.
5. **Owner conflict pass** — the owner's budget is **5 axioms + up to 30 single cases**. The agent clusters the
   unsettled conflicts by root cause. The five clusters that settle the most conflicts each become one axiom
   question: the conflict stated plainly, the cases it would settle listed under it, and a detailed ruling the
   agent has already DRAFTED (`<dive-q options="approve | change">`; the note box takes the owner's rewrite or
   edits). The next 30 by number of open alpha tickets touched become single questions
   (`<dive-q options="A | B">`, the two sides quoted, the agent's recommended side first). All in one deep dive, `.planning/dives/INFRA-10-conflicts.html`, linked from an owed card.
   The same page lists, read-only, the conflicts the ticket rule already settled, so a wrong auto-settle is
   visible. On submit: each axiom becomes its own DEC (the approved draft, or the owner's rewrite; `governs` = everything it settled);
   each case flips its draft to `standing`. Anything past the budget stays `draft`, shown on the Decisions tab
   under "unsettled", and is asked when a ticket next touches it.
6. **Wire it into the rules** (after the conflict pass):
   - CLAUDE.md § Workflow: the `decision` class, the freeze rule, "DEC wins over DESIGN.md", and the pre-work check
     ("before planning, read the DECs that govern the files you will touch; list conflicts first").
     CLAUDE.md § Story Mode: "the invariant wins" becomes "the DEC wins".
   - One line each in `LANE-AGENT-BRIEF.md` and the orchestrator handoff (its files: send the text, it applies),
     including "a taken dive's rulings become DECs".
   - DESIGN.md: each `SM-INV-N` heading gains its `(DEC-NNN)`. Memory § Standing do-nots: same.
   - `.planning/research/LAYOUT.md`: the new folder.
7. Land through the orchestrator (branch + which of its files changed, wait for "go", `--no-ff`, restart :8010
   only). Close INFRA-10.

### Not doing
- No YAML library, no schema file: the lenient `parseFrontmatter` already there is enough.
- No superseded-history records (owner ruling). No record-by-record skim of the 60–100: the owner sees conflicts only. No editing UI: records are files.
- No game-side gate in `test/gates.mjs`; the check is a dashboard check.

### Verification
- `node tools/dashboard/decisions.check.mjs` passes; edit a `standing` record's body and it fails.
- `node tools/dashboard/data-api.check.mjs` still passes.
- On :8011: Decisions tab lists records grouped by area; a governed ticket's page shows its decisions row; a
  `DEC-NNN` in a ticket body is a link; Tickets tab counts are unchanged from :8010.
- The conflict ledger accounts for every draft (each is in the dive or listed as past the budget).
- The conflicts dive saves and submits against the COPY of the data folder.

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
- 2026-11-13, owner: when a DEC and DESIGN.md disagree, **the DEC wins**.
- 2026-11-13, owner: scope is **project + process** rulings; nothing about the owner personally becomes a record.
- 2026-11-13, owner: **current rulings only**; an overturned ruling lives in its successor's Replaces line.
- 2026-11-13, owner: "backfill the decision records with the current planning. supercede any conflicts with open
  pre-alpha tickets rulings since those are likely more current. im willing to provide 5 detailed axioms where we
  can answer many conflicts with one detailed ruling and answer up to 30 conflicts case-by-case"
- 2026-11-13, owner: "a ruling can be an agents words if i approve them."
- 2026-11-13, ledorepo session (not an owner ruling): a record whose ruling line is an agent's wording waits as
  `draft` until the owner approves it, so the freeze never has to be broken to fix a wording.

## Links
Deep dive: `.planning/dives/INFRA-10-conflicts.html`. Not read by the backfill: `spirits-and-pacts.md`, `IDEAS.md`;
only skimmed: run-shape, missions, items, cargo, pois, opening; non-alpha tickets were grepped, not read.
Left unrecorded as unclear: par grip 0.72 (code) vs 0.80 (DESIGN.md); whether hunger is "a word, never a gauge".

## Files
`.planning/decisions/` (new) · `tools/dashboard/index.mjs` · `tools/dashboard/app.html` · CLAUDE.md § Workflow

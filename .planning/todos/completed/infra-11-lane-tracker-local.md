---
id: INFRA-11
type: infra
status: closed
severity: major
opened: 2026-11-12
source: owner, 2026-11-12 — the "ledorepo" brief (sculpting a personal Jira: tracker + lanes + deep-dive forms)
relates: INFRA-12, INFRA-13, .planning/pages/alpha-lanes.html, .planning/handoffs/HANDOFF-2026-10-25-orchestrator.md, tools/dashboard/
---
lane: unplaced (tooling — orchestrator or a Spare agent; touches no game code)

# INFRA-11: ledorepo — the lane tracker runs locally (inbox, owed, lanes) instead of as a claude.ai artifact

## Next steps
None. Closed. Deep-dive forms continue in INFRA-12.

## Summary
The Alpha Lanes tracker is a page hosted on claude.ai with its data (inbox, owed answers, lane status) in
Anthropic's artifact database. Move it into the local dashboard app (`npm run dash`, :8010) with the data as files
on disk, so it is in git, backed up (INFRA-13), linkable to tickets, and readable by agents with a plain file read.
The owner's loop must survive unchanged: slam thoughts into the intake box while playtesting, answer the owed
items inline later, autosave throughout.

## Description
**The approved plan (owner sign-off 2026-11-13). Worktree `CarGame-ledorepo`, branch `infra/infra-11-lanes-tab`, dev port 8011.**

### Context

The Alpha Lanes tracker is a page hosted on claude.ai. Its state is split three ways: the lane and owed
lists are JavaScript arrays inside the page's source, the answers and inbox are in Anthropic's artifact
database, and the tickets are in the repo. One owner answer costs the orchestrator a database read, a
ticket edit, an array edit and a republish, and every clear costs ~25k tokens to re-read the page before
it may publish. None of it is in git.

Owner rulings so far (in the ticket): build it as a **Lanes tab in the existing dashboard**
(`tools/dashboard/`, :8010); the **data lives in the private repo** at
`~/CodeShit/ledorepo/projects/cargame/`; it must be usable **from anywhere** (phone included).

Outcome: the same loop the owner uses today (type into intake while playtesting, answer owed items later,
autosave throughout), served from this Mac, with every fact in exactly one file, backed up by the hooks
already installed.

### The data: one file per fact, one writer per file

Folder `~/CodeShit/ledorepo/projects/cargame/` (path overridable with an environment variable,
`LEDOREPO_DATA`, so a dev copy can point at a scratch folder):

| File | Written by | Contents |
|---|---|---|
| `inbox/<timestamp>-<rand>.json` | owner (the page) | `{text, at}` |
| `inbox/<same id>.reply.json` | orchestrator | `{status: done\|ticket\|question, reply, handledAt}` |
| `owed/<id>.json` | orchestrator | the question: `{kind, tk, blocks?, text, options?}` (today's `OWED` array, one item per file) |
| `owed/<id>.answer.json` | owner (the page) | `{choice, note, at}` |
| `answered/…` | orchestrator | an owed pair moves here once acted on, so "what is new" is a directory listing |
| `lanes/<id>.json` | orchestrator | the lane: `{name, goal, wt, branch, port, owns, tasks: [{id, what, status}]}` (today's `LANES` array) |
| `lanes/<id>.handoff.md` | that lane's agent | its handoff, plain markdown |
| `lanes/<id>.now` | orchestrator at spawn, agent at stop | the one "now" line |

Because the owner and an agent never write the same file, there are no version numbers and no write races.
Agents read and write these with ordinary file tools; no artifact tool calls.

### Changes

**1. Server — `tools/dashboard/index.mjs`** (in `serve()`, next to the existing `/upload` route, ~60 lines)
- `GET /data` returns the whole folder as one JSON object (it is a few hundred small files at most).
- `PUT /data/<path>` and `DELETE /data/<path>` write or remove one file. The path is checked against a
  fixed allow-list (a regular expression): the page may write only `inbox/<id>.json` and
  `owed/<id>.answer.json`, and delete only inbox items. Anything else is refused, so the page still cannot
  touch a ticket or an agent-owned file.
- Writes are atomic (write a temp file, then rename), so a reader never sees a half-written file.
- Unlike `/upload`, these routes are not limited to this machine, because the phone must reach them.

**2. Page — `tools/dashboard/app.html`** (a `viewLanes()` view, ~200 lines lifted from `alpha-lanes.html`)
- **Lanes is the home tab** (owner): first in the nav, and what `http://localhost:8010/` opens. The two
  places that default to Tickets today (`if (!location.hash)` at the bottom of the script, and the router's
  final fallback) default to `#/lanes`.
- Add the nav link, the router branch and hide the search box on this tab (the three places the router needs).
- Three sections, same as today: **intake box** (Cmd/Ctrl+Enter submits; new items on top, handled ones
  folded with the agent's reply), **owed cards** (blockers first, then decide / drive / make; choice
  buttons, note box, 600 ms autosave), **lane board** (now line, tasks, handoff).
- Reuse the dashboard's own `inline(esc(text))` helper for all text, which turns every ticket id into a
  link to its ticket page. That is the "click FEAT-XXX" request, done for free.
- Refresh by polling `GET /data` every 5 s while the tab is visible, skipping the repaint while a text box
  has focus (the artifact page has the same guard).
- Phone width: single column, 16 px text boxes so iOS does not zoom. The dashboard has no phone rules
  today; only this tab gets them.
- Uses the dashboard's existing colour tokens and card/button classes; the artifact's `.chip` class is
  renamed because the dashboard already uses that name for filter toggles.

**3. One-time import — `tools/dashboard/import-artifact.mjs`** (deleted after use)
- Reads the `LANES` and `OWED` arrays out of `.planning/pages/alpha-lanes.html`, and the `inbox`, `owed`,
  `lanes`, `tasks` collections from the artifact database (saved to disk with the artifact read tool),
  and writes the files above. Owed items already answered and acted on go straight to `answered/`.

**4. Backup — `~/CodeShit/ledorepo/backup.sh`**: `git add -A backup projects` (one word), so the tracker
data is committed and pushed by the hooks already in place.

**5. Server always up — `~/.claude/settings.json`**: one more SessionStart hook entry, same pattern as the
caffeinate one: if nothing is listening on :8010, start `npm run dash` in the background.

**6. Agent instructions** (the orchestrator's files; I draft the replacement text, it applies them at cutover)
- `HANDOFF-2026-10-25-orchestrator.md`: "On wake" step 2, the spawn/now-line lines, the inbox drain, and
  "The pages" section — replace database calls with file reads/writes; delete the publish ritual.
- `LANE-AGENT-BRIEF.md` lines 12–14, 42–45, 51: read/write `lanes/<id>.handoff.md` and `.now`.
- `.planning/pages/alpha-lanes.html` is deleted (git history keeps it). `test/page-scripts.mjs` stays: it
  still guards `mission-feel-review.html`.

### Deliberately left out (say so if you want them)

- **Your status button and note box on each task row.** Agents own task rows in the new layout; keeping
  your buttons would put two writers on one file. Tasks show read-only. Your notes go in the intake box.
- **The static "Closed since 10-24" lists.** The Tickets tab already lists closed tickets.
- **"Step 0" (links on the old artifact).** Superseded: the new tab has them and replaces the artifact.
- **Login / password.** Tailscale is the lock. On home wifi anyone on your network could open :8010, as
  they can today.
- **Deep-dive forms and their four statuses** — that is INFRA-12, next, on top of this.

### Tailscale setup guide (an artifact, published FIRST so you can install while I build)

A short, single-page guide on claude.ai (so it opens on the phone too), with tick-boxes per step. It needs
your account, so these are steps only you can do. Contents:
1. **Mac:** install Tailscale, sign in, and the exact settings to use — MagicDNS on (the feature that lets
   you type the Mac's name instead of a number), key expiry disabled for the Mac (so it does not silently
   drop off after six months), and what to leave OFF: exit node, subnet routes, and above all Funnel (the
   one feature that would put the page on the public internet).
2. **Phone:** install the app, sign in with the same account, leave the VPN toggle on.
3. **macOS firewall:** if it is on, allow incoming connections for `node`.
4. **Test:** the exact address to open on the phone (`http://<Mac's name>:8010/`), filled in with this
   Mac's real name, and what to check if it does not load (Mac asleep, dashboard not running, VPN off).

I will check each setting against Tailscale's current documentation when writing it, not from memory.
Everything else in this plan works on localhost before you have done any of it.

### Order of work

0. Publish the Tailscale guide.
1. Worktree `CarGame-ledorepo`, branch `infra/infra-11-lanes-tab`, dev dashboard on :8011 against a scratch
   data folder. WIP commits each step.
2. Server routes + the check script. 3. The Lanes view. 4. Import script, run against a scratch folder.
5. **Cutover**, at a quiet moment called with the orchestrator: it stops writing the artifact, I run the
   import into the real folder, merge to main, restart the :8010 server, and it applies the rewritten
   handoff and brief. The old artifact gets a "moved" note in its inbox and is left alone.

### Verification

- `node tools/dashboard/data-api.check.mjs` — starts the server on a spare port with a temp folder; asserts
  a PUT then GET round-trips, and that a path outside the allow-list, a `..` path, and a write to a
  `.reply.json` are all refused.
- In Chrome through the existing CDP helper: type an intake item, reload, it is still there and the file
  exists; pick an owed choice and type a note, the `.answer.json` appears within a second; write a
  `.reply.json` by hand, the reply shows within 5 s; a ticket id in an owed card opens that ticket.
- A phone-width screenshot (390 px) of the tab for the owner.
- After the import: counts match the artifact (24 owed, 5 lanes, the inbox count read at cutover).
- `npm test` (only `page-scripts` is affected) and the dashboard's other tabs still load.

### What the artifact costs today (orchestrator, 2026-11-12)
- **Publish ritual.** After every clear the orchestrator must re-read all 452 lines of the page (~25k tokens,
  three reads) before it may publish, though it only changes two JavaScript arrays.
- **State split three ways.** The lane and owed lists live in the page's HTML source, the answers and inbox in the
  page database, the tickets in the repo. One owner answer costs a database read, a ticket edit, an array edit and
  a republish. Answered owed documents are never deleted (75 now, most stale).
- **Write races.** Each database write needs a version number, and lane agents race the orchestrator on the same
  `lanes/<id>` document. The `tasks` rows drift from the arrays.
- A missing comma once shipped the page dead (hence `test/page-scripts.mjs`).

So the local design must have **one** home per fact: lists and answers as data files, never in the page source.
An answered owed item moves to an `answered/` folder so "what is new" is a directory listing.

## Tracker
- [x] (dropped 2026-11-13: superseded, the new tab links ids and replaces the artifact) Step 0: every ticket id on the current artifact links to
      `http://localhost:8010/#/t/<ID>` (the dashboard already has that route).
- [x] The dashboard gains a **Lanes** tab with the artifact's three parts: the lane board (now line, tasks), the
      **inbox** box, and the **owed** cards with their choice buttons and note box. Autosaves on every keystroke pause.
- [x] Storage is one small JSON file per item (`inbox/<timestamp>.json`, `owed/<id>.json`, `lanes/<id>.json`), so
      the owner typing and an agent replying never write the same file. The dashboard stops being read-only **for
      this data directory only**; it still never edits a ticket.
- [x] The orchestrator handoff's "On wake" and LANE-AGENT-BRIEF read and write those files instead of the artifact
      db. The publish ritual (read every line, `page-scripts.mjs`, republish) is deleted.
- [x] Reachable from the owner's phone over Tailscale; the intake box and owed cards are usable at phone width.
- [x] One-time import of the artifact's `inbox`, `owed`, `lanes`, `tasks` collections; the artifact gets a banner
      pointing at the local page and is then left alone.
- [x] The server starts at login (done as a SessionStart hook, not launchd: owner preference), so the page is
      always there.

## Decisions
- 2026-11-12, owner: the app and its private data live in their **own private repo**, not the public game repo.
  Tickets and decision records stay in the game repo beside the code. The owner will use it on other projects.
  Open: one generic `ledorepo` or one per project — recommended one generic repo: the app at the top, a folder per
  project (`projects/cargame/` holding inbox, owed, dive answers and that project's memory backup), and a small
  config line per project giving the path of its checkout.
- 2026-11-12, owner: must be usable **anywhere**, not only at the Mac. So: Tailscale (a private network between the
  owner's devices) on the Mac and phone, the server listening on the Tailscale address only, and the Lanes page
  laid out for a phone screen.
- 2026-11-13, owner: build it as a **Lanes tab in the existing dashboard** (`tools/dashboard/`, :8010), not a new
  app. Only the data (inbox, owed, lanes, dive answers) lives in the private repo, at
  `~/CodeShit/ledorepo/projects/cargame/`. The generic core is pulled out into ledorepo when a second project
  needs it, not before. This narrows the "own private repo" ruling above to the data.

## Open questions
- Cut over at a quiet moment: the orchestrator and its agents write the artifact db all day. Who calls the window?
- Does the item-setup artifact (Lane C's) move too, or stay until its work is done? Recommended: stay.

## Files
`tools/dashboard/index.mjs` · `tools/dashboard/app.html` · `.planning/pages/alpha-lanes.html` (retired) ·
`.planning/handoffs/HANDOFF-2026-10-25-orchestrator.md` · `.planning/handoffs/LANE-AGENT-BRIEF.md`

## Log
- 2026-11-13: built on `infra/infra-11-lanes-tab`, landed on main 5b8c0e88 at a cutover window called with the
  orchestrator. Imported 88 inbox items, 25 owed, 5 lanes; 74 stale answers archived in `answered/`. Checks:
  `node tools/dashboard/data-api.check.mjs` PASS; a headless-Chrome run of intake / owed answer / agent reply /
  reload / phone width PASS on a copy of the data before cutover. Tailscale: the Mac is `m4air`, reachable at
  `http://m4air:8010/` from the Mac itself; the phone is on the network. **Not yet verified: the page opened
  from the phone.** The artifact got no banner (its page source is deleted; it is simply no longer written).
- Left out by the approved plan: the owner's per-task status button and note box (tasks are read-only), the
  static "Closed since" lists.
- 2026-11-13: the owner sent an inbox item from the phone over Tailscale and it arrived as a file. Closed.

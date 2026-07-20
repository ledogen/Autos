# Story Mode — Ideas scratchpad

The low-ceremony companion to [DESIGN.md](DESIGN.md) and [MILESTONES.md](MILESTONES.md): a running
list of **neat ideas not yet worth a ticket**. Drop a line or a short paragraph; no frontmatter, no
ritual. This is the surface *below* `.planning/todos/pending/` — when an idea firms up into
something buildable, promote it into a pending ticket (`feat-*.md`) and delete it here (or leave a
one-line "→ FEAT-NN" pointer).

Conventions (keep them light):
- One `##` entry per idea. Date it. Link the invariants / tickets it touches so a future session
  can place it (`SM-INV-N`, `FEAT-NN`, `DESIGN.md`).
- Design-level story-mode *unknowns* still go in DESIGN.md "Open questions"; *buildable* things
  still go in pending tickets. This file is for the in-between: "wouldn't it be cool if…".
- Scoped to story-mode ideas (it lives here); a general non-story idea can still land as a pending
  ticket.

---

## Contrasting spirits: the night-owl vs. the camper — 2026-07-19

Two **meta-progression spirits** (working title *spirits*, maybe *sprites* — naming unsettled)
that pull a run in opposite directions. Both are objective-reshapers in the sense of SM-INV-9 and
the meta-progression breadth model (DESIGN.md "The world: regions, story states, spirits"): they
change the *shape* of a run, not the player's power floor.

- **The deviant / night-owl spirit — rewards staying up dangerously.** On runs where it shows up,
  pushing past sleepy is *encouraged*: it **lessens the doze effect** (a clean rule-change) and
  **pays more for missions run while sleepy** (a risk↔reward trade — the dangerous state is the
  price of the bonus). A force that seduces you into staying out too late. The whole point is that
  it makes the *dangerous* line the optimal line for that run.
- **The camper spirit — rewards good rest instead of grinding.** The mirror: it lets you **replace
  some amount of mission-grinding with finding great campsites and resting a lot** — a different
  kind of run, optimizing toward good nights over wicked missions. Possibly even a **different kind
  of ending**. (This is essentially the *camping spirit* already named as the canonical
  objective-reshaper example in DESIGN.md — this entry extends it with the "different ending" hook
  and pairs it against the night-owl.)

Why they're a good pair: they're a legible axis (reckless-nights ↔ restful-days) the player unlocks
into the deck over many runs, each re-pointing what a run is *for* — exactly the "more shapes a run
can take, never a higher floor" intent of SM-INV-9.

Guardrails to honor when this gets real:
- **SM-INV-9 — re-weight, don't hand out.** The night-owl's "more mission reward" must stay *bought
  with danger* (conditioned on the sleepy state), never a flat "+X% payout when the spirit is
  present" — that's the balance-sheet erosion the invariant forbids.
- **SM-INV-1 — dozing is not a fail state.** The night-owl softens the doze; it must never remove
  the "eyes shut on a mountain road, physics decides" reality. It lowers the tax, doesn't cancel it.
- **SM-INV-7/8** — a spirit is breadth in the deck, not a starting-strength buff; nothing about it
  persists as power.
- The camper's **"different ending"** touches DESIGN.md Open Question 1 (what "beating the game"
  means) — escalate rather than inventing an endgame around it.

Related: DESIGN.md SM-INV-9 (spirits = rules not resources / breadth-not-floor), SM-INV-1 (doze),
SM-INV-6 (camping-is-a-place), the meta-progression section; `.planning/story-mode/MILESTONES.md`
SM-5 (spirits land here). Naming decision (*spirits* vs *sprites*) is open.

**Update 2026-07-20:** these two now sit under **The Roamer** (DESIGN.md "The Roamer — the story
spine"), the meta-spirit the individual spirits read as facets of. The camper's "different ending"
hook feeds Q1's residual (concrete endgame) — still escalate. Also new: *meeting* a spirit is now
one of the ways a **class** unlocks (DESIGN.md "Classes"), so the night-owl and camper double as
class-unlock sources.

---

## The Roamer — story spine now ratified → this file's ideas hang off it — 2026-07-20

Pointer, not a new idea: the story through-line is set and lives in **DESIGN.md → "The Roamer — the
story spine"** [RATIFIED 2026-07-20]. You are subtly guided by a spirit of your own past self who
roamed these lands on horseback; the car is your horse; the reveal is gradual (normal life → subtle
weirdness → louder). It resolved most of DESIGN.md Open Q1 and relaxed SM-INV-11 (authored in-world
beats now allowed at threshold moments). Delivery lands in MILESTONES SM-5.

When dropping story-mode ideas here now, place them against the Roamer: is this a **parameter-state**
beat (ambient), a **doze** visitation, an **authored in-world beat** (a main mission / staged scene),
a **spirit** (rule-change), or a **class** unlock? And remember the Roamer's economy: it trades in
**knowledge + unlocks + story keys**, never resources or run-layer power (SM-INV-8/9).

Two things still open and owner-only (don't invent them in an idea): the **Roamer's motives**
(benevolent BoTW-guide vs. self-interested/with-teeth — DESIGN.md Open Q1) and **how classes stay
strictly breadth** vs SM-INV-7 (DESIGN.md Open Q10).

Related: DESIGN.md "The Roamer", SM-INV-11 (relaxed), SM-INV-8/9, "Classes", Open Q1 & Q10;
MILESTONES.md SM-4 (region unlock = Roamer's old trails, main-mission gated) and SM-5 (delivery).

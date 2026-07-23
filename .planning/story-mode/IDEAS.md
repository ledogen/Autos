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

---

## The road-bender spirit: camber as the thing that shifts — 2026-07-21

A **spirit** (rule-change facet of the Roamer, per SM-INV-9) whose whole signature is that it
**bends the roads themselves**. The world already banks its corners from curvature
(`camberStrength · κ`, clamped ±20°, live-tunable via the Road Surface slider); this spirit reaches
into that dial as its way of re-pointing a run.

Flavours, weakest → boldest:
- **Working-with-it raises the bank.** The more you travel with / earn favor from this spirit across
  a run, the more it tilts the roads into their corners — banking climbs toward the ±20° ceiling.
  High bank = you can carry more speed through a curve without the tires letting go, so par-beating
  lines open up. This is the "makes it easier to drive fast" reading.
- **…but bank is double-edged (the trade that keeps it SM-INV-9-legal).** Camber is not free speed.
  Past a point the same tilt that saves a grippy corner **invites rollover** on the truck's high CoG
  (this is exactly the over-bank failure the physics note in `data/ranger.js` warns about), and it
  bites hardest on tight hairpins where the clamp saturates. So a road-bender run isn't "+grip"; it's
  "the roads now reward commitment and punish sloppiness" — a reshaped run, not a raised floor.
- **The adversarial twin — it banks the roads *against* you.** The mirror spirit tilts camber the
  *wrong* way (off-camber / reverse-banked corners), or randomizes it corner-to-corner so you can't
  trust the road to hold you. A "harder to drive quickly" run you opt into for a bigger reward.
- **Camber that progresses over the day (couples to the doze clock).** Rather than a fixed bank, the
  tilt **drifts as the day wears on** — mellow and forgiving in the morning, steepening toward
  evening as you get sleepy. Now the sleep/doze axis (SM-INV-1) and the road's drivability move
  together: the world literally leans harder the longer you push past rest. Ties this spirit to the
  night-owl/camper pair above (reckless-nights ↔ restful-days).
- **Randomized per-run camber as a run seed.** A run where the spirit rolls a camber *character*
  (mild / aggressive / off-camber / progressing) — variety in what the roads feel like, unlocked into
  the deck like any other spirit facet.

Why it's a natural fit right now: camber just became a **real-time, on-demand dial** (the slider
recomputes banking live via `invalidateProfileCaches` / `_networkRev`, and the clamp went ±6°→±20°),
so a story system *can* drive it per-run/over-time without a regen. The mechanism a spirit would need
already exists.

Guardrails when this gets real:
- **SM-INV-9 — re-weight, don't hand out.** More bank must stay *bought with risk* (rollover
  exposure, off-camber elsewhere, or the day-progression tax), never a flat "+cornering" buff. If it
  reads as free speed, it's the balance-sheet erosion the invariant forbids.
- **SM-INV-7/8 — breadth, not floor.** The bent roads are a run *shape*; nothing about the tilt
  persists as power between runs.
- **SM-INV-1 — dozing stays real.** The day-progression flavour leans on the doze clock; it must
  couple to it, never soften or cancel the "eyes shut on a mountain road, physics decides" reality.
- **Honest-emergence (repo feedback `emergent_over_injected`).** Prefer driving the *existing*
  `camberStrength` / `MAX_CAMBER` / sign so the character *emerges* from the physics the player
  already trusts, rather than bolting on a bespoke "story camber" layer beside it.

Owner-only, don't invent: whether the road-bender is benevolent (guide) or has teeth (Roamer motive,
Open Q1), and how the adversarial twin's reward is priced.

Related: DESIGN.md "The Roamer", SM-INV-9 (spirits = rules not resources), SM-INV-7/8 (breadth), 
SM-INV-1 (doze); the night-owl/camper pair above (day-progression ties them together); MILESTONES.md
SM-5 (spirits land here). Naming (*spirit* vs *sprite*) still unsettled per the pair above.

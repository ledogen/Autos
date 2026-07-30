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

> **Update 2026-07-29 — the night-owl is now a named character with a catalog entry.** He is **the
> Night Owl** (renamed from the working handle *The Passenger*), and his full write-up lives in
> `spirits-and-pacts.md` #01 — Pact class, fatigue domain (risk side), single-run-total ledger,
> contact at bedtime then in the doze. **He appears in your passenger seat when he speaks to you.**
> The two sketches are the same spirit arrived at twice; the catalog entry supersedes this bullet on
> detail, and this entry stays for the *pairing* against the camper.

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

**Update 2026-07-29 — spirits are deferred.** Meta-progression is now **the garage** (unlocked
starting vehicles), not spirits/characters — see `design-amendments-2026-07-29.md` §4. The spirit
system is *not deleted*, but it is no longer the roster mechanism, so this pair is further off than
it was. Don't build spirit-unlock plumbing against it. The camper's "different ending" hook is also
partly answered: the **dead horse is *the* ending** (see the 2026-07-29 entry below), so a camper
ending would be an addition rather than a peer.

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

**Update 2026-07-29 — spirits deferred** (`design-amendments-2026-07-29.md` §4): meta-progression is
the garage now, so a road-bender *spirit* has no carrier. The camber-as-a-live-dial observation
survives intact regardless of what eventually drives it.

Related: DESIGN.md "The Roamer", SM-INV-9 (spirits = rules not resources), SM-INV-7/8 (breadth), 
SM-INV-1 (doze); the night-owl/camper pair above (day-progression ties them together); MILESTONES.md
SM-5 (spirits land here). Naming (*spirit* vs *sprite*) still unsettled per the pair above.

---

## The ending is the horse dying — 2026-07-29

**The idea.** The game ends with your truck dying. Not as a loss — as *the* ending. The horse dies,
and that is how a rider stops being a rider and becomes the spirit that guides them.

**It may already be implied.** Two things in DESIGN.md point at it without anyone having said it:

- SM-INV-8's gloss reads literacy-as-what-survives as "the mechanical face of *you are becoming the
  Roamer*." If the player is becoming the Roamer, the transition needs a moment.
- The Roamer **rode on horseback** and is now a spirit **without a horse**. That absence has been
  sitting in the premise since 2026-07-20 with no explanation attached to it.

**Every run already rehearses it.** Breakdown ends the run; literacy and the world persist; the truck
does not (SM-INV-1, SM-INV-8). The finale is that exact event, and needs no new mechanism — only a
*place*. Breaking down at km 40 on a nothing road is attrition. Breaking down at the end of the last
trail, with all of them open behind you, is the arc closing. Same mechanic, different coordinates.

**The design requirement this creates.** The final main mission must *take* the truck — it cannot be
left to stochastic wear, or a player arrives with a healthy engine and nothing happens. Proposal: a
final log drag that **cannot be completed without destroying the vehicle**. That's the one time the
game asks for all of it. And the player **hears it coming**, because listening to the truck — the
rattle that stops being intermittent, the needle that doesn't come back down — is the literacy the
entire wear economy (SM-INV-5, the damage model, "the car is your horse") exists to teach. The last
thing you learn to read is the thing telling you it's over.

**Placement (per this file's convention):** an **authored in-world beat** at the ultimate threshold
moment — SM-INV-11's relaxation already covers it. Not a new fail state: it is the SM-INV-1 breakdown
death, sited deliberately.

**It stays neutral on Open Q1(a), which is worth noticing.** Benevolent Roamer: a release, a
passing-on, you go where they went. With-teeth Roamer: he needed a rider, he used you up, and you are
now the next guide who will need one — a cycle. **Identical final image, opposite meanings.** That's
the second beat in a row (after the trail-clearing main mission) that doesn't force the motives
question, which suggests Q1(a) can be deferred a long way yet.

Guardrails to honor when this gets real:
- **The game must not narrate it.** SM-INV-10's discipline — described, never scored — applies to the
  ending too. No card telling the player what they felt. A temperature needle, a rattle, a sound, and
  then not a sound. The restraint *is* the effect.
- **Staged in-world** (SM-INV-11's surviving constraint), not a cutscene layer. And no failure card —
  the truck just stops.
- **SM-INV-9 / SM-INV-8 — pays in nothing.** The ending is a story key. No resources, no run-layer
  power, nothing carried forward but literacy and world state, same as any other death.
- **SM-INV-7 — run 1 must be able to reach it.** Since road clearance is run-layer and resets
  (ratified 2026-07-29), every run reopens the whole chain anyway, so the ending is reachable from a
  fresh profile by construction. The binding constraint is **region count**: the full trail chain has
  to fit inside one surviving run.

**Owner update 2026-07-29: the Dead Horse is the main ending.** Alternate endings are possible but
not planned, and *"there's a good chance it's the only one — this is a web JS game after all."* If
alternates are ever added, **they probably don't involve the horse dying**; the dead horse stays the
spine's terminus rather than one branch among equals.

**Alternate delivery, same ending (owner, 2026-07-29): the accident.** A crash you are lucky to walk
away from, which kills the car. Note this is not a *different* ending — it's the same ending
delivered violently instead of by attrition, and the two readings sit right on top of Open Q1(a):

- **Attrition** — the horse is ridden until it stops. You spent it. Reads benevolent, or at least
  consensual: a long partnership ending the way long partnerships do.
- **The accident** — the horse dies under you, suddenly, on a road you were pushing. Reads
  *with-teeth*: the guide needed a rider and used one up. The bible's own knife —
  *"ridden to death by a guide who needs you more than they love you."*

Same final image, opposite meanings, and the game could ship both as outcomes of *how the player
drove* rather than as authored branches. That would put the ending's tone on the same axis as
everything else in the design: knowledge and hubris.

Open sub-questions (do not invent — Q1(b) is owner-only):
- **What the final beat actually *is*** past the truck stopping. Q1(b) residual; escalate.
- **Does the player get out?** A rider walking away from a fallen horse is the oldest version of this
  image and might be the last input in the game — or one beat too many. Worth sitting with.
- **Interaction with the camper spirit's "different ending" hook** (first entry in this file).
  Partially answered 2026-07-29 — the dead horse is *the* ending, so a camper ending would be an
  addition rather than a peer. Note also that spirits as a meta-progression mechanism are **deferred**
  (metaprogression is now the garage — see `design-amendments-2026-07-29.md` §4), so this hook is
  further off than it was.
- **Does the final drag have to be unsurvivable by design?** If the last main mission is meant to
  take the truck, stochastic wear can't be trusted to do it — a player may arrive with a healthy
  engine. Either the final drag is authored to be unwinnable-intact, or the accident variant supplies
  the ending instead. Unresolved.

Related: DESIGN.md Open Q1(b) (concrete final beat — owner-only) and Q1(a) (motives); "The Roamer —
the story spine" (car-is-your-horse keystone, the with-teeth "ridden to death" note); SM-INV-1
(breakdown death), SM-INV-5 (wear = time + intensity), SM-INV-7, SM-INV-8, SM-INV-9, SM-INV-10,
SM-INV-11 (authored in-world beats); `missions.md` (main missions / the log drag, beat-vs-labor
split); MILESTONES SM-5.

---

## Item: cargo straps — 2026-07-29

A consumable that makes your **next fragile cargo** more resilient. Buy or find them, strap the load,
take a job you'd otherwise have to turn down.

Why it's a good shape (item structure itself deferred — don't build an item system off this entry):

- **Honest mechanism, not a stat** (SM-INV-10). Straps don't grant "+20% fragility resistance" — a
  secured load *sees less shock than the truck does*. It's a coupling change between chassis and
  cargo, and the fragile mission type (`missions.md` §3b) already reads shock as its signal.
- **Consumed, so it's a per-job decision**, not a permanent upgrade. Same posture as coffee, minus
  the debt.
- **It should enable a harder job, not make an easy one safe.** The framing to hold: straps let you
  accept freight-grade fragile work you couldn't otherwise carry — they don't turn a normal fragile
  run into a cruise. If they ever remove the need to read the road surface, the restraint axis is
  gone and the type collapses back onto margin.
- Like the other consumables (spare tire, filter, quick-jack), stowed straps are **real mass**. Trivial
  here, but it keeps the pattern consistent.

Open: whether they're single-use per job, degrade over several, or are a tool you keep and re-use.

Related: `missions.md` §3b (fragile delivery — shock/impulse signal, FEAT-38 surface
interaction); DESIGN.md "The car: jalopy + parts" (consumables/tools as real load); SM-INV-10.

---

## The barn find: a car you can only get by going somewhere pointless — 2026-07-29

**The idea** [owner]. A vehicle that unlocks into the **garage** not by achievement but by *discovery*:
a **rare random spawn in the world, never shown on the map**. No quest, no marker, no stat threshold.
You find it because you drove somewhere you had no reason to go.

**Why it's a good shape.**

- **It's the only unlock that rewards curiosity rather than accumulation.** Career stats
  (`spirits-and-pacts.md` → "Career stats") unlock garage entries by *doing more of what you already
  do*. This one pays for leaving the road you were on. Those are different virtues and the roster is
  better with both.
- **It fits the existing spirit rule for free.** Spirits are present in every world from run 1,
  invisible until met (the visibility model). A barn find is the same rule applied to an object: it
  was always there, on that seed, in that spot — you just hadn't been.
- **Legal by construction.** Worldgen stays `(worldSeed, coords)` — the car's *position* is
  deterministic and meta-free (SM-INV-12); only "have you found it" persists, as a garage entry
  (SM-INV-8). Nothing about the world changes when you find it.
- **The absence of a map marker is the whole feature.** FEAT-16's 2D map and FEAT-39's GPS exist to
  make the world legible; this is the one thing that deliberately isn't. `missions.md` is already
  circling the same instinct with the hidden job board ("you learn what a POI is offering by driving
  there") — the barn find is that idea at its purest.

**Guardrails when this gets real:**

- **Lateral, never upward** (SM-INV-9 / the garage rule). The reward for finding it is a *different*
  truck — a van with cargo room and bad cooling, something light with no bed — never a better one.
  A hidden car that is also the strongest car is a power floor wearing a mystery costume.
- **It must be findable without being told.** If the community answer is "look up the coordinates,"
  it's a checklist item. Prefer siting that rewards a *habit* (following dirt spurs to their end,
  checking structures) over a single memorizable spot — so the skill transfers to new seeds.
- **Don't gate it behind rarity so hard it never happens.** A thing 2% of players ever see is a thing
  that didn't get built. Tune toward "most players who explore find one eventually."

Open: is it **one** car or a class of them? Does the found vehicle enter the garage for future runs
only, or can you drive it *now* — noting SM-INV-15 forbids in-run vehicle purchase, but finding is
not buying, and "abandon your rig for the barn find mid-run" is a genuinely interesting and
genuinely dangerous idea that cuts against *the game is about maintaining one rig*. **Owner's call.**

Related: `spirits-and-pacts.md` "Career stats" (the other garage-unlock source); DESIGN.md
"The garage" (lateral-not-upward), SM-INV-8/9/12/15; `missions.md` "The job board" (hidden-until-
visited, the same instinct); FEAT-04a (visual vehicle swap — the substrate).

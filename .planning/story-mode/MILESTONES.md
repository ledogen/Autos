# Story Mode — Milestones

Companion to [DESIGN.md](DESIGN.md) (intent + invariants — read it first). This file maps the
design onto buildable milestones so tickets can be minted and burned down. Each milestone is a
**playable slice** — the game is better at the end of each one even if story mode never finishes.

Tickets get minted into `.planning/todos/pending/` at milestone entry, not all up front — the
design has open questions (DESIGN.md §Open questions) and minting everything now would freeze
answers we haven't earned. The exception is FEAT-29 (par oracle): pure math, zero coupling,
gate-able headlessly — minted now as the first burn-down item.

---

## SM-0 — Enablers (already ticketed, proceed independently)

These existing tickets are story-mode substrate. They need no story context to build, and story
milestones consume them. When working one, know what it feeds:

| Ticket | Story-mode role |
|---|---|
| **FEAT-28** region-gated connectivity | THE progression primitive. Connectivity gate == region unlock == trail-closed barrier (SM-INV-13). SM-4 wires XP/story beats to its unlock trigger. |
| **FEAT-09** contact pipeline / debris | Physics substrate for hazards and (later) camp-prop interaction. |
| **FEAT-26/27** rockslides (ambush/static) | Risk content — the procedural dressing that makes "drive at the limit" a bet. FEAT-26's flag-gated-nondeterminism pattern is the template for SM-INV-12. Its "what does a hit do" question resolves in SM-3's wear model. |
| **FEAT-23** drivetrain architecture P2–P5 | Parts-as-cars substrate (SM-INV-10). The parts-selector phase becomes the jalopy generator's roll-space in SM-3. |
| **FEAT-04a** visual vehicle swap | Jalopy variety reads visually. |
| **FEAT-21** POI scatter | Mission anchors + campsite candidates. When scoping FEAT-21, prefer POI siting rules that also describe campable ground (flat, water-adjacent, meadow) — SM-1 will reuse them. |

## SM-1 — The Day (sleep is the clock)

**Goal:** the work → read your eyelids → break off → hunt a site → arrive loop is *felt*, with
no economy attached. The last leg of the day is the game (SM-INV-6).

- **Game-mode shell** (ratified 2026-07-16): main menu selecting Free Roam / Story Mode
  (/ one-off scenarios later). Story mode boots region-limited with **debug tooling locked
  out** and sliders fixed. Extend the existing `window.__setGameMode` seam (teleport feature
  is already mode-gated through it) — do not invent a second mode mechanism. Free Roam
  remains exactly the game built to date.
- Run clock: in-game day of 24–48 real min mapped onto sky time-of-day (src/sky.js exists);
  day counter.
- Sleepiness state: accrues over the waking day; coffee = loan (alert now, sleepier tomorrow).
- **Doze**: eyes-close overlay + control attenuation, periods lengthen with sleepiness. Not a
  fail state (SM-INV-1). Flag-gated for headless gates (SM-INV-12).
- **Campsite = place**: seeded, window-invariant campable-site detection from worldgen (flat
  ground, lake/stream adjacency, meadows — water + flat-ground data all exist). Camp action
  only at a site → sleep → next day. Site quality stub (good/bad night) OK; full quality
  dimensions are open question 6. If **FEAT-38 dispersed-camping spurs** exist by now, their
  scored clearings are ready-made campsite candidates — share one "good ground" score.
- Exit criteria: a player naturally plans their day around getting somewhere sleepable; dozing
  on a mountain road is terrifying; no HUD countdown anywhere (SM-INV-3).

## SM-2 — The Wager (par, missions, payout)

**Goal:** money exists and the arithmetic says: lazy day nets negative, brave day nets positive.

- **FEAT-29 par oracle** (minted): fixed-reference friction-circle point mass over route arc
  primitives → reference time for any A→B. Never reads vehicle params (SM-INV-2).
- Mission board at POIs (FEAT-21): hand-authored types × procedural dressing. First type:
  delivery. Payout = margin against par (SM-INV-4); par surfaces ONLY as payout, never as a
  clock (SM-INV-3).
- Currency + running costs (consumables priced so the lazy-day-negative line holds; real wear
  costs arrive in SM-3).
- At least one non-par mission type early (eggs unbroken / don't spook the horses) so
  par-scoring doesn't eat the tone (DESIGN.md §Failure modes).
- Hard-timer mission types are allowed (SM-INV-3 as amended: visible diegetic timer, reward
  decays/zeroes on expiry) — but the default mission has no clock, and par is never one.
- Camping mid-mission kills the job — fiction supplies the penalty.

## SM-3 — The Machine (wear, breakdown, the jalopy)

**Goal:** the second death condition exists, and every run starts in a different bad truck.

- **Wear/condition model**: ONE framework, `f(time, intensity)` never distance (SM-INV-5), but
  **multiple per-component condition tracks** (owner brain-dump 2026-07-19 — see DESIGN.md
  "Damage, wear & repair" for the full model). Each reads an honest physics signal the sim
  already produces; cheap, out of the hot loop; shared with FEAT-26 rock hits. Breakdown = death.
  The tracks:
  - **Tires ×4 independent** — gradual wear scales per-wheel μ (rides FEAT-38's per-contact-patch
    friction plumbing); binary punctures on a wear→fragility curve (<15% pops on smooth road,
    <50% a moderate bump might); roadside self-change needs a spare in inventory, quick-jack/
    breaker-bar item speeds it; carried tires + tool have real mass → CoG/handling.
  - **Engine** — `f(rpm, load, time)`; **air-filter** sub-track does ~nothing until ~20% then
    sharply accelerates engine wear (dusty/dirt roads degrade it faster — FEAT-38 tie); overheat
    → power loss + wear → blown head gasket.
  - **Suspension** — degrades shock damping; severity-triggered off bump-stop over-travel or
    suspension-velocity (no-harm floor — ratified anchor).
  - **Brakes** front-pair + rear-pair — `∫(brake torque·time)`; pad grades (standard/sport/race)
    per axle set brake bias (SM-INV-10 described-not-scored).
  - **Radiator** (swappable mod) — early-game cooling deliberately marginal; front collisions
    damage/puncture it (FEAT-09 contact magnitude).
  - Tire wear deliberately accelerated vs realism as an economic driver (ratified anchor).
- **Repair, tow & death**: roadside self-service (tires) vs. town service station (heavy repairs),
  both cost time + money. **Tow** = fast-travel to nearest town, priced near-prohibitively (usually
  run-ending) — forces the in-the-moment tow-vs-limp decision; can't-afford-tow auto-ends the run.
  Two deaths only (SM-INV-1): fatal crash impact (G/Δv threshold) or unrecoverable breakdown.
- **Diagnostic screen** (FEAT-34 instrument cluster is its home): surfaces every condition track,
  air-filter warning the critical one.
- **Jalopy generator**: seeded roll over FEAT-23's parts/architecture space + starting wear.
  Every roll technically run-winning (SM-INV-7).
- Parts as found/bought items, **described never scored** (SM-INV-10).
- Crash death threshold defined against the same condition model (what magnitude of impact
  ends a run vs. wears the truck).

## SM-4 — The Run (death, persistence, regions)

**Goal:** the roguelike shell — runs end, the world doesn't reset.

- Run lifecycle: death → run summary → new run in a fresh jalopy.
- XP earned from payout margin; XP/story beats trigger **FEAT-28 region unlocks** (the brief
  validation load is the level-up moment — diegetic barrier lifts). Story frame (DESIGN.md
  "The Roamer"): the barriers are the **Roamer's old trails**, and expansion is **gated by authored
  "main missions"** that drive the player to a place — so the level-up moment has a diegetic cause,
  not just an XP threshold. Authoring the main missions themselves lands in SM-5 (they carry the
  through-line); SM-4 wires the unlock trigger.
- **metaState**: versioned persistent profile (localStorage — single-origin constraint), the
  explicit generator input of SM-INV-12. Gates pin a default metaState.
- What persists: unlocks + world parameter states + region progress. What doesn't: car, parts,
  money (SM-INV-8).

## SM-5 — The World Turns (story delivery, spirits, horror)

**Goal:** the game is *about* something. The through-line is now defined — **The Roamer** (DESIGN.md
"The Roamer — the story spine"): a spirit of your own past self, who once roamed these lands on
horseback, guiding you. This milestone builds the channels that deliver it. Q1 is mostly resolved
(spine set); still needs its residual (Roamer's motives + concrete endgame beat) plus Q4/Q6 answered
before the whole milestone can close.

- **The Roamer as the thing being delivered.** Everything below is a *channel*; the content is the
  gradual reveal that you are being guided by (and are becoming) the Roamer. "Car is your horse" is
  the keystone — SM-3's wear/breakdown work is what gives this milestone its emotional stakes
  (breakdown = the horse dying under you), so lean on it here.
- Story parameter states: staged generator params (leaning trees, moon, dark-at-noon, absence)
  keyed off metaState (SM-INV-11) — the **ambient** channel, still emergent.
- Doze as delivery vehicle: the ~400 ms eyes-closed frames show *something*; pushing sleep is
  how you learn the story. This is where **the Roamer visits** (*something comes to you when you
  doze off*).
- **Authored in-world beats** (new channel — SM-INV-11 relaxed 2026-07-20): cutscenes,
  dialogue-over-gameplay, and structured story moments, **staged in real world-space** (carve out
  empty ground for a camera/subject scene), not a bolted-on cutscene layer. The **main missions**
  that gate region unlocks (SM-4) are the primary carriers. Canonical setup: the dark-at-8am morning
  → drive out → the world delivers the encounter.
- **Spirits**: permanent, player-earned, unremovable, rule-changing-not-resource-granting
  (SM-INV-9). First spirit: the camping spirit (rare campsite discovery). The **Roamer is the
  meta-spirit** the individual spirits read as facets of (DESIGN.md); the night-owl/camper pair
  (IDEAS.md) live under it.
- **Classes** (new — RATIFIED 2026-07-20, DESIGN.md "Classes"): RPG-style roles unlocked by
  *meeting spirits* and other one-time achievements (camp 10×, drive 5 km sleepy, …), main story
  beats, and region completions. Breadth, not floor (SM-INV-9/7). *Structure open (Open Q10)* —
  how a class stays strictly breadth is unresolved; scope carefully here.
- **The Roamer's economy of gifts:** the Roamer hands out **meta-progression unlocks and story keys
  only — never resources or run-layer power** (SM-INV-8/9). Build the "where to look" hint surface as
  literacy transfer, not a loot faucet.
- Camp quality full dimensions; fishing; bad-night spiral tuning.
- Endgame definition — whatever "beating the game" turns out to mean (residual of Q1: completing the
  Roamer's arc — reopening the trails, some reunion or release — is the direction; the concrete final
  beat and the Roamer's motives are owner-only, escalate).

---

## Sequencing notes

- SM-1 before SM-2 because sleep pressure is testable and *fun-provable* without an economy,
  and camping-as-place decides POI/campsite siting that SM-2 missions also use.
- FEAT-29 is order-independent — pure math, can be built today, and de-risks the single most
  load-bearing [DEFAULT] in the design (physics-honest par).
- SM-0 tickets need no story-mode go-ahead; they're valuable standalone.
- Each milestone entry: plan mode, mint tickets referencing DESIGN.md invariants by `SM-INV-N`,
  and re-check the open-questions list — some answers gate scope.
- **One-off scenarios** (Dodge the Rocks, Escape the Police, …) are a separate content track,
  not story milestones — they hang off the same game-mode shell (SM-1) and reuse whatever
  systems exist when each is authored. Ticket them individually as ideas firm up.

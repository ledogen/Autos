---
id: FEAT-37
type: feature
status: open
opened: 2026-07-17
severity: minor
source: user-request
relates_to: water (FEAT-22/17/18 ponds+streams), story mode (camping SM-INV-6, SM-INV-9 buff-erosion, SM-INV-5 wear, SM-INV-12)
note: "A simple fishing minigame — cast at water, play a catch, and the reward is a TEMPORARY
single-day perk (e.g. 'less damage tomorrow', 'start tomorrow with more energy'), paid for with
tonight's time/alertness. NOT currency or a grind. Nearly free on the physics budget (UI + timing +
state). Fits the camp (SM-INV-6). TENSION: a challenge-softening buff is exactly what SM-INV-9 says
erodes quietly — must be modest, paid-for, and non-compounding; escalate to DESIGN.md. Keep it SIMPLE."
---

# FEAT-37: Fishing minigame

## Context

The world already has water the player can reach — ponds (route-around basins) and streams (FEAT-22/
17/18). Fishing turns those from scenery into a place to *stop*, which dovetails with the story-mode
day: camping is a place (SM-INV-6), and the last leg of the day is the game. A quiet, low-stakes
activity between drives — and a modest food/item/currency source — without touching the physics budget
(it's UI, timing, and state, all event-driven, off the hot loop).

## Desired behaviour (keep it simple)

- Near fishable water (pond, or a stream deep/wide enough), a prompt to **fish**.
- **Cast** → a short wait → a **bite** → a small **catch interaction** (a timing/tension beat — hold /
  tap / a reel meter; pick ONE simple mechanic, not a tackle sim).
- Outcome: caught something / it got away, surfaced through the chat pane or a small result card.
- A catch is a **camp meal** that confers a **temporary, single-day perk** — the reward is the perk,
  NOT sellable loot. The fish → tonight's dinner → a small edge tomorrow (e.g. *less damage tomorrow*,
  *start tomorrow with more energy/alertness*). Diegetic and on-tone with the camp rhythm.

## Design intent

- **Simplicity is the spec.** One readable mechanic. This is flavor and a gentle economy tap, not a
  headline feature — resist growing it into a fishing sim.
- **Diegetic, low-friction** — matches the game's no-menus ethos (camping-is-a-place, no HUD countdown).
  A card/prompt, a beat, a result. The transgression-of-stopping mirrors the doze/camp rhythm.
- **The reward is a bet, not a grind.** Fishing is *not* an income source; it's a camp choice — spend
  tonight's daylight/alertness fishing to buy a small edge tomorrow. That tradeoff (time now vs.
  resilience later) is the on-tone shape, and it keeps fishing from fighting the par/payout pressure
  the way a sell-for-currency grind would.
- **SM-INV-9 tension — flagged, not resolved.** A temporary "less damage / more energy tomorrow" buff
  is challenge-softening, and SM-INV-9 names this exact thing as the invariant most likely to erode
  "one reasonable-seeming buff at a time." The perk is *within-run and temporary* (not a permanent
  spirit/unlock, so SM-INV-9 doesn't forbid it) — but to stay honest it must be: **modest** (a nudge,
  not a get-out-of-jail), **paid for** (real time/alertness cost, so it's a genuine tradeoff),
  **single-day** (expires next camp; never a compounding stack), and **never a power curve** that
  softens the run (SM-INV-7: every run still fully beatable, no comfort ramp). Whether temporary camp
  perks belong at all is an *intent* question → **escalate to DESIGN.md** for ratification before
  building the perk system; the minigame shell can precede that decision.

## Open design questions (decide at planning)

- **The catch mechanic:** timing bar? hold-and-release tension? pure chance with a flavor beat? Pick the
  simplest that feels good.
- **Where you can fish:** ponds only, or streams too (needs a "fishable water" test — reuse the water
  membership samplers `pondSkirtAt` / `streamChannelAt`)? Depth/size gate?
- **The perk menu + magnitudes:** which perks (less-damage-tomorrow, more-starting-energy, others?),
  how big, and how they read to the player (described, never a number — SM-INV-10). Do different
  catches give different perks, or one catch = one generic "good dinner" buff? Escalate the perk
  *semantics* to DESIGN.md (SM-INV-9), don't invent them here.
- **Does the perk stack / how does it expire?** Must be single-day and non-compounding (above). A
  bigger catch = a stronger *one-day* perk is fine; two perks banked is not.
- **Time cost (the price of the bet):** fishing must burn daylight/alertness — that's what makes the
  perk a real tradeoff against the day clock rather than free upside. Non-negotiable for on-tone.
- **Gating to modes:** story mode for real; a free-roam toy version, or story-only?
- **Determinism (SM-INV-12):** catches are run-layer randomness (fine); no worldgen coupling. Fishable-
  water *locations* are deterministic from the water gen.

## Acceptance

- At fishable water, the player can cast and play one simple catch interaction to a win/lose result,
  surfaced diegetically (card / chat pane).
- A successful catch confers a **temporary, single-day perk** (e.g. less-damage / more-energy
  tomorrow), paid for with tonight's time/alertness — modest, non-compounding, expiring next camp; NOT
  sellable currency, NOT a compounding power curve. Perk semantics ratified in DESIGN.md before build.
- Zero measurable physics-budget cost (event-driven UI/state; `npm test` unaffected); `SM-INV-12`
  respected (run-layer randomness only).
- The mechanic is ONE simple thing; tunables (bite delay, difficulty, yield table) exposed where
  appropriate.

## Related

- Fishable water: FEAT-22/17/18 ([[project_water_generation_landed]]); membership samplers
  `pondSkirtAt` / `streamChannelAt`.
- Camping / day rhythm this lives inside: [[project_story_mode_framing.md]] (SM-INV-6), DESIGN.md.
- Result presentation: the chat-pane dialog channel (DESIGN.md "Characters and dialog").
- Perk semantics + the SM-INV-9 buff-erosion tension (escalate there): `.planning/story-mode/DESIGN.md`
  (SM-INV-9 spirits/buffs change rules not balance sheets; SM-INV-7 no comfort curve; SM-INV-5 wear).
  The perk delivers into whatever damage/energy model FEAT-33/FEAT-26/milestone-3 defines.

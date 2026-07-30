---
id: FEAT-37
type: feature
status: open
opened: 2026-07-17
severity: minor
source: user-request
reconciled: 2026-07-29 — against spirits-and-pacts.md #04 (The Confluence), items.md §5, SM-INV-6 reversal
relates_to: >
  water (FEAT-22/17/18 ponds+streams), story mode (SM-INV-6 camping-is-a-BUTTON, SM-INV-9
  buff-erosion, SM-INV-5 wear, SM-INV-12), spirits-and-pacts.md #04 The Confluence (the water
  spirit this feeds — DEFERRED), items.md §5 (the catch category + the unresolved species axis)
depends_on: >
  FEAT-47 (day clock — "tomorrow" and "tonight's alertness" have no referent without it);
  SM-3 wear model (only if a less-damage perk survives, see reconciliation)
note: "A simple fishing minigame — cast at water, play a catch, reward is a TEMPORARY single-day
effect paid for with tonight's time/alertness. NOT currency or a grind. Nearly free on the physics
budget (UI + timing + state). RECONCILED 2026-07-29: the reward model narrowed to RESTORATION
('coffee is debt, fish is income'), 'less damage tomorrow' is now suspect, and SM-INV-6's
camping-is-a-place phrasing here is superseded. The minigame SHELL is still buildable ahead of the
deferred spirit — see the reconciliation section. Keep it SIMPLE."
---

## ⚠ Reconciliation 2026-07-29 — read before planning

Written 2026-07-17. Three things landed since, and they narrow this ticket rather than blocking it.

**1. The reward model narrowed to *restoration*.** `spirits-and-pacts.md` #04 and `items.md` §5 settle
what fish pays in, and it's one thing:

> **Coffee is debt. Fish is income.**

Coffee trades alertness across days *at interest*. A fish eaten at camp is alertness that **does not
have to be repaid** — the only honest restoration in the game. That is a sharper and more defensible
version of this ticket's own "start tomorrow with more energy" option, and it **resolves the SM-INV-9
tension flagged below**: restoration isn't challenge-softening, it's the counterweight to coffee's
debt spiral, and it's still paid for in tonight's daylight.

**Consequence: "less damage tomorrow" is now the suspect option, not a peer.** A wear-softening perk
*is* the balance-sheet erosion SM-INV-9 names, it has no thematic anchor in the water, and it drags in
a dependency on the SM-3 wear model. **Recommendation: drop it.** Fish restores; it does not protect.
(Owner's call — but the ticket is simpler and safer without it.)

**2. The ledger is *distinct waters*, and greed is punishable.** From #04: count **distinct waters
visited**, not fish landed or hours fished. Fishing one productive hole repeatedly should **deplete it
and read as greed**. That's a real behavioural rule this ticket doesn't have, and it's cheap: it
rewards map literacy instead of grinding, which is what the rest of the design rewards.

**3. `SM-INV-6` phrasing below is superseded.** "Camping is a place (SM-INV-6)" — **reversed
2026-07-19**: camping is a **button**, gated by campable regions, with a worldgen-scored quality
preview. The *argument* survives (fishing still lives in the camp rhythm, and getting to good ground
is still a navigation problem); only the phrasing is wrong. Same for "camping-is-a-place" in the
Design-intent section.

### What this means for scope

- **The minigame shell is still buildable now** — cast, bite, one catch interaction, a result card.
  That was already this ticket's position and it survives.
- **The perk system is NOT.** It needs FEAT-47 (there is no "tomorrow" and no alertness to restore
  until the day clock exists) and it wants the restoration framing above rather than the perk menu
  sketched below.
- **The Confluence is DEFERRED** with the whole spirit system (`design-amendments-2026-07-29.md` §4),
  so **do not build a disposition track or a favor-gated perk tree.** #04's best idea — *the fishing
  perk tree **is** the spirit's disposition track, one system not two* — is worth preserving as intent
  precisely so nobody builds a separate XP-bought perk tree that has to be torn out later. Build
  neither for now.
- **Species are unspecified and that's upstream of any fish asset.** `items.md` §5 lays out four
  candidate axes and flags **water type** (stream vs. pond vs. altitude/temperature) as the strongest
  fit — the world already generates those distinctly, and it's the axis that rewards the "distinct
  waters" ledger. **Pick the axis before anyone draws a fish.**

---

# FEAT-37: Fishing minigame

## Context

The world already has water the player can reach — ponds (route-around basins) and streams (FEAT-22/
17/18). Fishing turns those from scenery into a place to *stop*, which dovetails with the story-mode
day: camping is gated by *where you are* (SM-INV-6 as reversed 2026-07-19 — a button, available only
on campable ground), and the last leg of the day is the game. A quiet, low-stakes
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
- **Diegetic, low-friction** — matches the game's no-menus ethos (single-action commit, no HUD
  countdown).
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

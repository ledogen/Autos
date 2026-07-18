---
id: FEAT-37
type: feature
status: open
opened: 2026-07-17
severity: minor
source: user-request
relates_to: water (FEAT-22/17/18 ponds+streams), story mode (camping SM-INV-6, economy, items), SM-INV-12
note: "A simple fishing minigame — cast at water and play a catch. Nearly free on the physics budget:
it's UI + timing + state, JS's home turf, ~zero hot-loop cost. Natural fit at camp (SM-INV-6, camping
is a place) and as a low-key economy/food/item source between the driving. Keep it SIMPLE."
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
- Catches are **items** (food, junk, the occasional oddity) feeding the story item/economy layer.

## Design intent

- **Simplicity is the spec.** One readable mechanic. This is flavor and a gentle economy tap, not a
  headline feature — resist growing it into a fishing sim.
- **Diegetic, low-friction** — matches the game's no-menus ethos (camping-is-a-place, no HUD countdown).
  A card/prompt, a beat, a result. The transgression-of-stopping mirrors the doze/camp rhythm.
- **On-tone economy:** fishing should be a *slow, safe* trickle — consistent with "the safe strategy is
  a slow bleed" (SM-INV-4/5). It feeds you a little; it doesn't fund a run. Don't let it become a
  grind that beats driving missions (that would fight the whole par/payout pressure).

## Open design questions (decide at planning)

- **The catch mechanic:** timing bar? hold-and-release tension? pure chance with a flavor beat? Pick the
  simplest that feels good.
- **Where you can fish:** ponds only, or streams too (needs a "fishable water" test — reuse the water
  membership samplers `pondSkirtAt` / `streamChannelAt`)? Depth/size gate?
- **What it yields + how it plugs into items/economy:** food (restores… what? — ties to the wear/
  sleep/economy model, TBD), junk to sell, rare finds (a spirit hook?). Escalate the item semantics to
  the story layer rather than inventing them here.
- **Time cost:** fishing burns daylight/alertness (the real cost, on-tone) vs. free. Likely it should
  cost time — that's what keeps it honest against the day clock.
- **Gating to modes:** story mode for real; a free-roam toy version, or story-only?
- **Determinism (SM-INV-12):** catches are run-layer randomness (fine); no worldgen coupling. Fishable-
  water *locations* are deterministic from the water gen.

## Acceptance

- At fishable water, the player can cast and play one simple catch interaction to a win/lose result,
  surfaced diegetically (card / chat pane).
- Catches produce items into the story item layer; the yield rate is a slow, safe trickle, not a grind
  that out-earns driving.
- Zero measurable physics-budget cost (event-driven UI/state; `npm test` unaffected); `SM-INV-12`
  respected (run-layer randomness only).
- The mechanic is ONE simple thing; tunables (bite delay, difficulty, yield table) exposed where
  appropriate.

## Related

- Fishable water: FEAT-22/17/18 ([[project_water_generation_landed]]); membership samplers
  `pondSkirtAt` / `streamChannelAt`.
- Camping / day rhythm this lives inside: [[project_story_mode_framing.md]] (SM-INV-6), DESIGN.md.
- Result presentation: the chat-pane dialog channel (DESIGN.md "Characters and dialog").
- Items / economy semantics (escalate there): story economy (SM-INV-4/5), FEAT-story-par-oracle.

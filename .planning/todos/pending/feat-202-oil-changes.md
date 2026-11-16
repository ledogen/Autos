---
id: FEAT-202
type: feature
status: open
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "we should add oil changes. keep it simple and its basically the same \"component\" as the air filter. oil \"wear\" should be based off of load and rpm of engine. its impact on the engine durability scaling should be more linear than the air filter and be as significant if not more. it should be drawn on the vehicle diagnostics as its own component. draw the engine component from a \"front on\" perspective (do a v-style engine to make it more clear) and the oil can be represented by the oil pan. so two new glyphs in vehicle diagnostics. oil pan aligned with engine so it reads. you can only do the oil change at an auto shop but its always available."
relates: src/damage.js (the air filter track), src/damage-screen.js, src/service-screen.js, data/parts.js, MILESTONES.md § The component tracks
---
lane: B

# FEAT-202: Oil changes — an oil track that wears with load and rpm and scales engine wear

## Next steps
Built on `feature/machine`, landing pending. Owner: tune the remaining `[DEFAULT]` numbers (knee, multiplier, price). The look is accepted; oil life starts 60 to 80 % (DEC-249).

## Summary
A new condition track, engine oil, built the way the air filter is. It wears with engine load and rpm, and old oil makes the engine wear faster. The only fix is an oil change at an auto shop, which every auto shop always offers.

## Description
### What the owner asked for
- **Same component as the air filter.** Reuse the air filter's track, its service row and its durability hook. Do not build a second mechanism.
- **Wear input:** engine load and rpm (the air filter's input is whatever `src/damage.js` uses today; oil's is load × rpm).
- **Effect:** scales engine durability (how fast the engine track wears). The curve is *more linear* than the air filter's, and its size is *as large or larger*.
- **Service:** auto shop only, always available (never a rotating-shelf item, never a field repair).
- **Diagnostics screen, two new glyphs:** the engine drawn front-on as a V engine, and the oil pan under it, aligned so the pair reads as one assembly. Oil is its own component in the list.

### Lane defaults to set and flag `[DEFAULT]`
The wear rate (hours of hard driving for a full oil life), the engine-wear multiplier at 0 % oil, and the price of a change. Read the air filter's numbers first and put oil's beside them in the ticket.

### The numbers, beside the air filter's

| | Air filter | Engine oil (FEAT-202) |
|---|---|---|
| Wear input | rpm² × throttle (the engine's insult) | the same insult |
| Life | 900 load-s = 30 min hard driving | `durOil` **1800** load-s = **60 min** hard driving `[DEFAULT]` |
| Effect starts | below 20 % | below `oilKnee` **50 %** `[DEFAULT]` |
| Curve below the knee | squared (back-loaded cliff) | **straight line** |
| Engine wear at 0 % | × 20 | × `oilEngineMult` **20** `[DEFAULT]` |
| Extra wear over the range, ∫(mult − 1) dc | 1.27 | 4.75 (≈ 3.7 × the filter's) |
| Fix | part, $7 + fitting (any shelf, roadside) | oil change **$8 × day tier, 30 min** `[DEFAULT]`, auto shop only, always |
| Jalopy start | 40–80 % | 40–80 % `[DEFAULT]` |

Old oil and a clogged filter multiply: both neglected is both costs at once (× 400 at both empty).
`oilKnee = 1` makes it the pure straight line from new (every percent of oil costs from the first one).

## Tracker
- [x] Oil track in `src/damage.js`, wearing with load × rpm; saved and restored like the other tracks (an old save without it loads with new oil)
- [x] Old oil scales engine wear, more linearly than the air filter and at least as strongly; numbers in this ticket
- [x] Oil change on the auto shop service screen, always offered, priced
- [x] Diagnostics: front-on V-engine glyph and an aligned oil-pan glyph; oil listed as its own component
- [x] A gate pins the wear law and the engine-wear scaling (`test/damage-filter-puncture.mjs` §2c; the shop job in `test/service.mjs` §11)
- [ ] Owner tunes the `[DEFAULT]` numbers

## Decisions
- 2026-11-13, owner: auto shop only, always available; same component shape as the air filter; two new glyphs (front-on V engine, oil pan aligned under it).
- 2026-11-15, owner (card feat202-look): "jalopy starts with 60-80% oil otherwise good"; the look is accepted (DEC-249).

## Open questions
- The four `[DEFAULT]` numbers in the table (oil life 60 min hard, knee 50 %, × 20 at empty, $8 / 30 min), and the jalopy's 40–80 % starting oil.

## Files
`src/damage.js` (track, DAMAGE_PARAMS durOil/oilKnee/oilEngineMult, oilEngineMultiplier) · `src/damage-screen.js` (glyphs, hover text) · `src/service.js` (oilQuote/changeOil) · `src/service-screen.js` (the row) · `data/parts.js` (OIL_CHANGE) · `src/parts.js` (restore: a missing track is new) · `src/jalopy.js` · `src/damage-hud.js` · `src/debug.js` (wear-speed slider)

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.
- 2026-11-13, Lane B: built. The engine glyph is now a front-on 60° V (the Ranger's 4.0 V6), the filter's neck running into the valley; the oil pan sits under the crankcase at its width. My Vehicle → Engine & drivetrain → Engine Oil → "Change the oil". Screenshots: `wip/feat-202/damage-screen*.png` and `engine-crop.png` in the CarGame-machine worktree.
- 2026-11-14: owner's numbers (DEC-136), by the orchestrator on main: lifetimes swapped (oil 30 min, filter 60 min of hard driving); the two engine-wear penalties ADD instead of multiplying; empty oil adds twice what a blocked filter adds (x15.15 and x8.07 alone, x22.2 together), so a 50% engine with both at 0 lasts 15 min of hard driving. The oil's 50% knee and the filter's 20% squared knee are unchanged. Gate damage-filter-puncture updated and green; smoke 26/26.

## Owner, 2026-11-14
Owner opened card feat202-look after the DEC-136 numbers and submitted it with no choice and no note. Read as no change asked; the orchestrator asked the owner to confirm.
- 2026-11-15 (lane u, land/shopui-1115): JALOPY_COND.oil 0.4-0.8 -> 0.6-0.8 (land/shopui-1115).
- 2026-11-16 land/ui-batch: pack flavour per the owner's card note: Duffel "Takes it all, but…", Rucksack drops ", a fair way in". Frame pack NOT changed: the owner's new line ("a serious solution for campers who want to trek") is cut off mid-sentence; waiting for the full line.

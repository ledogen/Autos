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
Lane B builds it when free. No owner call is needed to start; the wear rate and the price are lane defaults for the owner to tune afterwards.

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

## Tracker
- [ ] Oil track in `src/damage.js`, wearing with load × rpm; saved and restored like the other tracks
- [ ] Old oil scales engine wear, more linearly than the air filter and at least as strongly; numbers in this ticket
- [ ] Oil change on the auto shop service screen, always offered, priced
- [ ] Diagnostics: front-on V-engine glyph and an aligned oil-pan glyph; oil listed as its own component
- [ ] A gate pins the wear law and the engine-wear scaling

## Decisions
- 2026-11-13, owner: auto shop only, always available; same component shape as the air filter; two new glyphs (front-on V engine, oil pan aligned under it).

## Open questions
- The price of an oil change, and the oil life in driving hours (the lane proposes both).

## Files
`src/damage.js` · `src/damage-screen.js` · `src/service-screen.js` · `data/parts.js` · `data/shop-stock.js`

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.

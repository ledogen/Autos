---
id: FEAT-203
type: feature
status: open — built and on main (3b719688); waiting on the owner: owed card feat203-try (thumbnail art)
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "whatever happened to the tire iron and floor jack items? changing your tire for the spare should be like 2hrs without them and 30m with them. both rare rarity. i dont think the floor jack should help with patching the tire ngl you dont usually have to lift the vehicle."
relates: src/recovery.js (spare-change hours), data/items.js (quickJack), data/stock-weights.js, data/shop-stock.js, items.md §2 and §7
---
lane: B

# FEAT-203: Tire iron and floor jack — the spare change is 2 h bare, 30 min with both

## Next steps
Built on the defaults (land/feat-203). Owner: confirm the icon (placeholder = quick-jack's), price $30, the split, and the split and the compressor's part afterwards.

## Summary
Bring the tire iron back as an item and set the spare-change time from the two tools: 2 h with neither, 30 min with both. Both tools are rare. The floor jack never shortens a plug repair.

## Description
### Where it stands today
- The **floor jack** exists as the **Quick-jack** (`quickJack`, $30, stock weight 1 = rare, has a model). It takes 1 h off the spare change and does nothing for a plug repair, which is already the owner's rule of 2026-10-22.
- The **tire iron** does not exist. Its nearest ancestor, the breaker bar, was **cut by the owner on 2026-10-22** on the item setup page. This request is later and wins; items.md gets the reversal recorded.
- The spare change today (`src/recovery.js`): 2 h, minus 1 h with the quick-jack, minus 30 min with the compressor (read as an impact gun running off it). So **2 h bare and 30 min with both already holds**, with the compressor playing the tire iron's part.

### To build
- A `tireIron` tool item: rare (stock weight 1), a price, an inventory icon, a description.
- Spare change: **2 h with neither tool, 30 min with both.** `[DEFAULT]` 45 min off for each tool, so one tool alone gives 1 h 15 min.
- `[DEFAULT]` the tire iron takes over the compressor's 30 min on the spare change, and the two tools split the 1 h 30 min evenly. The compressor keeps its plug-repair and inflation jobs.
- The floor jack stays out of the plug repair. No change needed, pin it in the gate.

## Tracker
- [x] `tireIron` item: data, price, rarity, icon, description; appears in shops and as a reward where the quick-jack does
- [x] Spare change is 2 h bare and 30 min with both tools; the gate pins all four combinations
- [x] The plug repair's time ignores the floor jack (gate)
- [x] items.md (already marked superseded under DEC-105, items.md:336/1307): the breaker-bar cut is marked superseded by this ticket

## Decisions
- 2026-11-13, owner: spare change 2 h without the tools, 30 min with them; both rare; the floor jack does not help a plug repair.

## Open questions
- One tool alone: 1 h 15 min each (the default), or does one of them matter more?
- Does the compressor still take time off the spare change? The default removes it.
- Keep the name "Quick-jack" or rename it "Floor jack"?
- The tire iron's price (the quick-jack is $30).

## Files
`src/recovery.js` · `data/items.js` · `data/stock-weights.js` · `data/shop-stock.js` · `data/offers.js` · `test/recovery.mjs`

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.
- 2026-11-14: built on defaults: tireIron (2 kg, $30, weight 1, offers A/S recovery, thumb placeholder = quickJack); spareFitHours = 2 - 0.75 each tool, compressor no longer shortens the spare; gate test/recovery.mjs pins neither/iron/jack/both + plug ignores jack. 39 affected gates green (dist-assets after thumb fix). Smoke run separately.

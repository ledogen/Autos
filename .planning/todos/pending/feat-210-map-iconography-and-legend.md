---
id: FEAT-210
type: feature
status: open
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 — the map spec pasted in chat, part 1 ("What we have is a great base to build on but it needs: consistent iconography for mission givers vs vendor / poi …")
relates: FEAT-211 (the map window and lists), FEAT-67 (offer board: diamond colours), FEAT-60, data/map-icons.js, src/map2d.js
---
lane: A

# FEAT-210: The map's symbols — diamonds as mission backgrounds, vendor icons, special POIs, a forest-service legend

## Next steps
Built on feature/run-shape (Lane A). Owner: look at the before/after sheets (Links), then answer the open questions. Orchestrator: landing review.

## Summary
One consistent symbol language for the map. A diamond means "work here" and its colour says which kind. An icon means what the place is. The clutter the owner no longer wants (barrier marks, junction dots, Larry's customer diamonds) comes off, and the map gets a legend in the style of a forest service map.

## Description
### Symbols
- **The diamond becomes a background** and keeps its colour for the mission type on offer. Colours today (`FAMILY_COLOR` in `data/map-icons.js`): green = courier, orange = fragile, **blue = haul and freight** (the one the owner could not place), white = papers, red = demolition.
- **Split diamonds** when a place offers more than one mission type: one segment per type.
- **The lettered box** ("C / Fr / Fg") becomes a diamond in the type's colour with the letters kept inside as the reminder.
- **The foreground icon** is drawn on the diamond when the place is also a vendor, Larry, a gas station and so on.
- **A vendor with no mission is the icon alone**, no diamond.
- **Diamonds and icons 20 % larger.**
- **The paper route:** the newspaper symbol is "shoddy and unclear"; redraw it.
- **Larry:** his customers' tiny diamonds on the main map are unclear. `[DEFAULT]` drop them from the main map (they stay on the paper-route view), and Larry's symbol becomes a van.
- **Special POIs get symbols:** the expedition camp, and any other special place that lacks one (the lane lists them). The stranded motorist needs none.

### Taken off
- The barrier indicators at the map's edge. The barriers stay in the world; they are no longer drawn on the map.
- The coloured junction dots (degree and type). Entirely.

### Legend
A new legend, styled after forest service map branding (follow `.planning/research/UI-STYLE.md` for font and palette; a real-world object copies the object). Labelled: mission, shop (maybe unnecessary if the POI text stays), road, stream, pond, tunnel, camping area.

## Tracker
- [x] Diamond backgrounds in the mission colour; split diamonds for several types; letters inside
- [x] Vendor icons over the diamond; vendors without a mission are icon only
- [x] Diamonds and icons +20 %
- [x] New paper-route symbol; Larry is a van; his customer diamonds are off the main map
- [x] Expedition camp symbol, plus every special POI found without one
- [x] Barrier indicators and junction dots removed from the map
- [x] Legend in forest-service style with the seven labels
- [x] Before/after sheet for the owner

### As built (2026-11-13, Lane A)
- **Diamonds.** Every giver draws a diamond in its family colour(s), grey when nothing is on offer. Several families split it into equal wedges from the top, clockwise (two = left | right). Behind a pictogram the diamond is 0.72 × icon size (half-diagonal 19.4 px) so its tips stand clear of the glyph; alone it is 0.4 × (10.8 px). The board view's `status()` now also returns `families` (every family on offer, once each).
- **Letters.** The card's lettered box ("C / Fr / Fg") is now a diamond in the family colour with the letters inside. The map diamonds carry no letters: the legend names the colours.
- **Size.** `POI_ICON_PX` 22.5 → 27; the car marker moves with it (13.5 → 16.2), as the icon file's rule says.
- **Glyphs.** Newspaper redrawn as a dog-eared front page whose masthead and text lines are print, not holes. Larry is a van. New pictograms for the special places that had none: expedition camp (tent with a pennant), doctor (cross), work site (cone), school (schoolhouse with bell tower), office (block with windows). Residences, farms and the motorist stay plain diamonds.
- **Larry's customers** are drawn only while a paper route is on (as the newspaper); off a route they are not on the map.
- **Removed.** The barricade closure ticks (the boundary ring and its label stay), the junction dots and the crossing dots (both were debug layers in the cached background).
- **Legend.** Bottom-left of the sheet: Forest Service green title band with the title in its gold, the map's cream body, each entry drawn with the sheet's own inks. Mission (with the family colour key under it), Shop, Road, Stream, Pond, Tunnel, Camping area.

## Decisions
- 2026-11-13, owner: diamonds are backgrounds that keep their colours; split diamonds for several types; +20 % size; drop the barrier indicators and the junction dots; legend inspired by forest service map branding.

## Open questions
- The special places given a pictogram: expedition camp, doctor, work site, school, office. Right set? (Residences, farms and the motorist left as plain diamonds.)
- The legend sits permanently in the bottom-left corner over the map. Keep it there, or make it toggleable (FEAT-211 owns the layout)?
- Larry's customer diamonds: dropped from the main map (the default), or shown another way?
- Does the legend label "shop", or is the POI text enough?

## Links
Before/after sheets (worktree, git-invisible): `wip/feat-210/sheet-s6.png` (test seed), `sheet-s4117.png`, `sheet-s90233.png` (random), `sheet-glyphs.png`. Capture scripts: `wip/feat-210/shot.mjs`, `sheet.mjs`.

## Files
`src/map2d.js` · `data/map-icons.js`

## Log
- 2026-11-13: minted from the owner's spec by the orchestrator. Nothing built.
- 2026-11-13: built on feature/run-shape (Lane A); affected gates green; sheets in wip/feat-210/.

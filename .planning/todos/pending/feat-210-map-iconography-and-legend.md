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
Lane A builds it on the defaults below and shows a before/after sheet. No owner call is needed to start.

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
- [ ] Diamond backgrounds in the mission colour; split diamonds for several types; letters inside
- [ ] Vendor icons over the diamond; vendors without a mission are icon only
- [ ] Diamonds and icons +20 %
- [ ] New paper-route symbol; Larry is a van; his customer diamonds are off the main map
- [ ] Expedition camp symbol, plus every special POI found without one
- [ ] Barrier indicators and junction dots removed from the map
- [ ] Legend in forest-service style with the seven labels
- [ ] Before/after sheet for the owner

## Decisions
- 2026-11-13, owner: diamonds are backgrounds that keep their colours; split diamonds for several types; +20 % size; drop the barrier indicators and the junction dots; legend inspired by forest service map branding.

## Open questions
- Larry's customer diamonds: dropped from the main map (the default), or shown another way?
- Does the legend label "shop", or is the POI text enough?

## Files
`src/map2d.js` · `data/map-icons.js`

## Log
- 2026-11-13: minted from the owner's spec by the orchestrator. Nothing built.

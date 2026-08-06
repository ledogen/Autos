// data/map-icons.js — the 2D map's glyph table for the POI roster (FEAT-60).
//
// Every roster type in src/poi.js gets a row here: a colour, a label, and (once authored) a
// pictogram. src/map2d.js reads nothing else — adding an icon is editing this file.
//
// ── HOW TO ADD A PICTOGRAM ──────────────────────────────────────────────────────────────────
// `path` is an SVG path `d` string, and nothing else — no <svg> wrapper, no transforms, no
// styling. Author it wherever you like (Illustrator/Figma/Inkscape, or an icon set), then paste
// the single `d` attribute in. Rules the renderer assumes:
//
//   • **24 × 24 viewBox, origin top-left.** map2d centres and scales from that box, so a glyph
//     drawn to any other size lands off-centre or wrong-sized. Most icon sets ship 24×24 already.
//   • **Filled shapes, not strokes.** The path is filled with the row's `color` and outlined in
//     near-black for contrast against terrain. A stroke-only icon (thin outlines, `fill:none`)
//     will come out as a solid blob — convert strokes to outlines before exporting.
//   • **One path.** Multi-path icons must be flattened into one `d` (they concatenate fine; the
//     fill rule is nonzero, so an inner subpath drawn in the opposite winding cuts a hole).
//   • Keep it legible at ~14 px. Interior detail below ~1.5 units of the 24 disappears on screen.
//
// Third-party icons need a licence line in assets/models/CREDITS.md, same as a model.
//
// A row with `path: null` falls back to the plain diamond in its own colour, still labelled — so
// the map is readable before any of this is drawn, and improves one paste at a time.
//
// Colours are picked to stay apart from the map's existing palette (road #d8d8d0, tunnel #ffb84a,
// mission pins, car #ff5a3c) and from each other at small size.

// Glyphs below are hand-authored to this file's rules (24×24, filled, one `d`, nonzero holes wound
// against their outer subpath). They are deliberately BLUNT: the outline is a fixed 1.5 SCREEN px,
// so at POI_ICON_PX 30 it eats ~1.2 viewBox units and any interior feature thinner than that is
// swallowed whole by its own stroke. Hence one or two chunky cut-outs per glyph and nothing finer
// — the door of the house, the patty of the burger, the vents of the rotor. (The budget was half
// as generous at the original 15 px, which is why the glyphs are blunter than they now need to be;
// they have room for a little more detail at this size if any of them want it.)
export const POI_ICONS = {
    // Mom's house — where you can sleep. NOT a camp (see camp.js build()); it is a POI with a
    // building on it that happens to have a bed.
    // Gabled house, eaves overhanging both walls, doorway cut out of the front.
    momsHouse:    { label: "MOM'S",   color: '#ff8fd0', path:
        'M12 2.5 L22.5 11.5 L19.5 11.5 L19.5 21.5 L4.5 21.5 L4.5 11.5 L1.5 11.5 Z'
      + 'M10 14 L10 21.5 L14 21.5 L14 14 Z' },
    // Newspaper, opened and tented over the fold — one column bar per page.
    larrysHouse:  { label: "LARRY'S", color: '#8fd0ff', path:
        'M2.5 6.5 L12 4 L21.5 6.5 L21.5 20 L12 17.5 L2.5 20 Z'
      + 'M5 10.5 L5 13.1 L10.5 11.7 L10.5 9.1 Z'
      + 'M19 10.5 L13.5 9.1 L13.5 11.7 L19 13.1 Z' },
    // Burger: domed top bun, flat-bottomed heel, one slot for the patty.
    burgerJoint:  { label: 'BURGER',  color: '#ffc84a', path:
        'M2 11.5 A10 7.5 0 0 1 22 11.5 L22 16.5 A10 4.5 0 0 1 2 16.5 Z'
      + 'M3 13 L3 15 L21 15 L21 13 Z' },
    // Brake rotor seen face-on: hub bore plus four cooling vents.
    serviceShop:  { label: 'SERVICE', color: '#c8d0d8', path:
        'M2 12 A10 10 0 1 1 22 12 A10 10 0 1 1 2 12 Z'
      + 'M8.6 12 A3.4 3.4 0 1 0 15.4 12 A3.4 3.4 0 1 0 8.6 12 Z'
      + 'M5.8 7.3 A1.5 1.5 0 1 0 8.8 7.3 A1.5 1.5 0 1 0 5.8 7.3 Z'
      + 'M15.2 7.3 A1.5 1.5 0 1 0 18.2 7.3 A1.5 1.5 0 1 0 15.2 7.3 Z'
      + 'M5.8 16.7 A1.5 1.5 0 1 0 8.8 16.7 A1.5 1.5 0 1 0 5.8 16.7 Z'
      + 'M15.2 16.7 A1.5 1.5 0 1 0 18.2 16.7 A1.5 1.5 0 1 0 15.2 16.7 Z' },
    // Gas pump: body on a plinth, display window cut out, hose column down the right.
    gasStation:   { label: 'GAS',     color: '#ff7a5a', path:
        'M5.5 3 L11.5 3 A1.5 1.5 0 0 1 13 4.5 L13 7.5 L19 7.5 L19 23 L16 23 L16 10.5 L13 10.5'
      + ' L13 20.5 L14.5 20.5 L14.5 23 L2.5 23 L2.5 20.5 L4 20.5 L4 4.5 A1.5 1.5 0 0 1 5.5 3 Z'
      + 'M5.5 6 L5.5 10.5 L11.5 10.5 L11.5 6 Z' },
    // Shopping cart: flared basket, handle-and-rail frame, two wheels (four solid subpaths, no
    // holes — the seams where they overlap are exactly the lines the drawing wants).
    generalStore: { label: 'STORE',   color: '#b48cff', path:
        'M6.5 7 L22 7 L19.2 17 L9.3 17 Z'
      + 'M1.5 2.5 L5.8 2.5 L10.6 16.6 L20.5 16.6 L20.5 19 L8.9 19 L3.9 5 L1.5 5 Z'
      + 'M9.5 21.2 A2 2 0 1 1 13.5 21.2 A2 2 0 1 1 9.5 21.2 Z'
      + 'M16.5 21.2 A2 2 0 1 1 20.5 21.2 A2 2 0 1 1 16.5 21.2 Z' },
    // A fish, not the hook the roster note first guessed at: a hook is all shank and barb, every
    // part of it thinner than the outline, so it renders as a black squiggle. The catch reads.
    tackleShop:   { label: 'TACKLE',  color: '#5fd8b8', path:
        'M3 12 C6 6, 15 5, 19 9.5 L22.5 5.5 L22.5 18.5 L19 14.5 C15 19, 6 18, 3 12 Z'
      + 'M5.6 10.5 A1.4 1.4 0 1 0 8.4 10.5 A1.4 1.4 0 1 0 5.6 10.5 Z' },
    // Mission givers stay the anonymous orange diamond, unlabelled: there are five of them, they
    // are interchangeable, and naming each one would turn the map into a wall of text. Finding out
    // what a marker offers is what driving to it is for.
    missionGiver: { label: null,      color: '#ff7a18', path: null },
}

/** Rendered size of a pictogram on the map, in px (the 24-unit viewBox scales to this). */
export const POI_ICON_PX = 30

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

export const POI_ICONS = {
    // Mom's house — where you can sleep. NOT a camp (see camp.js build()); it is a POI with a
    // building on it that happens to have a bed.
    momsHouse:    { label: "MOM'S",   color: '#ff8fd0', path: null },   // pink house
    larrysHouse:  { label: "LARRY'S", color: '#8fd0ff', path: null },   // newspaper
    burgerJoint:  { label: 'BURGER',  color: '#ffc84a', path: null },   // burger
    serviceShop:  { label: 'SERVICE', color: '#c8d0d8', path: null },   // brake disc + rotor
    gasStation:   { label: 'GAS',     color: '#ff7a5a', path: null },   // gas pump
    generalStore: { label: 'STORE',   color: '#b48cff', path: null },   // shopping cart
    tackleShop:   { label: 'TACKLE',  color: '#5fd8b8', path: null },   // fish hook
    // Mission givers stay the anonymous orange diamond, unlabelled: there are five of them, they
    // are interchangeable, and naming each one would turn the map into a wall of text. Finding out
    // what a marker offers is what driving to it is for.
    missionGiver: { label: null,      color: '#ff7a18', path: null },
}

/** Rendered size of a pictogram on the map, in px (the 24-unit viewBox scales to this). */
export const POI_ICON_PX = 15

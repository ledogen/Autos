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
// so at POI_ICON_PX 22.5 it eats ~1.6 viewBox units and any interior feature thinner than that is
// swallowed whole by its own stroke. Hence one or two chunky cut-outs per glyph and nothing finer
// — the door of the house, the patty of the burger, the eye of the hook. Anything the drawing can
// carry as SILHOUETTE it carries as silhouette; interior lines are the last resort, not the first.

// Gabled house, eaves overhanging both walls, doorway cut out of the front. Shared by the two
// houses on the roster: they are the same building to a driver glancing at the map, and the
// colour (plus the label under it) is what says whose it is. Two near-identical house drawings
// would read as one repeated marker — one drawing in two colours reads as a pair on purpose.
const HOUSE = 'M12 2.5 L22.5 11.5 L19.5 11.5 L19.5 21.5 L4.5 21.5 L4.5 11.5 L1.5 11.5 Z'
            + 'M10 14 L10 21.5 L14 21.5 L14 14 Z'

// FEAT-61: a FOLDED newspaper — the page, the rolled spine down its left edge, and four blocks of
// type punched out of it (owner-supplied reference, 2026-08-15). The first attempt was a rolled
// paper on the diagonal, matching the object the player throws; it read as a stick, because a roll
// seen end-on is a bar and one small hole cannot rescue a bar.
//
// Five subpaths in one `d`, which the header's rules allow: page and spine are wound the SAME way
// so nonzero unions them into one silhouette (they overlap by half a unit on purpose — a gap would
// show as a seam), and the three type blocks are wound AGAINST them so they punch through.
//
// THE GRID IS EXACT, because at 22.5 px an uneven margin reads as a mistake rather than as texture.
// The page is 7..21.5 x 5..21.5; every block sits inside a 2.0-unit margin on all four sides, and
// the gaps between blocks are 2.0 as well — so margin and gutter are one number and the whitespace
// is even wherever you measure it. Headline across the top, then two columns. A fourth block was
// tried and dropped: it packed the lower half tight enough that the gutters closed up at size.
export const NEWSPAPER = 'M7 5 L21.5 5 L21.5 21.5 L7 21.5 Z'
                       + 'M2.5 8 L7.5 8 L7.5 21.5 L2.5 21.5 Z'
                       + 'M19.5 7 L9 7 L9 10 L19.5 10 Z'
                       + 'M13.25 12 L9 12 L9 19.5 L13.25 19.5 Z'
                       + 'M19.5 12 L15.25 12 L15.25 19.5 L19.5 19.5 Z'

export const POI_ICONS = {
    // Mom's house — where you can sleep. NOT a camp (see camp.js build()); it is a POI with a
    // building on it that happens to have a bed.
    momsHouse:    { label: "MOM'S",   color: '#ff8fd0', path: HOUSE },
    larrysHouse:  { label: "LARRY'S", color: '#8fd0ff', path: HOUSE },
    // Burger: domed top bun, flat-bottomed heel, one slot for the patty.
    burgerJoint:  { label: 'BURGER',  color: '#ffc84a', path:
        'M2 11.5 A10 7.5 0 0 1 22 11.5 L22 16.5 A10 4.5 0 0 1 2 16.5 Z'
      + 'M3 13 L3 15 L21 15 L21 13 Z' },
    // Open-end wrench laid on the 45° diagonal, head up-left. The head is a full round BOSS — one
    // circle, with the jaw notched into it and the handle springing straight off its underside.
    // There are no shoulders: a tapered shoulder puts a straight run on the outside of the head,
    // and on a glyph already sitting at 45° that run reads as a chamfer rather than as a wrench.
    // Everything outside the notch is now a single unbroken curve from one prong tip, round the
    // back of the head, to the other. All silhouette and one concave notch — nothing to smear.
    //
    // The rotation is BAKED INTO THE COORDINATES because a `d` string is all the renderer takes (no
    // transform attribute, see the header) — which is also why the diagonal buys ~15% more glyph:
    // a 12×22 wrench turned 45° squares up its bounding box and can then be scaled to fill it.
    //
    // Authoring note for whoever edits this next: do it axis-aligned and re-bake, don't nudge these
    // numbers. Every point here is (x,y) → 12.705 + 0.92418·(dx±dy) about (12,12) with dx = x−12,
    // dy = y−12 (a −45° rotation, then the scale that fits the rotated bounding box). Changing the
    // outline changes which points are extreme — including the BULGES of the arcs, not just their
    // endpoints — which changes that scale, so the whole glyph gets recomputed rather than patched.
    // The pre-rotation figure is: head circle centred (12,7) r5; jaw notch x 10..14 cut into it
    // from above, with a r2 half-round throat centred (12,5); prong tips where the notch sides
    // cross the head circle, at y 2.417; handle x 10.2..13.8 running from the circle down to y 20
    // with a r1.8 cap. Radii scale with the glyph: 5→6.54, 2→2.61, 1.8→2.35.
    //
    // Head size is NOT a free dial: shrinking the boss thins the prongs, because a prong is just
    // the gap between the notch side and the circle. The jaw narrowed from 5 wide to 4 alongside
    // this, and the head centre rose from y8 to y7 so the notch crosses the circle nearer its
    // widest point — without both, a r5 head leaves ~2 units of prong, which the outline eats.
    // As drawn the prongs are 3.4 units with ~2.2 of colour surviving.
    serviceShop:  { label: 'SERVICE', color: '#c8d0d8', path:
        'M10.73 14.06 A6.54 6.54 0 0 1 2 5.7 L4.39 8.08 A2.61 2.61 0 0 0 8.08 4.39 L5.7 2'
      + ' A6.54 6.54 0 0 1 14.06 10.73 L21.76 18.44 A2.35 2.35 0 0 1 18.44 21.76 Z' },
    // Gas pump: body on a plinth, display window cut out, hose column down the right. The body is
    // deliberately wider than the window needs — at the old width the frame around the display was
    // ~1.5 units, which the 1.2-unit outline ate from both sides until it read as mush. 2.5 units
    // of wall each side is the minimum that survives being drawn.
    // Sits 1.75 right of where it was drawn: the pump spanned x 1..19.5, so its centre was at 10.25
    // while map2d centres the LABEL on the 24-box centre, 12 — the glyph read as shoved left of its
    // own text. Nudged so the silhouette is symmetric about 12. (Bbox centre is the honest target
    // here because the pump's area centroid lands at 10.24 too — the wide body left of centre and
    // the thin hose column right of it happen to balance.)
    gasStation:   { label: 'GAS',     color: '#ff7a5a', path:
        'M5.75 3 L14.25 3 A1.5 1.5 0 0 1 15.75 4.5 L15.75 7.5 L21.25 7.5 L21.25 23 L18.25 23'
      + ' L18.25 10.5 L15.75 10.5 L15.75 20.5 L17.25 20.5 L17.25 23 L2.75 23 L2.75 20.5'
      + ' L4.25 20.5 L4.25 4.5 A1.5 1.5 0 0 1 5.75 3 Z'
      + 'M6.75 6 L6.75 11 L13.25 11 L13.25 6 Z' },
    // Shopping cart: handle, post and basket are ONE subpath, not three overlapping ones. The post
    // used to be its own polygon crossing the basket, so the stroke drew its edges straight through
    // the basket interior — a seam where the drawing wants clean space. Merged, the post's outer
    // edge simply stops being a boundary below the rim and becomes the basket's left wall.
    generalStore: { label: 'STORE',   color: '#b48cff', path:
        'M1.5 2.5 L6.2 2.5 L7.9 7 L22.5 7 L20 17.4 L8.6 17.4 L4.4 5.2 L1.5 5.2 Z'
      + 'M9 19.4 A2 2 0 1 1 13 19.4 A2 2 0 1 1 9 19.4 Z'
      + 'M16.5 19.4 A2 2 0 1 1 20.5 19.4 A2 2 0 1 1 16.5 19.4 Z' },
    // Fish hook: ringed eye, shank, J-bend, point angled back at the barb. The wire is 2.8 units
    // thick throughout — a hook at true wire gauge is thinner than the outline everywhere and comes
    // out a black squiggle. The eye is a FULL ring (outer 4.2, bore 1.9) rather than a bore punched
    // through the top of the shank: that left 1.3 units of wall, and with 0.6 of outline landing on
    // each side of it barely a tenth of a unit of colour survived, so the eye read as a solid black
    // dot. 2.3 units of wall keeps ~1.1 showing. Eye and wire are one subpath — the shank meets the
    // ring where the circle crosses x = centre ± 1.4, so there is no seam stroked across the join.
    tackleShop:   { label: 'TACKLE',  color: '#5fd8b8', path:
        'M12.8 10.16 A4.2 4.2 0 1 1 15.6 10.16 L15.6 17.6 A4.4 4.4 0 0 1 6.8 17.6'
      + ' L6.8 14.1 L5.6 10.9 L9.6 15.1 L9.6 17.6 A1.6 1.6 0 0 0 12.8 17.6 Z'
      + 'M12.3 6.2 A1.9 1.9 0 1 0 16.1 6.2 A1.9 1.9 0 1 0 12.3 6.2 Z' },
    // Mission givers stay the anonymous orange diamond, unlabelled: there are five of them, they
    // are interchangeable, and naming each one would turn the map into a wall of text. Finding out
    // what a marker offers is what driving to it is for.
    missionGiver: { label: null,      color: '#ff7a18', path: null },
}

/**
 * Rendered size of a pictogram on the map, in px (the 24-unit viewBox scales to this).
 * 15 as first drawn, 30 at the doubling pass, 22.5 after that read too heavy (owner, 2026-08-07).
 * The car marker in map2d.js is sized to match — move them together or the map stops looking like
 * one drawing. (The tunnel arch below no longer needs saying: it IS one of these now.)
 */
export const POI_ICON_PX = 22.5

// ── TUNNEL (FEAT-40) ────────────────────────────────────────────────────────────────────────
// Not a POI — one of these marks every tunnel bore, placed from road geometry rather than from the
// roster — but it lives here, in this format, on purpose. It used to be drawn straight into the
// canvas in map2d as an amber semicircle with a dark disc punched out of it, which meant it was the
// one marker on the map with no outline and no shared silhouette language: it read as a blob from a
// different drawing. Same 24-box rules as everything above, so map2d can stroke it through the same
// path.
//
// Portal seen head-on, after the owner's reference: horseshoe of rock, the road running up into it
// and flaring toward the viewer, two centreline dashes floating in the opening.
//
// The road is a NOTCH cut up from the bottom edge, not a hole punched through — the outline walks
// up one road edge, over the bore ceiling and down the other, so the bottom of the opening is never
// a boundary and never gets stroked. Drawn as a hole instead (which is the obvious way), the hole's
// bottom edge lands flush on the horseshoe's own bottom edge and the two tile into one unbroken
// line straight across the glyph — the road reads as capped off rather than running out of frame.
// Same trick as the wrench jaw. The dashes stay separate subpaths, wound with the outer so they
// fill back in inside the notch.
//
// The bore is 7 units wide and the dashes 3×3, against a 1.6-unit outline — both are near the floor
// of what survives being drawn, so this glyph does not take kindly to being shrunk. If it ever has
// to be, drop to a single dash before thinning anything.
export const TUNNEL_ICON = {
    color: '#ffb84a',
    path: 'M2 22.25 L2 11.75 A10 10 0 0 1 22 11.75 L22 22.25 L18.4 22.25 L15.5 14.25 L15.5 11.75'
        + ' A3.5 3.5 0 0 0 8.5 11.75 L8.5 14.25 L5.6 22.25 Z'
        + 'M10.5 14.85 L13.5 14.85 L13.5 17.85 L10.5 17.85 Z'
        + 'M10.5 19.25 L13.5 19.25 L13.5 22.25 L10.5 22.25 Z',
}

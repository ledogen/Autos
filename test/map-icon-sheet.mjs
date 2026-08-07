// test/map-icon-sheet.mjs — contact sheet for the 2D map's POI glyphs (FEAT-60).
//
// Rainy-day script, NOT a gate: it renders every pictogram in data/map-icons.js to a standalone
// SVG so a glyph can be judged without booting the game and driving to a POI. The point is the
// bottom row — each icon at the exact POI_ICON_PX size, with the outline weight map2d actually
// strokes it at, because that outline is what kills fine interior detail.
//
//   node test/map-icon-sheet.mjs > /tmp/poi-icons.svg && open /tmp/poi-icons.svg
//
// Reads the icon table live, so a new `path` shows up here the moment it's pasted in.

import { POI_ICONS, POI_ICON_PX as PX, TUNNEL_ICON } from '../data/map-icons.js'

// The tunnel arch rides along: it is not a POI, but it is drawn from the same table through the
// same map2d path, and the whole point of judging these is judging them against each other.
const rows = [...Object.entries(POI_ICONS), ['tunnel', { ...TUNNEL_ICON, label: 'TUNNEL' }]]
    .filter(([, i]) => i.path)
const COLW = 150, ROWH = 130
const W = COLW * rows.length, H = ROWH + 55
let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#3a4038"/>`

rows.forEach(([key, ico], n) => {
    const cx = n * COLW + COLW / 2
    // 4x blow-up. The stroke is scaled by 4 too, so the outline stays the same FRACTION of the
    // glyph as on the map — an inspection view that lies about weight is worse than none.
    const s4 = 96 / 24, sw4 = 1.5 * 4 / s4
    out += `<g transform="translate(${cx - 48} 14) scale(${s4})">`
         + `<path d="${ico.path}" fill="${ico.color}" stroke="#101010" stroke-width="${sw4}"/></g>`
    // Actual size, exactly as _drawPois lands it (map2d undoes the scale on lineWidth the same way).
    const s1 = PX / 24, sw1 = 1.5 / s1
    out += `<g transform="translate(${cx - PX / 2} 118) scale(${s1})">`
         + `<path d="${ico.path}" fill="${ico.color}" stroke="#101010" stroke-width="${sw1}"/></g>`
    out += `<text x="${cx}" y="152" fill="${ico.color}" font-family="monospace" font-size="10"`
         + ` text-anchor="middle" stroke="#101010" stroke-width="3" paint-order="stroke">${ico.label}</text>`
    out += `<text x="${cx}" y="168" fill="#8a908a" font-family="monospace" font-size="9"`
         + ` text-anchor="middle">${key}</text>`
})
out += '</svg>'
process.stdout.write(out)

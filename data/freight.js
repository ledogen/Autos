/**
 * data/freight.js — the strapped bed loads (FEAT-96 freight, FEAT-97 fragile): one row per model.
 *
 * `model` is a PROP_MODELS key (data/prop-models.js), so a load is only listable once its .glb has
 * been promoted to assets/models/ and registered there. Adding a load is then one row here.
 * `massKg` is the load as delivered, AS BUILT: counted off the model (crates, cans, bags, tyres, panes)
 * at real unit weights — the derivation of every number is cargo.md's Mass / Note columns.
 * The full lists with region tiers and mass ranges are .planning/story-mode/cargo.md.
 *
 * `form` (FEAT-112, src/load-verdict.js): 'boxed' — one rigid piece or a strapped pallet — or 'long' —
 * boards, ties and sheets, the loads that ride over the tailgate. Haul's 'loose' is set by main.js. A
 * load's SIZE is not here: it is its model's measured PROP_MODELS collision.size, the one copy.
 *
 * Read by the debug menu ("Load Cargo", src/debug.js), the freight and fragile offers' `load`
 * keys (data/offers.js) and main.js's bed loader.
 */
export const FREIGHT = {
  // ── Freight (cargo.md § Freight) ──
  // The singles ride palletised and strapped (owner 2026-10-10). Pallets: the full 1.0 × 1.2 is 20 kg, the small 0.8 × 0.8 is 12.
  smallCrate:        { label: 'Crate, small, on a pallet',   model: 'smallCratePallet',  massKg: 30, form: 'boxed' },
  largeCrate:        { label: 'Crate, large, on a pallet',   model: 'largeCratePallet',  massKg: 65, form: 'boxed' },
  propanePallet:     { label: 'Propane 4-pack, full',        model: 'propanePallet',     massKg: 80, form: 'boxed' },
  drum:              { label: 'Drum, full (oil), on a pallet', model: 'drumPallet',      massKg: 213, form: 'boxed' },
  barrelPlastic:     { label: 'Barrel, full (water), on a pallet', model: 'barrelPallet', massKg: 230, form: 'boxed' },
  tireStack:         { label: 'Tyres, eight',                model: 'tireStack',         massKg: 105, form: 'boxed' },
  producePalletTomatoes: { label: 'Pallet of tomatoes',      model: 'producePalletTomatoes', massKg: 365, form: 'boxed' },
  producePalletSquash:   { label: 'Pallet of squash',        model: 'producePalletSquash',   massKg: 315, form: 'boxed' },
  producePalletPeppers:  { label: 'Pallet of peppers',       model: 'producePalletPeppers',  massKg: 235, form: 'boxed' },
  pottingSoilPallet: { label: 'Pallet of potting soil',      model: 'pottingSoilPallet', massKg: 344, form: 'boxed' },
  softDrinkPallet:   { label: 'Pallet of soft drinks',       model: 'softDrinkPallet',   massKg: 240, form: 'boxed' },
  cinderBlockPallet: { label: 'Pallet of cinder blocks (overload)', model: 'cinderBlockPallet', massKg: 785, form: 'boxed' },
  concretePallet:    { label: 'Pallet of concrete (overload)', model: 'concretePallet',  massKg: 670, form: 'boxed' },
  plywoodSheets:     { label: 'Plywood, 12 sheets',          model: 'plywoodSheets',     massKg: 330, form: 'long' },
  railwayTies:       { label: 'Railway ties, five',          model: 'railwayTies',       massKg: 455, form: 'long' },
  drumStack:         { label: "Drums, four 55-gal",          model: 'drumStack',         massKg: 804, form: 'boxed' },
  jobBox:            { label: 'Job box',                     model: 'jobBox',            massKg: 175, form: 'boxed' },
  lumberBundle:      { label: 'Lumber bundle, banded',        model: 'lumberBundle',      massKg: 170, form: 'long' },
  // ── Fragile (cargo.md § Fragile) — strapped the same way; health is FEAT-97 ──
  diningChairs:      { label: 'Dining chairs, four (fragile)',  model: 'diningChairs',     massKg: 24, form: 'boxed' },
  ornateVase:        { label: 'Ornate vase (fragile)',          model: 'ornateVase',       massKg: 9, form: 'boxed' },
  fullLengthMirror:  { label: 'Full-length mirror (fragile)',   model: 'fullLengthMirror', massKg: 16, form: 'boxed' },
  diningTable:       { label: 'Dining table (fragile)',         model: 'diningTable',      massKg: 45, form: 'boxed' },
  framedArtwork:     { label: 'Framed artwork (fragile)',       model: 'framedArtwork',    massKg: 16, form: 'boxed' },
  glassPanes:        { label: 'Panes of glass (fragile)',       model: 'glassPanes',       massKg: 240, form: 'boxed' },
  gardenFountain:    { label: 'Garden fountain (fragile)',      model: 'gardenFountain',   massKg: 200, form: 'boxed' },
  wardrobe:          { label: 'Wardrobe (fragile)',             model: 'wardrobe',         massKg: 120, form: 'boxed' },
  pelicanCase:       { label: 'Pelican case (fragile)',         model: 'pelicanCase',      massKg: 35, form: 'boxed' },
  sculptureA:        { label: 'Sculpture, bronze (fragile)',    model: 'sculptureA',       massKg: 120, form: 'boxed' },
  sculptureB:        { label: 'Sculpture, marble (fragile)',    model: 'sculptureB',       massKg: 220, form: 'boxed' },
  uprightPiano:      { label: 'Upright piano (fragile)',        model: 'uprightPiano',     massKg: 230, form: 'boxed' },
  xrayMachine:       { label: 'X-ray machine (fragile)',        model: 'xrayMachine',      massKg: 450, form: 'boxed' },
}

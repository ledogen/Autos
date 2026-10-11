/**
 * data/freight.js — the strapped bed loads (FEAT-96 freight, FEAT-97 fragile): one row per model.
 *
 * `model` is a PROP_MODELS key (data/prop-models.js), so a load is only listable once its .glb has
 * been promoted to assets/models/ and registered there. Adding a load is then one row here.
 * `massKg` is the load as delivered, not the empty prop — a full drum, not the steel. Where the
 * asset ticket gives a range it is the middle of it; the slider in the debug menu covers the rest.
 * The full lists with region tiers and mass ranges are .planning/story-mode/cargo.md.
 *
 * Today only the debug menu reads this ("Load Cargo", src/debug.js); the freight and fragile
 * missions will roll their things from the same rows.
 */
export const FREIGHT = {
  // ── Freight (cargo.md § Freight) ──
  // The singles ride palletised and strapped (owner 2026-10-10) — the small pallet adds ~15 kg, the full one 25.
  smallCrate:        { label: 'Crate, small, on a pallet',   model: 'smallCratePallet',  massKg: 33 },
  largeCrate:        { label: 'Crate, large, on a pallet',   model: 'largeCratePallet',  massKg: 70 },
  propanePallet:     { label: 'Propane 4-pack, full',        model: 'propanePallet',     massKg: 90 },
  drum:              { label: 'Drum, full (oil), on a pallet', model: 'drumPallet',      massKg: 215 },   // 55 gal × 0.88 kg/L + 18 kg drum + pallet
  barrelPlastic:     { label: 'Barrel, full (water), on a pallet', model: 'barrelPallet', massKg: 233 },   // 55 gal of water + ~10 kg HDPE + pallet
  tireStack:         { label: 'Tyres, eight',                model: 'tireStack',         massKg: 90 },
  producePalletTomatoes: { label: 'Pallet of tomatoes',      model: 'producePalletTomatoes', massKg: 275 },
  producePalletSquash:   { label: 'Pallet of squash',        model: 'producePalletSquash',   massKg: 275 },
  producePalletPeppers:  { label: 'Pallet of peppers',       model: 'producePalletPeppers',  massKg: 275 },
  pottingSoilPallet: { label: 'Pallet of potting soil',      model: 'pottingSoilPallet', massKg: 344 },   // 18 bags × 18 kg + 20 kg pallet
  softDrinkPallet:   { label: 'Pallet of soft drinks',       model: 'softDrinkPallet',   massKg: 400 },
  cinderBlockPallet: { label: 'Pallet of cinder blocks (overload)', model: 'cinderBlockPallet', massKg: 785 },   // 45 × 8" CMU at ~17 kg + 20 kg pallet, as built
  concretePallet:    { label: 'Pallet of concrete (overload)', model: 'concretePallet',  massKg: 670 },   // 18 × 80 lb bags + pallet, as built (cargo.md)
  plywoodSheets:     { label: 'Plywood, 12 sheets',          model: 'plywoodSheets',     massKg: 325 },   // 3/4" sheet ≈ 27 kg
  railwayTies:       { label: 'Railway ties, five',          model: 'railwayTies',       massKg: 375 },
  drumStack:         { label: "Drums, four 55-gal",          model: 'drumStack',         massKg: 300 },   // partly filled, per ASSET-48
  jobBox:            { label: 'Job box',                     model: 'jobBox',            massKg: 200 },
  lumberBundle:      { label: 'Lumber bundle (haul)',        model: 'lumberBundle',      massKg: 250 },   // FEAT-91's banded bundle — haul, here to feel the weight
  // ── Fragile (cargo.md § Fragile) — strapped the same way; health is FEAT-97 ──
  diningChairs:      { label: 'Dining chairs, four (fragile)',  model: 'diningChairs',     massKg: 28 },
  ornateVase:        { label: 'Ornate vase (fragile)',          model: 'ornateVase',       massKg: 5 },
  fullLengthMirror:  { label: 'Full-length mirror (fragile)',   model: 'fullLengthMirror', massKg: 22 },
  diningTable:       { label: 'Dining table (fragile)',         model: 'diningTable',      massKg: 55 },
  framedArtwork:     { label: 'Framed artwork (fragile)',       model: 'framedArtwork',    massKg: 20 },
  glassPanes:        { label: 'Panes of glass (fragile)',       model: 'glassPanes',       massKg: 90 },
  gardenFountain:    { label: 'Garden fountain (fragile)',      model: 'gardenFountain',   massKg: 225 },
  wardrobe:          { label: 'Wardrobe (fragile)',             model: 'wardrobe',         massKg: 140 },
  pelicanCase:       { label: 'Pelican case (fragile)',         model: 'pelicanCase',      massKg: 30 },
  sculptureA:        { label: 'Sculpture, bronze (fragile)',    model: 'sculptureA',       massKg: 120 },
  sculptureB:        { label: 'Sculpture, marble (fragile)',    model: 'sculptureB',       massKg: 180 },
  uprightPiano:      { label: 'Upright piano (fragile)',        model: 'uprightPiano',     massKg: 230 },
  xrayMachine:       { label: 'X-ray machine (fragile)',        model: 'xrayMachine',      massKg: 350 },
}

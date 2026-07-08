/**
 * src/props/prop-debug.js — lil-gui folder for live FEAT-06 prop tuning.
 *
 * Self-contained on purpose: it attaches a single (collapsed) folder to the EXISTING gui instance
 * passed in, so it never edits debug.js (which is under active BUG-10 lil-gui work). Changing a
 * slider mutates FLORA_PARAMS in place; on release we call `rebuild()` (dispose + recreate the
 * PropSystem) so the palette re-bakes and chunks re-scatter with the new values.
 *
 * Array params (e.g. trunk.baseRadius = [min,max]) are bound by index — lil-gui binds object
 * properties, and an array index is just a property key.
 */

/**
 * @param {GUI} gui    the lil-gui instance returned by initDebug()
 * @param {{ params: object, rebuild: () => void, getPropSystem?: () => object }} opts
 *   getPropSystem: live-handle accessor (survives rebuild) for the PERF-07 shadow toggle.
 */
export function addPropGui(gui, { params, rebuild, getPropSystem }) {
  const f = gui.addFolder('Props (FEAT-06)')
  f.close()                              // collapsed by default
  const done = () => rebuild()
  const S = params.scatter

  // PERF-07: prop shadow bake toggle. OFF (default) = props out of the sun's shadow pass + baked
  // contact-shadow blobs; ON = realtime casting (blobs hidden). Read live off the current PropSystem
  // (getPropSystem() survives rebuilds); the fresh system re-reads params.shadows.castRealtime on
  // rebuild, so the state persists either way.
  f.add(params.shadows, 'castRealtime').name('Realtime prop shadows').onChange((v) => {
    const sys = getPropSystem && getPropSystem()
    if (sys) sys.setShadowCasting(v)
  })

  const density = f.addFolder('Density'); density.close()
  density.add(S, 'clustersPerChunk', 0, 12, 1).name('tree clusters').onFinishChange(done)
  density.add(S.treesPerCluster, '1', 0, 24, 1).name('trees/cluster max').onFinishChange(done)
  density.add(S.rocksPerChunk, '1', 0, 60, 1).name('rocks max').onFinishChange(done)
  density.add(S.smallRocksPerChunk, '1', 0, 120, 1).name('small rocks max').onFinishChange(done)
  density.add(S.bushesPerChunk, '1', 0, 40, 1).name('bushes max').onFinishChange(done)
  density.add(S, 'boulderChance', 0, 1, 0.01).name('boulder chance').onFinishChange(done)

  const place = f.addFolder('Placement'); place.close()
  place.add(S, 'groundSink', 0, 2, 0.05).name('ground sink (m)').onFinishChange(done)
  place.add(S, 'treeTiltMax', 0, 0.6, 0.01).name('tree tilt max (rad)').onFinishChange(done)
  place.add(S, 'roadExclusion', 0, 20, 0.5).name('road exclusion (m)').onFinishChange(done)
  place.add(S, 'slopeMeadowMax', 0, 1, 0.01).name('aspen slope max').onFinishChange(done)
  place.add(S, 'slopeSteepMin', 0, 1, 0.01).name('pine slope min').onFinishChange(done)

  const size = f.addFolder('Size'); size.close()
  size.add(params.aspen.trunk.baseRadius, '1', 0.05, 0.6, 0.01).name('aspen trunk r').onFinishChange(done)
  size.add(params.pine.trunk.baseRadius, '1', 0.05, 0.8, 0.01).name('pine trunk r').onFinishChange(done)
  size.add(params.rock.blob.radius, '1', 0.2, 5, 0.05).name('rock r max').onFinishChange(done)
  size.add(params.bush.blob.radius, '1', 0.3, 3, 0.05).name('bush r max').onFinishChange(done)

  const col = f.addFolder('Colours'); col.close()
  col.addColor(params.aspen, 'canopyColor').name('aspen canopy').onFinishChange(done)
  col.addColor(params.aspen, 'barkColor').name('aspen bark').onFinishChange(done)
  col.addColor(params.pine, 'canopyColor').name('pine canopy').onFinishChange(done)
  col.addColor(params.rock, 'color').name('rock').onFinishChange(done)
  col.addColor(params.bush, 'color').name('bush').onFinishChange(done)

  // Collision (FEAT-06b) — read live at query time, so NO rebuild needed on change.
  const coll = f.addFolder('Collision'); coll.close()
  coll.add(params.collision, 'trunkRadiusScale', 0.5, 3, 0.05).name('trunk capsule ×')
  coll.add(params.collision, 'rockRadiusScale', 0.5, 2, 0.05).name('rock sphere ×')
  coll.add(params.collision.bush, 'k', 0, 200, 1).name('bush drag k')
  coll.add(params.collision.bush, 'fMax', 0, 800, 10).name('bush drag cap (N)')

  f.add({ rebuild: () => rebuild() }, 'rebuild').name('↻ Rebuild props')
  return f
}

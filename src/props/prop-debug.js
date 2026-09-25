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
 * @param {{ params: object, rebuild: () => void, getPropSystem?: () => object,
 *           onShadowModeChange?: () => void }} opts
 *   getPropSystem: live-handle accessor (survives rebuild) for the PERF-07 shadow toggle.
 *   onShadowModeChange: main.js hook that syncs prop castShadow + baked-atlas strength to the params.
 */
export function addPropGui(gui, { params, rebuild, getPropSystem, onShadowModeChange }) {
  const f = gui.addFolder('Props (FEAT-06)')
  f.close()                              // collapsed by default
  const done = () => rebuild()
  const S = params.scatter

  // PERF-07: prop shadow mode. castRealtime OFF (default) = props baked into the world shadow atlas
  // (prop-shadow-bake.js), out of the per-frame sun pass; ON = old realtime per-frame casting.
  // main.js's onShadowModeChange flips prop castShadow + the terrain atlas strength together.
  const syncMode = () => { if (onShadowModeChange) onShadowModeChange() }
  f.add(params.shadows, 'castRealtime').name('Realtime prop shadows').onChange(syncMode)
  f.add(params.shadows, 'strength', 0, 1, 0.01).name('Baked shadow strength').onChange(syncMode)
  // Atlas density (texels per 64 m chunk): 0 = off, 256 = 0.25 m/texel. Each step reallocates the
  // atlas and re-bakes every live chunk (VRAM grows with the square), so fire on RELEASE only.
  f.add(params.shadows, 'tilePx', 0, 512, 128).name('Baked shadow res (px/chunk)').onFinishChange(syncMode)
  f.add(params.shadows, 'fadeStart', 50, 600, 10).name('Baked fade start (m)').onChange(syncMode)
  f.add(params.shadows, 'fadeEnd', 100, 800, 10).name('Baked fade end (m)').onChange(syncMode)

  // PERF-21: billboard takeover ring (chunks of full-3D props around the camera). Live — the
  // system re-pools chunks over the next few frames, no rebuild. Tiers also write this.
  f.add(params.lod, 'ring3d', 0, 5, 1).name('3D prop ring (chunks)').onChange((v) => {
    const ps = getPropSystem && getPropSystem()
    if (ps) ps.setLodRing(v)
  })
  // Billboard sun-contrast scale (1 = physical) — uniforms only, updates live while you orbit a tree.
  f.add(params.lod, 'litGain', 0, 3, 0.05).name('billboard sun contrast').onChange((v) => {
    const ps = getPropSystem && getPropSystem()
    if (ps) ps.setImpostorLitGain(v)
  })
  // Sun-on gradient flatten (baked facet pattern → tile mean as the view swings sun-ward).
  f.add(params.lod, 'flatten', 0, 1, 0.05).name('billboard sun-side flatten').onChange((v) => {
    const ps = getPropSystem && getPropSystem()
    if (ps) ps.setImpostorFlatten(v)
  })

  const density = f.addFolder('Density'); density.close()
  density.add(S, 'clustersPerChunk', 0, 12, 1).name('tree clusters').onFinishChange(done)
  density.add(S.treesPerCluster, '1', 0, 24, 1).name('trees/cluster max').onFinishChange(done)
  density.add(S.rocksPerChunk, '1', 0, 60, 1).name('rocks max').onFinishChange(done)
  density.add(S.smallRocksPerChunk, '1', 0, 120, 1).name('small rocks max').onFinishChange(done)
  density.add(S.bushesPerChunk, '1', 0, 40, 1).name('bushes max').onFinishChange(done)
  density.add(S, 'boulderChance', 0, 1, 0.01).name('boulder chance').onFinishChange(done)
  density.add(S.logsPerChunk, '1', 0, 8, 1).name('logs max').onFinishChange(done)
  density.add(S, 'streamRockBoost', 0, 12, 0.5).name('bed small-rock boost').onFinishChange(done)
  density.add(S, 'streamMedRockBoost', 0, 30, 1).name('bed med-stone boost').onFinishChange(done)
  // Zone rocks (2026-09-23): rocks following the ground texture, in patches.
  if (S.zoneRocks) {
    const Z = S.zoneRocks
    const zr = density.addFolder('Zone rocks'); zr.close()
    zr.add(Z, 'attempts', 0, 3000, 50).name('attempts / chunk').onFinishChange(done)
    zr.add(Z, 'patchMin', 0, 1, 0.02).name('bare threshold').onFinishChange(done)
    zr.add(Z, 'patchFreq', 0.005, 0.2, 0.005).name('patch freq (1/m)').onFinishChange(done)
    zr.add(Z, 'onRock', 0, 1, 0.05).name('on rock').onFinishChange(done)
    zr.add(Z, 'onDirt', 0, 1, 0.05).name('on dirt').onFinishChange(done)
    zr.add(Z, 'onGrass', 0, 1, 0.05).name('on grass').onFinishChange(done)
    zr.add(Z.mix, '0', 0, 1, 0.02).name('small share').onFinishChange(done)
    zr.add(Z.mix, '1', 0, 1, 0.02).name('medium share').onFinishChange(done)
    zr.add(Z.mix, '2', 0, 1, 0.02).name('large share (collidable)').onFinishChange(done)
    if (params.medRock) zr.add(params.medRock.blob.radius, '1', 0.1, 0.6, 0.01).name('medium r max').onFinishChange(done)
  }

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
  // FEAT-48: the analytic (wheel) query reads these live, but the ENGINE prop colliders bake
  // radii at chunk sync — rebuild them so the chassis feels the new size too.
  const _resync = () => window.__propPhysics?.resyncAll()
  coll.add(params.collision, 'trunkRadiusScale', 0.5, 3, 0.05).name('trunk capsule ×').onChange(_resync)
  coll.add(params.collision, 'rockRadiusScale', 0.5, 2, 0.05).name('rock sphere ×').onChange(_resync)
  coll.add(params.collision.bush, 'k', 0, 200, 1).name('bush drag k')
  coll.add(params.collision.bush, 'fMax', 0, 800, 10).name('bush drag cap (N)')

  // FEAT-85: roadside cover. Placement dials rebuild (re-scatter); fade + wind are live uniforms.
  if (S.cover) {
    const CV = S.cover
    const cover = f.addFolder('Roadside cover (FEAT-85)'); cover.close()
    const live = () => {
      const ps = getPropSystem && getPropSystem()
      if (ps) { ps.setCoverFade(CV.fadeStart, CV.fadeEnd); ps.setCoverWind(CV.windStrength) }
    }
    cover.add(CV, 'enabled').name('enabled').onFinishChange(done)
    cover.add(CV, 'density', 0, 4, 0.1).name('density × (tier writes)').onFinishChange(done)
    cover.add(CV, 'farLod').name('far ring: cheap clumps').onFinishChange(done)
    cover.add(CV.wallBeatBack, '0', 0, 6, 0.25).name('beat-back min (m)').onFinishChange(done)
    cover.add(CV.wallBeatBack, '1', 0, 10, 0.25).name('beat-back max (m)').onFinishChange(done)
    cover.add(CV, 'wallDepth', 0.5, 6, 0.1).name('wall depth (m)').onFinishChange(done)
    cover.add(CV, 'wallRows', 0, 4, 1).name('wall rows').onFinishChange(done)
    cover.add(CV, 'wallDensity', 0, 1, 0.05).name('wall density').onFinishChange(done)
    cover.add(CV, 'wallPatchMin', 0, 1, 0.02).name('wall bare threshold').onFinishChange(done)
    cover.add(CV, 'wallPatchFreq', 0.005, 0.2, 0.005).name('wall patch freq (1/m)').onFinishChange(done)
    cover.add(CV, 'wallTallFrac', 0, 1, 0.025).name('wall tall share (rye+sage)').onFinishChange(done)
    cover.add(CV, 'sageFrac', 0, 1, 0.05).name('sage share of tall').onFinishChange(done)
    cover.add(CV, 'backAttempts', 0, 1600, 20).name('backcountry attempts').onFinishChange(done)
    cover.add(CV, 'backNoiseMin', 0, 1, 0.02).name('backcountry bare threshold').onFinishChange(done)
    cover.add(CV, 'backTallFrac', 0, 1, 0.05).name('backcountry tall share').onFinishChange(done)
    cover.add(CV, 'bankAttempts', 0, 1200, 20).name('riverbank attempts').onFinishChange(done)
    cover.add(CV, 'bankDensity', 0, 1, 0.05).name('riverbank density').onFinishChange(done)
    cover.add(CV, 'bankTallFrac', 0, 1, 0.05).name('riverbank tall share').onFinishChange(done)
    cover.add(CV, 'dirtFrac', 0, 1, 0.05).name('on-dirt density (× green)').onFinishChange(done)
    cover.add(CV, 'fadeStart', 0, 300, 5).name('fade start (m)').onChange(live)
    cover.add(CV, 'fadeEnd', 0, 400, 5).name('fade end (m)').onChange(live)
    cover.add(CV, 'windStrength', 0, 3, 0.05).name('wind').onChange(live)
    if (params.grass && params.rye && params.sage) {
      cover.addColor(params.grass, 'color').name('ricegrass base').onFinishChange(done)
      cover.addColor(params.grass, 'tipColor').name('ricegrass tip').onFinishChange(done)
      cover.addColor(params.rye, 'color').name('wild rye base').onFinishChange(done)
      cover.addColor(params.rye, 'spikeColor').name('wild rye spike').onFinishChange(done)
      cover.addColor(params.sage, 'leafColor').name('sagebrush leaf').onFinishChange(done)
    }
  }

  f.add({ rebuild: () => rebuild() }, 'rebuild').name('↻ Rebuild props')
  return f
}

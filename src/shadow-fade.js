/**
 * src/shadow-fade.js — patches to three's shadow ShaderChunks. Two of them, both installed by
 * main.js before the first render (a compiled material bakes its chunks, so they must land first):
 *   · installShadowEdgeFade     — QUAL-18: the realtime map's edge dissolves instead of cutting hard.
 *   · installNearShadowCoupling — BUG-78: the near map's shadow also gates the far cascade, so the
 *                                 truck can be left OUT of the far map without its shadow going pale.
 *
 * ── QUAL-18: smooth fade at the shadow-map edge instead of a hard cutoff ─────────────────────────
 *
 * The near directional light (`sun`) renders a tight ±20 m ortho shadow box that follows the view
 * centre (main.js; the terrain cascade `sunFar` is a second light with its own box).
 * Everything past the box edge is simply unshadowed, so driving shows a hard
 * moving line where the world's shadows end. This patches THREE.ShaderChunk so the shadow
 * INTENSITY fades to zero over the outer band of the shadow map — the cutoff becomes a
 * gradual dissolve buried under distance.
 *
 * Mechanism: every SHADOWMAP_TYPE branch of shadowmap_pars_fragment ends with the same
 *   return mix( 1.0, shadow, shadowIntensity );
 * and by that point shadowCoord.xy is in [0,1] shadow-map space (perspective divide already
 * applied; w == 1 for a directional light's ortho projection anyway). We scale
 * shadowIntensity by a Chebyshev-distance fade from the map centre, so the fade tracks the
 * square frustum exactly. replaceAll patches all three branches in one go.
 *
 * MUST run before the first render (any compiled material bakes its chunks) — main.js calls
 * it right after renderer setup. Idempotent: patching twice is a no-op.
 *
 * @param {object} [opts]
 * @param {number} [opts.fadeStart=0.72] — 0..1 fraction of the half-extent where the fade
 *   begins (0.72 ≈ the outer 28 % of the box). main.js passes 0.82: full shadows to ~16 m of
 *   the ±20 m near frustum, gone by 20 m.
 */
import * as THREE from 'three'

export function installShadowEdgeFade(opts = {}) {
    const fadeStart = opts.fadeStart ?? 0.72
    const chunk = THREE.ShaderChunk.shadowmap_pars_fragment
    if (!chunk || chunk.includes('rsShadowEdgeFade')) return   // already patched (idempotent)

    const original = 'return mix( 1.0, shadow, shadowIntensity );'
    if (!chunk.includes(original)) {
        // Three.js upgrade changed the chunk — fail LOUD in dev consoles, soft in play
        // (shadows keep working, only the fade is lost).
        console.warn('[shadow-fade] shadowmap_pars_fragment shape changed — edge fade not installed')
        return
    }
    const patched =
        'float rsShadowEdgeFade = 1.0 - smoothstep( ' + fadeStart.toFixed(4) + ', 1.0, ' +
        'max( abs( shadowCoord.x - 0.5 ), abs( shadowCoord.y - 0.5 ) ) * 2.0 );\n' +
        '\t\t\treturn mix( 1.0, shadow, shadowIntensity * rsShadowEdgeFade );'
    THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replaceAll(original, patched)
}

/**
 * BUG-78: couple the far cascade to the near map's shadow.
 *
 * main.js lights the world with two directional lights that SPLIT the key intensity (near `sun`
 * 40 %, far `sunFar` 60 % — SHADOW_FAR_SPLIT). In three a shadow only removes ITS OWN light's
 * share, so a caster had to sit in BOTH maps to throw a full-strength shadow. The truck did — and
 * the far map is only re-rendered every 64 m / on streaming (PERF: see the far-follow in loop()),
 * so its copy of the truck's shadow stayed pinned at the last re-render while the truck drove on:
 * a stale blob left behind on the road at speed until the next far pass wiped it.
 *
 * The fix takes the truck out of the far map (the far pass now renders with the vehicle hidden —
 * see renderFarShadowPass in main.js) and, here, makes the NEAR map's shadow factor multiply the
 * far light too. Net effect per receiver pixel:
 *   · truck shadow: near map says shadowed → both lights removed → full strength, from one crisp map.
 *   · terrain / POIs: in both maps as before; where the maps agree nothing changes, where the finer
 *     near map catches an edge the coarse far map missed, the near map now wins (full strength).
 *   · beyond the near box: near factor is 1 (QUAL-18 fade + out-of-frustum), far unchanged — the
 *     mountain-scale shadows keep their 60 % share exactly as authored.
 * One-directional on purpose: the far map never darkens the near light, so nothing outside ±20 m
 * changes and the look stays the one that was tuned.
 *
 * Index 0 is the near light because main.js adds `sun` before `sunFar` and three's light sort is
 * stable — the same assumption the terrain shader's `UNROLLED_LOOP_INDEX == 1` patch already leans
 * on (terrain.js). The terrain inlines this chunk at compile time, so it inherits the patch.
 */
export function installNearShadowCoupling() {
    const chunk = THREE.ShaderChunk.lights_fragment_begin
    if (!chunk || chunk.includes('rsNearShadow')) return   // already patched (idempotent)

    const decl  = 'DirectionalLightShadow directionalLightShadow;'
    const apply = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( ' +
        'directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, ' +
        'directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, ' +
        'directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;'
    if (!chunk.includes(decl) || !chunk.includes(apply)) {
        // Three.js upgrade changed the chunk — fail LOUD in dev consoles, soft in play (shadows
        // keep working; the truck's shadow would just be pale, so restore it by re-adding the
        // vehicle to the far pass in main.js until this is re-fitted).
        console.warn('[shadow-fade] lights_fragment_begin shape changed — near/far shadow coupling not installed')
        return
    }
    THREE.ShaderChunk.lights_fragment_begin = chunk
        .replace(decl, decl + '\n\tfloat rsNearShadow = 1.0;\n\tfloat rsDirShadow = 1.0;')
        .replace(apply,
            'rsDirShadow = ' + apply.slice('directLight.color *= '.length) + '\n' +
            '\t\t#if UNROLLED_LOOP_INDEX == 0\n' +
            '\t\trsNearShadow = rsDirShadow;\n' +
            '\t\t#else\n' +
            '\t\trsDirShadow *= rsNearShadow;\n' +
            '\t\t#endif\n' +
            '\t\tdirectLight.color *= rsDirShadow;')
}

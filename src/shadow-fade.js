/**
 * src/shadow-fade.js — patches to three's shadow ShaderChunks. Two of them, both installed by
 * main.js before the first render (a compiled material bakes its chunks, so they must land first):
 *   · installShadowEdgeFade     — QUAL-18: the realtime map's edge dissolves instead of cutting hard.
 *   · installNearShadowCoupling — BUG-78: the near map's shadow also gates the far cascade, so the
 *                                 truck can be left OUT of the far map without its shadow going pale.
 *
 * ── QUAL-18: smooth fade at the shadow-map edge instead of a hard cutoff ─────────────────────────
 *
 * The near directional light (`sun`) renders a tight ±40 m ortho shadow box that follows the view
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
 *   begins (0.72 ≈ the outer 28 % of the box). main.js passes 0.82: full shadows to ~33 m of
 *   the ±40 m near frustum, gone by 40 m.
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
 * BUG-78 + BUG-217: couple the two sun lights' shadows so they act as ONE shadow.
 *
 * main.js lights the world with two directional lights that SPLIT the key intensity K (near `sun`
 * n = 40 %, far `sunFar` f = 60 % — SHADOW_FAR_SPLIT). In three a shadow only removes ITS OWN light's
 * share. Per receiver pixel let s_n be the near map's verdict (0 shadow … 1 lit, already faded to 1
 * over QUAL-18's edge band and outside the box) and s_f the far map's. Direct sun then is:
 *
 *   near light · mix(1, s_n, s_f)  +  far light · s_f · s_n
 *   = K · ( n + f·s_f )                      wherever s_n = 1 (outside the near box, its fade, clipped casters)
 *   = K · s_n                                on far-lit ground (s_f = 1): the near map's crisp detail
 *   = K · n                                  on far-shadowed ground (s_f = 0), WHATEVER the near map says
 *
 * So the radiance is the same function of the far map's verdict inside and outside the near map, and
 * the near map can only add detail (the truck, props, fine terrain) on ground the far map calls lit.
 *
 * BUG-78 (the far term's × s_n): the truck is kept OUT of the far map (it is re-rendered only every
 * 64 m, so its copy of the truck's shadow stayed pinned on the road — see the wrapped shadow pass in
 * main.js). The near map alone throws the truck's shadow, at full strength because s_n gates both lights.
 *
 * BUG-217 (the near term's mix): BUG-78 first shipped as `near · s_n + far · s_f · s_n`. On ground
 * the far map shades, that is K·n outside the near map but 0 inside it wherever the near map ALSO sees
 * the caster: a patch 35 % darker that travelled with the truck. And the near map sees a hill only
 * partly — its shadow camera sits 200 m up-sun of the truck, so casters further than that are behind
 * its near plane, and the ±40 m box ends — so the patch's edge slid as the truck moved (owner,
 * 2026-11-18: an edge ~20 m ahead and behind; a hill-shadow edge moving with the truck under a frozen
 * sun). Far-shadowed ground now ignores the near verdict, so neither edge exists.
 *
 * Cost: the far map is sampled in the near light's iteration and reused in the far light's — the same
 * two lookups as before, a mix and a multiply more.
 *
 * Index 0 is the near light because main.js adds `sun` before `sunFar` and three's light sort is
 * stable — the same assumption the terrain shader's `UNROLLED_LOOP_INDEX == 1` patch already leans
 * on (terrain.js). The terrain inlines this chunk at compile time, so it inherits the patch. With a
 * single shadowed light (NUM_DIR_LIGHT_SHADOWS 1) s_f stays 1 and this is three's stock shadow.
 */
export function installNearShadowCoupling() {
    const chunk = THREE.ShaderChunk.lights_fragment_begin
    if (!chunk || chunk.includes('rsNearShadow')) return   // already patched (idempotent)

    const decl  = 'DirectionalLightShadow directionalLightShadow;'
    const shadowOf = (k) => 'getShadow( directionalShadowMap[ ' + k + ' ], directionalLightShadows[ ' + k + ' ].shadowMapSize, ' +
        'directionalLightShadows[ ' + k + ' ].shadowIntensity, directionalLightShadows[ ' + k + ' ].shadowBias, ' +
        'directionalLightShadows[ ' + k + ' ].shadowRadius, vDirectionalShadowCoord[ ' + k + ' ] )'
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
        .replace(decl, decl + '\n\tfloat rsNearShadow = 1.0;\n\tfloat rsFarShadow = 1.0;')
        .replace(apply,
            '#if UNROLLED_LOOP_INDEX == 0\n' +
            '\t\trsNearShadow = receiveShadow ? ' + shadowOf(0) + ' : 1.0;\n' +
            '\t\t#if NUM_DIR_LIGHT_SHADOWS > 1\n' +
            '\t\trsFarShadow = receiveShadow ? ' + shadowOf(1) + ' : 1.0;\n' +
            '\t\t#endif\n' +
            '\t\tdirectLight.color *= mix( 1.0, rsNearShadow, rsFarShadow );\n' +
            '\t\t#elif UNROLLED_LOOP_INDEX == 1\n' +
            '\t\tdirectLight.color *= rsFarShadow * rsNearShadow;\n' +
            '\t\t#else\n\t\t' + apply + '\n' +
            '\t\t#endif')
}

/**
 * src/shadow-fade.js — QUAL-18: smooth fade at the shadow-map edge instead of a hard cutoff.
 *
 * The single directional sun renders a ±220 m ortho shadow box that follows the view centre
 * (main.js). Everything past the box edge is simply unshadowed, so driving shows a hard
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
 *   begins (0.72 ≈ the outer 28 % of the box, ~60 m of the ±220 m frustum).
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

/**
 * FEAT-05 — shared procedural surface-detail GLSL for the terrain and road-shoulder materials.
 *
 * No texture/image assets (single-origin constraint, D-01): a cheap hash-based value-noise + a
 * 2-octave fbm, evaluated in WORLD space so detail is seam-free across streamed chunks and
 * deterministic (a pure function of world XZ). Injected into the stock MeshPhongMaterial via
 * `onBeforeCompile` so Phong lighting + fog + shadows are preserved.
 *
 * Both consumers (terrain mottle+bump in terrain.js; road-shoulder gravel bump in road-mesh.js)
 * share NOISE_GLSL + the world-space varyings via addWorldVaryings(), then write their own small
 * colour/normal hook. Keep this lightweight: it runs per-fragment on the exact weak-GPU box PERF-05
 * targets — 2 octaves, XZ projection only (mild vertical stretch on cliffs is accepted), and every
 * consumer gates its work behind `uDetailScale > 0.0` so the master scale = 0 is a true kill-switch.
 */

// Hash → value-noise → 2-octave fbm. `td` prefix avoids collisions with three's own shader chunks.
export const NOISE_GLSL = /* glsl */`
float tdHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float tdVNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = tdHash(i), b = tdHash(i + vec2(1.0, 0.0));
  float c = tdHash(i + vec2(0.0, 1.0)), d = tdHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float tdFbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 2; i++) { s += a * tdVNoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
`

/**
 * Add `vWorldPos` (world-space position) and `vWorldNrm` (world-space normal) varyings to a
 * material's shaders, and make NOISE_GLSL + the varyings available in the fragment shader.
 * Call once inside the material's `onBeforeCompile(shader)`.
 *
 * Note: `mat3(modelMatrix)` for the normal is correct because terrain chunk meshes and road
 * meshes carry no rotation/scale (translation only). World→view for the bump is done in the
 * fragment via `mat3(viewMatrix)` (viewMatrix is in three's fragment prefix).
 */
export function addWorldVaryings(shader) {
  shader.vertexShader = 'varying vec3 vWorldPos;\nvarying vec3 vWorldNrm;\n' + shader.vertexShader
  shader.vertexShader = shader.vertexShader.replace(
    '#include <beginnormal_vertex>',
    '#include <beginnormal_vertex>\n  vWorldNrm = normalize(mat3(modelMatrix) * objectNormal);'
  )
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    '  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>'
  )
  shader.fragmentShader =
    'varying vec3 vWorldPos;\nvarying vec3 vWorldNrm;\n' + NOISE_GLSL + shader.fragmentShader
}

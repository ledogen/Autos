---
id: QUAL-18
type: quality
status: completed
closed: 2026-07-14
resolution: "USER-VERIFIED good in-game 2026-07-14. Re-landed solo (recovered src/shadow-fade.js from cc28322) after the 2026-07-08 bundled-revert; verified independently of the PERF-07 blob bake this time. The shadowmap_pars_fragment Chebyshev smoothstep dissolve replaces the hard moving shadow-box edge. Shipped in a52c62e (shadow-map edge fade). Closing accepted."
opened: 2026-07-07
reopened: 2026-07-08
severity: minor
source: user-request
note-reopen: "Shipped bundled with the PERF-07 blob bake in cc28322; morning verify came back
'shadows are totally busted there's just a half-artifact present' — can't attribute between the
blob bake and this fade, so BOTH were reverted to restore the known-good look (revert commit,
2026-07-08). src/shadow-fade.js was deleted with the revert — recover it from git history
(cc28322) when re-landing. Re-land SOLO with its own visual verify — the screenshot harness
works again (BUG-34 closed same-day: tool defect, camera was under the terrain)."
first-pass: "src/shadow-fade.js patched THREE.ShaderChunk.shadowmap_pars_fragment: shadow
  intensity fades to zero over the outer band (fadeStart 0.72) of the shadow box via a
  Chebyshev-distance smoothstep in shadow-map space — the hard moving 'shadows end here' line
  becomes a distance dissolve. All SHADOWMAP_TYPE branches patched in one replaceAll; idempotent;
  fails soft (console warning, unfaded shadows) if a three.js upgrade changes the chunk shape.
  Installed in main.js before the first render."
---

# QUAL-18: Shadow LOD — fade the shadow-map edge instead of a hard cutoff

## Context

The single directional sun renders a ±220 m ortho shadow box following the view centre
(main.js); everything beyond simply has no shadows, drawing a hard moving line across the
world. User request (2026-07-07): "add shadow lod instead of a hard cutoff (a visual effect
like dotting or blur works nicely too)".

## Resolution

Shader-chunk patch (see frontmatter). A smooth intensity dissolve was chosen over dither
("dotting") — it needs no extra texture taps and reads as atmospheric distance falloff.

## Related

- PERF-07 (prop shadow-pass cost measurement) — same night's work, independent mechanism.
- BUG-29 texel-snap (shipped) — unaffected; the fade multiplies intensity after sampling.

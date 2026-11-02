---
id: ASSET-77
type: asset
status: open
severity: minor
opened: 2026-11-02
source: owner, 2026-11-01 (FEAT-65 brainstorm) — "some sort of propaganda sign"; the camp's demolition line
        is the turn-back signs (owner picked it over a mundane hazard)
relates: FEAT-65 (demolition — the camp's own line, data/offers.js REQUISITION reqSigns), FEAT-157 (the
         requisition's fifth line), ASSET-31 (the road signs — the knockable-post convention)
---
lane: A

# ASSET-77: The turn-back sign — a hand-painted board on two stakes

**Demolition target** (FEAT-65's role: a prop that stands on the shoulder, static until the truck hits
it, then a loose debris body). The camp's line: boards keep appearing overnight on the roads near the
wall — **TURN BACK**, **NOTHING PAST THE RIDGE**, **IT WAS BETTER BEFORE**, **STAY** — and nobody admits
putting them up. Hand-made, not municipal: someone did these at a kitchen table. Until this ships the
line's site is crates and drums alone (`reqSigns` targets).

- **Form:** a plywood board (~0.9 × 0.6 m, ragged edge, one corner split) on two 2×2 stakes driven at a
  slight lean, ~1.3 m to the top. Paint brushed on, uneven. Read ART-STYLE.md: flat colours, faceted,
  detail as geometry; the words are the one image, an atlas like the gas station's signage (one material
  per wording, or one atlas with the four words as UV islands — `spawnModel(key, { variant })`).
- **Variants:** the four wordings above (placeholders — the owner writes the words).
- **Budget:** ~300–600 tris, one small atlas. Real size as above; origin at the base centre between
  the stakes, face −Z (it faces oncoming traffic: data/offers.js `face: 'traffic'`).
- **Collision / mass:** a debris body (src/demolition.js TARGET_TYPES row, hull from the GLB), ~6 kg —
  light, knockable; the board is the face, the stakes the footing.
- **Wiring once it ships:** a `turnBackSign` row in src/demolition.js TARGET_TYPES and in
  data/prop-models.js, and `reqSigns.targets` gains a `{ kinds: ['turnBackSign'], …, side: 'right',
  face: 'traffic' }` group. The stained-drum variant (FEAT-65: "drums of something that stains the
  ground black") is a separate small ask, a material variant of drumClosed.

## Acceptance

- [ ] `assets/models/turn-back-sign.glb` (+ build.py + .blend) per ASSETS.md, the four wordings.
- [ ] dist-assets green; a line taken at the camp shows the boards on its site (cdp-smoke demolition step).

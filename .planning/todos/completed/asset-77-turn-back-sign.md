---
id: ASSET-77
type: asset
status: completed
severity: minor
opened: 2026-11-02
closed: 2026-11-06
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

- [x] `assets/models/turn-back-sign.glb` (+ build.py + .blend) per ASSETS.md, the four wordings.
- [x] dist-assets green; a line taken at the camp shows the boards on its site (cdp-smoke demolition step).

## Progress

**2026-11-05 (Lane C, cargame-a1) — built in `wip/turn-back-sign/`, awaiting the owner's look.**
Generator `wip/turn-back-sign/turn-back-sign.py` (git-excluded until promotion), headless:
`/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python wip/turn-back-sign/turn-back-sign.py -- export preview`.

- 12 mm ply 0.90 × 0.60 m, hand-sawn (every edge wanders ±3.5 mm, the top 1.3 cm out of square), the
  reader's top-right corner split along a jagged crack and bent back 14°. Screwed (four round heads)
  to two 38 mm 2×2 stakes, tops mushroomed by the sledge, 1.30 m tall, board 0.62–1.22 m. The lean is
  a SHEAR (4° back from traffic, 2.5° sideways), so both stake feet stay exactly on z = 0.
- **Packaging: one .glb per wording**, the road-sign / mailbox rule (`turn-back-sign.glb`, `-ridge`,
  `-before`, `-stay`). The ticket's `spawnModel(key, { variant })` cannot do it: a palette variant only
  recolours (`model-service.js buildPalette`), it cannot swap lettering.
- The face is one baked 576 × 384 image per wording (general-store.py's ortho-emitter rig): bare ply
  with grain, house paint brushed short of the sawn edges in uneven passes, the words lettered letter
  by letter in Chalkduster with jitter (±5° tilt, baseline and size), squeezed toward each line's
  end, a few drips. Words and paints are placeholders in `WORDINGS`: the owner writes them.
- **360 tris** (budget 600; under the ~1000 floor because the silhouette genuinely is a board on two
  posts), **4 materials** (SignFace textured, SignPly, SignStake, SignScrew), **1 image**. Facing 0
  inverted of ~2060 rays. 80–139 kB per .glb.
- Nothing in the file is ground dressing: the whole sign becomes ONE debris body when hit, so a dirt
  collar would fly off with it. Mass for the TARGET_TYPES row: ply ~3.9 kg + stakes ~1.9 kg ≈ 6 kg.
- Next: the owner's look (EEVEE renders wait for a free machine), then promote + wire
  (PROP_MODELS × 4, TARGET_TYPES × 4, `reqSigns.targets` group with all four kinds).

**2026-11-06 (Lane C, cargame-a1) — owner: "promote", with the words; promoted and wired (41e883a7).**
The owner (overnight, through the orchestrator) approved the board and wrote the four words: "keep out",
"turn back", "beware", "no entry". Lettered in capitals, freehand as before. Paint and ink are our call:
KEEP OUT black on bare ply, TURN BACK red on white, BEWARE white on red (one line), NO ENTRY black on
blue-grey.

- Shipped: `assets/models/turn-back-sign.glb` (TURN BACK), `-keep-out`, `-beware`, `-no-entry`, each
  360 tris, 4 materials, 1 image, 0 inverted of ~2055 rays, bbox 0.93 × 1.30 × 0.13 m. Generator + .blend
  in `assets/models/src/` (paths from `__file__`; preview and EEVEE review renders go to the
  git-invisible `wip/turn-back-sign/out/`). Headless:
  `/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python assets/models/src/turn-back-sign.py -- export render`.
- Wiring: `PROP_MODELS.turnBackSign / turnBackSignKeepOut / turnBackSignBeware / turnBackSignNoEntry`
  (one shared box, the whole sign: it only spaces targets on the shoulder); four `TARGET_TYPES` rows at
  6 kg (`BOARD`, friction 0.6, restitution 0.1; the hull is the whole .glb); `reqSigns.targets` gains
  `{ kinds: [all four], n: [4, 6], cluster: [1, 1], side: 'right', face: 'traffic' }`, the old sign
  line's shape. The crates of flyers and the drums stay on the site beside the boards. Dropping them is
  the owner's call.
- Gates: `CDP_SMOKE=1 node test/run-all.mjs --changed=<branch diff>` → **33/33 green** on a quiet machine
  (load ~3), cdp-smoke included (404 s): demolition-site, offer-board, offer-census, expedition-camp,
  dist-assets, model-palette, model-variant, debris-stack, world-determinism, story-poi, region-pieces …
  The smoke's demolition step seats the truck by `site[0]`, which is now a board (targets come out group by
  group, boards first): the boards hull and sleep standing, and a kicked one counts smashed.
  **Ready to close at landing.**

## Resolution (2026-11-06) — SHIPPED, on main 196bc38d

Four boards with the owner's words: `assets/models/turn-back-sign.glb` (TURN BACK), `-keep-out`, `-beware`,
`-no-entry`, each **360 tris**, 4 materials (`SignFace`, `SignPly`, `SignStake`, `SignScrew`), one baked
face image. Sources: `assets/models/src/turn-back-sign.py` + `.blend`. Wired into the camp's demolition
line: `PROP_MODELS.turnBackSign*` ×4, `TARGET_TYPES` ×4 (6 kg), `reqSigns.targets` boards group. Gates
33/33 incl. cdp-smoke (the landing smoke, same code). Left open as the owner's call (owed list
`asset77-standins`): whether the stand-in crates of flyers and drums stay on the site beside the boards.

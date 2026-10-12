---
id: BUG-84
type: bug
status: fixed
severity: minor
opened: 2026-09-25
closed: 2026-09-25
source: owner report (2026-09-25) — Ultra + full-speed free-cam: tree shadows appear on freshly streamed
  terrain BEFORE its props exist, then clear as the props generate, then re-bake.
relates: PERF-07 (baked prop-shadow atlas), PERF-21, PERF-33 (found on feature/stutter)
---

# BUG-84: new chunks showed a departed chunk's baked shadows

> **Renumbered 2026-10-12:** was BUG-73, a duplicate id. Older docs citing BUG-73 for this ticket mean BUG-84.

## Cause

The PERF-07 shadow atlas is toroidal: chunk (cx,cz) → tile (cx mod 12, cz mod 12), so a tile is shared
by every chunk 12 apart (768 m). Tiles were only ever overwritten by a BAKE, never cleared when their
chunk left. A chunk streaming into a slot therefore sampled the previous owner's shadows until its own
scatter committed and baked over them — shadows on bare ground, a blink, then the real ones. Fast
free-cam at Ultra (props slowest to catch up) made the window widest.

## Fix (prop-shadow-bake.js)

- Each tile records its owner chunk (`_owner`, set at bake; nulled by clear/setTilePx).
- `syncCenter(ccx, ccz)`, called every frame from main.js (early-outs unless the stream centre changed
  chunk), scissor-CLEARS every tile whose owner is not the chunk that tile maps to inside the 12×12
  window around the player — before the new terrain even arrives.
- Bakes queued for a chunk that has since left the window are dropped (they would stamp shadows into a
  slot the terrain now samples for a different chunk).

## Verification

CDP atlas audit during 33 s of 120 m/s Ultra free-cam, sampled every ~2.5 s: 0 tiles with a wrong
owner, 0 "empty" tiles with any shadow pixels (`readRenderTargetPixels`). Affected gates green;
`hitch-report --scenario=stream --cpu=4` unchanged (0.56 % over 24 ms).

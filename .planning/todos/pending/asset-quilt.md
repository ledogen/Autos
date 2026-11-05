---
id: ASSET-81
type: asset
status: open
severity: minor
opened: 2026-11-05
source: owner, 2026-11-05 — "blanket (blanket, quilt)… blanket < quilt"
relates: FEAT-171 (the blanket layer), ASSET-79 (the blanket it outranks)
---
lane: A

# ASSET-81: Quilt

**Camp gear** — the top tier of FEAT-171's blanket layer (+10% recovery). It drapes over the bedding the same
way the blanket does (ASSET-79), so it shares the blanket's anchor and drape convention. It must read as a
warmer, heavier, patterned piece. The pattern is carried as geometry or flat-colour faces, never a texture
(ART-STYLE.md).

| Field | Value |
|---|---|
| Tri budget | ~1000–1400 (the floor is ~1000) |
| Size | double-bed width, folded over a single bedroll/bag; a few cm thick |
| Origin / forward | the blanket's (ASSET-79) |
| Collision | none (camp render only) |

## Acceptance

- [ ] `assets/models/quilt.glb` + generator in `assets/models/src/`, per ASSETS.md / ART-STYLE.md.
- [ ] Drapes over the bedroll and the sleeping bag with nothing floating (FEAT-171's sheet).
- [ ] Thumbnail in assets/items/; the owner's look.

---
id: FEAT-86
type: feature
status: open
severity: minor
opened: 2026-09-22
source: owner, 2026-09-22, during the FEAT-84 texture review ("I'd like to add lichen to boulders and stones in the future potentially")
relates: FEAT-84 (surface textures — the same procedural-texture machinery), FEAT-06 (the rock/boulder props this decorates), ART-STYLE.md rule 1 (texture only when generated; lichen is a colour patch, so it may also be a vertex-colour pass)
---

# FEAT-86: Lichen on boulders and stones

## Request

Eastern Sierra granite carries lichen — chartreuse, orange and grey-green crusts on the sun-facing
and rain-facing sides of boulders, rarely on the ground. A small touch that makes a boulder read as
a boulder rather than a grey blob. Speculative; the owner said "in the future potentially".

## Shape (not yet designed)

Two candidate routes, pick at implementation time:

- **Vertex-colour pass on the prop palette** — the boulder/rock blobs are non-indexed flat-shaded
  geometry with baked vertex colours; a per-face patch keyed by face normal (up-facing / one
  compass side) and a seeded noise could tint faces lichen-coloured at bake time. Zero runtime
  cost, no texture, honours ART-STYLE rule 1 outright. Only reads at boulder scale (faces ~0.5 m).
- **Procedural patch texture** (FEAT-84 machinery) applied triplanar on the boulder material, with
  a normal-direction mask. Finer patches, but a second material for scatter-density props is a
  draw-call cost (ART-STYLE rule 6) and boulders are the only category big enough to justify it.

## Acceptance (to be sharpened at milestone entry)

- Boulders (and optionally the large `rock` blobs) show lichen patches on some faces, seeded
  deterministically, palette drawn from the nature set (desaturated, one accent).
- No new image assets; no per-frame cost measurable on the Normal tier.
- Small rocks / scree untouched.

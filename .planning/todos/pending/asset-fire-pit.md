---
id: ASSET-08
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-06, FEAT-46, SM-1
---

# ASSET-08: Fire pit

**Lawn furniture** — a satellite prop, not a destination. It is placed *with* a POI model
(ASSET-09..20) inside a zone, so it inherits that POI's provenance: an awning and a fire pit beside a
log cabin read as *that cabin's*. Lawn furniture should not spawn on bare ground with nothing to
belong to; without an anchor it reads as litter, not habitation.

## Request

A ring of stones around a bed of ash with a few charred logs — unlit. The camp-dressing anchor
alongside the barbecue grill (ASSET-04): a fire pit on a pad is the single clearest sign that this
is a place people sleep, which is exactly the read SM-1 camping wants.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤450** (stones ~300 — reuse 3 stone shapes rotated/scaled, do not model 12) |
| Texture | none preferred — grey stone + dark ash + charred-wood material slots |
| Real size | 1.0 m outer diameter × 0.25 m tall |
| Origin | base-seated and centred: ground plane at y=0, ring centre at x=z=0 |
| Forward | n/a (rotationally symmetric; free to yaw-randomise on placement) |
| Collision | `{ shape: 'cylinder', radius: 0.50, height: 0.25 }` — a low ring, drivable-over at speed |

The ash bed should sit slightly *below* y=0 so the pit reads as dug in when placed on uneven ground
rather than floating on a lip.

## Acceptance

- `assets/models/fire-pit.glb` exists, export-clean under ASSETS.md settings.
- Sources committed: `assets/models/src/fire-pit.blend` + `fire-pit.py`.
- Reads correctly when placed on a graded lay-by pad (not just flat ground) — the sunken ash bed is
  the reason for that criterion.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Ships unlit.** A lit state — flame particles + a point light + warm ground bounce — is a
  gameplay/VFX ticket citing this asset, and it will want to interact with the day/night lighting
  pass. Model an unlit pit that a light can be attached to at placement; do not bake glow in.
- Yaw-randomising placement is what keeps a repeated ring from reading as repeated.

> **FLAG (2026-08-22, raised when ASSET-24 closed): this ticket's read is now contested.**
> ASSET-24's Notes made the stone ring *this* asset's entire identity — a stone-ringed pit says
> **someone lives here**, a bare laid fire says **I slept here**, and "the difference between those
> two is the entire point of both". ASSET-24 first shipped with no stones for exactly that reason,
> then the owner's 2026-08-21/22 calls put an 11-stone ring on it and re-framed it as a *found* ring
> the player is re-using. `campfire.glb` is now 0.708 m across with a tight, gapless, half-buried
> ring of icosahedral stones.
>
> **So the ring can no longer carry the distinction, and this asset needs another one** — a built
> kerb, a taller second course, a genuinely dug pit, a larger diameter, dressed rather than found
> stone. The 1.0 m spec above already helps; it is probably not enough on its own at 20 m through
> fog, where only the silhouette survives. Decide this before modelling, not after.
>
> Free win if it helps: `assets/models/src/campfire.py` already has a parametric stone-ring
> generator (`make_stone`, plus the sizing rule that guarantees no gaps). Reuse it and spend the
> difference on whatever makes this one read as *built*.

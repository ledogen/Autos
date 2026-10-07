---
id: ASSET-28
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-10-07
blocked-by: FEAT-59
relates: FEAT-46, FEAT-36, ASSET-27, ASSET-68
---

# ASSET-28: Crate

**Cargo** — visible load, not scenery. It rides in the bed as **real mass that shifts CoG and
handling** (`items.md` rule 2: *a load, never a stat*), and doubles as set dressing around working
POIs. Per `items.md` §4, cargo is *"mostly a mass value and a fragility flag"* — adding one is a
content act, not a design act.

## Request

A wooden slatted shipping crate with a stencilled mark and a strap around it. The generic container:
it is **grandma's vase** and it is **the eggs** and it is a box of parts in a barn, without ever
being modelled three times. `items.md` §4 gives both fragile cargoes the same axis — **restraint**,
scored on vertical shock — so one crate that reads as *breakable* serves the whole fragile type.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤350** |
| Texture | one albedo, **512×512** — sawn slats, stencil, strap webbing; **include a FRAGILE stencil** |
| Real size | 0.60 m × 0.45 m × 0.45 m |
| Origin | base-seated and centred: base at y=0 |
| Forward | −Z (stencilled face faces −Z) |
| Collision | `{ shape: 'box', dims: [0.60, 0.45, 0.45], mass_kg: 18 }` |

Slat gaps are geometry on the visible faces — the gapped silhouette is what stops it reading as a
plain cube — and texture everywhere else.

## Acceptance

- `assets/models/crate.glb` exists, export-clean under `.planning/research/ASSETS.md` settings.
- Sources committed: `assets/models/src/crate.blend` + `crate.py`.
- **Stacks on itself and sits square on ASSET-27's pallet** — a pallet fits exactly 2 × 2 of these
  with margin; verify, since that pairing is most of the point.
- Reads as *fragile* rather than as a box — the stencil and strap are doing that work.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- `mass_kg: 18` is **inert today** (FEAT-36 / FEAT-48), same rule as ASSET-03.
- **2026-10-06 (owner):** this crate is the fragile catch-all for FEAT-97's first slice, beside the
  pelican case (ASSET-39). The named fragile items do get their own models later (ASSET-40..45),
  which supersedes "never a new mesh" below for those items. The texture row in the Spec predates
  ART-STYLE's flat-colour rule; follow ART-STYLE.
- **One crate, many cargoes.** Vase, eggs, errand goods and barn finds all render as this. If a
  cargo ever needs to be visually distinct, vary the **stencil via UV offset into a shared strip** —
  the same trick as ASSET-22's house numbers — never a new mesh. `items.md` is explicit that a dozen
  cargo assets are cheap but a fifth scoring axis is not; keep new cargo on the content side of that
  line.
- The fragile-cargo *signal* already exists and is not this ticket's: `missions.md` §3b scores
  vertical shock off the same bump-stop / suspension-velocity plumbing the wear model reads
  (`items.md` §3a — *one plumbing, two consumers*).

## Resolution (2026-10-07)

Shipped as a kit from one generator, `assets/models/src/crate.py` + `crate.blend`:
`small-crate.glb` (plain) and `small-crate-fragile.glb` — this ticket — plus the large pair under
ASSET-68. Registered as `smallCrate` / `smallCrateFragile` in `data/prop-models.js`.

- **0.58 × 0.45 × 0.45 m, not 0.60** — 2 × 0.60 is exactly the pallet's 1.20, which fails this
  ticket's own "2 × 2 with margin". On the 1.20 × 1.00 pallet four take 1.16 × 0.90. Collision dims
  are `[0.58, 0.45, 0.45]`.
- 240 / 350 tris, one material `CrateWood`, per-board vertex-colour tints (ART-STYLE rule 1).
  Slats, gaps, proud corner battens and a three-board lid are geometry; a dark inner box is what the
  gaps show.
- **Fragile is a variant, not the only crate (owner 2026-10-07):** the plain one has no image and no
  UVs; the fragile one adds one 512×512 image carrying only the FRAGILE / HANDLE WITH CARE stencil
  (lettering exception), unlettered faces sample a wood swatch of it — still one draw call.
- **No strap (owner 2026-10-07)** — the request's strap was built, then removed.
- The generator asserts flush stacking and pallet fit, and casts 400 rays for winding — clean.
- The "one crate, many cargoes via UV offset into a shared stencil strip" idea above is not built;
  the plain/fragile split is the only variation so far.


---
id: ASSET-28
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, FEAT-36, ASSET-27
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
- **One crate, many cargoes.** Vase, eggs, errand goods and barn finds all render as this. If a
  cargo ever needs to be visually distinct, vary the **stencil via UV offset into a shared strip** —
  the same trick as ASSET-22's house numbers — never a new mesh. `items.md` is explicit that a dozen
  cargo assets are cheap but a fifth scoring axis is not; keep new cargo on the content side of that
  line.
- The fragile-cargo *signal* already exists and is not this ticket's: `missions.md` §3b scores
  vertical shock off the same bump-stop / suspension-velocity plumbing the wear model reads
  (`items.md` §3a — *one plumbing, two consumers*).

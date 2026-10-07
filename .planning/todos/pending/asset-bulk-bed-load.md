---
id: ASSET-51
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), cargo.md (master cargo list)
---

# ASSET-51: Bulk bed load — mulch / topsoil

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

A heap of loose material filling the bed floor, shaped to the bed walls and the wheel tubs, rounded on top. **One mesh, two variants** by recolour and heap height: **mulch** (red-brown, heaped high, light) and **topsoil** (dark brown, shallow, heavy). Topsoil is **a mild overload, on purpose** (owner, 2026-10-06). It sits over the Ranger's ~550 kg payload, and suspension and tyre upgrades are what carry it. The mass is tuned by feel, so **make the heap height a parameter in the build script**. Then the mesh can follow the tuned mass without being remodelled. Topsoil is about 1.3 t/m³, so on ~2.2 m² of floor every 0.1 m of depth is about 290 kg.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤400** |
| Materials | flat colours per ART-STYLE.md, faceted; heap colour a recolour hook |
| Real size | the bed floor (≈ 1.8 × 1.4 m); heap ~0.2–0.25 m (topsoil, follows the tuned mass) to 0.5 m (mulch) above the floor |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it; it is shaped to it, including the wheel tubs |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box (the heap's bounds) · `mass_kg: mulch 150–250, topsoil 500–700 (tuned by feel)` |

## Acceptance

- `assets/models/bulk-bed-load.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.

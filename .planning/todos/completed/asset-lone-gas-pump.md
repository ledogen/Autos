---
id: ASSET-14
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-08-22
closed: 2026-08-22
blocked-by: FEAT-59
relates: FEAT-46, FEAT-50, ASSET-13
---

# ASSET-14: Lone gas pump

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A single weathered pump on a small concrete pad, standing alone at the roadside — no canopy, no
store, maybe a hand-lettered sign. The rural counterpart to the full station: it says *this is the
last fuel for a while* far more effectively than a building does, and it is the cheapest POI in the
set to place anywhere.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤600** |
| Texture | one albedo, **512×512** — dial face, faded livery, rust streaks, price digits |
| Real size | 0.6 m × 1.1 m pad footprint, 1.9 m tall |
| Origin | base-seated: concrete pad at y=0 |
| Forward | −Z (dial face and nozzle face −Z) |
| Collision | `{ shape: 'box', dims: [0.6, 1.9, 1.1] }` — solid, not knockable |

Hose and nozzle as a simple hanging tube, ≤60 tris. Dial face is texture; do not model digits.

## Acceptance

- `assets/models/gas-pump.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/gas-pump.blend` + `gas-pump.py`.
- Texture ≤2K, dimensions divisible by 4; no Draco, no KTX2.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **This is the detailed pump; ASSET-13's are the simplified ones.** Deliberate duplication — the
  standalone is approached closely and alone, the station's four are seen together at a glance.
  Sharing one mesh would either overspend under the canopy or underdeliver at the roadside. If they
  ever converge, converge on this one.
- Refuelling *gameplay* is FEAT-50, not this ticket.
- Smallest POI in the class — it can sit on ground a building could not, which is most of its value.

---

## Resolution — 2026-08-22

Shipped as `assets/models/gas-pump.glb`, **520 tris**, 5 materials, one 512×192 texture.
Sources: `assets/models/src/gas-pump.{blend,py}`. Registered as `gasPump` in `data/prop-models.js`,
tagged `missionGiver`, so it loads and places through FEAT-59 with no code change.

### The owner reshaped it, and that moved four numbers in the Spec table

The brief on the day was: *a vertical pole that says GAS, and at its base two pumps that face
opposite sides; handle visible on the side; simple box-style pumps, nothing flashy or retro.*
So this is an **island**, not a lone pump — and the shipped asset knowingly departs from the
table above on four rows. The table is left as written; this section is what was actually built.

| Field | Spec said | Shipped | Why |
|---|---|---|---|
| Tri budget | ≤600 | **520** | Still inside, but it now buys two pumps, a 4.55 m pole, a sign and a floodlight. |
| Texture | 512×512, dial + livery + rust + digits | **512×192, the word GAS and nothing else** | ART-STYLE rule 1 buys a texture for information geometry cannot carry. Livery and rust are *wear*, the named anti-pattern; digits are one grey smudge past 15 m. The word on a 4 m sign is the whole point of the asset. Same grounds as `news-roll` and `produce-stall`; this is the third instance, not a new exception. |
| Real size | 0.6 × 1.1 m, 1.9 m tall | **2.30 × 1.24 m, 4.55 m tall** | The pole is the asset. Everything below it is detail the player only gets once they have already arrived. |
| Collision | `[0.6, 1.9, 1.1]` | `{ shape: 'box', size: [2.30, 1.45, 1.24] }` | Island and pumps up to the crown. **The pole above 1.45 m is deliberately not collided** — a 4.55 m box would be an invisible wall to anything tall, and clipping a mirror on a sign post is not a crash. Note the registry field is `size`, not the ticket's `dims`. |

Forward (−Z) is unchanged and is what the first pump's dial, holster and hose face. Base-seated at
y = 0, unchanged. `yawOffset: 0` is deliberate — the pad yaw already points model −Z at the road,
which lays the island's 2.30 m length *along* the road and turns one pump to face it, exactly how a
car pulls in alongside.

### Composition

Five materials, five draw calls. `PumpConcrete` slab · `PumpBody` cream cabinets, pole, arm, sign
bezel · `PumpSkirt` faded-red lower panels · `PumpTrim` every dark part (plinth, dial bezel,
holsters, nozzles, hoses — merged, same colour and same role) · `PumpSign` the baked artwork.
Value structure bottom to top: near-black plinth, red skirts, cream cabinets, white pole, white sign
with black letters at 4 m.

The two pumps are one part list and its mirror through y = 0, separated by a 30 mm gap so they read
as two. The **squeeze handle** the owner asked for by name is real geometry, not implied by the
hose. The **floodlight** part-way up the pole is in the reference photo and earns its 24 tris:
without it the pole is 3 m of blank white through the middle of the silhouette.

The GAS artwork is **generated by `gas-pump.py`**, not hand-painted — an orthographic render of flat
emitters laid out in sign metres, packed into the `.blend`. Re-running the generator reproduces the
texture along with the mesh, so the sign's proportions and its pixels cannot drift apart.

### Audit (all clean at hand-over)

- Overlapping coplanar faces within 1 mm: **0**. Two were found and fixed — the skirt now runs
  20 mm past the cabinet underside instead of ending flush with it.
- Non-manifold edges / loose verts: **0**. The sign faces started as single open quads and were
  closed into thin plates (+20 tris) rather than shipped as boundaries.
- Exports single-sided (`campfire`/`gnome` convention), no Draco, no KTX2, one embedded PNG,
  metalness 0 throughout, 130 KB.
- **Sign handedness verified rendered from both sides.** It shipped as `SAG` on the +Y face at
  first: a bmesh face has a zero normal until `normal_update()` runs, so the `face.normal.y > 0`
  test silently returned false on both plates. The side is now read off the vertex, and the trap is
  commented in the generator.

### Open items

- **`missionGiver` is a judgement call, reversible in one line.** It is the only pool in the
  registry, and adding to a pool is allowed to reshuffle which POI wears what. If a gas stop should
  not hand out work until FEAT-50 refuelling exists, drop the `tags` line.
- **`PumpSkirt` is the recolourable material** if this ever wants a curated pool (2026-08-21 palette
  ruling). None is declared: nothing passes a `variant` yet, and an unused palette is only gate
  surface. The pole and sign stay white in every case — that is what reads as "gas".
- **ASSET-13 (full gas station) should now converge on this pump**, per the Notes above. Its four
  pumps under the canopy can reuse `pump_parts()` at a coarser setting; the island, pole and sign
  are this ticket's alone.

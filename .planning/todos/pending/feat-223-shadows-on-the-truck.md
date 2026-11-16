---
id: FEAT-223
type: feature
status: open
severity: minor
opened: 2026-11-15
source: owner, 2026-11-15 — "more visual juice: i think we want shadows on the truck itself. including driving into shade. its very obvious the truck is still lit inside tunnels."
---
lane: Spare

# FEAT-223: Shadows on the truck itself (shade, tunnels)

## Next steps
Landed (2b12914e, land/feat-223). Owner: look card `feat223-look` (before/after pictures, then a drive through a tunnel and under
trees). Ticks the last box.

## Summary
The truck should receive shadow: under trees, behind hills, and inside tunnels, where it is plainly still sunlit today.

## Description
**What was true on main (2026-11-16).** The truck CAST into the near sun map, but no truck mesh set `receiveShadow`,
so neither sun map ever darkened it. The near map (`sun`, ±40 m, 2.6 cm texels on Normal) follows the truck and
re-renders every frame the truck moves (PERF-16's `moving` trigger), so a receiving truck is shaded with no lag.
Terrain casts into both maps (near + far cascade); the tunnel tube casts too; POIs cast into the near map. Trees do
NOT cast realtime: PERF-07 bakes them into a ground atlas that only the terrain shader read, on the far light only.
In a bore the truck already had BUG-112's diffuse × boreShade (0.25 deep), but its sun term stayed on, so its top
read sunlit against a lining lit by the fill alone.

**Built.** (1) Every truck mesh receives (`vehicle-model.js`, the shadeInBore traverse). Inside a tunnel the tube and
the hill over it now remove the sun from the truck, so it is lit by the hemisphere fill × the bore ramp, exactly like
the lining around it. No hemisphere / sky-fill change was needed: truck and walls now get the same light.
(2) Trees: the truck reads the baked atlas itself. A body point h above the ground looks up the ground point its sun
ray leaves from, p.xz + h·shear (the bake's committed shear), with the ground's 5-tap blur, strength × 1/SHADOW_FAR_SPLIT
and far light, so truck and ground under a tree match. Gated on three's `receiveShadow` uniform.
(3) Bed cargo (debris) receives too (realtime maps only, not the atlas).
(4) A truck-only shadow normal offset of 0.05 m (~2 near texels). With none, the bed's front wall streaked and its
floor speckled (shadow acne). It is patched into the truck's own vertex shader, so the ground, and the truck's shadow
on it, are unchanged.

**Cost** (`wip/feat-223/ab.mjs`: paired ABBA, 12 cycles, chase view, near map forced every frame, same build with
receive off in tab A; machine loaded, load avg ~9 from other lanes). GPU active cycles B/A, median (IQR):
seed 71203 noon 0.993 (0.95–1.06), 19:12 0.973 (0.92–1.03); seed 28519 noon 0.990 (0.95–1.06), 19:12 1.013
(0.89–1.06). Per-window extremes 0.46–2.5 on 71203 are other lanes' spikes (both directions). Main-thread instructions
unchanged (621/620, 615/611 Mi/s). So no change is resolvable at this ±5 % noise; the added work is ~2 shadow lookups
+ 5 atlas taps on the truck's ~7 % of the screen. A quiet-machine re-run would tighten the bound.
Tiers: Low has no sun shadows at all (`sun.castShadow` off, atlas off), so the truck is unshaded there exactly as
before; Normal/High/Ultra all get it (only the near map's size differs: 3072² / 4096² / 4096² over ±40 m).

**Pictures** (`wip/feat-223/`, seed 71203, A = main, B = built, each pair the same held frame): `open-noon` (unchanged
except the cab now shades the bed; no acne at 0.05 m), `night` (headlights on; only a ≤ 15/255 change on the truck's
moonlit faces), `hill-low` 19:12 (truck in a ridge's shadow: lit bed ribs in A, dark like the ground in B), `tunnel`
(A bright truck, B dark like the lining), `tree` 16:00 + `tree-C` (C = B with the atlas tap off: the atlas term
darkens the truck's lower body, up to 29/255 levels).

## Tracker
- [x] Built to the owner's words above (receive + baked tree shade + tunnel)
- [x] Cost measured (GPU active cycles, 2 seeds, noon + low sun)
- [ ] Owner has looked / driven it

## Decisions
None new. DEC-227 (no shadows from LIGHTS) untouched: nothing new casts. Nothing from PERF-41's declined list
(shadow fade, cover shadows, shadow rate, res cap) was rebuilt.

## Open questions
- Bed cargo takes the realtime maps but not the tree atlas. Add the tap to debris too if the owner sees it.

## Links
DEC-227, PERF-07, PERF-16, PERF-41, BUG-78, BUG-112, QUAL-18.

## Files
src/vehicle-model.js, src/main.js, src/debris.js

## Log
- 2026-11-16 (Lane U): built on land/feat-223 (1f2b5c57, a3d978a8). Affected gates 18/18 green (no smoke, per the
  brief). Cost below noise (B/A 0.97–1.01, IQR ±5 %). Unverified: a drive at speed under trees (tracking is by
  construction: near map per moving frame, atlas per pixel), the Low tier in the browser. Branch is 13 behind main.

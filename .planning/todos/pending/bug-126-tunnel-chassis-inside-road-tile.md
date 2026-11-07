---
id: BUG-126
type: bug
status: open
opened: 2026-11-07
severity: major
source: Lane B's drive soak (test/drive-soak.mjs, on main since 2026-11-07), second pass on seed 1797933937
owner: Spare (tunnels / road tiles), after BUG-123
relates_to: BUG-77, BUG-81 (tunnel portals and shoulders), MESH == PHYSICS
---

# BUG-126: in a tunnel the chassis ends up inside the road tile's solid and is thrown out

## What happens

Random seed 1797933937, inside the TUNNEL of run `g:-4,1,2:-3,1,1` near arcS 667, at (−1556.6, 702.1). Raw terrain is
247 m over a 189.8 m road, so 58 m of hill is above. At 7.2 m/s the truck drops to 2.0 m/s in one step: a body strike
of 17,495 N·s, tire loads normal, and then it sits pinned ("stuck").

- The struck point is the front bumper's right corner (body-local 0.78, 0.36, −2.06), 0.82 m over the road. The
  truck's centre is 5.9 m from the centreline, the right wheels 7.1 m.
- A ray into the face names engine body 34, userData `{kind: road, key: "-25,11"}`: a road-tile solid (the
  tunnel/portal mesh).
- The face's normal points the way the truck is travelling, and the solid lies on the side the nose came from. So the
  nose was inside the road tile's tunnel solid and was pushed out through its outer face.
- Lane B's reading: either the tunnel's side lets the chassis into its mesh (a one-sided or back-facing wall), or the
  wheels' tunnelWall contact and the chassis's road-tile collider disagree on where the wall is.

A second site, very likely the same family: same seed, (−825.0, 319.3), beside another tunnel span (run
`g:-2,0,1:-1,0,2`, arcS 250–261), with static solids 2–3 m up next to it. The chassis hits a rise at 9.3 m/s with a
horizontal normal (impulse 3565).

## Replay

- `CarGame-machine/wip/drive-soak/run1/1797933937-jolt-1.json`: `SOAK_TRACE=1 node test/drive-soak.mjs --replay=<it>`
  prints the strike, the face and the body owner (needs Lane B's newer trace, 3f3feeb5, until that lands).
- `CarGame-machine/wip/drive-soak/run1/1797933937-collider-1.json` for the second site.

## Acceptance

- [ ] Root cause named: the wall geometry, or a wheel-contact vs collider mismatch.
- [ ] Both captures replay without the strike.
- [ ] A check over tunnel spans on random seeds: the chassis can't enter a road-tile solid from the drivable side.
- [ ] `fingerprint-world` changes explained.

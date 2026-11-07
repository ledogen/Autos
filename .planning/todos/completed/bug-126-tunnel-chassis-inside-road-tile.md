---
id: BUG-126
type: bug
status: closed (not a bug: the soak harness)
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

## Resolution (Spare, 2026-11-07; closed by the orchestrator): NOT A GAME BUG

Both strikes are on the bore lining's inner face, at the wall itself: 7.93 m from the centreline at 0.76 m up, and
7.95 m at 1.0 m up, where a radius-8 arch has its wall at ~7.96 m. The soak's autopilot steered there. Every
`OFFROAD_EVERY_KM` (`test/drive-soak.mjs` ~214–218) it starts an off-road leg toward a point 120–200 m to the side at
9 m/s, and inside a bore that point is behind the wall. On jolt-1 the truck crosses the whole bore diagonally (3.6 →
7.2 m/s) and meets the far wall at ~55°, so 7.2 → 1.3 m/s in one step is the honest answer; it then stays pinned
until the leg's 40 s timeout (the "stuck"). collider-1 is a steady 10 m/s drift into the wall just past a portal.

Ruled out: the zero-thickness two-sided shell (BUG-81's back faces). A 0.3 m shell replayed identically to the digit.
No src change.

Follow-ups:
- **Harness (Lane B):** start no off-road leg inside a bore span (`road.tunnelSpanAt` on the resolved run/arc) or
  within ~20 m of a portal; postpone it until the truck is out.
- **Design note (owner's, if ever wanted):** a bore floor is drivable to ~8 m from the centreline but the arch leans
  in, so a truck with its outer wheels past ~7 m touches the wall with its body. Real tunnel behaviour. A raised kerb at
  the bore's edge would keep players off it.

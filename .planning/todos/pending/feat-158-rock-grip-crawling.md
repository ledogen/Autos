---
id: FEAT-158
type: feature
status: open
severity: major
opened: 2026-11-01
source: owner play-test of BUG-99 on :3282, 2026-11-01 — "At really low speeds, interactions with rocks
  still feels a bit simple. The truck hardly ever climbs over them. I think it's time to attempt adding
  tire friction on rocks. I think rock friction on road is also a natural thing to put in there. So long
  as neither of these are performance hogs"
relates: BUG-99 (closed — its 2026-11-01 work log is the starting point), BUG-38 (one Pacejka patch per
  wheel), the rock proxy in src/physics.js Step 0.5 (`proxyGround`, `qcPlus`)
---

# FEAT-158 — rock grip: the tire climbs rocks, rocks grip the road (crawling)

A tire pressed against a rock face has no grip on it (BUG-38's single patch sits on the road), and a
rock pressed into the road has only its own weight's friction (the engine no longer sees it driven in,
since BUG-99). So at a crawl the truck shoves rocks instead of climbing them. Needed now for slow-speed
feel, later for crawling.

## What was learned (BUG-99 work log 2026-11-01; code parked on `wip/bug99-rock-grip`, 48f2c41d)

- Road friction in the proxy + a second tire patch on the rock face (own slip state, load, face
  tangent frame, both in the ω Newton) were built. Grip alone does nothing to a free rock; with road
  friction a light rock pivots on its base (≈1.4 kg effective mass at the tire for a 9 kg rock) and the
  proxy's EXPLICIT per-substep coupling slingshots it (2 mph → 22 m/s).
- A single shared slip state across road + face does not work (the two want different ω; the wheel
  reversed in three steps).

## Approach

Solve the tire–rock–road contact IMPLICITLY each substep — the tire normal force evaluated at the
rock's end-of-substep yield, with the road's constraints (normal + friction) in the rock's effective
mass — then re-land the parked road friction and second patch on top of it.

## Acceptance

- `node test/census-rock-strike.mjs --nopop --speeds=2,5,10 --big`: the struck hub climbs (rises > 5 cm)
  over the 0.6–0.8× rocks at 2–5 mph in most hits (baseline 0 / 270), rocks pushed > 1 m drop well
  below the baseline 74 / 175 / 270, rock exit ≤ 2× truck speed.
- `--big` at 5–55 mph: 0 flips, the pop curve within a few points of 0/…/3/6/23/33/53 %.
- Physics fingerprint (no debris) identical; no measurable frame cost (a few dozen flops per wheel on a rock).
- Owner play-test at a crawl.

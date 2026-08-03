# HANDOFF — POI mission start: stage, don't count down

**Read this, then `.planning/story-mode/HANDOFF-FEAT46-poi-pads.md` (the layer this modifies).**
Date: 2026-08-02. Rides under **FEAT-46** — no new ticket was cut; this is polish on shipped POI
behaviour, not new scope.

> **STATUS: IMPLEMENTED, GATED, COMMITTED, NOT MERGED.** One commit on `feature/mission-start`, off
> `origin/main` @ `df1d08c`. Verified headlessly (gates) — **NOT yet verified in the running game**
> by the owner; the dev server was killed twice by something outside the session, so the ring visuals
> have not been eyeballed. That is the one open item before merge.

---

## Where the work lives

- **Worktree:** `/Users/ledogen/CodeShit/CarGame-mission-start`, branch **`feature/mission-start`**.
  `node_modules` installed. Dev server: `npm run dev -- --port 3668 --strictPort`.
- **Main is clean** — nothing was edited there.
- Gates: `npm test` (affected: 7) / `npm run test:all` (full). Build: `npm run build` (clean).

## What changed and why

**The problem** (owner, 2026-08-02): you roll up to a POI, accept, and a 3-2-1 handbrake countdown
launches you — possibly facing the wrong way, because nothing about parking at a marker makes you
face your destination. The workaround players find is to decline, turn around, and re-open the
**same** offer (the FEAT-53 single-offer cache guarantees it is the same job), which is ceremony
pretending to be a choice.

**The fix.** A POI job no longer counts down. Accepting puts it in a new `'staging'` state: the truck
is free, untimed, for as long as you like. The clock starts the instant you cross **out of a 25 m
radius centred on the marker**. Quick Job is untouched — it *teleports* you to a start pin already
pointing the right way, so its countdown is exactly the right ritual and nothing about it needs
fixing.

**Three deliberate consequences:**

1. **No handbrake hold on a POI start.** `isHeld()` stays false through `staging` — a hold there
   would be the 3-2-1 launch by another name.
2. **The threshold is one-way.** Driving back inside the circle cannot un-start a run. It is a
   threshold, not a trigger volume.
3. **The interaction radius tightened, 18 m → 10 m.** At 18 the offer armed from the road itself,
   well short of the pad. 10 is a little over the pad's own half-diagonal (√(7²+4²) ≈ 8.1), so it
   now means "parked on the lay-by" and nothing looser — the first step toward the owner's stated
   direction of travel: *the marker becomes a highlighted parking spot you pull into*.

## The rings

One circle in front of the player at a time; **its colour is the state**.

| | radius | colour | means |
|---|---|---|---|
| interaction ring | `poiInteractR` = 10 m | orange `0xff7a18` | park inside this to be offered a job |
| start-zone ring | `START_ZONE_R` = 25 m | green `0x3ddc6b` | cross this and the clock is running |

Accepting **swaps** them: that marker's orange ring hides and the green one stands in its place
(every *other* POI in the region keeps its orange ring). Leaving the zone swaps back.

Both are the same unit `CylinderGeometry` and the same alpha-ramp texture in two materials —
open-ended, sunk into the ground so undulating terrain cannot open a gap under the base, alpha fading
out toward the top, `depthWrite:false` + `DoubleSide` so it reads as a light curtain rather than a
solid bucket, `toneMapped:false` so the colour survives every hour of the day clock. The green ring
is 8 m tall against the orange's 4 m, because a 25 m circle at 4 m reads as a puddle.

Cost: one extra mesh per POI (shared geo + material), and `_updateMissionRings()` on the existing
~10 Hz HUD poll — visibility flags plus one transform, one allocation on the first staged job and
none after. Nothing in the frame loop, nothing in physics.

## Files

| file | change |
|---|---|
| `src/mission.js` | new `'staging'` state; `START_ZONE_R = 25`; `mission.startZone` stamped at roll time from the anchor's `poiX/poiZ/poiY`; `startZone()` + `startZoneExitDist()`; `_launch` branches on `startZone`; `update()` gains the threshold check; `isHeld()` unchanged (countdown only) |
| `src/main.js` | `_poiRings` map + `_updateMissionRings()` (the orange↔green swap); ring geometry/material/alpha-ramp; `staging` HUD line; offer-panel copy; GPS `getRoute` now includes `staging` |
| `src/poi.js` | `poiInteractR` 18 → 10 |
| `test/story-poi.mjs` | new section 7b — eight checks on the start zone |

## Verification

- `npm test` — 7 affected gates green (`story-poi`, `mission-network`, `gps-route`, `par-oracle`,
  `camp-zones`, + 2). `npm run test:all` — see the commit message for the result at commit time.
- New checks in `story-poi.mjs` §7b: a POI job stages rather than counts down; it does not hold the
  truck; the zone is centred on the **marker**, not the road-side start pin ~11 m out across the
  shoulder; inside the zone no clock runs; crossing out starts the run with elapsed from **zero at
  the line**; re-entering cannot stop it; a Quick Job still counts down **and** still holds.
- `npx vite build` clean.
- **Not done: in-game visual verification.** Someone should drive it before merge — specifically the
  ring swap on accept, and whether the two radii read as coherent (see the open question below).

## Design-doc check

Nothing here touches **SM-INV-3**. That invariant is about *par* never being rendered as a countdown;
the 3-2-1 was a START count, not a par clock (`mission.js` says so at the `COUNTDOWN` const), and
removing it for POI jobs moves *away* from rendered timers, not toward them. No other SM-INV is in
scope.

**One doc line now reads stale, deliberately not edited** (owner's call, per the ask-on-conflicts
rule): `DESIGN.md` line ~79, in the 2026-07-20 (b) ratification pass, describes the beta mission
generator as presenting "a mission on the 2D map with an **accept** button before its start
countdown". That is still exactly true of Quick Job and no longer true of a POI job. It is a scoping
note about a testing harness, not a `[RATIFIED]` invariant, so it did not seem worth an
amendment — but if you want the record clean, that is the line to touch.

## Open questions / follow-ups

1. **10 m vs 25 m — is the gap right?** The visible orange ring is 10 m; the timer fires at 25 m.
   Between them is unmarked ground, resolved only by the green ring appearing on accept. Pulling out
   of a lay-by clears it naturally, so this should be invisible in play — but if it reads as
   ambiguous, the clean fix is to make the start threshold **be** the interaction radius (one ring,
   one radius, two colours) rather than adding a third marker. Needs the owner's eyes.
2. **The parking spot.** Owner's stated direction: the marker becomes a highlighted parking *spot*
   you pull into, not a radius you enter. The 10 m ring is a placeholder for that, and the orange
   cube is still FEAT-43's placeholder art. A real pass would put a marked bay on the pad and drop
   the circle entirely.
3. **POI retry.** A POI *retry* would also stage (it seats first, then stages, because the zone is
   the thing being retried). That path is gated off for paid jobs by `PAID_JOB_DO_OVERS`, so today it
   is unreachable — noted only so a future flip of that flag is not a surprise.

## Merge

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh merge mission-start   # from the main repo root
```

No conflicts expected: `main` has not moved since `df1d08c` and nothing else touches
`mission.js` / `poi.js`. After merging, run `npm run test:all` on main once, then
`wt.sh clean mission-start`.

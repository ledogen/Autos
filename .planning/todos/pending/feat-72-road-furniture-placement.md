---
id: FEAT-72
type: feature
status: open
severity: minor
opened: 2026-08-24
updated: 2026-10-01
relates: ASSET-22, ASSET-31, FEAT-59, FEAT-39, BUG-55, QUAL-23
---

# FEAT-72: Road-furniture placement, derived from the routed centerline

The consumer for the **road furniture** asset class. It does not exist, and its absence is what
kept ASSET-31 from being placeable the day it shipped.

## The gap

`assets/models/sign-{grade,curves,rockslide,tee,cross,stop,icy}.glb` are built, registered as
`signGrade`…`signIcy`, and **nothing places them**. They carry no pool tag on purpose (see below).

**ASSET-22 shipped 2026-09-30, extended to ELEVEN flavours 2026-10-01, and is now the other half
of the backlog here**: `mailboxClassic`, `mailboxTube`, `mailboxLeaning`, `mailboxCluster`,
`mailboxPillar`, `mailboxBucket`, `mailboxPlanter`, `mailboxBarn`, `mailboxLimb`, `mailboxChicken`,
`mailboxFancy` — all built, registered, untagged, and unplaced, for the same reason. So this ticket
now gates **eighteen** finished models instead of seven.

With eleven flavours the placement question has changed shape: it is no longer "put a mailbox
there", it is **which flavour belongs on this driveway**. They carry implied wealth and implied
care, and that is a real signal to spend — `mailboxFancy` and `mailboxPillar` say money,
`mailboxPlanter` says someone tends the place, `mailboxBucket` and `mailboxLimb` say make-do,
`mailboxLeaning` says abandoned. A pool that draws uniformly throws that away. Weight the draw by
whatever the POI already knows about its household rather than by a flat hash.

Road furniture is the one asset class whose placement is *not* a scatter. It repeats along the
network, it is never a destination, and it is positioned from the road's own geometry.

## The rule this ticket exists to enforce

**A SIGN THAT LIES IS WORSE THAN NO SIGN.** A curve warning on a straight, or a left-curve sign on
a right bend, teaches the player that their instruments are untrustworthy — and this project's
instruments (the GPS overlay, the par oracle, the grade readout) depend on that trust. So a
`roadSign` tag pool would be actively harmful: it would make the wrong thing easy.

The road system already knows the truth. The router prices curvature as κ², and the centerline
carries a real min-radius and honest 1-D EMA grade. Every sign must read that truth:

| Sign | Reads |
|---|---|
| `signCurves` | `minR` on the run ahead — place only where the run genuinely bends, and place it far enough back to be useful |
| `signGrade` | the grade profile ahead. **Mind the two elevation series** — `seg.gradeAt` (par) vs `runProfile().gradeY` (carved). The carved one is what the truck actually drives |
| `signTee` | a degree-3 node ahead |
| `signCross` | a degree-4 node ahead |
| `signStop` | a junction the player must actually stop at — a stronger claim than "a junction exists" |
| `signRockslide` / `signIcy` | **nothing yet.** These are terrain and weather claims with no geometric truth behind them. Leave them unplaced until something can vouch for them |
| `mailbox*` (ASSET-22, shipped) | a house POI's driveway, not the road at large. It can be a paper-route drop point (`newsCustomer`, missions.md §2); untagged ones are also FEAT-71 lawn furniture |

## Scope

- Placement runs off the routed centerline, in the same pass that already walks a run, and is
  **deterministic in the seed** — the same region re-streamed must produce the same signage.
  Derive from `hash32(...)`, never `Math.random()`.
- Sign faces the oncoming lane: forward is −Z on every model, and the yaw comes from the
  centerline tangent at the placement station, not from a random draw.
- Set back from the carriageway edge, on the shoulder, and seated on the carved surface — the same
  `_resolveRoadSurface` the props already use, so a sign never floats or buries.
- **Cant and wear belong here, not in the model.** ASSET-31 deliberately ships upright and clean: a
  baked lean makes every sign on the map lean the same way. A small random roll/yaw at placement is
  what sells "faded, shot at, canted".
  - **The mailboxes follow that rule with one deliberate exception.** Four of the five ship upright
    and clean and want the same placement-time cant. `mailboxLeaning` does NOT — its lean, dents
    and hanging door are baked, because they are a *character* (a derelict), not wear, and it is
    one flavour among five rather than every instance on the map. Give it placement cant on top if
    you like, but do not "fix" the baked lean, and do not apply a derelict's cant to the other four.
  - **Paint variety is already solved and is free: use it.** Three curated pools, all five entries
    long: `MAILBOX_PAINT` on `MailBox` for the nine flavours using the standard box, `BARN_PAINT`
    for `mailboxBarn`, `FANCY_PAINT` for `mailboxFancy` (all in `data/prop-models.js`). Pass
    `spawnModel(key, { variant: hash32(...) })` — any integer, taken modulo the pool length, and
    the equal lengths mean one index behaves consistently whichever flavour was drawn. Placing a
    road of mailboxes without a variant index means placing a road of identical galvanised boxes,
    which is the clone problem this kit was shaped to avoid.
  - **`mailboxChicken` recolours the whole bird** — its neck and tail are `MailBox`. Variant 1
    (cream) is the white chicken of the reference and is the one to reach for.
- Collision is the post only (`SIGN_POST_BOX`, 89 mm square, knockable) — clipping a sign should
  cost a mirror, not stop a truck.
- Density and spacing are a budget, not a per-sign decision. Signs are the most-repeated authored
  object in the game after props; a cap belongs in this ticket.
- **Mailboxes are the harder half of that budget, and they may need FEAT-59's deferred
  `InstancedMesh` path first.** Each one clones at 3–5 draw calls, and a populated road wants far
  more of them than it wants signs. ASSET-22 flagged this from the start: a handful placed by hand
  proves the asset; a paper route planned around a dense roadside does not. Measure before
  committing to a density.
- **`mailboxPlanter` is the one flavour whose footprint is wider than its box** (0.554 m square,
  the wash tub). Its collider is the tub, so it needs more shoulder than the others — do not place
  it where only a post fits.
- **`mailboxCluster` is one anchor serving several households**, not three POIs. It is the model
  behind ASSET-22's 2026-09-30 multi-customer drop-point note, so its placement rule is a shared
  driveway or a group of nearby houses, not "three times the mailbox density".

## Signs are not navigation UI and must never become it

The GPS overlay (FEAT-39) already owns chevrons and junction arrow boards, and **neither GPS may
ever render an ETA** (`items.md`; par is never a countdown, SM-INV-3). A physical sign is set
dressing plus honest road information. No distance-to-mission, no destination names tied to the
active job, no timing.

## Open questions for the owner

- **How far back?** A curve warning is useless at the tangent point. Is the setback a fixed
  distance, a time-at-speed, or derived from the approach speed the router assumed?
- **What counts as "steep" and "tight"?** The thresholds that trigger a grade or curve sign are a
  tuning decision, and they should be few — a sign on every bend is noise, and noise is how a
  player learns to ignore signage.
- **Does signage vary by region?** QUAL-23 wants per-region routing character; per-region sign
  density is the visible half of the same idea (a maintained valley road vs a forgotten one).

## Acceptance

- Driving a run with real curvature or grade produces a sign that is **correct about that run**,
  verified in a headless gate against the centerline rather than by eye.
- No sign is ever placed where its claim is false. A gate asserts this, because it is the one
  failure that damages the game rather than just looking wrong.
- Re-streaming the same region reproduces identical signage.
- `signRockslide` and `signIcy` stay unplaced until a terrain/weather source exists for them.

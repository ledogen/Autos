---
id: FEAT-132
type: feature
status: done
severity: minor
opened: 2026-10-19
source: owner, 2026-10-19 — "stranded motorist should post a fetch 'haul' mission where the wheel and tire go in the bed"
lane: B → Spare (2026-11-01: Lane B has no session; Spare took it)
relates: FEAT-102 (fetch shape), FEAT-89 (stranded motorist currently posts courier fetch: spare tire, jerry can), FEAT-88 (haul — loose bed cargo), ASSET-steel-wheels
---

# FEAT-132: Stranded motorist posts a HAUL fetch — wheel + tire ride in the bed

## Request
Today the stranded motorist's fetch is courier-class (item in the cab). A wheel-and-tire is bed
cargo: post it as a fetch whose item is a loose bed body (FEAT-88 haul physics), so it can bounce
out / be lost like other haul loads.

## Acceptance
- [x] Stranded motorist can post a haul-family fetch; the wheel+tire spawns in the bed at the pickup PARK.
- [x] Delivered condition counts as for any haul load.
- [x] Courier-class fetch items (jerry can) stay courier unless the owner says otherwise.

## Amended 2026-10-21 (owner)

A one-piece fetch can never rank above D on counts, so this job **ranks on time, like courier** (FEAT-138). The stranded motorist never gives a rare reward, so an easy rank costs nothing. See design-amendments-2026-10-21-mission-recut.md §12.15.

## Resolution (Spare, 2026-11-01) — already built by the stranded-spare branch (e8042149, 2026-10-22)

Nothing left to code; closed on evidence.
- The motorist's `spareTire` fetch (data/offers.js) carries `loose: 'spareTire'`: one 21 kg debris body
  in the bed (main.js `_loadLoose`), with a thinned-hull collider from the real model.
- **One change from the acceptance, by the owner's later canon (10-22).** The acceptance says it spawns
  at the pickup park. The canon is that you take the motorist's OWN wheel and flat tire to the shop,
  they change it, you drive it back. So it is loaded at accept and rides both legs. Parking at the shop
  skips 15 min (`atPickup`), and that wait counts in the timer and in par.
- Losing it (out of the bed > 1 s) fails the job, the same dead end as wrecked fragile cargo. Per the
  10-21 amendment it ranks on time like courier, so "delivered condition" is pass/fail, not a count.
- The jerry can stays a courier (cab) fetch.
- Gate `test/loose-tire.mjs` PASS on 79b8aace: mass 21 kg, settles flat on the bed ribs, held at
  60 mph straight and in a slalom.

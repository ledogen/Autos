---
id: FEAT-132
type: feature
status: open
severity: minor
opened: 2026-10-19
source: owner, 2026-10-19 — "stranded motorist should post a fetch 'haul' mission where the wheel and tire go in the bed"
relates: FEAT-102 (fetch shape), FEAT-89 (stranded motorist currently posts courier fetch: spare tire, jerry can), FEAT-88 (haul — loose bed cargo), ASSET-steel-wheels
---

# FEAT-132: Stranded motorist posts a HAUL fetch — wheel + tire ride in the bed

## Request
Today the stranded motorist's fetch is courier-class (item in the cab). A wheel-and-tire is bed
cargo: post it as a fetch whose item is a loose bed body (FEAT-88 haul physics), so it can bounce
out / be lost like other haul loads.

## Acceptance
- [ ] Stranded motorist can post a haul-family fetch; the wheel+tire spawns in the bed at the pickup PARK.
- [ ] Delivered condition counts as for any haul load.
- [ ] Courier-class fetch items (jerry can) stay courier unless the owner says otherwise.

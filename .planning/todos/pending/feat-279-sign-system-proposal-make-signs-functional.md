---
id: FEAT-279
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "We should work on adding world clutter to make it feel more interesting. I'd like to see a proposal for making the sign system functional. I think wor…"
relates: FEAT-72, ASSET-31, FEAT-278
---
lane: Engine & world

# FEAT-279: A proposal for making the road-sign system functional

## Next steps
The owner answers the deep dive `.planning/dives/FEAT-279-signs.html` (owed card `feat279-signs-dive`). His picks then become decision records and FEAT-72's build brief (plus one asset ticket if he takes Tier 2). No build yet.

## Summary
The signs are built (ASSET-31) but nothing places them. The owner wants a proposal for a functional sign system: little signs marking hairpin turns, steep grades and the like that reflect what the player is about to see.

## Description
Owner's words, verbatim (inbox 20261118013441-v9hd):

> We should work on adding world clutter to make it feel more interesting. I'd like to see a proposal for making the sign system functional. I think world clutter can go in after the initial loading screen. Since the player doesn't see it all at once, it can stream in slowly right after a new game is started. It would be cool to mark things like hairpin turns, steep grades, etc. with little signs that actually reflect what you are going to see. 
> Separately, but still as part of the world clutter system, I think we could put random mailboxes around.

One owner message (inbox 20261118013441-v9hd) split into three tickets: FEAT-278 (the clutter system and its streaming), FEAT-279 (the sign-system proposal), FEAT-280 (random mailboxes).

## Tracker
- [x] A written proposal reaches the owner (what each sign marks, how it is placed from road geometry, how it never lies): the deep dive, 2026-11-18
- [ ] The owner picks from it before anything is built

## Decisions

## Open questions
- Which hazards get a sign (hairpin, steep grade, others)?
- Is a proposal enough for the alpha, or is it post-alpha? He said nothing on release.

## Links
FEAT-72, ASSET-31, FEAT-278, FEAT-26 (the slide finder that can vouch for signRockslide), BUG-216 / BUG-97 (junction sags) · dive: `.planning/dives/FEAT-279-signs.html`

## Files
FEAT-72 (road-furniture placement) · assets/models/sign-*.glb

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118013441-v9hd).
- 2026-11-18 lane u: proposal written as a deep dive (14 questions). Census of 12 random seeds' story regions (552 km): the world places 0 signs; the demolition old sign line is ~1 in 8 true; per km per direction 1.48 bends need ≥ 15 km/h of slowing (0.85 at ≥ 30), 0.23 hairpins/km, ≥ 15 % grade for ≥ 150 m 0.36/km, 51 % of junction approaches hidden at stopping distance. Script `wip/feat-279/sign-census.mjs` + `sum.mjs` in CarGame-spare-base (git-invisible). Unverified: T-sign truth counts every 3-way approach (stem vs through not split); sag counts on runs only (pads not seen).

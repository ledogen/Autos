# HANDOFF 2026-10-07 — cargo master list, places doc, dashboard views

Everything below is on `main`: `322cd73` (this session) and `365b946` (the parallel session's
fragile/freight design pass). The tree was clean at handoff. This is **planning and tooling work
only**: no game code changed. The to-tags and the job-cycling proposal are still paper.

## Read first

- `.planning/story-mode/cargo.md` — **the master cargo list.** Every carried thing, grouped by
  delivery type (courier, haul, freight, fragile), tiered by region (R1/R2/R3), with a
  `From → to` column. Its **Rulings** section holds the owner's 2026-10-06 calls.
- `.planning/story-mode/pois.md` — **the places doc.** It lists planned POI types and roadside
  spots with tags, plus the job-cycling proposal. Live types are deliberately **not** in it: the
  dashboard reads them from `src/poi.js` `POI_ROSTER` and `data/offers.js` `SOURCES`.
- FEAT-96 (freight, strapped) and FEAT-97 (fragile, strapped). Delivery is four types now. The
  2026-09-29 two-class ruling was partly reversed; see missions.md §3, amendment 2026-10-06.

## Landed

1. **Cargo asset tickets ASSET-46..64** (freight and fragile models). The parallel session also
   added ASSET-39..45 (fragile set) and ASSET-65..67 (farmhouse, barn, tractor). The next free
   numbers are **ASSET-68** and **FEAT-98**.
2. **Owner rulings, 2026-10-06/07**, all recorded in cargo.md:
   - A region gates each tier (R1 early, R2 mid, R3+ late).
   - Steel wheels are car rims, in a stack of 4 or 8 (ASSET-53).
   - Tyres are freight (ASSET-61).
   - A bed of topsoil is a **mild overload, tuned by feel**: 500–700 kg against the ~550 kg
     payload. Suspension and tyre upgrades carry it. FEAT-96 names it as the one exception.
   - **Ride smoothness is not a thing.** The tipsy passenger is flavour text. No courier job is
     scored on how it is driven, and passengers never render.
   - Tagging is **option C**: a blank `From → to` means generic (any normal giver, to anywhere).
     Only place-specific rows are tagged.
   - The **work site is a real POI type** (`workSite`, planned). The school, the office and the
     airport stay **roadside spots** (marked † in cargo.md, `institution` in pois.md). The owner is
     considering upgrading them to POIs.
3. **FEAT-97: damaged fragile cargo blinks red** on each hit, as well as playing the sound. The
   blink is a red tint over the whole model, so no asset needs anything special.
4. **Dashboard: Cargo and Places tabs** (`npm run dash`, :8010; `/reindex` rebuilds without a
   restart). `tools/dashboard/index.mjs` writes `cargo.json`, which is generated and gitignored.
   - **Cargo** is grouped by type, then region. Each row has from → to badges, mass, and its asset
     with ● shipped / ○ ticketed / no model. Filters are in the URL (`#/cargo?kind=freight&place=farm`).
   - **Places** shows live types (from code), planned types and roadside spots. Each one lists
     what it sends and receives, computed from the cargo routes.
   - **An amber warning strip** shows any unparseable row, any route naming an unknown place, any
     `ASSET-NN` with no ticket, any `SOURCES` key with no roster type, and any planned type that is
     already live. It was empty at handoff.

## The parse contract — don't break it when editing the docs

The dashboard reads the markdown tables directly, so their layout is load-bearing:

- In cargo.md, sections are `## Courier` (with a `### People` subsection), `## Haul`,
  `## Freight` and `## Fragile`. Every table's first column is `Region`, with values `R1`, `R2`
  or `R3`. The item column is named `Thing`, `Job` or `Load`, and there is a `From → to` column.
- A route reads `a / b → c / d`. Words in parentheses are annotations. **Place names must match
  exactly**: a live `POI_ROSTER` type, a planned type in pois.md, or a quoted roadside spot such as
  `"the school"`. If they don't, a warning appears.
- In pois.md, the `## Planned POI types` table has the columns Type | Status | Region | Gives |
  Receives | Tags | Model | Ticket. **When a planned type lands in `src/poi.js`, delete its row**
  (the dashboard warns until you do).
- `POI_ROSTER` is **not imported**: importing it pulls in mission.js and the prop registry.
  `index.mjs` cuts the array literal out of the source and evaluates only that. Keep `POI_ROSTER`
  a plain data literal.

## Open — in order

1. **Wire up the to-tags (needs a FEAT ticket, promised to the owner and not yet minted).** Today
   `data/offers.js` things have only `pools` (from). The destination is any POI half the time
   (`DEST_POI_CHANCE`) and otherwise a roadside name. The work: a `to` field on each thing, a filter
   in the destination step of `src/offer-board.js`, and seed-determinism kept (SM-INV-12). This is
   the only item that changes gameplay.
2. **Drift check between the cargo list and the game's things (cheap).** cargo.md's "existing"
   rows duplicate `THINGS` in `data/offers.js`, and nothing checks that they agree. Add a dashboard
   warning for any `THINGS` entry missing from cargo.md, and the reverse. The code's family keys
   still say `delivery`/`fragile`/`freight`; FEAT-89 and FEAT-88 own the rename to courier/haul.
   Don't do it ahead of them.
3. **Job cycling — the owner's call** (pois.md, "Cycling jobs").
   - The proposal: after an offer ends, each slot sits idle for a seeded gap (`idleH` per source,
     generalising Larry's `minEmptyH`). At a gap equal to the expiry, occupancy is 0.5, so 30
     one-slot givers average 15 offers (σ ≈ 2.7).
   - The alternative is a region budget of exactly 15.
   - Receive-only places don't count against the budget.
   - **Before growing the roster toward 30, measure the pad supply headlessly on sparse seeds.**
     Only seed 6 is measured (43–46 viable pads per 2500 m region).
4. **Roadside names — the owner's call, with one cleanup available.** Should the school, office
   and airport be upgraded to receive-only POIs? Separately, the roadside "the Hadley farm" and
   "the Pruitt quarry" now collide with the real `farm` and `quarry` types. Propose removing
   `farm`, `quarry` and `dairy` from `PLACE_NOUNS` in `data/offer-names.js`, but ask first: that
   list is owner-authored.
5. **`workSite` has no asset ticket and no roster row.** Six cargo rows deliver to it.
6. **Asset burn-down order.** There are 30+ cargo model tickets. FEAT-96's first slice needs only
   the pallet (ASSET-27, shipped in `6966c6b`), the crate (28), the barrel (29, shipped) and the
   drums (30, shipped). After those, build the R1 rows filtered to "ticketed" in the Cargo view.

## Working notes

- Several sessions shared main all day. Commit with `git commit -- <paths>`, never `git add` a
  set. In zsh a path list in a `$VAR` does not split into separate words: use an array, or the
  `git add` fails (harmlessly).
- A new companion note goes into CLAUDE.md's Story Mode list (cargo.md and pois.md are there).

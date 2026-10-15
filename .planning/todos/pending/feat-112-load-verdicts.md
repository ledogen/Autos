---
id: FEAT-112
type: feature
status: open
severity: major
opened: 2026-10-14
source: owner, 2026-10-12 / 2026-10-14 — "overloads need a mission card soft warning and hard warning
  based on the current truck configuration. That means building a long bed upgrade comes with the
  overload criteria as a function per upgrade. Verdicts should be fits, warning or overload. Can be
  triggered by size or weight."
relates: FEAT-67 (offer board — the card this writes on), FEAT-96 (freight — the strapped loads and
  their as-built masses), FEAT-88 (haul — loose loads), FEAT-114 (haul quantity — reads these limits),
  FEAT-115 (bed upgrades — the functions this composes), cargo.md (masses), data/freight.js (load models)
invariants: SM-INV-12 (the verdict never feeds the board's roll), SM-INV-10 (words on the card, no
  handling stat), SM-INV-15 (an upgrade is not a different vehicle)
design: design-amendments-2026-10-14.md §2–3; missions.md § Load verdicts
---

# FEAT-112: Load verdicts — fits, warning or overload, for the truck as configured

## Request

Every offer card says whether the job fits the truck **as it is configured right now**:

| Verdict | Meaning | Accept? |
|---|---|---|
| **Fits** | inside every limit | yes |
| **Warning** | past a soft limit: heavy, overhanging the tailgate, or loose on an open deck | yes — the physics supplies the penalty |
| **Overload** | past a hard limit: too long or wide for the space, or too heavy to carry | **no** |

Size or weight can trigger either level. A 12 ft board (3.66 m) is an overload in the stock bed by
length alone. A roof rack or an extended bed (FEAT-115) is what makes it fit.

## Scope

1. **The truck configuration** (data, not code): the stock Ranger's bed — inner length, width between
   the arches and between the sides, rail height, the tailgate overhang allowed before a warning — its
   soft and hard payload in kg, and its containment (`sides` · `stakes` · `open`).
2. **Upgrades are functions.** `config = upgrades.reduce((c, u) => u.apply(c), STOCK)`. This ticket
   ships the composition and the stock config; FEAT-115 ships the upgrades. Suspension and load-rated
   tire parts raise the weight limits through the same hook when they exist.
3. **Cargo carries its size and form.** Each bed load gets its dimensions (from its model in
   `data/freight.js`) and a form: `boxed`, `loose` or `long`. Courier things ride in the cab and
   always fit. Haul is per piece × the chosen count (FEAT-114).
4. **`loadVerdict(config, cargo)`** — a pure function returning `{ verdict, reasons }`. Reasons are
   words for the card: heavy, too heavy, overhangs, too long, too wide, will spill.
5. **The card** shows the verdict and its reason. On an overload the accept action is disabled and
   says why.
6. **The board does not change.** The seed decides the offers for every vehicle and every
   configuration. The verdict is a display and an accept gate only.

## Open — the owner's

- **The stock truck's soft and hard weight limits.** Cinder blocks (785 kg) and concrete (670 kg)
  roll on the stock Ranger today (2026-10-10, "let them roll"). Below the hard limit they stay
  warnings; above it they need upgrades first (items.md §1a's load budget).
- **The overhang allowance.** Real road rules in most US states ask for a red flag at about 4 ft
  behind the vehicle; that is a natural warning line.
- **Bed dimensions.** Take them off the Ranger model. ASSET-27 assumed ~1.5 m between the arches,
  which looks wide for a real Ranger.

## Acceptance

- [ ] `loadVerdict` is pure and headless; a gate covers fits / warning / overload for size and for
      weight, and a composed upgrade changing the verdict.
- [ ] Every posted bed load has dimensions and a form; the gate fails on a missing one.
- [ ] The card shows the verdict and reason; overload disables accept with the reason.
- [ ] Same seed → the same board whatever the configuration (SM-INV-12).
- [ ] Cinder blocks and concrete land where the owner rules (warning or overload) on the stock truck.

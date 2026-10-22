---
id: FEAT-140
type: feature
status: open
severity: major
opened: 2026-10-21
source: owner, 2026-10-21 — "do we just modify the existing cargo weight, or do we have some system where
  we can fill the bed of the truck with more and more cases of something or boxes of something or
  pallets of something as the weight increases" → units; "So there's two types of loads: one you can
  adjust the quantity of and others you're just stuck with what you got? I think that sounds fine. I do
  have a feeling that we'll have to drop all of the lighter weight freight cargo."
relates: FEAT-96 (freight, the strap/weld loader), FEAT-114 (the picker), FEAT-138 (kg letters),
  cargo.md (the freight table), data/freight.js, wip freight-pallet.py kit
requires: FEAT-114
design: design-amendments-2026-10-21-mission-recut.md §11
---

# FEAT-140: Freight is a unit and a count — the bed fills visibly as the load grows

## Request

Freight ranks on kg delivered (FEAT-138), so the player must be able to load more. A bigger load is
**more units in the bed**, never a bigger number on the same model.

- **A divisible freight cargo is a unit plus a count.** Concrete bags 36 kg, cinder blocks 17 kg,
  crates of fruit ~43 kg, soil bags 18 kg, railway ties 91 kg, drums. Mass = count × unit (+ pallet).
- **The bed fills visibly.** Units stack in layers on the pallet or the bed floor. Visible load, real
  mass.
- **Indivisible loads keep their as-built mass** (a job box, one drum, a rug). They usually can't reach
  S — the same "not enough stock to rank" rule as haul. They are the honest small jobs.
- **Still one contract.** "Packing the bed with several contracts" stays rejected (10-14).
- **The freight roster pass** (inside this ticket): light loads that can't rank above D and pay little
  (empty propane tanks 43 kg, small crate 30 kg, eight tyres 105 kg, …) are each dropped, moved to
  courier, or turned into a unit cargo. Decided per load with the owner during play-testing.

**Blocker this removes:** every R1 freight load posted today is 30–365 kg (≤ 64 % of the rating); only
the R2 cinder blocks clear S. Freight letters are empty until this ships.

## Notes

- A procedural stacker: unit model, a layer grid sized to the bed (and to bed upgrades, FEAT-115), one
  weld per unit or per layer. Check the weld count's physics cost against the PERF budget.
- `THINGS` / `data/freight.js` gain unit + max-count fields; cargo.md's freight table gains a unit
  column.
- The load verdict (FEAT-112) reads the stacked load's mass and size.

## Acceptance

- [ ] Divisible freight cargo is defined as a unit + count; the picker (FEAT-114) chooses the count.
- [ ] The bed shows the units stacked; mass and centre of mass follow the stack.
- [ ] Indivisible loads load exactly as today.
- [ ] The roster pass is done with the owner and cargo.md reflects it.
- [ ] `test/freight-strap.mjs` covers a multi-unit load.

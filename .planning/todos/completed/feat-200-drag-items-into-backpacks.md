---
id: FEAT-200
type: feature
status: completed
severity: minor
opened: 2026-11-12
closed: 2026-11-12
source: owner, 2026-11-12 inbox — "Can you make it so I can drag items into backpacks from the inventory screen directly instead of having to click the item then click pack?"
relates: [FEAT-182]
---
lane: A

# Inventory: drag an item onto a backpack to pack it

## What

Dragging an item onto a backpack packs it, same result as select → pack. The click path stays (the pad needs it).

## Acceptance

- [x] Mouse drag from the inventory grid onto a backpack packs the item; a full backpack refuses with the existing message.
- [x] Select → pack still works.

## Implementation — Lane A, 2026-11-12 (3eb62793)

- `src/inventory-screen.js`: camp items in the grid are `draggable`; native HTML drag-and-drop onto ANY
  backpack slot (equipped or spare) calls `packItem(item, pack)`. The target gets an `--accept` outline
  while it would take the item; a pack that would not shows the no-drop cursor and the drop does nothing.
  There was no "pack is full" message to reuse (the pack button just greys out), so the refusal is the cursor.
- `InventorySystem.canPack(index, packIndex)` is the one rule, used by `packItem`, the drop and the pack
  button. Select → pack is unchanged (the pad's path). The strip's idle hint gained one sentence about dragging.
- Owed: the synthetic-drag check in the browser (wip/feat198/shot.mjs, held for the perf bench).

## Resolution — Lane A, 2026-11-12

Shipped (3eb62793). Synthetic native drag in the real app (`wip/feat198/shot.mjs`, 0 console errors): tent onto
the starter pack (bedroll inside, room for one) packed it → `[bedroll, tent]`; awning onto the now-full starter
pack refused (dragover not accepted); awning onto a spare duffel packed it → `[awning]`. Select → pack is unchanged.
A pack itself is not draggable (only camp items are). Owed: the owner's feel of the drag with a real mouse.

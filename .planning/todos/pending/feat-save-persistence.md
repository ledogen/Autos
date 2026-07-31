---
id: FEAT-42
type: feature
status: open
opened: 2026-07-21
rescoped: 2026-07-31 — two stores, not one (see "Reconciliation")
severity: minor
source: user question 2026-07-21 — "how do we save roguelike metaprogression without maintaining a server?"
relates_to: >
  story mode (.planning/story-mode/DESIGN.md — "The garage", "Run shape and saving", SM-INV-8 as
  narrowed / SM-INV-12 as rewritten / SM-INV-14 / SM-INV-15), run-shape.md "Saving" (the ratified
  save model), MILESTONES.md SM-4 (this ticket is SM-4's save line), FEAT-28 region unlock
  (run-layer — NOT a durable unlock), FEAT-41 game menus (the export/import surface)
depends_on: nothing to build the stores; consumers land with SM-1/SM-3/SM-4
blocks: SM-4's run lifecycle — a 4–6 h run is unplayable without a resume
---

# FEAT-42: Two save stores — durable `metaState` + a single-slot `runSave`

## ⚠ Reconciliation 2026-07-31 — read before planning

Written 2026-07-21, before the 2026-07-29 ratification pass. **Two things it assumed are now wrong,
and one thing it was missing is the more important half of the ticket.**

**1. The old contents list is illegal.** This ticket originally described metaprogression as
*"region unlocks via FEAT-28, mission/par economy, spirits, currency."* Under the 2026-07-29 rulings:

| the old ticket said | the ruling |
|---|---|
| region unlocks persist | **Run-layer** — trail clearance resets on death (Open Q3, resolved) |
| currency persists | Money dies with the run (SM-INV-8 as narrowed) |
| spirits are the unlock roster | **Spirits are DEFERRED**; the roster is **the garage** (SM-INV-8, "The garage") |
| XP persists (implied) | **XP is run-layer** (SM-INV-14) |

What durably persists is exactly two things: **unlocked starting vehicles** and **story keys**
(SM-INV-8). Literacy is the third thing that survives and it lives in the player's head — nothing
to serialize.

**2. The run save was missing entirely.** `run-shape.md` "Saving" [RATIFIED 2026-07-29] and
MILESTONES SM-4 both assign the **suspend-and-resume run save** to this ticket, and its load-bearing
semantics — *loading a save deletes it* — appear nowhere in the original. That semantics is the whole
reason saving doesn't destroy the roguelike, so it is not a detail to leave to the consumer.

**Consequence: this is two stores, not one**, with opposite durability rules. They share a backend
and a schema discipline; they must never share a code path that could confuse "resume the run" with
"restore the run."

## The two stores

### `metaState` — durable, cumulative, exportable

Survives everything. Versioned. **Never touches generation** (SM-INV-12: worldgen is
`(worldSeed, coords)` and no meta input reaches it — this is what makes a shared seed mean the same
world for every player at every stage of progress).

```
metaState = {
  version,
  vehicles:   [ unlocked starting-vehicle ids ],   // "The garage" — lateral, never upward
  storyKeys:  [ once-per-profile beats seen ],     // e.g. the log-drag staged scene
}
```

That is the whole surface. **If a field is a resource, a currency, a stat, or a piece of map access,
it does not belong here** — SM-INV-9's litmus test (*does it raise the floor / make late runs
comfortable?*) is the gate on adding anything, and the answer for all four is yes.

### `runSave` — one slot, suspend-and-resume, NOT exportable

Not a checkpoint. A pause button that survives closing the browser.

- **One slot per profile.**
- **Written on quit.**
- **Deleted on load** — resuming is not restoring. Read it, wipe it, then hand the state to the game.
  The delete must land *before* the game becomes interactive, so a crash mid-resume cannot leave a
  reloadable copy behind.
- **Deleted on death.**

Contents (per `run-shape.md` — kilobytes, because worldgen is meta-free so **the world is never
serialized**):

```
runSave = {
  version, worldSeed,
  runState,            // run age + run progress — the run-layer worldgen input (SM-INV-12)
  metaVersion,         // which metaState this run was started under
  truck: { conditionTracks, parts },
  inventory, position, orientation,
  timeOfDay, day, sleepiness,
  currency, activeMissions, clearedLogs,
}
```

**No export/import for `runSave`, deliberately.** A downloadable run save is a reload button with
extra steps, and it reopens exactly the exploit the delete-on-load rule closes. Export is a
`metaState`-only feature. Note this in the menus so it reads as a decision rather than an omission.

## Recommended design

1. **`src/save.js` — one `SaveStore` module, two named slots.** Narrow interface per slot:
   `loadMeta()` / `saveMeta(state)`, and `takeRun()` / `putRun(state)` / `clearRun()`.
   **`takeRun` is read-and-delete by construction** — there is no `loadRun` that leaves the record in
   place, so no consumer can accidentally implement a checkpoint. Game logic never touches storage
   directly, so the backend stays swappable.
2. **localStorage** as the live backend behind that interface (sync, ~5–10 MB, ample).
3. **Versioned, checksummed schema** per slot: `{ version, data, checksum }` + a `migrate(old)` hook.
   Reject corrupt / hand-edited records gracefully — for `runSave`, rejection means the run is gone,
   which is the correct failure direction.
4. **Export / import for `metaState` only** — JSON file download plus a copy-paste base64 code. This
   is the no-server durability story: survives cache-clear, moves a profile between devices, allows
   pre-update backups. Surfaced in the menus (FEAT-41), not a dev tool.
5. **Write cadence:** `metaState` on unlock / run end / menu transitions. `runSave` on quit (and
   optionally at day boundaries as crash insurance — but see the open question, because a
   day-boundary autosave is a checkpoint if the delete-on-load rule ever slips).

## Options considered (2026-07-21, still current)

- **Cookies — rejected.** ~4 KB cap, sent on every request (pointless with no server), same
  clearability as localStorage with worse ergonomics.
- **`localStorage` — chosen.** Both slots fit trivially.
- **`IndexedDB` — deferred.** Only worth the ceremony if saves grow large (per-run logs, replays).
  Not needed for kilobytes.
- **Cloud-without-a-server (future, not now):** File System Access API, a managed BaaS free tier,
  Drive/Dropbox app-data OAuth. All slot in behind the `SaveStore` interface later.

## Open questions (scope in plan mode)

- **Does `runSave` autosave at day boundaries, or only on quit?** Quit-only is the pure reading and
  cannot be gamed. A day-boundary autosave protects against a browser crash eating two hours — but
  only stays legal if delete-on-load holds absolutely, since otherwise it *is* a checkpoint. Lean
  quit-only for v1; revisit after real playtest crashes, not before.
- **What happens to an in-flight `runSave` when `metaState` changes version?** `metaVersion` is
  recorded so the mismatch is *detectable*; whether a stale run is migrated or discarded is a call
  worth making once, early.
- **Profiles: one or several?** "One slot per profile" implies profiles exist. A single implicit
  profile is fine for v1; note the key namespacing so adding profiles later isn't a migration.
- **Where does the "quit" write hook actually fire** — pause-menu quit only, or also `beforeunload`?
  A closed tab that never wrote a save silently costs the player their run.

## Acceptance

- [ ] `SaveStore` with `loadMeta`/`saveMeta` and `takeRun`/`putRun`/`clearRun`, backend abstracted
      behind the interface. **No API exists that reads a run save without deleting it.**
- [ ] Versioned `{version,data,checksum}` schema per slot, migration hook, corrupt-record rejection.
- [ ] `metaState` holds **only** unlocked starting vehicles + story keys, and is provably not an
      input to worldgen (SM-INV-12) — a gate asserting generation output is identical across two
      different `metaState` values on one seed.
- [ ] `runSave` round-trips a run across a full browser restart, and **loading it removes it** —
      verified by loading, then confirming a second load finds nothing.
- [ ] Death clears `runSave`.
- [ ] `metaState` export produces a re-importable file AND a copy-paste code; import round-trips
      exactly. **`runSave` has no export path.**
- [ ] Menu surface for meta export/import (coordinates with FEAT-41).
- [ ] Interface documented so a File System Access / BaaS backend can be added later without touching
      game logic.

## Notes

- `.planning/story-mode/DESIGN.md` is authority on what is stored; `run-shape.md` "Saving" is
  authority on the run save's rules. Do not invent persistence fields ahead of the design — and
  in particular, do not add a field to `metaState` without running SM-INV-9's litmus test on it.
- No infrastructure today: localStorage + meta export/import covers ~everyone. Cloud tiers are a
  later, optional swap — this ticket is the seam, not a server commitment.

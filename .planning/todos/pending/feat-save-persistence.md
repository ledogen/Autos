---
id: FEAT-42
type: feature
status: open
opened: 2026-07-21
severity: minor
source: user question 2026-07-21 — "how do we save roguelike metaprogression without maintaining a server?"
relates_to: story mode (.planning/story-mode/DESIGN.md — metaprogression, region unlock FEAT-28,
  mission economy FEAT-29/30), roguelike run persistence
depends_on: nothing to build the store; consumers (unlocks/currency/run history) land with story mode
blocks: any durable story-mode metaprogression — runs currently reset every session
---

# FEAT-42: Persistent save store for metaprogression (no server)

## Request

Story mode is a roguelike with metaprogression (region unlocks via FEAT-28, mission/par economy
FEAT-29/30, spirits, currency). Players must not lose that progress between sessions. Constraint
(CLAUDE.md): browser-only, single origin, **no server, no backend** — so persistence has to live
client-side or in someone else's managed cloud.

## Options considered (2026-07-21)

- **Cookies — rejected.** ~4KB cap, sent on every request (pointless with no server), same
  clearability as localStorage with worse ergonomics. Wrong tool.
- **`localStorage` — chosen default.** Sync key/value, ~5–10MB, survives restart/reboot, only
  cleared by explicit "clear site data" / incognito exit. Ample for the small metaprogression blob.
- **`IndexedDB` — deferred.** Async, structured, effectively unbounded. Only worth the ceremony if
  saves grow large (per-run logs, replays, screenshots). Not needed for metaprogression alone.
- **Export / import — chosen, as a first-class feature.** JSON file download + copy-paste "save
  code" (base64). This is the no-server durability story: survives cache-clear, moves saves between
  devices/browsers, allows pre-update backups, and keeps the save format legible for debugging.
- **Cloud-without-a-server (future upgrade path, not now):** File System Access API (player picks a
  real file in a Dropbox/iCloud folder → auto-syncs, Chrome/Edge only); a managed BaaS free tier
  (Supabase/Firebase — client-only, managed backend); Drive/Dropbox app-data-folder OAuth. All slot
  in behind the store interface later if accounts/leaderboards ever matter.

## Recommended design

1. **`src/save.js` — a `SaveStore` module** with a narrow interface: `load()` / `save(state)` /
   `reset()` / `export()` / `import(blob)`. Game logic never touches storage directly — so the
   backend is swappable (localStorage → File System Access / BaaS) without touching gameplay.
2. **localStorage** as the live backend behind that interface.
3. **Versioned, checksummed schema:** `{ version, data, checksum }` + a `migrate(old)` function.
   Future-proofs format changes across LLM sessions and lets us reject corrupt / hand-edited saves
   gracefully.
4. **Export/import in the menus** (both file download and paste-a-code) — the durability safety net,
   surfaced to the player, not just a dev tool.
5. Write occasionally (run end, unlock, menu transitions) — not per-frame; localStorage is sync.

## Acceptance

- [ ] `SaveStore` with load/save/reset/export/import, backend abstracted behind the interface.
- [ ] Versioned `{version,data,checksum}` schema with a migration hook and corrupt-save rejection.
- [ ] localStorage backend persists across a full browser restart (verified in-game).
- [ ] Export produces a re-importable file AND a copy-paste code; import round-trips a save exactly.
- [ ] Menu surface for export/import (depends on / coordinates with FEAT game-menus-ui work).
- [ ] Interface documented so a File System Access / BaaS backend can be added later without
      touching game logic.

## Notes

- Keep the schema aligned with whatever metaprogression fields story mode defines — do not invent a
  persistence shape ahead of the design (`.planning/story-mode/DESIGN.md` is authority on what's
  actually stored).
- No infrastructure today: localStorage + export/import covers ~everyone. Cloud tiers are a later,
  optional swap — file this as the seam, not a server commitment.

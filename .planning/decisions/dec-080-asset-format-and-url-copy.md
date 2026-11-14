---
id: DEC-080
status: standing
decided: 2026-08-05
area: assets
governs: assets/models/, vite.config.js, data/vehicle-models.js, src/model-service.js
supersedes:
---

# DEC-080: Assets are plain .glb files fetched by URL

**Ruling.** Hand-authored models ship as glTF 2.0 binary at `assets/models/<name>.glb`, textures embedded, no Draco or KTX2; they are fetched by relative URL and copied to `dist/` by the Vite plugin, never converted to `?url` imports.

**Why.** The pure-node gates read the same files; a bundler import would break them.

**Replaces.** Nothing.

**Source.** CLAUDE.md § 3D assets and § Technology Stack (dates from git: 2026-08-05, 2026-07-14). Owner's words.

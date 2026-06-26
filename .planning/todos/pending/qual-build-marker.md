---
id: QUAL-04
type: quality
status: open
opened: 2026-06-23
severity: trivial
source: user-request
note: "Request only — NOT being implemented yet. Dev-ergonomics: a visible build identifier so you can confirm at a glance WHICH build the browser actually loaded (GitHub Pages deploy lag + browser cache make this ambiguous when testing perf/behavior changes)."
---

# QUAL-04: Visible build marker (commit hash / build id in the debug panel)

## Goal

Show a short build identifier somewhere unobtrusive (debug GUI footer, or a corner of the HUD) so that
when testing on `ledogen.github.io/Autos/` you can immediately tell whether the loaded build is current
— GitHub Pages takes ~30–60 s to redeploy after a push, and the browser may serve a cached `main.js`,
so "is this the new code?" is otherwise a guess (hard-refresh + hope).

## Acceptance

- [ ] A short identifier (e.g. 7-char commit SHA and/or build timestamp) is visible in-game (debug
      panel footer or HUD corner).
- [ ] It reflects the actually-loaded JS bundle, not a value that can go stale independently.
- [ ] Costs nothing at runtime and needs no build system (project constraint: no bundler — must work
      from static GitHub Pages).

## Notes / approach options (no build step allowed)

- Simplest: a hand-or-hook-updated `export const BUILD = 'f514727'` constant committed alongside code.
  Risk: easy to forget to bump → stale. A git pre-commit/pre-push hook that stamps it removes that risk.
- Alternative: fetch the latest commit SHA from the GitHub API at runtime and compare to a baked-in
  constant — shows "current" vs "stale (cached)" explicitly. Slightly more moving parts; one network call.
- Or display the `Last-Modified` / `ETag` of `main.js` fetched at load — reflects the served bundle
  directly, no manual bump.
- Keep it tiny and out of the way; this is a testing aid, not a UI feature.

## Relationship

- **PERF-04** (adopt a bundler) — *combines directly*. This ticket's "no build step allowed" framing
  exists only because of the no-bundler constraint. If PERF-04 lands, the build id is free (output
  content-hash filename, or a Vite `define`-injected commit SHA) and this collapses to a trivial
  follow-on. Revisit QUAL-04's approach once PERF-04 is decided.

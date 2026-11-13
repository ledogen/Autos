---
id: BUG-164
type: bug
status: open
severity: major
opened: 2026-11-12
source: owner, 2026-11-13 inbox — "I noticed that all POIs are always loaded. I can see them through the fog"
relates: [PERF-44, PERF-41]
---
lane: engine & world (the perf session, with PERF-44's census)

# Every POI stays loaded and draws through the fog

## What

Two faults in one sighting. **Visual**: POI models are visible through the fog, so their materials ignore
it or they draw past the fog distance. **Cost**: every POI in the region is loaded and drawn at all times,
which is triangles, draw calls and shadow work the player cannot use. This belongs in PERF-44's triangle
census: measure what the always-loaded POIs cost before choosing the fix.

## Acceptance

- [ ] POIs fade with the fog like terrain and props; none visible beyond it.
- [ ] POI models beyond view distance are not drawn (and not in the shadow pass); measured saving reported with
  PERF-40 (GPU active cycles, main-thread ms/s).
- [ ] Map markers and mission logic are unaffected by a POI's model being unloaded.

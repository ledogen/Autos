---
id: PERF-50
type: perf
status: open
severity: minor
opened: 2026-11-14
source: owner, 2026-11-14 inbox — "I'm getting this light stutter on the windows machine with frame rate set to display rate It's specifically when props or terrain load in or…"
relates: BUG-169, PERF-48, PERF-45
---
lane: Perf

# PERF-50: Light stutter on Windows when props or terrain load in, or props change LOD

## Next steps
Perf lane measures on the Windows machine with the frame rate on display rate. Note the readout still shows 60 (BUG-169).

## Summary
A light stutter on the owner's Windows machine, only at the moments props or terrain load in or props change level of detail.

## Description
Inbox j6to:
> I'm getting this light stutter on the windows machine with frame rate set to display rate It's specifically when props or terrain load in or when props LOD themselves. As I mentioned in another message The frame rate is locked to 60 regardless at least according to the debug readout

## Tracker
- [ ] Reproduce and attribute the stutter (load-in vs LOD switch), per-second spikes not averages
- [ ] A fix or a spread of the work across frames, checked on the Windows machine

## Files
`src/props.js` · `src/terrain.js`

## Log
- 2026-11-14: minted from the owner's inbox by the scribe. Nothing built.

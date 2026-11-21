---
id: BUG-250
type: bug
status: closed
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "the liner is z fighting with the bed"
relates: FEAT-231, DEC-352, src/vehicle-model.js
---
lane: unplaced

# BUG-250: The bedliner z-fights with the truck bed

## Next steps
Done on land/visual-1120; owner looks at the screenshot sheet (wip/visual-1120/sheet.jpg).

## Summary
The FEAT-231 liner's wheelhouse covers had their inner face exactly on the real wheelhouse's: two coplanar faces, so the depth buffer flickers between them.

## Tracker
- [x] The liner has no face within a skin of a real surface; clean from above and from behind at two distances
- [x] Screenshot sheet looked at

## Files
src/vehicle-model.js

## Log
- 2026-11-20: wheelhouse covers' inner face moved a skin (12 mm) proud of the wheelhouse's, which it had coincided with. Looked at from above and from behind at 3.8 m and 8 m: no flicker. Gates: see branch head.
- 2026-11-20: the wheelhouse covers' inner face was coplanar with the real wheelhouse's; moved a skin (12 mm) proud. Looked at from above and from behind at 3.8 m and 8 m: no flicker.

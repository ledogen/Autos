---
id: FEAT-220
type: feature
status: open
severity: minor
opened: 2026-11-14
source: owner, 2026-11-14 inbox — "The camera should be locked from the player rotating it when inside the service center Otherwise they can pan it outside the wall and it obs…"
relates: FEAT-219, src/service.js, src/camera.js
---
lane: B

# FEAT-220: Service center: camera locked, right-stick click snaps between viewpoints

## Next steps
Lane B builds it. The owner suggested the viewpoints; "bumping right stick" is read as clicking the stick (confirm).

## Summary
The player can pan the camera through the service center wall and lose the view. Lock free rotation inside, and let the right stick click cycle fixed viewpoints.

## Description
Inbox 8i14:
> The camera should be locked from the player rotating it when inside the service center Otherwise they can pan it outside the wall and it obstructs the view completely ticket for multiple camera angles inside the service center So bumping right stick just snaps the camera to a different viewpoint inside Maybe like a closer head height side view and maybe one outside the door looking in at the rear of the truck

## Tracker
- [x] Player camera rotation locked inside the service center
- [x] Right-stick click (pad) snaps between fixed viewpoints, with a keyboard/mouse equivalent
- [x] Viewpoint: a closer head-height side view
- [x] Viewpoint: outside the door, looking in at the rear of the truck
- [x] Leaving the service center restores the normal camera

## Open questions
- "bumping right stick": stick click (R3), or a flick? Built as the click. DEC on controller buttons: fewest buttons on menus (feedback_controller_button_budget); R3 is free in the service screen.

## Files
`src/service.js` · `src/camera.js` · `src/input.js`

## Log
- 2026-11-14: minted from the owner's inbox by the scribe. Nothing built.
- 2026-11-14 (lane B): built. Locked focus in camera.js (setCameraViews: drag and right stick ignored, C cycles); views = the model's bay-B corner + two more in data/prop-models.js `cameraViews` (passenger-side head height, outside the door at the rear). R3 was already bound (button 11 -> C = camera mode); inside the service it cycles viewpoints, binding table unchanged apart from its label (DEC-062 holds: no new button). Checked headless: 3 viewpoints cycle and wrap, drag does nothing; shots in wip/service-center/. Unverified: a real pad, and the unlocked fallback for shops with no model camera.

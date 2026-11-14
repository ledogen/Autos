---
id: FEAT-208
type: feature
status: open
severity: minor
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "Let's ticket this post alpha idea I've had rolling around in my head for a very long time. I think it would be really cool to have a phone call mechanic. In its most elegant form, you can see how far away the service station is from you but you don't know what products are for sale unless you give them a call. The cost of the call could either be the phone's battery, which means only a certain number of calls in a day, or it could be a time penalty. Five to fifteen minutes seems like the right amount. This could also be expanded to points of interest. At its most hardcore, you don't even know if a point of interest has a mission until you show up or call them. calling your mom could provide valuable intel, a weather forecast, or favor with the spirits. could be a fun subsystem"
relates: FEAT-67 (the offer board), FEAT-104 / FEAT-137 (shop and rotating shelf), src/recovery.js (the existing tow call), spirits-and-pacts.md, IDEAS.md
---
lane: unplaced

# FEAT-208: Phone calls — pay time or battery to learn what a place has before you drive there

## Next steps
Post alpha (owner). A design idea, not a spec; the owner decides its shape at entry.

## Summary
A phone. You can see how far a service station is, but not what it sells, until you call. A call costs something: phone battery (a few calls a day) or clock time (5 to 15 minutes).

## Description
### The idea, in the owner's layers
- **Elegant form:** stations show distance only; a call reveals the shelf.
- **Cost of a call:** battery (a daily cap on calls) *or* a time penalty of 5–15 min. One of the two.
- **Extended to POIs:** a call tells you whether a place has a job.
- **Hardcore form:** you do not know a POI has a mission at all until you arrive or call.
- **Calling your mom:** intel, a weather forecast, or favour with the spirits.

### What it changes
Today the map and the offer board show jobs and shops freely. This makes that information something you buy, so it touches the offer board (FEAT-67) and the map spec. The tow call in `src/recovery.js` is the one phone call the game already has.

## Tracker
- [ ] Owner picks the cost (battery or time) and how much information is hidden by default
- [ ] Shop shelves hidden until called or visited
- [ ] POI jobs hidden until called or visited (if the hardcore form is chosen)
- [ ] The mom call

## Decisions
- 2026-11-13, owner: post alpha.

## Open questions
- Battery or time?
- Is hidden information the default, or a difficulty setting?

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.

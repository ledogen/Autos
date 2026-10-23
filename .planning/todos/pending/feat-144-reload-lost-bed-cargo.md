---
id: FEAT-144
type: feature
status: open
severity: minor
opened: 2026-10-22
source: owner, 2026-10-22 — "a feature where you can go to a dropped piece of haul cargo and hit a d-pad button or something and it instantly gets teleported above the truck bed and falls back in. Maybe it takes five minutes or something. Let's say I drive all the way to the auto shop and bounce the tire out of my bed right there. It'd be cool if I could just drive back over, put it in the truck, then go to the shop and continue with the mission. Similarly with firewood: if I bounce a couple pieces off I think it should be up to the player if they want they can go pick up their lost pieces. It will take a long time but it's something a desperate player would do if they had an awesome reward."
relates: FEAT-88 (haul — loose bed pieces, pay × pieces aboard), feature/stranded-spare (the motorist's loose tire), FEAT-143 (world items — pick up from the ground), FEAT-125 (pad button budget — D-pad kept free for actions)
---

# FEAT-144: Reload lost bed cargo

## What

Loose bed cargo that falls out stays where it lands, and the player can go back for it. Stop next
to a lost piece and press one button. The piece is teleported to just above the bed and drops back
in, the same way it was loaded at accept. Each reload costs game time: about **5 minutes** on the
world clock, which is also on the job's clock (owner's first number, a tuning knob).

This works for any loose bed cargo:
- **The stranded motorist's tire.** Bounce it out on the way to the shop, drive back, reload it, and
  carry on with the job.
- **Haul pieces (firewood bundles).** Picking up a lost piece is the player's choice. It is slow, but
  it is worth it when the reward is good. Pay already counts the pieces aboard at delivery, so a
  reloaded bundle pays again with no economy change.

## What this changes

- **A lost tire no longer fails the job at once.** Today, a tire out of the bed for more than 1 s
  fails the job (`main.js` `_looseStep`, `LOOSE_LOST_S`). With reloading, a dropped tire becomes
  "go get it" instead. The fail moves to delivering, or parking at the shop, without the tire, or it
  goes away (see the questions below).
- **The lost piece must stay alive.** Debris bodies are pinned (outside `DEBRIS_CAP`) for the life
  of the job, so a dropped piece already persists where it lands. Check that nothing despawns it
  when its chunk streams out.

## Open questions (owner's to answer)

- **Button.** On the pad, a D-pad direction, since the D-pad is kept free for actions (FEAT-125). Or
  should it go in the B-hold side menu? Which key on the keyboard?
- **Reach.** How close must the truck be: a few metres from the piece, with the truck stopped or
  parked?
- **Cost.** 5 minutes per piece, or per press, picking up everything in reach? A reload of 4 bundles
  at 5 min each is 20 minutes.
- **Tire fail rule.** With reloading, what fails the motorist job: arriving at the shop without the
  tire, the deadline running out, or nothing (the job just can't finish until you fetch it)?
- **Freight and fragile.** These are strapped loads that can't fall out today. Is this loose cargo only?
- **Overlap with FEAT-143.** Picking items up off the ground is the same gesture as FEAT-143's
  proximity pick-up. Should it be one button with one reach rule for both?

## Acceptance

- To be written once the questions above are ruled.

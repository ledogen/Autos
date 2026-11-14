---
id: FEAT-216
type: feature
status: open
severity: major
opened: 2026-11-14
source: owner, 2026-11-14 — "We need damage alerts. I thought it could be slick and get away with sound and visual effects but i think we need alerts for driving on a flat, driving on a failed tire, air filter starting at the wear drop off threshold, oil at its threshold. add bent a wheel (10% threshold).for bump stops (spring damage) I think the sound effect can be improved but is sufficient. Same with body panels"
relates: FEAT-202, BUG-160, src/damage.js
---
lane: B

# FEAT-216: Damage alerts

## Next steps
Lane B, after the physics trio (BUG-166 / 167 / 160). The alert's words and look are the owner's to approve.

## Summary
Sound and visual effects alone do not tell the player the truck is being hurt. Five conditions get an
on-screen alert. Spring (bump stop) and body-panel damage stay sound-only; their sound can be improved.

## Tracker
- [ ] Alert: driving on a flat tire
- [ ] Alert: driving on a failed tire
- [ ] Alert: air filter reaches its wear drop-off threshold
- [ ] Alert: oil reaches its threshold
- [ ] Alert: a wheel is bent (10 % threshold)
- [ ] No alert for bump stops or body panels (sound only)
- [ ] Owner's look at the alert's words and style (UI-STYLE.md)

## Open questions
- The wording of each alert (words on screen are the owner's).

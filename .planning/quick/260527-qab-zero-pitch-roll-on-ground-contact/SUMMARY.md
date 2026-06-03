---
slug: 260527-qab-zero-pitch-roll-on-ground-contact
status: complete
completed: 2026-05-27
commit: 0a29967
---

# Summary

Added two lines to the ground constraint block in stepPhysics. When maxPenetration > 0,
now zeros angularVelocity.x (pitch) and angularVelocity.z (roll) in addition to the
existing velocity.y zeroing. Yaw (angularVelocity.y) left untouched.

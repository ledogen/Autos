---
slug: 260527-qac-camera-grid-torque
status: complete
completed: 2026-05-27
commit: 3695fc5
---

# Summary

camera.js: chase mode extracts euler.y from vehicle quaternion, rebuilds yaw-only Q for goal offset.
main.js: ground and grid position snapped to car each frame at 2m cell granularity.
ranger.js: maxDriveTorque and maxReverseTorque 400→800 N·m. maxBrakeTorque unchanged at 3000.

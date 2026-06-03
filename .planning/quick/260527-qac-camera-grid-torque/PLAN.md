---
slug: 260527-qac-camera-grid-torque
title: Camera yaw-only, infinite grid snap, double tractive torque
status: in_progress
created: 2026-05-27
---

# Three polish fixes

1. src/camera.js — chase goal offset uses yaw-only quaternion (extract euler.y, rebuild Q)
2. src/main.js — ground + grid snap to car position each frame (2m cell size)
3. data/ranger.js — maxDriveTorque/maxReverseTorque 400→800

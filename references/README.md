# References

Prior prototype files — kept for reference, not for active development.

| File | Description |
|------|-------------|
| backup11.html | Earlier prototype build |
| backup12.html | Latest stable prototype (suspension + sliders working) |
| backup12alt.html | Alternate of backup12 with minor tweaks |
| PROJECT.md | Original project notes from prototype era |

## What worked in the prototype
- Ackermann steering geometry
- Pacejka Magic Formula implementation (C < 2.0 constraint)
- Fixed timestep accumulator loop
- Smooth friction circle coupling (lateral priority + penalty)
- Debug slider menu feel and responsiveness
- Live Pacejka curve with operating point dot

## What failed
- Euler angle gimbal lock at 90° roll/pitch (`rotation.order = 'YXZ'`)
- Linearized suspension corner geometry (sin(pitch) + sin(roll) approximation)
- Static normal force (mass/4 per wheel, no load transfer)
- Wheels as scene-level objects decoupled from body quaternion

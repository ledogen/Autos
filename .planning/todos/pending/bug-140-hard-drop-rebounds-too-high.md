---
id: BUG-140
type: bug
status: open
severity: major
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox
relates: FEAT-70 (tire contact), suspension.js bump stops, BUG-27 (body restitution)
---
lane: B

# BUG-140: a drop onto the wheels from 2 m or more rebounds too high

Owner, verbatim (2026-11-07 tracker inbox): "When the vehicle is dropped onto its tires from a height of about 1 meter the response seems natural When it's dropped onto its wheels from a height of about 2 meters I think it bounces a little bit too high The effect is compounded with even higher drops meaning that any drop over about 3 meters has a chance to launch the car back up into the air and it can even flip over as an effect I think typically if you drop a car really hard in real life it doesn't bounce that high off of the ground compared to what it would do from a low drop This testing was performed in free room which means I was using a vehicle with 100% springs and dampers My suspicion is that there's something in the code causing excessive rebound when the vehicle is dropped onto its tires from about 2 meters and higher."

## Acceptance

- [ ] Rebound height against drop height measured for 1, 2, 3, 5 m drops (fresh springs and dampers), and the energy returned per drop.
- [ ] The cause named (bump stop, tire, damper saturation, or the solver), with the physics the owner can check.
- [ ] Rebound falls with drop height the way a real truck's does; a gate pins it.

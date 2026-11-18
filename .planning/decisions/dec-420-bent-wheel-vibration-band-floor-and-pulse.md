---
id: DEC-420
status: standing
decided: 2026-11-18
area: ui
governs: FEAT-287, FEAT-247, BUG-206, src/pad-rumble.js, controller vibration, rumble, bent wheel
supersedes:
---

# DEC-420: A bent wheel vibrates the controller only below 60 % condition, in a 10–25 mph band peaking at 17, pulsed at the wheel's turn rate

**Ruling.** "Vibration effects due to a bent wheel should be more pronounced from about 10 to 25 miles per hour, peaking in the middle there, around 17. At really low speeds, they don't build up enough energy to to actually vibrate the vehicle. At very high speeds, their resonance is much too high of a frequency to excite the entire wheel. But in the middle, they hit a natural frequency that does come through the steering wheel. Any wheel that's more than about 60% should never produce a bent wheel vibration. If a wheel is heavily bent, like below 25%, then you should be able to feel it even at high speeds. As a player it is quite annoying to just have the controller vibrating all the time so I think we should only run the motors if the car is really fucked up. Wheel vibrations should also try to pulse an intensity to match the frequency of the wheel revolutions. Basically, take what we have, raise the vibration floor to 60% and scale the bent wheel vibration output to peak at 17mph and be dead by 25mph. Also, pulse it at the rate at which the wheel turns."

**Why.** A bent wheel shakes the truck near a resonance, not at every speed; constant controller vibration is annoying, so the motors run only when the truck is badly damaged.

**Replaces.** FEAT-247's bent-wheel source, which scaled with runout at any rolling speed.

**Source.** Owner, in chat, 2026-11-18.

---
id: DEC-328
status: standing
decided: 2026-11-16
area: physics
governs: BUG-185, src/world-contacts.js, src/damage.js, test/side-tree-wheel.mjs, wheel damage, side impact, armor
supersedes:
---

# DEC-328: A square side hit on a tree lands on the body, not the wheel

**Ruling.** "side hit a" — the owner's choice on card `bug185-side-hit`, option "(a) keep it: the body is the armor".
As built: a prop beside a wheel is measured against the tire's real width (0.235 m), so the body flank (1.75 cm
outboard of the tire) meets a trunk first at every speed; the wheel and tire take nothing from a square side hit and
the impact lands on the side armor. A hit on the tread, a landing, a rock or a kerb bends a wheel as before.

**Why.** The owner (2026-11-16): "I smacked the rear wheel into a tree and it gave out… I'm just wanting a little bit
more forgiveness there." The cause was a 0.37 m sphere standing in for the tire, felt 25 cm outboard of it. The real
truck's body stands outboard of its tires, so the body taking the hit is the honest result.

**Replaces.** Nothing. Options (b) pricing the wheel on the struck corner's speed change and (c) a retune were declined.

**Source.** Owner, chat, 2026-11-16; card `bug185-side-hit`; ticket BUG-185.

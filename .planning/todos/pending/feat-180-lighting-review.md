---
id: FEAT-180
type: feature
status: open
severity: minor
opened: 2026-11-06
source: owner, 2026-11-06 playtest (via the orchestrator)
relates: BUG-112 (bore lighting), the sky / day clock (SM-1), POI halos
---
lane: Spare

# FEAT-180: a lighting review and interview, then a sun that lasts until about 8 pm

Owner, verbatim: "I think we could do a bit better on the lighting system And Skybox. Go ahead and create an artifact
with screenshots of the car on a road with a landscape in the background at different times of day. And then design
some questions For me to help understand what it is about the lighting system that isn't doing it for me. My initial
thoughts are at dawn. The world appears dark, the sun is bright, and the fog is orange and also quite bright. Certain
things like the POI halos are distractingly bright at nighttime and low light dawn and dusk. During daylight everything
works pretty well but the lack of clouds and definition in the sky is definitely a limitation. The way we handle being
in the shadow of a mountain is also tricky. Sometimes it feels like you drive into a shaded area spontaneously and it's
extremely dark. Sometimes it kind of pops in when the mountain loads into draw distance. I don't exactly know what I
don't love about the current lighting, but let's get the questions and screenshots and hopefully you can interview me to
figure out what it is I think is lacking. Maybe go over the systems we have in place and how the current lighting system
works so I have a basic understanding and can speak the language."

And: "The sun sets a little bit too early. I'd like for a player to be able to comfortably drive until about 8pm before
The low light starts really being limiting"

## The deliverable first (orchestrator, 2026-11-06): ONE artifact

- Shots of the truck on a road with landscape behind, at several times of day, on random seeds (never seed 6 alone).
- A plain-language explainer of how the lighting works today: sun, sky, fog, shadows, the far-terrain shade, POI halos.
  GPU terms get a one-line gloss each.
- The interview questions.
- A sun-until-8-pm proposal with before/after shots.

**Change nothing in `src/` until the owner answers.**

## Acceptance

- [ ] The artifact, in front of the owner.
- [ ] The owner's answers → a scoped build ticket (or tickets).

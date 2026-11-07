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

- [x] The artifact, in front of the owner.
- [x] The owner's answers → a scoped build list (below).
- [ ] Pieces 1–7 landed, each proved; the combined shot sheet in front of the owner (the dusk interview).

## The review page (Spare, 2026-11-07)

https://claude.ai/artifact/DxWoxDmsUvjoaQ8CxxCksm. Built by `wip/feat-180/` (`shoot.mjs`, `gen-page.mjs`, `curve.mjs`, `page/`).
`src/` is untouched: the 8 pm frames swap `SKY_CYCLE.keyframes` in-page.

- **Shots:** the truck on a road at 05, 06, 07, 09, 12, 16, 18, 19, 20 and 22:00 on random seeds 3583777560,
  1172941705 and 701336435. Normal preset (the default), fog on, low-beam frames at 05, 20 and 22:00. Each spot is
  a road facing the evening sun with open ground falling away ahead.
- **The explainer:** looks and keyframes, the Preetham sky and its cubemap, the key / fill / moon lights, exposure
  and ACES tone mapping, FogExp2 by preset, the two shadow maps, and what ignores the light (the rings).
- **Findings from the code and the shots:**
  - Dawn is a 3 h blend with linear fog over a sky that jumps.
  - The key light slides between the moon and the sun at dawn and dusk.
  - The sky-sun swings 205° below the horizon.
  - The rings never dim.
  - Mountain shade ends about 200 m out and pops in as terrain streams.
  - Shade at low sun loses about two-thirds of the light on a sun-facing slope.
  - **The world's edge is a flat fog-coloured band with a hard line at the horizon**, the brightest thing at dawn.
  - There are no clouds.
- **Nine questions:** the owner answers in tracker item `feat180-lighting`.
- **The 8 pm proposal:** evening 18:00 → 19:30 and night 20:00 → 21:00. The sun sets about 20:12 instead of 18:56.
  It shifts the opening's light (18:00 becomes 17° afternoon sun, question 9).
- **Ring frames dropped.** A skipped opening leaves the casserole job running, and rings hide while you're on a job.
  Question 3 relies on the owner's own experience of the rings.

## The owner's answers (feat180-lighting, 2026-11-07 17:52Z, verbatim)

"General: clearly visible in the first couple screenshots on the first seed the sky color does not match the color of
the void below the horizon when there's no terrain blocking the skybox the sky clearly cuts off on a sharp line and
it's super jarring we should extend the skybox so that it wraps at least 45 degrees below the horizon something like
that seems like the simplest illusion to me but maybe there's a better one that you know of. You said headlights are
off when the Sun is up. I don't know if that's entirely true because they're definitely present Maybe the brightness
is adjusted though 1. ground should be darker if sky is still black. Or bring sky up a little bit. Fog looks like it's
adding light to the scene i.e. distant objects are brighter than near ones 2. We already have moon phases so it should
be reflective of that. I would describe current state as super dark i.e. what new moon should be. you can only really
see the road lines near the player not in the distance. Full moon should be bright enough to see without headlights
but barely 3. A 4. E then A 5. Honestly it works well but sometimes terrain pop in means the shadow under you changes
abruptly. I don't see a great fix except maybe fading it in? 6. All of those things are good. The sky isn't amazing.
But shadows, shading, colors and contrast are good imo. Not a huge fan of the fog but it's a necessary evil. I would
probably prefer to desaturate the fog slightly at all times of day 7. not exactly. I love the art style of Zelda botw
but my game is supposed to take place in the high sierras of California so its going to be a little browner and
grayer and Zelda's Swiss alps in springtime look. But the lighting and relatively low poly look is similar to my goal
8. Night should add challenge esp on new moon. Headlights should make it doable. I think the current look and
headlight performance captures "new moon but your headlights work" quite well 9. Approve. Keep dusk opening. But we
need to make dusk look nice"

## The build list (orchestrator, 2026-11-07): build now, in this order

Each piece lands on its own when green (smoke solo through the slot). No owner look per piece: ONE combined shot sheet
(random seeds; dawn, noon, dusk, new-moon and full-moon night) after 1–5 land, which is also the dusk interview
("we need to make dusk look nice").

1. **The horizon** (General + 4e). Lose the flat band and the hard line where the sky meets the world's edge.
2. **Fog** (1 + 6). Fog is never brighter than the land it covers (dawn and dusk especially), and slightly
   desaturated at every hour. Dawn: land and sky agree (darker ground while the sky is black, or the sky up a little).
3. **POI rings dim with the light** (3a).
4. **Night by moon phase** (2 + 8). New moon = today's night exactly (protect "new moon but your headlights work");
   full moon = the road just drivable without headlights.
5. **The 8 pm sun** as proposed (evening 18:00 → 19:30, night 20:00 → 21:00). The opening keeps dusk light: move
   OPENING_START (hour 18) to the new dusk and fix any text that names 6 pm.
6. **Mountain shade fades in** instead of popping as terrain streams (5).
7. **Clouds:** faceted, flat-shaded cumulus (4a), after the horizon.

- **Protect** (6): daylight shadows, shading, colours and contrast. Prove noon unchanged with before/after shots.
- **Reference** (7): BotW's light and low-poly look in a browner, greyer High Sierra palette. A direction, no frame pulls.
- **Headlights by day (checked, General):** the review page was wrong. Nothing switches them off by sun height: the
  player's L key sets off / low / high at any hour. By day the CAST beams run at 10 % of their night strength
  (`LIGHT_ENV.dayScale` 0.1 in `src/vehicle-model.js`, ramped to 100 % by the sky's night factor between a sky-sun
  4° up and 6° down), and the lens glow on the truck's face is full strength at every hour.

## Pieces 1 + 2 built (Spare, 2026-11-07): the horizon and the fog — `src/sky.js` only

They land together. Piece 1 alone makes dawn worse: the too-bright dawn fog would bleed up into the black sky.

- **The horizon (1).** The fog-coloured ground disc in the sky bake is gone. Its top edge against the raw sky WAS the
  line. Instead the sky shader itself (three's Sky, patched in `SkySystem`'s constructor) paints every direction
  below the horizon in the fog's radiance and converges the sky on that colour over the lowest `HAZE_DEG` (8°).
  Fogged land, the world's edge and the sky now meet with no line, in baked and live mode alike.
  - **Why not the owner's "wrap the sky 45° below":** the fogged terrain at the draw edge must match what is behind
    it below the horizon. With the sky wrapped down, every distant ridge would show as a fog-coloured shape against
    sky-coloured void: the line moves onto every silhouette. Converging the sky onto the fog keeps one colour from
    the fogged land through the void to the horizon, then blends it into the sky.
- **Land and sky agree at dawn and dusk (2).** Between night and a lit look, the light on the land (key, fill,
  exposure, fog) now follows the sky's own brightness (the Sky shader's vSunE^1.5 at the sky-sun's height,
  `skyBrightness`), not the clock. The sky stays black until the sun is 2.3° under the horizon, then brightens
  steeply. A light that blended linearly in time lit the land while the sky was black: at 05:00 it was 33 %
  morning. It is now 1.2 %. The sky's own fields still blend by time, so the sky is unchanged. Morning → day →
  evening blends are unchanged (both looks lit).
- **Fog never brighter than the land (2).** `fogRadiance()`:
  - The fog is first desaturated 20 % at every hour (`FOG_DESAT`, the owner's "slightly").
  - Then it is capped so fog ÷ land is never above the day look's own ratio. The day look sits exactly on the cap,
    so noon keeps its brightness.
  - "Land" is ground of every slope under the look's key and fill: the key's share is (1 + sin el) / 2.
  - The morning look was 2.8× over the day ratio (its fog is now ×0.36) and the evening 4.2× over (×0.24).
  - Night is under the ratio and untouched, beyond the desaturation.
- **Proof (wip/feat-180/look.mjs on the review's spots, before = main):**
  - **Noon:** in the lower half of the frame, 0.2 % of pixels move > 4 levels (the truck's settle, grass edges).
    The changes are the far band (desaturation) and the old line.
  - **Dawn:** the cream band under a black sky at 05:00 and 06:00 is gone; the land is dark until the sky comes up.
  - **New-moon night:** the same as today's, but for the softer horizon.
- **Open for the dusk interview:** facing a low sun, the capped haze reads as a darker band under the glow. The rule
  as written makes it so. The alternative is fog that keeps its authored brightness only toward the sun (lit from
  behind, as real haze is), which bends "never brighter than the land" there.

## Piece 3 built (Spare, 2026-11-07): the rings dim with the light — `src/main.js`, `src/sky.js`

Owner 3a: "dimmed with the light, like everything else".

- **What dims.** Every curtain `_ringMat` makes: the POI rings, the pump zones, the start and target rings, and the
  scenario light columns. Each keeps its authored colour in `userData.base`.
- **How.** Each frame the colour is re-set from the dust and smoke's own light multiplier (`particleLight`), divided
  by the day look's value. So noon is exactly the authored colour; without that division it would carry the
  dust's 5 % blue cast.
- **Measured** in a story run on seed 3583777560 (`wip/feat-180/ring-read.mjs`, display sRGB of the orange ring):

  | Hour | Orange ring | Note |
  |---|---|---|
  | 12:00 | 255, 122, 24 | 0xff7a18, untouched |
  | 17:00 | 227, 79, 9 | |
  | 18:00 | 220, 68, 6 | warmer and redder in the evening light |
  | 19:00 | 95, 42, 5 | |
  | 20:00+ | 78, 38, 5 | about 30 % of noon, with the night's blue cast |

  The blue pump zone goes 79, 200, 255 → 18, 67, 110.

## Piece 5 built (Spare, 2026-11-07): the 8 pm sun and the 19:30 opening — `src/sky.js`, `src/main.js`, `src/day.js`

Owner 9: "Approve. Keep dusk opening."

- **The sun.** The evening keyframe moves 18:00 → 19:30 and full night 20:00 → 21:00, as proposed.
- **The opening.** It starts at 19:30 (`OPENING_START`), the evening look's own keyframe, which is the light 18:00 had
  before the move. The smoke's firing checks read 19:30 and the HUD's "Day 0, 7:30 pm" (BUG-136's check).
- **What the land's light does now.** With pieces 1+2 the land follows the sky's brightness, so it is two-thirds of
  the way to night at 20:00, while the sun is still 2° up. That is earlier than the review's table, which assumed a
  blend linear in time.

| Hour | Sun | Headlight beams (night factor) | Land's light, share of night |
|---|---|---|---|
| 17:00 | 23° | 0 % | 0 |
| 18:00 | 16.6° | 0 % | 0 |
| 19:00 | 10.2° | 0 % | 0 |
| 19:30 | 7° (the evening look) | 0 % | 0 |
| 20:00 | 2° | 20 % | 0.67 |
| 20:15 | −0.5° (sunset ~20:12) | 45 % | 0.91 |
| 20:30 | −3° | 70 % | 1 |
| 21:00 | −8° | 100 % | 1 |

So the light is full until 19:30 and limiting from about 20:00: the owner's "comfortably drive until about 8 pm".
Whether the 19:30–20:15 dusk looks nice is the combined sheet's dusk interview.

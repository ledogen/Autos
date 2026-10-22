# UI Style — the 2D layer

The rules for everything drawn over the world: menus, HUD, cards, prompts, the map's chrome. The 3D
look is `ART-STYLE.md`; this is its sibling for the screen.

**Baselined 2026-10-20 from what was already shipped** (owner ruling the same day). Nothing here is
a new look: it names the language the game already speaks so new UI stops inventing near-copies of
it. Where today's code disagrees with this file, this file is the target.

**Where the tokens live:** the `:root` block at the top of `index.html`'s `<style>`. They are CSS
custom properties (named values declared once, used as `var(--key)`). They work in `index.html`, in
the CSS strings that `damage-screen.js` / `inventory-screen.js` inject, and in inline
`style="color:var(--money)"` markup built by JS. **Canvas drawing cannot read them.** The map,
gauge cluster and debug plots set colours in JS and stay outside this palette. Never pick a value
"close to" an existing one: that habit is how the game ended up with four "press this" yellows.

## 1. Two families, by who is talking

| Family | Who is talking | Where | Accent |
|---|---|---|---|
| **System** | The game as software | boot splash, main menu, pause, settings, run setup, seed prompt, load caption | `--accent-system` green, used on the title, the focus bar and slider fills |
| **Story** | The world, talking to the driver | offer, camp, paper, dialogue and scenario cards; the run HUD; prompts | `--accent-story` blue, used on the card title and the speaker name |

Pick the family by who is talking, not by where the element sits on screen. A settings page opened
from pause is still System. A job card opened from the map is still Story.

Developer chrome is outside this guide: the debug HUD (`#hud`), lil-gui, stats, the debug plots
and the damage diagnostic readout (`damage-hud.js`). It takes the pinned font, and nothing else
here applies.

## 2. Real objects copy the object

If a UI element *represents a real-world thing*, it looks like that thing: its colours, its
material, its typography. Everything else uses the dark panel. This is the screen-side version of
ART-STYLE's "man-made objects are saturated".

- **Reference piece: the pump face** (`#pump-display`, FEAT-50). It copies the gauge on
  `gas-pump.glb`: black bezel, red GASOLINE band, cream face, mechanical drum digits.
- The camp tent icon is the National Park Service tent sign: white stencil on NPS brown.

The gauge cluster (`cluster.js`) is a real object too: an instrument face drawn on a canvas.

Real-object elements are exempt from the token palette, the type scale and the minimum font size,
because the object sets them. They still use the pinned font unless the real object clearly does
not (the pump's drums are mono anyway).

## 3. Tokens

These are the canonical values. Each "Replaces" column lists the drifted copies that fold into it
when the `:root` block lands.

Every text, line and meaning colour is a token. Shading may stay literal: shadows, gloss
gradients, and translucent tints of a token colour (e.g. `rgba(255,159,67,0.14)` behind a `--poi`
border).

### Surfaces and lines

| Token | Value | Use | Replaces |
|---|---|---|---|
| `--hud-bg` | `rgba(0,0,0,0.6)` | Readouts you look *through*: mission HUD, wallet, energy, GPS | 0.55, 0.62, 0.66 |
| `--card-bg` | `rgba(0,0,0,0.86)` | Things you *read*: mission, paper, dialogue and scenario cards | 0.72 |
| `--menu-bg` | `rgba(0,0,0,0.7)` | Menus you *sit in* with the world still visible: pause, seed prompt, camp card | 0.82 |
| `--scrim` | `rgba(4,7,10,α)` | Gradients over the menu stage (α ramps 0.94 → 0) | — |
| `--line` | `#3a4450` | HUD box border, dividers | `#3b4753`, `#3a4650`, `#2c343d` |
| `--line-card` | `#4a5a6a` | Card / modal border | `#444` |
| `--line-control` | `#55606b` | Button border, bar outline | `#555` |
| `--line-hover` | `#8fa2b4` | Hovered button border | `#888` |

### Text

| Token | Value | Use | Replaces |
|---|---|---|---|
| `--text-bright` | `#ffffff` | The number that is the news, hovered text | `#fff` |
| `--text` | `#e6ecf2` | HUD readouts | — |
| `--text-body` | `#cfd6dd` | Card and menu body text | `#cccccc`, `#d8d8d0`, `#b9c4cd` |
| `--text-dim` | `#8a939c` | Secondary lines, labels | `#8fa0b0`, `#9fb3c8`, `#a8b0b8` |
| `--text-faint` | `#6a7a88` | Hints, footers, placeholders | `#55636f`, `#6b747d` |

### Meaning colours

One colour, one job. The JS palettes (`RANK_COLOR`, `STAGE_COLOR`, `FAMILY_COLOR`) already share
this ramp. The CSS drifted from it; the CSS is what moves.

| Token | Value | Means | Replaces |
|---|---|---|---|
| `--accent-system` | `#00ff88` | System family accent (§1) | `#00c870` |
| `--accent-story` | `#7fc2ff` | Story family accent, navigation and GPS | `#7fc3ff` |
| `--key` | `#ffcf3c` | "Press this": key glyphs, countdowns, good deeds | `#ffd54a`, `#ffd43b` |
| `--money` | `#8ce99a` | Money, GO, a hit, good news | `#2fe6ff`, `#7ed957` |
| `--accept` / `-text` | `#5ad06a` / `#b6f0be` | The affirmative button | — |
| `--warn` / `-line` / `-text` | `#ffb020` / `#b8801f` / `#e8d7b0` | Caution that is not failure: load verdicts, refused seed, a missed throw | `#ffd43b` |
| `--bad` / `-line` / `-text` | `#ff5a4e` / `#8a4a44` / `#ff8a7a` | Failure, abandon, overload, damage | `#ff6b6b`, `#ff6b5b`, `#ff8f7a`, `#c0392b`, `#e0705c` |
| `--poi` / `-text` | `#ff9f43` / `#ffb066` | Points of interest, recovery | `#ff7a18`, `#ffd9a8` |
| `--camp` / `-text` | `#ffdc3c` / `#ffe89a` | Camping (map casing, tent "on", camp prompt) | — |

The `-text` variant is the light tint used for body text on that colour's panel. The `-line`
variant is a darker border for a resting state.

`--key` and `--camp` are deliberately two different yellows (the camp one is the map's casing ink).
**Do not add a third.** `--warn` is amber so it can never be mistaken for "press this".

### Domain palettes: one owner each, never copied

Some data needs its own colour code. Each code lives in exactly ONE place, and every surface that
shows it reads from that place.

| Palette | Owner | Notes |
|---|---|---|
| Rank S/A/B/C/D | `RANK_COLOR`, `src/economy.js` | rank timer strip, tiles, cards |
| Energy stages | `STAGE_COLOR`, `src/day.js` | energy meter, sleep bar |
| Job family | `FAMILY_COLOR`, `data/map-icons.js` | map diamonds |
| Camp vibe (flat / view / shade / water) | `.vseg-*` / `.lg-*` / `.cp-*` in `index.html` | currently copied in 3 places; a future cleanup folds them into vars |
| Part condition (sound / worn / damaged / failing) | condition bands, `src/damage-screen.js` | damage pictogram and legend |
| Equipped item | `#c9a24a`, `src/inventory-screen.js` | slot border, tag, tooltip |

## 4. Type

- **One font: JetBrains Mono, bundled** at `assets/fonts/jetbrains-mono.woff2`: the Latin subset,
  variable weight (one 40 KB file covers every weight), licence in `assets/fonts/OFL.txt`. The SIL
  Open Font License permits commercial use, as CLAUDE.md's content rule requires. Use `var(--font)`,
  never a bare `monospace`: the bare keyword resolves to Menlo on Mac and Consolas on Windows.
  Glyphs outside the subset (◂ ▸ ↑) fall back to the system mono per character. The `@font-face`
  overrides the font's vertical metrics to Menlo's, so swapping the font did not change any layout
  height. Keep those overrides if the font is ever swapped again.
- **Floor: 12 px.** Nothing below 12 px. Keycaps and badges sized in `em` must resolve to ≥ 12 px.
  This is for TV and gamepad play (FEAT-125). Real-object faces (§2) are exempt, and so is
  text inside an SVG drawing: its sizes are drawing units that scale with the picture.
- **Scale:** `12 · 14 · 16 · 18 · 22 · 30 · 44` px. Use these sizes only.

| Size | Use |
|---|---|
| 12 | hints, legends, keycaps, footers, group labels |
| 14 | body: cards, menus, HUD lines |
| 16 | the primary HUD readout, menu items |
| 18 | toasts, payout line |
| 22 | the big value on a card |
| 30 | menu title |
| 44 | countdown / GO |

- **Titles:** uppercase, `letter-spacing: 2px`, the family accent, 12–14 px. Bigger titles get
  wider spacing (the main-menu title is 30 px at 9 px spacing).
- **Text over the world with no box** (toasts, the rank readout, the due line) carries a dark
  `text-shadow`. There is no background to rely on.

## 5. Shape and controls

- **Panels and cards are square-cornered.** Rounding is reserved for small things: HUD icon chips
  (8 px), the rank tile (6 px), keycaps and small buttons (3 px).
- **One button per family.** Do not write a new button style.
  - *System:* no box. A 2 px left bar that turns `--accent-system` on hover/focus and slides the
    label right (`#main-menu button`). Pause-menu buttons are the boxed variant: 1 px
    `--line-control`, white-tinted fill on hover.
  - *Story:* 1 px `--line-control` box, transparent fill; hover = `rgba(255,255,255,0.09)` +
    `--line-hover`. The affirmative button gets `--accept`, a destructive one `--bad`.
- **Focus (keyboard and pad) looks exactly like hover.** On story cards it is a 2 px
  `--accent-system` outline, offset 2 px (FEAT-133). Every interactive element must show focus.
- **Key hints use `.keycap`** inline, or `--key` text for a bare key name. Never a raw letter in
  brackets.
- **Motion:** 0.1–0.12 s colour transitions on controls. Pop-ins use the overshoot curve
  `cubic-bezier(.2,1.4,.4,1)`. Never animate a value something reads every frame (the energy and
  rank strips move by per-frame transform with no transition).

## 6. Layers (z-index)

z-index is the CSS stacking order: a higher number draws on top. Put new elements into an existing
band; do not invent a number between bands.

| Band | z | Members |
|---|---|---|
| World chrome | 86–89 | gauge cluster 86, HUD readouts / dock / prompts 88, pump face 89 |
| Map | 90–91 | 2D map 90; run HUD lifts to 91 while the map is open |
| Story cards | 95–97 | cards 95, dialogue / quick-job / toasts 96, aim reticle + throw readout 97 |
| Pause | 100 | pause menu |
| Full-screen fades | 150–160 | doze lids 150, camp fade 160 |
| System screens | 200–220 | load caption 200, main menu 205, seed modal 215, boot splash 220 (nothing outranks it) |

## 7. Do not

- Do not type a hex value that is not in §3. If none fits, ask before adding a token.
- Do not copy a panel's CSS block to make a new panel. Join the shared selector instead (the story
  cards already share one chrome block).
- Do not put a meaning colour on decoration. Yellow is a promise that a key does something.
- Do not use a size below 12 px or off the scale.
- Do not hand-draw a domain palette in a second place. Read it from its owner (§3).

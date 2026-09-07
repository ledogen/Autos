---
id: FEAT-41
type: feature
status: open
opened: 2026-07-20
updated: 2026-09-06
severity: major
source: user-request
relates_to: >
  game-mode split (DESIGN.md "Game modes" — Free Roam / Story Mode / One-off scenarios),
  window.__setGameMode seam (teleport feature — [[project_teleport_feature]]), debug GUI
  (src/debug.js lil-gui + stats.js), HUD (src/debug.js green text), FEAT-34 instrument cluster,
  FEAT-39 assists page, FEAT-33 ignition, FEAT-58 radio, sky/time (src/sky.js), quality presets
  (PERF-08/10), story-mode debug lockout (RATIFIED 2026-07-16)
note: "MAJOR: build the game's actual menu system + a pass of UI improvements. Main menu (game-mode
selector: Free Roam / Story Mode / one-off scenarios), settings/options (video/quality, audio,
controls, the FEAT-39 assists page), pause menu, and consistent in-game UI chrome. Today there is
NO menu layer — the game boots straight into free roam with a lil-gui debug panel. This is the shell
every other player-facing feature (assists, cluster, story mode, scenarios) docks into."
---

# FEAT-41: Game menus + UI improvements (major)

## Build state — phase (a) SHIPPED 2026-09-06 (`feature/menus`)

The **menu shell and the live 3D stage are built**; the settings pages and the chrome pass are not.
What landed:

- **`src/stage.js` — MenuStage**, the beat sheet in §1b, built as specified: the truck dropped 0.46 m
  so its front-left wheel lands on a raised-cosine mound, real physics doing all of it, rocks into
  the bed after ~2.2 s, ±5° cursor-follow camera parallax. Its own scene, camera, Box3D world,
  vehicleState, chassis, truck model and DebrisSystem — it touches nothing the world sim owns.
- **The stage IS the loading screen** (owner scope-add, 2026-09-06). It runs its own rAF loop from
  just after the renderer is built, so it animates through main.js's remaining top-level awaits, and
  `loop()` takes over the driving on its first frame. `#story-loading` — an opaque full-cover panel —
  became `#load-caption`, a caption strip over the stage.
- **Cold boot lands on the main menu** with the stage behind it (owner ruling). Options are
  free roam · story mode · testing lab · settings.
- **The seed dialog now fronts free roam as well as story** (owner ruling). Blank box,
  placeholder "leave blank for random", blank → a rolled seed. Free roam re-seeds behind the stage
  only when the chosen seed differs from the standing world.
- **Settings is a stub** with a back button — owner ruling: the frame, no wiring.
- Pause gained a **main menu** entry; Esc is inert while the stage owns the screen.
- Drop policy: **one shot per showing** (owner ruling — it does NOT re-drop or trickle within a
  showing), but re-entering the stage replays it, which is what makes a load worth watching.

Three fixes fell out of running a second truck, and they are the interesting part of the diff:

1. **`initPhysicsEngine()` was not re-entrant.** `if (!_b3) _b3 = await Box3DFactory()` is idempotent
   for sequential callers only; two concurrent ones each instantiated the WASM module and the second
   replaced the first's instance, so the stage's world lost its bodies and `b3World_Step` spun
   forever on the garbage ids. Now caches the promise. Latent on main; nothing could reach it until
   something else called it during boot.
2. **`_chassisRims` was keyed by the bare body handle**, which is a per-world integer starting at 1 —
   two trucks in two worlds overwrote each other. Re-keyed `WeakMap<engine, Map<chassis, rims>>`.
3. **The bed is a solid tonneau deck** in `CHASSIS_PROFILE`, so rocks land on the lid at rail height
   and roll off. `createVehicleChassis` gained an opt-in `bed` spec that builds the well instead
   (floor, four walls, both wheelhouses); the stage passes ranger.glb's ACTUAL bed coordinates,
   derived from `assets/models/src/ranger.py`'s named constants through the loader transform. The
   world truck keeps the solid deck.

Also extracted `src/vehicle-state.js` — the canonical vehicleState factory — so the two trucks cannot
drift, and `createVehicleModel` gained `setHeadlightMode` + a `keyBindings` opt-out (a second model
was answering the 'L' key, and its headlight pool was washing the stage's foreground).

Owner pass 2026-09-06 (second round):

- **Title is AUTOS**, the vehicle flavour line is gone, and the rename went repo-wide (the GitHub
  repo is already `/autos`). The one thing deliberately NOT renamed is `rangersim-run-export/N` and
  the `rangersim-run-*.json` filename convention — that is a wire-format tag stamped into every
  recorded run in `runs/`, and renaming it would orphan them from `runs:add` / `runs:report`.
- **The seed dialog was unclickable.** It sat at z 101 under `#main-menu`'s 205 scrim, so it
  rendered dimmed and the scrim ate every click; only typing a seed and pressing Enter got through.
  Esc could not close it either (the stage guard swallowed the key), so it was a genuine soft lock.
- **The menu is wired at the top of main.js now, not the bottom.** Listeners registered after the
  module's top-level awaits do not exist for the whole of worldgen, so the buttons were dead for the
  first ~10 s. Clicking now works immediately and holds on the load caption until `_worldReady`
  resolves — which is deliberately after `prewarmLightPrograms` settles, or a reseed races an
  in-flight `compileAsync` and disposes materials under it.
- **The camera snaps on hand-off** (`snapCamera()` in `src/camera.js`) instead of springing onto the
  truck over ~1 s, which read as the camera arriving rather than the world simply being there.
- **Floor is black and the mound is gone** — the front-left wheel lands on a STATIC, part-buried
  rock (owner ruling; a one-off blob, explicitly sanctioned over making it work through the prop
  path). The reason it is a one-off: `stepPhysics`'s wheel query (`qcPlus`) unions only DYNAMIC
  engine bodies, so a static prop is invisible to a tire, and a dynamic one gets squirted out from
  under a free-rolling front wheel. The stage owns its own `_queryContacts`, so it runs the engine's
  hull-vs-sphere narrow phase itself WITHOUT `dynamicOnly` — same machinery, static bodies reachable.
  Two things had to be right for it to hold: the hull must be built from UNIQUE vertices (the
  non-indexed 240-point array produced a hull that only reported contacts at deep overlap, so the
  truck settled straight through it), and the top must be sheared FLAT — on a dome the free-rolling
  front wheel walks off over ~20 s. With both, the pose is stable to the millimetre over 30 s.

- **The tire visibly sinks into the rock on the way down, and that is LEFT IN** — see **BUG-60**.
  Measured: zero missed contacts, one physics step per rendered frame, no pacing artefact; the wheel
  sphere overlaps the solid by 55 mm at rest and 92 mm at the landing peak, which is what the model
  currently means by tire deflection. A cosmetic fix (squash the stage's tire meshes by their own
  overlap) was built and REVERTED on owner review — a tire that deforms while the steelie inside it
  stays rigid looks worse than the clipping. Owner's ruling: leave it visible as pressure to fix the
  seam properly. Do not patch it in the stage.

**Still open on this ticket:** §2 settings/options (video/quality, audio, controls, the FEAT-39
assists page), §3's pause-discipline work beyond the sim hold, §4 the UI-chrome/visual-language pass
and the toast generalisation, and one-off scenarios (no scenarios exist yet to select).

## Context

The game currently **boots straight into free roam** with a lil-gui debug panel and a green
debug-text HUD — there is no menu layer at all. Story mode's ratified **game-mode split** (DESIGN.md
"Game modes": Free Roam / Story Mode / One-off scenarios) *requires* a main menu to select between
forks, and multiple pending features (FEAT-39 assists, FEAT-34 cluster, story mode, scenarios) need a
consistent place to live. This ticket builds that **menu shell + a coherent UI pass** — the frame the
rest of the player-facing game hangs on.

This is deliberately a **major** ticket: it's foundational UI infrastructure, not a single screen.
Expect to break it into phases at planning.

## Scope

### 1. Main menu (entry point)

**Two elements, layered** [owner-specified 2026-08-15]:

**1a. The UI element** — buttons, interactables, the actual menu stuff (DOM overlay, per the
technical approach below).
- Boots here instead of straight into the sim. Selects the game mode via the existing
  `window.__setGameMode` seam (extend it — do **not** invent a second mode system):
  - **Free Roam** — infinite world, full debug tooling (the game as built to date).
  - **Story Mode** — the region-bounded roguelike fork (debug locked out — RATIFIED 2026-07-16).
  - **One-off scenarios** — self-contained set pieces (Dodge the Rocks, Escape the Police, …).
- Clean, on-brand; sets the tone. Should not fight the sim's look.

**1b. The live 3D scene element** — rendered live BEHIND the menu UI, pure eye candy to integrate
the menu with the sim's look. Owner-specified beat sheet:

- **Stage**: an empty void. A ground plane, and on it a **small dirt mound** — nothing else.
- **The drop**: the hero truck is dropped from **~18 in (0.46 m)** positioned so its **front-left
  wheel lands on the mound**. The real physics does the rest — impact, rebound, settle.
- **Camera**: in front of the truck, looking back at that **front-left corner** (the wheel on the
  mound is the star). **Mouse position drives a small ±5° camera orbit in both pitch and yaw** —
  a parallax-style effect, cursor-follow only, no free orbit.
- **The second beat**: once the suspension settles (**~2 s** after the drop), a bunch of **physics
  rocks fall from high up and land in the bed**, compressing the rear suspension and restarting the
  truck's dynamic wobble. The scene therefore never goes fully static.
- Build notes: this is the sim in a bottle — the flat-void staging is the FEAT-31 testing-lab
  pattern (`src/lab.js`), and the bed-landing rocks are FEAT-36 throwable-debris physics (on
  `feature/box3d`, unmerged — this scene is a natural consumer once it lands). Loop policy (does
  the drop replay? do rocks keep trickling?) is a planning-time call.

### 2. Settings / options
- **Video / quality** — surface the existing quality presets (PERF-08/10 draw-distance / resolution
  caps) and toggles as player-facing options, not debug sliders.
- **Audio** — master / music / SFX (hooks FEAT-58 radio when it lands).
- **Controls** — key bindings display (rebinding is a stretch goal); sensitivity where relevant.
- **Assists page (FEAT-39)** — hosts the driver-assist toggles + gain sliders + steering/throttle/
  brake feel sliders. This ticket provides the page frame; FEAT-39 provides the controls.

### 3. Pause menu (in-run)
- Resume / Settings / (mode-appropriate) Restart or Quit-to-menu. Sim pauses cleanly (respect the
  fixed-timestep accumulator — pause the loop, don't corrupt dt).
- Story-mode restrictions apply (no debug tooling; SM-INV-3 — no par countdown anywhere in the UI).

### 4. In-game UI chrome + improvements
- A **consistent visual language** (typography, spacing, colors, focus states) shared across menus,
  toasts (the existing spawn toast), and HUD elements — right now UI is ad-hoc (raw buttons, green
  debug text). Establish the shared style once.
- Reconcile the **debug HUD / lil-gui** with the player UI: debug tooling stays in free roam, is
  **locked out in story mode**; the FEAT-34 instrument cluster becomes the player HUD. Define who owns
  the screen in each mode.
- Toast / notification system generalized from the one-off spawn toast.

## Technical approach (proposal)

- **DOM overlay (HTML/CSS)** for the UI element (1a), same lane as lil-gui / stats / the FEAT-34
  cluster — no WebGL menu geometry, no new deps beyond what's bundled. Keep it framework-free
  (vanilla JS + CSS) to match the stack constraint. The **3D layer behind it is the live scene
  (1b)** — the existing renderer pointed at a staged sandbox, not menu geometry: buttons never live
  in WebGL, the truck never lives in DOM.
- **Menu state machine** — a small explicit state (`main → mode → in-run ⇄ pause → settings`), driving
  which DOM layer is visible and whether the sim loop runs. Extend `window.__setGameMode` for the
  mode axis; the menu owns the screen-state axis.
- **Pause discipline** — gate the fixed-timestep accumulator (`src/main.js` loop): stop stepping
  physics while paused, keep rendering, resume without a dt spike. Don't let pause become a hidden
  slow-mo or a dt bomb.
- **Zero gameplay effect** → deterministic; headless gates (no DOM, no menu) unaffected. The 1b
  scene DOES run real physics, but sandboxed: its world/state must be torn down completely on mode
  entry and can never leak into a run. Menu styling is USER-OWNED.

## Story-mode fit

- The **game-mode split is the reason this exists** — the main menu is how a player reaches Story
  Mode at all. Honor the ratified restrictions: story mode locks debug tooling, fixes sliders, and
  the HUD carries **no par countdown** (SM-INV-3).
- Story mode's own between-runs surfaces (jalopy select, region map, spirit/class roster) are
  **downstream** — this ticket builds the generic menu shell they'll dock into, not those screens
  themselves (they land with their SM milestones).

## Open design questions (planning)

- **Visual direction** — the game's UI identity is unset (USER-OWNED). Diegetic/rugged vs. clean-
  minimal? This colors everything; owner call before heavy build.
- **Boot flow** — always land on the main menu, or remember last mode / quick-resume?
- **How much of the debug GUI survives** into a "free roam settings" panel vs. staying dev-only?
- **Scenario framing** — do one-off scenarios get their own select screen now, or a stub until
  scenarios are built?
- **Phasing** — likely: (a) main menu + mode switch + pause, (b) settings/video/audio + assists page
  frame, (c) UI-chrome/style pass + HUD reconciliation. Confirm the cut at planning.

## Acceptance

- Game boots to a **main menu** that selects Free Roam / Story Mode / scenarios via
  `window.__setGameMode`; each mode enters the sim correctly.
- A **settings** area with video/quality, audio, controls, and the **FEAT-39 assists page** frame.
- A **pause menu** that cleanly halts and resumes the fixed-timestep loop without a dt spike, with
  mode-appropriate options.
- A **shared UI style** applied across menus, HUD, and toasts — no more ad-hoc raw buttons / green
  debug text as the only chrome; debug tooling correctly gated by mode.
- Pure UI: deterministic, `npm test` unaffected, 60fps preserved; visual direction USER-OWNED.

## Related

- Mode seam: `window.__setGameMode` (teleport feature — [[project_teleport_feature]]); game-mode
  intent: `.planning/story-mode/DESIGN.md` "Game modes".
- Docks these in: `feat-driver-assists.md` (FEAT-39 assists page), `feat-instrument-cluster-gui.md`
  (FEAT-34 player HUD), `feat-player-music-streaming.md` (FEAT-58 audio/radio).
- Current UI surfaces to reconcile: `src/debug.js` (lil-gui + green HUD + spawn toast), quality
  presets (PERF-08/10).

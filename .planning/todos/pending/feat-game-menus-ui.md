---
id: FEAT-41
type: feature
status: open
opened: 2026-07-20
severity: major
source: user-request
relates_to: >
  game-mode split (DESIGN.md "Game modes" — Free Roam / Story Mode / One-off scenarios),
  window.__setGameMode seam (teleport feature — [[project_teleport_feature]]), debug GUI
  (src/debug.js lil-gui + stats.js), HUD (src/debug.js green text), FEAT-34 instrument cluster,
  FEAT-39 assists page, FEAT-33 ignition, FEAT-31 radio, sky/time (src/sky.js), quality presets
  (PERF-08/10), story-mode debug lockout (RATIFIED 2026-07-16)
note: "MAJOR: build the game's actual menu system + a pass of UI improvements. Main menu (game-mode
selector: Free Roam / Story Mode / one-off scenarios), settings/options (video/quality, audio,
controls, the FEAT-39 assists page), pause menu, and consistent in-game UI chrome. Today there is
NO menu layer — the game boots straight into free roam with a lil-gui debug panel. This is the shell
every other player-facing feature (assists, cluster, story mode, scenarios) docks into."
---

# FEAT-41: Game menus + UI improvements (major)

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
- Boots here instead of straight into the sim. Selects the game mode via the existing
  `window.__setGameMode` seam (extend it — do **not** invent a second mode system):
  - **Free Roam** — infinite world, full debug tooling (the game as built to date).
  - **Story Mode** — the region-bounded roguelike fork (debug locked out — RATIFIED 2026-07-16).
  - **One-off scenarios** — self-contained set pieces (Dodge the Rocks, Escape the Police, …).
- Clean, on-brand; sets the tone. Should not fight the sim's look.

### 2. Settings / options
- **Video / quality** — surface the existing quality presets (PERF-08/10 draw-distance / resolution
  caps) and toggles as player-facing options, not debug sliders.
- **Audio** — master / music / SFX (hooks FEAT-31 radio when it lands).
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

- **DOM overlay (HTML/CSS)**, same lane as lil-gui / stats / the FEAT-34 cluster — no WebGL menu
  geometry, no new deps beyond what's bundled. Most LLM-maintainable, and menus don't need the 3D
  layer. Keep it framework-free (vanilla JS + CSS) to match the stack constraint.
- **Menu state machine** — a small explicit state (`main → mode → in-run ⇄ pause → settings`), driving
  which DOM layer is visible and whether the sim loop runs. Extend `window.__setGameMode` for the
  mode axis; the menu owns the screen-state axis.
- **Pause discipline** — gate the fixed-timestep accumulator (`src/main.js` loop): stop stepping
  physics while paused, keep rendering, resume without a dt spike. Don't let pause become a hidden
  slow-mo or a dt bomb.
- **Zero physics/gameplay effect** → deterministic; headless gates (no DOM, no menu) unaffected. Menu
  styling is USER-OWNED.

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
  (FEAT-34 player HUD), `feat-player-music-streaming.md` (FEAT-31 audio/radio).
- Current UI surfaces to reconcile: `src/debug.js` (lil-gui + green HUD + spawn toast), quality
  presets (PERF-08/10).

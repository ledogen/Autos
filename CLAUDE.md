<!-- GSD:project-start source:PROJECT.md -->
## Project

**RangerSim**

A browser-based 6DOF rigid body car physics simulation built in JavaScript with Three.js. The default vehicle is a 2002 Ford Ranger (RWD, open diff). The physics system is designed to be accurate enough to simulate real driving behavior — including drifting, weight transfer, and rollovers — while remaining tunable through an in-game debug menu. Runs entirely in-browser with no install required.

**Core Value:** Physics that feel honest: a car that can roll over naturally, drift on the limit, and behave predictably enough that tuning parameters produces the expected result.

### Constraints

- **Tech stack**: Three.js + vanilla JS, no build system — must open from GitHub Pages without install
- **Runtime**: Browser only, single origin — no server, no WebSocket, no backend
- **File structure**: ES6 modules in a `src/` directory, single `index.html` entry point
- **Physics**: Hand-rolled, no physics library — required for learning, tuning transparency, and terrain control
- **Performance**: Target 60fps on a mid-range laptop with terrain active — physics must be lightweight
- **LLM maintainability**: Code is primarily maintained by LLM sessions (Claude Sonnet 4.6, `claude-sonnet-4-6`). Conventions must be explicit, self-documenting, and resistant to drift across sessions.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Rendering
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Three.js | r184 | 3D rendering, scene graph, camera | Current stable release (confirmed threejs.org 2026-05-10); ES module build via CDN importmap is the officially documented approach as of r147+; Y-up coordinate system matches project requirement |
| ES6 importmap | browser-native | Module resolution without bundler | Lets `import * as THREE from 'three'` and `import { X } from 'three/addons/...'` work in plain HTML without npm or webpack; supported in all modern browsers |
### Debug / Development Tools
| Technology | Source | Purpose | Why |
|------------|--------|---------|-----|
| lil-gui | Bundled in Three.js addons | Physics parameter sliders (Pacejka B/C/E/D, spring stiffness, damping, ride height) | Already bundled at `three/addons/libs/lil-gui.module.min.js` — zero additional dependency; the Three.js manual uses it in all interactive examples; it replaced dat.GUI as the official Three.js debug UI |
| stats.js | `three/addons/libs/stats.module.js` | FPS counter, frame time monitor | Also bundled in Three.js addons; shows FPS/ms panel in corner; essential for hitting 60fps target on mid-range laptop |
### Physics System
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Hand-rolled (vanilla JS) | — | 6DOF rigid body, Pacejka tires, spring-damper suspension | Project requirement; gives full control over tire model, contact patch velocity, quaternion integration, and surface normal handling. No physics library can expose the per-wheel force pipeline at the level needed for a real Pacejka implementation with load transfer |
| Three.js `Quaternion`, `Vector3`, `Matrix4` | r184 | Math primitives for physics | Three.js math classes are available after the Three.js import; avoids importing a second math library. `THREE.Quaternion.slerp`, `THREE.Vector3.applyQuaternion`, etc. are well-tested and documented |
### Module Structure
| Module | Responsibility | Imports from |
|--------|---------------|--------------|
| `src/tire.js` | Pacejka Magic Formula, slip angle → lateral force | Nothing (pure math) |
| `src/suspension.js` | Spring-damper per corner, contact patch position, normal force | `tire.js` (for normal force input) |
| `src/physics.js` | 6DOF integrator, force accumulation, quaternion rotation | `tire.js`, `suspension.js` |
| `src/vehicle.js` | Vehicle state, drivetrain, Ackermann, input accumulation | `physics.js` |
| `src/camera.js` | Chase camera, spring follow | Three.js only |
| `src/debug.js` | lil-gui panel, scenario logger, HUD | `vehicle.js` (reads state) |
| `src/main.js` | Entry point, scene setup, game loop | All of the above |
| `data/ranger.js` | Ford Ranger specs as exported const object | Nothing |
### Hosting
| Technology | Purpose | Why |
|------------|---------|-----|
| GitHub Pages | Static hosting | Zero infrastructure; serves ES modules correctly with proper `Content-Type: text/javascript`; CORS-safe for `type="module"` scripts |
| Local dev via `npx serve` or VS Code Live Server | Local testing | ES6 modules require HTTP — `file://` URLs throw CORS errors. Any local HTTP server works; `npx serve .` (no install) is the simplest |
## Physics Loop Pattern
## What NOT to Use
### Do Not Use: Cannon.js, Rapier, Ammo.js, or any physics library
### Do Not Use: dat.GUI
### Do Not Use: Global `<script>` tag for Three.js (the r128 prototype pattern)
### Do Not Use: Web Workers for physics
### Do Not Use: OffscreenCanvas
### Do Not Use: A bundler (webpack, Vite, Rollup)
### Do Not Use: Euler angles for body rotation
## Version Verification Status
| Item | Verified? | Source | Confidence |
|------|-----------|--------|------------|
| Three.js r184 | YES | threejs.org live site, 2026-05-10 | HIGH |
| importmap pattern | YES | Three.js manual (r147+ documented as "only way") | HIGH |
| lil-gui bundled in three/addons | YES | Three.js manual source references `three/addons/libs/lil-gui.module.min.js` | HIGH |
| stats.js bundled in three/addons | YES | Three.js manual references `three/addons/libs/stats.module.js` | HIGH |
| Web Workers cannot use rAF | YES | MDN Web Workers API docs | HIGH |
| SharedArrayBuffer requires COOP/COEP headers | YES | MDN, GitHub Pages does not set these by default | HIGH |
| file:// CORS blocks ES modules | YES | MDN Modules guide | HIGH |
| Fixed timestep accumulator pattern | YES | Working prototype (backup12.html) implements it correctly | HIGH |
## Installation / Setup
# Option 1: VS Code Live Server extension (click "Go Live")
# Option 2: Python
# Option 3: Node (no install)
## Sources
- Three.js current version r184: https://threejs.org/ (live, 2026-05-10)
- Three.js importmap pattern, r147+ requirement: https://threejs.org/manual/en/fundamentals.html
- lil-gui in Three.js addons: https://threejs.org/manual/en/align-html-elements-to-3d.html (source references `three/addons/libs/lil-gui.module.min.js`)
- Web Workers limitations (no rAF, SharedArrayBuffer headers): https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- OffscreenCanvas browser support caveats: https://threejs.org/manual/en/offscreencanvas.html
- ES6 modules CORS requirement on file://: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
- Fixed timestep accumulator pattern: `/references/backup12.html` lines 709-721 (working implementation)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

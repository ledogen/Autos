# Technology Stack: RangerSim

**Project:** Browser-based 6DOF car physics simulation (Ford Ranger)
**Researched:** 2026-05-10
**Overall confidence:** HIGH (Three.js version confirmed from threejs.org live site; physics loop pattern confirmed from working prototype; MDN authoritative for Web Worker constraints)

---

## Recommended Stack

### Core Rendering

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Three.js | r184 | 3D rendering, scene graph, camera | Current stable release (confirmed threejs.org 2026-05-10); ES module build via CDN importmap is the officially documented approach as of r147+; Y-up coordinate system matches project requirement |
| ES6 importmap | browser-native | Module resolution without bundler | Lets `import * as THREE from 'three'` and `import { X } from 'three/addons/...'` work in plain HTML without npm or webpack; supported in all modern browsers |

**CDN importmap pattern (use this exactly):**
```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/"
  }
}
</script>
```

Note: Three.js uses both `r184` (old-style) and `0.184.0` (semver) naming on npm. Pin the exact version — do not use `@latest` or `@three` with no version because CDN caching of `@latest` can serve stale builds and introduces non-determinism across sessions.

### Debug / Development Tools

| Technology | Source | Purpose | Why |
|------------|--------|---------|-----|
| lil-gui | Bundled in Three.js addons | Physics parameter sliders (Pacejka B/C/E/D, spring stiffness, damping, ride height) | Already bundled at `three/addons/libs/lil-gui.module.min.js` — zero additional dependency; the Three.js manual uses it in all interactive examples; it replaced dat.GUI as the official Three.js debug UI |
| stats.js | `three/addons/libs/stats.module.js` | FPS counter, frame time monitor | Also bundled in Three.js addons; shows FPS/ms panel in corner; essential for hitting 60fps target on mid-range laptop |

**Import pattern for both:**
```javascript
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import Stats from 'three/addons/libs/stats.module.js';
```

No additional CDN URLs needed — both come from the same jsdelivr importmap already declared for Three.js.

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

**Dependency direction is strictly:** `tire → suspension → physics → vehicle → main`. No module imports from a module downstream in this chain. This eliminates all circular dependency risk.

### Hosting

| Technology | Purpose | Why |
|------------|---------|-----|
| GitHub Pages | Static hosting | Zero infrastructure; serves ES modules correctly with proper `Content-Type: text/javascript`; CORS-safe for `type="module"` scripts |
| Local dev via `npx serve` or VS Code Live Server | Local testing | ES6 modules require HTTP — `file://` URLs throw CORS errors. Any local HTTP server works; `npx serve .` (no install) is the simplest |

---

## Physics Loop Pattern

The working prototype already implements the correct pattern. Use it as the canonical approach:

```javascript
const DT = 1 / 60;       // fixed physics timestep, seconds
let lastTime = performance.now();
let accumulator = 0;

function animate(now) {
  requestAnimationFrame(animate);

  // Cap delta to prevent spiral of death on tab-switch/lag spikes
  accumulator += Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Consume fixed steps
  while (accumulator >= DT) {
    physicsStep();        // always called with exactly DT = 1/60s
    accumulator -= DT;
  }

  // Render with whatever state physics left (no interpolation needed at 60fps target)
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
```

**Why no render interpolation:** Interpolation (blending previous and current state by `accumulator / DT`) eliminates visual stutter when physics runs slower than render. At 60fps target on a laptop, the physics and render rates match — interpolation adds code complexity for no visible benefit. If the game later runs physics at 120hz for accuracy, add interpolation then.

**Why the 0.1s cap:** Prevents the accumulator from growing unbounded when the tab is backgrounded or the browser stalls. Without it, returning to a stalled tab causes hundreds of physics steps in one frame.

---

## What NOT to Use

### Do Not Use: Cannon.js, Rapier, Ammo.js, or any physics library
Project requirement, but worth explaining why the constraint is correct: physics libraries expose forces and impulses at collision resolution level, not at tire contact patch level. Implementing Pacejka Magic Formula, load transfer, and correct longitudinal slip requires direct access to per-wheel normal force and contact patch velocity — concepts that don't map to physics library APIs without fighting the abstraction. Hand-rolled physics is the right choice here.

### Do Not Use: dat.GUI
dat.GUI is unmaintained (last npm release 2020). lil-gui is its maintained successor, is already bundled in Three.js addons, and has an identical API surface. Using dat.GUI would require a separate CDN dependency for no benefit.

### Do Not Use: Global `<script>` tag for Three.js (the r128 prototype pattern)
The prototype loaded Three.js as `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js">` which dumps everything into `window.THREE`. This is the pre-r147 pattern. It conflicts with ES6 module imports, prevents tree-shaking (irrelevant without a bundler but still bad practice), and uses a version that is 56 releases behind current. Use importmap + ES modules.

### Do Not Use: Web Workers for physics
Web Workers cannot access `requestAnimationFrame` (MDN confirmed). Coordinating fixed-timestep physics in a worker requires either `setInterval` (not frame-synchronized) or `SharedArrayBuffer` (requires cross-origin isolation headers that GitHub Pages does not send by default). The overhead of postMessage serialization for a 6DOF state vector every frame adds latency without meaningful gain — the physics budget at 1/60s is ~16ms and the hand-rolled simulation is pure arithmetic with no I/O. Stay on the main thread.

### Do Not Use: OffscreenCanvas
Three.js manual notes Chrome is the only browser with full OffscreenCanvas support (as of documentation). Requires complex proxy patterns for keyboard/mouse events. The rendering workload (simple geometry, no post-processing) does not justify this complexity.

### Do Not Use: A bundler (webpack, Vite, Rollup)
Project requirement, but the reason is sound: GitHub Pages + importmap + CDN is a complete and working deployment pipeline. A bundler would require a build step, a `node_modules` directory, and a CI pipeline — all of which conflict with the "open from GitHub Pages without install" constraint.

### Do Not Use: Euler angles for body rotation
The prototype used Euler angles (YXZ order) and hit gimbal lock at 90° roll/pitch — this is the documented reason for the rewrite. Use `THREE.Quaternion` for body orientation throughout. Only convert to Euler for Three.js `Object3D.rotation` at render time (Three.js `.setFromQuaternion()` handles this).

---

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

---

## Installation / Setup

No npm, no install. The full setup is:

**index.html:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RangerSim</title>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

**Local dev (requires HTTP, not file://):**
```
# Option 1: VS Code Live Server extension (click "Go Live")
# Option 2: Python
python3 -m http.server 8080
# Option 3: Node (no install)
npx serve .
```

**Deploy:** Push to `main` branch. GitHub Pages serves `index.html` from repo root. No build step.

---

## Sources

- Three.js current version r184: https://threejs.org/ (live, 2026-05-10)
- Three.js importmap pattern, r147+ requirement: https://threejs.org/manual/en/fundamentals.html
- lil-gui in Three.js addons: https://threejs.org/manual/en/align-html-elements-to-3d.html (source references `three/addons/libs/lil-gui.module.min.js`)
- Web Workers limitations (no rAF, SharedArrayBuffer headers): https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- OffscreenCanvas browser support caveats: https://threejs.org/manual/en/offscreencanvas.html
- ES6 modules CORS requirement on file://: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
- Fixed timestep accumulator pattern: `/references/backup12.html` lines 709-721 (working implementation)

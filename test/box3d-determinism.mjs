// FEAT-48 Phase 0 — Box3D determinism harness (GO/NO-GO gate input).
//
// Drops a cylinder-hull body onto a procedural heightfield, runs 10 000 fixed
// steps, and hashes the body's full state (position, rotation, velocities) at
// step 5 000 and step 10 000. The hash must be identical:
//   - run-to-run in the same process          (this script runs the sim twice)
//   - across fresh processes                  (run the script twice, compare)
//   - node vs. browser                        (test/box3d-determinism.html)
//   - machine vs. machine (Mac vs. Windows)   (DEFERRED — owner runs this same
//     script on the Windows thin client, INFRA-01, and compares the hash line)
//
// The hash is pure JS (FNV-1a over the exact float64 bit patterns) so node and
// browser produce comparable output with no crypto dependency.
//
// Usage:  node test/box3d-determinism.mjs            full report
//         node test/box3d-determinism.mjs --hash-only  one line, for diffing
//
// Expected hash (recorded 2026-08-13, macOS arm64, node 25, box3d.js 0.1.1):
//   see test/box3d-determinism.expected — cross-machine comparison target.

import Box3DFactory from '../vendor/box3d/dist/box3d.mjs';

const STEPS = 10_000;
const DT = 1 / 60;
const SUBSTEPS = 4;
// Early samples catch the body mid-tumble (it sleeps well before 5 000 —
// sampling only settled state would trivially pass); late ones catch drift.
const SAMPLE_AT = [90, 180, 360, 5_000, 10_000];

// Deterministic, integer-free-of-transcendental-drift heightfield: sin/cos of
// small rational inputs are IEEE-correctly-rounded on every platform we target
// (fdlibm-lineage libm in v8), and the same formula runs in node and browser.
function makeHeights(countX, countZ) {
  const h = new Float32Array(countX * countZ);
  for (let z = 0; z < countZ; z++) {
    for (let x = 0; x < countX; x++) {
      h[z * countX + x] = Math.fround(
        1.5 * Math.sin(x * 0.35) * Math.cos(z * 0.27) + 0.4 * Math.sin((x + z) * 0.13)
      );
    }
  }
  return h;
}

// FNV-1a over the byte view of a Float64Array — portable node/browser.
function fnv1a64(f64) {
  const bytes = new Uint8Array(f64.buffer, f64.byteOffset, f64.byteLength);
  let h0 = 0xcbf29ce4, h1 = 0x84222325; // 64-bit FNV offset basis, split 32/32
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    // h *= 0x100000001b3 (64-bit FNV prime) in 32-bit halves
    const l = (h1 & 0xffff) * 0x1b3 + (((h1 >>> 16) * 0x1b3 & 0xffff) << 16);
    h0 = (h0 * 0x1b3 + h1 + (l / 0x100000000 | 0)) >>> 0;
    h1 = l >>> 0;
  }
  return h0.toString(16).padStart(8, '0') + h1.toString(16).padStart(8, '0');
}

export async function simulate(b3) {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -9.81, 0];
  worldDef.workerCount = 0; // single-threaded stepping — determinism baseline
  const worldId = b3.b3CreateWorld(worldDef);

  // Static ground: 64×64 heightfield, 1 m cells.
  const COUNT = 64;
  const heights = makeHeights(COUNT, COUNT);
  const hf = b3.b3CreateHeightField(heights, COUNT, COUNT, [1, 1, 1]);
  const groundDef = b3.b3DefaultBodyDef();
  groundDef.type = b3.b3BodyType.b3_staticBody;
  groundDef.position = [-COUNT / 2, 0, -COUNT / 2];
  const groundId = b3.b3CreateBody(worldId, groundDef);
  const groundShapeDef = b3.b3DefaultShapeDef();
  groundShapeDef.baseMaterial.friction = 0.8;
  b3.b3CreateHeightFieldShape(groundId, groundShapeDef, hf);

  // Dynamic body: a barrel-ish cylinder hull dropped with initial tumble.
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [0.37, 8, -0.61];
  bodyDef.angularVelocity = [1.3, 2.1, -0.7];
  const bodyId = b3.b3CreateBody(worldId, bodyDef);
  const hull = b3.b3CreateCylinder(0.9, 0.3, 0, 12);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = 250;
  shapeDef.baseMaterial.friction = 0.5;
  shapeDef.baseMaterial.restitution = 0.25;
  b3.b3CreateHullShape(bodyId, shapeDef, hull);

  const samples = [];
  const p = [0, 0, 0], q = [0, 0, 0, 0], lv = [0, 0, 0], av = [0, 0, 0];
  for (let step = 1; step <= STEPS; step++) {
    b3.b3World_Step(worldId, DT, SUBSTEPS);
    if (SAMPLE_AT.includes(step)) {
      b3.b3Body_GetTransform(p, q, bodyId);
      b3.b3Body_GetLinearVelocity(lv, bodyId);
      b3.b3Body_GetAngularVelocity(av, bodyId);
      samples.push(...p, ...q, ...lv, ...av);
    }
  }

  b3.b3DestroyWorld(worldId);
  b3.b3DestroyHull(hull);
  b3.b3DestroyHeightField(hf);

  const state = new Float64Array(samples);
  return { hash: fnv1a64(state), state };
}

export async function run(log = console.log) {
  const b3 = await Box3DFactory();
  const a = await simulate(b3);
  const bRun = await simulate(b3); // second sim, same process, fresh world
  const samePass = a.hash === bRun.hash;
  return { hash: a.hash, samePass, state: Array.from(a.state) };
}

const isMain = typeof process !== 'undefined' && process.argv?.[1] &&
  import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const hashOnly = process.argv.includes('--hash-only');
  const t0 = performance.now();
  const { hash, samePass, state } = await run();
  if (hashOnly) {
    console.log(hash);
  } else {
    console.log(`box3d determinism harness — ${STEPS} steps × ${SUBSTEPS} substeps @ ${DT.toFixed(5)} s`);
    console.log(`state @ [${SAMPLE_AT.join(', ')}]:`);
    console.log('  ' + state.map(v => v.toPrecision(17)).join('\n  '));
    console.log(`hash:            ${hash}`);
    console.log(`same-process:    ${samePass ? 'PASS (2 runs identical)' : 'FAIL'}`);
    console.log(`wall time:       ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
  if (!samePass) process.exit(1);
}

// FEAT-48 Phase 0 — node-vs-browser determinism driver.
//
// Serves the repo root, loads test/box3d-determinism.html in headless Chrome
// (shared CDP client), and compares the browser's hash with a fresh node run
// of the same harness. Not a gate — Phase 0 evidence tool.
//
// Usage: node test/box3d-determinism-browser.mjs [--port=8033]

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { launchChrome, connect, sleep } from './lib/cdp.mjs';
import { run } from './box3d-determinism.mjs';

const PORT = Number((process.argv.find(a => a.startsWith('--port=')) || '').split('=')[1] || 8033);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Static server: python3 nocache-server on the worktree root (its own port so it
// can't collide with the main checkout's :8000).
const server = spawn('python3', [join(root, 'test', 'nocache-server.py'), String(PORT)], { cwd: root, stdio: 'ignore' });
const stopServer = () => { try { server.kill(); } catch {} };
process.on('exit', stopServer);

const url = `http://localhost:${PORT}/test/box3d-determinism.html`;
for (let i = 0; i < 40; i++) { // wait for the server
  try { await fetch(`http://localhost:${PORT}/test/box3d-determinism.html`); break; } catch { await sleep(250); }
}

const { cleanup } = launchChrome(url, { port: 9223 });
try {
  const client = await connect({ port: 9223 });
  let browserHash = null;
  for (let i = 0; i < 120; i++) {
    const { val } = await client.evalJS('window.__box3dHash ?? null');
    if (val) { browserHash = val; break; }
    await sleep(500);
  }
  const node = await run();
  console.log(`browser hash: ${browserHash}`);
  console.log(`node hash:    ${node.hash}`);
  const pass = browserHash === node.hash;
  console.log(`node-vs-browser: ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
} finally {
  cleanup();
  stopServer();
}

#!/usr/bin/env node
/* INFRA-11 check: the Lanes tab's data routes. Starts the dashboard on a spare port against a temp
 * folder and asserts the page can write exactly what it owns and nothing else.
 *   node tools/dashboard/data-api.check.mjs */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'dash-data-'));
const port = 8900 + Math.floor(Math.random() * 90);
const srv = spawn('node', [join(dirname(fileURLToPath(import.meta.url)), 'index.mjs'), '--port', String(port)],
  { env: { ...process.env, LEDOREPO_DATA: dir }, stdio: 'ignore' });
const base = `http://localhost:${port}/data`;
const req = (method, path, body) => fetch(base + path, { method, body });
try {
  for (let i = 0; ; i++) {
    try { await fetch(base); break; } catch (e) { if (i > 150) throw e; await new Promise((r) => setTimeout(r, 200)); }
  }
  const id = '20261113120000-ab12';
  assert.equal((await req('PUT', `/inbox/${id}.json`, JSON.stringify({ text: 'hello', at: 'now' }))).status, 200);
  assert.equal((await req('PUT', '/owed/some-id.answer.json', JSON.stringify({ choice: 'good' }))).status, 200);
  // agent-owned files, written straight to disk
  mkdirSync(join(dir, 'lanes'), { recursive: true });
  writeFileSync(join(dir, 'lanes', 'a.now'), 'running: x\n');
  writeFileSync(join(dir, 'inbox', `${id}.reply.json`), '{"status":"done"}');
  let d = await (await req('GET', '')).json();
  assert.equal(d.inbox[`${id}.json`].text, 'hello');
  assert.equal(d.inbox[`${id}.reply.json`].status, 'done');
  assert.equal(d.owed['some-id.answer.json'].choice, 'good');
  assert.equal(d.lanes['a.now'], 'running: x\n');
  // everything the page does not own is refused
  for (const [m, p] of [
    ['PUT', `/inbox/${id}.reply.json`], ['PUT', '/owed/some-id.json'], ['PUT', '/lanes/a.json'], ['PUT', '/lanes/a.now'],
    ['PUT', '/inbox/..%2F..%2Fevil.json'], ['PUT', '/owed/..%2Fx.answer.json'], ['PUT', '/answered/x.answer.json'],
    ['DELETE', '/owed/some-id.answer.json'], ['DELETE', '/lanes/a.now'], ['POST', `/inbox/${id}.json`],
  ]) assert.equal((await req(m, p, '{}')).status, 403, `${m} ${p} must be refused`);
  assert.equal((await req('PUT', `/inbox/${id}.json`, 'not json')).status, 400);
  assert.equal(JSON.parse(readFileSync(join(dir, 'inbox', `${id}.json`), 'utf8')).text, 'hello', 'a bad PUT must not clobber the file');
  assert.ok(!existsSync(join(dir, '..', 'evil.json')));
  // deleting an inbox item takes its reply with it
  assert.equal((await req('DELETE', `/inbox/${id}.json`)).status, 200);
  d = await (await req('GET', '')).json();
  assert.deepEqual(d.inbox, {});
  console.log('data-api: PASS');
} finally { srv.kill(); rmSync(dir, { recursive: true, force: true }); }

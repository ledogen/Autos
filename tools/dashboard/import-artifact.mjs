#!/usr/bin/env node
/* INFRA-11, ONE-TIME: move the Alpha Lanes artifact's state into the Lanes tab's data folder.
 * Delete this file after the cutover.
 *   node tools/dashboard/import-artifact.mjs --page .planning/pages/alpha-lanes.html --db <dir> --out <data folder>
 * --db is a folder of the artifact's collections saved to disk (inbox/ owed/ lanes/ tasks/, one JSON per doc).
 * Refuses to write into a folder that already has data. */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
const page = arg('--page'), db = arg('--db'), out = arg('--out');
if (!page || !db || !out) throw new Error('need --page --db --out');
for (const d of ['inbox', 'owed', 'lanes']) if (existsSync(join(out, d)) && readdirSync(join(out, d)).length) throw new Error(`${out}/${d} already has data`);

const src = readFileSync(page, 'utf8');
const code = src.slice(src.indexOf('const LANES = ['), src.indexOf('const STATES ='));
const { LANES, OWED } = new Function(code + '; return { LANES, OWED };')();
const docs = (c) => Object.fromEntries(!existsSync(join(db, c)) ? [] : readdirSync(join(db, c))
  .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(db, c, f), 'utf8'))]));
const put = (rel, v) => { mkdirSync(join(out, rel, '..'), { recursive: true }); writeFileSync(join(out, rel), typeof v === 'string' ? v : JSON.stringify(v, null, 1) + '\n'); };
const n = { inbox: 0, replies: 0, owed: 0, answers: 0, archived: 0, lanes: 0, tasks: 0 };

const tasks = docs('tasks'), lanes = docs('lanes');
for (const l of LANES) {
  const { prompt, id, ...lane } = l;
  lane.tasks = l.tasks.map((t) => {
    const d = tasks[`${id}-${t.id.replace(/[^A-Za-z0-9]+/g, '_')}`] || {};   // the page's own key scheme
    n.tasks++;
    return { id: t.id, what: t.what, status: d.status || 'todo', ...(d.note ? { note: d.note } : {}) };
  });
  put(`lanes/${id}.json`, lane); n.lanes++;
  put(`lanes/${id}.handoff.md`, (lanes[id]?.handoff || prompt || '').trimEnd() + '\n');
  if (lanes[id]?.agent) put(`lanes/${id}.now`, lanes[id].agent + '\n');
}

const answers = docs('owed'), live = new Set(OWED.map((o) => o.id));
OWED.forEach(({ id, ...o }, order) => {
  put(`owed/${id}.json`, { ...o, order }); n.owed++;
  const a = answers[id];
  if (a && (a.choice || a.note)) { put(`owed/${id}.answer.json`, a); n.answers++; }
});
// answers to items the orchestrator already acted on and dropped from the page: kept as history
for (const [id, a] of Object.entries(answers)) if (!live.has(id) && (a.choice || a.note)) { put(`answered/${id}.answer.json`, a); n.archived++; }

for (const [id, d] of Object.entries(docs('inbox'))) {
  put(`inbox/${id}.json`, { text: d.text, at: d.at }); n.inbox++;
  if (d.status && d.status !== 'new') { put(`inbox/${id}.reply.json`, { status: d.status, reply: d.reply || '', handledAt: d.handledAt || '' }); n.replies++; }
}
console.log(n);

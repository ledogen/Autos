#!/usr/bin/env node
/* INFRA-10 check: the decision records in .planning/decisions/ are well-formed and FROZEN.
 * Frozen = once a record is `standing` on main, only its `status:` line may ever change; a change of mind is a
 * new record that `supersedes` it. The baseline is the main commit that first carried the record as standing
 * (first-parent, so a lane's work-in-progress commits before its landing do not count).
 *   node tools/dashboard/decisions.check.mjs */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, '.planning', 'decisions');
const AREAS = ['story', 'economy', 'world', 'roads', 'physics', 'perf', 'assets', 'ui', 'process', 'repo'];
const STATUSES = ['draft', 'standing', 'superseded'];
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

const bad = [];
const recs = new Map();
for (const name of existsSync(DIR) ? readdirSync(DIR).filter((n) => /^dec-.*\.md$/.test(n)).sort() : []) {
  const text = readFileSync(join(DIR, name), 'utf8');
  const fm = Object.fromEntries([...(/^---\n([\s\S]*?)\n---/.exec(text)?.[1] || '').matchAll(/^([\w-]+):[ \t]*(.*)$/gm)]
    .map(([, k, v]) => [k, v.replace(/\s+#.*$/, '').trim()]));
  const err = (msg) => bad.push(`${name}: ${msg}`);
  const num = /^dec-(\d{3})-[a-z0-9-]+\.md$/.exec(name)?.[1];
  if (!num) err('file name is not dec-NNN-<slug>.md');
  if (fm.id !== `DEC-${num}`) err(`id "${fm.id}" does not match the file name`);
  if (recs.has(fm.id)) err(`duplicate id ${fm.id}`);
  if (!STATUSES.includes(fm.status)) err(`status "${fm.status}" is not one of ${STATUSES.join(' / ')}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.decided || '')) err(`decided "${fm.decided}" is not a date`);
  if (!AREAS.includes(fm.area)) err(`area "${fm.area}" is not one of ${AREAS.join(' / ')}`);
  if (!fm.governs) err('governs is empty');
  for (const label of ['Ruling', 'Why', 'Replaces', 'Source']) if (!text.includes(`**${label}.**`)) err(`no **${label}.** line`);
  if (!new RegExp(`^# ${fm.id}: \\S`, 'm').test(text)) err('no "# DEC-NNN: title" heading');
  recs.set(fm.id, { name, ...fm });

  if (fm.status === 'draft') continue;
  // The freeze. `-S` is git's "pickaxe": it lists the commits where the count of that text changed.
  let base = '';
  try {
    base = git('log', '--first-parent', '--diff-merges=first-parent', '-s', '-Sstatus: standing', '--format=%H', 'main', '--',
      `.planning/decisions/${name}`).trim().split('\n').pop();
  } catch { /* no main here */ }
  if (!base) continue;                       // not landed as standing yet: still editable on its branch
  const changed = git('diff', base, '--', `.planning/decisions/${name}`).split('\n')
    .filter((l) => /^[+-](?![+-])/.test(l) && !/^[+-]status:/.test(l));
  if (changed.length) err(`edited after it became standing (${base.slice(0, 8)}): ${changed[0].slice(0, 80)}`);
}

for (const r of recs.values()) {
  if (r.supersedes) {
    const old = recs.get(r.supersedes);
    if (!old) bad.push(`${r.name}: supersedes ${r.supersedes}, which does not exist`);
    else if (old.status !== 'superseded') bad.push(`${old.name}: superseded by ${r.id} but its status is "${old.status}"`);
  }
  if (r.status === 'superseded' && ![...recs.values()].some((x) => x.supersedes === r.id)) {
    bad.push(`${r.name}: status superseded, but no record supersedes it`);
  }
}

const n = (st) => [...recs.values()].filter((r) => r.status === st).length;
console.log(`${recs.size} records: ${n('standing')} standing, ${n('draft')} draft, ${n('superseded')} superseded`);
if (bad.length) { console.error(bad.map((b) => `  FAIL ${b}`).join('\n')); process.exit(1); }
console.log('ok');

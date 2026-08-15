#!/usr/bin/env node
/**
 * RangerSim planning dashboard — indexer + static server.
 *
 * Scans .planning/todos/{pending,completed} into tickets.json and measures the
 * repo into stats.json, then serves tools/dashboard/ as a static site.
 *
 *   node tools/dashboard/index.mjs            index, then serve on :8010
 *   node tools/dashboard/index.mjs --once     index only, no server
 *   node tools/dashboard/index.mjs --port N   serve on another port
 *
 * This is a dev tool. It reads the repo and writes only its own two JSON files;
 * it never touches a ticket. Vocabulary drift in the tracker is normalised here
 * (see CANON_*) and reported back through stats.drift rather than rewritten.
 */
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import {
  readFileSync, writeFileSync, readdirSync, statSync, existsSync,
} from 'node:fs';
import { join, extname, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

/* ── vocabulary normalisation ─────────────────────────────────────────────
 * The tracker has drifted: 15 distinct `status` values and both `feature` and
 * `feat` under `type`. Map aliases onto canonical buckets so the filters mean
 * something; anything unmapped falls through as-is and shows up in the drift
 * panel so it can be cleaned up at the source later. */
const CANON_TYPE = {
  feature: 'feature', feat: 'feature',
  bug: 'bug',
  perf: 'perf',
  quality: 'quality', qual: 'quality', refactor: 'quality',
  infra: 'infra',
  asset: 'asset',
};
const CANON_STATUS = {
  open: 'open', pending: 'open',
  closed: 'closed', completed: 'closed', complete: 'closed', done: 'closed',
  resolved: 'closed', fixed: 'closed', merged: 'closed', 'closed-merged': 'closed',
  cancelled: 'cancelled', wontfix: 'cancelled', 'closed-invalid': 'cancelled',
  'closed-reverted': 'cancelled', deferred: 'cancelled',
};
const CANON_SEVERITY = {
  critical: 'critical',
  high: 'high',
  major: 'major',
  medium: 'medium', moderate: 'medium',
  minor: 'minor',
  trivial: 'trivial', none: 'trivial',
};
const SEVERITY_ORDER = ['critical', 'high', 'major', 'medium', 'minor', 'trivial'];

const TICKET_RE = /\b(FEAT|BUG|PERF|QUAL|INFRA|ASSET)-(\d+)\b/g;

/* ── frontmatter ──────────────────────────────────────────────────────────
 * Deliberately lenient, not a YAML parser. Values wrap across lines
 * (`relates: [FEAT-43 (story mode — …),\n  PERF-19 …]`) and one severity has a
 * trailing `#` comment glued on, so: join continuations, strip comments, and
 * pull ticket refs out with a regex rather than trying to parse the list. */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { fm: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: text };
  const raw = text.slice(text.indexOf('\n') + 1, end);
  const body = text.slice(text.indexOf('\n', end + 1) + 1);

  const fm = {};
  let key = null;
  for (const line of raw.split('\n')) {
    const m = /^([A-Za-z][\w-]*):\s?(.*)$/.exec(line);
    if (m) { key = m[1].toLowerCase(); fm[key] = m[2].trim(); }
    else if (key && line.trim()) fm[key] += ` ${line.trim()}`;
  }
  return { fm, body };
}

const stripComment = (v) => (v || '').replace(/\s*#.*$/, '').trim();

/**
 * First heading minus the `ID: ` prefix the tickets repeat in it. The earliest
 * tickets (BUG-02 era) carry `title:` in frontmatter and have no `#` heading at
 * all, so fall through to that before giving up and using the bare id.
 */
function titleOf(body, fm, id) {
  const m = /^#\s+(.+)$/m.exec(body);
  if (m) return m[1].replace(new RegExp(`^${id}\\s*[:—-]\\s*`), '').trim();
  return (fm.title || '').trim() || id;
}

/**
 * One-line summary for the condensed list: the first paragraph of the ticket's
 * Request/Description section, falling back to the first paragraph after the
 * title. The section matters — asset tickets open with a boilerplate role
 * paragraph ("POI model — a destination, not dressing…") that is identical
 * across a whole class and tells you nothing about the individual ticket.
 */
function blurbOf(body) {
  const lines = body.split('\n');
  const section = lines.findIndex((l) => /^#{2,3}\s+(request|description|problem|summary|context)\b/i.test(l));
  let i = section !== -1 ? section + 1 : lines.findIndex((l) => /^#\s+/.test(l)) + 1;
  const para = [];
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (para.length && !l) break;
    // Skip headings, tables, rules and standalone role labels ("**POI model**").
    if (!l || /^(#{1,6}\s|\||-{3,}|```|>)/.test(l) || /^\*\*[\w ]+\*\*$/.test(l)) {
      if (para.length) break;
      continue;
    }
    para.push(l);
  }
  const text = para.join(' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

/** Older tickets predate the `type:` field; the id prefix is authoritative anyway. */
const TYPE_FROM_PREFIX = {
  FEAT: 'feature', BUG: 'bug', PERF: 'perf', QUAL: 'quality', INFRA: 'infra', ASSET: 'asset',
};

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name.startsWith('.DS')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push({ path: p, size: st.size });
  }
  return out;
}

/* ── tickets ──────────────────────────────────────────────────────────── */
function indexTickets() {
  const tickets = [];
  const drift = [];

  for (const bucket of ['pending', 'completed']) {
    const dir = join(ROOT, '.planning', 'todos', bucket);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      const abs = join(dir, name);
      const text = readFileSync(abs, 'utf8');
      const { fm, body } = parseFrontmatter(text);
      const id = (fm.id || name.replace(/\.md$/, '')).trim();

      const [, prefix, num] = /^([A-Z]+)-(\d+)/.exec(id) || [null, id, '0'];

      const typeRaw = stripComment(fm.type).toLowerCase();
      const statusRaw = stripComment(fm.status).toLowerCase();
      const sevRaw = stripComment(fm.severity).toLowerCase();
      const type = CANON_TYPE[typeRaw] || TYPE_FROM_PREFIX[prefix] || typeRaw || 'unknown';
      const status = CANON_STATUS[statusRaw] || statusRaw || 'unknown';
      const severity = CANON_SEVERITY[sevRaw] || sevRaw || 'minor';

      const file = relative(ROOT, abs);
      if (!typeRaw) drift.push({ file, field: 'type', value: '(missing)', canon: type, note: 'inferred from id prefix' });
      else if (!CANON_TYPE[typeRaw]) drift.push({ file, field: 'type', value: typeRaw, canon: type });
      if (statusRaw && CANON_STATUS[statusRaw] !== statusRaw) {
        drift.push({ file, field: 'status', value: statusRaw, canon: status });
      }
      if (sevRaw && CANON_SEVERITY[sevRaw] !== sevRaw) {
        drift.push({ file, field: 'severity', value: sevRaw, canon: severity });
      }
      if (/#/.test(fm.severity || '')) drift.push({ file, field: 'severity', value: fm.severity, note: 'inline comment in value' });

      const refs = [...new Set(
        [fm.relates, fm['blocked-by'], fm.blocks, body].join(' ')
          .match(TICKET_RE) || [],
      )].filter((r) => r !== id);

      tickets.push({
        id,
        prefix,
        num: Number(num),
        title: titleOf(body, fm, id),
        blurb: blurbOf(body),
        type,
        typeRaw,
        status,
        statusRaw,
        severity,
        severityRaw: sevRaw,
        bucket,
        // Early tickets used created/resolved rather than opened/closed.
        opened: stripComment(fm.opened || fm.created) || null,
        updated: stripComment(fm.updated) || null,
        closed: stripComment(fm.closed || fm.resolved || fm.completed) || null,
        plan: fm.plan || null,
        handoff: fm.handoff || null,
        refs,
        file,
        abs,
        body,
      });
    }
  }

  tickets.sort((a, b) => (a.prefix === b.prefix ? b.num - a.num : a.prefix.localeCompare(b.prefix)));
  return { tickets, drift };
}

/* ── stats ────────────────────────────────────────────────────────────── */
const CODE_EXT = new Set(['.js', '.mjs', '.html', '.css', '.py']);

function measureCode() {
  const groups = [
    ['src', join(ROOT, 'src')],
    ['data', join(ROOT, 'data')],
    ['test', join(ROOT, 'test')],
    ['tools', join(ROOT, 'tools')],
    ['assets/models/src', join(ROOT, 'assets', 'models', 'src')],
    ['root', null], // index.html, vite.config.js, handbook.html
  ];
  const rows = [];
  for (const [name, dir] of groups) {
    let files = [];
    if (dir) files = walk(dir);
    else {
      files = readdirSync(ROOT)
        .map((n) => join(ROOT, n))
        .filter((p) => statSync(p).isFile())
        .map((p) => ({ path: p, size: statSync(p).size }));
    }
    files = files.filter((f) => CODE_EXT.has(extname(f.path)));
    if (!files.length) continue;
    let lines = 0; let bytes = 0;
    for (const f of files) {
      bytes += f.size;
      lines += readFileSync(f.path, 'utf8').split('\n').length;
    }
    rows.push({ name, files: files.length, lines, bytes });
  }
  return rows;
}

function measurePlanning() {
  const files = walk(join(ROOT, '.planning')).filter((f) => extname(f.path) === '.md');
  let lines = 0; let bytes = 0;
  for (const f of files) { bytes += f.size; lines += readFileSync(f.path, 'utf8').split('\n').length; }
  return { files: files.length, lines, bytes };
}

/** Shipped weight: what a server would actually put on the wire, per extension. */
function measureDist() {
  const dir = join(ROOT, 'dist');
  if (!existsSync(dir)) return null;
  const files = walk(dir);
  const byExt = new Map();
  let raw = 0; let gz = 0;
  for (const f of files) {
    const ext = extname(f.path) || '(none)';
    const buf = readFileSync(f.path);
    // .gz payloads are already compressed — count them as-is rather than double-gzipping.
    const g = ext === '.gz' ? buf.length : gzipSync(buf).length;
    raw += buf.length; gz += g;
    const e = byExt.get(ext) || { ext, files: 0, raw: 0, gz: 0 };
    e.files += 1; e.raw += buf.length; e.gz += g;
    byExt.set(ext, e);
  }
  const built = files.length
    ? new Date(Math.max(...files.map((f) => statSync(f.path).mtimeMs))).toISOString()
    : null;
  return {
    files: files.length,
    raw,
    gz,
    built,
    byExt: [...byExt.values()].sort((a, b) => b.raw - a.raw),
  };
}

/**
 * Load timings come from the PERF-08 harness runs already on disk — measuring
 * them live would mean booting headless Chrome for ~25 s per page view. Read
 * the newest run of each kind and carry its date so a stale number reads as
 * stale rather than current.
 */
function measurePerf() {
  const dir = join(ROOT, 'perf-runs');
  if (!existsSync(dir)) return null;
  const runs = [];
  for (const name of readdirSync(dir)) {
    const f = join(dir, name, 'run.json');
    if (!existsSync(f)) continue;
    try { runs.push({ name, ...JSON.parse(readFileSync(f, 'utf8')) }); } catch { /* skip */ }
  }
  runs.sort((a, b) => String(b.meta?.date).localeCompare(String(a.meta?.date)));
  const cold = runs.find((r) => r.coldload);
  const frames = runs.find((r) => r.frameStats?.n);
  return {
    total: runs.length,
    cold: cold && {
      run: cold.name,
      date: cold.meta?.date,
      preset: cold.meta?.preset,
      seed: cold.meta?.seed,
      msToReady: cold.coldload.msToReady,
      msToRingComplete: cold.coldload.msToRingComplete,
    },
    frames: frames && {
      run: frames.name,
      date: frames.meta?.date,
      preset: frames.meta?.preset,
      fpsMean: frames.frameStats.fpsMean,
      p50: frames.frameStats.p50,
      p95: frames.frameStats.p95,
      droppedPct: frames.frameStats.droppedPct,
    },
  };
}

function measureRouteCache() {
  const f = join(ROOT, 'data', 'route-cache-default.json.gz');
  return existsSync(f) ? { path: relative(ROOT, f), bytes: statSync(f).size } : null;
}

/* ── build ────────────────────────────────────────────────────────────── */
function build() {
  const { tickets, drift } = indexTickets();
  const code = measureCode();

  const stats = {
    generated: new Date().toISOString(),
    root: ROOT,
    code,
    codeTotal: code.reduce(
      (a, r) => ({ files: a.files + r.files, lines: a.lines + r.lines, bytes: a.bytes + r.bytes }),
      { files: 0, lines: 0, bytes: 0 },
    ),
    planning: measurePlanning(),
    dist: measureDist(),
    perf: measurePerf(),
    routeCache: measureRouteCache(),
    tickets: {
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'open').length,
      closed: tickets.filter((t) => t.status === 'closed').length,
      cancelled: tickets.filter((t) => t.status === 'cancelled').length,
      byType: Object.fromEntries(
        [...new Set(tickets.map((t) => t.type))].map((ty) => [
          ty,
          {
            total: tickets.filter((t) => t.type === ty).length,
            open: tickets.filter((t) => t.type === ty && t.status === 'open').length,
          },
        ]),
      ),
    },
    drift,
    severityOrder: SEVERITY_ORDER,
  };

  writeFileSync(join(HERE, 'tickets.json'), JSON.stringify({ tickets }));
  writeFileSync(join(HERE, 'stats.json'), JSON.stringify(stats, null, 1));
  return { tickets, stats };
}

/* ── serve ────────────────────────────────────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function serve(port) {
  createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/reindex') {
      const { tickets, stats } = build();
      res.writeHead(200, { 'content-type': MIME['.json'] });
      res.end(JSON.stringify({ ok: true, tickets: tickets.length, generated: stats.generated }));
      return;
    }
    const name = url.pathname === '/' ? '/app.html' : url.pathname;
    const file = join(HERE, name.replace(/^\/+/, ''));
    if (!file.startsWith(HERE) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(readFileSync(file));
  }).listen(port, () => {
    console.log(`  dashboard  http://localhost:${port}/`);
  });
}

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const port = portArg !== -1 ? Number(args[portArg + 1]) : 8010;

const { tickets, stats } = build();
console.log(`  indexed    ${tickets.length} tickets (${stats.tickets.open} open)`);
console.log(`  code       ${stats.codeTotal.lines.toLocaleString()} lines in ${stats.codeTotal.files} files`);
if (stats.drift.length) console.log(`  drift      ${stats.drift.length} non-canonical frontmatter values`);
if (!args.includes('--once')) serve(port);

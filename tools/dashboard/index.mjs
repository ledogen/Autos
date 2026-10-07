#!/usr/bin/env node
/**
 * AUTOS planning dashboard — indexer + static server.
 *
 * Scans .planning/todos/{pending,completed} into tickets.json, measures the
 * repo into stats.json, and joins the story-mode cargo list with the POI types
 * (docs + live code) into cargo.json, then serves tools/dashboard/ as a static site.
 *
 *   node tools/dashboard/index.mjs            index, then serve on :8010
 *   node tools/dashboard/index.mjs --once     index only, no server
 *   node tools/dashboard/index.mjs --port N   serve on another port
 *
 * This is a dev tool. It reads the repo and writes only its own three JSON files;
 * it never touches a ticket. Vocabulary drift in the tracker is normalised here
 * (see CANON_*) and reported back through stats.drift rather than rewritten.
 */
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import {
  readFileSync, writeFileSync, readdirSync, statSync, existsSync,
} from 'node:fs';
import { join, extname, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  milestone: 'milestone',
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

/* `SM` is last and requires digits immediately after the dash, so the design
 * docs' `SM-INV-14` invariant tags can never be read as milestone refs. */
const TICKET_RE = /\b(FEAT|BUG|PERF|QUAL|INFRA|ASSET|SM)-(\d+)\b/g;

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
  SM: 'milestone',
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

/* ── milestones ───────────────────────────────────────────────────────────
 * The SM-N story milestones live as `## SM-N — Title` sections of one prose
 * file, not as ticket files, so they were invisible here. The owner reads them
 * as tickets ("in my head theyre basically tickets"), so they are indexed into
 * the same list — synthesised, never written back. MILESTONES.md stays the
 * source of truth and the only place they are edited.
 *
 * They carry no `severity` (null, so the severity chips ignore them) and their
 * status is derived, not declared: shipped from the heading's ✅, active from
 * the "Where we are" section saying so, planned otherwise. */
function indexMilestones() {
  const rel = join('.planning', 'story-mode', 'MILESTONES.md');
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const text = readFileSync(abs, 'utf8');
  const lines = text.split('\n');

  // Heading line numbers first, so each section can carry a deep editor link.
  const heads = [];
  lines.forEach((l, i) => {
    const m = /^##\s+SM-(\d+)\s*[—-]\s*(.+?)\s*$/.exec(l);
    if (m) heads.push({ num: Number(m[1]), rawTitle: m[2], line: i + 1 });
  });

  return heads.map((h, k) => {
    const from = h.line;                                    // line after the heading
    const to = k + 1 < heads.length ? heads[k + 1].line - 1 : lines.length;
    const body = lines.slice(from, to).join('\n').trim();
    const id = `SM-${h.num}`;

    // "The Day (sleep is the clock) ✅ **SHIPPED 2026-07-30**" → title + date.
    const shipped = /✅|\bSHIPPED\b/.test(h.rawTitle);
    const shipDate = (/SHIPPED\s+(\d{4}-\d{2}-\d{2})/.exec(h.rawTitle) || [])[1] || null;
    const title = h.rawTitle.replace(/\s*✅.*$/, '').replace(/\s*\*\*SHIPPED[^*]*\*\*/, '').trim();

    // Declared in the doc's own words; `Requires:` and `Goal:` wrap over lines.
    const grab = (label) => {
      // `$(?![\s\S])` is end-of-STRING: plain `$` under /m stops at the first
      // line break and would clip SM-2's two-line Requires.
      const m = new RegExp(
        `^\\*\\*${label}:?\\*\\*:?\\s*([\\s\\S]*?)(?=\\n\\s*\\n|\\n[-*>#]|$(?![\\s\\S]))`, 'm',
      ).exec(body);
      return m ? m[1].replace(/\s+/g, ' ').trim() : null;
    };
    // Same de-markdowning blurbOf applies — the list renders blurbs as plain text.
    const plain = (v) => (v || '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim() || null;
    const goal = plain(grab('Goal'));
    const requires = grab('Requires');

    // "SM-2 IS OPEN" is stated in the file's "Where we are" build-state section,
    // which sits above every milestone section — so search the whole document.
    const active = new RegExp(`\\*\\*${id} IS OPEN`).test(text)
      || new RegExp(`${id} IS OPEN`).test(text);
    const phase = shipped ? 'shipped' : active ? 'active' : 'planned';

    const refs = [...new Set(body.match(TICKET_RE) || [])].filter((r) => r !== id);

    return {
      id,
      prefix: 'SM',
      num: h.num,
      title,
      blurb: goal ? (goal.length > 220 ? `${goal.slice(0, 217)}…` : goal) : blurbOf(body),
      type: 'milestone',
      typeRaw: 'milestone',
      status: shipped ? 'closed' : 'open',
      statusRaw: phase,
      severity: null,
      severityRaw: null,
      bucket: 'milestone',
      phase,
      goal,
      requires,
      opened: null,
      updated: null,
      closed: shipDate,
      plan: null,
      handoff: null,
      refs,
      file: rel,
      line: h.line,
      abs,
      body,
    };
  });
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

  tickets.push(...indexMilestones());

  // Newest-first within a class, except milestones: SM-1..SM-5 is a build order,
  // so reading it backwards is nonsense.
  tickets.sort((a, b) => (a.prefix === b.prefix
    ? (a.prefix === 'SM' ? a.num - b.num : b.num - a.num)
    : a.prefix.localeCompare(b.prefix)));
  return { tickets, drift };
}

/* ── cargo + places ───────────────────────────────────────────────────────
 * Story-mode burn-down views. `cargo.md` is the master cargo list (markdown
 * tables, one per delivery type); `pois.md` lists the planned POI types and the
 * roadside spots. Live POI types are read from the code, never from a doc:
 * `POI_ROSTER` (src/poi.js) and `SOURCES` (data/offers.js).
 *
 * Anything that can't be read — a malformed row, an asset with no ticket, a
 * route naming a place nobody defines — becomes a warning on the view, never a
 * silently dropped row. `view` says which strip shows it ('both' = both). */

/**
 * Every markdown table in `text`, with the `##` / `###` headings it sits under
 * and each row's 1-based line number. Cells split on `|`; none of the story
 * docs put a pipe inside a cell.
 */
function mdTables(text) {
  const lines = text.split('\n');
  const cells = (s) => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const out = [];
  let h2 = ''; let h3 = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^##\s/.test(l)) { h2 = l.replace(/^##\s+/, ''); h3 = ''; continue; }
    if (/^###\s/.test(l)) { h3 = l.replace(/^###\s+/, ''); continue; }
    if (!l.trim().startsWith('|') || !/^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/.test(lines[i + 1] || '')) continue;
    const table = { h2, h3, head: cells(l), line: i + 1, rows: [] };
    for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
      table.rows.push({ cells: cells(lines[i]), line: i + 1 });
    }
    i--;
    out.push(table);
  }
  return out;
}

/**
 * One end of a route: `farm / burgerJoint`, `any (as today)`, `"the school"†`.
 * `label` keeps the annotation for display; `name` is what matching uses —
 * parentheses, quotes and the † (roadside-spot marker) stripped.
 */
const routeEnds = (side) => side.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean)
  .map((label) => ({
    label,
    name: label.replace(/\([^)]*\)/g, '').replace(/[†"`]/g, '').trim(),
    roadside: label.includes('†'),
  }));

/** `ASSET-30 / 29 / 28 / 27` → four ids; `ASSET-28 + text` → one; `none — …` → none. */
function assetIds(cell) {
  const ids = [];
  for (const m of cell.matchAll(/ASSET-(\d+)((?:\s*\/\s*\d+)*)/g)) {
    ids.push(m[1], ...(m[2].match(/\d+/g) || []));
  }
  return [...new Set(ids.map((n) => `ASSET-${n.padStart(2, '0')}`))];
}

function indexCargo(byId, warn) {
  const file = join('.planning', 'story-mode', 'cargo.md');
  const abs = join(ROOT, file);
  if (!existsSync(abs)) { warn('cargo', file, null, 'file missing'); return []; }
  const cargo = [];

  for (const t of mdTables(readFileSync(abs, 'utf8'))) {
    // Only the four delivery-type sections; the key table up top, Rulings and
    // Adding cargo have no matching `##` and fall out here.
    const kind = (/^(Courier|Haul|Freight|Fragile)\b/i.exec(t.h2) || [])[1]?.toLowerCase();
    if (!kind) continue;
    const col = (re) => t.head.findIndex((h) => re.test(h));
    const cRegion = col(/^region$/i); const cName = col(/^(thing|job|load)$/i);
    const cRoute = col(/^from\s*→\s*to$/i); const cAsset = col(/^asset$/i);
    const cMass = col(/^mass\b/i); const cNote = col(/^note$/i);
    if (cRegion !== 0 || cName === -1 || cRoute === -1) {
      warn('cargo', file, t.line, `table header not recognised: | ${t.head.join(' | ')} |`);
      continue;
    }
    const kg = cMass !== -1 && /kg/i.test(t.head[cMass]);
    const group = /^people\b/i.test(t.h3) ? 'people' : null;

    for (const { cells: c, line } of t.rows) {
      if (c.length !== t.head.length) warn('cargo', file, line, `${c.length} cells, header has ${t.head.length}`);
      const region = c[cRegion]; const name = c[cName] || '';
      if (!/^R\d+$/.test(region) || !name) {
        warn('cargo', file, line, `unparsed row: | ${c.join(' | ')} |`);
        continue;
      }
      // Blank route = generic (any giver, to anywhere).
      const route = c[cRoute] || '';
      const sides = route.split('→');
      if (route && sides.length !== 2) warn('cargo', file, line, `route without a single →: "${route}"`);
      const generic = !route || sides.length !== 2;

      const assetText = cAsset === -1 ? '' : c[cAsset] || '';
      const assets = assetIds(assetText).map((id) => {
        const tk = byId.get(id);
        if (!tk) warn('cargo', file, line, `${id} has no ticket`);
        return { id, status: !tk ? 'missing' : tk.status === 'closed' ? 'shipped' : 'ticketed' };
      });
      // `Mass (kg)` carries bare numbers: put the unit after the leading range.
      const mass = cMass === -1 ? '' : (c[cMass] || '').replace(kg ? /^([\d.]+(?:\s*[–-]\s*[\d.]+)?)(?!\s*kg)/ : /(?!)/, '$1 kg');

      cargo.push({
        idx: cargo.length,
        kind, group, region, name, line,
        generic,
        route,
        from: generic ? [] : routeEnds(sides[0]),
        to: generic ? [] : routeEnds(sides[1]),
        assets,
        assetText,
        assetStatus: assets.length ? [...new Set(assets.map((a) => a.status))] : ['none'],
        mass,
        note: cNote === -1 ? '' : c[cNote] || '',
      });
    }
  }
  return cargo;
}

/**
 * `POI_ROSTER` sliced out of src/poi.js and evaluated on its own. Importing the
 * module would drag in mission.js, paper-route.js and the prop registry, so the
 * array literal is scanned instead — strings and comments skipped, brackets
 * matched — and only that literal is run. It is plain data by design.
 */
function extractRoster(src) {
  const at = src.indexOf('export const POI_ROSTER');
  if (at === -1) throw new Error('no `export const POI_ROSTER`');
  let out = ''; let depth = 0;
  for (let i = src.indexOf('[', at); i < src.length; i++) {
    const two = src.slice(i, i + 2);
    if (two === '//') { const n = src.indexOf('\n', i); i = n === -1 ? src.length : n - 1; continue; }
    if (two === '/*') { i = src.indexOf('*/', i + 2) + 1; if (i === 0) break; continue; }
    const ch = src[i];
    if (ch === '\'' || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1); i = j; continue;
    }
    out += ch;
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return new Function(`return (${out})`)();
  }
  throw new Error('POI_ROSTER array literal never closes');
}

async function indexPlaces(cargo, warn) {
  // Live types — from code.
  let roster = []; let SOURCES = {};
  try {
    roster = extractRoster(readFileSync(join(ROOT, 'src', 'poi.js'), 'utf8'));
    if (!Array.isArray(roster)) throw new Error('not an array');
    roster = roster.filter((s) => {
      const ok = s && typeof s.type === 'string' && Number.isFinite(s.count);
      if (!ok) warn('places', 'src/poi.js', null, `POI_ROSTER entry without type/count: ${JSON.stringify(s)}`);
      return ok;
    });
  } catch (e) { warn('places', 'src/poi.js', null, `POI_ROSTER unreadable: ${e.message}`); roster = []; }
  try {
    // Query string defeats the ESM module cache so /reindex sees edits.
    ({ SOURCES } = await import(`${pathToFileURL(join(ROOT, 'data', 'offers.js')).href}?${Date.now()}`));
  } catch (e) { warn('places', 'data/offers.js', null, `SOURCES unreadable: ${e.message}`); }
  for (const k of Object.keys(SOURCES || {})) {
    if (!roster.some((s) => s.type === k)) warn('places', 'data/offers.js', null, `SOURCES.${k} has no POI_ROSTER type`);
  }

  // Planned types + roadside spots — from pois.md.
  const file = join('.planning', 'story-mode', 'pois.md');
  const abs = join(ROOT, file);
  const tables = existsSync(abs) ? mdTables(readFileSync(abs, 'utf8')) : [];
  if (!existsSync(abs)) warn('places', file, null, 'file missing');
  const table = (re, what) => {
    const t = tables.find((x) => re.test(x.h2));
    if (!t) warn('places', file, null, `no "${what}" table`);
    return t;
  };
  const rowsOf = (t, cols) => {
    if (!t) return [];
    const at = cols.map((c) => t.head.findIndex((h) => h.toLowerCase().startsWith(c.toLowerCase())));
    cols.forEach((c, k) => { if (at[k] === -1) warn('places', file, t.line, `column "${c}" missing`); });
    return t.rows.map(({ cells, line }) => {
      if (cells.length !== t.head.length) warn('places', file, line, `${cells.length} cells, header has ${t.head.length}`);
      return { line, ...Object.fromEntries(cols.map((c, k) => [c.toLowerCase(), at[k] === -1 ? '' : cells[at[k]] || ''])) };
    });
  };

  const planned = rowsOf(
    table(/^Planned POI types/i, 'Planned POI types'),
    ['Type', 'Status', 'Region', 'Gives', 'Receives', 'Tags', 'Model', 'Ticket'],
  ).filter((r) => {
    r.type = r.type.replace(/`/g, '').trim();
    r.statusRaw = r.status;
    // The doc's own Gives / Receives prose; `sends` / `receives` are computed below.
    r.docGives = r.gives; r.docReceives = r.receives;
    delete r.gives; delete r.receives;
    r.status = (/^\w+/.exec(r.status) || [''])[0].toLowerCase();
    if (!/^\w+$/.test(r.type)) { warn('places', file, r.line, `unparsed type "${r.type}"`); return false; }
    if (roster.some((s) => s.type === r.type)) warn('places', file, r.line, `\`${r.type}\` is live in code — delete its planned row`);
    return true;
  });

  const spots = rowsOf(
    table(/^Roadside spots/i, 'Roadside spots'),
    ['Spot', 'Form', 'Tags', 'Promises', 'Status', 'Note'],
  ).filter((r) => {
    r.names = [...r.spot.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (!r.names.length) warn('places', file, r.line, `spot with no "quoted" name: ${r.spot}`);
    return r.names.length > 0;
  });

  // Cargo routes → per-place sends / receives (exact name match; `any` matches nothing).
  const flow = (names) => ({
    sends: cargo.filter((c) => c.from.some((e) => names.includes(e.name))).map((c) => c.idx),
    receives: cargo.filter((c) => c.to.some((e) => names.includes(e.name))).map((c) => c.idx),
  });
  const live = roster.map((s) => ({
    type: s.type, count: s.count, model: s.model ?? null, modelPool: s.modelPool ?? null,
    siting: s.siting ?? null, tags: s.tags || [], drop: !!s.drop,
    gives: SOURCES?.[s.type] || null,
    ...flow([s.type]),
  }));
  for (const p of planned) Object.assign(p, flow([p.type]));
  for (const p of spots) Object.assign(p, flow(p.names));

  const known = new Set(['any', ...live.map((p) => p.type), ...planned.map((p) => p.type), ...spots.flatMap((p) => p.names)]);
  for (const c of cargo) {
    for (const e of [...c.from, ...c.to]) {
      if (!known.has(e.name)) warn('both', join('.planning', 'story-mode', 'cargo.md'), c.line, `"${c.name}": place "${e.name}" is not a live type, planned type or roadside spot`);
    }
  }

  return {
    live,
    planned,
    spots,
    summary: {
      livePois: live.reduce((n, p) => n + p.count, 0),
      liveSlots: live.reduce((n, p) => n + (p.gives ? p.count * (p.gives.slots || 0) : 0), 0),
      plannedTypes: planned.length,
    },
  };
}

async function indexStory(tickets) {
  const warnings = [];
  const warn = (view, file, line, msg) => warnings.push({ view, file, line, msg });
  const cargo = indexCargo(new Map(tickets.map((t) => [t.id, t])), warn);
  const places = await indexPlaces(cargo, warn);
  return { cargo, places, warnings };
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
async function build() {
  const { tickets, drift } = indexTickets();
  const story = await indexStory(tickets);
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
  writeFileSync(join(HERE, 'cargo.json'), JSON.stringify(story));
  return { tickets, stats, story };
}

/* ── serve ────────────────────────────────────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function serve(port) {
  createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/reindex') {
      const { tickets, stats } = await build();
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

const { tickets, stats, story } = await build();
console.log(`  indexed    ${tickets.length} tickets (${stats.tickets.open} open)`);
console.log(`  code       ${stats.codeTotal.lines.toLocaleString()} lines in ${stats.codeTotal.files} files`);
console.log(`  cargo      ${story.cargo.length} rows · ${story.places.live.length} live / ${story.places.planned.length} planned types · ${story.places.spots.length} spots`);
if (story.warnings.length) console.log(`  story      ${story.warnings.length} cargo/places warnings`);
if (stats.drift.length) console.log(`  drift      ${stats.drift.length} non-canonical frontmatter values`);
if (!args.includes('--once')) serve(port);

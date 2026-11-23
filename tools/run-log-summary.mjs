#!/usr/bin/env node
// tools/run-log-summary.mjs — FEAT-242: a run summary from the run logger's JSON Lines parts (src/run-log.js).
//
//   node tools/run-log-summary.mjs ~/Downloads/autos-run-<seed>-<start>.jsonl
//
// BUG-199: the logger saves ONE file per download (its stored parts joined). A run saved and resumed leaves several
// files (DEC-481): give them all, in any order, and they are stitched by first timestamp. A line that does not parse
// (a part cut off mid-write) is skipped and counted. `summarize(events)` and `report(s)` are exported for test/run-log.mjs.
// Old logs without the FEAT-324 fields still summarise: a block with nothing to read says "not recorded".

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { gradeRun, amountGrade, RANK_THRESHOLDS_DEFAULT } from '../src/par.js'   // the game's own rank rule (FEAT-324: never a copy)
import { rankTable, fragileLines } from '../src/economy.js'
import { THINGS } from '../data/offers.js'
import { ITEMS } from '../data/items.js'

const TELEPORT_M = 100   // a route step longer than this in one 1 s sample is a reseat or a tow, not driving
const DAMAGE_EVENTS = new Set(['impact', 'bumpStop', 'rimStrike', 'puncture', 'missShift'])
const JOB_ON = new Set(['countdown', 'staging', 'loading', 'running'])

const lost = (dmg) => Object.values(dmg ?? {}).reduce((a, [b, c]) => a + (b - c), 0)
const gameH = (e) => (e.day ?? 0) * 24 + (e.hr ?? 0)


const clock = (e) => `day ${e.day} ${String(Math.floor(e.hr ?? 0)).padStart(2, '0')}:${String(Math.floor(((e.hr ?? 0) % 1) * 60)).padStart(2, '0')}`
const tireOf = (id) => /^(tire|spareTire)/.test(id ?? '')
const CORNERS = ['FL', 'FR', 'RL', 'RR']
// src/main.js _MACHINE_WORD slots: 0 engine · 1-4 wheel · 5-8 wheel bent · 9-12 tire · 13 air filter · 14 oil. The only
// tracks that ever raise an alert; a log line carries the slot id ('w13') and the words, not the track.
export function alertTrack (id) {
  const m = /^w(\d+)$/.exec(id ?? '')
  if (!m) return null
  const i = +m[1]
  return i === 0 ? 'engine' : i <= 4 ? `wheel${CORNERS[i - 1]}` : i <= 8 ? `wheel${CORNERS[i - 5]}` : i <= 12 ? `tire${CORNERS[i - 9]}` : i === 13 ? 'airFilter' : i === 14 ? 'oil' : null
}
/** FEAT-138: the axis a job is lettered on when it is NOT time (main.js onSettle) — fragile on its condition against
 *  its tier's lines, haul on the pieces aboard, freight on the kg. null = a time job (courier, papers, fetch, demolition). */
export function amountAxis (e) {
  const r = e.result, region = e.job?.terms?.region ?? 1
  if (r.health != null) {
    const tier = THINGS.find(t => t.id === e.spec?.thingId)?.tier
    return tier ? { name: 'condition', v: r.health, th: fragileLines(region, tier, (e.job?.distance ?? 0) / 1000), f: (x) => `${(x * 100).toFixed(1)} %` } : null
  }
  if (r.aboard != null) return { name: 'pieces aboard', v: r.aboard, th: rankTable('haul', region, 'firewood'), f: (x) => `${x}` }
  if (e.job?.cargoKg && e.spec?.family !== 'fragile') return { name: 'load', v: e.job.cargoKg, th: rankTable('freight', region), f: (x) => `${x} kg` }
  return null
}
const ALERT_TRACKS = new Set(Array.from({ length: 15 }, (_, i) => alertTrack('w' + i)))   // every track a machine word can name
const FOOD_RE = /food|eat|meal|cook|chili|lunch|burger|peanut|coffee|drink/i
const MAINT_RE = /repair|fit|oil|filter|align|tire|wheel|brake|spring|damper|engine|swap|service|patch|plug|bead|radiator|part/i
/** A purchase line's money class: maintenance · food · gear (everything else, incl. spare parts' opposite: gear/other). */
export function purchaseClass (l) {
  const id = Object.keys(ITEMS).find(k => l.label === `Buy ${ITEMS[k].name}`), item = id && { ...ITEMS[id], id }
  if (l.eat > 0 || item?.kind === 'food' || item?.id === 'coffee' || (!item && FOOD_RE.test(l.m ?? ''))) return 'food'
  if (item?.kind === 'part' || (!item && MAINT_RE.test(`${l.m} ${l.label}`))) return 'maint'
  return 'gear'
}

export function summarize (events) {
  const s = { events: events.length, days: new Set(), km: 0, teleports: 0, jobs: {}, money: {}, wear: {}, damage: {},
    top: [], punctures: [], purchases: [], fuel: { gal: 0, sale: 0, visits: 0 }, shopH: {}, tows: [], sleeps: [], eats: 0, runs: [],
    meals: [], cash: {}, firstOther: null, jobList: [], grants: [], uses: {}, alerts: {}, minCond: {}, start: null, end: null,
    first: events.find(e => e.day != null) ?? null, last: null, tires: [{ km: 0, lost: 0, changes: [] }, { km: 0, lost: 0, changes: [] }, { km: 0, lost: 0, changes: [] }, { km: 0, lost: 0, changes: [] }],
    hungryH: 0, exhaustedH: 0, rotted: 0, fixes: [], fitLines: [], fitEvents: 0 }
  let prev = null, job = null
  const day$ = (d) => (s.cash[d] ??= { jobBase: 0, tip: 0, other: 0, sold: 0, maint: 0, fuel: 0, food: 0, tows: 0, gear: 0 })
  const seeCond = (c) => { for (const k in c ?? {}) s.minCond[k] = Math.min(s.minCond[k] ?? 1, c[k]) }
  const lose = (id, v) => { const c = CORNERS.findIndex(x => id === `tire${x}`); if (c >= 0) s.tires[c].lost += v }
  const change = (c, e, what, off) => { if (c >= 0 && c < 4) s.tires[c].changes.push({ e, what, off }) }
  for (const e of events) {
    if (e.day != null) { s.days.add(e.day); s.last = e }
    if (e.e === 'runStart' || e.e === 'header') {
      s.runs.push({ how: e.how, seed: e.seed, day: e.day, wallet: e.wallet, e })
      if (e.cond && (e.how === 'new' || !s.start)) s.start = e
    }
    if (e.cond && (e.e === 'exit' || e.e === 'runEnd' || e.e === 'campWon' || (e.e === 'route' && !(s.end?.e === 'exit' || s.end?.e === 'runEnd')) )) { if (e.e !== 'route' || e.inv === undefined) s.end = (e.e === 'route' && s.end && s.end.inv) ? s.end : e }
    if (e.cond) seeCond(e.cond)
    for (const id in e.dmg ?? {}) { const d = e.dmg[id]; if (Array.isArray(d)) { s.minCond[id] = Math.min(s.minCond[id] ?? 1, d[1]); lose(id, d[0] - d[1]) } }
    if (e.e === 'route') {
      if (prev?.pos && e.pos) {
        const d = Math.hypot(e.pos[0] - prev.pos[0], e.pos[2] - prev.pos[2])
        if (d > TELEPORT_M) s.teleports++
        else { s.km += d / 1000; for (const t of s.tires) t.km += d / 1000 }
        const dh = gameH(e) - gameH(prev)
        if (dh > 0 && dh < 0.5) {
          if (e.fedH != null && e.fedH <= 0) s.hungryH += dh
          if (e.energyH != null && e.energyH < 0) s.exhaustedH += dh
        }
      }
      prev = e
      const m = (s.money[e.day] ??= { start: e.wallet, min: e.wallet, max: e.wallet, end: e.wallet })
      m.min = Math.min(m.min, e.wallet); m.max = Math.max(m.max, e.wallet); m.end = e.wallet
      for (const id in e.wear ?? {}) for (const k in e.wear[id]) {
        const key = `${id} · ${k}`
        s.wear[key] = (s.wear[key] ?? 0) + e.wear[id][k]
        lose(id, e.wear[id][k])
      }
    }
    if (DAMAGE_EVENTS.has(e.e)) {
      const d = (s.damage[e.e] ??= { n: 0, lost: 0, popped: 0 })
      const l = lost(e.dmg)
      d.n++; d.lost += l; d.popped += e.popped?.length ?? (e.e === 'puncture' ? 1 : 0)
      if (l > 0) s.top.push({ l, e })
      if (job) job.lost += l, job.events++
      if (e.e === 'puncture' || e.popped?.length) s.punctures.push(e)
    }
    if (e.e === 'mission') {
      const type = e.offer?.type ?? e.job?.kind ?? e.job?.type ?? 'quick'
      if (JOB_ON.has(e.state) && !job) job = { type, t0: e.real, h0: gameH(e), lost: 0, events: 0 }
      if (e.state === 'done' && e.result) {
        const j = (s.jobs[type] ??= { n: 0, realS: 0, gameH: 0, pay: 0, deeds: 0, ranks: {}, abandoned: 0, expired: 0 })
        j.n++
        if (job) { j.realS += (e.real - job.t0) / 1000; j.gameH += gameH(e) - job.h0 }
        j.pay += e.result.payout ?? 0; j.deeds += e.result.points ?? 0
        if (e.result.letter) j.ranks[e.result.letter] = (j.ranks[e.result.letter] ?? 0) + 1
        if (e.result.abandoned) j.abandoned++
        if (e.result.expired) j.expired++
        const c = day$(e.day), r = e.result
        c.jobBase += r.base ?? 0; c.tip += r.tip ?? 0; c.other += Math.max(0, (r.payout ?? 0) - (r.base ?? 0) - (r.tip ?? 0))
        const th = e.job?.terms?.thresholds ?? RANK_THRESHOLDS_DEFAULT
        const g = r.par > 0 ? gradeRun(r.elapsed, r.par, th) : null   // the game's grading, on the logged par and thresholds
        const ax = amountAxis(e)   // a fragile / haul / freight job is NOT lettered on time: its own axis gives the check and margins
        const order = ['S', 'A', 'B', 'C'], letter = r.letter ?? (ax ? amountGrade(ax.v, ax.th) : g?.letter), li = order.indexOf(letter)   // the game's own letter is the rank; the thresholds only give the margins
        s.jobList.push({ e, type, g, ax, axLetter: ax && amountGrade(ax.v, ax.th), letter, th, par: r.par, elapsed: r.elapsed, award: r.award, abandoned: r.abandoned, lost: job?.lost ?? null, events: job?.events ?? null,
          toNext: ax ? (li > 0 ? ax.th[order[li - 1]] - ax.v : null) : g && li > 0 ? r.elapsed - th[order[li - 1]] * r.par : null,   // more needed (amount) / s faster (time) for the next rank
          slack: ax ? (li >= 0 && li < 4 ? ax.v - ax.th[order[li]] : null) : g && li >= 0 && li < 4 ? th[order[li]] * r.par - r.elapsed : null })   // to lose (amount) / s slower (time) before dropping a rank
        job = null
      }
      if (e.state === 'idle') job = null
    }
    if (e.e === 'purchase') {
      for (const l of e.lines ?? []) {
        s.purchases.push({ day: e.day, label: l.label ?? l.m, price: l.price - (l.earn ?? 0), e })
        const t = (s.shopH[e.day] ??= { food: 0, maint: 0 })
        const cls = purchaseClass(l)
        t[l.eat > 0 || cls === 'food' ? 'food' : 'maint'] += l.hours ?? 0
        const c = day$(e.day)
        c[cls] += l.price ?? 0; c.sold += l.earn ?? 0
        if (cls === 'gear' && !s.firstOther) s.firstOther = { e, label: l.label ?? l.m }
        s.fixes.push({ e, text: `${l.m} ${l.label} ${JSON.stringify(l.args ?? '')}` })
        if ((l.m === 'buyAndFit' || l.m === 'exchange') && /^tire/.test(l.args?.[1] ?? '')) s.fitLines.push({ c: CORNERS.indexOf(l.args[1].slice(4)), e, what: l.label })
      }
    }
    if (e.e === 'fuel' && e.sale != null) { s.fuel.gal += e.gal; s.fuel.sale += e.sale; s.fuel.visits++; day$(e.day).fuel += e.sale }
    if (e.e === 'tow') { s.tows.push(e); day$(e.day).tows += e.price ?? 0 }
    if (e.e === 'sleep') s.sleeps.push(e)
    if (e.e === 'eat') { s.eats++; s.meals.push(e) }
    if (e.e === 'item') {
      if (e.act === 'grant') s.grants.push(e)
      else { const u = (s.uses[e.id] ??= { use: 0, consume: 0, take: 0, remove: 0, drop: 0 }); u[e.act] = (u[e.act] ?? 0) + (e.n ?? 1)
        if (e.act === 'drop' && /^rotten/.test(e.id)) s.rotted += e.n ?? 1 }
    }
    if (e.e === 'alert') {
      const a = (s.alerts[e.id] ??= { text: e.text, n: 0, first: e, track: alertTrack(e.id) })
      a.n++
    }
    if (e.e === 'tire' && e.act === 'fitSpare') change(e.corner, e, 'spare', e.offCond)
    if (e.e === 'tire' && e.act === 'tireService') e.jobs?.forEach((j, i) => j.tire && change(j.corner, e, 'new (tow service)', e.old?.[i]))
    if (e.e === 'fit') s.fitEvents ||= e.real   // when fit records begin: shop lines before it come from an older log part
    if (e.e === 'fit' && tireOf(e.id) && /^tire/.test(e.socket ?? e.slot ?? '')) change(CORNERS.indexOf(String(e.socket ?? e.slot).slice(4)), e, e.id, e.offCond?.tire ?? e.offCond)
  }
  for (const x of s.fitLines) if (!s.fitEvents || x.e.real < s.fitEvents - 60000) change(x.c, x.e, x.what, null)   // an old log (or the old part of a stitched run): the shop lines only, no taken-off condition
  s.top.sort((a, b) => b.l - a.l)
  s.top = s.top.slice(0, 10).map(x => x.e)
  s.days = [...s.days].sort((a, b) => a - b)
  return s
}

/** JSON Lines → events; unparseable lines (a cut-off part) are counted, not fatal. */
export function parseLines (text) {
  const out = []
  let bad = 0
  for (const l of text.split('\n')) {
    if (!l.trim()) continue
    try { out.push(JSON.parse(l)) } catch { bad++ }
  }
  return { events: out, bad }
}

/** Several files of one run (save, exit, resume, win): ordered by their first timestamp, joined; a line seen twice (a file
 *  given twice) is dropped. -> { events, bad, files, dup } */
export function stitch (texts) {
  const parsed = texts.map(parseLines).filter(p => p.events.length)
  parsed.sort((a, b) => (a.events[0].real ?? 0) - (b.events[0].real ?? 0))
  const seen = new Set(), events = []
  let dup = 0
  for (const p of parsed) for (const e of p.events) {
    const k = JSON.stringify(e)
    if (seen.has(k)) { dup++; continue }
    seen.add(k); events.push(e)
  }
  return { events, bad: texts.map(parseLines).reduce((n, p) => n + p.bad, 0), files: texts.length, dup }
}

const $ = (v) => `$${(v ?? 0).toFixed(2)}`
const order4 = ['S', 'A', 'B', 'C']
const pct = (v) => `${(v * 100).toFixed(2)} %`
const p1 = (v) => (v == null ? '  — ' : `${(v * 100).toFixed(1)} %`)
const hrs = (h) => `${h.toFixed(2)} h`
const where = (e) => `day ${e.day} ${String(Math.floor(e.hr ?? 0)).padStart(2, '0')}:${String(Math.floor(((e.hr ?? 0) % 1) * 60)).padStart(2, '0')} @ (${e.pos?.[0]}, ${e.pos?.[2]}) ${e.spd} m/s`
const invIds = (inv) => (inv ?? []).map(i => `${i.id}${i.n > 1 ? '×' + i.n : ''}`).join(', ') || 'empty'

export function report (s, bad = 0, meta = {}) {
  const L = []
  const f = s.first, l = s.last
  L.push(`events ${s.events}${bad ? ` (${bad} unparseable lines skipped)` : ''}${meta.files > 1 ? ` · ${meta.files} files stitched${meta.dup ? `, ${meta.dup} duplicate lines dropped` : ''}` : ''} · days ${s.days.map(d => d === 0 ? '0 (tutorial)' : d).join(', ') || '—'} · ${s.km.toFixed(1)} km driven · ${s.teleports} reseats/tows`)
  for (const r of s.runs) L.push(`  ${r.how} · seed ${r.seed} · day ${r.day} · wallet ${$(r.wallet)}`)
  // COVERAGE
  L.push('\nCOVERAGE')
  if (f && l) {
    const begun = s.runs.find(r => r.how === 'new')
    L.push(`  from play ${f.play} s (${clock(f)}) to play ${l.play} s (${clock(l)})${s.end && s.end.e !== 'route' ? ` · ended by ${s.end.e}` : ' · no end record (crash, closed tab or still running)'}`)
    if (!begun) L.push(`  WARNING: this log does not start at the run's start (no 'new' runStart; first record is how: "${s.runs[0]?.how ?? 'none'}" at play ${f.play} s): everything before ${clock(f)} is missing.`)
    if (s.runs.filter(r => r.how === 'resume').length) L.push(`  ${s.runs.filter(r => r.how === 'resume').length} resume(s): the run was saved and continued.`)
  } else L.push('  no stamped events')
  // START / END
  L.push('\nTRUCK AND PLAYER, start → end')
  if (!s.start) L.push('  start: not recorded (an old log: no header with every condition)')
  else {
    const a = s.start, b = s.end
    L.push(`  start ${clock(a)} (${a.how})${b ? ` · end ${clock(b)}${b.inv ? '' : ' (conditions only: no end header)'}` : ' · end: not recorded'}`)
    L.push(`  wallet ${$(a.wallet)} → ${b?.wallet != null ? $(b.wallet) : '—'} · fuel ${a.fuelGal ?? '—'} → ${b?.fuelGal ?? '—'} gal · energy ${a.energyH ?? '—'} → ${b?.energyH ?? '—'} h · fed ${a.fedH ?? '—'} → ${b?.fedH ?? '—'} h`)
    const ks = Object.keys(a.cond)
    for (let i = 0; i < ks.length; i += 2) L.push('  ' + ks.slice(i, i + 2).map(k => `${k.padEnd(13)}${p1(a.cond[k])} → ${p1(b?.cond?.[k]).padEnd(8)}`).join('   '))
    const fit = (c) => Object.entries(c?.parts ?? {}).filter(([k]) => /^(tire|spring|damper|brake|engine|wheel)/.test(k)).map(([k, v]) => `${k}=${v}`).join(' ')
    L.push(`  fitted at start: ${fit(a)}`)
    if (b?.parts) L.push(`  fitted at end:   ${fit(b)}`)
    L.push(`  inventory: ${invIds(a.inv)} → ${b?.inv ? invIds(b.inv) : '—'}`)
  }
  // JOBS
  L.push('\nJOBS (type: n · real min · game h · pay · deeds · ranks)')
  for (const [t, j] of Object.entries(s.jobs)) {
    L.push(`  ${t}: ${j.n} · ${(j.realS / 60).toFixed(1)} min · ${j.gameH.toFixed(1)} h · ${$(j.pay)} · ${j.deeds} · ${Object.entries(j.ranks).map(([k, v]) => k + v).join(' ')}`
      + `${j.abandoned ? ` · ${j.abandoned} abandoned` : ''}${j.expired ? ` · ${j.expired} expired` : ''}`)
    if (j.n) L.push(`      per job: ${(j.realS / 60 / j.n).toFixed(1)} min, ${$(j.pay / j.n)}, ${(j.deeds / j.n).toFixed(2)} deeds; $/game h ${j.gameH > 0 ? $(j.pay / j.gameH) : '—'}`)
  }
  L.push('  each job (ratio to par · rank · seconds faster for the next rank / slower before dropping one · reward · condition lost to damage events during it):')
  for (const j of s.jobList) {
    const a = j.ax, lines = a && order4.map(k => `${k} ${a.f(a.th[k])}`).join(' ')
    L.push(`    ${clock(j.e)} ${j.type}: ${a ? `${a.name} ${a.f(a.v)} · ${j.letter} on its ${a.name} (lines ${lines}${j.axLetter !== j.letter ? `; these lines alone would grade ${j.axLetter}: check the rank rule` : ''})${j.g ? ` · ratio ${j.g.ratio.toFixed(3)} (time is not its rank)` : ''}`
      : j.g ? `ratio ${j.g.ratio.toFixed(3)} · ${j.letter}${j.g.letter !== j.letter ? ` (the logged thresholds alone would grade ${j.g.letter}: check the rank rule or the thresholds logged)` : ''}` : j.abandoned ? 'abandoned' : 'no par'}`
      + `${j.toNext != null ? ` · next rank ${a ? `${a.f(+j.toNext.toFixed(3))} more` : `${j.toNext.toFixed(0)} s faster`}` : j.letter === 'S' ? ' · top rank' : ''}${j.slack != null ? ` · ${a ? a.f(+j.slack.toFixed(3)) : `${j.slack.toFixed(0)} s`} to spare` : ''}`
      + `${j.award ? ` · reward ${j.award}` : ''}${j.lost != null ? ` · ${j.events} damage events, ${pct(j.lost)} lost (condition, not dollars: the log holds no repair price)` : ''}`)
  }
  // MONEY
  L.push('\nMONEY by day (start → end, min..max)')
  for (const [d, m] of Object.entries(s.money)) L.push(`  day ${d}: ${$(m.start)} → ${$(m.end)}  (${$(m.min)}..${$(m.max)})`)
  L.push('MONEY by category per day (income: job base + tip + other + sold; spend: maintenance + fuel + food + tows + gear/other)')
  const cash = Object.entries(s.cash)
  if (!cash.length) L.push('  not recorded')
  for (const [d, c] of cash) {
    const inc = c.jobBase + c.tip + c.other + c.sold, sp = c.maint + c.fuel + c.food + c.tows + c.gear
    L.push(`  day ${d}: income ${$(inc)} (base ${$(c.jobBase)}, tip ${$(c.tip)}${c.other ? `, other ${$(c.other)}` : ''}${c.sold ? `, sold ${$(c.sold)}` : ''}) · spend ${$(sp)} (maint ${$(c.maint)}, fuel ${$(c.fuel)}, food ${$(c.food)}, tows ${$(c.tows)}, gear/other ${$(c.gear)}) · net ${$(inc - sp)}`)
  }
  L.push(s.firstOther ? `  first purchase that is not maintenance, fuel or food: ${clock(s.firstOther.e)} · ${s.firstOther.label} (the opening maintenance phase ends here)` : '  first purchase that is not maintenance, fuel or food: none in this log')
  // REWARDS
  L.push('\nITEMS GRANTED (when · item · source)')
  if (!s.grants.length) L.push('  none')
  for (const g of s.grants) L.push(`  ${clock(g)} ${g.id}${g.n > 1 ? '×' + g.n : ''} · ${g.src ?? 'not recorded (old log)'}${g.fits === false ? ' · NO ROOM (swap prompt)' : ''}`)
  L.push('  granted and never used, fitted, eaten, dropped or sold by the end (net of the starting kit):')
  const net = {}
  for (const g of s.grants) net[g.id] = (net[g.id] ?? 0) + (g.n ?? 1)
  let any = false
  for (const [id, n] of Object.entries(net)) {
    const u = s.uses[id] ?? {}, gone = (u.use ?? 0) + (u.consume ?? 0) + (u.take ?? 0) + (u.remove ?? 0) + (u.drop ?? 0)
    if (n > gone) { any = true; L.push(`    ${id}: granted ${n}, gone ${gone}`) }
  }
  if (!any) L.push('    none')
  L.push(`  food that rotted (dropped as rotten): ${s.rotted}${s.start?.inv ? ` · rotten at start ${s.start.inv.filter(i => /^rotten/.test(i.id)).reduce((n, i) => n + i.n, 0)}` : ''}`)
  // TIRES
  L.push('\nTIRES per wheel (start → end · km on it · changes · projected life = km / condition lost)')
  if (!s.start) L.push('  not recorded')
  else s.tires.forEach((t, c) => {
    const k = `tire${CORNERS[c]}`
    L.push(`  ${CORNERS[c]}: ${p1(s.start.cond[k])} → ${p1(s.end?.cond?.[k])} · ${t.km.toFixed(1)} km · lost ${pct(t.lost)} · ${t.lost > 0 ? `projected full life ${(t.km / t.lost).toFixed(0)} km` : 'no wear measured'}`)
    for (const ch of t.changes) L.push(`      ${clock(ch.e)} fitted ${ch.what}; tire taken off was at ${ch.off != null ? p1(ch.off) : 'not recorded'}`)
  })
  const tg = s.grants.filter(g => tireOf(g.id) && g.src !== 'start').reduce((n, g) => n + (g.n ?? 1), 0)
  L.push(`  tires granted (not counting the start): ${tg} · tires changed on the truck: ${s.tires.reduce((n, t) => n + t.changes.length, 0)}`)
  // ALERTS
  L.push('\nLOW CONDITION and ALERTS')
  const alerted = new Set(Object.values(s.alerts).map(a => a.track))
  let noWarn = 0
  for (const [k, v] of Object.entries(s.minCond).sort()) {
    if (v < 0.5 && !alerted.has(k)) { noWarn++; L.push(`  ${k}: minimum ${p1(v)} and NO alert ever fired for it${ALERT_TRACKS.has(k) ? (/^tire/.test(k) ? ' (a tire alerts only flat, or failed at 0 %)' : '') : ' (none by rule: only the engine, wheels, tires, air filter and oil alert, FEAT-216)'}`) }
  }
  if (!noWarn) L.push('  no track went under 50 % without an alert' + (Object.keys(s.minCond).length ? '' : ' (no conditions recorded)'))
  L.push('  alerts (id · text · times fired · first · time to the fixing purchase):')
  for (const [id, a] of Object.entries(s.alerts)) {
    const re = { oil: /oil/i, airFilter: /filter/i, engine: /engine/i }[a.track] ?? (a.track ? new RegExp(a.track.startsWith('tire') ? 'tire' : 'wheel', 'i') : null)
    const fix = re && s.fixes.find(x => gameH(x.e) >= gameH(a.first) && re.test(x.text))
    L.push(`    ${id} "${a.text}" ×${a.n} · ${clock(a.first)} · ${fix ? `fixed ${(gameH(fix.e) - gameH(a.first)).toFixed(1)} game h later (${fix.text.slice(0, 50)})` : a.track ? 'no purchase fixed it' : 'not a wear alert'}`)
  }
  // DAMAGE
  L.push('\nWEAR, continuous (track · cause: condition lost)')
  for (const [k, v] of Object.entries(s.wear).sort((a, b) => b[1] - a[1]).slice(0, 20)) L.push(`  ${k}: ${pct(v)}`)
  L.push('\nDAMAGE EVENTS (type: n · condition lost · tires popped)')
  for (const [k, d] of Object.entries(s.damage)) L.push(`  ${k}: ${d.n} · ${pct(d.lost)} · ${d.popped}`)
  L.push('  top events:')
  for (const e of s.top) L.push(`    ${e.e} ${where(e)} · ${Object.entries(e.dmg).map(([id, [a, b]]) => `${id} ${pct(a)}→${pct(b)}`).join(', ')}`)
  if (s.punctures.length) L.push('  punctures:')
  for (const e of s.punctures) {
    const k = e.e === 'puncture' ? `${e.tripped} ${e.hazardN} N vs ${e.popN} N, pinch ${e.pinchJ} J vs ${e.pinchPopJ} J`
      : e.e === 'bumpStop' ? `bump stop ${e.peakN} N vs puncture ${e.punctureN} N (tire ${pct(e.tireCond)})`
      : `rim strike (${e.source}) ${e.forceN} N vs pinch ${e.pinchN} N`
    L.push(`    corner ${e.corner ?? e.popped} ${where(e)} · ${k} · load ${e.fzN} N · strut ${e.strutVel} m/s`)
  }
  L.push(`\nPURCHASES (${s.purchases.length}) · fuel ${s.fuel.gal.toFixed(1)} gal for ${$(s.fuel.sale)} in ${s.fuel.visits} visits · ${s.tows.length} tows ${$(s.tows.reduce((a, t) => a + t.price, 0))}`)
  for (const p of s.purchases) L.push(`  day ${p.day}: ${p.label} ${$(p.price)}`)
  L.push('\nSHOP TIME, game h skipped at checkout per day (FEAT-69: maintenance vs food; a purchase with no table time adds none)')
  for (const [d, h] of Object.entries(s.shopH)) L.push(`  day ${d}: maintenance ${h.maint.toFixed(2)} h · food ${h.food.toFixed(2)} h`)
  // HUNGER, ENERGY
  L.push(`\nHUNGER AND ENERGY (from the 1 s route samples; sleeping and shop time are not sampled) · hungry ${hrs(s.hungryH)} · exhausted (energy below zero) ${hrs(s.exhaustedH)}`)
  L.push(`SLEEPS (${s.sleeps.length}) · meals ${s.eats}`)
  for (const e of s.sleeps) L.push(`  day ${e.day}: ${e.hours} h at vibe ${typeof e.vibe === 'number' ? e.vibe.toFixed(2) : e.vibe} · energy ${e.energyH0?.toFixed(1)} → ${e.energyH1?.toFixed(1)} h`)
  for (const e of s.meals) L.push(`  meal ${clock(e)}: +${e.satietyH} h, ${e.fedLeftH0?.toFixed(2)} h of fed time left when eaten${e.fedLeftH0 > 4 ? ' (eaten while well fed: most of it wasted)' : ''}${e.hungry ? ' (was hungry)' : ''}`)
  return L.join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const files = process.argv.slice(2)
  if (!files.length) { console.error('usage: node tools/run-log-summary.mjs <run.jsonl>…  (several files of one run are stitched)'); process.exit(2) }
  const st = stitch(files.map(f => readFileSync(f, 'utf8')))
  console.log(report(summarize(st.events), st.bad, st))
}

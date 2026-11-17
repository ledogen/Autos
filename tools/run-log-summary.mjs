#!/usr/bin/env node
// tools/run-log-summary.mjs — FEAT-242: a run summary from the run logger's JSON Lines parts (src/run-log.js).
//
//   node tools/run-log-summary.mjs ~/Downloads/autos-run-<seed>-<start>-part*.jsonl
//
// Parts are read in the order given (a shell glob sorts part01, part02, … correctly). A line that does not parse —
// a part cut off mid-write — is skipped and counted. `summarize(lines)` is exported for test/run-log.mjs.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const TELEPORT_M = 100   // a route step longer than this in one 1 s sample is a reseat or a tow, not driving
const DAMAGE_EVENTS = new Set(['impact', 'bumpStop', 'rimStrike', 'puncture', 'missShift'])
const JOB_ON = new Set(['countdown', 'staging', 'loading', 'running'])

const lost = (dmg) => Object.values(dmg ?? {}).reduce((a, [b, c]) => a + (b - c), 0)
const gameH = (e) => (e.day ?? 0) * 24 + (e.hr ?? 0)

export function summarize (events) {
  const s = { events: events.length, days: new Set(), km: 0, teleports: 0, jobs: {}, money: {}, wear: {}, damage: {},
    top: [], punctures: [], purchases: [], fuel: { gal: 0, sale: 0, visits: 0 }, shopH: {}, tows: [], sleeps: [], eats: 0, runs: [] }
  let prev = null, job = null
  for (const e of events) {
    if (e.day != null) s.days.add(e.day)
    if (e.e === 'runStart' || e.e === 'header') s.runs.push({ how: e.how, seed: e.seed, day: e.day, wallet: e.wallet })
    if (e.e === 'route') {
      if (prev?.pos && e.pos) {
        const d = Math.hypot(e.pos[0] - prev.pos[0], e.pos[2] - prev.pos[2])
        if (d > TELEPORT_M) s.teleports++
        else s.km += d / 1000
      }
      prev = e
      const m = (s.money[e.day] ??= { start: e.wallet, min: e.wallet, max: e.wallet, end: e.wallet })
      m.min = Math.min(m.min, e.wallet); m.max = Math.max(m.max, e.wallet); m.end = e.wallet
      for (const id in e.wear ?? {}) for (const k in e.wear[id]) {
        const key = `${id} · ${k}`
        s.wear[key] = (s.wear[key] ?? 0) + e.wear[id][k]
      }
    }
    if (DAMAGE_EVENTS.has(e.e)) {
      const d = (s.damage[e.e] ??= { n: 0, lost: 0, popped: 0 })
      const l = lost(e.dmg)
      d.n++; d.lost += l; d.popped += e.popped?.length ?? (e.e === 'puncture' ? 1 : 0)
      if (l > 0) s.top.push({ l, e })
      if (e.e === 'puncture' || e.popped?.length) s.punctures.push(e)
    }
    if (e.e === 'mission') {
      const type = e.offer?.type ?? e.job?.kind ?? e.job?.type ?? 'quick'
      if (JOB_ON.has(e.state) && !job) job = { type, t0: e.real, h0: gameH(e) }
      if (e.state === 'done' && e.result) {
        const j = (s.jobs[type] ??= { n: 0, realS: 0, gameH: 0, pay: 0, deeds: 0, ranks: {}, abandoned: 0, expired: 0 })
        j.n++
        if (job) { j.realS += (e.real - job.t0) / 1000; j.gameH += gameH(e) - job.h0 }
        j.pay += e.result.payout ?? 0; j.deeds += e.result.points ?? 0
        if (e.result.letter) j.ranks[e.result.letter] = (j.ranks[e.result.letter] ?? 0) + 1
        if (e.result.abandoned) j.abandoned++
        if (e.result.expired) j.expired++
        job = null
      }
      if (e.state === 'idle') job = null
    }
    if (e.e === 'purchase') for (const l of e.lines ?? []) {
      s.purchases.push({ day: e.day, label: l.label ?? l.m, price: l.price - (l.earn ?? 0) })
      // FEAT-69: game hours the checkout skipped, per day: a meal (eat > 0 or a food method) vs everything else (repairs, oil, parts).
      const t = (s.shopH[e.day] ??= { food: 0, maint: 0 })
      t[l.eat > 0 || /food|eat|meal|cook/i.test(l.m ?? '') ? 'food' : 'maint'] += l.hours ?? 0
    }
    if (e.e === 'fuel' && e.sale != null) { s.fuel.gal += e.gal; s.fuel.sale += e.sale; s.fuel.visits++ }
    if (e.e === 'tow') s.tows.push(e)
    if (e.e === 'sleep') s.sleeps.push(e)
    if (e.e === 'eat') s.eats++
  }
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

const $ = (v) => `$${(v ?? 0).toFixed(2)}`
const pct = (v) => `${(v * 100).toFixed(2)} %`
const where = (e) => `day ${e.day} ${String(Math.floor(e.hr ?? 0)).padStart(2, '0')}:${String(Math.floor(((e.hr ?? 0) % 1) * 60)).padStart(2, '0')} @ (${e.pos?.[0]}, ${e.pos?.[2]}) ${e.spd} m/s`

export function report (s, bad = 0) {
  const L = []
  L.push(`events ${s.events}${bad ? ` (${bad} unparseable lines skipped)` : ''} · days ${s.days.map(d => d === 0 ? '0 (tutorial)' : d).join(', ') || '—'} · ${s.km.toFixed(1)} km driven · ${s.teleports} reseats/tows`)
  for (const r of s.runs) L.push(`  ${r.how} · seed ${r.seed} · day ${r.day} · wallet ${$(r.wallet)}`)
  L.push('\nJOBS (type: n · real min · game h · pay · deeds · ranks)')
  for (const [t, j] of Object.entries(s.jobs)) {
    L.push(`  ${t}: ${j.n} · ${(j.realS / 60).toFixed(1)} min · ${j.gameH.toFixed(1)} h · ${$(j.pay)} · ${j.deeds} · ${Object.entries(j.ranks).map(([k, v]) => k + v).join(' ')}`
      + `${j.abandoned ? ` · ${j.abandoned} abandoned` : ''}${j.expired ? ` · ${j.expired} expired` : ''}`)
    if (j.n) L.push(`      per job: ${(j.realS / 60 / j.n).toFixed(1)} min, ${$(j.pay / j.n)}, ${(j.deeds / j.n).toFixed(2)} deeds; $/game h ${j.gameH > 0 ? $(j.pay / j.gameH) : '—'}`)
  }
  L.push('\nMONEY by day (start → end, min..max)')
  for (const [d, m] of Object.entries(s.money)) L.push(`  day ${d}: ${$(m.start)} → ${$(m.end)}  (${$(m.min)}..${$(m.max)})`)
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
  L.push(`\nSLEEPS (${s.sleeps.length}) · meals ${s.eats}`)
  for (const e of s.sleeps) L.push(`  day ${e.day}: ${e.hours} h at vibe ${typeof e.vibe === 'number' ? e.vibe.toFixed(2) : e.vibe} · energy ${e.energyH0?.toFixed(1)} → ${e.energyH1?.toFixed(1)} h`)
  return L.join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const files = process.argv.slice(2)
  if (!files.length) { console.error('usage: node tools/run-log-summary.mjs <part.jsonl>…'); process.exit(2) }
  const all = files.map(f => parseLines(readFileSync(f, 'utf8')))
  console.log(report(summarize(all.flatMap(p => p.events)), all.reduce((a, p) => a + p.bad, 0)))
}

// test/rockslide-hit.mjs — FEAT-26: what a slide does to the truck (rainy-day study; the gate is rockslide-physics.mjs).
// Real seeds, real cuts, the real director timing its release on a truck held at 40 / 60 / 80 km/h in the face-side or
// the far lane, never braking. Prints one line per drive and a table per speed: released, touched, landed impacts
// (Δv), condition lost, punctures, fatal — and physics step time before vs during the slide.
// Run: node test/rockslide-hit.mjs [seeds…] [--per=4] [--json]
import { hitWorld, findCandidates, driveSlide } from './lib/rockslide-hit.mjs'
const seeds = process.argv.filter(a => /^\d+$/.test(a)).map(Number)
const per = +(process.argv.find(a => a.startsWith('--per='))?.split('=')[1] ?? 4)
const all = []
for (const seed of seeds.length ? seeds : [1828043085]) {
  const { w, debris, heightAt } = await hitWorld(seed)
  const cands = findCandidates(w, heightAt, 22.3).slice(0, per)
  for (const [i, c] of cands.entries()) for (const kmh of [40, 60, 80]) for (const lane of ['face', 'far']) {
    const r = await driveSlide(w, debris, c, kmh / 3.6, lane, seed + i * 31 + kmh)
    r.seed = seed; r.kmh = kmh; all.push(r)
    console.log(JSON.stringify(r))
  }
  w.dispose()
}
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN }
console.log('\n km/h lane | drives released touched | impacts landed (Δv p50/max m/s) | condition lost p50/max (sum of tracks) | punctures | fatal | step ms p50 before→slide, worst')
for (const kmh of [40, 60, 80]) for (const lane of ['face', 'far']) {
  const g = all.filter(r => r.kmh === kmh && r.lane === lane), rel = g.filter(r => r.released), hit = rel.filter(r => r.touched)
  const dv = g.flatMap(r => r.impacts.map(i => i.dv)), lost = hit.map(r => r.lost)
  console.log(` ${String(kmh).padStart(4)} ${lane.padEnd(4)} | ${g.length} ${rel.length} ${hit.length} (${(100 * hit.length / Math.max(1, rel.length)).toFixed(0)} %) | ${dv.length} (${pct(dv, 0.5).toFixed?.(1)}/${Math.max(0, ...dv).toFixed(1)}) | ${pct(lost, 0.5)?.toFixed?.(3)}/${Math.max(0, ...lost).toFixed(3)} | ${g.reduce((a, r) => a + r.punct, 0)} | ${g.filter(r => r.fatal).length} | ${pct(rel.map(r => r.stepMs.before.p50), 0.5)?.toFixed?.(2)}→${pct(rel.map(r => r.stepMs.slide.p50), 0.5)?.toFixed?.(2)}, ${Math.max(0, ...rel.map(r => r.stepMs.slide.max)).toFixed(2)}`)
}

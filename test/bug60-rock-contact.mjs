// test/bug60-rock-contact.mjs — BUG-60 reproducer: a static hull stops answering contact queries
// after debris bodies are destroyed near it.
//
// RAINY-DAY SCRIPT, NOT A GATE. It needs a dev server and a real GPU-less Chrome, which the
// pure-node gates never touch. Promote it to a gate only if the engine seam ever grows a headless
// harness that can build a world without a browser.
//
//   npm run dev                     # in one shell
//   node test/bug60-rock-contact.mjs [--port=8000] [--drops=40] [--cdp=9222]
//
// WHAT IT MEASURES. The FEAT-41 menu stage drops the truck so its front-left wheel lands on a
// static rock. Three debris rocks then fall into the bed, and every stage reset destroys them and
// spawns three more. That create/destroy churn is the trigger: after it, the STATIC rock stops
// answering wheel-sized contact queries at its own surface, the wheel falls through, and the truck
// settles on the ground plane with the rock still drawn around it.
//
//   wheel hub on the rock   ≈ 579 mm
//   wheel hub on the ground ≈ 333 mm   ← a run that ends here fell through the rock
//
// Exit 0 = no fall-throughs and no stale map entries. Exit 1 = reproduced.

import { launchChrome, connect, sleep } from './lib/cdp.mjs'

const flag = (n, d) => {
  const a = process.argv.find(s => s.startsWith(`--${n}=`))
  return a ? a.split('=')[1] : d
}
const PORT = Number(flag('port', 8000))
const CDP = Number(flag('cdp', 9222))
const DROPS = Number(flag('drops', 40))
const ON_ROCK_MM = 480   // anything below this is on the ground, not on the rock

try { const r = await fetch(`http://localhost:${PORT}/index.html`); if (!r.ok) throw 0 } catch {
  console.error(`No server on :${PORT}. Run \`npm run dev\` first.`); process.exit(1)
}

launchChrome('about:blank', { port: CDP, windowSize: '1400,900' })
await sleep(3000)
const client = await connect({ port: CDP, cmdTimeoutMs: 300000 })
client.on('Runtime.exceptionThrown', p =>
  console.error('PAGE EXC', (p.exceptionDetails?.exception?.description ?? '').slice(0, 300)))

const ev = async (expr) => {
  const r = await client.evalJS(expr)
  if (r.err) { console.error('EVAL ERR:', r.err); process.exit(1) }
  return r.val
}

// ?nomenu is deliberately NOT passed: the stage has to be live, it is the subject.
await client.cmd('Page.navigate', { url: `http://localhost:${PORT}/index.html` })
for (let i = 0; i < 120 && !(await ev('!!window.__stage && window.__stage.isReady()')); i++) await sleep(500)
await sleep(8000)   // let the GLBs land and the first drop settle

console.log(`running ${DROPS} drops…`)
const out = JSON.parse(await ev(`(() => {
  const s = window.__stage, E = s._engine
  const V = new (s.camera.position.constructor)()
  const orig = s.update.bind(s)
  s.update = () => {}                       // take the rAF loop off it; step by hand, fixed dt
  // Hull data and the tire size hint live on the BODY RECORD now (one per live hull shape), not in
  // shapeKey-keyed Maps — that storage was the BUG-60/61/62 failure surface. Census them.
  const held = () => { let n = 0; for (const r of E._bodies.values()) for (const h of r.hulls) if (h) n++; return n }
  const maps = () => ({ live: E.counters().shapes, toHandle: E._shapeToHandle.size, hullData: held() })
  const before = maps()
  const runs = []
  for (let n = 0; n < ${DROPS}; n++) {
    s.reset()
    let lost = 0, held = 0
    for (let k = 0; k < 420; k++) {          // 7 s of sim
      orig(1 / 60)
      if (s._simT > 2.8) {                   // after the bed rocks have landed
        s._model.wheelMeshes[0].getWorldPosition(V)
        const h = s._queryContacts(V.x, V.y, V.z, 0.368)
        let rock = false
        for (const x of h) if (x.sizeR !== undefined) rock = true
        rock ? held++ : lost++
      }
    }
    s._model.wheelMeshes[0].getWorldPosition(V)
    runs.push({ run: n, hubMM: Math.round(V.y * 1000), framesLost: lost, framesHeld: held })
  }
  s.update = orig
  return JSON.stringify({ before, after: maps(), runs })
})()`))

client.close()

const bad = out.runs.filter(r => r.hubMM < ON_ROCK_MM)
const stale = (out.after.toHandle - out.before.toHandle) + (out.after.hullData - out.before.hullData)

console.log(`\nshapes             live ${out.after.live} · _shapeToHandle ${out.after.toHandle}` +
            `   (at boot: ${out.before.live} / ${out.before.toHandle})`)
console.log(`hulls held         ${out.before.hullData} → ${out.after.hullData}   (one per live hull shape; BUG-62)`)
console.log(`\nfell through the rock: ${bad.length} of ${out.runs.length} drops`)
for (const r of bad.slice(0, 6))
  console.log(`  run ${String(r.run).padStart(2)}  hub ${r.hubMM} mm  (on the rock ≈ 579)` +
              `  rock contact lost on ${r.framesLost} of ${r.framesLost + r.framesHeld} frames`)

const fail = bad.length > 0 || stale > 0
console.log(fail
  ? `\nBUG-60 REPRODUCED — ${bad.length} fall-through(s), ${stale} stale shape entr${stale === 1 ? 'y' : 'ies'}`
  : `\nclean — every drop stayed on the rock, and no map is carrying dead shapes`)
process.exit(fail ? 1 : 0)

import { readFileSync, writeFileSync } from 'node:fs'
import { launchChrome, connect, sleep } from '/Users/ledogen/CodeShit/CarGame-machine/test/lib/cdp.mjs'
const R='/Users/ledogen/CodeShit/CarGame-machine/wip/feat-34/shots/'
const u=p=>'data:image/png;base64,'+readFileSync(R+p).toString('base64')
const html=`<body style="margin:0;background:#fff"><div style="display:flex;flex-direction:column;gap:8px">`+['after','after-lamps'].map(n=>`<div style="display:flex;gap:8px"><img width=575 src="${u('r6/'+n+'.png')}"><img width=620 src="${u('r7/'+n+'.png')}"></div>`).join('')+`</div>`
writeFileSync('/private/tmp/claude-501/-Users-ledogen-CodeShit-CarGame/57168d86-c54c-4354-833c-cbc2e386cbb9/scratchpad/sheet.html',html)
launchChrome('about:blank',{port:9336,windowSize:'1250,640'})
const c=await connect({port:9336})
await c.cmd('Emulation.setDeviceMetricsOverride',{width:1220,height:600,deviceScaleFactor:1,mobile:false})
await c.cmd('Page.navigate',{url:'file:///private/tmp/claude-501/-Users-ledogen-CodeShit-CarGame/57168d86-c54c-4354-833c-cbc2e386cbb9/scratchpad/sheet.html'}); await sleep(1500)
const s=await c.cmd('Page.captureScreenshot',{format:'png'})
writeFileSync(R+'r7/sheet-r6-r7.png',Buffer.from(s.result.data,'base64')); process.exit(0)

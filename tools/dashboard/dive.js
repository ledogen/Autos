/* Deep dives (INFRA-12): the one script every .planning/dives/<slug>.html loads.
 * The document is plain HTML an agent wrote; wherever it asks something it has
 *   <dive-q id="clock" options="pause everything | the job clock keeps running | not now"></dive-q>
 *   <dive-q id="why"></dive-q>                      (no options: a free-text box only)
 * This script styles the page, draws those fields, loads and autosaves the owner's answers to
 * /data/dives/<slug>.answers.json (the private data folder; index.mjs § lane tracker data), and adds
 * Submit. Status is derived from what the owner did: opened → partial → submitted. Once the
 * orchestrator writes dives/<slug>.taken the page is read-only. */
(async () => {
  const slug = decodeURIComponent(location.pathname.split('/').pop()).replace(/\.html$/, '');
  const ticket = /^[A-Z]+-\d+[a-z]?/.exec(slug)?.[0];
  if (!document.querySelector('meta[name=viewport]')) document.head.insertAdjacentHTML('beforeend', '<meta name="viewport" content="width=device-width, initial-scale=1">');
  document.head.insertAdjacentHTML('beforeend', `<style>
    :root { --bg:#14161a; --panel:#1b1e24; --panel2:#22262e; --line:#2c313b; --fg:#dfe3ea; --dim:#8b94a3; --dimmer:#646c7a;
            --accent:#6fb3ff; --good:#7fd97f; --warn:#ffc25c; --bad:#ff5c5c; --mono:ui-monospace,SFMono-Regular,Menlo,monospace; color-scheme:dark; }
    body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; }
    main { max-width:760px; margin:0 auto; padding:16px 16px 120px; }
    h1 { font-size:24px; line-height:1.25; margin:.4em 0; text-wrap:balance; } h2 { font-size:18px; margin:1.6em 0 .4em; } h3 { font-size:15px; margin:1.2em 0 .3em; }
    a { color:var(--accent); } code { font:13.5px var(--mono); background:var(--panel2); border-radius:4px; padding:1px 5px; }
    table { border-collapse:collapse; display:block; overflow-x:auto; max-width:100%; } th, td { border:1px solid var(--line); padding:6px 10px; text-align:left; vertical-align:top; }
    th { background:var(--panel); } img, svg { max-width:100%; height:auto; } figure { margin:1em 0; } figcaption { color:var(--dim); font-size:13.5px; }
    .dive-top { color:var(--dim); font-size:13.5px; display:flex; gap:14px; flex-wrap:wrap; }
    dive-q { display:block; margin:14px 0 22px; padding:12px 14px; background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:8px; }
    dive-q.has { border-left-color:var(--good); }
    dive-q .opts { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
    dive-q button { border:1px solid var(--line); background:var(--panel2); color:var(--fg); border-radius:6px; padding:8px 14px; font:inherit; cursor:pointer; text-align:left; }
    dive-q button.on { border-color:var(--good); color:var(--good); font-weight:600; }
    dive-q textarea { width:100%; box-sizing:border-box; background:var(--bg); border:1px solid var(--line); color:var(--fg); border-radius:6px;
                      padding:8px 10px; font:inherit; resize:vertical; min-height:2.8em; field-sizing:content; }
    dive-q textarea:focus { outline:none; border-color:var(--accent); }
    dive-q :disabled { opacity:.6; cursor:default; }
    .dive-bar { position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line);
                padding:10px max(16px, env(safe-area-inset-right, 0px)) calc(10px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
                display:flex; gap:12px; align-items:center; flex-wrap:wrap; font-size:13.5px; color:var(--dim); }
    .dive-bar .bad { color:var(--bad); font-weight:600; } .dive-bar span { flex:1; min-width:0; }
    .dive-bar button { border:1px solid var(--good); background:transparent; color:var(--good); border-radius:6px; padding:8px 18px; font:inherit; font-weight:600; cursor:pointer; }
    .dive-bar button.quiet { border-color:var(--line); color:var(--dim); font-weight:400; }
  </style>`);
  if (!document.querySelector('main')) { const m = document.createElement('main'); m.append(...document.body.childNodes); document.body.append(m); }
  document.querySelector('main').insertAdjacentHTML('afterbegin', `<div class="dive-top"><a href="/#/lanes">← tracker</a>${ticket ? `<a href="/#/t/${ticket}">${ticket}</a>` : ''}</div>`);
  document.body.insertAdjacentHTML('beforeend', '<div class="dive-bar"><span id="dive-say">loading…</span><button id="dive-go" hidden></button></div>');
  const say = document.getElementById('dive-say'), go = document.getElementById('dive-go');
  const qs = [...document.querySelectorAll('dive-q')];

  let doc = null, taken = false, timer = null;
  try {
    const d = (await (await fetch('/data')).json()).dives || {};
    doc = d[slug + '.answers.json'] || null; taken = (slug + '.taken') in d;
  } catch { say.textContent = 'The tracker server is unreachable: nothing typed here will be saved.'; say.className = 'bad'; return; }
  const fresh = !doc;
  doc = { status: 'opened', openedAt: new Date().toISOString(), submittedAt: null, answers: {}, ...doc };

  const answered = (a) => !!(a && (a.choice || (a.note || '').trim()));
  const locked = () => taken || !!doc.submittedAt;
  const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  async function save() {
    clearTimeout(timer); timer = null;
    doc.status = doc.submittedAt ? 'submitted' : qs.some(q => answered(doc.answers[q.id])) ? 'partial' : 'opened';
    say.className = ''; say.textContent = 'saving…';
    try {
      const r = await fetch(`/data/dives/${slug}.answers.json`, { method: 'PUT', body: JSON.stringify(doc) });
      if (!r.ok) throw new Error(r.status);
      paintBar('saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' · ');
    } catch (e) { say.className = 'bad'; say.textContent = `NOT SAVED (${e.message}). Is the tracker server running?`; }
  }
  function paintBar(prefix = '') {
    const n = qs.filter(q => answered(doc.answers[q.id])).length;
    go.hidden = taken; go.className = doc.submittedAt ? 'quiet' : ''; go.textContent = doc.submittedAt ? 'Reopen' : 'Submit';
    say.textContent = taken ? 'The agent has acted on these answers. This page is now read-only.'
      : doc.submittedAt ? `Submitted ${when(doc.submittedAt)}. Reopen to change an answer.`
      : `${prefix}${n} of ${qs.length} answered`;
  }
  function paint() {
    for (const q of qs) {
      const a = doc.answers[q.id] || {};
      q.classList.toggle('has', answered(a));
      for (const b of q.querySelectorAll('button')) { b.classList.toggle('on', a.choice === b.textContent); b.disabled = locked(); }
      q.querySelector('textarea').disabled = locked();
    }
    paintBar();
  }
  for (const q of qs) {
    const opts = (q.getAttribute('options') || '').split('|').map(s => s.trim()).filter(Boolean);
    const box = document.createElement('textarea');
    box.placeholder = opts.length ? 'note (optional, saves as you type)' : 'your answer (saves as you type)';
    box.value = doc.answers[q.id]?.note || '';
    if (opts.length) {
      const row = document.createElement('div'); row.className = 'opts';
      for (const o of opts) { const b = document.createElement('button'); b.textContent = o; row.append(b); }
      q.append(row);
    }
    q.append(box);
    const set = (patch) => { doc.answers[q.id] = { choice: '', note: '', ...doc.answers[q.id], ...patch }; };
    q.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON' || locked()) return;
      set({ choice: doc.answers[q.id]?.choice === e.target.textContent ? '' : e.target.textContent });   // a second click clears it
      paint(); save();
    });
    box.addEventListener('input', () => { set({ note: box.value }); q.classList.toggle('has', answered(doc.answers[q.id])); clearTimeout(timer); timer = setTimeout(save, 600); });
    box.addEventListener('change', () => { if (timer) save(); });   // leaving the box saves at once
  }
  go.addEventListener('click', () => { doc.submittedAt = doc.submittedAt ? null : new Date().toISOString(); paint(); save(); });
  paint();
  if (fresh && !taken) save();   // first load: this write is what makes the card say "opened"
})();

#!/usr/bin/env node
/* "Before drawing" eval: does a real model ask useful questions, and can it draw the options as vector line drawings?
 *
 * Twelve short requests (4 physical objects, 4 screens, 4 videos; a third in Chinese). For each, the real page asks the
 * model for the questions (real prompt, real check, real repair, real fallback) and records whether they came from the
 * model, how long it took, and what was asked. For the four objects it then asks the model to draw the pick options and
 * both ends of the slider twice:
 *   A  plain  no reference, the model draws from the words
 *   B  ref    Scout finds one Wikimedia Commons photo per option and the model traces it
 * and screenshots both cards side by side, with the time each took.
 *
 *   node tests/align-eval.cjs --api http://127.0.0.1:8090/v1 --model /path/to/Qwen3.5-9B-4bit
 *   node tests/align-eval.cjs                # Vellum's Studio AI at 127.0.0.1:59631, ready with a model
 *   options: --cases lamp,glasses  --out align-eval-results  --label name  --timeout 300  --no-ref
 * Exit code is 0 when it ran; the scores are in the report. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? a.concat([[x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]]) : a), []));
const OUT = path.resolve(args.out || 'align-eval-results');
const LABEL = String(args.label || (args.api ? String(args.model).split('/').pop() : 'studio-ai')).replace(/[^\w.-]+/g, '-');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');

const CASES = [
  { id: 'lamp', kind: 'image', prompt: 'a desk lamp for a small studio flat' },
  { id: 'glasses', kind: 'image', prompt: 'reading glasses that fold flat' },
  { id: 'speaker', kind: 'image', prompt: 'a portable speaker for picnics' },
  { id: 'kettle-zh', kind: 'image', prompt: '画一个给宿舍用的小电水壶' },
  { id: 'checkout', kind: 'image', prompt: 'a checkout screen for a gear rental app' },
  { id: 'dashboard', kind: 'image', prompt: 'a dashboard for a small bakery' },
  { id: 'onboarding', kind: 'image', prompt: 'onboarding screens for a habit tracker app' },
  { id: 'login-zh', kind: 'image', prompt: '画一个读书 App 的登录页面' },
  { id: 'teaser', kind: 'video', prompt: 'a 15 second teaser for a coffee subscription' },
  { id: 'recipe', kind: 'video', prompt: 'a short recipe video for a 5 minute breakfast' },
  { id: 'unboxing', kind: 'video', prompt: 'an unboxing video for wireless earbuds' },
  { id: 'travel-zh', kind: 'video', prompt: '做一个 20 秒的城市旅行短视频' },
];
const pick = args.cases ? CASES.filter(c => String(args.cases).split(',').includes(c.id)) : CASES;

function serve() { return new Promise(res => { const s = http.createServer((q, r) => { if (q.url.startsWith('/Vellum-Lumen.html')) { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(r); } r.writeHead(404); r.end(); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await c.route(/wikipedia\.org|gdcvault/, r => r.abort());
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
  if (args.api) await p.evaluate(([baseUrl, model, key]) => { apiCfg = { enabled: true, baseUrl, model, key, daily: 100000 }; aiPref = 'api'; setApiHealth('ok', {}); }, [args.api, args.model, process.env.VELLUM_EVAL_KEY || 'local']);
  else { const ok = await p.evaluate(async () => { await checkStudioHealth({ wake: false, quiet: true }); aiPref = 'auto'; apiCfg = { ...apiCfg, enabled: false }; return studioState.status === 'ready'; }); if (!ok) throw new Error('Studio AI is not ready at 127.0.0.1:59631. Start it and load a model, or pass --api.'); }
  if (args.timeout) await p.evaluate(ms => { AI_TIMEOUT_MS = ms; LOCAL_AI_MS = ms; }, Math.round(+args.timeout * 1000));
  const engine = await p.evaluate(() => connSummary().mode);
  let calls = 0; p.on('request', q => { if (/chat\/completions|studio\/generate/.test(q.url()) && q.method() === 'POST') calls++; });
  await p.evaluate(() => { board = blank('Align eval'); sel = []; renderAll(); });

  const shot = async (id, file) => { await p.evaluate(id => { const n = byId(id); select([]); cam = { s: 1, x: 720 - (n.x + nodeW(n) / 2), y: 450 - (n.y + nodeH(n) / 2) }; paintCam(); renderAll(); }, id); await p.waitForTimeout(250);
    const bb = await p.locator(`[data-id="${id}"]`).boundingBox(); await p.screenshot({ path: path.join(OUT, file), clip: { x: bb.x - 16, y: bb.y - 16, width: bb.width + 32, height: bb.height + 32 } }); };

  const rows = [];
  for (const cs of pick) {
    calls = 0; const t0 = Date.now();
    const q = await p.evaluate(async cs => { store.set('.lang', /[一-鿿]/.test(cs.prompt) ? 'zh' : 'en'); const got = await alignQuestions(cs.kind, cs.prompt, null); return got && { live: got.live, subject: alignSubject(cs.kind, cs.prompt), qs: got.qs }; }, cs);
    const row = { id: cs.id, prompt: cs.prompt, kind: cs.kind, live: !!q?.live, subject: q?.subject, qs: q?.qs || [], qSeconds: (Date.now() - t0) / 1000, qCalls: calls };
    console.log(`${cs.id}  questions ${row.live ? 'from the model' : 'FELL BACK to built-in'}  ${row.qSeconds.toFixed(0)} s, ${calls} call(s): ${row.qs.map(x => `${x.kind}:${x.q}`).join(' | ')}`);
    if (q?.subject === 'object') {
      for (const mode of args['no-ref'] ? ['plain'] : ['plain', 'ref']) {
        calls = 0; const t1 = Date.now();
        const d = await p.evaluate(async ([cs, qs, mode]) => {
          ALIGN_ART = mode;
          const n = alignCreate({ qs: JSON.parse(JSON.stringify(qs)), then: { act: 'image', prompt: cs.prompt, count: 3 }, title: alignTitle(cs.kind, cs.prompt) + (mode === 'ref' ? ' · B ref' : ' · A plain'), live: true });
          await alignDraw(n, alignTitle(cs.kind, cs.prompt).toLowerCase());
          const pk = n.qs.find(x => x.kind === 'pick'), sp = n.qs.find(x => x.kind === 'spectrum');
          return { id: n.id, drawn: n.drawn || null, pickDrawn: !!pk && pk.options.every(o => o.art), specDrawn: !!sp?.art, refs: pk ? pk.options.filter(o => o.ref).length : 0, credits: pk ? pk.options.map(o => o.credit).filter(Boolean) : [] };
        }, [cs, row.qs, mode]);
        row[mode] = { ...d, seconds: (Date.now() - t1) / 1000, calls };
        await shot(d.id, `${cs.id}-${mode}-spectrum.png`);
        if (d.pickDrawn) { await p.evaluate(id => { const n = byId(id); n.step = n.qs.findIndex(x => x.kind === 'pick'); renderAll(); }, d.id); await shot(d.id, `${cs.id}-${mode}-pick.png`); }
        console.log(`   ${mode}: ${d.pickDrawn ? 'options drawn' : 'options stay as words'}, ${d.specDrawn ? 'slider drawn' : 'slider not drawn'}${mode === 'ref' ? `, ${d.refs} reference photo(s)` : ''}  ${row[mode].seconds.toFixed(0)} s, ${calls} call(s)`);
      }
    }
    rows.push(row);
  }
  await p.evaluate(() => { store.set('.lang', 'en'); ALIGN_ART = 'plain'; });
  await b.close(); srv.close();

  const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const objs = rows.filter(r => r.plain);
  const sum = {
    label: LABEL, engine, requests: rows.length, fromModel: rows.filter(r => r.live).length, medianQuestionSeconds: med(rows.map(r => r.qSeconds)),
    plainDrawn: objs.filter(r => r.plain.pickDrawn).length, refDrawn: objs.filter(r => r.ref?.pickDrawn).length, refFound: objs.filter(r => r.ref?.refs).length, objects: objs.length,
    medianPlainSeconds: med(objs.map(r => r.plain.seconds)), medianRefSeconds: med(objs.filter(r => r.ref).map(r => r.ref.seconds)), pageErrors: errs.length,
  };
  const md = [`# Before-drawing eval · ${LABEL}`, '', `Engine: ${engine} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, '',
    '| | |', '|---|---|',
    `| Questions written by the model (not the built-in fallback) | ${sum.fromModel} of ${sum.requests} |`,
    `| Median time to ask | ${sum.medianQuestionSeconds.toFixed(0)} s |`,
    `| A · no reference: options drawn | ${sum.plainDrawn} of ${sum.objects} · median ${sum.medianPlainSeconds.toFixed(0)} s |`,
    `| B · with reference: photos found / options drawn | ${sum.refFound} / ${sum.refDrawn} of ${sum.objects} · median ${sum.medianRefSeconds.toFixed(0)} s |`,
    `| Page errors | ${sum.pageErrors} |`, '', '## Each request', ''];
  for (const r of rows) {
    md.push(`### ${r.id}: “${r.prompt}”`, '', `- ${r.live ? 'From the model' : '**Fell back to built-in questions**'} · ${r.qSeconds.toFixed(0)} s · ${r.qCalls} call(s)`);
    for (const x of r.qs) md.push(`- ${x.kind} · ${x.q}${x.kind === 'spectrum' ? ` (${x.left} ↔ ${x.right})` : x.options ? ` (${x.options.map(o => o.label + (o.sketch ? ` [${o.sketch}]` : '')).join(' / ')})` : x.steps ? ` (${x.steps.map(s => s.label).join(' → ')})` : ''}`);
    for (const m of ['plain', 'ref']) if (r[m]) md.push(`- ${m === 'plain' ? 'A · no reference' : 'B · reference'}: ${r[m].pickDrawn ? 'drawn' : 'words only'}${r[m].specDrawn ? ', slider drawn' : ''}${m === 'ref' ? `, ${r[m].refs} photo(s)` : ''} · ${r[m].seconds.toFixed(0)} s · ![](${r.id}-${m}-pick.png)`);
    md.push('');
  }
  fs.writeFileSync(path.join(OUT, `align-${LABEL}.md`), md.join('\n'));
  fs.writeFileSync(path.join(OUT, `align-${LABEL}.json`), JSON.stringify({ sum, rows }, null, 2));
  console.log('\n' + JSON.stringify(sum)); console.log(`report: ${path.join(OUT, `align-${LABEL}.md`)}`);
})().catch(e => { console.error(e); process.exit(1); });

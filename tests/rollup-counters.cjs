#!/usr/bin/env node
/* Evidence read through a tree of judgments: what counters a sub-claim is never backing for the claim it supports.
 * - A core claim supported by three sub-claims rests on their material, once each.
 * - Material that counters a sub-claim does not count as backing for the core claim, its directions or the decision;
 *   it shows as a counter on them (it weakens a leg they stand on), and the walk does not pass through it.
 * - Material you tie straight to a card says what it does there, whatever it does further down.
 *   node tests/rollup-counters.cjs   (from the repo root)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }
(async () => {
  const srv = http.createServer((q, r) => { if (q.url.startsWith('/Vellum-Lumen.html')) { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(r); } r.writeHead(404); r.end(); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  try {
    const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route('http://127.0.0.1:59639/**', r => r.abort()); await c.route(/wikipedia|wikimedia|openrouter|gdcvault/, r => r.abort());
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
    const ids = await p.evaluate(() => { persistNow(); board = blank('Tree'); sel = [];
      const gov = node('idea', { text: 'Controllers will pay for a close agent.' }, { x: BAY + 60, y: 100 });
      const h1 = node('idea', { text: 'Bank rec is the biggest block of close time.' }, { x: BAY + 60, y: 500 });
      const h2 = node('idea', { text: 'Controllers can sign without the CFO.' }, { x: BAY + 60, y: 800 });
      const e1 = node('source', { title: 'Close diaries', text: '31% of close hours.', weight: 'observed' }, { x: 60, y: 500 });
      const e2 = node('note', { title: 'Procurement', text: 'GL tools need the CFO.', weight: 'reported' }, { x: 60, y: 800 });
      const e3 = node('source', { title: 'TAM', text: '42k firms.', weight: 'proposed' }, { x: 60, y: 100 });
      const e4 = node('source', { title: 'Behind the counter', text: 'Supports the counter.', weight: 'observed' }, { x: 60, y: 1100 });
      makeRelation(e1.id, h1.id, { rel: 'supports' }); makeRelation(e2.id, h2.id, { rel: 'conflicts' }); makeRelation(e3.id, gov.id, { rel: 'supports' });
      makeRelation(e4.id, e2.id, { rel: 'supports' });
      makeRelation(h1.id, gov.id, { rel: 'supports' }); makeRelation(h2.id, gov.id, { rel: 'supports' });
      const dA = node('direction', { idea: gov.id, letter: 'A', title: 'Bottom-up', text: 'Self-serve.', test: 'Fails if fewer than 4 of 20 convert.' }, { x: BAY + 560, y: 100 });
      const dB = node('direction', { idea: gov.id, letter: 'B', title: 'Audit firms', text: 'Resell.', test: 'Fails if neither firm co-sells.' }, { x: BAY + 560, y: 470 });
      edge(gov.id, dA.id); edge(gov.id, dB.id); select([dB.id]); adopt(dB); renderAll();
      return { gov: gov.id, h1: h1.id, h2: h2.id, e1: e1.id, e2: e2.id, e3: e3.id, e4: e4.id, dB: dB.id }; });
    const read = () => p.evaluate(i => { const t = id => (n => n.title || n.text)(byId(id)); const r = id => { const x = restsOn(byId(id)); return { sup: x.sup.map(n => n.id).sort(), ctr: x.ctr.map(n => n.id).sort() }; };
      const d = decisionList().decided[0]; return { gov: r(i.gov), h2: r(i.h2), dec: { sup: d.rests.sup.map(n => n.id).sort(), ctr: d.rests.ctr.map(n => n.id).sort() }, g: groundOf(byId(i.gov)).k, gB: groundOf(byId(i.dB)).k }; }, ids);
    let v = await read();
    const s = a => [...a].sort();
    check('the core claim rests on the material under its sub-claims and its own, once each', JSON.stringify(v.gov.sup) === JSON.stringify(s([ids.e1, ids.e3])), JSON.stringify(v.gov));
    check('what counters a sub-claim is not backing for the core claim; it shows as a counter', !v.gov.sup.includes(ids.e2) && v.gov.ctr.includes(ids.e2), JSON.stringify(v.gov));
    check('the walk does not pass through a counter: what backs the counter backs nothing above it', !v.gov.sup.includes(ids.e4) && !v.gov.ctr.includes(ids.e4), JSON.stringify(v.gov));
    check('the sub-claim itself keeps its counter apart, as before', v.h2.sup.length === 0 && JSON.stringify(v.h2.ctr) === JSON.stringify([ids.e2]), JSON.stringify(v.h2));
    check('the decision rests on the same reading: the counter is apart, not one of its sources', !v.dec.sup.includes(ids.e2) && v.dec.ctr.includes(ids.e2) && v.dec.sup.includes(ids.e1), JSON.stringify(v.dec));
    const ui = await p.evaluate(i => ({ card: /1 counter/.test(nodeEl(i.gov)?.textContent || ''), dir: /1 coun/.test(nodeEl(i.dB)?.textContent || '') }), ids);
    check('the core claim\'s card says it has a counter', ui.card, JSON.stringify(ui));
    await p.evaluate(i => { makeRelation(i.e2, i.gov, { rel: 'supports' }); renderAll(); }, ids);
    v = await read();
    check('material tied straight to a card says what it does there, whatever it does further down', v.gov.sup.includes(ids.e2) && !v.gov.ctr.includes(ids.e2), JSON.stringify(v.gov));
    await p.evaluate(() => { board = sampleShowcase(); renderAll(); }); await p.waitForTimeout(300);
    check('the sample decision still rests on its six sources', await p.evaluate(() => decisionList().decided[0].rests.sup.length === 6 && /Mostly observed/.test(groundOf(decisionList().decided[0].dir).txt)));
    check('no page errors', !errs.length, errs.join(' | '));
  } finally { await b.close(); srv.close(); }
  console.log(results.join('\n')); console.log(`\n${results.length - failures}/${results.length} passed`); process.exit(failures ? 1 : 0);
})();

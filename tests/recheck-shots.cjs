#!/usr/bin/env node
/* Screenshots of the crew re-check, replaying what Qwen 3.5 9B (MLX 4-bit) answered in the eval for the desk fan board:
 * new evidence removes the reason the clip-on fan was set aside; Strategist says it may be worth reopening the tower,
 * Critic objects with a fix. Light and dark, English; the note on the card and the decision view.
 *   SHOTS=dir node tests/recheck-shots.cjs */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html'), OUT = path.resolve(process.env.SHOTS || 'recheck-shots');
const STRAT = { verdict: 'reopen', why: 'The new evidence shows 80% of desks support the clip-on design, directly invalidating the reason we assumed it was unfeasible. This makes the set-aside option viable and undermines the choice of the tower.', cites: ['N1', 'A1'], next: 'Compare the noise performance of the clip-on fan against the quiet bladeless tower.' };
const CRIT = { agree: false, objection: 'The evidence (N1) addresses feasibility, not the core trade-off (noise) that drove the original decision against the clip-on fan.', cites: ['N1', 'S1'], fix: "Re-evaluate the clip-on fan's noise performance to see if it can meet the <30 dB requirement without compromising call quality." };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = http.createServer((q, r) => {
    if (q.url.startsWith('/Vellum-Lumen.html')) { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(r); }
    if (q.method === 'POST' && q.url.endsWith('/chat/completions')) { let b = ''; q.on('data', c => b += c); q.on('end', () => { const crit = /Strategist has re-checked/.test(b); r.writeHead(200, { 'Content-Type': 'text/event-stream' }); r.write('data: ' + JSON.stringify({ choices: [{ delta: { content: JSON.stringify(crit ? CRIT : STRAT) } }] }) + '\n\n'); r.end('data: [DONE]\n\n'); }); return; }
    r.writeHead(404); r.end();
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  for (const theme of ['light', 'dark']) {
    const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
    await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route(/wikipedia|wikimedia|openrouter|gdcvault/, r => r.abort());
    const p = await c.newPage(); await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
    const ids = await p.evaluate(url => {
      apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'Qwen3.5-9B-4bit', key: 'k', daily: 1000 }; aiPref = 'api'; setApiHealth('ok', {});
      board = blank('Desk fan'); sel = []; setSpeak('matters');
      const claim = node('idea', { title: 'Home workers want cooling at the desk without the noise that ruins calls.', text: 'Home workers want cooling at the desk without the noise that ruins calls.' }, { x: 0, y: 0 });
      const A = node('direction', { idea: claim.id, letter: 'A', title: 'Clip-on fan', text: 'A small fan that clamps to the desk edge or a monitor arm.', test: '7 of 10 can clip it within reach in under a minute.' }, { x: 0, y: 420 });
      const B = node('direction', { idea: claim.id, letter: 'B', title: 'Quiet bladeless tower', text: 'A bladeless tower under 30 dB at full speed.', test: 'No call participant notices it in 5 test calls.' }, { x: 460, y: 420 });
      [['Diary study: fan noise on calls', '9 of 12 participants turned their fan off during calls.', 'observed'], ['Survey: noise is the top complaint', 'Noise was the most named complaint about desk fans (41%).', 'reported']].forEach(([t, x, w], k) => { const n = node('source', { title: t, text: x, weight: w }, { x: -620, y: k * 320 }); makeRelation(n.id, claim.id, { via: 'wire' }).e.rel = 'supports'; });
      adopt(B); B.whyYes = 'Noise on calls was the top complaint we heard.'; A.whyNot = 'We assumed most desks have no clamp edge.';
      board.nodes.forEach(n => { n.created = NOW() - 7200e3; }); B.adoptedAt = NOW() - 3600e3; renderAll(); runBoardChecks();
      const e = node('source', { title: 'Home office visits: clamp edges', text: 'In 10 home offices, 8 desks had a free edge or a monitor arm a clip-on fan could clamp to.', weight: 'observed' }, { x: 460, y: 1100 });
      makeRelation(e.id, B.id, { via: 'wire' }); renderAll();
      return { B: B.id };
    }, base);
    for (let i = 0; i < 20; i++) { await p.evaluate(() => { lastUserAct = NOW() - 60000; tickChecks(); }); await p.waitForTimeout(400); if (await p.evaluate(id => (board.pins?.[id] || []).some(x => x.engine === 'model'), ids.B)) break; }
    await p.evaluate(id => { const n = byId(id); focusNodes([n, ...board.nodes.filter(x => x.type === 'source' && x.y > 1000)], .85); }, ids.B); await p.waitForTimeout(900);
    await p.evaluate(id => toggleAdvPop(id), ids.B); await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(OUT, `${theme}-1-note-on-decision.png`) });
    await p.evaluate(() => { closeAdvPop(); openDecisions(true); }); await p.waitForTimeout(700);
    await p.evaluate(() => { const s = document.querySelector('.dv-since'); s?.scrollIntoView({ block: 'center' }); });
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, `${theme}-2-decision-view.png`) });
    await c.close();
  }
  await b.close(); srv.close(); console.log('saved to ' + OUT);
})();

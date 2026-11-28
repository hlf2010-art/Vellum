#!/usr/bin/env node
/* Screenshots of the crew re-check on the desk fan board: new evidence removes the reason the clip-on fan was set aside.
 * Strategist's reading is replayed from what Qwen 3.5 9B (MLX 4-bit) answered in the eval. Critic either objects with a
 * fix, or has no strong objection. Light and dark, English and Chinese; the note on the card and the decision view.
 *   SHOTS=dir node tests/recheck-shots.cjs */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { FAN, FAN_ZH, EV, buildBoard } = require('./eval-boards.cjs');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html'), OUT = path.resolve(process.env.SHOTS || 'recheck-shots');
const R = {
  en: {
    strat: { verdict: 'reopen', why: '8 of 10 desks had a clamp edge, which removes the reason the clip-on fan was set aside, so the choice of the tower is worth a second look.', cites: ['N1', 'A1'], next: 'Compare the noise of the clip-on fan against the tower on 3 calls.' },
    survey: { conflicts: [{ id: 'N1', how: '8 of 10 desks had a clamp edge' }], assumptions: [{ text: 'Most desks have no clamp edge', rests_on: ['N1'], status: 'contradicted' }, { text: 'Only a tower can be quiet enough', rests_on: ['S1'], status: 'untested' }] },
    object: { my_verdict: 'holds', stance: 'object', objection: 'Clamp edges answer whether the clip-on fits, not the noise that drove the choice: 9 of 12 people turned their fan off on calls, and nobody has measured the clip-on on a call.', cites: ['N1', 'S1'], fix: 'Measure the clip-on fan on 3 test calls and note how many participants notice it.' },
  },
  zh: {
    strat: { verdict: 'reopen', why: '10 张桌子里 8 张有可夹的边，当初放下夹式小风扇的理由不成立了，选塔扇这件事值得再看一眼。', cites: ['N1', 'A1'], next: '在 3 次会议里对比夹式小风扇和塔扇的噪音。' },
    survey: { conflicts: [{ id: 'N1', how: '10 张桌子里 8 张有可夹的边' }], assumptions: [{ text: '大多数桌子没有能夹的边', rests_on: ['N1'], status: 'contradicted' }] },
    object: { my_verdict: 'holds', stance: 'object', objection: '能不能夹只回答了装得上，没回答噪音：12 名参与者中有 9 人开会时会关掉风扇，而夹式小风扇在会议里的噪音还没人测过。', cites: ['N1', 'S1'], fix: '在 3 次测试会议里试用夹式小风扇，记录有几位参会者注意到它。' },
  },
};
const RUNS = [['light', 'en', 'object'], ['dark', 'zh', 'object'], ['light', 'zh', 'quiet'], ['dark', 'en', 'quiet']];
let cur = null;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = http.createServer((q, r) => {
    if (q.url.startsWith('/Vellum-Lumen.html')) { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(r); }
    if (q.method === 'POST' && q.url.endsWith('/chat/completions')) {
      let b = ''; q.on('data', c => b += c); q.on('end', () => {
        const x = R[cur[1]], v = /Survey the cards: steps 1 and 2/.test(b) ? x.survey : /Step 3: your own verdict/.test(b) ? (cur[2] === 'object' ? x.object : { stance: 'none' }) : x.strat;
        r.writeHead(200, { 'Content-Type': 'text/event-stream' }); r.write('data: ' + JSON.stringify({ choices: [{ delta: { content: JSON.stringify(v) } }] }) + '\n\n'); r.end('data: [DONE]\n\n');
      }); return;
    }
    r.writeHead(404); r.end();
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  for (const run of RUNS) {
    cur = run; const [theme, lang, mode] = run, name = `${theme}-${lang}-${mode}`;
    const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
    await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route('http://127.0.0.1:59639/**', r => r.abort()); await c.route(/wikipedia|wikimedia|openrouter|gdcvault/, r => r.abort());
    const p = await c.newPage(); await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
    await p.evaluate(url => { apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'Qwen3.5-9B-4bit', key: 'k', daily: 1000 }; aiPref = 'api'; setApiHealth('ok', {}); }, base);
    const ev = lang === 'zh' ? { title: '家庭办公室走访：可夹的桌边', text: '10 个家庭办公室里，8 张桌子有空着的桌边或显示器支架，夹式小风扇可以夹上去。', weight: 'observed', rel: 'related' } : EV.fanAside;
    const ids = await p.evaluate(buildBoard, [lang === 'zh' ? FAN_ZH : FAN, ev]);
    for (let i = 0; i < 25; i++) { await p.evaluate(() => { lastUserAct = NOW() - 60000; tickChecks(); }); await p.waitForTimeout(400); if (await p.evaluate(id => (board.pins?.[id] || []).some(x => x.engine === 'model'), ids.dir)) break; }
    await p.evaluate(id => { const n = byId(id); focusNodes([n, ...board.nodes.filter(x => x.type === 'source' && x.y > 1000)], .85); }, ids.dir); await p.waitForTimeout(900);
    await p.evaluate(id => toggleAdvPop(id), ids.dir); await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(OUT, `${name}-1-note-on-decision.png`) });
    await p.evaluate(() => { closeAdvPop(); openDecisions(true); }); await p.waitForTimeout(700);
    await p.evaluate(() => { document.querySelector('.dv-since')?.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, `${name}-2-decision-view.png`) });
    await c.close();
  }
  await b.close(); srv.close(); console.log('saved to ' + OUT);
})();

#!/usr/bin/env node
/* Records the crew run the demo replays: the real app, the demo board, a real model.
 *
 * It opens Vellum-Lumen.html in demo mode with recording on, brings in the new evidence (Beta test, countering the decision),
 * lets the crew re-check the decision exactly as the app does, and keeps every answer the crew got, in English and Chinese.
 * The answers go to demo/recording.json with real:true, the model's name and the date; tools/demo/build.mjs inlines them.
 * Nothing is edited by hand: if the watchdog rejects an answer, the run fails and nothing is written.
 *
 * Which model answers:
 *   - Local AI (Studio AI on 127.0.0.1:59631) when it is running, as on the Mac mini:  node tools/demo/record-run.cjs
 *   - or any OpenAI-compatible API:  API_BASE=https://openrouter.ai/api/v1 API_MODEL=qwen/qwen3.5-9b API_KEY=… node tools/demo/record-run.cjs
 *   --lang=en (or zh) records one language only and keeps the other from the existing file.  --headed shows the browser.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, 'Vellum-Lumen.html');
const OUTF = process.argv.find(a => a.startsWith('--out='))?.slice(6) || path.join(ROOT, 'demo', 'recording.json');
const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const LANGS = arg('lang') ? [arg('lang')] : ['en', 'zh'];
const TIMEOUT = 6 * 60e3;

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (!req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}/Vellum-Lumen.html`;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  const out = fs.existsSync(OUTF) ? JSON.parse(fs.readFileSync(OUTF, 'utf8')) : {};
  const runs = out.real ? { ...(out.runs || {}) } : {};
  let ok = true;
  try {
    for (const lang of LANGS) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(() => { window.VELLUM_DEMO = { record: true }; });
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
      await p.goto(`${base}?lang=${lang}`); await p.waitForTimeout(2500);
      /* the engine */
      const api = process.env.API_KEY ? { enabled: true, baseUrl: process.env.API_BASE || 'https://openrouter.ai/api/v1', model: process.env.API_MODEL || 'qwen/qwen3.5-9b', key: process.env.API_KEY } : null;
      if (api) await p.evaluate(a => { apiCfg = a; aiPref = 'api'; setApiHealth('ok', {}); }, api);
      else {
        await p.evaluate(() => checkStudioHealth({ wake: true, quiet: true }));
        const t0 = Date.now();
        while (!(await p.evaluate(() => studioState.status === 'ready')) && Date.now() - t0 < 180e3) await p.waitForTimeout(1500);
        if (!(await p.evaluate(() => studioState.status === 'ready'))) throw new Error('No model: start Studio AI (Local AI) or pass API_KEY / API_BASE / API_MODEL');
      }
      const engine = await p.evaluate(() => { const c = connSummary(); return { engine: c.engine, mode: c.mode, model: c.engine === 'local' ? (studioState.model || '').split('/').pop() : c.engine === 'api' ? apiCfg.model : '' }; });
      if (engine.engine === 'rules' || engine.engine === 'replay') throw new Error('No live engine: ' + JSON.stringify(engine));
      console.log(`[${lang}] recording with ${engine.mode}`);
      /* keep what the crew gets */
      await p.evaluate(() => {
        const orig = askAI; window.__rec = [];
        askAI = async function (o, local) { const t0 = performance.now(); const r = await orig(o, local); if (o && o.tag) window.__rec.push({ tag: o.tag, key: o.key || '', v: r.v, live: r.live, engine: r.engine, ms: Math.round(performance.now() - t0) }); return r; };
      });
      /* the moment: the evidence arrives, the board goes quiet, the crew re-checks */
      await p.evaluate(() => { setSpeak('matters'); demoAddEvidence(); });
      const t0 = Date.now(); let job = null;
      while (Date.now() - t0 < TIMEOUT) {
        await p.evaluate(() => { lastUserAct = NOW() - 60000; tickChecks(); });
        job = await p.evaluate(() => Object.values(board.watch?.rc || {}).find(j => j.status !== 'run') || null);
        if (job) break;
        await p.waitForTimeout(1500);
      }
      const rec = await p.evaluate(() => window.__rec);
      if (!job || job.status !== 'done') { ok = false; console.error(`[${lang}] the re-check did not finish: ${job ? job.why : 'timed out'}`, rec); await ctx.close(); continue; }
      const pin = await p.evaluate(id => (board.pins[id] || []).find(x => x.check === 'revisit')?.note || '', job.dir);
      runs[lang] = { model: engine.model || engine.mode, engine: engine.engine, verdict: job.strat.verdict, critic: job.critic || 'none', calls: rec.filter(r => r.live) };
      console.log(`[${lang}] ${job.strat.verdict}, critic ${job.critic || 'none'}, ${rec.length} call(s), ${job.ms} ms`); if (pin) console.log(`[${lang}] note: ${pin.replace(/\n/g, ' / ')}`);
      if (errs.length) console.log(`[${lang}] page errors:`, errs);
      await ctx.close();
    }
  } catch (e) { ok = false; console.error(String(e.message || e)); }
  finally { await browser.close(); srv.close(); }
  if (!ok || !LANGS.every(l => runs[l])) { console.error('Nothing written.'); process.exit(1); }
  const models = [...new Set(Object.values(runs).map(r => r.model))];
  const rec = { real: true, recordedAt: new Date().toISOString(), model: models.join(' / '), tool: 'tools/demo/record-run.cjs', runs };
  fs.writeFileSync(OUTF, JSON.stringify(rec, null, 2) + '\n');
  console.log('wrote ' + path.relative(ROOT, OUTF));
})();

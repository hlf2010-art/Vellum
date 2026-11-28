#!/usr/bin/env node
/* Re-check eval: does the crew's re-check of a decision help, on a real model?
 *
 * Eight boards with a decision already made (camping lantern, desk fan, a note app; two in Chinese). Each gets one piece of
 * new evidence whose right reading is known: it backs the decision, counters its core reason, favors an option set aside,
 * is only a weak anecdote or an unsourced claim, or does not really bear on the decision. The real Vellum-Lumen.html re-checks
 * it with the model (real prompts, real watchdog, real fallbacks) and the report compares:
 *   - before (board checks only, no model): what the note on the decision says today
 *   - after (crew re-check): the verdict, whether it is in the right range, whether the watchdog let it through, Critic's part,
 *     how long it took, and the note the designer would read.
 *
 *   node tests/recheck-eval.cjs --api http://127.0.0.1:8080/v1 --model mlx-community/Qwen3.5-9B-4bit   # any OpenAI-compatible server
 *   node tests/recheck-eval.cjs                      # Vellum's Studio AI at 127.0.0.1:59631, ready with a model
 *   options: --n 2 (runs per case)  --cases lantern-counter,fan-aside  --out recheck-eval-results  --label name  --timeout 300
 *            --file path/to/Vellum-Lumen.html (another build, for before/after runs)
 * Exit code is 0 when it ran; the score is in the report. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? a.concat([[x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]]) : a), []));
const N = +args.n || 2, OUT = path.resolve(args.out || 'recheck-eval-results');
const LABEL = String(args.label || (args.api ? String(args.model).split('/').pop() : 'studio-ai')).replace(/[^\w.-]+/g, '-');
const FILE = path.resolve(args.file || path.join(__dirname, '..', 'Vellum-Lumen.html'));

const { LANTERN, FAN, NOTES, LANTERN_ZH, EV, buildBoard } = require('./eval-boards.cjs');

/* the new evidence and the verdicts that read it right */
const CASES = [
  { id: 'lantern-counter', board: LANTERN, ev: EV.lanternCounter, ok: ['weaker', 'reopen'], kind: 'counters the core reason' },
  { id: 'lantern-support', board: LANTERN, ev: EV.lanternSupport, ok: ['stronger', 'holds'], kind: 'backs it' },
  { id: 'lantern-unrelated', board: LANTERN, ev: EV.lanternUnrelated, ok: ['holds'], kind: 'does not bear on it' },
  { id: 'lantern-myth', board: LANTERN, ev: EV.lanternMyth, ok: ['holds', 'weaker'], kind: 'a doubtful, unsourced counter' },
  { id: 'fan-aside', board: FAN, ev: EV.fanAside, ok: ['reopen', 'weaker'], kind: 'removes the reason an option was set aside' },
  { id: 'fan-anecdote', board: FAN, ev: EV.fanAnecdote, ok: ['holds', 'weaker'], kind: 'one anecdote against observed evidence' },
  { id: 'lantern-counter-zh', board: LANTERN_ZH, ev: EV.lanternCounterZh, ok: ['weaker', 'reopen'], kind: '反驳核心理由（中文）' },
  { id: 'notes-support', board: NOTES, ev: EV.notesSupport, ok: ['stronger', 'holds'], kind: 'backs it' },
];
const pick = args.cases ? CASES.filter(c => String(args.cases).split(',').includes(c.id)) : CASES;

function serve() { return new Promise(res => { const s = http.createServer((q, r) => { if (q.url.startsWith('/Vellum-Lumen.html')) { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(r); } r.writeHead(404); r.end(); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.route(/wikipedia|wikimedia|gdcvault/, r => r.abort());
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
  if (args.api) await p.evaluate(([baseUrl, model, key]) => { apiCfg = { enabled: true, baseUrl, model, key, daily: 100000 }; aiPref = 'api'; setApiHealth('ok', {}); }, [args.api, args.model, process.env.VELLUM_EVAL_KEY || 'local']);
  else { const ok = await p.evaluate(async () => { await checkStudioHealth({ wake: false, quiet: true }); aiPref = 'auto'; apiCfg = { ...apiCfg, enabled: false }; return studioState.status === 'ready'; }); if (!ok) throw new Error('Studio AI is not ready at 127.0.0.1:59631. Start it and load a model, or pass --api.'); }
  if (args.timeout) await p.evaluate(ms => { AI_TIMEOUT_MS = ms; LOCAL_AI_MS = ms; }, Math.round(+args.timeout * 1000));
  const engine = await p.evaluate(() => connSummary().mode);
  /* count the calls the page makes */
  let calls = 0; p.on('request', q => { if (/chat\/completions|studio\/generate/.test(q.url()) && q.method() === 'POST') calls++; });

  const rows = [];
  for (const cs of pick) for (let i = 0; i < N; i++) {
    calls = 0; const t0 = Date.now();
    /* build the board, decide, let board checks learn it, then keep the new evidence */
    const ids = await p.evaluate(buildBoard, [cs.board, cs.ev]);
    if (!ids.flagged) { rows.push({ case: cs.id, i, flagged: false }); console.log(`${cs.id} #${i + 1}  not flagged by board checks`); continue; }
    /* after: let the crew re-check it, as after a pause */
    const max = Date.now() + 600000;
    while (Date.now() < max) { await p.evaluate(() => { lastUserAct = NOW() - 60000; tickChecks(); }); await p.waitForTimeout(800); if (await p.evaluate(() => !rcRunning && !(board.watch?.queue || []).length)) break; }
    const out = await p.evaluate(r => {
      const job = Object.values(board.watch.rc || {}).find(j => j.dir === r.dir) || {};
      const pin = (board.pins?.[r.dir] || []).filter(x => x.check === 'revisit').at(-1) || {};
      return { raw: job.raw, rawCritic: job.rawCritic, status: job.status, why: job.why, strat: job.strat, critic: job.crit ? 'objects' : job.critic, objection: job.crit, dropped: job.dropped, ms: job.ms, engine: job.engine, pinEngine: pin.engine, note: pin.note, adoptedSame: board.adopted[r.claim] === r.dir };
    }, ids);
    const verdict = out.strat?.verdict || null, right = !!verdict && cs.ok.includes(verdict);
    const row = { case: cs.id, kind: cs.kind, i, flagged: true, before: ids.before, ...out, verdict, right, calls, seconds: (Date.now() - t0) / 1000 };
    rows.push(row);
    console.log(`${cs.id} #${i + 1}  ${out.status === 'done' ? `${verdict}${right ? '' : ' (expected ' + cs.ok.join('/') + ')'}  critic: ${out.critic || '-'}` : `fell back: ${out.why}`}  ${row.seconds.toFixed(0)} s, ${calls} call${calls === 1 ? '' : 's'}`);
  }
  await p.evaluate(() => store.set('.lang', 'en'));
  await b.close(); srv.close();

  /* ------------------------------------------------------------------ the report */
  const ran = rows.filter(r => r.flagged), done = ran.filter(r => r.status === 'done');
  const pct = (a, n) => n ? Math.round(a / n * 100) + '%' : '-';
  const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const objections = done.filter(r => r.critic === 'objects');
  const sum = {
    label: LABEL, engine, runs: ran.length, shown: done.length, right: done.filter(r => r.right).length,
    fellBack: ran.length - done.length, objections: objections.length, droppedObjections: done.filter(r => (r.dropped || []).length).length,
    medianSeconds: med(ran.map(r => r.seconds)), medianCalls: med(ran.map(r => r.calls)), decisionsChanged: ran.filter(r => !r.adoptedSame).length, pageErrors: errs.length,
  };
  const md = [`# Re-check eval · ${LABEL}`, '', `Engine: ${engine} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${N} run(s) per case`, '',
    '| | |', '|---|---|',
    `| Crew reading shown (passed the watchdog) | ${sum.shown} of ${sum.runs} (${pct(sum.shown, sum.runs)}) |`,
    `| Verdict in the right range, of those shown | ${sum.right} of ${sum.shown} (${pct(sum.right, sum.shown)}) |`,
    `| Verdict in the right range, of all runs | ${pct(sum.right, sum.runs)} |`,
    `| Fell back to the board check | ${sum.fellBack} |`,
    `| Critic objections shown (each with evidence and a fix) | ${sum.objections} · dropped by the watchdog: ${sum.droppedObjections} |`,
    `| Median time / model calls per re-check | ${sum.medianSeconds.toFixed(0)} s / ${sum.medianCalls} |`,
    `| Decisions changed without the designer | ${sum.decisionsChanged} |`,
    '', 'Before (board checks only) the note can say only how the evidence was linked ("counters", "supports", "bears on"); it never says whether the decision still holds or why.', '',
    '## Each run', ''];
  for (const r of rows) {
    if (!r.flagged) { md.push(`### ${r.case} #${r.i + 1}: not flagged by board checks`, ''); continue; }
    md.push(`### ${r.case} #${r.i + 1}: ${r.kind}`, '', `- **Before:** ${r.before}`,
      r.status === 'done' ? `- **After:** ${r.note}` : `- **After:** fell back to the board check (${r.why})`,
      ...(r.raw || []).map((x, k) => `- Strategist's ${k ? 'repaired' : 'first'} reply: \`${x}\``), ...(r.rawCritic || []).map((x, k) => `- Critic's ${k ? 'repaired' : 'first'} reply: \`${x}\``),
      `- Verdict: ${r.verdict || '-'} ${r.verdict ? (r.right ? '(right range)' : '(outside the right range)') : ''} · Critic: ${r.critic || '-'}${(r.dropped || []).length ? ` · watchdog dropped: ${r.dropped.join('; ')}` : ''} · ${r.seconds.toFixed(0)} s, ${r.calls} calls`, '');
  }
  fs.writeFileSync(path.join(OUT, `recheck-${LABEL}.md`), md.join('\n'));
  fs.writeFileSync(path.join(OUT, `recheck-${LABEL}.json`), JSON.stringify({ sum, rows }, null, 2));
  console.log('\n' + JSON.stringify(sum)); console.log(`report: ${path.join(OUT, `recheck-${LABEL}.md`)}`);
})().catch(e => { console.error(e); process.exit(1); });

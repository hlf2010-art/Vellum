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
 * Exit code is 0 when it ran; the score is in the report. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? a.concat([[x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]]) : a), []));
const N = +args.n || 2, OUT = path.resolve(args.out || 'recheck-eval-results');
const LABEL = String(args.label || (args.api ? String(args.model).split('/').pop() : 'studio-ai')).replace(/[^\w.-]+/g, '-');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');

/* ------------------------------------------------------------------ the boards */
const LANTERN = {
  title: 'Camping lantern', claim: 'Campers need a lantern they can put up hands-free in seconds.',
  dirs: [
    { title: 'Hook-and-strap lantern', text: 'A fabric strap and hook that wraps any branch or pole.', test: '8 of 10 campers hang it in under 10 s.', whyNot: 'Straps tangle in the bag; slower than we hoped in the first try.' },
    { title: 'Magnetic-base lantern', text: 'A strong magnet in the base sticks to car roofs, tailgates and steel tent poles.', test: '8 of 10 campers stick it up in under 5 s.' },
  ], chosen: 1, why: 'Most campers we watched set up beside their car, and steel tent poles are common.',
  rests: [
    { title: 'Campsite visit: car-side setups', text: '11 of 14 groups we watched pitched within 3 m of their car.', weight: 'observed' },
    { title: 'Retailer: steel poles in budget tents', text: 'A shop assistant said most budget tents still use steel poles.', weight: 'reported' },
  ],
};
const FAN = {
  title: 'Desk fan', claim: 'Home workers want cooling at the desk without the noise that ruins calls.',
  dirs: [
    { title: 'Clip-on fan', text: 'A small fan that clamps to the desk edge or a monitor arm.', test: '7 of 10 can clip it within reach in under a minute.', whyNot: 'We assumed most desks have no clamp edge.' },
    { title: 'Quiet bladeless tower', text: 'A bladeless tower under 30 dB at full speed.', test: 'No call participant notices it in 5 test calls.' },
  ], chosen: 1, why: 'Noise on calls was the top complaint we heard.',
  rests: [
    { title: 'Diary study: fan noise on calls', text: '9 of 12 participants turned their fan off during calls.', weight: 'observed' },
    { title: 'Survey: noise is the top complaint', text: 'Noise was the most named complaint about desk fans (41%).', weight: 'reported' },
  ],
};
const NOTES = {
  title: 'Field notes app', claim: 'Field researchers lose notes when the network drops.',
  dirs: [
    { title: 'Cloud-first with retry', text: 'Notes save to the cloud and retry when the network returns.', test: 'No note lost in 20 offline sessions.', whyNot: 'Retry queues failed in two pilot sites.' },
    { title: 'Offline-first sync', text: 'Notes live on the device and sync when a network is available.', test: 'No note lost in 20 offline sessions.' },
  ], chosen: 1, why: 'Researchers are offline for hours at a time.',
  rests: [{ title: 'Pilot logs: offline time', text: 'Median offline stretch was 3.5 hours across 6 sites.', weight: 'observed' }],
};
const LANTERN_ZH = {
  title: '露营灯', claim: '露营的人需要几秒内就能免手持挂好的灯。', zh: true,
  dirs: [
    { title: '挂钩绑带灯', text: '用布带和挂钩缠在树枝或杆子上。', test: '10 人中 8 人能在 10 秒内挂好。', whyNot: '绑带在包里容易缠住，第一次试用比预期慢。' },
    { title: '磁吸底座灯', text: '底座有强磁铁，能吸在车顶、尾门和钢制帐篷杆上。', test: '10 人中 8 人能在 5 秒内吸好。' },
  ], chosen: 1, why: '我们观察到的大多数人都在车旁扎营，钢制帐篷杆也很常见。',
  rests: [{ title: '营地走访：车旁扎营', text: '我们观察的 14 组人里有 11 组在离车 3 米内扎营。', weight: 'observed' }],
};
/* the new evidence and the verdicts that read it right */
const CASES = [
  { id: 'lantern-counter', board: LANTERN, ev: { title: 'Field test: aluminium tent poles', text: 'At two campsites, 7 of 10 tents had aluminium poles; the magnet did not stick to any of them.', weight: 'observed', rel: 'conflicts' }, ok: ['weaker', 'reopen'], kind: 'counters the core reason' },
  { id: 'lantern-support', board: LANTERN, ev: { title: 'Field test: stuck to the car in 3 s', text: '9 of 12 campers stuck the lantern to their car roof or tailgate, median 3 seconds.', weight: 'observed', rel: 'supports' }, ok: ['stronger', 'holds'], kind: 'backs it' },
  { id: 'lantern-unrelated', board: LANTERN, ev: { title: 'Supplier quote: USB-C port', text: 'Switching the charging port to USB-C saves $0.40 per unit.', weight: 'reported', rel: 'related' }, ok: ['holds'], kind: 'does not bear on it' },
  { id: 'lantern-myth', board: LANTERN, ev: { title: 'Blog: magnets drain lantern batteries', text: 'A camping blog claims a magnet in the base drains the battery faster. No test or source is given.', weight: 'reported', rel: 'conflicts' }, ok: ['holds', 'weaker'], kind: 'a doubtful, unsourced counter' },
  { id: 'fan-aside', board: FAN, ev: { title: 'Home office visits: clamp edges', text: 'In 10 home offices, 8 desks had a free edge or a monitor arm a clip-on fan could clamp to.', weight: 'observed', rel: 'related' }, ok: ['reopen', 'weaker'], kind: 'removes the reason an option was set aside' },
  { id: 'fan-anecdote', board: FAN, ev: { title: 'One forum post: bladeless fans feel weak', text: 'A forum user said bladeless fans move less air than cheap blade fans.', weight: 'reported', rel: 'conflicts' }, ok: ['holds', 'weaker'], kind: 'one anecdote against observed evidence' },
  { id: 'lantern-counter-zh', board: LANTERN_ZH, ev: { title: '实地测试：铝制帐篷杆', text: '两个营地里 10 顶帐篷中有 7 顶是铝杆，磁铁一个都吸不住。', weight: 'observed', rel: 'conflicts' }, ok: ['weaker', 'reopen'], kind: '反驳核心理由（中文）' },
  { id: 'notes-support', board: NOTES, ev: { title: 'Pilot: zero lost notes offline', text: 'Over 24 offline sessions at 3 sites, the offline-first build lost no notes.', weight: 'observed', rel: 'supports' }, ok: ['stronger', 'holds'], kind: 'backs it' },
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
    const ids = await p.evaluate(([B, ev]) => {
      abortRecheck(); store.set('.lang', B.zh ? 'zh' : 'en');
      board = blank(B.title); sel = []; setSpeak('matters');
      const claim = node('idea', { title: B.claim, text: B.claim }, { x: 0, y: 0 });
      const dirs = B.dirs.map((d, k) => node('direction', { idea: claim.id, letter: 'ABC'[k], title: d.title, text: d.text, test: d.test }, { x: 460 * k, y: 420 }));
      B.rests.forEach((e, k) => { const n = node('source', { title: e.title, text: e.text, weight: e.weight }, { x: -620, y: k * 320 }); makeRelation(n.id, claim.id, { via: 'wire' }).e.rel = 'supports'; });
      adopt(dirs[B.chosen]); dirs[B.chosen].whyYes = B.why; B.dirs.forEach((d, k) => { if (d.whyNot && k !== B.chosen) dirs[k].whyNot = d.whyNot; });
      board.nodes.forEach(n => { n.created = NOW() - 7200e3; }); dirs[B.chosen].adoptedAt = NOW() - 3600e3;
      renderAll(); runBoardChecks();
      const e = node('source', { title: ev.title, text: ev.text, ...(ev.weight ? { weight: ev.weight } : {}) }, { x: 460 * B.chosen, y: 1100 });
      if (ev.rel) { const r = makeRelation(e.id, dirs[B.chosen].id, { via: 'wire' }); r.e.rel = ev.rel; }
      renderAll();
      /* before: what board checks alone would put on the decision */
      const obs = runBoardChecks().filter(o => o.kind === 'revisit'), before = obs.map(o => checkPin(o)?.note || '').join(' ');
      return { dir: dirs[B.chosen].id, claim: claim.id, ev: e.id, before, flagged: obs.length };
    }, [cs.board, cs.ev]);
    if (!ids.flagged) { rows.push({ case: cs.id, i, flagged: false }); console.log(`${cs.id} #${i + 1}  not flagged by board checks`); continue; }
    /* after: let the crew re-check it, as after a pause */
    const max = Date.now() + 600000;
    while (Date.now() < max) { await p.evaluate(() => { lastUserAct = NOW() - 60000; tickChecks(); }); await p.waitForTimeout(800); if (await p.evaluate(() => !rcRunning && !(board.watch?.queue || []).length)) break; }
    const out = await p.evaluate(r => {
      const job = Object.values(board.watch.rc || {}).find(j => j.dir === r.dir) || {};
      const pin = (board.pins?.[r.dir] || []).filter(x => x.check === 'revisit').at(-1) || {};
      return { status: job.status, why: job.why, strat: job.strat, critic: job.crit ? 'objects' : job.critic, objection: job.crit, dropped: job.dropped, ms: job.ms, engine: job.engine, pinEngine: pin.engine, note: pin.note, adoptedSame: board.adopted[r.claim] === r.dir };
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
      `- Verdict: ${r.verdict || '-'} ${r.verdict ? (r.right ? '(right range)' : '(outside the right range)') : ''} · Critic: ${r.critic || '-'}${(r.dropped || []).length ? ` · watchdog dropped: ${r.dropped.join('; ')}` : ''} · ${r.seconds.toFixed(0)} s, ${r.calls} calls`, '');
  }
  fs.writeFileSync(path.join(OUT, `recheck-${LABEL}.md`), md.join('\n'));
  fs.writeFileSync(path.join(OUT, `recheck-${LABEL}.json`), JSON.stringify({ sum, rows }, null, 2));
  console.log('\n' + JSON.stringify(sum)); console.log(`report: ${path.join(OUT, `recheck-${LABEL}.md`)}`);
})().catch(e => { console.error(e); process.exit(1); });

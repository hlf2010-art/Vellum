#!/usr/bin/env node
/* Critic eval: is Critic's review of a re-check worth reading, on a real model?
 *
 * Critic reviews Strategist's reading of new evidence on a decision. Here Strategist's reading is fixed (injected), so only
 * Critic is measured. Half the readings are wrong in a known way (calls an observed counter "holds", lets one forum post
 * reopen a decision resting on observed evidence, treats an unsourced blog as a real flaw, misses that new evidence removes
 * the reason an option was set aside); a good Critic objects, cites the card that shows it, and gives a fix the designer can
 * act on. The other half are sound; a good Critic stays quiet (agrees, or says it has no strong objection) instead of
 * inventing a thin objection. Two boards are in Chinese.
 *
 * The real Vellum-Lumen.html builds each board, its numbered pack and Critic's prompts, and its watchdog decides what would be
 * shown. The report scores what the designer would see:
 *   - wrong readings caught: an objection shown
 *   - sound readings left alone: no objection shown
 *   - grounded: a shown objection cites the card that shows the problem (the case's key cards)
 *   - actionable: its fix names something to do (a check, a count, a question to ask), not "consider" or "be careful"
 *   - time and model calls per review
 *
 *   node tests/critic-eval.cjs --api http://127.0.0.1:8090/v1 --model <model id>   # any OpenAI-compatible server
 *   node tests/critic-eval.cjs                      # Vellum's Studio AI at 127.0.0.1:59631, ready with a model
 *   options: --n 2 (runs per case)  --cases a,b  --out recheck-eval-results  --label name  --file path/to/Vellum-Lumen.html
 * Works with this build's Critic (rcCriticReview) and with the older one-call Critic (rcCritic), so before/after runs compare.
 * Exit code is 0 when it ran; the score is in the report. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { LANTERN, FAN, NOTES, LANTERN_ZH, FAN_ZH, EV, buildBoard } = require('./eval-boards.cjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? a.concat([[x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]]) : a), []));
const N = +args.n || 2, OUT = path.resolve(args.out || 'recheck-eval-results');
const LABEL = String(args.label || (args.api ? String(args.model).split('/').pop() : 'studio-ai')).replace(/[^\w.-]+/g, '-');
const FILE = path.resolve(args.file || path.join(__dirname, '..', 'Vellum-Lumen.html'));

/* Strategist's reading (fixed), and what a good Critic does with it */
const S = (verdict, why, cites, next = '') => ({ verdict, why, cites, next });
const CASES = [
  { id: 'lantern-counter-missed', board: LANTERN, ev: EV.lanternCounter, strat: S('holds', 'The magnet still sticks to car roofs, and most campers set up beside their car, so the decision holds.', ['N1', 'S1']), want: 'object', key: ['N1', 'S2'], kind: 'calls an observed counter to the core reason "holds"' },
  { id: 'fan-anecdote-overread', board: FAN, ev: EV.fanAnecdote, strat: S('reopen', 'Bladeless fans move less air, so the quiet tower may not cool anyone; the choice should be reopened.', ['N1']), want: 'object', key: ['N1', 'S1', 'S2'], kind: 'lets one forum post reopen a decision resting on observed evidence' },
  { id: 'lantern-myth-believed', board: LANTERN, ev: EV.lanternMyth, strat: S('weaker', 'Magnets drain the battery faster, which is a real flaw in the magnetic base.', ['N1']), want: 'object', key: ['N1'], kind: 'treats an unsourced blog claim as a real flaw' },
  { id: 'fan-aside-missed', board: FAN, ev: EV.fanAside, strat: S('holds', 'Desk edges are about a different fan, so they do not bear on the quiet tower.', ['N1']), want: 'object', key: ['N1', 'A1'], kind: 'misses that the reason an option was set aside is gone' },
  { id: 'lantern-counter-missed-zh', board: LANTERN_ZH, ev: EV.lanternCounterZh, strat: S('holds', '磁铁照样能吸在车顶上，大多数人也在车旁扎营，所以决定仍然成立。', ['N1', 'S1']), want: 'object', key: ['N1'], kind: '把观察到的核心反证说成“仍然成立”（中文）' },
  { id: 'fan-anecdote-overread-zh', board: FAN_ZH, ev: EV.fanAnecdoteZh, strat: S('reopen', '无叶风扇风量小，可能根本吹不凉，应该重新考虑这个选择。', ['N1']), want: 'object', key: ['N1', 'S1', 'S2'], kind: '让一条论坛帖推翻有观察依据的决定（中文）' },
  /* written after the rule checks, on the third board, to see they are not only fitted to the cases above */
  { id: 'notes-aside-missed', board: NOTES, ev: { title: 'Retry queue rewrite: pilot sites', text: 'After the retry queue rewrite, the queue failed at none of the two pilot sites where it failed before.', weight: 'observed', rel: 'related' }, strat: S('holds', 'The retry queue is part of the cloud option, not the offline-first sync, so it does not bear on the decision.', ['N1']), want: 'object', key: ['N1', 'A1'], kind: 'misses that the reason an option was set aside is gone (held out)' },
  { id: 'notes-hearsay-overread', board: NOTES, ev: { title: 'Researcher says sync is slow', text: 'One researcher told us offline-first sync feels slow when the network returns.', weight: 'reported', rel: 'conflicts' }, strat: S('reopen', 'Sync feels slow when the network returns, so offline-first may frustrate researchers; the choice should be reopened.', ['N1']), want: 'object', key: ['N1', 'S1'], kind: 'lets one remark reopen a decision resting on observed logs (held out)' },
  { id: 'fan-support-sound', board: FAN, ev: { title: 'Test calls: tower unnoticed', text: 'In 5 test calls with the tower at full speed, no participant noticed it.', weight: 'observed', rel: 'supports' }, strat: S('stronger', 'Nobody noticed the tower in 5 test calls, which is exactly the decision\'s test.', ['N1', 'S1']), want: 'quiet', kind: 'sound reading of support (held out)' },
  { id: 'lantern-counter-sound', board: LANTERN, ev: EV.lanternCounter, strat: S('weaker', 'Most tents at two campsites had aluminium poles the magnet cannot hold, so the steel-pole half of the reason fails; car-side setups still stand.', ['N1', 'S1', 'S2'], 'Count pole materials at the next campsite visit.'), want: 'quiet', kind: 'sound reading of a counter' },
  { id: 'lantern-support-sound', board: LANTERN, ev: EV.lanternSupport, strat: S('stronger', 'Most campers stuck it to their car in about 3 seconds, which is what the decision bet on.', ['N1', 'S1']), want: 'quiet', kind: 'sound reading of support' },
  { id: 'notes-support-sound', board: NOTES, ev: EV.notesSupport, strat: S('stronger', 'The offline-first build lost no notes over 24 offline sessions, which is exactly the decision\'s test.', ['N1', 'S1']), want: 'quiet', kind: 'sound reading of support' },
  { id: 'lantern-support-sound-zh', board: LANTERN_ZH, ev: EV.lanternSupportZh, strat: S('stronger', '多数露营者 3 秒左右就把灯吸在了车上，正是这个决定押注的场景。', ['N1', 'S1']), want: 'quiet', kind: '对支持证据的合理解读（中文）' },
];
const pick = args.cases ? CASES.filter(c => String(args.cases).split(',').includes(c.id)) : CASES;

/* is a fix something to do? (the eval's own reading, the same for every build) */
const DO_EN = /\b(test|retest|re-run|rerun|run|count|ask|measure|visit|watch|observe|try|check|compare|survey|interview|call|record|prototype|add|tag|mark|link|find|list|time|weigh|verify|source|look up|log|photograph|buy|order|sample|repeat|recruit|email|contact|track|map|sketch|build|swap|replace)\b/i;
const DO_ZH = /(测|试|问|数|统计|访谈|走访|观察|记录|对比|比较|核实|查|找|标|量|计时|调研|做|原型|拍|买|联系|追踪|重复|抽样|列出|核对|验证|采访|看看.{0,4}(多少|几))/;
const actionable = (fix, zh) => { const f = String(fix || '').trim(); if (!f) return false; return zh ? DO_ZH.test(f) : DO_EN.test(f); };

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
  /* only Critic is measured: the page's own background re-check stays off */
  await p.evaluate(() => { try { AI_TIMEOUT_MS = 300000; LOCAL_AI_MS = 300000; } catch {} kickRechecks = () => {}; });
  const engine = await p.evaluate(() => connSummary().mode), build = await p.evaluate(() => typeof rcCriticReview === 'function' ? 'stepped' : 'one-call');
  let calls = 0; p.on('request', q => { if (/chat\/completions|studio\/generate/.test(q.url()) && q.method() === 'POST') calls++; });

  const rows = [];
  for (const cs of pick) for (let i = 0; i < N; i++) {
    const ids = await p.evaluate(buildBoard, [cs.board, cs.ev]);
    if (!ids.flagged) { rows.push({ case: cs.id, i, flagged: false }); console.log(`${cs.id} #${i + 1}  not flagged by board checks`); continue; }
    calls = 0; const t0 = Date.now();
    const out = await p.evaluate(async ([r, strat]) => {
      const obs = (board.watch?.queue || []).filter(o => o.kind === 'revisit' && o.target === r.dir);
      const pack = recheckPack(byId(r.dir), obs);
      if (typeof rcCriticReview === 'function') {
        const v = await rcCriticReview(pack, strat);
        if (!v) return { stance: 'no answer', pack: pack.text };
        return { stance: v.stance, criticVerdict: v.verdict || '', objection: v.objection || '', fix: v.fix || '', cites: v.cites || [], steps: v.steps || null, dropped: v.dropped || [], raw: v.raw || [], pack: pack.text };
      }
      rcRunning = { job: {} };
      const v = await rcCritic(pack, strat); const raw = rcRunning.job.rawCritic || []; rcRunning = null;
      if (!v) return { stance: 'no answer', pack: pack.text };
      const probs = rcCriticProblems(v, pack), agree = v.agree === true || String(v.agree).toLowerCase() === 'true';
      return { stance: agree ? 'agree' : probs.length ? 'dropped' : 'object', objection: v.objection || '', fix: v.fix || '', cites: rcCiteKeys(v), dropped: probs, raw, pack: pack.text };
    }, [ids, cs.strat]);
    const shown = out.stance === 'object', zh = !!cs.board.zh;
    const right = cs.want === 'object' ? shown : !shown;
    const grounded = shown && (cs.key || []).some(k => out.cites.includes(k));
    const act = shown && actionable(out.fix, zh);
    const row = { case: cs.id, kind: cs.kind, want: cs.want, i, flagged: true, ...out, shown, right, grounded, actionable: act, calls, seconds: (Date.now() - t0) / 1000 };
    rows.push(row);
    console.log(`${cs.id} #${i + 1}  ${out.stance}${right ? '' : ' (wanted ' + cs.want + ')'}${shown ? `  grounded:${grounded ? 'y' : 'n'} actionable:${act ? 'y' : 'n'}` : ''}  ${row.seconds.toFixed(0)} s, ${calls} call${calls === 1 ? '' : 's'}`);
  }
  await p.evaluate(() => store.set('.lang', 'en'));
  await b.close(); srv.close();

  const ran = rows.filter(r => r.flagged), wrong = ran.filter(r => r.want === 'object'), sound = ran.filter(r => r.want === 'quiet'), shown = ran.filter(r => r.shown);
  const pct = (a, n) => n ? Math.round(a / n * 100) + '%' : '-';
  const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const sum = {
    label: LABEL, build, engine, runs: ran.length,
    caught: wrong.filter(r => r.shown).length, wrongRuns: wrong.length,
    leftAlone: sound.filter(r => !r.shown).length, soundRuns: sound.length,
    shown: shown.length, grounded: shown.filter(r => r.grounded).length, actionable: shown.filter(r => r.actionable).length,
    goodObjections: wrong.filter(r => r.shown && r.grounded && r.actionable).length,
    dropped: ran.filter(r => (r.dropped || []).length).length, noAnswer: ran.filter(r => r.stance === 'no answer').length,
    medianSeconds: med(ran.map(r => r.seconds)), medianCalls: med(ran.map(r => r.calls)), pageErrors: errs.length,
  };
  const md = [`# Critic eval · ${LABEL} · ${build} Critic`, '', `Engine: ${engine} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${N} run(s) per case`, '',
    '| | |', '|---|---|',
    `| Wrong readings caught (objection shown) | ${sum.caught} of ${sum.wrongRuns} (${pct(sum.caught, sum.wrongRuns)}) |`,
    `| …of those, grounded and actionable | ${sum.goodObjections} of ${sum.wrongRuns} (${pct(sum.goodObjections, sum.wrongRuns)}) |`,
    `| Sound readings left alone (no objection shown) | ${sum.leftAlone} of ${sum.soundRuns} (${pct(sum.leftAlone, sum.soundRuns)}) |`,
    `| Shown objections citing the card that shows the problem | ${sum.grounded} of ${sum.shown} |`,
    `| Shown objections with a fix you can act on | ${sum.actionable} of ${sum.shown} |`,
    `| Runs where the watchdog dropped an objection | ${sum.dropped} |`,
    `| Median time / model calls per review | ${sum.medianSeconds.toFixed(0)} s / ${sum.medianCalls} |`,
    '', '## Each run', ''];
  for (const r of rows) {
    if (!r.flagged) { md.push(`### ${r.case} #${r.i + 1}: not flagged`, ''); continue; }
    md.push(`### ${r.case} #${r.i + 1}: ${r.kind} (wants: ${r.want})`, '',
      `- **Shown:** ${r.shown ? `${r.objection} · Fix: ${r.fix} · cites ${r.cites.join(', ')}` : r.stance}${r.criticVerdict ? ` · Critic's own verdict: ${r.criticVerdict} (Strategist: ${CASES.find(c => c.id === r.case).strat.verdict})` : ''}`,
      ...(r.steps ? [`- Steps: \`${JSON.stringify(r.steps).slice(0, 700)}\``] : []),
      ...(r.raw || []).map((x, k) => `- Reply ${k + 1}: \`${String(x).slice(0, 700)}\``),
      `- ${r.right ? 'right' : 'WRONG'}${r.shown ? ` · grounded: ${r.grounded ? 'yes' : 'no'} · actionable: ${r.actionable ? 'yes' : 'no'}` : ''}${(r.dropped || []).length ? ` · watchdog: ${r.dropped.join('; ')}` : ''} · ${r.seconds.toFixed(0)} s, ${r.calls} calls`, '');
  }
  fs.writeFileSync(path.join(OUT, `critic-${LABEL}.md`), md.join('\n'));
  fs.writeFileSync(path.join(OUT, `critic-${LABEL}.json`), JSON.stringify({ sum, rows }, null, 2));
  console.log('\n' + JSON.stringify(sum)); console.log(`report: ${path.join(OUT, `critic-${LABEL}.md`)}`);
})().catch(e => { console.error(e); process.exit(1); });

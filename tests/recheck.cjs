#!/usr/bin/env node
/* Crew re-check: new evidence on a decision is reasoned about, not only noticed.
 * Drives the real Vellum-Lumen.html against a scripted model endpoint (no key, no network):
 * - evidence kept after a decision is re-checked by Strategist from a numbered pack of the board's cards, and by Critic when
 *   it counters the decision or the verdict moves; one note on the decision says the verdict, why, Critic's objection and fix,
 *   the cheapest check, and that the decision stays as it is. The decision view shows the same reading.
 * - several pieces of evidence on one decision are re-checked together and shown as one note
 * - the watchdog: an answer citing cards that are not in the pack, saying it changed the decision, or in the wrong language is
 *   repaired once and otherwise replaced by the board check's own words; an objection without a fix is dropped
 * - Focus: the re-check runs quietly and its note waits for the catch-up; a crew move pre-empts it and it runs again later
 * - with no model, the board check's note comes at once and nothing is sent anywhere
 * - nothing about the decision changes on its own
 *   node tests/recheck.cjs   (from the repo root)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

/* the scripted model: each reply is picked by what the request is (strategist, critic, a repair), in order */
let script = [], requests = [];
const kindOf = flat => /Fix only these problems/.test(flat) ? 'repair' : /Strategist has re-checked/.test(flat) ? 'critic' : /re-checking a decision/.test(flat) ? 'strategist' : 'other';
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp); }
      if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
        let body = ''; req.on('data', c => body += c); req.on('end', async () => {
          const parsed = JSON.parse(body || '{}');
          if (parsed.max_tokens === 1 && !parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: '.' } }] })); }
          const flat = (parsed.messages || []).map(m => typeof m.content === 'string' ? m.content : (m.content || []).map(p => p.text || '').join(' ')).join('\n');
          const kind = kindOf(flat), i = script.findIndex(s => s.kind === kind), hit = i >= 0 ? script.splice(i, 1)[0] : null;
          requests.push({ kind, flat });
          if (hit && hit.delay) await new Promise(r => setTimeout(r, hit.delay));
          if (!hit) { rsp.writeHead(503); return rsp.end(''); }
          const txt = typeof hit.text === 'string' ? hit.text : JSON.stringify(hit.text);
          rsp.writeHead(200, { 'Content-Type': 'text/event-stream' }); rsp.on('error', () => {});
          for (let k = 0; k < txt.length; k += 40) { if (rsp.destroyed) return; rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: txt.slice(k, k + 40) } }] }) + '\n\n'); }
          if (!rsp.destroyed) rsp.end('data: [DONE]\n\n');
        }); return;
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  try {
    const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route(/wikipedia|wikimedia|openrouter|gdcvault/, r => r.abort());
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
    /* a fresh sample board with its one decision, the cloud slot pointed at the scripted model, Listening */
    const fresh = async () => p.evaluate(url => {
      abortRecheck(); board = sampleShowcase(); sel = []; renderAll();
      apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'scripted', key: 'k' }; aiPref = 'api'; setApiHealth('ok', {}); cloudBudget = { day: '', by: {} };
      setSpeak('matters'); runBoardChecks();
      const d = decisionsNow()[0]; d.dir.adoptedAt = NOW() - 3600e3; board.nodes.forEach(n => { if (n.id !== d.dir.id) { n.created = Math.min(n.created || 0, NOW() - 7200e3); n.inked = 0 } });
      return { claim: d.claim.id, dir: d.dir.id };
    }, base);
    const addEv = (r, list) => p.evaluate(([r, list]) => list.map(([type, title, text, weight, rel], i) => {
      const e = node(type, { title, text, weight }, { x: 120 + i * 40, y: 1500 + i * 320 });
      if (rel) makeRelation(e.id, r.dir, { via: 'wire' }).e.rel = rel; return e.id;
    }), [r, list]);
    /* run checks as after a pause, and wait until the queue is empty or nothing changes */
    const settle = async (max = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { await p.evaluate(() => { lastUserAct = NOW() - 60000; tickChecks(); }); await p.waitForTimeout(250); if (await p.evaluate(() => !rcRunning && !(board.watch?.queue || []).length)) break; } await p.waitForTimeout(150); };
    const pinsOn = id => p.evaluate(id => (board.pins?.[id] || []).filter(x => x.check === 'revisit'), id);
    const S = (verdict, why, cites, next = '') => ({ kind: 'strategist', text: { verdict, why, cites, next } });

    /* 1. a counter, observed: Strategist weighs it, Critic objects with a fix */
    let r = await fresh(); requests = [];
    script = [S('weaker', 'Rain hides the glow for most players, which undercuts the pager being noticed at a glance.', ['N1', 'S1'], 'Watch three players cross the rooftop in rain.'),
      { kind: 'critic', text: { agree: false, objection: 'The rain test had six players and no haptic cue, so it says the glow alone fails, not the pager.', cites: ['N1'], fix: 'Add a short wrist buzz and rerun the rain crossing.' } }];
    const [e1] = await addEv(r, [['source', 'Playtest 3: pager missed in rain', '4 of 6 missed the glow in rain.', 'observed', 'conflicts']]);
    await settle();
    let pins = await pinsOn(r.dir);
    const req1 = requests.find(q => q.kind === 'strategist')?.flat || '';
    check('the re-check reasons from a numbered pack: the decision, what it rests on, the options set aside and the new evidence', /\[D\] chosen direction/.test(req1) && /\[S1\]/.test(req1) && /\[A1\] set aside/.test(req1) && /\[N1\] observed · designer marked it as countering · Playtest 3: pager missed in rain/.test(req1), req1.slice(0, 600));
    check('Strategist, then Critic for a counter: two calls', requests.map(q => q.kind).join() === 'strategist,critic', requests.map(q => q.kind).join());
    check('one note on the decision: the verdict, why, Critic\'s objection with a fix, the cheapest check, and the decision stays', pins.length === 1 && pins[0].engine === 'model' && /\*\*weakens\*\*/.test(pins[0].note) && /Rain hides the glow/.test(pins[0].note) && /Critic: The rain test had six players.+Fix: Add a short wrist buzz/.test(pins[0].note) && /Cheapest check: Watch three players/.test(pins[0].note) && /The decision stays as you made it\./.test(pins[0].note), JSON.stringify(pins));
    check('the note cites the cards it rests on, the new evidence first among them', pins[0]?.basis?.some(x => x.id === e1) && pins[0].basis.length >= 2, JSON.stringify(pins[0]?.basis));
    check('nothing about the decision changed on its own', await p.evaluate(r => board.adopted[r.claim] === r.dir && !byId(r.dir).held, r));
    await p.evaluate(() => openDecisions(true)); await p.waitForTimeout(400);
    const dv = await p.evaluate(() => ({ h: document.querySelector('.dv-rc .dv-rc-h')?.textContent, why: document.querySelector('.dv-rc p')?.textContent, critic: document.querySelector('.dv-rc .dv-rc-c')?.textContent, acts: [...document.querySelectorAll('.dv-since .dv-act')].map(x => x.textContent).join() }));
    check('the decision view shows the crew re-check beside the new evidence, and still leaves the choice to you', /Crew re-check\s*Weaker/.test(dv.h || '') && /Rain hides/.test(dv.why || '') && /Critic.+wrist buzz/.test(dv.critic || '') && dv.acts === 'Reopen the choice,Still holds', JSON.stringify(dv));
    await p.evaluate(() => openDecisions(false));

    /* 2. two supporting pieces at once: one re-check, one note; "holds" needs no Critic */
    r = await fresh(); requests = [];
    script = [S('holds', 'Both notes agree players read the pager, but neither tests the rooftop route the decision is about.', ['N1', 'N2'])];
    await addEv(r, [['note', 'P09 liked the rim glow', 'Said the glow felt "alive".', 'reported', 'supports'], ['note', 'P11 checked the wrist often', 'Looked at the wrist 5 times in the market.', 'reported', 'supports']]);
    await settle();
    pins = await pinsOn(r.dir);
    check('two pieces of evidence on one decision: one Strategist call covering both, no Critic for "still holds"', requests.map(q => q.kind).join() === 'strategist' && /\[N2\]/.test(requests[0]?.flat || ''), requests.map(q => q.kind).join());
    check('and one note that names both', pins.length === 1 && /and 1 more/.test(pins[0].note) && /\*\*still holds\*\*/.test(pins[0].note), JSON.stringify(pins.map(x => x.note)));

    /* 3. the watchdog: a pack id that does not exist, and a claim to have changed the decision, twice: the board check speaks instead */
    r = await fresh(); requests = [];
    script = [S('reopen', 'I have reopened the decision because Z9 shows the pager fails.', ['Z9']), { kind: 'repair', text: { verdict: 'reopen', why: 'I reopened it.', cites: ['Z9'] } }];
    await addEv(r, [['source', 'Rooftop route heatmap', 'Players still took the rooftop route.', 'observed', 'conflicts']]);
    await settle();
    pins = await pinsOn(r.dir);
    const repair = requests.find(q => q.kind === 'repair')?.flat || '';
    check('a flawed answer is repaired once, naming the problems', /ids not in the pack: Z9/.test(repair) && /never that you changed anything/.test(repair), repair.slice(-400));
    check('still flawed: the board check\'s own words are shown, never the model\'s', pins.length === 1 && pins[0].engine === 'rules' && /\*\*counters\*\*/.test(pins[0].note) && !/reopened/.test(pins[0].note), JSON.stringify(pins.map(x => [x.engine, x.note])));
    check('the watchdog says why it stepped in', await p.evaluate(() => Object.values(board.watch.rc).some(j => j.status === 'fail' && /watchdog/.test(j.why))));

    /* 4. an objection without a fix is dropped; the reading stands */
    r = await fresh(); requests = [];
    script = [S('stronger', 'Players found the pager in the dark market, which is the decision\'s main reason.', ['N1', 'S1']), { kind: 'critic', text: { agree: false, objection: 'This feels too optimistic.', cites: [] } }, { kind: 'repair', text: { agree: false, objection: 'Too optimistic.', cites: [] } }];
    await addEv(r, [['source', 'Night market test', '5 of 6 found the pager in the dark market.', 'observed', 'supports']]);
    await settle();
    pins = await pinsOn(r.dir);
    check('an objection without evidence or a fix is dropped; Strategist\'s reading stands', pins.length === 1 && pins[0].engine === 'model' && /\*\*stronger\*\*/.test(pins[0].note) && !/Critic:/.test(pins[0].note), JSON.stringify(pins.map(x => x.note)));

    /* 5. Focus: runs quietly, the note waits for the catch-up */
    r = await fresh(); requests = [];
    script = [S('holds', 'The new note is about the menu, not the pager, so it does not bear on this decision.', ['N1'])];
    await p.evaluate(() => setSpeak('never'));
    await addEv(r, [['note', 'Pager menu font too small', 'Two players squinted at the pager menu.', 'reported', null]]);
    await p.evaluate(r => { const e = board.nodes.at(-1); makeRelation(e.id, r.dir, { via: 'wire' }); }, r);
    await settle(); await p.waitForTimeout(400);
    const inFocus = await p.evaluate(r => ({ pins: (board.pins?.[r.dir] || []).filter(x => x.check === 'revisit').length, job: Object.values(board.watch.rc || {}).map(j => j.status).join() }), r);
    check('in Focus the re-check runs quietly and shows nothing', inFocus.pins === 0 && inFocus.job === 'done' && requests.length === 1, JSON.stringify(inFocus));
    await p.evaluate(() => setSpeak('matters')); await p.waitForTimeout(500);
    const cu = await p.evaluate(() => ({ open: !$('catchUp').hidden, text: $('catchUp').textContent }));
    check('leaving Focus: the catch-up carries the crew\'s reading', cu.open && /does not bear on this decision/.test(cu.text) && /still holds/.test(cu.text), JSON.stringify(cu).slice(0, 300));
    await p.evaluate(() => toggleCatchUp(false));

    /* 6. a crew move pre-empts it; it runs again afterwards */
    r = await fresh(); requests = [];
    script = [{ ...S('holds', 'first try', ['N1']), delay: 3000 }, S('holds', 'The heatmap repeats what S1 already shows.', ['N1', 'S1'])];
    await addEv(r, [['source', 'Second heatmap', 'Same route as before.', 'observed', 'supports']]);
    await p.evaluate(() => { lastUserAct = NOW() - 60000; tickChecks(); }); await p.waitForTimeout(600);
    const running = await p.evaluate(() => rcRunning?.job.id || '');
    await p.evaluate(() => { preemptBackgroundAdvisors(); lastUserAct = NOW(); }); await p.waitForTimeout(400);
    const after = await p.evaluate(id => ({ running: !!rcRunning, gone: !board.watch.rc[id] }), running);
    await settle(10000);
    pins = await pinsOn(r.dir);
    check('a crew move pre-empts a running re-check, which runs again later', !!running && !after.running && after.gone && pins.length === 1 && /repeats what S1/.test(pins[0].note), JSON.stringify({ running, after, pins: pins.map(x => x.note) }));

    /* 7. Chinese: an English answer is sent back once for Chinese */
    await p.evaluate(() => store.set('.lang', 'zh'));
    r = await fresh(); requests = [];
    script = [S('weaker', 'Rain hides the glow.', ['N1']), { kind: 'repair', text: { verdict: 'weaker', why: '雨天时多数玩家看不到光晕，削弱了“一眼就能注意到”这个理由。', cites: ['N1'], next: '雨天让三名玩家走一遍屋顶路线。' } }, { kind: 'critic', text: { agree: true } }];
    await addEv(r, [['source', '雨天测试', '6 人中 4 人没看到光晕。', 'observed', null]]);
    await p.evaluate(r => { const e = board.nodes.at(-1); makeRelation(e.id, r.dir, { via: 'wire' }); }, r);
    await settle();
    pins = await pinsOn(r.dir);
    check('in Chinese, an English answer is repaired into Chinese; Critic agreeing adds nothing', /write "why" in Chinese/.test(requests.find(q => q.kind === 'repair')?.flat || '') && pins.length === 1 && /削弱/.test(pins[0].note) && /最省事的验证/.test(pins[0].note) && /决定仍按你定的来/.test(pins[0].note) && !/Critic/.test(pins[0].note), JSON.stringify(pins.map(x => x.note)));
    await p.evaluate(() => store.set('.lang', 'en'));

    /* 8. no model: the board check speaks at once, nothing is sent */
    r = await fresh(); requests = []; script = [];
    await p.evaluate(() => { aiPref = 'local'; });
    await addEv(r, [['source', 'Rain test again', 'Still missed.', 'observed', 'conflicts']]);
    await settle(3000);
    pins = await pinsOn(r.dir);
    check('with AI models off, the board check\'s note comes at once and no request is made', pins.length === 1 && pins[0].engine === 'rules' && requests.length === 0, JSON.stringify({ pins: pins.map(x => x.engine), n: requests.length }));

    check('no page errors', !errs.length, errs.join(' | '));
  } finally { await b.close(); srv.close(); }
  console.log(results.join('\n')); console.log(`\n${results.length - failures}/${results.length} passed`); process.exit(failures ? 1 : 0);
})();

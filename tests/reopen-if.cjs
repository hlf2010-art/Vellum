#!/usr/bin/env node
/* Reopen if: a pre-mortem kept on the decision.
 * - Adopting a direction gives it signs that would make the choice worth reopening. With no model they come from the board
 *   (the weakest cards it rests on, the reasons the other options were set aside) and say so; with a model the Critic writes
 *   them from a pre-mortem, citing the cards, and the watchdog drops signs that cite nothing.
 * - The signs are yours: typed in place, added, removed, all undoable and logged. Adopting again after going back keeps them.
 * - New evidence that counters the card a sign is about hits it for certain: the decision says "Hit a reopen sign", the entry
 *   gets a red dot (not in Focus), the sign names the evidence, the board check's note says which sign. Evidence that only
 *   shares words "may touch" a sign; with a model the Critic says yes or no during the re-check.
 * - Still holds folds the hit away; nothing about the decision changes on its own.
 *   node tests/reopen-if.cjs   (from the repo root)      SHOTS=dir also saves screenshots (light/dark, en/zh)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }
let script = [], requests = [];
const kindOf = f => /Fix only these problems/.test(f) ? 'repair' : /Run a pre-mortem/.test(f) ? 'premortem' : /wrote signs that would make them reopen/.test(f) ? 'signs' : /Strategist has re-checked/.test(f) ? 'critic' : /re-checking a decision/.test(f) ? 'strategist' : 'other';
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp); }
      if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
        let body = ''; req.on('data', c => body += c); req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          if (parsed.max_tokens === 1 && !parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: '.' } }] })); }
          const flat = (parsed.messages || []).map(m => typeof m.content === 'string' ? m.content : '').join('\n');
          const kind = kindOf(flat), i = script.findIndex(s => s.kind === kind), hit = i >= 0 ? script.splice(i, 1)[0] : null;
          requests.push({ kind, flat });
          if (!hit) { rsp.writeHead(503); return rsp.end(''); }
          const txt = typeof hit.text === 'string' ? hit.text : JSON.stringify(hit.text);
          rsp.writeHead(200, { 'Content-Type': 'text/event-stream' });
          rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: txt } }] }) + '\n\n'); rsp.end('data: [DONE]\n\n');
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
    const settle = async (max = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { await p.evaluate(() => { lastUserAct = NOW() - 60000; tickChecks(); }); await p.waitForTimeout(250);
      if (await p.evaluate(() => !rcRunning && !pmBusy && !(board.watch?.queue || []).length && !board.nodes.some(n => n.premortem))) break; } await p.waitForTimeout(150); };
    /* the sample board, no model; its decision re-made now, with a reason for the option set aside */
    const fresh = async (model) => p.evaluate(([url, model]) => {
      abortRecheck(); board = sampleShowcase(); sel = []; renderAll();
      if (model) { apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'scripted', key: 'k' }; aiPref = 'api'; setApiHealth('ok', {}); cloudBudget = { day: '', by: {} } }
      else { apiCfg = { enabled: false, baseUrl: '', model: '', key: '' }; aiPref = 'local' }
      setSpeak('matters'); runBoardChecks();
      const d = decisionsNow()[0], a = board.nodes.find(n => n.type === 'direction' && n.idea === d.claim.id && n.letter === 'A');
      a.whyNot = 'Corner toasts were missed by 9 of 12.';
      board.nodes.forEach(n => { n.created = Math.min(n.created || 0, NOW() - 7200e3); n.inked = 0 });
      goBack(d.claim); adopt(byId(d.dir.id)); renderAll();
      return { claim: d.claim.id, dir: d.dir.id, a: a.id };
    }, [base, model]);
    const open = async () => { await p.evaluate(() => { openDecisions(true) }); await p.waitForTimeout(400); };
    const signs = id => p.evaluate(id => (byId(id).reopenIf || []).map(s => ({ text: s.text, by: s.by, engine: s.engine, from: s.from, hits: (s.hits || []).length })), id);
    const ui = () => p.evaluate(() => ({ k: document.querySelector('.dv-ri .dv-k')?.textContent, rows: [...document.querySelectorAll('.dv-sign:not(.add) textarea')].map(t => t.value),
      by: [...document.querySelectorAll('.dv-sign .dv-by')].map(x => x.textContent), add: !!document.querySelector('.dv-sign.add textarea'), st: document.querySelector('.dv-st')?.textContent || '',
      hit: document.querySelector('.dv-sign.hit .dv-hit span')?.textContent || '', maybe: document.querySelector('.dv-sign.maybe .dv-hit span')?.textContent || '', pm: !!document.querySelector('.dv-pm'),
      dot: !$('decBtn').querySelector('.dec-dot').hidden, red: $('decBtn').querySelector('.dec-dot').classList.contains('ctr') }));

    /* 1. no model: the board's own signs */
    let r = await fresh(false); await open();
    let s = await signs(r.dir), u = await ui();
    check('adopting with no model gives signs read off the board, labelled as such', s.length >= 2 && s.every(x => x.engine === 'rules' && x.by === 'critic') && u.k === 'Reopen if' && u.by.every(x => x === 'Board'), JSON.stringify({ s, u }));
    check('one sign is the reason the other option was set aside', s.some(x => x.from === r.a && /Corner toasts were missed by 9 of 12/.test(x.text)), JSON.stringify(s));
    check('one sign is a card the decision rests on that is not observed', await p.evaluate(sg => sg.some(x => x.from && byId(x.from) && byId(x.from).type !== 'direction' && byId(x.from).weight !== 'observed'), s), JSON.stringify(s));
    check('there is a row to add your own, and no status word yet', u.add && u.st === '' && !u.dot, JSON.stringify(u));

    /* 2. yours: add, edit, remove, undo */
    await p.click('.dv-sign.add textarea'); await p.keyboard.type('Two playtesters ask what the wrist glow means.'); await p.keyboard.press('Enter'); await p.waitForTimeout(350);
    s = await signs(r.dir);
    check('a sign typed in the add row is kept as yours and logged', s.some(x => x.by === 'you' && x.text === 'Two playtesters ask what the wrist glow means.') && await p.evaluate(id => (board.changes || []).some(c => c.op === 'reopen-if' && c.id === id && c.who === 'you'), r.dir), JSON.stringify(s));
    await p.evaluate(() => undo()); await p.waitForTimeout(300);
    check('Undo takes it back', !(await signs(r.dir)).some(x => x.by === 'you'));
    const n0 = (await signs(r.dir)).length;
    await p.hover('.dv-sign:not(.add)'); await p.click('.dv-sign:not(.add) .dv-sx'); await p.waitForTimeout(300);
    check('× removes a sign, Undo brings it back', (await signs(r.dir)).length === n0 - 1 && await (async () => { await p.evaluate(() => undo()); await p.waitForTimeout(300); return (await signs(r.dir)).length === n0; })());
    await p.click('.dv-sign:not(.add) textarea'); await p.keyboard.press('ControlOrMeta+a'); await p.keyboard.type('half'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    check('Esc in a sign puts it back', (await signs(r.dir))[0].text !== 'half');

    /* 3. a counter to the card a sign is about hits it */
    const fromId = (await signs(r.dir)).find(x => x.from && x.from !== r.a).from;
    const e1 = await p.evaluate(fromId => { const e = node('source', { title: 'Playtest 4: the pager cue read as a battery light', text: '5 of 8 thought it meant low battery.', weight: 'observed' }, { x: 120, y: 1600 }); makeRelation(e.id, fromId, { via: 'wire' }).e.rel = 'conflicts'; renderAll(); return e.id; }, fromId);
    await settle(); await open(); u = await ui();
    check('evidence countering the card a sign rests on hits the sign: the decision says so and the entry gets a red dot', u.st === 'Hit a reopen sign' && u.dot && u.red && /battery light/.test(u.hit), JSON.stringify(u));
    check('the evidence shows under New since you decided', await p.evaluate(id => [...document.querySelectorAll('.dv-since .dv-row')].some(x => x.dataset.dvGo === id), e1));
    check('the board check note names the sign it hits', await p.evaluate(id => (board.pins?.[id] || []).some(x => /hits a sign you said would reopen it/.test(x.note)), r.dir));
    check('nothing about the decision changed on its own', await p.evaluate(r => board.adopted[r.claim] === r.dir, r));
    check('in Focus the entry shows no dot', await p.evaluate(() => { const prev = crewSpeak; crewSpeak = 'never'; $('decBtn')._sig = ''; renderDecBtn(); const hid = $('decBtn').querySelector('.dec-dot').hidden; crewSpeak = prev; $('decBtn')._sig = ''; renderDecBtn(); return hid; }));
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true });
      for (const [theme, lang] of [['light', 'en'], ['dark', 'en'], ['light', 'zh'], ['dark', 'zh']]) {
        /* the board's own signs are written in the language of the moment: write them again in it, keeping the hit */
        await p.evaluate(([t, l]) => { document.documentElement.dataset.theme = t; store.set('.lang', l); const d = byId(decisionsNow()[0].dir.id), old = d.reopenIf;
          d.reopenIf = reopenSeedRules(d).map(s => ({ ...s, hits: (old.find(o => o.from === s.from) || {}).hits })); $('decBtn')._sig = ''; renderAll(); renderDecisions(); }, [theme, lang]);
        await p.mouse.move(5, 890); await p.waitForTimeout(500);
        const box = await p.evaluate(() => { const el = document.querySelector('.dv-ri').closest('.dv-dec'); el.scrollIntoView({ block: 'start' }); const r = $('decPanel').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-1-hit.png`), clip: box });
      }
      await p.evaluate(() => { delete document.documentElement.dataset.theme; store.set('.lang', 'en'); renderAll(); renderDecisions(); });
    }
    await p.click('[data-dv-hold]'); await p.waitForTimeout(200); await p.keyboard.press('Enter'); await p.waitForTimeout(400); u = await ui();
    check('Still holds folds the hit away', u.st === '' && !u.hit, JSON.stringify(u));

    /* 4. shared words only: may touch */
    await p.evaluate(() => { const e = node('note', { title: 'Corner toasts missed again in the second session', text: 'Corner toasts were missed by most players.', weight: 'reported' }, { x: 120, y: 2000 }); renderAll(); });
    await settle(); await open(); u = await ui();
    check('evidence that only shares words may touch a sign, said softly', u.st === 'May touch a reopen sign' && /^May touch/.test(u.maybe) && u.dot && !u.red, JSON.stringify(u));

    /* 5. a model: the Critic's pre-mortem, and a yes or no on word matches */
    requests = [];
    script = [{ kind: 'premortem', text: { signs: [{ sign: 'Players in rain miss the pager cue in more than half of crossings.', cites: ['S1'] }, { sign: 'Testers say the wrist feels like a HUD bolted on.', cites: ['A1'] }, { sign: 'Nothing cited here', cites: [] }] } },
      { kind: 'repair', text: { signs: [{ sign: 'Players in rain miss the pager cue in more than half of crossings.', cites: ['S1'] }, { sign: 'Testers say the wrist feels like a HUD bolted on.', cites: ['A1'] }] } }];
    r = await fresh(true); await open();
    check('with a model, the panel says the Critic is at work until the signs arrive', (await ui()).pm);
    await settle(); s = await signs(r.dir); u = await ui();
    check('the Critic writes the signs from a pre-mortem; one citing nothing is repaired away by the watchdog', s.length === 2 && s.every(x => x.engine === 'model') && u.by.every(x => x === 'Critic') && requests.some(q => q.kind === 'premortem') && requests.some(q => q.kind === 'repair'), JSON.stringify({ s, u, k: requests.map(q => q.kind) }));
    check('a sign citing an option set aside is hit by support for that option', s.some(x => x.from === r.a), JSON.stringify(s));
    script = [{ kind: 'strategist', text: { verdict: 'weaker', why: 'Rain hides the cue for most players.', cites: ['N1'], next: '' } }, { kind: 'critic', text: { agree: true } }, { kind: 'signs', text: { pairs: [{ id: 'P1', hit: true, why: 'The rain run is exactly the sign.' }] } }];
    await p.evaluate(() => { node('note', { title: 'Rain run: players miss the pager cue in crossings', text: 'In rain, most players miss the pager cue in crossings.', weight: 'observed' }, { x: 120, y: 2400 }); renderAll(); });
    await settle(9000); await open(); u = await ui();
    check('the Critic says yes to a word match during the re-check: the sign is hit for certain', requests.some(q => q.kind === 'signs') && u.st === 'Hit a reopen sign' && /pager cue/.test(u.hit), JSON.stringify({ u, k: requests.map(q => q.kind) }));
    script = [{ kind: 'strategist', text: { verdict: 'holds', why: 'It is about a different screen.', cites: ['N1'], next: '' } }, { kind: 'signs', text: { pairs: [{ id: 'P1', hit: false, why: 'Different screen.' }] } }];
    const before = (await signs(r.dir)).reduce((a, x) => a + x.hits, 0);
    await p.evaluate(() => { holdDecision(byId(decisionsNow()[0].dir.id), ''); node('note', { title: 'Testers say the menu feels like a HUD', text: 'Testers say the pause menu feels like a HUD bolted on.', weight: 'reported' }, { x: 120, y: 2800 }); renderAll(); });
    await settle(9000); u = await ui();
    check('a no from the Critic drops the word match (the evidence is still new, but no sign is touched)', !/reopen sign/.test(u.st) && !u.maybe && !u.hit && await p.evaluate(id => byId(id).reopenIf.flatMap(s => s.hits || []).filter(h => h.no).length >= 1, r.dir), JSON.stringify({ u, k: requests.map(q => q.kind) }));

    /* 6. adopting again keeps your signs; Chinese */
    await p.evaluate(r => { const d = byId(r.dir); d.reopenIf = [{ id: 'ri-x', text: 'Mine', by: 'you', engine: 'human', t: NOW() }]; goBack(byId(r.claim)); adopt(d); }, r);
    check('adopting again after going back keeps your signs', (await signs(r.dir)).map(x => x.text).join() === 'Mine');
    await p.evaluate(() => { store.set('.lang', 'zh'); renderAll(); renderDecisions(); }); await p.waitForTimeout(300);
    check('Chinese label', await p.evaluate(() => document.querySelector('.dv-ri .dv-k')?.textContent === '出现这些就重开'));
    await p.evaluate(() => { store.set('.lang', 'en'); });
    check('no page errors', !errs.length, errs.join(' | '));
  } finally { await b.close(); srv.close(); }
  console.log(results.join('\n')); console.log(`\n${results.length - failures}/${results.length} passed`); process.exit(failures ? 1 : 0);
})();

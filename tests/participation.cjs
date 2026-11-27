#!/usr/bin/env node
/* How much the crew joins in, per board: Focus · Listening · Teamwork.
 * The switch in the top bar, its shortcut, each board keeping its own level, Focus keeping the crew quiet while board
 * checks wait, the one catch-up when you leave Focus, Listening's single quiet dot after a pause, Teamwork's two, board
 * checks that need no model (new evidence against a decision, a decision with no evidence) labelled as board checks,
 * and cards you kept changing only when you accept. Drives the real Vellum-Lumen.html against a scripted model endpoint.
 *
 *   node tests/participation.cjs            (from the repo root)
 *   node tests/participation.cjs --headed   (watch it)
 *   SHOTS=dir node tests/participation.cjs  (also save light and dark screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
let modelUp = true; const requests = [];
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

const PIN_JSON = JSON.stringify({ keywords: ['lantern', 'battery'], thoughts: ['Reading the card', 'Checking the claim', 'Leaving a note'], basis: [], related: [], pins: [{ agent: 'critic', note: 'Is **40 hours** measured or hoped for?', liftAct: 'note', liftLabel: 'Draft a check' }] });
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp); }
      if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
        let body = ''; req.on('data', c => body += c); req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          const flat = (parsed.messages || []).map(m => typeof m.content === 'string' ? m.content : (m.content || []).map(p => p.text || '').join(' ')).join('\n');
          requests.push({ full: flat, advisor: /Include 1 or at most 2 pins/.test(flat) });
          if (!modelUp) { rsp.writeHead(402, { 'Content-Type': 'application/json' }); return rsp.end('{"error":{"message":"Insufficient credits"}}'); }
          if (parsed.max_tokens === 1 && !parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: '.' } }] })); }
          const text = /Include 1 or at most 2 pins/.test(flat) ? PIN_JSON : 'An answer.';
          if (!parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: text } }] })); }
          rsp.writeHead(200, { 'Content-Type': 'text/event-stream' });
          for (let k = 0; k < text.length; k += 40) rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text.slice(k, k + 40) } }] }) + '\n\n');
          rsp.end('data: [DONE]\n\n');
        }); return;
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function open(browser, base, { theme = 'light', live = false } = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, deviceScaleFactor: SHOTS ? 2 : 1 });
  await c.route('http://127.0.0.1:59631/**', r => r.abort());
  await c.route(/wikipedia\.org|wikimedia\.org/, r => r.abort());
  const p = await c.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
  if (live) await p.evaluate(url => { SCOUT_GROUNDING = false; apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'smoke', key: 'smoke' }; renderCrew(); }, base);
  /* short pauses so the test does not wait for real ones */
  await p.evaluate(() => { IDLE_NEED.matters = 250; IDLE_NEED.often = 150; SPEAK_QUIET.matters = 200; SPEAK_QUIET.often = 150; advQuietMs = 200; advMaxWaitMs = 1500; advSpent = []; });
  p.newBoard = async () => { await p.click('#projectBtn'); await p.waitForTimeout(300); await p.locator('#boardsPop [data-new]').click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700); };
  p.openBoard = async title => { await p.click('#projectBtn'); await p.waitForTimeout(300); await p.locator('#boardsPop .bp-row', { hasText: title }).first().click(); await p.waitForTimeout(700); };
  p.rename = t => p.evaluate(t => { board.title = t; renderAll(); persistNow(); }, t);
  p.sw = () => p.evaluate(() => [...document.querySelectorAll('#partSw [data-part]')].map(b => b.dataset.part + (b.getAttribute('aria-checked') === 'true' ? '*' : '')).join(','));
  /* a board with one decision: a claim, an adopted direction, and observed evidence under it */
  p.decisionBoard = () => p.evaluate(() => {
    const claim = node('idea', { text: 'Campers want a lantern that lasts a whole weekend on one charge' }, { x: 0, y: 0 });
    const dir = node('direction', { idea: claim.id, letter: 'A', title: 'A · Big battery lantern', text: 'Double the battery so it runs 40 hours.', test: 'Runs 40 hours in a cold tent', mode: 'story' }, { x: 460, y: 0 });
    edge(claim.id, dir.id, 'derive', 'live');
    const ev = node('source', { title: 'Field test: 3 lanterns died overnight at 2°C', text: 'Observed on a cold night: batteries lost half their charge.', weight: 'observed' }, { x: -460, y: 0 });
    edge(ev.id, claim.id, 'src', 'live');
    board.adopted[claim.id] = dir.id; renderAll(); persistNow();
    runBoardChecks(); /* the first look learns what is there */
    return { claim: claim.id, dir: dir.id };
  });
  p.addEvidence = (dirId, { rel = 'conflicts', weight = 'observed', title = 'Interview: campers mostly charge from the car' } = {}) => p.evaluate(({ dirId, rel, weight, title }) => {
    const e = node('source', { title, text: 'Five of six campers said they charge everything from the car every evening.', weight }, { x: -460, y: 360 + Math.random() * 300 });
    if (rel) makeRelation(e.id, dirId, { rel }); renderAll(); persist(); return e.id;
  }, { dirId, rel, weight, title });
  p.checkPins = () => p.evaluate(() => Object.entries(board.pins || {}).flatMap(([id, ps]) => (ps || []).filter(x => x.check).map(x => ({ on: id, kind: x.check, seen: !!x.seen, note: x.note, engine: x.engine, rel: x.basis?.[0]?.relation }))));
  p.settle = (ms = 1600) => p.waitForTimeout(ms);
  return p;
}

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    /* ── P1. the switch ─────────────────────────────────────────────────── */
    const p = await open(browser, base);
    await p.newBoard(); await p.rename('Lantern');
    check('the switch has three levels and a new board starts on Listening', await p.sw() === 'never,matters*,often' && await p.evaluate(() => board.speak === 'matters' && crewSpeak === 'matters'), await p.sw());
    check('it is a radio group with names: Focus, Listening, Teamwork', await p.evaluate(() => { const s = $('partSw'); return s.getAttribute('role') === 'radiogroup' && [...s.querySelectorAll('[role="radio"]')].map(b => b.querySelector('.part-l').textContent).join('|') === 'Focus|Listening|Teamwork'; }));
    await p.waitForTimeout(600);
    check('only the chosen level shows its name (after the transition)', await p.evaluate(() => [...document.querySelectorAll('#partSw .part-l')].map(s => s.getBoundingClientRect().width > 10 ? 1 : 0).join('')) === '010');
    await p.click('#partSw [data-part="often"]'); await p.waitForTimeout(500);
    check('choosing Teamwork takes effect: talkative, drafted follow-ups', await p.sw() === 'never,matters,often*' && await p.evaluate(() => crewSpeak === 'often' && advisorMode && advisorAuto && board.speak === 'often'));
    check('the crew popover does not repeat the switch', await p.evaluate(() => { toggleCrewPop(true); const t = $('crewPop').innerText; const ok = !document.querySelector('#crewPop [data-crew-speak]') && !/Focus|Listening|Teamwork|Joins in/.test(t) && /Cards you kept change only when you accept/.test(t); toggleCrewPop(false); return ok; }));
    await p.keyboard.press('Meta+Shift+Period'); await p.waitForTimeout(400);
    check('⌘⇧. turns Focus on', await p.evaluate(() => crewSpeak === 'never' && !advisorMode && document.body.classList.contains('is-focus')));
    await p.keyboard.press('Meta+Shift+Period'); await p.waitForTimeout(400);
    check('⌘⇧. again goes back to where you were (Teamwork), not to a default', await p.evaluate(() => crewSpeak === 'often'));
    await p.keyboard.press('Control+Shift+Period'); await p.waitForTimeout(300);
    check('Ctrl⇧. works too', await p.evaluate(() => crewSpeak === 'never'));
    await p.keyboard.press('Control+Shift+Period'); await p.waitForTimeout(300);
    await p.keyboard.press('Meta+Period'); await p.waitForTimeout(400);
    check('⌘. still opens Copilot', await p.evaluate(() => copilotOpen && crewSpeak === 'often'));
    await p.evaluate(() => openCopilot(false));
    await p.focus('#partSw [data-part="often"]'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(300);
    check('arrow keys move along the switch', await p.evaluate(() => crewSpeak === 'matters' && document.activeElement?.dataset.part === 'matters'));
    /* custom permissions are not reset by changing how much the crew joins in */
    await p.evaluate(() => setAutonomy({ link: 'never' }));
    await p.click('#partSw [data-part="often"]'); await p.waitForTimeout(200);
    check('changing level keeps custom permissions', await p.evaluate(() => autonomyCustom && perm('link') === 'never'));
    check('on every level, edits and deletions of kept cards stay suggestions', await p.evaluate(() => SPEAK_LEVELS.every(l => { setSpeak(l); return perm('edit') === 'suggest' && perm('delete') === 'suggest'; })));
    await p.evaluate(() => { setAutonomy(presetFor(crewAct)); setSpeak('matters'); });

    /* ── P2. each board keeps its own level ─────────────────────────────── */
    await p.evaluate(() => setSpeak('never'));
    await p.newBoard(); await p.rename('Desk fan');
    check('a new board starts on Listening even if the last board was in Focus', await p.evaluate(() => crewSpeak === 'matters' && board.speak === 'matters' && !document.body.classList.contains('is-focus')));
    await p.evaluate(() => setSpeak('often'));
    await p.openBoard('Lantern');
    check('opening Lantern brings back its Focus', await p.evaluate(() => crewSpeak === 'never' && !advisorMode && document.body.classList.contains('is-focus')) && await p.sw() === 'never*,matters,often');
    await p.openBoard('Desk fan');
    check('and Desk fan its Teamwork', await p.evaluate(() => crewSpeak === 'often' && advisorAuto) && await p.sw() === 'never,matters,often*');
    check('the level is saved with the board', await p.evaluate(() => { const l = store.get('.list', []); const g = t => store.get('.board.' + l.find(b => b.title === t).id, null)?.speak; return g('Lantern') === 'never' && g('Desk fan') === 'often'; }));
    await p.openBoard('Lantern'); await p.evaluate(() => setSpeak('matters'));

    /* ── P3. Listening, no model: board checks, one quiet dot after a pause ─ */
    await p.newBoard(); await p.rename('Checks');
    const D = await p.decisionBoard();
    check('an existing decision with evidence raises nothing on the first look', (await p.checkPins()).length === 0 && await p.evaluate(() => !board.watch.queue.length));
    await p.evaluate(() => { lastUserAct = NOW() + 60000; });  /* the designer keeps working */
    await p.addEvidence(D.dir, { rel: 'conflicts' });
    await p.settle(1800);
    check('nothing appears while you are still working', (await p.checkPins()).length === 0 && await p.evaluate(() => board.watch.queue.length === 1));
    await p.evaluate(() => { lastUserAct = NOW() - 10000; }); await p.settle(1500);
    let pins = await p.checkPins();
    check('once you pause, one dot lands on the decision it is about', pins.length === 1 && pins[0].on === D.dir && pins[0].kind === 'revisit' && !pins[0].seen, JSON.stringify(pins));
    check('it says the evidence counters the decision and that the decision stays yours', /counters/.test(pins[0]?.note) && /decision stays as you made it/.test(pins[0]?.note) && pins[0]?.rel === 'conflicts', pins[0]?.note);
    check('the card shows an unread dot and nothing opens by itself', await p.evaluate(id => !!document.querySelector(`[data-adv-pin="${id}"] .adv-dot`) && !openAdvNodeId && $('advPop').hidden, D.dir));
    await p.evaluate(id => toggleAdvPop(id), D.dir); await p.waitForTimeout(300);
    const pop = await p.evaluate(() => ({ t: $('advPop').innerText, tag: $('advPop').querySelector('.adv-eng')?.textContent, tip: $('advPop').querySelector('.adv-eng')?.title, reroll: !!$('advPop').querySelector('[data-adv-reroll]') }));
    check('opened, it is labelled a board check, not a model\'s thought, with no fresh-angle button', pop.tag === 'board check' && !pop.reroll && /No AI model wrote this/.test(pop.tip) && /Based on/.test(pop.t) && /Conflicts/.test(pop.t), JSON.stringify(pop));
    await p.evaluate(() => closeAdvPop());
    /* Listening holds the next one while one is unread */
    await p.evaluate(id => { board.pins[id].forEach(x => x.seen = false); }, D.dir);
    const e2 = await p.addEvidence(D.dir, { rel: 'supports', title: 'Logger: lantern ran 41 hours at 20°C' });
    await p.evaluate(() => { lastUserAct = NOW() - 10000; }); await p.settle(1800);
    check('Listening: no second dot while the first is unread', (await p.checkPins()).length === 1 && await p.evaluate(() => board.watch.queue.length === 1));
    await p.evaluate(id => { board.pins[id].forEach(x => x.seen = true); persist(); }, D.dir); await p.evaluate(() => { lastUserAct = NOW() - 10000; }); await p.settle(1800);
    pins = await p.checkPins();
    check('read it, and the next one comes', pins.length === 2 && pins.some(x => x.rel === 'supports' && /supports/.test(x.note)), JSON.stringify(pins.map(x => x.rel)));
    /* Ignore: gone, not a declined idea, and it does not come back */
    const decl0 = await p.evaluate(() => (board.declined || []).length);
    await p.evaluate(id => { const x = board.pins[id].find(q => q.check); dismissAdvPin(id, x.id); }, D.dir);
    await p.evaluate(() => { runBoardChecks(); lastUserAct = NOW() - 10000; }); await p.settle(1200);
    check('Ignore removes a board check, records no declined idea, and it does not come back', (await p.checkPins()).length === 1 && await p.evaluate(n => (board.declined || []).length === n, decl0));
    /* a decision with no evidence under it */
    const D2 = await p.evaluate(() => {
      const claim = node('idea', { text: 'Campers will pay more for a solar lid' }, { x: 0, y: 900 });
      const dir = node('direction', { idea: claim.id, letter: 'B', title: 'B · Solar lid', text: 'A solar panel lid that tops up the battery.', test: 'Adds 2 hours a day', mode: 'story' }, { x: 460, y: 900 });
      edge(claim.id, dir.id, 'derive', 'live'); board.adopted[claim.id] = dir.id;
      Object.values(board.pins).flat().forEach(x => x.seen = true); renderAll(); persist(); lastUserAct = NOW() - 10000; return { dir: dir.id };
    });
    await p.settle(2000);
    pins = await p.checkPins();
    check('a decision resting on assumptions only is flagged once', pins.filter(x => x.kind === 'assume' && x.on === D2.dir).length === 1 && /assumptions only/.test(pins.find(x => x.kind === 'assume')?.note || ''), JSON.stringify(pins.map(x => x.kind)));
    check('no model was asked for any of this', requests.length === 0, String(requests.length));
    if (SHOTS) { await p.evaluate(id => { const n = byId(id); focusNodes([n], 1, 0); }, D.dir); await p.waitForTimeout(800); await p.screenshot({ path: path.join(SHOTS, 'light-2-listening-dot.png') }); }

    /* ── P4. Focus: quiet, checks wait, one catch-up when you come back ──── */
    await p.evaluate(() => { board.pins = {}; renderAll(); persist(); });
    await p.click('#partSw [data-part="never"]'); await p.waitForTimeout(400);
    await p.evaluate(() => { board.focusAt = NOW() - 25 * 60000; lastUserAct = NOW() - 60000; });
    await p.addEvidence(D.dir, { rel: 'conflicts', title: 'Playtest: campers left the lantern on the car charger' });
    await p.addEvidence(D.dir, { rel: 'related', weight: 'reported', title: 'Forum: a weekend is two nights, not three' });
    await p.evaluate(() => { const n = node('note', { text: 'Sketch: handle doubles as a hook' }, { x: 900, y: 500 }); renderAll(); persist(); });
    await p.settle(2200);
    check('Focus: nothing lands on the board, the checks wait', (await p.checkPins()).length === 0 && await p.evaluate(() => board.watch.queue.length >= 2), await p.evaluate(() => board.watch.queue.length));
    check('Focus: the crew is dimmed and pins would be hidden', await p.evaluate(() => document.body.classList.contains('is-focus') && getComputedStyle(document.querySelector('#crewSetBtn .hub-mks')).opacity < .9));
    await p.click('#partSw [data-part="matters"]'); await p.waitForTimeout(900);
    const cu = await p.evaluate(() => ({ open: catchUpOpen && !$('catchUp').hidden, head: $('catchUp').querySelector('.cu-head b')?.textContent, when: $('catchUp').querySelector('.cu-head small')?.textContent, items: [...document.querySelectorAll('#catchUp [data-cu-go]')].map(b => b.innerText), foot: $('catchUp').querySelector('.cu-foot small')?.textContent }));
    pins = await p.checkPins();
    check('leaving Focus opens one catch-up, not a burst of popups', cu.open && /While you focused, I noticed \d+ things?/.test(cu.head) && cu.items.length >= 2 && cu.items.length === pins.length, JSON.stringify(cu));
    check('it says how long you focused', /25 min of focus/.test(cu.when || ''), cu.when);
    check('it is honest that no model read the new cards', /No AI model is connected, so the crew did not read your new cards/.test(cu.foot || ''), cu.foot);
    check('everything it lists is also pinned on its card, past the usual one-at-a-time rule', pins.length >= 2 && pins.every(x => !x.seen));
    check('the counter-evidence comes first', /counters/.test(cu.items[0] || ''), cu.items[0]);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'light-3-catch-up.png') });
    await p.locator('#catchUp [data-cu-go]').first().click(); await p.waitForTimeout(900);
    check('clicking an item flies to its card and opens that thought', await p.evaluate(id => openAdvNodeId === id && sel.includes(id), D.dir) && await p.evaluate(() => catchUpOpen));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    check('Esc closes the catch-up first', await p.evaluate(() => !catchUpOpen));
    /* nothing to say: a short toast, no panel */
    await p.evaluate(() => { setSpeak('never'); });
    await p.waitForTimeout(200); await p.evaluate(() => setSpeak('matters')); await p.waitForTimeout(400);
    check('leaving Focus with nothing new shows a short toast and no panel', await p.evaluate(() => !catchUpOpen && [...document.querySelectorAll('.toast')].some(t => /Nothing came up while you focused/.test(t.textContent))));
    check('no page errors (no model)', p.errors.length === 0, p.errors.join(' | '));
    await p.context().close();

    /* ── P5. with a model: Focus asks nothing, the crew looks after you come back ─ */
    const q = await open(browser, base, { live: true });
    await q.newBoard(); await q.rename('Live');
    await q.evaluate(() => setSpeak('never'));
    const before = requests.filter(r => r.advisor).length;
    await q.evaluate(() => { for (const t of ['Lantern runs 40 hours on one charge', 'Handle doubles as a tent hook']) { const n = node('note', { text: t }, { x: Math.random() * 600, y: Math.random() * 400 }); scheduleAdvisor(n.id, { delay: 50 }); } renderAll(); persist(); lastUserAct = NOW() - 60000; });
    await q.settle(2200);
    check('Focus: no unasked look goes to the model', requests.filter(r => r.advisor).length === before);
    await q.click('#partSw [data-part="matters"]'); await q.waitForTimeout(400);
    check('with nothing for board checks, a toast says the crew will look at what you added', await q.evaluate(() => [...document.querySelectorAll('.toast')].some(t => /will look at the 2 cards you added/.test(t.textContent))));
    await q.evaluate(() => { lastUserAct = NOW() - 60000; });
    for (let i = 0; i < 30 && requests.filter(r => r.advisor).length === before; i++) await q.waitForTimeout(200);
    for (let i = 0; i < 30 && !(await q.evaluate(() => Object.values(board.pins || {}).flat().some(p => !p.check))); i++) await q.waitForTimeout(200);
    check('and one look goes out for the lot, after you come back', requests.filter(r => r.advisor).length === before + 1, String(requests.filter(r => r.advisor).length - before));
    check('it lands as a dot, with no thinking bubble in Listening', await q.evaluate(() => Object.values(board.pins || {}).flat().some(p => !p.check && p.engine === 'model') && document.body.classList.contains('adv-quiet')));
    /* Listening waits for a pause before it looks */
    await q.evaluate(() => { board.pins = {}; lastUserAct = NOW() + 60000; renderAll(); });
    const b2 = requests.filter(r => r.advisor).length;
    await q.evaluate(() => { const n = node('note', { text: 'Ship with a USB-C port and a lid light' }, { x: 300, y: 600 }); scheduleAdvisor(n.id, { delay: 50 }); renderAll(); persist(); });
    await q.settle(1500);
    check('Listening: no look while you keep working', requests.filter(r => r.advisor).length === b2);
    await q.evaluate(() => { lastUserAct = NOW() - 60000; });
    for (let i = 0; i < 30 && requests.filter(r => r.advisor).length === b2; i++) await q.waitForTimeout(200);
    check('and it looks once you pause', requests.filter(r => r.advisor).length === b2 + 1);
    check('no page errors (live)', q.errors.length === 0, q.errors.join(' | '));
    await q.context().close();

    /* ── P6. Chinese UI ──────────────────────────────────────────────────── */
    const z = await open(browser, base);
    await z.evaluate(() => { store.set('.lang', 'zh'); }); await z.reload(); await z.waitForTimeout(2200); await z.evaluate(() => { IDLE_NEED.matters = 250; });
    await z.newBoard();
    const zh = await z.evaluate(() => [...document.querySelectorAll('#partSw .part-l>span')].map(s => s.textContent).join('|'));
    check('Chinese UI: 专注 · 旁听 · 协作', zh === '专注|旁听|协作', zh);
    const Dz = await z.decisionBoard();
    await z.evaluate(() => setSpeak('never')); await z.evaluate(() => { board.focusAt = NOW() - 12 * 60000; });
    await z.addEvidence(Dz.dir, { rel: 'conflicts', title: '实测：零下两度三盏灯一夜没电' });
    await z.settle(1500);
    await z.evaluate(() => setSpeak('matters')); await z.waitForTimeout(800);
    const zcu = await z.evaluate(() => $('catchUp').innerText);
    check('Chinese catch-up: 你专注时，我注意到 … 件事', /你专注时，我注意到 1 件事/.test(zcu) && /专注了 12 分钟/.test(zcu) && /反驳/.test(zcu) && /未连接 AI 模型/.test(zcu), zcu);
    if (SHOTS) await z.screenshot({ path: path.join(SHOTS, 'zh-catch-up.png') });
    check('no page errors (zh)', z.errors.length === 0, z.errors.join(' | '));
    await z.context().close();
  } catch (e) { check('test run finished', false, String(e.stack || e)); }
  finally {
    await browser.close(); srv.close();
    console.log(results.join('\n'));
    console.log(`\n${results.length - failures}/${results.length} passed`);
    process.exit(failures ? 1 : 0);
  }
})();

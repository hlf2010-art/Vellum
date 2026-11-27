#!/usr/bin/env node
/* One Copilot conversation per board.
 * Each board keeps its own conversation; switching boards switches it, a new board starts empty with stage
 * suggestions, nothing from one board's conversation or cards reaches a request made on another, a reply still
 * streaming when you leave stays on the board it was asked on, and the conversation goes out and back in with
 * Export / Import. Drives the real Vellum-Lumen.html against a scripted model endpoint it serves itself.
 *
 *   node tests/copilot-per-board.cjs            (from the repo root)
 *   node tests/copilot-per-board.cjs --headed   (watch it)
 */
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
let queue = []; const requests = [];
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp); }
      if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
        let body = ''; req.on('data', c => body += c); req.on('end', async () => {
          const parsed = JSON.parse(body || '{}');
          if (parsed.max_tokens === 1 && !parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: '.' } }] })); }
          const flat = (parsed.messages || []).map(m => typeof m.content === 'string' ? m.content : (m.content || []).map(p => p.text || '').join(' ')).join('\n');
          const i = queue.findIndex(e => new RegExp(e.match, 's').test(flat));
          const hit = i >= 0 ? queue.splice(i, 1)[0] : null;
          requests.push({ matched: hit && hit.id, full: flat });
          if (!hit) { rsp.writeHead(503); return rsp.end(''); }
          rsp.writeHead(200, { 'Content-Type': 'text/event-stream' }); rsp.on('error', () => {});
          for (let k = 0; k < hit.text.length; k += 24) {
            if (hit.slow) await new Promise(r => setTimeout(r, hit.slow));
            if (rsp.destroyed) return;
            rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: hit.text.slice(k, k + 24) } }] }) + '\n\n');
          }
          if (!rsp.destroyed) rsp.end('data: [DONE]\n\n');
        }); return;
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function open(browser, base, { theme = 'light', ctx = null } = {}) {
  const c = ctx || await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, deviceScaleFactor: SHOTS ? 2 : 1 });
  await c.route('http://127.0.0.1:59631/**', r => r.abort());
  await c.route(/wikipedia\.org/, r => r.abort());
  const p = await c.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
  await p.evaluate(url => { SCOUT_GROUNDING = false; apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'smoke', key: 'smoke' }; }, base);
  p.newBoard = async () => { await p.click('#projectBtn'); await p.waitForTimeout(300); await p.locator('#boardsPop [data-new]').click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700); };
  p.openBoard = async title => { await p.click('#projectBtn'); await p.waitForTimeout(300); await p.locator('#boardsPop .bp-row', { hasText: title }).first().click(); await p.waitForTimeout(700); };
  p.rename = t => p.evaluate(t => { board.title = t; renderAll(); persistNow(); }, t);
  p.ask = async (text, wait = true) => {
    await p.evaluate(() => { if (!copilotOpen) openCopilot(true); }); await p.waitForTimeout(200);
    await p.fill('#cpInput', text); await p.press('#cpInput', 'Enter');
    if (wait) { for (let i = 0; i < 80 && await p.evaluate(() => copilotStreaming); i++) await p.waitForTimeout(150); await p.waitForTimeout(300); }
  };
  p.panel = () => p.evaluate(() => {
    const pn = $('copilotPanel');
    return {
      open: copilotOpen && !pn.hidden,
      board: $('cpBoard')?.textContent || '',
      msgs: [...pn.querySelectorAll('#cpMsgs > .cp-msg')].map(m => m.innerText.replace(/\s+/g, ' ').trim()),
      empty: pn.querySelector('.cp-empty')?.innerText.replace(/\s+/g, ' ').trim() || '',
      chips: [...pn.querySelectorAll('.cp-chips .cp-chip')].map(c => c.textContent.trim()),
      input: $('cpInput')?.value || '', target: cpTarget, queue: cpQueue.length,
      caret: !!pn.querySelector('.cp-caret'), streaming: copilotStreaming,
    };
  });
  return p;
}

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    const p = await open(browser, base);
    // B1. board A: a card and a conversation of its own
    await p.newBoard(); await p.rename('Camping lantern');
    await p.evaluate(() => { const n = node('note', { text: 'LANTERN-ONLY: runs 40 hours on one charge' }, { x: 120, y: 120 }); n.status = 'ink'; renderAll(); persistNow(); });
    queue = [{ id: 'a1', match: 'Lumen Copilot', text: 'For the lantern, test the 40 hour claim first.' }];
    await p.ask('What should we test first on the lantern?');
    let A = await p.panel();
    check('a question on board A is answered in its panel', A.msgs.length === 2 && /40 hour claim/.test(A.msgs[1]), JSON.stringify(A.msgs));
    check('the panel header names the board the conversation belongs to', A.board === 'Camping lantern', A.board);

    // B2. a new board opens on an empty conversation of its own, with stage suggestions, and nothing carried over
    await p.evaluate(() => { cpTarget = 'critic'; renderCopilot(); }); await p.fill('#cpInput', 'half-typed words for the lantern');
    await p.evaluate(() => { window._cpAnim = false; new MutationObserver(() => { if ($('copilotPanel').classList.contains('cp-board-in')) window._cpAnim = true; }).observe($('copilotPanel'), { attributes: true, attributeFilter: ['class'] }); });
    await p.newBoard();
    const anim = await p.evaluate(() => window._cpAnim && !$('copilotPanel').classList.contains('cp-board-in'));
    let B = await p.panel();
    check('New board: the panel stays open and shows an empty conversation', B.open && B.msgs.length === 0 && /conversation for this board/i.test(B.empty), JSON.stringify(B));
    check('the empty state says Copilot reads only this board', /reads only this board/i.test(B.empty), B.empty);
    check('it offers at most 3 starter suggestions for an empty board (put the idea in one sentence first)', B.chips.length > 0 && B.chips.length <= 3 && /one sentence/i.test(B.chips[0]), JSON.stringify(B.chips));
    check('the header follows the new board', B.board === 'Untitled board', B.board);
    check('half-typed words and the addressed crew member do not follow you to the new board', B.input === '' && B.target === null, JSON.stringify({ input: B.input, target: B.target }));
    check('the conversation settles in with a short transition', anim);
    await p.rename('Desk fan');
    queue = [{ id: 'b1', match: 'Lumen Copilot', text: 'For the fan, start with noise at night.' }];
    await p.ask('What matters most for a desk fan?');
    const reqB = requests.filter(r => r.matched === 'b1').at(-1)?.full || '';
    check('board B\'s request carries nothing from board A (no card, no earlier conversation)', reqB && !/LANTERN|lantern|40 hour/i.test(reqB), reqB.slice(0, 300));
    check('board B\'s request is about board B', /Desk fan/.test(reqB), reqB.slice(0, 200));
    B = await p.panel();
    check('board B now has its own two messages', B.msgs.length === 2 && /noise at night/.test(B.msgs[1]), JSON.stringify(B.msgs));
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'b-desk-fan.png') });

    // B3. switching back brings board A's conversation back, and not B's
    await p.openBoard('Camping lantern');
    A = await p.panel();
    check('switching to A shows A\'s conversation, not B\'s', A.msgs.length === 2 && /40 hour claim/.test(A.msgs[1]) && !A.msgs.some(m => /fan/i.test(m)), JSON.stringify(A.msgs));
    check('and the header says Camping lantern', A.board === 'Camping lantern', A.board);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'a-camping-lantern.png') });
    await p.openBoard('Desk fan');
    B = await p.panel();
    check('and back to B shows B\'s again', B.msgs.length === 2 && /noise at night/.test(B.msgs[1]), JSON.stringify(B.msgs));

    // B4. leaving while a reply streams: it stops, stays on its own board, and nothing lands on the other one
    const nodesA = await p.evaluate(() => (store.get('.board.' + store.get('.list', []).find(b => b.title === 'Camping lantern').id, null) || {}).nodes.length);
    await p.openBoard('Camping lantern');
    queue = [{ id: 'a2', match: 'Lumen Copilot', text: Array.from({ length: 30 }, (_, i) => `Lantern point ${i + 1} about battery life.`).join(' '), slow: 120 }];
    await p.ask('List every risk for the lantern battery', false);
    for (let i = 0; i < 40 && !(await p.evaluate(() => /Lantern point/.test(board.copilot.at(-1)?.text || ''))); i++) await p.waitForTimeout(100);
    await p.evaluate(() => { cpQueue.push({ id: 'q1', text: 'queued for the lantern', ctxIds: [], t: Date.now() }); });
    const nodesBBefore = await p.evaluate(() => (store.get('.board.' + store.get('.list', []).find(b => b.title === 'Desk fan').id, null) || {}).nodes.length);
    await p.openBoard('Desk fan');
    await p.waitForTimeout(1500);
    B = await p.panel();
    check('after leaving mid-reply, board B shows only its own conversation, not busy', B.msgs.length === 2 && !B.caret && !B.streaming && !B.msgs.some(m => /Lantern point/.test(m)), JSON.stringify(B));
    check('messages queued on A are not sent on B', B.queue === 0 && !requests.some(r => /queued for the lantern/.test(r.full)));
    const savedA = await p.evaluate(() => { const id = store.get('.list', []).find(b => b.title === 'Camping lantern').id; const b = store.get('.board.' + id, null); const m = b.copilot.at(-1); return { n: b.copilot.length, text: m.text, streaming: !!m.streaming, nodes: b.nodes.length }; });
    check('the cut-off reply is kept on board A, saying it stopped because you switched boards', savedA.n === 4 && /Lantern point 1/.test(savedA.text) && /switched to another board/.test(savedA.text) && !savedA.streaming, JSON.stringify(savedA));
    const nodesBAfter = await p.evaluate(() => board.nodes.length);
    check('nothing from A\'s reply was placed on either board', nodesBAfter === nodesBBefore && savedA.nodes === nodesA, JSON.stringify({ nodesBBefore, nodesBAfter, nodesA, savedA: savedA.nodes }));
    await p.openBoard('Camping lantern');
    A = await p.panel();
    check('back on A, the stopped reply is there with no caret', A.msgs.length === 4 && /switched to another board/.test(A.msgs[3]) && !A.caret, JSON.stringify(A.msgs.slice(-1)));
    queue = [{ id: 'a3', match: 'Lumen Copilot', text: 'Yes, picking up where we left off.' }];
    await p.ask('Shall we continue?');
    const reqA3 = requests.filter(r => r.matched === 'a3').at(-1)?.full || '';
    check('a later question on A carries A\'s own conversation and none of B\'s', /lantern/i.test(reqA3) && !/fan|noise at night/i.test(reqA3), reqA3.slice(0, 300));

    // B5. Export keeps the conversation; Import brings it back on the imported board
    const bundle = await p.evaluate(async () => JSON.stringify(await buildBoardBundle()));
    const exported = JSON.parse(bundle), exBoard = exported.board || exported;
    check('Export Board includes the board\'s conversation', Array.isArray(exBoard.copilot) && exBoard.copilot.length === 6, String(exBoard.copilot && exBoard.copilot.length));
    const tmp = path.join(os.tmpdir(), 'vellum-cp-' + process.pid + '.vellum.json');
    exBoard.title = 'Lantern (imported)'; exBoard.copilot.push({ id: 'stale', role: 'ai', text: '', streaming: true, t: Date.now() });
    fs.writeFileSync(tmp, JSON.stringify(exported));
    await p.openBoard('Desk fan');
    await p.setInputFiles('#boardImportIn', tmp); await p.waitForTimeout(1200);
    fs.rmSync(tmp, { force: true });
    const I = await p.panel();
    check('Import brings the conversation in with the board', I.board === 'Lantern (imported)' && I.msgs.length === 7 && /40 hour claim/.test(I.msgs[1]), JSON.stringify({ board: I.board, n: I.msgs.length }));
    check('a reply that was mid-stream when exported shows as stopped, not as a caret forever', !I.caret && /Stopped/.test(I.msgs.at(-1)), JSON.stringify(I.msgs.slice(-1)));

    // B6. after a reload the active board opens on its own conversation
    await p.openBoard('Desk fan');
    await p.reload(); await p.waitForTimeout(2200);
    await p.evaluate(() => openCopilot(true)); await p.waitForTimeout(300);
    const R = await p.panel();
    check('after a reload the panel shows the active board\'s conversation', R.board === 'Desk fan' && R.msgs.length === 2 && /noise at night/.test(R.msgs[1]), JSON.stringify(R));
    check('no page errors', p.errors.length === 0, p.errors.join(' | '));

    // B7. the empty state in dark mode and Chinese (for the screenshot) still reads well
    if (SHOTS) {
      const d = await open(browser, base, { theme: 'dark' });
      await d.evaluate(() => { store.set('.lang', 'zh'); }); await d.reload(); await d.waitForTimeout(2200);
      await d.newBoard(); await d.rename('露营灯'); await d.evaluate(() => openCopilot(true)); await d.waitForTimeout(600);
      await d.screenshot({ path: path.join(SHOTS, 'new-board-empty-zh-dark.png') });
      await d.context().close();
    }
    await p.context().close();
  } catch (e) { check('test run', false, String(e && e.stack || e)); }
  finally { await browser.close(); srv.close(); }
  console.log(results.join('\n'));
  console.log(failures ? `\n${failures} check(s) failed` : `\nAll ${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
})();

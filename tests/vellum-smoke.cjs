#!/usr/bin/env node
/* Vellum smoke test.
 * Serves Vellum-Lumen.html and a scripted, OpenAI-compatible model endpoint on one local port,
 * drives the real UI in headless Chromium, and fails loudly on any page error or broken behaviour.
 *
 *   npm i -D playwright && npx playwright install chromium   (once)
 *   node tests/vellum-smoke.cjs                               (from the repo root)
 *   node tests/vellum-smoke.cjs --headed                      (watch it)
 *
 * The model endpoint answers from a queue each test sets up; anything unqueued gets HTTP 503,
 * which is how Vellum's built-in-rules fallback is exercised. */
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
let queue = [];
const requests = [];

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/Vellum-Lumen.html'))) {
        rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp);
      }
      if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
        let body = ''; req.on('data', c => body += c); req.on('end', async () => {
          const msgs = (JSON.parse(body || '{}').messages || []);
          const flat = msgs.map(m => typeof m.content === 'string' ? m.content : (m.content || []).map(p => p.text || '').join(' ')).join('\n');
          const i = queue.findIndex(e => new RegExp(e.match, 's').test(flat));
          const hit = i >= 0 ? queue.splice(i, 1)[0] : null;
          requests.push({ matched: hit && hit.id, prompt: flat.slice(0, 200), full: flat });
          if (hit && hit.delay) await new Promise(r => setTimeout(r, hit.delay));
          if (!hit || hit.status) { rsp.writeHead(hit ? hit.status : 503); return rsp.end(); }
          rsp.writeHead(200, { 'Content-Type': 'text/event-stream' });
          const txt = typeof hit.text === 'string' ? hit.text : JSON.stringify(hit.text);
          for (let k = 0; k < txt.length; k += 40) rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: txt.slice(k, k + 40) } }] }) + '\n\n');
          rsp.end('data: [DONE]\n\n');
        });
        return;
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }
const dirs = tag => ({ directions: ['A', 'B', 'C'].map(l => ({ title: `${tag} ${l}`, plan: `Plan ${l}.`, test: `Test ${l}.`, mode: 'story' })) });

async function page(browser, base, { model = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
  if (model) await p.evaluate(url => { apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'smoke', key: 'smoke' }; }, base);
  p.type = async (t, enter = true) => { await p.click('#lineInput'); await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.keyboard.type(t); if (enter) await p.keyboard.press('Enter'); };
  p.idle = async () => { await p.waitForTimeout(400); for (let i = 0; i < 100 && await p.evaluate(() => crewBusy()); i++) await p.waitForTimeout(250); await p.waitForTimeout(500); };
  p.toast = () => p.evaluate(() => [...document.querySelectorAll('#toasts > *')].map(t => t.innerText.replace(/\s+/g, ' ')).join(' / '));
  p.newBoard = async () => { await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.waitForTimeout(800); };
  return p;
}

(async () => {
  // 0. every inline script parses
  const html = fs.readFileSync(FILE, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const tmp = path.join(require('os').tmpdir(), 'vellum-smoke-' + process.pid + '.js');
  let parsed = true;
  for (const sc of scripts) { fs.writeFileSync(tmp, sc); try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); } catch (e) { parsed = false; check('inline scripts parse', false, String(e.stderr).split('\n').slice(0, 3).join(' ')); } }
  fs.rmSync(tmp, { force: true });
  if (parsed) check(`inline scripts parse (${scripts.length})`, true);

  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    // 1. load, and select every card type on the sample board (catches crashes in the strip and menus)
    {
      const p = await page(browser, base, { model: false });
      check('sample board loads without page errors', p.errors.length === 0, p.errors.join(' | '));
      const types = await p.evaluate(() => [...new Map(board.nodes.filter(n => !n.hidden && !n.archived).map(n => [n.type + ':' + n.status, n.id])).entries()]);
      for (const [kind, id] of types) {
        const before = p.errors.length;
        await p.evaluate(id => { focusNodes([byId(id)], 1, 0); select([id]); }, id); await p.waitForTimeout(150);
        check(`select ${kind}`, p.errors.length === before, p.errors.slice(before).join(' | '));
      }
      // 2. argument-free commands run from the composer; commands that need text wait for it
      const pick = await p.evaluate(() => {
        const ink = board.nodes.filter(n => n.status === 'ink' && !n.hidden && !n.archived);
        const adoptedDir = ink.find(n => n.type === 'direction' && board.adopted[n.idea] === n.id);
        const otherDir = ink.find(n => n.type === 'direction' && board.adopted[n.idea] !== n.id);
        const by = t => (ink.find(n => n.type === t) || {}).id;
        return { build: adoptedDir?.id, deck: adoptedDir?.id, adopt: otherDir?.id, print: by('proof'), list: by('note'), kanban: by('note'), treemap: by('note'), gather: by('note'), critique: by('idea') || by('note'), reverse: by('image'), split: by('recording'), organize: null, run: CMDS.filter(c => c.run).map(c => c.c.slice(1)) };
      });
      for (const c of pick.run) {
        const before = p.errors.length;
        await p.evaluate(() => { document.querySelectorAll('#toasts > *').forEach(t => t.remove()); });
        await p.evaluate(id => select(id ? [id] : []), pick[c]);
        await p.type('/' + c, false); await p.waitForTimeout(200); await p.keyboard.press('Enter');
        await p.idle();
        const t = await p.toast();
        check(`/${c} runs from the composer`, !/Unknown move/.test(t) && p.errors.length === before, (t || '') + ' ' + p.errors.slice(before).join(' | '));
        await p.evaluate(() => { document.activeElement?.blur?.(); }); await p.keyboard.press('Escape');
      }
      await p.evaluate(() => select([]));
      await p.type('/claim', false); await p.waitForTimeout(200); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
      const cv = await p.evaluate(() => lineIn.value + '|mode=' + lineMode);
      check('/claim waits for its text', cv.startsWith('/claim '), cv);
      await p.type('/criti', false); await p.waitForTimeout(200); await p.keyboard.press('Tab'); await p.waitForTimeout(300);
      check('Tab completes a command without running it', (await p.evaluate(() => lineIn.value)) === '/critique ');
      await p.context().close();
    }
    // 3. front door, provenance, Try again (success, failure, undo, work done meanwhile), change log
    {
      const p = await page(browser, base);
      await p.newBoard();
      await p.type('Rough idea: a calmer onboarding'); await p.waitForTimeout(800);
      const idea = await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'idea'); return n && { id: n.id, prov: n.prov }; });
      check('free text with nothing selected becomes an idea card', !!idea);
      check('your card is marked as made by you', idea && idea.prov && idea.prov.author === 'you' && idea.prov.engine === 'human', JSON.stringify(idea && idea.prov));
      queue = [{ id: 'f1', match: '"directions"', text: dirs('First') }, { id: 'f-fail', match: '"directions"', status: 500, delay: 2500 }, { id: 'f2', match: '"directions"', text: dirs('Second'), delay: 2500 }];
      const titles = () => p.evaluate(() => board.nodes.filter(n => n.type === 'direction').map(n => n.title).join(','));
      const notes = () => p.evaluate(() => board.nodes.filter(n => n.type === 'note').length);
      await p.evaluate(id => select([id]), idea.id); await p.type('/fork 3'); await p.idle();
      check('fork drafts arrive', (await titles()) === 'First A,First B,First C', await titles());
      check('model-made drafts are marked as model', await p.evaluate(() => board.nodes.filter(n => n.type === 'direction').every(n => n.prov?.author === 'muse' && n.prov?.engine === 'model')));
      const sticky = async (x, y, t) => { await p.mouse.dblclick(x, y); await p.waitForTimeout(400); await p.keyboard.type(t); await p.mouse.click(700, 60); await p.waitForTimeout(300); };
      await p.click('.pbar [data-p="redraw"]'); await p.waitForTimeout(500);
      await sticky(1250, 640, 'written while it works'); await p.idle();
      check('Try again with a failing model keeps the drafts', (await titles()) === 'First A,First B,First C', await titles());
      check('work done meanwhile survives a failed Try again', (await notes()) === 1);
      await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
      const noteText = () => p.evaluate(() => board.nodes.filter(n => n.type === 'note').map(n => n.text).join('|'));
      check('one Undo after a failed Try again only undoes your own edit', (await titles()) === 'First A,First B,First C' && !/written while it works/.test(await noteText()), `${await titles()} notes=${await noteText()}`);
      await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(400);
      await p.click('.pbar [data-p="redraw"]'); await p.idle();
      check('Try again with a working model replaces the drafts in place', (await titles()) === 'Second A,Second B,Second C', await titles());
      await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
      check('one Undo brings the previous version back', (await titles()) === 'First A,First B,First C' && /written while it works/.test(await noteText()), `${await titles()} notes=${await notes()}`);
      await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(400);
      // a fork the model fails: built-in rules step in, and the draft says so
      await p.evaluate(() => { const ids = board.nodes.filter(n => n.type === 'direction').map(n => n.id); return erase(ids); }); await p.waitForTimeout(500);
      await p.evaluate(id => select([id]), idea.id); await p.type('/fork 2'); await p.idle();
      const rules = await p.evaluate(() => board.nodes.filter(n => n.type === 'direction').map(n => n.prov?.engine));
      check('drafts made by the built-in rules are marked as rules', rules.length > 0 && rules.every(e => e === 'rules'), JSON.stringify(rules));
      check('rule-made drafts show "built-in rules" on the card', await p.evaluate(() => document.querySelectorAll('.card.sketch .prov-rules').length) > 0);
      await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('Control+Enter'); await p.waitForTimeout(800);
      const log = await p.evaluate(() => (board.changes || []).map(c => `${c.op}:${c.type}:${c.who}:${c.engine || ''}`));
      check('change log records your card', log.some(l => l.startsWith('create:idea:you:human')), log.slice(0, 6).join(' '));
      check('change log records agent drafts with their engine', log.some(l => /^create:direction:muse:model/.test(l)) && log.some(l => /^create:direction:muse:rules/.test(l)), log.join(' '));
      check('change log records keeping a draft', log.some(l => l.startsWith('accept:direction')), log.join(' '));
      check('change log records undo', await p.evaluate(() => (board.changes || []).some(c => c.cause === 'undo')));
      check('no page errors in the agent flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 4. proposals: agents create freely, but editing or deleting a kept card waits for you
    {
      const p = await page(browser, base);
      await p.newBoard();
      await p.type('/claim Players buy place, not scale'); await p.waitForTimeout(800);
      const id = await p.evaluate(() => board.nodes.find(n => n.type === 'idea').id);
      const text = () => p.evaluate(id => byId(id)?.text, id);
      const bar = () => p.evaluate(id => !!document.querySelector(`[data-id="${id}"] .prop-bar`), id);
      await p.evaluate(id => dispatchCanvasActions([{ action: 'edit', target: id, field: 'text', value: 'Players buy place and feel, not scale' }], { by: 'critic' }), id); await p.waitForTimeout(500);
      check('an agent edit of a kept card is not applied', (await text()) === 'Players buy place, not scale', await text());
      check('the card shows the suggestion', await bar());
      check('the review button counts the suggestion', /1 edit/.test(await p.evaluate(() => document.getElementById('reviewTxt').textContent)), await p.evaluate(() => document.getElementById('reviewTxt').textContent));
      await p.evaluate(id => focusNodes([byId(id)], 1, 0), id); await p.waitForTimeout(300);
      await p.click(`[data-id="${id}"] [data-prop-act="view"]`); await p.waitForTimeout(300);
      check('Review shows a word diff', await p.evaluate(id => !!document.querySelector(`[data-id="${id}"] .prop-diff ins`), id));
      await p.click(`[data-id="${id}"] [data-prop-act="accept"]`); await p.waitForTimeout(500);
      check('Accept applies the edit', (await text()) === 'Players buy place and feel, not scale', await text());
      await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
      check('Undo reverts an accepted edit', (await text()) === 'Players buy place, not scale', await text());
      await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(300);
      await p.evaluate(id => dispatchCanvasActions([{ action: 'edit', target: id, field: 'text', value: 'Declined text' }], { by: 'muse' }), id); await p.waitForTimeout(400);
      await p.click(`[data-id="${id}"] [data-prop-act="reject"]`); await p.waitForTimeout(400);
      check('Decline leaves the card as it was', (await text()) === 'Players buy place and feel, not scale' && !(await bar()), await text());
      // stale: the card changes after the suggestion
      await p.evaluate(id => dispatchCanvasActions([{ action: 'edit', target: id, title: 'Suggested title' }], { by: 'critic' }), id); await p.waitForTimeout(400);
      await p.evaluate(id => { const n = byId(id), d = digest(n), t = n.title, x = n.text; n.text = 'I edited this myself'; recordNodeEdit(n, d, t, x); renderAll(); persist(); }, id); await p.waitForTimeout(300);
      await p.click(`[data-id="${id}"] [data-prop-act="accept"]`); await p.waitForTimeout(400);
      check('accepting a suggestion on a changed card asks first', await p.evaluate(id => byId(id).title !== 'Suggested title' && !!document.querySelector(`[data-id="${id}"] .prop-stale`), id));
      await p.click(`[data-id="${id}"] [data-prop-act="accept"]`); await p.waitForTimeout(400);
      check('Accept anyway applies it', await p.evaluate(id => byId(id).title === 'Suggested title' && byId(id).text === 'I edited this myself', id));
      // delete suggestion
      await p.evaluate(id => dispatchCanvasActions([{ action: 'erase', targets: [id] }], { by: 'critic' }), id); await p.waitForTimeout(400);
      check('an agent deletion of a kept card is only suggested', await p.evaluate(id => !!byId(id) && !!document.querySelector(`[data-id="${id}"] .prop-bar.is-del`), id));
      // ⌘Z leaves the agent's batch alone; the Undo on its own toast withdraws it
      await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
      check("⌘Z does not undo an agent's suggestion", await p.evaluate(id => openProps(id).some(p => p.op === 'delete'), id));
      await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(300);
      await p.evaluate(() => { const b = [...document.querySelectorAll('#toasts .toast')].find(t => /suggested change/.test(t.textContent))?.querySelector('button'); b && b.click(); }); await p.waitForTimeout(400);
      check("the toast's Undo withdraws the agent's suggestion", await p.evaluate(id => !!byId(id) && !openProps(id).some(p => p.op === 'delete'), id));
      await p.evaluate(id => openProps(id).forEach(p => rejectProposal(p.id)), id); await p.waitForTimeout(300);
      await p.evaluate(id => dispatchCanvasActions([{ action: 'erase', targets: [id] }], { by: 'critic' }), id); await p.waitForTimeout(400);
      await p.click(`[data-id="${id}"] [data-prop-act="accept"]`); await p.waitForTimeout(800);
      check('accepting a deletion deletes the card', await p.evaluate(id => !byId(id), id));
      // what stays direct
      const made = await p.evaluate(() => dispatchCanvasActions([{ action: 'create', cardType: 'note', title: 'Agent note', text: 'Created directly' }], { by: 'scout' }).createdNodes.map(n => n.id));
      check('agents still create cards directly', made.length === 1 && await p.evaluate(id => !!byId(id), made[0]));
      await p.evaluate(id => dispatchCanvasActions([{ action: 'edit', target: id, field: 'text', value: 'Changed because you asked' }], { by: 'critic', userIntent: true }), made[0]); await p.waitForTimeout(300);
      check('a change you asked for in your own words applies directly', await p.evaluate(id => byId(id).text === 'Changed because you asked', made[0]));
      const log = await p.evaluate(() => (board.changes || []).map(c => c.op));
      check('change log records suggestions and your decisions', ['propose-edit', 'accept-proposal', 'reject-proposal', 'propose-delete'].every(o => log.includes(o)), log.join(' '));
      // end to end: Copilot proposes an edit through its actions block
      await p.type('/claim Real Shanghai, grounded'); await p.waitForTimeout(800);
      queue = [{ id: 'sub', match: 'Sub-agent protocol', text: '- fine' }, { id: 'cp', match: 'Lumen Copilot', text: 'I\'ve suggested a sharper wording.\n```actions\n[{"action":"edit","target":"Real Shanghai, grounded","field":"text","value":"The real Shanghai, felt not mapped"}]\n```' }];
      await p.keyboard.press('Control+.'); await p.waitForTimeout(600);
      await p.fill('#cpInput', 'Tighten the wording of the claim "Real Shanghai, grounded"'); await p.keyboard.press('Enter');
      for (let i = 0; i < 40 && !(await p.evaluate(() => openProps().length)); i++) await p.waitForTimeout(250);
      check('Copilot edits of kept cards arrive as suggestions', await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'idea' && /Real Shanghai/.test(n.text)); return !!n && n.text === 'Real Shanghai, grounded' && openProps(n.id).length === 1; }), JSON.stringify(requests.slice(-2)));
      check('no page errors in the proposal flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 5. per-author undo: ⌘Z undoes your own changes and leaves agents' work alone
    {
      const p = await page(browser, base, { model: false });
      await p.newBoard();
      await p.type('/note mine first'); await p.waitForTimeout(600);
      const mine = await p.evaluate(() => board.nodes.find(n => n.type === 'note').id);
      await p.evaluate(() => dispatchCanvasActions([{ action: 'create', cardType: 'note', title: 'Agent', text: 'agent card' }], { by: 'scout' })); await p.waitForTimeout(400);
      const agentCard = await p.evaluate(() => board.nodes.find(n => n.text === 'agent card')?.id);
      await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
      check("⌘Z undoes your change, not the agent's later one", await p.evaluate(([m, a]) => !byId(m) && !!byId(a), [mine, agentCard]));
      await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(400);
      check('Redo brings your change back', await p.evaluate(m => !!byId(m), mine));
      // conflict: you edit a card, then an agent changes it; your undo skips it and says so
      await p.evaluate(m => { checkpoint(); const n = byId(m), d = digest(n), t = n.title, x = n.text; n.text = 'my edit'; recordNodeEdit(n, d, t, x); renderAll(); persist(); }, mine);
      await p.evaluate(m => dispatchCanvasActions([{ action: 'edit', target: m, field: 'text', value: 'agent rewrite' }], { by: 'critic', userIntent: true }), mine); await p.waitForTimeout(400);
      await p.evaluate(() => { document.querySelectorAll('#toasts > *').forEach(t => t.remove()); document.activeElement?.blur?.(); });
      await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
      check('your undo skips a card an agent changed since', await p.evaluate(m => byId(m).text === 'agent rewrite', mine));
      check('and says what it skipped', /except/.test(await p.toast()), await p.toast());
      // the Undo on a toast undoes exactly what it announced, even after other changes
      await p.evaluate(() => dispatchCanvasActions([{ action: 'create', cardType: 'note', title: 'Batch', text: 'agent batch card' }], { by: 'muse' })); await p.waitForTimeout(300);
      const batchToast = await p.evaluate(() => { const t = [...document.querySelectorAll('#toasts .toast')].pop(); t.dataset.mark = 'batch'; return !!t; });
      await p.type('/note mine after the batch'); await p.waitForTimeout(600);
      await p.evaluate(() => document.querySelector('#toasts .toast[data-mark="batch"] button')?.click()); await p.waitForTimeout(400);
      check("a toast's Undo undoes exactly the change it announced", batchToast && await p.evaluate(() => !board.nodes.some(n => n.text === 'agent batch card') && board.nodes.some(n => n.text === 'mine after the batch')));
      check('the undo button is off when only agents have changes to undo', await p.evaluate(() => { const before = undoStack.slice(); undoStack = undoStack.filter(t => t.author !== 'you'); syncHistoryBtns(); const off = document.getElementById('topUndoBtn').disabled; undoStack = before; syncHistoryBtns(); return off; }));
      check('no page errors in history flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 6. unasked thoughts: one look per burst, an hourly budget, and a real Off
    {
      const p = await page(browser, base);
      await p.newBoard();
      await p.evaluate(() => { advQuietMs = 300; advMaxWaitMs = 2000; setAdvisorLevel('quiet'); advSpent = []; advHeld = 0; });
      const looks = () => requests.filter(r => /at most 2 pins/.test(r.prompt) || /pins/.test(r.prompt) && /keywords/.test(r.prompt)).length;
      const advReqs = () => requests.filter(r => r.full && /Include 1 or at most 2 pins/.test(r.full));
      let before = advReqs().length;
      for (const t of ['note: Wukong sold about 30M copies', 'note: GTA VI launches in November', 'note: Ananta launches in January', 'note: Mainland rules bar organised crime', 'note: Sleeping Dogs was praised for melee']) { await p.evaluate(() => select([])); await p.type(t); await p.waitForTimeout(120); }
      await p.waitForTimeout(2600); await p.idle();
      const burst = advReqs().slice(before);
      check('a burst of five new cards gets one look', burst.length === 1, `${burst.length} looks`);
      check('the other cards in the burst are given as context', burst.length === 1 && /also just added/.test(burst[0].full));
      await p.evaluate(() => { advSpent = Array.from({ length: 6 }, () => NOW()); });
      before = advReqs().length;
      for (const t of ['note: one more fact', 'note: and another fact']) { await p.evaluate(() => select([])); await p.type(t); await p.waitForTimeout(120); }
      await p.waitForTimeout(1200); await p.idle();
      check('no looks once the hourly budget is used', advReqs().length === before, `${advReqs().length - before} looks`);
      check('cards held back are counted', await p.evaluate(() => advHeld >= 2));
      before = advReqs().length;
      await p.evaluate(() => scheduleAdvisor(board.nodes.find(n => n.type === 'note').id, { force: true })); await p.waitForTimeout(800); await p.idle();
      check('a look you ask for ignores the budget', advReqs().length === before + 1, `${advReqs().length - before} looks`);
      await p.evaluate(() => { setAdvisorLevel('off'); advSpent = []; });
      before = advReqs().length;
      await p.evaluate(() => select([])); await p.type('note: quiet please'); await p.waitForTimeout(1200); await p.idle();
      check('Off means no unasked looks', advReqs().length === before);
      await p.click('#crewModeBtn'); await p.waitForTimeout(400);
      const seg = await p.evaluate(() => [...document.querySelectorAll('[data-sp="adv-level"]')].map(b => b.dataset.level + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(','));
      check('settings offer Off, Quiet and Active', seg === 'off*,quiet,active', seg);
      await p.click('[data-sp="adv-level"][data-level="active"]'); await p.waitForTimeout(300);
      check('choosing Active takes effect', await p.evaluate(() => advisorLevel === 'active' && advisorMode === true && advLeft() === 20));
      check('no page errors in the unasked-thoughts flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 7. agent permissions: each kind of action follows the setting
    {
      const p = await page(browser, base, { model: false });
      await p.newBoard();
      await p.type('/claim Kept claim'); await p.waitForTimeout(600);
      await p.type('/note Kept note'); await p.waitForTimeout(600);
      const [claim, note] = await p.evaluate(() => [board.nodes.find(n => n.type === 'idea').id, board.nodes.find(n => n.type === 'note').id]);
      const run = (acts, extra = {}) => p.evaluate(([a, x]) => { const r = dispatchCanvasActions(a, { by: 'critic', ...x }); return { created: r.createdNodes.map(n => ({ id: n.id, status: n.status })), proposed: r.proposed.length, skipped: r.skipped.length }; }, [acts, extra]);
      check('defaults: create directly, edit and delete ask', await p.evaluate(() => perm('create') === 'direct' && perm('link') === 'direct' && perm('edit') === 'suggest' && perm('delete') === 'suggest'));
      await p.evaluate(() => setAutonomy({ create: 'suggest' }));
      let r = await run([{ action: 'create', cardType: 'note', title: 'Asked', text: 'arrives as a draft' }]);
      check('create set to Ask first arrives as a draft', r.created.length === 1 && r.created[0].status === 'sketch', JSON.stringify(r));
      await p.evaluate(() => setAutonomy({ create: 'never' }));
      r = await run([{ action: 'create', cardType: 'note', title: 'Blocked', text: 'should not exist' }]);
      check('create set to Never creates nothing', r.created.length === 0 && r.skipped === 1 && await p.evaluate(() => !board.nodes.some(n => n.text === 'should not exist')));
      await p.evaluate(() => setAutonomy({ edit: 'direct' }));
      await run([{ action: 'edit', target: claim, field: 'text', value: 'Edited directly' }]);
      check('edit set to Do it applies to a kept card', await p.evaluate(id => byId(id).text === 'Edited directly' && openProps(id).length === 0, claim));
      await p.evaluate(() => setAutonomy({ edit: 'never', delete: 'never' }));
      r = await run([{ action: 'edit', target: claim, field: 'text', value: 'nope' }, { action: 'erase', targets: [note] }]);
      check('edit and delete set to Never change nothing', r.skipped === 2 && r.proposed === 0 && await p.evaluate(([c, n]) => byId(c).text === 'Edited directly' && !!byId(n) && openProps().length === 0, [claim, note]));
      await p.evaluate(() => setAutonomy({ link: 'suggest' }));
      r = await run([{ action: 'connect', from: note, to: claim }]);
      check('link set to Ask first becomes a suggestion', r.proposed === 1 && await p.evaluate(([n, c]) => !board.edges.some(e => e.a === n && e.b === c) && openProps(c).some(p => p.op === 'link'), [note, claim]));
      await p.evaluate(c => { const pr = openProps(c).find(p => p.op === 'link'); return acceptProposal(pr.id); }, claim); await p.waitForTimeout(300);
      check('accepting a link suggestion links the cards', await p.evaluate(([n, c]) => board.edges.some(e => e.a === n && e.b === c), [note, claim]));
      r = await run([{ action: 'erase', targets: [note] }], { userIntent: true });
      await p.waitForTimeout(700);
      check('your own words are not limited by agent permissions', await p.evaluate(n => { const x = byId(n); return !x || !!x.tombstone; }, note));
      check('Copilot is told the current permissions', await p.evaluate(() => /linking cards: it becomes a suggestion/.test(autonomyPromptLine()) && /deleting cards the designer has kept: you may not do it/.test(autonomyPromptLine())));
      // the dialog
      await p.click('#crewModeBtn'); await p.waitForTimeout(400);
      await p.click('[data-sp="autonomy"]'); await p.waitForTimeout(400);
      check('the permissions dialog opens', await p.evaluate(() => document.querySelectorAll('dialog[open] [data-au]').length === 12));
      await p.click('dialog[open] [data-au="delete"][data-v="suggest"]'); await p.waitForTimeout(200);
      check('choosing in the dialog takes effect and is remembered', await p.evaluate(() => perm('delete') === 'suggest' && store.get('.autonomy', {}).delete === 'suggest'));
      await p.click('dialog[open] [data-au-reset]'); await p.waitForTimeout(200);
      check('Reset restores the defaults', await p.evaluate(() => JSON.stringify(autonomy) === JSON.stringify(AUTONOMY_DEFAULT)));
      check('no page errors in the permissions flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
  } finally {
    await browser.close(); srv.close();
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

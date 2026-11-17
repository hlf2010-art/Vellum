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
const probes = [];
const probe = { status: 200, delay: 0 };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/Vellum-Lumen.html'))) {
        rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp);
      }
      if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
        let body = ''; req.on('data', c => body += c); req.on('end', async () => {
          const parsed = JSON.parse(body || '{}');
          // Connection test from the app: a one-token, non-streamed "ping". Answer it separately so it
          // never consumes scripted replies or shows up in `requests`.
          if (parsed.max_tokens === 1 && !parsed.stream) {
            probes.push({ auth: req.headers.authorization || '', model: parsed.model });
            if (probe.delay) await new Promise(r => setTimeout(r, probe.delay));
            rsp.writeHead(probe.status, { 'Content-Type': 'application/json' });
            return rsp.end(JSON.stringify({ choices: [{ message: { content: '.' } }] }));
          }
          const msgs = (parsed.messages || []);
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

    // 6. two crew axes (speaks up, acts on the board): pacing by what you have read, a hidden ceiling, the crew entry and popover
    {
      const p = await page(browser, base);
      await p.newBoard();
      await p.evaluate(() => { setCrewLevel('suggest'); advQuietMs = 300; advMaxWaitMs = 2000; advSpent = []; advHeld = 0; board.pins = {}; });
      const advReqs = () => requests.filter(r => r.full && /Include 1 or at most 2 pins/.test(r.full));
      const add = async list => { for (const t of list) { await p.evaluate(() => select([])); await p.type('note: ' + t); await p.waitForTimeout(120); } await p.waitForTimeout(1400); await p.idle(); };
      check('defaults: speaks up when it matters, acts only with drafts', await p.evaluate(() => crewSpeak === 'matters' && crewAct === 'drafts' && perm('create') === 'suggest' && perm('edit') === 'suggest' && perm('delete') === 'suggest' && advisorMode && !advisorAuto));
      let before = advReqs().length;
      await add(['Wukong sold about 30M copies', 'GTA VI launches in November', 'Ananta launches in January', 'Mainland rules bar organised crime', 'Sleeping Dogs was praised for melee']);
      const burst = advReqs().slice(before);
      check('a burst of five new cards gets one look', burst.length === 1, `${burst.length} looks`);
      check('the other cards in the burst are given as context', burst.length === 1 && /also just added/.test(burst[0].full));
      await p.evaluate(() => { const id = board.nodes.find(n => n.type === 'note').id; board.pins = { [id]: [{ id: 'pin-t', agent: 'critic', note: 'An unread thought', t: NOW(), seen: false }] }; });
      before = advReqs().length;
      await add(['one more fact', 'and another fact']);
      check('no new look while a thought is unread', advReqs().length === before, `${advReqs().length - before} looks`);
      check('cards held back are counted', await p.evaluate(() => advHeld >= 2));
      await p.evaluate(() => { for (const ps of Object.values(board.pins)) ps.forEach(x => x.seen = true); });
      before = advReqs().length;
      await add(['after reading the thought']);
      check('the next look comes once you have read it', advReqs().length === before + 1, `${advReqs().length - before} looks`);
      await p.evaluate(() => { board.pins = { x: [{ id: 'old', agent: 'critic', note: 'ignored', t: NOW() - 3600000, seen: false }] }; advFadeMs = 60000; });
      check('a thought ignored for a while fades and stops holding the next', await p.evaluate(() => unreadPins() === 0 && board.pins.x[0].faded === true));
      await p.evaluate(() => { board.pins = {}; advSpent = Array.from({ length: ADV_HARD_CAP }, () => NOW()); });
      before = advReqs().length;
      await add(['past the hidden ceiling']);
      check('a hidden hourly ceiling still guards cost', advReqs().length === before);
      before = advReqs().length;
      await p.evaluate(() => scheduleAdvisor(board.nodes.find(n => n.type === 'note').id, { force: true })); await p.waitForTimeout(800); await p.idle();
      check('a look you ask for ignores pacing and the ceiling', advReqs().length === before + 1, `${advReqs().length - before} looks`);
      await p.evaluate(() => { setCrewLevel('asked'); advSpent = []; board.pins = {}; advQuietMs = 300; });
      before = advReqs().length;
      await add(['quiet please']);
      check('Speaks up: Never means no unasked looks', advReqs().length === before && await p.evaluate(() => !advisorMode && crewSpeak === 'never'));
      await p.evaluate(() => setCrew({ speak: 'often', act: 'drafts' }));
      check('the two axes are independent: talkative but drafts only', await p.evaluate(() => advisorMode && advisorAuto && SPEAK_UNREAD.often === 2 && perm('create') === 'suggest'));
      await p.evaluate(() => setCrew({ speak: 'never', act: 'create' }));
      check('the two axes are independent: silent but can create', await p.evaluate(() => !advisorMode && perm('create') === 'direct' && perm('delete') === 'suggest'));
      // the crew entry and popover
      await p.evaluate(() => { setCrew({ speak: 'matters', act: 'drafts' }); board.pins = {}; advHeld = 0; renderCrew(); });
      check('the crew settings button belongs to the crew group', await p.evaluate(() => !!document.querySelector('.crew-group .crew-seats') && !!document.querySelector('.crew-group #crewSetBtn')));
      check('it shows connection health as a dot', await p.evaluate(() => document.querySelector('#crewSetBtn .conn-dot')?.classList.contains('ok')));
      check('its label names both settings', /When it matters/.test(await p.evaluate(() => document.getElementById('crewSetBtn').getAttribute('aria-label'))) && /Only drafts/.test(await p.evaluate(() => document.getElementById('crewSetBtn').getAttribute('aria-label'))));
      const pinCard = await p.evaluate(() => { const id = board.nodes.find(n => n.type === 'note').id; board.pins = { [id]: [{ id: 'pin-show', agent: 'critic', note: 'Read me', t: NOW(), seen: false }] }; renderAll(); renderCrew(); return id; });
      check('the avatars show the crew is waiting for you', await p.evaluate(() => { const g = document.querySelector('.crew-group'); return g.classList.contains('quiet-pacing') && /read the last thought/.test(g.title); }));
      await p.click('#crewSetBtn'); await p.waitForTimeout(300);
      const segs = await p.evaluate(() => ['speak', 'act'].map(a => [...document.querySelectorAll(`#crewPop [data-crew-${a}]`)].map(b => b.dataset['crew' + a[0].toUpperCase() + a.slice(1)] + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(',')).join(' | '));
      check('the popover has two segmented axes', segs === 'never,matters*,often | drafts*,create' && await p.evaluate(() => document.querySelectorAll('#crewPop .sp-seg').length === 2), segs);
      check('no Copilot shortcut in the popover', await p.evaluate(() => !document.querySelector('#crewPop [data-crew-copilot]')));
      await p.click('#crewPop [data-crew-lock="1"]'); await p.waitForTimeout(200);
      check('lanes can be locked from the popover', await p.evaluate(() => lockedBays().includes(1) && document.querySelector('#crewPop [data-crew-lock="1"]').getAttribute('aria-pressed') === 'true'));
      await p.click('#crewPop [data-crew-lock="1"]'); await p.waitForTimeout(200);
      await p.click('#crewPop [data-crew-show]'); await p.waitForTimeout(500);
      check('Show opens the waiting thought and marks it read', await p.evaluate(id => openAdvNodeId === id && board.pins[id][0].seen === true && !document.querySelector('.crew-group').classList.contains('quiet-pacing'), pinCard));
      await p.evaluate(() => closeAdvPop());
      await p.click('#crewSetBtn'); await p.waitForTimeout(300);
      await p.click('#crewPop [data-crew-speak="often"]'); await p.waitForTimeout(200);
      await p.click('#crewPop [data-crew-act="create"]'); await p.waitForTimeout(200);
      check('choosing on each axis takes effect and is remembered', await p.evaluate(() => crewSpeak === 'often' && crewAct === 'create' && store.get('.crewSpeak') === 'often' && store.get('.crewAct') === 'create' && perm('create') === 'direct' && /Often/.test(document.getElementById('crewSetBtn').getAttribute('aria-label'))));
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      // the connection popover is only about the connection
      await p.click('#crewModeBtn'); await p.waitForTimeout(400);
      const conn = await p.evaluate(() => document.getElementById('studioPop').innerText);
      check('the connection popover is only about the connection', /Connection/.test(conn) && /Using Cloud API/.test(conn) && !/Unasked thoughts|Agent permissions|Auto follow-up|Start Studio AI/.test(conn), conn.slice(0, 160));
      // honest connection status: a real test request, not "On"; the header answers what is in use
      await p.waitForFunction(() => document.querySelector('#studioPop [data-api-health="ok"]'), null, { timeout: 4000 }).catch(() => {});
      const ok = await p.evaluate(() => ({ h: document.querySelector('#studioPop [data-api-health]')?.textContent, head: document.querySelector('#studioPop .sp-now')?.className, acts: [...document.querySelectorAll('#studioPop .sp-mini')].map(b => b.textContent), dot: document.querySelector('#crewSetBtn .conn-dot').className, note: document.querySelector('#studioPop .sp-mode-note')?.textContent, order: [...document.querySelectorAll('#studioPop .sp-svc-top > span:first-child')].map(s => s.textContent) }));
      check('opening Connection tests the Cloud API for real; the engine in use says so', ok.h === 'In use' && /ok/.test(ok.head) && probes.length >= 1 && probes.at(-1).auth === 'Bearer smoke' && requests.every(r => !/^ping$/.test(r.full)), JSON.stringify(ok));
      check('one action per engine (Start · Edit), Auto is explained, media is grouped apart', ok.acts.join() === 'Start,Edit' && /Local AI.*Cloud API/.test(ok.note || '') && ok.order.join() === 'Local AI,Cloud API,Media Studio', JSON.stringify(ok));
      probe.status = 401;
      await p.click('#studioPop [data-sp="refresh"]');
      await p.waitForFunction(() => document.querySelector('#studioPop [data-api-health="auth"]'), null, { timeout: 4000 }).catch(() => {});
      const bad = await p.evaluate(() => ({ h: document.querySelector('#studioPop [data-api-health]')?.textContent, head: document.querySelector('#studioPop .sp-now').textContent, headCls: document.querySelector('#studioPop .sp-now').className, fix: document.querySelector('#studioPop [data-sp="api"]').outerHTML, dot: document.querySelector('#crewSetBtn .conn-dot').className }));
      check('a rejected key: header says rules are in use and why, Fix key is the next step, dot is red', bad.h === 'Key rejected' && /built-in rules.*key rejected/.test(bad.head) && /err/.test(bad.headCls) && /primary/.test(bad.fix) && /Fix key/.test(bad.fix) && /error/.test(bad.dot), JSON.stringify(bad));
      probe.status = 200;
      queue.push({ id: 'heal', match: 'heal-me', text: 'fine' });
      await p.evaluate(() => apiChat({ prompt: 'heal-me' }));
      await p.waitForTimeout(200);
      check('a real successful call clears the error', await p.evaluate(() => apiHealthNow().k === 'ok' && /ok/.test(document.querySelector('#crewSetBtn .conn-dot').className)));
      await p.evaluate(() => { apiCfg = { ...apiCfg, baseUrl: 'http://127.0.0.1:9/v1' }; });
      await p.click('#studioPop [data-sp="refresh"]');
      await p.waitForFunction(() => document.querySelector('#studioPop [data-api-health="unreachable"]'), null, { timeout: 6000 }).catch(() => {});
      check('an unreachable host reads "Can\'t reach"', await p.evaluate(() => document.querySelector('#studioPop [data-api-health]')?.textContent === "Can't reach"));
      await p.click('#studioPop [data-sp="pref"][data-val="local"]'); await p.waitForTimeout(200);
      check('Rules only: the header says plainly AI is off, and the unused engines step back', await p.evaluate(() => { const h = document.querySelector('#studioPop .sp-now'); return /warn/.test(h.className) && /AI is off/.test(h.textContent) && document.querySelector('#studioPop .sp-services').classList.contains('idle') && /rules/.test(document.querySelector('#crewSetBtn .conn-dot').className); }));
      await p.click('#studioPop [data-sp="pref"][data-val="auto"]'); await p.waitForTimeout(200);
      check('no page errors in the crew-level flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // 7. customizing the crew, and locks
    {
      const p = await page(browser, base, { model: false });
      await p.newBoard();
      await p.type('/claim Kept claim'); await p.waitForTimeout(600);
      await p.type('/note Kept note'); await p.waitForTimeout(600);
      const [claim, note] = await p.evaluate(() => [board.nodes.find(n => n.type === 'idea').id, board.nodes.find(n => n.type === 'note').id]);
      const run = (acts, extra = {}) => p.evaluate(([a, x]) => { const r = dispatchCanvasActions(a, { by: 'critic', ...x }); return { created: r.createdNodes.map(n => ({ id: n.id, status: n.status })), proposed: r.proposed.length, skipped: r.skipped.length, locked: r.skipped.filter(s => s.locked).length }; }, [acts, extra]);
      let r = await run([{ action: 'create', cardType: 'note', title: 'Asked', text: 'arrives as a draft' }]);
      check('by default, agent cards arrive as drafts', r.created.length === 1 && r.created[0].status === 'sketch', JSON.stringify(r));
      await p.click('#crewSetBtn'); await p.waitForTimeout(300);
      await p.click('#crewPop [data-crew-custom]'); await p.waitForTimeout(400);
      check('Customize shows a segmented control per action', await p.evaluate(() => document.querySelectorAll('dialog[open] .sp-seg').length === 4));
      check('deleting cannot be set to Do it', await p.evaluate(() => [...document.querySelectorAll('dialog[open] [data-au="delete"]')].map(b => b.dataset.v).join() === 'suggest,never'));
      await p.click('dialog[open] [data-au="edit"][data-v="direct"]'); await p.waitForTimeout(200);
      check('a custom choice takes effect and the crew label says Custom', await p.evaluate(() => perm('edit') === 'direct' && autonomyCustom && /Custom/.test(document.getElementById('crewSetBtn').getAttribute('aria-label'))));
      await run([{ action: 'edit', target: claim, field: 'text', value: 'Edited directly' }]);
      check('edit set to Do it applies to a kept card', await p.evaluate(id => byId(id).text === 'Edited directly', claim));
      await p.click('dialog[open] [data-au="edit"][data-v="never"]'); await p.click('dialog[open] [data-au="delete"][data-v="never"]'); await p.waitForTimeout(200);
      r = await run([{ action: 'edit', target: claim, field: 'text', value: 'nope' }, { action: 'erase', targets: [note] }]);
      check('edit and delete set to Never change nothing', r.skipped === 2 && r.proposed === 0 && await p.evaluate(([c, n]) => byId(c).text === 'Edited directly' && !!byId(n), [claim, note]));
      await p.click('dialog[open] [data-au-reset]'); await p.waitForTimeout(200);
      check('Reset returns to the preset', await p.evaluate(() => !autonomyCustom && JSON.stringify(autonomy) === JSON.stringify(presetFor(crewAct))));
      await p.click('dialog[open] [data-d="close"]').catch(() => {}); await p.evaluate(() => document.querySelector('dialog[open]')?.close()); await p.waitForTimeout(200);
      // locks
      await p.evaluate(id => { select([id]); openCardMenu(byId(id), 200, 200); }, claim); await p.waitForTimeout(200);
      check('the card menu offers Lock', await p.evaluate(() => !!document.querySelector('#cardMenu [data-cm="lock"]')));
      await p.click('#cardMenu [data-cm="lock"]'); await p.waitForTimeout(300);
      check('a locked card shows a lock', await p.evaluate(id => byId(id).locked === true && !!document.querySelector(`[data-id="${id}"] .lock-badge`), claim));
      r = await run([{ action: 'edit', target: claim, field: 'text', value: 'agent rewrite' }, { action: 'erase', targets: [claim] }]);
      check('agents cannot change or suggest changes to a locked card', r.locked === 2 && r.proposed === 0 && await p.evaluate(id => byId(id).text === 'Edited directly' && openProps(id).length === 0, claim));
      await run([{ action: 'edit', target: claim, field: 'text', value: 'Changed because you asked' }], { userIntent: true });
      check('your own words still change a locked card', await p.evaluate(id => byId(id).text === 'Changed because you asked', claim));
      check('the Snapshot lane starts locked', await p.evaluate(() => lockedBays().includes(3) && document.querySelector('[data-bay-lock="3"]')?.getAttribute('aria-pressed') === 'true'));
      await p.evaluate(() => setCrewLevel('collab'));
      const snap = await p.evaluate(() => dispatchCanvasActions([{ action: 'create', cardType: 'note', title: 'In Snapshot', text: 'snapshot card', pos: { x: 3100, y: 300 } }], { by: 'wright' }).createdNodes[0].id);
      r = await run([{ action: 'edit', target: snap, field: 'text', value: 'changed later' }]);
      check('kept cards in a locked lane are protected', r.locked === 1 && await p.evaluate(id => byId(id).text === 'snapshot card', snap));
      await p.evaluate(() => toggleBayLock(3)); await p.waitForTimeout(200);
      r = await run([{ action: 'edit', target: snap, field: 'text', value: 'changed later' }]);
      check('unlocking the lane lets suggestions through again', r.locked === 0 && r.proposed === 1);
      check('Copilot is told about locks and permissions', await p.evaluate(() => /Locked cards/.test(autonomyPromptLine()) && /deleting cards the designer has kept: it becomes a suggestion/.test(autonomyPromptLine())));
      check('no page errors in the customize and lock flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // 8. Task Island: real crew work shows at the top, says what arrived, and can be stopped
    {
      const p = await page(browser, base);
      await p.newBoard();
      const island = () => p.evaluate(() => { const el = document.getElementById('island'), t = ISL.tasks.filter(t => t.kind === 'directions').at(-1); return { mode: el.dataset.mode, text: el.innerText.replace(/\s+/g, ' '), state: t && t.state, made: t ? t.nodeIds.length : 0 }; });
      check('the island idles when nothing runs', (await island()).mode === 'idle');
      await p.type('Island idea'); await p.waitForTimeout(800);
      const id = await p.evaluate(() => board.nodes.find(n => n.type === 'idea').id);
      queue = [{ id: 'isl1', match: '"directions"', text: dirs('Isl'), delay: 1800 }];
      await p.evaluate(id => select([id]), id); await p.type('/fork 3'); await p.waitForTimeout(1000);
      const run = await island();
      check('a running crew move shows on the island', run.mode === 'compact' && /Strategist/.test(run.text) && run.state === 'running', JSON.stringify(run));
      await p.idle();
      const end = await island();
      check('when it finishes the island says what arrived', end.mode === 'flash' && /3 directions drafted/.test(end.text) && end.made === 3, JSON.stringify(end));
      await p.click('#island [data-isl-show]'); await p.waitForTimeout(400);
      check('Show selects what the task made', await p.evaluate(() => sel.length === 3 && sel.every(id => byId(id).type === 'direction')));
      queue = [{ id: 'isl2', match: '"directions"', text: dirs('Late'), delay: 4000 }];
      await p.evaluate(id => select([id]), id); await p.type('/fork 3'); await p.waitForTimeout(1000);
      await p.click('#island [data-isl="toggle"]'); await p.waitForTimeout(400);
      await p.click('#island [data-isl-stop]'); await p.idle(); await p.waitForTimeout(3000);
      const st = await p.evaluate(() => ({ state: ISL.tasks.filter(t => t.kind === 'directions').at(-1)?.state, busy: crewBusy(), late: board.nodes.some(n => /Late/.test(n.title || '')) }));
      check('Stop on the island cancels the move', st.state === 'cancelled' && !st.busy && !st.late, JSON.stringify(st));
      check('no page errors around the island', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
  } finally {
    await browser.close(); srv.close();
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

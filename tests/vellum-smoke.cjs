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
const launcher = { on: false, posts: [] }; // stands in for serve_vellum.py's /launch/studio-ai

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/Vellum-Lumen.html'))) {
        rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp);
      }
      if (req.url === '/launch/studio-ai' && launcher.on) {
        if (req.method === 'POST') launcher.posts.push({ client: req.headers['x-studio-client'], origin: req.headers.origin, host: req.headers.host });
        rsp.writeHead(200, { 'Content-Type': 'application/json' });
        return rsp.end(JSON.stringify(req.method === 'POST' ? { ok: true, started: true } : { available: true }));
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
          rsp.on('error', () => {});
          const txt = typeof hit.text === 'string' ? hit.text : JSON.stringify(hit.text);
          for (let k = 0; k < txt.length; k += 40) {
            if (rsp.destroyed) return;
            rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: txt.slice(k, k + 40) } }] }) + '\n\n');
            // `stall`: send the first chunk, then go quiet, as a slow model does mid-answer
            if (hit.stall && k === 0) await new Promise(r => setTimeout(r, hit.stall));
          }
          if (!rsp.destroyed) rsp.end('data: [DONE]\n\n');
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
  // Studio AI may be running on this machine; the suite must not depend on it (section 9 routes its own)
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
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
      check('Crew popover: header uses the connection summary, the waiting thought comes first, lock icons only on locked lanes', await p.evaluate(() => { const pop = document.getElementById('crewPop'); const kids = [...pop.children]; const locks = [...pop.querySelectorAll('.crew-lock')]; return !!pop.querySelector('.cp-pop-head .sp-now .sp-now-mode') && kids[1]?.classList.contains('crew-wait') && locks.every(b => !!b.querySelector('.ico') === (b.getAttribute('aria-pressed') === 'true')) && !!pop.querySelector('.crew-axis-h [data-crew-custom]'); }));
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
      check('the connection popover is only about the connection', /Connection/.test(conn) && /Using Cloud API/.test(conn) && !/Unasked thoughts|Agent permissions|Auto follow-up/.test(conn), conn.slice(0, 160));
      // honest connection status: a real test request, not "On"; the header answers what is in use
      await p.waitForFunction(() => document.querySelector('#studioPop [data-api-health="ok"]'), null, { timeout: 4000 }).catch(() => {});
      const ok = await p.evaluate(() => ({ h: document.querySelector('#studioPop [data-api-health]')?.textContent, head: document.querySelector('#studioPop .sp-now')?.className, headTxt: document.querySelector('#studioPop .sp-now')?.textContent, acts: [...document.querySelectorAll('#studioPop .sp-mini')].map(b => b.textContent), dot: document.querySelector('#crewSetBtn .conn-dot').className, note: document.querySelector('#studioPop .sp-mode-note')?.textContent, order: [...document.querySelectorAll('#studioPop .sp-svc-top > span:first-child')].map(s => s.textContent) }));
      check('opening Connection tests the Cloud API for real and the header names the engine in use', ok.h === 'Connected' && /Using Cloud API/.test(ok.headTxt) && /ok/.test(ok.head) && probes.length >= 1 && probes.at(-1).auth === 'Bearer smoke' && requests.every(r => !/^ping$/.test(r.full)), JSON.stringify(ok));
      check('actions match real state (no Start while Studio AI is closed), Auto is explained, media is grouped apart', ok.acts.join() === 'Edit' && /Local AI.*Cloud API/.test(ok.note || '') && ok.order.join() === 'Local AI,Cloud API,Media Studio', JSON.stringify(ok));
      probe.status = 401;
      await p.click('#studioPop [data-sp="refresh"]');
      await p.waitForFunction(() => document.querySelector('#studioPop [data-api-health="auth"]'), null, { timeout: 4000 }).catch(() => {});
      const bad = await p.evaluate(() => ({ h: document.querySelector('#studioPop [data-api-health]')?.textContent, head: document.querySelector('#studioPop .sp-now').textContent, headCls: document.querySelector('#studioPop .sp-now').className, issueCls: document.querySelector('#studioPop .sp-now-issue')?.className, fix: document.querySelector('#studioPop [data-sp="api"]').outerHTML, dot: document.querySelector('#crewSetBtn .conn-dot').className }));
      check('a rejected key: header says rules are in use first, then why, Fix key is the next step, dot is red', bad.h === 'Authentication failed' && /^Using built-in rules\s*Cloud API authentication failed$/.test(bad.head) && /warn/.test(bad.headCls) && /err/.test(bad.issueCls || '') && /primary/.test(bad.fix) && /Fix key/.test(bad.fix) && /error/.test(bad.dot), JSON.stringify(bad));
      check('routing agrees with the header: a rejected key is skipped, no API request is made', await p.evaluate(async () => { const before = performance.getEntriesByType('resource').filter(e => /chat\/completions/.test(e.name)).length; const r = await viaClaude(() => null, () => 'rules', { studio: () => null, prompt: 'x' }); const after = performance.getEntriesByType('resource').filter(e => /chat\/completions/.test(e.name)).length; return !apiRoutable() && aiSource().kind !== 'api' && r.engine === 'local' && after === before; }));
      check('Test all connections never loads the local model', await p.evaluate(async () => { const urls = []; const f = window.fetch; window.fetch = (u, o) => { urls.push(String(u)); return f(u, o); }; connManualCheck = true; try { await refreshStudioFromPop({ wake: false }); } finally { connManualCheck = false; window.fetch = f; } return !urls.some(u => /studio\/start/.test(u)) && urls.some(u => /chat\/completions/.test(u)); }));
      probe.status = 200;
      queue.push({ id: 'heal', match: 'heal-me', text: 'fine' });
      await p.evaluate(() => apiChat({ prompt: 'heal-me' }));
      await p.waitForTimeout(200);
      check('a real successful call clears the error', await p.evaluate(() => apiHealthNow().k === 'ok' && /ok/.test(document.querySelector('#crewSetBtn .conn-dot').className)));
      check('while Local AI is starting, the header and the trigger both name the engine actually answering (Cloud API)', await p.evaluate(() => { const s = studioState; studioState = { ...s, status: 'loading' }; const c = connSummary(), h = connHealth(), src = aiSource(); studioState = s; return c.engine === 'api' && src.kind === 'api' && src.live && c.mode.startsWith('Using Cloud API') && /Local AI starting/.test(c.issue) && h.k === 'ok'; }));
      await p.evaluate(() => { apiCfg = { ...apiCfg, baseUrl: 'http://127.0.0.1:9/v1' }; });
      await p.click('#studioPop [data-sp="refresh"]');
      await p.waitForFunction(() => document.querySelector('#studioPop [data-api-health="unreachable"]'), null, { timeout: 6000 }).catch(() => {});
      check('an unreachable host reads "Unreachable" with Edit as the next step', await p.evaluate(() => document.querySelector('#studioPop [data-api-health]')?.textContent === 'Unreachable' && /primary/.test(document.querySelector('#studioPop [data-sp="api"]').className)));
      check('after the retry window the header and routing agree again (Using Cloud API · Retrying, no red)', await p.evaluate(() => { const h0 = apiHealth; const before = connSummary(); apiHealth = { ...h0, at: Date.now() - 61000 }; const after = connSummary(); apiHealth = h0; return before.engine === 'rules' && before.tone === 'err' && after.engine === 'api' && after.tone === 'busy' && /Retrying/.test(after.issue); }));
      await p.click('#studioPop [data-sp="pref"][data-val="local"]'); await p.waitForTimeout(200);
      check('Rules only: the header says plainly AI is off, and the unused engines step back', await p.evaluate(() => { const h = document.querySelector('#studioPop .sp-now'); return /warn/.test(h.className) && /^Using built-in rules\s*AI turned off$/.test(h.textContent) && document.querySelector('#studioPop .sp-services').classList.contains('idle') && /rules/.test(document.querySelector('#crewSetBtn .conn-dot').className); }));
      await p.click('#studioPop [data-sp="pref"][data-val="auto"]'); await p.waitForTimeout(200);
      // Local AI Start: a button when the local server can open Studio AI, the instruction otherwise
      check('without a launcher, Local AI explains how to open it and offers no Start', await p.evaluate(() => { const r = [...document.querySelectorAll('#studioPop .sp-svc')][0]; return /Start Studio AI\.command/.test(r.textContent) && !r.querySelector('[data-sp="launch-studio"],[data-sp="wake"]'); }));
      launcher.on = true;
      await p.evaluate(() => { studioLauncher = null; toggleStudioPopover(false); });
      await p.click('#crewModeBtn');
      await p.waitForSelector('#studioPop [data-sp="launch-studio"]', { timeout: 3000 }).catch(() => {});
      check('with a launcher, Local AI offers Start instead of the command line', await p.evaluate(() => { const r = [...document.querySelectorAll('#studioPop .sp-svc')][0]; return !!r.querySelector('[data-sp="launch-studio"]') && !/\.command/.test(r.textContent); }));
      await p.click('#studioPop [data-sp="launch-studio"]'); await p.waitForTimeout(300);
      const launched = await p.evaluate(() => [...document.querySelectorAll('#studioPop .sp-svc')][0].textContent);
      check('Start asks the page\'s own server to open Studio AI and shows Starting…', launcher.posts.length === 1 && launcher.posts[0].client === 'canvas' && launcher.posts[0].origin === 'http://' + launcher.posts[0].host && /Starting…/.test(launched), JSON.stringify({ posts: launcher.posts, launched }));
      await p.evaluate(() => { studioLaunching = 0; }); launcher.on = false;
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
      check('a custom setup reads as plain grouped sentences', await p.evaluate(() => { const s = autonomy; setAutonomy({ create: 'direct', link: 'direct', edit: 'direct', delete: 'suggest' }); const txt = autonomyPlain(); autonomy = s; return txt === 'Custom. Does directly: create, link and edit your cards. Asks first: delete your cards.'; }));
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
      const st = await p.evaluate(() => ({ state: ISL.tasks.filter(t => t.kind === 'directions').at(-1)?.state, busy: crewBusy(), late: board.nodes.some(n => /Late/.test(n.title || '')), rules: board.nodes.filter(n => n.type === 'direction').length !== 3 }));
      check('Stop on the island cancels the move', st.state === 'cancelled' && !st.busy && !st.late, JSON.stringify(st));
      check('Stop does not fall back to built-in rules', !st.rules, JSON.stringify(st));
      check('no page errors around the island', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // 9. Local AI: JSON asked for in words, small-model prompt and repair, questions first for an open idea,
    //    and running out of time is not Stop
    {
      const p = await page(browser, base, { model: false });
      const gens = [];
      let local = () => ({ text: '', delay: 0 }); // decides each Local AI reply from the request
      const kindOf = b => { const u = JSON.stringify(b.messages || []); return /three quick questions/.test(u) ? 'ask' : /Fix only these problems/.test(u) ? 'fix' : 'fork'; };
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
      await p.route('http://127.0.0.1:59631/**', async route => {
        const req = route.request(), url = req.url();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        if (/\/studio\/health/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ status: 'ready', model: 'smoke-local', modelId: 'smoke', vision: true, models: [] }) });
        if (/\/studio\/generate/.test(url)) {
          const body = JSON.parse(req.postData() || '{}'); body.kind = kindOf(body); gens.push(body);
          const { text, delay } = local(body);
          if (delay) await new Promise(r => setTimeout(r, delay));
          const sse = String(text || ' ').match(/[\s\S]{1,40}/g).map(c => 'data: ' + JSON.stringify({ choices: [{ delta: { content: c } }] }) + '\n\n').join('') + 'data: [DONE]\n\n';
          return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: cors, body: sse }).catch(() => {});
        }
        return route.fulfill({ status: 404, headers: cors, body: '' });
      });
      await p.evaluate(async () => { await checkStudioHealth({ wake: false, quiet: true }); window.__toasts = []; const t = toast; toast = (m, ...a) => { __toasts.push(String(m)); return t(m, ...a); }; });
      check('Local AI reads as ready', await p.evaluate(() => studioState.status === 'ready' && connSummary().engine === 'local'));
      const Q = { questions: [{ q: 'Who do you play?', options: ['A translator in 1930s Shanghai', 'A dock worker', 'A rich heir', 'A street vendor'] }, { q: 'When is it?', options: ['1937', 'The 1990s', 'Today', '2049'] }, { q: 'How does it play?', options: ['Conversations', 'Tactics', 'Running a business', 'Investigation'] }] };
      // answer: true picks the first option of each question, false skips, undefined expects no questions
      const forkOn = async (label, answer) => {
        await p.newBoard(); await p.type(label); await p.waitForTimeout(800);
        const id = await p.evaluate(() => board.nodes.find(n => n.type === 'idea').id);
        await p.evaluate(id => select([id]), id); await p.type('/fork 3');
        await p.waitForFunction(() => document.querySelector('dialog[open][data-clarify]') || board.nodes.some(n => n.type === 'direction'), null, { timeout: 20000 }).catch(() => {});
        const asked = await p.evaluate(() => document.querySelector('dialog[open][data-clarify]') ? [...document.querySelectorAll('[data-clarify-q] > b')].map(b => b.textContent) : null);
        if (asked) await p.evaluate(a => { const d = document.querySelector('dialog[open][data-clarify]'); if (a) { d.querySelectorAll('[data-clarify-q]').forEach(g => g.querySelector('[data-clarify-opt]').click()); d.querySelector('[data-clarify-go]').click(); } else d.querySelector('[data-clarify-skip]').click(); }, !!answer);
        await p.idle();
        return p.evaluate(asked => ({ asked, titles: board.nodes.filter(n => n.type === 'direction').map(n => n.title).join(','), engines: board.nodes.filter(n => n.type === 'direction').map(n => n.prov?.engine).join(','), task: ISL.tasks.filter(t => t.kind === 'directions').at(-1)?.state, toasts: __toasts.splice(0), clarified: board.nodes.find(n => n.type === 'idea')?.clarified || null }), asked);
      };
      const lastFork = () => gens.filter(g => g.kind === 'fork').at(-1) || {};
      const userText = g => JSON.stringify((g.messages || []).filter(m => m.role === 'user').map(m => m.content));
      // an open idea: Strategist asks three questions first; the answers go into the fork; a small model
      // answering in prose around fenced JSON still gives directions
      local = b => ({ text: b.kind === 'ask' ? JSON.stringify(Q) : 'Here are three:\n```json\n' + JSON.stringify(dirs('Loc')) + '\n```' });
      let r = await forkOn('Local idea', true);
      check('on Local AI, an open idea gets three one-click questions first', JSON.stringify(r.asked) === JSON.stringify(Q.questions.map(q => q.q)), JSON.stringify(r));
      check("the designer's choices go into the fork and stay on the idea", /The designer chose: Who do you play\? A translator in 1930s Shanghai; When is it\? 1937; How does it play\? Conversations/.test(userText(lastFork())) && r.clarified?.length === 3, userText(lastFork()).slice(0, 400));
      const g = lastFork();
      check('Local AI is asked for plain text, never grammar-constrained JSON', g.response_format?.type === 'text' && g.json === true, JSON.stringify({ rf: g.response_format, json: g.json }));
      check('the JSON instruction is in the system message instead', /JSON object only/.test((g.messages || [])[0]?.content || '') && g.messages[0].role === 'system');
      check('directions arrive from Local AI answering in prose around JSON', r.titles === 'Loc A,Loc B,Loc C' && r.engines === 'model,model,model' && r.task === 'done', JSON.stringify(r));
      // unreadable questions: Strategist uses its own; Skip branches without choices
      local = b => ({ text: b.kind === 'ask' ? 'not json at all' : JSON.stringify(dirs('Own')) });
      r = await forkOn('Shanghai game', false);
      check("when the model's questions can't be read, Strategist asks its own", r.asked?.[0] === 'Who is the player?' && r.asked.length === 3, JSON.stringify(r));
      check('Skip branches without choices', !r.clarified && !/designer chose/i.test(userText(lastFork())) && r.titles === 'Own A,Own B,Own C', JSON.stringify(r));
      // a full idea: no questions; the small-model prompt; one targeted repair of an obvious error
      const bad = { directions: [{ title: 'Settlement Beat', plan: 'You patrol the Settlement in 1935.', test: 'Five players play two shifts; if fewer than three feel watched, it fails.', mode: 'story' }, { title: 'Northern Ledger', plan: 'You smuggle tea in Beijing.', test: 'Six players run three nights; if fewer than one lies, it fails.', mode: 'desk' }, { title: 'Wharf Rats', plan: 'You unload ships on the Huangpu.', test: 'Four players play one night; if fewer than two talk to a foreman, it fails.', mode: 'story' }] };
      local = b => ({ text: JSON.stringify(b.kind === 'fix' ? dirs('Fixed') : bad) });
      r = await forkOn('An RPG set in Shanghai about rival police forces in the 1930s and the translators caught between them.');
      const sf = gens.filter(x => x.kind === 'fork').at(-1), fx = gens.filter(x => x.kind === 'fix').at(-1);
      check('a full idea is branched without questions', !r.asked, JSON.stringify(r.asked));
      check('Local AI gets the small-model Strategist prompt', /Think like a game designer/.test(sf?.messages?.[0]?.content || '') && /stay in Shanghai/.test(userText(sf)) && /the experience it depends on/.test(userText(sf)), userText(sf).slice(0, 300));
      check('obvious errors get one targeted repair', !!fx && /direction 2 is set in Beijing, but the idea is in Shanghai/.test(userText(fx)) && /impossible number/.test(userText(fx)) && r.titles === 'Fixed A,Fixed B,Fixed C', JSON.stringify({ r, fix: fx && userText(fx).slice(-300) }));
      check('one closing question, no promised work', await p.evaluate(() => tidySmallReply("Yes.\n\n- **A:** b\n\nWhat first?\n\n— or —\n\nDo you want X?") === "Yes.\n\n- **A:** b\n\nWhat first?" && tidySmallReply("Yes.\n\n(If this is what you want, I'll start drafting the structure.)\n\nWhich one? Or that one?") === "Yes.\n\nWhich one?"));
      check('a famous street names its city (Wangfujing is in Beijing; Nanjing Road is in Shanghai)', await p.evaluate(() => placesIn('You patrol Wangfujing Street').join() === 'Beijing' && placesIn('a shop on Nanjing Road in Shanghai').join() === 'Shanghai'));
      check('a test that checks memory is sent back', await p.evaluate(() => forkProblems({ directions: [{ title: 'A', plan: 'p', test: 'If fewer than two remember the route, it fails.' }] }, 1, 'Shanghai').some(x => /remember/.test(x))));
      check("Wright's prototype on Local AI is checked for things its era can't hold", await p.evaluate(() => { const ok = [1, 2, 3, 4].map(i => ({ title: 't' + i, body: 'A neighbour waits by the telephone.' })); return buildProblems({ title: 'T', items: [...ok.slice(0, 3), { title: 'x', body: 'Your phone needs charging.' }] }, 'A lilong in 1937 Shanghai').some(x => /does not exist in 1937/.test(x)) && buildProblems({ title: 'T', items: ok }, 'A lilong in 1937 Shanghai').length === 0; }));
      // the time limit runs out: built-in rules answer, and the designer is told why
      local = () => ({ text: JSON.stringify(dirs('Slow')), delay: 3000 });
      await p.evaluate(() => { AI_TIMEOUT_MS = 1500; });
      r = await forkOn('Slow idea', false);
      check('a Local AI timeout falls back to built-in rules instead of failing', r.titles === 'Walk it through,Lay it all out,Cut to one moment' && r.engines === 'rules,rules,rules' && r.task === 'done', JSON.stringify(r));
      check('and says which engine ran out of time and which answered', r.toasts.some(t => /^Local AI took longer than 2 s, so built-in rules answered instead\.$/.test(t)), JSON.stringify(r.toasts));
      check('no page errors in the Local AI flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // 10. Copilot: a timeout keeps the partial answer and says it is cut off; Stop still just stops
    {
      const p = await page(browser, base);
      await p.newBoard();
      const last = () => p.evaluate(() => { const m = board.copilot.at(-1); return { text: m.text, cutOff: !!m.cutOff, streaming: !!m.streaming }; });
      {
        const ids = await p.evaluate(() => { const idea = node('idea', { text: 'An RPG set in Shanghai', by: 'you', status: 'ink' }, { x: 900, y: 300 }); const mk = (l, t, x) => { const n = node('direction', { idea: idea.id, letter: l, title: t, text: x, test: 'Test ' + l, mode: 'story', by: 'muse', status: 'sketch' }, { x: 1300, y: 100 }); edge(idea.id, n.id, 'derive', 'live'); return n.id; }; const a = mk('A', 'Lane House Chronicle', 'One lilong across 1925, 1937 and 1949.'); const b = mk('B', 'Concession Ledger Sim', 'Run a trading house.'); byId(a).vote = 'up'; renderAll(); return { a, b }; });
        queue = [{ id: 'rel', match: 'related-check', text: 'Fine.' }];
        await p.evaluate(b => sendCopilotMessage('related-check: how do these compare?', [b]), ids.b);
        const sys = requests.filter(x => x.matched === 'rel').at(-1)?.full || '';
        check("Copilot sees the selected card's sibling drafts in full", /Cards connected to the selection/.test(sys) && /Lane House Chronicle.*One lilong across 1925, 1937 and 1949/s.test(sys) && /draft, not kept yet; the designer liked it/.test(sys), sys.slice(sys.indexOf('Cards connected'), sys.indexOf('Cards connected') + 400));
        await p.newBoard();
      }
      await p.evaluate(() => { AI_TIMEOUT_MS = 1500; });
      queue = [{ id: 'cut', match: 'cutoff-question', text: 'Open in the interrogation room at night, with the rain on the window and the clerk', stall: 4000 }];
      await p.evaluate(() => sendCopilotMessage('cutoff-question: where should the game open?'));
      let m = await last();
      check('a Copilot answer that runs out of time keeps what arrived', /^Open in the interrogation room/.test(m.text), JSON.stringify({ m, req: requests.slice(-3).map(x => x.matched) }));
      check('and says plainly that it is cut off', m.cutOff && /Cut off:\*\* Cloud API took longer than 2 s\. Ask again to continue\.$/.test(m.text), JSON.stringify(m));
      await p.evaluate(() => { AI_TIMEOUT_MS = 20000; });
      queue = [{ id: 'stop', match: 'stop-question', text: 'A partial answer the designer chose to stop, and then it goes on much longer', stall: 4000 }];
      await p.evaluate(() => { sendCopilotMessage('stop-question: who is the translator?'); });
      await p.waitForTimeout(1200);
      await p.evaluate(() => stopCopilot()); await p.waitForTimeout(600);
      m = await last();
      check('Stop in Copilot is not reported as a timeout', !m.cutOff && !/Cut off/.test(m.text) && !m.streaming && /^A partial answer/.test(m.text), JSON.stringify(m));
      check('no page errors in the Copilot timeout flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // 11. A model that can't answer is said out loud, and the designer's own words drive adopt and build
    {
      const p = await page(browser, base);
      await p.newBoard();
      await p.evaluate(() => { window.__toasts = []; const t = toast; toast = (m, ...a) => { __toasts.push(String(m)); return t(m, ...a); }; });
      await p.type('Words idea'); await p.waitForTimeout(800);
      const idea = await p.evaluate(() => board.nodes.find(n => n.type === 'idea').id);
      // an empty account: rules answer, and the toast, the island and the header all say why
      queue = [{ id: 'broke', match: '"directions"', status: 402 }];
      await p.evaluate(id => select([id]), idea); await p.type('/fork 3'); await p.idle();
      const broke = await p.evaluate(() => ({ titles: board.nodes.filter(n => n.type === 'direction').map(n => n.title).join(','), toasts: __toasts.splice(0), note: ISL.tasks.filter(t => t.kind === 'directions').at(-1)?.note, health: apiHealthNow().k, routable: apiRoutable(), issue: connSummary().issue, label: apiHealthLabel().txt }));
      check('an out-of-credits Cloud API falls back to built-in rules', broke.titles === 'Walk it through,Lay it all out,Cut to one moment', JSON.stringify(broke));
      check('and says so in a toast', broke.toasts.includes('Cloud API is out of credits (HTTP 402), so built-in rules answered instead.'), JSON.stringify(broke.toasts));
      check('the island says built-in rules answered', broke.note === 'Built-in rules answered', JSON.stringify(broke.note));
      check('the header stops claiming the Cloud API is in use', broke.health === 'credits' && !broke.routable && broke.issue === 'Cloud API out of credits' && broke.label === 'Out of credits', JSON.stringify(broke));
      check('a passing re-check brings the Cloud API back', await p.evaluate(async () => { await testApi({ quiet: true }); return apiRoutable() && apiHealthNow().k === 'ok'; }));
      // drafts from a working model, kept
      await p.evaluate(id => { board.nodes = board.nodes.filter(n => n.type !== 'direction'); board.edges = board.edges.filter(e => e.a !== id); renderAll(); select([id]); }, idea);
      queue = [{ id: 'w', match: '"directions"', text: dirs('W') }];
      await p.type('/fork 3'); await p.idle();
      await p.evaluate(() => board.nodes.filter(n => n.type === 'direction').forEach(n => { n.status = 'ink'; })); await p.evaluate(() => { renderAll(); persist(); });
      const dirA = await p.evaluate(() => board.nodes.find(n => n.type === 'direction' && n.letter === 'A').id);
      await p.evaluate(id => select([id]), dirA);
      await p.type('Should we adopt this?'); await p.idle();
      check('a question about adopting does not adopt', await p.evaluate(id => !board.adopted[byId(id).idea], dirA));
      await p.evaluate(() => { const c = document.querySelector('[data-cp=close]'); c && c.click(); });
      await p.evaluate(id => select([id]), dirA);
      await p.type('Adopt this direction'); await p.waitForTimeout(800);
      check('typing "Adopt this direction" adopts it', await p.evaluate(id => board.adopted[byId(id).idea] === id, dirA));
      // the build request reaches Wright in the designer's words
      const spec = { title: 'Interrogation at Louza', kicker: 'k', lede: 'l', items: [1, 2, 3, 4].map(i => ({ title: 'Beat ' + i, body: 'b', tag: 't' })), cta: 'Begin' };
      queue = [{ id: 'build', match: 'The designer asked for: "Build a prototype of the opening interrogation scene"', text: spec }];
      await p.evaluate(id => select([id]), dirA);
      await p.type('Build a prototype of the opening interrogation scene'); await p.idle();
      const proof = await p.evaluate(() => board.nodes.find(n => n.type === 'proof')?.spec?.title);
      check("Wright builds what the designer asked for, in the designer's words", proof === 'Interrogation at Louza', JSON.stringify({ proof, last: requests.at(-1)?.matched }));
      check('no page errors in these flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
  } finally {
    await browser.close(); srv.close();
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

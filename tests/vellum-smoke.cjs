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
          requests.push({ matched: hit && hit.id, prompt: flat.slice(0, 200) });
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
      // undoing the agent's batch withdraws its suggestion
      await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
      check("Undo withdraws the agent's suggestion", await p.evaluate(id => !!byId(id) && openProps(id).length === 0, id));
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
  } finally {
    await browser.close(); srv.close();
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

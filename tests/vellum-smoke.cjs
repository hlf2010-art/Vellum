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
const notionPosts = [];
const salesCsv = { text: 'Rank,Region,Q1\n1,North,120\n2,South,90' }; // the refresh check changes it
const launcher = { on: false, posts: [] }; // stands in for serve_vellum.py's /launch/studio-ai

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/Vellum-Lumen.html'))) {
        rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp);
      }
      if (req.url === '/data/sales.csv') { rsp.writeHead(200, { 'Content-Type': 'text/csv' }); return rsp.end(salesCsv.text); }
      if (req.method === 'POST' && req.url === '/notion/database') { // stands in for serve_vellum.py's Notion reader
        let body = ''; req.on('data', c => body += c); req.on('end', () => {
          const b = JSON.parse(body || '{}'); notionPosts.push({ ...b, client: req.headers['x-studio-client'] });
          rsp.writeHead(200, { 'Content-Type': 'application/json' });
          rsp.end(JSON.stringify(b.token !== 'ntn_good' ? { ok: false, error: 'bad_token' } : /aaaaaaaa/.test(b.ref) ? { ok: false, error: 'not_shared' }
            : { ok: true, id: 'db1', title: 'Sprint board', url: 'https://www.notion.so/acme/db1', columns: ['Name', 'Status', 'Points'], rows: [['Ship tables', 'Done', '5'], ['Notion import', 'In progress', '3']], more: true }));
        }); return;
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
// WCAG contrast of every text node inside `scope`, backgrounds composited up the ancestor chain (opacity included).
const LEGIBILITY = scope => {
  const cv = document.createElement('canvas').getContext('2d');
  const parse = c => { cv.fillStyle = '#000'; cv.fillStyle = c; const s = cv.fillStyle; if (s.startsWith('#')) { const n = parseInt(s.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 1]; } const m = s.match(/-?[\d.]+(e-?\d+)?/g).map(Number); if (/^color\(/.test(s)) return [m[0] * 255, m[1] * 255, m[2] * 255, s.includes('/') ? m[3] : 1]; return [m[0], m[1], m[2], m[3] ?? 1]; };
  const over = (a, b) => [0, 1, 2].map(i => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const bgOf = el => { const chain = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) chain.push(e); let c = parse(getComputedStyle(document.body).backgroundColor); for (const e of chain.reverse()) { const b = parse(getComputedStyle(e).backgroundColor); if (b[3] > 0) c = over(b, c); } return c; };
  const opa = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const out = [];
  document.querySelectorAll(scope + ' *').forEach(el => {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
    if (el.closest('[aria-hidden="true"]')) return; // decorative (e.g. footer separators)
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    const cs = getComputedStyle(el), bg = bgOf(el), fg = parse(el instanceof SVGElement ? cs.fill : cs.color), px = parseFloat(cs.fontSize);
    const need = px >= 24 || (parseInt(cs.fontWeight) >= 700 && px >= 18.66) ? 3 : 4.5;
    const v = ratio(over([fg[0], fg[1], fg[2], fg[3] * opa(el)], bg), bg);
    if (v < need) out.push(`${v.toFixed(2)} "${el.textContent.trim().slice(0, 30)}"`);
  });
  return out;
};
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }
const dirs = tag => ({ directions: ['A', 'B', 'C'].map(l => ({ title: `${tag} ${l}`, plan: `Plan ${l}.`, test: `Test ${l}.`, mode: 'story' })) });

async function page(browser, base, { model = true, theme = 'dark' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
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
      check('Crew popover: title only unless the crew is held back, the waiting thought comes first, lock icons only on locked lanes', await p.evaluate(() => { const pop = document.getElementById('crewPop'); const kids = [...pop.children]; const locks = [...pop.querySelectorAll('.crew-lock')]; return pop.querySelector('.cp-pop-head').textContent.trim() === 'Crew' && kids[1]?.classList.contains('crew-wait') && locks.every(b => !!b.querySelector('.ico') === (b.getAttribute('aria-pressed') === 'true')) && !!pop.querySelector('.crew-axis-h [data-crew-custom]'); }));
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
      check('the connection popover is only about the connection, and says nothing twice', /Connection/.test(conn) && !/Unasked thoughts|Agent permissions|Auto follow-up/.test(conn) && (conn.match(/gpt-5|smoke/g) || []).length <= 1 && !/Runs on this computer|OpenAI-compatible key/.test(conn), conn.slice(0, 200));
      // honest connection status: a real test request, not "On"; the header answers what is in use
      await p.waitForFunction(() => document.querySelector('#studioPop [data-api-health="ok"]'), null, { timeout: 4000 }).catch(() => {});
      const ok = await p.evaluate(() => ({ h: document.querySelector('#studioPop [data-api-health]')?.textContent, headTxt: document.querySelector('#studioPop .sp-head').textContent.trim(), sub: document.querySelector('#studioPop .sp-ai small')?.textContent || '', acts: [...document.querySelectorAll('#studioPop .sp-mini')].map(b => b.textContent), dot: document.querySelector('#crewSetBtn .conn-dot').className, sw: document.querySelector('#studioPop .sp-ai [role="switch"]')?.getAttribute('aria-checked'), first: !!document.querySelector('#studioPop .sp-first'), order: [...document.querySelectorAll('#studioPop .sp-svc-top > span:first-child')].map(s => s.textContent), apiDetail: [...document.querySelectorAll('#studioPop .sp-svc')][1]?.querySelector('.sp-svc-sub')?.textContent }));
      check('opening Connection tests the Cloud API for real; the engine in use says "In use" once, the header is just the title', ok.h === 'In use' && ok.headTxt === 'Connection' && ok.sub === '' && ok.apiDetail === 'smoke' && probes.length >= 1 && probes.at(-1).auth === 'Bearer smoke' && requests.every(r => !/^ping$/.test(r.full)), JSON.stringify(ok));
      check('actions match real state (no Start while Studio AI is closed), the AI switch leads the engines, no "Use first" with one engine, media is grouped apart', ok.acts.join() === 'Edit' && ok.sw === 'true' && !ok.first && ok.order.join() === 'Local AI,Cloud API,Media Studio', JSON.stringify(ok));
      probe.status = 401;
      await p.click('#studioPop [data-sp="refresh"]');
      await p.waitForFunction(() => document.querySelector('#studioPop [data-api-health="auth"]'), null, { timeout: 4000 }).catch(() => {});
      const bad = await p.evaluate(() => ({ h: document.querySelector('#studioPop [data-api-health]')?.textContent, cls: document.querySelector('#studioPop [data-api-health]')?.className, headTxt: document.querySelector('#studioPop .sp-head').textContent.trim(), sub: document.querySelector('#studioPop .sp-ai small')?.textContent || '', fix: document.querySelector('#studioPop [data-sp="api"]').outerHTML, dot: document.querySelector('#crewSetBtn .conn-dot').className }));
      check('a rejected key: said once on its row (red, Fix key next), the fallback said once under the switch, dot is red', bad.h === 'Authentication failed' && /err/.test(bad.cls) && bad.headTxt === 'Connection' && bad.sub === 'Using built-in rules for now' && /primary/.test(bad.fix) && /Fix key/.test(bad.fix) && /error/.test(bad.dot), JSON.stringify(bad));
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
      await p.click('#studioPop [data-sp="ai"]'); await p.waitForTimeout(200);
      check('AI off: the switch says it, with no extra text; the engines step back', await p.evaluate(() => document.querySelector('#studioPop .sp-head').textContent.trim() === 'Connection' && !document.querySelector('#studioPop .sp-ai small') && document.querySelector('#studioPop [data-sp="ai"]').getAttribute('aria-checked') === 'false' && document.querySelector('#studioPop .sp-services').classList.contains('idle') && /rules/.test(document.querySelector('#crewSetBtn .conn-dot').className)));
      check('turning AI back on restores the previous preference; "Use first" appears once both engines exist and sets it', await p.evaluate(async () => { setAiPref('api'); setAiPref('local'); document.querySelector('#studioPop [data-sp="ai"]').click(); const restored = aiPref === 'api'; setAiPref('auto'); studioState = { ...studioState, reachable: true }; renderStudioPop(); const seg = document.querySelector('#studioPop .sp-first'); seg?.querySelector('[data-val="api"]').click(); const chose = aiPref === 'api'; setAiPref('auto'); studioState = { ...studioState, reachable: false }; renderStudioPop(); return restored && !!seg && chose && !document.querySelector('#studioPop .sp-first'); }));
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
      const st = await p.evaluate(() => ({ state: ISL.tasks.filter(t => t.kind === 'directions').at(-1)?.state, busy: crewBusy(), late: board.nodes.some(n => /Late/.test(n.title || '')) }));
      check('Stop on the island cancels the move', st.state === 'cancelled' && !st.busy && !st.late, JSON.stringify(st));
      check('no page errors around the island', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // 9. composer: one row for one line; two rows (text full width, controls below) once the text wraps
    {
      const p = await page(browser, base, { model: false });
      const rows = () => p.evaluate(() => { const f = document.querySelector('.line-field').getBoundingClientRect(), i = lineIn.getBoundingClientRect(), s = document.getElementById('sendBtn').getBoundingClientRect();
        return { multi: document.getElementById('line').classList.contains('multi'), share: i.width / f.width, sendRight: f.right - s.right < 16, sendBelow: s.top >= i.bottom - 2 }; });
      await p.click('#lineInput'); await p.keyboard.type('A short line'); await p.waitForTimeout(200);
      const one = await rows();
      check('a short line keeps the one-row composer', !one.multi, JSON.stringify(one));
      await p.keyboard.type(", and then enough words that it has to wrap onto another line in the composer, and then some more"); await p.waitForTimeout(200);
      const two = await rows();
      check('wrapped text gets the full width with the controls underneath', two.multi && two.share > .9 && two.sendRight && two.sendBelow, JSON.stringify(two));
      await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.waitForTimeout(200);
      check('clearing the text returns to one row', !(await rows()).multi);
      check('no page errors in the composer', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
  } finally {
    // 9. legibility: light and dark are designed separately, so both are measured, in the states that change colour
    for (const theme of ['light', 'dark']) {
      const p = await page(browser, base, { theme });
      const bad = [];
      for (const [pref, status] of [['auto', 200], ['auto', 401], ['local', 200]]) {
        probe.status = status;
        await p.evaluate(pr => { setAiPref(pr); apiHealth = { k: 'unknown', sig: '', at: 0 }; toggleStudioPopover(false); }, pref);
        await p.click('#crewModeBtn'); await p.waitForTimeout(900);
        bad.push(...(await p.evaluate(LEGIBILITY, '#studioPop')).map(x => `${pref}/${status}: ${x}`));
      }
      probe.status = 200;
      await p.evaluate(() => { toggleStudioPopover(false); setAiPref('auto'); toggleCrewPop(true); }); await p.waitForTimeout(400);
      bad.push(...(await p.evaluate(LEGIBILITY, '#crewPop')).map(x => `crew: ${x}`));
      await p.evaluate(() => { const d = document.createElement('div'); d.id = 'tblProbe'; d.style.cssText = 'position:fixed;left:20px;top:20px;width:360px;padding:14px;z-index:99999;background:var(--card)';
        d.innerHTML = `<div class="cp-bubble">${mdBlocksHtml('| Option | Cost | Risk | Impact |\n|---|---|---|---|\n| Rebuild | $120k | High | Medium |\n| Patch | $30k | Low | High |').join('')}${mdBlocksHtml('| Task | Status |\n|---|---|\n| A | Done |\n| B | In progress |\n| C | Blocked |\n| D | Not started |').join('')}</div><table class="tbl"><thead><tr><th>Factor</th><th>A</th></tr></thead><tbody><tr><td class="key">Risk</td><td class="win">Low</td></tr></tbody></table>`; document.body.append(d); });
      bad.push(...(await p.evaluate(LEGIBILITY, '#tblProbe')).map(x => `table: ${x}`));
      await p.evaluate(() => { const d = document.getElementById('tblProbe'); d.innerHTML = mdBlocksHtml('| Month | Signups |\n|---|---|\n| Jan | 1,240 |\n| Feb | 1,410 |\n| Mar | 1,720 |').join(''); d.querySelector('[data-tbl-view="chart"]').click(); });
      bad.push(...(await p.evaluate(LEGIBILITY, '#tblProbe')).map(x => `chart: ${x}`));
      const viz = await p.evaluate(() => { const cs = getComputedStyle(document.documentElement), hex = v => { const n = parseInt(cs.getPropertyValue(v).trim().slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
        const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
        const r = (a, b) => { const x = lum(a), y = lum(b); return +((Math.max(x, y) + .05) / (Math.min(x, y) + .05)).toFixed(2); };
        return ['--viz-1', '--viz-good'].map(k => r(hex(k), hex('--card'))); });
      check(`highlighted chart marks stand out from the surface in ${theme} mode (at least 3:1; muted bars are labelled context)`, viz.every(v => v >= 3), JSON.stringify(viz));
      await p.evaluate(() => document.getElementById('tblProbe').remove());
      if (theme === 'light') {
        const tb = await p.evaluate(() => {
          const md = mdBlocksHtml('| Option | Cost | Risk |\n|---|---|---|\n| A | $120k | High |\n| B | $30k | Low |').join('');
          const cmp = renderCopilotVisual({ kind: 'compare', left: 'Rebuild', right: 'Patch', rows: [{ dim: 'Cost', a: '1', b: '2', winner: 'right' }, { dim: 'Time', a: '1', b: '2', winner: 'right' }, { dim: 'Debt', a: '1', b: '2', winner: 'left' }] }, 'm', 0);
          const d = document.createElement('div'); d.innerHTML = md + cmp;
          return { numCols: d.querySelectorAll('thead th.num').length, ratios: [...d.querySelectorAll('td.num')].map(x => x.style.getPropertyValue('--v')), verdict: d.querySelector('caption')?.textContent, wins: d.querySelectorAll('td.win .tbl-win').length, risk: [...d.querySelectorAll('td.lvl .tbl-tag')].map(x => x.style.getPropertyValue('--c')).join(), plain: mdBlocksHtml('| Option | Speed |\n|---|---|\n| A | High |\n| B | Low |').join('').includes('tbl-tag') };
        });
        const sel = await p.evaluate(() => {
          const d = document.createElement('div'); d.innerHTML = mdBlocksHtml('| Option | Cost |\n|---|---|\n| A | $1 |\n| B | $2 |\n| C | $3 |').join(''); document.body.append(d);
          const td = i => d.querySelectorAll('tbody tr')[i].cells[1], click = (el, o = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...o }));
          const names = () => [...d.querySelectorAll('tbody tr.sel')].map(r => tblText(r.cells[0])).join();
          click(td(0)); const one = names(); click(td(2), { metaKey: true }); const two = names(); click(td(0)); click(td(2), { shiftKey: true }); const range = names();
          click(td(1)); const single = names(); const bar = d.querySelector('.tbl-sel').hidden; d.remove(); return { one, two, range, single, bar };
        });
        const card = await p.evaluate(() => {
          const n0 = board.nodes.length, d = document.createElement('div');
          d.innerHTML = `<div class="cp-msg ai" data-cp-msg-id="mX"><div class="cp-bubble">${mdBlocksHtml('Three ways to fix sync:\n\n| Option | Cost | Risk |\n|---|---|---|\n| Rebuild | $120k | High |\n| Patch | $38k | Low |').join('')}</div></div>`; document.body.append(d);
          d.querySelector('[data-tbl-add]').click(); d.remove();
          const n = board.nodes.at(-1), el = document.querySelector(`.card[data-id="${n.id}"]`);
          const r = { added: board.nodes.length - n0, type: n.type, title: n.title, cols: n.data.columns.map(c => c.name).join('|'), rows: n.data.rows.map(x => x.join('/')).join(';'), src: n.data.source.kind, gw: n.gw, text: fullTextOf(n).split('\n').length, rendered: !!el?.querySelector('table.tbl'), id: n.id };
          undo(); r.undone = !board.nodes.some(x => x.id === n.id); redo(); r.redone = board.nodes.some(x => x.id === n.id); persist(); return r;
        });
        check('Add to board turns a reply table into a table card with its data intact, sized to fit, readable by the crew, undoable', card.added === 1 && card.type === 'table' && card.title === 'Three ways to fix sync' && card.cols === 'Option|Cost|Risk' && card.rows === 'Rebuild/$120k/High;Patch/$38k/Low' && card.src === 'copilot' && card.gw >= 320 && card.gw <= 960 && card.text === 3 && card.rendered && card.undone && card.redone, JSON.stringify(card));
        await p.waitForTimeout(1500); await p.reload(); await p.waitForTimeout(2500); // let the debounced save land first
        check('a table card survives a reload', await p.evaluate(id => { const n = byId(id); return !!n && n.type === 'table' && n.data.rows.length === 2; }, card.id));
        const pin = await p.evaluate(() => { board.copilot = board.copilot || []; board.copilot.push({ id: 'mP', role: 'ai', text: '', visuals: [{ kind: 'compare', title: 'Rebuild vs Patch', left: 'Rebuild', right: 'Patch', rows: [{ dim: 'Cost', a: '$120k', b: '$38k', winner: 'right' }] }] });
          pinCopilotVisualToBoard('mP', 0); const n = board.nodes.at(-1); return { type: n.type, cols: n.data.columns.map(c => c.name).join('|'), row: n.data.rows[0].join('/') }; });
        check('pinning a Copilot comparison keeps it as a table, with who is better as a column', pin.type === 'table' && pin.cols === 'Factor|Rebuild|Patch|Better' && pin.row === 'Cost/$120k/$38k/Patch', JSON.stringify(pin));
        const forms = await p.evaluate(() => { const run = md => { const d = document.createElement('div'); d.innerHTML = mdBlocksHtml(md).join(''); document.body.append(d); d.querySelector('[data-tbl-view="chart"]').click(); const r = { line: !!d.querySelector('.tbl-line svg'), labels: [...d.querySelectorAll('.tbl-ch-lbl')].map(x => x.textContent).join('>'), sortedYears: '' }; d.remove(); return r; };
          const m = tableModel({ columns: [{ name: 'Year' }, { name: 'Users' }], rows: [['2021', '10'], ['2022', '30']] });
          return { time: run('| Month | Signups |\n|---|---|\n| Jan | 1 |\n| Feb | 2 |'), share: run('| Channel | Share |\n|---|---|\n| A | 20% |\n| B | 80% |'), bars: run('| Option | Cost |\n|---|---|\n| A | $3 |\n| B | $1 |'), yearIsTime: !!m.time[0] && !m.cols[0] }; });
        check('charts follow the data: months make a line, shares rank largest first, others keep table order; a year column is time, not a quantity', forms.time.line && !forms.share.line && forms.share.labels === 'B>A' && forms.bars.labels === 'A>B' && forms.yearIsTime, JSON.stringify(forms));
        const ing = await p.evaluate(async () => {
          const csv = parseDelimited('\uFEFFName,Note\n"Acme, Inc.","Said ""hi""\nthen left"\nGlobex,ok');
          const eu = datasetFromText('Produkt;Preis\nStuhl;49,90\nTisch;199,00', 'eu.csv'), euM = tableModel(eu);
          const nested = datasetFromJSON({ data: { items: [{ id: 1, user: { city: 'Oslo' }, tags: ['a', 'b'] }, { id: 2, user: { city: 'Rome' }, tags: [] }] } }), nM = tableModel(nested);
          const big = datasetFromText('n,v\n' + Array.from({ length: 700 }, (_, i) => `${i},${i}`).join('\n'));
          const made = await addFiles([new File(['month,users\nJan,10\nFeb,14'], 'growth.csv'), new File(['{"a": [1,'], 'broken.json')], { x: 0, y: 0 });
          const dt = new DataTransfer(); dt.setData('text/plain', 'Region\tQ1\nNorth\t120\nSouth\t90'); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
          const pasted = board.nodes.at(-1);
          return { csv: csv.map(r => r.join('|')).join(' ; '), euNumeric: !!euM.cols[1], nestedCols: nested.columns.map(c => c.name).join('|'), nestedFirst: nested.rows[0].join('|'), idIsQuantity: !!nM.cols[0], bigRows: big.rows.length, bigTotal: big.total,
            files: made.map(n => n.type).join(','), fileSrc: made[0].data?.source?.label, pasted: pasted.type + ':' + pasted.data?.columns.map(c => c.name).join('|'), prose: looksTabular('We met, talked, and agreed.\nThen lunch, hiring, and done.') };
        });
        check('import: CSV quotes, escapes and line breaks; "49,90" is not 4990; nested JSON flattens; ids are not quantities; big files keep 500 of N; tabular files become tables, broken ones stay files; pasted TSV becomes a table, prose does not',
          ing.csv === 'Name|Note ; Acme, Inc.|Said "hi"\nthen left ; Globex|ok' && !ing.euNumeric && ing.nestedCols === 'id|user.city|tags' && ing.nestedFirst === '1|Oslo|a, b' && !ing.idIsQuantity && ing.bigRows === 500 && ing.bigTotal === 700 && ing.files === 'table,source' && ing.fileSrc === 'growth.csv' && ing.pasted === 'table:Region|Q1' && ing.prose === false, JSON.stringify(ing));
        const fit = await p.evaluate(() => {
          const mk = cols => ({ columns: Array.from({ length: cols }, (_, i) => ({ name: 'Field number ' + (i + 1) })), rows: [Array.from({ length: cols }, (_, i) => 'a longer value ' + i), Array.from({ length: cols }, (_, i) => 'value ' + i)] });
          const z0 = cam.s, measure = ds => { const gw = tblCardWidth(ds), n = node('table', { title: 'w', data: { v: 1, ...ds }, gw }, { x: 0, y: 0 }); renderAll(); const w = document.querySelector(`.card[data-id="${n.id}"] .tbl-wrap`); const tw = w.querySelector('table').offsetWidth, r = { gw, scrolls: w.scrollWidth > w.clientWidth + 1, slack: w.clientWidth - tw }; board.nodes = board.nodes.filter(x => x.id !== n.id); renderAll(); return r; };
          const small = measure(mk(3)), wide = measure(mk(14)); cam.s = .33; const wideZoomed = measure(mk(14)); cam.s = z0;
          const n = node('table', { title: 'r', data: { v: 1, ...mk(3) }, gw: 900 }, { x: 0, y: 0 }); resetCardWidth(n); const refit = n.gw === small.gw; board.nodes = board.nodes.filter(x => x.id !== n.id); renderAll();
          return { small, wide, wideZoomed, refit };
        });
        check('table cards fit their table (no sideways scroll), stop at 960px and scroll beyond, measure the same at any zoom, and refit on reset', !fit.small.scrolls && fit.small.gw < 960 && (fit.small.gw === 320 || fit.small.slack < 24) && fit.wide.gw === 960 && fit.wide.scrolls && fit.wideZoomed.gw === 960 && fit.refit, JSON.stringify(fit));
        const ed = await p.evaluate(async () => {
          const ds = { columns: [{ name: 'Option' }, { name: 'Cost' }], rows: [['Rebuild', '$120k'], ['Patch', '$38k'], ['Vendor', '$72k']] };
          const n = node('table', { title: 'E', data: { v: 1, ...ds, source: { kind: 'copilot' } }, gw: tblCardWidth(ds), tblSort: { col: 1, dir: 'ascending' } }, { x: 0, y: 0 }); renderAll(); focusNodes([n], 1, 0);
          await new Promise(r => setTimeout(r, 400));
          const card = () => document.querySelector(`.card[data-id="${n.id}"]`), key = (k, o = {}) => document.querySelector('.tbl-edit').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
          const top0 = card().querySelector('table').getBoundingClientRect().top; card().querySelector('tbody tr td:nth-child(2)').click(); const moved = Math.abs(card().querySelector('table').getBoundingClientRect().top - top0);
          tblOpenEditor(n, 1, 0, false); document.querySelector('.tbl-edit').value = 'Patch it'; key('Tab'); const tabbed = document.querySelector('.tbl-edit')?.closest('td')?.cellIndex === 1;
          document.querySelector('.tbl-edit').value = '$30k'; key('Enter');
          tblOpenEditor(n, -1, 1, true); document.querySelector('.tbl-edit').value = 'Total cost'; key('Enter');
          tblOpenEditor(n, 0, 0, false); document.querySelector('.tbl-edit').value = 'nope'; key('Escape');
          card().querySelector('[data-tbl-addrow]').click(); document.querySelector('.tbl-edit').value = 'Do nothing'; key('Enter');
          const order = [...card().querySelectorAll('tbody tr')].map(r => tblText(r.cells[0])).join('>');
          const r = { moved, tabbed, row1: n.data.rows[1].join('/'), header: n.data.columns[1].name, row0: n.data.rows[0][0], rows: n.data.rows.length, order, edited: !!n.data.source.edited, best: tblText(card().querySelector('td.best') || document.body).slice(0, 5) };
          undo(); undo(); r.undone = byId(n.id).data.rows.length; // undo replaces the node object const cp = document.createElement('div'); cp.innerHTML = mdBlocksHtml('| A | B |\n|---|---|\n| x | 1 |\n| y | 2 |').join(''); r.replyEditable = !!cp.querySelector('[data-editable],[data-tbl-addrow]');
          board.nodes = board.nodes.filter(x => x.id !== n.id); renderAll(); return r;
        });
        check('table cards edit in place: selecting does not move the table; Tab moves on; Enter commits, Esc cancels; headers rename; added rows sort last when empty; types re-infer; marked edited; undoable; reply tables stay read-only',
          ed.moved < 1 && ed.tabbed && ed.row1 === 'Patch it/$30k' && ed.header === 'Total cost' && ed.row0 === 'Rebuild' && ed.rows === 4 && ed.order === 'Patch it>Vendor>Rebuild>Do nothing' && ed.edited && ed.best === '$30k' && ed.undone === 3 && !ed.replyEditable, JSON.stringify(ed));
        const url = await p.evaluate(async base => {
          const before = board.nodes.length, n = await tableFromUrl(base + '/data/sales.csv'), m = tableModel(n.data);
          const drawn = !!document.querySelector(`.card[data-id="${n.id}"] .tbl-wrap`) && sel.includes(n.id), title = humanFileTitle('2014_usa_states.csv');
          const numHTML = tblBlockHTML({ columns: [{ name: 'State' }, { name: 'Year' }, { name: 'Population' }], rows: [['Alabama', '2014', '4849377.0'], ['Alaska', '2014', '736732.0']] }), grouped = numHTML.includes('4,849,377<') && numHTML.includes('736,732<') && numHTML.includes('>2014<') && !numHTML.includes('.0<');
          const paste = t => { const dt = new DataTransfer(); dt.setData('text/plain', t); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); };
          paste('https://example.com/blog/post'); const link = board.nodes.at(-1).type;
          return { made: board.nodes.length - before, drawn, title, grouped, type: n.type, cols: n.data.columns.map(c => c.name).join('|'), src: n.data.source.kind + ':' + n.data.source.url.replace(base, ''), rankIsQuantity: !!m.cols[0], link,
            sheet: dataUrlOf('https://docs.google.com/spreadsheets/d/AbC/edit#gid=7'), gh: dataUrlOf('https://github.com/a/b/blob/main/x.csv'), blog: looksLikeDataUrl('https://example.com/blog/post') };
        }, base);
        check('a table from an address: the CSV becomes a drawn, selected table card that remembers its address and gets a readable title; bare numbers display grouped (years stay as written); ordinary links stay links; Sheets and GitHub links become data links; rank is not a quantity',
          url.type === 'table' && url.drawn && url.grouped && url.title === '2014 USA States' && url.cols === 'Rank|Region|Q1' && url.src === 'url:/data/sales.csv' && !url.rankIsQuantity && url.link === 'link' && url.sheet === 'https://docs.google.com/spreadsheets/d/AbC/export?format=csv&gid=7' && url.gh === 'https://raw.githubusercontent.com/a/b/main/x.csv' && !url.blog, JSON.stringify(url));
        const rf = {};
        const mk = await p.evaluate(async base => { const n = await tableFromUrl(base + '/data/sales.csv'); return { id: n.id, btn: !!document.querySelector(`.card[data-id="${n.id}"] [data-tbl-refresh] svg path`), local: canRefresh({ type: 'table', data: { source: { kind: 'paste' } } }) }; }, base);
        const step = async fn => p.evaluate(fn, mk.id);
        const rows = () => step(id => byId(id).data.rows.map(r => r.join('/')).join(';'));
        await step(id => { document.querySelector(`.card[data-id="${id}"] [data-tbl-refresh]`).click(); }); await p.waitForTimeout(500);
        rf.same = await rows();
        salesCsv.text = 'Rank,Region,Q1\n1,North,150\n2,South,90\n3,East,40';
        await step(id => tblRefresh(id)); await p.waitForTimeout(500);
        rf.updated = await rows(); rf.toast = await p.evaluate(() => [...document.querySelectorAll('#toasts .toast span')].map(x => x.textContent).join(' | '));
        await step(id => { tblCommit(byId(id), d => { d.rows[1][2] = '95'; }); });
        await step(id => tblRefresh(id)); await p.waitForTimeout(500);
        rf.keptNoChange = (await rows()).includes('South/95') && !(await step(id => !!document.querySelector(`.card[data-id="${id}"] .tbl-conflict`)));
        salesCsv.text = 'Rank,Region,Q1\n1,North,160\n2,South,90\n3,East,40';
        await step(id => tblRefresh(id)); await p.waitForTimeout(500);
        rf.asked = await step(id => !!document.querySelector(`.card[data-id="${id}"] .tbl-conflict`)) && (await rows()).includes('South/95');
        const before = await p.evaluate(() => board.nodes.length);
        await step(id => document.querySelector(`.card[data-id="${id}"] [data-tbl-conflict="both"]`).click()); await p.waitForTimeout(300);
        rf.both = (await p.evaluate(() => board.nodes.length)) === before + 1 && (await rows()).includes('South/95') && await p.evaluate(() => board.nodes.at(-1).data.rows[0].join('/') === '1/North/160' && board.nodes.at(-1).data.source.kind === 'url');
        await p.evaluate(() => { board.nodes.pop(); renderAll(); });
        salesCsv.text = 'Rank,Region,Q1\n1,North,170\n2,South,90';
        await step(id => tblRefresh(id)); await p.waitForTimeout(500);
        await step(id => document.querySelector(`.card[data-id="${id}"] [data-tbl-conflict="replace"]`).click()); await p.waitForTimeout(300);
        rf.replaced = await rows(); rf.clean = await step(id => !byId(id).data.source.edited);
        await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
        rf.undone = await rows();
        await step(id => { board.nodes = board.nodes.filter(x => x.id !== id); renderAll(); });
        check('refresh re-reads the source: unchanged says so; changes apply with a summary and undo; your edits stay when only you changed it; when both changed it asks (Keep both adds the latest beside yours, Replace takes it and can be undone)',
          mk.btn && !mk.local && rf.same === '1/North/120;2/South/90' && rf.updated === '1/North/150;2/South/90;3/East/40' && /1 new, 1 changed/.test(rf.toast) && rf.keptNoChange && rf.asked && rf.both && rf.replaced === '1/North/170;2/South/90' && rf.clean && rf.undone.includes('South/95'), JSON.stringify({ mk, rf }));
        const notion = await p.evaluate(async () => {
          const paste = t => { const dt = new DataTransfer(); dt.setData('text/plain', t); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); };
          const toasts = () => [...document.querySelectorAll('#toasts .toast span')].map(x => x.textContent).join(' | ');
          const saved = mcpCfg.notion.token, view = 'https://www.notion.so/acme/Sprint-0123456789abcdef0123456789abcdef?v=fedcba9876543210fedcba9876543210';
          mcpCfg.notion.token = ''; const before = board.nodes.length; paste(view); await new Promise(r => setTimeout(r, 150));
          const noToken = { made: board.nodes.at(-1).type, msg: toasts(), act: !!document.querySelector('#toasts .toast button') };
          mcpCfg.notion.token = 'ntn_good'; const n = await tableFromNotion(view);
          const drawn = !!document.querySelector(`.card[data-id="${n.id}"] .tbl-wrap`), foot = document.querySelector(`.card[data-id="${n.id}"]`).textContent;
          const tags = [...document.querySelectorAll(`.card[data-id="${n.id}"] .tbl-tag`)].map(t => t.textContent + '=' + t.style.getPropertyValue('--c')).join('|');
          const plain = tblBlockHTML({ columns: [{ name: 'Door' }, { name: 'Note' }], rows: [['open', 'Done soon'], ['open', 'x']] }).includes('tbl-tag') || tblBlockHTML({ columns: [{ name: 'Store' }, { name: 'Hours' }], rows: [['Open', '9-5'], ['Closed', '-'], ['Open', '9-5']] }).includes('tbl-tag');
          const exportIsCsv = !isNotionUrl('https://file.notion.so/f/s/abc/Export.csv') && isNotionUrl('https://www.notion.so/acme/0123456789abcdef0123456789abcdef');
          const denied = await tableFromNotion('https://www.notion.so/acme/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), msg = toasts();
          mcpCfg.notion.token = saved; board.nodes = board.nodes.filter(x => x.id !== n.id); renderAll();
          return { noToken, title: n.title, src: n.data.source.kind + ':' + n.data.source.label, cols: n.data.columns.map(c => c.name).join('|'), drawn, tags, plain, exportIsCsv, more: /first 2 rows/.test(foot), denied, sharedHint: /Connections/.test(msg), made: board.nodes.length - before };
        });
        check('a Notion database link becomes a table card through the local server; without a token the link stays a link and the toast opens Notion settings; unshared databases say how to share; workflow status reads as tags (done green, in progress blue) only when it is clearly a status',
          notion.noToken.made === 'link' && /Notion isn't connected/.test(notion.noToken.msg) && notion.noToken.act && notion.title === 'Sprint board' && notion.src === 'notion:Notion' && notion.cols === 'Name|Status|Points' && notion.drawn && notion.tags === 'Done=var(--C)|In progress=var(--B)' && !notion.plain && notion.exportIsCsv && notion.more && notion.denied === null && notion.sharedHint
          && notionPosts.length === 2 && notionPosts[0].client === 'canvas' && notionPosts[0].ref.includes('?v='), JSON.stringify({ ...notion, notionPosts }));
        check('table rows: click selects one, Cmd adds, Shift selects a range, and the selection bar appears', sel.one === 'A' && sel.two === 'A,C' && sel.range === 'A,B,C' && sel.single === 'B' && sel.bar === false, JSON.stringify(sel));
        check('tables: numbers show magnitude; Risk High is red and Low green, an unknown direction gets no colour; a comparison states its verdict first', tb.numCols === 1 && tb.ratios.join() === '1.000,0.250' && tb.risk === 'var(--D),var(--C)' && !tb.plain && tb.verdict === 'Patch wins 2 of 3' && tb.wins === 3, JSON.stringify(tb));
      }
      await p.evaluate(() => { const n = node('table', { title: 'Probe', data: { v: 1, columns: [{ name: 'Option' }, { name: 'Cost' }, { name: 'Risk' }], rows: [['A', '$1', 'High'], ['B', '$2', 'Low']] } }, { x: 0, y: 0 }); renderAll(); focusNodes([n], 1, 0); window._probeCard = n.id; }); await p.waitForTimeout(900);
      bad.push(...(await p.evaluate(LEGIBILITY, '.card.table')).map(x => `table card: ${x}`));
      await p.evaluate(() => { board.nodes = board.nodes.filter(n => n.id !== window._probeCard); renderAll(); });
      check(`every text in the Connection and Crew popovers, tables and table cards reaches 4.5:1 in ${theme} mode`, bad.length === 0, bad.join(' | '));
      const sw = await p.evaluate(() => {
        const cs = getComputedStyle(document.documentElement), hex = v => { const n = parseInt(cs.getPropertyValue(v).trim().slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
        const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
        return { knob: +ratio(hex('--sw-off-knob'), hex('--sw-off-track')).toFixed(2), line: +ratio(hex('--sw-off-line'), hex('--card')).toFixed(2) };
      });
      check(`a switch that is off still reads as a control in ${theme} mode (knob and outline at least 3:1)`, sw.knob >= 3 && sw.line >= 3, JSON.stringify(sw));
      await p.context().close();
    }

    await browser.close(); srv.close();
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

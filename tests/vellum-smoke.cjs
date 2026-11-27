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
const backups = [], backupMode = { status: 200 }; // stands in for serve_vellum.py's /backup/board
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
      if (req.method === 'POST' && req.url === '/backup/board') {
        const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
          backups.push({ headers: req.headers, body: Buffer.concat(chunks).toString() });
          if (backupMode.status !== 200) { rsp.writeHead(backupMode.status); return rsp.end(); }
          rsp.writeHead(200, { 'Content-Type': 'application/json' }); rsp.end(JSON.stringify({ ok: true, dir: '/tmp/Vellum Backups/x', display: '~/Vellum Backups/x' }));
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
          requests.push({ matched: hit && hit.id, prompt: flat.slice(0, 200), full: flat, temp: parsed.temperature, max: parsed.max_tokens });
          if (hit && hit.delay) await new Promise(r => setTimeout(r, hit.delay));
          if (!hit || hit.status) { rsp.writeHead(hit ? hit.status : 503, (hit && hit.headers) || {}); return rsp.end((hit && hit.body) || ''); }
          rsp.writeHead(200, { 'Content-Type': 'text/event-stream' });
          rsp.on('error', () => {});
          const txt = typeof hit.text === 'string' ? hit.text : JSON.stringify(hit.text);
          for (let k = 0; k < txt.length; k += 40) {
            if (hit.slow) await new Promise(r => setTimeout(r, hit.slow)); // a slow model, chunk by chunk
            if (rsp.destroyed) return;
            rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: txt.slice(k, k + 40) } }] }) + '\n\n');
            // `stall`: send the first chunk, then go quiet, as a slow model does mid-answer
            if (hit.stall && k === 0) await new Promise(r => setTimeout(r, hit.stall));
          }
          if (rsp.destroyed) return;
          if (hit.finish) rsp.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: hit.finish }] }) + '\n\n');
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
const WIKI = { query: { pages: {
  1: { index: 1, title: 'Shanghai International Settlement', extract: 'The Shanghai International Settlement originated from the 1863 merger of the British and American enclaves in Shanghai. Extraterritoriality was abolished in 1943.', fullurl: 'https://en.wikipedia.org/wiki/Shanghai_International_Settlement' },
  2: { index: 2, title: 'History of Shanghai', extract: 'The history of Shanghai spans over a thousand years and closely parallels the development of modern China, from fishing village to treaty port.', fullurl: 'https://en.wikipedia.org/wiki/History_of_Shanghai' } } } };
const wikiRoute = (p, calls = []) => p.route(/wikipedia\.org\/w\/api\.php/, r => { calls.push(new URL(r.request().url()).searchParams.get('gsrsearch')); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(WIKI) }); });
const dirs = tag => ({ directions: ['A', 'B', 'C'].map(l => ({ title: `${tag} ${l}`, plan: `Plan ${l}.`, test: `Test ${l}.`, mode: 'story' })) });

async function page(browser, base, { model = true, theme = 'dark' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  // Studio AI may be running on this machine; the suite must not depend on it (section 9 routes its own)
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
  await ctx.route(/wikipedia\.org/, r => r.abort()); // the suite never reaches the real Wikipedia
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
  await p.evaluate(() => { SCOUT_GROUNDING = false; }); // sections that test Scout's look-up turn it on
  if (model) await p.evaluate(url => { apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'smoke', key: 'smoke' }; }, base);
  p.type = async (t, enter = true) => { await p.click('#lineInput'); await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.keyboard.type(t); if (enter) await p.keyboard.press('Enter'); };
  p.idle = async () => { await p.waitForTimeout(400); for (let i = 0; i < 100 && await p.evaluate(() => crewBusy()); i++) await p.waitForTimeout(250); await p.waitForTimeout(500); };
  p.toast = () => p.evaluate(() => [...document.querySelectorAll('#toasts > *')].map(t => t.innerText.replace(/\s+/g, ' ')).join(' / '));
  p.newBoard = async () => { await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(800); };
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

    // 5b. a pin thread keeps moving: the crew's reply ends with up to 3 buttons to tap, not a question to answer
    {
      const p = await page(browser, base);
      await p.newBoard();
      await p.evaluate(() => { setCrewLevel('asked'); board.pins = {}; });
      await p.type('note: modern Shanghai'); await p.idle();
      const id = await p.evaluate(() => { const n = board.nodes.find(x => x.type === 'note'); board.pins = { [n.id]: [{ id: 'pin-r', agent: 'critic', note: 'Modern Shanghai is vague.', liftAct: 'note', liftLabel: 'Try as draft card', t: NOW(), seen: true }] }; renderAll(); openAdvNodeId = n.id; openAdvIdx = 0; renderAdvPop(); return n.id; });
      const NOTE = 'Shanghai 2026: old lanes under glass towers';
      const withActions = 'Locked on 2026. I would go street-level: old lanes under glass towers.\nACTIONS: ' + JSON.stringify([{ act: 'note', label: 'Draft refined note', text: NOTE }, { act: 'visuals', label: 'Find references', query: 'Shanghai old lane neon' }, { act: 'bogus', label: 'Nope' }, { act: 'note', label: 'No text' }]);
      queue.push({ id: 'pin-r1', match: 'Initial pin you left', text: withActions }, { id: 'pin-r2', match: 'Initial pin you left', text: 'Plain answer with no buttons.' }, { id: 'pin-r3', match: 'Initial pin you left', text: withActions });
      const reply = async t => { await p.evaluate(([id, t]) => replyToAdvPin(id, 'pin-r', t), [id, t]); await p.idle(); };
      const ui = () => p.evaluate(() => ({ txt: [...document.querySelectorAll('#advPop .adv-rep-tx')].map(e => e.textContent).at(-1), picks: [...document.querySelectorAll('#advPop .adv-picks .adv-lift')].map(b => b.textContent.trim()), lift: document.querySelectorAll('#advPop [data-adv-lift]').length }));
      await reply('Era setting, 2026');
      const a = await ui(), req = requests.find(r => r.matched === 'pin-r1');
      check('a reply shows its sentences without the ACTIONS line', /street-level/.test(a.txt) && !/ACTIONS/.test(a.txt), a.txt);
      check('it ends with the valid buttons only (bad act and missing text are dropped)', a.picks.join('|') === 'Draft refined note|Find references' && a.lift === 0, JSON.stringify(a));
      check('the model is told to guess, not to re-ask, and which actions exist for this card', !!req && /never ask it again/.test(req.full) && /note, visuals, list, critique, fork/.test(req.full) && !/gather/.test(req.full.split('ACTIONS:')[1] || ''));
      await p.evaluate(() => { board.pins[Object.keys(board.pins)[0]][0].replies.push({ id: 'y', who: 'you', text: 'hm', t: NOW() }); renderAdvPop(); });
      check('the buttons go away once you write again', (await ui()).picks.length === 0);
      await p.evaluate(() => { board.pins[Object.keys(board.pins)[0]][0].replies.pop(); });
      await reply('Anything else?');
      const b = await ui();
      check('a reply with no buttons is shown as it is', b.txt === 'Plain answer with no buttons.' && b.picks.length === 0, JSON.stringify(b));
      await reply('Go on');
      await p.click('#advPop .adv-picks .adv-lift >> nth=0'); await p.waitForTimeout(600);
      check('tapping a button does it: the note becomes a sketch note and the thread closes', await p.evaluate(([id, NOTE]) => !board.pins[id] && !!board.nodes.find(n => n.status === 'sketch' && n.text === NOTE) && document.getElementById('advPop').hidden, [id, NOTE]));
      check('no page errors in pin threads', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 5c. real-world replies keep their buttons, and a search started from a card never breaks the camera
    {
      const p = await page(browser, base);
      await p.route(/(commons\.wikimedia|api\.openverse|wikipedia)\.org/, r => r.abort()); // search falls back to placeholders, deterministically
      await p.newBoard();
      await p.evaluate(() => { setCrewLevel('asked'); board.pins = {}; });
      await p.type('note: I want to build an AI-native OPC business'); await p.idle();
      const id = await p.evaluate(() => { const n = board.nodes.find(x => x.type === 'note'); board.pins = { [n.id]: [{ id: 'pin-c', agent: 'critic', note: 'Vague.', liftAct: 'note', liftLabel: 'Try as draft card', t: NOW(), seen: true }] }; renderAll(); openAdvNodeId = n.id; openAdvIdx = 0; renderAdvPop(); return n.id; });
      queue.push({ id: 'pin-c1', match: 'Initial pin you left', text: 'Two interactions: pricing and onboarding.\n```json\nACTIONS: ' + JSON.stringify([{ act: 'list', label: 'Break into steps' }]) + '\n```' }, { id: 'pin-c2', match: 'Initial pin you left', text: 'Just words, no buttons.' });
      const reply = async t => { await p.evaluate(([id, t]) => replyToAdvPin(id, 'pin-c', t), [id, t]); await p.idle(); };
      const ui = () => p.evaluate(() => ({ txt: [...document.querySelectorAll('#advPop .adv-rep-tx')].map(e => e.textContent).at(-1), picks: [...document.querySelectorAll('#advPop .adv-picks .adv-lift')].map(b => b.textContent.trim()), lift: document.querySelectorAll('#advPop [data-adv-lift]').length }));
      await reply('Go on');
      const a = await ui();
      check('a word like "interactions:" does not cut the reply, and a code fence around the ACTIONS line is not shown', a.txt === 'Two interactions: pricing and onboarding.' && a.picks.join('|') === 'Break into steps', JSON.stringify(a));
      await reply('And?');
      const b = await ui();
      check('when a reply has no buttons, the pin keeps its own action button', b.picks.length === 0 && b.lift === 1, JSON.stringify(b));
      check('the prompt keeps image search for things you can see, and not for abstract plans', requests.some(r => r.matched === 'pin-c1' && /never for a plan, strategy, business idea/.test(r.full) && !/"label":"Find references"/.test(r.full)));
      // the camera: a search started from a card (the pin's "visuals" action) used to set it to NaN
      await p.evaluate(id => { openAdvNodeId = null; closeAdvPop(); return searchWeb('ai native opc business', { from: byId(id) }); }, id); await p.idle();
      check('a search started from a card keeps the camera valid and the page error-free', await p.evaluate(() => camOk(cam)) && p.errors.length === 0, JSON.stringify(await p.evaluate(() => cam)) + ' ' + p.errors.join(' | '));
      const before = await p.evaluate(() => ({ ...cam }));
      await p.evaluate(() => document.activeElement?.blur());
      const empty = await p.evaluate(() => { for (let y = 120; y < 700; y += 40) for (let x = 120; x < 1200; x += 40) { const e = document.elementFromPoint(x, y); if (e && e.id === 'wall') return { x, y }; } return null; }); // a drag that starts on a card moves the card, so start on empty canvas
      await p.mouse.move(empty.x, empty.y); await p.mouse.down(); await p.mouse.move(empty.x - 120, empty.y - 80, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(250);
      check('and the canvas still pans afterwards', await p.evaluate(b => cam.x !== b.x && camOk(cam), before));
      await p.evaluate(() => flyTo({ x: NaN, y: 0, s: 1 }));
      check('a bad camera target is ignored', await p.evaluate(() => camOk(cam)));
      await p.evaluate(() => { cam = { x: NaN, y: NaN, s: NaN }; board.cam = { x: null, y: null, s: null }; paintCam(); });
      check('a camera that is already bad heals to a usable view', await p.evaluate(() => camOk(cam) && camOk(board.cam)));
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 5d. one kanban per project: the crew adds tasks to the board that is there, and never offers a card it already placed
    {
      const p = await page(browser, base);
      await p.newBoard();
      const kanbans = () => p.evaluate(() => board.nodes.filter(n => n.type === 'kanban' && !n.tombstone).map(n => ({ id: n.id, title: n.title, status: n.status, cards: (n.cards || []).map(c => c.title + '@' + c.col) })));
      await p.evaluate(() => { node('kanban', { title: 'Prototype Layout', cols: [{ id: 'todo', title: 'To Do' }, { id: 'doing', title: 'In Progress' }, { id: 'done', title: 'Done' }], cards: [{ id: 'k1', title: 'Map key points', col: 'todo' }], by: 'wright', status: 'ink', pid: 'p-t' }, { x: 120, y: 120 }); renderAll(); });
      const r1 = await p.evaluate(() => { const r = dispatchCanvasActions([{ action: 'create', cardType: 'kanban', title: 'More prototype tasks', cards: [{ title: 'Rooftop traversal', col: 0 }, { title: 'Map key points', col: 0 }] }], { by: 'critic' }); return { proposed: r.proposed.length, created: r.createdNodes.length, open: (board.proposals || []).filter(x => x.status === 'open').length }; });
      check('a create-kanban action with a board already there makes no second board; for a kept board it becomes a suggested edit', (await kanbans()).length === 1 && r1.created === 0 && r1.proposed === 1 && r1.open === 1, JSON.stringify(r1));
      await p.evaluate(() => acceptProposal(board.proposals.find(x => x.status === 'open').id, { force: true })); await p.waitForTimeout(200);
      const k1 = (await kanbans())[0];
      check('accepting adds only the new task (the one already there is skipped)', k1.cards.join('|') === 'Map key points@todo|Rooftop traversal@todo', k1.cards.join('|'));
      await p.evaluate(() => dispatchCanvasActions([{ action: 'add_cards', target: 'Prototype Layout', cards: [{ title: 'Neon alley route', col: 1 }] }], { userIntent: true }));
      check('add_cards puts a task in the column asked for', (await kanbans())[0].cards.includes('Neon alley route@doing'));
      const r3 = await p.evaluate(() => { const r = dispatchCanvasActions([{ action: 'create', cardType: 'kanban', title: 'Phase 2', separate: true, cards: [{ title: 'Ship it', col: 0 }] }], { userIntent: true }); return { made: r.createdNodes.length, applied: r.applied }; });
      check('a separate or phased board is still possible when asked for', (await kanbans()).length === 2 && r3.made === 1);
      const rec = await p.evaluate(() => { const m = { proposals: [{ kind: 'kanban', title: 'Phase 2' }, { kind: 'kanban', title: 'Unrelated board' }, { kind: 'note', title: 'Phase 2' }], actionResults: { applied: [{ action: 'create', cardType: 'kanban', title: 'Phase 2', id: 'x' }] } }; reconcileProposalsWithActions(m); return m.proposals.map(x => !!x.placed); });
      check('a proposal for something already put on the board shows as placed, others stay offered', rec.join() === 'true,false,false', rec.join());
      await p.evaluate(() => { board.copilot = [{ id: 'cm1', role: 'ai', text: 'x', proposals: [{ kind: 'kanban', title: 'More tasks', cards: [{ title: 'Check the sniper nests', col: 0 }] }] }]; });
      await p.evaluate(() => applyCopilotProposal('cm1', 0)); await p.waitForTimeout(300);
      const after = await kanbans();
      check('Place on Board with a kanban already there adds to it, and the proposal is then placed', after.length === 2 && after.some(k => k.cards.some(c => c.startsWith('Check the sniper nests'))) && await p.evaluate(() => board.copilot[0].proposals[0].placed === true), JSON.stringify(after));
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 5e. choosing a direction is not planning: options are direction cards, tasks are a kanban, and only after a direction is adopted
    {
      const p = await page(browser, base);
      await p.newBoard();
      const kinds = () => p.evaluate(() => board.nodes.filter(n => !n.tombstone).map(n => n.type));
      const r1 = await p.evaluate(() => { const idea = node('idea', { title: 'An open-world game in Shanghai', text: 'x', by: 'you', status: 'ink', pid: 'p-i' }, { x: 100, y: 100 }); const r = dispatchCanvasActions([{ action: 'create', cardType: 'kanban', title: 'Direction: Vertical Heist District', text: 'Rooftop traversal and dockside heists', from: idea.id }], { by: 'critic', userIntent: true }); const n = r.createdNodes[0]; return { type: n.type, letter: n.letter, idea: n.idea === idea.id, hasText: /Rooftop/.test(n.text) }; });
      check('with nothing adopted, a "Direction: ..." kanban action becomes a direction card (letter, linked to its claim, text kept)', r1.type === 'direction' && !!r1.letter && r1.idea && r1.hasText, JSON.stringify(r1));
      const r2 = await p.evaluate(() => ({ prop: proposalKind({ kind: 'kanban', title: 'Option B: Underground economy' }), list: proposalKind({ kind: 'list', title: 'Direction A' }), zh: proposalKind({ kind: 'kanban', title: '方向一：垂直潜入' }), plan: proposalKind({ kind: 'kanban', title: 'Prototype layout tasks' }), note: proposalKind({ kind: 'note', title: 'Direction: x' }) }));
      check('a proposal that is really an option is shown as a direction, a real task board stays a kanban', r2.prop === 'direction' && r2.list === 'direction' && r2.zh === 'direction' && r2.plan === 'kanban' && r2.note === 'note', JSON.stringify(r2));
      const r3 = await p.evaluate(() => { const idea = board.nodes.find(n => n.type === 'idea'), d = board.nodes.find(n => n.type === 'direction'); board.adopted = { [idea.id]: d.id }; const k = proposalKind({ kind: 'kanban', title: 'Direction: Vertical Heist District' }); const r = dispatchCanvasActions([{ action: 'create', cardType: 'kanban', title: 'Direction: next steps', cards: [{ title: 'Build the rooftop route', col: 0 }] }], { by: 'critic', userIntent: true }); return { k, made: r.createdNodes.map(n => n.type) }; });
      check('once a direction is adopted, the same title is a plan and stays a kanban', r3.k === 'kanban' && r3.made.join() === 'kanban', JSON.stringify(r3));
      check('the prompt tells Copilot to offer options as direction cards, and tasks only after one is adopted', await p.evaluate(() => true) && fs.readFileSync(FILE, 'utf8').includes('CHOOSING A DIRECTION IS NOT PLANNING'));
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 5f. the questions Strategist asks offer suggestions, not the only answers: each takes the designer's own words too
    {
      const p = await page(browser, base);
      await p.newBoard();
      const items = [{ q: 'Who is the player?', options: ['An outsider', 'Someone with power', 'An ordinary person'] }, { q: 'When does it happen?', options: ['The past', 'The present', 'The near future'] }, { q: 'How does it play?', options: ['Story', 'Tactics', 'Exploring'] }];
      const open = async () => { const r = p.evaluate(it => clarifyDialog(it), items); await p.waitForFunction(() => document.querySelector('dialog[open][data-clarify] [data-clarify-own]')); return r; };
      const own = i => p.locator(`[data-clarify-q="${i}"] [data-clarify-own]`);
      const chip = (i, j) => p.locator(`[data-clarify-q="${i}"] [data-clarify-opt="${j}"]`);
      const pressed = i => p.evaluate(i => [...document.querySelectorAll(`[data-clarify-q="${i}"] [data-clarify-opt]`)].map(b => b.getAttribute('aria-pressed') === 'true').join(), i);
      let res = open();
      await p.waitForFunction(() => document.querySelector('dialog[open][data-clarify] [data-clarify-own]'));
      check('every question has a row for your own answer, and the dialog says so', await p.locator('[data-clarify-own]').count() === 3 && /write your own/i.test(await p.locator('dialog[data-clarify] .sh-id small').innerText()));
      const edges = await p.evaluate(() => { const d = document.querySelector('dialog[open][data-clarify]'), x = d.querySelector('.sh-head .sh-x').getBoundingClientRect(), m = d.querySelector('.sh-main'), mr = m.getBoundingClientRect(); return { x: Math.round(x.right), content: Math.round(mr.right - parseFloat(getComputedStyle(m).paddingRight)) }; });
      check('the close button is right-aligned with the content below it (a head with no back button left it in the middle column)', Math.abs(edges.x - edges.content) <= 1, JSON.stringify(edges));
      await chip(0, 1).click(); await own(1).fill('Right now, in a sleeping port city'); await own(2).fill('  ');
      check('typing clears the chosen chip for that question only; a blank row counts as nothing', await pressed(0) === 'false,true,false' && await pressed(1) === 'false,false,false' && await own(1).evaluate(e => e.classList.contains('has')) && !await own(2).evaluate(e => e.classList.contains('has')));
      await own(1).press('Enter');
      const a = await res;
      check('a typed answer comes back like a chosen one, and Enter submits', JSON.stringify(a) === JSON.stringify([{ q: 'Who is the player?', a: 'Someone with power' }, { q: 'When does it happen?', a: 'Right now, in a sleeping port city' }]), JSON.stringify(a));
      res = open(); await p.waitForFunction(() => document.querySelector('dialog[open][data-clarify] [data-clarify-own]'));
      await own(0).fill('A retired smuggler'); await chip(0, 2).click();
      check('choosing a chip after typing clears what was typed', await own(0).inputValue() === '' && await pressed(0) === 'false,false,true' && !await own(0).evaluate(e => e.classList.contains('has')));
      await chip(0, 2).click(); await own(0).fill('x'.repeat(300));
      check('what you type is capped', await own(0).evaluate(e => e.value.length) <= 140);
      await p.locator('[data-clarify-skip]').click();
      check('Skip still skips everything', JSON.stringify(await res) === '[]');
      // closing one dialog and opening the next in the same tick: the first one's queued close event must not close the second
      const quick = await p.evaluate(async it => { const a = clarifyDialog(it); document.querySelector('[data-clarify-skip]').click(); const b = clarifyDialog(it); await new Promise(r => setTimeout(r, 300)); const stillOpen = !!document.querySelector('dialog[open][data-clarify]'); document.querySelector('[data-clarify-x]').click(); return { first: await a, stillOpen, second: await b }; }, items);
      check('a dialog opened right after another closed is not closed by the first one\'s stale close event', JSON.stringify(quick) === JSON.stringify({ first: [], stillOpen: true, second: null }), JSON.stringify(quick));
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 5g. the trail is kept: decisions outlast a full log, and the board is backed up automatically
    {
      const p = await page(browser, base, { model: false });
      await p.newBoard();
      const t = await p.evaluate(() => { board.changes = []; for (let i = 0; i < 600; i++) board.changes.push({ t: i, op: 'edit', id: 'n' + i }); board.changes.splice(100, 0, { t: 1000, op: 'adopt', id: 'd1' }, { t: 1001, op: 'accept-proposal', id: 'p1' }, { t: 1002, op: 'decline-passed-over', id: 'x' }, { t: 1003, op: 'discard', id: 'y' }); trimChanges(); return { len: board.changes.length, keys: board.changes.filter(isKeyChange).map(c => c.op).join(), firstEdit: board.changes.find(c => c.op === 'edit').id }; });
      check('when the change log is full, the oldest routine edits go first and every decision stays', t.len === 500 && t.keys === 'adopt,accept-proposal,decline-passed-over,discard' && t.firstEdit === 'n104', JSON.stringify(t));
      const cap = await p.evaluate(() => { board.changes = Array.from({ length: 5200 }, (_, i) => ({ t: i, op: 'adopt', id: 'd' + i })); trimChanges(); return board.changes.length; });
      check('even decisions stop at 5,000, so a board cannot grow without end', cap === 5000, String(cap));
      const ad = await p.evaluate(() => { board.changes = []; const idea = node('idea', { title: 'Claim', text: 'x', status: 'ink', by: 'you' }, { x: 100, y: 100 }); const d = node('direction', { idea: idea.id, letter: 'A', title: 'Own it', text: 't', test: 'x', status: 'ink', by: 'muse' }, { x: 500, y: 100 }); adopt(d); const c = board.changes.at(-1); return { op: c?.op, who: c?.who, title: c?.title }; });
      check('adopting a direction is written to the change log as a decision', ad.op === 'adopt' && ad.who === 'you' && /Own it/.test(ad.title), JSON.stringify(ad));

      // the backup: posted to the local server as the same bundle Export Board writes
      backups.length = 0; backupMode.status = 200;
      await p.evaluate(() => { backupState.ok = null; backupState.sig = null; backupState.failedAt = 0; });
      await p.newBoard();
      await p.evaluate(() => runBackup());
      check('an empty board is not backed up', backups.length === 0);
      await p.evaluate(() => { node('note', { text: 'Why I chose B', status: 'ink', by: 'you' }, { x: 100, y: 100 }); board.title = 'My plan'; });
      await p.evaluate(() => runBackup());
      const first = backups[0], parsed = first && JSON.parse(first.body);
      check('a backup is posted with the custom header, the board id and title, and the whole bundle (format, board, media)',
        backups.length === 1 && first.headers['x-studio-client'] === 'canvas' && first.headers['x-vellum-board'] && decodeURIComponent(first.headers['x-vellum-title']) === 'My plan'
        && first.body.slice(0, 80).includes('vellum-board.v1') && parsed.board.nodes.some(n => n.text === 'Why I chose B') && 'blobs' in parsed && Array.isArray(parsed.board.changes), first && first.body.slice(0, 120));
      check('it says where the backup is, and the System sheet line reads from it', await p.evaluate(() => backupState.ok === true && /Auto backup · last .* · ~\/Vellum Backups\/x/.test(backupLine())));
      await p.evaluate(() => runBackup());
      check('an unchanged board is not backed up again', backups.length === 1, String(backups.length));
      await p.evaluate(() => { cam.x += 120; paintCam(); persistNow(); });
      await p.evaluate(() => runBackup());
      check('moving the camera is not a change worth a backup', backups.length === 1, String(backups.length));
      await p.evaluate(() => { board.nodes.find(n => n.type === 'note').text = 'Why I chose B, and what would change my mind'; });
      await p.evaluate(() => runBackup());
      check('a real change is backed up', backups.length === 2 && /what would change my mind/.test(backups[1].body), String(backups.length));
      const timer = await p.evaluate(() => { clearTimeout(backupState.t); backupState.t = 0; scheduleBackup(); const a = backupState.t; scheduleBackup(); const same = backupState.t === a; clearTimeout(backupState.t); backupState.t = 0; return same && !!a; });
      check('backups are throttled: a second change does not push the first one back', timer);
      // no local server to take it (opened from a file, or another server): quiet, and not retried at once
      backupMode.status = 404; const before = backups.length;
      await p.evaluate(() => { board.nodes.find(n => n.type === 'note').text = 'Changed again'; });
      await p.evaluate(() => runBackup());
      await p.evaluate(() => { board.nodes.find(n => n.type === 'note').text = 'Changed once more'; });
      await p.evaluate(() => runBackup());
      check('without a server it turns itself off quietly and does not retry straight away', backups.length === before + 1 && await p.evaluate(() => backupState.ok === false && /off here/i.test(backupLine())), String(backups.length - before));
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
      backupMode.status = 200;
    }

    // 5h. every agent is told where the project is: stage, what is decided, what is open, what the evidence is
    {
      const p = await page(browser, base);
      await p.newBoard();
      const st = () => p.evaluate(() => { const s = boardStage(); return { stage: s.stage, adopted: s.adopted.length, evidence: s.evidence, brief: stageBrief() }; });
      let r = await st();
      check('an empty board is in Gather, and the brief says not to fork or build yet', r.stage === 'gather' && /^STAGE: Gather\./.test(r.brief) && /Do not fork directions or build anything unless asked/.test(r.brief), r.brief.slice(0, 160));
      await p.evaluate(() => { node('idea', { text: 'Serve solo founders', status: 'sketch', by: 'muse' }, { x: 100, y: 100 }); });
      check('a draft is not a decision: a draft claim alone is still Gather', (await st()).stage === 'gather');
      await p.evaluate(() => { board.nodes.forEach(n => { n.status = 'ink'; }); node('source', { title: 'Founder call 1', text: 'x', weight: 'observed', status: 'ink', by: 'you' }, { x: 100, y: 400 }); node('source', { title: 'Forum thread', text: 'x', weight: 'reported', status: 'ink', by: 'you' }, { x: 100, y: 700 }); node('note', { text: 'my hunch', weight: 'proposed', status: 'ink', by: 'you' }, { x: 100, y: 1000 }); });
      r = await st();
      check('a kept claim makes it Explore; with no directions the open item is the directions', r.stage === 'explore' && /Decided: nothing adopted yet/.test(r.brief) && /Open: directions for “Serve solo founders”/.test(r.brief), r.brief.slice(0, 220));
      check('the evidence is counted by weight, and the brief says proposals are not evidence', r.evidence.observed === 1 && r.evidence.reported === 1 && r.evidence.proposed === 1 && /1 observed, 1 reported, 1 proposal/.test(r.brief) && /not evidence of behaviour/.test(r.brief), JSON.stringify(r.evidence));
      await p.evaluate(() => { const idea = board.nodes.find(n => n.type === 'idea'); ['A', 'B'].forEach((l, i) => node('direction', { idea: idea.id, letter: l, title: 'Option ' + l, text: 't', test: 'x', status: 'ink', by: 'muse' }, { x: 600, y: 100 + i * 400 })); });
      r = await st();
      check('with directions and none adopted it is still Explore, and tells the crew to offer options, not task boards', r.stage === 'explore' && /Open: which direction to adopt/.test(r.brief) && /Do not create task boards, lists or proofs unless asked/.test(r.brief), r.brief.slice(0, 260));
      await p.evaluate(() => adopt(board.nodes.find(n => n.type === 'direction' && n.letter === 'B')));
      r = await st();
      check('adopting a direction moves it to Prototype, names the decision, and says what is open', r.stage === 'prototype' && r.adopted === 1 && /Decided: B · Option B\. Open/.test(r.brief) && /no proof built yet for the adopted direction/.test(r.brief) && /Build and test it/.test(r.brief), r.brief.slice(0, 300));
      await p.evaluate(() => { const d = board.nodes.find(n => n.type === 'direction' && n.letter === 'B'); const pf = node('proof', { dir: d.id, _src: d.id, title: 'Proof B', spec: { items: [] }, status: 'ink', by: 'wright' }, { x: 1100, y: 100 }); edge(d.id, pf.id, 'derive', 'live'); });
      check('once a proof exists the open item is what it shows', /Open: what the proofs show/.test((await st()).brief));
      await p.evaluate(() => { const pf = board.nodes.find(n => n.type === 'proof'); node('print', { proof: pf.id, dir: pf.dir, ed: 1, spec: { items: [] }, status: 'ink', by: 'wright' }, { x: 1500, y: 100 }); });
      r = await st();
      check('a frozen proof makes it Snapshot: review what it does not cover', r.stage === 'snapshot' && /does not yet cover/.test(r.brief), r.brief.slice(0, 200));
      check('the old "nothing adopted" test now follows the stage', await p.evaluate(() => nothingAdopted() === false));

      // the brief reaches every agent that speaks
      await p.newBoard();
      await p.evaluate(() => { setCrewLevel('suggest'); node('idea', { title: 'Serve solo founders', text: 'Selling an AI-run back office to one-person companies', status: 'ink', by: 'you' }, { x: 100, y: 100 }); renderAll(); });
      queue = [{ id: 'stage-cp', match: 'Lumen Copilot', text: 'Start with who pays first.' }];
      await p.type('What should we test first?'); await p.idle();
      const cp = requests.find(x => x.matched === 'stage-cp');
      check('Copilot is told the stage and the three roles', !!cp && /STAGE: Explore\. Decided: nothing adopted yet/.test(cp.full) && /THREE ROLES, ONE VOICE/.test(cp.full), cp ? cp.full.slice(0, 80) : 'no request');
      const before = requests.length;
      await p.evaluate(() => scheduleAdvisor(board.nodes.find(n => n.type === 'idea').id, { force: true })); await p.waitForTimeout(900); await p.idle();
      const adv = requests.slice(before).find(x => /Include 1 or at most 2 pins/.test(x.full));
      check('the advisor looking at a card is told the stage', !!adv && /STAGE: Explore\./.test(adv.full), adv ? '' : 'no advisor request');
      const pid = await p.evaluate(() => { const n = board.nodes.find(x => x.type === 'idea'); board.pins = { [n.id]: [{ id: 'pin-st', agent: 'critic', note: 'Vague.', t: NOW(), seen: true }] }; renderAll(); return n.id; });
      queue = [{ id: 'stage-pin', match: 'Initial pin you left', text: 'Fine.' }];
      await p.evaluate(id => replyToAdvPin(id, 'pin-st', 'Founders in the US'), pid); await p.idle();
      check('a reply in a pin thread is told the stage too', requests.some(x => x.matched === 'stage-pin' && /STAGE: Explore\./.test(x.full)));
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 5i. the bottom bar is a command bar and search box; chat lives in the panel, and @name hands over to it
    {
      const p = await page(browser, base);
      await p.newBoard();
      const ph = () => p.evaluate(() => document.getElementById('lineInput').placeholder);
      check('an empty board still invites the first idea, in command-bar words', /write an idea/i.test(await ph()) && /^Type \//.test(await ph()), await ph());
      await p.evaluate(() => { node('note', { text: 'Founder interviews', status: 'ink', by: 'you' }, { x: 100, y: 100 }); node('note', { text: 'Pricing idea for solo founders', status: 'ink', by: 'you' }, { x: 100, y: 500 }); node('idea', { text: 'Sell an AI back office to one-person companies', status: 'ink', by: 'you' }, { x: 500, y: 100 }); select([]); renderLineCtx(); });
      check('with cards on the board the bar reads as commands and search, with no chat wording', /\/ for commands/.test(await ph()) && /search your cards/i.test(await ph()) && !/\bask\b|critic|chat/i.test(await ph()), await ph());
      await p.evaluate(() => { select([board.nodes.find(n => n.type === 'idea').id]); renderLineCtx(); });
      check('with a claim selected it names the commands that fit', /\/fork/.test(await ph()) && !/\bask\b|critic/i.test(await ph()), await ph());
      check('the chip shows what Enter will do, not an AI target', await p.evaluate(() => !/Canvas AI/.test(document.getElementById('route').textContent)));
      await p.evaluate(() => { select([]); renderLineCtx(); });

      // @name in the bar opens the panel with that member preselected, and the conversation goes on there
      await p.click('#lineInput'); await p.keyboard.type('@critic ');
      const ho = await p.evaluate(() => ({ open: copilotOpen, target: cpTarget, bar: document.getElementById('lineInput').value, chip: document.getElementById('cpTarget')?.textContent.trim() || '', ph: document.getElementById('cpInput')?.placeholder, mode: lineMode }));
      check('typing @critic in the bar opens the panel with Critic preselected, and the bar is empty (no chat mode in the bar)', ho.open && ho.target === 'critic' && ho.bar === '' && /Critic/.test(ho.chip) && /Ask Critic/.test(ho.ph) && ho.mode === null, JSON.stringify(ho));
      queue = [{ id: 'ho1', match: 'Lumen Copilot', text: 'The weakest part is who pays first.' }];
      await p.click('#cpInput'); await p.keyboard.type('What is weakest here?'); await p.keyboard.press('Enter'); await p.idle();
      const ho1 = requests.find(x => x.matched === 'ho1'), last = await p.evaluate(() => { const m = board.copilot.filter(x => x.role === 'ai').at(-1), u = board.copilot.filter(x => x.role === 'user').at(-1); return { agent: m?.agent, to: u?.to, text: u?.text }; });
      check('the message goes to Critic: the model is told so, the reply is Critic\'s, and the history shows who was asked', !!ho1 && /addressing Critic directly/.test(ho1.full) && last.agent === 'critic' && last.to === 'critic' && last.text === 'What is weakest here?', JSON.stringify(last));
      await p.click('[data-cp-untarget]');
      check('the preselected member can be dropped to go back to Copilot', await p.evaluate(() => cpTarget === null && !document.getElementById('cpTarget') && /Ask Copilot|Ask about selection/.test(document.getElementById('cpInput').placeholder)));
      queue = [{ id: 'ho2', match: 'Lumen Copilot', text: 'Scout here.' }];
      await p.evaluate(() => openCopilot(false));
      await p.click('#lineInput'); await p.keyboard.type('@scout find who already sells this'); await p.keyboard.press('Enter'); await p.idle();
      const ho2 = await p.evaluate(() => ({ open: copilotOpen, bar: document.getElementById('lineInput').value, target: cpTarget, users: board.copilot.filter(x => x.role === 'user').map(x => x.text + '>' + x.to), cards: board.nodes.length }));
      check('@name with the question in one go hands it over and sends it; nothing is added to the canvas', ho2.open && ho2.bar === '' && ho2.target === 'scout' && ho2.users.at(-1) === 'find who already sells this>scout' && ho2.cards === 3, JSON.stringify(ho2));
      const ex = await p.evaluate(() => { const d = node('proof', { title: 'Draft by Wright', spec: { items: [] }, status: 'sketch', by: 'wright', pid: 'p-wr' }, { x: 900, y: 100 }); select([d.id]); return { own: route('@wright make it shorter')?.kind, other: route('@critic what is weakest?')?.kind }; });
      check('the exception: on a draft that member made, @name still revises it; for anyone else it hands over', ex.own === 'revise' && ex.other === 'handoff', JSON.stringify(ex));
      await p.evaluate(() => { board.nodes = board.nodes.filter(n => n.pid !== 'p-wr'); select([]); setCpTarget(null); openCopilot(false); renderLineCtx(); });

      // card search: plain words list matching cards; nothing is picked until ↓, so Enter does what it always did
      const menu = () => p.evaluate(() => ({ hidden: document.getElementById('menu').hidden, head: [...document.querySelectorAll('#menu .mh')].map(x => x.textContent), rows: [...document.querySelectorAll('#menu [data-mi]')].map(x => x.querySelector('.cmd').textContent), sel: [...document.querySelectorAll('#menu [data-mi]')].findIndex(x => x.getAttribute('aria-selected') === 'true') }));
      await p.click('#lineInput'); await p.keyboard.type('founder');
      let m = await menu();
      check('typing plain words lists the matching cards, with none picked yet', !m.hidden && m.head[0] === 'Cards' && m.rows.some(r => /Founder interviews/.test(r)) && m.rows.some(r => /Pricing idea for solo founders/.test(r)) && m.sel === -1, JSON.stringify(m));
      await p.keyboard.press('Escape');
      check('Escape closes the list and keeps what you typed', (await menu()).hidden && await p.evaluate(() => document.getElementById('lineInput').value === 'founder'));
      await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.keyboard.type('pricing');
      await p.keyboard.press('ArrowDown');
      m = await menu();
      check('↓ picks the first card', m.sel === 0, JSON.stringify(m));
      await p.keyboard.press('Enter'); await p.waitForTimeout(500);
      const jump = await p.evaluate(() => ({ sel: sel.map(id => (byId(id).text || '').slice(0, 18)), bar: document.getElementById('lineInput').value, cards: board.nodes.length, menuHidden: document.getElementById('menu').hidden }));
      check('Enter on a picked card selects it and takes you to it, and adds nothing', jump.sel.join() === 'Pricing idea for s' && jump.bar === '' && jump.cards === 3 && jump.menuHidden, JSON.stringify(jump));
      await p.evaluate(() => { select([]); renderLineCtx(); }); // words about a selected card go to Copilot; with nothing selected they become an idea
      await p.click('#lineInput'); await p.keyboard.type('a thought about onboarding'); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
      check('Enter with nothing picked still does what it always did: the words become an idea', await p.evaluate(() => board.nodes.length === 4 && board.nodes.some(n => n.type === 'idea' && /thought about onboarding/.test(n.text))));
      await p.click('#lineInput'); await p.keyboard.type('kanban');
      m = await menu();
      check('a word that names a command lists the command too', m.head.includes('Commands') && m.rows.some(r => /^\/kanban/.test(r)), JSON.stringify(m));
      await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.keyboard.type('/for');
      m = await menu();
      check('a slash still opens the command list, not the card search', m.head[0] === 'Moves' && !m.rows.some(r => /Founder/.test(r)), JSON.stringify(m));
      await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.keyboard.press('Escape');

      // the selection shows once: in the panel while it is open
      await p.evaluate(() => { openCopilot(false); select([board.nodes.find(n => n.type === 'idea').id]); renderLineCtx(); });
      const ctxN = () => p.evaluate(() => ({ bar: document.querySelectorAll('#lineCtx .ctx:not(.pending)').length, panel: document.querySelectorAll('#cpCompCards *').length > 0 && !!document.getElementById('cpCompCards').textContent.trim() }));
      check('with the panel closed the bar shows the selected card', (await ctxN()).bar >= 1);
      await p.evaluate(() => openCopilot(true)); await p.waitForTimeout(300);
      let c = await ctxN();
      check('with the panel open the selection is shown there once, not in the bar too', c.bar === 0 && c.panel, JSON.stringify(c));
      await p.evaluate(() => openCopilot(false)); await p.waitForTimeout(300);
      check('closing the panel brings the chips back', (await ctxN()).bar >= 1);
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 5j. several cards selected: right-click gives a menu for the whole selection, and Ask Copilot works from it and from the selection bar
    {
      const p = await page(browser, base);
      await p.newBoard();
      const ids = await p.evaluate(() => { const a = node('note', { text: 'Founder interviews', status: 'ink', by: 'you' }, { x: 200, y: 150 }), b = node('note', { text: 'Pricing idea', status: 'ink', by: 'you' }, { x: 640, y: 150 }), c = node('note', { text: 'Landing page copy', status: 'ink', by: 'you' }, { x: 1080, y: 150 }); select([a.id, b.id]); renderAll(); focusNodes(board.nodes, 1, 0); return [a.id, b.id, c.id]; });
      await p.waitForTimeout(500);
      const rect = id => p.evaluate(id => { const r = document.querySelector(`[data-id="${id}"]`).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, id);
      const menu = () => p.evaluate(() => ({ open: !document.getElementById('cardMenu').hidden, head: document.querySelector('#cardMenu .cm-head b')?.textContent || '', sm: [...document.querySelectorAll('#cardMenu [data-sm]')].map(x => x.dataset.sm), cm: document.querySelectorAll('#cardMenu [data-cm]').length }));
      const right = async (x, y) => { await p.mouse.click(x, y, { button: 'right' }); await p.waitForTimeout(250); return menu(); };
      const r0 = await rect(ids[0]), r1 = await rect(ids[1]), r2 = await rect(ids[2]);
      let m = await right(r0.cx, r0.cy);
      check('right-click on one of several selected cards opens a menu for the whole selection (not that one card\'s menu)', m.open && /^2 /.test(m.head) && ['copilot', 'gather', 'list', 'kanban', 'dup', 'group'].every(k => m.sm.includes(k)) && m.cm === 0, JSON.stringify(m));
      await p.click('#cardMenu [data-sm="copilot"]'); await p.waitForTimeout(400);
      const cp = await p.evaluate(() => ({ open: copilotOpen, selN: sel.length, focus: document.activeElement?.id, ph: document.getElementById('cpInput')?.placeholder, chips: document.querySelectorAll('#cpCompCards .cp-comp-chip').length, sent: (board.copilot || []).length, menuOpen: !document.getElementById('cardMenu').hidden }));
      check('Ask Copilot there opens the panel with the selection as context and the cursor in the input, and sends nothing (it used to do nothing at all)', cp.open && cp.selN === 2 && cp.focus === 'cpInput' && /selection/i.test(cp.ph) && cp.chips === 2 && cp.sent === 0 && !cp.menuOpen, JSON.stringify(cp));
      await p.evaluate(() => openCopilot(false)); await p.waitForTimeout(300);

      const gapX = (r0.r + r1.l) / 2, gapY = r0.t + 24;
      check('the point used for the gap test is empty canvas', await p.evaluate(([x, y]) => !document.elementFromPoint(x, y)?.closest('.card'), [gapX, gapY]));
      m = await right(gapX, gapY);
      check('right-click on the empty gap inside the selection opens the same menu', m.open && /^2 /.test(m.head) && m.sm.includes('copilot'), JSON.stringify(m));
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      m = await right(r2.cx, Math.min(r2.b + 160, 760));
      check('right-click on empty canvas away from the selection opens nothing', !m.open, JSON.stringify(m));
      m = await right(r2.cx, r2.cy);
      check('right-click on a card outside the selection still selects just it and opens its own menu', m.open && m.cm > 0 && m.sm.length === 0 && await p.evaluate(id => sel.length === 1 && sel[0] === id, ids[2]), JSON.stringify(m));
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);

      // the selection bar has it first
      await p.evaluate(ids => { select([ids[0], ids[1]]); renderAll(); }, ids); await p.waitForTimeout(300);
      const bar = await p.evaluate(() => [...document.querySelectorAll('#selbar [data-s]')].map(b => b.dataset.s));
      check('the selection bar offers Ask Copilot first', bar[0] === 'copilot' && bar.includes('gather') && bar.includes('kanban'), bar.join());
      await p.click('#selbar [data-s="copilot"]'); await p.waitForTimeout(400);
      check('and it opens the panel with both cards in context', await p.evaluate(() => copilotOpen && sel.length === 2 && document.querySelectorAll('#cpCompCards .cp-comp-chip').length === 2 && document.activeElement?.id === 'cpInput'));
      await p.evaluate(() => openCopilot(false)); await p.waitForTimeout(300);

      // other menu items act on the whole selection
      const before = await p.evaluate(() => board.nodes.filter(n => !n.tombstone).length);
      const q0 = await rect(ids[0]);
      await right(q0.cx, q0.cy); await p.click('#cardMenu [data-sm="dup"]'); await p.waitForTimeout(500);
      check('Duplicate in the selection menu duplicates every selected card', await p.evaluate(b => board.nodes.filter(n => !n.tombstone).length === b + 2, before));
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 5k. the suggestions under an empty Copilot conversation follow the stage; visual ones only for visual cards
    {
      const p = await page(browser, base);
      await p.newBoard();
      const chips = () => p.evaluate(() => copilotStarterChips());
      const VISUAL = /visual keyframe|reference photos|web references|Examine this image|variations/i;
      let c = await chips();
      check('an empty board gets gathering suggestions, none of them visual or web search', c.length === 3 && /one sentence/.test(c[0]) && !c.some(x => VISUAL.test(x)), c.join(' | '));
      await p.evaluate(() => { node('idea', { text: 'Sell an AI back office to one-person companies', status: 'ink', by: 'you' }, { x: 100, y: 100 }); select([]); });
      c = await chips();
      check('with a claim and no directions: propose directions, test the claim, ask who it is for', /Propose 2 directions/.test(c[0]) && c.some(x => /prove this wrong/.test(x)) && c.some(x => /Who is this for/.test(x)), c.join(' | '));
      await p.evaluate(() => { const idea = board.nodes.find(n => n.type === 'idea'); ['A', 'B'].forEach((l, i) => node('direction', { idea: idea.id, letter: l, title: 'Option ' + l, text: 't', test: 'x', status: 'ink', by: 'muse' }, { x: 600, y: 100 + i * 400 })); });
      c = await chips();
      check('with directions and none adopted: compare them and choose', /Compare the directions/.test(c[0]) && c.some(x => /would you adopt/.test(x)), c.join(' | '));
      await p.evaluate(() => adopt(board.nodes.find(n => n.type === 'direction' && n.letter === 'B')));
      c = await chips();
      check('once a direction is adopted: the cheapest real test, a plan, questions for real people', /cheapest real test/.test(c[0]) && c.some(x => /two-week plan/.test(x)) && c.some(x => /5 real people/.test(x)) && !c.some(x => VISUAL.test(x)), c.join(' | '));
      await p.evaluate(() => { const d = board.nodes.find(n => n.type === 'direction' && n.letter === 'B'); const pf = node('proof', { dir: d.id, _src: d.id, title: 'Proof B', spec: { items: [] }, status: 'ink', by: 'wright' }, { x: 1100, y: 100 }); edge(d.id, pf.id, 'derive', 'live'); node('print', { proof: pf.id, dir: pf.dir, ed: 1, spec: { items: [] }, status: 'ink', by: 'wright' }, { x: 1500, y: 100 }); });
      c = await chips();
      check('with a frozen proof: what it does not cover, and what to decide next', /does this not cover/.test(c[0]) && c.some(x => /decide next/.test(x)), c.join(' | '));
      await p.evaluate(() => select([board.nodes.find(n => n.type === 'direction' && n.letter === 'A').id]));
      c = await chips();
      check('with a card selected the first suggestion is to critique it, by its letter, then stage-specific ones', c[0] === 'Critique A' && c.length === 3 && !c.some(x => VISUAL.test(x)), c.join(' | '));
      await p.evaluate(() => { node('image', { title: 'Mood board', status: 'ink', by: 'you' }, { x: 100, y: 800 }); select([board.nodes.find(n => n.type === 'image').id]); });
      c = await chips();
      check('only a selected image brings the visual suggestions', c.some(x => /Examine this image/.test(x)), c.join(' | '));
      check('every suggestion is short enough to read at a glance', await p.evaluate(() => { const all = []; for (const sel0 of [[], [board.nodes.find(n => n.type === 'idea').id]]) { select(sel0); all.push(...copilotStarterChips()); } return all.every(x => x.length <= 36); }));
      await p.evaluate(() => { select([]); openCopilot(true); renderCopilot(); }); await p.waitForTimeout(300);
      check('the panel shows them, as buttons that send the text', await p.evaluate(() => { const b = [...document.querySelectorAll('.cp-chip')].map(x => x.textContent.trim()); return b.length === 3 && b.every(x => copilotStarterChips().includes(x)); }));
      await p.evaluate(() => { store.set('.lang', 'zh'); select([board.nodes.find(n => n.type === 'idea').id]); });
      const zh = await chips();
      check('and they come in Chinese when the interface is Chinese, every one of them', zh.length === 3 && zh.every(x => /[\u4e00-\u9fff]/.test(x)), zh.join(' | '));
      await p.evaluate(() => { store.set('.lang', 'en'); });
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 5l. the bottom bar looks and reads like a command bar: a prompt, keys, no chat controls
    {
      const p = await page(browser, base);
      await p.newBoard();
      const vis = () => p.evaluate(() => { const v = id => { const e = document.getElementById(id); return !!e && e.offsetParent !== null && e.getBoundingClientRect().width > 0 }; return { send: v('sendBtn'), mic: v('micBtn'), enh: v('enhanceBtn'), route: v('route'), plus: v('plusBtn'), prompt: !!document.querySelector('#line .prompt') && document.querySelector('#line .prompt').offsetParent !== null, ph: lineIn.placeholder, chip: (document.getElementById('route').textContent || '').trim() }; });
      let v = await vis();
      check('an empty board still reads as a command bar, not "write an idea"', /\/ for commands/.test(v.ph) && !/drop anything/.test(v.ph), v.ph);
      check('the bar shows a prompt glyph and no send button, microphone or enhance star', v.prompt && !v.send && !v.mic && !v.enh, JSON.stringify(v));
      await p.evaluate(() => { node('idea', { title: 'Solo back office', text: 'An AI-run back office for one-person companies', status: 'ink', by: 'you' }, { x: 100, y: 100 }); select([]); renderAll(); });
      await p.click('#lineInput'); await p.keyboard.type('what should I test first?'); await p.waitForTimeout(250);
      v = await vis();
      check('typing a question says Enter asks in the panel, with a key cap, and no send button, microphone or enhance star', /↵/.test(v.chip) && /Ask in panel/.test(v.chip) && !v.send && !v.mic && !v.enh, JSON.stringify(v));
      check('the Command chip with the AI mark is gone', !/Command/.test(v.chip) && await p.evaluate(() => !document.querySelector('#route .mk')));
      await p.fill('#lineInput', ''); await p.keyboard.type('/fork'); await p.waitForTimeout(250);
      v = await vis();
      check('a command says what Enter will run', /↵/.test(v.chip) && /fork/i.test(v.chip), v.chip);
      await p.evaluate(() => { node('note', { text: 'Talk to five founders', status: 'ink', by: 'you' }, { x: 500, y: 100 }); renderAll(); });
      await p.fill('#lineInput', ''); await p.keyboard.type('Talk'); await p.waitForTimeout(300);
      const chipText = () => p.evaluate(() => document.getElementById('route').textContent.replace(/\s+/g, ' ').trim());
      let cc = await chipText();
      check('with matching cards listed, the key cap says ↓ opens a card and still says what Enter does', /↓\s*open card/.test(cc) && /↵/.test(cc), cc);
      await p.keyboard.press('ArrowDown'); await p.waitForTimeout(200);
      cc = await chipText();
      check('after ↓ the cap says Enter opens the card, and nothing about adding', /^↵\s*Open card$/.test(cc), cc);
      await p.keyboard.press('Escape'); await p.waitForTimeout(250);
      cc = await chipText();
      check('closing the list brings the ordinary hint back', !/open card/i.test(cc) && /↵/.test(cc), cc);
      await p.fill('#lineInput', ''); await p.keyboard.type('Plan the next two weeks'); await p.waitForTimeout(250);
      await p.keyboard.press('Tab'); await p.waitForTimeout(250);
      check('Tab does not rewrite ordinary words; enhancing is for picture prompts only', await p.evaluate(() => lineIn.value === 'Plan the next two weeks' && document.getElementById('sharpen').hidden));
      await p.fill('#lineInput', ''); await p.keyboard.type('/image a quiet street at dusk'); await p.waitForTimeout(300);
      check('an image command still offers to enhance its prompt', (await vis()).enh);
      await p.fill('#lineInput', ''); await p.waitForTimeout(150);
      check('the corner radius is that of a bar, not a pill', await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.line-field')).borderTopLeftRadius) <= 16));
      await p.keyboard.type('hello'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
      check('Enter still works with no send button', await p.evaluate(() => lineIn.value === ''));
      await p.setViewportSize({ width: 560, height: 820 }); await p.click('#lineInput'); await p.keyboard.type('hello there'); await p.waitForTimeout(250);
      check('on a phone the send button comes back, since there is no hardware Enter', await p.evaluate(() => { const e = document.getElementById('sendBtn'); return e.offsetParent !== null && e.getBoundingClientRect().width > 0; }));
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 5m. paths on one board: record how a test came out, go back to the choice, start a new round, bring back a discarded direction
    {
      const p = await page(browser, base);
      await p.newBoard();
      const ids = await p.evaluate(() => {
        const claim = node('idea', { text: 'Solo accountants need receipt chasing', status: 'ink', by: 'you' }, { x: 100, y: 100 });
        const src = node('source', { title: 'Accountant call 1', text: 'Chasing receipts takes two days a month', weight: 'observed', status: 'ink', by: 'you' }, { x: -400, y: 100 });
        edge(src.id, claim.id, 'derive', 'live');
        const d = {};
        [['A', 'Copilot drafts', 'An assistant drafts the receipt reminder and waits for approval'], ['B', 'Concierge chasing', 'The founder chases receipts by hand for three accountants'], ['C', 'Weekly digest', 'One weekly email lists every missing receipt']].forEach(([l, t, x], i) => { d[l] = node('direction', { idea: claim.id, _src: claim.id, letter: l, title: t, text: x, test: 'Three of five accountants keep using it after two weeks', status: 'ink', by: 'muse' }, { x: 600, y: 100 + i * 420 }).id; edge(claim.id, d[l], 'derive', 'live'); });
        d.D = node('direction', { idea: claim.id, _src: claim.id, letter: 'D', title: 'Narrow to Xero', text: 'Only Xero users, pulling missing receipts from bank feeds', test: 'Two of three Xero users connect it', mode: 'desk', status: 'sketch', by: 'muse', pid: 'p-d' }, { x: 600, y: 1360 }).id;
        edge(claim.id, d.D, 'derive', 'live');
        renderAll();
        return { claim: claim.id, src: src.id, ...d };
      });
      await p.evaluate(id => adopt(byId(id)), ids.B);

      // the designer records the result; the crew never does
      await p.evaluate(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove()));
      await p.evaluate(id => setOutcome(byId(id), 'failed', '1 of 5 kept using it'), ids.B);
      let r = await p.evaluate(id => { const d = byId(id), el = document.querySelector(`.card[data-id="${id}"]`); return { out: d.outcome, rec: (board.declined || []).find(x => x.kind === 'failed' && x.ref === id), change: (board.changes || []).find(c => c.op === 'outcome' && c.id === id), cls: el.className, res: el.querySelector('.test .res')?.innerText.replace(/\s+/g, ' ') }; }, ids.B);
      check('a failed result is kept on the direction with what happened', r.out && r.out.result === 'failed' && r.out.note === '1 of 5 kept using it', JSON.stringify(r.out));
      check('the card stays on the board and says it failed and why', /res-failed/.test(r.cls) && /Failed · 1 of 5 kept using it/.test(r.res || ''), r.cls + ' | ' + r.res);
      check('a failed test joins decision memory with its reason, and is logged as a decision that outlasts the cap', !!r.rec && r.rec.reason === '1 of 5 kept using it' && !!r.change && await p.evaluate(c => isKeyChange(c), r.change));
      check('failing the adopted direction offers to go back to the claim', /failed its test/.test(await p.toast()) && /Go back/.test(await p.toast()), await p.toast());
      r = await p.evaluate(() => stageBrief());
      check('every agent is told what a real test ruled out, and that the designer decides what next', /Ruled out by a real test: B · Concierge chasing \(1 of 5 kept using it\)/.test(r) && /the adopted direction failed its test; the designer decides/.test(r), r.slice(0, 320));
      await p.evaluate(() => undo());
      check('Undo takes the result and its decision record back', await p.evaluate(id => !byId(id).outcome && !(board.declined || []).some(x => x.kind === 'failed' && x.ref === id), ids.B));
      await p.evaluate(id => setOutcome(byId(id), 'failed', '1 of 5 kept using it'), ids.B);
      const proof = await p.evaluate(id => { const pf = node('proof', { dir: id, _src: id, title: 'Concierge script', spec: { items: [] }, status: 'ink', by: 'wright' }, { x: 1100, y: 520 }); edge(id, pf.id, 'derive', 'live'); renderAll(); return pf.id; }, ids.B);
      check('what was built on a failed direction stays visible but reads as a closed path', await p.evaluate(id => document.querySelector(`.card[data-id="${id}"]`).classList.contains('closed'), proof));

      // going back reopens the choice and keeps the failed path
      const passedBefore = await p.evaluate(id => (board.declined || []).filter(x => x.kind === 'passed-over' && x.target === id).length, ids.claim);
      await p.evaluate(id => goBack(byId(id)), ids.claim);
      r = await p.evaluate(i => ({ adopted: board.adopted[i.claim] || null, b: !!byId(i.B) && byId(i.B).outcome?.result, passed: (board.declined || []).filter(x => x.kind === 'passed-over' && x.target === i.claim).length, failedRec: (board.declined || []).some(x => x.kind === 'failed' && x.ref === i.B), change: (board.changes || []).some(c => c.op === 'go-back' && c.id === i.claim && c.from === i.B), log: board.log.slice(-1)[0]?.html || '', stage: boardStage().stage }), ids);
      check('Go back clears the adoption and leaves the failed direction on the board', r.adopted === null && r.b === 'failed', JSON.stringify(r));
      check('the directions that were passed over are candidates again; the failed one stays turned down', passedBefore === 2 && r.passed === 0 && r.failedRec, `${passedBefore} → ${r.passed}, failed record ${r.failedRec}`);
      check('going back is logged as a decision and the board is back in Explore', r.change && /Went back to/.test(r.log) && r.stage === 'explore', r.log + ' | ' + r.stage);
      await p.evaluate(() => undo());
      check('Undo restores the adoption', await p.evaluate(i => board.adopted[i.claim] === i.B, ids));
      await p.evaluate(id => goBack(byId(id)), ids.claim);

      // the claim's sheet shows every path; a discarded direction can be brought back
      await p.evaluate(id => erase([id]), ids.D); await p.waitForTimeout(500);
      const rec = await p.evaluate(id => (board.declined || []).find(x => x.kind === 'draft' && x.ref === id), ids.D);
      check('a discarded direction keeps its letter, plan and test in the record', rec && rec.meta && rec.meta.letter === 'D' && rec.meta.test === 'Two of three Xero users connect it' && rec.meta.mode === 'desk', JSON.stringify(rec && rec.meta));
      await p.evaluate(id => { select([id]); openFocus(id); }, ids.claim); await p.waitForTimeout(600);
      r = await p.evaluate(() => { const s = document.querySelector('#margin .m-paths'); return s ? { text: s.innerText.replace(/\s+/g, ' '), back: !!s.querySelector('[data-m="bring-back"]'), goBack: !!s.querySelector('[data-m="go-back"]'), round: !!s.querySelector('[data-m="new-round"]') } : null; });
      check('the claim\'s sheet lists every path and how it ended', !!r && /Paths/.test(r.text) && /3 directions · 1 failed/.test(r.text) && /Concierge chasing 1 of 5 kept using it Failed/.test(r.text) && /Narrow to Xero/.test(r.text) && !/Not adopted|Adopted/.test(r.text), r && r.text);
      check('it offers Bring back and New round, and no Go back while nothing is adopted', r && r.back && r.round && !r.goBack, JSON.stringify(r));
      {
        const bad = await p.evaluate(LEGIBILITY, '#margin .m-paths');
        check('the Paths list (grey blocks, letter chips, results) is legible in dark mode', bad.length === 0, bad.join(' | '));
        const q = await page(browser, base, { theme: 'light' });
        await q.newBoard();
        await q.evaluate(() => {
          const c = node('idea', { text: 'Solo accountants need receipt chasing', status: 'ink', by: 'you' }, { x: 100, y: 100 });
          [['A', 'Copilot drafts', 'passed', '4 of 5 approved the draft'], ['B', 'Concierge chasing', 'failed', '1 of 5 kept using it'], ['C', 'Weekly digest', null, '']].forEach(([l, t, res, note], i) => { const d = node('direction', { idea: c.id, _src: c.id, letter: l, title: t, text: 'x', test: 'y', status: 'ink', by: 'muse' }, { x: 600, y: 100 + i * 420 }); edge(c.id, d.id, 'derive', 'live'); if (res) setOutcome(d, res, note); });
          const dd = node('direction', { idea: c.id, _src: c.id, letter: 'D', title: 'Narrow to Xero', text: 'x', test: 'y', status: 'sketch', by: 'muse', pid: 'p-q' }, { x: 600, y: 1400 }); edge(c.id, dd.id, 'derive', 'live');
          return erase([dd.id]).then(() => { select([c.id]); openFocus(c.id); });
        });
        await q.waitForTimeout(800);
        const badL = await q.evaluate(LEGIBILITY, '#margin .m-paths');
        check('the Paths list is legible in light mode', badL.length === 0, badL.join(' | '));
        const badC = await q.evaluate(LEGIBILITY, '.card.direction .test .res');
        check('a result on a card is legible in light mode', badC.length === 0, badC.join(' | '));
        await q.context().close();
      }
      await p.click('#margin .m-paths [data-m="bring-back"]'); await p.waitForTimeout(500);
      r = await p.evaluate(i => { const d = board.nodes.find(n => n.type === 'direction' && n.idea === i.claim && n.letter === 'D'); return { d: d && { title: d.title, test: d.test, mode: d.mode, status: d.status, by: d.by }, rec: (board.declined || []).some(x => x.kind === 'draft' && x.ref === i.D), change: (board.changes || []).some(c => c.op === 'bring-back') }; }, ids);
      check('Bring back restores the direction as a draft, with its letter, plan and test', r.d && r.d.title === 'Narrow to Xero' && r.d.test === 'Two of three Xero users connect it' && r.d.mode === 'desk' && r.d.status === 'sketch' && r.d.by === 'muse', JSON.stringify(r.d));
      check('a direction brought back no longer counts as turned down, and the act is logged as a decision', !r.rec && r.change, JSON.stringify(r));
      await p.evaluate(() => { closeFocus(); board.nodes.filter(n => n.type === 'direction').forEach(n => { n.status = 'ink'; }); renderAll(); });

      // with all four letters used, Strategist offers a new round instead of asking you to discard
      await p.evaluate(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove()));
      await p.evaluate(id => fork(byId(id), 3), ids.claim); await p.waitForTimeout(300);
      check('a claim with four directions offers a new round; the four stay on the board', /four directions/.test(await p.toast()) && /New round/.test(await p.toast()) && !/Discard one/.test(await p.toast()), await p.toast());
      const r2 = await p.evaluate(id => newRound(byId(id))?.id, ids.claim); await p.waitForTimeout(300);
      r = await p.evaluate(i => { const n = byId(i.r2); return { round: n.round, roundOf: n.roundOf, prev: n.prevRound, text: n.text, status: n.status, by: n.by, link: board.edges.some(e => e.a === i.claim && e.b === i.r2), srcs: sourcesFor(n).map(s => s.id), head: document.querySelector(`.card[data-id="${i.r2}"] .in`)?.textContent || '', change: (board.changes || []).some(c => c.op === 'new-round' && c.id === i.r2), fam: roundFamily(n).map(x => x.id) }; }, { ...ids, r2 });
      check('a new round is a kept claim of yours, round 2, linked to the claim it came from', r.round === 2 && r.roundOf === ids.claim && r.prev === ids.claim && r.status === 'ink' && r.by === 'you' && r.link && r.text === 'Solo accountants need receipt chasing', JSON.stringify(r));
      check('the new round rests on the same evidence and says which round it is', r.srcs.includes(ids.src) && /Round 2/.test(r.head), r.head);
      check('starting a round is logged as a decision, and the rounds are one family', r.change && r.fam.join() === [ids.claim, r2].join(), JSON.stringify(r.fam));
      check('the card menus offer the ways back', await p.evaluate(i => { const k = n => stripActs(byId(n)).map(a => a.k); return k(i.B).includes('result') && k(i.claim).includes('new-round') && !k(i.claim).includes('go-back'); }, ids));

      // Strategist in round 2 knows what round 1 tried and how it came out, and holds back a repeat of the failed path
      queue = [{ id: 'round2', match: 'This is round 2 of the claim', text: { directions: [{ title: 'Concierge chasing', plan: 'The founder chases receipts by hand for three accountants', test: 'x', mode: 'story' }, { title: 'Inbox agent', plan: 'Reads the accountant inbox and asks clients for the missing receipt', test: 'Four of five clients reply within two days', mode: 'story' }, { title: 'Accountant-only portal', plan: 'A portal accountants share with clients', test: 'Two of three accountants share it', mode: 'desk' }] } }];
      await p.evaluate(id => fork(byId(id), 3), r2); await p.idle();
      const req = requests.find(x => x.matched === 'round2');
      check('round 2 is told every earlier direction and how its test came out', !!req && /Round 1, B · Concierge chasing: .*\(test failed: 1 of 5 kept using it\)/.test(req.full) && /Round 1, A · Copilot drafts: .*\(not adopted\)/.test(req.full), req ? req.full.slice(req.full.indexOf('This is round'), req.full.indexOf('This is round') + 400) : 'no request');
      check('and that a failed real-world test is a turned-down idea', !!req && /a direction whose real-world test failed/.test(req.full));
      r = await p.evaluate(id => ({ made: board.nodes.filter(n => n.type === 'direction' && n.idea === id).map(n => n.letter + ' ' + n.title), held: (board.held || []).map(h => h.text) }), r2);
      check('a repeat of the failed direction is held back; the new ones arrive as A and B of round 2', r.made.join() === 'A Inbox agent,B Accountant-only portal' && r.held.some(t => /Concierge chasing/.test(t)), JSON.stringify(r));

      // a direction's sheet records the result in place
      await p.evaluate(id => { select([id]); openFocus(id); }, ids.A); await p.waitForTimeout(600);
      check('a kept direction\'s sheet has a Result section with Passed and Failed', (await p.locator('#margin .m-result [data-m="outcome"]').count()) === 2);
      await p.fill('#margin #mResNote', '4 of 5 approved the draft'); await p.click('#margin .m-result [data-r="passed"]'); await p.waitForTimeout(400);
      check('choosing Passed records it with the line you wrote', await p.evaluate(id => { const o = byId(id).outcome; return o && o.result === 'passed' && o.note === '4 of 5 approved the draft'; }, ids.A));
      await p.click('#margin .m-result [data-r="passed"]'); await p.waitForTimeout(400);
      check('choosing it again clears the result', await p.evaluate(id => !byId(id).outcome, ids.A));
      await p.evaluate(() => closeFocus());

      // the Record Result dialog from the card menu
      await p.evaluate(id => { select([id]); act('result', byId(id)); }, ids.C); await p.waitForTimeout(300);
      await p.click('#resForm [data-r="failed"]'); await p.fill('#resForm [name="note"]', 'Nobody opened the digest'); await p.click('#resForm [type="submit"]'); await p.waitForTimeout(400);
      check('the Record Result dialog records a result and its reason', await p.evaluate(id => { const o = byId(id).outcome; return o && o.result === 'failed' && o.note === 'Nobody opened the digest'; }, ids.C));
      for (const theme of ['dark', 'light']) {
        await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme); await p.waitForTimeout(150);
        const bad = await p.evaluate(LEGIBILITY, `.card[data-id="${ids.C}"] .test .res b`);
        check(`a failed result is legible in ${theme} mode`, bad.length === 0, bad.join(' | '));
      }
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 6. two crew axes (speaks up, acts on the board): pacing by what you have read, a hidden ceiling, the crew entry and popover
    {
      const p = await page(browser, base);
      await p.newBoard();
      await p.evaluate(() => { setCrewLevel('suggest'); advQuietMs = 300; advMaxWaitMs = 2000; advSpent = []; advHeld = 0; board.pins = {}; IDLE_NEED.matters = 200; IDLE_NEED.often = 200; });
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
      check('the crew, the model and settings are one entry in the top bar (no separate seats, chip or gear)', await p.evaluate(() => $('crew').children.length === 1 && !!$('crew').querySelector('#crewSetBtn') && $('settingsBtn').hidden && !document.querySelector('#crew .seat') && !!document.querySelector('#crewPop #crewModeBtn') && document.querySelectorAll('#crewPop .seat[data-agent]').length === 4 && !!document.querySelector('#crewPop [data-crew-settings]')));
      check('connection health shows once: with a working model the entry has no words, the model row inside names it', await p.evaluate(() => !document.querySelector('#crewSetBtn .conn-dot') && !document.querySelector('#crewSetBtn .hub-l') && document.querySelector('#crewModeBtn small').textContent.trim() === apiModelName()), await p.evaluate(() => document.getElementById('crewModeBtn').outerHTML.slice(0, 200)));
      check('its label names what the crew may do, not the participation level (that is the top-bar switch)', !/Listening|Joins in/.test(await p.evaluate(() => document.getElementById('crewSetBtn').getAttribute('aria-label'))) && /Only drafts/.test(await p.evaluate(() => document.getElementById('crewSetBtn').getAttribute('aria-label'))));
      const pinCard = await p.evaluate(() => { const id = board.nodes.find(n => n.type === 'note').id; board.pins = { [id]: [{ id: 'pin-show', agent: 'critic', note: 'Read me', t: NOW(), seen: false }] }; renderAll(); renderCrew(); return id; });
      check('the entry shows the crew is waiting for you', await p.evaluate(() => { const g = $('crewSetBtn'); return g.classList.contains('quiet-pacing') && /read the last thought/.test(g.title); }));
      await p.click('#crewSetBtn'); await p.waitForTimeout(300);
      const segs = await p.evaluate(() => ['speak', 'act'].map(a => [...document.querySelectorAll(`#crewPop [data-crew-${a}]`)].map(b => b.dataset['crew' + a[0].toUpperCase() + a.slice(1)] + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(',')).join(' | '));
      check('the popover has one segmented axis (acts on the board); participation lives only in the top-bar switch', segs === ' | drafts*,create' && await p.evaluate(() => document.querySelectorAll('#crewPop .sp-seg').length === 1 && !/Focus|Listening|Teamwork/.test($('crewPop').innerText)), segs);
      check('no Copilot shortcut in the popover', await p.evaluate(() => !document.querySelector('#crewPop [data-crew-copilot]')));
      await p.click('#crewPop [data-crew-lock="1"]'); await p.waitForTimeout(200);
      check('lanes can be locked from the popover', await p.evaluate(() => lockedBays().includes(1) && document.querySelector('#crewPop [data-crew-lock="1"]').getAttribute('aria-pressed') === 'true'));
      await p.click('#crewPop [data-crew-lock="1"]'); await p.waitForTimeout(200);
      check('Crew popover: title only unless the crew is held back, the waiting thought comes first, lock icons only on locked lanes', await p.evaluate(() => { const pop = document.getElementById('crewPop'); const kids = [...pop.children]; const locks = [...pop.querySelectorAll('.crew-lock')]; return pop.querySelector('.cp-pop-head').textContent.trim() === 'Crew' && kids[1]?.classList.contains('crew-wait') && locks.every(b => !!b.querySelector('.ico') === (b.getAttribute('aria-pressed') === 'true')) && !!pop.querySelector('.crew-axis-h [data-crew-custom]'); }));
      await p.click('#crewPop [data-crew-show]'); await p.waitForTimeout(500);
      check('Show opens the waiting thought and marks it read', await p.evaluate(id => openAdvNodeId === id && board.pins[id][0].seen === true && !$('crewSetBtn').classList.contains('quiet-pacing'), pinCard));
      await p.evaluate(() => closeAdvPop());
      await p.click('#partSw [data-part="often"]'); await p.waitForTimeout(200);
      await p.click('#crewSetBtn'); await p.waitForTimeout(300);
      await p.click('#crewPop [data-crew-act="create"]'); await p.waitForTimeout(200);
      check('choosing on each axis takes effect and is remembered', await p.evaluate(() => crewSpeak === 'often' && crewAct === 'create' && store.get('.crewSpeak') === 'often' && store.get('.crewAct') === 'create' && perm('create') === 'direct' && /Can create cards/.test(document.getElementById('crewSetBtn').getAttribute('aria-label')) && board.speak === 'often'));
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      // the connection popover is only about the connection (reached from the model row in the one entry)
      if (!(await p.evaluate(() => crewPopOpen))) await p.click('#crewSetBtn');
      await p.click('#crewModeBtn'); await p.waitForTimeout(400);
      check('the model row opens Connection and closes the entry', await p.evaluate(() => studioPopOpen && !crewPopOpen));
      const conn = await p.evaluate(() => document.getElementById('studioPop').innerText);
      check('the connection popover is only about the connection, and says nothing twice', /Connection/.test(conn) && !/Unasked thoughts|Agent permissions|Auto follow-up/.test(conn) && (conn.match(/gpt-5|smoke/g) || []).length <= 1 && !/Runs on this computer|OpenAI-compatible key/.test(conn), conn.slice(0, 200));
      // honest connection status: a real test request, not "On"; the header answers what is in use
      await p.waitForFunction(() => document.querySelector('#studioPop [data-api-health="ok"]'), null, { timeout: 4000 }).catch(() => {});
      const ok = await p.evaluate(() => ({ h: document.querySelector('#studioPop [data-api-health]')?.textContent, headTxt: document.querySelector('#studioPop .sp-head').textContent.trim(), sub: document.querySelector('#studioPop .sp-ai small')?.textContent || '', acts: [...document.querySelectorAll('#studioPop .sp-mini')].map(b => b.textContent), dot: document.getElementById('crewModeBtn').className, sw: document.querySelector('#studioPop .sp-ai [role="switch"]')?.getAttribute('aria-checked'), first: !!document.querySelector('#studioPop .sp-first'), order: [...document.querySelectorAll('#studioPop .sp-svc-top > span:first-child')].map(s => s.textContent), apiDetail: [...document.querySelectorAll('#studioPop .sp-svc')][1]?.querySelector('.sp-svc-sub')?.textContent }));
      check('opening Connection tests the Cloud API for real; the engine in use says "In use" once, the header is just the title', ok.h === 'In use' && ok.headTxt === 'Connection' && ok.sub === '' && ok.apiDetail === 'smoke' && probes.length >= 1 && probes.at(-1).auth === 'Bearer smoke' && requests.every(r => !/^ping$/.test(r.full)), JSON.stringify(ok));
      check('actions match real state (no Start while Studio AI is closed), the AI switch leads the engines, no "Use first" with one engine, Scout search and media are grouped apart', ok.acts.join() === 'Edit,Set up' && ok.sw === 'true' && !ok.first && ok.order.join() === 'Local AI,Cloud API,Scout search,Media Studio', JSON.stringify(ok));
      probe.status = 401;
      await p.click('#studioPop [data-sp="refresh"]');
      await p.waitForFunction(() => document.querySelector('#studioPop [data-api-health="auth"]'), null, { timeout: 4000 }).catch(() => {});
      const bad = await p.evaluate(() => ({ h: document.querySelector('#studioPop [data-api-health]')?.textContent, cls: document.querySelector('#studioPop [data-api-health]')?.className, headTxt: document.querySelector('#studioPop .sp-head').textContent.trim(), sub: document.querySelector('#studioPop .sp-ai small')?.textContent || '', fix: document.querySelector('#studioPop [data-sp="api"]').outerHTML, dot: document.getElementById('crewModeBtn').className }));
      check('a rejected key: said once on its row (red, Fix key next), the fallback said once under the switch, dot is red', bad.h === 'Authentication failed' && /err/.test(bad.cls) && bad.headTxt === 'Connection' && bad.sub === 'Using built-in rules for now' && /primary/.test(bad.fix) && /Fix key/.test(bad.fix) && /\berr\b/.test(bad.dot), JSON.stringify(bad));
      check('routing agrees with the header: a rejected key is skipped, no API request is made', await p.evaluate(async () => { const before = performance.getEntriesByType('resource').filter(e => /chat\/completions/.test(e.name)).length; const r = await viaClaude(() => null, () => 'rules', { studio: () => null, prompt: 'x' }); const after = performance.getEntriesByType('resource').filter(e => /chat\/completions/.test(e.name)).length; return !apiRoutable() && aiSource().kind !== 'api' && r.engine === 'local' && after === before; }));
      check('Test all connections never loads the local model', await p.evaluate(async () => { const urls = []; const f = window.fetch; window.fetch = (u, o) => { urls.push(String(u)); return f(u, o); }; connManualCheck = true; try { await refreshStudioFromPop({ wake: false }); } finally { connManualCheck = false; window.fetch = f; } return !urls.some(u => /studio\/start/.test(u)) && urls.some(u => /chat\/completions/.test(u)); }));
      probe.status = 200;
      queue.push({ id: 'heal', match: 'heal-me', text: 'fine' });
      await p.evaluate(() => apiChat({ prompt: 'heal-me' }));
      await p.waitForTimeout(200);
      check('a real successful call clears the error', await p.evaluate(() => apiHealthNow().k === 'ok' && document.getElementById('crewModeBtn').classList.contains('claude')));
      check('while Local AI is starting, the header and the trigger both name the engine actually answering (Cloud API)', await p.evaluate(() => { const s = studioState; studioState = { ...s, status: 'loading' }; const c = connSummary(), h = connHealth(), src = aiSource(); studioState = s; return c.engine === 'api' && src.kind === 'api' && src.live && c.mode.startsWith('Using Cloud API') && /Local AI starting/.test(c.issue) && h.k === 'ok'; }));
      await p.evaluate(() => { apiCfg = { ...apiCfg, baseUrl: 'http://127.0.0.1:9/v1' }; });
      await p.click('#studioPop [data-sp="refresh"]');
      await p.waitForFunction(() => document.querySelector('#studioPop [data-api-health="unreachable"]'), null, { timeout: 6000 }).catch(() => {});
      check('an unreachable host reads "Unreachable" with Edit as the next step', await p.evaluate(() => document.querySelector('#studioPop [data-api-health]')?.textContent === 'Unreachable' && /primary/.test(document.querySelector('#studioPop [data-sp="api"]').className)));
      check('after the retry window the header and routing agree again (Using Cloud API · Retrying, no red)', await p.evaluate(() => { const h0 = apiHealth; const before = connSummary(); apiHealth = { ...h0, at: Date.now() - 61000 }; const after = connSummary(); apiHealth = h0; return before.engine === 'rules' && before.tone === 'err' && after.engine === 'api' && after.tone === 'busy' && /Retrying/.test(after.issue); }));
      await p.click('#studioPop [data-sp="ai"]'); await p.waitForTimeout(200);
      check('AI off: the switch says it, with no extra text; the engines step back', await p.evaluate(() => document.querySelector('#studioPop .sp-head').textContent.trim() === 'Connection' && !document.querySelector('#studioPop .sp-ai small') && document.querySelector('#studioPop [data-sp="ai"]').getAttribute('aria-checked') === 'false' && document.querySelector('#studioPop .sp-services').classList.contains('idle') && /Rules only/.test(document.getElementById('crewModeBtn').innerText)));
      check('turning AI back on restores the previous preference; "Use first" appears once both engines exist and sets it', await p.evaluate(async () => { setAiPref('api'); setAiPref('local'); document.querySelector('#studioPop [data-sp="ai"]').click(); const restored = aiPref === 'api'; setAiPref('auto'); studioState = { ...studioState, reachable: true }; renderStudioPop(); const seg = document.querySelector('#studioPop .sp-first'); seg?.querySelector('[data-val="api"]').click(); const chose = aiPref === 'api'; setAiPref('auto'); studioState = { ...studioState, reachable: false }; renderStudioPop(); return restored && !!seg && chose && !document.querySelector('#studioPop .sp-first'); }));
      // Local AI Start: a button when the local server can open Studio AI, the instruction otherwise
      check('without a launcher, Local AI explains how to open it and offers no Start', await p.evaluate(() => { const r = [...document.querySelectorAll('#studioPop .sp-svc')][0]; return /Start Studio AI\.command/.test(r.textContent) && !r.querySelector('[data-sp="launch-studio"],[data-sp="wake"]'); }));
      launcher.on = true;
      await p.evaluate(() => { studioLauncher = null; toggleStudioPopover(false); toggleCrewPop(true); });
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
      const snap = await p.evaluate(() => dispatchCanvasActions([{ action: 'create', cardType: 'note', title: 'In Snapshot', text: 'snapshot card', pos: { x: 3 * BAY + 100, y: 300 } }], { by: 'wright' }).createdNodes[0].id);
      r = await run([{ action: 'edit', target: snap, field: 'text', value: 'changed later' }]);
      check('kept cards in a locked lane are protected', r.locked === 1 && await p.evaluate(id => byId(id).text === 'snapshot card', snap));
      await p.evaluate(() => toggleBayLock(3)); await p.waitForTimeout(200);
      r = await run([{ action: 'edit', target: snap, field: 'text', value: 'changed later' }]);
      check('unlocking the lane lets suggestions through again', r.locked === 0 && r.proposed === 1);
      check('Copilot is told about locks and permissions', await p.evaluate(() => /Locked cards/.test(autonomyPromptLine()) && /deleting cards the designer has kept: it becomes a suggestion/.test(autonomyPromptLine())));
      await wikiRoute(p);
      await p.evaluate(() => sendCopilotMessage('When did the International Settlement end?'));
      check('with no model, a factual question is answered by quoting the sources', /^The Shanghai International Settlement originated from the 1863 merger[^[]*\[1\]/.test(await p.evaluate(() => board.copilot.at(-1).text)), await p.evaluate(() => board.copilot.at(-1).text.slice(0, 200)));
      {
        const before = await p.evaluate(() => board.nodes.filter(n => n.type === 'source').length);
        await p.evaluate(() => { renderCopilot(); const b = [...document.querySelectorAll('[data-cp-chip]')].find(x => x.dataset.cpChip === 'Pin these sources to the board'); b && b.click(); });
        await p.waitForTimeout(400);
        const pin = await p.evaluate(n0 => { const s = board.nodes.filter(n => n.type === 'source'); return { added: s.length - n0, titles: s.slice(n0).map(n => n.title).join(), weights: s.slice(n0).map(n => n.weight).join(), asked: board.copilot.filter(m => m.role === 'user' && /Pin these sources/.test(m.text || '')).length }; }, before);
        check("a fact answer's chip pins the sources it cited as Source cards, without asking Copilot", pin.added === 2 && /Shanghai International Settlement/.test(pin.titles) && pin.weights === 'reported,reported' && pin.asked === 0, JSON.stringify(pin));
      }
      await p.unroute(/wikipedia\.org\/w\/api\.php/);
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
      const kindOf = b => { const u = JSON.stringify(b.messages || []); return /three quick questions/.test(u) ? 'ask' : /Fix only these problems/.test(u) ? 'fix' : /senior colleague looking at a card/.test(u) ? 'talk' : 'fork'; };
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
      let r = await forkOn('A local game set in Shanghai', true);
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
      // questions are about the idea itself: a business idea never gets invented cities, years or companies
      const BIZ = 'I want to build an AI-native OPC business';
      const SCREENSHOT = { questions: [{ q: 'Which city hosts your first pilot?', options: ['Berlin 2025', 'Tokyo 2024', 'Austin 2026', 'Lima 2023'] }, { q: 'What industry uses OPC most now?', options: ['Oil rigs Gulf of Mexico', 'German factories 1987', 'Swedish hospitals 2010', 'Brazilian ports 2015'] }, { q: 'Who funds the AI training data?', options: ['Siemens Germany', 'Oracle USA', 'BASF Netherlands', 'Coca-Cola Brazil'] }] };
      local = b => ({ text: b.kind === 'ask' || b.kind === 'fix' ? JSON.stringify(SCREENSHOT) : JSON.stringify(dirs('Biz')) });
      r = await forkOn(BIZ, false);
      check('questions with invented cities, years and companies never reach the designer; a business idea gets relevant ones', JSON.stringify(r.asked) === JSON.stringify(['Who is it for?', 'How would it make money?', 'What is the first version?']), JSON.stringify(r.asked));
      const askG = gens.filter(x => x.kind === 'ask').at(-1) || {}, askT = JSON.stringify(askG.messages || []);
      check('the question prompt asks about the idea itself and no longer demands real places and years', /Ask about the idea itself/.test(askT) && !/real places and periods/.test(askT) && !/name real places, years/.test(askT), askT.slice(0, 300));
      local = b => ({ text: b.kind === 'ask' || b.kind === 'fix' ? JSON.stringify({ questions: [{ q: 'Who is the first customer?', options: ['A solo founder', 'A small agency', 'A freelancer', 'A student'] }, { q: 'Where would it run?', options: ['Berlin 2025', 'Tokyo 2024', 'Austin 2026', 'Lima 2023'] }, { q: 'What does it do first?', options: ['Writes replies', 'Books meetings', 'Sends invoices', 'Tracks leads'] }] }) : JSON.stringify(dirs('Biz2')) });
      r = await forkOn(BIZ, false);
      check('a good question stays, the bad one is replaced by a relevant one', r.asked?.length === 3 && r.asked[0] === 'Who is the first customer?' && r.asked[1] === 'What does it do first?' && !r.asked.some(x => /Where would it run/.test(x)) && r.asked[2] === 'Who is it for?', JSON.stringify(r.asked));
      local = b => ({ text: b.kind === 'ask' ? 'not json at all' : JSON.stringify(dirs('Own2')) });
      r = await forkOn(BIZ, false);
      check('when the model gives nothing usable, a business idea still gets business questions', r.asked?.[0] === 'Who is it for?' && r.asked.length === 3, JSON.stringify(r.asked));
      const unit = await p.evaluate(() => { const ctx = 'I want to build an AI-native OPC business'; return { bad: ['Berlin 2025', 'Oil rigs Gulf of Mexico', 'Siemens Germany', 'Oracle USA', 'Coca-Cola Brazil', 'Swedish hospitals 2010', 'Tokyo 2024'].map(t => inventedSpecifics(t, ctx)), ok: ['Individual consumers', 'A subscription', 'A small paid pilot', 'B2B or B2C', 'Sell on Shopify', 'A 2-week pilot', 'OPC and AI'].map(t => inventedSpecifics(t, ctx)), mentioned: inventedSpecifics('Shanghai 1937', 'a game in Shanghai in 1937') }; });
      check('invented specifics are recognised, and plain answers (and things the idea mentioned) are not', unit.bad.every(x => x) && unit.ok.every(x => !x) && unit.mentioned === '', JSON.stringify(unit));
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
      check('an English idea gets English answers: Chinese characters and run-together words are sent back', await p.evaluate(() => { const d = { directions: [{ title: 'A', plan: 'A runner in上海的法租界1947年', test: 'If fewer than two feel watched, it fails.' }, { title: 'B', plan: 'You patrol the Bund in1937.', test: 'If fewer than two feel watched, it fails.' }] }; const p = forkProblems(d, 2, 'An RPG set in Shanghai'); return p.some(x => /direction 1: write everything in English/.test(x)) && p.some(x => /direction 2: words run together \("in1937"\)/.test(x)) && forkProblems(d, 2, '上海 RPG').every(x => !/English/.test(x)) && /Simplified Chinese/.test(smallForkPrompt('上海 RPG', 3, '', [], '').prompt); }));
      check('Copilot on Local AI: placeholder labels go, a loose chips line becomes chips', await p.evaluate(() => tidySmallReply('Yes.\n\n**Label: Story**\n- a\n\n**Label:** Anchor\n- b\n\nWhich one?') === 'Yes.\n\n**Story**\n- a\n\n**Anchor**\n- b\n\nWhich one?' && JSON.stringify(looseChips('Which one?\n\nchips ["Tie it", "Drop it"]')) === JSON.stringify({ text: 'Which one?', chips: ['Tie it', 'Drop it'] })));
      {
        const wq = []; await wikiRoute(p, wq); await p.evaluate(() => { SCOUT_GROUNDING = true; });
        local = b => ({ text: JSON.stringify(dirs('Grounded')) });
        r = await forkOn('An RPG set in Shanghai about rival police forces in the 1930s and the translators caught between them.');
        const g = await p.evaluate(() => { const idea = board.nodes.find(n => n.type === 'idea'); const ss = board.nodes.filter(n => n.type === 'source' && n.by === 'scout'); return { titles: ss.map(n => n.title), weights: ss.map(n => n.weight + ':' + n.status), linked: ss.every(n => board.edges.some(e => e.a === n.id && e.b === idea.id)), url: ss[0]?.src?.url }; });
        const fk = userText(lastFork());
        check('before branching, Scout looks the idea up on Wikipedia with queries built from its place and period', JSON.stringify(wq) === JSON.stringify(['History of Shanghai', 'Shanghai in the 1930s']), JSON.stringify(wq));
        check('what Scout finds lands as Source drafts (Reported), linked to the idea, with the link kept', g.titles.join() === 'Shanghai International Settlement,History of Shanghai' && g.weights.every(w => w === 'reported:sketch') && g.linked && /wiki\/Shanghai_International_Settlement/.test(g.url || ''), JSON.stringify(g));
        check('the fork reads them as background it must not contradict', /Extraterritoriality was abolished in 1943/.test(fk) && /never contradict it; it is not a checklist/.test(fk) && r.titles === 'Grounded A,Grounded B,Grounded C', fk.slice(0, 300));
        await p.unroute(/wikipedia\.org\/w\/api\.php/);
        r = await forkOn('An RPG set in Shanghai about dock workers and the gangs who run the wharves in the 1920s and 1930s.');
        check("when Wikipedia can't be reached, Strategist still branches and says it worked from memory", r.titles === 'Grounded A,Grounded B,Grounded C' && r.toasts.some(t => /couldn't reach Wikipedia, so Strategist is working from memory/.test(t)), JSON.stringify(r));
        // Keenable, when set up: searched first with the key, the mode and the idea in plain words; a refused key falls back to Wikipedia
        const kreq = []; let kstatus = 200; const kcors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
        await p.route('https://api.keenable.ai/**', async rt => { const q = rt.request(); if (q.method() === 'OPTIONS') return rt.fulfill({ status: 204, headers: kcors }); kreq.push({ key: q.headers()['x-api-key'], body: JSON.parse(q.postData() || '{}') }); if (kstatus !== 200) return rt.fulfill({ status: kstatus, contentType: 'application/json', headers: kcors, body: JSON.stringify({ error: 'Authentication failed', code: 'invalid_api_key' }) }); return rt.fulfill({ status: 200, contentType: 'application/json', headers: kcors, body: JSON.stringify({ query: 'q', mode: 'realtime', results: [{ title: 'Policing nuisance in 1930s Shanghai', url: 'https://hpchina.blogs.bristol.ac.uk/2024/11/18/x', snippet: 'At 8 o’clock on 10 July 1936, the Reserve Unit, the riot squad of the **Shanghai Municipal Police**, received orders to clear a [slum](https://x.y) on the edge of the Settlement.', published_at: '2024-11-18T00:00:00Z' }] }) }); });
        await p.evaluate(() => { openSearchDialog(); });
        await p.click('dialog[open] [data-sr="keenable"]'); await p.fill('#srKeyIn', 'keen_smoke'); await p.selectOption('#srModeSel', 'realtime'); await p.click('dialog[open] [data-sr-save]'); await p.waitForTimeout(200);
        check('the Scout search sheet saves a Keenable key and mode in this browser', await p.evaluate(() => keenableOn() && searchCfg.mode === 'realtime' && store.get('.searchCfg', {}).key === 'keen_smoke' && !document.querySelector('dialog[open]')));
        await wikiRoute(p);
        r = await forkOn('An RPG set in Shanghai about the riot squad and the people it moved on in the summer of 1936.');
        const kc = await p.evaluate(() => board.nodes.filter(n => n.type === 'source' && n.by === 'scout').map(n => n.kind + ' | ' + n.title + ' | ' + n.text));
        check('with Keenable set up, Scout searches it first, with the key, the mode and the idea in plain words', kreq.length >= 1 && kreq[0].key === 'keen_smoke' && kreq[0].body.mode === 'realtime' && /riot squad/.test(kreq[0].body.query) && kc.length === 1 && /^Background · hpchina\.blogs\.bristol\.ac\.uk \| Policing nuisance/.test(kc[0]) && /Shanghai Municipal Police, received orders to clear a slum/.test(kc[0]) && /\(2024-11-18\)$/.test(kc[0]), JSON.stringify({ kreq: kreq.slice(0, 1), kc }));
        kstatus = 401;
        r = await forkOn('An RPG set in Shanghai about dock strikes and the families on both sides in the spring of 1927.');
        check('a refused Keenable key falls back to Wikipedia and says so', r.toasts.some(t => /^Keenable rejected the API key \(HTTP 401\), so Scout used Wikipedia instead\.$/.test(t)) && await p.evaluate(() => board.nodes.filter(n => n.type === 'source' && n.by === 'scout').map(n => n.title).join() === 'Shanghai International Settlement,History of Shanghai'), JSON.stringify(r.toasts));
        await p.unroute('https://api.keenable.ai/**'); await p.unroute(/wikipedia\.org\/w\/api\.php/);
        await p.evaluate(() => { searchCfg = { provider: 'wikipedia', key: '', mode: 'pro' }; store.set('.searchCfg', searchCfg); });
        await p.evaluate(() => { SCOUT_GROUNDING = false; });
      }
      check('Strategist asks Local AI to create', lastFork().stance === 'create');
      local = b => ({ text: b.kind === 'fork' ? '<think>Plan three directions first.</think>' + JSON.stringify(dirs('Thought')) : JSON.stringify(Q) });
      r = await forkOn('An RPG set in Shanghai about the Shanghai Race Club and the bets placed on it in the 1930s by clerks.');
      check("a thinking model's thoughts are not taken as its answer", r.titles === 'Thought A,Thought B,Thought C', JSON.stringify(r));
      // the time limit runs out: built-in rules answer, and the designer is told why
      local = () => ({ text: JSON.stringify(dirs('Slow')), delay: 3000 });
      await p.evaluate(() => { AI_TIMEOUT_MS = 1500; LOCAL_AI_MS = 1500; });
      r = await forkOn('Slow idea', false);
      await p.evaluate(() => { LOCAL_AI_MS = 240000; });
      check('a Local AI timeout falls back to built-in rules instead of failing', r.titles === 'Walk it through,Lay it all out,Cut to one moment' && r.engines === 'rules,rules,rules' && r.task === 'done', JSON.stringify(r));
      check('and says which engine ran out of time and which answered', r.toasts.some(t => /^The model didn't finish within 2 s\. Built-in rules drafted this instead; a faster model or fewer cards helps\.$/.test(t)), JSON.stringify(r.toasts));
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
      await p.evaluate(() => { AI_TIMEOUT_MS = 1500; LOCAL_AI_MS = 1500; }); // the smoke endpoint is on 127.0.0.1, so it gets the local limit
      queue = [{ id: 'cut', match: 'cutoff-question', text: 'Open in the interrogation room at night, with the rain on the window and the clerk', stall: 4000 }];
      await p.evaluate(() => sendCopilotMessage('cutoff-question: where should the game open?'));
      let m = await last();
      check('a Copilot answer that runs out of time keeps what arrived', /^Open in the interrogation room/.test(m.text), JSON.stringify({ m, req: requests.slice(-3).map(x => x.matched) }));
      check('and says plainly that it is cut off', /_Cut off: the model didn't finish within 2 s\._$/.test(m.text), JSON.stringify(m));
      await p.evaluate(() => { AI_TIMEOUT_MS = 20000; LOCAL_AI_MS = 240000; });
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
      // with no model to answer, Try again and typed revisions do not pretend: nothing is replaced, your words are kept
      {
        const n0 = requests.length;
        const ids = () => p.evaluate(() => board.nodes.filter(n => n.type === 'direction').map(n => n.id).join());
        const before = await ids();
        await p.evaluate(() => { __toasts.splice(0); return redraw(board.nodes.find(n => n.type === 'direction').pid); });
        const rt = await p.evaluate(() => __toasts.splice(0));
        check('Try again with no model and the same rules output replaces nothing and says so', (await ids()) === before && rt.some(t => /built-in rules give the same drafts again\. Nothing was replaced/.test(t)) && !rt.some(t => /New version/.test(t)), JSON.stringify(rt));
        const b = await p.evaluate(() => board.nodes.find(n => n.type === 'direction' && n.letter === 'B').id);
        await p.evaluate(id => select([id]), b);
        const words = 'Make it about guest checkout and Apple Pay';
        await p.type(words); await p.idle();
        const rv = await p.evaluate(([id, w]) => ({ toasts: __toasts.splice(0), kept: (board.threads[id] || []).some(m => m.who === 'you' && m.text === w) }), [b, words]);
        check('a typed revision with no model leaves the drafts, says why, and keeps your words on the draft you picked', (await ids()) === before && rv.kept && rv.toasts.some(t => /^Cloud API is out of credits \(HTTP 402\), so your note couldn't be applied/.test(t)) && !rv.toasts.some(t => /New version/.test(t)), JSON.stringify(rv));
        check('and neither one sends a request to the broken Cloud API', requests.length === n0, `${requests.length - n0} requests`);
        // Copilot with no model says so first, and only says what the board shows (no leftovers from another project)
        await p.evaluate(() => sendCopilotMessage('Suggest the next 3 moves for this idea'));
        const cm = await p.evaluate(() => { const m = board.copilot.at(-1); return { text: m.text, route: m.route, kinds: (m.proposals || []).map(x => x.kind), trace: !!m.trace }; });
        check('Copilot with no model opens by saying no model answered, and why', /^\*\*No AI model answered\.\*\* Cloud API is out of credits \(HTTP 402\)\./.test(cm.text) && cm.route === 'Built-in rules', JSON.stringify(cm).slice(0, 300));
        check('it invents no directions and nothing from another project, and does not pretend to delegate', !cm.kinds.includes('direction') && !/hair sync|creators|fit-check|headband/i.test(cm.text + JSON.stringify(cm.kinds)) && !cm.trace, JSON.stringify(cm).slice(0, 400));
        await p.evaluate(() => sendCopilotMessage('Draw an image of a quiet street at dusk'));
        const ci = await p.evaluate(() => board.copilot.at(-1).proposals?.find(x => x.kind === 'image')?.prompt || '');
        check('an image prompt Copilot drafts without a model uses what you described', /quiet street at dusk/.test(ci) && !/headband|hair sync/.test(ci), ci);
        await p.evaluate(() => { const c = document.querySelector('[data-cp=close]'); c && c.click(); });
        // with no image service, /image makes one empty frame that says so, not pictures that could pass for results
        const im0 = await p.evaluate(() => board.nodes.filter(n => n.type === 'image').length);
        await p.evaluate(() => { __toasts.splice(0); return generateImages('a quiet street at dusk'); });
        const im = await p.evaluate(n0 => { const made = board.nodes.filter(n => n.type === 'image').slice(n0); const el = made[0] && document.querySelector(`[data-id="${made[0].id}"]`); return { n: made.length, standIn: made.every(n => n.gen?.preview), badge: el ? el.innerText : '', toasts: __toasts.splice(0) }; }, im0);
        check('/image with no image service makes one empty frame, labelled Not generated, and says no image was made', im.n === 1 && im.standIn && /Not generated/.test(im.badge) && im.toasts.some(t => /so no image was made/.test(t)), JSON.stringify(im));
        await p.evaluate(n0 => { const ids = new Set(board.nodes.filter(n => n.type === 'image').slice(n0).map(n => n.id)); board.nodes = board.nodes.filter(n => !ids.has(n.id)); renderAll(); }, im0);
      }
      check('a passing re-check brings the Cloud API back', await p.evaluate(async () => { await testApi({ quiet: true }); return apiRoutable() && apiHealthNow().k === 'ok'; }));
      // free tiers cap requests per minute: wait as long as the server asks and try again; a daily cap is said plainly
      {
        const n0 = requests.length;
        queue = [{ id: 'busy', match: 'ping429', status: 429, body: JSON.stringify({ error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1s' }] } }) }, { id: 'pong', match: 'ping429', text: 'pong' }];
        const r = await p.evaluate(async () => { const t = performance.now(); const v = await apiChat({ prompt: 'ping429' }); return { v, ms: performance.now() - t }; });
        /* count only this call's requests: a crew member's own look at a card can land inside the one-second wait */
        const asked = requests.slice(n0).filter(q => /ping429/.test(q.full)).map(q => q.matched);
        check('a per-minute 429 waits the retryDelay and tries again', r.v === 'pong' && r.ms >= 1000 && asked.join() === 'busy,pong', JSON.stringify({ ...r, asked }));
        const last429 = requests.slice(n0).filter(q => /ping429/.test(q.full)).at(-1);
        check('and leaves room for a thinking model (max_tokens + 4096)', last429?.max === 2200 + 4096, String(last429?.max));
        queue = [{ id: 'short1', match: 'short-check', text: 'ok' }];
        await p.evaluate(() => apiChat({ prompt: 'short-check', maxTokens: 300 }));
        check('a short reply keeps its limit as a length cap', requests.at(-1).max === 300, String(requests.at(-1).max));
        queue = [{ id: 'think1', match: 'think-check', text: '', finish: 'length' }, { id: 'think2', match: 'think-check', text: 'answered' }];
        const tb = await p.evaluate(async () => apiChat({ prompt: 'think-check', maxTokens: 300 }));
        check('if thinking spends a short limit before any answer, it asks once more with room', tb === 'answered' && requests.slice(-2).map(x => x.max).join() === '300,4396', JSON.stringify({ tb, max: requests.slice(-2).map(x => x.max) }));
        check('the daily budget is not keyed by the API key', await p.evaluate(() => Object.keys(cloudBudget.by).length > 0 && Object.keys(cloudBudget.by).every(k => k.split('\u0001').length === 2)));
        queue = [{ id: 'daily', match: 'ping429', status: 429, body: JSON.stringify({ error: { code: 429, message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier' } }) }, { id: 'nope', match: 'ping429', text: 'should not be asked' }];
        const d = await p.evaluate(async () => { try { await apiChat({ prompt: 'ping429' }); return 'answered'; } catch (e) { return e.reason || e.message; } });
        check('a daily 429 is not retried and says the quota resets tomorrow', d === "Cloud API's daily quota is used up (HTTP 429); it resets tomorrow" && queue.length === 1, d);
        check('and Vellum stops asking the Cloud API until it resets', await p.evaluate(() => cloudState() === 'out' && cloudLeft() === 0 && autoPlan('heavy').order.join() === ''));
        queue = []; await p.evaluate(() => { cloudBudget = { day: '', by: {} }; });
      }
      // drafts from a working model, kept
      await p.evaluate(id => { board.nodes = board.nodes.filter(n => n.type !== 'direction'); board.edges = board.edges.filter(e => e.a !== id); renderAll(); select([id]); }, idea);
      queue = [{ id: 'w', match: '"directions"', text: dirs('W') }];
      await p.type('/fork 3'); await p.idle();
      {
        // fresh forks are drafts: adopting or building one is a decision, not a revision request
        const d0 = await p.evaluate(() => board.nodes.find(n => n.type === 'direction' && n.letter === 'A').id);
        const kinds = await p.evaluate(id => { select([id]); const k = s => route(s)?.kind; return { adopt: k('Adopt this direction'), go: k('go with this'), zh: k('采纳'), build: k('Build a prototype of the opening scene'), revise: k('make it darker and more personal'), ask: k('Should we adopt this?') }; }, d0);
        check('on a fresh draft direction, adopt and build words adopt and build; other words still revise; a question still asks', kinds.adopt === 'adopt' && kinds.go === 'adopt' && kinds.zh === 'adopt' && kinds.build === 'build' && kinds.revise === 'revise' && kinds.ask !== 'adopt' && kinds.ask !== 'revise', JSON.stringify(kinds));
        await p.evaluate(id => select([id]), d0);
        await p.type('Adopt this direction'); await p.waitForTimeout(800);
        const st = await p.evaluate(id => ({ adopted: board.adopted[byId(id).idea] === id, kept: byId(id).status === 'ink', titles: board.nodes.filter(n => n.type === 'direction').map(n => n.title).join(), toast: [...document.querySelectorAll('#toasts > *')].map(x => x.innerText).join(' / ') }), d0);
        check('typing "Adopt this direction" on a fresh draft keeps and adopts it in one step, and revises nothing', st.adopted && st.kept && /Kept and adopted W A/.test(st.toast) && st.titles === 'W A,W B,W C', JSON.stringify(st));
        await p.evaluate(id => { delete board.adopted[byId(id).idea]; byId(id).status = 'sketch'; renderAll(); }, d0);
      }
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
      {
        await wikiRoute(p); await p.evaluate(() => { SCOUT_GROUNDING = true; });
        await p.newBoard(); await p.type('An RPG about smugglers in 1930s Shanghai and the families who hide their goods in lane houses.'); await p.waitForTimeout(800);
        const gi = await p.evaluate(() => board.nodes.find(n => n.type === 'idea').id);
        queue = [{ id: 'gr', match: 'Background Scout found on the web', text: dirs('Cloud') }];
        await p.evaluate(id => select([id]), gi); await p.type('/fork 3'); await p.idle();
        check('with a Cloud API too, Scout looks things up first and the fork reads them', requests.some(x => x.matched === 'gr' && /Shanghai International Settlement/.test(x.full)) && await p.evaluate(() => board.nodes.filter(n => n.type === 'direction').map(n => n.title).join() === 'Cloud A,Cloud B,Cloud C'), JSON.stringify(requests.slice(-1).map(x => x.matched)));
        await p.evaluate(() => { SCOUT_GROUNDING = false; }); await p.unroute(/wikipedia\.org\/w\/api\.php/);
      }
      // facts come only from sources, checked sentence by sentence; ideas are invented freely
      check('a factual question takes the fact path; an invitation to invent does not', await p.evaluate(() => [
        'When was the Shanghai Municipal Police disbanded?', 'Who governed the International Settlement?', '公共租界是什么时候结束的？', 'fact: the Bund',
        "Isn't a trading-house sim really a strategy game, not an RPG? What would make this one feel like a role-playing game?", 'What if the lane house had a ghost?', 'idea: when the lane floods', 'Could we make the ledger visible?', 'Who is the translator?'
      ].map(factStance).join()) === 'true,true,true,true,false,false,false,false,false');
      check('only sentences a source supports survive', await p.evaluate(() => { const src = [{ title: 'Shanghai International Settlement', text: 'It originated from the 1863 merger of the British and American enclaves. Extraterritoriality was abolished in 1943.' }]; const r = factCheck('It was formed in 1863 [1]. Extraterritoriality was abolished in 1943 [1]. It was later run from Nanjing in 1950 [1]. The Shanghai Volunteer Corps guarded it [1]. It was lively. The sources don\'t say who designed the flag.', src); return JSON.stringify(r) === JSON.stringify({ kept: ['It was formed in 1863 [1].', 'Extraterritoriality was abolished in 1943 [1].', "The sources don't say who designed the flag."], dropped: 3 }); }));
      {
        await wikiRoute(p);
        queue = [{ id: 'fact', match: 'using only the numbered sources', text: 'The Settlement was formed in 1863 [1]. Extraterritoriality was abolished in 1943 [1]. It was governed from Nanjing in 1950 [1]. It was very lively.' }];
        await p.evaluate(() => sendCopilotMessage('When did the International Settlement end?'));
        const m = await p.evaluate(() => board.copilot.at(-1)), fr = requests.filter(x => x.matched === 'fact').at(-1);
        check('Copilot answers a factual question only from what Scout found, cites it, and drops what it cannot back', m.stance === 'fact' && /^The Settlement was formed in 1863 \[1\]\. Extraterritoriality was abolished in 1943 \[1\]\./.test(m.text) && !/1950|lively/.test(m.text) && /Left out 2 statements the sources don't support/.test(m.text) && /\*\*Sources\*\*\n1\. \[Shanghai International Settlement\]\(https:\/\/en\.wikipedia\.org\/wiki\/Shanghai_International_Settlement\)/.test(m.text), m.text);
        check('the fact path runs cold (temperature 0.15)', fr && fr.temp === 0.15, JSON.stringify(fr && fr.temp));
        await p.unroute(/wikipedia\.org\/w\/api\.php/);
        await p.evaluate(() => sendCopilotMessage('When was the Shanghai Municipal Police disbanded?'));
        check('with no sources, Copilot will not answer a factual question from memory', /couldn't find sources for this, so I won't answer from memory/.test(await p.evaluate(() => board.copilot.at(-1).text)));
        queue = [{ id: 'mk', match: 'Invent freely', text: dirs('Made') }];
        await p.newBoard(); await p.type('Stance idea'); await p.waitForTimeout(700);
        await p.evaluate(() => select([board.nodes.find(n => n.type === 'idea').id])); await p.type('/fork 3'); await p.idle();
        const mk = requests.filter(x => x.matched === 'mk').at(-1);
        check('Strategist invents freely (temperature 0.7), true to the sources', mk && mk.temp === 0.7 && /surprising beats safe/.test(mk.full) && /must agree with the sources/.test(mk.full), JSON.stringify(mk && mk.temp));
      }
      check('no page errors in these flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // 12. Auto picks the engine per task: heavy work to the Cloud API first, light work on Local AI, a failed
    //     local draft redone in the cloud, a daily cloud budget with a heavy-only reserve, and a note on who answered
    {
      const p = await page(browser, base);
      const sgens = [];
      let sreply = () => 'Local reply.';
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
      await p.route('http://127.0.0.1:59631/**', async route => {
        const req = route.request(), url = req.url();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        if (/\/studio\/health/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ status: 'ready', model: 'smoke-local', modelId: 'smoke', vision: true, models: [] }) });
        if (/\/studio\/generate/.test(url)) {
          const body = JSON.parse(req.postData() || '{}'); const u = JSON.stringify(body.messages || []);
          body.kind = /Fix only these problems/.test(u) ? 'fix' : /"directions"|directions/.test(u) && body.json ? 'fork' : 'chat'; sgens.push(body);
          const t = String(sreply(body) || ' ');
          const sse = t.match(/[\s\S]{1,40}/g).map(c => 'data: ' + JSON.stringify({ choices: [{ delta: { content: c } }] }) + '\n\n').join('') + 'data: [DONE]\n\n';
          return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: cors, body: sse }).catch(() => {});
        }
        return route.fulfill({ status: 404, headers: cors, body: '' });
      });
      await p.evaluate(async () => { await checkStudioHealth({ wake: false, quiet: true }); setApiHealth('ok', {}); cloudBudget = { day: '', by: {} }; window.__toasts = []; const t = toast; toast = (m, ...a) => { __toasts.push(String(m)); return t(m, ...a); }; });
      const plans = await p.evaluate(() => {
        const o = w => autoPlan(w).order.join('>') || '-';
        const out = { open: [o('heavy'), o('light')] };
        apiCfg = { ...apiCfg, daily: 4 }; cloudUse().used = 3; out.reserve = [o('heavy'), o('light')];
        cloudUse().used = 4; out.out = [o('heavy'), o('light')];
        cloudUse().used = 0; const s = studioState.status; studioState.status = 'offline'; out.noLocal = [o('heavy'), o('light')];
        cloudUse().used = 3; out.noLocalReserve = [o('heavy'), o('light')]; studioState.status = s;
        aiPref = 'api'; out.pinned = [o('heavy'), o('light')]; aiPref = 'auto';
        const { daily, ...rest } = apiCfg; apiCfg = rest; cloudBudget = { day: '', by: {} };
        const g = 'https://generativelanguage.googleapis.com/v1beta/openai';
        out.limits = [cloudDailyLimit({ baseUrl: g }), cloudDailyLimit({ baseUrl: g, daily: 1500 }), cloudDailyLimit({ baseUrl: 'https://openrouter.ai/api/v1' })];
        return out;
      });
      check('Auto: heavy work goes to the Cloud API first, light work stays on Local AI', plans.open.join() === 'api>studio,studio>api', JSON.stringify(plans));
      check('in the last quarter of the budget, heavy work starts locally (cloud only to redo it) and light work stays local', plans.reserve.join() === 'studio>api,studio', JSON.stringify(plans));
      check('with the budget spent, nothing goes to the cloud', plans.out.join() === 'studio,studio', JSON.stringify(plans));
      check('without Local AI the cloud does everything until the reserve, then only heavy work', plans.noLocal.join() === 'api,api' && plans.noLocalReserve.join() === 'api,-', JSON.stringify(plans));
      check('"Cloud API" mode still pins every task to the cloud', plans.pinned.join() === 'api,api', JSON.stringify(plans));
      check('Gemini gets its free-tier preset of 20 a day, a set limit wins, other providers have none', JSON.stringify(plans.limits) === '[20,1500,null]', JSON.stringify(plans.limits));
      const isl = () => p.evaluate(() => ({ note: ISL.tasks.filter(t => t.kind === 'directions').at(-1)?.note, titles: board.nodes.filter(n => n.type === 'direction').map(n => n.title).join(','), toasts: __toasts.splice(0) }));
      const forkIdea = async () => {
        await p.newBoard(); await p.type('An RPG set in Shanghai about rival police forces in the 1930s and the translators caught between them.'); await p.waitForTimeout(800);
        await p.evaluate(() => select([board.nodes.find(n => n.type === 'idea').id])); await p.type('/fork 3'); await p.idle();
      };
      // an open idea is not quizzed when the cloud drafts the fork: the questions make up for a small model
      queue = [{ id: 'copen', match: '"directions"', text: dirs('Open') }];
      await p.newBoard(); await p.type('Shanghai game'); await p.waitForTimeout(800);
      await p.evaluate(() => select([board.nodes.find(n => n.type === 'idea').id])); await p.type('/fork 3'); await p.idle();
      const open = await p.evaluate(() => ({ dialog: !!document.querySelector('dialog[open][data-clarify]'), titles: board.nodes.filter(n => n.type === 'direction').map(n => n.title).join() }));
      check('an open idea is branched by the cloud without the small-model questions', !open.dialog && open.titles === 'Open A,Open B,Open C', JSON.stringify(open));
      // heavy: the fork goes to the cloud, Local AI is not asked
      let n0 = sgens.length;
      queue = [{ id: 'cfork', match: '"directions"', text: dirs('Cloud') }];
      await forkIdea();
      let r = await isl();
      check('a fork in Auto is drafted by the Cloud API, not Local AI', r.titles === 'Cloud A,Cloud B,Cloud C' && !sgens.slice(n0).some(g => g.kind === 'fork'), JSON.stringify({ r, local: sgens.slice(n0).map(g => g.kind) }));
      check('the island says which model answered and why', r.note === 'Smoke · heavy task', JSON.stringify(r.note));
      // the cloud fails on a heavy task: Local AI covers, and says why
      queue = [{ id: 'cdown', match: '"directions"', status: 503 }];
      sreply = b => b.json ? JSON.stringify(dirs('Local')) : 'Local reply.';
      await forkIdea();
      r = await isl();
      check('when the cloud fails a heavy task, Local AI answers and the toast says why', r.titles === 'Local A,Local B,Local C' && r.toasts.includes('Cloud API returned HTTP 503, so Local AI answered instead.') && r.note === 'Local AI · smoke-local', JSON.stringify(r));
      // light: Copilot chat on Local AI, a merge on the cloud
      n0 = requests.length;
      await p.evaluate(() => sendCopilotMessage('Which of these feels most like an RPG to you?'));
      let m = await p.evaluate(() => ({ text: board.copilot.at(-1).text, route: board.copilot.at(-1).route, shown: document.querySelector('.cp-msg.ai:last-of-type .cp-route')?.textContent || [...document.querySelectorAll('.cp-route')].at(-1)?.textContent }));
      check('a Copilot question stays on Local AI', m.text === 'Local reply.' && requests.length === n0 && m.route === 'Local AI · smoke-local', JSON.stringify(m));
      queue = [{ id: 'merge', match: 'merge-check', text: 'Fold the ledger into the lane.' }];
      await p.evaluate(() => sendCopilotMessage('merge-check: can we merge A and B into one game?'));
      m = await p.evaluate(() => ({ text: board.copilot.at(-1).text, route: board.copilot.at(-1).route, shown: [...document.querySelectorAll('.cp-route')].map(e => e.textContent) }));
      check('a merge in Copilot is heavy: the Cloud API answers, and the reply says so', m.text === 'Fold the ledger into the lane.' && m.route === 'Smoke · heavy task' && m.shown.includes('Smoke · heavy task'), JSON.stringify(m));
      // reserve: the fork starts locally; a draft still wrong after its repair is redone by the cloud
      const bad = { directions: [{ title: 'Beat A', plan: 'You patrol the Settlement in 1935.', test: 'Five players play two shifts; if fewer than three feel watched, it fails.', mode: 'story' }, { title: 'Northern Ledger', plan: 'You smuggle tea in Beijing.', test: 'Six players run three nights; if fewer than four bargain, it fails.', mode: 'story' }, { title: 'Dock Clerk', plan: 'You log cargo on the Bund in 1936.', test: 'Four players run one shift; if fewer than two lie on the ledger, it fails.', mode: 'story' }] };
      sreply = b => b.json ? JSON.stringify(bad) : 'Local reply.';
      await p.evaluate(() => { apiCfg = { ...apiCfg, daily: 4 }; cloudBudget = { day: '', by: {} }; cloudUse().used = 3; });
      queue = [{ id: 'rescue', match: '"directions"', text: dirs('Rescued') }];
      n0 = sgens.length;
      await forkIdea();
      r = await isl();
      const kinds = sgens.slice(n0).map(g => g.kind).join();
      check('near the end of the budget a fork starts on Local AI, with one repair', kinds === 'fork,fix', kinds);
      check('a local draft still wrong after its repair is redone by the Cloud API', r.titles === 'Rescued A,Rescued B,Rescued C' && r.toasts.some(t => /^Local AI's draft had problems \(.*Beijing.*\), so Cloud API answered instead\.$/.test(t)), JSON.stringify(r));
      check('the note says the cloud redid it, and how many calls are left', r.note === "Smoke · redid Local AI's draft · 0 of 4 cloud calls left today", JSON.stringify(r.note));
      // the cloud can't redo it: the flawed draft beats built-in rules
      await p.evaluate(() => { cloudBudget = { day: '', by: {} }; cloudUse().used = 3; });
      queue = [{ id: 'nope', match: '"directions"', status: 503 }];
      await forkIdea();
      r = await isl();
      check("if the cloud can't redo it, the local draft stays (not built-in rules) and the toast says so", /^Beat A,Northern Ledger,Dock Clerk$/.test(r.titles) && r.toasts.some(t => /^Local AI's draft had problems \(.*\), and Cloud API returned HTTP 503, so the local draft stays\.$/.test(t)), JSON.stringify(r));
      // light work never spends the reserve
      n0 = requests.length;
      await p.evaluate(() => { cloudBudget = { day: '', by: {} }; cloudUse().used = 3; });
      await p.evaluate(() => sendCopilotMessage('Which of these should we test first?'));
      check('in the reserve, a Copilot question does not touch the cloud', requests.length === n0, String(requests.length - n0));
      // calls are counted; the Connection panel shows what is left
      await p.evaluate(() => { cloudBudget = { day: '', by: {} }; });
      queue = [{ id: 'count', match: 'count-check', text: 'ok' }];
      const used = await p.evaluate(async () => { await apiChat({ prompt: 'count-check' }); return cloudUse().used; });
      check('each answered cloud call is counted against the day', used === 1, String(used));
      check('the Connection panel shows the calls left today', await p.evaluate(() => { toggleStudioPopover(true); const t = document.querySelector('.sp-svc[data-api-health], [data-api-health]')?.closest('.sp-svc')?.textContent || document.body.textContent; toggleStudioPopover(false); return /3 of 4 cloud calls left today/.test(t); }));
      check('the Cloud API dialog has a daily limit field', await p.evaluate(() => { openApiDialog(); const el = document.getElementById('apiDailyIn'); const ok = !!el && el.value === '4'; document.querySelector('dialog[open]')?.close(); return ok; }));
      check('a Copilot reply with a chart draws it once', await p.evaluate(() => { board.copilot.push({ id: 'viz1', role: 'ai', agent: 'muse', text: 'Here is the split.', visuals: [{ kind: 'chart', title: 'Split', items: [{ label: 'A', value: 60 }, { label: 'B', value: 40 }] }] }); renderCopilot(); const el = document.querySelector('[data-cp-msg-id="viz1"]'); const n = el ? el.querySelectorAll('.cp-ui-stack').length : -1; board.copilot.pop(); renderCopilot(); return n === 1; }));
      check('no page errors in the Auto routing flows', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // 12b. streaming reads as a steady unveil: words arrive one by one and fade in, and the last ones finish before the final render
    {
      const p = await page(browser, base);
      await p.newBoard();
      const WORDS = 70, LONG = Array.from({ length: WORDS }, (_, i) => 'word' + i).join(' ') + '.';
      queue = [{ id: 'unveil1', match: 'Lumen Copilot', text: LONG, slow: 60 }];
      const t0 = Date.now();
      await p.type('What should we test first?');
      const samples = [];
      for (let i = 0; i < 120; i++) {
        samples.push(await p.evaluate(() => { const b = [...document.querySelectorAll('[data-cp-msg-id] .cp-bubble')].at(-1); return { n: b ? (b.textContent.match(/word\d+/g) || []).length : -1, uv: b ? b.querySelectorAll('.uv').length : 0, streaming: copilotStreaming }; }));
        if (samples.length > 3 && !samples.at(-1).streaming) break;
        await p.waitForTimeout(80);
      }
      await p.idle();
      const counts = samples.map(x => x.n).filter(n => n >= 0);
      check('words appear steadily, never going backwards', counts.length > 8 && counts.every((n, i) => i === 0 || n >= counts[i - 1]) && counts.some(n => n > 0 && n < WORDS), counts.join(','));
      check('each new word fades in (an animating span while text is arriving)', samples.some(x => x.uv > 0), JSON.stringify(samples.slice(0, 6)));
      check('it is paced, not dumped: most of the reply was still being revealed after the model finished sending', samples.filter(x => x.n > 0 && x.n < WORDS).length >= 6, counts.join(','));
      const final = await p.evaluate(() => (board.copilot || []).filter(m => m.role === 'ai').map(m => m.text).at(-1) || '');
      const bubble = await p.evaluate(() => [...document.querySelectorAll('[data-cp-msg-id] .cp-bubble')].at(-1)?.textContent || '');
      check('the final message has every word, is no longer animating, and the wait for the reveal is bounded', final.includes('word' + (WORDS - 1)) && (bubble.match(/word\d+/g) || []).length === WORDS && await p.evaluate(() => !document.querySelector('[data-cp-msg-id] .cp-bubble .uv')) && Date.now() - t0 < 12000, `${(bubble.match(/word\d+/g) || []).length} words, ${Date.now() - t0}ms`);
      check('no page errors while streaming', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    // 9. composer: one row for one line; two rows (text full width, controls below) once the text wraps
    {
      const p = await page(browser, base, { model: false });
      const rows = () => p.evaluate(() => { const f = document.querySelector('.line-field').getBoundingClientRect(), i = lineIn.getBoundingClientRect(), s = document.getElementById('routeWrap').getBoundingClientRect();
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
    // 10. what you type reaches the model: revising a draft, asking Critic, Scout on a draft
    {
      const p = await page(browser, base);
      await p.newBoard();
      await p.type('Steer idea: restore without surprises'); await p.waitForTimeout(800);
      const idea = await p.evaluate(() => board.nodes.find(n => n.type === 'idea').id);
      queue = [{ id: 'st1', match: '"directions"', text: dirs('Plain') }];
      await p.evaluate(id => select([id]), idea); await p.type('/fork 3'); await p.idle();
      const drafts = () => p.evaluate(() => board.nodes.filter(n => n.type === 'direction' && n.status === 'sketch').map(n => n.id));
      const routeOf = async t => { await p.type(t, false); await p.waitForTimeout(250); return p.evaluate(() => route(lineText())); };
      await p.evaluate(ids => select(ids), await drafts());
      const ask = 'Make every option tell the creator what a restore will overwrite, and name the risk';
      let r = await routeOf(ask);
      check('plain words on a crew draft route to a revision, not a generic check', r && r.kind === 'revise' && r.agent === 'muse' && r.arg === ask, JSON.stringify(r));
      r = await routeOf('Why did you pick these three?');
      check('a question about a draft is still answered, not taken as a revision', r && r.kind !== 'revise', JSON.stringify(r));
      await p.type('@critic does this hold up', false); await p.waitForTimeout(250);
      const hand = await p.evaluate(() => ({ open: copilotOpen, target: cpTarget, bar: document.getElementById('lineInput').value, typed: document.getElementById('cpInput')?.value }));
      check('an @mention of someone else is not a revision: it hands the question to the panel with that member preselected', hand.open && hand.target === 'critic' && hand.bar === '' && /does this hold up/.test(hand.typed), JSON.stringify(hand));
      await p.evaluate(() => { setCpTarget(null); openCopilot(false); const i = document.getElementById('cpInput'); if (i) i.value = ''; });
      await p.evaluate(ids => select(ids), await drafts());
      r = await routeOf('@strategist ' + ask);
      check('an @mention of the draft\'s author revises it with the words after the mention', r && r.kind === 'revise' && r.arg === ask, JSON.stringify(r));
      queue = [{ id: 'st2', match: 'tell the creator what a restore will overwrite', text: dirs('Revised') }];
      await p.type(ask); await p.idle();
      const req = requests.filter(q => q.matched === 'st2').at(-1);
      check('the revision request carries your words and the draft being revised', !!req && req.full.includes(ask) && /The draft being revised/.test(req.full) && /Plain A/.test(req.full), req ? req.full.slice(-300) : 'no request matched');
      const titles = await p.evaluate(() => board.nodes.filter(n => n.type === 'direction').map(n => n.title).join(','));
      check('the revised drafts replace the old ones in place', titles === 'Revised A,Revised B,Revised C', titles);
      check('the change log says what you asked for', await p.evaluate(() => /Asked for a revision of 3 suggestions: .*tell the creator/.test(board.log.at(-1)?.html || '')), await p.evaluate(() => board.log.at(-1)?.html));
      // Scout on a draft explains what to do instead of asking you to select cards
      await p.evaluate(ids => gather(ids.map(byId)), await drafts()); await p.waitForTimeout(300);
      check('Scout on a draft says how to change it', /type how it should change/.test(await p.toast()), await p.toast());
      // Critic answers the question you typed, and your question stays on the card
      await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('Control+Enter'); await p.waitForTimeout(600);
      const a = await p.evaluate(() => board.nodes.find(n => n.type === 'direction' && n.letter === 'A' && n.status === 'ink')?.id);
      const q = 'Check the risk that creators never see the overwrite list';
      queue = [{ id: 'cq', match: 'The designer asks: "Check the risk', text: 'It rests on a proposal, not an observation. Who has watched a restore?' }];
      await p.evaluate(id => select([id]), a); await p.type(q); await p.idle();
      check('Critic is asked the question you typed', requests.some(x => x.matched === 'cq'), requests.slice(-2).map(x => x.prompt).join(' || '));
      check('your question and Critic\'s answer are both on the card', await p.evaluate(([id, q]) => { const t = board.threads[id] || []; return t.some(m => m.who === 'you' && m.text === q) && t.some(m => m.who === 'critic' && /Who has watched/.test(m.text)); }, [a, q]));
      // a synthesis draft is revised the same way
      const notes = await p.evaluate(() => [pinCard('note', 'Creators restore after big edits'), pinCard('note', 'Backups are per package')].map(n => n.id));
      queue = [{ id: 'syn1', match: '"points"', text: { title: 'First read', points: ['**One.** a', '**Two.** b', '**Three.** c'] } }];
      await p.evaluate(ids => gather(ids.map(byId)), notes); await p.idle();
      const syn = await p.evaluate(() => board.nodes.find(n => n.type === 'synthesis' && n.status === 'sketch')?.id);
      queue = [{ id: 'syn2', match: 'Separate what has shipped', text: { title: 'Second read', points: ['**Shipped.** a', '**Proposed.** b', '**Open.** c'] } }];
      await p.evaluate(id => select([id]), syn); await p.type('Separate what has shipped from what is only proposed'); await p.idle();
      check('a synthesis draft is revised with your words', requests.some(x => x.matched === 'syn2' && /First read/.test(x.full)) && await p.evaluate(() => board.nodes.some(n => n.type === 'synthesis' && n.title === 'Second read')), await p.evaluate(() => board.nodes.filter(n => n.type === 'synthesis').map(n => n.title).join()));
      check('no page errors when steering drafts', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // 11. evidence weight: a source you add can be rated on the card and in its sheet, and the pill is legible
    for (const theme of ['dark', 'light']) {
      const p = await page(browser, base, { theme });
      await p.newBoard();
      const mdPath = path.join(require('os').tmpdir(), 'vellum-smoke-evidence.md');
      fs.writeFileSync(mdPath, '# Restore scope\n\nA proposal, not an observation.');
      await p.setInputFiles('#fileIn', mdPath); await p.waitForTimeout(1500);
      const id = await p.evaluate(() => board.nodes.find(n => n.type === 'source')?.id);
      const pill = `.card[data-id="${id}"] [data-a="cycle-weight"]`;
      const w = () => p.evaluate(id => byId(id).weight || null, id);
      await p.evaluate(id => { focusNodes([byId(id)], 1, 0); select([]); }, id); await p.waitForTimeout(300);
      const bad = await p.evaluate(LEGIBILITY, `.card[data-id="${id}"] .weight`);
      check(`an unrated source's pill is legible in ${theme} mode`, bad.length === 0, bad.join(' | '));
      if (theme === 'light') { await p.context().close(); continue; }
      check('a source you add shows an Unrated pill you can click', (await p.locator(pill).count()) === 1 && /Unrated/.test(await p.locator(pill).innerText()));
      const seen = [];
      for (let i = 0; i < 5; i++) { await p.click(pill); await p.waitForTimeout(150); seen.push(await w()); }
      check('clicking the pill steps through every weight and back to unrated', seen.join() === 'observed,reported,proposed,illustrative,', seen.join());
      await p.evaluate(id => openFocus(id), id); await p.waitForTimeout(600);
      check('the sheet has an Evidence section with the four weights', (await p.locator('#margin .m-evidence [data-m="weight"]').count()) === 4);
      await p.click('#margin .m-evidence [data-w="reported"]'); await p.waitForTimeout(300);
      const set = await w();
      await p.click('#margin .m-evidence [data-w="reported"]'); await p.waitForTimeout(300);
      check('the sheet sets a weight, and clicking it again clears it', set === 'reported' && (await w()) === null, `${set} then ${await w()}`);
      check('rating a source is in the change log', await p.evaluate(() => board.log.some(l => /Marked .* as reported/.test(l.html))));
      check('no page errors when rating evidence', p.errors.length === 0, p.errors.join(' | '));
      fs.rmSync(mdPath, { force: true });
      await p.context().close();
    }
    // 12. a reply that ran out of tokens or time says so, and a timeout is not mistaken for Stop
    {
      const p = await page(browser, base);
      await p.newBoard();
      queue = [{ id: 'len1', match: 'Lumen Copilot', text: 'Start with the restore prediction test, because', finish: 'length' }];
      await p.type('What should we test first?'); await p.idle();
      for (let i = 0; i < 40 && !(await p.evaluate(() => (board.copilot || []).some(m => m.role === 'ai' && /Cut off/.test(m.text || '')))); i++) await p.waitForTimeout(250);
      const cop = await p.evaluate(() => (board.copilot || []).filter(m => m.role === 'ai').map(m => m.text).at(-1) || '');
      check('a Copilot reply cut at its length limit says so', requests.some(x => x.matched === 'len1') && /Cut off: the reply reached its length limit/.test(cop), cop.slice(-160));
      await p.evaluate(() => { LOCAL_AI_MS = 0; });
      queue = [{ id: 'early1', match: 'TIMEOUT-EARLY', text: 'too late', delay: 3000 }];
      const early = await p.evaluate(async () => { try { await apiChat({ prompt: 'TIMEOUT-EARLY', timeoutMs: 800 }); return 'no error'; } catch (e) { return `${e.name}: ${e.message}`; } });
      check('no answer in time is a named timeout, not an abort', /^TimeoutError: The model didn't finish within 1 s/.test(early), early);
      queue = [{ id: 'slow1', match: 'TIMEOUT-MID', text: Array.from({ length: 24 }, (_, i) => `Point ${i + 1}: a restore preview lists edit ${i * 7 + 3}.`).join(' '), slow: 250 }]; // varied, so the repetition guard leaves it alone
      const mid = await p.evaluate(async () => { try { return await apiChat({ prompt: 'TIMEOUT-MID', timeoutMs: 1200 }); } catch (e) { return `${e.name}: ${e.message}`; } });
      check('a reply cut off by time keeps what arrived and says it was cut off', /^Point 1:/.test(mid) && /Cut off: the model didn't finish within 1 s\./.test(mid), mid.slice(-120));
      await p.evaluate(() => { apiHealth = { k: 'unknown', sig: '', at: 0 }; }); // the early timeout marked the API unreachable for a while
      queue = [{ id: 'rules1', match: 'TIMEOUT-RULES', text: '{}', delay: 3000 }];
      const fb = await p.evaluate(async () => { const r = await viaClaude(async () => null, async () => 'from rules', { studio: () => null, apiArgs: { prompt: 'TIMEOUT-RULES', json: true, timeoutMs: 800 } }); return { engine: r.engine, v: r.v, toast: [...document.querySelectorAll('#toasts > *')].map(t => t.innerText).join(' / ') }; });
      check('a crew move that times out falls back to built-in rules and says why', fb.engine === 'local' && fb.v === 'from rules' && /didn't finish within 1 s\. Built-in rules drafted this instead/.test(fb.toast), JSON.stringify(fb));
      await p.evaluate(() => { LOCAL_AI_MS = 240000; });
      check('local models get the longer time limit', await p.evaluate(() => isLocalBase('http://127.0.0.1:59700/v1') && isLocalBase('http://localhost:11434/v1') && !isLocalBase('https://openrouter.ai/api/v1')));
      check('no page errors around cut-off and timed-out replies', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // 13. first run and the no-credit state, as a first-time user with an OpenRouter key and $0 credit meets them
    {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.route('http://127.0.0.1:59631/**', r => r.abort()); await ctx.route('http://127.0.0.1:59639/**', r => r.abort()); await ctx.route(/wikipedia\.org/, r => r.abort());
      await ctx.route(/openrouter\.ai/, r => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: cors }) : r.fulfill({ status: 402, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { message: 'Insufficient credits', code: 402 } }) }));
      const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
      await p.goto(base + '/Vellum-Lumen.html?welcome=1'); await p.waitForTimeout(2600);
      const w = await p.evaluate(() => ({ open: dlg.open, txt: dlg.innerText, s: cam.s, far: world.classList.contains('far'), tray: [...document.querySelectorAll('.pbar')].filter(e => e.style.visibility !== 'hidden').length }));
      check('first run: a welcome says what Vellum is and offers Start a board or Explore the sample', w.open && /Start a board/.test(w.txt) && /Explore the sample/.test(w.txt) && /Gather, Explore, Prototype, Snapshot/.test(w.txt), w.txt.slice(0, 160));
      check('first run: the sample opens on its first lane at a readable zoom (not label-only), with no draft tray waiting', w.s >= 0.6 && !w.far && w.tray === 0, JSON.stringify(w));
      await p.click('[data-welcome="sample"]'); await p.waitForTimeout(300);
      const g = await p.evaluate(() => board.nodes.filter(n => n.type === 'group').map(n => n.title).join(' | '));
      check('the sample has no lane-wide groups repeating the lane names (the lanes are the zones), and none uses Diverge / Make / Release', !/^\d\d · (Gather|Explore|Prototype|Snapshot) · /m.test(g.split(' | ').join('\n')) && !/Diverge|Make ·|Release/.test(g), g);
      check('the /claim command is described with the same words', await p.evaluate(() => /Add an idea to Explore/.test(JSON.stringify(CMDS))));
      const pill = () => p.evaluate(() => ({ t: document.querySelector('#crewModeBtn small').textContent, c: document.querySelector('#crewModeBtn').className, entry: document.querySelector('#crewSetBtn .hub-l')?.textContent || '' }));
      check('no key: the entry and its model row say "No AI connected", not "Offline"', (await pill()).t === 'No AI connected' && (await pill()).entry === 'No AI connected', JSON.stringify(await pill()));
      await p.evaluate(() => { studioPopOpen = true; renderStudioPop(); }); await p.waitForTimeout(200);
      const ms = await p.evaluate(() => { const r = [...document.querySelectorAll('#studioPop .sp-svc')].find(e => /Media Studio/.test(e.innerText)); return { txt: r.innerText, tip: r.querySelector('.sp-svc-sub')?.title || '' }; });
      check('Media Studio says what it is and what it needs, and never sends a Mac user to "your Windows PC"', !/Windows/.test(ms.txt + ms.tip) && /images and video/.test(ms.txt) && /NVIDIA GPU/.test(ms.tip), JSON.stringify(ms));
      await p.evaluate(() => { studioPopOpen = false; renderStudioPop(); openApiDialog(); }); await p.waitForTimeout(200);
      await p.click('dialog[open] [data-ap="openrouter"]'); await p.fill('#apiKeyIn', 'sk-or-zero'); await p.click('dialog[open] [data-api-test]'); await p.waitForTimeout(800);
      const t = await p.evaluate(() => ({ txt: $('apiTestOut').innerText, href: $('apiTestOut').querySelector('a')?.href || '' }));
      check('Test connection on a 402 says the key works but the account is out of credits, with a link to add credits', /Key works, but the account is out of credits/.test(t.txt) && /openrouter\.ai\/settings\/credits/.test(t.href), JSON.stringify(t));
      check('Test connection has a message for every status the classifier can return', await p.evaluate(() => [200, 401, 402, 404, 429, 500].map(classifyApiStatus).concat(['unreachable']).every(k => !!apiTestMessage({ k, ms: 1, detail: 'HTTP 500' }, { baseUrl: 'https://openrouter.ai/api/v1' }).txt)));
      await p.click('dialog[open] [data-api-save]'); await p.waitForTimeout(500);
      let pl = await pill();
      check('after the 402 the entry says "Out of credits" (a red dot on the model row), not "API error"', pl.t === 'Out of credits' && pl.entry === 'Out of credits' && /\berr\b/.test(pl.c), JSON.stringify(pl));
      await p.evaluate(() => { studioPopOpen = true; renderStudioPop(); }); await p.waitForTimeout(200);
      check('and the Connection popover says the same', /Out of credits/.test(await p.evaluate(() => $('studioPop').innerText)) && !/\bauto\b/.test(await p.evaluate(() => $('studioPop').innerText)));
      await p.reload(); await p.waitForTimeout(2600);
      check('a reload remembers it (no healthy-looking pill until the next check), and the welcome does not come back', (await pill()).t === 'Out of credits' && !(await p.evaluate(() => dlg.open)), JSON.stringify(await pill()));
      check('the key itself is not stored with the remembered status', await p.evaluate(() => !JSON.stringify(store.get('.apiHealth', {})).includes('sk-or-zero')));
      await p.evaluate(() => { store.set('.apiHealth', null); apiHealth = { k: 'unknown', sig: '', at: 0, ms: null, detail: '' }; apiCfg = { ...apiCfg, model: 'openrouter/auto' }; renderCrew(); });
      pl = await pill();
      check('a key not checked yet shows the model\'s own name ("OpenRouter Auto", not "auto") without a healthy dot', pl.t === 'OpenRouter Auto' && !/claude|live/.test(pl.c), JSON.stringify(pl));
      const a = await p.evaluate(() => { const d = board.nodes.find(n => n.type === 'direction' && n.status === 'sketch'); select([d.id]); const ph = placeholderFor([d]); adopt(d); return { ph, st: d.status, ad: board.adopted[d.idea] === d.id }; });
      check('the hint on a draft direction says /adopt keeps and adopts it, and it does', /keep and adopt/.test(a.ph) && a.st === 'ink' && a.ad, JSON.stringify(a));
      check('the same toast twice in a row shows once', await p.evaluate(() => { toast('Twice'); toast('Twice'); return [...document.querySelectorAll('#toasts > *')].filter(x => x.innerText.includes('Twice')).length === 1; }));
      check('no page errors on first run and in the no-credit state', p.errors.length === 0, p.errors.join(' | '));
      await ctx.close();
    }
  } finally {
    // 9. legibility: light and dark are designed separately, so both are measured, in the states that change colour
    for (const theme of ['light', 'dark']) {
      const p = await page(browser, base, { theme });
      const bad = [];
      for (const [pref, status] of [['auto', 200], ['auto', 401], ['local', 200]]) {
        probe.status = status;
        await p.evaluate(pr => { setAiPref(pr); apiHealth = { k: 'unknown', sig: '', at: 0 }; toggleStudioPopover(false); toggleCrewPop(true); }, pref);
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
        const order = await p.evaluate(() => {
          const keep = board.nodes.slice(), mk = (id, t) => ({ id, type: 'note', x: 0, y: 0, created: NOW(), by: 'you', status: 'ink', rev: 1, text: t, title: t });
          board.nodes = [mk('z1', 'Before'), mk('cafe0001', 'A'), mk('20000002', 'B'), mk('dead0003', 'C'), mk('z2', 'After')]; closeTx(); undoStack.length = 0;
          const names = () => board.nodes.map(n => n.title).join(',');
          checkpoint(); board.nodes = [board.nodes[0], board.nodes[4], mk('30000004', 'A2'), mk('beef0005', 'B2'), mk('40000006', 'C2')]; closeTx(); // like Try again: old out, new appended
          undo(); const undone = names(); redo(); const redone = names();
          board.nodes = keep; undoStack.length = 0; redoStack.length = 0; renderAll(); return { undone, redone };
        });
        check('undo and redo put replaced cards back in their exact order, even when ids look like numbers', order.undone === 'Before,A,B,C,After' && order.redone === 'Before,After,A2,B2,C2', JSON.stringify(order));
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

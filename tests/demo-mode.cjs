#!/usr/bin/env node
/* The in-browser demo (tools/demo/build.mjs → dist/demo), as a visitor gets it from a static host with the demo's headers:
 * - the build: no crew prompts, model calls or local endpoints in the page; fonts split out; the page stays small
 * - it opens on the demo board (an AI video-editing agent), says it is a demo, and never asks for a local AI setup
 * - nothing leaves the browser: every request is to the page's own origin, nothing is kept in localStorage or IndexedDB,
 *   and a refresh starts over
 * - the moment the crew was recorded on: Add the beta test → it lands countering the decision → the crew's re-check is replayed
 *   and labelled as a recording on the note and in the decision view → the choice stays the visitor's (Still holds works)
 * - things that need no model work for real: relations, the decision view, board checks
 * - Chinese: the board and the cue in Chinese, and the Chinese font loads only then
 *   node tests/demo-mode.cjs   (from the repo root; builds dist/demo first)  SHOTS=dir saves screenshots
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/demo/build.mjs')], { stdio: 'pipe' });
  const html = fs.readFileSync(path.join(ROOT, 'dist/demo/index.html'), 'utf8');
  /* the build */
  check('build: no crew prompts in the page', !/You are (Scout|Strategist|Wright|Critic|Lumen Copilot)/.test(html) && !/Right now you are re-checking/.test(html));
  check('build: no local AI or cloud endpoints', !/127\.0\.0\.1:596(31|39)/.test(html) && !/chat\/completions/.test(html));
  check('build: model calls are stubbed', /async function studioChat\([^)]*\)\{throw new Error\("demo"\)\}/.test(html) || !/studio\/generate/.test(html));
  check('build: no embedded fonts or sample media', !/data:font\/woff2;base64/.test(html) && !/data:video\/mp4;base64/.test(html));
  const gz = zlib.gzipSync(Buffer.from(html), { level: 9 }).length;
  check('build: page under 600 kB gzipped', gz < 600e3, `${Math.round(gz / 1e3)} kB`);
  check('build: no comments or source maps', !/sourceMappingURL/.test(html) && !/\/\* ── /.test(html));

  const srv = await require(path.join(ROOT, 'tools/demo/serve.cjs')).start(0), base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch();
  try {
    for (const [lang, theme] of [['en', 'light'], ['zh', 'dark']]) {
      const c = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
      const p = await c.newPage(); const errs = [], reqs = [];
      p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
      p.on('console', m => { if (/Content Security Policy|Refused to/.test(m.text())) errs.push('csp: ' + m.text().slice(0, 140)); });
      p.on('request', r => { const u = r.url(); if (!/^(data|blob):/.test(u)) reqs.push(u); });
      await p.goto(`${base}?lang=${lang}`); await p.waitForTimeout(2600);
      const T = (en, zh) => lang === 'zh' ? zh : en;
      const st = await p.evaluate(() => ({ demo: !!board.demo, id: board.id, title: board.title, ev: board.nodes.filter(n => isEvidenceCard(n)).length,
        decided: decisionsNow().length, chip: !!document.querySelector('#dmChip'), cue: document.querySelector('#dmCue')?.textContent || '', welcome: !!document.querySelector('.welcome:not([hidden])') }));
      check(`${lang}: opens on the demo board`, st.demo && st.id === 'demo' && st.decided === 1 && st.ev >= 3, JSON.stringify(st));
      check(`${lang}: the board is in ${lang}`, lang === 'zh' ? /剪辑/.test(st.title) : /video agent/.test(st.title), st.title);
      check(`${lang}: says it is a demo, with one cue and no welcome`, st.chip && st.cue.includes(T('New evidence', '新证据')) && !st.welcome, JSON.stringify(st));
      /* no local AI setup */
      await p.click('#crew').catch(() => {}); await p.waitForTimeout(300);
      const pop = await p.evaluate(() => { const el = document.querySelector('#studioPop'); return el && !el.hidden ? el.textContent : ''; });
      if (pop) check(`${lang}: the crew menu says it is a recorded run, with no Local AI or API setup`, pop.includes(T('Recorded run', '录制回放')) && !/Local AI|Cloud API|本地模型|云端 API/.test(pop), pop.slice(0, 160));
      await p.keyboard.press('Escape'); await p.mouse.click(700, 600); await p.waitForTimeout(200);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-1-open.png`) });

      /* the recorded moment */
      await p.click('[data-dm="add"]'); await p.waitForTimeout(600);
      const added = await p.evaluate(() => { const n = board.nodes.find(x => x.demoNew); const d = decisionsNow()[0].dir; const r = n && relBetween(n.id, d.id); return { n: !!n, rel: r?.rel, cue: document.querySelector('#dmCue')?.textContent || '' }; });
      check(`${lang}: Add brings in the beta test, countering the decision`, added.n && added.rel === 'conflicts', JSON.stringify(added));
      check(`${lang}: the cue says the crew is re-checking a recording`, added.cue.includes(T('recorded run', '录制回放')), added.cue);
      let note = null;
      for (let i = 0; i < 40 && !note; i++) { await p.waitForTimeout(500); note = await p.evaluate(() => { const d = decisionsNow()[0].dir; return (board.pins[d.id] || []).find(x => x.check === 'revisit') || null; }); }
      check(`${lang}: the crew's re-check arrives as one note on the decision`, !!note && note.recheck?.model === 'replay', JSON.stringify(note)?.slice(0, 200));
      await p.waitForTimeout(900);
      const pinUI = await p.evaluate(() => document.querySelector('.adv-eng')?.textContent || '');
      check(`${lang}: the note is labelled as a recording`, pinUI.includes(T('recorded', '录制')), pinUI);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-2-recorded-note.png`) });
      await p.click('[data-dm="dec"]'); await p.waitForTimeout(900);
      const dv = await p.evaluate(() => ({ open: !document.querySelector('#decPanel')?.hidden, txt: document.querySelector('#decPanel')?.textContent || '' }));
      check(`${lang}: the decision view shows the recorded re-check and the new evidence`, dv.open && dv.txt.includes(T('The crew · recorded', '成员 · 录制回放')) && dv.txt.includes(T('Beta test', '内测')), dv.txt.slice(0, 200));
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-3-decision-view.png`) });
      await p.click('[data-dv-hold]'); await p.waitForTimeout(300);
      await p.click('[data-dv-hold-save]').catch(() => {}); await p.waitForTimeout(400);
      const held = await p.evaluate(() => ({ held: !!decisionsNow()[0].dir.held, still: decisionsNow().length }));
      check(`${lang}: Still holds is the visitor's call and works without a model`, held.held && held.still === 1, JSON.stringify(held));

      /* relations work for real */
      const rel = await p.evaluate(() => { const a = board.nodes.find(n => n.type === 'source' && n.weight === 'reported'), d = board.nodes.find(n => n.type === 'direction' && n.letter === 'C'); const r = makeRelation(a.id, d.id, { rel: 'supports' }); renderAll(); return !!r.e && !!relBetween(a.id, d.id); });
      check(`${lang}: relations work`, rel);

      /* nothing leaves the browser, nothing is kept */
      const own = reqs.every(u => u.startsWith(base));
      check(`${lang}: every request goes to the page's own origin`, own, reqs.filter(u => !u.startsWith(base)).join(', '));
      check(`${lang}: the Chinese font loads only for Chinese`, lang === 'zh' ? reqs.some(u => /assets\/.*\.woff2/.test(u)) && reqs.filter(u => u.endsWith('.woff2')).length === 3 : reqs.filter(u => u.endsWith('.woff2')).length <= 2, reqs.filter(u => u.endsWith('.woff2')).length + ' fonts');
      const kept = await p.evaluate(async () => ({ ls: Object.keys(localStorage).filter(k => k.startsWith('vellum')), idb: (await indexedDB.databases?.() || []).map(d => d.name) }));
      check(`${lang}: nothing is kept in localStorage or IndexedDB`, !kept.ls.length && !kept.idb.includes('vellum'), JSON.stringify(kept));
      await p.reload(); await p.waitForTimeout(2200);
      const fresh = await p.evaluate(() => ({ n: board.nodes.some(x => x.demoNew), held: !!decisionsNow()[0]?.dir.held, cue: document.querySelector('#dmCue')?.textContent || '' }));
      check(`${lang}: a refresh starts over`, !fresh.n && !fresh.held && fresh.cue.includes(T('New evidence', '新证据')), JSON.stringify(fresh));
      check(`${lang}: no page errors or blocked requests`, !errs.length, errs.join(' | '));
      await c.close();
    }
    /* phone: the board opens and the cue fits */
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    await p.goto(base); await p.waitForTimeout(2600);
    const cue = await p.evaluate(() => { const r = document.querySelector('#dmCue').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth }; });
    check('phone: the cue fits the screen', cue.l >= 15 && cue.r <= cue.w - 15, JSON.stringify(cue));
    check('phone: no page errors', !errs.length, errs.join(' | '));
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'phone-en-1-open.png') });
    await c.close();
  } finally { await b.close(); srv.close(); }
  console.log(results.join('\n'));
  console.log(failures ? `\n${failures} failed` : `\nall ${results.length} passed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

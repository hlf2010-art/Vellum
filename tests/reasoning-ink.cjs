#!/usr/bin/env node
/* Thinking is drawn in ink: claims, syntheses, directions, questions and proofs carry an ink rule, material does not.
 * A direction set aside stays readable, says which direction won, and keeps your reason (which the crew also learns).
 * Lines: stage colours stay on cards, not lines. The idle task pill and the "N waiting" edge chip are gone.
 * The top bar says each thing once: "No AI connected" only on the connection chip, a waiting draft only as "1 draft".
 *   node tests/reasoning-ink.cjs   (from the repo root)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }
(async () => {
  const srv = http.createServer((q, r) => { if (q.url.startsWith('/Vellum-Lumen.html')) { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(r); } r.writeHead(404); r.end(); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  try {
    for (const theme of ['light', 'dark']) {
      const c = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
      await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route(/wikipedia|wikimedia/, r => r.abort());
      const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
      await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
      const ring = t => p.evaluate(t => { const n = board.nodes.find(n => n.type === t && n.status === 'ink' && !n.hidden); const el = n && document.querySelector(`[data-id="${n.id}"]`); const m = el && getComputedStyle(el).boxShadow.match(/0px 0px 0px ([\d.]+)px/); return m ? +m[1] : 0; }, t);
      for (const t of ['idea', 'synthesis', 'proof']) check(`${theme}: a ${t} card carries the ink rule`, await ring(t) >= 1.2, await ring(t));
      for (const t of ['image', 'source', 'note']) check(`${theme}: a ${t} card stays plain paper`, await ring(t) < 1, await ring(t));
      if (theme === 'dark') { check('dark: no page errors', !errs.length, errs.join(' | ')); await c.close(); continue; }
      const A = await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'direction' && n.letter === 'A'); return n.id; });
      const st = await p.evaluate(id => { const el = document.querySelector(`[data-id="${id}"]`), cs = getComputedStyle(el); return { op: +cs.opacity, aside: el.querySelector('.aside-h')?.textContent || '', btn: el.querySelector('.aside-add')?.textContent }; }, A);
      check('a set-aside direction is fully readable', st.op === 1, st.op);
      check('it says which direction was chosen instead', /Set aside for\s*B\s*Diegetic Wrist Pager/.test(st.aside), st.aside);
      check('it offers to add a reason', st.btn === 'Add a reason', st.btn);
      check('the adopted direction has no set-aside line', await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'direction' && n.letter === 'B'); return !document.querySelector(`[data-id="${n.id}"] .aside`); }));
      check('a draft direction has no set-aside line', await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'direction' && n.status === 'sketch'); return !document.querySelector(`[data-id="${n.id}"] .aside`); }));
      await p.evaluate(id => { const n = byId(id); focusNodes([n, byId(board.adopted[n.idea])], 1, 0); }, A); await p.waitForTimeout(700);
      const gap0 = await p.evaluate(id => { const n = byId(id), w = byId(board.adopted[n.idea]); return w.y - (n.y + nodeEl(n.id).offsetHeight); }, A);
      await p.click(`[data-id="${A}"] .aside-add`); await p.waitForTimeout(300);
      check('Add a reason opens the reason for typing', await p.evaluate(id => document.querySelector(`[data-id="${id}"] .aside-why`).contentEditable === 'true', A));
      await p.keyboard.type('Testers already ignore the top-right corner, so a louder chime only adds noise during combat.'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
      const saved = await p.evaluate(id => ({ why: byId(id).whyNot, shown: document.querySelector(`[data-id="${id}"] .aside-why`).textContent, btn: document.querySelector(`[data-id="${id}"] .aside-add`).textContent, rec: (board.declined || []).filter(r => r.kind === 'passed-over' && r.ref === id).map(r => r.reason) }), A);
      check('the reason is kept on the card', /louder chime/.test(saved.why) && saved.shown === saved.why && saved.btn === 'Edit reason', JSON.stringify(saved));
      check('the crew learns the reason (passed-over record)', saved.rec.length === 1 && /louder chime[\s\S]*Adopted B/.test(saved.rec[0]), JSON.stringify(saved.rec));
      const gap1 = await p.evaluate(id => { const n = byId(id), w = byId(board.adopted[n.idea]); return w.y - (n.y + nodeEl(n.id).offsetHeight); }, A);
      check('the card below moves down instead of being covered', gap1 >= 20, `before ${gap0}, after ${gap1}`);
      await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
      { const u = await p.evaluate(id => ({ why: byId(id).whyNot || '', btn: document.querySelector(`[data-id="${id}"] .aside-add`)?.textContent }), A); check('undo takes the reason back', !u.why && u.btn === 'Add a reason', JSON.stringify(u)); }
      check('lines do not take stage colours', await p.evaluate(() => { const ws = [...document.querySelectorAll('#wires path.w.pgB:not(.rel)')]; const t = getComputedStyle(document.documentElement).getPropertyValue('--thread').trim(); return ws.length > 0 && ws.every(w => getComputedStyle(w).stroke === getComputedStyle(document.querySelector('#wires path.w:not([class*="pg"]):not(.rel)') || w).stroke); }));
      check('the empty task pill is hidden when nothing has run', await p.evaluate(() => { const i = $('island'); return i.dataset.mode === 'idle' && +getComputedStyle(i).opacity === 0; }));
      await p.evaluate(() => { cam = { s: 1, x: 5000, y: 5000 }; paintCam(); paintEdges(); }); await p.waitForTimeout(200);
      check('a draft off screen does not add a second "waiting" chip (the top bar already says "1 draft")', await p.evaluate(() => !/waiting/.test($('edges').innerText) && !$('reviewBtn').hidden));
      /* the top bar says each thing once */
      const tb = await p.evaluate(() => { const sw = document.querySelector('#partSw .part-b[aria-checked="true"] .part-l>span'); toggleCrewPop(true); const pop = $('crewPop').innerText; toggleCrewPop(false);
        return { chip: $('crewModeBtn').innerText.trim(), setDot: !!document.querySelector('#crewSetBtn .conn-dot'), swDot: sw ? getComputedStyle(sw, '::after').display : 'none', pop: /No AI model/.test(pop), seatGlow: !!document.querySelector('.seat.waiting'), seatLabel: document.querySelector('.seat[data-agent="muse"]').getAttribute('aria-label') }; });
      check('"No AI connected" is said once, on the connection chip', tb.chip === 'No AI connected' && !tb.setDot && tb.swDot === 'none' && !tb.pop, JSON.stringify(tb));
      check('a waiting draft is shown by "1 draft", not also by a glowing seat (the seat still says so to screen readers)', !tb.seatGlow && /waiting for you/.test(tb.seatLabel), JSON.stringify(tb));
      check('light: no page errors', !errs.length, errs.join(' | '));
      await c.close();
    }
  } catch (e) { check('test run', false, String(e).split('\n')[0]); }
  await b.close(); srv.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failures}/${results.length} passed`); process.exit(failures ? 1 : 0);
})();

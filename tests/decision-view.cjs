#!/usr/bin/env node
/* The decision view: one place for every decision on the board.
 * - A Decisions entry beside the board name (and D) opens a panel; Esc closes it. The tools and map step aside meanwhile.
 * - Each decision shows the claim, the chosen direction, your reason (also on the adopted card), what it rests on with
 *   counters apart, and the directions set aside with their reasons. Reasons typed in the panel are saved and undoable.
 * - Evidence kept after the decision that bears on it shows as new; a counter marks the decision Countered (a dot on the
 *   entry, not in Focus). Still holds keeps it, with an optional reason; Reopen the choice clears the adoption. Nothing
 *   changes on its own.
 * - Claims with directions and nothing adopted are listed under Still open. The board switcher says decided / open.
 *   node tests/decision-view.cjs   (from the repo root)
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
    const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route(/wikipedia|wikimedia|openrouter|gdcvault/, r => r.abort());
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);

    const ids = await p.evaluate(() => { const d = decisionsNow()[0]; return { claim: d.claim.id, dir: d.dir.id, a: board.nodes.find(n => n.type === 'direction' && n.idea === d.claim.id && n.letter === 'A').id }; });
    check('the entry names how many decisions the board holds', await p.evaluate(() => $('decBtn').textContent.trim() === '1 decision' && $('decBtn').getAttribute('aria-expanded') === 'false'));
    await p.keyboard.press('d'); await p.waitForTimeout(450);
    const v = await p.evaluate(() => ({ open: !$('decPanel').hidden, exp: $('decBtn').getAttribute('aria-expanded'), toolsAside: getComputedStyle(document.querySelector('.top-tools')).opacity === '0' && getComputedStyle($('map')).pointerEvents === 'none',
      chose: document.querySelector('.dv-chose .dv-ct')?.textContent, chip: document.querySelector('.dv-chose .chip')?.textContent, st: document.querySelector('.dv-st')?.textContent || '',
      aside: [...document.querySelectorAll('.dv-al .dv-at')].map(x => x.textContent), ev: document.querySelector('.dv-ev>summary')?.textContent, rows: document.querySelectorAll('[data-dv-ev]:not([data-dv-ev^="s:"]) .dv-list .dv-row').length,
      since: !!document.querySelector('.dv-since'), openN: document.querySelectorAll('.dv-open').length }));
    check('D opens the panel; the tools and the map step aside', v.open && v.exp === 'true' && v.toolsAside, JSON.stringify(v));
    check('the decision shows the chosen direction, and no status word when nothing has changed', v.chip === 'B' && /Diegetic Wrist Pager/.test(v.chose) && v.st === '', JSON.stringify(v));
    check('what it rests on: a verdict and the number of sources, each one listed (material only, once each)', /Mostly observed/.test(v.ev) && /6 sources/.test(v.ev) && v.rows === 6, JSON.stringify(v));
    check('the direction set aside is listed, and nothing new or open is shown on the sample', v.aside.length === 1 && /Corner Toast/.test(v.aside[0]) && !v.since && v.openN === 0, JSON.stringify(v));

    /* reasons */
    await p.click('[data-dv-why]'); await p.keyboard.type('It keeps eyes on the rooftop route.'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    const w = await p.evaluate(id => ({ why: byId(id).whyYes, card: nodeEl(id).querySelector('.chose .aside-why')?.textContent, log: (board.changes || []).some(c => c.op === 'decision-why' && c.id === id) }), ids.dir);
    check('a reason typed in the panel is saved on the direction, shown on its card, and logged', w.why === 'It keeps eyes on the rooftop route.' && w.card === w.why && w.log, JSON.stringify(w));
    await p.evaluate(() => undo()); await p.waitForTimeout(300);
    check('Undo takes the reason back', await p.evaluate(id => !byId(id).whyYes && !!nodeEl(id).querySelector('.chose.empty') && document.querySelector('[data-dv-why]').value === '', ids.dir));
    await p.click('[data-dv-whynot]'); await p.keyboard.type('Corner toasts were missed by 9 of 12.'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    check('a set-aside reason typed in the panel lands on that card and in decision memory', await p.evaluate(id => byId(id).whyNot === 'Corner toasts were missed by 9 of 12.' && /Corner toasts were missed/.test(nodeEl(id).querySelector('.aside-why')?.textContent || '') && (board.declined || []).some(r => r.kind === 'passed-over' && r.ref === id && /9 of 12/.test(r.reason)), ids.a));
    check('Esc in a reason field puts it back without closing the panel', await (async () => { await p.click('[data-dv-why]'); await p.keyboard.type('half a thought'); await p.keyboard.press('Escape'); await p.waitForTimeout(200); return p.evaluate(id => !byId(id).whyYes && !$('decPanel').hidden, ids.dir); })());

    /* new evidence since the decision */
    await p.evaluate(r => { const d = byId(r.dir); d.adoptedAt = NOW() - 3600e3; board.nodes.forEach(n => { if (n.id !== r.dir) { n.created = Math.min(n.created || 0, NOW() - 7200e3); n.inked = 0 } });
      const e1 = node('source', { title: 'Playtest 3: pager missed in rain', text: '4 of 6 missed the glow in rain.', weight: 'observed' }, { x: 120, y: 1500 });
      const e2 = node('note', { title: 'P09 liked the rim glow', text: '', weight: 'reported' }, { x: 120, y: 1800 });
      makeRelation(e1.id, r.dir, { via: 'wire' }).e.rel = 'conflicts'; makeRelation(e2.id, r.dir, { via: 'wire' }).e.rel = 'supports'; renderAll(); }, ids); await p.waitForTimeout(400);
    const n1 = await p.evaluate(() => ({ st: document.querySelector('.dv-st')?.textContent, k: document.querySelector('.dv-since .dv-k')?.textContent, rows: [...document.querySelectorAll('.dv-since .dv-row')].map(x => x.querySelector('.dv-rel')?.textContent), ctrBox: document.querySelector('.dv-since')?.classList.contains('ctr'), dot: !$('decBtn').querySelector('.dec-dot').hidden && $('decBtn').querySelector('.dec-dot').classList.contains('ctr'), ctrInRests: /1 counter/.test(document.querySelector('.dv-ev>summary').textContent) }));
    check('evidence kept after the decision shows as new, with how it bears on it', n1.k === 'New since you decided' && n1.rows.join() === 'Counters,Supports', JSON.stringify(n1));
    check('a counter marks the decision Countered, in the panel and as a dot on the entry', n1.st === 'Countered' && n1.ctrBox && n1.dot && n1.ctrInRests, JSON.stringify(n1));
    check('nothing about the decision changed on its own', await p.evaluate(r => board.adopted[r.claim] === r.dir, ids));
    const focusDot = await p.evaluate(() => { const prev = crewSpeak; crewSpeak = 'never'; $('decBtn')._sig = ''; renderDecBtn(); const hid = $('decBtn').querySelector('.dec-dot').hidden; crewSpeak = prev; $('decBtn')._sig = ''; renderDecBtn(); return hid; });
    check('in Focus the entry shows no dot', focusDot);
    await p.click('[data-dv-hold]'); await p.waitForTimeout(250); await p.keyboard.type('Rain is fixable with a haptic pulse.'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    const h = await p.evaluate(r => ({ held: byId(r.dir).held, st: document.querySelector('.dv-st')?.textContent || '', calm: !!document.querySelector('details.dv-since.calm'), kept: document.querySelector('.dv-kept q')?.textContent, dot: $('decBtn').querySelector('.dec-dot').hidden, log: (board.changes || []).some(c => c.op === 'hold' && c.id === r.dir) }), ids);
    check('Still holds keeps the decision with your reason; the new evidence folds into "weighed"', h.held?.why === 'Rain is fixable with a haptic pulse.' && h.st === '' && h.calm && h.kept === 'Rain is fixable with a haptic pulse.' && h.dot && h.log, JSON.stringify(h));
    await p.evaluate(() => undo()); await p.waitForTimeout(300);
    check('Undo brings the new evidence back to weigh', await p.evaluate(r => !byId(r.dir).held && document.querySelector('.dv-st')?.textContent === 'Countered', ids));
    await p.click('[data-dv-reopen]'); await p.waitForTimeout(400);
    const ro = await p.evaluate(r => ({ adopted: board.adopted[r.claim], decided: document.querySelectorAll('.dv-dec').length, open: document.querySelector('.dv-open .dv-on')?.textContent, btn: $('decBtn').textContent.trim() }), ids);
    check('Reopen the choice clears the adoption; the claim moves to Still open with its directions', !ro.adopted && ro.decided === 0 && /AB/.test(ro.open || '') && ro.btn === 'Decisions', JSON.stringify(ro));
    await p.evaluate(r => { select([r.a]); adopt(byId(r.a)); }, ids); await p.waitForTimeout(500);
    const ad = await p.evaluate(r => ({ at: byId(r.a).adoptedAt > 0, meta: document.querySelector('.dv-meta')?.textContent, card: nodeEl(r.a).querySelector('.chose .aside-add')?.textContent, since: !!document.querySelector('.dv-since') }), ids);
    check('adopting records when and by whom, and the card offers to say why', ad.at && /^Decided .+ by you$/.test(ad.meta) && ad.card === 'Say why you chose it', JSON.stringify(ad));
    await p.evaluate(r => setOutcome(byId(r.a), 'failed', '5 of 6 never saw the corner toast.'), ids); await p.waitForTimeout(400);
    const fo = await p.evaluate(() => ({ st: document.querySelector('.dv-dec .dv-st')?.textContent, note: [...document.querySelectorAll('.dv-dec .dv-kept')].map(x => x.textContent).join('|'), acts: [...document.querySelectorAll('.dv-dec [data-dv-round],.dv-dec [data-dv-reopen]')].map(x => x.textContent).join(','), dot: !$('decBtn').querySelector('.dec-dot').hidden }));
    check('a failed test marks the decision Test failed, shows what happened, and offers New round or Reopen the choice', fo.st === 'Test failed' && /5 of 6 never saw/.test(fo.note) && fo.acts === 'New round,Reopen the choice' && fo.dot, JSON.stringify(fo));
    await p.evaluate(() => undo()); await p.waitForTimeout(300);
    await p.keyboard.press('Escape'); await p.waitForTimeout(350);
    check('Esc closes the panel and the tools come back', await p.evaluate(() => $('decPanel').hidden && !$('app').classList.contains('dv-on')));
    await p.click('#decBtn'); await p.waitForTimeout(350); await p.click('[data-dv-go]'); await p.waitForTimeout(700);
    check('a claim or card in the panel takes you to it on the board, the panel stays', await p.evaluate(r => sel[0] === r.claim && !$('decPanel').hidden, ids));
    await p.click('#projectBtn'); await p.waitForTimeout(300);
    check('the board switcher says where the board stands, not how many cards it holds', await p.evaluate(() => document.querySelector('.bp-row.cur small')?.textContent === '1 decided'));
    await p.click('#projectBtn'); await p.waitForTimeout(200);

    /* empty board, Chinese, phone */
    await p.evaluate(() => { persistNow(); board = blank(''); sel = []; renderAll(); }); await p.waitForTimeout(300);
    check('an empty board says how a decision gets here', await p.evaluate(() => /Nothing decided yet/.test($('decPanel').textContent) && $('decBtn').textContent.trim() === 'Decisions'));
    await p.evaluate(() => { store.set('.lang', 'zh'); }); await p.evaluate(() => { board = sampleShowcase(); renderAll(); }); await p.waitForTimeout(400);
    const zh = await p.evaluate(() => ({ btn: $('decBtn').textContent.trim(), h: document.querySelector('.dv-head b')?.textContent, k: [...document.querySelectorAll('.dv-k')].map(x => x.textContent).join('|') }));
    check('Chinese labels', zh.btn === '1 个决定' && zh.h === '决定' && /为什么选它/.test(zh.k) && /依据/.test(zh.k) && /搁置的/.test(zh.k), JSON.stringify(zh));
    await p.evaluate(() => store.set('.lang', 'en'));
    await p.setViewportSize({ width: 390, height: 844 }); await p.evaluate(() => renderAll()); await p.waitForTimeout(400);
    const ph = await p.evaluate(() => { const r = $('decPanel').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, over: [...document.querySelectorAll('#decPanel *')].some(x => x.getBoundingClientRect().right > r.right + 1 && x.offsetParent) }; });
    check('on a phone the panel fits the screen with nothing spilling out', ph.l >= 8 && ph.r <= ph.w - 8 && !ph.over, JSON.stringify(ph));
    check('no page errors', !errs.length, errs.join(' | '));
  } finally { await b.close(); srv.close(); }
  console.log(results.join('\n')); console.log(`\n${results.length - failures}/${results.length} passed`); process.exit(failures ? 1 : 0);
})();

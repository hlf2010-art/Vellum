#!/usr/bin/env node
/* Ink gestures, phase 1: the pen (P), ⌥+drag on empty board and a stylus all put down ink; a loop is read when the
 * pen lifts. A loop around cards selects them (two or more bring the selection bar); a loop around one direction
 * adopts it, says so at the nib before you lift, keeps your stroke on the card as a hairline mark that follows the
 * card and comes back on hover, and Undo takes back both. A stroke that means nothing dries away and changes nothing.
 * Covers mouse, pen with pressure (CDP pointerType "pen"), touch in the Pen tool, two fingers cancelling a stroke,
 * English and Chinese, light and dark, and reduced motion.
 *
 *   node tests/ink-gestures.cjs            (from the repo root)
 *   SHOTS=dir node tests/ink-gestures.cjs  (also save screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }
function serve() { return new Promise(res => { const srv = http.createServer((req, rsp) => { if (req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp); } rsp.writeHead(404); rsp.end(); }); srv.listen(0, '127.0.0.1', () => res(srv)); }); }
async function open(browser, base, { theme = 'light', lang = 'en', motion = 'no-preference', touch = false } = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: motion, deviceScaleFactor: SHOTS ? 2 : 1, hasTouch: touch });
  await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route('http://127.0.0.1:59639/**', r => r.abort());
  await c.route(/wikipedia\.org|wikimedia\.org|openrouter|googleapis/, r => r.abort());
  await c.addInitScript(l => { try { localStorage.setItem('vellum-lumen.v1.lang', JSON.stringify(l)); } catch { } }, lang);
  const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2400);
  p.shot = async name => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  p.cdp = await c.newCDPSession(p);
  // the directions in view, A in the middle
  await p.evaluate(() => { const a = board.nodes.find(n => n.type === 'direction' && n.letter === 'A'); const r = wall.getBoundingClientRect(); cam.s = .9; cam.x = r.width * .45 - (a.x + nodeW(a) / 2) * cam.s; cam.y = r.height / 2 - (a.y + nodeH(a) / 2) * cam.s; paintCam(); });
  await p.waitForTimeout(300);
  return p;
}
const rectOf = (p, L) => p.evaluate(L => { const n = board.nodes.find(n => n.type === 'direction' && n.letter === L); const r = nodeEl(n.id).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, id: n.id }; }, L);
const union = (...rs) => { const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y)); return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y }; };
/* a hand-drawn loop around a box: a rounded superellipse, a little wobble, and an overshoot past where it began */
function loop(r, pad = 22, N = 64, over = 8) { const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2 + pad, ry = r.h / 2 + pad, pts = []; for (let i = 0; i <= N + over; i++) { const a = -2.25 + (i / N) * Math.PI * 2, wob = 1 + .02 * Math.sin(a * 2 + .6) + (i > N ? .04 * (i - N) / over : 0), co = Math.cos(a), si = Math.sin(a), e = .42; pts.push([cx + Math.sign(co) * Math.pow(Math.abs(co), e) * rx * wob, cy + Math.sign(si) * Math.pow(Math.abs(si), e) * ry * wob]); } return pts; }
async function drawMouse(p, pts, { alt = false, mid } = {}) {
  if (alt) await p.keyboard.down('Alt');
  await p.mouse.move(...pts[0]); await p.mouse.down();
  for (let i = 1; i < pts.length; i++) { await p.mouse.move(...pts[i], { steps: 2 }); if (mid && i === pts.length - 3) await mid(); }
  await p.mouse.up(); if (alt) await p.keyboard.up('Alt');
}
async function drawPen(p, pts, { mid } = {}) {
  const ev = (type, [x, y], force) => p.cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force });
  await ev('mouseMoved', pts[0], 0); await ev('mousePressed', pts[0], .3);
  for (let i = 1; i < pts.length; i++) { await ev('mouseMoved', pts[i], .3 + .6 * Math.sin(Math.PI * i / pts.length)); if (mid && i === pts.length - 3) await mid(); }
  await ev('mouseReleased', pts[pts.length - 1], 0);
}
async function drawTouch(p, pts) {
  const t = (type, pts2) => p.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts2.map(([x, y], id) => ({ x, y, id })) });
  await t('touchStart', [pts[0]]); for (let i = 1; i < pts.length; i++) await t('touchMove', [pts[i]]); await t('touchEnd', []);
}
const state = p => p.evaluate(() => ({ adopted: Object.values(board.adopted), sel: [...sel], marks: [...document.querySelectorAll('.card .ink-mark')].map(m => ({ id: m.dataset.mark, hot: m.classList.contains('hot'), w: getComputedStyle(m).strokeWidth, o: +getComputedStyle(m).opacity, d: m.getAttribute('d').length })), live: document.querySelectorAll('#lasso .ink-live').length, tip: document.querySelector('.ink-tip.on')?.textContent || '', bar: !!document.querySelector('#selbar:not([hidden])') && getComputedStyle(document.querySelector('#selbar')).display !== 'none', tool: [...document.querySelectorAll('#topTools [data-ttool]')].find(b => b.getAttribute('aria-pressed') === 'true')?.dataset.ttool }));

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    /* 1. the pen tool, a loop around one direction */
    for (const [theme, lang] of [['light', 'en'], ['dark', 'zh']]) {
      const p = await open(browser, base, { theme, lang }); const tag = `${theme}-${lang}`;
      const btn = await p.evaluate(() => { const b = document.querySelector('[data-ttool="lasso"]'); return { label: b.getAttribute('aria-label'), tip: b.dataset.tip }; });
      check(`[${tag}] the tool is a pen, named in the interface language`, lang === 'en' ? /^Pen \(P\)$/.test(btn.label) : /^画笔/.test(btn.label), JSON.stringify(btn));
      await p.keyboard.press('p'); await p.waitForTimeout(150);
      check(`[${tag}] P picks the pen`, (await state(p)).tool === 'lasso');
      const a = await rectOf(p, 'A'), b0 = await rectOf(p, 'B');
      const before = await state(p);
      let mid = null;
      await drawMouse(p, loop(a), { mid: async () => { mid = await state(p); await p.shot(`${tag}-1-drawing`); } });
      check(`[${tag}] while the loop closes around A, the nib says what lifting will do`, lang === 'en' ? /^Switch to A$/.test(mid.tip) : /^改选 A$/.test(mid.tip), mid.tip);
      check(`[${tag}] and nothing is decided before the pen lifts`, mid.adopted.join() === before.adopted.join(), JSON.stringify(mid));
      await p.waitForTimeout(80); let s = await state(p);
      check(`[${tag}] lifting adopts A (B is set aside)`, s.adopted.includes(a.id) && !s.adopted.includes(b0.id), JSON.stringify(s.adopted));
      check(`[${tag}] the stroke stays on A as its mark`, s.marks.length === 1 && s.marks[0].id === a.id, JSON.stringify(s.marks));
      await p.waitForTimeout(1600); await p.mouse.click(1300, 860); await p.keyboard.press('Escape'); await p.evaluate(() => select([])); await p.mouse.move(1380, 300); await p.waitForTimeout(1400);
      s = await state(p);
      check(`[${tag}] at rest the mark is a hairline`, s.marks[0] && !s.marks[0].hot && parseFloat(s.marks[0].w) <= 1.3 && s.marks[0].o < .5, JSON.stringify(s.marks));
      await p.shot(`${tag}-2-rest`);
      const a2 = await rectOf(p, 'A'); await p.keyboard.press('v'); await p.mouse.move(a2.x + a2.w / 2, a2.y + 30); await p.waitForTimeout(500);
      s = await state(p);
      check(`[${tag}] pointing at the card brings the ink back`, s.marks[0]?.hot && parseFloat(s.marks[0].w) > 1.8, JSON.stringify(s.marks));
      await p.shot(`${tag}-3-hover`);
      // the mark follows the card
      const bb = () => p.evaluate(() => { const r = document.querySelector('.card .ink-mark').getBoundingClientRect(); return { x: r.x, y: r.y }; });
      const d0 = await bb();
      await p.mouse.move(a2.x + a2.w / 2, a2.y + 20); await p.mouse.down(); await p.mouse.move(a2.x + a2.w / 2 - 60, a2.y - 20, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(200);
      const d1 = await bb();
      check(`[${tag}] moving the card moves its mark`, Math.abs((d0.x - d1.x) - 60) < 8 && Math.abs((d0.y - d1.y) - 40) < 8, JSON.stringify([d0, d1]));
      await p.keyboard.press('ControlOrMeta+z'); await p.waitForTimeout(150); await p.keyboard.press('ControlOrMeta+z'); await p.waitForTimeout(250);
      s = await state(p);
      check(`[${tag}] Undo takes back the adoption and the mark together`, s.adopted.includes(b0.id) && !s.adopted.includes(a.id) && s.marks.length === 0, JSON.stringify(s));
      check(`[${tag}] no page errors`, !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }

    /* 2. loops that select, strokes that mean nothing, taps */
    {
      const p = await open(browser, base);
      await p.keyboard.press('p');
      const a = await rectOf(p, 'A'), b = await rectOf(p, 'B');
      await drawMouse(p, loop(union(a, b), 26)); await p.waitForTimeout(250);
      let s = await state(p);
      check('a loop around two cards selects both and nothing is adopted', s.sel.length === 2 && s.sel.includes(a.id) && s.sel.includes(b.id) && s.adopted.includes(b.id) && !s.adopted.includes(a.id) && !s.marks.length, JSON.stringify(s));
      check('two selected cards bring the selection bar', s.bar, JSON.stringify(s));
      check('no tip shows for a plain selection', !s.tip, s.tip);
      await p.shot('light-en-4-select-two');
      await p.waitForTimeout(600);
      check('the live stroke dries away after a selection', (await state(p)).live === 0);
      // an open stroke
      const sel0 = (await state(p)).sel;
      const line = []; for (let i = 0; i <= 30; i++) line.push([300 + i * 12, 200 + Math.sin(i / 4) * 16]);
      await drawMouse(p, line); await p.waitForTimeout(80);
      s = await state(p);
      check('a stroke that is not a loop changes nothing (selection kept, no adoption)', s.sel.join() === sel0.join() && s.adopted.includes(b.id), JSON.stringify(s));
      await p.waitForTimeout(600);
      check('and dries away', (await state(p)).live === 0);
      // a tap on a card selects it, a tap on the board clears
      await p.mouse.click(a.x + a.w / 2, a.y + 40); await p.waitForTimeout(150);
      check('a tap with the pen on a card selects it', (await state(p)).sel.join() === a.id);
      await p.mouse.click(1300, 260); await p.waitForTimeout(150);
      check('a tap on empty board clears the selection', (await state(p)).sel.length === 0);
      // re-circling the adopted direction redraws the mark without changing the decision
      await drawMouse(p, loop(b)); await p.waitForTimeout(100);
      s = await state(p);
      check('circling the direction already adopted keeps the decision and leaves your mark', s.adopted.includes(b.id) && s.marks.length === 1 && s.marks[0].id === b.id, JSON.stringify(s));
      // Esc mid-stroke
      const pts = loop(a); await p.mouse.move(...pts[0]); await p.mouse.down(); for (let i = 1; i < pts.length - 4; i++) await p.mouse.move(...pts[i]);
      await p.keyboard.press('Escape'); await p.mouse.up(); await p.waitForTimeout(80);
      s = await state(p);
      check('Esc while drawing drops the stroke', s.adopted.includes(b.id) && !s.adopted.includes(a.id), JSON.stringify(s));
      check('no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }

    /* 2b. while drawing: what the loop would catch is outlined; a loop round nothing just fades, with no message */
    {
      const p = await open(browser, base);
      await p.keyboard.press('p');
      const a = await rectOf(p, 'A'), b = await rectOf(p, 'B');
      const pts = loop(union(a, b), 30);
      const marks = () => p.evaluate(() => ({ near: [...document.querySelectorAll('#nodes .card.ink-near')].map(e => e.dataset.id), hit: [...document.querySelectorAll('#nodes .card.ink-hit')].map(e => e.dataset.id), sel: [...document.querySelectorAll('#nodes .card.sel')].map(e => e.dataset.id), shadow: (() => { const e = document.querySelector('#nodes .card.ink-hit,#nodes .card.ink-near'); return e ? getComputedStyle(e).boxShadow : ''; })() }));
      const cut = Math.round(pts.length * .62), snaps = {};
      await p.mouse.move(...pts[0]); await p.mouse.down();
      for (let i = 1; i < pts.length; i++) { await p.mouse.move(...pts[i], { steps: 2 }); if (i === 12) snaps.early = await marks(); if (i === cut) { await p.waitForTimeout(40); snaps.half = await marks(); await p.shot('light-en-5-curling'); } if (i === pts.length - 2) { await p.waitForTimeout(40); snaps.closed = await marks(); await p.shot('light-en-6-closed'); } }
      await p.mouse.up(); await p.waitForTimeout(80); snaps.after = await marks();
      check('at the start of a stroke nothing is outlined yet', !snaps.early.near.length && !snaps.early.hit.length, JSON.stringify(snaps.early));
      check('half way round, the cards inside get a faint outline', snaps.half.near.includes(a.id) && snaps.half.near.includes(b.id) && !snaps.half.hit.length, JSON.stringify(snaps.half));
      check('once the loop closes, they get the firm outline of what lifting will select', snaps.closed.hit.includes(a.id) && snaps.closed.hit.includes(b.id) && !snaps.closed.near.length, JSON.stringify(snaps.closed));
      check('the outline is light, thinner than a selection', /1\.5px/.test(snaps.closed.shadow), snaps.closed.shadow);
      check('after lifting, the outlines give way to the selection', !snaps.after.hit.length && !snaps.after.near.length && snaps.after.sel.length === 2, JSON.stringify(snaps.after));
      // a straight line across cards lights nothing
      const line = []; for (let i = 0; i <= 40; i++) line.push([a.x - 40 + i * (a.w + 80) / 40, a.y + a.h / 2]);
      let lit = null; await p.mouse.move(...line[0]); await p.mouse.down(); for (let i = 1; i < line.length; i++) { await p.mouse.move(...line[i]); if (i === 35) lit = await marks(); } await p.mouse.up();
      check('a straight stroke across cards outlines nothing', !lit.near.length && !lit.hit.length, JSON.stringify(lit));
      await p.waitForTimeout(400);
      // a loop round empty board: no message, the ink fades, the selection stays
      const sel0 = (await state(p)).sel;
      const toasts0 = await p.evaluate(() => document.querySelectorAll('.toast').length);
      const empty = loop({ x: 1240, y: 170, w: 120, h: 70 }, 16);
      await drawMouse(p, empty); await p.waitForTimeout(60);
      const live1 = (await state(p)).live; await p.waitForTimeout(340);
      const after = await state(p), toasts1 = await p.evaluate(() => document.querySelectorAll('.toast').length);
      check('a loop round nothing shows no message', toasts1 === toasts0, `${toasts0} → ${toasts1}`);
      check('it fades out in about 300 ms', live1 === 1 && after.live === 0, JSON.stringify({ live1, live2: after.live }));
      check('and the selection is left as it was', after.sel.join() === sel0.join() && (await marks()).sel.length === sel0.length, JSON.stringify(after.sel));
      check('no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }

    /* 3. without picking the pen: ⌥+drag on the board, and a stylus */
    {
      const p = await open(browser, base);
      const a = await rectOf(p, 'A'), b = await rectOf(p, 'B');
      check('Select is the tool', (await state(p)).tool === 'select');
      await drawMouse(p, loop(union(a, b), 44), { alt: true }); await p.waitForTimeout(150);
      let s = await state(p);
      check('⌥+drag on empty board draws: a loop selects', s.sel.length === 2 && s.tool === 'select', JSON.stringify(s));
      const camBefore = await p.evaluate(() => ({ ...cam }));
      await p.evaluate(() => select([]));
      let mid = null;
      await drawPen(p, loop(a, 40), { mid: async () => { mid = await p.evaluate(() => { const path = document.querySelector('#lasso .ink-live:not(.dry)'); return path ? path.getAttribute('d').length : 0; }); } });
      await p.waitForTimeout(100); s = await state(p);
      const camAfter = await p.evaluate(() => ({ ...cam }));
      check('a stylus on empty board draws instead of panning', mid > 200 && camAfter.x === camBefore.x && camAfter.y === camBefore.y, JSON.stringify({ mid, camBefore, camAfter }));
      check('a stylus loop around a direction adopts it', s.adopted.includes(a.id) && s.marks.length === 1, JSON.stringify(s));
      // pressure shapes the stroke: a hard press is wider than a light one
      const widths = await p.evaluate(() => { const g = { pointerType: 'pen', raw: [], len: 0 }; const mk = pr => { const g2 = { pointerType: 'pen', raw: [], len: 0 }; for (let i = 0; i < 40; i++) penPush(g2, { x: i * 6, y: 0, t: i * 8, pressure: pr }); const d = penOutline(g2.raw, PEN.size); const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const pa = document.createElementNS('http://www.w3.org/2000/svg', 'path'); pa.setAttribute('d', d); s.appendChild(pa); document.body.appendChild(s); const h = pa.getBBox().height; s.remove(); return h; }; return [mk(.15), mk(.95)]; });
      check('pen pressure sets the width (light press thinner than a hard one)', widths[1] > widths[0] * 1.5, JSON.stringify(widths));
      // a plain drag on empty board still pans
      await p.mouse.move(1300, 250); await p.mouse.down(); await p.mouse.move(1200, 260, { steps: 5 }); await p.mouse.up();
      const camPan = await p.evaluate(() => ({ ...cam }));
      check('a plain mouse drag on empty board still pans', Math.abs(camPan.x - camAfter.x - (-100)) < 2, JSON.stringify([camAfter, camPan]));
      check('no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }

    /* 4. touch: a finger in the Pen tool draws; two fingers cancel the stroke and pinch */
    {
      const p = await open(browser, base, { touch: true });
      const a = await rectOf(p, 'A'), b = await rectOf(p, 'B');
      await p.evaluate(() => setTool('lasso'));
      await drawTouch(p, loop(union(a, b), 26)); await p.waitForTimeout(200);
      let s = await state(p);
      check('a finger in the Pen tool: a loop around two cards selects them', s.sel.length === 2, JSON.stringify(s));
      await p.evaluate(() => select([]));
      const t = (type, pts2) => p.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts2.map(([x, y], id) => ({ x, y, id })) });
      const edges0 = await p.evaluate(() => board.edges.length + ':' + board.nodes.map(n => n.x + ',' + n.y).join(';'));
      const pts = loop(a);
      await t('touchStart', [pts[0]]); for (let i = 1; i < 40; i++) await t('touchMove', [pts[i]]);
      await t('touchStart', [pts[39], [pts[39][0] + 200, pts[39][1]]]); await t('touchMove', [[pts[39][0] - 20, pts[39][1]], [pts[39][0] + 240, pts[39][1]]]); await t('touchEnd', []);
      await p.waitForTimeout(600); s = await state(p);
      const edges1 = await p.evaluate(() => board.edges.length + ':' + board.nodes.map(n => n.x + ',' + n.y).join(';'));
      check('two fingers move no card and add no relation', edges0 === edges1, 'changed');
      check('a second finger drops the stroke (nothing selected or adopted, the ink dries)', s.sel.length === 0 && s.adopted.includes(b.id) && s.live === 0, JSON.stringify(s));
      // in Select, a finger on empty board pans as before
      await p.evaluate(() => setTool('select'));
      const e0 = await p.evaluate(() => { const x0 = Math.min(...board.nodes.map(n => n.x)) - 3000, r = wall.getBoundingClientRect(); cam.x = r.width / 2 - x0 * cam.s; cam.y = r.height / 2; paintCam(); return [r.width / 2, r.height / 2]; });
      const c0b = await p.evaluate(() => ({ ...cam }));
      await drawTouch(p, [e0, [e0[0] - 20, e0[1]], [e0[0] - 50, e0[1]], [e0[0] - 80, e0[1]]]); await p.waitForTimeout(100);
      const c1 = await p.evaluate(() => ({ ...cam }));
      check('in Select, a finger on empty board still pans', c1.x < c0b.x - 40, JSON.stringify([c0b, c1]));
      check('no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }

    /* 6. hover comes from a pointer that moved, and a mark keeps to its card's state */
    {
      const p = await open(browser, base);
      await p.keyboard.press('p');
      const a = await rectOf(p, 'A');
      await drawMouse(p, loop(a)); await p.waitForTimeout(200);
      await p.keyboard.press('v'); await p.evaluate(() => select([])); await p.waitForTimeout(1300);
      const markState = () => p.evaluate(() => { const m = document.querySelector('.card .ink-mark'); const c = m?.closest('.card'); return m && { card: c?.dataset.id, hot: m.classList.contains('hot'), eff: +getComputedStyle(m).opacity * +getComputedStyle(c).opacity, hoverOff: wall.classList.contains('hover-off') }; });
      let m = await markState();
      check('the mark lives inside its card', m && m.card === a.id, JSON.stringify(m));
      // the card slides under a still cursor: no hover
      { const r = await rectOf(p, 'A'); Object.assign(a, r); }
      await p.mouse.move(a.x + a.w / 2, a.y + a.h + 150); await p.waitForTimeout(200);
      await p.mouse.wheel(0, -200); await p.waitForTimeout(500);
      const under = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.card')?.dataset.id, [a.x + a.w / 2, a.y + a.h + 150]);
      m = await markState();
      check('scrolling a card under a still cursor does not light its mark', under === a.id && !m.hot && m.hoverOff, JSON.stringify({ under, m }));
      await p.mouse.move(a.x + a.w / 2 + 3, a.y + a.h + 150); await p.waitForTimeout(450);
      m = await markState();
      check('moving the pointer then lights it', m.hot && !m.hoverOff, JSON.stringify(m));
      // the contributors' hover card
      const g = await p.evaluate(() => { const e = document.querySelector('#nodes .by-group'); if (!e) return null; const r = wall.getBoundingClientRect(); let q = e.getBoundingClientRect(); cam.x += r.width * .55 - (q.left + q.width / 2); cam.y += r.height * .4 - (q.top + q.height / 2); paintCam(); q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
      if (g) {
        await p.mouse.move(g.x, g.y - 160); await p.waitForTimeout(400);
        await p.mouse.wheel(0, 160); await p.waitForTimeout(600);
        const pop = await p.evaluate(() => !!byPop.el && !byPop.el.hidden);
        const onIt = await p.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.by-group'), [g.x, g.y - 160]);
        check('the contributors hover card does not open for avatars that pan under a still cursor', onIt && !pop, JSON.stringify({ onIt, pop }));
        await p.mouse.move(g.x + 1, g.y - 159); await p.waitForTimeout(700);
        check('it opens once the pointer moves onto them', await p.evaluate(() => !!byPop.el && !byPop.el.hidden));
      } else check('found an avatar group to test the hover card on', false);
      // the mark dims and hides with its card
      await p.evaluate(() => { findOpen = true; findQuery = 'Wrist Pager'; renderNodes(); });
      await p.waitForTimeout(400); m = await markState();
      check('when search dims the card, its mark dims with it', m && m.eff < .2, JSON.stringify(m));
      await p.evaluate(() => { findOpen = false; findQuery = ''; renderNodes(); });
      await p.evaluate(() => adopt(board.nodes.find(n => n.type === 'direction' && n.letter === 'B'))); await p.waitForTimeout(300);
      check('adopting another direction takes the mark off the card that is now passed over', !(await markState()));
      await p.keyboard.press('ControlOrMeta+z'); await p.waitForTimeout(300);
      m = await markState();
      check('Undo puts the mark back with the adoption', m && m.card === a.id, JSON.stringify(m));
      // dragging the card carries the mark (scaled with the card)
      await p.evaluate(() => { const a = board.nodes.find(n => n.type === 'direction' && n.letter === 'A'); const r = wall.getBoundingClientRect(); cam.x = r.width * .45 - (a.x + nodeW(a) / 2) * cam.s; cam.y = r.height / 2 - (a.y + nodeH(a) / 2) * cam.s; paintCam(); });
      const a3 = await rectOf(p, 'A');
      await p.mouse.move(a3.x + a3.w / 2, a3.y + a3.h / 2); await p.mouse.down(); await p.mouse.move(a3.x + a3.w / 2 + 40, a3.y + a3.h / 2 + 30, { steps: 5 }); await p.waitForTimeout(150);
      const dragging = await p.evaluate(() => { const m = document.querySelector('.card .ink-mark'); return m.closest('.card').classList.contains('dragging'); });
      await p.mouse.up();
      check('while the card is dragged its mark is part of it', dragging);
      check('no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }

    /* 5. reduced motion: same meaning, no animation */
    {
      const p = await open(browser, base, { motion: 'reduce' });
      await p.keyboard.press('p');
      const a = await rectOf(p, 'A');
      await drawMouse(p, loop(a)); await p.waitForTimeout(60);
      const s = await state(p);
      check('reduced motion: the loop still adopts and leaves the mark', s.adopted.includes(a.id) && s.marks.length === 1, JSON.stringify(s));
      check('reduced motion: the live stroke is gone at once, not faded', s.live === 0, JSON.stringify(s));
      check('no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(results.join('\n')); console.log(`\n${results.length - failures}/${results.length} passed`); process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

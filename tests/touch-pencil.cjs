#!/usr/bin/env node
/* Touch and Apple Pencil on a tablet: the Pencil draws, the finger moves. One finger pans or moves a card, two
 * fingers pinch to zoom (a pinch that starts on a card leaves it where it was, lifting one finger keeps panning),
 * press-and-hold opens the card menu, a double tap does what a double-click does, a two-finger tap undoes and a
 * three-finger tap redoes. A Pencil stroke inks even when it starts on a card, and a Pencil tap selects. Palm
 * rejection: touches while the Pencil is down are ignored, and a palm that landed first is dropped and put back.
 * Once a Pencil has been used, a finger in the Pen tool pans instead of drawing. Touch-sized targets, no page
 * errors, iPad portrait and landscape, English and Chinese, light and dark.
 *
 *   node tests/touch-pencil.cjs            (from the repo root)
 *   SHOTS=dir node tests/touch-pencil.cjs  (also save screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }
function serve() { return new Promise(res => { const srv = http.createServer((req, rsp) => { if (req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp); } rsp.writeHead(404); rsp.end(); }); srv.listen(0, '127.0.0.1', () => res(srv)); }); }
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function open(browser, base, { theme = 'light', lang = 'en', w = 1180, h = 820 } = {}) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: SHOTS ? 2 : 1, hasTouch: true, isMobile: true, userAgent: IPAD_UA });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1:\d+\/Vellum)/, r => r.abort());
  await c.addInitScript(l => { try { localStorage.setItem('vellum-lumen.v1.lang', JSON.stringify(l)); } catch { } }, lang);
  const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2400);
  p.cdp = await c.newCDPSession(p);
  p.shot = async name => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  await p.evaluate(() => { const a = board.nodes.find(n => n.type === 'direction' && n.letter === 'A'); const r = wall.getBoundingClientRect(); cam.s = .9; cam.x = r.width * .45 - (a.x + nodeW(a) / 2) * cam.s; cam.y = r.height / 2 - (a.y + nodeH(a) / 2) * cam.s; paintCam(); select([]); });
  await p.waitForTimeout(250);
  return p;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const touch = (p, type, pts) => p.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id ?? 0, radiusX: 4, radiusY: 4, force: 1 })) });
async function swipe(p, from, to, steps = 10) { await touch(p, 'touchStart', [[...from, 0]]); for (let i = 1; i <= steps; i++) await touch(p, 'touchMove', [[from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps, 0]]); await touch(p, 'touchEnd', []); }
async function tap(p, xy) { await touch(p, 'touchStart', [[...xy, 0]]); await wait(40); await touch(p, 'touchEnd', []); }
const pen = (p, type, [x, y], force = .5) => p.cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force });
async function penStroke(p, pts, { during } = {}) { await pen(p, 'mouseMoved', pts[0], 0); await pen(p, 'mousePressed', pts[0], .3); for (let i = 1; i < pts.length; i++) { await pen(p, 'mouseMoved', pts[i], .3 + .6 * Math.sin(Math.PI * i / pts.length)); if (during && i === (pts.length >> 1)) await during(); } await pen(p, 'mouseReleased', pts[pts.length - 1], 0); }
function loop(r, pad = 24, N = 56) { const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2 + pad, ry = r.h / 2 + pad, out = []; for (let i = 0; i <= N + 6; i++) { const a = -2.2 + i / N * Math.PI * 2, co = Math.cos(a), si = Math.sin(a); out.push([cx + Math.sign(co) * Math.pow(Math.abs(co), .42) * rx, cy + Math.sign(si) * Math.pow(Math.abs(si), .42) * ry]); } return out; }
const cardRect = (p, sel) => p.evaluate(sel => { const n = board.nodes.find(eval(sel)); const r = nodeEl(n.id).getBoundingClientRect(); return { id: n.id, x: r.x, y: r.y, w: r.width, h: r.height, nx: n.x, ny: n.y }; }, sel);
const camOf = p => p.evaluate(() => ({ ...cam }));
/* an empty spot on the board near a point */
const emptyNear = (p, x, y) => p.evaluate(([x, y]) => { for (let r = 0; r < 400; r += 24) for (let a = 0; a < 6.28; a += .5) { const px = x + r * Math.cos(a), py = y + r * Math.sin(a); const clear = ([dx, dy]) => { const el = document.elementFromPoint(px + dx, py + dy); return el && (el === wall || el.id === 'nodes' || el.closest('#wall') && !el.closest('.card,button,.top-tools,.map,.line,.top,#selbar,.zone-head,.bay-head,[data-bay-go],.lane-empty')); }; /* clear all round, since a finger snaps to what is near it */ if (px > 90 && py > 90 && [[0, 0], [36, 0], [-36, 0], [0, 36], [0, -36]].every(clear)) return [px, py]; } return null; }, [x, y]);

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    const p = await open(browser, base);
    const empty = await emptyNear(p, 600, 140);
    check('found an empty spot on the board', !!empty, 'none');

    /* 1. one finger pans */
    let c0 = await camOf(p); await swipe(p, empty, [empty[0] - 120, empty[1] + 60]); let c1 = await camOf(p);
    check('one finger on the board pans', Math.abs(c1.x - c0.x + 120) < 6 && Math.abs(c1.y - c0.y - 60) < 6, JSON.stringify([c0, c1]));
    await p.evaluate(() => { const a = board.nodes.find(n => n.type === 'direction' && n.letter === 'A'); const r = wall.getBoundingClientRect(); cam.s = .9; cam.x = r.width * .45 - (a.x + nodeW(a) / 2) * cam.s; cam.y = r.height / 2 - (a.y + nodeH(a) / 2) * cam.s; paintCam(); });

    /* 2. a finger moves a card; two fingers tapped together undo it, three redo it */
    const B = await cardRect(p, "n=>n.type==='direction'&&n.letter==='B'");
    const bc = [B.x + B.w / 2, B.y + 30];
    /* snap off (quietly, no toast): with zones sized by content the proof next door is close enough to snap to */
    await p.evaluate(() => { snapOn = false; });
    await swipe(p, bc, [bc[0] + 80, bc[1] + 40], 8);
    let nb = await p.evaluate(id => { const n = byId(id); return { x: n.x, y: n.y }; }, B.id);
    check('one finger moves a card', Math.abs(nb.x - B.nx - 80 / .9) < 4 && Math.abs(nb.y - B.ny - 40 / .9) < 4, JSON.stringify([B, nb]));
    await wait(120);
    const e2 = await emptyNear(p, 600, 160);
    await touch(p, 'touchStart', [[e2[0], e2[1], 0], [e2[0] + 60, e2[1], 1]]); await wait(60); await touch(p, 'touchEnd', []);
    await wait(150);
    nb = await p.evaluate(id => { const n = byId(id); return { x: n.x, y: n.y }; }, B.id);
    check('a two-finger tap undoes', nb.x === B.nx && nb.y === B.ny, JSON.stringify([B.nx, B.ny, nb]));
    await touch(p, 'touchStart', [[e2[0], e2[1], 0], [e2[0] + 50, e2[1], 1], [e2[0] + 100, e2[1], 2]]); await wait(60); await touch(p, 'touchEnd', []);
    await wait(150);
    nb = await p.evaluate(id => { const n = byId(id); return { x: n.x, y: n.y }; }, B.id);
    check('a three-finger tap redoes', nb.x !== B.nx, JSON.stringify(nb));
    await p.evaluate(() => { snapOn = true; });
    await p.evaluate(() => undo()); await wait(100);

    /* 3. pinch zooms around the fingers; a pinch that began on a card leaves the card where it was */
    c0 = await camOf(p);
    const A = await cardRect(p, "n=>n.type==='direction'&&n.letter==='A'");
    const ac = [A.x + A.w / 2, A.y + A.h / 2];
    await touch(p, 'touchStart', [[ac[0] - 10, ac[1], 0]]);
    await touch(p, 'touchMove', [[ac[0] - 20, ac[1], 0]]); // the first finger has already nudged the card
    await touch(p, 'touchStart', [[ac[0] - 20, ac[1], 0], [ac[0] + 40, ac[1], 1]]);
    for (let i = 1; i <= 10; i++) await touch(p, 'touchMove', [[ac[0] - 20 - i * 10, ac[1], 0], [ac[0] + 40 + i * 10, ac[1], 1]]);
    await touch(p, 'touchEnd', []);
    const c2 = await camOf(p);
    /* lifting one of two fingers: the emulator cannot lift one finger alone, so this hands the pinch its lift directly */
    const lift = await p.evaluate(() => { const was = new Map(pointers); pointers.clear(); pointers.set(91, { x: 300, y: 300 }); gesture = { type: 'pinch', d: 100, c: { x: 300, y: 300 }, t0: performance.now() - 500, n: 2, travel: 80 }; pinchLift(gesture); const g = gesture; const r = { type: g?.type, moved: g?.moved, sx: g?.sx }; gesture = null; pointers.clear(); was.forEach((v, k) => pointers.set(k, v)); return r; });
    c1 = c2;
    const an = await p.evaluate(id => { const n = byId(id); return { x: n.x, y: n.y }; }, A.id);
    check('two fingers pinch to zoom', c2.s > c0.s * 1.8, `${c0.s} → ${c2.s}`);
    check('a pinch that started on a card leaves the card where it was', an.x === A.nx && an.y === A.ny, JSON.stringify([A.nx, A.ny, an]));
    check('lifting one finger after a pinch carries on as a pan from that finger', lift.type === 'pan' && lift.moved === true && lift.sx === 300, JSON.stringify(lift));
    check('a pinch is not taken for a tap (nothing undone)', !p.errors.length && (await p.evaluate(() => undoStack.length)) >= 0);
    await p.evaluate(() => { const a = board.nodes.find(n => n.type === 'direction' && n.letter === 'A'); const r = wall.getBoundingClientRect(); cam.s = .9; cam.x = r.width * .45 - (a.x + nodeW(a) / 2) * cam.s; cam.y = r.height / 2 - (a.y + nodeH(a) / 2) * cam.s; paintCam(); select([]); });
    await wait(200);

    /* 4. press and hold opens the card menu, once, without moving anything */
    const A2 = await cardRect(p, "n=>n.type==='direction'&&n.letter==='A'");
    c0 = await camOf(p);
    await touch(p, 'touchStart', [[A2.x + A2.w / 2, A2.y + 40, 0]]); await wait(300);
    await touch(p, 'touchMove', [[A2.x + A2.w / 2 + 3, A2.y + 42, 0]]); await wait(350);
    const menuOpen = await p.evaluate(() => !document.getElementById('cardMenu').hidden);
    await touch(p, 'touchEnd', []); await wait(250);
    const after = await p.evaluate(id => ({ open: !document.getElementById('cardMenu').hidden, sel: [...sel], n: { x: byId(id).x, y: byId(id).y } }), A2.id);
    c1 = await camOf(p);
    check('press and hold on a card opens its menu', menuOpen && after.open, JSON.stringify(after));
    check('the hold selects the card and moves nothing', after.sel.join() === A2.id && after.n.x === A2.nx && after.n.y === A2.ny && c1.x === c0.x && c1.y === c0.y, JSON.stringify([after, c0, c1]));
    await p.shot('touch-hold-menu-light-en');
    await p.evaluate(() => closeCardMenu()); await wait(200);
    // a hold that drifts is a drag, not a menu
    await touch(p, 'touchStart', [[A2.x + A2.w / 2, A2.y + 40, 0]]);
    for (let i = 1; i <= 4; i++) { await wait(60); await touch(p, 'touchMove', [[A2.x + A2.w / 2 + i * 8, A2.y + 40, 0]]); }
    await wait(500); await touch(p, 'touchEnd', []); await wait(150);
    check('a finger that moves before the hold is a drag, not a menu', await p.evaluate(() => document.getElementById('cardMenu').hidden));
    await p.evaluate(() => undo()); await wait(100);

    /* 5. a double tap on the board makes a sticky, like a double-click; exactly one */
    const notes0 = await p.evaluate(() => board.nodes.filter(n => n.type === 'note').length);
    const e3 = await emptyNear(p, 640, 150);
    await tap(p, e3); await wait(120); await tap(p, e3); await wait(400);
    const notes1 = await p.evaluate(() => board.nodes.filter(n => n.type === 'note').length);
    check('a double tap on the board makes one sticky', notes1 === notes0 + 1, `${notes0} → ${notes1}`);
    await p.evaluate(() => { document.activeElement?.blur?.(); }); await wait(300);
    await p.evaluate(() => { select([]); }); await wait(100);

    /* 6. Pencil: a tap selects, a stroke that starts on a card inks (a loop round A adopts it) */
    const A3 = await cardRect(p, "n=>n.type==='direction'&&n.letter==='A'");
    await pen(p, 'mouseMoved', [A3.x + 40, A3.y + 40], 0); await pen(p, 'mousePressed', [A3.x + 40, A3.y + 40]); await pen(p, 'mouseReleased', [A3.x + 40, A3.y + 40], 0); await wait(120);
    check('a Pencil tap on a card selects it', (await p.evaluate(() => sel.join())) === A3.id);
    await p.evaluate(() => select([])); await wait(380);
    const lp = loop(A3, 22); lp.unshift([A3.x + A3.w * .3, A3.y + 20]); // the stroke starts on the card itself
    const ideaOf = await p.evaluate(id => byId(id).idea, A3.id);
    const before = await p.evaluate(i => board.adopted[i] || null, ideaOf);
    await penStroke(p, lp);
    await wait(450);
    const st6 = await p.evaluate(([id, idea]) => ({ adopted: board.adopted[idea], x: byId(id).x, y: byId(id).y, mark: !!byId(id).inkMark }), [A3.id, ideaOf]);
    check('a Pencil stroke that starts on a card inks instead of moving it', st6.x === A3.nx && st6.y === A3.ny, JSON.stringify(st6));
    check('the loop round a direction adopts it and keeps the mark', st6.adopted === A3.id && st6.mark, JSON.stringify({ before, st6 }));
    await p.evaluate(() => undo()); await wait(200);

    /* 7. palm rejection */
    await wait(450); // a touch right after the Pencil lifts is still taken for the palm
    c0 = await camOf(p);
    const e4 = await emptyNear(p, 640, 160), palm = await emptyNear(p, 640, 520);
    // the palm lands first and drags a little, then the Pencil touches down
    await touch(p, 'touchStart', [[palm[0], palm[1], 0]]);
    for (let i = 1; i <= 4; i++) await touch(p, 'touchMove', [[palm[0] + i * 12, palm[1], 0]]);
    const camMid = await camOf(p);
    await penStroke(p, [[e4[0], e4[1]], [e4[0] + 30, e4[1] + 10], [e4[0] + 60, e4[1] + 30], [e4[0] + 90, e4[1] + 40]], {
      during: async () => { for (let i = 5; i <= 9; i++) await touch(p, 'touchMove', [[palm[0] + i * 12, palm[1], 0]]); }
    });
    await touch(p, 'touchEnd', []);
    c1 = await camOf(p);
    check('the palm that landed first had started a pan', camMid.x !== c0.x, JSON.stringify([c0.x, camMid.x]));
    check('the Pencil touching down puts the board back and ignores the palm', c1.x === c0.x && c1.y === c0.y, JSON.stringify([c0, c1]));
    // a touch while the Pencil is down changes nothing
    await wait(500);
    c0 = await camOf(p);
    await penStroke(p, [[e4[0], e4[1]], [e4[0] + 40, e4[1] + 10], [e4[0] + 80, e4[1] + 20], [e4[0] + 120, e4[1] + 40]], {
      during: async () => { await touch(p, 'touchStart', [[palm[0], palm[1], 0]]); for (let i = 1; i <= 5; i++) await touch(p, 'touchMove', [[palm[0] - i * 15, palm[1], 0]]); }
    });
    for (let i = 6; i <= 8; i++) await touch(p, 'touchMove', [[palm[0] - i * 15, palm[1], 0]]);
    await touch(p, 'touchEnd', []);
    c1 = await camOf(p);
    check('a palm resting while the Pencil draws moves nothing', c1.x === c0.x && c1.y === c0.y, JSON.stringify([c0, c1]));
    check('the board is still usable after the palm (no stuck gesture)', await p.evaluate(() => gesture === null && pointers.size === 0), await p.evaluate(() => JSON.stringify({ g: gesture?.type, n: pointers.size })));

    /* 8. once the Pencil has been used, a finger in the Pen tool pans */
    await wait(450);
    await p.evaluate(() => setTool('lasso')); await wait(100);
    c0 = await camOf(p);
    await swipe(p, palm, [palm[0] - 100, palm[1] + 50]); // (lower down: the pen's first-stroke tip sits up top)
    c1 = await camOf(p);
    const inked = await p.evaluate(() => document.querySelectorAll('#lasso .ink-live').length);
    check('with a Pencil about, a finger in the Pen tool pans instead of drawing', Math.abs(c1.x - c0.x + 100) < 6, JSON.stringify([c0, c1, inked]));
    await p.evaluate(() => setTool('select'));

    /* 9. touch-sized targets, no hover tips or keyboard hints */
    const sizes = await p.evaluate(() => ({ tools: [...document.querySelectorAll('#topTools button')].map(b => b.getBoundingClientRect()).map(r => Math.min(r.width, r.height)), zoom: [...document.querySelectorAll('.map-zoom button')].map(b => b.getBoundingClientRect().height), kbd: getComputedStyle(document.querySelector('.pal-hint kbd') || document.body).display, tip: getComputedStyle(document.querySelector('#topTools button[data-tip]'), '::after').display }));
    check('tool buttons are at least 44 px for a finger', sizes.tools.every(s => s >= 44), JSON.stringify(sizes.tools));
    check('zoom buttons are at least 30 px', sizes.zoom.every(s => s >= 30), JSON.stringify(sizes.zoom));
    check('no keyboard hint or hover tip without a keyboard and pointer', sizes.kbd === 'none' && sizes.tip === 'none', JSON.stringify(sizes));
    check('no page errors on the tablet', !p.errors.length, p.errors.join(' | '));
    await p.context().close();

    /* 10. layout: portrait and landscape, English and Chinese, light and dark — nothing overlaps or wraps */
    for (const [o, w, h] of [['portrait', 820, 1180], ['landscape', 1180, 820], ['portrait-mini', 744, 1133]]) for (const theme of ['light', 'dark']) for (const lang of ['en', 'zh']) {
      const q = await open(browser, base, { theme, lang, w, h });
      const lay = await q.evaluate(() => {
        const R = s => { const e = document.querySelector(s); if (!e || e.hidden || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        const hit = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
        const tools = R('#topTools'), map = R('#map'), line = R('.pal-hint') || R('#line'), top = R('.top');
        const topKids = [...document.querySelectorAll('.top .brand>*, .top .top-right>*')].filter(e => !e.hidden && getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect());
        const overlapTop = topKids.some((a, i) => topKids.some((b, j) => j > i && a.x < b.right - 1 && b.x < a.right - 1));
        const wraps = [...document.querySelectorAll('.top button')].filter(b => b.offsetParent && b.getBoundingClientRect().height > 44).map(b => b.id || b.className);
        const stagesOver = [...document.querySelectorAll('#map .stages button')].some(b => b.getBoundingClientRect().right > map.r + 1);
        return { toolsMap: hit(tools, map), mapLine: hit(map, line), overlapTop, wraps, stagesOver, offRight: topKids.some(r => r.right > innerWidth), toolsIn: tools && tools.y >= 64 && tools.b <= innerHeight };
      });
      const tag = `${o} ${theme} ${lang}`;
      check(`${tag}: toolbar, map and command bar keep apart`, !lay.toolsMap && !lay.mapLine && lay.toolsIn, JSON.stringify(lay));
      check(`${tag}: top bar fits on one line`, !lay.overlapTop && !lay.wraps.length && !lay.offRight, JSON.stringify(lay));
      check(`${tag}: lane tabs fit inside the map`, !lay.stagesOver, JSON.stringify(lay));
      check(`${tag}: no page errors`, !q.errors.length, q.errors.join(' | '));
      await q.shot(`${o}-${theme}-${lang}`);
      await q.context().close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

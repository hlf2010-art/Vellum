#!/usr/bin/env node
/* Wider zones, and cards that stay inside them.
 * Drives the real Vellum-Lumen.html in headless Chromium.
 *
 *   node tests/zone-width.cjs            (from the repo root)
 *   node tests/zone-width.cjs --headed   (watch it)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

async function page(browser, base, init) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
  await ctx.route(/wikipedia\.org/, r => r.abort());
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
  return p;
}
async function newBoard(p) {
  await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click();
  await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(800);
}
/* every unit inside one zone, with ZONE_IN to spare */
const insideAll = p => p.evaluate(() => visibleNodes().filter(n => n.type !== 'group').map(n => {
  const z = bayOf(n), w = nodeW(n); return { t: n.text || n.title, x: n.x, w, z, ok: n.x >= z * BAY + ZONE_IN - 1 && n.x + w <= (z + 1) * BAY - ZONE_IN + 1 };
}).filter(r => !r.ok));

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    // Z1. a board saved with 1000 px zones opens with each card still in its zone, in the same place inside it
    {
      const old = {
        id: 'oldzones', title: 'Old zones', speak: 'matters', memory: '', mcpContext: [], adopted: {}, threads: {}, pins: {}, copilot: [], log: [], proposals: [], changes: [],
        cam: { x: 0, y: 0, s: .5 }, created: 1, updated: 1,
        nodes: [
          { id: 'g1', type: 'source', title: 'Interview', text: 'x', x: 120, y: 200, status: 'ink', by: 'you', rev: 1, created: 1 },
          { id: 'e1', type: 'idea', kind: 'Claim', text: 'A judgment', x: 1080, y: 200, status: 'ink', by: 'you', rev: 1, created: 1 },
          { id: 'p1', type: 'note', text: 'Prototype note', x: 2300, y: 300, status: 'ink', by: 'you', rev: 1, created: 1 },
          { id: 's1', type: 'note', text: 'Snapshot note', x: 3500, y: 300, status: 'ink', by: 'you', rev: 1, created: 1 },
          // two stickies snapped together, hanging over Gather's left edge (as in the report)
          { id: 'a', type: 'note', text: 'Left sticky', x: -60, y: 700, status: 'ink', by: 'you', rev: 1, created: 1 },
          { id: 'b', type: 'note', text: 'Right sticky', x: 192, y: 700, status: 'ink', by: 'you', rev: 1, created: 1 },
          // a group in Explore with a card inside it
          { id: 'grp', type: 'group', title: 'Cluster', x: 1100, y: 900, gw: 600, gh: 400, status: 'ink', by: 'you', rev: 1, created: 1 },
          { id: 'in', type: 'note', text: 'In the group', x: 1150, y: 980, status: 'ink', by: 'you', rev: 1, created: 1 },
        ],
        edges: [{ id: 'r1', a: 'a', b: 'b', rel: 'related', by: 'you', via: 'snap' }],
      };
      const p = await page(browser, base, { fn: b => { try { localStorage.setItem('vellum-lumen.v1.board.' + b.id, JSON.stringify(b)); localStorage.setItem('vellum-lumen.v1.active', JSON.stringify(b.id)); } catch {} }, arg: old });
      const s = await p.evaluate(() => {
        const at = id => { const n = byId(id); return { x: n.x, y: n.y, z: bayOf(n) }; };
        return { zoneW: board.zoneW, BAY, g1: at('g1'), e1: at('e1'), p1: at('p1'), s1: at('s1'), a: at('a'), b: at('b'), grp: at('grp'), inn: at('in'),
          bonded: isBonded(board.edges.find(e => e.id === 'r1')), moves: (board.changes || []).filter(c => c.op === 'edit' || c.op === 'move').length,
          zoneLeft: document.querySelector('.bay-1').offsetLeft, zoneWidth: document.querySelector('.bay-1').offsetWidth };
      });
      check('zones are wider (1400 px) and drawn that wide', s.BAY === 1400 && s.zoneLeft === 1400 && s.zoneWidth === 1400, JSON.stringify(s));
      check('the old board is marked as moved over', s.zoneW === 1400, JSON.stringify(s));
      check('each card stays in its zone, at the same place inside it', s.g1.x === 120 && s.e1.x === 1480 && s.p1.x === 3100 && s.s1.x === 4700 && [s.g1.z, s.e1.z, s.p1.z, s.s1.z].join() === '0,1,2,3', JSON.stringify(s));
      check('the snapped stickies slide inside Gather together and stay snapped', s.a.x >= 36 && s.b.x - s.a.x === 252 && s.bonded, JSON.stringify(s));
      check('a group keeps the card inside it', s.grp.x === 1500 && s.inn.x === 1550 && s.grp.z === 1, JSON.stringify(s));
      check('moving zones is not logged as an edit', s.moves === 0, JSON.stringify(s));
      const out = await insideAll(p);
      check('no card hangs over a zone edge after the move', !out.length, JSON.stringify(out));
      await p.reload(); await p.waitForTimeout(2000);
      const again = await p.evaluate(() => ({ e1: byId('e1').x, zoneW: board.zoneW }));
      check('the move happens once (a reload does not shift cards again)', again.e1 === 1480 && again.zoneW === 1400, JSON.stringify(again));
      check('no page errors (old board)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }

    // Z2. the sample opens inside its zones too, and new boards start with wide zones
    {
      const p = await page(browser, base);
      const out = await insideAll(p);
      check('the sample board has every card inside a zone', !out.length, JSON.stringify(out));
      const sample = await p.evaluate(() => ({ zoneW: board.zoneW, s: cam.s }));
      check('the sample opens at a readable zoom', sample.zoneW === 1400 && sample.s >= .55, JSON.stringify(sample));
      await newBoard(p);
      const nb = await p.evaluate(() => { const r = document.querySelector('.bay-0 .bay-zone').getBoundingClientRect(); return { zoneW: board.zoneW, left: r.left, right: r.right, vw: innerWidth, s: cam.s }; });
      check('a new board is laid out in wide zones and shows all of Gather', nb.zoneW === 1400 && nb.left >= 0 && nb.right <= nb.vw && nb.s >= .6, JSON.stringify(nb));

      // Z3. a sticky made at Gather's left edge lands inside it
      await p.evaluate(() => { cam = { x: 300, y: 100, s: 1 }; paintCam(); });
      await p.mouse.dblclick(300 + 10, 400); await p.waitForTimeout(500);
      await p.keyboard.type('Edge sticky'); await p.keyboard.press('Escape'); await p.mouse.click(1200, 820); await p.waitForTimeout(500);
      const n1 = await p.evaluate(() => { const n = board.nodes.find(n => n.text === 'Edge sticky'); return n && { x: n.x }; });
      check('a sticky double-clicked at the zone edge lands inside the zone', n1 && n1.x >= 36, JSON.stringify(n1));

      // Z4. snapping a sticky to the left of one at the edge keeps both inside, still snapped
      await p.evaluate(() => { const n = board.nodes.find(n => n.text === 'Edge sticky'); n.x = 36; n.y = 200; node('note', { text: 'Drag me' }, { x: 500, y: 600 }); renderAll(); });
      await p.waitForTimeout(300);
      const r = await p.evaluate(() => { const t = board.nodes.find(n => n.text === 'Edge sticky'), d = board.nodes.find(n => n.text === 'Drag me'); const a = nodeEl(d.id).getBoundingClientRect(), b = nodeEl(t.id).getBoundingClientRect(); return { a: { x: a.x, y: a.y, w: a.width }, b: { x: b.x, y: b.y, w: b.width, h: b.height } }; });
      const x0 = r.a.x + r.a.w / 2, y0 = r.a.y + 14, tx = r.b.x - r.a.w / 2 - 10, ty = r.b.y + 14;
      await p.mouse.move(x0, y0); await p.mouse.down();
      for (let i = 1; i <= 20; i++) { await p.mouse.move(x0 + (tx - x0) * i / 20, y0 + (ty - y0) * i / 20); await p.waitForTimeout(14); }
      await p.mouse.up(); await p.waitForTimeout(600);
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      const z4 = await p.evaluate(() => { const t = board.nodes.find(n => n.text === 'Edge sticky'), d = board.nodes.find(n => n.text === 'Drag me'); const e = relBetween(t.id, d.id); return { t: t.x, d: d.x, bonded: !!e && isBonded(e) }; });
      check('snapping to the left of an edge card slides the pair inside the zone, still snapped', z4.bonded && z4.d >= 36 && z4.t > z4.d, JSON.stringify(z4));

      // Z5. a card dropped across the gap between two zones settles into the zone it is mostly in
      await p.evaluate(() => { node('note', { text: 'Straddler' }, { x: 300, y: 900 }); renderAll(); });
      await p.waitForTimeout(200);
      const sb = await p.evaluate(() => { const n = board.nodes.find(n => n.text === 'Straddler'); const r = nodeEl(n.id).getBoundingClientRect(); const target = toScreen(BAY - 100, 900); return { x: r.x + r.width / 2, y: r.y + 14, tx: target.x, ty: target.y + 14 }; });
      await p.mouse.move(sb.x, sb.y); await p.mouse.down();
      for (let i = 1; i <= 20; i++) { await p.mouse.move(sb.x + (sb.tx - sb.x) * i / 20, sb.y + (sb.ty - sb.y) * i / 20); await p.waitForTimeout(14); }
      await p.mouse.up(); await p.waitForTimeout(600);
      const z5 = await p.evaluate(() => { const n = board.nodes.find(n => n.text === 'Straddler'); return { x: n.x, w: nodeW(n), z: bayOf(n) }; });
      check('a card dropped over the gap between zones settles inside one', z5.x + z5.w <= (z5.z + 1) * 1400 - 36 + 1 && z5.x >= z5.z * 1400 + 36 - 1, JSON.stringify(z5));
      check('no page errors (placement)', !p.errors.length, p.errors.join(' | '));

      // Z6. the lane lock is a real button: the size of the lane icon, a clear state, a tooltip
      await p.evaluate(() => { cam = { x: 0, y: 320, s: 1 }; paintCam(); });
      const lk = await p.evaluate(() => { const b = document.querySelector('[data-bay-lock="0"]'), i = document.querySelector('.bay-0 .bay-ico'); const r = b.getBoundingClientRect(), ri = i.getBoundingClientRect(); return { w: r.width, h: r.height, iw: ri.width, tip: b.dataset.tip, icon: b.querySelector('svg').innerHTML.includes('6.9-.9'), pressed: b.getAttribute('aria-pressed') }; });
      check('the lane lock is as big as the lane icon (44 px at 100%)', lk.w >= 43 && Math.abs(lk.w - lk.iw) < 1 && lk.h === lk.w, JSON.stringify(lk));
      check('unlocked, it shows an open lock and says what locking does', lk.icon && lk.pressed === 'false' && /Lock this lane/.test(lk.tip || ''), JSON.stringify(lk));
      const lr = await p.evaluate(() => { const r = document.querySelector('[data-bay-lock="0"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-bay-lock]') ? 'lock' : document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 120) }; });
      check('nothing covers the lane lock', lr.top === 'lock', JSON.stringify(lr));
      await p.mouse.click(lr.x, lr.y); await p.waitForTimeout(300);
      const lk2 = await p.evaluate(() => { const b = document.querySelector('[data-bay-lock="0"]'); const cs = getComputedStyle(b); return { pressed: b.getAttribute('aria-pressed'), on: b.classList.contains('on'), bg: cs.backgroundColor, tip: b.dataset.tip, locked: lockedBays().includes(0) }; });
      check('locked, it fills in and says how to unlock', lk2.locked && lk2.on && lk2.pressed === 'true' && lk2.bg !== 'rgba(0, 0, 0, 0)' && /unlock/i.test(lk2.tip), JSON.stringify(lk2));
      await p.mouse.move(lr.x + 2, lr.y + 2); await p.waitForTimeout(600);
      const tipOp = await p.evaluate(() => getComputedStyle(document.querySelector('[data-bay-lock="0"]'), '::after').opacity);
      check('hovering the lock shows its tooltip', +tipOp > .9, tipOp);
      check('no page errors (lock)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
  } catch (e) { check('test ran to the end', false, String(e).split('\n').slice(0, 3).join(' ')); } finally {
    await browser.close(); srv.close();
    console.log(results.join('\n'));
    console.log(failures ? `\n${failures} check(s) failed` : `\nAll ${results.length} checks passed`);
    process.exit(failures ? 1 : 0);
  }
})();

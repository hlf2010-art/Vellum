#!/usr/bin/env node
/* Cards can be made wider or narrower by dragging a side edge; height follows the content.
 * Drives the real Vellum-Lumen.html in headless Chromium.
 *
 *   node tests/card-resize.cjs            (from the repo root)
 *   SHOTS=dir node tests/card-resize.cjs  (also saves light/dark × en/zh screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS;
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

const N = (id, type, x, y, extra = {}) => ({ id, type, x, y, status: 'ink', by: 'you', rev: 1, created: Date.now() - 36e5, ...extra });
const BOARD = {
  id: 'rsz', title: 'Resize', speak: 'matters', memory: '', mcpContext: [], adopted: {}, threads: {}, pins: {}, copilot: [], log: [], proposals: [], changes: [],
  cam: { x: 0, y: 0, s: 1 }, created: 1, updated: 1, zoneW: 1400,
  nodes: [
    // a star with a planet on its right and one under it (idea is 360 wide; seams are 12 px)
    N('star', 'idea', 1500, 160, { kind: 'Claim', text: 'Night riders read the wrist pager, not the corner toast', star: true }),
    N('right', 'note', 1872, 160, { text: 'Evidence on the right' }),
    N('below', 'source', 1500, 520, { title: 'Interview', text: 'Players never looked up at the corner.' }),
    // one card of each media-ish kind that used to have a fixed width
    N('img', 'image', 2000, 700, { title: 'Keyframe', src: '' }),
    N('lnk', 'link', 1500, 900, { title: 'GDC talk', url: 'https://example.com/talk' }),
    N('prf', 'proof', 1900, 1100, { title: 'HUD proof' }),
    // a lone note near Explore's right edge
    N('edge', 'note', 2700, 1300, { text: 'Near the edge' }),
  ],
  edges: [
    { id: 'r1', a: 'right', b: 'star', rel: 'related', by: 'you', via: 'snap' },
    { id: 'r2', a: 'below', b: 'star', rel: 'supports', by: 'you', via: 'snap' },
  ],
};

async function open(browser, base, { theme = 'light', lang = 'en' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
  await ctx.route(/127\.0\.0\.1:5963[19]/, r => r.abort());
  await ctx.route(/wikipedia\.org|example\.com/, r => r.abort());
  await ctx.addInitScript(([b, theme, lang]) => { try {
    localStorage.setItem('vellum-lumen.v1.board.' + b.id, JSON.stringify(b)); localStorage.setItem('vellum-lumen.v1.active', JSON.stringify(b.id));
    localStorage.setItem('vellum-lumen.v1.theme', JSON.stringify(theme)); localStorage.setItem('vellum-lumen.v1.lang', JSON.stringify(lang));
  } catch {} }, [BOARD, theme, lang]);
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
  // heights follow content, so seat the planet under the star once the star has been measured
  await p.evaluate(() => { const s = byId('star'), b = byId('below'); b.y = s.y + nodeH(s) + BOND_GAP; byId('img').media = Object.keys(MEDIA)[0]; renderAll(); });
  return p;
}
const view = (p, id, s = 1) => p.evaluate(([id, s]) => { const n = byId(id); cam.s = s; cam.x = 520 - n.x * s; cam.y = 200 - n.y * s; paintCam(); renderAll(); }, [id, s]);
const rect = (p, id) => p.evaluate(id => { const n = byId(id); return { x: n.x, y: n.y, w: nodeW(n), h: nodeH(n), gw: n.gw ?? null }; }, id);
const bonded = (p, eid) => p.evaluate(eid => isBonded(board.edges.find(e => e.id === eid)), eid);
async function dragEdge(p, id, side, dx) {
  await p.hover(`.card[data-id="${id}"]`); await p.waitForTimeout(120);
  const h = await p.$(`.card[data-id="${id}"] .card-resize.is-${side}`);
  const b = await h.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height - 22; // the grip, clear of the connector port
  await p.mouse.move(x, y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(x + dx * i / 8, y);
  await p.mouse.up(); await p.waitForTimeout(400);
}

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    const p = await open(browser, base);
    // R1. every card but a table and a group has edges to drag
    {
      const r = await p.evaluate(() => {
        const all = ['note', 'notepad', 'kanban', 'treemap', 'source', 'synthesis', 'list', 'idea', 'direction', 'question', 'image', 'frame', 'recording', 'audio', 'link', 'proof', 'print'];
        return { missing: all.filter(t => !RESIZABLE_TYPES.has(t)), handles: ['img', 'lnk', 'prf'].map(id => document.querySelectorAll(`.card[data-id="${id}"] .card-resize`).length) };
      });
      check('R1 every card type has resize edges (image, link and proof too)', !r.missing.length && r.handles.every(n => n === 2), JSON.stringify(r));
    }
    // R2. widening the star from its right edge carries the planet on the right; both seams hold; height follows content
    {
      await view(p, 'star');
      const before = { s: await rect(p, 'star'), r: await rect(p, 'right'), b: await rect(p, 'below') };
      await dragEdge(p, 'star', 'r', 160);
      const s = await rect(p, 'star'), r = await rect(p, 'right'), b = await rect(p, 'below');
      const grew = s.w - before.s.w;
      check('R2a dragging the right edge widens the card and keeps its left edge', grew > 120 && s.x === before.s.x && s.gw === s.w, JSON.stringify({ before: before.s, s }));
      check('R2b the planet on the right moves with the edge and stays snapped', r.x - before.r.x === grew && await bonded(p, 'r1'), JSON.stringify({ r, grew }));
      check('R2c the planet under it follows the new height and stays snapped', b.x === before.b.x && b.y === s.y + s.h + 12 && await bonded(p, 'r2'), JSON.stringify({ s, b }));
      check('R2d the card is shorter now that its text has room', s.h <= before.s.h, `${before.s.h} -> ${s.h}`);
      await p.waitForTimeout(900);
      const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('vellum-lumen.v1.board.rsz')).nodes.find(n => n.id === 'star').gw);
      check('R2e the width is saved with the board', saved === s.w, String(saved));
    }
    // R3. narrowing from the left edge keeps the right edge; the card stops at its minimum
    {
      const before = await rect(p, 'star');
      await dragEdge(p, 'star', 'l', 600);
      const s = await rect(p, 'star'), min = await p.evaluate(() => resizeBounds(byId('star'))[0]);
      check('R3 narrowing from the left stops at the minimum and keeps the right edge', s.w === min && s.x + s.w === before.x + before.w, JSON.stringify({ before, s, min }));
      check('R3b both seams still hold', await bonded(p, 'r1') && await bonded(p, 'r2'), JSON.stringify({ s, r: await rect(p, 'right'), b: await rect(p, 'below') }));
    }
    // R4. Undo puts the width back; double-click on an edge resets to the default
    {
      await p.evaluate(() => { document.activeElement?.blur?.(); });
      await p.keyboard.press('ControlOrMeta+z'); await p.waitForTimeout(300);
      const u = await rect(p, 'star');
      check('R4a Undo restores the previous width', u.w > 400, JSON.stringify(u));
      await p.hover('.card[data-id="star"]');
      const h = await p.$('.card[data-id="star"] .card-resize.is-r'); const b = await h.boundingBox();
      await p.mouse.dblclick(b.x + b.width / 2, b.y + b.height - 22); await p.waitForTimeout(400);
      const s = await rect(p, 'star'), r = await rect(p, 'right');
      check('R4b double-click resets to the default width and the planet comes back with it', s.gw === null && s.w === 360 && r.x === s.x + s.w + 12 && await bonded(p, 'r1'), JSON.stringify({ s, r }));
    }
    // R5. a proof cannot be squeezed below the width its controls need; an image scales with its card
    {
      await view(p, 'prf');
      await dragEdge(p, 'prf', 'r', -400);
      const pr = await rect(p, 'prf'), clipped = await p.evaluate(() => { const el = document.querySelector('.card[data-id="prf"]'), r = el.getBoundingClientRect();
        return Math.max(0, ...[...el.querySelectorAll('button,.pbar,a')].filter(x => x.offsetParent).map(x => x.getBoundingClientRect().right - r.right)); });
      check('R5a a proof stops at 280 px with nothing spilling out', pr.w === 280 && clipped <= 1, JSON.stringify({ pr, clipped }));
      await view(p, 'img');
      const h0 = (await rect(p, 'img')).h; await dragEdge(p, 'img', 'r', 200);
      const im = await rect(p, 'img');
      check('R5b an image gets wider and taller together', im.w > 480 && im.h > h0, JSON.stringify({ h0, im }));
    }
    // R6. a card widened past its zone's edge settles back inside the zone
    {
      await view(p, 'edge');
      await dragEdge(p, 'edge', 'r', 500);
      // with content-sized zones (zoneX) the zone grows to fit instead; either way the card ends up inside its zone
      await p.evaluate(() => { if (typeof finishZoneGlide === 'function') finishZoneGlide(); }); await p.waitForTimeout(400);
      const r = await p.evaluate(() => { const n = byId('edge'), z = bayOf(n), edge = i => typeof zoneX === 'function' ? zoneX(i) : i * BAY;
        return { x: n.x, w: nodeW(n), z, left: edge(z) + ZONE_IN, right: edge(z + 1) - ZONE_IN }; });
      check('R6 a card widened past its zone ends up inside it', r.x >= r.left - 1 && r.x + r.w <= r.right + 1, JSON.stringify(r));
    }
    check('R7 no page errors', !p.errors.length, p.errors.join(' | '));

    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      for (const theme of ['light', 'dark']) for (const lang of ['en', 'zh']) {
        const q = await open(browser, base, { theme, lang });
        await view(q, 'star', 1);
        await q.hover('.card[data-id="star"]'); await q.waitForTimeout(250);
        await q.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-1-hover.png`), clip: { x: 380, y: 100, width: 1000, height: 640 } });
        const h = await q.$('.card[data-id="star"] .card-resize.is-r'); const b = await h.boundingBox();
        const x = b.x + b.width / 2, y = b.y + b.height - 22;
        await q.mouse.move(x, y); await q.mouse.down(); for (let i = 1; i <= 8; i++) await q.mouse.move(x + 140 * i / 8, y);
        await q.waitForTimeout(200);
        await q.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-2-dragging.png`), clip: { x: 380, y: 100, width: 1000, height: 640 } });
        await q.mouse.up(); await q.waitForTimeout(400);
        await q.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-3-after.png`), clip: { x: 380, y: 100, width: 1000, height: 640 } });
        if (q.errors.length) check(`shots ${theme}/${lang} no page errors`, false, q.errors.join(' | '));
        await q.context().close();
      }
    }
  } finally { await browser.close(); srv.close(); }
  console.log(results.join('\n')); console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();

#!/usr/bin/env node
/* Right-click on empty canvas, the left toolbar without the upload button, and Search cards from the toolbar.
 *   node tests/canvas-menu.cjs            (from the repo root)
 *   SHOTS=dir node tests/canvas-menu.cjs  (also saves light/dark, en/zh screenshots) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp); }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function open(browser, base, { theme = 'light', lang = 'en' } = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, deviceScaleFactor: SHOTS ? 2 : 1, permissions: ['clipboard-read', 'clipboard-write'] });
  await c.route('http://127.0.0.1:59631/**', r => r.abort());
  await c.route(/wikipedia\.org/, r => r.abort());
  const p = await c.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
  if (lang === 'zh') { await p.evaluate(() => store.set('.lang', 'zh')); await p.reload(); await p.waitForTimeout(2200); }
  p.newBoard = async () => { await p.click('#projectBtn'); await p.waitForTimeout(300); await p.locator('#boardsPop [data-new]').click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(800); };
  // an empty spot on the wall: inside a zone, away from the starter tiles and floating chrome
  p.emptySpot = () => p.evaluate(() => {
    for (let y = 460; y < 760; y += 40) for (let x = 360; x < 1100; x += 40) {
      const el = document.elementFromPoint(x, y);
      if (el && wall.contains(el) && !el.closest('.card,button,.bs-tile,[class^="bs-"]')) return { x, y };
    }
    return null;
  });
  return p;
}
const menuState = p => p.evaluate(() => { const m = $('cardMenu'); return { open: !m.hidden, items: [...m.querySelectorAll('button')].map(b => ({ k: b.dataset.wm || b.dataset.cm || b.dataset.sm, t: b.textContent.trim(), off: b.disabled, kbd: b.querySelector('kbd')?.textContent })), rect: m.getBoundingClientRect().toJSON() }; });
const shot = async (p, name, clip) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png'), clip }); } };
const around = (pt, r) => ({ x: Math.max(0, pt.x - 120), y: Math.max(0, pt.y - 120), width: 520, height: 420 });

(async () => {
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  try {
    /* 1 · empty board, light English */
    let p = await open(browser, base);
    await p.newBoard();
    check('left toolbar has no upload button', await p.evaluate(() => !document.getElementById('uploadMediaBtn') && !document.querySelector('#topTools [data-tact="files"]')));
    const seps = await p.evaluate(() => [...document.querySelectorAll('#topTools > *')].map(e => e.classList.contains('tt-sep') ? '|' : 'b').join(''));
    check('toolbar separators still sit between groups', !/^\||\|\||\|$/.test(seps), seps);

    // Search cards on an empty board opens the palette in search mode and says there is nothing to search yet
    await p.click('#findBtn'); await p.waitForTimeout(500);
    let s = await p.evaluate(() => ({ palOpen, findOpen, active: document.activeElement?.id, vis: getComputedStyle($('line')).opacity, panel: !$('findPanel').hidden && $('findPanel').textContent.trim() }));
    check('Search cards opens the palette in search mode', s.palOpen && s.findOpen && s.active === 'findIn', JSON.stringify(s));
    check('empty board says there is nothing to search yet', /Nothing to search yet/.test(s.panel || ''), JSON.stringify(s));
    await shot(p, 'light-en-search-empty');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    check('Esc closes the search palette', await p.evaluate(() => !palOpen && !findOpen));

    // right-click empty canvas
    const pt = await p.emptySpot();
    check('found an empty spot on the canvas', !!pt);
    await p.mouse.click(pt.x, pt.y, { button: 'right' }); await p.waitForTimeout(250);
    let m = await menuState(p);
    check('right-click on empty canvas opens the canvas menu', m.open && m.items.map(i => i.k).join() === 'note,paste,files,all,fit', JSON.stringify(m.items));
    check('every canvas item shows its shortcut as a keycap', m.items.every(i => i.kbd), JSON.stringify(m.items));
    check('select all and fit are off on an empty board', m.items.filter(i => i.off).map(i => i.k).join() === 'all,fit');
    check('menu opens at the pointer', Math.abs(m.rect.left - pt.x) < 2 && Math.abs(m.rect.top - pt.y) < 2, JSON.stringify(m.rect));
    await shot(p, 'light-en-canvas-menu-empty', around(pt));

    // New sticky here: lands under the pointer, ready to write
    await p.click('[data-wm="note"]'); await p.waitForTimeout(400);
    let n = await p.evaluate(() => { const n = board.nodes[board.nodes.length - 1]; const r = nodeEl(n.id).getBoundingClientRect(); return { type: n.type, r: r.toJSON(), editing: document.activeElement?.isContentEditable || document.activeElement?.tagName }; });
    check('New sticky here makes a sticky under the pointer', n.type === 'note' && pt.x > n.r.left && pt.x < n.r.right && pt.y > n.r.top - 4 && pt.y < n.r.bottom, JSON.stringify(n));
    check('the new sticky is ready to write', n.editing === true || n.editing === 'TEXTAREA', String(n.editing));
    // right-click inside the text being written keeps the system menu
    const nativeKept = await p.evaluate(() => { const el = document.activeElement; const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }); el.dispatchEvent(ev); return !ev.defaultPrevented && $('cardMenu').hidden; });
    check('right-click in text being written keeps the system menu', nativeKept);
    await p.keyboard.type('Battery lasts a weekend'); await p.mouse.click(pt.x + 300, pt.y + 260); await p.waitForTimeout(300);

    // Paste here with copied text
    await p.evaluate(() => navigator.clipboard.writeText('Users charge it in the car'));
    const pt2 = { x: pt.x + 360, y: pt.y - 40 };
    await p.mouse.click(pt2.x, pt2.y, { button: 'right' }); await p.waitForTimeout(200);
    m = await menuState(p);
    check('with a card on the board, select all and fit are on', m.open && !m.items.some(i => i.off), JSON.stringify(m.items));
    const before = await p.evaluate(() => board.nodes.length);
    await p.click('[data-wm="paste"]'); await p.waitForTimeout(500);
    n = await p.evaluate(b => { const n = board.nodes.slice(b)[0]; if (!n) return null; const r = nodeEl(n.id).getBoundingClientRect(); return { text: n.text, title: titleOf(n), r: r.toJSON() }; }, before);
    check('Paste here pastes the clipboard text as a card', n && /charge it in the car/.test((n.text || '') + (n.title || '')), JSON.stringify(n));
    check('…at the pointer', n && Math.abs((n.r.left + n.r.right) / 2 - pt2.x) < 160 && n.r.top < pt2.y + 40 && n.r.bottom > pt2.y - 40, JSON.stringify(n && n.r));

    // copied cards come back as cards at the pointer
    await p.evaluate(() => { select([board.nodes[0].id]); });
    await p.keyboard.press('Meta+c'); await p.keyboard.press('Control+c'); await p.waitForTimeout(150);
    const pt3 = { x: pt.x + 80, y: pt.y + 200 };
    await p.mouse.click(pt3.x, pt3.y, { button: 'right' }); await p.waitForTimeout(200);
    const b3 = await p.evaluate(() => board.nodes.length);
    await p.click('[data-wm="paste"]'); await p.waitForTimeout(500);
    n = await p.evaluate(b => { const ns = board.nodes.slice(b); return ns.map(n => ({ type: n.type, text: n.text, r: nodeEl(n.id).getBoundingClientRect().toJSON() })); }, b3);
    check('Paste here brings copied cards back as cards', n.length === 1 && /weekend/.test(n[0].text || ''), JSON.stringify(n));
    check('…hanging from the pointer', n.length === 1 && Math.abs((n[0].r.left + n[0].r.right) / 2 - pt3.x) < 30 && Math.abs(n[0].r.top - pt3.y) < 60, JSON.stringify(n[0] && n[0].r));

    // Upload files here: the picker opens and the file lands at the pointer
    const pt4 = { x: pt.x + 420, y: pt.y + 160 };
    await p.mouse.click(pt4.x, pt4.y, { button: 'right' }); await p.waitForTimeout(200);
    const b4 = await p.evaluate(() => board.nodes.length);
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-wm="files"]')]);
    await chooser.setFiles({ name: 'field-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Three people said the handle was too thin.') });
    await p.waitForTimeout(900);
    n = await p.evaluate(b => board.nodes.slice(b).map(n => ({ type: n.type, title: titleOf(n), r: nodeEl(n.id)?.getBoundingClientRect().toJSON() })), b4);
    check('Upload files here adds the chosen file', n.length >= 1, JSON.stringify(n));
    check('…near the pointer', n.length >= 1 && n[0].r && n[0].r.left < pt4.x + 40 && n[0].r.right > pt4.x - 40 && n[0].r.top < pt4.y + 80 && n[0].r.bottom > pt4.y - 80, JSON.stringify(n[0]));

    // Select all, and ⌘A
    await p.evaluate(() => select([]));
    await p.mouse.click(pt.x + 600, pt.y + 300, { button: 'right' }); await p.waitForTimeout(200);
    await p.click('[data-wm="all"]'); await p.waitForTimeout(200);
    const all = await p.evaluate(() => ({ sel: sel.length, vis: visibleNodes().length }));
    check('Select all selects every card on the board', all.sel === all.vis && all.sel >= 4, JSON.stringify(all));
    await p.evaluate(() => select([])); await p.mouse.click(pt.x + 600, pt.y + 300); await p.keyboard.press('ControlOrMeta+a'); await p.waitForTimeout(200);
    check('⌘A selects every card too', await p.evaluate(() => sel.length === visibleNodes().length));

    // Fit to screen
    await p.evaluate(() => { cam = { x: -6000, y: -4000, s: 1.4 }; paintCam(); select([]); });
    await p.mouse.click(700, 500, { button: 'right' }); await p.waitForTimeout(200);
    check('menu still opens far from any card', (await menuState(p)).open);
    await p.click('[data-wm="fit"]'); await p.waitForTimeout(900);
    const onScreen = await p.evaluate(() => visibleNodes().every(n => { const r = nodeEl(n.id).getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; }));
    check('Fit to screen brings every card into view', onScreen);

    // card and selection menus are unchanged
    const cr = await p.evaluate(() => { const r = nodeEl(board.nodes[0].id).getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 }; });
    await p.mouse.click(cr.x, cr.y, { button: 'right' }); await p.waitForTimeout(200);
    m = await menuState(p);
    check('right-click on a card still opens the card menu', m.open && m.items.some(i => i.k === 'delete') && !m.items.some(i => i.k === 'note'), JSON.stringify(m.items.map(i => i.k)));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    check('Esc closes the menu', (await menuState(p)).open === false);

    // Search cards with cards on the board
    await p.click('#findBtn'); await p.waitForTimeout(400);
    await p.keyboard.type('handle'); await p.waitForTimeout(300);
    s = await p.evaluate(() => ({ count: $('findCount').textContent, items: $('findPanel').querySelectorAll('.find-item').length }));
    check('Search cards finds cards on a board that has them', s.items >= 1, JSON.stringify(s));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    check('no page errors (light, English)', !p.errors.length, p.errors.join(' | '));
    await p.context().close();

    /* 2 · screenshots and labels in the other themes and languages */
    for (const [theme, lang] of [['dark', 'en'], ['light', 'zh'], ['dark', 'zh']]) {
      p = await open(browser, base, { theme, lang });
      await p.newBoard();
      const q = await p.emptySpot();
      await p.mouse.click(q.x, q.y, { button: 'right' }); await p.waitForTimeout(250);
      m = await menuState(p);
      const want = lang === 'zh' ? ['在这里新建便签', '粘贴到这里', '上传文件到这里…', '全选', '适应屏幕'] : ['New sticky here', 'Paste here', 'Upload files here…', 'Select all', 'Fit to screen'];
      check(`${theme} ${lang}: menu labels`, want.every((w, i) => m.items[i] && m.items[i].t.startsWith(w)), JSON.stringify(m.items.map(i => i.t)));
      const fits = await p.evaluate(() => [...$('cardMenu').querySelectorAll('button')].every(b => b.scrollWidth <= b.clientWidth + 1));
      check(`${theme} ${lang}: nothing overflows in the menu`, fits);
      await shot(p, `${theme}-${lang}-canvas-menu-empty`, around(q));
      await p.keyboard.press('Escape');
      await p.click('#findBtn'); await p.waitForTimeout(400);
      if (lang === 'zh') check(`${theme} zh: empty search says so in Chinese`, /还没有可搜索的卡片/.test(await p.evaluate(() => $('findPanel').textContent)));
      await shot(p, `${theme}-${lang}-search-empty`);
      check(`no page errors (${theme}, ${lang})`, !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
  } catch (e) { check('test ran to the end', false, e.stack); }
  await browser.close(); srv.close();
  console.log(results.join('\n'));
  console.log(failures ? `\n${failures} check(s) failed` : `\nAll ${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
})();

#!/usr/bin/env node
/* Right-click on empty canvas (Upload files, Select all, Fit to screen; a sticky is a double-click), the left toolbar without the upload button, and Search cards from the toolbar.
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
    check('right-click on empty canvas opens the canvas menu', m.open && m.items.map(i => i.k).join() === 'files,all,fit', JSON.stringify(m.items));
    check('every canvas item shows its shortcut as a keycap', m.items.every(i => i.kbd), JSON.stringify(m.items));
    check('select all and fit are off on an empty board', m.items.filter(i => i.off).map(i => i.k).join() === 'all,fit');
    check('menu opens at the pointer', Math.abs(m.rect.left - pt.x) < 2 && Math.abs(m.rect.top - pt.y) < 2, JSON.stringify(m.rect));
    await shot(p, 'light-en-canvas-menu-empty', around(pt));

    check('the menu has no New sticky or Paste (double-click and ⌘V already do those)', !m.items.some(i => /sticky|paste/i.test(i.t)));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    // a sticky is a double-click
    await p.mouse.dblclick(pt.x, pt.y); await p.waitForTimeout(400);
    let n = await p.evaluate(() => { const n = board.nodes[board.nodes.length - 1]; const r = nodeEl(n.id).getBoundingClientRect(); return { type: n.type, r: r.toJSON(), editing: document.activeElement?.isContentEditable || document.activeElement?.tagName }; });
    // a sticky near a zone's edge is nudged inside the zone's margin (ZONE_IN), so it may sit a little right of the pointer
    check('double-click still makes a sticky under the pointer', n.type === 'note' && pt.x > n.r.left - 40 && pt.x < n.r.right, JSON.stringify(n));
    const nativeKept = await p.evaluate(() => { const el = document.activeElement; const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }); el.dispatchEvent(ev); return !ev.defaultPrevented && $('cardMenu').hidden; });
    check('right-click in text being written keeps the system menu', nativeKept);
    await p.keyboard.type('Battery lasts a weekend'); await p.mouse.click(pt.x + 300, pt.y + 260); await p.waitForTimeout(300);

    // with a card on the board, select all and fit are on
    const pt2 = { x: pt.x + 360, y: pt.y - 40 };
    await p.mouse.click(pt2.x, pt2.y, { button: 'right' }); await p.waitForTimeout(200);
    m = await menuState(p);
    check('with a card on the board, select all and fit are on', m.open && !m.items.some(i => i.off), JSON.stringify(m.items));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);

    // Upload: the picker opens and the file lands at the pointer
    const pt4 = { x: pt.x + 420, y: pt.y + 160 };
    await p.mouse.click(pt4.x, pt4.y, { button: 'right' }); await p.waitForTimeout(200);
    const b4 = await p.evaluate(() => board.nodes.length);
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-wm="files"]')]);
    await chooser.setFiles({ name: 'field-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Three people said the handle was too thin.') });
    await p.waitForTimeout(900);
    n = await p.evaluate(b => board.nodes.slice(b).map(n => ({ type: n.type, title: titleOf(n), r: nodeEl(n.id)?.getBoundingClientRect().toJSON() })), b4);
    check('Upload adds the chosen file', n.length >= 1, JSON.stringify(n));
    check('…near the pointer', n.length >= 1 && n[0].r && n[0].r.left < pt4.x + 40 && n[0].r.right > pt4.x - 40 && n[0].r.top < pt4.y + 80 && n[0].r.bottom > pt4.y - 80, JSON.stringify(n[0]));

    // Select all, and ⌘A
    await p.evaluate(() => select([]));
    await p.mouse.click(pt.x + 600, pt.y + 300, { button: 'right' }); await p.waitForTimeout(200);
    await p.click('[data-wm="all"]'); await p.waitForTimeout(200);
    const all = await p.evaluate(() => ({ sel: sel.length, vis: visibleNodes().length }));
    check('Select all selects every card on the board', all.sel === all.vis && all.sel >= 2, JSON.stringify(all));
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
    // ⌘K: centred, every card kind one click away, footer only when there is something to move through
    await p.evaluate(() => select([])); await p.keyboard.press('ControlOrMeta+k'); await p.waitForTimeout(450);
    let pal = await p.evaluate(() => { const r = $('line').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(innerWidth - r.right), kinds: [...document.querySelectorAll('#menu [data-pt]')].map(b => b.dataset.pt), foot: getComputedStyle(qs('#line .pal-foot')).display }; });
    check('the palette is centred in the window', Math.abs(pal.l - pal.r) <= 1, JSON.stringify(pal));
    check('the palette offers every card kind in one row of chips', ['claim', 'notepad', 'question', 'list', 'kanban', 'treemap', 'table', 'link', 'group', 'image'].every(k => pal.kinds.includes(k)), JSON.stringify(pal.kinds));
    const kb0 = await p.evaluate(() => board.nodes.filter(n => n.type === 'kanban').length);
    await p.click('#menu [data-pt="kanban"]'); await p.waitForTimeout(400);
    check('a chip makes that card and puts the palette away', await p.evaluate(k => board.nodes.filter(n => n.type === 'kanban').length === k + 1 && !palOpen, kb0));
    await p.keyboard.press('Escape'); await p.evaluate(() => select([])); await p.waitForTimeout(300);
    await p.keyboard.press('ControlOrMeta+f'); await p.waitForTimeout(400); await p.keyboard.type('qqzzx'); await p.waitForTimeout(300);
    pal = await p.evaluate(() => ({ foot: getComputedStyle(qs('#line .pal-foot')).display, arrows: qs('.find-ctrls [data-f="next"]').hidden, count: $('findCount').textContent }));
    check('no matches: no key hints, no arrows, no "0 hits" beside "No matching cards"', pal.foot === 'none' && pal.arrows && !pal.count, JSON.stringify(pal));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    check('the canvas carries no gesture hint (taught once in the welcome)', await p.evaluate(() => !qs('#line .line-hint')?.textContent));
    check('no page errors (light, English)', !p.errors.length, p.errors.join(' | '));
    await p.context().close();

    /* 2 · screenshots and labels in the other themes and languages */
    for (const [theme, lang] of [['dark', 'en'], ['light', 'zh'], ['dark', 'zh']]) {
      p = await open(browser, base, { theme, lang });
      await p.newBoard();
      const q = await p.emptySpot();
      await p.mouse.click(q.x, q.y, { button: 'right' }); await p.waitForTimeout(250);
      m = await menuState(p);
      const want = lang === 'zh' ? ['上传文件', '全选', '适应屏幕'] : ['Upload files', 'Select all', 'Fit to screen'];
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
    {
      // every search row shows why it matched, even when the words sit in a field the card doesn't show (a synthesis card's points)
      const p = await open(browser, base);
      await p.keyboard.press('ControlOrMeta+f'); await p.waitForTimeout(300); await p.keyboard.type('neon'); await p.waitForTimeout(400);
      const rows = await p.evaluate(() => [...document.querySelectorAll('.find-item')].map(e => ({ t: e.querySelector('.find-item-t').textContent, marks: e.querySelectorAll('mark').length, th: !!e.querySelector('.find-th') })));
      check('every search row highlights the matched words', rows.length > 1 && rows.every(r => r.marks > 0), JSON.stringify(rows));
      check('every search row has a thumbnail or kind icon', rows.every(r => r.th), JSON.stringify(rows));
      check('a synthesis card matched by its points shows that point', rows.some(r => /Evidence Audit/.test(r.t) && r.marks > 0), JSON.stringify(rows));
      await p.keyboard.press('Escape');
      // the welcome's primary takes focus without a ring; the ring appears once the keyboard is used
      await p.goto(base + '/Vellum-Lumen.html?welcome=1'); await p.waitForTimeout(1500); await p.evaluate(() => showWelcome()); await p.waitForTimeout(300);
      const fv = () => p.evaluate(() => ({ k: document.activeElement?.dataset?.welcome, fv: document.activeElement?.matches(':focus-visible') }));
      const a = await fv(); await p.keyboard.press('Tab'); await p.keyboard.press('Shift+Tab'); const b = await fv();
      check('welcome opens focused on Start a board with no focus ring', a.k === 'start' && !a.fv, JSON.stringify(a));
      check('the focus ring comes back once the keyboard is used', b.k === 'start' && b.fv, JSON.stringify(b));
      check('no page errors (search snippet, welcome)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    {
      // first run: a one-line welcome, then a walkthrough that shows one step at a time and points at the real thing
      const p = await open(browser, base);
      await p.goto(base + '/Vellum-Lumen.html?welcome=1'); await p.waitForTimeout(1500);
      await p.evaluate(() => { store.set('.tourDone', false); if (!dlg.open) showWelcome(); }); await p.waitForTimeout(300);
      const w = await p.evaluate(() => ({ ps: dlg.querySelectorAll('.d-body p').length, keys: !!dlg.querySelector('.wl-keys'), txt: dlg.innerText }));
      check('welcome is one sentence and two buttons, no list of gestures', w.ps === 1 && !w.keys && !/Double-click/.test(w.txt), JSON.stringify(w));
      await p.click('[data-welcome="start"]'); await p.waitForTimeout(400); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(1300);
      const step = () => p.evaluate(() => { const c = document.querySelector('.tour-card'), h = document.querySelector('.tour-hole'); const r = c?.getBoundingClientRect(); return { at: tourAt, t: document.querySelector('.tour-t')?.textContent, cards: document.querySelectorAll('.tour-card').length, inView: !!r && r.left >= 16 && r.right <= innerWidth - 16 && r.top >= 0 && r.bottom <= innerHeight, holeHit: h ? getComputedStyle(h).pointerEvents : '', skip: !!c?.querySelector('[data-tour="skip"]'), btns: [...(c?.querySelectorAll('button') || [])].map(b => b.dataset.tour).join(',') }; });
      let s = await step();
      check('creating a board starts the walkthrough on step 1, one card, inside the screen', s.at === 0 && s.cards === 1 && s.inView && /Four stages/.test(s.t), JSON.stringify(s));
      check('the spotlight never blocks the board', s.holeHit === 'none', JSON.stringify(s));
      check('Skip then Next, primary rightmost', s.btns === 'skip,next', JSON.stringify(s));
      await p.click('[data-tour="next"]'); await p.waitForTimeout(500); s = await step();
      check('step 2 asks for a double-click', s.at === 1 && /Double-click/.test(s.t), JSON.stringify(s));
      const pt = await p.evaluate(() => tourSpotPt); const before = await p.evaluate(() => board.nodes.length);
      await p.mouse.dblclick(pt.x, pt.y); await p.waitForTimeout(700); s = await step();
      check('double-clicking for real makes a sticky and moves on to step 3', s.at === 2 && await p.evaluate(n => board.nodes.length > n, before), JSON.stringify(s));
      await p.keyboard.press('Escape'); await p.mouse.click(8, 450); await p.waitForTimeout(300);
      await p.keyboard.press('ControlOrMeta+k'); await p.waitForTimeout(500);
      const away = await p.evaluate(() => ({ at: tourAt, away: $('tour').classList.contains('tour-away') }));
      check('opening ⌘K counts as step 3 and the walkthrough steps aside while the palette is open', away.at === 3 && away.away, JSON.stringify(away));
      await p.keyboard.press('Escape'); await p.waitForTimeout(500); s = await step();
      check('after the palette closes, the last step points at the crew and ends with Done', s.at === 3 && /crew/i.test(s.t) && s.btns === 'next' && !s.skip, JSON.stringify(s));
      await p.click('[data-tour="next"]'); await p.waitForTimeout(400);
      check('Done ends it for good', await p.evaluate(() => tourAt === -1 && $('tour').hidden && store.get('.tourDone')));
      await p.evaluate(() => helpDialog()); await p.waitForTimeout(200); await p.click('[data-tour-again]'); await p.waitForTimeout(600);
      check('Shortcuts can show the walkthrough again', await p.evaluate(() => tourAt === 0 && !dlg.open));
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      check('Esc skips it', await p.evaluate(() => tourAt === -1));
      check('no page errors (walkthrough)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    {
      // kanban: status colour on the column dot only (to do neutral ring, in progress blue half, done green solid), and a time on every item
      const p = await open(browser, base);
      const k = await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'kanban'); const el = document.querySelector(`[data-id="${n.id}"]`); const cols = [...el.querySelectorAll('.kb-col')]; const dot = c => getComputedStyle(c.querySelector('.kb-col-h span'), '::before'); const B = getComputedStyle(document.documentElement).getPropertyValue('--B').trim(); return { n: cols.length, ring0: dot(cols[0]).backgroundColor, img1: dot(cols[1]).backgroundImage, fill2: dot(cols[2]).backgroundColor, colBg: [getComputedStyle(cols[1]).backgroundColor, getComputedStyle(cols[0]).backgroundColor], items: el.querySelectorAll('.kb-item').length, times: el.querySelectorAll('.kb-item time.kb-at').length }; });
      check('kanban columns: to do is an empty ring, in progress a half ring, done a solid dot', k.n === 3 && /rgba\(0, 0, 0, 0\)|transparent/.test(k.ring0) && /linear-gradient/.test(k.img1) && !/rgba\(0, 0, 0, 0\)/.test(k.fill2), JSON.stringify(k));
      check('kanban columns themselves stay neutral (colour only on the dot)', k.colBg[0] === k.colBg[1], JSON.stringify(k));
      check('every kanban item shows a time', k.items > 0 && k.times === k.items, JSON.stringify(k));
      const moved = await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'kanban'); const c = n.cards.find(x => x.col === kanbanColsOf(n)[0].id); delete c.at; moveKanbanCard(n, c.id, 1); return !!c.at && Date.now() - c.at < 5000; });
      check('moving an item restamps its time', moved);
      check('no page errors (kanban)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
  } catch (e) { check('test ran to the end', false, e.stack); }
  await browser.close(); srv.close();
  console.log(results.join('\n'));
  console.log(failures ? `\n${failures} check(s) failed` : `\nAll ${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
})();

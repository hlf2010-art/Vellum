#!/usr/bin/env node
/* A new sticky can be moved before (and while) you write in it.
 * Drives the real Vellum-Lumen.html in headless Chromium with real double-clicks, drags and typing.
 *
 *   node tests/sticky-move.cjs            (from the repo root)
 *   node tests/sticky-move.cjs --headed   (watch it)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

async function open(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
  await ctx.route(/wikipedia\.org/, r => r.abort());
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
  await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.waitForTimeout(700);
  await p.evaluate(() => { cam = { x: 0, y: 0, s: 1 }; paintCam(); renderAll(); });
  p.state = () => p.evaluate(() => {
    const ed = document.querySelector('.card.note.is-editing'), a = document.activeElement;
    return {
      notes: board.nodes.filter(n => n.type === 'note').map(n => ({ id: n.id, x: n.x, y: n.y, text: n.text || '' })),
      edges: board.edges.map(e => ({ a: e.a, b: e.b, rel: e.rel || 'related', via: e.via })),
      editing: ed ? ed.dataset.id : null, empty: !!ed?.classList.contains('is-empty'),
      focusInWriting: !!(a && a.matches?.("[data-edit='text'][contenteditable='true']") && a.closest('.card.note.is-editing')),
      selection: String(getSelection()), relPick: !$('relPick')?.hidden, cards: document.querySelectorAll('#nodes .card.note').length,
    };
  });
  p.drag = async (x0, y0, x1, y1, steps = 16) => {
    await p.mouse.move(x0, y0); await p.mouse.down();
    for (let i = 1; i <= steps; i++) { await p.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.waitForTimeout(12); }
    await p.mouse.up(); await p.waitForTimeout(450);
  };
  p.rect = sel => p.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
  return p;
}

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    // S1. an empty sticky moves from anywhere, and the caret is still there afterwards
    {
      const p = await open(browser, base);
      await p.mouse.dblclick(500, 400); await p.waitForTimeout(450);
      let s = await p.state();
      check('double-click makes one empty sticky in writing mode', s.notes.length === 1 && s.editing && s.empty && s.focusInWriting, JSON.stringify(s));
      const before = s.notes[0];
      const h4 = await p.rect('.card.note h4');
      await p.drag(h4.x + h4.w / 2, h4.y + h4.h / 2, h4.x + h4.w / 2 + 260, h4.y + h4.h / 2 + 90);
      s = await p.state();
      const moved = s.notes[0];
      check('dragging from the middle of an empty sticky moves it (it used to vanish)', s.notes.length === 1 && Math.abs(moved.x - before.x - 260) <= 2 && Math.abs(moved.y - before.y - 90) <= 2, JSON.stringify({ before, s }));
      check('after the drop it is still in writing mode with the caret in it', s.editing === moved.id && s.focusInWriting, JSON.stringify(s));
      await p.keyboard.type('Battery lasts 3 nights');
      s = await p.state();
      check('typing right after the drop goes into the sticky', s.editing && !s.empty, JSON.stringify(s));
      await p.mouse.click(1300, 820); await p.waitForTimeout(400);
      s = await p.state();
      check('clicking away keeps the written sticky where it was dropped', s.notes.length === 1 && s.notes[0].text === 'Battery lasts 3 nights' && s.notes[0].x === moved.x && s.notes[0].y === moved.y && !s.editing, JSON.stringify(s));
      check('S1 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // S2. once it has words: dragging the words selects them, the edge and the grip move it
    {
      const p = await open(browser, base);
      await p.mouse.dblclick(500, 400); await p.waitForTimeout(450);
      await p.keyboard.type('Ship a refill kit');
      let s = await p.state(); const start = s.notes[0];
      const h4 = await p.rect('.card.note h4');
      await p.drag(h4.x + 2, h4.y + 12, h4.x + 90, h4.y + 12);
      s = await p.state();
      check('dragging inside the words selects text and leaves the sticky in place', s.selection.length >= 4 && s.notes[0].x === start.x && s.notes[0].y === start.y && s.focusInWriting, JSON.stringify(s));
      const grip = await p.rect('.card.note.is-editing .note-grip');
      const gripVisible = await p.evaluate(() => getComputedStyle(document.querySelector('.card.note.is-editing .note-grip')).opacity > 0.3);
      check('a writing sticky shows a grip', grip.w > 20 && gripVisible, JSON.stringify(grip));
      const keptSel = s.selection;
      await p.drag(grip.x + grip.w / 2, grip.y + grip.h / 2, grip.x + grip.w / 2 - 180, grip.y + grip.h / 2 + 60);
      s = await p.state();
      check('dragging the grip moves it and keeps writing mode and the selection', Math.abs(s.notes[0].x - start.x + 180) <= 2 && Math.abs(s.notes[0].y - start.y - 60) <= 2 && s.focusInWriting && s.selection === keptSel, JSON.stringify(s));
      const card = await p.rect('.card.note.is-editing');
      const at = s.notes[0];
      await p.drag(card.x + card.w / 2, card.y + card.h - 6, card.x + card.w / 2 + 120, card.y + card.h - 6);
      s = await p.state();
      check('dragging the bottom edge moves it too', Math.abs(s.notes[0].x - at.x - 120) <= 2 && s.focusInWriting, JSON.stringify(s));
      await p.keyboard.press('End'); await p.keyboard.type(' now');
      await p.mouse.click(1300, 820); await p.waitForTimeout(400);
      s = await p.state();
      check('the edit carries on after moving: text typed after the drop is kept', /now$/.test(s.notes[0].text), JSON.stringify(s));
      check('S2 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // S3. click away from an empty sticky: it goes; a sticky that had words never does
    {
      const p = await open(browser, base);
      await p.mouse.dblclick(500, 400); await p.waitForTimeout(450);
      await p.mouse.click(1200, 760); await p.waitForTimeout(450);
      let s = await p.state();
      check('clicking away from a still-empty sticky removes it', s.notes.length === 0 && s.cards === 0, JSON.stringify(s));
      await p.mouse.dblclick(500, 400); await p.waitForTimeout(450);
      const h4 = await p.rect('.card.note h4');
      await p.drag(h4.x + 40, h4.y + 40, h4.x + 240, h4.y + 40);
      await p.mouse.click(1200, 760); await p.waitForTimeout(450);
      s = await p.state();
      check('moved but never written in: still removed on click-away', s.notes.length === 0, JSON.stringify(s));
      const id = await p.evaluate(() => { const n = node('note', { text: 'Keep me' }, { x: 300, y: 300 }); n.status = 'ink'; renderAll(); return n.id; });
      await p.evaluate(id => startEdit(id, 'text'), id); await p.waitForTimeout(150);
      await p.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A'); await p.keyboard.press('Backspace');
      await p.mouse.click(1200, 760); await p.waitForTimeout(450);
      s = await p.state();
      check('a sticky that had words is kept even if you clear it', s.notes.some(n => n.id === id), JSON.stringify(s));
      check('S3 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // S4. a fresh sticky snaps like any card, and leaves no orphan relation if it is abandoned
    {
      const p = await open(browser, base);
      const target = await p.evaluate(() => { const n = node('note', { text: 'Users lose the cap' }, { x: 260, y: 220 }); n.status = 'ink'; renderAll(); return n.id; });
      await p.mouse.dblclick(900, 560); await p.waitForTimeout(450);
      const t = await p.rect(`[data-id="${target}"]`), c = await p.rect('.card.note.is-editing'), h4 = await p.rect('.card.note.is-editing h4');
      const dx = (t.x + t.w + 12) - c.x, dy = t.y - c.y;
      await p.mouse.move(h4.x + 30, h4.y + 30); await p.mouse.down();
      for (let i = 1; i <= 20; i++) { await p.mouse.move(h4.x + 30 + dx * i / 20, h4.y + 30 + dy * i / 20); await p.waitForTimeout(14); }
      const preview = await p.evaluate(() => !!document.querySelector('#relLayer .snap-guide.on'));
      check('dragging an empty sticky next to a card shows the snap preview', preview);
      await p.mouse.up(); await p.waitForTimeout(450);
      let s = await p.state();
      const fresh = s.notes.find(n => n.id !== target);
      check('dropping it there snaps it into a "related" relation', s.edges.length === 1 && s.edges[0].via === 'snap' && s.edges[0].rel === 'related' && [s.edges[0].a, s.edges[0].b].includes(fresh?.id), JSON.stringify(s));
      check('the type picker waits (nothing written yet), and the caret is still in the sticky', !s.relPick && s.focusInWriting && s.empty, JSON.stringify(s));
      await p.mouse.click(1300, 820); await p.waitForTimeout(450);
      s = await p.state();
      check('abandoning the snapped empty sticky removes it and its relation', s.notes.length === 1 && s.edges.length === 0, JSON.stringify(s));
      // with words, the snap offers the type picker as usual
      await p.mouse.dblclick(900, 560); await p.waitForTimeout(450);
      await p.keyboard.type('Tether the cap');
      const c2 = await p.rect('.card.note.is-editing'), g2 = await p.rect('.card.note.is-editing .note-grip');
      const dx2 = (t.x + t.w + 12) - c2.x, dy2 = t.y - c2.y;
      await p.drag(g2.x + g2.w / 2, g2.y + g2.h / 2, g2.x + g2.w / 2 + dx2, g2.y + g2.h / 2 + dy2, 20);
      s = await p.state();
      check('a sticky with words snaps and offers the relation type', s.edges.length === 1 && s.relPick && s.focusInWriting, JSON.stringify(s));
      check('S4 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
  } catch (e) { check('test run', false, e.stack || String(e)); }
  await browser.close(); srv.close();
  console.log(results.join('\n'));
  console.log(failures ? `\n${failures} check(s) failed` : `\nAll ${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
})();

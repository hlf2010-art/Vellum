#!/usr/bin/env node
/* Covering cards with a cloth: tidy the table without changing a conclusion.
 * Covered cards gather under one bundle where they lay, keep their relations (a dashed line stops at the bundle),
 * still count as evidence, peek on hover, come out one at a time or all at once, travel with the bundle, stay beside
 * the star they were snapped to, and Undo puts everything back. Drives the real Vellum-Lumen.html in headless Chromium.
 *
 *   node tests/cover-cards.cjs                 (from the repo root)
 *   node tests/cover-cards.cjs --shots DIR     (also save light/dark, English/Chinese screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const argv = process.argv, arg = k => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : null; };
const FILE = path.resolve(arg('--file') || path.resolve(__dirname, '..', 'Vellum-Lumen.html'));
const SHOTS = arg('--shots');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

async function open(browser, base, { theme = 'light', lang = 'en', scale = 1, reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale, colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1:\d+\/x\.html)/, r => r.abort());
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/x.html'); await p.waitForTimeout(1800);
  await p.evaluate(l => store.set('.lang', l), lang);
  await p.goto(base + '/x.html'); await p.waitForTimeout(2000);
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(120); }
  return p;
}
/* a small product board: a claim (the star) with snapped evidence, three process notes, a direction */
const setup = (p, zh) => p.evaluate(zh => {
  const T = (e, z) => zh ? z : e;
  persistNow(); board = blank(T('Pocket lantern', '口袋营灯')); sel = [];
  const star = node('idea', { kind: T('Claim', '论点'), text: T('A lantern that folds flat enough for a jacket pocket will win weekend hikers.', '能折到外套口袋那么薄的营灯，会赢得周末徒步的人。') }, { x: 520, y: 140 });
  renderAll();
  const ev = node('source', { kind: T('Field test', '实地测试'), weight: 'observed', title: T('6 hikers, 2 weekends', '6 位徒步者，两个周末'), text: T('5 of 6 left their current lantern at home.', '6 人里 5 人把原来的灯留在了家里。') }, { x: 520, y: 140 + nodeH(star) + 12 });
  renderAll(); makeRelation(ev.id, star.id, { via: 'snap', rel: 'supports' });
  const p1 = node('source', { kind: T('Notes', '笔记'), title: T('Hinge sketches, round 1', '铰链草图 · 第一轮'), text: T('Living hinge cracks after ~200 folds.', '活动铰链折约 200 次后开裂。') }, { x: 60, y: 120 });
  const p2 = node('source', { kind: T('Notes', '笔记'), title: T('Supplier call notes', '供应商电话记录'), text: T('Silicone tooling: 6 weeks, $4k.', '硅胶开模：6 周，4000 美元。') }, { x: 60, y: 360 });
  const p3 = node('source', { kind: T('Notes', '笔记'), title: T('Battery options (old)', '电池选项（旧）'), text: T('Pouch cell 4 mm, 1800 mAh.', '软包电芯 4 mm，1800 mAh。') }, { x: 60, y: 600 });
  const dA = node('direction', { idea: star.id, letter: 'A', title: T('Silicone accordion shade', '硅胶风琴灯罩'), text: T('Collapses to 14 mm.', '收起 14 mm。'), test: T('Fold 500 times.', '折 500 次。') }, { x: 1000, y: 120 });
  edge(star.id, dA.id); makeRelation(p2.id, dA.id, { rel: 'related' });
  renderAll(); persist(); select([]);
  focusNodes(visibleNodes(), .9);
  return { star: star.id, ev: ev.id, p1: p1.id, p2: p2.id, p3: p3.id, dA: dA.id };
}, zh);
const state = (p, ids) => p.evaluate(ids => {
  const g = id => { const n = byId(id); return n ? { x: n.x, y: n.y, hidden: !!n.hidden, cl: n.cl ? n.cl.id : null } : null; };
  const cloths = [...document.querySelectorAll('#clothLayer .cloth[data-cloth]')].map(e => ({ id: e.dataset.cloth, lbl: e.querySelector('.cl-lbl')?.textContent, left: parseFloat(e.style.left), top: parseFloat(e.style.top) }));
  return {
    p1: g(ids.p1), p2: g(ids.p2), p3: g(ids.p3), ev: g(ids.ev), star: g(ids.star), cloths,
    wires: [...document.querySelectorAll('#wires path.cloth-w')].length,
    cards: [...document.querySelectorAll('#nodes .card[data-id]')].map(e => e.dataset.id),
    toast: [...document.querySelectorAll('#toasts .toast:not(.out) span')].map(s => s.textContent).pop() || '',
    sup: groundOf(byId(ids.star))?.sup?.length ?? -1,
  };
}, ids);

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !argv.includes('--headed') });
  try {
    // C1. cover three process notes with ⇧H
    {
      const p = await open(browser, base);
      const ids = await setup(p, false);
      const before = await state(p, ids);
      await p.evaluate(i => select([i.p1, i.p2, i.p3]), ids);
      await p.keyboard.press('Shift+H'); await p.waitForTimeout(250);
      check('the cloth falls before it settles (a drape is on screen mid-way)', await p.evaluate(() => !!document.querySelector('.cloth-drape')));
      await p.waitForTimeout(600);
      let s = await state(p, ids);
      check('three cards go under one cloth', s.p1.hidden && s.p2.hidden && s.p3.hidden && s.p1.cl && s.p1.cl === s.p2.cl && s.p2.cl === s.p3.cl && s.cloths.length === 1, JSON.stringify(s));
      check('the bundle says how many, nothing else', s.cloths[0]?.lbl === '3 cards', JSON.stringify(s.cloths));
      check('the bundle sits where the cards lay', s.cloths[0] && Math.abs(s.cloths[0].left - before.p1.x) < 1 && Math.abs(s.cloths[0].top - before.p1.y) < 1, JSON.stringify([s.cloths[0], before.p1]));
      check('covered cards leave the canvas', !s.cards.includes(ids.p1) && !s.cards.includes(ids.p3));
      check('a relation to a covered card stops, dashed, at the bundle', s.wires === 1, String(s.wires));
      check('the toast says Covered 3 cards with Undo', /Covered 3 cards/.test(s.toast) && await p.evaluate(() => !!document.querySelector('#toasts .toast:not(.out) button')), s.toast);
      check('the change log says Covered', await p.evaluate(() => /Covered 3 cards/.test(board.log.map(l => l.html || l.text || '').join(' '))));
      // C2. peek
      const cl = await p.$('#clothLayer .cloth[data-cloth]');
      await cl.hover(); await p.waitForTimeout(450);
      const pk = await p.evaluate(() => { const k = document.getElementById('clothPeek'); return k && !k.hidden ? { rows: [...k.querySelectorAll('.cp-row b')].map(b => b.textContent), go: k.querySelector('.cp-go')?.textContent, lifted: !!document.querySelector('.cloth.peek') } : null; });
      check('hover lifts a corner and lists what is under it', pk && pk.lifted && pk.rows.length === 3 && pk.rows[1] === 'Supplier call notes', JSON.stringify(pk));
      check('the one action, Uncover, is the rightmost button', pk?.go === 'Uncover', JSON.stringify(pk));
      // C3. take one out
      await p.hover('#clothPeek .cp-row[data-take]:nth-child(2)'); await p.waitForTimeout(150);
      await p.click('#clothPeek .cp-row[data-take]:nth-child(2)'); await p.waitForTimeout(500);
      s = await state(p, ids);
      check('Take out brings back only that card, where it lay', !s.p2.hidden && !s.p2.cl && s.p2.x === before.p2.x && s.p2.y === before.p2.y && s.p1.hidden && s.cloths[0]?.lbl === '2 cards', JSON.stringify(s));
      check('with it out, its relation is a normal line again (no dashed line left)', s.wires === 0, String(s.wires));
      // C4. carry the bundle
      const box = await (await p.$('#clothLayer .cloth[data-cloth]')).boundingBox();
      await p.mouse.move(box.x + 60, box.y + 40); await p.mouse.down(); await p.mouse.move(box.x + 120, box.y + 140, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(400);
      s = await state(p, ids);
      const dy = s.p1.y - before.p1.y, dx = s.p1.x - before.p1.x;
      check('dragging the bundle carries what is under it (and does not uncover)', s.p1.hidden && dx > 20 && dy > 40 && Math.abs((s.cloths[0].top - before.p1.y) - dy) < 1, JSON.stringify({ dx, dy, c: s.cloths[0] }));
      // C5. click uncovers all, in place
      await p.click('#clothLayer .cloth[data-cloth]'); await p.waitForTimeout(500);
      s = await state(p, ids);
      check('a click uncovers everything under it, where the bundle took it', !s.p1.hidden && !s.p3.hidden && s.cloths.length === 0 && s.p1.x === before.p1.x + dx && s.p3.y === before.p3.y + dy, JSON.stringify(s));
      check('the toast says Uncovered', /Uncovered 2 cards/.test(s.toast), s.toast);
      // C6. Undo, step by step
      await p.keyboard.press('Meta+z'); await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
      s = await state(p, ids);
      check('Undo puts the cloth back', s.p1.hidden && s.cloths.length === 1, JSON.stringify(s));
      check('no page errors (C1–C6)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // C7. covering never changes a conclusion; a cloth beside its star follows the star
    {
      const p = await open(browser, base);
      const ids = await setup(p, false);
      const sup0 = (await state(p, ids)).sup;
      await p.evaluate(i => hideFromCanvasNodes([i.ev]), ids); await p.waitForTimeout(700);
      let s = await state(p, ids);
      check('covered evidence still counts for the claim', sup0 === 1 && s.sup === 1, JSON.stringify({ sup0, sup: s.sup }));
      check('a cloth over a card snapped to a star belongs to that star', await p.evaluate(i => byId(i.ev).cl.star === i.star, ids));
      const c0 = s.cloths[0];
      await p.evaluate(i => { const n = byId(i.star); n.x += 200; n.y += 50; renderAll(); }, ids); await p.waitForTimeout(200);
      s = await state(p, ids);
      check('move the star and its cloth moves with it', Math.abs(s.cloths[0].left - c0.left - 200) < 1 && Math.abs(s.cloths[0].top - c0.top - 50) < 1, JSON.stringify([c0, s.cloths[0]]));
      await p.evaluate(i => uncoverNodes([i.ev]), ids); await p.waitForTimeout(400);
      check('uncovered, it lands beside the star again (snapped)', await p.evaluate(i => !!seamOf(byId(i.ev), byId(i.star)), ids));
      // the crew reads covered cards it is asked about
      check('Archive is still the act that stops a card counting', await p.evaluate(i => { archiveNodes([i.ev]); renderAll(); return groundOf(byId(i.star)).sup.length === 0; }, ids));
      // the list of covered cards
      await p.evaluate(i => { restoreNodes([i.ev]); hideFromCanvasNodes([i.p1]); }, ids); await p.waitForTimeout(700);
      await p.evaluate(() => archiveDialog()); await p.waitForTimeout(300);
      const lst = await p.evaluate(() => ({ txt: dlg.innerText, find: !!dlg.querySelector('[data-cloth-find]') }));
      check('the list calls them covered, still read and counted, with Find', /Covered · still read and counted/i.test(lst.txt) && lst.find && /Uncover/.test(lst.txt), lst.txt.slice(0, 300));
      await p.click('[data-cloth-find]'); await p.waitForTimeout(900);
      check('Find closes the list and brings the bundle into view', await p.evaluate(() => { const e = document.querySelector('#clothLayer .cloth'); const r = e.getBoundingClientRect(); return !dlg.open && r.left > 0 && r.right < innerWidth && r.top > 0 && r.bottom < innerHeight; }));
      check('no page errors (C7)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // C8. reduced motion: no drape, settles at once; Chinese label and menu
    {
      const p = await open(browser, base, { lang: 'zh', reduced: true });
      const ids = await setup(p, true);
      await p.evaluate(i => select([i.p1, i.p3]), ids); await p.waitForTimeout(300); const menu = await p.evaluate(() => document.querySelector('[data-s="hide"]')?.getAttribute('data-tip'));
      check('the selection bar says 盖起来 · ⇧H', menu === '盖起来 · ⇧H', String(menu));
      await p.evaluate(i => hideFromCanvasNodes([i.p1, i.p3]), ids); await p.waitForTimeout(60);
      const s = await state(p, ids);
      check('with reduced motion it settles at once, no drape', s.p1.hidden && s.cloths.length === 1 && !(await p.evaluate(() => !!document.querySelector('.cloth-drape'))), JSON.stringify(s));
      check('Chinese bundle label', s.cloths[0]?.lbl === '2 张', JSON.stringify(s.cloths));
      check('Chinese toast', /已盖起 2 张/.test(s.toast), s.toast);
      check('no page errors (C8)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // D. a group of images stacks into a deck and spreads back
    {
      const p = await open(browser, base);
      const ids = await p.evaluate(() => {
        persistNow(); board = blank('Deck'); sel = [];
        const keys = Object.keys(MEDIA).filter(k => String(MEDIA[k]).startsWith('data:image') || /\.(jpe?g|png|webp)/i.test(k)).slice(0, 4);
        const g = node('group', { title: 'Shade generations' }, { x: 80, y: 100 }); g.gw = 760; g.gh = 860;
        const ims = keys.map((k, i) => node('image', { media: k, title: 'Shade study ' + (i + 1) }, { x: 110 + (i % 2) * 350, y: 190 + Math.floor(i / 2) * 380 }));
        const claim = node('idea', { kind: 'Claim', text: 'An accordion shade reads as friendly.' }, { x: 1000, y: 180 });
        renderAll(); makeRelation(ims[0].id, claim.id, { rel: 'supports' }); renderAll(); focusNodes(visibleNodes(), .9);
        return { g: g.id, ims: ims.map(n => n.id), claim: claim.id, n: keys.length, gw: nodeW(g), gh: nodeH(g) };
      });
      const sup0 = await p.evaluate(i => groundOf(byId(i.claim)).sup.length, ids);
      await p.hover(`[data-id="${ids.g}"] h4`); await p.waitForTimeout(200);
      check('a group offers Stack on its header', await p.evaluate(i => /Stack/.test(document.querySelector(`[data-id="${i.g}"] [data-a="grp-stack"]`)?.textContent || ''), ids));
      await p.click(`[data-id="${ids.g}"] [data-a="grp-stack"]`); await p.waitForTimeout(800);
      let s = await p.evaluate(i => ({ hid: i.ims.every(id => byId(id).hidden && byId(id).cl?.kind === 'deck'), n: document.querySelector('.cloth.deck .dk-n')?.textContent, img: !!document.querySelector('.cloth.deck .dk-top img'), w: nodeW(byId(i.g)), h: nodeH(byId(i.g)), btn: document.querySelector(`[data-id="${i.g}"] [data-a="grp-stack"]`)?.textContent, wires: document.querySelectorAll('#wires path.cloth-w').length, sup: groundOf(byId(i.claim)).sup.length, top: document.getElementById('archiveBtn')?.hidden, toast: [...document.querySelectorAll('#toasts .toast span')].map(x => x.textContent).pop() }), ids);
      check('Stack squares the cards into one deck with the first image on top and the count on the corner', ids.n >= 2 && s.hid && s.n === String(ids.n) && s.img, JSON.stringify(s));
      check('the group frame shrinks around the deck and its button says Spread out', s.w < ids.gw && s.h < ids.gh && /Spread out/.test(s.btn), JSON.stringify(s));
      check('a relation from a stacked card stops at the deck; evidence still counts', s.wires === 1 && s.sup === sup0, JSON.stringify(s));
      check('stacked cards are on the canvas as a deck, so the top bar does not count them as put away', s.top === true, String(s.top));
      check('the toast says Stacked with Undo', /Stacked \d cards/.test(s.toast), s.toast);
      await p.evaluate(i => { byId(i.g).x += 120; renderAll(); }, ids); await p.waitForTimeout(150);
      await p.click('.cloth.deck'); await p.waitForTimeout(700);
      s = await p.evaluate(i => ({ out: i.ims.every(id => !byId(id).hidden), x0: byId(i.ims[0]).x, w: nodeW(byId(i.g)), h: nodeH(byId(i.g)), deck: !!document.querySelector('.cloth.deck') }), ids);
      check('a click spreads the deck back where the cards were, moved with the group', s.out && s.x0 === 230 && !s.deck && s.w === ids.gw && s.h === ids.gh, JSON.stringify(s));
      await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
      check('Undo stacks it again', await p.evaluate(i => byId(i.ims[0]).hidden && !!byId(i.g).deck, ids));
      check('no page errors (D)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    { // R: roll up a long notepad: only the display changes; lines follow the edge; evidence and undo hold
      const p = await open(browser, base);
      const ids = await p.evaluate(() => {
        persistNow(); board = blank('Roll'); sel = [];
        const np = node('notepad', { title: 'Interview', text: Array.from({ length: 6 }, (_, i) => `Q${i + 1}: how do you pack it?\n\nIt never fits, so I strap it outside.`).join('\n\n') }, { x: 120, y: 140 });
        const star = node('idea', { kind: 'Claim', text: 'A pocket lantern wins hikers.' }, { x: 640, y: 160 });
        renderAll(); makeRelation(np.id, star.id, { rel: 'supports' }); renderAll(); select([]); focusNodes(visibleNodes(), .9);
        return { np: np.id, star: star.id };
      });
      await p.waitForTimeout(500);
      const st = () => p.evaluate(i => { const el = nodeEl(i.np); return { h: el.offsetHeight, _h: byId(i.np)._h, roll: byId(i.np).roll || 0, rolled: el.classList.contains('rolled'), sup: groundOf(byId(i.star)).sup.length, text: byId(i.np).text.length }; }, ids);
      const s0 = await st();
      check('a long notepad offers Roll up in its menu', await p.evaluate(i => fullCardMenuActs(byId(i.np)).some(a => a.k === 'roll' && /Roll up/.test(a.label)), ids));
      await p.evaluate(i => toggleRoll(byId(i.np)), ids); await p.waitForTimeout(600);
      const s1 = await st();
      check('Roll up leaves the title and first lines, and the card shrinks', s1.rolled && s1.roll === 46 && s1.h < s0.h - 100, JSON.stringify([s0, s1]));
      check('the line follows the rolled edge and evidence still counts; the text is untouched', s1._h === s1.h && s1.sup === s0.sup && s1.text === s0.text, JSON.stringify(s1));
      const bb = await (await p.$(`[data-id="${ids.np}"] [data-roll]`)).boundingBox();
      await p.mouse.move(bb.x + bb.width / 2, bb.y + 10); await p.mouse.down(); await p.mouse.move(bb.x + bb.width / 2, bb.y + 110, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(500);
      const s2 = await st();
      check('pulling the roll down opens as far as you pull and stays there', s2.rolled && s2.roll > 120 && s2.h > s1.h + 80 && s2.h < s0.h, JSON.stringify(s2));
      await p.click(`[data-id="${ids.np}"] [data-roll]`); await p.waitForTimeout(600);
      const s3 = await st();
      check('a click on the roll opens it all the way', !s3.rolled && !s3.roll && Math.abs(s3.h - s0.h) < 16, JSON.stringify(s3));
      await p.keyboard.press('Control+z'); await p.waitForTimeout(600);
      const s4 = await st();
      check('Undo rolls it back to where it was and the line follows', s4.roll === s2.roll && s4._h === s4.h && Math.abs(s4.h - s2.h) < 3, JSON.stringify(s4));
      check('no page errors (R)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    { // A: archived cards can be found again; drafts can be covered and archived
      const p = await open(browser, base);
      const ids = await p.evaluate(() => {
        persistNow(); board = blank('Archive'); sel = [];
        const a = node('note', { text: 'Hikers strap the lantern outside' }, { x: 200, y: 200 });
        const d = ['A', 'B'].map((l, i) => node('direction', { title: 'Dir ' + l, text: 'You build a tool ' + l, test: 'Show three friends', letter: l }, { x: 640 + i * 420, y: 200, status: 'sketch', by: 'strategist', pid: 'p1' }));
        renderAll(); focusNodes(visibleNodes(), .8); return { a: a.id, d: d.map(x => x.id) };
      });
      await p.waitForTimeout(400);
      await p.evaluate(i => archiveNodes([i]), ids.a); await p.waitForTimeout(150);
      const fly = await p.evaluate(() => { const g = document.querySelector('.arch-ghost'); return g ? getComputedStyle(g).transform !== 'none' : false; });
      await p.waitForTimeout(700);
      const s1 = await p.evaluate(() => ({ btn: !document.getElementById('archiveBtn').hidden, ghosts: document.querySelectorAll('.arch-ghost').length, toast: [...document.querySelectorAll('#toasts .toast span')].map(x => x.textContent).pop() }));
      check('archiving flies a copy of the card into the box in the top bar, then the copy is gone', fly && s1.btn && !s1.ghosts, JSON.stringify(s1));
      check('the toast says where it went', /in the box up top/.test(s1.toast || ''), s1.toast);
      await p.keyboard.press('Meta+f'); await p.waitForTimeout(300); await p.keyboard.type('lantern'); await p.waitForTimeout(400);
      const away = await p.evaluate(() => [...document.querySelectorAll('#findPanel [data-faway]')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      check('search finds the archived card under Put away', away.length === 1 && /Archived/.test(away[0]), JSON.stringify(away));
      await p.click('[data-faway]'); await p.waitForTimeout(600);
      check('a click puts it back where it was', await p.evaluate(i => !byId(i).archived && !!nodeEl(i) && byId(i).x === 200, ids.a));
      await p.keyboard.press('Escape');
      await p.evaluate(i => coverNodes([i]), ids.d[0]); await p.waitForTimeout(800);
      await p.evaluate(i => archiveNodes([i]), ids.d[1]); await p.waitForTimeout(600);
      check('a crew draft can be covered and archived (these did nothing before)', await p.evaluate(i => !!byId(i[0]).cl && !!byId(i[1]).archived, ids.d));
      await p.evaluate(i => { restoreNodes(i); }, ids.d); await p.waitForTimeout(600);
      check('no page errors (A)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      for (const theme of ['light', 'dark']) for (const lang of ['en', 'zh']) {
        const p = await open(browser, base, { theme, lang, scale: 2 });
        await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
        const ids = await setup(p, lang === 'zh'); await p.waitForTimeout(700);
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-0-before.png`) });
        await p.evaluate(i => select([i.p1, i.p2, i.p3]), ids); await p.keyboard.press('Shift+H'); await p.waitForTimeout(200);
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-1-falling.png`) });
        await p.waitForTimeout(700);
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-2-covered.png`) });
        await p.evaluate(() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove()));
        await p.hover('#clothLayer .cloth'); await p.waitForTimeout(450);
        await p.hover('#clothPeek .cp-row:nth-child(2)'); await p.waitForTimeout(250);
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-3-peek.png`) });
        await p.context().close();
      }
    }
  } finally { await browser.close(); srv.close(); }
  console.log(results.join('\n'));
  console.log(failures ? `\n${failures} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
})();

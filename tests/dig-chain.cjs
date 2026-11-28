#!/usr/bin/env node
/* Dig in: research chains grown from one line of a card.
 * Select words in a selected card and dig in; Scout answers in a research card hanging off those words. Words in an
 * answer can be dug again. A chain line is never evidence. The person drags a finding back (the whole research card,
 * or words selected in it): a new card with their caption and the quote lands snapped on the target, the research
 * card goes home marked "Brought back". Clicking the words folds the chain into them.
 *
 *   node tests/dig-chain.cjs                 (from the repo root)
 *   node tests/dig-chain.cjs --headed        (watch it)
 *   node tests/dig-chain.cjs --shots DIR     (also save light/dark, English/Chinese screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const argv = process.argv, arg = k => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : null; };
const FILE = path.resolve(arg('--file') || path.resolve(__dirname, '..', 'Vellum-Lumen.html'));
const SHOTS = arg('--shots');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

const TXT = {
  en: { title: 'Camping interviews, round 2', body: 'Most said warm light, around 2700K, feels best inside the tent. Two of them cook after dark and say the food looks grey.', w1: 'warm light, around 2700K',
    q1: 'Why does 2700K feel better in a tent?', a1: "In a small space warm light means less glare. But colour temperature isn't colour accuracy: the lamp's CRI decides whether food and maps look right.", w2: 'CRI',
    q2: 'Does CRI matter for camping?', a2: 'For cooking and maps, yes. Below CRI 80, reds and browns go muddy, which matches the grey food complaint. Most budget lanterns sit at 70 to 80.', w3: 'Below CRI 80, reds and browns go muddy',
    cap: "Warm isn't enough: cooking needs CRI 90+", idea: 'A lantern that cooks and reads maps well' },
  zh: { title: '露营用户访谈 · 第二轮', body: '大多数人说帐篷里暖光最舒服，大约 2700K。有两位天黑后做饭，说食物看起来灰灰的。', w1: '暖光最舒服，大约 2700K',
    q1: '为什么帐篷里 2700K 更舒服？', a1: '小空间里暖光眩光更少。但色温不等于显色：灯的 CRI 决定食物和地图的颜色看起来对不对。', w2: 'CRI',
    q2: '露营时 CRI 重要吗？', a2: '做饭和看地图时很重要。CRI 低于 80，红色和棕色会发灰，正好对上食物灰灰的那条抱怨。大部分平价营灯在 70 到 80 之间。', w3: 'CRI 低于 80，红色和棕色会发灰',
    cap: '光暖还不够，做饭得 CRI 90 以上', idea: '一盏做饭和看地图都清楚的营灯' },
};

async function open(browser, base, { theme = 'light', zh = false, scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale, colorScheme: theme });
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
  await ctx.route(/wikipedia\.org/, r => r.abort());
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/x.html'); await p.waitForTimeout(2200);
  await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700);
  await p.evaluate(([t, zh]) => { document.documentElement.dataset.theme = t; if (zh) store.set('.lang', 'zh'); cam = { x: 0, y: 0, s: 1 }; paintCam(); renderAll(); }, [theme, zh]);
  /* select words in a card with the mouse, the way a person does */
  p.selWords = async (id, sel, word) => {
    const r = await p.evaluate(([id, sel, word]) => {
      const el = document.querySelector(`[data-id="${id}"] ${sel}`); const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t;
      while ((t = tw.nextNode()) && t.data.indexOf(word) < 0); if (!t) return null;
      const i = t.data.indexOf(word), rg = document.createRange(); rg.setStart(t, i); rg.setEnd(t, i + word.length);
      return [...rg.getClientRects()].map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
    }, [id, sel, word]);
    if (!r) return false;
    await p.mouse.move(r[0].l + 1, (r[0].t + r[0].b) / 2); await p.mouse.down();
    await p.mouse.move(r.at(-1).r - 1, (r.at(-1).t + r.at(-1).b) / 2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(250);
    return true;
  };
  /* a model answer, as if Scout had written it (no model runs in tests) */
  p.answer = (id, title, text) => p.evaluate(([id, title, text]) => { const n = byId(id); n.title = title; n.text = text; delete n.digOffline; delete n.digBusy; renderAll(); }, [id, title, text]);
  p.research = () => p.evaluate(() => board.nodes.filter(n => n.type === 'research' && !n.tombstone).map(n => ({ id: n.id, title: n.title, quote: n.quote, on: n.on, depth: n.depth, fold: !!n.digFold, x: n.x, y: n.y, off: !!n.digOffline, busy: !!n.digBusy })));
  return p;
}

/* the whole flow, used by the checks and the screenshots */
async function build(p, t, { trail = false } = {}) {
  const ids = await p.evaluate(t => {
    checkpoint();
    const src = node('notepad', { title: t.title, text: t.body, weight: 'observed' }, { x: 80, y: 150 });
    const idea = node('idea', { text: t.idea }, { x: 80, y: 520 });
    cam = { x: 0, y: 0, s: .8 }; paintCam(); select([src.id]); renderAll(); return { src: src.id, idea: idea.id };
  }, t);
  await p.waitForTimeout(200);
  await p.selWords(ids.src, '.notepad-body', t.w1);
  await p.keyboard.press('Enter'); await p.waitForTimeout(1300);
  ids.r1 = (await p.research()).at(-1).id;
  await p.answer(ids.r1, t.q1, t.a1); await p.waitForTimeout(150);
  await p.selWords(ids.r1, '.rs-ans', t.w2);
  await p.click('[data-dig-bar="ask"]'); await p.keyboard.type(t.q2); await p.keyboard.press('Enter'); await p.waitForTimeout(1300);
  ids.r2 = (await p.research()).at(-1).id;
  await p.answer(ids.r2, t.q2, t.a2); await p.waitForTimeout(200);
  return ids;
}

(async () => {
  const html = fs.readFileSync(FILE);
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !argv.includes('--headed') });
  try {
    // T1. select words, dig in: a research card beside them, hanging off the words, no model = honest empty card
    {
      const p = await open(browser, base), t = TXT.en;
      const src = await p.evaluate(t => { checkpoint(); const n = node('notepad', { title: t.title, text: t.body, weight: 'observed' }, { x: 80, y: 150 }); select([n.id]); renderAll(); return n.id; }, t);
      await p.waitForTimeout(200);
      await p.selWords(src, '.notepad-body', t.w1);
      const bar = await p.evaluate(() => { const b = $('digBar'); return b && !b.hidden ? [...b.querySelectorAll('button')].map(x => x.textContent.trim()) : null; });
      check('T1 selecting words in a selected card shows the bar, primary rightmost', bar && bar.length === 2 && /Ask/.test(bar[0]) && /Dig in/.test(bar[1]), JSON.stringify(bar));
      check('T1 the card did not move while selecting', await p.evaluate(id => byId(id).x === 80 && byId(id).y === 150, src));
      await p.keyboard.press('Enter'); await p.waitForTimeout(1300);
      const rs = await p.research();
      check('T1 Enter digs: one research card, right of the source', rs.length === 1 && rs[0].on === src && rs[0].x > 80 + 380 && rs[0].quote === t.w1, JSON.stringify(rs));
      check('T1 the question names the words', /warm light, around 2700K/.test(rs[0].title), rs[0].title);
      check('T1 no model: the card says so and stays empty to fill in', rs[0].off && !rs[0].busy && await p.evaluate(id => { const a = document.querySelector(`[data-id="${id}"] .rs-ans`); return a && a.textContent === '' && /No AI connected/.test(a.dataset.ph); }, rs[0].id), JSON.stringify(rs[0]));
      const mk = await p.evaluate(id => document.querySelector(`[data-id="${id}"] .dig-mk`)?.textContent, src);
      check('T1 the words are marked in the source', mk === t.w1, mk);
      const line = await p.evaluate(() => [...document.querySelectorAll('#wires path.dig-line')].map(x => x.getAttribute('d')));
      check('T1 one chain line, starting inside the source card (at the words)', line.length === 1 && (() => { const m = /^M([\d.]+),([\d.]+)/.exec(line[0]); return m && +m[1] < 80 + 380 && +m[1] > 80 && +m[2] > 150; })(), JSON.stringify(line));
      const rel = await p.evaluate(() => board.edges.filter(e => e.kind === 'ask').map(e => ({ rel: e.rel || null, by: e.by || null })));
      check('T1 the chain line is not a relation', rel.length === 1 && !rel[0].rel && !rel[0].by, JSON.stringify(rel));
      await p.evaluate(() => undo()); await p.waitForTimeout(300);
      check('T1 undo removes the dig', (await p.research()).length === 0);
      check('T1 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // T2. dig again inside an answer, with your own question; drag words back; fold; trail
    {
      const p = await open(browser, base), t = TXT.en;
      const ids = await build(p, t);
      const rs = await p.research();
      check('T2 a second layer hangs off the first answer, further right, with your own question', rs.length === 2 && rs[1].on === ids.r1 && rs[1].depth === 2 && rs[1].title === t.q2 && rs[1].x > rs[0].x, JSON.stringify(rs));
      check('T2 the words in the first answer are marked', await p.evaluate(id => document.querySelector(`[data-id="${id}"] .rs-ans .dig-mk`)?.textContent, ids.r1) === t.w2);
      // drag selected words from layer 2 onto the idea
      await p.evaluate(id => { select([id]); renderAll(); }, ids.r2); await p.waitForTimeout(100);
      await p.selWords(ids.r2, '.rs-ans', t.w3);
      const at = await p.evaluate(() => { const r = getSelection().getRangeAt(0).getClientRects()[0]; return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
      const ib = await p.locator(`.card[data-id="${ids.idea}"]`).boundingBox();
      await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(ib.x + 120, ib.y + 40, { steps: 12 });
      const lit = await p.evaluate(id => document.querySelector(`.card[data-id="${id}"]`).classList.contains('snap-target'), ids.idea);
      check('T2 the card under the dragged words lights up', lit);
      await p.mouse.up(); await p.waitForTimeout(500);
      const caretInTitle = await p.evaluate(() => document.activeElement?.matches?.('h4[data-edit="title"]') && !!document.activeElement.closest('.card.notepad'));
      check('T2 the caret waits in the caption', caretInTitle);
      await p.keyboard.type(t.cap); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
      const f = await p.evaluate(() => { const n = board.nodes.find(n => n.dug); const e = board.edges.filter(e => e.a === n.id || e.b === n.id); return { title: n.title, text: n.text, weight: n.weight, from: n.dug.from, research: n.dug.research, e: e.map(x => ({ a: x.a, b: x.b, rel: x.rel, by: x.by, via: x.via })), bonded: e.some(x => isBonded(x)) }; });
      check('T2 a new card: your caption, the quote, labelled Reported', f.title === t.cap && /^> Below CRI 80, reds and browns go muddy\n> — Does CRI matter/.test(f.text) && f.weight === 'reported', JSON.stringify(f));
      check('T2 snapped to the idea as evidence (one relation, bonded)', f.e.length === 1 && f.e[0].b === ids.idea && f.e[0].via === 'snap' && f.e[0].by === 'you' && f.bonded, JSON.stringify(f.e));
      check('T2 it remembers the chain it came from', JSON.stringify(f.from) === JSON.stringify([ids.r1, ids.r2]) && f.research === ids.r2, JSON.stringify(f));
      const g = await p.evaluate(id => groundOf(byId(id)).sup.map(n => n.type), ids.idea);
      check('T2 only the brought-back card backs the idea, never the research cards', g.length === 1 && g[0] === 'notepad', JSON.stringify(g));
      check('T2 the research card stays and says Brought back', await p.evaluate(id => !!byId(id) && /Brought back/.test(document.querySelector(`[data-id="${id}"] .dig-kept`)?.textContent || ''), ids.r2));
      // fold: click the words in the source
      await p.evaluate(() => select([])); await p.waitForTimeout(100);
      const mk = await p.locator(`.card[data-id="${ids.src}"] .dig-mk`).boundingBox();
      await p.mouse.click(mk.x + 20, mk.y + mk.height / 2); await p.waitForTimeout(500);
      const fo = await p.evaluate(([s, a, b]) => ({ vis: visibleNodes().map(n => n.id), chip: document.querySelector(`[data-id="${s}"] .dig-chip`)?.getAttribute('aria-label'), arch: $('archiveBtn').hidden, lines: document.querySelectorAll('#wires path.dig-line').length, a: !!byId(a), b: !!byId(b) }), [ids.src, ids.r1, ids.r2]);
      check('T2 clicking the words folds the whole chain into them', !fo.vis.includes(ids.r1) && !fo.vis.includes(ids.r2) && fo.a && fo.b && fo.lines === 0, JSON.stringify(fo));
      check('T2 the folded words carry a count', fo.chip === '2 layers, 1 kept', fo.chip);
      check('T2 a folded chain is not counted as hidden cards', fo.arch === true);
      check('T2 the brought-back card stays on the board', fo.vis.includes(await p.evaluate(() => board.nodes.find(n => n.dug).id)));
      // trail popover, and Open the chain
      const tb = await p.locator('.dig-trail').boundingBox(); await p.mouse.move(tb.x + 10, tb.y + 8); await p.waitForTimeout(300);
      const tr = await p.evaluate(() => { const b = $('digTrail'); return b && !b.hidden ? [...b.querySelectorAll('li')].map(l => l.firstChild.textContent.trim()) : null; });
      check('T2 hovering the trail shows how you got here', tr && tr.length === 4 && tr[0] === '“' + t.w1 + '”' && tr[1] === t.q1 && tr[2] === t.q2 && tr[3] === t.cap, JSON.stringify(tr));
      if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); }
      if (await p.evaluate(() => !$('digTrail')?.hidden)) await p.click('#digTrail [data-dig-open]'); await p.waitForTimeout(500);
      const re = await p.evaluate(([a, b]) => { const v = visibleNodes().map(n => n.id); return v.includes(a) && v.includes(b) && sel[0] === b; }, [ids.r1, ids.r2]);
      check('T2 Open the chain unfolds it and selects the card it came from', re);
      check('T2 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // T3. drag the whole research card onto a card: a new card lands there, the research card goes home
    {
      const p = await open(browser, base), t = TXT.en;
      const ids = await build(p, t);
      const home = await p.evaluate(id => ({ x: byId(id).x, y: byId(id).y }), ids.r1);
      const rb = await p.locator(`.card[data-id="${ids.r1}"] .card-k`).boundingBox();
      const ib = await p.evaluate(id => { const n = byId(id); return { x: n.x, y: n.y, h: nodeH(n) }; }, ids.idea);
      const snaps = await p.evaluate(id => snapPoolFor([id]).some(n => n.type === 'research'), ids.r1);
      check('T3 a research card never snaps onto another research card', !snaps);
      /* aim the card's top-left at the seam under the idea */
      const sc = await p.evaluate(() => cam.s), dx = (ib.x - home.x) * sc, dy = (ib.y + ib.h + 14 - home.y) * sc;
      await p.mouse.move(rb.x + 20, rb.y + 6); await p.mouse.down();
      await p.mouse.move(rb.x + 20 + dx / 2, rb.y + 6 + dy / 2, { steps: 8 }); await p.mouse.move(rb.x + 20 + dx, rb.y + 6 + dy, { steps: 8 }); await p.waitForTimeout(100);
      await p.mouse.up(); await p.waitForTimeout(700);
      const r = await p.evaluate(([id, idea]) => { const n = byId(id), f = board.nodes.find(m => m.dug); return { x: n.x, y: n.y, f: f && { text: f.text, research: f.dug.research, rel: board.edges.filter(e => (e.a === f.id && e.b === idea) || (e.b === f.id && e.a === idea)).length } }; }, [ids.r1, ids.idea]);
      check('T3 the research card went home', r.x === home.x && r.y === home.y, JSON.stringify({ r, home }));
      check('T3 a new card holds the whole answer, related to the idea', r.f && r.f.research === ids.r1 && r.f.text.startsWith('> ' + t.a1.slice(0, 30)) && r.f.rel === 1, JSON.stringify(r.f));
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      await p.evaluate(() => { document.activeElement?.blur?.(); }); await p.waitForTimeout(150);
      await p.evaluate(() => undo()); await p.waitForTimeout(300);
      check('T3 one undo takes the brought-back card away', await p.evaluate(() => !board.nodes.some(n => n.dug && !n.tombstone)));
      check('T3 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // T4. Chinese
    {
      const p = await open(browser, base, { zh: true }), t = TXT.zh;
      const ids = await build(p, t);
      await p.evaluate(id => { select([ids => ids]); select([id]); renderAll(); }, ids.r2); await p.waitForTimeout(100);
      await p.selWords(ids.r2, '.rs-ans', t.w3);
      const bar = await p.evaluate(() => [...$('digBar').querySelectorAll('button')].map(x => x.textContent.trim()));
      check('T4 Chinese bar', bar[0] === '问一句…' && /深挖/.test(bar[1]), JSON.stringify(bar));
      const eb = await p.evaluate(id => document.querySelector(`[data-id="${id}"] .eb`)?.textContent, ids.r2);
      check('T4 Chinese eyebrow', eb === '调研', eb);
      check('T4 Chinese question kept as typed', (await p.research())[1].title === t.q2);
      check('T4 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // screenshots: the open chain, words dragged back with the trail, the folded chain
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      for (const theme of ['light', 'dark']) for (const lang of ['en', 'zh']) {
        const p = await open(browser, base, { theme, zh: lang === 'zh', scale: 2 }), t = TXT[lang];
        const ids = await build(p, t);
        await p.evaluate(id => { getSelection().removeAllRanges(); select([id]); renderAll(); }, ids.r2); await p.waitForTimeout(100);
        await p.selWords(ids.r2, '.rs-ans', t.w3);
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-1-chain.png`) });
        await p.keyboard.press('Escape'); await p.evaluate(id => { getSelection().removeAllRanges(); select([id]); renderAll(); }, ids.r2); await p.waitForTimeout(100);
        await p.selWords(ids.r2, '.rs-ans', t.w3);
        const at = await p.evaluate(() => { const r = getSelection().getRangeAt(0).getClientRects()[0]; return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
        const ib = await p.locator(`.card[data-id="${ids.src}"]`).boundingBox();
        await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(ib.x + 160, ib.y + 70, { steps: 10 });
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-2-drag-words.png`) });
        await p.mouse.up(); await p.waitForTimeout(500); await p.keyboard.type(t.cap); await p.waitForTimeout(150);
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-3-caption.png`) });
        await p.keyboard.press('Enter'); await p.waitForTimeout(200);
        await p.evaluate(() => { select([]); closeRelPick(); }); await p.waitForTimeout(300);
        const mk = await p.locator(`.card[data-id="${ids.src}"] .dig-mk`).boundingBox(); await p.mouse.click(mk.x + 12, mk.y + mk.height / 2); await p.waitForTimeout(500);
        const tb = await p.locator('.dig-trail').boundingBox(); await p.mouse.move(tb.x + 10, tb.y + 8); await p.waitForTimeout(350);
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-4-folded-trail.png`) });
        const of = await p.evaluate(() => [...document.querySelectorAll('.card .foot,.card .dig-trail,#digTrail,#digBar')].filter(el => el.offsetParent || el.id === 'digTrail').filter(el => { const c = el.closest('.card'); if (!c) return false; const a = el.getBoundingClientRect(), b = c.getBoundingClientRect(); return a.right > b.right + 1 || a.left < b.left - 1; }).length);
        check(`shots ${theme}/${lang}: card feet stay inside their cards`, of === 0, of);
        check(`shots ${theme}/${lang}: no page errors`, !p.errors.length, p.errors.join(' | '));
        await p.context().close();
      }
    }
  } finally { await browser.close(); srv.close(); }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})();

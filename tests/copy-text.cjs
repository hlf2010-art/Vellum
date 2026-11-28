#!/usr/bin/env node
/* Copy text from cards.
 * A press in the words of a selected card selects them (drafts too, which used to refuse), and ⌘C copies them.
 * The first press on a card still moves it. Right-click > Copy text copies everything the card says, including what
 * the card face cuts off; with several cards selected it copies all of them. ⌘C on a selected card pastes as the card
 * inside Vellum and as its full text anywhere else.
 *
 *   node tests/copy-text.cjs                 (from the repo root)
 *   node tests/copy-text.cjs --headed        (watch it)
 *   node tests/copy-text.cjs --shots DIR     (also save light/dark, English/Chinese screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const argv = process.argv, arg = k => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : null; };
const FILE = path.resolve(arg('--file') || path.resolve(__dirname, '..', 'Vellum-Lumen.html'));
const SHOTS = arg('--shots');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

const TXT = {
  en: { title: 'Night cooking at camp', words: 'food looks grey under cold light',
    body: 'Two of the eight campers cook after dark, and both said the food looks grey under cold light. They swap to a phone torch to check whether the meat is done. Warm lanterns help the mood but not the colour: what decides it is CRI, and most budget lanterns sit between 70 and 80. Below 80, reds and browns go muddy. The campers who own a CRI 90 lamp never mentioned grey food. The last line, which the card face cuts off: test the lamp on raw meat before buying.' },
  zh: { title: '露营时的夜间做饭', words: '冷光下食物看起来灰灰的',
    body: '八位露营者里有两位天黑后做饭，都说冷光下食物看起来灰灰的。他们会换成手机电筒看肉熟没熟。暖光营灯改善气氛，但改善不了颜色：决定颜色的是显色指数 CRI，大部分平价营灯在 70 到 80 之间。低于 80，红色和棕色会发灰。家里有 CRI 90 营灯的人从没提过食物发灰。卡面切掉的最后一句：买之前拿生肉试一下灯。' },
};

async function open(browser, base, { theme = 'light', zh = false, scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale, colorScheme: theme, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/x.html'); await p.waitForTimeout(2200);
  await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700);
  await p.evaluate(([t, zh]) => { document.documentElement.dataset.theme = t; if (zh) store.set('.lang', 'zh'); cam = { x: 0, y: 0, s: 1 }; paintCam(); renderAll(); }, [theme, zh]);
  p.clip = () => p.evaluate(() => navigator.clipboard.readText());
  p.setClip = v => p.evaluate(v => navigator.clipboard.writeText(v), v);
  p.rect = (id, sel = '') => p.evaluate(([id, sel]) => { const r = document.querySelector(`[data-id="${id}"] ${sel}`).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }, [id, sel]);
  p.wordRects = (id, sel, word) => p.evaluate(([id, sel, word]) => {
    const el = document.querySelector(`[data-id="${id}"] ${sel}`); const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t;
    while ((t = tw.nextNode()) && t.data.indexOf(word) < 0); if (!t) return null;
    const i = t.data.indexOf(word), rg = document.createRange(); rg.setStart(t, i); rg.setEnd(t, i + word.length);
    return [...rg.getClientRects()].map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
  }, [id, sel, word]);
  p.dragOver = async (r) => {
    await p.mouse.move(r[0].l + 1, (r[0].t + r[0].b) / 2); await p.mouse.down();
    await p.mouse.move(r.at(-1).r - 1, (r.at(-1).t + r.at(-1).b) / 2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(250);
  };
  return p;
}
/* a long suggestion from Scout, the kind in Mars's screenshot */
const draft = (p, t, at = { x: 120, y: 140 }) => p.evaluate(([t, at]) => { checkpoint(); const n = node('notepad', { title: t.title, text: t.body, by: 'scout', status: 'sketch' }, at); n.w = 380; renderAll(); return n.id; }, [t, at]);

(async () => {
  const html = fs.readFileSync(FILE);
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !argv.includes('--headed') });
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  try {
    // T1. the first press on a card moves it, and selects no words
    {
      const p = await open(browser, base), t = TXT.en;
      const id = await draft(p, t);
      const r = await p.wordRects(id, '.notepad-body', t.words);
      await p.dragOver(r);
      const moved = await p.evaluate(id => byId(id).x !== 120 || byId(id).y !== 140, id);
      const words = await p.evaluate(() => getSelection().toString());
      check('T1 dragging an unselected card moves it', moved);
      check('T1 and selects no words', !words, words);
      check('T1 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // T2. a Scout draft, selected: drag over its words selects them, the card stays, ⌘C copies just those words
    {
      const p = await open(browser, base), t = TXT.en;
      const id = await draft(p, t);
      await p.evaluate(id => select([id]), id); await p.waitForTimeout(150);
      const cur = await p.evaluate(id => getComputedStyle(document.querySelector(`[data-id="${id}"] .notepad-body`)).cursor, id);
      check('T2 the words of a selected draft show a text cursor', cur === 'text', cur);
      const r = await p.wordRects(id, '.notepad-body', t.words);
      await p.dragOver(r);
      const words = await p.evaluate(() => getSelection().toString());
      check('T2 dragging over the words of a selected draft selects them', words === t.words, JSON.stringify(words));
      check('T2 the card did not move', await p.evaluate(id => byId(id).x === 120 && byId(id).y === 140, id));
      check('T2 a draft gets no Dig in bar (drafts can be dismissed)', await p.evaluate(() => !$('digBar') || $('digBar').hidden));
      await p.setClip('');
      await p.keyboard.press(`${mod}+c`); await p.waitForTimeout(200);
      check('T2 ⌘C copies the selected words', await p.clip() === t.words, await p.clip());
      check('T2 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // T3. right-click > Copy text copies the whole card, including the part the face cuts off
    {
      const p = await open(browser, base), t = TXT.en;
      const id = await draft(p, t);
      const r = await p.rect(id, '.notepad-body');
      await p.mouse.click(r.l + 40, r.t + 20, { button: 'right' }); await p.waitForTimeout(200);
      const items = await p.evaluate(() => [...document.querySelectorAll('#cardMenu [data-cm]')].map(b => b.dataset.cm));
      check('T3 the card menu has Copy text, right before Duplicate', items.includes('copy-text') && items.indexOf('copy-text') === items.indexOf('dup') - 1, JSON.stringify(items));
      await p.setClip('');
      await p.click('#cardMenu [data-cm="copy-text"]'); await p.waitForTimeout(300);
      const got = await p.clip();
      check('T3 Copy text copies title and full body', got === t.title + '\n\n' + t.body, JSON.stringify(got.slice(-80)));
      check('T3 including the last line', got.includes('raw meat'));
      check('T3 a quiet toast says so', await p.evaluate(() => [...document.querySelectorAll('.toast')].some(x => /Text copied/.test(x.textContent))));
      check('T3 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // T4. ⌘C on a selected card: pastes as the card inside Vellum, as its full text anywhere else
    {
      const p = await open(browser, base), t = TXT.en;
      const id = await draft(p, t);
      await p.evaluate(id => { select([id]); getSelection().removeAllRanges(); }, id);
      await p.setClip('');
      await p.keyboard.press(`${mod}+c`); await p.waitForTimeout(200);
      const got = await p.clip();
      check('T4 ⌘C on a selected card puts its full text on the clipboard', got === t.title + '\n\n' + t.body, JSON.stringify(got.slice(0, 80)));
      await p.context().close();
    }
    // T5. several cards: the selection menu copies all their text; a list keeps its items
    {
      const p = await open(browser, base), t = TXT.en;
      const ids = await p.evaluate(() => { checkpoint(); const a = node('note', { text: 'Warm light feels best' }, { x: 120, y: 140 }); const b = node('list', { title: 'Before buying', items: [{ t: 'Check CRI' }, { t: 'Test on raw meat' }] }, { x: 520, y: 140 }); renderAll(); select([a.id, b.id]); return [a.id, b.id]; });
      const r = await p.rect(ids[0]);
      await p.mouse.click(r.l + 30, r.t + 30, { button: 'right' }); await p.waitForTimeout(200);
      const has = await p.evaluate(() => !!document.querySelector('#cardMenu [data-sm="copy-text"]'));
      check('T5 the selection menu has Copy text', has);
      await p.setClip('');
      if (has) { await p.click('#cardMenu [data-sm="copy-text"]'); await p.waitForTimeout(300); }
      const got = await p.clip();
      check('T5 it copies every card, list items as lines', got === 'Warm light feels best\n\nBefore buying\n\n- Check CRI\n- Test on raw meat', JSON.stringify(got));
      check('T5 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // T6. Chinese: the menu says 复制文本 and the toast 已复制文本
    {
      const p = await open(browser, base, { zh: true }), t = TXT.zh;
      const id = await draft(p, t);
      const r = await p.rect(id, '.notepad-body');
      await p.mouse.click(r.l + 40, r.t + 20, { button: 'right' }); await p.waitForTimeout(200);
      const lbl = await p.evaluate(() => document.querySelector('#cardMenu [data-cm="copy-text"]')?.textContent.trim());
      check('T6 Chinese label', lbl === '复制文本', lbl);
      await p.click('#cardMenu [data-cm="copy-text"]'); await p.waitForTimeout(300);
      check('T6 Chinese text copied whole', await p.clip() === t.title + '\n\n' + t.body);
      check('T6 Chinese toast', await p.evaluate(() => [...document.querySelectorAll('.toast')].some(x => /已复制文本/.test(x.textContent))));
      await p.context().close();
    }
    // screenshots: the right-click menu and words selected in a draft, light/dark, English/Chinese
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      for (const theme of ['light', 'dark']) for (const lang of ['en', 'zh']) {
        const p = await open(browser, base, { theme, zh: lang === 'zh', scale: 2 }), t = TXT[lang];
        const id = await draft(p, t, { x: 560, y: 160 });
        await p.evaluate(id => select([id]), id); await p.waitForTimeout(150);
        await p.dragOver(await p.wordRects(id, '.notepad-body', t.words));
        await p.mouse.move(900, 700);
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-1-select-words.png`), clip: { x: 500, y: 60, width: 760, height: 620 } });
        const r = await p.rect(id, '.notepad-body');
        await p.mouse.click(r.r - 60, r.t + 30, { button: 'right' }); await p.waitForTimeout(250);
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-2-menu.png`), clip: { x: 500, y: 60, width: 900, height: 780 } });
        await p.click('#cardMenu [data-cm="copy-text"]'); await p.waitForTimeout(400);
        await p.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-3-toast.png`) });
        await p.context().close();
      }
    }
  } finally {
    await browser.close(); srv.close();
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})();

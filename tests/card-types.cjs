#!/usr/bin/env node
/* Card types: format per block, one source label per card.
 * A paste is drawn as what it is (quote, code, text) by local rules; Scout suggests the one label that counts
 * (Observed / Reported / Proposal / Illustration), and the Edit row of the crew's autonomy decides whether it is
 * applied (Do it), offered as a dashed pill (Ask first, the default) or left alone (Never). A paste holding two
 * points offers a split, never does it on its own.
 *
 *   node tests/card-types.cjs                 (from the repo root)
 *   node tests/card-types.cjs --headed        (watch it)
 *   node tests/card-types.cjs --shots DIR     (also save light/dark, English/Chinese screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const argv = process.argv, arg = k => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : null; };
const FILE = path.resolve(arg('--file') || path.resolve(__dirname, '..', 'Vellum-Lumen.html'));
const SHOTS = arg('--shots');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

const QUOTE_CODE = `"I never trust the first call. I wrap every fetch in a retry, because the API drops whenever I'm on the train."
— P04 · interview, 14 Nov

async function get(url, n = 3) {
  try { return await fetch(url) }
  catch { if (n) return get(url, n - 1) }
}`;
const MIXED = `P04: I wrap every fetch in a retry, because the API drops whenever I'm on the train.

Error log, last 7 days: 18% of requests from mobile time out on the first try.`;

async function open(browser, base, { theme = 'light', zh = false, scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: scale, colorScheme: theme });
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
  await ctx.route(/wikipedia\.org/, r => r.abort());
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/x.html'); await p.waitForTimeout(2200);
  await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700);
  await p.evaluate(([t, zh]) => { document.documentElement.dataset.theme = t; if (zh) store.set('.lang', 'zh'); cam = { x: 0, y: 0, s: 1 }; paintCam(); renderAll(); }, [theme, zh]);
  p.paste = async text => { await p.evaluate(text => { document.activeElement?.blur?.(); const dt = new DataTransfer(); dt.setData('text/plain', text); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }, text); await p.waitForTimeout(500); await p.evaluate(() => document.activeElement?.blur?.()); await p.waitForTimeout(200); };
  p.last = () => p.evaluate(() => { const n = board.nodes.filter(n => n.type === 'notepad' && !n.tombstone).at(-1); if (!n) return null; const el = nodeEl(n.id); return { id: n.id, title: n.title, text: n.text, weight: n.weight || null, sug: n.wSug?.w || null, why: n.wSug?.why || '', split: n.splitSug?.at ?? null, tag: el?.querySelector('.notepad-tag')?.textContent || '', quote: !!el?.querySelector('.pb-quote'), cite: el?.querySelector('.pb-quote cite')?.textContent || '', code: el?.querySelector('.pb-code')?.dataset.lang || null, ghost: el?.querySelector('.weight.w-sug')?.textContent || null, pill: el?.querySelector('.weight')?.className || '' }; });
  p.frame = id => p.evaluate(id => { const n = byId(id); select([]); cam = { s: 1, x: 640 - (n.x + nodeW(n) / 2), y: 400 - (n.y + nodeH(n) / 2) }; paintCam(); renderAll(); }, id);
  return p;
}

(async () => {
  const html = fs.readFileSync(FILE);
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !argv.includes('--headed') });
  try {
    // T1. the rules: what a paste is, and what it can carry
    {
      const p = await open(browser, base);
      const r = await p.evaluate(([qc, mixed]) => {
        const sh = bs => bs ? bs.map(b => b.k + (b.lang ? ':' + b.lang : '') + (b.cite ? '@' + b.cite : '')).join(' ') : null;
        const t = s => { const bs = parsePaste(s); return { bs: sh(bs), sug: weightSuggestion(bs || parseBlocks(s)) }; };
        return {
          qc: t(qc), mixed: t(mixed), plain: t('Ship the hook in matte black next week.'),
          py: t('def get(url):\n    for i in range(3):\n        return fetch(url)'),
          zh: t('受访者A：每次在地铁上都要刷新三遍才能打开。'),
          zhObs: t('录屏里 12 位用户中有 9 位没看到右上角的提示，平均停留 2.9 秒。'),
          pro: t('What if we let people pin the retry button to the top bar?'),
          json: t('{\n  "retries": 3,\n  "timeout": 800\n}'),
          stamp: t('[03:12] I just close the app when it spins.'),
          round: (() => { const bs = parsePaste(qc); return JSON.stringify(parseBlocks(blocksToText(bs))) === JSON.stringify(bs); })(),
          oneLineCall: parsePaste('Call me when you land.'),
        };
      }, [QUOTE_CODE, MIXED]);
      check('a quote with its speaker and the code they showed: one quote block (cited) and one JS block', r.qc.bs === 'quote@P04 · interview, 14 Nov code:JS', r.qc.bs);
      check('their own words with code: Scout suggests Reported, naming who said it', r.qc.sug?.w === 'reported' && /P04/.test(r.qc.sug.why), JSON.stringify(r.qc.sug));
      check('a quote next to a measured number is two points: a split is suggested, no single label', r.mixed.bs === 'quote@P04 text' && r.mixed.sug?.split === 1 && !r.mixed.sug.w, JSON.stringify(r.mixed));
      check('plain text is just text: no blocks, no suggestion', r.plain.bs === null && r.plain.sug === null, JSON.stringify(r.plain));
      check('code alone is drawn as code (Python), but carries no label on its own', r.py.bs === 'code:Python' && r.py.sug === null, JSON.stringify(r.py));
      check('a Chinese speaker line is a quote (Reported)', r.zh.bs === 'quote@受访者A' && r.zh.sug?.w === 'reported', JSON.stringify(r.zh));
      check('counted or timed in Chinese reads as Observed', r.zhObs.sug?.w === 'observed', JSON.stringify(r.zhObs));
      check('"what if we" reads as a Proposal', r.pro.sug?.w === 'proposed', JSON.stringify(r.pro));
      check('JSON is code, and a transcript timestamp is a quote', r.json.bs === 'code:JSON' && r.stamp.bs === 'quote', JSON.stringify([r.json.bs, r.stamp.bs]));
      check('stored text reads back as the same blocks', r.round);
      check('an ordinary sentence with a call in it is not code', r.oneLineCall === null, JSON.stringify(r.oneLineCall));
      await p.context().close();
    }
    // T2. Ask first (the default): drawn as blocks, a dashed pill, Keep from the hover card
    {
      const p = await open(browser, base);
      await p.paste(QUOTE_CODE);
      const c = await p.last();
      check('a paste becomes one card with a quote block, its speaker and a JS code block', c && c.quote && /P04/.test(c.cite) && c.code === 'JS', JSON.stringify(c));
      check('the card says what it holds where the kind goes: "Quote · JS"', c?.tag === 'Quote · JS', c?.tag);
      check('the title comes from the words, not "Untitled"', c && /^P04: “I never trust the first call”$/.test(c.title), c?.title);
      check('the label is offered, not applied: a dashed "Reported?" pill', c && !c.weight && c.sug === 'reported' && /Reported\?/.test(c.ghost || ''), JSON.stringify(c));
      check('the stored text stays plain words (fences and quote marks) for Copilot and search', /^> I never trust/.test(c.text) && /```JS/.test(c.text), c.text);
      await p.frame(c.id);
      const ghost = `.card[data-id="${c.id}"] .weight.w-sug`;
      await p.hover(ghost); await p.waitForTimeout(500);
      const pop = await p.evaluate(() => { const d = document.getElementById('byPop'); return d && !d.hidden && d.classList.contains('is-lp') ? { head: d.querySelector('.lp-head b')?.textContent, why: d.querySelector('.lp-why')?.textContent, acts: [...d.querySelectorAll('[data-lp-act]')].map(b => b.textContent) } : null; });
      check('hovering the pill says what Scout thinks and why, with Change and Keep', pop && pop.head === 'Reported' && /P04/.test(pop.why) && pop.acts.join() === 'Change,Keep', JSON.stringify(pop));
      if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, 'light-en-1-suggestion-hover.png') }); }
      await p.click('#byPop [data-lp-act="keep"]'); await p.waitForTimeout(300);
      const k = await p.last();
      check('Keep inks the label and the dashed pill is gone', k.weight === 'reported' && !k.sug && /reported/.test(k.pill) && !/w-sug/.test(k.pill), JSON.stringify(k));
      check('keeping it is in the change log', await p.evaluate(() => board.log.some(l => l.who === 'you' && /Marked .* as reported/.test(l.html))));
      // T3. the label menu: the four kinds, Scout's pick marked, arrow keys and Enter
      await p.evaluate(id => { const n = byId(id); n.weight = null; n.wSug = { w: 'reported', why: 'x' }; renderAll(); }, c.id); await p.waitForTimeout(200);
      await p.click(ghost); await p.waitForTimeout(300);
      const menu = await p.evaluate(() => { const m = document.querySelector('.w-menu'); return m ? { items: [...m.querySelectorAll('.wm-i')].map(b => b.querySelector('b').textContent), scout: m.querySelector('.wm-i[data-w="reported"] .wm-s')?.textContent, focus: document.activeElement?.dataset?.w, popOpen: !document.getElementById('byPop').hidden && document.getElementById('byPop').classList.contains('in') } : null; });
      check('clicking the pill opens the four kinds plus "Show as plain text"', menu && menu.items.join() === 'Observed,Reported,Proposal,Illustration,Show as plain text', JSON.stringify(menu));
      check('Scout\'s pick is marked and focused, not applied', menu?.scout === 'Scout' && menu.focus === 'reported' && !(await p.last()).weight, JSON.stringify(menu));
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'light-en-2-label-menu.png') });
      await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
      const m2 = await p.last();
      check('arrow up then Enter picks Observed and closes the menu', m2.weight === 'observed' && !(await p.locator('.w-menu').count()), JSON.stringify(m2));
      // a plain pill opens the same menu (it used to cycle blindly)
      await p.click(`.card[data-id="${c.id}"] .weight`); await p.waitForTimeout(250);
      check('a labelled pill opens the menu too, with Unrated to clear it', await p.evaluate(() => [...document.querySelectorAll('.w-menu .wm-i b')].map(b => b.textContent).includes('Unrated')));
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      check('Escape closes the menu and changes nothing', !(await p.locator('.w-menu').count()) && (await p.last()).weight === 'observed');
      // show as plain text, and editing shows the raw words
      await p.click(`.card[data-id="${c.id}"] .weight`); await p.waitForTimeout(200);
      await p.click('.w-menu .wm-fmt'); await p.waitForTimeout(300);
      const plain = await p.evaluate(id => ({ off: !!byId(id).fmtOff, blocks: !!nodeEl(id).querySelector('.pb-quote'), tag: nodeEl(id).querySelector('.notepad-tag').textContent }), c.id);
      check('"Show as plain text" turns the blocks off for this card (and the tag goes back to Notepad)', plain.off && !plain.blocks && plain.tag === 'Notepad', JSON.stringify(plain));
      await p.evaluate(id => { byId(id).fmtOff = false; renderAll(); startEdit(id, 'text'); }, c.id); await p.waitForTimeout(300);
      const ed = await p.evaluate(id => { const t = nodeEl(id).querySelector('[data-edit="text"]'); return { editable: t.contentEditable, raw: t.innerText.startsWith('> I never trust') && t.innerText.includes('```JS') }; }, c.id);
      check('editing the body shows the plain words to edit, not the drawn blocks', ed.editable === 'true' && ed.raw, JSON.stringify(ed));
      await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(300);
      check('after editing the blocks are drawn again', await p.evaluate(id => !!nodeEl(id).querySelector('.pb-code'), c.id));
      check('no page errors (Ask first)', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // T4. Do it: applied with one glow, Undo takes back only the label
    {
      const p = await open(browser, base);
      await p.evaluate(() => setAutonomy({ edit: 'direct' }));
      await p.paste(QUOTE_CODE); await p.waitForTimeout(200);
      const c = await p.last();
      const t = await p.evaluate(() => ({ toast: [...document.querySelectorAll('.toast span')].map(s => s.textContent).join(' | '), glow: !!document.querySelector('.weight.w-glow'), log: board.log.some(l => l.who === 'scout' && /Labelled/.test(l.html)) }));
      check('with Edit = Do it, Scout labels it straight away', c.weight === 'reported' && !c.sug, JSON.stringify(c));
      check('the label glows once, a toast says who did it, and the log credits Scout', t.glow && /Scout labelled it Reported/.test(t.toast) && t.log, JSON.stringify(t));
      await p.evaluate(() => [...document.querySelectorAll('.toast')].find(x => /Scout labelled/.test(x.textContent))?.querySelector('button')?.click()); await p.waitForTimeout(400);
      const u = await p.last();
      check('Undo on that toast removes only the label; the pasted card stays', u && u.id === c.id && !u.weight, JSON.stringify(u));
      check('no page errors (Do it)', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // T5. Never: no suggestion at all
    {
      const p = await open(browser, base);
      await p.evaluate(() => setAutonomy({ edit: 'never' }));
      await p.paste(QUOTE_CODE);
      const c = await p.last();
      check('with Edit = Never the paste is still drawn as blocks, but nothing is suggested', c.quote && c.code && !c.weight && !c.sug && !c.ghost, JSON.stringify(c));
      await p.context().close();
    }
    // T6. two points in one paste: a seam, Split on hover, two snapped cards with their own labels
    {
      const p = await open(browser, base);
      await p.evaluate(() => setAutonomy({ edit: 'direct' }));
      await p.paste(MIXED);
      const c = await p.last();
      check('a paste with two points is never split on its own, even on Do it, and gets no single label', c.split === 1 && !c.weight && !c.sug, JSON.stringify(c));
      await p.frame(c.id);
      const seam = await p.evaluate(id => { const b = nodeEl(id).querySelector('.pb-split'); return b ? { op: getComputedStyle(b).opacity, txt: b.textContent } : null; }, c.id);
      check('at rest only the seam shows; the Split button waits for hover', seam && +seam.op < .1 && seam.txt === 'Split into 2 cards', JSON.stringify(seam));
      await p.hover(`.card[data-id="${c.id}"] .pb-quote`); await p.waitForTimeout(350);
      check('hovering the card shows Split', +(await p.evaluate(id => getComputedStyle(nodeEl(id).querySelector('.pb-split')).opacity, c.id)) > .9);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'light-en-3-split-seam.png') });
      await p.click(`.card[data-id="${c.id}"] .pb-split`); await p.waitForTimeout(500);
      const s = await p.evaluate(id => { const ns = board.nodes.filter(n => n.type === 'notepad' && !n.tombstone); const [a, b] = ns; const rel = board.edges.find(e => (e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id)); return { n: ns.length, a: { sug: a.wSug?.w, text: a.text }, b: { sug: b.wSug?.w, text: b.text }, rel: rel ? rel.via : null, gap: b.y - (a.y + nodeH(a)), sameX: a.x === b.x, kept: a.id === id }; }, c.id);
      check('Split makes two cards, the original keeps the first half', s.n === 2 && s.kept && /^> I wrap/.test(s.a.text) && /^Error log/.test(s.b.text), JSON.stringify(s));
      check('each half gets its own suggestion: the quote Reported, the log Observed', s.a.sug === 'reported' && s.b.sug === 'observed', JSON.stringify(s));
      check('the two halves stay snapped: touching at the seam, one snap relation', s.rel === 'snap' && s.sameX && Math.abs(s.gap - 12) < 1, JSON.stringify(s));
      if (SHOTS) { await p.evaluate(() => { const ns = board.nodes.filter(n => n.type === 'notepad'); select([]); focusNodes(ns, 1, 0); }); await p.waitForTimeout(500); await p.screenshot({ path: path.join(SHOTS, 'light-en-4-after-split.png') }); }
      await p.evaluate(() => undo()); await p.waitForTimeout(400);
      check('Undo puts the original card back whole', await p.evaluate(() => { const ns = board.nodes.filter(n => n.type === 'notepad' && !n.tombstone); return ns.length === 1 && /Error log/.test(ns[0].text) && ns[0].splitSug?.at === 1; }));
      check('no page errors (split)', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // T7. both themes, both languages: legible pill, no overflow, Chinese strings
    for (const [theme, zh] of [['dark', false], ['light', true], ['dark', true]]) {
      const p = await open(browser, base, { theme, zh, scale: SHOTS ? 2 : 1 });
      await p.paste(zh ? '受访者A：每次在地铁上都要刷新三遍才能打开，所以我自己写了重试。\n\nasync function get(url, n = 3) {\n  try { return await fetch(url) }\n  catch { if (n) return get(url, n - 1) }\n}' : QUOTE_CODE);
      const c = await p.last();
      await p.frame(c.id);
      const look = await p.evaluate(id => {
        const el = nodeEl(id), pill = el.querySelector('.weight'), cs = getComputedStyle(pill);
        const cr = el.getBoundingClientRect(); let over = 0; el.querySelectorAll('.foot *, .pb-quote, .pb-code').forEach(e => { const r = e.getBoundingClientRect(); if (r.width) over = Math.max(over, r.right - cr.right); });
        return { ghost: pill.textContent, color: cs.color, over, tag: el.querySelector('.notepad-tag').textContent };
      }, c.id);
      const tag = zh ? '引用 · JS' : 'Quote · JS', ghost = zh ? '转述？' : 'Reported?';
      check(`${theme}${zh ? ' zh' : ''}: the tag reads "${tag}" and the pill "${ghost}"`, look.tag === tag && look.ghost === ghost, JSON.stringify(look));
      check(`${theme}${zh ? ' zh' : ''}: nothing runs past the card's edge`, look.over <= 0.5, JSON.stringify(look));
      if (zh) {
        await p.hover(`.card[data-id="${c.id}"] .weight.w-sug`); await p.waitForTimeout(500);
        const pop = await p.evaluate(() => [...document.querySelectorAll('#byPop [data-lp-act]')].map(b => b.textContent).join() + '|' + (document.querySelector('#byPop .lp-why')?.textContent || ''));
        check(`${theme} zh: the hover card is in Chinese`, /^更改,保留\|受访者A 的原话/.test(pop), pop);
      }
      if (SHOTS) { await p.hover(`.card[data-id="${c.id}"] .weight.w-sug`); await p.waitForTimeout(500); await p.screenshot({ path: path.join(SHOTS, `${theme}-${zh ? 'zh' : 'en'}-suggestion.png`) }); }
      check(`no page errors (${theme}${zh ? ' zh' : ''})`, p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
  } catch (e) { check('run without throwing', false, String(e.stack || e)); }
  await browser.close(); srv.close();
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})();

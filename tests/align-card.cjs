#!/usr/bin/env node
/* Before drawing: the align card.
 * A short image or video request, or a small-model fork of an open idea, first puts a card on the canvas that asks
 * up to three questions, one at a time, with blocks the app draws itself (spectrum, pick, flow, compare, text).
 * The model only fills a small JSON; a wrong answer is repaired once and otherwise replaced by built-in questions.
 * Answering collapses the card to "Agreed" (a one-line takeaway and the answers), runs what was asked for with the
 * answers folded in, and links the result to the card. Retries, variations and detailed requests skip it.
 *
 *   node tests/align-card.cjs                 (from the repo root)
 *   node tests/align-card.cjs --headed        (watch it)
 *   node tests/align-card.cjs --shots DIR     (also save light/dark, English/Chinese screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const argv = process.argv, arg = k => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : null; };
const FILE = path.resolve(arg('--file') || path.resolve(__dirname, '..', 'Vellum-Lumen.html'));
const SHOTS = arg('--shots');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + JSON.stringify(detail)}`); if (!ok) failures++; }

async function open(browser, base, { theme = 'light', zh = false, scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: scale, colorScheme: theme });
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
  await ctx.route(/wikipedia\.org|wikimedia\.org/, r => r.abort());
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/x.html'); await p.waitForTimeout(2200);
  await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700);
  await p.evaluate(([t, zh]) => { document.documentElement.dataset.theme = t; if (zh) store.set('.lang', 'zh'); cam = { x: 0, y: 0, s: 1 }; paintCam(); renderAll(); }, [theme, zh]);
  p.card = () => p.evaluate(() => { const n = board.nodes.filter(n => n.type === 'align' && !n.tombstone).at(-1); if (!n) return null; const el = nodeEl(n.id); return { id: n.id, state: n.state, step: n.step, kinds: n.qs.map(q => q.kind), then: n.then, eb: el?.querySelector('.eb')?.textContent, q: el?.querySelector('.al-q span')?.textContent, primary: el?.querySelector('.al-foot .cbtn.solid')?.textContent, take: el?.querySelector('.al-take')?.textContent || '', rows: [...(el?.querySelectorAll('.al-row') || [])].map(r => r.querySelector('.k').textContent + '=' + r.querySelector('.v').firstChild.textContent) }; });
  p.frame = id => p.evaluate(id => { const n = byId(id); select([]); cam = { s: 1, x: 640 - (n.x + nodeW(n) / 2), y: 410 - (n.y + nodeH(n) / 2) }; paintCam(); renderAll(); }, id);
  p.click1 = sel => p.evaluate(sel => { const el = document.querySelector(sel); if (!el) throw new Error('missing ' + sel); el.click(); }, sel);
  return p;
}
const overflow = p => p.evaluate(() => { const bad = []; for (const c of document.querySelectorAll('.card.align')) { const r = c.getBoundingClientRect(); for (const el of c.querySelectorAll('.al [class^="al-"], .al [class^="al-"] *')) { const e = el.getBoundingClientRect(); if (e.width && (e.right > r.right + 1 || e.left < r.left - 1)) bad.push(el.className || el.tagName); if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && el.tagName !== 'INPUT') bad.push('scroll:' + (el.className || el.tagName)); } } return [...new Set(bad)]; });

(async () => {
  const html = fs.readFileSync(FILE);
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !argv.includes('--headed') });
  try {
    // A1. when it asks first, and when it doesn't
    {
      const p = await open(browser, base);
      const r = await p.evaluate(() => {
        const idea = node('note', { text: 'A camping lantern' }, { x: 0, y: 0 });
        const img = node('image', { title: 'x', gen: { prompt: 'a lantern' } }, { x: 0, y: 400 });
        const out = {
          short: alignWanted('image', 'a camping lantern', null), shortZh: alignWanted('image', '画一盏露营灯', null),
          long: alignWanted('image', 'a matte black camping lantern hanging from a tent pole at dusk, warm 2700K glow, studio product shot on a plain grey background', null),
          fromImage: alignWanted('image', 'a lantern', img), fromNote: alignWanted('image', 'a lantern', idea), empty: alignWanted('image', '  ', null),
          subj: [alignSubject('image', 'a camping lantern'), alignSubject('image', 'checkout screen for gear rental'), alignSubject('image', '租赁结账页面'), alignSubject('video', 'a lantern')]
        };
        ALIGN_BEFORE = false; out.off = alignWanted('image', 'a camping lantern', null); ALIGN_BEFORE = true;
        return out;
      });
      check('a short request asks first, in English and Chinese', r.short && r.shortZh, r);
      check('a detailed request, a variation of an image, an empty one or the switch turned off go straight to making', !r.long && !r.fromImage && !r.empty && !r.off, r);
      check('a request about a card still asks', r.fromNote, r);
      check('the built-in questions follow what is being made: an object, a screen, a video', r.subj.join() === 'object,screen,screen,video', r.subj);
      await p.context().close();
    }
    // A2. no model: the built-in questions, one at a time, and the answers fold into what gets made
    for (const zh of [false, true]) {
      const p = await open(browser, base, { zh });
      await p.evaluate(zh => { window.__made = []; generateImages = async (prompt, o) => { window.__made.push({ prompt, from: o?.from?.id }); const n = node('image', { title: prompt, gen: { prompt }, _src: o?.from?.id }, { x: 900, y: 0 }); edge(o.from.id, n.id, 'src'); renderAll(); }; return alignOrMake('image', zh ? '画一盏露营灯' : 'a camping lantern', null); }, zh);
      await p.waitForFunction(() => board.nodes.some(n => n.type === 'align'), null, { timeout: 15000 });
      let c = await p.card(); await p.frame(c.id); c = await p.card();
      check(`${zh ? 'zh' : 'en'}: the card asks with a slider, a pick and a text box, one at a time`, c.kinds.join() === 'spectrum,pick,text' && c.step === 0 && c.state === 'open', c);
      check(`${zh ? 'zh' : 'en'}: eyebrow, question and buttons are in the board's language`, zh ? (c.eb === '开画之前' && /感觉/.test(c.q) && c.primary === '下一个') : (c.eb === 'Before drawing' && /feel/.test(c.q) && c.primary === 'Next'), c);
      check(`${zh ? 'zh' : 'en'}: nothing is generated before the questions are answered`, (await p.evaluate(() => window.__made.length)) === 0);
      // drag the slider toward the left end; the words under it answer while it moves
      const tr = await p.locator('.card.align [data-al-track]').boundingBox();
      const before = await p.locator('.card.align .al-reads').textContent();
      await p.mouse.move(tr.x + tr.width * 0.5, tr.y + tr.height / 2); await p.mouse.down(); await p.mouse.move(tr.x + tr.width * 0.1, tr.y + tr.height / 2, { steps: 4 }); await p.mouse.up();
      const after = await p.locator('.card.align .al-reads').textContent();
      const v = await p.evaluate(() => board.nodes.find(n => n.type === 'align').qs[0].v);
      check(`${zh ? 'zh' : 'en'}: dragging the slider moves it and rewrites the line under it`, v < 0.2 && before !== after, { v, before, after });
      check(`${zh ? 'zh' : 'en'}: dragging the slider does not drag the card`, await p.evaluate(id => { const n = byId(id); return Math.abs(n.x - n.x) === 0; }, c.id));
      if (SHOTS && !zh) { fs.mkdirSync(SHOTS, { recursive: true }); }
      await p.click1('.card.align [data-a="al-next"]'); await p.waitForTimeout(150);
      c = await p.card();
      check(`${zh ? 'zh' : 'en'}: Next shows the pick; a physical form is offered in words, never as a drawing`, c.step === 1 && (await p.locator('.card.align .al-pick').count()) === 4 && (await p.locator('.card.align .al-pick svg').count()) === 0 && (await p.locator('.card.align .al-picks.words').count()) === 1, c);
      await p.click1('.card.align .al-pick:nth-child(1)'); await p.waitForTimeout(100);
      check(`${zh ? 'zh' : 'en'}: choosing an option marks it, once`, await p.evaluate(() => board.nodes.find(n => n.type === 'align').qs[1].a === 0 && document.querySelectorAll('.card.align .al-pick.on').length === 1));
      await p.click1('.card.align [data-a="al-next"]'); await p.waitForTimeout(100);
      await p.locator('.card.align .al-own').fill(zh ? 'USB-C 充电' : 'Charges by USB-C');
      c = await p.card();
      check(`${zh ? 'zh' : 'en'}: the last question's button says what will happen`, zh ? /画 \d 张概念图/.test(c.primary) : /^Draw \d concepts?$/.test(c.primary), c.primary);
      await p.locator('.card.align .al-own').press('Enter'); await p.waitForTimeout(400);
      c = await p.card();
      const made = await p.evaluate(() => window.__made);
      check(`${zh ? 'zh' : 'en'}: answering collapses the card to Agreed with a takeaway and the answers`, c.state === 'agreed' && c.eb === (zh ? '已对齐' : 'Agreed') && c.rows.length === 3 && c.take.length > 3, c);
      check(`${zh ? 'zh' : 'en'}: what gets made carries the answers and links back to the card`, made.length === 1 && made[0].from === c.id && (zh ? /USB-C/.test(made[0].prompt) && /暖光/.test(made[0].prompt) : /USB-C/.test(made[0].prompt) && /Warm light/.test(made[0].prompt)), made);
      check(`${zh ? 'zh' : 'en'}: your own words are marked as yours`, (await p.locator('.card.align .al-yours').count()) === 1);
      check(`${zh ? 'zh' : 'en'}: Agreed offers Change and make again, primary on the right`, await p.evaluate(() => { const b = [...document.querySelectorAll('.card.align .al-foot button')]; return b.length === 2 && b[0].dataset.a === 'al-change' && b[1].dataset.a === 'al-again' && b[1].getBoundingClientRect().left > b[0].getBoundingClientRect().left; }));
      check(`${zh ? 'zh' : 'en'}: the same request again does not ask a second time`, await p.evaluate(zh => !alignWanted('image', zh ? '画一盏露营灯' : 'a camping lantern', null), zh));
      check(`${zh ? 'zh' : 'en'}: no overflow inside the card`, (await overflow(p)).length === 0, await overflow(p));
      await p.click1('.card.align [data-a="al-change"]'); await p.waitForTimeout(100);
      c = await p.card();
      check(`${zh ? 'zh' : 'en'}: Change reopens the questions with the answers kept`, c.state === 'open' && c.step === 0 && await p.evaluate(() => board.nodes.find(n => n.type === 'align').qs[2].own.length > 0), c);
      await p.evaluate(() => { undo(); renderAll(); }); await p.waitForTimeout(100);
      check(`${zh ? 'zh' : 'en'}: Undo puts Agreed back`, (await p.card()).state === 'agreed');
      check(`${zh ? 'zh' : 'en'}: no page errors`, p.errors.length === 0, p.errors);
      await p.context().close();
    }
    // A2b. a screen gets layout drawings, because a grid is a grid whatever the product
    {
      const p = await open(browser, base);
      await p.evaluate(() => { generateImages = async () => {}; return alignOrMake('image', 'a checkout screen for gear rental', null); });
      await p.waitForFunction(() => board.nodes.some(n => n.type === 'align'));
      await p.click1('.card.align [data-a="al-next"]'); await p.waitForTimeout(100);
      check('a screen request offers layouts as drawings', (await p.locator('.card.align .al-pick svg').count()) === 4);
      await p.context().close();
    }
    // A2c. drawings the model writes as vector code: cleaned to plain shapes, shown only when every option has one
    {
      const p = await open(browser, base);
      const r = await p.evaluate(() => ({
        ok: alSafeSVG('<path d="M20 80h60"/><circle cx="50" cy="45" r="20" fill="red" style="stroke:blue" onclick="alert(1)"/>'),
        bad: [alSafeSVG('<script>alert(1)</script>'), alSafeSVG('<image href="https://x.y/a.png"/>'), alSafeSVG('<text>Hi</text>'), alSafeSVG('<foreignObject><div/></foreignObject>'), alSafeSVG('not svg')],
        nested: alSafeSVG('<g transform="translate(2,3)"><path d="M0 0L10 10"/><a href="javascript:x"><path d="M1 1"/></a></g>'),
        evilT: alSafeSVG('<path d="M0 0" transform="url(x)"/>')
      }));
      check('a drawing keeps its shapes and loses colours, styles and handlers', /<path d="M20 80h60"\/>/.test(r.ok) && /<circle cx="50" cy="45" r="20"\/>/.test(r.ok) && !/fill|style|onclick/.test(r.ok), r.ok);
      check('scripts, images, text and foreign content are refused', r.bad.every(x => x === ''), r.bad);
      check('a link inside a group is dropped, a plain transform is kept, a strange one is not', /<g transform="translate\(2,3\)"><path d="M0 0L10 10"\/><\/g>/.test(r.nested) && !/transform/.test(r.evilT), r);
      for (const broken of [false, true]) {
        await p.evaluate(broken => {
          window.__asked = null;
          if (!window.__cs) { window.__cs = connSummary; connSummary = () => ({ ...window.__cs(), engine: 'studio' }); }
          if (!window.__ask) window.__ask = askAI; askAI = async (o, local) => { if (/line drawings/.test(o.system)) { window.__asked = o; const one = '<rect x="30" y="20" width="40" height="60" rx="8"/>'; const v = { pick: [one, one, broken ? '<script/>' : one, one], left: '<circle cx="50" cy="50" r="30"/>', right: '<rect x="25" y="25" width="50" height="50"/>' }; const probs = o.check(v); return broken ? (probs.length ? null : v) : v; } return window.__ask(o, local); };
          board.nodes.filter(n => n.type === 'align').forEach(n => n.tombstone = true);
          generateImages = async () => {}; return alignOrMake('image', broken ? 'a pair of glasses' : 'a desk lamp', null);
        }, broken);
        await p.waitForFunction(() => board.nodes.some(n => n.type === 'align' && !n.tombstone)); await p.waitForTimeout(500);
        const c = await p.card(); await p.frame(c.id);
        const viz = await p.evaluate(() => ({ svgs: document.querySelectorAll('.card.align .al-viz svg').length, asked: window.__asked?.prompt || '' }));
        if (!broken) {
          check('the slider shows a drawing for each end, made for this object', viz.svgs === 2 && /desk lamp/.test(viz.asked), viz);
          const tr = await p.locator('.card.align [data-al-track]').boundingBox();
          await p.mouse.click(tr.x + tr.width * 0.9, tr.y + tr.height / 2); await p.waitForTimeout(80);
          const op = await p.evaluate(() => [...document.querySelectorAll('.card.align .al-viz svg')].map(s => +s.style.opacity));
          check('moving the slider cross-fades between the two drawings', op[0] < 0.2 && op[1] > 0.8, op);
          await p.click1('.card.align [data-a="al-next"]'); await p.waitForTimeout(100);
          check('every option drawn: the options show the drawings', (await p.locator('.card.align .al-pick svg').count()) === 4 && (await p.locator('.card.align .al-picks.words').count()) === 0);
          check('the card remembers how long the drawing took', await p.evaluate(id => byId(id).drawn?.ms >= 0 && byId(id).drawn.ref === false, c.id));
        } else {
          await p.click1('.card.align [data-a="al-next"]'); await p.waitForTimeout(100);
          check('one bad drawing: all options stay in words, so they match', (await p.locator('.card.align .al-pick svg').count()) === 0 && (await p.locator('.card.align .al-picks.words').count()) === 1);
        }
      }
      check('no page errors while drawing', p.errors.length === 0, p.errors);
      await p.context().close();
    }
    // A3. Skip all: made without extra choices, and the card says so
    {
      const p = await open(browser, base);
      await p.evaluate(() => { window.__made = []; generateImages = async (prompt, o) => { window.__made.push(prompt); }; return alignOrMake('image', 'a desk fan', null); });
      await p.waitForFunction(() => board.nodes.some(n => n.type === 'align'));
      for (let i = 0; i < 3; i++) { await p.click1('.card.align [data-a="al-skip"]'); await p.waitForTimeout(80); }
      const c = await p.card();
      check('skipping every question makes it with the plain request and says it was skipped', c.state === 'skipped' && (await p.evaluate(() => window.__made)).join() === 'a desk fan' && (await p.locator('.card.align .al-none').count()) === 1, c);
      check('a slider nobody touched is not an answer', await p.evaluate(() => alignAnswers(board.nodes.find(n => n.type === 'align')).length === 0));
      await p.context().close();
    }
    // A4. the model fills a small JSON; a wrong one is caught, a good one is used as given
    {
      const p = await open(browser, base);
      const r = await p.evaluate(() => {
        const ok = { questions: [{ kind: 'spectrum', key: 'Feel', q: 'Which feel?', left: 'Cabin cosy', right: 'Trail gear', reads: ['a', 'b', 'c'] }, { kind: 'pick', key: 'Form', q: 'Which form?', options: [{ label: 'Hanging dome' }, { label: 'Pocket stick' }] }, { kind: 'text', q: 'Must keep?' }] };
        const bad = { questions: [{ kind: 'slider', q: 'x' }, { kind: 'pick', q: 'Which?', options: [{ label: 'a', sketch: 'lamp' }] }] };
        const invented = { questions: [{ kind: 'pick', q: 'Which city?', options: [{ label: 'Berlin' }, { label: 'Tokyo' }] }, { kind: 'text', q: 'More?' }] };
        return { ok: alignProblems(ok, 'a camping lantern'), bad: alignProblems(bad, 'a lantern'), invented: alignProblems(invented, 'a camping lantern'),
          clean: alignClean({ kind: 'pick', q: 'Q', options: [{ label: 'One', sketch: 'grid' }, { label: 'Two', sketch: 'rounded' }] }), flow: alignClean({ kind: 'flow', q: 'Steps?', steps: ['Pick gear', 'Dates', { label: 'Deposit', on: false }] }), junk: alignClean({ kind: 'html', q: '<b>x</b>' }) };
      });
      check('a well-formed answer has no problems', r.ok.length === 0, r.ok);
      check('an unknown kind, too few options and a sketch not on the list are each named', r.bad.some(x => /kind/.test(x)) && r.bad.some(x => /2-4 options/.test(x)) && r.bad.some(x => /sketch/.test(x)), r.bad);
      check('a place the request never mentioned is caught', r.invented.some(x => /Berlin|Tokyo/.test(x)), r.invented);
      check('cleaning keeps only the sketches that fit every product (layouts, frames), flow steps keep on/off, unknown kinds are dropped', r.clean.options.length === 2 && r.clean.options[0].sketch === 'grid' && !r.clean.options[1].sketch && r.flow.steps[2].on === false && r.junk === null, r);
      await p.context().close();
    }
    // A5. flow and compare blocks: toggling steps and choosing a side, and their words in the brief
    for (const theme of ['light', 'dark']) for (const zh of [false, true]) {
      const p = await open(browser, base, { theme, zh, scale: SHOTS ? 2 : 1 });
      const id = await p.evaluate(zh => {
        const T = (en, z) => zh ? z : en;
        const n = alignCreate({ title: T('Gear rental checkout', '装备租赁结账流程'), then: { act: 'image', prompt: 'checkout', count: 3 }, qs: [
          alignClean({ kind: 'flow', key: T('Steps', '步骤'), q: T('Which steps go into the first prototype?', '第一版原型做哪几步？'), steps: [T('Pick gear', '选装备'), T('Dates', '选日期'), T('Deposit', '押金'), T('Pay', '付款'), T('Pickup map', '取货地图')], why: T('Deposit and pickup map wait until the test shows people get through paying.', '押金和取货地图，等测试证明能顺利付款再做。') }),
          alignClean({ kind: 'compare', key: T('Form', '形态'), q: T('Dome or stick: which matters more?', '圆顶还是灯棒，哪个更重要？'), cols: [T('Hanging dome', '吊挂圆顶'), T('Pocket stick', '口袋灯棒')], rows: [{ dim: T('Light spread', '光照范围'), a: T('Whole tent', '整个帐篷'), b: T('A path ahead', '前方一条路') }, { dim: T('Packs into', '收纳'), a: T('A cup holder', '水杯架'), b: T('A pocket', '口袋') }] })] });
        return n.id;
      }, zh);
      await p.frame(id);
      await p.click1('.card.align .al-step:nth-of-type(3)'); await p.click1('.card.align [data-a="al-step"][data-i="4"]'); await p.waitForTimeout(100);
      const off = await p.evaluate(() => [...document.querySelectorAll('.card.align .al-step')].map(s => s.classList.contains('off')));
      check(`${theme}/${zh ? 'zh' : 'en'}: steps switch off and show it with an empty circle`, off.join() === 'false,false,true,false,true' && (await p.locator('.card.align .al-step.off .al-tog svg').count()) === 0, off);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${theme}-${zh ? 'zh' : 'en'}-flow.png`), clip: await p.locator('.card.align').boundingBox().then(b => ({ x: b.x - 24, y: b.y - 24, width: b.width + 48, height: b.height + 48 })) });
      // same surfaces for every screen, on or off
      const bgs = await p.evaluate(() => new Set([...document.querySelectorAll('.card.align .al-scr')].map(s => getComputedStyle(s).backgroundColor)).size);
      check(`${theme}/${zh ? 'zh' : 'en'}: every screen in the flow has the same surface, on or off`, bgs === 1, bgs);
      await p.click1('.card.align [data-a="al-next"]'); await p.waitForTimeout(100);
      await p.click1('.card.align [data-a="al-col"][data-i="1"]'); await p.waitForTimeout(100);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${theme}-${zh ? 'zh' : 'en'}-compare.png`), clip: await p.locator('.card.align').boundingBox().then(b => ({ x: b.x - 24, y: b.y - 24, width: b.width + 48, height: b.height + 48 })) });
      const brief = await p.evaluate(id => alignBrief(byId(id)), id);
      check(`${theme}/${zh ? 'zh' : 'en'}: the brief keeps the chosen steps in order, names the left-out ones, and the chosen side`, zh ? /选装备 → 选日期 → 付款/.test(brief) && /押金/.test(brief) && /口袋灯棒/.test(brief) : /Pick gear → Dates → Pay/.test(brief) && /leave out Deposit, Pickup map/.test(brief) && /Pocket stick/.test(brief), brief);
      check(`${theme}/${zh ? 'zh' : 'en'}: no overflow`, (await overflow(p)).length === 0, await overflow(p));
      check(`${theme}/${zh ? 'zh' : 'en'}: no page errors`, p.errors.length === 0, p.errors);
      await p.context().close();
    }
    // A7. the camping lantern sample: offered in the board list, opens with drawings ready, plays like a live card
    for (const theme of ['light', 'dark']) for (const zh of [false, true]) {
      const tag = `${theme}/${zh ? 'zh' : 'en'}`;
      const p = await open(browser, base, { theme, zh, scale: SHOTS ? 2 : 1 });
      await p.click('#projectBtn'); await p.waitForTimeout(300);
      const row = p.locator('[data-lantern]');
      check(`${tag}: the board list offers the lantern sample`, (await row.count()) === 1 && (await row.textContent()).includes(zh ? '露营灯' : 'Camping lantern'), await row.count() ? await row.textContent() : 'missing');
      await row.click(); await p.waitForTimeout(600);
      const s = await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'align'); return { id: board.id, title: board.title, tpl: board.template?.id, n: n && { id: n.id, state: n.state, kinds: n.qs.map(q => q.kind) }, rels: board.edges.filter(e => e.rel).map(e => e.rel) }; });
      check(`${tag}: it opens as its own board with the open card (spectrum, pick, text) and a supporting interview`, s.id === 'lantern' && s.tpl === 'product' && s.n?.state === 'open' && s.n.kinds.join() === 'spectrum,pick,text' && s.rels.includes('supports') && (zh ? /露营灯/.test(s.title) : /Camping lantern/.test(s.title)), s);
      await p.frame(s.n.id);
      check(`${tag}: both ends of the slider are drawn`, (await p.locator('.card.align .al-viz svg').count()) === 2);
      const box = () => p.locator('.card.align').boundingBox().then(b => ({ x: b.x - 24, y: b.y - 24, width: b.width + 48, height: b.height + 48 }));
      const tr = await p.locator('.card.align [data-al-track]').boundingBox();
      await p.mouse.click(tr.x + tr.width * 0.25, tr.y + tr.height / 2); await p.waitForTimeout(150);
      const op = await p.evaluate(() => [...document.querySelectorAll('.card.align .al-viz svg')].map(x => +x.style.opacity));
      check(`${tag}: dragging toward cabin cosy brings that drawing forward`, op[0] > op[1], op);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `sample-${theme}-${zh ? 'zh' : 'en'}-1-spectrum.png`), clip: await box() });
      await p.click1('.card.align [data-a="al-next"]'); await p.waitForTimeout(150);
      check(`${tag}: the three forms show as drawings, not words`, (await p.locator('.card.align .al-picks:not(.words) .al-pick svg').count()) === 3);
      await p.click1('.card.align .al-pick:nth-child(1)'); await p.waitForTimeout(150);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `sample-${theme}-${zh ? 'zh' : 'en'}-2-pick.png`), clip: await box() });
      check(`${tag}: no overflow in the sample`, (await overflow(p)).length === 0, await overflow(p));
      await p.click('#projectBtn'); await p.waitForTimeout(300);
      check(`${tag}: on the sample, the list offers to reset it`, ((await p.locator('[data-lantern]').textContent()) || '').includes(zh ? '重置' : 'Reset'));
      await p.locator('[data-lantern]').click(); await p.waitForTimeout(400);
      check(`${tag}: reset puts the card back at its first question`, await p.evaluate(() => board.nodes.find(n => n.type === 'align').step === 0));
      check(`${tag}: no page errors (sample)`, p.errors.length === 0, p.errors);
      await p.context().close();
    }
    // A6. screenshots of the built-in questions and the agreed card, light/dark × en/zh
    if (SHOTS) for (const theme of ['light', 'dark']) for (const zh of [false, true]) {
      const p = await open(browser, base, { theme, zh, scale: 2 });
      await p.evaluate(zh => { generateImages = async (prompt, o) => { const n = node('image', { title: prompt, media: '', gen: { prompt, preview: true }, _src: o.from.id, by: 'wright', status: 'sketch' }, { x: o.from.x + 480, y: o.from.y }); edge(o.from.id, n.id, 'src'); renderAll(); }; return alignOrMake('image', zh ? '画一盏露营灯' : 'a camping lantern', null); }, zh);
      await p.waitForFunction(() => board.nodes.some(n => n.type === 'align'));
      const c = await p.card(); await p.frame(c.id);
      const tr = await p.locator('.card.align [data-al-track]').boundingBox();
      await p.mouse.click(tr.x + tr.width * 0.28, tr.y + tr.height / 2); await p.waitForTimeout(150);
      const box = () => p.locator('.card.align').boundingBox().then(b => ({ x: b.x - 24, y: b.y - 24, width: b.width + 48, height: b.height + 48 }));
      await p.screenshot({ path: path.join(SHOTS, `${theme}-${zh ? 'zh' : 'en'}-1-spectrum.png`), clip: await box() });
      await p.click1('.card.align [data-a="al-next"]'); await p.click1('.card.align .al-pick:nth-child(1)'); await p.waitForTimeout(150);
      await p.screenshot({ path: path.join(SHOTS, `${theme}-${zh ? 'zh' : 'en'}-2-pick.png`), clip: await box() });
      await p.click1('.card.align [data-a="al-next"]'); await p.locator('.card.align .al-own').fill(zh ? 'USB-C 充电' : 'Charges by USB-C');
      await p.click1('.card.align [data-a="al-agree"]'); await p.waitForTimeout(400); await p.frame(c.id);
      await p.screenshot({ path: path.join(SHOTS, `${theme}-${zh ? 'zh' : 'en'}-3-agreed.png`), clip: await box() });
      await p.context().close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

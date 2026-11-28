#!/usr/bin/env node
/* Survey answers → evidence cards.
 * A CSV export of survey answers (one row per person) dropped on the board becomes a table; when it reads like a survey
 * the table offers "Read as survey". The sheet lists the questions it found (ids, times and contact details skipped), asks
 * which card the answers test, where the survey ran and who answered. Each kept question becomes one evidence card:
 * the answers as bars (or a few written answers), how many answered, the channel and the sample type, a Small sample
 * mark under 30, labelled Reported (answers are what people say), linked to the card it tests. No model is involved.
 *
 *   node tests/survey-evidence.cjs                 (from the repo root)
 *   node tests/survey-evidence.cjs --headed        (watch it)
 *   node tests/survey-evidence.cjs --shots DIR     (also save light/dark, English/Chinese screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const argv = process.argv, arg = k => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : null; };
const FILE = path.resolve(arg('--file') || path.resolve(__dirname, '..', 'Vellum-Lumen.html'));
const SHOTS = arg('--shots');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

const EN = `Timestamp,Email Address,Do you charge your phone while camping?,Which lights do you carry?,How likely are you to buy a lantern that charges a phone? (1-5),What would make you leave your power bank at home?
2026/11/20 10:02,a@x.com,Yes,Headlamp;Lantern,4,"If the lantern held a full phone charge, I'd stop carrying the brick."
2026/11/20 10:15,b@x.com,Yes,Headlamp,5,Knowing it lasts the whole weekend.
2026/11/20 11:40,c@x.com,No,Lantern,2,Nothing. I like having a backup.
2026/11/20 12:01,d@x.com,Yes,Headlamp;Lantern;String lights,4,A USB-C port that also charges the lantern itself.
2026/11/20 13:22,e@x.com,Sometimes,Headlamp,3,Weight. It has to be lighter than both together.
2026/11/21 08:10,f@x.com,Yes,Lantern,5,If my friends could charge from it too.
2026/11/21 09:44,g@x.com,Yes,Headlamp;Lantern,4,Proof it works in the cold.
2026/11/21 10:05,h@x.com,No,Headlamp,1,I don't take my phone camping on purpose.
2026/11/21 14:30,i@x.com,Yes,Lantern;String lights,4,A clear battery gauge on the side.
2026/11/22 09:12,j@x.com,Sometimes,Headlamp,3,Solar top-up during the day.
2026/11/22 18:40,k@x.com,Yes,Headlamp;Lantern,5,Just make it waterproof.
2026/11/23 07:55,l@x.com,Yes,Lantern,4,One cable for everything.`;
const ZH = `序号,提交答卷时间,来源IP,您露营时会给手机充电吗？,您平时带哪些灯？,您愿意买能给手机充电的营地灯吗？,还有什么想说的？
1,2026/11/20 10:02,1.1.1.1,会,头灯┋营地灯,4,要是能充满一次手机，我就不带充电宝了。
2,2026/11/20 10:15,1.1.1.2,会,头灯,5,能撑一个周末就行。
3,2026/11/20 11:40,1.1.1.3,不会,营地灯,2,没有，我喜欢有备用的。
4,2026/11/20 12:01,1.1.1.4,会,头灯┋营地灯┋氛围灯,4,希望是 Type-C 口。
5,2026/11/20 13:22,1.1.1.5,偶尔,头灯,3,重量要比两样加起来轻。`;
const PLAIN = `Product,Price,Rating
Lumen One,49,4
Trail Mini,39,3
Base Camp XL,89,5
Pocket Glow,29,4`;

async function open(browser, base, { theme = 'light', zh = false, scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: scale, colorScheme: theme });
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
  await ctx.route('http://127.0.0.1:59639/**', r => r.abort());
  await ctx.route(/wikipedia\.org/, r => r.abort());
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/x.html'); await p.waitForTimeout(2200);
  await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700);
  await p.evaluate(([t, zh]) => { document.documentElement.dataset.theme = t; if (zh) store.set('.lang', 'zh'); cam = { x: 0, y: 0, s: 1 }; paintCam(); renderAll(); }, [theme, zh]);
  p.drop = (csv, name) => p.evaluate(async ([csv, name]) => { const made = await addFiles([new File([csv], name, { type: 'text/csv' })], { x: 300, y: 260 }, null, { autoAdvisor: false, quiet: true }); return made[0].id; }, [csv, name]);
  p.frame = (ids, s = .78) => p.evaluate(([ids, s]) => { const ns = ids.map(byId); const b = bbox(ns); select([]); cam = { s, x: 640 - (b.x0 + b.x1) / 2 * s, y: 410 - (b.y0 + b.y1) / 2 * s }; paintCam(); renderAll(); }, [ids, s]);
  return p;
}

(async () => {
  const html = fs.readFileSync(FILE);
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !argv.includes('--headed') });
  try {
    // T1. the rules: which columns are questions, what kind, and what one sentence says about each
    {
      const p = await open(browser, base);
      const r = await p.evaluate(([en, zh, plain]) => {
        const ds = t => datasetFromText(t, 'x.csv');
        const brief = q => ({ q: q.q, kind: q.kind, multi: q.multi, n: q.n, top: q.dist[0]?.v, sum: svSummary(q) });
        return { en: svColumns(ds(en)).map(brief), zh: svColumns(ds(zh)).map(brief), plainLooks: looksLikeSurvey(ds(plain)), plainCan: canReadSurvey(ds(plain)),
          enLooks: looksLikeSurvey(ds(en)), zhLooks: looksLikeSurvey(ds(zh)) };
      }, [EN, ZH, PLAIN]);
      const kinds = r.en.map(q => q.kind).join(' ');
      check('Google Forms export: timestamp and email are skipped; choice, multi-choice, scale and open questions are found', r.en.length === 4 && kinds === 'choice choice scale open' && r.en[1].multi, JSON.stringify(r.en));
      check('a choice question reads as "8 of 12 (67%) answered “Yes”."', r.en[0].sum === '8 of 12 (67%) answered “Yes”.', r.en[0].sum);
      check('multi-choice counts each pick and says more than one answer was allowed', r.en[1].top === 'Headlamp' && /picked “Headlamp”.*More than one/.test(r.en[1].sum), r.en[1].sum);
      check('a 1–5 scale reads as an average out of 5', /^Average 3\.7 out of 5, from 12 answers\.$/.test(r.en[2].sum), r.en[2].sum);
      check('written answers are counted, not summarised by a model', r.en[3].sum === '12 open answers.', r.en[3].sum);
      check('Wenjuanxing export: 序号, 提交答卷时间 and 来源IP skipped; ┋ splits multi-choice', r.zh.length === 4 && r.zh[1].multi && r.zh[1].top === '头灯', JSON.stringify(r.zh));
      check('both exports are offered on the card', r.enLooks && r.zhLooks);
      check('a plain comparison table is not offered on the card (still readable from the card strip if it has a closed column)', !r.plainLooks, JSON.stringify(r));
      check('no page errors (rules)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // T2. the flow: drop → Read as survey → sheet → evidence cards linked to the claim
    {
      const p = await open(browser, base);
      const ids = await p.evaluate(() => { const idea = node('idea', { text: 'Campers will pay for a lantern that charges their phone' }, { x: 1180, y: 160 }); renderAll(); persist(); return { idea: idea.id }; });
      ids.tbl = await p.drop(EN, 'lantern-survey.csv');
      await p.frame([ids.tbl], .8); await p.waitForTimeout(300);
      const btn = await p.evaluate(id => nodeEl(id)?.querySelector('[data-tbl-survey]')?.textContent || '', ids.tbl);
      check('the table offers Read as survey on its foot (right side)', btn === 'Read as survey', btn);
      const right = await p.evaluate(id => !!nodeEl(id)?.querySelector('.foot-r [data-tbl-survey]'), ids.tbl);
      check('the button sits in the right-hand group of the foot', right);
      await p.click(`[data-id="${ids.tbl}"] [data-tbl-survey]`); await p.waitForTimeout(300);
      const sheet = await p.evaluate(() => ({ open: dlg.open, qs: [...dlg.querySelectorAll('.sv-q .sv-qt')].map(x => x.textContent), go: dlg.querySelector('[data-sv-go]')?.textContent, last: [...dlg.querySelectorAll('.sv-acts .cbtn')].at(-1)?.hasAttribute('data-sv-go'), opts: dlg.querySelectorAll('select[name=target] option').length }));
      check('the sheet lists the 4 questions and offers to add 4 evidence cards', sheet.open && sheet.qs.length === 4 && sheet.go === 'Add 4 evidence cards', JSON.stringify(sheet));
      check('the primary button is rightmost', sheet.last === true);
      check('the claim on the board is offered as what the answers test', sheet.opts === 2, String(sheet.opts));
      await p.click('.sv-q:nth-child(2) input'); await p.waitForTimeout(80);
      const go2 = await p.evaluate(() => dlg.querySelector('[data-sv-go]').textContent);
      check('unticking a question updates the button', go2 === 'Add 3 evidence cards', go2);
      await p.selectOption('select[name=target]', ids.idea);
      await p.fill('input[name=channel]', 'r/camping');
      if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); }
      await p.click('[data-sv-go]'); await p.waitForTimeout(700);
      const out = await p.evaluate(([tid, iid]) => {
        const t = byId(tid), cards = (t.svy?.cards || []).map(byId);
        return { n: cards.length, closed: !dlg.open, weights: cards.map(c => c.weight), kinds: cards.map(c => c.survey?.kind), sample: cards.map(c => c.survey?.sample), ch: cards[0]?.survey?.channel,
          linked: cards.every(c => board.edges.some(e => e.by === 'you' && ((e.a === c.id && e.b === iid) || (e.b === c.id && e.a === iid)))),
          dir: cards.every(c => board.edges.some(e => e.a === c.id && e.b === iid)),
          ground: groundOf(byId(iid)).k, bars: cards.map(c => nodeEl(c.id)?.querySelectorAll('.sv-row').length || 0), quotes: nodeEl(cards.at(-1)?.id)?.querySelectorAll('.sv-quote').length || 0,
          sampleTxt: nodeEl(cards[0]?.id)?.querySelector('.sv-sample')?.textContent || '', small: !!nodeEl(cards[0]?.id)?.querySelector('.sv-small'), pill: nodeEl(cards[0]?.id)?.querySelector('.weight')?.textContent || '',
          btn: nodeEl(tid)?.querySelector('[data-tbl-survey]')?.textContent || '', logged: (board.log || []).some(l => /as survey answers: 3 evidence cards from 12 responses/.test(l.html || l.text || l.msg || JSON.stringify(l))),
          selected: sel.length };
      }, [ids.tbl, ids.idea]);
      check('3 evidence cards are made and the sheet closes', out.n === 3 && out.closed, JSON.stringify(out));
      check('every card is labelled Reported (answers are what people say)', out.weights.every(w => w === 'reported'), out.weights.join());
      check('each card keeps how many answered, the channel and the sample type', out.ch === 'r/camping' && out.sample.every(s => s === 'self'), JSON.stringify(out));
      check('each card is linked to the claim it tests, reading evidence → judgment', out.linked && out.dir);
      check('the claim now reads as grounded (second-hand) from the one reading of the board', out.ground === 'grounded', out.ground);
      check('closed questions show their answers as bars; the open one shows written answers', out.bars[0] === 3 && out.bars[1] === 5 && out.quotes === 3, JSON.stringify([out.bars, out.quotes]));
      check('the sample line says 12 answered · r/camping · Self-selected · Small sample', /12 answered, small sample.*r\/camping.*Self-selected/.test(out.sampleTxt) && out.small, out.sampleTxt);
      check('the label pill reads Reported', /Reported/.test(out.pill), out.pill);
      check('the table now offers the 3 cards instead of reading again', out.btn === '3 evidence cards', out.btn);
      check('the new cards are selected', out.selected === 3, String(out.selected));
      check('the change log says what happened', out.logged);
      if (SHOTS) {
        // one screen per theme/language is made below (T4); keep T2 fast
      }
      await p.evaluate(() => undo()); await p.waitForTimeout(400);
      const after = await p.evaluate(tid => ({ live: svLive(byId(tid)).length, btn: nodeEl(tid)?.querySelector('[data-tbl-survey]')?.textContent || '' }), ids.tbl);
      check('Undo takes the cards away and the table offers Read as survey again', after.live === 0 && after.btn === 'Read as survey', JSON.stringify(after));
      const strip = await p.evaluate(tid => stripActs(byId(tid)).map(a => a.k), ids.tbl);
      check('the card strip has Read as survey too', strip.includes('survey'), strip.join());
      const plainStrip = await p.evaluate(async plain => { const m = await addFiles([new File([plain], 'p.csv', { type: 'text/csv' })], { x: 300, y: 900 }, null, { autoAdvisor: false, quiet: true }); return { acts: stripActs(m[0]).map(a => a.k), btn: !!nodeEl(m[0].id)?.querySelector('[data-tbl-survey]') }; }, PLAIN);
      check('a plain table shows no survey button on the card', !plainStrip.btn, JSON.stringify(plainStrip));
      check('no page errors (flow)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // T3. Chinese export, read in Chinese, recruited sample
    {
      const p = await open(browser, base, { zh: true });
      const tid = await p.drop(ZH, '营地灯问卷.csv');
      await p.frame([tid], .8);
      const btn = await p.evaluate(id => nodeEl(id)?.querySelector('[data-tbl-survey]')?.textContent || '', tid);
      check('Chinese: the table offers 按问卷读取', btn === '按问卷读取', btn);
      await p.click(`[data-id="${tid}"] [data-tbl-survey]`); await p.waitForTimeout(300);
      await p.click('.sv-seg [data-s="recruited"]');
      const go = await p.evaluate(() => dlg.querySelector('[data-sv-go]').textContent);
      check('Chinese: 添加 4 张证据卡', go === '添加 4 张证据卡', go);
      await p.click('[data-sv-go]'); await p.waitForTimeout(600);
      const r = await p.evaluate(tid => { const cs = svLive(byId(tid)); return { n: cs.length, sample: cs.map(c => c.survey.sample), txt: nodeEl(cs[0].id)?.querySelector('.sv-sample')?.textContent || '', sum: cs[0].text, eb: nodeEl(cs[0].id)?.querySelector('.eb')?.textContent || '' }; }, tid);
      check('Chinese: 4 cards, recruited, sample line in Chinese', r.n === 4 && r.sample.every(s => s === 'recruited') && /5 人作答，样本偏小.*招募样本/.test(r.txt), JSON.stringify(r));
      check('Chinese: the summary sentence is in Chinese', r.sum === '5 人中有 3 人（60%）选了“会”。', r.sum);
      check('Chinese: the eyebrow says 问卷', r.eb === '问卷', r.eb);
      check('no page errors (Chinese)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // T4. screenshots: light/dark × English/Chinese, the sheet and the cards
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      for (const theme of ['light', 'dark']) for (const zh of [false, true]) {
        const p = await open(browser, base, { theme, zh, scale: 2 });
        const tag = `${theme}-${zh ? 'zh' : 'en'}`;
        const iid = await p.evaluate(zh => { const n = node('idea', { text: zh ? '露营的人愿意为能给手机充电的营地灯付钱' : 'Campers will pay for a lantern that charges their phone' }, { x: 1180, y: 160 }); renderAll(); persist(); return n.id; }, zh);
        const tid = await p.drop(zh ? ZH : EN, zh ? '营地灯问卷.csv' : 'lantern-survey.csv');
        await p.frame([tid], .8); await p.waitForTimeout(400);
        await p.screenshot({ path: path.join(SHOTS, `${tag}-1-table.png`) });
        await p.click(`[data-id="${tid}"] [data-tbl-survey]`); await p.waitForTimeout(250);
        await p.selectOption('select[name=target]', iid);
        await p.fill('input[name=channel]', zh ? '小红书粉丝' : 'r/camping');
        await p.waitForTimeout(250);
        await p.screenshot({ path: path.join(SHOTS, `${tag}-2-sheet.png`) });
        await p.click('[data-sv-go]'); await p.waitForTimeout(900);
        const cs = await p.evaluate(tid => svLive(byId(tid)).map(c => c.id), tid);
        await p.evaluate(() => select([])); await p.frame([tid, ...cs, iid], .62); await p.waitForTimeout(700);
        await p.screenshot({ path: path.join(SHOTS, `${tag}-3-cards.png`) });
        await p.frame([cs[0], cs[1]], 1.15); await p.waitForTimeout(500);
        await p.screenshot({ path: path.join(SHOTS, `${tag}-4-card-close.png`) });
        if (p.errors.length) check(`no page errors (${tag} shots)`, false, p.errors.join(' | '));
        await p.context().close();
      }
    }
  } finally { await browser.close(); srv.close(); }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

#!/usr/bin/env node
/* Directions that rest on assumptions are flagged, quietly, from one reading of the board.
 * - groundOf() is the single reading: none · assumed (proposals or illustrations only) · unrated · grounded. The card's
 *   evidence line, the direction flag, the evidence card, the decision view and the board check all agree with it.
 * - Before you choose, a direction is flagged only when a sibling is better backed (otherwise the claim's evidence line
 *   already says it once). Once adopted, the decision carries the flag until evidence or a test result backs it.
 *   A direction set aside never carries it. Unrated sources are not called assumptions: rating them comes first.
 * - Adopting a flagged direction: the Critic challenges once, as a board check (no model), after you pause, naming the
 *   direction's own test. Focus keeps it waiting. Backing the decision later takes the note down. Nothing changes the decision.
 *   node tests/assumption-flag.cjs            (from the repo root)
 *   SHOTS=dir node tests/assumption-flag.cjs  (also save light/dark, English/Chinese screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
const results = []; let failures = 0; const requests = [];
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

async function open(b, base, { theme = 'light', lang = 'en' } = {}) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, deviceScaleFactor: SHOTS ? 2 : 1 });
  await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route(/wikipedia|wikimedia|gdcvault/, r => r.abort()); await c.route(/openrouter|chat\/completions/, r => { requests.push(r.request().url()); r.abort(); });
  const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
  if (lang === 'zh') { await p.evaluate(() => store.set('.lang', 'zh')); await p.reload(); await p.waitForTimeout(2200); }
  await p.evaluate(() => { IDLE_NEED.matters = 250; IDLE_NEED.often = 150; });
  /* a fresh board: one claim backed by a proposal, directions A and B from it */
  await p.click('#projectBtn'); await p.waitForTimeout(300); await p.locator('#boardsPop [data-new]').click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700);
  p.ids = await p.evaluate(zh => {
    const T = (e, z) => zh ? z : e;
    const claim = node('idea', { text: T('Night hikers will trust a lantern that tells them how many hours are left', '夜间徒步的人会更信任能显示剩余小时数的营地灯') }, { x: 0, y: 0 });
    const prop = node('note', { text: T('Our guess: a countdown feels safer than a battery bar', '我们的猜测：倒计时比电量条更让人安心'), weight: 'proposed' }, { x: -460, y: 0 });
    edge(prop.id, claim.id, 'src', 'live');
    const a = node('direction', { idea: claim.id, letter: 'A', title: T('Hours-left ring', '剩余时间光环'), text: T('A ring of light that shrinks as hours run out.', '一圈随剩余时间缩短的光环。'), test: T('8 of 10 hikers read the hours left at a glance', '10 位徒步者中有 8 位一眼读出剩余时间'), mode: 'story' }, { x: 460, y: -220 });
    const bb = node('direction', { idea: claim.id, letter: 'B', title: T('Spoken countdown', '语音倒计时'), text: T('The lantern says the hours left when you tap it twice.', '双击时，营地灯会说出剩余时间。'), test: T('Hikers ask for the countdown on 3 of 4 nights', '4 个晚上里有 3 晚徒步者会主动问剩余时间'), mode: 'story' }, { x: 460, y: 260 });
    edge(claim.id, a.id, 'derive', 'live'); edge(claim.id, bb.id, 'derive', 'live');
    renderAll(); persistNow(); runBoardChecks();
    return { claim: claim.id, prop: prop.id, a: a.id, b: bb.id };
  }, lang === 'zh');
  p.flag = id => p.evaluate(id => nodeEl(id)?.querySelector('.dir-flag .ev-txt')?.textContent || '', id);
  p.pins = () => p.evaluate(() => Object.entries(board.pins || {}).flatMap(([id, ps]) => (ps || []).filter(x => x.check).map(x => ({ on: id, kind: x.check, note: x.note, seen: !!x.seen }))));
  return p;
}
async function shot(p, name) { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }); }
async function hoverFlag(p, id) { await p.locator(`.card[data-id="${id}"] .dir-flag`).hover(); await p.waitForTimeout(500); }

(async () => {
  const srv = http.createServer((q, r) => { if (q.url.startsWith('/Vellum-Lumen.html')) { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(r); } r.writeHead(404); r.end(); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch();
  try {
    const p = await open(b, base); const { claim, a, b: B } = p.ids;

    /* 1. all assumed, nothing chosen: said once, on the claim */
    const s1 = await p.evaluate(r => ({ claim: nodeEl(r.claim).querySelector('.ev-line .ev-txt')?.textContent, ga: groundOf(byId(r.a)).k, gb: groundOf(byId(r.b)).k, fa: !!nodeEl(r.a).querySelector('.dir-flag'), fb: !!nodeEl(r.b).querySelector('.dir-flag') }), p.ids);
    check('only proposals behind the claim: its evidence line says "Proposals only"', s1.claim === 'Proposals only', JSON.stringify(s1));
    check('with every direction resting on the same proposals, no direction repeats it', s1.ga === 'assumed' && s1.gb === 'assumed' && !s1.fa && !s1.fb, JSON.stringify(s1));

    /* 2. A gets observed evidence: now B stands out */
    await p.evaluate(r => { const e = node('source', { title: 'Night walk: 7 of 9 checked the ring without stopping', text: 'Observed on a guided night walk.', weight: 'observed' }, { x: 900, y: -460 }); makeRelation(e.id, r.a, { rel: 'supports' }); renderAll(); persist(); }, p.ids); await p.waitForTimeout(300);
    const s2 = await p.evaluate(r => ({ ga: groundOf(byId(r.a)).k, fa: !!nodeEl(r.a).querySelector('.dir-flag'), fb: nodeEl(r.b).querySelector('.dir-flag .ev-txt')?.textContent, inTest: !!nodeEl(r.b).querySelector('.test-h .dir-flag') }), p.ids);
    check('a better-backed sibling makes the flag useful: B says "Proposals only" on its test, A says nothing', s2.ga === 'grounded' && !s2.fa && s2.fb === 'Proposals only' && s2.inTest, JSON.stringify(s2));
    await hoverFlag(p, B);
    const pop = await p.evaluate(() => ({ head: $('byPop').querySelector('.ev-head b')?.textContent, test: $('byPop').querySelector('.ev-test')?.textContent, acts: [...$('byPop').querySelectorAll('[data-ev-act]')].map(x => x.textContent).join(',') }));
    check('the flag opens the evidence card: the same verdict, what it rests on, its test as the way to find out, and Record result', pop.head === 'Proposals only' && /quickest way to find out/.test(pop.test) && pop.acts === 'View,Record result', JSON.stringify(pop));
    await p.mouse.move(700, 850); await p.waitForTimeout(300);

    /* 3. adopt B anyway: allowed, flagged, and the Critic speaks once after a pause */
    await p.evaluate(r => { lastUserAct = NOW(); select([r.b]); adopt(byId(r.b)); }, p.ids); await p.waitForTimeout(600);
    const s3 = await p.evaluate(r => ({ pulse: nodeEl(r.b).querySelector('.dir-flag')?.classList.contains('pulse'), brief: stageBrief(), adopted: board.adopted[r.claim] === r.b, fb: nodeEl(r.b).querySelector('.dir-flag .ev-txt')?.textContent, stamp: !!nodeEl(r.b).querySelector('.stamp'), fa: !!nodeEl(r.a).querySelector('.dir-flag'), aside: !!nodeEl(r.a).querySelector('.aside') }), p.ids);
    check('deciding on assumptions: the flag pulses once, with no extra words in the toast', s3.pulse && await p.evaluate(() => !/assumption|proposals/i.test(document.querySelector('.toast')?.textContent || '')), JSON.stringify(s3));
    check('Copilot\'s brief names the decision resting on proposals only', /Resting on proposals only[^.]*Spoken countdown/.test(s3.brief), s3.brief);
    check('adopting a direction that rests on proposals is never blocked; the decision keeps the flag beside its stamp', s3.adopted && s3.stamp && s3.fb === 'Proposals only', JSON.stringify(s3));
    check('the direction set aside carries no flag', s3.aside && !s3.fa, JSON.stringify(s3));
    check('nothing lands while you are still working', (await p.pins()).length === 0);
    await p.evaluate(() => { lastUserAct = NOW() - 10000; }); await p.waitForTimeout(1800);
    let pins = await p.pins();
    check('after a pause, the Critic says it once on the decision, as a board check, naming its test', pins.length === 1 && pins[0].on === B && pins[0].kind === 'assume' && /proposals only/.test(pins[0].note) && /3 of 4 nights/.test(pins[0].note) && /decision stays as you made it/.test(pins[0].note), JSON.stringify(pins));
    await p.evaluate(r => { focusNodes([byId(r.b), byId(r.a)], .9, 0); }, p.ids); await p.waitForTimeout(700);
    await p.evaluate(id => toggleAdvPop(id), B); await p.waitForTimeout(450);
    const adv = await p.evaluate(() => ({ tag: $('advPop').querySelector('.adv-eng')?.textContent, t: $('advPop').innerText }));
    check('opened, it is labelled a board check', adv.tag === 'board check', JSON.stringify(adv));
    await shot(p, 'light-en-2-critic-once');
    await p.evaluate(() => closeAdvPop()); await p.waitForTimeout(200);
    await p.evaluate(() => { runBoardChecks(); deliverChecks({ all: true }); }); await p.waitForTimeout(200);
    check('it does not come back', (await p.pins()).filter(x => x.kind === 'assume').length === 1);

    /* 4. the decision view reads the same */
    await p.keyboard.press('Escape'); await p.evaluate(() => openDecisions(true)); await p.waitForTimeout(450);
    await p.evaluate(() => document.querySelector('.dv-ev:not(.dv-since)')?.setAttribute('open', '')); await p.waitForTimeout(200);
    const dv = await p.evaluate(() => { const s = document.querySelector('.dv-ev:not(.dv-since)'); return { txt: s?.querySelector('summary')?.textContent, thin: s?.classList.contains('thin') }; });
    check('the decision view says the same words for what it rests on', /Proposals only/.test(dv.txt) && /1 source/.test(dv.txt) && dv.thin, JSON.stringify(dv));
    await p.evaluate(r => focusNodes([byId(r.b), byId(r.a), byId(r.claim)], .85, 0), p.ids); await p.waitForTimeout(500);
    await hoverFlag(p, B); await shot(p, 'light-en-1-flag-and-decision-view');
    await p.mouse.move(900, 860); await p.evaluate(() => openDecisions(false)); await p.waitForTimeout(400);

    await hoverFlag(p, B); await p.click('#byPop [data-ev-act="result"]'); await p.waitForTimeout(400);
    check('Record result opens the result dialog for that direction', await p.evaluate(() => !!document.querySelector('#resForm')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    /* 5. evidence arrives: the flag and the note come down, the decision stays */
    await p.evaluate(r => { const e = node('source', { title: 'Trail log: hikers asked for the countdown on 3 of 4 nights', text: '', weight: 'reported' }, { x: 900, y: 600 }); makeRelation(e.id, r.b, { rel: 'supports' }); renderAll(); persist(); runBoardChecks(); renderAll(); }, p.ids); await p.waitForTimeout(400);
    const s5 = await p.evaluate(r => ({ k: groundOf(byId(r.b)).k, fb: !!nodeEl(r.b).querySelector('.dir-flag'), adopted: board.adopted[r.claim] === r.b }), p.ids);
    check('reported evidence behind it: the flag goes, the decision is unchanged', s5.k === 'grounded' && !s5.fb && s5.adopted, JSON.stringify(s5));
    check('the Critic\'s note is taken down once it is no longer true', (await p.pins()).filter(x => x.kind === 'assume').length === 0);
    await p.evaluate(() => undo()); await p.waitForTimeout(300);

    /* 6. a test result is an observation; unrated sources are not called assumptions */
    await p.evaluate(r => { setOutcome(byId(r.b), 'passed', 'Asked on 3 of 4 nights.'); }, p.ids); await p.waitForTimeout(300);
    check('a recorded test result lifts the flag', await p.evaluate(id => !nodeEl(id).querySelector('.dir-flag') && groundOf(byId(id)).tested, B));
    await p.evaluate(() => undo()); await p.waitForTimeout(300);
    check('Undo brings it back', (await p.flag(B)) === 'Proposals only');
    await p.evaluate(r => { byId(r.prop).weight = undefined; delete byId(r.prop).weight; renderAll(); }, p.ids); await p.waitForTimeout(300);
    const s6 = await p.evaluate(r => ({ k: groundOf(byId(r.b)).k, fb: !!nodeEl(r.b).querySelector('.dir-flag'), claim: nodeEl(r.claim).querySelector('.ev-line .ev-txt')?.textContent }), p.ids);
    check('an unrated source could still be evidence: "Not rated yet", no flag', s6.k === 'unrated' && !s6.fb && s6.claim === 'Not rated yet', JSON.stringify(s6));
    await p.evaluate(r => { byId(r.prop).weight = 'proposed'; renderAll(); }, p.ids); await p.waitForTimeout(300);

    /* 7. Focus: the flag is a fact and stays; the Critic waits */
    await p.evaluate(r => { board.pins = {}; board.watch.done = board.watch.done.filter(s => !s.startsWith('as:')); delete board.adopted[r.claim]; renderAll(); persist(); }, p.ids);
    await p.click('#partSw [data-part="never"]'); await p.waitForTimeout(300);
    await p.evaluate(r => { adopt(byId(r.b)); lastUserAct = NOW() - 10000; }, p.ids); await p.waitForTimeout(1800);
    check('Focus: the flag stays on the card (a fact), the Critic stays quiet and waits', (await p.flag(B)) === 'Proposals only' && (await p.pins()).length === 0 && await p.evaluate(() => board.watch.queue.some(o => o.kind === 'assume')));
    await p.click('#partSw [data-part="matters"]'); await p.waitForTimeout(600);
    check('leaving Focus brings it in the one catch-up', await p.evaluate(() => !$('catchUp').hidden && /proposals only/.test($('catchUp').textContent)));

    /* card fit: the bottom row stays inside the card */
    const fit = await p.evaluate(id => { const out = []; for (const sel of ['.foot', '.test-h', '.dir-flag']) { const c = nodeEl(id).getBoundingClientRect(), el = nodeEl(id).querySelector(sel); if (!el) { out.push(sel + ' missing'); continue } const f = el.getBoundingClientRect(); if (f.right > c.right + .5 || f.left < c.left - .5) out.push(sel + ' outside') } const t = nodeEl(id).querySelector('.dir-flag .ev-txt'); if (!t || t.scrollWidth > t.clientWidth + 1 || t.clientWidth < 20) out.push('text clipped'); const fl = nodeEl(id).querySelector('.foot-l'); if (fl && fl.scrollWidth > fl.clientWidth + 1) out.push('foot clipped'); return { inside: !out.length, clipped: false, out }; }, B);
    check('the flag and the bottom row fit the card without clipping', fit.inside && !fit.clipped, JSON.stringify(fit));
    const nt = await p.evaluate(r => { const c = node('direction', { idea: r.claim, letter: 'C', title: 'Lantern hums when low', text: 'A low hum when two hours are left.', mode: 'story' }, { x: 460, y: 760 }); edge(r.claim, c.id, 'derive', 'live'); delete board.adopted[r.claim]; adopt(c); renderAll(); const el = nodeEl(c.id), f = el.querySelector('.dir-flag-row .dir-flag .ev-txt'), card = el.getBoundingClientRect(), fl = el.querySelector('.foot-l'); return { txt: f?.textContent, ok: !!f && f.scrollWidth <= f.clientWidth + 1 && f.clientWidth > 20 && fl.scrollWidth <= fl.clientWidth + 1 }; }, p.ids);
    check('a direction with no test carries the flag on a quiet row of its own, unclipped', nt.txt === 'Proposals only' && nt.ok, JSON.stringify(nt));
    await p.evaluate(() => undo()); await p.waitForTimeout(200);
    check('no model was asked for any of this', requests.length === 0, requests.join(' '));
    check('no page errors', p.errs.length === 0, p.errs.join(' | '));
    await p.context().close();

    /* Chinese and dark */
    for (const [theme, lang] of [['dark', 'zh'], ['dark', 'en'], ['light', 'zh']]) {
      const q = await open(b, base, { theme, lang }); const r = q.ids;
      await q.evaluate(r => { const e = node('source', { title: 'Night walk: 7 of 9', text: '', weight: 'observed' }, { x: 900, y: -460 }); makeRelation(e.id, r.a, { rel: 'supports' }); adopt(byId(r.b)); lastUserAct = NOW() - 10000; }, r); await q.waitForTimeout(1800);
      const z = await q.evaluate(r => ({ flag: nodeEl(r.b).querySelector('.dir-flag .ev-txt')?.textContent, note: Object.values(board.pins || {}).flat().find(x => x.check === 'assume')?.note || '' }), r);
      if (lang === 'zh') check(`${theme} Chinese: 只靠设想 on the card and in the Critic's note`, z.flag === '只靠设想' && /只靠设想/.test(z.note) && /验证标准/.test(z.note), JSON.stringify(z));
      await q.evaluate(() => openDecisions(true)); await q.waitForTimeout(400);
      await q.evaluate(() => document.querySelector('.dv-ev:not(.dv-since)')?.setAttribute('open', ''));
      await q.evaluate(r => focusNodes([byId(r.b), byId(r.a), byId(r.claim)], .85, 0), r); await q.waitForTimeout(600);
      await hoverFlag(q, r.b); await shot(q, `${theme}-${lang}-1-flag-and-decision-view`);
      await q.mouse.move(900, 860); await q.evaluate(() => openDecisions(false)); await q.waitForTimeout(400);
      await q.evaluate(r => focusNodes([byId(r.b), byId(r.a)], .9, 0), r); await q.waitForTimeout(600);
      await q.evaluate(id => toggleAdvPop(id), r.b); await q.waitForTimeout(450); await shot(q, `${theme}-${lang}-2-critic-once`);
      check(`${theme} ${lang}: no page errors`, q.errs.length === 0, q.errs.join(' | '));
      await q.context().close();
    }
  } finally { await b.close(); srv.close(); }
  console.log(results.join('\n')); console.log(`\n${results.length - failures}/${results.length} passed`); process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

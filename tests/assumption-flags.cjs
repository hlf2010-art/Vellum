#!/usr/bin/env node
/* Assumption flags: a direction nothing observed or reported backs yet says so before you adopt it.
 * The claim's evidence shows the problem, not that one answer to it works, so only evidence tied to the direction
 * itself counts (snapped beside it, connected or wired in, not as a counter), or its own test having passed.
 * The kept card shows "Assumptions only" in its test box, with a hover card that says why and offers Record result;
 * drafts are not flagged. Adopting such a direction says so in the toast, rings the flag, and the crew speaks up once,
 * right then (Focus keeps it for the catch-up). The stage brief tells the crew which directions rest on assumptions.
 * Drives the real Vellum-Lumen.html; no model is involved.
 *
 *   node tests/assumption-flags.cjs            (from the repo root)
 *   node tests/assumption-flags.cjs --headed   (watch it)
 *   SHOTS=dir node tests/assumption-flags.cjs  (also save light, dark and Chinese screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
const results = []; let failures = 0, modelCalls = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp); }
      if (req.method === 'POST') modelCalls++;
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function open(browser, base, { theme = 'light', lang = 'en' } = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, deviceScaleFactor: SHOTS ? 2 : 1 });
  await c.route('http://127.0.0.1:59631/**', r => r.abort());
  await c.route('http://127.0.0.1:59639/**', r => r.abort());
  await c.route(/wikipedia\.org|wikimedia\.org/, r => r.abort());
  const p = await c.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2000);
  if (lang === 'zh') { await p.evaluate(() => store.set('.lang', 'zh')); await p.reload(); await p.waitForTimeout(2000); }
  await p.evaluate(() => { IDLE_NEED.matters = 250; IDLE_NEED.often = 150; });
  await p.click('#projectBtn'); await p.waitForTimeout(300); await p.locator('#boardsPop [data-new]').click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700);
  /* a claim backed by observed evidence, with two kept directions and one draft */
  p.ids = await p.evaluate(() => {
    board.title = 'Lantern';
    const claim = node('idea', { text: 'Solo hikers want a lantern that hangs, stands and clips' }, { x: 0, y: 0 });
    const ev = node('source', { title: 'Field notes: 6 of 8 hikers hung their light on a branch', text: 'Watched at a campsite over two nights.', weight: 'observed' }, { x: -480, y: 0 });
    edge(ev.id, claim.id, 'src', 'live');
    const mk = (letter, title, test, y, status = 'ink') => { const d = node('direction', { idea: claim.id, letter, title: `${letter} · ${title}`, text: `${title} as the main way to carry it.`, test, mode: 'story', status }, { x: 480, y }); edge(claim.id, d.id, 'derive', 'live'); return d; };
    const A = mk('A', 'Carabiner body', 'Eight hikers set up camp in the dark; it fails if more than two drop it.', -380);
    const B = mk('B', 'Folding tripod', 'Stands on uneven ground for a whole evening.', 40);
    const C = mk('C', 'Magnetic puck', 'Sticks to a trekking pole on a rough trail.', 460, 'sketch');
    const bEv = node('source', { title: 'Playtest: tripod stood on gravel for 3 hours', text: 'Observed on test night.', weight: 'observed' }, { x: 960, y: 40 });
    makeRelation(bEv.id, B.id, { via: 'snap', rel: 'supports' });
    renderAll(); persistNow(); runBoardChecks();
    return { claim: claim.id, A: A.id, B: B.id, C: C.id, bEv: bEv.id };
  });
  p.flagged = id => p.evaluate(id => !!document.querySelector(`.card[data-id="${id}"] .test .res.assume [data-assume]`), id);
  p.pins = id => p.evaluate(id => (board.pins?.[id] || []).filter(x => x.check === 'assume').map(x => x.note), id);
  p.toasts = () => p.evaluate(() => [...document.querySelectorAll('.toast span')].map(t => t.textContent));
  p.show = async id => { await p.evaluate(id => { focusNodes([byId(id)], 1.05, 0); }, id); await p.waitForTimeout(500); };
  return p;
}

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    /* ── 1. the card ────────────────────────────────────────────────────── */
    const p = await open(browser, base);
    const { A, B, C, bEv, claim } = p.ids;
    check('a kept direction with only the claim\'s evidence behind it is flagged', await p.flagged(A) && await p.evaluate(id => onAssumptions(byId(id)), A));
    check('the flag reads "Assumptions only · no real evidence yet", in the test box', await p.evaluate(id => document.querySelector(`.card[data-id="${id}"] .res.assume`)?.innerText.replace(/\s+/g, ' ').trim(), A) === 'Assumptions only · no real evidence yet');
    check('a direction with observed evidence snapped beside it is not flagged', !(await p.flagged(B)) && await p.evaluate(id => !onAssumptions(byId(id)), B));
    check('a draft is not flagged on its card', !(await p.flagged(C)));
    check('the flag fits: its words are not cut off', await p.evaluate(id => { const t = document.querySelector(`.card[data-id="${id}"] [data-assume] .ev-txt b`); return t && t.scrollWidth <= t.clientWidth + 1; }, A));
    check('the card footer is left as it was (no flag squeezed in beside Adopted)', await p.evaluate(id => !document.querySelector(`.card[data-id="${id}"] .foot [data-assume]`), A));

    /* the hover card */
    await p.show(A);
    await p.focus(`.card[data-id="${A}"] [data-assume]`); await p.waitForTimeout(350);
    const pop = await p.evaluate(() => { const d = $('byPop'); return { open: !d.hidden, ev: d.classList.contains('is-ev'), head: d.querySelector('.ev-head b')?.textContent, t: d.innerText, btn: [...d.querySelectorAll('[data-ev-act]')].map(b => b.dataset.evAct + ':' + b.textContent) }; });
    check('focusing the flag opens its card: Assumptions only', pop.open && pop.ev && pop.head === 'Assumptions only', JSON.stringify(pop));
    check('it says why the claim\'s evidence does not count', /claim's evidence shows the problem, not that this answer works/.test(pop.t), pop.t);
    check('it shows the direction\'s test as the way to find out', /Its test would tell you/.test(pop.t) && /fails if more than two drop it/.test(pop.t), pop.t);
    check('its one action is Record result', pop.btn.join() === 'result:Record result', pop.btn.join());
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'light-1-flag-hover.png') });
    await p.click('#byPop [data-ev-act="result"]'); await p.waitForTimeout(400);
    check('Record result opens the result dialog for that direction', await p.evaluate(() => !!document.querySelector('#resForm')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);

    /* what counts and what does not */
    await p.evaluate(id => { const n = node('note', { text: 'Idea: a glow-in-the-dark clip', weight: 'proposed' }, { x: 960, y: -380 }); makeRelation(n.id, id, { via: 'snap', rel: 'supports' }); renderAll(); }, A);
    check('a proposal tied to it does not count as evidence', await p.flagged(A));
    await p.evaluate(id => { const n = node('source', { title: 'Review: carabiner lights snap off', text: 'Seen in 3 returns.', weight: 'observed' }, { x: 960, y: -160 }); makeRelation(n.id, id, { via: 'wire', rel: 'conflicts' }); renderAll(); }, A);
    check('observed evidence tied as a counter does not back it', await p.flagged(A));
    await p.focus(`.card[data-id="${A}"] [data-assume]`); await p.waitForTimeout(350);
    const pop2 = await p.evaluate(() => $('byPop').innerText);
    check('the hover card names what is tied to it but is not evidence', /1 tied to it is not evidence/.test(pop2), pop2);
    await p.evaluate(() => closeByPop(0));
    const syn = await p.evaluate(id => { const s = node('synthesis', { title: 'What hikers did', of: [], weights: { observed: 2 } }, { x: 960, y: 900 }); const d = byId(id); const r = makeRelation(s.id, d.id, { via: 'snap', rel: 'related' }); renderAll(); const ok = !onAssumptions(d); deleteEdgeById(r.e.id); renderAll(); return { ok, back: onAssumptions(d) }; }, C);
    check('a synthesis of observed evidence counts, and taking it away brings the flag back', syn.ok && syn.back, JSON.stringify(syn));

    /* ── 2. adopting it ─────────────────────────────────────────────────── */
    await p.evaluate(() => { lastUserAct = NOW(); });   /* still working: the crew would normally wait for a pause */
    await p.evaluate(id => adopt(byId(id)), A); await p.waitForTimeout(250);
    let toasts = await p.toasts();
    check('adopting it says so in the toast, with Undo', toasts.some(t => /^Adopted Carabiner body|^Adopted A · Carabiner body/.test(t) && /on assumptions only/.test(t)) && await p.evaluate(() => [...document.querySelectorAll('.toast')].some(t => /assumptions only/.test(t.textContent) && /Undo/.test(t.textContent))), toasts.join(' | '));
    check('the flag rings once', await p.evaluate(id => !!document.querySelector(`.card[data-id="${id}"] [data-assume].ring`), A));
    let pins = await p.pins(A);
    check('the crew speaks up right then, without waiting for a pause', pins.length === 1, JSON.stringify(pins));
    check('it says the decision rests on assumptions, stays yours, and names the test', /assumptions only/.test(pins[0] || '') && /decision stays yours/.test(pins[0] || '') && /fails if more than two drop it/.test(pins[0] || ''), pins[0]);
    check('it is a board check with no model behind it', await p.evaluate(id => board.pins[id].find(x => x.check === 'assume').engine === 'rules', A));
    check('the card shows its unread dot', await p.evaluate(id => !!document.querySelector(`[data-adv-pin="${id}"] .adv-dot`), A));
    await p.focus(`.card[data-id="${A}"] [data-assume]`); await p.waitForTimeout(350);
    check('once adopted, the hover card reads "Adopted on assumptions"', await p.evaluate(() => $('byPop').querySelector('.ev-head b')?.textContent) === 'Adopted on assumptions');
    await p.evaluate(() => closeByPop(0));
    check('the stage brief tells the crew it rests on assumptions', /Resting on assumptions only[^.]*A · Carabiner body \(adopted\)/.test(await p.evaluate(() => stageBrief())), await p.evaluate(() => stageBrief()));
    await p.evaluate(() => { lastUserAct = NOW() - 10000; runBoardChecks(); deliverChecks({ all: true }); });
    check('the board check does not say it a second time', (await p.pins(A)).length === 1);

    /* once, also after Undo */
    await p.evaluate(() => undo()); await p.waitForTimeout(200);
    check('Undo takes the adoption and its note back', await p.evaluate(({ A, claim }) => board.adopted[claim] !== A, { A, claim }) && (await p.pins(A)).length === 0);
    await p.evaluate(id => adopt(byId(id)), A); await p.waitForTimeout(250);
    check('adopting it again does not repeat the note, but the toast still says so', (await p.pins(A)).length === 0 && (await p.toasts()).some(t => /on assumptions only/.test(t)));

    /* a backed direction adopts plainly */
    await p.evaluate(id => adopt(byId(id)), B); await p.waitForTimeout(250);
    toasts = await p.toasts();
    check('adopting a backed direction shows the plain toast and no note', toasts.some(t => t === 'Adopted B · Folding tripod' || t === 'Adopted Folding tripod') && !toasts.slice(-1)[0].includes('assumptions') && (await p.pins(B)).length === 0, toasts.join(' | '));

    /* the test spoke, or evidence arrived */
    await p.evaluate(id => setOutcome(byId(id), 'passed', '7 of 8 kept it clipped on'), A); await p.waitForTimeout(200);
    check('a recorded result replaces the flag', !(await p.flagged(A)) && await p.evaluate(id => /Passed/.test(document.querySelector(`.card[data-id="${id}"] .test .res`)?.textContent || ''), A));
    await p.evaluate(id => setOutcome(byId(id), null), A); await p.waitForTimeout(200);
    check('clearing it brings the flag back', await p.flagged(A));
    const tie = await p.evaluate(id => { const n = node('recording', { title: 'Night test: 1 of 8 dropped it', weight: 'reported' }, { x: 960, y: -600 }); makeRelation(n.id, id, { via: 'snap', rel: 'supports' }); renderAll(); return n.id; }, A);
    await p.waitForTimeout(150);
    check('reported evidence snapped beside it clears the flag at once', !(await p.flagged(A)));
    check('and the brief no longer lists it', !/Resting on assumptions only[^.]*Carabiner/.test(await p.evaluate(() => stageBrief())));
    check('no page errors', p.errors.length === 0, p.errors.join(' | '));
    await p.context().close();

    /* ── 3. Focus keeps it for the catch-up ─────────────────────────────── */
    const f = await open(browser, base);
    await f.evaluate(() => setSpeak('never'));
    await f.evaluate(id => adopt(byId(id)), f.ids.A); await f.waitForTimeout(250);
    check('in Focus the toast still says it, but nothing lands on the card', (await f.toasts()).some(t => /on assumptions only/.test(t)) && (await f.pins(f.ids.A)).length === 0 && await f.evaluate(id => board.watch.queue.some(o => o.sig === 'as:' + id), f.ids.A));
    await f.evaluate(() => { board.focusAt = NOW() - 10 * 60000; setSpeak('matters'); }); await f.waitForTimeout(700);
    check('leaving Focus brings it in the catch-up', (await f.pins(f.ids.A)).length === 1 && await f.evaluate(() => [...document.querySelectorAll('#catchUp [data-cu-go]')].some(b => /assumptions only/.test(b.innerText))));
    check('no page errors (Focus)', f.errors.length === 0, f.errors.join(' | '));
    await f.context().close();

    if (SHOTS) {   /* a clean board for the picture: just the adopt */
      const l = await open(browser, base);
      await l.evaluate(id => adopt(byId(id)), l.ids.A); await l.waitForTimeout(900); await l.show(l.ids.A);
      await l.screenshot({ path: path.join(SHOTS, 'light-2-adopted-on-assumptions.png') });
      await l.context().close();
    }

    /* ── 4. dark and Chinese ────────────────────────────────────────────── */
    const d = await open(browser, base, { theme: 'dark' });
    await d.evaluate(id => adopt(byId(id)), d.ids.A); await d.waitForTimeout(300);
    const contrast = await d.evaluate(id => { const b = document.querySelector(`.card[data-id="${id}"] [data-assume] .ev-txt b`); const c = getComputedStyle(b).color; return c; }, d.ids.A);
    check('dark theme: the flag text is light, not dark-on-dark', /rgba?\((2[0-9]{2}|1[6-9][0-9]),/.test(contrast), contrast);
    if (SHOTS) { await d.show(d.ids.A); await d.screenshot({ path: path.join(SHOTS, 'dark-2-adopted-on-assumptions.png') }); await d.focus(`.card[data-id="${d.ids.A}"] [data-assume]`); await d.waitForTimeout(400); await d.screenshot({ path: path.join(SHOTS, 'dark-1-flag-hover.png') }); }
    check('no page errors (dark)', d.errors.length === 0, d.errors.join(' | '));
    await d.context().close();

    const z = await open(browser, base, { lang: 'zh' });
    check('Chinese: 只靠设想 · 还没有真实证据', await z.evaluate(id => document.querySelector(`.card[data-id="${id}"] .res.assume`)?.innerText.replace(/\s+/g, ' ').trim(), z.ids.A) === '只靠设想 · 还没有真实证据');
    await z.evaluate(id => adopt(byId(id)), z.ids.A); await z.waitForTimeout(300);
    check('Chinese toast and note', (await z.toasts()).some(t => /目前只靠设想/.test(t)) && /只靠设想/.test((await z.pins(z.ids.A))[0] || ''));
    if (SHOTS) { await z.show(z.ids.A); await z.focus(`.card[data-id="${z.ids.A}"] [data-assume]`); await z.waitForTimeout(400); await z.screenshot({ path: path.join(SHOTS, 'zh-flag-hover.png') }); }
    check('no page errors (zh)', z.errors.length === 0, z.errors.join(' | '));
    await z.context().close();

    check('no model was asked for any of this', modelCalls === 0, String(modelCalls));
  } catch (e) { check('test run', false, e.stack || String(e)); }
  finally { await browser.close(); srv.close(); }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})();

#!/usr/bin/env node
/* Crew marks in the top bar: identity colours, rings that say what a member is doing, the hover bubble, and
 * cloud calls that show only when they run low.
 * Drives the real Vellum-Lumen.html in headless Chromium.
 *
 *   node tests/crew-rings.cjs            (from the repo root)
 *   node tests/crew-rings.cjs --headed   (watch it)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
    await ctx.route('http://127.0.0.1:59639/**', r => r.abort());
    await ctx.route(/wikipedia\.org/, r => r.abort());
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(String(e).split('\n')[0]));
    await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
    await p.evaluate(() => { studioState.status = 'ready'; studioState.model = 'mlx/Qwen3.5-9B-4bit'; renderCrew(); });
    const away = () => p.mouse.move(700, 600);

    // C1. each member has its own hue, and the hues differ
    const plates = await p.evaluate(() => [...document.querySelectorAll('#crewSetBtn .hub-mk .mk')].map(e => getComputedStyle(e).backgroundColor));
    check('C1 four members, four different plate colours', plates.length === 4 && new Set(plates).size === 4, JSON.stringify(plates));

    // C2. at rest the marks are whole circles: no overlap
    const gaps = await p.evaluate(() => { const r = [...document.querySelectorAll('#crewSetBtn .hub-mk')].map(e => e.getBoundingClientRect()); return r.slice(1).map((b, i) => b.left - r[i].right); });
    check('C2 marks do not overlap at rest', gaps.every(g => g >= 0), JSON.stringify(gaps));

    // C3. an idle member has no ring; a working one has a turning ring; drafts waiting give a closed ring
    const ringOf = k => p.evaluate(k => { const m = document.querySelector(`#crewSetBtn [data-mk="${k}"]`); return { ring: !!m.querySelector('.ring'), cls: m.className }; }, k);
    const idle = await p.evaluate(() => Object.keys(AGENTS).find(k => !crewState[k].busy && !crewDrafts(k).length));
    check('C3a an idle member has no ring', idle && !(await ringOf(idle)).ring);
    await p.evaluate(k => setAgent(k, { busy: true, status: 'reading sources' }), idle);
    const busy = await ringOf(idle);
    check('C3b a working member has a ring', busy.ring && /busy/.test(busy.cls), busy.cls);
    const withDraft = await p.evaluate(() => Object.keys(AGENTS).find(k => crewDrafts(k).length && !crewState[k].busy));
    if (withDraft) { const r = await ringOf(withDraft); check('C3c a member with drafts waiting has a closed ring', r.ring && /ready/.test(r.cls), r.cls); }

    // C4. a working member's ring never touches its neighbours
    const clear = await p.evaluate(k => { const ms = [...document.querySelectorAll('#crewSetBtn .hub-mk')]; const i = ms.findIndex(m => m.dataset.mk === k); const ring = ms[i].querySelector('.ring').getBoundingClientRect();
      const out = []; if (ms[i - 1]) out.push(ring.left - ms[i - 1].getBoundingClientRect().right); if (ms[i + 1]) out.push(ms[i + 1].getBoundingClientRect().left - ring.right); return out; }, idle);
    check('C4 the ring keeps clear of its neighbours', clear.every(g => g >= 1), JSON.stringify(clear));

    // C5. hovering spreads the marks without changing the pill's width, and opens that member's bubble
    await away(); await p.waitForTimeout(700);
    const w0 = await p.evaluate(() => document.getElementById('crewSetBtn').getBoundingClientRect().width);
    const x0 = await p.evaluate(() => [...document.querySelectorAll('#crewSetBtn .hub-mk')].at(-1).getBoundingClientRect().left);
    await p.hover(`#crewSetBtn [data-mk="${idle}"]`); await p.waitForTimeout(900);
    const w1 = await p.evaluate(() => document.getElementById('crewSetBtn').getBoundingClientRect().width);
    const x1 = await p.evaluate(() => [...document.querySelectorAll('#crewSetBtn .hub-mk')].at(-1).getBoundingClientRect().left);
    check('C5a hover spreads the marks', x1 - x0 >= 8, `${x0} → ${x1}`);
    check('C5b the pill keeps its width', Math.abs(w1 - w0) < .5, `${w0} → ${w1}`);
    const bub = await p.evaluate(() => { const b = document.getElementById('crewBub'); return { on: b.classList.contains('on'), who: b.dataset.who, txt: b.innerText }; });
    check('C5c the bubble says what the member is doing, with Stop', bub.on && bub.who === idle && /reading sources/i.test(bub.txt) && /Stop/.test(bub.txt), JSON.stringify(bub));
    await p.click('#crewBub [data-crew-bub="stop"]'); await p.waitForTimeout(200);
    check('C5d Stop in the bubble stops the member', await p.evaluate(k => crewState[k].cancel === true, idle));
    await p.evaluate(k => setAgent(k, { busy: false, status: '' }), idle);
    await away(); await p.waitForTimeout(500);
    check('C5e leaving the pill closes the bubble', await p.evaluate(() => !document.getElementById('crewBub').classList.contains('on')));

    // C6. Local AI: no meter anywhere, and the model bubble says there are no limits
    check('C6a no cloud count on the bar with Local AI', !(await p.$('#crewSetBtn .hub-q')));
    await p.hover('#crewSetBtn .cm-chev'); await p.waitForTimeout(600);
    const mb = await p.evaluate(() => document.getElementById('crewBub').innerText);
    check('C6b the model bubble says no limits', /No limits/.test(mb) && !/left/.test(mb), mb);
    await away(); await p.waitForTimeout(400);

    // C7. a daily cloud limit: nothing at rest while plenty is left; a count under 20%, red at none
    await p.evaluate(() => { studioState.status = 'off'; Object.assign(apiCfg, { enabled: true, key: 'k', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' }); aiPref = 'auto'; window.apiRoutable = () => true; cloudUse().used = 5; renderCrew(); });
    check('C7a 15 of 20 left: no count on the bar', !(await p.$('#crewSetBtn .hub-q')));
    await p.evaluate(() => { cloudUse().used = 17; renderCrew(); });
    const q = await p.evaluate(() => { const e = document.querySelector('#crewSetBtn .hub-q'); return e && { t: e.innerText.trim(), out: e.classList.contains('out') }; });
    check('C7b 3 of 20 left: the count shows, not red', q && q.t === '3' && !q.out, JSON.stringify(q));
    await p.hover('#crewSetBtn [data-crew-zone="model"]'); await p.waitForTimeout(600);
    const lb = await p.evaluate(() => document.getElementById('crewBub').innerText);
    check('C7c its bubble gives what is left and when it resets', /3 of 20 left/.test(lb) && /Resets/.test(lb), lb);
    await away(); await p.waitForTimeout(300);
    await p.evaluate(() => { cloudUse().used = 20; renderCrew(); });
    check('C7d none left: the count turns red', await p.evaluate(() => document.querySelector('#crewSetBtn .hub-q')?.classList.contains('out')));

    check('C8 no page errors', !errors.length, errors.join(' | '));
  } finally { await browser.close(); srv.close(); }
  console.log(results.join('\n')); console.log(failures ? `\n${failures} failed` : '\nall passed'); process.exit(failures ? 1 : 0);
})();

#!/usr/bin/env node
/* Reviewing what the crew drafts: Strategist's directions are a single choice, the review bar sits to the right
 * of the whole set with a brace from first card to last, Scout background the designer has not kept cannot
 * steer the fork, drafts type in once without changing height, and a direction's test reads quieter than its plan.
 *
 *   node tests/scout-review.cjs            (from the repo root)
 *   node tests/scout-review.cjs --headed   (watch it)
 *   VELLUM_FILE=path/to/build.html node tests/scout-review.cjs
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = process.env.VELLUM_FILE ? path.resolve(process.env.VELLUM_FILE) : path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

async function open(browser, base, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: opts.dark ? 'dark' : 'light' });
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
  await ctx.route(/wikipedia\.org/, r => r.abort());
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
  if (opts.zh) await p.evaluate(() => { store.set('.lang', 'zh'); renderAll(); });
  return p;
}
/* a fresh board with one idea and a set of three draft directions from Strategist */
const SETUP = () => {
  board.nodes = []; board.edges = []; board.adopted = {};
  const idea = node('idea', { text: 'I wanna build an AI video editing & generation agent', by: 'you', status: 'ink' }, { x: 120, y: 200 });
  const pid = 'p-test';
  const dirs = ['A', 'B', 'C'].map((l, i) => {
    const d = node('direction', { _src: idea.id, idea: idea.id, letter: l, mode: 'story', title: `Cut ${l}`, text: 'An editor that cuts a rough video to the beat of its music, and explains each cut in a sentence so people can undo the ones they disagree with.', test: 'Give it to three editors with their own footage; it fails if two of them undo more than half of the cuts.', by: 'muse', status: 'sketch', pid }, { x: 560, y: 120 + i * 330 });
    edge(idea.id, d.id, 'derive', 'live'); return d;
  });
  sel = []; renderAll(); persist();
  const b = bbox(dirs); cam = { s: .8, x: 720 - (b.x0 + b.x1) / 2 * .8, y: 450 - (b.y0 + b.y1) / 2 * .8 }; paintCam(); renderAll();
  return { idea: idea.id, dirs: dirs.map(d => d.id) };
};

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    // R1. the bar sits right of the whole set, with a brace from the first card to the last
    {
      const p = await open(browser, base);
      const ids = await p.evaluate(SETUP); await p.waitForTimeout(400);
      const g = await p.evaluate(ids => {
        const rs = ids.dirs.map(id => nodeEl(id).getBoundingClientRect()), bar = document.querySelector('.pbar'), br = document.querySelector('.pbar-brace');
        const b = bar.getBoundingClientRect(), r = br && !br.hidden ? br.getBoundingClientRect() : null;
        return { right: Math.max(...rs.map(x => x.right)), top: Math.min(...rs.map(x => x.top)), bottom: Math.max(...rs.map(x => x.bottom)), bar: { l: b.left, t: b.top, b: b.bottom }, side: bar.dataset.side, brace: r && { l: r.left, t: r.top, b: r.bottom },
          letters: [...bar.querySelectorAll('[data-p="pick"]')].map(x => x.textContent).join(''), later: !!bar.querySelector('[data-p="ink"].later'), keepAll: /Keep all/.test(bar.innerText), lastBtn: [...bar.querySelectorAll('.pbar-acts button')].at(-1)?.dataset.p };
      }, ids);
      check('the bar for a set sits to the right of every card, centred on the set', g.side === 'left' && g.bar.l > g.right && Math.abs((g.bar.t + g.bar.b) / 2 - (Math.max(g.top, 64) + Math.min(g.bottom, 888)) / 2) < 60, JSON.stringify(g));
      check('a brace runs from the first card to the last, between the cards and the bar', !!g.brace && g.brace.l >= g.right && g.brace.l < g.bar.l && Math.abs(g.brace.t - Math.max(g.top, 64)) < 2 && Math.abs(g.brace.b - Math.min(g.bottom, 888)) < 2, JSON.stringify(g));
      check('directions are a single choice: Go with A / B / C, and keeping all of them is a quiet "Decide later" on the right', g.letters === 'ABC' && g.later && !g.keepAll && g.lastBtn === 'ink', JSON.stringify(g));
      // hovering a letter lights its card
      const box = await p.evaluate(() => { const r = document.querySelector('[data-p="pick"][data-id]:nth-of-type(2)')?.getBoundingClientRect() || document.querySelectorAll('[data-p="pick"]')[1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await p.mouse.move(box.x, box.y); await p.waitForTimeout(150);
      check('hovering B lights card B only', await p.evaluate(ids => ids.dirs.map(id => nodeEl(id).classList.contains('pick-hint')).join() === 'false,true,false', ids));
      await p.mouse.click(box.x, box.y); await p.waitForTimeout(500);
      const st = await p.evaluate(ids => ({ adopted: board.adopted[ids.idea] === ids.dirs[1], inked: ids.dirs.every(id => byId(id).status === 'ink'), aside: [0, 2].every(i => setAsideFor(byId(ids.dirs[i]))?.id === ids.dirs[1]), bar: !!document.querySelector('.pbar'), brace: !!document.querySelector('.pbar-brace') }), ids);
      check('Go with B adopts B, keeps the set, and A and C stay on the board set aside for B', st.adopted && st.inked && st.aside && !st.bar && !st.brace, JSON.stringify(st));
      check('no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // R2. a set of sources keeps Keep all as its primary; Scout's background waits while the fork drafts
    {
      const p = await open(browser, base);
      const r = await p.evaluate(() => {
        board.nodes = []; board.edges = []; board.adopted = {};
        const idea = node('idea', { text: 'An AI video editing agent', by: 'you', status: 'ink' }, { x: 120, y: 200 });
        const pid = 'p-src'; [0, 1].forEach(i => node('source', { _src: idea.id, title: 'Video editing software ' + i, text: 'x'.repeat(120), weight: 'reported', by: 'scout', status: 'sketch', pid }, { x: 520, y: 140 + i * 280 }));
        renderAll(); const bar = document.querySelector('.pbar'), out = { title: bar?.querySelector('.pbar-title')?.innerText, primary: bar?.querySelector('.primary')?.innerText, pick: !!bar?.querySelector('[data-p="pick"]') };
        movePids.add(pid); crewState.muse.busy = true; renderAll(); out.hidden = !document.querySelector('.pbar');
        crewState.muse.busy = false; renderAll(); out.back = !!document.querySelector('.pbar'); return out;
      });
      check('a set of Scout sources says "2 sources" and keeps Keep all as its primary', /2 sources/.test(r.title) && /Keep all/.test(r.primary) && !r.pick, JSON.stringify(r));
      check("Scout's background bar waits while Strategist is still drafting on it, then comes back", r.hidden && r.back, JSON.stringify(r));
      await p.context().close();
    }
    // R3. the fork: unkept background is marked as such, and a direction built on it is sent back
    {
      const p = await open(browser, base);
      const r = await p.evaluate(() => {
        const bg = [{ title: 'Luka Dončić–Anthony Davis trade' }, { title: 'List of Beavis and Butt-Head episodes' }, { title: 'Video editing software' }];
        const idea = 'I wanna build an AI video editing & generation agent';
        const mk = (plan) => ({ directions: [{ title: 'Late Night Trade', plan, test: 'Show it to 3 people; it fails if 2 of them stop before the end.', mode: 'story' }] });
        return {
          names: bg.map(b => offTopicNames(b, idea)),
          off: forkProblems(mk('You build a tool that auto-cuts a Beavis and Butt-Head episode to the Dončić trade.'), 1, idea, bg).filter(x => /background card/.test(x)),
          on: forkProblems(mk('You build an editing agent that cuts raw footage into a short, using video editing software people already know.'), 1, idea, bg).filter(x => /background card/.test(x)),
        };
      });
      check('proper names from a background title count, its first word and words the idea uses do not', JSON.stringify(r.names) === JSON.stringify([['Anthony', 'Davis'], ['Beavis', 'Butt-Head'], []]) || JSON.stringify(r.names) === JSON.stringify([['Dončić', 'Anthony', 'Davis'], ['Beavis', 'Butt-Head'], []]), JSON.stringify(r.names));
      check('a direction about the NBA trade or the cartoon is sent back; one about video editing is not', r.off.length === 1 && r.on.length === 0, JSON.stringify(r));
      await p.context().close();
    }
    // R4. drafts type in once, every card at its final height from the start
    {
      const p = await open(browser, base, { dark: true });
      const ids = await p.evaluate(SETUP);
      const samples = await p.evaluate(async ids => {
        const els = ids.dirs.map(id => nodeEl(id)), h0 = els.map(e => e.offsetHeight), full = els.map(e => e.querySelector('p').textContent);
        const go = typeIn(ids.dirs), out = []; const vis = e => { const p = e.querySelector('p'), off = p.querySelector('.ty-off'); return p.textContent.length - (off ? off.textContent.length : 0); };
        for (let i = 0; i < 60; i++) { out.push({ h: ids.dirs.map(id => nodeEl(id).offsetHeight), v: ids.dirs.map(id => vis(nodeEl(id))) }); await new Promise(r => setTimeout(r, 40)); }
        await go; return { h0, full: full.map(t => t.length), out, end: ids.dirs.map(id => nodeEl(id).querySelector('p').textContent.length) };
      }, ids);
      const steady = samples.out.every(s => s.h.every((h, i) => Math.abs(h - samples.h0[i]) <= 1));
      // once card 1 has started, card 3 shows none of its text until its turn: no full text that blanks and comes back
      const firstSeen = samples.out.findIndex(s => s.v[2] > 0), early = samples.out.slice(0, Math.max(0, firstSeen)).every(s => s.v[2] === 0);
      const monotone = samples.out.every((s, i) => i === 0 || s.v.every((v, j) => v >= samples.out[i - 1].v[j]));
      check('every card keeps its height while it types', steady, JSON.stringify({ h0: samples.h0, hs: samples.out.slice(0, 6).map(s => s.h) }));
      check('later cards wait blank and type once, never full then blank then again', early && monotone && samples.end.join() === samples.full.join(), JSON.stringify({ firstSeen, v: samples.out.slice(0, 8).map(s => s.v) }));
      await p.context().close();
    }
    // R5. the test reads quieter than the plan, light and dark, en and zh
    for (const o of [{}, { dark: true }, { zh: true }, { dark: true, zh: true }]) {
      const p = await open(browser, base, o);
      await p.evaluate(SETUP); await p.waitForTimeout(200);
      const r = await p.evaluate(() => { const c = document.querySelector('.card.direction'), pl = getComputedStyle(c.querySelector('p')), t = getComputedStyle(c.querySelector('.test span[data-edit="test"]')); return { pf: parseFloat(pl.fontSize), tf: parseFloat(t.fontSize), pc: pl.color, tc: t.color }; });
      check(`the test is smaller and dimmer than the plan (${o.dark ? 'dark' : 'light'} ${o.zh ? 'zh' : 'en'})`, r.tf < r.pf && r.tc !== r.pc, JSON.stringify(r));
      await p.context().close();
    }
  } catch (e) { check('test ran to the end', false, String(e && e.stack || e)); }
  finally { await browser.close(); srv.close(); }
  console.log(results.join('\n')); console.log(`\n${results.length - failures} passed, ${failures} failed`); process.exit(failures ? 1 : 0);
})();

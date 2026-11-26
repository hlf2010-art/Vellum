#!/usr/bin/env node
/* The evidence line on a card's bottom row: a plain verdict on how well the card is backed, and a card that
 * explains it on hover. Also checks that a card's bottom row never runs past its edge.
 *
 *   node tests/evidence-line.cjs            (from the repo root)
 *   node tests/evidence-line.cjs --headed   (watch it)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
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
  p.pop = () => p.evaluate(() => { const d = document.getElementById('byPop'); return d && !d.hidden && d.classList.contains('in') ? { head: d.querySelector('.ev-head b')?.textContent || '', sent: d.querySelector('.ev-sent')?.textContent || '', rows: [...d.querySelectorAll('.ev-row')].map(li => li.querySelector('b').textContent + ' ' + li.querySelector('.ev-n').textContent), acts: [...d.querySelectorAll('[data-ev-act]')].map(b => b.dataset.evAct + ':' + b.textContent) } : null; });
  p.frame = id => p.evaluate(id => { const n = byId(id); cam = { s: 1, x: 720 - (n.x + nodeW(n) / 2), y: 560 - (n.y + nodeH(n)) }; paintCam(); renderAll(); }, id);
  p.hover = async sel => { const r = await p.evaluate(sel => { const e = document.querySelector(sel).getBoundingClientRect(); return { x: e.x + 20, y: e.y + e.height / 2 }; }, sel); await p.mouse.move(r.x, r.y); await p.waitForTimeout(700); };
  /* how far any bottom-row element runs past the card's inner edge, per card, in world px */
  p.overflow = () => p.evaluate(() => [...document.querySelectorAll('#nodes .card')].map(c => {
    const f = c.querySelector('.foot'); if (!f) return null;
    const cr = c.getBoundingClientRect(), pad = parseFloat(getComputedStyle(c.querySelector('.in') || c).paddingRight) || 0;
    let mx = 0; f.querySelectorAll('*').forEach(e => { const r = e.getBoundingClientRect(); if (r.width) mx = Math.max(mx, r.right); });
    const over = (mx - (cr.right - pad * cam.s)) / cam.s; return over > 0.5 ? { type: c.classList[1], over: +over.toFixed(1) } : null;
  }).filter(Boolean));
  return p;
}

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    // E1. the verdicts
    {
      const p = await open(browser, base);
      const v = await p.evaluate(() => {
        const t = (o, r, pr, il, n) => evidenceVerdict({ observed: o, reported: r, proposed: pr, illustrative: il, none: n });
        return { strong: t(3, 1, 0, 0, 0), half: t(1, 1, 0, 0, 0), part: t(2, 1, 2, 0, 0), mostlyRep: t(1, 2, 0, 0, 0), repOnly: t(0, 2, 0, 0, 1), ideas: t(0, 0, 2, 1, 0), none: t(0, 0, 0, 0, 4) };
      });
      check('mostly observed: half or more of the rated sources were watched', v.strong.txt === 'Mostly observed' && v.strong.bars === 3 && v.half.k === 'obs', JSON.stringify(v));
      check('partly observed: some watched, more than reported', v.part.txt === 'Partly observed' && v.part.bars === 2, JSON.stringify(v.part));
      check('second-hand: reports outweigh what was watched; "only" when nothing was', v.mostlyRep.txt === 'Mostly second-hand' && v.repOnly.txt === 'Second-hand only' && v.repOnly.bars === 1, JSON.stringify([v.mostlyRep, v.repOnly]));
      check('ideas and pictures are not evidence', v.ideas.txt === 'No evidence yet' && v.ideas.bars === 0, JSON.stringify(v.ideas));
      check('nothing rated says so', v.none.txt === 'Not rated yet', JSON.stringify(v.none));

      // E2. the line on the card: short, no chart, no "6/5"
      const lines = await p.evaluate(() => [...document.querySelectorAll('#nodes .ev-line')].map(e => ({ type: e.closest('.card').classList[1], text: e.textContent, scale: !!e.closest('.foot').querySelector('.scale') })));
      check('idea and synthesis cards show a short verdict, not a bar chart', lines.length >= 2 && lines.every(l => !l.scale && !/rated|\//.test(l.text) && l.text.length <= 22), JSON.stringify(lines));
      const syn = await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'synthesis'); return { id: n.id, of: n.of.length, rated: n.of.map(byId).filter(x => x && x.weight).length }; });
      await p.frame(syn.id); await p.hover(`[data-id="${syn.id}"] .ev-line`);
      const sp = await p.pop();
      check('the synthesis counts the sources it rests on (it used to say "6/5 rated")', sp && new RegExp(`of ${syn.of} sources`).test(sp.sent) && sp.rows.reduce((a, r) => a + +r.split(' ').pop(), 0) === syn.of, JSON.stringify({ syn, sp }));

      // E3. the evidence card
      const idea = await p.evaluate(() => board.nodes.find(n => n.type === 'idea').id);
      await p.mouse.move(5, 450); await p.waitForTimeout(400);
      await p.frame(idea); await p.hover(`[data-id="${idea}"] .ev-line`);
      const ip = await p.pop();
      check('hovering the line opens a card: the verdict, a sentence, and each kind with what it means', ip && ip.head === 'Mostly observed' && /^4 of 7 sources were watched first-hand\.$/.test(ip.sent) && ip.rows.includes('Observed 4') && ip.rows.includes('Not rated 2'), JSON.stringify(ip));
      check('it offers what to do next: show the sources, or (primary, last) rate the unrated', ip && ip.acts[0] === 'show:View' && ip.acts[1] === 'rate:Rate', JSON.stringify(ip?.acts));
      await p.click('#byPop [data-ev-act="rate"]'); await p.waitForTimeout(900);
      const picked = await p.evaluate(() => ({ sel: sel.slice(), weight: byId(sel[0])?.weight || null, type: byId(sel[0])?.type, popGone: document.getElementById('byPop').hidden || !document.getElementById('byPop').classList.contains('in') }));
      check('"Rate" selects an unrated source and takes you to it', picked.sel.length === 1 && !picked.weight && picked.popGone, JSON.stringify(picked));
      await p.frame(idea); await p.hover(`[data-id="${idea}"] .ev-line`);
      await p.click('#byPop [data-ev-act="show"]'); await p.waitForTimeout(900);
      const shown = await p.evaluate(id => ({ n: sel.length, all: sourcesFor(byId(id)).every(s => sel.includes(s.id)) }), idea);
      check('"Show sources" selects every source the card rests on', shown.n >= 2 && shown.all, JSON.stringify(shown));

      // keyboard
      await p.evaluate(() => { sel = []; renderAll(); }); await p.frame(idea);
      await p.focus(`[data-id="${idea}"] .ev-line`); await p.waitForTimeout(400);
      check('keyboard focus opens it at once; Escape closes it', !!(await p.pop()) && (await p.keyboard.press('Escape'), await p.waitForTimeout(400), !(await p.pop())));

      // E4. the bottom row never runs past the card's edge: at rest, with everything selected, and with five contributors each
      await p.evaluate(() => { store.set('.me', 'Mars'); cam = { s: 1, x: 0, y: 0 }; paintCam(); sel = []; renderAll(); });
      const rest = await p.overflow();
      await p.evaluate(() => { const T = Date.now(); for (const n of board.nodes) if (n.type !== 'group') n.contrib = [{ who: 'you', name: 'Mars', edits: 2, t: T - 6e5 }, { who: 'critic', edits: 1, t: T - 5e5 }, { who: 'muse', edits: 1, t: T - 4e5 }, { who: 'wright', edits: 1, t: T - 3e5 }, { who: 'scout', edits: 1, t: T - 2e5 }]; sel = board.nodes.map(n => n.id); renderAll(); });
      await p.waitForTimeout(700);
      const busy = await p.overflow();
      check('no card\'s bottom row runs past its edge (time and avatars stay inside)', !rest.length && !busy.length, JSON.stringify({ rest, busy }));
      check('E no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // E5. Chinese
    {
      const p = await open(browser, base, { zh: true, dark: true });
      const idea = await p.evaluate(() => board.nodes.find(n => n.type === 'idea').id);
      await p.frame(idea); await p.hover(`[data-id="${idea}"] .ev-line`);
      const ip = await p.pop();
      check('Chinese: 以实测为主, one sentence, 查看 / 评估', ip && ip.head === '以实测为主' && /^7 个来源中，有 4 个是亲眼观察到的。$/.test(ip.sent) && ip.acts[1] === 'rate:评估' && ip.acts[0] === 'show:查看', JSON.stringify(ip));
      check('E5 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
  } catch (e) { check('test run', false, String(e.stack || e)); }
  await browser.close(); srv.close();
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})();

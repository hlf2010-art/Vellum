#!/usr/bin/env node
/* Every card names its maker: a crew member's sign, or your initial and name.
 * Drives the real Vellum-Lumen.html in headless Chromium.
 *
 *   node tests/creator-badge.cjs            (from the repo root)
 *   node tests/creator-badge.cjs --headed   (watch it)
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
  /* every card on the sample, with what its seal says */
  p.seals = () => p.evaluate(() => board.nodes.filter(n => !isNodeHidden?.(n)).map(n => {
    const el = document.querySelector(`#nodes [data-id="${n.id}"]`), s = el?.querySelector(':scope > .by-seal');
    return { id: n.id, type: n.type, status: n.status, by: n.by, author: n.prov?.author, rendered: !!el, seal: s ? s.dataset.by : null, kept: !!s?.classList.contains('kept'), label: s?.querySelector('.by-seal-t')?.textContent || '', tip: s?.title || '' };
  }));
  return p;
}

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    // B1. who gets a seal on the sample board
    {
      const p = await open(browser, base);
      const all = (await p.seals()).filter(c => c.rendered);
      const crewInk = all.filter(c => c.status !== 'sketch' && c.type !== 'group' && c.by && c.by !== 'you');
      const yours = all.filter(c => !c.by || c.by === 'you');
      const drafts = all.filter(c => c.status === 'sketch');
      check('every crew card on the board shows its maker', crewInk.length >= 6 && crewInk.every(c => c.seal === c.by), JSON.stringify(crewInk));
      check('your own cards show a seal too: "You" until you set a name', yours.length >= 10 && yours.filter(c => c.type !== 'group').every(c => c.seal === 'you' && c.label === 'You' && /set your name in Settings/.test(c.tip)), JSON.stringify(yours.filter(c => c.seal !== 'you')));
      check('drafts show no seal (their header already says who suggested them)', drafts.length >= 1 && drafts.every(c => !c.seal), JSON.stringify(drafts));
      const syn = all.find(c => c.type === 'synthesis'), dirs = await p.evaluate(() => board.nodes.filter(n => n.type === 'direction' && n.status === 'ink').map(n => ({ id: n.id, letter: n.letter, adopted: board.adopted[n.idea] === n.id, vote: n.vote })));
      const dB = dirs.find(d => d.adopted), dA = dirs.find(d => !d.adopted && d.vote === 'down');
      const sB = all.find(c => c.id === dB.id), sA = all.find(c => c.id === dA.id);
      check('a crew card you kept says drafted by the crew, confirmed by you', syn.kept && /kept by you/.test(syn.label) && /Drafted by Scout, kept by you/.test(syn.tip), JSON.stringify(syn));
      check('an adopted direction counts as confirmed', sB.kept && sB.seal === 'muse', JSON.stringify(sB));
      check('a direction you voted down is not confirmed', !sA.kept && sA.seal === 'muse' && /not yet confirmed/.test(sA.tip), JSON.stringify(sA));
      check('an unconfirmed seal names only the maker', crewInk.filter(c => !c.kept).every(c => !/kept/.test(c.label) && c.label.length > 0), JSON.stringify(crewInk));

      // the seal uses the same avatar as the crew seat in the top bar
      const same = await p.evaluate(() => ['scout', 'muse', 'wright', 'critic'].every(k => {
        const seat = document.querySelector(`.seat[data-agent="${k}"] .mk svg`), seal = document.querySelector(`.by-seal[data-by="${k}"] .mk svg`);
        return !seal || (seat && seat.outerHTML === seal.outerHTML && getComputedStyle(seat.closest('.mk')).getPropertyValue('--orb-ink') === getComputedStyle(seal.closest('.mk')).getPropertyValue('--orb-ink'));
      }));
      check('seal avatars are the top-bar crew avatars (same glyph, same colour family)', same);

      // label hidden at rest, slides out on selection
      const sid = syn.id;
      const rest = await p.evaluate(id => { const t = document.querySelector(`[data-id="${id}"] .by-seal-t`); return +getComputedStyle(t).opacity; }, sid);
      await p.evaluate(id => { sel = [id]; renderAll(); }, sid); await p.waitForTimeout(600);
      const on = await p.evaluate(id => { const s = document.querySelector(`[data-id="${id}"] .by-seal`); return { op: +getComputedStyle(s.querySelector('.by-seal-t')).opacity, w: s.getBoundingClientRect().width }; }, sid);
      check('at rest only the avatar shows; selecting the card slides the name out', rest === 0 && on.op === 1 && on.w > 60, JSON.stringify({ rest, on }));
      await p.evaluate(() => { sel = []; renderAll(); });

      // overview: hidden, back on hover
      await p.evaluate(() => { cam = { s: .32, x: 80, y: 120 }; paintCam(); renderAll(); }); await p.waitForTimeout(500);
      const far = await p.evaluate(id => +getComputedStyle(document.querySelector(`[data-id="${id}"] .by-seal`)).opacity, sid);
      const r = await p.evaluate(id => { const b = document.querySelector(`[data-id="${id}"]`).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sid);
      await p.mouse.move(r.x, r.y); await p.waitForTimeout(500);
      const hov = await p.evaluate(id => +getComputedStyle(document.querySelector(`[data-id="${id}"] .by-seal`)).opacity, sid);
      check('zoomed out to the overview the seals are hidden', far === 0, String(far));
      check('hovering a card in the overview brings its seal back', hov === 1, String(hov));
      await p.mouse.move(5, 450);
      await p.evaluate(() => { cam = { s: .9, x: 0, y: 0 }; paintCam(); renderAll(); });

      // keeping a draft turns it into a confirmed seal
      const draft = drafts[0].id;
      await p.evaluate(id => ink([id]), draft); await p.waitForTimeout(300);
      const kept = (await p.seals()).find(c => c.id === draft);
      check('keep a draft: it gets its drafter\'s seal, confirmed by you', kept.seal === drafts[0].by && kept.kept, JSON.stringify(kept));

      // a card you made that only has a crew member's comment is still yours
      const mine = yours.find(c => c.type === 'note' || c.type === 'source');
      await p.evaluate(id => { board.threads[id] = [{ who: 'critic', t: Date.now(), text: 'Where is this from?' }]; renderAll(); }, mine.id);
      const after = (await p.seals()).find(c => c.id === mine.id);
      check('a crew comment on your card does not make it the crew\'s', after.seal === 'you', JSON.stringify(after));

      // set a name in Settings: your cards say it, as an initial on a colour; confirmations say it too
      await p.click('#settingsBtn'); await p.waitForTimeout(300);
      await p.fill('#sysMyName', 'Mars'); await p.waitForTimeout(200);
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      const named = await p.seals();
      const myCard = named.find(c => c.id === mine.id), synN = named.find(c => c.type === 'synthesis');
      const av = await p.evaluate(id => { const m = document.querySelector(`[data-id="${id}"] .by-seal .mk`); return { text: m.textContent, bg: getComputedStyle(m).backgroundColor, color: getComputedStyle(m).color }; }, mine.id);
      check('with a name set, your cards show it, with your initial as the avatar', myCard.label === 'Mars' && /Created by Mars/.test(myCard.tip) && av.text === 'M' && av.color === 'rgb(255, 255, 255)' && av.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify({ myCard, av }));
      check('a confirmed crew card says who confirmed it', /Scout · kept by Mars/.test(synN.label) && /kept by Mars/.test(synN.tip), JSON.stringify(synN));
      const stamped = await p.evaluate(() => { const n = node('note', { text: 'Ask the QA lead' }, { x: 0, y: 0 }); renderAll(); return n.prov; });
      check('a card made after the name is set records it (prov.name)', stamped.author === 'you' && stamped.name === 'Mars', JSON.stringify(stamped));
      await p.evaluate(() => { store.set('.me', 'Someone Else'); renderAll(); });
      const kept2 = (await p.seals()).find(c => c.id === mine.id), newer = (await p.seals()).find(c => c.label === 'Mars');
      check('a card keeps the name it was made under; older ones follow the current name', kept2.label === 'Someone Else' && !!newer, JSON.stringify({ kept2, newer }));
      await p.evaluate(() => { store.del('.me'); renderAll(); });
      check('B1 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // B2. Copilot's own cards are marked Copilot, not Critic
    {
      const p = await open(browser, base);
      const r = await p.evaluate(() => {
        const a = dispatchCanvasActions([{ action: 'create', cardType: 'note', title: 'Note', text: 'Try a rim light test', status: 'ink' }], { by: 'copilot', userIntent: true });
        const b = dispatchCanvasActions([{ action: 'create', cardType: 'note', title: 'Note', text: 'Two more sources on glare', status: 'ink' }], { by: 'scout', userIntent: true });
        const c = dispatchCanvasActions([{ action: 'create', cardType: 'note', title: 'Note', text: 'A draft from Copilot', status: 'sketch' }], { by: 'copilot' });
        renderAll();
        const one = id => { const n = byId(id), el = document.querySelector(`[data-id="${id}"]`); return { by: n.by, author: n.prov?.author, seal: el?.querySelector(':scope > .by-seal')?.dataset.by || null, head: el?.querySelector('.sketch-by b')?.textContent || '', sub: provAuthor(n) }; };
        return { a: one(a.createdNodes[0].id), b: one(b.createdNodes[0].id), c: one(c.createdNodes[0].id) };
      });
      check('a card Copilot makes on its own is marked Copilot', r.a.author === 'copilot' && r.a.seal === 'copilot' && r.a.sub === 'Copilot', JSON.stringify(r.a));
      check('a card Copilot makes for a named member is marked with that member', r.b.author === 'scout' && r.b.seal === 'scout', JSON.stringify(r.b));
      check('a Copilot draft says "Suggested by Copilot"', /Copilot/.test(r.c.head) && !r.c.seal, JSON.stringify(r.c));
      const cpColor = await p.evaluate(() => getComputedStyle(document.querySelector('.by-seal[data-by="copilot"] .mk')).color);
      check('Copilot\'s avatar has its own neutral colour', cpColor === 'rgb(59, 63, 71)', cpColor);
      check('B2 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // B3. Chinese labels, dark theme
    {
      const p = await open(browser, base, { zh: true, dark: true });
      const all = (await p.seals()).filter(c => c.seal && c.seal !== 'you');
      const syn = all.find(c => c.type === 'synthesis'), other = all.find(c => !c.kept);
      check('Chinese: confirmed reads "起草 · 你已确认"', /Scout 起草 · 你已确认/.test(syn.label) && /你已确认/.test(syn.tip), JSON.stringify(syn));
      check('Chinese: unconfirmed reads "创建"', /创建/.test(other.label) && /还没有人确认/.test(other.tip), JSON.stringify(other));
      const me = (await p.seals()).find(c => c.seal === 'you');
      check('Chinese: your own card reads "你"', me && me.label === '你', JSON.stringify(me));
      const bg = await p.evaluate(() => { const s = document.querySelector('.by-seal'); return [getComputedStyle(s).backgroundColor, getComputedStyle(s.closest('.card')).backgroundColor]; });
      check('dark: the seal sits on the card colour', bg[0] === bg[1], JSON.stringify(bg));
      const ink = await p.evaluate(() => {
        const n = board.nodes.find(n => n.type === 'note' && n.by === 'you'); sel = [n.id]; renderAll();
        const s = document.querySelector(`[data-id="${n.id}"] .by-seal`), t = s.querySelector('.by-seal-t');
        const rgb = c => c.match(/[\d.]+/g).map(Number), lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
        const bgc = rgb(getComputedStyle(s).backgroundColor), fc = rgb(getComputedStyle(t).color), a = fc[3] ?? 1, mix = [0, 1, 2].map(i => fc[i] * a + bgc[i] * (1 - a));
        const x = lum(mix), y = lum(bgc); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
      });
      check('dark: the name on a sticky\'s seal is readable (a sticky\'s own ink colours do not leak in)', ink >= 4.5, String(ink));
      check('B3 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
  } catch (e) { check('test run', false, String(e.stack || e)); }
  await browser.close(); srv.close();
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})();

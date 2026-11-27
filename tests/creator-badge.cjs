#!/usr/bin/env node
/* Every card names who worked on it, beside its time: one maker's avatar, or an avatar group when several
 * people or crew members made, edited or kept it. Drives the real Vellum-Lumen.html in headless Chromium.
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
  /* every card, with what its mark says: a single seal, or a group (who, in order) */
  p.marks = () => p.evaluate(() => board.nodes.filter(n => !isNodeHidden?.(n)).map(n => {
    const el = document.querySelector(`#nodes [data-id="${n.id}"]`), s = el?.querySelector('.by-seal'), g = el?.querySelector('.by-group');
    return { id: n.id, type: n.type, status: n.status, by: n.by, rendered: !!el,
      seal: s ? s.dataset.by : null, label: s?.querySelector('.by-seal-t')?.textContent || '', tip: s?.title || '',
      group: g ? [...g.querySelectorAll('.by-av')].map(a => a.dataset.by) : null, more: g?.querySelector('.by-more')?.textContent || '', groupLabel: g?.getAttribute('aria-label') || '' };
  }));
  p.pop = () => p.evaluate(() => { const d = document.getElementById('byPop'); return d && !d.hidden && d.classList.contains('in') ? { head: d.querySelector('header').textContent, rows: [...d.querySelectorAll('li')].map(li => li.querySelector('b').textContent + ' | ' + li.querySelector('small').textContent) } : null; });
  p.center = sel => p.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  p.frame = id => p.evaluate(id => { const n = byId(id); cam = { s: 1, x: 720 - (n.x + nodeW(n) / 2), y: 450 - (n.y + nodeH(n) / 2) }; paintCam(); renderAll(); }, id);
  return p;
}
const firstOf = m => m.seal || (m.group && m.group[0]) || null;

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    // B1. who is shown on the sample board
    {
      const p = await open(browser, base);
      const all = (await p.marks()).filter(c => c.rendered);
      const crewInk = all.filter(c => c.status !== 'sketch' && c.type !== 'group' && c.by && c.by !== 'you');
      const yours = all.filter(c => (!c.by || c.by === 'you') && c.type !== 'group');
      const drafts = all.filter(c => c.status === 'sketch');
      check('every crew card shows its maker first', crewInk.length >= 6 && crewInk.every(c => firstOf(c) === c.by), JSON.stringify(crewInk));
      check('your own cards show you: "You" until you set a name', yours.length >= 10 && yours.every(c => c.seal === 'you' && c.label === 'You' && /set your name in Settings/.test(c.tip)), JSON.stringify(yours.filter(c => c.seal !== 'you')));
      check('drafts show nobody (their header already says who suggested them)', drafts.length >= 1 && drafts.every(c => !c.seal && !c.group), JSON.stringify(drafts));
      const syn = all.find(c => c.type === 'synthesis'), dirs = await p.evaluate(() => board.nodes.filter(n => n.type === 'direction' && n.status === 'ink').map(n => ({ id: n.id, adopted: board.adopted[n.idea] === n.id, vote: n.vote })));
      const sB = all.find(c => c.id === dirs.find(d => d.adopted).id), sA = all.find(c => c.id === dirs.find(d => !d.adopted && d.vote === 'down').id);
      check('a crew card you kept shows both of you: the crew member, then you', JSON.stringify(syn.group) === '["scout","you"]' && /2 contributors: Scout, You/.test(syn.groupLabel), JSON.stringify(syn));
      check('an adopted direction counts as kept by you', JSON.stringify(sB.group) === '["muse","you"]', JSON.stringify(sB));
      check('a direction you voted down shows only its maker, not yet confirmed', sA.seal === 'muse' && !sA.group && /not yet confirmed/.test(sA.tip), JSON.stringify(sA));

      // where it sits: in the foot, right before the time
      const place = await p.evaluate(() => [...document.querySelectorAll('#nodes .by-seal, #nodes .by-group')].map(s => { const by = s.closest('.foot-by'); return { type: s.closest('.card').classList[1], foot: !!s.closest('.foot-r'), ok: by?.lastElementChild?.tagName === 'TIME' && by.firstElementChild === s }; }));
      check('the mark sits in the bottom row, right before the time', place.length >= 20 && place.every(x => x.foot && x.ok), JSON.stringify(place.filter(x => !(x.foot && x.ok))));

      // the crew avatars are the marks on the top-bar entry
      const same = await p.evaluate(() => ['scout', 'muse', 'wright', 'critic'].every(k => {
        const seat = document.querySelector(`#crewSetBtn [data-mk="${k}"] .mk svg`), m = document.querySelector(`#nodes [data-by="${k}"] .mk svg`);
        return !m || (seat && seat.outerHTML === m.outerHTML && getComputedStyle(seat.closest('.mk')).getPropertyValue('--orb-ink') === getComputedStyle(m.closest('.mk')).getPropertyValue('--orb-ink'));
      }));
      check('crew avatars are the top-bar crew avatars (same glyph, same colour family)', same);

      // a single maker: avatar at rest, the name slides out on selection, followed by a dot before the time
      const q = all.find(c => c.type === 'question');
      const rest = await p.evaluate(id => +getComputedStyle(document.querySelector(`[data-id="${id}"] .by-seal-t`)).opacity, q.id);
      await p.evaluate(id => { sel = [id]; renderAll(); }, q.id); await p.waitForTimeout(600);
      const on = await p.evaluate(id => { const t = document.querySelector(`[data-id="${id}"] .by-seal-t`); return { op: +getComputedStyle(t).opacity, w: t.getBoundingClientRect().width, dot: getComputedStyle(t, '::after').content }; }, q.id);
      check('one maker: only the avatar at rest; selecting slides "Critic ·" out before the time', rest === 0 && on.op === 1 && on.w > 20 && /·/.test(on.dot), JSON.stringify({ rest, on }));
      await p.evaluate(() => { sel = []; renderAll(); });

      // several: stacked at rest, eased apart on hover, and a card says who did what
      await p.frame(syn.id); await p.waitForTimeout(300);
      const gap = () => p.evaluate(id => parseFloat(getComputedStyle(document.querySelectorAll(`[data-id="${id}"] .by-av`)[1]).marginLeft), syn.id);
      const g0 = await gap();
      await p.mouse.move(...Object.values(await p.center(`[data-id="${syn.id}"] .by-av`))); await p.waitForTimeout(800);
      const g1 = await gap(), pop = await p.pop();
      check('several: avatars overlap at rest and ease apart on hover', g0 < 0 && g1 > 0, JSON.stringify({ g0, g1 }));
      check('hovering the group opens a card: who, and what each did', pop && /2 contributors/.test(pop.head) && pop.rows[0] === 'Scout | Drafted' && pop.rows[1] === 'You | Kept', JSON.stringify(pop));
      await p.mouse.move(5, 450); await p.waitForTimeout(500);
      check('moving away closes it', !(await p.pop()));

      // overview: hidden, back on hover
      await p.evaluate(() => { cam = { s: .32, x: 80, y: 120 }; paintCam(); renderAll(); }); await p.waitForTimeout(500);
      const op = () => p.evaluate(id => +getComputedStyle(document.querySelector(`[data-id="${id}"] .by-group`)).opacity, syn.id);
      const far = await op();
      await p.mouse.move(...Object.values(await p.center(`[data-id="${syn.id}"]`))); await p.waitForTimeout(500);
      const hov = await op();
      check('zoomed out to the overview the marks are hidden, and come back on hover', far === 0 && hov === 1, JSON.stringify({ far, hov }));
      await p.mouse.move(5, 450);
      await p.evaluate(() => { cam = { s: .9, x: 0, y: 0 }; paintCam(); renderAll(); });

      // keeping a draft adds you after its drafter
      const draft = drafts[0];
      await p.evaluate(id => ink([id]), draft.id); await p.waitForTimeout(300);
      const kept = (await p.marks()).find(c => c.id === draft.id);
      check('keep a draft: its drafter, then you', JSON.stringify(kept.group) === JSON.stringify([draft.by, 'you']), JSON.stringify(kept));

      // a comment is not a contribution
      const mine = yours.find(c => c.type === 'source');
      await p.evaluate(id => { board.threads[id] = [{ who: 'critic', t: Date.now(), text: 'Where is this from?' }]; renderAll(); }, mine.id);
      check('a crew comment on your card does not add the crew member', (await p.marks()).find(c => c.id === mine.id).seal === 'you');

      // edits are contributions; finishing your own fresh card is not
      const ed = await p.evaluate(() => {
        const n = board.nodes.find(x => x.type === 'question'); const mk = () => contributorsOf(n).map(c => c.who + ':' + c.edits);
        asActor({ who: 'you' }, () => { n.text += ' (and in fog?)'; }); persist();
        asActor({ who: 'wright' }, () => { n.text += ' Checked against v3.'; }); persist();
        asActor({ who: 'wright' }, () => { n.text += ' Again.'; }); persist();
        const fresh = node('note', { text: 'Ask QA' }, { x: 0, y: 0 }); persist();
        asActor({ who: 'you' }, () => { fresh.text = 'Ask the QA lead'; }); persist();
        renderAll();
        return { q: mk(), fresh: contributorsOf(fresh).length, stored: n.contrib };
      });
      check('editing a card adds you; a crew member\'s edits are counted', ed.q[0] === 'critic:0' && JSON.stringify(ed.q.slice(1).sort()) === '["wright:2","you:1"]', JSON.stringify(ed));
      check('finishing your own new card is not a second contribution', ed.fresh === 1, JSON.stringify(ed));

      // many: two avatars and "+N", the card lists everyone with counts
      const many = await p.evaluate(() => { const n = board.nodes.find(x => x.type === 'question'); n.contrib.push({ who: 'scout', edits: 1, t: Date.now() - 6e5 }, { who: 'muse', edits: 1, t: Date.now() - 9e5 }); renderAll(); return n.id; });
      const mm = (await p.marks()).find(c => c.id === many);
      check('more than three: two avatars and "+3", three slots wide', mm.group?.length === 2 && mm.more === '+3' && /5 contributors/.test(mm.groupLabel), JSON.stringify(mm));
      await p.frame(many); await p.waitForTimeout(300);
      await p.focus(`[data-id="${many}"] .by-group`); await p.waitForTimeout(450);
      const kp = await p.pop();
      check('keyboard focus opens the card at once, listing all five with what they did', kp && kp.rows.length === 5 && kp.rows[0] === 'Critic | Drafted' && kp.rows.includes('Wright | Edited 2×') && kp.rows.includes('You | Edited'), JSON.stringify(kp));
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      check('Escape closes it', !(await p.pop()));

      // stickies lost their pen button: double-click still edits
      const note = yours.find(c => c.type === 'note');
      const pen = await p.evaluate(() => document.querySelectorAll('#nodes .card.note .note-edit-btn, #nodes .card.note [data-a="edit-note"]').length);
      await p.frame(note.id); await p.waitForTimeout(300);
      const h4 = await p.center(`[data-id="${note.id}"] h4`);
      await p.mouse.dblclick(h4.x, h4.y); await p.waitForTimeout(400);
      const editing = await p.evaluate(id => !!document.querySelector(`[data-id="${id}"].is-editing`), note.id);
      check('a sticky has no pen button, and double-clicking it still starts editing', pen === 0 && editing, JSON.stringify({ pen, editing }));
      await p.keyboard.press('Escape'); await p.mouse.click(1300, 850); await p.waitForTimeout(300);

      // set a name in Settings
      await p.click('#crewSetBtn'); await p.waitForTimeout(250); await p.click('#crewPop [data-crew-settings]'); await p.waitForTimeout(300);
      await p.fill('#sysMyName', 'Mars'); await p.waitForTimeout(200);
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      const named = (await p.marks()).find(c => c.id === mine.id);
      const av = await p.evaluate(id => { const m = document.querySelector(`[data-id="${id}"] .by-seal .mk`); return { text: m.textContent, color: getComputedStyle(m).color }; }, mine.id);
      check('with a name set, your cards show it, with your initial as the avatar', named.label === 'Mars' && /Created by Mars/.test(named.tip) && av.text === 'MA' && av.color === 'rgb(255, 255, 255)', JSON.stringify({ named, av }));
      const synN = (await p.marks()).find(c => c.id === syn.id);
      check('the group names you too', /Scout, Mars/.test(synN.groupLabel), JSON.stringify(synN));
      const stamped = await p.evaluate(() => { const n = node('note', { text: 'Ask the QA lead' }, { x: 0, y: 0 }); renderAll(); return n.prov; });
      const ini = await p.evaluate(() => ['Mars', 'Mars Lin', 'mars van der berg', '王小明', 'A', 'Ö z'].map(personInitial));
      check('initials: two letters for Latin names, one character for Chinese', JSON.stringify(ini) === '["MA","ML","MB","王","A","ÖZ"]', JSON.stringify(ini));
      check('a card made after the name is set records it (prov.name)', stamped.author === 'you' && stamped.name === 'Mars', JSON.stringify(stamped));
      await p.evaluate(() => { store.set('.me', 'Someone Else'); renderAll(); });
      const m2 = await p.marks();
      check('a card keeps the name it was made under; older ones follow the current name', m2.find(c => c.id === mine.id).label === 'Someone Else' && m2.some(c => c.label === 'Mars'), '');
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
        const one = id => { const n = byId(id), el = document.querySelector(`[data-id="${id}"]`); return { by: n.by, author: n.prov?.author, seal: el?.querySelector('.by-seal')?.dataset.by || null, head: el?.querySelector('.sketch-by b')?.textContent || '', sub: provAuthor(n) }; };
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
      const all = await p.marks();
      const syn = all.find(c => c.type === 'synthesis'), other = all.find(c => c.seal && c.seal !== 'you'), me = all.find(c => c.seal === 'you');
      check('Chinese: the group reads "2 位参与者"', /2 位参与者：Scout、你/.test(syn.groupLabel), JSON.stringify(syn));
      check('Chinese: an unconfirmed maker reads "创建"', /创建/.test(other.label) && /还没有人确认/.test(other.tip), JSON.stringify(other));
      check('Chinese: your own card reads "你"', me && me.label === '你', JSON.stringify(me));
      await p.frame(syn.id); await p.waitForTimeout(300);
      await p.focus(`[data-id="${syn.id}"] .by-group`); await p.waitForTimeout(450);
      const pop = await p.pop();
      check('Chinese: the card says 起草 and 确认', pop && pop.rows[0] === 'Scout | 起草' && pop.rows[1] === '你 | 确认', JSON.stringify(pop));
      const ink = await p.evaluate(() => {
        const n = board.nodes.find(n => n.type === 'note' && n.by === 'you'); sel = [n.id]; renderAll();
        const s = document.querySelector(`[data-id="${n.id}"] .by-seal`), t = s.querySelector('.by-seal-t');
        const rgb = c => c.match(/[\d.]+/g).map(Number), lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
        const cv = document.createElement('canvas').getContext('2d'); cv.fillStyle = getComputedStyle(s.closest('.card')).getPropertyValue('--note-mid').trim(); const bgc = [1, 3, 5].map(i => parseInt(cv.fillStyle.slice(i, i + 2), 16));  /* a sticky is painted with its own gradient */
        const fc = rgb(getComputedStyle(t).color), a = fc[3] ?? 1, mix = [0, 1, 2].map(i => fc[i] * a + bgc[i] * (1 - a));
        const x = lum(mix), y = lum(bgc); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
      });
      check('dark: the name beside a sticky\'s time is readable on the sticky', ink >= 4.5, String(ink));
      check('B3 no page errors', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
  } catch (e) { check('test run', false, String(e.stack || e)); }
  await browser.close(); srv.close();
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})();

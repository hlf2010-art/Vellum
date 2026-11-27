#!/usr/bin/env node
/* The board as a reasoning workflow, not a three-column board.
 * - Lanes are zones: a tinted band with a header that says what lives there; no step numbers; the sample has no lane-wide groups.
 * - An empty lane is a way in that starts the action: choose files / write a note, write your core judgment, pick a direction
 *   to prototype (or branch a judgment), freeze a prototype. A lane stops inviting once its kind of card exists anywhere.
 * - Evidence tied to a judgment (snapped beside it or connected) reads evidence -> judgment whichever card was dragged; the
 *   judgment's bottom row says what it rests on and how many pieces counter it; selecting it lights its evidence.
 * - An adopted direction without a prototype offers Prototype on its card.
 * - The crew, the model and settings are one entry in the top bar.
 *   node tests/reasoning-flow.cjs   (from the repo root)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }
(async () => {
  const srv = http.createServer((q, r) => { if (q.url.startsWith('/Vellum-Lumen.html')) { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(r); } r.writeHead(404); r.end(); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  try {
    const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route(/wikipedia|wikimedia|openrouter|gdcvault/, r => r.abort());
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);

    /* lanes as zones */
    const z = await p.evaluate(() => ({ zones: document.querySelectorAll('#bays .bay-zone').length, steps: document.querySelectorAll('#bays .step').length,
      heads: [...document.querySelectorAll('#bays .bay-head')].map(h => h.querySelector('h2').textContent + ' | ' + h.querySelector('p').textContent),
      laneGroups: board.nodes.filter(n => n.type === 'group' && /^\d\d · (Gather|Explore|Prototype|Snapshot)/.test(n.title || '')).length }));
    check('every lane is a zone with a header that says what lives there, and no step numbers', z.zones === 4 && z.steps === 0 && /Gather \| Evidence/.test(z.heads[0]) && /Explore \| Judgments/.test(z.heads[1]) && /Prototype \| Prototypes branched from a direction/.test(z.heads[2]), JSON.stringify(z));
    check('the sample has no lane-wide group repeating its lane', z.laneGroups === 0, z.laneGroups);
    check('a full sample has no lane invitations', await p.evaluate(() => !document.querySelector('#bays .bay-start')));

    /* empty board: ways in */
    await p.evaluate(() => { persistNow(); board = blank(''); sel = []; renderAll(); fitAll(); }); await p.waitForTimeout(800);
    const e0 = await p.evaluate(() => ({ g: document.querySelector('.bay-0 .bay-start h3')?.textContent, e: document.querySelector('.bay-1 .bay-start h3')?.textContent, pr: !!document.querySelector('.bay-2 .bay-start'), sn: !!document.querySelector('.bay-3 .bay-start'), btns: [...document.querySelectorAll('.bay-0 .bs-btn')].map(x => x.textContent).join(','), hint: document.querySelector('#line .line-hint')?.textContent || '' }));
    check('an empty board offers actions, not "No evidence yet": drop evidence (Choose files / Write a note), write your core judgment', e0.g === 'Drop a recording, screenshot or note' && e0.btns === 'Choose files,Write a note' && e0.e === 'Write your core judgment', JSON.stringify(e0));
    check('Prototype and Snapshot stay quiet until there is something to pick, and the bar hint does not repeat "drop files"', !e0.pr && !e0.sn && !/drop files/i.test(e0.hint), JSON.stringify(e0));
    check('the ways in are reachable by keyboard and screen readers (the lanes are not aria-hidden)', await p.evaluate(() => !$('bays').hasAttribute('aria-hidden') && document.querySelector('.bay-1 .bay-start').tabIndex === 0 && document.querySelector('.bay-1 .bay-start').getAttribute('role') === 'button'));
    await p.click('.bay-1 .bay-start'); await p.waitForTimeout(400);
    check('Write your core judgment makes a claim in Explore and puts the cursor in it', await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'idea'); return !!n && bayOf(n) === 1 && !!document.querySelector('.card.idea.is-editing') && document.activeElement?.closest('.card')?.dataset.id === n.id; }));
    await p.keyboard.type('Riders trust a fare they see before they pick a ride.'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    check('the claim keeps what you typed, and Explore stops inviting', await p.evaluate(() => board.nodes.find(n => n.type === 'idea')?.text === 'Riders trust a fare they see before they pick a ride.' && !document.querySelector('.bay-1 .bay-start')));
    check('with a judgment, Prototype offers to branch it into directions', await p.evaluate(() => { const h = document.querySelector('.bay-2 .bay-start h3')?.textContent; const ch = document.querySelector('.bay-2 .bs-chip'); return h === 'Branch a judgment into directions' && ch?.dataset.bayGo === 'fork'; }));
    await p.evaluate(() => { persistNow(); board = blank(''); sel = []; renderAll(); fitAll(); }); await p.waitForTimeout(500);
    await p.click('.bay-1 .bay-start'); await p.waitForTimeout(300); await p.mouse.click(700, 700); await p.waitForTimeout(400);
    check('a claim left empty goes away again, and the invitation comes back', await p.evaluate(() => !board.nodes.some(n => n.type === 'idea') && !!document.querySelector('.bay-1 .bay-start')));
    await p.click('.bay-0 [data-bay-go="note"]'); await p.waitForTimeout(400);
    check('Write a note starts a note in Gather, ready to type', await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'note'); return !!n && bayOf(n) === 0 && !!document.querySelector('.card.note.is-editing'); }));
    await p.keyboard.type('P3 said the price jumped at checkout.'); await p.mouse.click(700, 760); await p.waitForTimeout(400);
    check('once evidence exists anywhere, Gather stops inviting', await p.evaluate(() => !document.querySelector('.bay-0 .bay-start')));
    const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null), p.evaluate(() => { persistNow(); board = blank(''); renderAll(); fitAll(); setTimeout(() => document.querySelector('.bay-0 [data-bay-go="files"]').click(), 100); })]);
    if (chooser) { await chooser.setFiles({ name: 'interview-4.txt', mimeType: 'text/plain', buffer: Buffer.from('Saw the price at the last step and closed the app.') }); await p.waitForTimeout(900); }
    check('Choose files opens the file picker and puts the file in Gather', !!chooser && await p.evaluate(() => { const n = board.nodes.find(n => n.type !== 'group'); return !!n && bayOf(n) === 0; }), String(!!chooser));

    /* evidence beside a judgment */
    const ids = await p.evaluate(() => { persistNow(); board = blank(''); sel = []; renderAll();
      const c = node('idea', { kind: 'Claim', text: 'Riders abandon the app because the fare appears too late.' }, { x: 1100, y: 80 });
      const a = node('source', { title: 'Interview 4: fare shock at checkout', text: 'Closed the app at the price.', weight: 'observed' }, { x: 120, y: 80 });
      const d = node('source', { title: 'Survey: price was clear for 80%', text: '', weight: 'reported' }, { x: 120, y: 420 });
      renderAll(); focusNodes([c, a, d], .9, 0); return { c: c.id, a: a.id, d: d.id }; }); await p.waitForTimeout(500);
    check('a judgment with nothing behind it says so, and its card says how to back it', await p.evaluate(id => nodeEl(id).querySelector('.ev-line.ev-empty')?.textContent === 'Nothing behind it yet' && /Drag a piece of evidence beside this card/.test(evidencePopHTML(byId(id))), ids.c));
    const box = id => p.evaluate(id => { const r = nodeEl(id).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, id);
    const A = await box(ids.a), C = await box(ids.c);
    const sx = C.x + C.w / 2, sy = C.y + 20, tx = A.x + A.w + C.w / 2 + 4, ty = A.y + 20;
    await p.mouse.move(sx, sy); await p.mouse.down();
    for (let i = 1; i <= 24; i++) { await p.mouse.move(sx + (tx - sx) * i / 24, sy + (ty - sy) * i / 24); await p.waitForTimeout(16); }
    await p.mouse.up(); await p.waitForTimeout(600);
    const s1 = await p.evaluate(r => { const e = relBetween(r.a, r.c); return e && { evFirst: e.a === r.a, via: e.via, pick: !$('relPick').hidden, k: $('relPick').querySelector('.rp-k')?.textContent }; }, ids);
    check('dragging the judgment beside the evidence snaps them, and the relation reads evidence -> judgment', s1 && s1.evFirst && s1.via === 'snap', JSON.stringify(s1));
    check('the type picker asks about "This evidence"', s1 && s1.pick && s1.k === 'This evidence', JSON.stringify(s1));
    await p.keyboard.press('2'); await p.waitForTimeout(300);
    check('the evidence now backs the claim: its row gives the verdict', await p.evaluate(r => relBetween(r.a, r.c).rel === 'supports' && nodeEl(r.c).querySelector('.ev-line .ev-txt')?.textContent === 'Mostly observed', ids));
    await p.evaluate(r => { const { e } = makeRelation(r.c, r.d, { via: 'wire' }); e.rel = 'conflicts'; renderAll(); }, ids); await p.waitForTimeout(300);
    const f = await p.evaluate(r => ({ ctr: nodeEl(r.c).querySelector('.ev-ctr')?.textContent, tip: nodeEl(r.c).querySelector('.ev-ctr')?.title, evFirst: relBetween(r.c, r.d).a === r.d, sup: restsOn(byId(r.c)).sup.map(x => x.id), pop: evidencePopHTML(byId(r.c)) }), ids);
    check('a connector drawn from the judgment also reads evidence -> judgment', f.evFirst, JSON.stringify(f));
    check('counter-evidence is shown apart on the card ("1 counter"), not counted as backing', f.ctr === '1 counter' && /Survey: price was clear/.test(f.tip) && f.sup.join() === ids.a, JSON.stringify(f));
    check('the evidence card lists what counters it', /Counters it/.test(f.pop) && /Survey: price was clear/.test(f.pop), f.pop.slice(0, 200));
    const foot = await p.evaluate(id => { const el = nodeEl(id), r = el.getBoundingClientRect(); return [...el.querySelectorAll('.foot > *, .foot .ev-wrap > *, .foot-r > *')].every(x => { const q = x.getBoundingClientRect(); return q.right <= r.right - 8 && q.left >= r.left + 8; }); }, ids.c);
    check('the bottom row fits inside the card (no overflow)', foot);
    await p.evaluate(id => select([id]), ids.c); await p.waitForTimeout(300);
    check('selecting the judgment lights the evidence tied to it, both ways it was drawn', await p.evaluate(r => { const s = litSet().nodes; return s.has(r.a) && s.has(r.d); }, ids));
    await p.evaluate(() => select([]));

    /* a prototype branches from a conclusion */
    const dir = await p.evaluate(r => { const d = node('direction', { idea: r.c, letter: 'A', title: 'Fare on the map pin', text: 'Show the fare on each pin.', test: '5 of 8 book without opening details', mode: 'story' }, { x: 1100, y: 420 }); edge(r.c, d.id, 'derive', 'live'); renderAll(); return d.id; }, ids);
    check('a kept direction without a prototype appears in Prototype to pick', await p.evaluate(id => [...document.querySelectorAll('.bay-2 .bs-chip')].some(x => x.dataset.id === id && x.dataset.bayGo === 'build'), dir));
    await p.evaluate(id => { adopt(byId(id)); }, dir); await p.waitForTimeout(300);
    check('an adopted direction offers Prototype on its card', await p.evaluate(id => nodeEl(id).querySelector('.foot-branch')?.dataset.a === 'build', dir));
    await p.evaluate(id => focusNodes([byId(id)], .9, 0), dir); await p.waitForTimeout(300);
    await p.click(`[data-id="${dir}"] .foot-branch`); await p.waitForTimeout(2500);
    check('Prototype branches a prototype off the direction, into the Prototype lane', await p.evaluate(id => { const pr = board.nodes.find(n => n.type === 'proof' && n.dir === id); return !!pr && bayOf(pr) === 2 && board.edges.some(e => e.a === id && e.b === pr.id); }, dir));

    /* one entry */
    await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
    const t = await p.evaluate(() => ({ kids: [...document.querySelector('.top-right').children].filter(x => !x.hidden && getComputedStyle(x).display !== 'none').map(x => x.id || x.className), marks: document.querySelectorAll('#crewSetBtn .hub-mk').length, label: document.querySelector('#crewSetBtn .hub-l')?.textContent }));
    check('the top bar keeps drafts, the participation switch and one entry (no separate seats, connection chip or gear)', JSON.stringify(t.kids) === JSON.stringify(['reviewBtn', 'partSw', 'crew']) && t.marks === 4 && t.label === 'No AI connected', JSON.stringify(t));
    await p.click('#crewSetBtn'); await p.waitForTimeout(300);
    const h = await p.evaluate(() => ({ seats: [...document.querySelectorAll('#crewPop .seat')].map(s => s.querySelector('b').textContent).join(','), model: document.querySelector('#crewPop #crewModeBtn small')?.textContent, set: !!document.querySelector('#crewPop [data-crew-settings]'), r: $('crewPop').getBoundingClientRect().right }));
    check('the entry opens the crew, the model row and Settings', h.seats === 'Scout,Strategist,Wright,Critic' && h.model === 'No AI connected' && h.set && h.r <= 1440, JSON.stringify(h));
    await p.click('#crewPop .seat[data-agent="critic"]'); await p.waitForTimeout(300);
    check('a crew member opens what they did', await p.evaluate(() => agentPopKey === 'critic' && !$('agentPop').hidden && !crewPopOpen));
    await p.click('#crewSetBtn'); await p.waitForTimeout(200);
    if (!(await p.evaluate(() => crewPopOpen))) await p.click('#crewSetBtn');
    await p.click('#crewPop [data-crew-settings]'); await p.waitForTimeout(300);
    check('Settings opens from the entry', await p.evaluate(() => dlg.open && /Settings/i.test(dlg.innerText)));
    check('no page errors', !errs.length, errs.join(' | '));
    await c.close();
  } catch (e) { check('test run', false, String(e).split('\n')[0]); }
  await b.close(); srv.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failures}/${results.length} passed`); process.exit(failures ? 1 : 0);
})();

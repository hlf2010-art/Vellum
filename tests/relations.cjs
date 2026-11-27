#!/usr/bin/env node
/* Relations: smart snapping and connectors are two gestures for one relation (relations-contract.md).
 * Drives the real Vellum-Lumen.html in headless Chromium with real mouse drags.
 *
 *   node tests/relations.cjs            (from the repo root)
 *   node tests/relations.cjs --headed   (watch it)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

async function open(browser, base, theme = 'light') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
  await ctx.route(/wikipedia\.org/, r => r.abort());
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
  await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700);
  p.cards = specs => p.evaluate(specs => {
    const ids = specs.map(([type, f, x, y]) => { const n = node(type, f, { x, y }); n.status = 'ink'; return n.id; });
    cam = { x: 0, y: 0, s: 1 }; paintCam(); renderAll(); return ids;
  }, specs);
  p.box = id => p.evaluate(id => { const r = nodeEl(id).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, id);
  p.edges = () => p.evaluate(() => board.edges.map(e => ({ id: e.id, a: e.a, b: e.b, rel: e.rel, by: e.by, via: e.via, line: !!e.line })));
  p.toast = () => p.evaluate(() => [...document.querySelectorAll('#toasts > *')].map(t => t.innerText.replace(/\s+/g, ' ')).join(' / '));
  p.clearToasts = () => p.evaluate(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove()));
  /* press on the card's header and glide to (tx, ty) for its top-left, in steps like a hand would */
  p.drag = async (id, tx, ty, { alt = false, steps = 18, hold = 0, release = true } = {}) => {
    const b = await p.box(id), gx = 24, gy = 14;
    await p.mouse.move(b.x + gx, b.y + gy); await p.mouse.down();
    if (alt) await p.keyboard.down('Alt');
    for (let i = 1; i <= steps; i++) { await p.mouse.move(b.x + gx + (tx - b.x) * i / steps, b.y + gy + (ty - b.y) * i / steps); await p.waitForTimeout(12); }
    if (hold) await p.waitForTimeout(hold);
    if (release) { await p.mouse.up(); if (alt) await p.keyboard.up('Alt'); await p.waitForTimeout(450); }
  };
  /* drag a connector from a card's out dot to a screen point */
  p.wire = async (fromId, x, y) => {
    const b = await p.box(fromId); await p.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await p.waitForTimeout(150);
    const pt = await p.evaluate(id => { const r = nodeEl(id).querySelector('.port[data-port="out"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, fromId);
    await p.mouse.move(pt.x, pt.y); await p.mouse.down();
    for (let i = 1; i <= 14; i++) { await p.mouse.move(pt.x + (x - pt.x) * i / 14, pt.y + (y - pt.y) * i / 14); await p.waitForTimeout(12); }
    await p.mouse.up(); await p.waitForTimeout(400);
  };
  return p;
}

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    // R1. the toggle, the catch, the clasp, and the type picker
    {
      const p = await open(browser, base);
      const tb = await p.evaluate(() => { const b = $('snapBtn'); return b && { pressed: b.getAttribute('aria-pressed'), tip: b.dataset.tip }; });
      check('the toolbar has a Smart snap toggle, on by default', tb && tb.pressed === 'true' && /snap/i.test(tb.tip), JSON.stringify(tb));
      const [a, b] = await p.cards([['note', { text: 'Users abandon setup at step 3' }, 200, 200], ['image', { title: 'Setup screen photo' }, 760, 220]]);
      const A = await p.box(a), B = await p.box(b);
      // glide to 9px short of the snap spot and hold: the preview shows, nothing is made yet
      await p.drag(a, B.x - A.w - 12 - 9, A.y + 20, { release: false, hold: 120 });
      const pre = await p.evaluate(t => ({ guide: !!document.querySelector('#relLayer .snap-guide.on'), target: nodeEl(t).classList.contains('snap-target'), edges: board.edges.length }), b);
      check('near another card, a glowing seam previews the snap and the neighbour lights up; nothing is linked yet', pre.guide && pre.target && pre.edges === 0, JSON.stringify(pre));
      await p.mouse.up(); await p.waitForTimeout(500);
      let es = await p.edges();
      const geo = await p.evaluate(([a, b]) => { const x = byId(a), y = byId(b); return { gap: y.x - (x.x + nodeW(x)), top: x.y - y.y }; }, [a, b]);
      check('dropping it there snaps edge to edge (12px seam) and lines up the tops', geo.gap === 12 && geo.top === 0, JSON.stringify(geo));
      check('the snap makes one relation, yours, "related" (never read as agreement)', es.length === 1 && es[0].rel === 'related' && es[0].by === 'you' && es[0].via === 'snap', JSON.stringify(es));
      const look = await p.evaluate(id => ({ clasp: !!document.querySelector(`#relLayer .clasp:not(.gone)[data-clasp="${id}"]`), line: !!document.querySelector(`#wires .w-hit[data-edge="${id}"]`), pick: !$('relPick').hidden, opts: [...document.querySelectorAll('#relPick [data-relpick]')].map(b => b.dataset.relpick).join(',') }), es[0].id);
      check('a snapped relation shows as a clasp on the seam, not a line', look.clasp && !look.line, JSON.stringify(look));
      check('a quick type picker offers related / supports / counters / refines', look.pick && look.opts === 'related,supports,conflicts,extends', JSON.stringify(look));
      await p.keyboard.press('2'); await p.waitForTimeout(250);
      es = await p.edges();
      check('pressing 2 in the picker marks it "supports"', es[0].rel === 'supports', JSON.stringify(es));
      await p.keyboard.press('Escape'); await p.waitForTimeout(250);
      check('Esc closes the picker', await p.evaluate(() => $('relPick').hidden));

      // R2. a connector between already-snapped cards edits the same relation
      await p.clearToasts();
      const Bb = await p.box(b);
      await p.wire(a, Bb.x + Bb.w / 2, Bb.y + Bb.h - 20);
      es = await p.edges();
      const wp = await p.evaluate(() => ({ sel: selectedEdgeId, pop: !$('wirePop').hidden, on: $('wirePop').querySelector('.wp-rel .on')?.dataset.wireRel, line: !!$('wirePop').querySelector('[data-wire-line]') }));
      check('drawing a connector between snapped cards adds no second relation', es.length === 1, JSON.stringify(es));
      check('it opens the existing relation instead, with its type and a Show line option', wp.pop && wp.sel === es[0].id && wp.on === 'supports' && wp.line, JSON.stringify(wp));
      check('and says why', /already related/i.test(await p.toast()), await p.toast());
      await p.click('#wirePop [data-wire-rel="conflicts"]'); await p.waitForTimeout(200);
      check('the relation type can be changed from the connector popover', (await p.edges())[0].rel === 'conflicts');
      await p.click('#wirePop [data-wire-line]'); await p.waitForTimeout(200);
      check('Show line draws the snapped relation as a line', await p.evaluate(id => !!document.querySelector(`#wires .w-hit[data-edge="${id}"]`) && !document.querySelector(`#relLayer .clasp:not(.gone)[data-clasp="${id}"]`), es[0].id));
      await p.click('#wirePop [data-wire-line]'); await p.waitForTimeout(200);
      check('Hide line puts the clasp back', await p.evaluate(id => !!document.querySelector(`#relLayer .clasp:not(.gone)[data-clasp="${id}"]`), es[0].id));
      await p.evaluate(() => { selectedEdgeId = null; select([]); });

      // R3. pulling apart keeps the relation, drawn as a line; Unbind deletes it
      await p.clearToasts();
      const A2 = await p.box(a);
      await p.drag(a, A2.x - 220, A2.y + 160);
      es = await p.edges();
      const pulled = await p.evaluate(id => ({ line: !!document.querySelector(`#wires path.w.rel[data-dep]`), clasp: !!document.querySelector(`#relLayer .clasp:not(.gone)[data-clasp="${id}"]`), tag: document.querySelector(`#relLayer .rel-tag[data-reltag="${id}"]`)?.textContent }), es[0].id);
      check('pulling snapped cards apart keeps the relation and turns it into a line with its type on it', es.length === 1 && pulled.line && !pulled.clasp && pulled.tag === 'Counters', JSON.stringify({ es, pulled }));
      const t = await p.toast();
      check('a toast says the relation is still there and offers Unbind', /Still related/.test(t) && /Unbind/.test(t), t);
      await p.evaluate(() => [...document.querySelectorAll('#toasts button')].find(b => /Unbind/.test(b.textContent))?.click()); await p.waitForTimeout(300);
      check('Unbind deletes the relation', (await p.edges()).length === 0);
      await p.evaluate(() => undo()); await p.waitForTimeout(300);
      check('and Undo brings it back', (await p.edges()).length === 1);
      check('no page errors (R1-R3)', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // R4. Alt, the toggle, undo, nudging a snapped card
    {
      const p = await open(browser, base);
      const [a, b] = await p.cards([['note', { text: 'Price anchors at 199' }, 200, 200], ['note', { text: 'Interview: 6 of 8 said too pricey' }, 700, 200]]);
      const A = await p.box(a), B = await p.box(b);
      await p.drag(a, B.x - A.w - 12 - 6, A.y, { alt: true });
      let geo = await p.evaluate(([a, b]) => byId(b).x - (byId(a).x + nodeW(byId(a))), [a, b]);
      check('holding ⌥ while dragging skips the snap', (await p.edges()).length === 0 && geo !== 12, 'gap ' + geo);
      await p.keyboard.press('m'); await p.waitForTimeout(150);
      const off = await p.evaluate(() => ({ on: snapOn, pressed: $('snapBtn').getAttribute('aria-pressed'), saved: store.get('.snap', true) }));
      check('M turns Smart snap off, the toggle shows it and it is remembered', off.on === false && off.pressed === 'false' && off.saved === false, JSON.stringify(off));
      const A1 = await p.box(a);
      await p.drag(a, A1.x - 2, A1.y);
      check('with Smart snap off, cards that touch stay unrelated', (await p.edges()).length === 0);
      await p.click('#snapBtn'); await p.waitForTimeout(150);
      check('the toolbar button turns it back on', await p.evaluate(() => snapOn));
      const A2 = await p.box(a);
      const before = await p.evaluate(id => byId(id).x, a);
      await p.drag(a, A2.x + 4, A2.y);
      check('a card dropped next to its neighbour snaps', (await p.edges()).length === 1);
      await p.keyboard.press('Escape');
      await p.evaluate(() => undo()); await p.waitForTimeout(300);
      const un = await p.evaluate(id => ({ edges: board.edges.length, x: byId(id).x }), a);
      check('one Undo takes back both the move and the relation', un.edges === 0 && un.x === before, JSON.stringify({ un, before }));
      const A3 = await p.box(a);
      await p.drag(a, A3.x + 6, A3.y); await p.keyboard.press('Escape');
      await p.clearToasts();
      const pickBefore = await p.evaluate(() => board.log.length);
      const A4 = await p.box(a);
      await p.drag(a, A4.x - 8, A4.y + 30); // slide along the seam, well within the hold distance
      const nudge = await p.evaluate(([a, b, n]) => ({ edges: board.edges.length, gap: byId(b).x - (byId(a).x + nodeW(byId(a))), pick: !$('relPick').hidden, logs: board.log.length - n }), [a, b, pickBefore]);
      check('nudging a snapped card along the seam keeps it snapped and asks nothing again', nudge.edges === 1 && nudge.gap === 12 && !nudge.pick && nudge.logs === 0, JSON.stringify(nudge));
      check('no page errors (R4)', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // R5. a snapped group is a star and its planets: the star moves them all, a planet comes out alone
    {
      const p = await open(browser, base);
      const [a, b, c, d, f] = await p.cards([['note', { text: 'Grip ring' }, 200, 200], ['note', { text: 'Thumb rest' }, 700, 200], ['note', { text: 'Anodised finish' }, 200, 560], ['note', { text: 'CMF board' }, 1050, 600], ['note', { text: 'Knurl depth' }, 1050, 250]]);
      const A = await p.box(a);
      await p.drag(b, A.x + A.w + 14, A.y); await p.keyboard.press('Escape');
      const Ab = await p.box(a);
      await p.drag(c, Ab.x, Ab.y + Ab.h + 14); await p.keyboard.press('Escape');
      let es = await p.edges();
      check('three cards can snap into one group (two relations)', es.length === 2 && es.every(e => e.via === 'snap'), JSON.stringify(es));
      const st = await p.evaluate(([a, b, c]) => ({ size: bondCluster(a).length, star: starOf(b), flag: !!byId(a).star, planets: [b, c].map(x => !!byId(x).star), mark: document.querySelectorAll('#relLayer .star-mark').length }), [a, b, c]);
      check('the card the others snapped onto is the star of the group', st.size === 3 && st.star === a && st.flag && !st.planets[0] && !st.planets[1], JSON.stringify(st));
      check('the star wears one small orbit mark', st.mark === 1, String(st.mark));
      check('the star choice lives in one function (pickStar)', await p.evaluate(a => typeof pickStar === 'function' && pickStar({ movedIds: [], targetId: a }) === a, a));
      const pos = ids => p.evaluate(ids => ids.map(i => [byId(i).x, byId(i).y]), ids);
      // dragging the star moves the whole system
      let p0 = await pos([a, b, c]); const As = await p.box(a);
      await p.drag(a, As.x + 60, As.y + 36);
      let p1 = await pos([a, b, c]); let mv = p1.map((q, i) => [q[0] - p0[i][0], q[1] - p0[i][1]].join(','));
      check('dragging the star moves the whole group and keeps it snapped', new Set(mv).size === 1 && mv[0] === '60,36' && (await p.evaluate(() => board.edges.filter(isBonded).length)) === 2, JSON.stringify(mv));
      await p.evaluate(() => { selectedEdgeId = null; select([]); });
      // a clasp no longer drags anything: a press opens the relation
      es = await p.edges(); const abId = es.find(e => (e.a === a || e.b === a) && (e.a === b || e.b === b)).id;
      const claspAt = id => p.evaluate(id => { const r = document.querySelector(`#relLayer .clasp:not(.gone)[data-clasp="${id}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, id);
      let cp = await claspAt(abId); p0 = await pos([a, b, c]);
      await p.mouse.move(cp.x, cp.y); await p.mouse.down();
      for (let i = 1; i <= 12; i++) { await p.mouse.move(cp.x + 5 * i, cp.y + 3 * i); await p.waitForTimeout(12); }
      await p.mouse.up(); await p.waitForTimeout(350);
      p1 = await pos([a, b, c]);
      check('dragging a clasp moves nothing', JSON.stringify(p0) === JSON.stringify(p1), JSON.stringify([p0, p1]));
      await p.evaluate(() => { selectedEdgeId = null; renderWirePop?.(); });
      await p.mouse.click(cp.x, cp.y); await p.waitForTimeout(250);
      check('clicking a clasp opens its relation', await p.evaluate(() => !!selectedEdgeId && !$('wirePop').hidden));
      await p.keyboard.press('Escape'); await p.evaluate(() => { selectedEdgeId = null; select([]); renderWirePop?.(); });
      // tidying a planet: a small pull outward springs back and keeps it in orbit
      let Bb = await p.box(b);
      await p.drag(b, Bb.x + 20, Bb.y + 10);
      const tidy = await p.evaluate(([a, b]) => ({ gap: byId(b).x - (byId(a).x + nodeW(byId(a))), bonded: isBonded(relBetween(a, b)), tr: nodeEl(b).style.translate || '' }), [a, b]);
      check('a small tug on a planet keeps it in orbit (it springs back to the seam)', tidy.gap === 12 && tidy.bonded && tidy.tr === '', JSON.stringify(tidy));
      // pulling a planet out: it comes alone, the relation stays as a line
      await p.clearToasts(); p0 = await pos([a, c]); Bb = await p.box(b);
      await p.drag(b, Bb.x + 220, Bb.y + 160);
      p1 = await pos([a, c]);
      const out = await p.evaluate(([a, b]) => ({ rel: !!relBetween(a, b), bonded: isBonded(relBetween(a, b)), size: bondCluster(a).length, starA: starOf(a) }), [a, b]);
      check('dragging a planet away takes it out alone; the star and other planets stay put', JSON.stringify(p0) === JSON.stringify(p1), JSON.stringify([p0, p1]));
      check('the pulled-out planet keeps its relation, now a line', out.rel && !out.bonded && out.size === 2 && out.starA === a, JSON.stringify(out));
      check('the toast offers Unbind', /Unbind/.test(await p.toast()), await p.toast());
      // snapping onto a planet joins that planet's star
      await p.keyboard.press('Escape');
      const Cb = await p.box(c);
      await p.drag(f, Cb.x + Cb.w + 14, Cb.y); await p.keyboard.press('Escape');
      const join = await p.evaluate(([a, c, f]) => ({ relCF: !!relBetween(c, f), star: starOf(f), flagF: !!byId(f).star, drags: dragSet([a]).sort().join(','), want: [a, c, f].sort().join(',') }), [a, c, f]);
      check('a card snapped onto a planet joins that planet\'s star (one level deep)', join.relCF && join.star === a && !join.flagF && join.drags === join.want, JSON.stringify(join));
      // Make center
      const Cb2 = await p.box(c);
      await p.mouse.click(Cb2.x + Cb2.w / 2, Cb2.y + 14, { button: 'right' }); await p.waitForTimeout(250);
      const hasItem = await p.evaluate(() => !!document.querySelector('#cardMenu:not([hidden]) [data-cm="focus"]'));
      check('a planet\'s menu offers Set as focus', hasItem);
      if (hasItem) await p.click('#cardMenu [data-cm="focus"]'); else await p.evaluate(c => setFocus(c), c);
      await p.waitForTimeout(300);
      const mc = await p.evaluate(([a, c]) => ({ star: starOf(a), flagA: !!byId(a).star, log: board.log[0]?.html || board.log[board.log.length - 1]?.html || '' }), [a, c]);
      check('Set as focus makes that card the star', mc.star === c && !mc.flagA, JSON.stringify(mc));
      p0 = await pos([a, c, f]); const Cs = await p.box(c);
      await p.drag(c, Cs.x - 40, Cs.y + 30);
      p1 = await pos([a, c, f]); mv = p1.map((q, i) => [q[0] - p0[i][0], q[1] - p0[i][1]].join(','));
      check('the new focus now moves the whole group', new Set(mv).size === 1 && mv[0] === '-40,30', JSON.stringify(mv));
      await p.keyboard.press('Meta+z'); await p.keyboard.press('Control+z'); await p.waitForTimeout(250);
      // a connector onto a clasp relates to every card in that snapped group
      await p.evaluate(() => { selectedEdgeId = null; select([]); renderWirePop?.(); });
      es = await p.edges(); const acId = es.find(e => (e.a === a || e.b === a) && (e.a === c || e.b === c)).id;
      cp = await claspAt(acId);
      await p.wire(d, cp.x, cp.y);
      es = await p.edges();
      const toD = es.filter(e => e.a === d || e.b === d).map(e => e.a === d ? e.b : e.a).sort().join(',');
      check('a connector dropped on a clasp relates the card to every card in the snapped group', toD === [a, c, f].sort().join(','), JSON.stringify(es));
      check('no page errors (R5)', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // R5b. the star is the focus of the topic
    {
      const p = await open(browser, base);
      // the focus of a topic is the star, whichever card moved: an idea snapped onto a note becomes the star
      const [n1, i1, br] = await p.cards([['note', { text: 'Interview: grips slip when wet' }, 200, 300], ['idea', { text: 'A knurled ring fixes wet grip' }, 800, 300], ['notepad', { title: 'Project brief', text: 'Brief: a bottle for cyclists' }, 900, 650]]);
      await p.evaluate(([n1, i1]) => { const n = byId(n1), i = byId(i1); i.x = n.x + nodeW(n) + 40; i.y = n.y; renderAll(); }, [n1, i1]);
      const N = await p.box(n1);
      await p.drag(i1, N.x + N.w + 14, N.y); await p.keyboard.press('Escape');
      const r1 = await p.evaluate(([n1, i1]) => ({ star: starOf(n1), bonded: isBonded(relBetween(n1, i1)) }), [n1, i1]);
      check('an idea snapped onto a note becomes the star (the focus of the topic), even though it moved', r1.bonded && r1.star === i1, JSON.stringify(r1));
      const r2 = await p.evaluate(([n1, i1, br]) => {
        const n = byId(n1), b = byId(br); b.x = n.x; b.y = n.y + nodeH(n) + 12; makeRelation(br, n1, { via: 'snap' }); settleStar([br], n1, starOf(n1)); renderAll();
        return { star: starOf(i1), rank: focusRank(b) };
      }, [n1, i1, br]);
      check('a brief joining the group outranks the idea', r2.star === br && r2.rank === 2, JSON.stringify(r2));
      const r3 = await p.evaluate(([n1, i1]) => { setFocus(i1); return starOf(n1) === i1 && byId(i1).focus === 'you'; }, [n1, i1]);
      check('Set as focus overrides the rule', r3);
      check('no page errors (R5b)', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // R6. the crew reads relations as you stated them and never changes them
    {
      const p = await open(browser, base);
      const r = await p.evaluate(() => {
        const a = node('note', { text: 'Battery lasts two days in testing' }, { x: 0, y: 0 }), b = node('note', { text: 'Claim: all-week battery life' }, { x: 260, y: 0 }), c = node('note', { text: 'Unrelated hiring plan' }, { x: 900, y: 600 });
        [a, b, c].forEach(n => n.status = 'ink');
        const { e } = makeRelation(a.id, b.id, { via: 'wire' }); e.rel = 'conflicts';
        renderAll();
        const pick = contextFor(b).picks.find(p => p.n.id === a.id);
        const tag = pick ? ctxWhyText(pick.why) : '';
        const rows = relatedRows(b).map(r => r.n.id + ':' + r.relation + ':' + r.by);
        const out = dispatchCanvasActionsRun([{ action: 'connect', from: a.id, to: b.id, depType: 'live' }], { by: 'critic' });
        const rel = { edges: board.edges.length, rel: board.edges[0].rel, dep: board.edges[0].depType };
        const rule = autonomyPromptLine();
        return { tag, rows, rel, rule: /never change or remove one/.test(rule) && /not agreement/.test(rule), first: contextFor(b).picks[0]?.n.id === a.id };
      });
      check('the crew sees a relation you made, with its type and direction', /you linked them/.test(r.tag) && /counters this card/.test(r.tag), r.tag);
      check('it ranks first among the related cards', r.first);
      check('the Related list shows it as yours', r.rows.some(x => /:conflicts:you$/.test(x)), JSON.stringify(r.rows));
      check('a crew "connect" on a pair you related changes nothing', r.rel.edges === 1 && r.rel.rel === 'conflicts' && r.rel.dep === 'reference', JSON.stringify(r.rel));
      check('the crew is told relations are yours and "related" is not agreement', r.rule);
      const plain = await p.evaluate(() => { const x = node('note', { text: 'Alpha probe' }, { x: 0, y: 900 }), y = node('note', { text: 'Beta probe' }, { x: 300, y: 900 }); x.status = y.status = 'ink'; makeRelation(x.id, y.id, { via: 'snap' }); return ctxWhyText(contextFor(y).picks.find(p => p.n.id === x.id).why); });
      check('"related" reaches the crew as related, not agreement', /not agreement/.test(plain), plain);
      check('no page errors (R6)', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // R8. a note on a relation, and history that says what the type was
    {
      const p = await open(browser, base);
      const [a, b] = await p.cards([['note', { text: 'Trail app: offline maps' }, 200, 200], ['note', { text: 'Hikers want group sharing' }, 700, 240]]);
      const A = await p.box(a), B = await p.box(b);
      await p.wire(a, B.x + B.w / 2, B.y + B.h / 2);
      let es = await p.edges();
      await p.keyboard.press('2'); await p.waitForTimeout(150); await p.keyboard.press('Escape');
      await p.evaluate(id => selectEdge(id), es[0].id); await p.waitForTimeout(200);
      const hasInput = await p.evaluate(() => !!document.querySelector('#wirePop [data-wire-note]'));
      check('the relation popover has a note field', hasInput);
      await p.click('#wirePop [data-wire-note]');
      await p.keyboard.type('but only for solo hikers');
      await p.keyboard.press('Backspace'); await p.keyboard.type('s');
      check('typing in the note does not delete the relation (Backspace stays in the field)', (await p.edges()).length === 1);
      await p.keyboard.press('Enter'); await p.waitForTimeout(250);
      const n = await p.evaluate(([a, b]) => { const e = relBetween(a, b); const tag = document.querySelector(`#relLayer .rel-tag[data-reltag="${e.id}"]`); const pick = contextFor(byId(b)).picks.find(x => x.n.id === a);
        return { note: e.note, tag: tag && tag.textContent, title: tag && tag.title, ctx: pick ? ctxWhyText(pick.why) : '', log: board.log.slice(-1)[0].html }; }, [a, b]);
      check('Enter saves the note on the relation', n.note === 'but only for solo hikers', JSON.stringify(n));
      check('the line shows the type and the note', /^Supports · but only for solo/.test(n.tag) && /solo hikers$/.test(n.title), JSON.stringify(n));
      check('the crew reads the note with the relation', /your note: “but only for solo hikers”/.test(n.ctx), n.ctx);
      check('the note is in the Activity log', /Note on/.test(n.log) && /solo hikers/.test(n.log), n.log);
      await p.evaluate(() => undo()); await p.waitForTimeout(250);
      check('Undo takes the note back', !(await p.evaluate(([a, b]) => relBetween(a, b).note, [a, b])));
      await p.evaluate(id => selectEdge(id), es[0].id); await p.waitForTimeout(150);
      await p.click('#wirePop [data-wire-rel="conflicts"]'); await p.waitForTimeout(200);
      const lg = await p.evaluate(() => board.log.slice(-1)[0].html);
      check('changing the type is logged with what it was', /counters/.test(lg) && /was: supports/.test(lg), lg);
      check('no page errors (R8)', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    // R7. reduced motion and dark mode
    {
      const ctxOpts = { viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' };
      const ctx = await browser.newContext(ctxOpts); await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
      const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
      await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
      const r = await p.evaluate(async () => {
        const a = node('note', { text: 'Dark A' }, { x: 0, y: 0 }), b = node('note', { text: 'Dark B' }, { x: 252, y: 0 }); a.status = b.status = 'ink';
        const { e } = makeRelation(a.id, b.id, { via: 'snap' }); renderAll(); openRelPick(e.id);
        await new Promise(r => setTimeout(r, 50));
        const cl = document.querySelector(`#relLayer .clasp[data-clasp="${e.id}"] i`), pk = $('relPick');
        return { calm: calm(), anim: getComputedStyle(cl).animationName, pickAnim: getComputedStyle(pk).animationName, pickBg: getComputedStyle(pk).backgroundColor, label: getComputedStyle(pk.querySelector('.rp-opt')).color };
      });
      check('with reduced motion the clasp and picker appear without animation', r.calm && r.anim === 'none' && r.pickAnim === 'none', JSON.stringify(r));
      check('the picker uses the dark chrome in dark mode', /rgba?\((2\d|1\d|3\d),/.test(r.pickBg), JSON.stringify(r));
      check('no page errors (R7)', p.errors.length === 0, p.errors.join(' | '));
      await ctx.close();
    }
  } finally {
    await browser.close(); srv.close();
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

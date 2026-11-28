#!/usr/bin/env node
/* Relations and origins are two kinds of line, stored apart.
 * - A relation (related / supports / counters / refines) is what a person says about two cards. An origin says a card
 *   was made from another. A pair can have both; neither overwrites the other.
 * - A Scout background source is related to the idea it was found for, not "made from" it (and the idea is not made
 *   from the source): deleting a kept source asks nothing and flags nothing.
 * - A card that counters another is never fed to the crew as its material.
 * - Origin lines are hidden at rest. The card says "From …" at its foot; the line is drawn, dotted with an arrow, only
 *   while one of its cards is selected. Clicking "From …" selects the card it came from.
 * - Old boards are split once: a relation sitting on an origin edge becomes two edges; Scout's old source edges become
 *   Scout's relation.
 * - Keys: ⌘↵ keeps the drafts you selected (else the group under review); an empty composer's ↵ keeps nothing.
 * - The top "N drafts" pill counts cards and only takes you to them.
 *   node tests/relation-origin.cjs           (from the repo root)
 *   VELLUM_FILE=path node tests/relation-origin.cjs
 *   SHOTS=dir node tests/relation-origin.cjs (also light/dark, English/Chinese screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = process.env.VELLUM_FILE || path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

const FORK = JSON.stringify({ directions: [
  { title: 'Hours-left ring', plan: 'A ring of light that shrinks as hours run out.', test: '8 of 10 hikers read the hours left at a glance', mode: 'story' },
  { title: 'Spoken countdown', plan: 'The lantern says the hours left when tapped twice.', test: 'Hikers ask for it on 3 of 4 nights', mode: 'story' },
  { title: 'Glow tiers', plan: 'Three brightness tiers.', test: 'Users pick a tier in 5 s', mode: 'story' }] });
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp); }
      if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
        let body = ''; req.on('data', c => body += c); req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          const flat = (parsed.messages || []).map(m => typeof m.content === 'string' ? m.content : (m.content || []).map(p => p.text || '').join(' ')).join('\n');
          if (parsed.max_tokens === 1 && !parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: '.' } }] })); }
          const text = /Fork it into exactly/.test(flat) ? FORK : 'An answer.';
          if (!parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: text } }] })); }
          rsp.writeHead(200, { 'Content-Type': 'text/event-stream' });
          for (let k = 0; k < text.length; k += 40) rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text.slice(k, k + 40) } }] }) + '\n\n');
          rsp.end('data: [DONE]\n\n');
        }); return;
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
async function open(b, base, { theme = 'light', lang = 'en' } = {}) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, deviceScaleFactor: SHOTS ? 2 : 1 });
  await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route(/wikipedia|wikimedia|keenable|openverse/, r => r.abort());
  const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2000);
  if (lang === 'zh') { await p.evaluate(() => store.set('.lang', 'zh')); await p.reload(); await p.waitForTimeout(2000); }
  await p.evaluate(t => { store.set('.theme', t); document.documentElement.dataset.theme = t; }, theme);
  await p.evaluate(url => { apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'smoke', key: 'smoke' }; renderCrew(); }, base);
  p.fresh = () => p.evaluate(() => { board.nodes = []; board.edges = []; board.adopted = {}; board.declined = []; board.pins = {}; board.proposals = []; sel = []; renderAll(); });
  p.forkLantern = async (zh = false) => {
    await p.evaluate(zh => { checkpoint(); const idea = node('idea', { text: zh ? '一盏露营灯，告诉夜行的人还剩几小时光' : 'A camping lantern that tells night hikers how many hours of light are left' }, { x: 3000, y: 3000 }); renderAll(); window._idea = idea.id; window._f = fork(byId(idea.id), 3, '', { ask: false }); }, zh);
    await p.evaluate(() => window._f); await p.waitForTimeout(900);
  };
  return p;
}

(async () => {
  const srv = await serve(); const base = 'http://127.0.0.1:' + srv.address().port;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch();
  try {
    const p = await open(b, base);

    /* 1. storage: a relation and an origin on the same pair stay two things */
    await p.fresh();
    const s1 = await p.evaluate(() => {
      checkpoint(); const a = node('note', { text: 'Hikers check time left' }, { x: 3000, y: 3000 }), l = node('list', { title: 'Next', items: [{ t: 'a', done: false }], by: 'wright' }, { x: 3400, y: 3000 });
      edge(a.id, l.id, 'src', 'live'); const r = makeRelation(a.id, l.id, { rel: 'conflicts' });
      const between = board.edges.filter(e => (e.a === a.id && e.b === l.id) || (e.a === l.id && e.b === a.id));
      const stillOrigin = computeUpstreamImpact([a.id], { skipRelations: true }).transitiveIds.has(l.id);
      const x = node('note', { text: 'Battery anxiety' }, { x: 3000, y: 3300 }), y = node('note', { text: 'Show hours' }, { x: 3400, y: 3300 });
      makeRelation(x.id, y.id, { rel: 'supports' }); const e2 = edge(x.id, y.id, 'derive', 'live');
      return { n: between.length, relNew: !r.existed, relOnly: between.filter(e => e.rel).length, stillOrigin, deriveKept: e2.kind === 'derive' && !e2.rel, relKept: relBetween(x.id, y.id)?.rel === 'supports',
        madeFrom: computeUpstreamImpact([x.id], { skipRelations: true }).transitiveIds.has(y.id) };
    });
    check('a relation drawn on a pair the crew made from each other is a second edge, not a rewrite of the origin', s1.n === 2 && s1.relNew && s1.relOnly === 1 && s1.stillOrigin, JSON.stringify(s1));
    check('the crew making a card from an already related one adds an origin and leaves the relation alone', s1.deriveKept && s1.relKept && s1.madeFrom, JSON.stringify(s1));

    /* 2. Scout's background source is related to the idea, not "made from" it */
    await p.fresh();
    const s2 = await p.evaluate(async () => {
      checkpoint(); const idea = node('idea', { text: 'Lantern that shows hours left' }, { x: 3000, y: 3000 });
      const s = node('source', { _src: idea.id, title: 'Lithium battery', text: 'x', weight: 'reported', by: 'scout' }, { x: 2600, y: 3000 });
      const e = suggestRelation(s.id, idea.id, 'scout'); renderAll();
      const lineage = nodeLineageSummary(idea).deps.length, impact = computeUpstreamImpact([s.id], { skipRelations: true }).transitiveIds.size;
      const counted = groundOf(idea).sup.some(x => x.id === s.id);
      const r = await erase([s.id]); await wait(350);
      return { rel: e.rel, by: e.by, lineage, impact, counted, r, dialog: !!document.querySelector('dialog[open]'), flagged: !!nodeEl(idea.id)?.querySelector('.lineage-bar') };
    });
    check('Scout suggests a "related" relation it authored', s2.rel === 'related' && s2.by === 'scout', JSON.stringify(s2));
    check('the source still counts as something the idea rests on', s2.counted, JSON.stringify(s2));
    check('deleting a kept Scout source asks nothing and leaves your idea unflagged', s2.lineage === 0 && s2.impact === 0 && s2.r === 'deleted' && !s2.dialog && !s2.flagged, JSON.stringify(s2));
    await p.evaluate(() => document.querySelector('dialog[open]')?.close());

    /* 3. a counter is never material */
    await p.fresh();
    const s3 = await p.evaluate(() => {
      checkpoint(); const idea = node('idea', { text: 'Lantern shows hours' }, { x: 3000, y: 3000 });
      const c = node('source', { title: 'Hikers ignore battery icons', text: 'x', weight: 'observed' }, { x: 2600, y: 3000 });
      const s = node('source', { title: 'Hikers check their phone', text: 'y', weight: 'observed' }, { x: 2600, y: 3300 });
      makeRelation(c.id, idea.id, { rel: 'conflicts' }); makeRelation(s.id, idea.id, { rel: 'supports' });
      const d = node('direction', { idea: idea.id, letter: 'A', title: 'Ring', text: 'r', test: 't', by: 'muse' }, { x: 3400, y: 3000 }); edge(idea.id, d.id, 'derive', 'live');
      const g = groundOf(idea);
      return { mats: sourcesFor(d).map(x => x.title), ctr: g.ctr.map(x => x.title), sup: g.sup.map(x => x.title), basedOn: inspectNodeDependencies(idea).length };
    });
    check('a card that counters the claim is not fed to the crew as material for its directions', s3.mats.length === 1 && s3.mats[0] === 'Hikers check their phone', JSON.stringify(s3));
    check('the counter still reads as a counter', s3.ctr.join() === 'Hikers ignore battery icons' && s3.sup.join() === 'Hikers check their phone', JSON.stringify(s3));
    check('relations are not listed as where a card came from', s3.basedOn === 0, JSON.stringify(s3));

    /* 4. origin lines: hidden at rest, drawn with an arrow while one of their cards is selected; "From …" on the card */
    await p.fresh(); await p.forkLantern();
    const s4 = await p.evaluate(() => {
      const ds = board.nodes.filter(n => n.type === 'direction'); select([]); drawWires();
      const rest = document.querySelectorAll('#wires path.w.origin').length;
      const foot = nodeEl(ds[1].id)?.querySelector('.from-line')?.textContent || '';
      select([ds[1].id]); const one = [...document.querySelectorAll('#wires path.w.origin')];
      const arrow = one.every(x => x.getAttribute('marker-end') === 'url(#originArrow)') && !!document.querySelector('#originArrow');
      select([window._idea]); const fromIdea = document.querySelectorAll('#wires path.w.origin').length;
      return { rest, foot, one: one.length, arrow, fromIdea };
    });
    check('origin lines are not drawn at rest', s4.rest === 0, JSON.stringify(s4));
    check('a draft says where it came from at its foot', /^From “A camping lantern/.test(s4.foot), JSON.stringify(s4));
    check('selecting a card draws its origin line, dotted with an arrow', s4.one === 1 && s4.arrow, JSON.stringify(s4));
    check('selecting the card they came from draws all three', s4.fromIdea === 3, JSON.stringify(s4));
    await p.evaluate(() => { select([]); const d = board.nodes.find(n => n.type === 'direction'); cam = { x: 0, y: 0, s: 1 }; focusNodes([d], 1, 0); });
    await p.waitForTimeout(500);
    await p.evaluate(() => nodeEl(board.nodes.find(n => n.type === 'direction').id).querySelector('.from-line').click());
    await p.waitForTimeout(400);
    const s4b = await p.evaluate(() => ({ sel: sel.join(), idea: window._idea, lines: document.querySelectorAll('#wires path.w.origin').length }));
    check('clicking "From …" selects the card it came from, which draws the lines', s4b.sel === s4b.idea && s4b.lines === 3, JSON.stringify(s4b));
    const rel = await p.evaluate(() => { const ds = board.nodes.filter(n => n.type === 'direction'); ink(ds.map(d => d.id), { quiet: true }); const r = makeRelation(ds[0].id, ds[1].id, { rel: 'extends' }); r.e.line = true; select([]); drawWires(); return document.querySelectorAll('#wires path.w.rel').length; });
    check('a relation line still shows at rest', rel === 1, String(rel));

    /* 5. old boards split once */
    await p.fresh();
    const s5 = await p.evaluate(() => {
      const idea = node('idea', { text: 'Old idea' }, { x: 3000, y: 3000 }), s = node('source', { _src: idea.id, title: 'Old source', by: 'scout', weight: 'reported' }, { x: 2600, y: 3000 });
      const a = node('note', { text: 'A' }, { x: 3000, y: 3300 }), l = node('list', { title: 'L', items: [], by: 'wright' }, { x: 3400, y: 3300 });
      board.edges.push({ id: 'old1', a: s.id, b: idea.id, kind: 'src', depType: 'live' });
      board.edges.push({ id: 'old2', a: a.id, b: l.id, kind: 'src', depType: 'live', rel: 'conflicts', by: 'you' });
      delete board.edgesV; renderAll(); const first = JSON.stringify(board.edges); renderAll();
      const e1 = board.edges.find(e => e.id === 'old1'), e2 = board.edges.find(e => e.id === 'old2'), twin = board.edges.find(e => e.a === a.id && e.b === l.id && !e.rel);
      return { e1: [e1.rel, e1.by, e1.depType].join(), e2: [e2.rel, e2.depType].join(), twin: twin && [twin.kind, twin.depType].join(), n: board.edges.length, again: first === JSON.stringify(board.edges) };
    });
    check('an old Scout source edge becomes Scout\'s "related" relation', s5.e1 === 'related,scout,reference', JSON.stringify(s5));
    check('an old relation sitting on an origin edge splits into a relation and an origin', s5.e2 === 'conflicts,reference' && s5.twin === 'src,live' && s5.n === 3, JSON.stringify(s5));
    check('the split runs once', s5.again, JSON.stringify(s5));

    /* 6. keys */
    await p.fresh(); await p.forkLantern();
    await p.evaluate(() => { const ds = board.nodes.filter(n => n.type === 'direction'); select([ds[0].id]); document.activeElement?.blur(); });
    await p.keyboard.press('Control+Enter'); await p.waitForTimeout(300);
    const k1 = await p.evaluate(() => board.nodes.filter(n => n.type === 'direction').map(n => n.status).join());
    check('⌘↵ with one draft selected keeps that draft only', k1 === 'ink,sketch,sketch', k1);
    await p.evaluate(() => { select([]); lineIn.value = ''; lineIn.focus(); });
    await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    const k2 = await p.evaluate(() => board.nodes.filter(n => n.type === 'direction').map(n => n.status).join());
    check('↵ in an empty composer keeps nothing', k2 === 'ink,sketch,sketch', k2);
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    await p.evaluate(() => { lineIn.blur(); document.activeElement?.blur(); board.nodes = board.nodes.filter(n => n.type !== 'note'); select([]); renderAll(); });
    await p.keyboard.press('Control+Enter'); await p.waitForTimeout(300);
    const k3 = await p.evaluate(() => board.nodes.filter(n => n.type === 'direction').map(n => n.status).join());
    check('⌘↵ with nothing selected keeps the group under review', k3 === 'ink,ink,ink', k3);

    /* 7. the top pill counts cards and only navigates */
    await p.fresh(); await p.forkLantern();
    const s7 = await p.evaluate(() => {
      const idea = byId(window._idea);
      ['Headlamp', 'Lithium battery'].forEach((t, i) => { const n = node('source', { _src: idea.id, title: t, text: '…', weight: 'reported', by: 'scout', status: 'sketch', pid: 'p-scout' }, { x: 2560, y: 2900 + i * 190 }); suggestRelation(n.id, idea.id, 'scout'); });
      renderAll(); const pill = $('reviewTxt').textContent; toggleReviewPop(true);
      const pop = document.querySelector('#reviewPop') || document.querySelector('.review-pop');
      const out = { pill, head: pop?.querySelector('.rp-head')?.innerText, rows: [...(pop?.querySelectorAll('.rp-item strong') || [])].map(x => x.innerText), btns: pop?.querySelectorAll('.rp-btn,[data-rp-keep-all],[data-rp-drop-all]').length };
      toggleReviewPop(false); return out;
    });
    check('the pill counts five drafts, not two batches', s7.pill === '5 drafts' && /5 drafts/.test(s7.head || ''), JSON.stringify(s7));
    check('each row names who and what, not the first card', s7.rows.includes('Strategist · 3 directions') && s7.rows.includes('Scout · 2 sources'), JSON.stringify(s7));
    check('the list only navigates: no second set of keep and discard buttons', s7.btns === 0, JSON.stringify(s7));

    /* 8. a crew thought lifted into a note lands kept */
    await p.fresh();
    const s8 = await p.evaluate(async () => {
      checkpoint(); const n = node('idea', { text: 'Lantern' }, { x: 3000, y: 3000 });
      board.pins[n.id] = [{ id: 'pin-t', agent: 'critic', note: 'Check **cold weather** first.', t: NOW() }];
      renderAll(); await execAdvisorLift(n.id, 'pin-t'); await wait(200);
      const note = board.nodes.find(x => x.type === 'note'); return { st: note?.status, by: note?.by, text: note?.text, drafts: groups().size };
    });
    check('a thought lifted into a note lands kept (one press, not a second draft to review)', s8.st === 'ink' && s8.by === 'critic' && s8.text === 'Check cold weather first.' && s8.drafts === 0, JSON.stringify(s8));

    /* 9. drafts carry no thumbs */
    await p.fresh(); await p.forkLantern();
    const thumbs = await p.evaluate(() => board.nodes.filter(n => n.status === 'sketch').some(n => nodeEl(n.id)?.querySelector('.card-votes')));
    check('drafts carry no thumbs: keep or discard is the answer', !thumbs, String(thumbs));

    /* 10. Chinese: the foot line and the delete chip */
    const z = await open(b, base, { lang: 'zh' });
    await z.fresh(); await z.forkLantern(true);
    const zf = await z.evaluate(() => nodeEl(board.nodes.find(n => n.type === 'direction').id)?.querySelector('.from-line')?.textContent || '');
    check('the foot line reads 来自「…」 in Chinese', /^来自「一盏露营灯/.test(zf), zf);
    const zd = await z.evaluate(async () => { ink(board.nodes.filter(n => n.status === 'sketch').map(n => n.id), { quiet: true }); await erase([window._idea]); await wait(300); const t = document.querySelector('dialog[open] .del-kind')?.innerText || ''; document.querySelector('dialog[open]')?.close(); return t; });
    check('the delete dialog names card kinds in Chinese', /^方向 [ABC]$/.test(zd), zd);

    if (SHOTS) {
      for (const theme of ['light', 'dark']) for (const lang of ['en', 'zh']) {
        const q = await open(b, base, { theme, lang }); await q.fresh(); await q.forkLantern(lang === 'zh');
        await q.evaluate(() => { const ds = board.nodes.filter(n => n.type === 'direction'); ink(ds.map(d => d.id), { quiet: true }); select([]); focusNodes(board.nodes, 1, 0); });
        await q.waitForTimeout(700); await q.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-1-at-rest.png`) });
        await q.evaluate(() => select([board.nodes.filter(n => n.type === 'direction')[1].id])); await q.waitForTimeout(500);
        await q.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-2-selected.png`) });
        await q.context().close();
      }
    }
    check('no page errors', !p.errs.length && !z.errs.length, [...p.errs, ...z.errs].join(' | '));
  } finally { await b.close(); srv.close(); }
  console.log(results.join('\n')); console.log(failures ? `\n${failures} failed` : '\nall passed'); process.exit(failures ? 1 : 0);
})();

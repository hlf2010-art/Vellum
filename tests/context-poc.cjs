#!/usr/bin/env node
/* Context & decision-memory proof of concept: observable pass/fail checks.
 *
 *   node tests/context-poc.cjs                         deterministic: a scripted model, no network
 *   node tests/context-poc.cjs --live MODEL [--runs N]  also asks a real model (OpenAI-compatible relay)
 *        e.g. --live anthropic/claude-haiku-5.5   or   --live qwen/qwen3-vl-8b-instruct
 *        LIVE_BASE (default https://openrouter.ai/api/v1) and LIVE_KEY (default: none; a proxy may inject it)
 *   node tests/context-poc.cjs --json out.json         also writes every check as JSON
 *
 * Drives the real Vellum-Lumen.html in headless Chromium (same approach as vellum-smoke.cjs).
 * Lines marked KNOWN are limitations the PoC records rather than hides: they pass when the limitation still holds,
 * so a change that removes one shows up as a failure to re-read. */
const http = require('http'), fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const { chromium } = require('playwright');

const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const LIVE = arg('--live'), RUNS = +(arg('--runs') || 3), JSON_OUT = arg('--json'), SHOTS = arg('--shots');
const LIVE_BASE = process.env.LIVE_BASE || 'https://openrouter.ai/api/v1', LIVE_KEY = process.env.LIVE_KEY || '';
let queue = [], relay = false;
const LIVE_EMBED = process.env.LIVE_EMBED || 'openai/text-embedding-3-small';
/* scripted embeddings: one dimension per concept, so meaning is controlled by the test */
const embed = { mode: 'ok', calls: [] };
const CONCEPTS = [/onboard|sign-?ups?|quit|first project|abandon|activation|churn|new user|make anything|tutorial/i, /pizza|offsite/i, /espresso|descale/i, /legal|identity/i, /hiring|designers?|researcher/i];
const fakeVec = t => [...CONCEPTS.map(re => re.test(t) ? 1 : 0), 0.15];
const requests = [];

function relayCall(body) {
  // curl honours the session's HTTPS proxy and CA settings without extra setup
  return new Promise(res => {
    const args = ['-sS', '-m', '120', LIVE_BASE + '/chat/completions', '-H', 'Content-Type: application/json', '--data-binary', '@-'];
    if (LIVE_KEY) args.push('-H', 'Authorization: Bearer ' + LIVE_KEY);
    const c = execFile('curl', args, { maxBuffer: 1 << 24 }, (err, out) => {
      try { const j = JSON.parse(out); const c = j.choices?.[0]?.message?.content; if (c == null && j.error) { console.log('  relay: upstream error —', j.error.code, String(j.error.metadata?.raw || j.error.message || '').slice(0, 120)); return res(null); }
      const fin = j.choices?.[0]?.finish_reason || '';
      if (fin === 'length' && !c) { console.log('  relay: empty reply, finish_reason length (passed through)'); return res({ c: '', finish: 'length' }); }
      if (c == null) { console.log('  relay: no content —', JSON.stringify({ finish: j.choices?.[0]?.finish_reason, usage: j.usage && { completion: j.usage.completion_tokens, reasoning: j.usage.completion_tokens_details?.reasoning_tokens }, max_tokens: body.max_tokens })); if (process.env.RELAY_DUMP) fs.writeFileSync(process.env.RELAY_DUMP, JSON.stringify({ body, out: j }, null, 1)); } res(c == null ? null : { c, finish: fin }); } catch { console.log('  relay failed —', err ? err.message : String(out).trim().slice(0, 300)); res(null); }
    });
    c.stdin.end(JSON.stringify(body));
  });
}
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/Vellum-Lumen.html'))) {
        rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp);
      }
      if (req.method === 'POST' && req.url.endsWith('/embeddings')) {
        let body = ''; req.on('data', c => body += c); req.on('end', async () => {
          const parsed = JSON.parse(body || '{}'), input = parsed.input || [];
          embed.calls.push({ n: input.length, model: parsed.model, relay });
          if (relay) {
            const out = await new Promise(res => { const c = execFile('curl', ['-sS', '-m', '60', LIVE_BASE + '/embeddings', '-H', 'Content-Type: application/json', '--data-binary', '@-', ...(LIVE_KEY ? ['-H', 'Authorization: Bearer ' + LIVE_KEY] : [])], { maxBuffer: 1 << 26 }, (e, o) => res(e ? null : o)); c.stdin.end(JSON.stringify({ ...parsed, model: LIVE_EMBED })); });
            if (!out) { rsp.writeHead(502); return rsp.end(); }
            rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(out);
          }
          if (embed.mode === 'fail') { rsp.writeHead(503); return rsp.end(); }
          if (embed.mode === 'credits') { rsp.writeHead(402, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ error: { code: 402, message: 'Insufficient credits' } })); }
          rsp.writeHead(200, { 'Content-Type': 'application/json' });
          return rsp.end(JSON.stringify({ data: input.map((t, i) => ({ index: i, embedding: fakeVec(t) })) }));
        });
        return;
      }
      if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
        let body = ''; req.on('data', c => body += c); req.on('end', async () => {
          const parsed = JSON.parse(body || '{}');
          if (parsed.max_tokens === 1 && !parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: '.' } }] })); }
          const flat = (parsed.messages || []).map(m => typeof m.content === 'string' ? m.content : (m.content || []).map(p => p.text || '').join(' ')).join('\n');
          let txt = null, matched = null, finish = '';
          if (relay) {
            const r = await relayCall({ ...parsed, model: LIVE, stream: false });
            txt = r ? r.c : null; finish = r ? r.finish : ''; matched = 'live';
          } else {
            const i = queue.findIndex(e => new RegExp(e.match, 's').test(flat));
            const hit = i >= 0 ? queue.splice(i, 1)[0] : null;
            if (hit && !hit.status) { txt = typeof hit.text === 'string' ? hit.text : JSON.stringify(hit.text); matched = hit.id; finish = hit.finish || ''; }
            if (hit && hit.status) { requests.push({ matched: hit.id, full: flat, reply: null, max: parsed.max_tokens, status: hit.status }); rsp.writeHead(hit.status, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ error: { code: hit.status, message: hit.status === 402 ? 'Insufficient credits' : 'error' } })); }
          }
          requests.push({ matched, full: flat, reply: txt, max: parsed.max_tokens });
          if (txt == null) { rsp.writeHead(503); return rsp.end(); }
          rsp.writeHead(200, { 'Content-Type': 'text/event-stream' });
          for (let k = 0; k < txt.length; k += 40) rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: txt.slice(k, k + 40) } }] }) + '\n\n');
          if (finish) rsp.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] }) + '\n\n');
          rsp.end('data: [DONE]\n\n');
        });
        return;
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const results = []; let failures = 0;
function check(group, name, ok, detail = '', kind = 'PASS') {
  const label = ok ? kind : 'FAIL';
  results.push({ group, name, ok: !!ok, kind: ok ? kind : 'FAIL', detail: ok ? (kind === 'PASS' ? '' : detail) : detail });
  console.log(`${label.padEnd(5)} [${group}] ${name}${!ok || kind !== 'PASS' ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

async function openPage(browser, base, ctx) {
  ctx = ctx || await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', deviceScaleFactor: SHOTS ? 2 : 1 });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
  await p.evaluate(url => { apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'poc', key: 'poc' }; }, base);
  p.idle = async () => { await p.waitForTimeout(300); for (let i = 0; i < 160 && await p.evaluate(() => crewBusy() || advThinking.size > 0); i++) await p.waitForTimeout(250); await p.waitForTimeout(300); };
  p.toast = () => p.evaluate(() => [...document.querySelectorAll('#toasts > *')].map(t => t.innerText.replace(/\s+/g, ' ')).join(' / '));
  return { p, ctx };
}

/* The fixture board. Lanes are 1000 px wide: Gather 0–1000, Explore 1000–2000, Prototype 2000–3000.
 * T is the card under discussion. Each other card tests one thing about relevance. */
const FIXTURE = {
  T: { type: 'idea', x: 1100, y: 300, text: 'Cut onboarding to three steps so a new user reaches their first project in under two minutes.' },
  W1: { type: 'note', x: 1100, y: -40, text: 'Goal: raise week-one activation by 10% this quarter.', wire: 'T' },          // wired in
  N1: { type: 'note', x: 1470, y: 300, text: "Order pizza for Friday's team offsite." },                              // right beside T, unrelated
  N2: { type: 'note', x: 1100, y: 640, text: 'Interviews: users who skipped the tutorial during onboarding churned twice as often in their first week.' }, // beside T, related, pulls the other way
  F1: { type: 'note', x: 40, y: 2600, text: 'Session recordings show people abandon onboarding at the invite-your-team step.' },  // far away, shares words
  F2: { type: 'note', x: 2600, y: 60, text: 'Three steps to descale the espresso machine.' },                       // far away, shares only generic words
  F3: { type: 'note', x: 2900, y: 2800, text: 'Most sign-ups quit before they ever make anything.' },                // far away, same idea in other words
  N3: { type: 'note', x: 60, y: -900, text: 'Legal decision (12 Oct): onboarding must keep all five steps of the identity check; they cannot be shortened.' }, // far away, contradicts T outright
};

async function buildFixture(p) {
  return p.evaluate(F => {
    const ids = {};
    checkpoint();
    for (const [k, c] of Object.entries(F)) { const n = node(c.type, { text: c.text }, { x: c.x, y: c.y }); ids[k] = n.id; }
    for (const [k, c] of Object.entries(F)) if (c.wire) edge(ids[k], ids[c.wire], 'derive');
    renderAll(); persist();
    return ids;
  }, FIXTURE);
}
const dropSketches = p => p.evaluate(() => { const s = board.nodes.filter(n => n.status === 'sketch').map(n => n.id); if (s.length) { board.nodes = board.nodes.filter(n => !s.includes(n.id)); board.edges = board.edges.filter(e => !s.includes(e.a) && !s.includes(e.b)); renderAll(); persist(); } });
const parseJSON = t => { try { return JSON.parse(String(t || '').replace(/^[^{]*/, '').replace(/[^}]*$/, '')); } catch { return null; } };
const pickSummary = (p, id) => p.evaluate(id => { const cx = contextFor(byId(id), { limit: 10 }); return { picks: cx.picks.map(x => ({ id: x.n.id, why: x.why.map(w => w.k).join('+'), text: ctxWhyText(x.why) })), skipped: cx.skipped.map(x => ({ id: x.n.id, why: x.why })), index: cx.index.map(n => n.id) }; }, id);

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  let ids;
  try {
    const { p, ctx } = await openPage(browser, base);
    await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(800);
    await p.evaluate(() => { setCrew({ speak: 'never', act: 'drafts' }); }); // no unasked looks while the fixture is built
    ids = await buildFixture(p);
    const name = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
    const names = list => list.map(x => name[x.id || x] || '?');

    /* ── C: contextual relevance ─────────────────────────────────────────── */
    let cx = await pickSummary(p, ids.T);
    const picked = names(cx.picks);
    check('C', 'a wired card is read, and says why (linked directly)', cx.picks.some(x => x.id === ids.W1 && /wired/.test(x.why)), JSON.stringify(cx.picks));
    check('C', 'a far-away card on the same topic is read (F1, ~2,500 px away, other lane)', picked.includes('F1'), picked.join(','));
    check('C', 'the reason names the shared terms', /onboarding/.test(cx.picks.find(x => x.id === ids.F1)?.text || ''), cx.picks.find(x => x.id === ids.F1)?.text);
    check('C', 'a card right beside it but unrelated is not read (N1 pizza)', !picked.includes('N1'), picked.join(','));
    check('C', '…and is recorded as skipped "near, but no link and no shared topic"', cx.skipped.some(x => x.id === ids.N1 && /near/.test(x.why)), JSON.stringify(cx.skipped));
    check('C', 'a card beside it that is related is read on its topic, with nearness only as an extra reason (N2)', cx.picks.some(x => x.id === ids.N2 && x.why.startsWith('topic') && /near/.test(x.why)), JSON.stringify(cx.picks.find(x => x.id === ids.N2)));
    check('C', 'a far-away card that contradicts it is read (N3, legal decision)', picked.includes('N3'), picked.join(','));
    check('C', 'shared generic words alone do not qualify a card (F2 "three steps … espresso")', !picked.includes('F2'), picked.join(','));
    check('C', 'KNOWN: the term layer misses a paraphrase with no shared words (F3)', !picked.includes('F3'), picked.join(','), 'KNOWN');
    check('C', '…so on a small board it reaches the model as an index line instead (F3)', cx.index.includes(ids.F3), names(cx.index).join(','));

    // movement: where a card sits changes nothing but the "near" hint
    const before = await p.evaluate(id => { const n = byId(id); return { id: n.id, rev: n.rev, d: digest(n), edges: board.edges.length, changes: (board.changes || []).length }; }, ids.T);
    await p.evaluate(([t, n1]) => { checkpoint(); byId(t).x = 2300; byId(t).y = 1900; byId(n1).x = 2310; byId(n1).y = 2120; renderAll(); persist(); }, [ids.T, ids.N1]);
    await p.waitForTimeout(400);
    const after = await p.evaluate(id => { const n = byId(id); return { id: n.id, rev: n.rev, d: digest(n), edges: board.edges.length, edits: (board.changes || []).filter(c => c.id === id && c.op === 'edit').length }; }, ids.T);
    const cx2 = await pickSummary(p, ids.T);
    const strip = list => list.map(x => name[x.id] || x.id).sort().join(','); // the set of cards read; near/attention are hints
    check('P', 'moving a card keeps its identity, revision and content digest', before.id === after.id && before.rev === after.rev && before.d === after.d, JSON.stringify({ before, after }));
    check('P', 'moving a card keeps its links and is not logged as an edit', before.edges === after.edges && after.edits === 0, JSON.stringify(after));
    check('C', 'what the agent reads is the same after moving T to another lane (ignoring the near hint)', strip(cx.picks) === strip(cx2.picks), strip(cx.picks) + ' vs ' + strip(cx2.picks));
    check('C', 'parking the pizza card right on top of T still does not make it relevant', !names(cx2.picks).includes('N1') && cx2.skipped.some(x => x.id === ids.N1), JSON.stringify(cx2.skipped));

    /* ── P: revision history ─────────────────────────────────────────────── */
    const longText = 'Brief v1. ' + 'We want a first session that feels like progress rather than paperwork. '.repeat(9);
    await p.evaluate(([id, t]) => { const n = byId(id); const ed = txt => { checkpoint(); const pd = digest(n), pt = n.title, px = n.text; n.text = txt; recordNodeEdit(n, pd, pt, px); }; ed(t); ed(t.replace('v1', 'v2')); ed(t.replace('v1', 'v3')); renderAll(); persist(); }, [ids.W1, longText]);
    const rev = await p.evaluate(id => { const n = byId(id); return { rev: n.rev, versions: (n.versions || []).map(v => v.text.length), full: revisionsOf(n).map(v => v.text.slice(0, 9)) }; }, ids.W1);
    check('P', 'each edit makes a revision, and earlier text is kept in full (was clipped to 160 chars)', rev.rev === 4 && rev.versions[1] === longText.trim().length, JSON.stringify(rev));
    check('P', 'the full history reads in order, current last', JSON.stringify(rev.full) === JSON.stringify(['Goal: rai', 'Brief v1.', 'Brief v2.', 'Brief v3.']), JSON.stringify(rev.full));

    /* ── R: decisions stay on the record ─────────────────────────────────── */
    await p.evaluate(([t, w]) => { const n = byId(w); checkpoint(); n.text = 'Goal: raise week-one activation by 10% this quarter.'; byId(t).x = 1100; byId(t).y = 300; persist(); }, [ids.T, ids.W1]);
    const draftId = await p.evaluate(t => { checkpoint(); const d = node('note', { text: 'Add a mandatory video tutorial before the first project.', by: 'muse', status: 'sketch' }, { x: 1500, y: 900 }); edge(t, d.id, 'derive'); renderAll(); persist(); return d.id; }, ids.T);
    await p.evaluate(id => erase([id], { reason: 'People skip videos; it adds time before value.' }), draftId); await p.waitForTimeout(500);
    let dec = await p.evaluate(() => (board.declined || []).map(d => ({ kind: d.kind, title: d.title, text: d.text, by: d.by, target: d.target, reason: d.reason })));
    check('R', 'discarding a draft keeps a record: what, by whom, about which card, why', dec.length === 1 && dec[0].kind === 'draft' && /mandatory video tutorial/.test(dec[0].text) && dec[0].by === 'muse' && dec[0].target === ids.T && /skip videos/.test(dec[0].reason), JSON.stringify(dec));
    await p.evaluate(() => undo()); await p.waitForTimeout(300);
    check('R', 'undoing the discard withdraws the record (and brings the draft back)', await p.evaluate(id => !(board.declined || []).length && !!byId(id), draftId));
    await p.evaluate(id => erase([id], { reason: 'People skip videos; it adds time before value.' }), draftId); await p.waitForTimeout(500);

    // directions: adopt A over B
    const dirs = await p.evaluate(t => { checkpoint(); const mk = (l, title, text, x) => { const d = node('direction', { idea: t, letter: l, title, text, test: 'Five new users, timed.', by: 'muse', mode: 'story' }, { x, y: 1300 }); edge(t, d.id, 'derive', 'live'); return d.id; }; const a = mk('A', 'Three-step setup', 'Merge profile, workspace and template into three screens.', 1100); const b = mk('B', 'Gamified checklist', 'A points-and-badges checklist that rewards each setup task.', 1500); renderAll(); persist(); return { a, b }; }, ids.T);
    await p.evaluate(a => adopt(byId(a)), dirs.a); await p.waitForTimeout(300);
    dec = await p.evaluate(() => (board.declined || []).map(d => ({ kind: d.kind, title: d.title, reason: d.reason })));
    check('R', 'adopting A records B as passed over, with the reason "Adopted A … instead"', dec.some(d => d.kind === 'passed-over' && /Gamified checklist/.test(d.title) && /Adopted A · Three-step setup/.test(d.reason)), JSON.stringify(dec));

    // Strategist: hears the declined directions; repeats are held back
    queue = [{ id: 'fork1', match: '"directions"', text: { directions: [
      { title: 'Video tutorial first', plan: 'Add a mandatory video tutorial before the first project.', test: 'Time five users.', mode: 'story' },
      { title: 'Template gallery start', plan: 'Start new users on a gallery of ready templates.', test: 'Five users pick one in a minute.', mode: 'desk' }] } }];
    await p.evaluate(t => fork(byId(t), 2), ids.T); await p.idle();
    const forkReq = requests.filter(r => r.matched === 'fork1').at(-1)?.full || '';
    check('R', 'Strategist is told what was turned down and why (draft + passed-over direction)', /already turned down[\s\S]*mandatory video tutorial[\s\S]*skip videos/.test(forkReq) && /already turned down[\s\S]*Gamified checklist[^\n]*Adopted A/.test(forkReq), forkReq.slice(-700));
    let made = await p.evaluate(() => board.nodes.filter(n => n.type === 'direction' && n.status === 'sketch').map(n => n.title));
    check('R', 'a direction repeating a declined draft is held back; the new one arrives', made.length === 1 && made[0] === 'Template gallery start', JSON.stringify(made));
    check('R', 'holding it back is logged and announced', await p.evaluate(() => (board.changes || []).some(c => c.op === 'hold-repeat')) && /Held back 1 direction/.test(await p.toast()), await p.toast());
    await dropSketches(p);

    // new evidence answers the reason: a revisit is allowed, and says why
    const ev = await p.evaluate(() => { checkpoint(); const n = node('note', { text: 'New study: short tutorial videos did not slow people down, and people who watched one reached their first project sooner.' }, { x: 100, y: 1800 }); renderAll(); persist(); return n.id; });
    queue = [{ id: 'fork2', match: '"directions"', text: { directions: [{ title: 'Video tutorial first', plan: 'Add a mandatory video tutorial before the first project.', test: 'Time five users.', mode: 'story' }] } }];
    await p.evaluate(t => fork(byId(t), 1), ids.T); await p.idle();
    made = await p.evaluate(() => board.nodes.filter(n => n.type === 'direction' && n.status === 'sketch').map(n => ({ t: n.title, rv: n.revisits })));
    check('R', 'after a newer card speaks to the reason, the idea may come back, marked with the card that changed things', made.length === 1 && made[0].rv && made[0].rv.by === ev, JSON.stringify(made));
    check('R', 'KNOWN: "speaks to the reason" is topic overlap, not a judgement that the evidence answers it', true, 'the new card is about short videos; the guard cannot tell optional from mandatory', 'KNOWN');
    await dropSketches(p);
    await p.evaluate(id => { checkpoint(); board.nodes = board.nodes.filter(n => n.id !== id); renderAll(); persist(); }, ev);

    /* ── E: explanation, and S: no unasked changes ───────────────────────── */
    const keys = await p.evaluate(t => Object.fromEntries(ctxCandidates(byId(t), { limit: 6 }).rows.map(r => [r.n.id, r.key])), ids.T);
    const snap = () => p.evaluate(() => JSON.stringify(board.nodes.filter(n => n.status === 'ink').map(n => [n.id, digest(n), n.rev || 1]).sort()));
    const kept0 = await snap(), count0 = await p.evaluate(() => board.nodes.length);
    queue = [{ id: 'adv1', match: 'Include 1 or at most 2 pins', text: { keywords: ['three steps', 'tutorial'], thoughts: ['Reading the claim', 'The interviews pull the other way', 'Worth flagging'], basis: [{ key: keys[ids.N2], relation: 'conflicts', why: 'skipping the tutorial doubled churn' }, { key: 'C99', relation: 'supports', why: 'invented' }], pins: [{ agent: 'critic', note: 'Cutting to **three steps** may cut the part that keeps people: the **interviews** say skippers churned twice as often.', liftAct: 'critique', liftLabel: 'Draft a question' }] } }];
    await p.evaluate(t => { board.pins = {}; return runAdvisorOnNode(t, { force: true }); }, ids.T); await p.idle();
    const advReq = requests.filter(r => r.matched === 'adv1').at(-1)?.full || '';
    const pin = await p.evaluate(t => (board.pins[t] || [])[0] || null, ids.T);
    check('E', 'the advisor is given keyed candidates and no canvas coordinates', /\nC1 \[/.test(advReq) && !/"x"\s*:|\bx=\d|\bposition\b/i.test(advReq), advReq.slice(0, 300));
    const pz = advReq.split('\n').filter(l => /pizza/i.test(l));
    check('E', 'the unrelated neighbour (pizza) is never a scored candidate, at most an index line', pz.every(l => /^C\d+ \[index only\]/.test(l)), pz.join(' | '));
    check('E', 'the advisor hears the declined draft, with its reason', /already turned down[\s\S]*mandatory video tutorial[\s\S]*skip videos/.test(advReq), advReq.slice(-600));
    check('E', 'the thought records which card informed it and how (N2, conflicts)', pin && pin.basis?.length === 1 && pin.basis[0].id === ids.N2 && pin.basis[0].relation === 'conflicts' && pin.basis[0].signals.includes('topic'), JSON.stringify(pin && pin.basis));
    check('E', 'a citation to a card it was never given is dropped, and noted', pin && JSON.stringify(pin.basisDropped) === '["C99"]', JSON.stringify(pin && pin.basisDropped));
    check('S', 'the advisor changed no kept card and made no card', kept0 === await snap() && count0 === await p.evaluate(() => board.nodes.length));
    await p.evaluate(t => toggleAdvPop(t), ids.T); await p.waitForTimeout(300);
    const popTxt = await p.evaluate(() => document.querySelector('#advPop .adv-basis')?.innerText || '');
    if (SHOTS) { await p.evaluate(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove())); await p.waitForTimeout(200); fs.mkdirSync(SHOTS, { recursive: true }); const box = await p.locator('#advPop').boundingBox(); const card = await p.locator(`[data-id="${ids.T}"]`).boundingBox(); if (box && card) { const x0 = Math.max(0, Math.min(box.x, card.x) - 24), y0 = Math.max(0, Math.min(box.y, card.y) - 24); await p.screenshot({ path: path.join(SHOTS, 'based-on.png'), clip: { x: x0, y: y0, width: Math.min(1440 - x0, Math.max(box.x + box.width, card.x + card.width) - x0 + 24), height: Math.min(900 - y0, Math.max(box.y + box.height, card.y + card.height) - y0 + 24) } }); } }
    check('E', 'the thought shows "Based on · Conflicts · <card>"', /Based on/.test(popTxt) && /Interviews/.test(popTxt) && /Conflicts/.test(popTxt), popTxt);
    await p.click(`#advPop [data-adv-basis="${ids.N2}"]`); await p.waitForTimeout(400);
    check('E', 'choosing the name selects that card', await p.evaluate(id => sel.includes(id), ids.N2));

    // without a model the thought still names its basis, from the deterministic signals
    await p.evaluate(t => { board.pins = {}; return runAdvisorOnNode(t, { force: true }); }, ids.T); await p.idle();
    const local = await p.evaluate(t => (board.pins[t] || [])[0]?.basis || [], ids.T);
    check('E', 'offline (built-in rules), the thought still says what it rests on and why', local.length > 0 && local.every(b => b.why && b.signals.length), JSON.stringify(local));

    // ignore a thought after replying: the reply becomes the reason; a repeat is held back
    await p.evaluate(t => { board.pins = { [t]: [{ id: 'pin-v', agent: 'muse', note: 'What about a **mandatory video tutorial** before the first project?', t: NOW(), seen: true, replies: [{ id: 'r1', who: 'you', text: 'We tried videos last year; nobody watched them.', t: NOW() }] }] }; renderNodes(); }, ids.T);
    await p.evaluate(t => { closeAdvPop(); toggleAdvPop(t); }, ids.T); await p.waitForTimeout(300);
    await p.click('#advPop [data-adv-del="pin-v"]'); await p.waitForTimeout(300);
    const pinDec = await p.evaluate(() => (board.declined || []).find(d => d.kind === 'pin'));
    check('R', 'ignoring a thought keeps a record; your reply in its thread is the reason', pinDec && /mandatory video tutorial/.test(pinDec.text) && /nobody watched/.test(pinDec.reason), JSON.stringify(pinDec));
    queue = [{ id: 'adv2', match: 'Include 1 or at most 2 pins', text: { keywords: ['video'], thoughts: ['a', 'b', 'c'], basis: [], pins: [{ agent: 'muse', note: 'Have you considered a **mandatory video tutorial** before the first project?', liftAct: 'note', liftLabel: 'Pin it' }] } }];
    const holds0 = await p.evaluate(() => (board.changes || []).filter(c => c.op === 'hold-repeat').length);
    await p.evaluate(t => { board.pins = {}; return runAdvisorOnNode(t, { force: true }); }, ids.T); await p.idle();
    check('R', 'a thought repeating one you turned down is held back (no pin, logged)', await p.evaluate(([t, h]) => !(board.pins[t] || []).length && (board.changes || []).filter(c => c.op === 'hold-repeat').length === h + 1, [ids.T, holds0]));

    // declining a suggested edit, with a reason
    await p.evaluate(t => { const n = byId(t); propose('critic', 'model', 'edit', n, { text: 'Cut onboarding to one step.' }); renderAll(); }, ids.T);
    await p.evaluate(t => rejectProposal(openProps(t)[0].id, 'One step drops the workspace choice we need.'), ids.T); await p.waitForTimeout(200);
    check('R', 'declining a suggested edit keeps the suggestion and the reason', await p.evaluate(() => (board.declined || []).some(d => d.kind === 'edit' && /one step/.test(d.text) && /workspace choice/.test(d.reason)) && board.proposals.some(p => p.status === 'rejected' && p.reason)));

    // Copilot's digest: related by meaning, and what was turned down
    const dig = await p.evaluate(t => boardDigestForCopilot({ query: 'what should we do next', ctx: [byId(t)] }), ids.T);
    const rb = (dig.match(/Cards related by link or topic[^\n]*\n((?:- [^\n]*\n?)*)/) || [])[1] || '';
    check('C', "Copilot's board digest lists the far related card and not the neighbour", /abandon onboarding/.test(rb) && !/pizza/i.test(rb), rb || dig.slice(0, 600));
    check('R', "Copilot's board digest carries the turned-down ideas and reasons", /already turned down[\s\S]*mandatory video tutorial[\s\S]*Gamified checklist/.test(dig), dig.slice(0, 1400));

    /* ── P: everything survives a reload (a new session) ─────────────────── */
    await p.waitForTimeout(800);
    const picksPre = strip((await pickSummary(p, ids.T)).picks);
    const pre = await p.evaluate(([t, w, n2]) => ({ board: board.id, rev: byId(w).rev, versions: byId(w).versions.length, edges: board.edges.length, declined: board.declined.map(d => d.kind + ':' + (d.reason ? 'r' : '-')).join(','), adopted: JSON.stringify(board.adopted), rejected: board.proposals.filter(p => p.status === 'rejected').length, changes: board.changes.length }), [ids.T, ids.W1, ids.N2]);
    await p.reload(); await p.waitForTimeout(2600);
    await p.evaluate(url => { apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'poc', key: 'poc' }; }, base); // test settings are not saved
    const post = await p.evaluate(([t, w, n2]) => ({ board: board.id, rev: byId(w).rev, versions: byId(w).versions.length, edges: board.edges.length, declined: (board.declined || []).map(d => d.kind + ':' + (d.reason ? 'r' : '-')).join(','), adopted: JSON.stringify(board.adopted), rejected: (board.proposals || []).filter(p => p.status === 'rejected').length, changes: (board.changes || []).length }), [ids.T, ids.W1, ids.N2]);
    check('P', 'after a reload: same board, revisions, links, adoption, declined suggestions and decision records', JSON.stringify(pre) === JSON.stringify(post), JSON.stringify({ pre, post }));
    const picksPost = strip((await pickSummary(p, ids.T)).picks);
    check('P', 'after a reload the context picks are the same', picksPre === picksPost, picksPre + ' vs ' + picksPost);
    check('S', 'no page errors', p.errors.length === 0, p.errors.join(' | '));

    /* ── L: a real model, run several times ──────────────────────────────── */
    if (LIVE) {
      relay = true;
      if (!process.argv.includes('--no-embed')) await p.evaluate(() => { apiCfg.embedModel = 'live-embed'; ctxVec.clear(); ctxEmbedFailSig = null; });
      const live = { explicit: 0, answered: 0, forkAnswered: 0, far1: 0, far3: 0, pizza: 0, conflict: 0, invalid: 0, pins: 0, repeatModel: 0, repeatShown: 0, edits: 0, ran: 0, forkRepeat: 0, forkRuns: 0, ctrlRepeat: 0 };
      for (let i = 0; i < RUNS; i++) {
        const k0 = await snap();
        const n0 = requests.length;
        await p.evaluate(t => { board.pins = {}; if (board.related) delete board.related[t]; return runAdvisorOnNode(t, { force: true }); }, ids.T); await p.idle();
        const reply = requests.slice(n0).find(r => /Include 1 or at most 2 pins/.test(r.full))?.reply || '';
        const f3line = (requests.slice(n0).find(r => /Include 1 or at most 2 pins/.test(r.full))?.full || '').split('\n').find(l => /Most sign-ups quit/.test(l)) || '(F3 not in prompt)';
        if (i === 0) console.log('  F3 in the prompt: ' + f3line.slice(0, 120));
        const relIds = await p.evaluate(t => (board.related?.[t]?.items || []).map(x => x.id), ids.T);
        if (relIds.includes(ids.F3)) live.relF3 = (live.relF3 || 0) + 1;
        if (relIds.includes(ids.N1)) live.relPizza = (live.relPizza || 0) + 1;
        if (relIds.includes(ids.F1)) live.relF1 = (live.relF1 || 0) + 1;
        const out = await p.evaluate(([t, ids]) => { const ps = board.pins[t] || []; const b = ps.flatMap(x => x.basis || []); return { n: ps.length, ids: b.map(x => x.id), rel: Object.fromEntries(b.map(x => [x.id, x.relation])), dropped: ps.flatMap(x => x.basisDropped || []), notes: ps.map(x => x.note).join(' ') }; }, [ids.T, ids]);
        live.ran++;
        if (out.n) live.pins++;
        if (out.ids.includes(ids.F1)) live.far1++;
        if (out.ids.includes(ids.F3)) live.far3++;
        if (out.ids.includes(ids.N1) || /pizza/i.test(out.notes)) live.pizza++;
        if (out.rel[ids.N2] === 'conflicts' || (out.ids.includes(ids.N2) && /churn|skip/i.test(out.notes))) live.conflict++;
        if (out.rel[ids.N3] === 'conflicts' || /legal|identity check/i.test(out.notes)) live.explicit++;
        if (/\bC\d{1,2}\b/.test(out.notes)) live.keyLeak = (live.keyLeak || 0) + 1;
        if (out.dropped.length) live.invalid++;
        const advReplies = requests.slice(n0).filter(r => /Include 1 or at most 2 pins/.test(r.full)).map(r => parseJSON(r.reply));
        if (advReplies.some(j => j?.pins)) live.answered++;
        const raw = advReplies.find(j => j?.pins) || parseJSON(reply), rawNotes = (raw?.pins || []).map(x => x?.note || '').join(' ');
        if (/video/i.test(rawNotes)) live.repeatModel++;
        if (/video/i.test(out.notes)) live.repeatShown++;
        if (k0 !== await snap()) live.edits++;
        console.log(`  live advisor run ${i + 1}: pins=${out.n} cited=${out.ids.map(x => name[x] || '?').join(',') || '-'} rel=${JSON.stringify(Object.fromEntries(Object.entries(out.rel).map(([k, v]) => [name[k] || k, v])))}${out.dropped.length ? ' dropped=' + out.dropped : ''}\n    “${out.notes.slice(0, 220)}”`);
      }
      // Strategist: discard two directions the models tend to propose on their own (seen in earlier runs), with reasons;
      // then fork with decision memory, and again without it (the old behaviour: discarded drafts simply vanish)
      await p.evaluate(t => { checkpoint(); const mk = (title, text) => { const d = node('direction', { idea: t, letter: 'C', title, text, test: 'Five new users.', by: 'muse', status: 'sketch', mode: 'story' }, { x: 1900, y: 1300 }); edge(t, d.id, 'derive'); return d.id; }; const a = mk('Sample project first', 'Start every new user inside a pre-filled sample project.'); const b = mk('Skip profile setup', 'Let people skip profile setup and fill it in later.'); renderAll(); return [a, b]; }, ids.T).then(ds => p.evaluate(async ds => { await erase([ds[0]], { reason: 'Tested in March: people could not tell the sample from their own work.' }); await erase([ds[1]], { reason: 'Profile answers pick the workspace template; skipping breaks setup.' }); }, ds));
      await p.waitForTimeout(600);
      for (const memory of [true, false]) for (let i = 0; i < RUNS; i++) {
        const saved = await p.evaluate(() => JSON.stringify(board.declined || []));
        if (!memory) await p.evaluate(() => { board.declined = []; });
        const n0 = requests.length, h0 = await p.evaluate(() => (board.changes || []).filter(c => c.op === 'hold-repeat').length);
        await p.evaluate(t => fork(byId(t), 2), ids.T); await p.idle();
        const reply = requests.slice(n0).find(r => /"directions"/.test(r.full))?.reply || '';
        const rawDirs = (parseJSON(reply)?.directions || []).map(d => `${d?.title || ''} ${d?.plan || ''}`).join(' | ');
        const repeat = /video tutorial|gamif|badge|sample project|sample-first|skip(ping)?\s+(the\s+)?profile/i.test(rawDirs);
        const titles = await p.evaluate(() => board.nodes.filter(n => n.type === 'direction' && n.status === 'sketch').map(n => n.title));
        if (memory) { live.forkRuns++; if (repeat) live.forkRepeat++; if (parseJSON(reply)?.directions) live.forkAnswered++; } else if (repeat) live.ctrlRepeat++;
        console.log(`  live fork (${memory ? 'with' : 'without'} decision memory) ${i + 1}: ${repeat ? 'REPEATED a declined idea (' + rawDirs.slice(0, 160) + ')' : 'no repeat'} → kept ${JSON.stringify(titles)}; held back ${await p.evaluate(() => (board.changes || []).filter(c => c.op === 'hold-repeat').length) - h0}`);
        await dropSketches(p);
        await p.evaluate(s => { board.declined = JSON.parse(s); }, saved);
      }
      const R = live.ran, rate = (k, n = R) => `${k}/${n}`;
      const lenRetries = await p.evaluate(() => apiLengthRetries);
      check('L', `[${LIVE}] the model itself answered (not the built-in fallback): advisor`, live.answered === R, rate(live.answered) + ` · replies retried after running out of tokens: ${lenRetries}`, 'PASS');
      check('L', `[${LIVE}] the model itself answered (not the built-in fallback): Strategist`, live.forkAnswered === live.forkRuns, rate(live.forkAnswered, live.forkRuns));
      const emb = await p.evaluate(() => ({ calls: ctxEmbedCalls, vecs: ctxVec.size, failed: !!ctxEmbedFailSig }));
      if (!process.argv.includes('--no-embed')) check('L', `[${LIVE}] embeddings (${LIVE_EMBED}) were used for meaning`, emb.vecs > 0 && !emb.failed, JSON.stringify(emb));
      check('L', `[${LIVE}] the advisor produced a thought`, live.pins === R, rate(live.pins));
      check('L', `[${LIVE}] cited the far related card F1 (shared words)`, live.far1 >= 1, rate(live.far1), live.far1 >= Math.ceil(R / 2) ? 'PASS' : 'PART');
      check('L', `[${LIVE}] cited the far paraphrase F3 (no shared words, index only)`, live.far3 >= 1, rate(live.far3), live.far3 === R ? 'PASS' : 'PART');
      check('L', `[${LIVE}] never cited or mentioned the neighbouring pizza card`, live.pizza === 0, rate(live.pizza));
      check('L', `[${LIVE}] judged the far paraphrase F3 related (Related section, not the note)`, (live.relF3 || 0) >= 1, rate(live.relF3 || 0), (live.relF3 || 0) >= Math.ceil(R / 2) ? 'PASS' : 'PART');
      check('L', `[${LIVE}] judged the far card F1 related`, (live.relF1 || 0) >= 1, rate(live.relF1 || 0), (live.relF1 || 0) >= Math.ceil(R / 2) ? 'PASS' : 'PART');
      check('L', `[${LIVE}] never judged the neighbouring pizza card related`, !live.relPizza, rate(live.relPizza || 0));
      check('L', `[${LIVE}] flagged the explicit contradiction (legal decision, far away)`, live.explicit >= Math.ceil(R / 2), rate(live.explicit), live.explicit === R ? 'PASS' : 'PART');
      check('L', `[${LIVE}] flagged the subtle tension (tutorial skippers churn more, right beside it)`, live.conflict >= 1, rate(live.conflict), live.conflict >= Math.ceil(R / 2) ? 'PASS' : 'PART');
      check('L', `[${LIVE}] no internal C# key reached the designer`, !live.keyLeak, rate(live.keyLeak || 0));
      check('L', `[${LIVE}] cited only cards it was given`, live.invalid === 0, rate(live.invalid) + ' runs had invented keys (dropped)');
      check('L', `[${LIVE}] no declined idea reached the designer (model avoided it ${R - live.repeatModel}/${R}, guard caught the rest)`, live.repeatShown === 0, rate(live.repeatShown));
      check('L', `[${LIVE}] changed no kept card`, live.edits === 0, rate(live.edits));
      check('L', `[${LIVE}] Strategist with decision memory repeated a declined direction`, live.forkRepeat === 0, `${rate(live.forkRepeat, live.forkRuns)} (without memory: ${rate(live.ctrlRepeat, live.forkRuns)})`, live.forkRepeat === 0 ? 'PASS' : 'PART');
      relay = false;
    }
    await ctx.close();

    /* ── P0: visible fallbacks, held-back repeats you can see, the remaining rejection signals (fresh board) ── */
    {
      const { p: q, ctx: c2 } = await openPage(browser, base);
      await q.click('#projectBtn'); await q.waitForTimeout(300); await q.getByText('New board', { exact: true }).click(); await q.click('[data-tpl="blank"]'); await q.click('[data-tpl-go]'); await q.waitForTimeout(800);
      await q.evaluate(() => setCrew({ speak: 'never', act: 'drafts' }));
      const I = await buildFixture(q);
      const ADV = 'Include 1 or at most 2 pins';
      const thought = note => ({ keywords: ['k'], thoughts: ['a', 'b', 'c'], basis: [], pins: [{ agent: 'critic', note, liftAct: 'note', liftLabel: 'Pin it' }] });
      const look = async () => { await q.evaluate(t => { board.pins = {}; return runAdvisorOnNode(t, { force: true }); }, I.T); await q.idle(); return q.evaluate(t => (board.pins[t] || [])[0] || null, I.T); };
      const openPop = async () => { await q.evaluate(t => { closeAdvPop(); toggleAdvPop(t); }, I.T); await q.waitForTimeout(250); };

      // 1. a reply cut off by the token limit is retried once with more room; rule-made thoughts say so
      queue = [{ id: 'cut', match: ADV, text: '', finish: 'length' }, { id: 'adv-ok', match: ADV, text: thought('The goal card measures activation, not speed: which one do three steps serve?') }];
      let pin = await look();
      const tries = requests.filter(r => r.matched === 'cut' || r.matched === 'adv-ok');
      check('P0', 'a reply cut off by the token limit (finish_reason "length") is retried once, with more room', tries.length === 2 && tries[1].max > tries[0].max, JSON.stringify(tries.map(r => [r.matched, r.max])));
      check('P0', "…and the thought that arrives is the model's", pin && pin.engine === 'model' && /activation/.test(pin.note), JSON.stringify(pin));
      await openPop();
      check('P0', 'a model thought carries no engine tag', await q.evaluate(() => !document.querySelector('#advPop .adv-eng')));
      queue = [];
      pin = await look();
      await openPop();
      const shot = async (sel, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await q.evaluate(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove())); await q.waitForTimeout(150); await q.locator(sel).screenshot({ path: path.join(SHOTS, name) }); };
      await shot('#advPop', 'rules-tag.png');
      check('P0', 'with no model, the thought is marked as made by built-in rules', pin && pin.engine === 'rules' && /built-in rules/.test(await q.evaluate(() => document.querySelector('#advPop .adv-eng')?.innerText || '')), JSON.stringify(pin && pin.engine));
      await q.evaluate(() => closeAdvPop());

      // 2. what is held back is kept, shown in the Crew popover, and can be shown anyway or dismissed
      const dv = await q.evaluate(t => { checkpoint(); const d = node('note', { text: 'Add a mandatory video tutorial before the first project.', by: 'muse', status: 'sketch' }, { x: 1500, y: 900 }); edge(t, d.id, 'derive'); renderAll(); return d.id; }, I.T);
      await q.evaluate(id => erase([id], { reason: 'People skip videos; it adds time before value.' }), dv); await q.waitForTimeout(450);
      queue = [{ id: 'echo', match: ADV, text: thought('What about a **mandatory video tutorial** before the first project?') }];
      pin = await look();
      let held = await q.evaluate(() => (board.held || []).map(h => ({ kind: h.kind, text: h.text, has: !!h.payload })));
      check('P0', 'a held-back thought is kept, with what it said', !pin && held.length === 1 && held[0].kind === 'pin' && /mandatory video tutorial/.test(held[0].text) && held[0].has, JSON.stringify(held));
      await q.evaluate(() => toggleCrewPop(true)); await q.waitForTimeout(200);
      check('P0', 'the Crew popover shows one quiet line: "Held back 1 idea you turned down"', /Held back 1 idea you turned down/.test(await q.evaluate(() => document.getElementById('crewPop').innerText)));
      await shot('#crewPop', 'crew-held.png');
      await q.click('#crewPop [data-crew-held]'); await q.waitForTimeout(300);
      await shot('dialog[open]', 'held-dialog.png');
      const dtext = await q.evaluate(() => document.querySelector('dialog[open]')?.innerText || '');
      check('P0', 'the list says what it repeats, when you turned it down, and why', /Repeats/.test(dtext) && /skip videos/.test(dtext), dtext.slice(0, 300));
      await q.click('dialog[open] [data-hb-show]'); await q.waitForTimeout(400);
      check('P0', '"Show anyway" puts the thought back on its card', await q.evaluate(t => (board.pins[t] || []).some(p => p.shownAnyway && /video/.test(p.note)) && !(board.held || []).length, I.T));
      await q.evaluate(() => { try { dlg.close(); } catch { } closeAdvPop(); });
      queue = [{ id: 'fk-echo', match: '"directions"', text: { directions: [{ title: 'Video tutorial first', plan: 'Add a mandatory video tutorial before the first project.', test: 'Time five users.', mode: 'story' }, { title: 'Template gallery start', plan: 'Start on a gallery of templates.', test: 'Five users pick one.', mode: 'desk' }] } }];
      await q.evaluate(t => fork(byId(t), 2), I.T); await q.idle();
      held = await q.evaluate(() => (board.held || []).map(h => h.kind));
      check('P0', 'a held-back direction is kept too', JSON.stringify(held) === '["direction"]', JSON.stringify(held));
      await q.evaluate(() => heldDialog()); await q.waitForTimeout(250);
      await q.click('dialog[open] [data-hb-show]'); await q.waitForTimeout(400);
      check('P0', '"Show anyway" adds the direction as a draft beside the others', await q.evaluate(() => board.nodes.some(n => n.type === 'direction' && n.status === 'sketch' && n.title === 'Video tutorial first' && n.shownAnyway)));
      await q.evaluate(() => { try { dlg.close(); } catch { } });
      await dropSketches(q);
      queue = [{ id: 'fk-echo2', match: '"directions"', text: { directions: [{ title: 'Video tutorial first', plan: 'Add a mandatory video tutorial before the first project.', test: 'Time five users.', mode: 'story' }] } }];
      await q.evaluate(t => fork(byId(t), 1), I.T); await q.idle();
      check('P0', 'a fork that only repeats declined ideas holds them all back and adds nothing', await q.evaluate(() => (board.held || []).length === 1 && !board.nodes.some(n => n.type === 'direction' && n.status === 'sketch')) && /only came up with directions you already turned down/.test(await q.toast()), await q.toast());
      await q.evaluate(() => heldDialog()); await q.waitForTimeout(250);
      await q.click('dialog[open] [data-hb-drop]'); await q.waitForTimeout(250);
      check('P0', '"Dismiss" removes it from the list, and the Crew popover line goes with it', await q.evaluate(() => { toggleCrewPop(false); toggleCrewPop(true); return !(board.held || []).length && !/Held back/.test(document.getElementById('crewPop').innerText); }));
      await q.evaluate(() => { try { dlg.close(); } catch { } toggleCrewPop(false); });

      // 3a. asking for a fresh angle on a thought
      await q.evaluate(t => { board.pins = { [t]: [{ id: 'pin-r', agent: 'critic', note: 'Maybe measure time-to-first-project before cutting anything.', t: NOW(), seen: true, engine: 'model', basis: [] }] }; renderNodes(); }, I.T);
      await openPop();
      queue = [{ id: 'fresh', match: ADV, text: thought('Which of the three steps would a returning user still see?') }];
      await q.click('#advPop [data-adv-reroll]'); await q.waitForTimeout(600); await q.idle();
      const freshReq = requests.filter(r => r.matched === 'fresh').at(-1)?.full || '';
      check('P0', 'asking for a fresh angle records the replaced thought', await q.evaluate(() => (board.declined || []).some(d => d.kind === 'rerolled' && /time-to-first-project/.test(d.text))));
      check('P0', '…and the next look is told what it is replacing', /fresh angle[\s\S]*time-to-first-project|time-to-first-project[\s\S]*fresh angle/.test(freshReq), freshReq.slice(-500));

      // 3b. Try again on drafts
      queue = [{ id: 'fk-a', match: '"directions"', text: { directions: [{ title: 'Alpha path', plan: 'Merge the profile and workspace screens.', test: 'Five users.', mode: 'story' }, { title: 'Beta path', plan: 'Defer the team invite until after the first project.', test: 'Five users.', mode: 'story' }] } }];
      await q.evaluate(t => fork(byId(t), 2), I.T); await q.idle();
      const pid = await q.evaluate(() => board.nodes.find(n => n.type === 'direction' && n.status === 'sketch')?.pid);
      queue = [{ id: 'fk-b', match: '"directions"', text: { directions: [{ title: 'Gamma path', plan: 'Prefill the workspace from the sign-up answers.', test: 'Five users.', mode: 'story' }, { title: 'Delta path', plan: 'Open straight into a blank project.', test: 'Five users.', mode: 'story' }] } }];
      await q.evaluate(pid => redraw(pid), pid); await q.idle();
      const redoReq = requests.filter(r => r.matched === 'fk-b').at(-1)?.full || '';
      check('P0', 'Try again tells Strategist which drafts it is replacing', /turned down[\s\S]*Alpha path[\s\S]*another version/.test(redoReq) && /Beta path/.test(redoReq), redoReq.slice(-600));
      check('P0', '…and the new drafts replace the old', await q.evaluate(() => board.nodes.filter(n => n.type === 'direction' && n.status === 'sketch').map(n => n.title).sort().join() === 'Delta path,Gamma path'));
      check('P0', 'a redo is a soft signal: it never holds a repeat back', await q.evaluate(() => !echoOfDeclined('Alpha path — Merge the profile and workspace screens.')));
      const pid2 = await q.evaluate(() => board.nodes.find(n => n.type === 'direction' && n.status === 'sketch')?.pid);
      const r0 = await q.evaluate(() => (board.declined || []).filter(d => d.kind === 'retried').length);
      queue = [];
      await q.evaluate(pid => redraw(pid), pid2); await q.idle();
      check('P0', 'a Try again that fails keeps the drafts and takes its record back', await q.evaluate(r0 => (board.declined || []).filter(d => d.kind === 'retried').length === r0 && board.nodes.filter(n => n.type === 'direction' && n.status === 'sketch').length === 2, r0));
      await dropSketches(q);

      // 3c. text you remove from an agent's card; accepting an agent's own edit is not you removing it
      const ag = await q.evaluate(() => { checkpoint(); const n = node('note', { text: 'Run a five-person test this week. Also add a mandatory onboarding video for every new user.', by: 'scout' }, { x: 300, y: 1400 }); renderAll(); return n.id; });
      await q.evaluate(id => { const n = byId(id); checkpoint(); const pd = digest(n), pt = n.title, px = n.text; n.text = 'Run a five-person test this week.'; recordNodeEdit(n, pd, pt, px); renderAll(); persist(); }, ag);
      check('P0', "removing a sentence from an agent's card records what you removed", await q.evaluate(id => (board.declined || []).some(d => d.kind === 'edited-out' && d.ref === id && /mandatory onboarding video/.test(d.text) && !/five-person/.test(d.text)), ag));
      check('P0', '…and it is a strong signal: a repeat would be held back', await q.evaluate(() => !!echoOfDeclined('Add a mandatory onboarding video for every new user.')));
      const ag2 = await q.evaluate(() => { checkpoint(); const n = node('note', { text: 'Interview six users. Then cut the invite step entirely from the flow.', by: 'scout' }, { x: 300, y: 1700 }); renderAll(); propose('critic', 'model', 'edit', n, { text: 'Interview six users.' }); renderAll(); return n.id; });
      await q.evaluate(id => acceptProposal(openProps(id)[0].id), ag2); await q.waitForTimeout(200);
      check('P0', "accepting an agent's suggested edit is not recorded as you removing text", await q.evaluate(id => !(board.declined || []).some(d => d.kind === 'edited-out' && d.ref === id), ag2));

      // 3d. deleting a kept card an agent made: soft, and undone with the delete
      await q.evaluate(id => erase([id]), ag2); await q.waitForTimeout(450);
      check('P0', "deleting an agent's kept card is recorded as a soft signal", await q.evaluate(id => (board.declined || []).some(d => d.kind === 'deleted' && d.ref === id) && !echoOfDeclined('Interview six users.'), ag2));
      await q.evaluate(() => undo()); await q.waitForTimeout(300);
      check('P0', '…and Undo brings the card back and withdraws the record', await q.evaluate(id => !!byId(id) && !(board.declined || []).some(d => d.kind === 'deleted' && d.ref === id), ag2));
      check('P0', 'no page errors', q.errors.length === 0, q.errors.join(' | '));
      await c2.close();
    }

    /* ── M: meaning (embeddings) as a recall layer — fresh board, scripted vectors ── */
    {
      const { p: q, ctx: c3 } = await openPage(browser, base);
      await q.click('#projectBtn'); await q.waitForTimeout(300); await q.getByText('New board', { exact: true }).click(); await q.click('[data-tpl="blank"]'); await q.click('[data-tpl-go]'); await q.waitForTimeout(800);
      await q.evaluate(() => { setCrew({ speak: 'never', act: 'drafts' }); apiCfg.embedModel = 'poc-embed'; ctxVec.clear(); ctxEmbedFailSig = null; });
      embed.mode = 'ok';
      const I = await buildFixture(q);
      const X2 = await q.evaluate(() => { const n = node('note', { text: 'Q3 hiring plan: two designers, one researcher.' }, { x: 2700, y: 1400 }); renderAll(); persist(); return n.id; });
      const ADV = 'Include 1 or at most 2 pins';
      const thought = { keywords: ['k'], thoughts: ['a', 'b', 'c'], basis: [], pins: [{ agent: 'critic', note: 'Sign-ups quitting before they make anything is the number three steps should move.', liftAct: 'note', liftLabel: 'Pin it' }] };
      const e0 = embed.calls.length;
      await q.evaluate(() => ctxEnsureEmbeddings(visibleNodes().filter(x => x.status === 'ink')));
      const mk = await q.evaluate(t => Object.fromEntries(ctxCandidates(byId(t), { limit: 8 }).rows.map(r => [r.n.id, r.key])), I.T);
      queue = [{ id: 'm1', match: ADV, text: { ...thought, related: [{ key: mk[I.F3], relation: 'supports', why: 'same drop-off, other words' }, { key: mk[I.N3], relation: 'conflicts', why: 'legal keeps five steps' }, { key: 'C99', relation: 'supports' }] } }];
      await q.evaluate(t => { board.pins = {}; return runAdvisorOnNode(t, { force: true }); }, I.T); await q.idle();
      const req = requests.filter(r => r.matched === 'm1').at(-1)?.full || '';
      const f3line = req.split('\n').find(l => /Most sign-ups quit/.test(l)) || '';
      check('M', 'the advisor fetched vectors for the board once, before its look', embed.calls.length === e0 + 1 && embed.calls.at(-1).n >= 8, JSON.stringify(embed.calls.slice(e0)));
      check('M', 'the paraphrase (F3, no shared words, far away) is now a scored candidate, "close in meaning"', /^C\d+ \[close in meaning\]/.test(f3line), f3line);
      const cxm = await q.evaluate(t => contextFor(byId(t), { limit: 10 }).picks.map(p => ({ t: p.n.text.slice(0, 18), why: p.why.map(w => w.k).join('+') })), I.T);
      check('M', 'the unrelated neighbour (pizza) and the other unrelated cards are not promoted', !cxm.some(x => /pizza|espresso|hiring/i.test(x.t)), JSON.stringify(cxm));
      check('M', 'cards already picked by link or topic keep those reasons first', cxm.some(x => /^Goal/.test(x.t) && x.why.startsWith('wired')) && cxm.some(x => /^Session/.test(x.t) && x.why.startsWith('topic')), JSON.stringify(cxm));
      check('M', "the crew's judgement of what is related is kept apart from the note (F3, N3; invented key dropped)", await q.evaluate(([t, f3, n3]) => { const r = board.related?.[t]?.items || []; return r.some(x => x.id === f3 && x.relation === 'supports') && r.some(x => x.id === n3 && x.relation === 'conflicts') && r.length === 2; }, [I.T, I.F3, I.N3]), await q.evaluate(t => JSON.stringify(board.related?.[t]), I.T));
      await q.evaluate(t => openFocus(t), I.T); await q.waitForTimeout(500);
      const rel = await q.evaluate(() => { const s = document.querySelector('#margin .m-related'); return s ? [...s.querySelectorAll('.src-row')].map(r => r.innerText.replace(/\s+/g, ' ')) : null; });
      check('M', 'the card sheet has a Related section: the conflict first, marked; the paraphrase included', rel && /Legal decision/.test(rel[0]) && /Conflicts/.test(rel[0]) && rel.some(r => /Most sign-ups quit/.test(r)), JSON.stringify(rel));
      check('M', '…with no unrelated card in it, and no direct source repeated', rel && !rel.some(r => /pizza|espresso|hiring|Goal: raise/i.test(r)), JSON.stringify(rel));
      if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await q.evaluate(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove())); await q.locator('#margin .m-related').screenshot({ path: path.join(SHOTS, 'related.png') }); }
      await q.click(`#margin .m-related [data-id="${I.F3}"]`); await q.waitForTimeout(400);
      check('M', 'choosing a related card goes to it', await q.evaluate(f3 => focusId === f3 || sel.includes(f3), I.F3));
      await q.evaluate(() => closeFocus?.());
      queue = [{ id: 'm2', match: ADV, text: thought }];
      const e1 = embed.calls.length;
      await q.evaluate(t => { board.pins = {}; return runAdvisorOnNode(t, { force: true }); }, I.T); await q.idle();
      check('M', 'vectors are kept: a second look makes no embedding call', embed.calls.length === e1, JSON.stringify(embed.calls.slice(e1)));
      await q.evaluate(id => { const n = byId(id); checkpoint(); const pd = digest(n), pt = n.title, px = n.text; n.text = 'Q3 hiring plan: two designers, one researcher, one engineer.'; recordNodeEdit(n, pd, pt, px); persist(); }, X2);
      queue = [{ id: 'm3', match: ADV, text: thought }];
      await q.evaluate(t => { board.pins = {}; return runAdvisorOnNode(t, { force: true }); }, I.T); await q.idle();
      check('M', 'editing a card re-embeds only that card', embed.calls.length === e1 + 1 && embed.calls.at(-1).n === 1, JSON.stringify(embed.calls.slice(e1)));
      // failure: the term layer works alone, and a failing endpoint is not retried on every look
      await q.evaluate(() => { ctxVec.clear(); ctxEmbedFailSig = null; });
      embed.mode = 'fail';
      const e2 = embed.calls.length;
      queue = [{ id: 'm4', match: ADV, text: thought }, { id: 'm5', match: ADV, text: thought }];
      await q.evaluate(t => { board.pins = {}; return runAdvisorOnNode(t, { force: true }); }, I.T); await q.idle();
      const req4 = requests.filter(r => r.matched === 'm4').at(-1)?.full || '';
      await q.evaluate(t => { board.pins = {}; return runAdvisorOnNode(t, { force: true }); }, I.T); await q.idle();
      check('M', 'if embeddings fail, the look still happens on links and topic, with the paraphrase back to an index line', /\[index only\][^\n]*Most sign-ups quit/.test(req4) && await q.evaluate(t => !!(board.pins[t] || []).length, I.T), (req4.split('\n').find(l => /Most sign-ups/.test(l)) || 'missing'));
      check('M', '…and the failing endpoint is tried once, not on every look', embed.calls.length === e2 + 1, `${embed.calls.length - e2} calls`);
      await q.evaluate(() => { apiCfg.embedModel = ''; apiCfg.baseUrl = 'http://127.0.0.1:1/v1'; });
      check('M', 'with no embedding model for the endpoint, nothing is fetched', await q.evaluate(() => embedModel() === ''));
      check('M', 'no page errors', q.errors.length === 0, q.errors.join(' | '));
      await c3.close();
    }
    /* ── F: when the model can't be reached (no credits, no key) everything still works, and says why ── */
    {
      const ADV = 'Include 1 or at most 2 pins';
      const fresh = async () => {
        const o = await openPage(browser, base);
        await o.p.click('#projectBtn'); await o.p.waitForTimeout(300); await o.p.getByText('New board', { exact: true }).click(); await o.p.click('[data-tpl="blank"]'); await o.p.click('[data-tpl-go]'); await o.p.waitForTimeout(800);
        await o.p.evaluate(() => { setCrew({ speak: 'never', act: 'drafts' }); apiCfg.embedModel = 'poc-embed'; ctxVec.clear(); ctxEmbedFailSig = null; });
        return { ...o, I: await buildFixture(o.p) };
      };
      const look = (q, t) => q.evaluate(t => { board.pins = {}; return runAdvisorOnNode(t, { force: true }); }, t).then(() => q.idle()).then(() => q.evaluate(t => (board.pins[t] || [])[0] || null, t));
      const chatCalls = id => requests.filter(r => r.matched === id).length;

      // 1. the Cloud API answers 402 (an account with no credits)
      {
        const { p: q, ctx: c, I } = await fresh();
        const e0 = embed.calls.length, r0 = requests.length;
        queue = [{ id: 'nocredit', match: ADV, status: 402 }, { id: 'nocredit-b', match: ADV, status: 402 }];
        let pin = await look(q, I.T);
        check('F', 'a 402 on the thought: a thought still arrives, from built-in rules', pin && pin.engine === 'rules' && !!pin.note, JSON.stringify(pin));
        check('F', '…and it keeps the reason: "out of credits"', /out of credits/i.test(pin?.engineWhy || ''), pin?.engineWhy);
        await q.evaluate(t => { closeAdvPop(); toggleAdvPop(t); }, I.T); await q.waitForTimeout(250);
        const tag = await q.evaluate(() => { const e = document.querySelector('#advPop .adv-eng'); return e ? e.innerText + ' | ' + e.title : ''; });
        check('F', 'the thought shows the "built-in rules" tag, and its tooltip says the Cloud API is out of credits', /built-in rules/.test(tag) && /out of credits \(HTTP 402\)/.test(tag), tag);
        await q.evaluate(() => closeAdvPop());
        check('F', 'a 402 is not retried like a cut-off reply (one chat request)', chatCalls('nocredit') === 1, `${chatCalls('nocredit')} calls`);
        check('F', 'the connection is marked out of credits', await q.evaluate(() => apiHealthNow().k === 'credits' && !apiRoutable()));
        pin = await look(q, I.T);
        check('F', 'after that, later looks send nothing to the Cloud API (no chat, no embeddings)', chatCalls('nocredit-b') === 0 && embed.calls.length - e0 <= 1, `chat ${chatCalls('nocredit-b')}, embeddings ${embed.calls.length - e0}`);
        check('F', '…and still say why the thought came from built-in rules', pin && pin.engine === 'rules' && /out of credits/i.test(pin.engineWhy || ''), JSON.stringify(pin && pin.engineWhy));
        await q.evaluate(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove()));
        queue = [];
        await q.evaluate(t => fork(byId(t), 2), I.T); await q.idle();
        const dirs = await q.evaluate(() => board.nodes.filter(n => n.type === 'direction' && n.status === 'sketch').length);
        check('F', 'Strategist still forks (built-in rules), and the toast says the Cloud API is out of credits', dirs === 2 && /out of credits/i.test(await q.toast()) && /built-in rules/.test(await q.toast()), `${dirs} drafts; ${await q.toast()}`);
        await q.evaluate(t => openFocus(t), I.T); await q.waitForTimeout(400);
        check('F', 'the card sheet still opens with its Related section from links and topic', await q.evaluate(() => !!document.querySelector('#margin .m-related .src-row')));
        await q.evaluate(() => closeFocus?.());
        check('F', 'no page errors', q.errors.length === 0, q.errors.join(' | '));
        await c.close();
      }

      // 1b. the embeddings endpoint is the first to answer 402: one call, then the look runs on links and topic, and says why
      {
        const { p: q, ctx: c, I } = await fresh();
        embed.mode = 'credits';
        const e0 = embed.calls.length;
        queue = [{ id: 'emb-credit', match: ADV, status: 402 }];
        const pin = await look(q, I.T);
        check('F', 'embeddings that answer 402 are tried once, and the connection is marked out of credits', embed.calls.length - e0 === 1 && await q.evaluate(() => apiHealthNow().k === 'credits'), `${embed.calls.length - e0} calls`);
        check('F', '…so the chat call is not made, and the thought from built-in rules says why', chatCalls('emb-credit') === 0 && pin && pin.engine === 'rules' && /out of credits/i.test(pin.engineWhy || ''), JSON.stringify({ chat: chatCalls('emb-credit'), why: pin && pin.engineWhy }));
        check('F', 'no page errors', q.errors.length === 0, q.errors.join(' | '));
        embed.mode = 'ok'; queue = [];
        await c.close();
      }

      // 2. no key at all: nothing is sent anywhere, and the crew works on built-in rules
      {
        const { p: q, ctx: c, I } = await fresh();
        await q.evaluate(() => { apiCfg.key = ''; });
        const e0 = embed.calls.length, r0 = requests.length;
        queue = [{ id: 'nokey', match: ADV, text: { keywords: ['k'], thoughts: ['a', 'b', 'c'], basis: [], pins: [{ agent: 'critic', note: 'should never be asked' }] } }];
        const pin = await look(q, I.T);
        check('F', 'with no key, a thought still arrives from built-in rules', pin && pin.engine === 'rules' && !!pin.note, JSON.stringify(pin));
        check('F', '…and no request leaves the page (no chat, no embeddings)', requests.length === r0 && embed.calls.length === e0, `chat ${requests.length - r0}, embeddings ${embed.calls.length - e0}`);
        await q.evaluate(t => fork(byId(t), 2), I.T); await q.idle();
        check('F', 'with no key, Strategist forks from built-in rules', await q.evaluate(() => board.nodes.filter(n => n.type === 'direction' && n.status === 'sketch').length === 2));
        check('F', 'decision memory still works without a model: discarding a draft records it', await q.evaluate(async () => { const d = board.nodes.find(n => n.type === 'direction' && n.status === 'sketch'); await erase([d.id], { reason: 'not now' }); await new Promise(r => setTimeout(r, 450)); return (board.declined || []).some(x => x.kind === 'draft' && x.ref === d.id && x.reason === 'not now'); }));
        check('F', 'no page errors', q.errors.length === 0, q.errors.join(' | '));
        queue = [];
        await c.close();
      }
    }
  } finally {
    await browser.close(); srv.close();
  }
  const by = k => results.filter(r => r.kind === k).length;
  console.log(`\n${by('PASS')} passed, ${by('PART')} partial, ${by('KNOWN')} known limitations, ${failures} failed`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ model: LIVE || null, runs: LIVE ? RUNS : 0, results }, null, 2));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

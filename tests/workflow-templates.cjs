#!/usr/bin/env node
/* Workflow template tests: the ideal designer workflows, end to end, in the real page.
 *
 *   node tests/workflow-templates.cjs            (from the repo root; needs playwright, like vellum-smoke.cjs)
 *   node tests/workflow-templates.cjs --headed
 *
 * Each template walks one designer from a brief to something they can hand on, through the same stages
 * Vellum is built around (Gather → Explore → Prototype → Snapshot):
 *
 *   A. Product design (a physical product): brief → evidence → fork directions → critique → adopt
 *      (the others are recorded as passed over) → proof → test plan → snapshot → hand-off file.
 *   C. AI product (Copilot alongside): stage-aware suggestions, an unasked thought on a failure case, a
 *      compare in the panel that drafts an eval set and only suggests edits to kept cards, four-state proof.
 *   B. Short video (10–20 s): brief → fork hooks → critique → adopt → storyboard beats → render a beat
 *      through the video provider (MiniMax H3 via Media Studio, mocked) → snapshot of the script page.
 *
 * Every template runs twice: with a scripted model (deterministic, no key or network) and with no model
 * at all (what someone without credit meets). Lines marked KNOWN are recorded gaps from the 2026-11-25 UX
 * audit; they are printed but do not fail the run. Nothing here calls a real model or a real generator:
 * quality with a real model is out of scope (see tests/model-eval.cjs). */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
let queue = [];
const requests = [];

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/Vellum-Lumen.html'))) {
        rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp);
      }
      if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
        let body = ''; req.on('data', c => body += c); req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          if (parsed.max_tokens === 1 && !parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end('{"choices":[{"message":{"content":"."}}]}'); }
          const flat = (parsed.messages || []).map(m => typeof m.content === 'string' ? m.content : (m.content || []).map(p => p.text || '').join(' ')).join('\n');
          const i = queue.findIndex(e => new RegExp(e.match, 's').test(flat));
          const hit = i >= 0 ? queue.splice(i, 1)[0] : null;
          requests.push({ matched: hit && hit.id, full: flat });
          if (!hit) { rsp.writeHead(503); return rsp.end(''); } // unscripted: Vellum falls back to its built-in rules
          rsp.writeHead(200, { 'Content-Type': 'text/event-stream' });
          const txt = typeof hit.text === 'string' ? hit.text : JSON.stringify(hit.text);
          for (let k = 0; k < txt.length; k += 40) rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: txt.slice(k, k + 40) } }] }) + '\n\n');
          rsp.end('data: [DONE]\n\n');
        });
        return;
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const results = []; let failures = 0, known = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }
function gap(name, stillThere, detail = '') { if (stillThere) { known++; results.push(`KNOWN ${name}${detail ? '  — ' + detail : ''}`); } else results.push(`PASS  ${name} (gap closed)`); }
function head(t) { results.push('', `── ${t}`); }

/* media service stand-in (Media Studio at 127.0.0.1:59639): offline unless `media.on` */
const media = { on: false, posts: [] };
async function page(browser, base, { model = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort()); // Studio AI (local LLM) is never used here
  await ctx.route(/wikipedia\.org|wikimedia\.org|openverse\.org|archive\.org|algolia\.com/, r => r.abort());
  await ctx.route('http://127.0.0.1:59639/**', r => {
    const u = new URL(r.request().url());
    if (!media.on) return r.abort();
    const json = (o, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
    if (u.pathname === '/health') return json({ connected: true, service_status: 'ready', models: [], video_models: [{ id: 'h3', name: 'MiniMax H3 Turbo (T2V)', available: true }] });
    if (u.pathname === '/media/video' && r.request().method() === 'POST') { media.posts.push(JSON.parse(r.request().postData() || '{}')); return json({ job_id: 'job-1', status: 'queued', model: 'MiniMax H3', spec: { duration_sec: 5.17, width: 864, height: 480, fps: 24 } }); }
    if (u.pathname.startsWith('/media/video')) return json({ status: 'queued' });
    return json({}, 404);
  });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
  await p.evaluate(() => { SCOUT_GROUNDING = false; setCrewLevel?.('asked'); });
  if (model) await p.evaluate(url => { apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'workflow', key: 'workflow' }; }, base);
  else await p.evaluate(() => { apiCfg = { ...(apiCfg || {}), enabled: false }; });
  p.type = async t => { await p.click('#lineInput'); await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.keyboard.type(t); await p.keyboard.press('Enter'); };
  p.cmd = async (ids, t) => { await p.evaluate(ids => select(ids), ids); await p.type(t); await p.idle(); };
  p.idle = async () => { await p.waitForTimeout(400); for (let i = 0; i < 120 && await p.evaluate(() => crewBusy()); i++) await p.waitForTimeout(250); await p.waitForTimeout(400); };
  p.newBoard = async () => { await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.waitForTimeout(800); };
  p.stage = () => p.evaluate(() => boardStage().stage);
  return p;
}

/* helpers that read the board */
const DIRS = idea => `board.nodes.filter(n => n.type === 'direction' && n.idea === ${JSON.stringify(idea)} && !n.tombstone)`;
async function directions(p, idea) { return p.evaluate(new Function(`return ${DIRS(idea)}.map(n => ({ id: n.id, letter: n.letter, title: n.title, status: n.status, engine: n.prov && n.prov.engine }))`)); }
async function addEvidence(p, idea, list) {
  return p.evaluate(([idea, list]) => { checkpoint(); const ids = list.map(([text, weight], i) => { const n = node('note', { text, weight, status: 'ink' }, { x: -900, y: 200 + i * 160 }); edge(n.id, idea, 'src'); return n.id; }); renderAll(); persist(); return ids; }, [idea, list]);
}

/* ── Template A: product design (physical product) ─────────────────────────────────────────── */
const PRODUCT = {
  brief: 'A palm-sized camping lantern for solo hikers that hangs, stands and clips, under 120 g',
  evidence: [
    ['Six of eight hikers we watched hung their light from the tent loop, then knocked it down at night', 'observed'],
    ['Forum posts say clip lights rotate and point at the tent wall', 'reported'],
    ['A magnet base would let it stick to a trekking pole', 'proposed'],
  ],
  dirs: { directions: [
    { title: 'Carabiner body', plan: 'The whole shell is a carabiner, so hanging and clipping are one gesture.', test: 'Eight hikers set up camp in the dark; it fails if more than two drop it.', mode: 'desk' },
    { title: 'Folding tripod legs', plan: 'Three legs fold out of the base for standing, a loop on top for hanging.', test: 'Stand it on uneven ground five times; it fails if it tips twice.', mode: 'desk' },
    { title: 'Magnetic puck', plan: 'A puck that sticks to poles and buckles, with a strap for everything else.', test: 'Hikers try it on their own gear; it fails if half find nothing it sticks to.', mode: 'desk' },
  ] },
  critique: 'The carabiner body answers the strongest evidence: six of eight hikers hung their light, and knocking it down is the failure to design out. The magnet idea rests only on our own proposal. What does the carabiner weigh once the battery is in?',
  proof: { title: 'Carabiner lantern · camp test kit', kicker: 'Direction A, version 1', lede: 'A one-gesture light that hangs and clips. This kit is what eight hikers get on test night.', items: [
    { title: 'Hang it', body: 'Clip it to the tent loop with one hand.', tag: 'Task 1' },
    { title: 'Move it', body: 'Unclip it and clip it to your pack strap.', tag: 'Task 2' },
    { title: 'Knock test', body: 'Brush past it as you would at night.', tag: 'Task 3' },
    { title: 'Weigh in', body: 'Record the weight with the battery in.', tag: 'Spec' },
  ], cta: 'Record results' },
};

/* ── Template B: short video (10–20 s) ─────────────────────────────────────────────────────── */
const VIDEO = {
  brief: 'A 15 second vertical video that makes people feel how quiet the new desk fan is',
  dirs: { directions: [
    { title: 'Whisper test', plan: 'Someone whispers a secret next to the fan and the viewer still hears every word.', test: 'Ten viewers say what the video was about after one watch; it fails if fewer than seven say quiet.', mode: 'story' },
    { title: 'Sleeping cat', plan: 'A cat sleeps on the desk while the fan runs at full speed.', test: 'Show it muted in a feed; it fails if fewer than half watch past three seconds.', mode: 'story' },
    { title: 'Decibel race', plan: 'A meter on screen races our fan against three others.', test: 'Ten viewers recall the brand; it fails if fewer than five do.', mode: 'story' },
  ] },
  critique: 'Whisper test lands the message in the first second and needs no text on screen, which suits a muted feed only if captions carry the whisper. Sleeping cat is charming but the fan becomes a prop. Which one still works with the sound off?',
  beats: { title: 'Whisper test · beats', kicker: '15 s, 9:16', lede: 'Hook in the first second, proof by the middle, product name at the end.', items: [
    { title: '0–2 s hook', body: 'Close-up of two people leaning in to whisper next to a spinning fan.', tag: 'Shot 1' },
    { title: '2–9 s proof', body: 'Caption shows the whisper word for word while the fan runs at full speed.', tag: 'Shot 2' },
    { title: '9–13 s reveal', body: 'Pull back: the fan is on max, the room is calm.', tag: 'Shot 3' },
    { title: '13–15 s end card', body: 'Product name and "quiet enough to whisper".', tag: 'Shot 4' },
  ], cta: 'Approve script' },
};

async function productDesign(browser, base, live) {
  const tag = live ? 'scripted model' : 'no model';
  head(`Template A · product design (${tag})`);
  const p = await page(browser, base, { model: live });
  await p.newBoard();
  // 1. Brief: the claim is kept straight away; the board is in Explore
  await p.type('/claim ' + PRODUCT.brief); await p.waitForTimeout(700);
  const idea = await p.evaluate(() => board.nodes.find(n => n.type === 'idea')?.id);
  check(`[A ${tag}] the brief becomes a kept claim`, !!idea && await p.evaluate(id => byId(id).status === 'ink', idea));
  check(`[A ${tag}] stage is Explore once a claim is kept`, (await p.stage()) === 'explore', await p.stage());
  // 2. Evidence, by weight: what was watched counts more than what we propose
  await addEvidence(p, idea, PRODUCT.evidence);
  const brief0 = await p.evaluate(() => stageBrief());
  check(`[A ${tag}] the stage brief counts the evidence by weight`, /1 observed/i.test(brief0) && /1 reported/i.test(brief0) && /1 proposal/i.test(brief0), brief0.slice(0, 240));
  // 3. Diverge: three directions as drafts
  if (live) queue.push({ id: 'A-fork', match: '"directions"', text: PRODUCT.dirs });
  await p.cmd([idea], '/fork 3');
  let ds = await directions(p, idea);
  check(`[A ${tag}] fork drafts three directions`, ds.length === 3 && ds.every(d => d.status === 'sketch'), JSON.stringify(ds));
  if (live) {
    check(`[A ${tag}] the fork prompt carries the brief and the evidence`, requests.some(r => r.matched === 'A-fork' && /palm-sized camping lantern/.test(r.full) && /Six of eight hikers/.test(r.full)));
    check(`[A ${tag}] directions are the model's, marked as model-made`, ds.map(d => d.title).join('|') === 'Carabiner body|Folding tripod legs|Magnetic puck' && ds.every(d => d.engine === 'model'), JSON.stringify(ds));
  } else {
    check(`[A ${tag}] with no model, the drafts say they came from built-in rules`, ds.every(d => d.engine === 'rules') && await p.evaluate(() => document.querySelectorAll('.card.sketch .prov-rules').length > 0), JSON.stringify(ds));
    gap(`[A ${tag}] rule-made directions are generic templates, not about this product (audit #5)`, ds.every(d => !/lantern|hik|camp/i.test(d.title + ' ')), ds.map(d => d.title).join(' | '));
  }
  // keep A and B, discard C with a reason: the reason stays on the record
  const [A, B, C] = ds;
  await p.evaluate(([a, b]) => ink([a, b]), [A.id, B.id]);
  await p.evaluate(c => erase([c], { reason: 'Magnets only help if gear is steel; most poles are aluminium.' }), C.id); await p.waitForTimeout(400);
  const dec1 = await p.evaluate(() => (board.declined || []).map(d => ({ kind: d.kind, reason: d.reason })));
  check(`[A ${tag}] the discarded direction is kept on record with its reason`, dec1.some(d => d.kind === 'draft' && /aluminium/.test(d.reason)), JSON.stringify(dec1));
  // 4. Critique: Critic checks the leading direction against its sources and answers the designer's question
  if (live) queue.push({ id: 'A-crit', match: 'Check this', text: PRODUCT.critique });
  await p.evaluate(a => critique(byId(a), { ask: 'Which direction answers the evidence best?' }), A.id); await p.idle();
  const th = await p.evaluate(a => (board.threads[a] || []).map(m => ({ who: m.who, live: !!m.live, text: m.text })), A.id);
  const crit = th.find(m => m.who === 'critic');
  check(`[A ${tag}] Critic answers on the direction's thread`, !!crit && crit.text.length > 20, JSON.stringify(th));
  check(`[A ${tag}] the designer's question is kept in the thread`, th.some(m => m.who === 'you' && /answers the evidence best/.test(m.text)));
  if (live) check(`[A ${tag}] Critic was asked the question and given the sources`, requests.some(r => r.matched === 'A-crit' && /answers the evidence best/.test(r.full) && /Six of eight hikers/.test(r.full)));
  else check(`[A ${tag}] with no model, Critic's reply is marked as not live`, crit && crit.live === false);
  // 5. Converge: adopt A; B is recorded as passed over, the stage moves to Prototype
  await p.evaluate(a => adopt(byId(a)), A.id); await p.waitForTimeout(400);
  const dec2 = await p.evaluate(() => (board.declined || []).filter(d => d.kind === 'passed-over').map(d => d.reason));
  check(`[A ${tag}] adopting records the other kept direction as passed over, and why`, dec2.length === 1 && /^Adopted A/.test(dec2[0]), JSON.stringify(dec2));
  check(`[A ${tag}] stage is Prototype after adopting`, (await p.stage()) === 'prototype', await p.stage());
  check(`[A ${tag}] the stage brief names what was decided`, /Decided: A/.test(await p.evaluate(() => stageBrief())));
  // 6. Prototype: Wright builds a proof from the adopted direction
  if (live) queue.push({ id: 'A-build', match: 'Write the real content for this prototype', text: PRODUCT.proof });
  await p.cmd([A.id], '/build');
  const proof = await p.evaluate(a => { const n = board.nodes.find(n => n.type === 'proof' && n.dir === a); return n && { id: n.id, title: n.spec?.title, items: (n.spec?.items || []).length, status: n.status, fixed: (n.fixed || []).length }; }, A.id);
  check(`[A ${tag}] Wright builds a proof draft from the adopted direction`, !!proof && proof.status === 'sketch' && proof.items >= 3, JSON.stringify(proof));
  check(`[A ${tag}] the proof records what it was built on`, proof && proof.fixed === 3, JSON.stringify(proof));
  if (live) check(`[A ${tag}] the proof is the model's test kit`, proof && proof.title === PRODUCT.proof.title, JSON.stringify(proof));
  await p.evaluate(id => ink([id]), proof.id); await p.waitForTimeout(300);
  // 7. Test plan: the adopted direction becomes a task board (allowed in Prototype)
  await p.cmd([A.id], '/kanban');
  check(`[A ${tag}] a task board is made for the adopted direction`, await p.evaluate(() => board.nodes.some(n => n.type === 'kanban' && !n.tombstone)));
  // 8. Snapshot: freeze the proof; later edits to the proof do not change it
  await p.cmd([proof.id], '/snapshot');
  const snap = await p.evaluate(id => { const s = board.nodes.find(n => n.type === 'print' && n.proof === id); return s && { id: s.id, ed: s.ed, title: s.spec?.title }; }, proof.id);
  check(`[A ${tag}] the proof is frozen as Snapshot No. 1`, snap && snap.ed === 1, JSON.stringify(snap));
  check(`[A ${tag}] stage is Snapshot`, (await p.stage()) === 'snapshot', await p.stage());
  await p.evaluate(id => { const n = byId(id); n.spec.title = 'Changed after the snapshot'; persist(); }, proof.id);
  check(`[A ${tag}] the snapshot does not change when the proof does`, await p.evaluate(([s, t]) => byId(s).spec.title === t, [snap.id, snap.title]));
  // 9. Hand-off: the exported file carries the decision trail, and a reload keeps it
  const bundle = await p.evaluate(async () => { const b = await buildBoardBundle(); const ops = (b.board.changes || []).map(c => c.op); return { format: b.format, adopted: Object.keys(b.board.adopted || {}).length, declined: (b.board.declined || []).map(d => d.kind), ops }; });
  check(`[A ${tag}] the hand-off file has the adoption and the declined directions`, bundle.format === 'vellum-board.v1' && bundle.adopted === 1 && bundle.declined.includes('draft') && bundle.declined.includes('passed-over'), JSON.stringify(bundle));
  check(`[A ${tag}] the hand-off file's change log has the decisions`, ['adopt', 'accept'].every(o => bundle.ops.includes(o)), bundle.ops.join(' '));
  const pre = await p.evaluate(() => JSON.stringify({ a: board.adopted, d: (board.declined || []).length, s: boardStage().stage }));
  await p.reload(); await p.waitForTimeout(2500);
  check(`[A ${tag}] a reload keeps the adoption, the record and the stage`, pre === await p.evaluate(() => JSON.stringify({ a: board.adopted, d: (board.declined || []).length, s: boardStage().stage })), pre);
  gap(`[A ${tag}] no export to Figma or a design tool yet (roadmap)`, await p.evaluate(() => !CMDS.some(c => /figma|handoff/i.test(c.c + c.d))));
  check(`[A ${tag}] no page errors`, p.errors.length === 0, p.errors.join(' | '));
  await p.context().close();
}

async function shortVideo(browser, base, live) {
  const tag = live ? 'scripted model' : 'no model';
  head(`Template B · short video (${tag})`);
  media.on = live; media.posts = [];
  const p = await page(browser, base, { model: live });
  await p.newBoard();
  // 1. Brief
  await p.type('/claim ' + VIDEO.brief); await p.waitForTimeout(700);
  const idea = await p.evaluate(() => board.nodes.find(n => n.type === 'idea')?.id);
  check(`[B ${tag}] the brief becomes a kept claim`, !!idea);
  // 2. Fork hooks before spending anything on generation
  if (live) queue.push({ id: 'B-fork', match: '"directions"', text: VIDEO.dirs });
  await p.cmd([idea], '/fork 3');
  const ds = await directions(p, idea);
  check(`[B ${tag}] fork drafts three hooks`, ds.length === 3, JSON.stringify(ds));
  check(`[B ${tag}] nothing was rendered while choosing a hook`, media.posts.length === 0 && await p.evaluate(() => !board.nodes.some(n => n.type === 'recording')));
  if (!live) gap(`[B ${tag}] rule-made hooks are generic templates, not about this video (audit #5)`, ds.every(d => !/fan|quiet|whisper/i.test(d.title)), ds.map(d => d.title).join(' | '));
  await p.evaluate(ids => ink(ids), ds.map(d => d.id));
  // 3. Critique against the brief
  if (live) queue.push({ id: 'B-crit', match: 'Check this', text: VIDEO.critique });
  await p.evaluate(a => critique(byId(a), { ask: 'Which hook still works with the sound off?' }), ds[0].id); await p.idle();
  const crit = await p.evaluate(a => (board.threads[a] || []).find(m => m.who === 'critic'), ds[0].id);
  check(`[B ${tag}] Critic answers on the hook`, !!crit && crit.text.length > 20, JSON.stringify(crit));
  // 4. Adopt one hook; the others are passed over with the reason
  await p.evaluate(a => adopt(byId(a)), ds[0].id); await p.waitForTimeout(300);
  check(`[B ${tag}] adopting one hook passes over the other two`, (await p.evaluate(() => (board.declined || []).filter(d => d.kind === 'passed-over').length)) === 2);
  // 5. Storyboard: the adopted hook becomes a beat-by-beat script page (a story proof)
  if (live) queue.push({ id: 'B-beats', match: 'Write the real content for this prototype', text: VIDEO.beats });
  await p.cmd([ds[0].id], '/build');
  const beats = await p.evaluate(a => { const n = board.nodes.find(n => n.type === 'proof' && n.dir === a); return n && { id: n.id, mode: n.spec?.mode, items: (n.spec?.items || []).map(i => i.title + ': ' + i.body) }; }, ds[0].id);
  check(`[B ${tag}] the adopted hook becomes a step-by-step script page`, beats && beats.mode === 'story' && beats.items.length >= 3, JSON.stringify(beats));
  if (live) check(`[B ${tag}] the script has timed beats from hook to end card`, beats && /^0–2 s hook/.test(beats.items[0]) && /end card/.test(beats.items[beats.items.length - 1]), JSON.stringify(beats && beats.items));
  await p.evaluate(id => ink([id]), beats.id);
  // 6. Render one beat through the video provider
  const shot = beats.items[0].replace(/^[^:]*:\s*/, '');
  await p.evaluate(() => { imgSvc.checked = 0; }); await p.evaluate(() => refreshImageService()); await p.waitForTimeout(300);
  await p.evaluate(id => select([id]), beats.id); await p.type('/video ' + shot); await p.idle();
  const rec = await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'recording' && !n.tombstone); return n && { status: n.status, model: n.gen?.model, job: n.gen?.jobId, preview: !!n.gen?.preview, linked: board.edges.some(e => e.b === n.id) }; });
  if (live) {
    check(`[B ${tag}] the beat is sent to the video provider (MiniMax H3) with its own words`, media.posts.length === 1 && media.posts[0].model === 'h3' && media.posts[0].prompt === shot, JSON.stringify(media.posts));
    check(`[B ${tag}] a queued video card appears as a draft, linked to the script`, rec && rec.job === 'job-1' && rec.status === 'sketch' && rec.linked, JSON.stringify(rec));
  } else {
    check(`[B ${tag}] with no video provider, a stand-in clip is made and the page does not break`, !!rec, JSON.stringify(rec));
    gap(`[B ${tag}] the stand-in clip is not marked as a preview (like audit #3 for images)`, rec && !rec.preview, JSON.stringify(rec));
  }
  gap(`[B ${tag}] only one video provider, hard-wired (h3); no provider choice (roadmap)`, await p.evaluate(() => !/seedance|magi|kling/i.test(String(SERVICES.video))));
  // 7. Freeze the approved script
  await p.cmd([beats.id], '/snapshot');
  check(`[B ${tag}] the approved script is frozen as a snapshot`, await p.evaluate(id => board.nodes.some(n => n.type === 'print' && n.proof === id), beats.id));
  check(`[B ${tag}] no page errors`, p.errors.length === 0, p.errors.join(' | '));
  await p.context().close();
}

/* ── Template C: AI product design, with Copilot alongside at every step ───────────────────── */
const AIPROD = {
  brief: 'An AI assistant that drafts replies to client emails for freelance designers, never sends a price on its own',
  failures: [
    ['A client asked for a quote and the draft promised a price the designer never set', 'observed'],
    ['Drafts sounded cheerful when the client was angry about a delay', 'observed'],
    ['Designers say they would stop using it after one wrong email sent in their name', 'reported'],
  ],
  pin: { keywords: ['failure cases', 'trust'], thoughts: ['The failures are about trust', 'A wrong email is costly', 'Worth an eval set'], basis: [], related: [], pins: [{ agent: 'critic', note: 'These **failure cases** are your user research. Turn them into an **eval set** before you pick how much the assistant does on its own.', liftAct: 'list', liftLabel: 'Draft the eval set' }] },
  dirs: { directions: [
    { title: 'Sends on its own', plan: 'The assistant replies without asking when it is confident.', test: 'Run it on 20 real emails; it fails if more than 1 reply would need an apology.', mode: 'story' },
    { title: 'Drafts, you confirm', plan: 'Every reply is a draft the designer reads, edits and sends.', test: 'Run it on 20 real emails; it fails if more than 2 drafts need a rewrite.', mode: 'story' },
    { title: 'Sorts and reminds', plan: 'No drafting: it labels urgent, money and mood, and reminds.', test: 'Five designers use it a week; it fails if fewer than 3 say it saved time.', mode: 'story' },
  ] },
  copilot: 'B keeps a person between the model and the client, which is what the failure cases ask for: two of three are about a wrong email going out. A is fastest but one bad send ends trust. C is safe but may not save enough time. I drafted an eval set from your failure cases as a draft card, and suggested sharpening B\'s test.\n```actions\n[{"action":"create","cardType":"note","title":"Eval set v0","text":"20 real client emails: 5 quote requests, 5 angry about delays, 5 scope changes, 5 routine. Pass: no price stated, tone matches, under 2 rewrites."},{"action":"edit","target":"Drafts, you confirm","field":"test","value":"Run it on the 20-email eval set; it fails if more than 2 drafts need a rewrite or any draft states a price."}]\n```',
  critique: 'Sends on its own fails the strongest evidence: designers say one wrong email sent in their name ends it, and the quote failure was observed, not imagined. Nothing here lets a sent email be taken back. What would it take for a designer to notice a wrong draft before it goes?',
  proof: { title: 'Reply assistant · four states', kicker: 'Direction B, version 1', lede: 'Every reply is a draft. The designer always sees how sure the assistant is.', items: [
    { title: 'Normal', body: 'A ready draft with the client thread beside it and one tap to send.', tag: 'State' },
    { title: 'Wrong', body: 'The designer marks what was wrong; the reason goes into the eval set.', tag: 'State' },
    { title: 'Unsure', body: 'Money, anger or scope: no draft, a short note on why and what to check.', tag: 'State' },
    { title: 'No model', body: 'Says plainly that no AI is connected and keeps the email untouched.', tag: 'State' },
  ], cta: 'Run the eval set' },
};

async function aiProduct(browser, base, live) {
  const tag = live ? 'scripted model' : 'no model';
  head(`Template C · AI product with Copilot alongside (${tag})`);
  const p = await page(browser, base, { model: live });
  await p.newBoard();
  // the crew speaks when it matters (the default level), quickly, for the test
  await p.evaluate(() => { setCrewLevel('suggest'); advQuietMs = 300; advMaxWaitMs = 2000; advSpent = []; advHeld = 0; board.pins = {}; });
  const chips = () => p.evaluate(() => copilotStarterChips());
  check(`[C ${tag}] on an empty board Copilot offers to put the idea in one sentence`, /one sentence/.test((await chips())[0] || ''), (await chips()).join(' | '));
  // 1. Brief
  await p.type('/claim ' + AIPROD.brief); await p.waitForTimeout(700);
  const idea = await p.evaluate(() => board.nodes.find(n => n.type === 'idea')?.id);
  await p.evaluate(() => select([]));
  let c = await chips();
  check(`[C ${tag}] once the brief is kept, Copilot suggests directions and testing the claim`, /Propose 2 directions/.test(c[0] || '') && c.some(x => /prove this wrong/.test(x)), c.join(' | '));
  // 2. Evidence = failure cases. Copilot looks at a new card unasked and pins a thought (only when a model can answer)
  if (live) queue.push({ id: 'C-pin', match: 'Include 1 or at most 2 pins', text: AIPROD.pin });
  await p.evaluate(() => select([])); await p.type('note: ' + AIPROD.failures[0][0]); await p.waitForTimeout(1500); await p.idle();
  const firstFail = await p.evaluate(t => board.nodes.find(n => n.type === 'note' && n.text === t)?.id, AIPROD.failures[0][0]);
  const pins = await p.evaluate(() => Object.values(board.pins || {}).flat().map(x => ({ note: x.note, engine: x.engine, act: x.liftAct })));
  if (live) {
    check(`[C ${tag}] Copilot speaks up on a new failure case without being asked`, pins.length === 1 && /eval set/.test(pins[0].note) && pins[0].engine === 'model', JSON.stringify(pins));
    check(`[C ${tag}] its look was told the stage`, requests.some(r => r.matched === 'C-pin' && /STAGE: Explore/.test(r.full)));
    check(`[C ${tag}] the thought ends in one action to take, not a question to answer`, pins[0] && pins[0].act === 'list');
  } else {
    check(`[C ${tag}] with no model, Copilot stays quiet rather than invent a thought`, pins.length === 0, JSON.stringify(pins));
  }
  await p.evaluate(([idea, id, rest]) => { checkpoint(); byId(id).weight = 'observed'; edge(id, idea, 'src'); rest.forEach(([text, weight], i) => { const n = node('note', { text, weight, status: 'ink' }, { x: -900, y: 400 + i * 160 }); edge(n.id, idea, 'src'); }); renderAll(); persist(); }, [idea, firstFail, AIPROD.failures.slice(1)]);
  // 3. Diverge: three ways to split the work between person and model
  if (live) queue.push({ id: 'C-fork', match: '"directions"', text: AIPROD.dirs });
  await p.cmd([idea], '/fork 3');
  const ds = await directions(p, idea);
  check(`[C ${tag}] fork drafts three directions`, ds.length === 3, JSON.stringify(ds));
  // keep B and C; A stays a draft until Critic has looked at it
  await p.evaluate(ids => { ink(ids); select([]); }, ds.slice(1).map(d => d.id));
  const A = ds[0], B = ds[1];
  // 4. Critic on the riskiest direction; it is discarded with the reason
  if (live) queue.push({ id: 'C-crit', match: 'Check this', text: AIPROD.critique });
  await p.evaluate(a => critique(byId(a), { ask: 'What happens when it is wrong?' }), A.id); await p.idle();
  check(`[C ${tag}] Critic answers what happens when the model is wrong`, await p.evaluate(a => (board.threads[a] || []).some(m => m.who === 'critic' && m.text.length > 20), A.id));
  await p.evaluate(a => erase([a], { reason: 'A sent email cannot be taken back; one wrong one ends trust.' }), A.id); await p.waitForTimeout(300);
  c = await chips();
  check(`[C ${tag}] with directions on the board, Copilot offers to compare them`, /Compare the directions/.test(c[0] || ''), c.join(' | '));
  // 5. Compare with Copilot in the panel: it answers, drafts an eval set, and only suggests changes to kept cards
  if (live) queue.push({ id: 'C-sub', match: 'Sub-agent protocol', text: '- fine' }, { id: 'C-cp', match: 'Lumen Copilot', text: AIPROD.copilot });
  await p.evaluate(() => { document.activeElement?.blur?.(); select([]); }); await p.keyboard.press('Control+.'); await p.waitForTimeout(600);
  await p.fill('#cpInput', 'Compare the directions against the failure cases. Which would you adopt?'); await p.keyboard.press('Enter');
  for (let i = 0; i < 60 && await p.evaluate(() => { const m = (board.copilot || []).at(-1); return !m || m.role !== 'ai' || m.streaming || m.typing; }); i++) await p.waitForTimeout(250);
  await p.idle();
  const reply = await p.evaluate(() => { const m = (board.copilot || []).filter(m => m.role === 'ai').at(-1); return m ? [m.text || '', ...(m.proposals || []).map(x => [x.title, x.text, ...(x.cards || []).map(c => c.title)].join(' '))].join('\n') : ''; });
  check(`[C ${tag}] Copilot answers in the panel`, reply.length > 20, reply.slice(0, 120));
  if (live) {
    const cpReq = requests.find(r => r.matched === 'C-cp');
    check(`[C ${tag}] Copilot was given the stage, the directions and the failure cases`, !!cpReq && /STAGE: Explore/.test(cpReq.full) && /Drafts, you confirm/.test(cpReq.full) && /promised a price/.test(cpReq.full), cpReq ? cpReq.full.slice(0, 200) : 'no request');
    check(`[C ${tag}] what Copilot creates arrives as a draft for the designer to keep`, await p.evaluate(() => { const n = board.nodes.find(n => n.title === 'Eval set v0'); return !!n && n.status === 'sketch'; }));
    const B = ds.find(d => d.title === 'Drafts, you confirm');
    check(`[C ${tag}] a change Copilot wants on a kept direction is only suggested`, await p.evaluate(id => openProps(id).length === 1 && !/any draft states a price/.test(byId(id).test || ''), B.id));
  } else {
    gap(`[C ${tag}] with no model, Copilot answers with another project's advice (audit #1)`, /hair sync|creators|fit-check|headband|lifted frame/i.test(reply), reply.replace(/\s+/g, ' ').slice(0, 220));
  }
  await p.keyboard.press('Escape');
  // 6. Adopt (after keeping Copilot's eval set draft, if any); Copilot's suggestions move on to testing
  await p.evaluate(() => { const ids = board.nodes.filter(n => n.status === 'sketch' && !n.tombstone).map(n => n.id); if (ids.length) ink(ids); });
  await p.evaluate(b => { adopt(byId(b)); select([]); }, B.id); await p.waitForTimeout(300);
  c = await chips();
  check(`[C ${tag}] once adopted, Copilot moves on to the cheapest real test`, /cheapest real test/.test(c[0] || ''), c.join(' | '));
  // 7. Prototype with the four states an AI feature needs
  if (live) queue.push({ id: 'C-build', match: 'Write the real content for this prototype', text: AIPROD.proof });
  await p.cmd([B.id], '/build');
  const proof = await p.evaluate(b => { const n = board.nodes.find(n => n.type === 'proof' && n.dir === b); return n && { id: n.id, items: (n.spec?.items || []).map(i => i.title) }; }, B.id);
  check(`[C ${tag}] Wright builds a proof for the adopted direction`, !!proof && proof.items.length >= 3, JSON.stringify(proof));
  if (live) check(`[C ${tag}] the proof designs all four states: normal, wrong, unsure, no model`, proof && ['Normal', 'Wrong', 'Unsure', 'No model'].every(s => proof.items.includes(s)), JSON.stringify(proof && proof.items));
  await p.evaluate(id => ink([id]), proof.id);
  await p.cmd([proof.id], '/snapshot');
  check(`[C ${tag}] the tested version is frozen`, (await p.stage()) === 'snapshot', await p.stage());
  const dec = await p.evaluate(() => (board.declined || []).map(d => d.kind + ':' + (d.reason || '').slice(0, 30)));
  check(`[C ${tag}] the hand-off carries why A was dropped and C passed over`, dec.some(d => /^draft:A sent email/.test(d)) && dec.some(d => d.startsWith('passed-over')), JSON.stringify(dec));
  gap(`[C ${tag}] no eval-set card type yet: evals live in notes and proof items (roadmap)`, await p.evaluate(() => !CMDS.some(c => /eval/i.test(c.c + c.d))));
  check(`[C ${tag}] no page errors`, p.errors.length === 0, p.errors.join(' | '));
  await p.context().close();
}

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7); // e.g. --only=C
    for (const live of [true, false]) for (const [k, f] of [['A', productDesign], ['B', shortVideo], ['C', aiProduct]]) if (!only || only.includes(k)) await f(browser, base, live);
  } catch (e) { check('the run finished', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' ')); }
  await browser.close(); srv.close();
  console.log(results.join('\n'));
  console.log(`\n${results.filter(r => r.startsWith('PASS')).length} passed, ${failures} failed, ${known} known gaps`);
  process.exit(failures ? 1 : 0);
})();

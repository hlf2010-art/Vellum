#!/usr/bin/env node
/* Crew progress as a checklist: one status set wherever work runs in steps.
 * - The icon alone carries the state (done · run · wait · you · fail · stop); done steps stay, muted and struck through.
 * - A crew run on the island lists the steps it has really reached ("Reading 2 cards", then the job); a media job's
 *   "rendering 1/2 · 40%" and "rendering 2/2" are one step whose words move on. One step is not a checklist.
 * - A move with a plan (Scout looks up the background, then Strategist drafts) is one row with dotted rings for what
 *   is left, the agent on the current step in the orb, and "2/3" in the compact pill; it ends when its last step does.
 * - A long list keeps the moving step in view and folds the rest under "Show N more".
 * - Stopped or failed: the checklist stays and the step it stopped on says how. Finished: it folds away.
 * - Copilot's helper steps use the same icons. Phases and steps follow the interface language.
 *   node tests/crew-steps.cjs            (from the repo root)
 *   SHOTS=dir node tests/crew-steps.cjs  (also save light/dark, English/Chinese screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = process.env.VELLUM_FILE || path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

const FORK = JSON.stringify({ directions: [
  { title: 'Hours-left ring', plan: 'A ring of light that shrinks as hours run out.', test: '8 of 10 hikers read the hours left at a glance', mode: 'story' },
  { title: 'Spoken countdown', plan: 'The lantern says the hours left when tapped twice.', test: 'Hikers ask for it on 3 of 4 nights', mode: 'story' }] });
let delay = 1600;
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
          setTimeout(() => {
            if (!parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: text } }] })); }
            rsp.writeHead(200, { 'Content-Type': 'text/event-stream' });
            for (let k = 0; k < text.length; k += 40) rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text.slice(k, k + 40) } }] }) + '\n\n');
            rsp.end('data: [DONE]\n\n');
          }, delay);
        }); return;
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function open(b, base, { theme = 'light', lang = 'en' } = {}) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, deviceScaleFactor: SHOTS ? 2 : 1 });
  await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route(/wikipedia|wikimedia|keenable/, r => r.abort());
  const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
  if (lang === 'zh') { await p.evaluate(() => store.set('.lang', 'zh')); await p.reload(); await p.waitForTimeout(2200); }
  await p.evaluate(t => { store.set('.theme', t); document.documentElement.dataset.theme = t; }, theme);
  p.rows = () => p.evaluate(() => [...document.querySelectorAll('#island .isl-row')].map(r => ({
    title: r.querySelector('.isl-t')?.textContent || '', ended: r.classList.contains('ended'),
    stepsShown: !!r.querySelector('.isl-steps:not([hidden])'),
    steps: [...r.querySelectorAll('.isl-steps:not([hidden]) li.vstep')].map(li => li.dataset.s + ':' + li.querySelector('.vstep-t>span').textContent),
    more: r.querySelector('.isl-steps:not([hidden]) .vsteps-more')?.textContent || '', bar: !!r.querySelector('.isl-bar:not([hidden])') })));
  p.openIsland = async () => { await p.evaluate(() => islSetOpen(true)); await p.waitForTimeout(250); };
  return p;
}
async function shot(p, name) { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png'), clip: { x: 420, y: 0, width: 600, height: 300 } }); }

(async () => {
  const srv = await serve(); const base = 'http://127.0.0.1:' + srv.address().port;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch();
  try {
    const p = await open(b, base);

    /* 1. the step model */
    const m = await p.evaluate(() => {
      const t = taskOpen({ kind: 'directions', agent: 'scout', title: 'Night lantern', steps: [{ key: 'ground', who: 'scout', label: 'Look up the real background' }, { key: 'draft', who: 'muse', label: 'Draft 3 directions' }] });
      const a = t.steps.map(x => x.state).join(','), r0 = islRight(t);
      t.step('ground'); const b1 = t.steps.map(x => x.state).join(','), r1 = islRight(t);
      t.step('draft'); const c1 = t.steps.map(x => x.state).join(','), r2 = islRight(t);
      t.done(); const d1 = t.steps.map(x => x.state).join(',');
      const u = taskOpen({ title: 'x', steps: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }] });
      u.step('c'); const skipped = u.steps.map(x => x.key + x.state).join(',');
      u.step('extra', 'Extra'); const inserted = u.steps.map(x => x.key + x.state).join(',');
      u.fail('boom'); const failed = u.steps.map(x => x.state).join(',');
      islDismiss(t); islDismiss(u);
      return { a, r0, b1, r1, c1, r2, d1, skipped, inserted, failed };
    });
    check('a plan starts as dotted rings, nothing pretends to run', m.a === 'wait,wait', JSON.stringify(m));
    check('starting a step runs it; the next one starting checks it off', m.b1 === 'run,wait' && m.c1 === 'done,run', JSON.stringify(m));
    check('the compact pill counts the plan: 1/2, then 2/2', m.r1 === '1/2' && m.r2 === '2/2', JSON.stringify(m));
    check('done checks every step', m.d1 === 'done,done', m.d1);
    check('planned steps that were jumped never happened, they go', m.skipped === 'crun', m.skipped);
    check('a step nobody planned joins after the last one reached', m.inserted === 'cdone,extrarun', m.inserted);
    check('a failure marks the step it stopped on', m.failed === 'done,fail', m.failed);

    /* 2. the window: the moving step stays in view, the rest fold under Show N more */
    const w = await p.evaluate(() => {
      const mk = (n, cur) => Array.from({ length: n }, (_, i) => ({ key: 'k' + i, label: 'Step ' + (i + 1), state: i < cur ? 'done' : i === cur ? 'run' : 'wait' }));
      const five = stepsWindow(mk(5, 0)), seven = stepsWindow(mk(7, 4)), all = stepsWindow(mk(7, 4), 4, true);
      return { five: five.show.length + '/' + five.hidden, seven: seven.show.map(x => x.label).join('|') + '/' + seven.hidden, all: all.show.length };
    });
    check('five steps all show: folding one away would save nothing', w.five === '5/0', w.five);
    check('seven steps show four around the current one (one done step for context) and fold three', w.seven === 'Step 4|Step 5|Step 6|Step 7/3', w.seven);
    check('Show more shows them all', w.all === 7, String(w.all));

    /* 3. a crew run on the island: reading, then the job; one step is not a checklist */
    await p.openIsland();
    await p.evaluate(() => {
      const ns = board.nodes.filter(n => !n.archived && n.type !== 'group').slice(0, 2);
      window._run = runAgent('critic', { read: ns, places: [], label: 'checking sources', work: () => new Promise(r => setTimeout(() => r({ live: true }), 2200)) });
    });
    await p.waitForTimeout(1500);
    let rows = await p.rows();
    const r3 = rows.find(r => /Critic/.test(r.title));
    check('a crew run lists the steps it reached: reading done, the job running', r3 && r3.steps.join('|') === 'done:Reading 2 cards|run:Checking sources', JSON.stringify(rows));
    check('with a checklist and no real percentage, the spinning bar steps aside', r3 && r3.stepsShown && !r3.bar, JSON.stringify(r3));
    await p.evaluate(() => window._run); await p.waitForTimeout(400);
    rows = await p.rows();
    const r3e = rows.find(r => /Critic/.test(r.title));
    check('a finished run folds its checklist away', r3e && r3e.ended && !r3e.stepsShown, JSON.stringify(r3e));

    /* 4. a media job: "rendering 1/2 · 40%" and "rendering 2/2" are one step */
    await p.evaluate(() => {
      window._img = runAgent('wright', { read: [], places: [], label: 'rendering 2 images', task: { kind: 'image', title: 'Lantern at dusk' }, work: async ({ say }) => {
        say('waiting for queue (1/2)', { queued: true, pct: null }); await wait(300);
        say('rendering 1/2 · 40%', { queued: false, pct: 20 }); await wait(300);
        say('rendering 2/2', { pct: 60 }); await wait(900); return { live: true };
      } });
    });
    await p.waitForTimeout(900);
    rows = await p.rows();
    const r4 = rows.find(r => /Lantern at dusk/.test(r.title));
    check('media phases: the queue, then one rendering step whose words move on', r4 && r4.steps.join('|') === 'done:Waiting for queue (1/2)|run:Rendering 2/2', JSON.stringify(r4));
    check('a real percentage keeps its bar beside the checklist', r4 && r4.bar, JSON.stringify(r4));
    await p.evaluate(() => window._img); await p.waitForTimeout(300);

    /* 5. a planned move: Scout looks up, Strategist drafts, one row */
    await p.evaluate(() => { ISL.tasks = []; islSchedule(); });
    await p.evaluate(() => {
      window._move = taskOpen({ kind: 'directions', agent: 'scout', title: 'Night lantern', steps: [{ key: 'ask', who: 'muse', label: 'Ask you a few questions' }, { key: 'ground', who: 'scout', label: 'Look up the real background' }, { key: 'draft', who: 'muse', label: 'Draft 2 directions' }] });
      window._move.step('ask', null, { state: 'you' });
    });
    await p.waitForTimeout(700); await p.openIsland();
    rows = await p.rows();
    check('waiting on your answers has its own icon, not a spinner', rows[0]?.steps[0] === 'you:Ask you a few questions', JSON.stringify(rows));
    await shot(p, 'light-en-0-waiting-for-you');
    await p.evaluate(async () => {
      window._move.stepDone('ask');
      window._g = runAgent('scout', { read: [], places: [], label: 'looking up background', task: { kind: 'search', parent: window._move, step: 'ground' }, work: () => new Promise(r => setTimeout(() => r({ found: [] }), 1200)) });
    });
    await p.waitForTimeout(600);
    rows = await p.rows();
    const ag = await p.evaluate(() => ({ agent: window._move.agent, n: ISL.tasks.length, right: islRight(window._move) }));
    check('a step of a move reports into the move: one row, Scout in the orb, 2/3', rows.length === 1 && ag.agent === 'scout' && ag.right === '2/3' && rows[0].steps.join('|') === 'done:Ask you a few questions|run:Look up the real background|wait:Draft 2 directions', JSON.stringify({ rows, ag }));
    await shot(p, 'light-en-1-move-running');
    await p.evaluate(() => window._g); await p.waitForTimeout(200);
    const mid = await p.evaluate(() => ({ state: window._move.state, steps: window._move.steps.map(x => x.state).join(',') }));
    check('the move goes on after a middle step', mid.state === 'running' && mid.steps === 'done,done,wait', JSON.stringify(mid));
    await p.evaluate(() => { window._d = runAgent('muse', { read: [], places: [], label: 'forking into 2', task: { parent: window._move, step: 'draft' }, work: () => new Promise(r => setTimeout(() => r({ live: true }), 500)) }); });
    await p.waitForTimeout(250);
    const ag2 = await p.evaluate(() => window._move.agent);
    check('the orb changes to whoever is on the step now', ag2 === 'muse', ag2);
    await p.evaluate(() => window._d); await p.waitForTimeout(250);
    const end = await p.evaluate(() => window._move.state);
    check('the move ends when its last step does', end === 'done', end);

    /* 6. stop: the checklist stays and says where */
    await p.evaluate(() => {
      window._s = taskOpen({ kind: 'directions', agent: 'scout', title: 'Stopped move', steps: [{ key: 'ground', who: 'scout', label: 'Look up the real background' }, { key: 'draft', who: 'muse', label: 'Draft 2 directions' }] });
      runAgent('scout', { read: [], places: [], label: 'looking up background', task: { kind: 'search', parent: window._s, step: 'ground' }, work: () => new Promise(r => setTimeout(r, 5000)) });
    });
    await p.waitForTimeout(400);
    await p.evaluate(() => stopAgent('scout')); await p.waitForTimeout(500);
    rows = await p.rows();
    const rs = rows.find(r => r.title === 'Stopped move');
    check('stopped: the checklist stays, the step it stopped on shows a stop', rs && rs.ended && rs.steps.join('|') === 'stop:Look up the real background|wait:Draft 2 directions', JSON.stringify(rs));

    /* 7. Show N more on the island */
    await p.evaluate(() => {
      const t = taskOpen({ kind: 'agent', agent: 'wright', title: 'Long job', steps: Array.from({ length: 7 }, (_, i) => ({ key: 'k' + i, label: 'Step ' + (i + 1) })) });
      ['k0', 'k1', 'k2', 'k3'].forEach(k => t.step(k)); window._long = t;
    });
    await p.waitForTimeout(700); await p.openIsland();
    rows = await p.rows();
    const rl = rows.find(r => r.title === 'Long job');
    check('a long checklist shows four and offers Show 3 more', rl && rl.steps.length === 4 && rl.more === 'Show 3 more', JSON.stringify(rl));
    await p.locator('#island .vsteps-more').first().click(); await p.waitForTimeout(300);
    rows = await p.rows();
    const rl2 = rows.find(r => r.title === 'Long job');
    check('Show more opens all seven, and offers Show less', rl2 && rl2.steps.length === 7 && rl2.more === 'Show less', JSON.stringify(rl2));
    await p.evaluate(() => { window._long.cancelled(); ISL.tasks = []; islSchedule(); });

    /* 8. a real fork: Scout's background and Strategist's drafting are one move */
    await p.evaluate(url => { SCOUT_GROUNDING = true; apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'smoke', key: 'smoke' }; renderCrew(); }, base);
    await p.evaluate(() => { checkpoint(); const idea = node('idea', { text: 'A camping lantern that tells night hikers how many hours of light are left' }, { x: 3000, y: 3000 }); renderAll(); window._idea = idea.id; window._fork = fork(byId(idea.id), 2, '', { ask: false }); });
    let seen = null;
    for (let i = 0; i < 40 && !seen; i++) {
      await p.waitForTimeout(150);
      const s = await p.evaluate(() => { const live = ISL.tasks.filter(islLive); return live.length ? { n: live.length, keys: live[0].steps.map(x => x.key + ':' + x.state).join(',') } : null; });
      if (s && /draft:run/.test(s.keys)) seen = s;
    }
    check('a fork with Scout first is one row whose plan was ground then draft', seen && seen.n === 1 && seen.keys === 'ground:done,draft:run', JSON.stringify(seen));
    await p.evaluate(() => window._fork); await p.waitForTimeout(600);
    const fk = await p.evaluate(() => { const t = ISL.tasks.find(x => x.kind === 'directions'); return t && { state: t.state, made: islNodes(t).map(n => n.type).join(','), end: islEndText(t) }; });
    check('the fork ends done and owns only the directions it drafted', fk && fk.state === 'done' && fk.made === 'direction,direction' && fk.end === '2 directions drafted', JSON.stringify(fk));
    check('no page errors (English, light)', !p.errs.length, p.errs.join(' | '));
    await p.context().close();

    /* 9. Chinese, and the other themes, for the screenshots */
    for (const [theme, lang] of [['dark', 'en'], ['light', 'zh'], ['dark', 'zh']]) {
      const q = await open(b, base, { theme, lang });
      const zh = await q.evaluate(() => ({ a: phaseL('reading 3 cards'), b: phaseL('rendering 2/4 · 40%'), c: phaseL('drafting with Claude'), d: phaseL('已经是中文') }));
      if (lang === 'zh') check('phases follow the interface language', zh.a === '阅读 3 张卡片' && zh.b === '生成第 2/4 张 · 40%' && zh.c === '用 Claude 起草' && zh.d === '已经是中文', JSON.stringify(zh));
      await q.openIsland();
      await q.evaluate(zh => {
        const T = (e, z) => zh ? z : e;
        const t = taskOpen({ kind: 'directions', agent: 'scout', title: T('Night lantern', '夜行营地灯'), steps: [{ key: 'ask', who: 'muse', label: T('Ask you a few questions', '先问你几个问题') }, { key: 'ground', who: 'scout', label: T('Look up the real background', '查找真实背景资料') }, { key: 'draft', who: 'muse', label: T('Draft 3 directions', '起草 3 个方向') }] });
        t.step('ask'); t.step('ground'); t.update({ phase: 'looking up background' });
      }, lang === 'zh');
      await q.waitForTimeout(700);
      const rr = await q.rows();
      check(`${theme} ${lang}: the move's checklist shows done, running and waiting`, rr[0] && rr[0].steps.map(s => s.split(':')[0]).join(',') === 'done,run,wait', JSON.stringify(rr));
      const ov = await q.evaluate(() => { const r = document.querySelector('#island .isl-row'), sh = document.getElementById('island'); return r && [...r.querySelectorAll('.vstep-t')].some(e => e.scrollWidth > e.clientWidth + 1) || (sh && sh.scrollWidth > sh.clientWidth + 1); });
      check(`${theme} ${lang}: nothing overflows the island`, !ov);
      await shot(q, `${theme}-${lang}-1-move-running`);
      const sub = await q.evaluate(() => document.querySelector('#island .isl-row .ph')?.textContent);
      check(`${theme} ${lang}: under the title, who is on the step (the checklist says what)`, sub === 'Scout', sub);
      await q.evaluate(() => islSetOpen(false)); await q.waitForTimeout(700);
      const pill = await q.evaluate(() => ({ lbl: document.querySelector('#island .isl-lbl span')?.textContent, num: document.querySelector('#island .isl-num')?.textContent }));
      check(`${theme} ${lang}: the compact pill names the current step and counts 2/3`, pill.num === '2/3' && /背景|background/.test(pill.lbl || ''), JSON.stringify(pill));
      await shot(q, `${theme}-${lang}-2-compact`);
      /* Copilot's helper steps: the same icons */
      await q.evaluate(zh => {
        const T = (e, z) => zh ? z : e;
        board.copilot.push({ id: 'cpt', role: 'user', text: T('Is a countdown safer than a battery bar?', '倒计时比电量条更安心吗？') });
        board.copilot.push({ id: 'cpa', role: 'ai', text: '', streaming: true, trace: { open: true, totalMs: 0, steps: [
          { id: 's1', from: 'copilot', to: 'scout', task: T('Find how hikers read battery levels at night', '查夜间徒步者怎么看电量'), status: 'done', ms: 4200, output: T('Two field studies; both say hikers check less when a number is shown.', '两项实地研究：显示数字时，徒步者查看次数更少。') },
          { id: 's2', from: 'scout', to: 'critic', handoff: true, task: T('Check the studies hold up', '核对研究是否站得住'), status: 'running' }] } });
        openCopilot(true); renderCopilot();
      }, lang === 'zh');
      await q.waitForTimeout(700);
      const tr = await q.evaluate(() => [...document.querySelectorAll('.cp-trace-step')].map(e => e.dataset.s + ':' + !!e.querySelector('.vstep-i')).join(','));
      check(`${theme} ${lang}: Copilot's helper steps use the same icons`, tr === 'done:true,run:true', tr);
      if (SHOTS) { const bx = await q.locator('.cp-trace').first().boundingBox(); if (bx) await q.screenshot({ path: path.join(SHOTS, `${theme}-${lang}-3-copilot-steps.png`), clip: { x: bx.x - 16, y: bx.y - 16, width: bx.width + 32, height: bx.height + 32 } }); }
      check(`no page errors (${theme} ${lang})`, !q.errs.length, q.errs.join(' | '));
      await q.context().close();
    }
  } catch (e) { check('test ran to the end', false, e.stack); }
  finally { await b.close(); srv.close(); }
  console.log(results.join('\n'));
  console.log(failures ? `\n${failures} check(s) failed` : `\nAll ${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
})();

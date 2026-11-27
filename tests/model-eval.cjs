#!/usr/bin/env node
/* Vellum model eval: how well does a given model do Vellum's crew work?
 *
 * Drives the real Vellum-Lumen.html (real prompts, real parsing, real fallbacks) against a real model and
 * runs four tasks from a first-time-user session ("I want to make an RPG set in Shanghai"):
 *   fork   – Strategist branches the idea into directions
 *   push   – Copilot answers the designer questioning direction B
 *   merge  – Copilot folds B into A after the designer says what they prefer
 *   build  – Wright writes the content of a prototype the designer asked for
 * Each output gets automated checks for obvious errors. Quality is for a person to judge: the report puts
 * every output next to reference answers from Claude Sonnet 5.5 (same tasks, same board).
 *
 *   node tests/model-eval.cjs                          # Studio AI (Local AI) must be running and ready
 *   node tests/model-eval.cjs --api https://openrouter.ai/api/v1 --model anthropic/claude-sonnet-5.5
 *                                                     # key from VELLUM_EVAL_KEY
 *   options: --n 3 (samples per task)  --tasks fork,push,merge,build  --out model-eval-results  --label name
 *            --timeout 300       (seconds per model call; default Vellum's 95. Use the same value for runs you compare)
 *            --compare a.json b.json [--out compare.md]   (side by side: time and obvious errors per task)
 *            --search keenable   (Scout searches Keenable before branching; key from KEENABLE_API_KEY. Default: Wikipedia)
 *
 * Exit code is 0 when it ran; the check counts are in the report, not a pass/fail gate. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? a.concat([[x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]]) : a), []));
const N = +args.n || 3;
const TASKS = String(args.tasks || 'fork,push,merge,build').split(',');
const OUT = path.resolve(args.out || 'model-eval-results');
const LABEL = String(args.label || (args.api ? String(args.model).split('/').pop() : 'local-ai')).replace(/[^\w.-]+/g, '-');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const STUDIO = 'http://127.0.0.1:59631';

/* ------------------------------------------------------------------ the session's fixed material */
const IDEA = 'I want to make an RPG set in Shanghai.';
const BRIEF = 'I am not sure what kind of RPG yet. What are a few really different directions this could go?';
const PUSH = "Isn't a trading-house sim really a strategy game, not an RPG? What would make this one feel like a role-playing game?";
const MERGE = 'Character-driven, with the ledger as the pressure. Honestly the lane-house one pulls at me more than this. Could the trading house live inside that lilong instead of being its own game?';
const BUILD = 'Build a prototype of the opening scene: the night in 1937 when the lane hears the shelling';
// Directions A-C as Claude Sonnet 5.5 drafted them in the session; push/merge/build start from these.
const DIRS = [
  { letter: 'A', title: 'Lane House Chronicle', text: 'Build a narrative RPG set in a single Shanghai lilong neighborhood across 1925, 1937, and 1949, where dialogue choices and relationships with neighbors shape who stays, leaves, or informs when history arrives.', test: 'Have 8 players read a branching 20-minute vertical slice of one night in 1937 and then, without prompting, tell us which neighbor they felt responsible for; if fewer than half name a specific person and a choice they regret, the intimacy is not landing.' },
  { letter: 'B', title: 'Concession Ledger Sim', text: 'Build a systems-heavy tabletop-style RPG where the player runs a small trading house in 1930s Shanghai, balancing debts, gang protection, foreign consuls, and a party of recruited agents across a map of districts.', test: 'Run a paper prototype with 6 groups of 3 for two hours and see whether at least 4 groups make a second-session request without us asking; if players treat the map as a spreadsheet and ignore the district flavor, the setting is decoration.' },
  { letter: 'C', title: 'Neon Pudong Cardfighter', text: "Make a card-driven tactical RPG in a near-future Shanghai where each district is a faction deck, and your party is assembled by drafting characters drawn from the city's street food, finance, and metro subcultures.", test: "Print 60 cards for three districts and have 10 players draft and play a 15-minute skirmish; if players cannot guess a district's playstyle from its cards alone, the city is not driving the mechanics." },
];
const SONNET_PUSH = "It reads as strategy with an RPG skin right now: the ledger is the game and the agents are a resource. It becomes an RPG when the player's choices define a character and the agents are people who push back.\n\n- **Agents as characters:** Give each recruit a debt, a loyalty, and a grudge, and make them refuse, bargain, or leave. Right now they sound like units.\n- **A player role:** Make the trading house a persona with a reputation, not just a balance sheet. The gangs and consuls should treat you differently depending on who you've been.\n- **Scenes, not turns:** Resolve key moments, like a consul's dinner or a protection visit, as scenes with stakes. Keep the ledger as the pressure behind them.\n- **Prototype signal:** Your test already points here. If groups talk about agents by name, it's RPG-like. If they talk about columns, it's strategy.\n\nDo you want the game to land closer to a strategy game with story, or to a character-driven RPG where the ledger is the pressure?";
const SONNET_MERGE = "Yes, and I think it fixes the weak spot in the sketch. Folding the ledger into the lilong makes it the pressure on one household rather than a separate system.\n\n- **Map:** The lane's doors, stairwells, and shared kitchens replace the districts. That makes the spreadsheet-map risk much smaller, because each cell is a person.\n- **Trading house:** It becomes one household's enterprise, with debts owed to neighbors and landlords. Agents become lodgers, relatives, and apprentices who live under the same roof.\n- **Outside pressure:** Gang protection and consuls arrive at the lane entrance as events, not as map layers.\n- **Cost:** You lose the sense of a whole city. That may be fine, since the city can arrive through visitors and rumor.\n\nThe test could shrink too: do groups name the lane's residents and argue about them?\n\nShould the ledger be visible to the player at all times, or only surface when someone comes to collect?";

/* ------------------------------------------------------------------ obvious-error checks (independent of the page's own) */
const OTHER_CITY = /\b(Beijing|Peking|Tianjin|Hong Kong|Taipei|Tokyo|Guangzhou|Canton|Hangzhou|Suzhou|Chongqing|Wuhan|Singapore|Seoul|Osaka|Macau|Nanking|Nanjing(?!\s+(?:East\s+|West\s+)?Road)|Wangfujing|Tiananmen|Forbidden City|Ximending|Shibuya|Shinjuku|Ginza|Mong Kok|Kowloon|Victoria Harbour)\b/;
// things a 1937 scene cannot contain
const MODERN = /\b(smart ?phones?|cell ?phones?|mobile phones?|your phone|charg(?:ing|er)|text messages?|internet|e-?mails?|laptops?|computers?|wi-?fi|social media|GPS|selfies?|drones?|television|TV|subway|metro)\b/i;
// the session is in English: Chinese characters, run-together words, or prompt scaffolding in an answer are errors
function textFlags(t) {
  const f = [], s = String(t || '');
  if (/[\u4e00-\u9fff]/.test(s)) f.push('switches to Chinese');
  const g = s.match(/\b[A-Za-z]+\d{3,4}\b|\b[A-Za-z]{18,}\b/); if (g) f.push(`words run together (${g[0]})`);
  return f;
}
const RULE_TITLES = /^(Walk it through|Lay it all out|Cut to one moment|Make the case)$/;
function checkDirs(dirs) {
  const f = [];
  if (dirs.length !== 3) f.push(`${dirs.length} directions, not 3`);
  const titles = new Set();
  for (const d of dirs) {
    const tag = d.letter || '?';
    if (d.engine !== 'model') f.push(`${tag}: made by ${d.engine || 'unknown'}, not the model`);
    if (RULE_TITLES.test(d.title)) f.push(`${tag}: built-in rules template`);
    if (!d.title || !d.text || !d.test) f.push(`${tag}: missing title, plan or test`);
    const w = String(d.title || '').split(/\s+/).filter(Boolean).length;
    if (w > 5) f.push(`${tag}: title is ${w} words`);
    if (titles.has(String(d.title).toLowerCase())) f.push(`${tag}: duplicate title`);
    titles.add(String(d.title).toLowerCase());
    const all = `${d.title} ${d.text} ${d.test}`;
    const city = all.match(OTHER_CITY); if (city) f.push(`${tag}: another city (${city[1]})`);
    if (/\b(fewer|less) than (one|1|zero|0)\b/i.test(d.test)) f.push(`${tag}: impossible number in test`);
    if (/Shilin|Night Market Ledger|reading as character/i.test(all)) f.push(`${tag}: copies the prompt's example`);
    f.push(...textFlags(all).map(x => `${tag}: ${x}`));
  }
  return f;
}
function checkReply(text) {
  const f = [];
  if (!String(text || '').trim()) return ['empty reply'];
  const last = String(text).trim().split(/\n\s*\n/).pop();
  const qs = (last.match(/\?/g) || []).length; // a question earlier in the reply is fine; the close should ask one thing
  if (qs > 1 || /—\s*or\s*—|^\s*or\s*$/im.test(text)) f.push(`${qs} closing questions, not 1`);
  if (/\b(I'?ll|I will|let me|I'm going to)\s+(start|begin|go ahead|draft|build|write|set up|adjust|create)\b/i.test(text)) f.push('promises work it will not do');
  const words = String(text).split(/\s+/).length;
  if (words > 230) f.push(`${words} words`);
  const city = String(text).match(OTHER_CITY); if (city) f.push(`another city (${city[1]})`);
  if (/^\s*`{0,3}\s*chips\s*:?\s*\[/im.test(text) || /\bLabel\s*:/.test(text)) f.push('prompt scaffolding shows (chips/Label)');
  f.push(...textFlags(text));
  return f;
}
function checkBuild(spec) {
  const f = [];
  if (!spec) return ['no proof'];
  if (spec.engine && spec.engine !== 'model') f.push(`made by ${spec.engine}, not the model`);
  const items = spec.items || [];
  if (!spec.title) f.push('no title');
  if (items.length < 3 || items.length > 8) f.push(`${items.length} items`);
  const all = [spec.title, spec.lede, ...items.flatMap(i => [i.title, i.body])].join(' ');
  if (!/1937|shell|bomb|artillery|explosion|blast/i.test(all)) f.push('not the scene that was asked for');
  if (/\b(prototype|playtest|participants?|the test|this page|testers?)\b/i.test(items.map(i => i.body).join(' '))) f.push('describes the prototype instead of being it');
  const anach = [all, ...items.flatMap(i => i.choices || [])].join(' ').match(MODERN); if (anach) f.push(`anachronism in 1937 (${anach[1]})`);
  f.push(...textFlags(all));
  const city = all.match(OTHER_CITY); if (city) f.push(`another city (${city[1]})`);
  return f;
}

/* ------------------------------------------------------------------ page plumbing */
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/Vellum-Lumen.html'))) {
        rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp);
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function open(browser, base) {
  // reduced motion: the eval measures the model, not how much CPU the drafting animation takes from it
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
  if (args.api && args.auto) {
    // Auto: Local AI and the Cloud API together, each task routed as the designer would get it
    const ok = await p.evaluate(async ([baseUrl, model, key]) => { apiCfg = { enabled: true, baseUrl, model, key }; setApiHealth('ok', {}); await checkStudioHealth({ wake: false, quiet: true }); aiPref = 'auto'; return studioState.status === 'ready'; }, [args.api, args.model, process.env.VELLUM_EVAL_KEY || 'placeholder']);
    if (!ok) throw new Error('--auto needs Studio AI ready at ' + STUDIO + ' as well as --api.');
  } else if (args.api) await p.evaluate(([baseUrl, model, key]) => { apiCfg = { enabled: true, baseUrl, model, key }; aiPref = 'api'; }, [args.api, args.model, process.env.VELLUM_EVAL_KEY || 'placeholder']);
  else {
    const ok = await p.evaluate(async () => { await checkStudioHealth({ wake: false, quiet: true }); aiPref = 'auto'; apiCfg = { ...apiCfg, enabled: false }; return studioState.status === 'ready'; });
    if (!ok) throw new Error('Studio AI is not ready at ' + STUDIO + '. Start it (Start Studio AI.command) and load a model first.');
  }
  if (args.timeout) await p.evaluate(ms => { AI_TIMEOUT_MS = ms; LOCAL_AI_MS = ms; }, Math.round(+args.timeout * 1000));
  if (args.search === 'keenable') await p.evaluate(key => { searchCfg = { provider: 'keenable', key, mode: 'pro' }; }, process.env.KEENABLE_API_KEY || 'proxy-injected');
  await p.evaluate(() => { window.__toasts = []; const t = toast; toast = (m, ...a) => { __toasts.push(String(m)); return t(m, ...a); }; });
  p.type = async t => { await p.click('#lineInput'); await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.keyboard.type(t); await p.keyboard.press('Enter'); };
  p.idle = async (max = 600000) => { const t0 = Date.now(); await p.waitForTimeout(600); while (Date.now() - t0 < max && await p.evaluate(() => crewBusy() || copilotStreaming || !!document.querySelector('dialog[open][data-clarify]'))) { await p.evaluate(answerClarify => { if (window.__answerClarify) window.__answerClarify(); }, null); await p.waitForTimeout(500); } await p.waitForTimeout(400); };
  p.newBoard = async () => { await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(800); };
  // a designer who clicks the options closest to what they said they want (used if Strategist asks first)
  await p.evaluate(() => { window.__answerClarify = () => { const d = document.querySelector('dialog[open][data-clarify]'); if (!d) return; const want = /1930|concession|settlement|detective|noir|police|\bstory\b|narrative|choice|people|character/i; for (const g of d.querySelectorAll('[data-clarify-q]')) { const opts = [...g.querySelectorAll('[data-clarify-opt]')]; (opts.find(o => want.test(o.textContent)) || opts[0])?.click(); } d.querySelector('[data-clarify-go]')?.click(); }; });
  return p;
}

// the idea and Sonnet's three directions, as drafts (not kept), as they were when the designer asked Copilot
async function seedBoard(p, { kept = false, votes = false } = {}) {
  await p.newBoard();
  return p.evaluate(([IDEA, DIRS, kept, votes]) => {
    const idea = node('idea', { text: IDEA, by: 'you', status: 'ink' }, { x: 900, y: 300 });
    const ids = {};
    DIRS.forEach((d, i) => {
      const n = node('direction', { idea: idea.id, _src: idea.id, letter: d.letter, title: d.title, text: d.text, test: d.test, mode: 'story', by: 'muse', status: kept ? 'ink' : 'sketch', prov: { author: 'muse', engine: 'model', at: NOW(), basis: null } }, { x: 1300, y: 80 + i * 240 });
      edge(idea.id, n.id, 'derive', 'live'); ids[d.letter] = n.id;
    });
    if (votes) { byId(ids.A).vote = 'up'; byId(ids.C).vote = 'down'; }
    board.copilot = []; renderAll(); persist();
    return { idea: idea.id, ...ids };
  }, [IDEA, DIRS, kept, votes]);
}

const RUN = {
  async fork(p) {
    await p.newBoard();
    await p.type(IDEA); await p.waitForTimeout(800);
    await p.evaluate(() => select([board.nodes.find(n => n.type === 'idea').id]));
    const t0 = Date.now(); await p.type(BRIEF); await p.idle();
    const out = await p.evaluate(() => board.nodes.filter(n => n.type === 'direction').map(n => ({ letter: n.letter, title: n.title, text: n.text, test: n.test, engine: n.prov?.engine })));
    const asked = await p.evaluate(() => board.nodes.find(n => n.type === 'idea')?.clarified || null);
    const sources = await p.evaluate(() => board.nodes.filter(n => n.type === 'source' && n.by === 'scout').map(n => ({ kind: n.kind, title: n.title, url: n.src?.url || n.path || '' })));
    return { seconds: (Date.now() - t0) / 1000, out, asked, sources, flags: checkDirs(out) };
  },
  async push(p) {
    const ids = await seedBoard(p);
    const t0 = Date.now();
    await p.evaluate(([q, b]) => sendCopilotMessage(q, [b]), [PUSH, ids.B]);
    const out = await p.evaluate(() => board.copilot.at(-1)?.text || '');
    return { seconds: (Date.now() - t0) / 1000, out, flags: checkReply(out) };
  },
  async merge(p) {
    const ids = await seedBoard(p, { votes: true });
    await p.evaluate(([q, a]) => { const t = NOW(); board.copilot = [{ id: uid(), role: 'user', text: q, t, ctxIds: [] }, { id: uid(), role: 'ai', agent: null, text: a, visuals: [], proposals: [], chips: [], t }]; }, [PUSH, SONNET_PUSH]);
    const t0 = Date.now();
    await p.evaluate(([q, b]) => sendCopilotMessage(q, [b]), [MERGE, ids.B]);
    const out = await p.evaluate(() => board.copilot.at(-1)?.text || '');
    return { seconds: (Date.now() - t0) / 1000, out, flags: checkReply(out) };
  },
  async build(p) {
    const ids = await seedBoard(p, { kept: true });
    await p.evaluate(a => { adopt(byId(a)); select([a]); }, ids.A); await p.waitForTimeout(700);
    await p.evaluate(a => select([a]), ids.A);
    const t0 = Date.now(); await p.type(BUILD); await p.idle();
    const out = await p.evaluate(() => { const pr = board.nodes.find(n => n.type === 'proof'); if (!pr) return null; const s = pr.spec || {}; return { title: s.title, kicker: s.kicker, lede: s.lede, cta: s.cta, items: (s.items || []).map(i => ({ title: i.title, body: i.body, tag: i.tag, choices: i.choices })), engine: pr.prov?.engine }; });
    return { seconds: (Date.now() - t0) / 1000, out, flags: checkBuild(out) };
  },
};

function md(results, meta) {
  const TASKS = ['fork', 'push', 'merge', 'build'].filter(t => results.some(r => r.task === t));
  const L = [`# Vellum model eval · ${meta.label}`, '', `${meta.when} · engine: ${meta.engine} · ${N} samples per task · Vellum ${meta.commit}`, '',
    '| Task | Samples | Avg seconds | Samples with obvious errors | Errors |', '|---|---|---|---|---|'];
  for (const t of TASKS) {
    const rs = results.filter(r => r.task === t);
    const bad = rs.filter(r => r.flags.length || r.error);
    const all = rs.flatMap(r => r.error ? ['crashed: ' + r.error] : r.flags);
    L.push(`| ${t} | ${rs.length} | ${(rs.reduce((a, r) => a + (r.seconds || 0), 0) / Math.max(1, rs.length)).toFixed(0)} | ${bad.length} | ${[...new Set(all)].join('; ') || 'none'} |`);
  }
  const ref = { fork: DIRS.map(d => `- **${d.title}:** ${d.text} *Test:* ${d.test}`).join('\n'), push: SONNET_PUSH, merge: SONNET_MERGE, build: '(no reference)' };
  for (const t of TASKS) {
    L.push('', `## ${t}`, '', '<details><summary>Reference: Claude Sonnet 5.5</summary>', '', ref[t], '', '</details>');
    for (const r of results.filter(x => x.task === t)) {
      L.push('', `### ${t} #${r.i + 1} · ${r.seconds?.toFixed(0)} s${r.flags?.length ? ' · ⚠ ' + r.flags.join('; ') : ''}${r.error ? ' · crashed: ' + r.error : ''}`, '');
      if (r.asked) L.push(`Strategist asked first: ${r.asked.map(q => `${q.q} → **${q.a}**`).join(' · ')}`, '');
      if (r.sources) L.push(r.sources.length ? `Scout found: ${r.sources.map(x => `[${x.title}](${x.url}) (${x.kind})`).join(' · ')}` : 'Scout found nothing (or could not search).', '');
      if (t === 'fork') L.push(...(r.out || []).map(d => `- **${d.letter} · ${d.title}** (${d.engine}): ${d.text} *Test:* ${d.test}`));
      else if (t === 'build') L.push(r.out ? [`**${r.out.title}** — ${r.out.kicker || ''}`, '', r.out.lede || '', '', ...(r.out.items || []).map(i => `- **${i.title}:** ${i.body}${i.choices?.length ? ` _(choices: ${i.choices.join(' / ')})_` : ''}`)].join('\n') : '(none)');
      else L.push(r.out || '(empty)');
    }
  }
  return L.join('\n');
}

// --compare a.json b.json: time and obvious errors per task, side by side (e.g. thinking off vs on)
if (args.compare) {
  const files = [args.compare, process.argv[process.argv.indexOf(args.compare) + 1]].filter(Boolean);
  const runs = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
  const tasks = ['fork', 'push', 'merge', 'build'].filter(t => runs.some(r => r.results.some(x => x.task === t)));
  const avg = (r, t) => { const xs = r.results.filter(x => x.task === t && x.seconds); return xs.length ? xs.reduce((a, x) => a + x.seconds, 0) / xs.length : null; };
  const bad = (r, t) => { const xs = r.results.filter(x => x.task === t); return `${xs.filter(x => x.error || x.flags.length).length}/${xs.length}`; };
  const L = [`# ${runs.map(r => r.meta.label).join(' vs ')}`, '', ...runs.map(r => `- **${r.meta.label}:** ${r.meta.engine}, ${r.meta.when}${r.meta.timeout ? `, ${r.meta.timeout} s limit` : ''}`), '',
    `| Task | ${runs.map(r => r.meta.label + ' · avg s').join(' | ')} | ${runs.map(r => r.meta.label + ' · obvious errors').join(' | ')} |`, `|---|${runs.map(() => '---|').join('')}${runs.map(() => '---|').join('')}`];
  for (const t of tasks) L.push(`| ${t} | ${runs.map(r => (avg(r, t) ?? NaN).toFixed(0)).join(' | ')} | ${runs.map(r => bad(r, t)).join(' | ')} |`);
  L.push('', 'Read the outputs in each run\'s .md to judge quality, or blind-score both with tests/model-eval-judge.py.');
  const out = L.join('\n'); if (args.out && args.out !== true) fs.writeFileSync(args.out, out); console.log(out);
  process.exit(0);
}
// --recheck results.json: apply the current checks to saved outputs and rewrite the report
if (args.recheck) {
  const d = JSON.parse(fs.readFileSync(args.recheck, 'utf8'));
  const chk = { fork: checkDirs, push: checkReply, merge: checkReply, build: checkBuild };
  for (const r of d.results) if (!r.error) r.flags = [...chk[r.task](r.out || (r.task === 'fork' ? [] : r.out)), ...(r.pageErrors || []).slice(0, 1).map(e => 'page error: ' + e)];
  fs.writeFileSync(args.recheck, JSON.stringify(d, null, 1));
  fs.writeFileSync(args.recheck.replace(/\.json$/, '.md'), md(d.results, d.meta));
  console.log('rechecked', args.recheck);
  process.exit(0);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const results = [];
  const commit = (() => { try { return require('child_process').execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: path.dirname(FILE) }).toString().trim(); } catch { return '?'; } })();
  let engine = '?';
  try {
    for (const t of TASKS) for (let i = 0; i < N; i++) {
      const p = await open(browser, base);
      engine = await p.evaluate(() => connSummary().mode);
      let r;
      await p.evaluate(t => { window.__evalTask = t; }, t);
      try { r = await RUN[t](p); } catch (e) { r = { error: String(e.message || e).split('\n')[0], flags: [] }; }
      r.task = t; r.i = i; r.toasts = await p.evaluate(() => __toasts).catch(() => []); r.pageErrors = p.errors;
      // which model answered (the island note for a crew move, the reply's note in Copilot)
      r.route = await p.evaluate(() => (t => t === 'push' || t === 'merge' ? board.copilot.at(-1)?.route : ISL.tasks.filter(x => x.note).at(-1)?.note)(window.__evalTask) || '').catch(() => '');
      if (p.errors.length) r.flags = [...(r.flags || []), 'page error: ' + p.errors[0]];
      // A Copilot reply has no engine tag, so a fallback shows only in the toast. Count it as an error.
      const fell = r.toasts.find(m => /built-in rules answered|answered instead/i.test(m));
      if (fell && !(r.flags || []).some(f => /not the model/.test(f))) r.flags = [...(r.flags || []), 'fell back: ' + fell];
      results.push(r);
      console.log(`${t} #${i + 1}  ${r.seconds ? r.seconds.toFixed(0) + ' s' : ''}${r.route ? '  [' + r.route + ']' : ''}  ${r.error ? 'crashed: ' + r.error : (r.flags.length ? r.flags.join('; ') : 'ok')}`);
      await p.context().close();
    }
  } finally { await browser.close(); srv.close(); }
  const meta = { label: LABEL, when: new Date().toISOString().slice(0, 16).replace('T', ' '), engine, commit, timeout: args.timeout ? +args.timeout : null };
  fs.writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify({ meta, results }, null, 1));
  fs.writeFileSync(path.join(OUT, `${LABEL}.md`), md(results, meta));
  console.log(`\nWrote ${path.join(OUT, LABEL + '.md')}`);
})().catch(e => { console.error(e.message || e); process.exit(2); });

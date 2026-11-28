#!/usr/bin/env node
/* Spot comments: a comment pinned to one spot of an image or a prototype goes straight to the crew.
 * Drives the real Vellum-Lumen.html against a scripted model endpoint (no key, no network):
 * - C (or the Comment tool) and a click on a picture opens a small composer at that spot; Cancel / Send sit on the right
 * - the comment is kept in the card's thread with its spot, and its numbered pin follows the card
 * - the crew answers, asks one question (never twice: a second "ask" becomes a new version), makes a new version
 *   BESIDE the original (numbered, linked, a draft), or objects with evidence and a fix and lets the designer choose
 * - the original is never changed; Undo removes the new version only
 * - an objection without a fix or without evidence from the board is dropped to a plain answer
 * - with no model the comment is kept and the popover says nobody answered; nothing is made
 * - a comment is never a relation or evidence
 *   node tests/spot-comments.cjs   (from the repo root; SHOTS=dir saves screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

let script = [], requests = [];
const kindOf = flat => /pinned a comment on one spot of a card/.test(flat) ? 'spot' : /This replaces version/.test(flat) ? 'build' : 'other';
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp); }
      if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
        let body = ''; req.on('data', c => body += c); req.on('end', async () => {
          const parsed = JSON.parse(body || '{}');
          if (parsed.max_tokens === 1 && !parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: '.' } }] })); }
          const flat = (parsed.messages || []).map(m => typeof m.content === 'string' ? m.content : (m.content || []).map(p => p.text || '').join(' ')).join('\n');
          const kind = kindOf(flat), i = script.findIndex(s => s.kind === kind), hit = i >= 0 ? script.splice(i, 1)[0] : null;
          requests.push({ kind, flat });
          if (!hit) { rsp.writeHead(503); return rsp.end(''); }
          const txt = typeof hit.text === 'string' ? hit.text : JSON.stringify(hit.text);
          rsp.writeHead(200, { 'Content-Type': 'text/event-stream' }); rsp.on('error', () => {});
          for (let k = 0; k < txt.length; k += 40) { if (rsp.destroyed) return; rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: txt.slice(k, k + 40) } }] }) + '\n\n'); }
          if (!rsp.destroyed) rsp.end('data: [DONE]\n\n');
        }); return;
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function run(b, base, { theme, lang, full }) {
  const tag = `${theme}-${lang}`;
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  await c.addInitScript(([t, l]) => { try { localStorage.setItem('vellum-lumen.v1.theme', JSON.stringify(t)); localStorage.setItem('vellum-lumen.v1.lang', JSON.stringify(l)); } catch (e) {} }, [theme, lang]);
  await c.route('http://127.0.0.1:59631/**', r => r.abort()); await c.route('http://127.0.0.1:59639/**', r => r.abort()); await c.route(/wikipedia|wikimedia|openrouter|gdcvault/, r => r.abort());
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2500);
  const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `${tag}-${name}.png`) }); } };
  const ids = await p.evaluate(url => {
    apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'scripted', key: 'k' }; aiPref = 'api'; setApiHealth('ok', {}); cloudBudget = { day: '', by: {} };
    const img = board.nodes.find(n => n.type === 'image' && n.status === 'ink' && /Kowloon/.test(titleOf(n))) || board.nodes.find(n => n.type === 'image' && n.status === 'ink');
    const proofs = board.nodes.filter(n => n.type === 'proof' && n.status === 'ink' && spotDecision(n));
    const proof = proofs.sort((a, b) => b.ver - a.ver)[0];
    return { img: img.id, proof: proof && proof.id };
  }, base);
  const frame = id => p.evaluate(id => { const n = byId(id); cam = { s: 1.1, x: 420 - n.x * 1.1, y: 150 - n.y * 1.1 }; paintCam(); select([]); renderAll(); }, id);
  const boxAt = (id, fx, fy) => p.evaluate(([id, fx, fy]) => { const r = spotBox(nodeEl(id)).getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy }; }, [id, fx, fy]);
  const until = async (fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(120); } return false; };
  const zh = lang === 'zh';

  /* 1. the tool and the composer */
  await frame(ids.img);
  const edges0 = await p.evaluate(() => board.edges.length);
  await p.keyboard.press('c');
  check(`[${tag}] C picks the Comment tool`, await p.evaluate(() => tool === 'comment' && wall.classList.contains('commenting') && qs('[data-ttool="comment"]').getAttribute('aria-pressed') === 'true'));
  let pt = await boxAt(ids.img, .4, .8); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(300);
  const comp = await p.evaluate(() => { const pop = $('spotPop'), btns = [...pop.querySelectorAll('.spot-row button')].map(b => b.dataset.sp); return { open: !pop.hidden, ph: pop.querySelector('.spot-in')?.placeholder, draft: !!qs('.spot.draft'), sendOff: pop.querySelector('[data-sp="send"]').disabled, order: btns.join(','), focus: document.activeElement?.classList.contains('spot-in') }; });
  check(`[${tag}] a click on the picture opens a composer at that spot, with a draft pin`, comp.open && comp.draft && comp.focus && comp.ph === (zh ? '评论这个位置…' : 'Comment on this spot…'), JSON.stringify(comp));
  check(`[${tag}] Cancel and Send sit on the right, Send last and off until there are words`, comp.order === 'cancel,send' && comp.sendOff, JSON.stringify(comp));
  await shot('1-compose');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  check(`[${tag}] Esc drops the comment and leaves nothing behind`, await p.evaluate(id => $('spotPop').hidden && !qs('.spot.draft') && !spotsOf(id).length, ids.img));

  /* 2. send; the crew asks once */
  script.push({ kind: 'spot', text: { mode: 'ask', text: zh ? '怎么强？会改变整张画面。' : 'Push them how? It changes the whole frame.', options: zh ? ['霓虹更亮', '水洼更大', '都要'] : ['Brighter neon', 'Wider puddle', 'Both'] } });
  pt = await boxAt(ids.img, .4, .8); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(200);
  await p.keyboard.type(zh ? '这里水面倒影太弱了，再强一点。' : 'Puddle reflections feel weak here. Push them.'); await p.keyboard.press('Enter');
  const sent = await p.evaluate(id => { const r = spotsOf(id)[0]; const pin = qs(`[data-spot="${id}"][data-spot-n="1"]`); return { n: r?.spot.n, x: r?.spot.x, y: r?.spot.y, tool, inBox: !!pin && spotBox(nodeEl(id)).contains(pin), left: pin?.style.left }; }, ids.img);
  check(`[${tag}] the comment is kept on the card with its spot, the pin sits inside the picture, and the tool goes back to select`, sent.n === 1 && Math.abs(sent.x - .4) < .02 && Math.abs(sent.y - .8) < .02 && sent.inBox && sent.tool === 'select', JSON.stringify(sent));
  await until(() => !!qs('.spot-chip'));
  const ask = await p.evaluate(() => ({ chips: [...qsa('.spot-chip')].map(c => c.textContent), reply: !!qs('.spot-reply'), btns: [...qsa('.spot-pop .spot-row button')].map(b => b.dataset.sp).join(',') }));
  check(`[${tag}] an ask shows the answers to pick, your own words, and Skip / Draw it (primary last)`, ask.chips.length === 3 && !ask.reply && ask.btns === 'skip,go', JSON.stringify(ask));
  const spotReq = requests.filter(r => r.kind === 'spot').pop();
  check(`[${tag}] the crew is told the spot and the card, and that the original is never touched`, /bottom/.test(spotReq?.flat || '') && /40% across, 80% down/.test(spotReq?.flat || '') && /The original is never touched/.test(spotReq?.flat || ''));
  await shot('2-ask');

  /* 3. pick an answer; a second ask becomes a new version beside the original */
  const before = await p.evaluate(id => { const n = byId(id); return { media: n.media, data: n.data, title: n.title, count: board.nodes.length }; }, ids.img);
  script.push({ kind: 'spot', text: { mode: 'ask', text: 'Which neon?', options: ['Pink', 'Cyan'] } });
  await p.click('.spot-chip >> nth=0'); await p.click('[data-sp="go"]');
  await until(() => !!qs('[data-sp="show"]'), null, 9000);
  const req2 = requests.filter(r => r.kind === 'spot').pop();
  check(`[${tag}] after one question the crew is told not to ask again`, /already asked once/.test(req2?.flat || ''));
  const made = await p.evaluate(([id, b]) => {
    const n = byId(id), v2 = board.nodes.find(x => x.versionOf === id && !x.tombstone), root = spotsOf(id)[0], msg = spotMsgs(id, 1).find(m => m.made);
    return { orig: n.media === b.media && n.data === b.data && n.title === b.title, v2: !!v2, ver: v2?.ver, title: v2?.title, sketch: v2?.status === 'sketch', beside: v2 && v2.x > n.x, edge: v2 && board.edges.some(e => e.a === id && e.b === v2.id), from: v2?.fromSpot, done: root.spot.state, msg: msg?.made === v2?.id, text: msg?.text || '', btns: [...qsa('.spot-pop .spot-row button')].map(x => x.dataset.sp).join(',') };
  }, [ids.img, before]);
  check(`[${tag}] a second "ask" is not asked: the crew makes v2 instead`, made.v2 && made.ver === 2, JSON.stringify(made));
  check(`[${tag}] v2 sits beside the original as a draft, numbered, linked by an edge and to the comment`, made.sketch && made.beside && made.edge && / v2$/.test(made.title) && made.from?.n === 1, JSON.stringify(made));
  check(`[${tag}] the original image is untouched`, made.orig, JSON.stringify(made));
  check(`[${tag}] the pin is done, the reply says what changed, and with no image service says v2 is an empty frame`, made.done === 'done' && made.msg && (zh ? /空白框/ : /empty frame/).test(made.text) && made.btns === 'undo,show', JSON.stringify(made));
  await shot('3-acted');
  if (full) {
    const rt = await p.evaluate(async id => { const v2 = board.nodes.find(x => x.versionOf === id && !x.tombstone); redraw(v2.pid); let nv; for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); nv = board.nodes.find(x => x.versionOf === id && !x.tombstone && x.id !== v2.id); if (nv) break; } await new Promise(r => setTimeout(r, 300)); nv = nv || board.nodes.find(x => x.versionOf === id && !x.tombstone); const msg = spotMsgs(id, 1).find(m => m.made); return { nv: !!nv, ver: nv?.ver, title: nv?.title, from: nv?.fromSpot?.n, linked: spotMade(msg, id)?.id === nv?.id }; }, ids.img);
    check('Retry on v2 (no image service: the empty frame is kept) keeps its number, its link to the original and to the comment', rt.nv && rt.ver === 2 && / v2$/.test(rt.title || '') && rt.from === 1 && rt.linked, JSON.stringify(rt));
  }

  /* 4. undo removes only the new version */
  await p.click('[data-sp="undo"]'); await p.waitForTimeout(700);
  const un = await p.evaluate(([id, b]) => { const n = byId(id), v2 = board.nodes.find(x => x.versionOf === id && !x.tombstone); return { gone: !v2, orig: n.media === b.media && n.title === b.title, open: spotsOf(id)[0].spot.state }; }, [ids.img, before]);
  check(`[${tag}] Undo removes v2 only; the original stays and the pin opens again`, un.gone && un.orig && un.open === 'open', JSON.stringify(un));

  /* 5. the pin follows the card */
  await p.keyboard.press('Escape');
  const follow = await p.evaluate(id => { const n = byId(id); n.x += 160; n.y += 40; renderAll(); const r = spotBox(nodeEl(id)).getBoundingClientRect(), pr = qs(`[data-spot="${id}"]`).getBoundingClientRect(); return { fx: (pr.left - r.left) / r.width, fy: (pr.bottom - r.top) / r.height }; }, ids.img);
  check(`[${tag}] the pin keeps its spot when the card moves`, Math.abs(follow.fx - .4) < .03 && Math.abs(follow.fy - .8) < .03, JSON.stringify(follow));
  check(`[${tag}] a comment is never a relation: no edge was added by commenting`, await p.evaluate(e0 => board.edges.filter(e => !board.nodes.find(n => n.id === e.b)?.versionOf).length === e0, edges0));

  if (full && ids.proof) {
    /* 6. on a prototype of a decided direction: an objection with evidence and a fix; nothing changes until you choose */
    await frame(ids.proof);
    const pv = await p.evaluate(id => { const n = byId(id), d = byId(n.dir); return { ver: n.ver, adopted: board.adopted[d.idea], spec: JSON.stringify(n.spec), proofs: board.nodes.filter(x => x.type === 'proof' && !x.tombstone).length }; }, ids.proof);
    script.push({ kind: 'spot', text: { mode: 'object', text: 'The bar says something failed; this row says what. It is the last open check before Snapshot.', fix: 'Keep the words, fold them into one line under the bar.', basis: 'P1' } });
    await p.keyboard.press('c'); pt = await boxAt(ids.proof, .7, .85); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(200);
    await p.keyboard.type('Drop this red row. The bar already says something failed.'); await p.keyboard.press('Enter');
    await until(() => !!qs('.spot-fix'));
    const ob = await p.evaluate(([id, pv]) => { const n = byId(id), d = byId(n.dir); return { who: spotMsgs(id, 1).pop().who, fix: qs('.spot-fix')?.textContent, basis: qs('.spot-basis')?.textContent, btns: [...qsa('.spot-pop .spot-row button')].map(b => b.dataset.sp).join(','), same: board.adopted[d.idea] === pv.adopted && JSON.stringify(n.spec) === pv.spec && board.nodes.filter(x => x.type === 'proof' && !x.tombstone).length === pv.proofs }; }, [ids.proof, pv]);
    const oreq = requests.filter(r => r.kind === 'spot').pop();
    check('the crew is told the decision the prototype stands for and gets numbered cards to cite', /stands for a decision/.test(oreq?.flat || '') && /\[P1\]/.test(oreq?.flat || ''));
    check('an objection comes from Critic with the fix, the card it rests on, and Change it anyway / Try the fix (primary last)', ob.who === 'critic' && /fold them/.test(ob.fix || '') && /Rests on/.test(ob.basis || '') && ob.btns === 'anyway,fix', JSON.stringify(ob));
    check('nothing changed on its own: same decision, same prototype, no new version', ob.same, JSON.stringify(ob));
    await shot('4-objection');
    script.push({ kind: 'build', text: { title: 'Diegetic Faction Dispatch HUD', kicker: 'v-next', lede: 'Same page.', items: [{ title: 'Colour-blind players lose it in rain', body: 'One line under the bar.', tag: 'Failed' }], cta: 'Go' } });
    await p.click('[data-sp="fix"]');
    await until(() => !!qs('[data-sp="show"]'), null, 9000);
    const fx = await p.evaluate(([id, pv]) => { const n = byId(id), d = byId(n.dir), nv = board.nodes.find(x => x.type === 'proof' && x.fromSpot?.id === id && !x.tombstone); return { nv: !!nv, ver: nv?.ver, sketch: nv?.status === 'sketch', edge: nv && board.edges.some(e => e.a === id && e.b === nv.id), orig: JSON.stringify(n.spec) === pv.spec && n.ver === pv.ver, adopted: board.adopted[d.idea] === pv.adopted }; }, [ids.proof, pv]);
    const breq = requests.filter(r => r.kind === 'build').pop();
    check('Try the fix builds the next version beside it with the fix as the steer; the original and the decision stay', fx.nv && fx.ver === pv.ver + 1 && fx.sketch && fx.edge && fx.orig && fx.adopted && /fold them into one line/.test(breq?.flat || ''), JSON.stringify(fx));
    await p.keyboard.press('Escape');

    /* 7. an objection with no fix, or with evidence not on the board, is only an answer */
    script.push({ kind: 'spot', text: { mode: 'object', text: 'I would not do that.', fix: '', basis: 'P1' } });
    await p.keyboard.press('c'); pt = await boxAt(ids.proof, .3, .5); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(200);
    await p.keyboard.type('Make the title bigger.'); await p.keyboard.press('Enter');
    await until(id => spotMsgs(id, 2).length > 1, ids.proof);
    check('an objection without a fix is dropped to a plain answer, with nothing to choose', await p.evaluate(id => { const m = spotMsgs(id, 2).pop(); return m.mode === 'answer' && !qs('.spot-fix') && !qs('[data-sp="anyway"]'); }, ids.proof));
    await p.keyboard.press('Escape');

    /* 8. no model: the comment is kept, nothing is pretended */
    await p.evaluate(() => { apiCfg = { enabled: false, baseUrl: '', model: '', key: '' }; aiPref = 'api'; sampleFn = null; });
    await frame(ids.img); const n0 = await p.evaluate(() => board.nodes.length);
    await p.keyboard.press('c'); pt = await boxAt(ids.img, .7, .3); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(200);
    await p.keyboard.type('Is this sign readable?'); await p.keyboard.press('Enter');
    await until(id => !!spotsOf(id).find(m => m.spot.n === 2)?.spot.noAI, ids.img, 8000);
    const na = await p.evaluate(([id, n0]) => ({ noAI: !!spotsOf(id).find(m => m.spot.n === 2)?.spot.noAI, sys: qs('.spot-sys')?.textContent || '', replies: spotMsgs(id, 2).length, made: board.nodes.length === n0 }), [ids.img, n0]);
    check('with no model the comment stays, the popover says nobody answered, and nothing is made', na.noAI && /No AI answered/.test(na.sys) && na.replies === 1 && na.made, JSON.stringify(na));
    await p.keyboard.press('Escape');

    /* 9. only pictures take a comment for now */
    await p.keyboard.press('c');
    const other = await p.evaluate(() => { const n = board.nodes.find(x => x.type === 'idea' && x.status === 'ink'); cam = { s: 1, x: 500 - n.x, y: 300 - n.y }; paintCam(); const r = nodeEl(n.id).getBoundingClientRect(); return { x: r.left + 40, y: r.top + 40 }; });
    await p.mouse.click(other.x, other.y); await p.waitForTimeout(250);
    check('a click on a card that is not a picture opens no composer', await p.evaluate(() => $('spotPop').hidden));
    await p.keyboard.press('Escape');
    check('Esc leaves the Comment tool', await p.evaluate(() => tool === 'select'));
    check('the comments are in the card\'s thread, so the margin and search see them', await p.evaluate(id => (board.threads[id] || []).some(m => m.spot) && findSearchParts(byId(id)).join(' ').includes('Puddle'), ids.img));
  }
  check(`[${tag}] no page errors`, !errs.length, errs.join(' | '));
  await c.close();
}

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  try {
    await run(b, base, { theme: 'light', lang: 'en', full: true });
    for (const [theme, lang] of [['dark', 'zh'], ['light', 'zh'], ['dark', 'en']]) { script = []; await run(b, base, { theme, lang, full: false }); }
  } finally { await b.close(); srv.close(); }
  console.log(results.join('\n')); console.log(failures ? `\n${failures} failed` : `\nAll ${results.length} checks passed`); process.exit(failures ? 1 : 0);
})();

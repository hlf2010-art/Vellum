#!/usr/bin/env node
/* The 27 Nov design pass: one idea per surface, light only where something is alive.
 * The command palette (⌘K or "/", centred, Esc or a click outside puts it away, a ⌘K hint when closed), the selection
 * bar above two or more cards (Ask Copilot with one context chip, Make ▾ on the canvas), the thinking state (the
 * answering member breathes, one quiet status line, no caret), "/" commands in the Copilot input (Chinese too), the
 * sample's first view and gutters, card eyebrows (one word, in the interface language), Chinese across the chrome,
 * colour and light keeping to their jobs, the Copilot button in the top bar, and wires that face their target.
 *
 *   node tests/design-pass.cjs            (from the repo root)
 *   node tests/design-pass.cjs --headed   (watch it)
 *   SHOTS=dir node tests/design-pass.cjs  (also save screenshots)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const SHOTS = process.env.SHOTS || '';
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

/* a model that answers slowly, so the thinking state can be looked at */
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'GET' && req.url.startsWith('/Vellum-Lumen.html')) { rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(FILE).pipe(rsp); }
      if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
        let body = ''; req.on('data', c => body += c); req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          if (parsed.max_tokens === 1 && !parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: '.' } }] })); }
          const text = 'The pager reads faster because it sits where the eyes already are.';
          if (!parsed.stream) { rsp.writeHead(200, { 'Content-Type': 'application/json' }); return rsp.end(JSON.stringify({ choices: [{ message: { content: text } }] })); }
          rsp.writeHead(200, { 'Content-Type': 'text/event-stream' });
          setTimeout(() => {
            let k = 0; const t = setInterval(() => {
              if (k >= text.length) { clearInterval(t); return rsp.end('data: [DONE]\n\n'); }
              rsp.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text.slice(k, k + 8) } }] }) + '\n\n'); k += 8;
            }, 120);
          }, 1800);
        }); return;
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function open(browser, base, { theme = 'light', lang = 'en', motion = 'no-preference' } = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: motion, deviceScaleFactor: SHOTS ? 2 : 1 });
  await c.route('http://127.0.0.1:59631/**', r => r.abort());
  await c.route(/wikipedia\.org|wikimedia\.org|openrouter|googleapis/, r => r.abort());
  await c.addInitScript(l => { try { localStorage.setItem('vellum-lumen.v1.lang', JSON.stringify(l)); } catch { } }, lang);
  const p = await c.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2400);
  p.shot = async name => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  return p;
}
const grey = c => { const m = String(c).match(/[\d.]+/g); if (!m) return false; const [r, g, b] = m.map(Number); return Math.max(r, g, b) - Math.min(r, g, b) <= 14; };

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    /* 1. the command palette */
    {
      const p = await open(browser, base);
      const st = () => p.evaluate(() => { const l = $('line'), r = l.getBoundingClientRect(), h = document.querySelector('#line .pal-hint').getBoundingClientRect(); return { open: l.classList.contains('palette'), cx: r.left + r.width / 2, top: r.top, w: r.width, hint: h.width > 0 && h.height > 0, hintH: h.height, rows: [...document.querySelectorAll('#menu button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()), head: [...document.querySelectorAll('#menu .mh')].map(x => x.textContent.trim()), font: getComputedStyle(lineIn).fontFamily, focus: document.activeElement?.id }; });
      let s = await st();
      check('closed, there is only a small ⌘K hint at the bottom (no always-on command bar)', !s.open && s.hint && s.hintH <= 32, JSON.stringify(s));
      await p.keyboard.press('ControlOrMeta+k'); await p.waitForTimeout(300);
      s = await st();
      check('⌘K opens one field in the middle of the screen, focused', s.open && Math.abs(s.cx - 720) < 4 && s.top < 260 && s.w <= 642 && s.focus === 'lineInput', JSON.stringify(s));
      check('empty, it offers three common actions to start from', s.rows.length === 3 && /Suggestions/.test(s.head.join()), JSON.stringify(s));
      check('it uses the interface font, not a terminal face', !/mono/i.test(s.font), s.font);
      await p.shot('palette-empty-en-light');
      await p.keyboard.press('Escape'); await p.waitForTimeout(250);
      check('Esc puts it away', !(await st()).open);
      await p.mouse.click(700, 500); await p.waitForTimeout(150);
      await p.evaluate(() => select([])); await p.keyboard.press('/'); await p.waitForTimeout(300);
      s = await st();
      check('"/" on the canvas opens it with the command list', s.open && /^\//.test(await p.evaluate(() => lineIn.value)) && s.head.includes('Commands') && s.rows.length > 5, JSON.stringify(s));
      check('each command has an icon', await p.evaluate(() => [...document.querySelectorAll('#menu button')].every(b => !!b.querySelector('.pal-ic svg'))));
      await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
      check('↑↓ move the highlight', await p.evaluate(() => [...document.querySelectorAll('#menu button')].findIndex(b => b.getAttribute('aria-selected') === 'true')) === 2);
      await p.mouse.click(1300, 820); await p.waitForTimeout(250);
      check('a click outside puts it away', !(await st()).open);
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    /* 2. the selection bar */
    {
      const p = await open(browser, base);
      const ids = await p.evaluate(() => { const ns = board.nodes.filter(n => n.type === 'note' || n.type === 'idea').filter(n => n.status === 'ink').slice(0, 2); select(ns.map(n => n.id)); focusNodes(ns, 1, 0); renderAll(); return ns.map(n => n.id); });
      await p.waitForTimeout(700);
      const g = await p.evaluate(ids => { const bar = $('selbar'), br = bar.getBoundingClientRect(); const rs = ids.map(id => nodeEl(id).getBoundingClientRect()); const top = Math.min(...rs.map(r => r.top)); return { shown: !bar.hidden && br.width > 0, gap: top - br.bottom, ctrls: [...bar.querySelectorAll(':scope [data-s]')].filter(b => !b.closest('.sb-menu')).map(b => b.dataset.s), text: bar.innerText }; }, ids);
      check('two selected cards get a bar 8–12px above them', g.shown && g.gap >= 8 && g.gap <= 12, JSON.stringify(g));
      check('the bar has Ask Copilot with Make ▾, Relate, Group, Hide, Delete and ⋯, and no "2 Selected" label', JSON.stringify(g.ctrls) === JSON.stringify(['copilot', 'make', 'relate', 'group', 'hide', 'delete', 'more']) && !/selected/i.test(g.text), JSON.stringify(g));
      await p.click('#selbar [data-s="make"]'); await p.waitForTimeout(200);
      const make = await p.evaluate(() => [...document.querySelectorAll('#selbar [data-menu="make"] [data-s]')].map(b => b.dataset.s));
      check('Make ▾ offers synthesize, action list, kanban, tree map and critique', ['gather', 'list', 'kanban', 'treemap', 'critique'].every(k => make.includes(k)), make.join());
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      await p.evaluate(() => { cam.x -= 60; paintCam(); }); await p.waitForTimeout(200);
      const g2 = await p.evaluate(ids => { const br = $('selbar').getBoundingClientRect(); const rs = ids.map(id => nodeEl(id).getBoundingClientRect()); return Math.min(...rs.map(r => r.top)) - br.bottom; }, ids);
      check('it follows the selection when the board moves', g2 >= 8 && g2 <= 12, String(g2));
      await p.click('#selbar [data-s="copilot"]'); await p.waitForTimeout(500);
      const c = await p.evaluate(() => ({ open: copilotOpen, chips: [...document.querySelectorAll('#cpCompCards .cp-comp-chip')].map(x => x.textContent.trim()), focus: document.activeElement?.id, sent: (board.copilot || []).filter(m => m.role === 'user').length }));
      check('Ask Copilot opens the panel with one removable "2 cards" chip and the cursor in the input', c.open && c.chips.length === 1 && /^2 cards/.test(c.chips[0]) && c.focus === 'cpInput', JSON.stringify(c));
      await p.click('#cpCompCards [data-cp-unctx]'); await p.waitForTimeout(300);
      check('removing the chip takes the cards out of the context', await p.evaluate(() => sel.length === 0 && !document.querySelector('#cpCompCards .cp-comp-chip')));
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    /* 3. thinking: the answering member breathes, one status line, no caret */
    for (const theme of ['light', 'dark']) {
      const p = await open(browser, base, { theme });
      await p.evaluate(url => { apiCfg = { enabled: true, baseUrl: url + '/v1', model: 'smoke', key: 'smoke' }; renderCrew(); openCopilot(true); }, base);
      await p.waitForTimeout(400);
      await p.fill('#cpInput', 'Why does the pager read faster?'); await p.keyboard.press('Enter');
      await p.waitForTimeout(900);
      const t = await p.evaluate(() => { const m = [...document.querySelectorAll('#cpMsgs .cp-msg.ai')].pop(); if (!m) return null; const mk = m.querySelector('.cp-who .mk'); const cs = getComputedStyle(mk); const caret = m.querySelector('.cp-caret'); return { thinking: m.classList.contains('is-thinking'), anim: cs.animationName, dur: cs.animationDuration, status: m.querySelector('.cp-status')?.textContent.trim() || '', caret: !!caret && getComputedStyle(caret).display !== 'none' }; });
      check(`while it thinks (${theme}), the answering avatar breathes every 2.4s, with one quiet status line and no caret`, t && t.thinking && t.anim !== 'none' && t.dur === '2.4s' && t.status.length > 0 && !t.caret, JSON.stringify(t));
      if (theme === 'light') await p.shot('thinking-en-light');
      await p.waitForTimeout(3600);
      const done = await p.evaluate(() => { const m = [...document.querySelectorAll('#cpMsgs .cp-msg.ai')].pop(); return { thinking: m.classList.contains('is-thinking'), text: m.innerText }; });
      check(`once it answers (${theme}), the breathing stops`, !done.thinking && /eyes already are/.test(done.text), JSON.stringify(done));
      const av = await p.evaluate(() => ({ head: document.querySelector('.cp-head .mk svg')?.dataset.a, name: document.querySelector('.cp-titles b')?.textContent }));
      check(`the panel is called Copilot and has its own mark (${theme})`, av.head === 'copilot' && av.name === 'Copilot', JSON.stringify(av));
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }
    {
      const p = await open(browser, base, { motion: 'reduce' });
      check('with reduced motion, nothing breathes', await p.evaluate(() => { const d = document.createElement('div'); d.className = 'cp-msg ai is-thinking'; d.innerHTML = '<div class="cp-who"><span class="mk">' + AV.copilot + '</span></div>'; $('copilotPanel').hidden = false; $('copilotPanel').appendChild(d); const a = getComputedStyle(d.querySelector('.mk')).animationName; d.remove(); return a === 'none'; }));
      await p.context().close();
    }

    /* 4. "/" in the Copilot input, in Chinese too */
    {
      const p = await open(browser, base, { lang: 'zh' });
      await p.evaluate(() => openCopilot(true)); await p.waitForTimeout(400);
      await p.click('#cpInput'); await p.keyboard.type('/看');
      const r = await p.evaluate(() => { const pop = $('cpSlash'); return { shown: !!pop && !pop.hidden, rows: pop ? [...pop.querySelectorAll('button')].map(b => b.textContent) : [] }; });
      check('typing "/看板" style aliases in the Copilot input lists the matching command (/kanban), in Chinese', r.shown && r.rows.some(x => /\/kanban/.test(x) && /看板/.test(x)), JSON.stringify(r));
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      check('Esc closes the list and leaves the panel open', await p.evaluate(() => copilotOpen && $('cpSlash').hidden));
      await p.context().close();
    }

    /* 5. the sample: the first view and its gutters */
    for (const lang of ['en', 'zh']) {
      const p = await open(browser, base, { lang });
      await p.waitForTimeout(400);
      const f = await p.evaluate(() => { const bar = document.querySelector('header.top').getBoundingClientRect(); const fade = parseFloat(getComputedStyle(document.querySelector('.top'), '::before').height) || bar.height; const h2 = [...document.querySelectorAll('.bay-head h2')].map(h => h.getBoundingClientRect()).filter(r => r.right > 0 && r.left < innerWidth)[0]; return { bandBottom: bar.top + fade, title: h2 ? h2.top : -1, blur: getComputedStyle(document.querySelector('.top'), '::before').backdropFilter }; });
      check(`the first view puts the lane title clear of the top bar and its fade (${lang})`, f.title >= f.bandBottom && (f.blur === 'none' || !f.blur), JSON.stringify(f));
      const o = await p.evaluate(() => { const ns = visibleNodes().filter(n => !n.archived && n.type !== 'group'), bonded = new Set(board.edges.filter(e => isBonded(e)).flatMap(e => [e.a, e.b])); const R = ns.map(n => ({ n, r: nodeEl(n.id)?.getBoundingClientRect() })).filter(x => x.r && x.r.width); const bad = []; for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (bonded.has(a.n.id) && bonded.has(b.n.id)) continue; const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top); if (ox > 8 && oy > -24 * cam.s + 1) bad.push(`${titleOf(a.n)} / ${titleOf(b.n)} ${Math.round(oy / cam.s)}`); } return bad; });
      check(`no two sample cards overlap or sit closer than 24px (${lang})`, o.length === 0, o.slice(0, 5).join(' · '));
      await p.context().close();
    }

    /* 6. eyebrows and Chinese across the chrome */
    {
      const p = await open(browser, base, { lang: 'zh', theme: 'dark' });
      const eb = await p.evaluate(() => [...document.querySelectorAll('.card:not(.sketch) .card-k .eb')].map(e => ({ t: byId(e.closest('.card').dataset.id).type, w: e.textContent.trim(), kind: byId(e.closest('.card').dataset.id).kind || '' })));
      const builtIn = eb.filter(x => !(x.t === 'source' && x.kind && !/^(html|source|file)$/i.test(x.kind)));
      check('every card eyebrow is one word in Chinese (custom kinds you wrote stay as written)', builtIn.length > 8 && builtIn.every(x => /^[㐀-鿿]+$/.test(x.w)), JSON.stringify(builtIn.filter(x => !/^[㐀-鿿]+$/.test(x.w))));
      check('a format shows once: on the picture, never again in the eyebrow', await p.evaluate(() => [...document.querySelectorAll('.card .badge')].every(b => { const k = b.closest('.card').querySelector('.card-k')?.textContent || ''; const f = b.textContent.trim(); return !f || !k.includes(f); })));
      check('the zone is called 探索方向 and the card 方向, not the same words', await p.evaluate(() => [...document.querySelectorAll('.card.direction:not(.sketch) .pgname')].every(x => x.textContent === '方向')));
      /* zones are 1400 wide now, so bring the card on screen before right-clicking it */
      const r = await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'idea' && n.status === 'ink'); cam = { s: 1, x: 720 - (n.x + nodeW(n) / 2), y: 450 - (n.y + nodeH(n) / 2) }; paintCam(); renderAll(); const el = nodeEl(n.id); const b = el.getBoundingClientRect(); return { x: b.x + 60, y: b.y + 60 }; });
      await p.mouse.click(r.x, r.y, { button: 'right' }); await p.waitForTimeout(300);
      const menu = await p.evaluate(() => [...document.querySelectorAll('#cardMenu button')].map(b => b.textContent.trim()));
      check('the card menu speaks Chinese', menu.length > 5 && menu.every(t => /[㐀-鿿]/.test(t)), JSON.stringify(menu.filter(t => !/[㐀-鿿]/.test(t))));
      await p.keyboard.press('Escape');
      const tray = await p.evaluate(() => { dispatchCanvasActions([{ action: 'create', cardType: 'note', title: 'Note', text: '换一种折叠方式', status: 'sketch' }], { by: 'critic' }); renderAll(); renderBars(); return qs('#overlays .pbar')?.textContent.replace(/\s+/g, ' ') || ''; });
      check('the draft tray speaks Chinese', /丢弃/.test(tray) && /保留/.test(tray) && !/Discard|Keep|Retry|direction/.test(tray), tray);
      const tips = await p.evaluate(() => [...document.querySelectorAll('#topTools [data-tip], #map [title]')].map(e => e.dataset.tip || e.title).filter(t => /[A-Za-z]{3,}/.test(t.replace(/⌘|⇧|⌥|Space/g, '')) && !/[㐀-鿿]/.test(t)));
      check('tool tips speak Chinese', tips.length === 0, tips.join(' | '));
      check('an untitled board is 未命名画板', await p.evaluate(() => { const t = board.title; board.title = ''; renderAll(); const ok = $('projectName').textContent === '未命名画板'; board.title = t; renderAll(); return ok; }));
      await p.evaluate(() => openCopilot(true)); await p.waitForTimeout(400);
      const cp = await p.evaluate(() => ({ name: qs('.cp-titles b').textContent, attrs: [...document.querySelectorAll('#copilotPanel [title], #copilotPanel [aria-label]')].filter(e => !e.closest('.cp-msgs') && !e.matches('.cp-comp-chip, .cp-comp-chip .t')).map(e => e.title || e.getAttribute('aria-label')).filter(t => /[A-Za-z]{3,}/.test(t) && !/[㐀-鿿]|Copilot|ASHEN/.test(t)) }));
      check('the Copilot panel is "Copilot" and its controls speak Chinese', cp.name === 'Copilot' && cp.attrs.length === 0, JSON.stringify(cp));
      await p.shot('copilot-zh-dark');
      check('no page errors', p.errors.length === 0, p.errors.join(' | '));
      await p.context().close();
    }

    /* 7. colour and light keep to their jobs */
    for (const theme of ['light', 'dark']) {
      const p = await open(browser, base, { theme });
      const c = await p.evaluate(() => {
        const mks = [...document.querySelectorAll('#crewSetBtn .mk, .card .by-seal .mk, .card .by-group .mk')].slice(0, 6).map(m => getComputedStyle(m).color);
        const pr = document.querySelector('.card.print:not(.sel)'), sh = pr ? getComputedStyle(pr).boxShadow : '';
        const kb = [...document.querySelectorAll('.kb-col-h span:first-child')].map(s => getComputedStyle(s, '::before').backgroundColor);
        return { mks, prBlue: /rgba?\(\s*\d+,\s*\d+,\s*(1[5-9]\d|2\d\d)/.test(sh) && !/rgba?\(\s*(1[5-9]\d|2\d\d)/.test(sh), kb };
      });
      check(`crew avatars are white light, told apart by their signs, not tinted with the directions' colours (${theme})`, c.mks.length > 0 && c.mks.every(grey), JSON.stringify(c.mks));
      check(`a snapshot is finished, so it does not glow in its colour (${theme})`, !c.prBlue, JSON.stringify(c));
      check(`kanban columns are not coloured like directions (${theme})`, c.kb.length > 0 && c.kb.every(grey), JSON.stringify(c.kb));
      await p.evaluate(() => openCopilot(true)); await p.waitForTimeout(400); await p.click('#cpInput');
      const ring = await p.evaluate(() => getComputedStyle($('cpForm')).boxShadow);
      check(`focus is a thin line, not a warm halo (${theme})`, !/255, 1[6-9]\d, \d+/.test(ring) && !/\d+px \d+px 2\dpx/.test(ring), ring);
      const menuBg = await p.evaluate(() => { const n = board.nodes.find(n => n.type === 'idea'); openCardMenu(n, 300, 300); const cs = getComputedStyle($('cardMenu')); const r = [cs.backgroundColor, cs.backdropFilter]; closeCardMenu(); return r; });
      check(`menus are solid, so nothing shows through (${theme})`, !/rgba\([^)]*,\s*0?\.\d+\)/.test(menuBg[0]) && (menuBg[1] === 'none' || !menuBg[1]), JSON.stringify(menuBg));
      await p.context().close();
    }

    /* 8. the Copilot button sits in the top bar, not over cards */
    {
      const p = await open(browser, base);
      const b = await p.evaluate(() => { const btn = $('copilotBtn'), r = btn.getBoundingClientRect(), top = document.querySelector('header.top').getBoundingClientRect(); return { inTop: !!btn.closest('header.top'), within: r.top >= top.top && r.bottom <= top.bottom, label: btn.innerText.trim(), name: btn.getAttribute('aria-label'), tip: btn.title, w: r.width, h: r.height }; });
      check('the Copilot button is in the top bar, icon only, named by its tooltip and accessible name', b.inTop && b.within && b.label === '' && /Copilot/.test(b.name) && /Copilot · ⌘\./.test(b.tip) && Math.abs(b.w - b.h) < 1, JSON.stringify(b));
      await p.click('#copilotBtn'); await p.waitForTimeout(500);
      check('it opens the panel and shows that it is open', await p.evaluate(() => copilotOpen && $('copilotBtn').getAttribute('aria-expanded') === 'true'));
      check('the panel is solid', await p.evaluate(() => { const cs = getComputedStyle($('copilotPanel')); return !/rgba\([^)]*,\s*0?\.\d+\)/.test(cs.backgroundColor) && (cs.backdropFilter === 'none' || !cs.backdropFilter); }));
      check('the empty state does not repeat the board name', await p.evaluate(() => { const m = board.copilot; board.copilot = []; renderCopilot(); const ok = !document.querySelector('.cp-empty-board') && !!document.querySelector('.cp-empty h3'); board.copilot = m; renderCopilot(); return ok; }));
      await p.context().close();
    }

    /* 9. a wire leaves from the face that looks toward its target */
    {
      const p = await open(browser, base);
      const w = await p.evaluate(() => {
        const a = node('note', { text: 'Source', status: 'ink', by: 'you' }, { x: 900, y: 200 });
        const b = node('note', { text: 'Right', status: 'ink', by: 'you' }, { x: 1400, y: 200 });
        const c = node('note', { text: 'Lower left', status: 'ink', by: 'you' }, { x: 500, y: 700 });
        board.edges.push({ id: 'e1', a: a.id, b: b.id, kind: 'dep', line: true }, { id: 'e2', a: a.id, b: c.id, kind: 'dep', line: true });
        renderAll();
        const d = document.querySelector('#wires .w-hit[data-edge="e2"]').getAttribute('d'), x1 = +d.match(/^M([\d.-]+)/)[1];
        return { x1, left: a.x, right: a.x + nodeW(a) };
      });
      check('a second wire to a card down and to the left leaves from the left, not looping round from the right', Math.abs(w.x1 - w.left) < 2, JSON.stringify(w));
      await p.context().close();
    }
  } finally {
    await browser.close(); srv.close();
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

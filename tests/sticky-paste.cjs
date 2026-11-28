#!/usr/bin/env node
/* Pasting into a card you are writing in brings words, not formatting.
 * A rich paste (even text copied out of the same sticky) used to bring the source element along, with its
 * min-height and background, leaving a tall empty block under the last line.
 *
 *   node tests/sticky-paste.cjs            (from the repo root)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
    await ctx.route(/wikipedia\.org/, r => r.abort());
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(String(e).split('\n')[0]));
    await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);
    await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700);
    await p.evaluate(() => { cam = { x: 0, y: 0, s: 1 }; paintCam(); renderAll(); });
    await p.mouse.dblclick(500, 300); await p.waitForTimeout(450);
    const line = 'I wanna build an AI video editing & generation agent';
    for (let i = 0; i < 3; i++) { await p.keyboard.type(line); await p.keyboard.press('Enter'); }
    const h = () => p.evaluate(() => document.querySelector('.card.note.is-editing h4').offsetHeight);
    const before = await h();
    // copy everything out of the same sticky (a real rich copy), then paste it at the end
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.press('ControlOrMeta+C'); await p.evaluate(() => { const t = document.querySelector('.card.note.is-editing h4'), r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }); // caret to the end, same on every OS
    const clip = await p.evaluate(() => navigator.clipboard.read().then(async it => (await it[0].getType('text/html')).text()).catch(() => ''));
    check('the copy really is rich (carries the sticky box)', /min-height/.test(clip), clip.slice(0, 120));
    await p.keyboard.press('ControlOrMeta+V'); await p.waitForTimeout(200);
    const s = await p.evaluate(() => { const t = document.querySelector('.card.note.is-editing h4'); return { nested: t.querySelectorAll('[style],h4,[data-edit]').length, h: t.offsetHeight, lineH: parseFloat(getComputedStyle(t).lineHeight) }; });
    check('paste adds no styled or nested elements', s.nested === 0, JSON.stringify(s));
    check('the writing box grows by the pasted lines only, no empty block', s.h - before <= s.lineH * 8 + 2, JSON.stringify({ before, ...s }));
    await p.keyboard.press('ControlOrMeta+Enter'); await p.waitForTimeout(400);
    const text = await p.evaluate(() => board.nodes.find(n => n.type === 'note').text);
    check('the saved text has all six lines', text.split('\n').filter(l => l.trim() === line).length === 6, JSON.stringify(text));
    // a plain-text paste of several lines into a fresh sticky
    await p.evaluate(() => navigator.clipboard.writeText('one\r\ntwo\nthree'));
    await p.mouse.dblclick(900, 300); await p.waitForTimeout(450);
    await p.keyboard.press('ControlOrMeta+V'); await p.keyboard.press('ControlOrMeta+Enter'); await p.waitForTimeout(400);
    const t2 = await p.evaluate(() => board.nodes.filter(n => n.type === 'note').map(n => n.text));
    check('plain multi-line paste keeps its lines', t2.includes('one\ntwo\nthree'), JSON.stringify(t2));
    check('no page errors', errors.length === 0, errors.join(' | '));
  } finally { await browser.close(); srv.close(); }
  console.log(results.join('\n')); console.log(failures ? `\n${failures} failed` : '\nall passed'); process.exit(failures ? 1 : 0);
})();

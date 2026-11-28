#!/usr/bin/env node
/* Deleting a card: a plain question only when other cards were made from it, otherwise just delete with Undo.
 * Drives the real Vellum-Lumen.html in headless Chromium with real key presses and clicks.
 *
 *   node tests/delete-dialog.cjs            (from the repo root)
 *   node tests/delete-dialog.cjs --headed   (watch it)
 *   node tests/delete-dialog.cjs --shots DIR [--file other.html]   (also save light/dark screenshots of the sheet)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const argv = process.argv, arg = k => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : null; };
const FILE = path.resolve(arg('--file') || path.resolve(__dirname, '..', 'Vellum-Lumen.html'));
const SHOTS = arg('--shots');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

async function open(browser, base, { theme = 'light', scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: scale, colorScheme: theme });
  await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
  await ctx.route(/wikipedia\.org/, r => r.abort());
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e).split('\n')[0]));
  await p.goto(base + '/x.html'); await p.waitForTimeout(2200);
  await p.click('#projectBtn'); await p.waitForTimeout(300); await p.getByText('New board', { exact: true }).click(); await p.click('[data-tpl="blank"]'); await p.click('[data-tpl-go]'); await p.waitForTimeout(700);
  await p.evaluate(t => { document.documentElement.dataset.theme = t; cam = { x: 0, y: 0, s: 1 }; paintCam(); renderAll(); }, theme);
  return p;
}
/* A: the card to delete. B: a card made from A (derive) or only related to it (a relation you drew). */
const setup = (p, how) => p.evaluate(how => {
  checkpoint();
  const a = node('note', { text: 'Lantern should hang from a tent loop' }, { x: 260, y: 220 });
  const b = node('note', { text: 'Hook prototype v2' }, { x: 620, y: 240 });
  if (how === 'derive') edge(a.id, b.id, 'derive'); else makeRelation(a.id, b.id, { via: 'wire', rel: 'supports' });
  renderAll(); persist(); select([a.id]); document.activeElement?.blur?.();
  return { a: a.id, b: b.id };
}, how);
const st = (p, ids) => p.evaluate(ids => {
  const a = byId(ids.a), b = byId(ids.b);
  return {
    a: a ? { tomb: !!a.tombstone, hidden: !!a.hidden, text: a.text || '' } : null, b: b ? { tomb: !!b.tombstone } : null,
    edge: board.edges.some(e => e.a === ids.a && e.b === ids.b), open: dlg.open,
    toast: [...document.querySelectorAll('#toasts .toast:not(.out) span')].map(s => s.textContent).pop() || '',
    undo: JSON.stringify(undoStack),
  };
}, ids);

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !argv.includes('--headed') });
  try {
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      for (const theme of ['light', 'dark']) {
        const p = await open(browser, base, { theme, scale: 2 });
        await setup(p, 'derive');
        await p.keyboard.press('Delete'); await p.waitForTimeout(700);
        await p.screenshot({ path: path.join(SHOTS, `${theme}-delete-sheet.png`) });
        await p.context().close();
      }
      console.log('screenshots in ' + SHOTS);
      return;
    }
    // D1. a card that is only related to another (a line you drew): no question, deleted, Undo brings both back
    {
      const p = await open(browser, base);
      const ids = await setup(p, 'relation');
      await p.keyboard.press('Delete'); await p.waitForTimeout(600);
      let s = await st(p, ids);
      check('a card that is only related to another deletes with no dialog', !s.open && !s.a && s.b && !s.edge, JSON.stringify(s));
      check('the toast says what was deleted, by name', /^Deleted “Lantern should hang/.test(s.toast), s.toast);
      await p.click('#toasts .toast button'); await p.waitForTimeout(400);
      s = await st(p, ids);
      check('Undo brings back the card and its relation', s.a && !s.a.tomb && s.edge, JSON.stringify(s));
      check('no page errors (D1)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // D2. a card another card was made from: one plain question with Delete as the answer
    {
      const p = await open(browser, base);
      const ids = await setup(p, 'derive');
      await p.keyboard.press('Delete'); await p.waitForTimeout(600);
      const d = await p.evaluate(() => {
        const t = dlg.querySelector('.sh-id b'), txt = dlg.innerText;
        const btns = [...dlg.querySelectorAll('button')].map(b => (b.textContent || '').trim() || b.getAttribute('aria-label'));
        const chip = dlg.querySelector('.del-ref'), r = chip?.getBoundingClientRect();
        const go = dlg.querySelector('[data-imp="delete"]'), cs = go && getComputedStyle(go);
        return { open: dlg.open, title: t?.textContent, txt, btns, chipKind: chip?.querySelector('.del-kind')?.textContent, chipName: chip?.querySelector('.del-name')?.textContent,
          chipGap: chip ? chip.querySelector('.del-name').getBoundingClientRect().left - chip.querySelector('.del-kind').getBoundingClientRect().right : -1,
          chipH: r?.height, focused: document.activeElement === go, goBg: cs?.backgroundColor, dangerBg: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim(),
          width: dlg.getBoundingClientRect().width };
      });
      check('the dialog asks one question with the card name in quotes', d.open && d.title === 'Delete “Lantern should hang from a tent loop”?', JSON.stringify(d.title));
      check('it says in plain words what happens to the card made from it', /1 card was made from it\. It stays on the board, marked so you can review it\./.test(d.txt), d.txt);
      check('no engineering words (downstream, lineage, edges, snapshots, AI runs)', !/downstream|lineage|edges|snapshot|AI runs|scrub/i.test(d.txt), d.txt);
      check('the card made from it is a readable chip: kind, gap, name', d.chipKind === 'Sticky' && d.chipName === 'Hook prototype v2' && d.chipGap >= 4 && d.chipH >= 26, JSON.stringify(d));
      check('three choices only: Cover instead, Cancel, Delete (plus close)', JSON.stringify(d.btns) === JSON.stringify(['Close', 'Cover instead', 'Cancel', 'Delete']), JSON.stringify(d.btns));
      check('Delete is the focused, red primary button', d.focused && d.goBg !== 'rgba(0, 0, 0, 0)' && d.dangerBg, JSON.stringify(d));
      await p.keyboard.press('Enter'); await p.waitForTimeout(700);
      let s = await st(p, ids);
      check('Enter deletes: the card goes, the card made from it stays and keeps its link to a marker', !s.open && s.a?.tomb && s.b && !s.b.tomb && s.edge, JSON.stringify(s));
      check('the toast says the linked card is marked for review', /^Deleted “Lantern should hang.*” · linked cards marked for review$/.test(s.toast), s.toast);
      const flag = await p.evaluate(id => (document.querySelector(`.card[data-id="${id}"]`)?.innerText || ''), ids.b);
      check('the card made from it says its source needs review', /Review required/.test(flag), flag);
      await p.click('#toasts .toast button'); await p.waitForTimeout(400);
      s = await st(p, ids);
      check('Undo brings the deleted card back whole', s.a && !s.a.tomb && s.a.text === 'Lantern should hang from a tent loop' && s.edge, JSON.stringify(s));
      check('no page errors (D2)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
    // D3. Hide instead, and Cancel
    {
      const p = await open(browser, base);
      const ids = await setup(p, 'derive');
      await p.keyboard.press('Delete'); await p.waitForTimeout(500);
      await p.getByRole('button', { name: 'Cancel' }).click(); await p.waitForTimeout(300);
      let s = await st(p, ids);
      check('Cancel closes and changes nothing', !s.open && s.a && !s.a.tomb && !s.a.hidden && s.edge, JSON.stringify(s));
      await p.evaluate(id => select([id]), ids.a);
      await p.keyboard.press('Delete'); await p.waitForTimeout(500);
      await p.getByRole('button', { name: 'Cover instead' }).click(); await p.waitForTimeout(700);
      s = await st(p, ids);
      check('Cover instead covers the card and keeps its link', !s.open && s.a?.hidden && !s.a.tomb && s.edge, JSON.stringify(s));
      // D4. from Hidden & Archived, "Delete permanently" uses the same sheet, says it can't be undone, and scrubs
      await p.evaluate(() => archiveDialog()); await p.waitForTimeout(300);
      await p.click('[data-arch-del]'); await p.waitForTimeout(500);
      const d = await p.evaluate(() => ({ txt: dlg.innerText, btns: [...dlg.querySelectorAll('button')].map(b => (b.textContent || '').trim()) }));
      check('permanent delete: same sheet, says it cannot be undone, no Cover instead', /can't be undone/.test(d.txt) && d.btns.includes('Delete permanently') && !d.btns.includes('Cover instead'), JSON.stringify(d));
      await p.getByRole('button', { name: 'Delete permanently' }).click(); await p.waitForTimeout(700);
      s = await st(p, ids);
      check('permanent delete leaves a marker and scrubs the words from Undo', s.a?.tomb && !s.undo.includes('Lantern should hang'), s.undo.slice(Math.max(0,s.undo.indexOf('Lantern')-400), s.undo.indexOf('Lantern')+100));
      check('no page errors (D3/D4)', !p.errors.length, p.errors.join(' | '));
      await p.context().close();
    }
  } finally {
    await browser.close(); srv.close();
    if (!SHOTS) { console.log(results.join('\n')); console.log(failures ? `\n${failures} check(s) failed` : `\nall ${results.length} checks passed`); }
    process.exit(failures ? 1 : 0);
  }
})();

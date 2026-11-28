#!/usr/bin/env node
/* The participation switch sound: one kalimba tine per change the person makes, pitched by level
 * (Focus falls, Listening one note, Teamwork rises), about 0.8 s with a soft room tail. Sounds are on by default.
 *
 *   node tests/switch-sound.cjs            (from the repo root)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(__dirname, '..', 'Vellum-Lumen.html');
const results = []; let failures = 0;
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; }

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(FILE).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('http://127.0.0.1:59631/**', r => r.abort());
    await ctx.route('http://127.0.0.1:59639/**', r => r.abort());
    await ctx.route(/wikipedia\.org/, r => r.abort());
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(String(e).split('\n')[0]));
    await p.goto(base + '/Vellum-Lumen.html'); await p.waitForTimeout(2200);

    check('S1 sounds are on by default', await p.evaluate(() => sfxEnabled()));

    await p.evaluate(() => { window.__snd = []; const o = sfx; window.sfx = k => { __snd.push(k); return o(k); }; });
    await p.click('#partSw [data-part="often"]'); await p.waitForTimeout(200);
    await p.click('#partSw [data-part="often"]'); await p.waitForTimeout(200);
    await p.click('#partSw [data-part="never"]'); await p.waitForTimeout(200);
    const snd = await p.evaluate(() => __snd.filter(k => k.startsWith('speak-')));
    check('S2 one sound per change, pitched by level; none when nothing changes', JSON.stringify(snd) === '["speak-often","speak-never"]', JSON.stringify(snd));

    // S3: render each level offline: it rings for roughly 0.6-1.1 s and stays quiet next to the app's other sounds
    const r = await p.evaluate(async () => {
      const out = {};
      for (const k of ['speak-never', 'speak-matters', 'speak-often']) {
        const sr = 48000, ctx = new OfflineAudioContext(1, sr * 1.4, sr);
        _sfxCtx = ctx; _sfxBus = null; _sfxGain = null; _sfxNoise = null; for (const x in _sfxLast) delete _sfxLast[x];
        sfx(k); const d = (await ctx.startRendering()).getChannelData(0);
        let pk = 0, tail = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
        for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk * .01) tail = i / sr;
        out[k] = { pk: +pk.toFixed(4), tail: +tail.toFixed(2) };
      }
      return out;
    });
    check('S3 each level rings about 0.6-1.1 s', Object.values(r).every(x => x.tail >= .6 && x.tail <= 1.1), JSON.stringify(r));
    check('S4 quiet: peak under 0.05 at default volume', Object.values(r).every(x => x.pk > 0 && x.pk < .05), JSON.stringify(r));
    check('S5 no page errors', !errors.length, errors.join(' | '));
  } finally { await browser.close(); srv.close(); }
  console.log(results.join('\n')); console.log(failures ? `\n${failures} failed` : '\nall passed'); process.exit(failures ? 1 : 0);
})();

#!/usr/bin/env node
/* Builds the in-browser demo from Vellum-Lumen.html: dist/demo/ is a static site (Cloudflare Pages or any static host).
 *
 *   node tools/demo/build.mjs             a local build; a placeholder recording is allowed and says so on the page
 *   node tools/demo/build.mjs --release   what the host runs: fails unless demo/recording.json is a real recorded run
 *
 * What it does, in order:
 *  1. Turns demo mode on (window.VELLUM_DEMO) with the recorded crew run, the site link and any real media inlined as config.
 *  2. Leaves out what the demo never uses: the other samples' embedded media, and splits the fonts into their own files,
 *     so the page is a fraction of the app's size and Chinese glyphs load only when Chinese is on screen.
 *  3. Strips what should not ship: the crew's prompts, the code that calls models or local services, and their endpoints.
 *     Function bodies are replaced with stubs (the app already guards them in demo mode, so nothing reaches them).
 *  4. Minifies scripts and styles (no comments, no source maps) and checks the output for anything that should not be there.
 *
 * Front-end code in a browser can always be read. This keeps the demo to what it needs; it does not make it secret. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'Vellum-Lumen.html');
const DEMO_DIR = path.join(ROOT, 'demo');
const OUT = path.resolve(process.argv.find(a => a.startsWith('--out='))?.slice(6) || path.join(ROOT, 'dist', 'demo'));
const RELEASE = process.argv.includes('--release');
const cfg = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'config.json'), 'utf8'));

const log = (...a) => console.log('[demo]', ...a);
const fail = m => { console.error('[demo] ' + m); process.exit(1); };
const hash = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
const assets = new Map();
function asset(buf, ext) {
  const name = `assets/${hash(buf)}.${ext}`;
  if (!assets.has(name)) { fs.writeFileSync(path.join(OUT, name), buf); assets.set(name, buf.length); }
  return name;
}

let html = fs.readFileSync(SRC, 'utf8');
const srcBytes = Buffer.byteLength(html);

/* 1. the recording and media */
const recPath = path.join(DEMO_DIR, 'recording.json');
const recording = fs.existsSync(recPath) ? JSON.parse(fs.readFileSync(recPath, 'utf8')) : null;
if (!recording) { if (RELEASE) fail('demo/recording.json is missing: record a real run first (tools/demo/record-run.cjs)'); log('no recording: the crew will fall back to built-in rules'); }
else if (recording.real !== true) { if (RELEASE) fail('demo/recording.json is a placeholder (real !== true); record a real run before release'); log('placeholder recording (not a real run): fine for a local build only'); }
const media = {};
for (const [key, file] of Object.entries(cfg.media || {})) {
  const p = path.join(DEMO_DIR, 'media', file);
  if (fs.existsSync(p)) { media[key] = asset(fs.readFileSync(p), path.extname(p).slice(1)); log(`media ${key} ← ${file}`); }
}
const demoCfg = { recording, site: cfg.site || '', terms: 'terms.html', media };

/* 2. embedded media the demo never shows, and fonts as files */
html = html.replace(/window\.VELLUM_MEDIA=\{[^}]*\};?/, 'window.VELLUM_MEDIA={};');
html = html.replace(/url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g, (_, b64) => `url(${asset(Buffer.from(b64, 'base64'), 'woff2')})`);
const leftData = [...html.matchAll(/data:(image|video|audio)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{20000,}/g)].length;
if (leftData) log(`note: ${leftData} large data URI(s) remain inline`);

/* 3. strip prompts, model calls and endpoints */
const STUBS = new Map(Object.entries(cfg.strip.functions));
const STUB_BODY = { throw: '{throw new Error("demo")}', false: '{return false}', null: '{return null}' };
const PROMPT = /\b(You are|you are a|Reply with|Reply in|Return only|Return one|Return a JSON|JSON object|Rules:|Do not|Don't|Never |Write one|Write a |Answer only|Answer in|Your previous answer|the designer|designer's)\b/;
const KEEP = new Set(cfg.strip.keepInside || []);   /* UI text that happens to read like a prompt */
const isPrompt = s => s.length >= cfg.strip.minPromptLength && PROMPT.test(s) && !/^\s*</.test(s);
const ENDPOINTS = cfg.strip.endpoints.map(e => new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
let stubbed = 0, emptied = 0;
const stubbedNames = [];
function stripScript(code) {
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });
  const edits = [];
  walk.full(ast, n => {
    if ((n.type === 'FunctionDeclaration' && STUBS.has(n.id?.name))) {
      edits.push([n.body.start, n.body.end, STUB_BODY[STUBS.get(n.id.name)] || STUB_BODY.throw]); stubbed++; stubbedNames.push(n.id.name);
    }
  });
  walk.ancestor(ast, {
    Literal(n, anc) { if (typeof n.value === 'string' && isPrompt(n.value) && !insideStub(anc)) { edits.push([n.start, n.end, '""']); emptied++; } },
    TemplateLiteral(n, anc) {
      if (anc.at(-2)?.type === 'TaggedTemplateExpression' || insideStub(anc)) return;
      const s = n.quasis.map(q => q.value.cooked ?? q.value.raw).join('');
      if (isPrompt(s)) { edits.push([n.start, n.end, '""']); emptied++; }
    },
  });
  function insideStub(anc) { return anc.some(a => (a.type === 'FunctionDeclaration' && (STUBS.has(a.id?.name) || KEEP.has(a.id?.name))) || (a.type === 'VariableDeclarator' && KEEP.has(a.id?.name))); }
  /* outermost edits win: drop any edit inside another one */
  edits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const keep = []; let end = -1;
  for (const e of edits) { if (e[0] >= end) { keep.push(e); end = e[1]; } }
  let out = code;
  for (const [s, e, r] of keep.reverse()) out = out.slice(0, s) + r + out.slice(e);
  for (const re of ENDPOINTS) out = out.replace(re, '');
  return out;
}

const scripts = [];
html = html.replace(/<script>([\s\S]*?)<\/script>/g, (_, code) => { scripts.push(code); return `<script>\u0000${scripts.length - 1}\u0000</script>`; });
const styles = [];
html = html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (_, attrs, css) => { styles.push(css); return `<style${attrs}>\u0000${styles.length - 1}\u0000</style>`; });

const outScripts = [];
for (const code of scripts) {
  const stripped = stripScript(code);
  const min = await esbuild.transform(stripped, { loader: 'js', minify: true, legalComments: 'none', target: 'es2020', charset: 'utf8' });
  outScripts.push(min.code.replace(/<\/script/gi, '<\\/script'));
}
const outStyles = [];
for (const css of styles) {
  const min = await esbuild.transform(css, { loader: 'css', minify: true, legalComments: 'none', charset: 'utf8' });
  outStyles.push(min.code.replace(/<\/style/gi, '<\\/style'));
}
html = html.replace(/<script>\u0000(\d+)\u0000<\/script>/g, (_, i) => `<script>${outScripts[+i]}</script>`);
html = html.replace(/<style([^>]*)>\u0000(\d+)\u0000<\/style>/g, (_, attrs, i) => `<style${attrs}>${outStyles[+i]}</style>`);
html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
const cfgJson = JSON.stringify(demoCfg).replace(/</g, '\\u003c');
html = html.replace('<script>', `<script>window.VELLUM_DEMO=${cfgJson};</script><script>`);
html = html.replace(/<title>[^<]*<\/title>/, `<title>${cfg.title}</title>`);
if (!/<meta name="description"/.test(html)) html = html.replace('</title>', `</title><meta name="description" content="${cfg.description}">`);

/* 4. what must not ship */
const LEAKS = [/127\.0\.0\.1:596/, /chat\/completions/, /https:\/\/api\.openai\.com\/v1/, /openrouter\.ai\/api/, /You are (Vellum|the|a )/, /Bearer "\s*\+\s*(apiCfg|cfg)\.key/, /sourceMappingURL/];
const leaks = LEAKS.filter(re => re.test(html)).map(String);
if (leaks.length) { const m = 'the build still contains: ' + leaks.join(', '); if (RELEASE) fail(m); log('WARNING ' + m); }

fs.writeFileSync(path.join(OUT, 'index.html'), html);
for (const f of ['terms.html', '_headers', 'robots.txt']) { const p = path.join(DEMO_DIR, 'site', f); if (fs.existsSync(p)) fs.copyFileSync(p, path.join(OUT, f)); }

const gz = b => (b ? import('node:zlib').then(z => z.gzipSync(b, { level: 9 }).length) : 0);
const pageGz = await gz(Buffer.from(html));
let assetBytes = 0; for (const v of assets.values()) assetBytes += v;
log(`stubbed ${stubbed} functions, emptied ${emptied} prompt strings`);
log(`source ${(srcBytes / 1e6).toFixed(2)} MB → page ${(Buffer.byteLength(html) / 1e6).toFixed(2)} MB (${(pageGz / 1e3).toFixed(0)} kB gzipped), ${assets.size} asset files ${(assetBytes / 1e6).toFixed(2)} MB`);
const missing = [...STUBS.keys()].filter(f => !stubbedNames.includes(f));
if (missing.length) log('note: not found (renamed?): ' + missing.join(', '));
log('wrote ' + path.relative(ROOT, OUT));

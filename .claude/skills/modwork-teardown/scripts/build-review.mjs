// Build from a saved Mod Work viewport response. All inputs are local and read-only.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const [repo, input, output, ...extra] = process.argv.slice(2);
if (!output || extra.length || path.extname(output).toLowerCase() !== '.html') {
  console.error('Usage: node build-review.mjs <mod-work-repo> <viewport.json> <new-review.html>');
  process.exit(2);
}
const studio = path.resolve(repo, 'fit-studio');
const assets = fileURLToPath(new URL('../assets/', import.meta.url));
const requireStudio = createRequire(path.join(studio, 'package.json'));
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]));

function floatCount(field) {
  if (Array.isArray(field)) return field.length;
  if (typeof field?.__f32 !== 'string') return 0;
  return Buffer.from(field.__f32, 'base64').length / 4;
}

function floatValues(field) {
  if (Array.isArray(field)) return field;
  const bytes = Buffer.from(field.__f32, 'base64');
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
}

// Only locate a vertex if its own measurement corroborates this gear's reported minimum.
// Surface samples, parameter estimates and vertex clusters have different identities.
function locateMeasuredVertex(gear, fit) {
  if (!(fit?.embedded > 0 && fit.minSignedMm < 0) || !gear.signedMm || !gear.hitMm ||
      !Number.isFinite(fit.thresholds?.guardHitUnits)) return null;
  const signed = floatValues(gear.signedMm);
  const hit = floatValues(gear.hitMm);
  const pos = floatValues(gear.fitted);
  let closest = null;
  for (let i = 0; i < signed.length; i++) {
    if (!Number.isFinite(signed[i]) || !Number.isFinite(hit[i]) || hit[i] < 0 ||
        hit[i] >= 10 * fit.thresholds.guardHitUnits) continue;
    if (closest === null || signed[i] < signed[closest]) closest = i;
  }
  if (closest === null || Math.abs(signed[closest] - fit.minSignedMm) > 0.001) return null;
  return Array.from(pos.slice(3 * closest, 3 * closest + 3));
}

// Compare two indexed sides of an edge only when both endpoints coincide in the source.
function maximumSeamGapMm(gear) {
  const rest = floatValues(gear.rest);
  const fitted = floatValues(gear.fitted);
  const idsByPosition = new Map();
  const canonical = [];
  for (let i = 0; i < rest.length; i += 3) {
    const position = [rest[i], rest[i + 1], rest[i + 2]].join(',');
    if (!idsByPosition.has(position)) idsByPosition.set(position, idsByPosition.size);
    canonical.push(idsByPosition.get(position));
  }
  const sides = new Map();
  for (let i = 0; i < gear.indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      let a = gear.indices[i + k], b = gear.indices[i + (k + 1) % 3];
      if (canonical[a] === canonical[b]) continue;
      if (canonical[a] > canonical[b]) [a, b] = [b, a];
      const edge = canonical[a] + ':' + canonical[b];
      if (!sides.has(edge)) sides.set(edge, []);
      sides.get(edge).push([a, b]);
    }
  }
  function offset(a,b) {
    return Math.hypot(...[0,1,2].map(axis => fitted[3*a+axis] - fitted[3*b+axis]));
  }
  let max = 0;
  for (const pair of sides.values()) {
    if (pair.length !== 2) continue;
    const [[a,b],[c,d]] = pair;
    max = Math.max(max, offset(a,c), offset(b,d));
  }
  return max * 10;
}

function checkMesh(positions, normals, indices, label) {
  const floats = floatCount(positions);
  const count = floats / 3;
  if (!count || !Number.isInteger(count) || floatCount(normals) !== floats ||
      !Array.isArray(indices) || !indices.length || indices.length % 3 ||
      indices.some(i => !Number.isInteger(i) || i < 0 || i >= count || i > 65535)) {
    throw new Error(label + ' 几何或索引不适用于当前 FitViewport。请使用 /api/viewport/mesh 的已保存响应。');
  }
  if (![positions, normals].every(field => floatValues(field).every(Number.isFinite))) {
    throw new Error(label + ' 包含无效的顶点或法线。');
  }
  return count;
}

function snapshot(raw) {
  const data = JSON.parse(raw);
  const gears = data.gears ?? (data.shorts ? [data.shorts] : []);
  if (!Array.isArray(gears) || !gears.length) throw new Error('没有护具网格。仅有报告时请按证据说明流程处理。');
  if (!Array.isArray(data.center) || data.center.length !== 3 || !data.center.every(Number.isFinite) ||
      !Number.isFinite(data.radius) || data.radius <= 0) throw new Error('缺少有效的取景中心或半径。');
  const body = pick(data.body, ['positions','normals','indices']);
  const bodyVertices = checkMesh(body.positions, body.normals, body.indices, '身体');
  body.groups = (data.body.groups ?? []).map(g => pick(g, ['material','start','count']));
  const seen = new Set();
  const items = gears.map(g => {
    if (!g?.id || seen.has(g.id)) throw new Error('每件护具需要唯一的 id。');
    seen.add(g.id);
    const count = checkMesh(g.fitted, g.fittedNormals, g.indices, g.id);
    if (checkMesh(g.rest, g.restNormals, g.indices, g.id) !== count ||
        floatCount(g.colors) !== 3 * count || !Array.isArray(g.wires) ||
        g.wires.length % 2 || g.wires.some(i => !Number.isInteger(i) || i < 0 || i >= count || i > 65535)) {
      throw new Error(g.id + ' 的两态顶点、颜色或边索引不匹配。');
    }
    for (const [field, length] of [['hitMm', count], ['signedMm', count], ['restColors', 3 * count]]) {
      if (g[field] != null && floatCount(g[field]) !== length) throw new Error(g.id + ' 的 ' + field + ' 与顶点数不匹配。');
    }
    const item = pick(g, ['id','rest','restNormals','fitted','fittedNormals','indices','wires','colors','restColors','fitSource','signedMm','hitMm']);
    item.vertices = count;
    if (data.part === 'head' && g.id.startsWith('headband') && g.fitSource === 'baked') {
      item.maxSeamGapMm = maximumSeamGapMm(g);
    }
    const fit = g.fit ?? (gears.length === 1 ? data.fit : null);
    if (fit) {
      item.focusVertex = locateMeasuredVertex(g, fit);
      item.fit = pick(fit, ['level','reason','checked','embedded','minSignedMm','heatSource','calibrated']);
      if (fit.surface) item.fit.surface = pick(fit.surface, ['inside','checked']);
    }
    return item;
  });
  // Older captures start with the player ID; newer captures prefix it with a root identity.
  const cacheParts = String(data.debugCacheKey ?? '').split('::');
  const player = [data.playerId, cacheParts[1], cacheParts[0]].find(id => typeof id === 'string' && /^png[0-9]+$/i.test(id));
  return {player:player ?? null, ...pick(data,['center','radius','part','label','gearLabel']), body, bodyVertices, gears:items,
    source:path.basename(input), sha256:createHash('sha256').update(raw).digest('hex')};
}

async function main() {
  const mesh = snapshot(await fs.readFile(input));
  const logo = await fs.readFile(path.join(studio,'src/assets/logo-mark.svg'));
  mesh.logo = 'data:image/svg+xml;base64,' + logo.toString('base64');
  const esbuild = requireStudio('esbuild');
  const {outputFiles} = await esbuild.build({
    entryPoints:[path.join(assets,'review.jsx')], bundle:true, write:false, outfile:'review.js', format:'iife',
    minify:true, jsx:'automatic', target:'es2021', define:{'process.env.NODE_ENV':'"production"'},
    nodePaths:[path.join(studio,'node_modules')], alias:{'modwork-viewport':path.join(studio,'src/FitViewport.jsx')},
    plugins:[{name:'snapshot-input',setup(build) {
      build.onResolve({filter:/^\.\/api\.js$/}, args =>
        args.importer === path.join(studio,'src/FitViewport.jsx') ? {path:path.join(assets,'snapshot-api.js')} : undefined);
    }}]
  });
  const script = outputFiles.find(f=>f.path.endsWith('.js')).text.replace(/<\/script/gi,'<\\/script');
  const css = (outputFiles.find(f=>f.path.endsWith('.css'))?.text || '') + await fs.readFile(path.join(assets,'review.css'),'utf8');
  const payload = JSON.stringify(mesh).replace(/</g,'\\u003c');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Mod Work · 贴合复查</title><style>${css}</style><main id="app"></main><script type="application/json" id="snapshot">${payload}</script><script>${script}</script></html>`;
  await fs.writeFile(output,html,{flag:'wx'});
  console.log(path.resolve(output));
}
main().catch(e => {console.error(e.message); process.exitCode = 1;});

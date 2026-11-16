/**
 * 本地确定性 observation(+palette) 字段 diff
 * 供对比打分 / feedback / experiments 共用
 */

export const OBSERVATION_DIFF_SCHEMA_VERSION = 1;
/** RGB 欧氏距离阈值（0–255 通道）；超过视为 palette mismatch */
export const PALETTE_RGB_DISTANCE_MAX = 48;

const PALETTE_ROLES = ["bg", "hero", "skin", "skin_lo", "skin_hi", "accent", "text", "secondary", "mute", "rim", "glow"];

/**
 * @param {unknown} targetObs
 * @param {unknown} regenObs
 * @param {{ targetPalette?: string, regenPalette?: string, pipelineVersion?: string, scoredAt?: string }} [opts]
 */
export function diffObservation(targetObs, regenObs, opts = {}) {
  const target = targetObs && typeof targetObs === "object" ? targetObs : {};
  const regen = regenObs && typeof regenObs === "object" ? regenObs : {};
  /** @type {object[]} */
  const fields = [];

  pushEnum(fields, "render_family", target.render_family, regen.render_family, "medium");
  pushEnum(fields, "capture_style", target.capture_style, regen.capture_style, "medium");

  pushEnum(
    fields,
    "camera.angle",
    nested(target.camera, "angle"),
    nested(regen.camera, "angle"),
    "camera"
  );
  pushEnum(
    fields,
    "lighting.pattern",
    nested(target.lighting, "pattern"),
    nested(regen.lighting, "pattern"),
    "lighting"
  );
  pushEnum(
    fields,
    "lighting.exposure",
    nested(target.lighting, "exposure"),
    nested(regen.lighting, "exposure"),
    "lighting"
  );
  pushEnum(
    fields,
    "lighting.key_side",
    nested(target.lighting, "key_side"),
    nested(regen.lighting, "key_side"),
    "lighting"
  );
  pushEnum(fields, "fx.family", normalizeFx(nested(target.fx, "family")), normalizeFx(nested(regen.fx, "family")), "fx");

  diffSubjects(fields, asArray(target.subjects), asArray(regen.subjects));
  diffPalettes(fields, opts.targetPalette, opts.regenPalette);

  let matched = 0;
  let compared = 0;
  for (const f of fields) {
    if (f.path.startsWith("palette.")) continue;
    if (f.status === "skipped") continue;
    compared += 1;
    if (f.status === "match") matched += 1;
  }

  const tagSet = new Set();
  for (const f of fields) {
    if (f.status === "match" || f.status === "skipped") continue;
    if (f.path === "render_family" || f.path === "capture_style") tagSet.add("medium");
    else if (f.path.startsWith("camera.")) tagSet.add("camera");
    else if (f.path.startsWith("lighting.")) tagSet.add("lighting");
    else if (f.path.startsWith("fx.")) tagSet.add("fx");
    else if (f.path.startsWith("subjects.")) {
      tagSet.add("subject");
      if (f.path.endsWith(".placement")) tagSet.add("layout");
    } else if (f.path.startsWith("palette.")) tagSet.add("palette");
  }

  return {
    schemaVersion: OBSERVATION_DIFF_SCHEMA_VERSION,
    pipelineVersion: String(opts.pipelineVersion || ""),
    scoredAt: String(opts.scoredAt || new Date().toISOString()),
    overall: {
      matched,
      compared,
      score: compared ? matched / compared : 1,
    },
    fields,
    summaryTags: [...tagSet],
  };
}

function nested(obj, key) {
  if (!obj || typeof obj !== "object") return null;
  return obj[key] ?? null;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/** null / none → 统一哨兵 */
function normalizeFx(v) {
  if (v == null || v === "" || v === "none") return "__none__";
  return String(v);
}

function pushEnum(fields, path, target, regen, _tagHint) {
  const tMissing = target == null || target === "";
  const rMissing = regen == null || regen === "";
  if (tMissing && rMissing) {
    fields.push({ path, status: "match", target: null, regen: null, score: 1 });
    return;
  }
  if (tMissing) {
    fields.push({ path, status: "missing_target", target: null, regen, score: 0 });
    return;
  }
  if (rMissing) {
    fields.push({ path, status: "missing_regen", target, regen: null, score: 0 });
    return;
  }
  const ok = String(target) === String(regen);
  fields.push({
    path,
    status: ok ? "match" : "mismatch",
    target,
    regen,
    score: ok ? 1 : 0,
  });
}

function diffSubjects(fields, targetSubs, regenSubs) {
  const tMap = new Map();
  const rMap = new Map();
  for (const s of targetSubs) {
    const id = String(s?.id || "").trim();
    if (id) tMap.set(id, s);
  }
  for (const s of regenSubs) {
    const id = String(s?.id || "").trim();
    if (id) rMap.set(id, s);
  }
  const ids = new Set([...tMap.keys(), ...rMap.keys()]);
  for (const id of ids) {
    const t = tMap.get(id);
    const r = rMap.get(id);
    for (const key of ["placement", "facing", "wardrobe"]) {
      const path = `subjects.${id}.${key}`;
      if (!t) {
        fields.push({ path, status: "missing_target", target: null, regen: r?.[key] ?? null, score: 0 });
        continue;
      }
      if (!r) {
        fields.push({ path, status: "missing_regen", target: t?.[key] ?? null, regen: null, score: 0 });
        continue;
      }
      const tv = normText(t[key]);
      const rv = normText(r[key]);
      if (!tv && !rv) {
        fields.push({ path, status: "match", target: tv, regen: rv, score: 1 });
      } else if (!tv) {
        fields.push({ path, status: "missing_target", target: null, regen: rv, score: 0 });
      } else if (!rv) {
        fields.push({ path, status: "missing_regen", target: tv, regen: null, score: 0 });
      } else {
        const ok = tv === rv;
        fields.push({ path, status: ok ? "match" : "mismatch", target: tv, regen: rv, score: ok ? 1 : 0 });
      }
    }
  }
}

function normText(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parsePalette(text) {
  const raw = String(text || "").trim();
  if (!raw) return new Map();
  const out = new Map();
  const re =
    /\b(skin_hi|skin_lo|bg|hero|skin|accent|text|secondary|mute|rim|glow)\b\s*[:=|\-]?\s*(#?[0-9A-Fa-f]{6})\b/gi;
  let m;
  while ((m = re.exec(raw))) {
    const role = m[1].toLowerCase();
    let hex = m[2].toUpperCase();
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (!out.has(role)) out.set(role, hex);
  }
  return out;
}

function hexToRgb(hex) {
  const n = String(hex || "").replace("#", "");
  if (!/^[0-9A-F]{6}$/i.test(n)) return null;
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function rgbDistance(a, b) {
  const d = Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  return d;
}

function diffPalettes(fields, targetPalette, regenPalette) {
  const tMap = parsePalette(targetPalette);
  const rMap = parsePalette(regenPalette);
  const roles = new Set([...PALETTE_ROLES.filter((r) => tMap.has(r) || rMap.has(r))]);
  // 若两侧皆空，不产出 palette 字段
  if (!roles.size) return;
  for (const role of roles) {
    const path = `palette.${role}`;
    const th = tMap.get(role);
    const rh = rMap.get(role);
    if (!th && !rh) continue;
    if (!th) {
      fields.push({ path, status: "missing_target", target: null, regen: rh, score: 0 });
      continue;
    }
    if (!rh) {
      fields.push({ path, status: "missing_regen", target: th, regen: null, score: 0 });
      continue;
    }
    const tr = hexToRgb(th);
    const rr = hexToRgb(rh);
    if (!tr || !rr) {
      fields.push({ path, status: "mismatch", target: th, regen: rh, score: 0 });
      continue;
    }
    const dist = rgbDistance(tr, rr);
    const score = Math.max(0, 1 - dist / (PALETTE_RGB_DISTANCE_MAX * 2));
    const ok = dist <= PALETTE_RGB_DISTANCE_MAX;
    fields.push({
      path,
      status: ok ? "match" : "mismatch",
      target: th,
      regen: rh,
      score: ok ? Math.max(score, 0.5) : score,
    });
  }
}

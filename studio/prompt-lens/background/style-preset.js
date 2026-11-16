/**
 * Style Preset — 从 observation + pack 聚合出结构化风格预设。
 *
 * 对应产品方向：参考图 → 结构化风格预设 → 可复制 prompt。
 * 不依赖 chrome API，不触发网络，纯函数。
 */

export const STYLE_PRESET_VERSION = 1;

export const DEFAULT_STYLE_PRESET = Object.freeze({
  version: STYLE_PRESET_VERSION,
  name: "",
  tags: [],
  style: {
    color: {
      climate: "",
      roles: [],
      description: "",
    },
    light: {
      pattern: "",
      exposure: "",
      key_side: "",
      source: "",
      quality: "",
      climate: "",
    },
    lens: {
      angle: "",
      vantage: "",
      lens_feel: "",
    },
    material: {
      render_family: "",
      capture_style: "",
      content_type: "",
      presentation: "",
      finish: "",
      finish_technique: "",
      fx: "",
    },
    composition: {
      primary_mass: "",
      anchor: "",
      negative_space: "",
      depth_stack: [],
    },
  },
  slots: [],
});

const SLOT_TARGETS = new Set([
  "elements.primary.name",
  "layout",
  "positive",
  "camera",
  "style",
  "negative",
  "palette",
]);

const SLOT_TYPES = new Set(["text", "textarea", "select"]);

function str(v, max = 200) {
  return String(v || "").trim().slice(0, max);
}

function strArr(v, max = 24, limit = 20) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x || "").trim().slice(0, max))
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * 宽松清洗 slots。
 * @param {unknown} raw
 */
export function sanitizeSlots(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const id = str(item.id, 64);
    const label = str(item.label, 80);
    if (!id) continue;
    if (item.target && !SLOT_TARGETS.has(item.target)) continue;
    out.push({
      id,
      label: label || id,
      type: SLOT_TYPES.has(item.type) ? item.type : "text",
      required: Boolean(item.required),
      default: str(item.default, 500),
      target: SLOT_TARGETS.has(item.target) ? item.target : "positive",
      options: strArr(item.options, 80, 20),
    });
  }
  return out.slice(0, 20);
}

/**
 * 宽松清洗 stylePreset。
 * @param {unknown} raw
 */
export function sanitizeStylePreset(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw;
  const style = src.style && typeof src.style === "object" && !Array.isArray(src.style) ? src.style : {};
  const color = style.color && typeof style.color === "object" && !Array.isArray(style.color) ? style.color : {};
  const light = style.light && typeof style.light === "object" && !Array.isArray(style.light) ? style.light : {};
  const lens = style.lens && typeof style.lens === "object" && !Array.isArray(style.lens) ? style.lens : {};
  const material = style.material && typeof style.material === "object" && !Array.isArray(style.material) ? style.material : {};
  const composition = style.composition && typeof style.composition === "object" && !Array.isArray(style.composition) ? style.composition : {};

  return {
    version: Number.isInteger(Number(src.version)) ? Number(src.version) : STYLE_PRESET_VERSION,
    name: str(src.name, 80),
    tags: strArr(src.tags, 24, 8),
    style: {
      color: {
        climate: str(color.climate, 40),
        roles: strArr(color.roles, 40, 12),
        description: str(color.description, 200),
      },
      light: {
        pattern: str(light.pattern, 40),
        exposure: str(light.exposure, 40),
        key_side: str(light.key_side, 40),
        source: str(light.source, 40),
        quality: str(light.quality, 40),
        climate: str(light.climate, 40),
      },
      lens: {
        angle: str(lens.angle, 40),
        vantage: str(lens.vantage, 40),
        lens_feel: str(lens.lens_feel, 40),
      },
      material: {
        render_family: str(material.render_family, 40),
        capture_style: str(material.capture_style, 40),
        content_type: str(material.content_type, 40),
        presentation: str(material.presentation, 40),
        finish: str(material.finish, 200),
        finish_technique: str(material.finish_technique, 40),
        fx: str(material.fx, 40),
      },
      composition: {
        primary_mass: str(composition.primary_mass, 40),
        anchor: str(composition.anchor, 40),
        negative_space: str(composition.negative_space, 40),
        depth_stack: strArr(composition.depth_stack, 40, 10),
      },
    },
    slots: sanitizeSlots(src.slots),
  };
}

/**
 * 把 pack.palette（"bg:#E6D3B0 | hero:#CC0000"）拆成 roles 数组。
 * @param {string} palette
 */
export function parsePaletteRoles(palette) {
  return String(palette || "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * 从 observation + pack 生成默认 stylePreset。
 * observation 应为 normalizeObservation 后的 obsSummary。
 * @param {object|null|undefined} observation
 * @param {object|null|undefined} [pack]
 */
export function stylePresetFromObservation(observation, pack = {}) {
  const obs = observation && typeof observation === "object" && !Array.isArray(observation) ? observation : {};
  const p = pack && typeof pack === "object" && !Array.isArray(pack) ? pack : {};

  const subjects = Array.isArray(obs.subjects) ? obs.subjects : [];
  const objects = Array.isArray(obs.objects) ? obs.objects : [];
  const regions = Array.isArray(obs.regions) ? obs.regions : [];
  const typography = Array.isArray(obs.typography) ? obs.typography : [];
  const camera = obs.camera && typeof obs.camera === "object" ? obs.camera : {};
  const lighting = obs.lighting && typeof obs.lighting === "object" ? obs.lighting : {};
  const composition = obs.composition && typeof obs.composition === "object" ? obs.composition : {};
  const fx = obs.fx && typeof obs.fx === "object" ? obs.fx : {};

  const roles = parsePaletteRoles(p.palette);
  const subjectColors = subjects
    .map((s) => str(s?.color, 80))
    .filter(Boolean);
  const objectColors = objects
    .map((o) => str(o?.color, 80))
    .filter(Boolean);
  const colorDescription = [
    str(obs.palette_climate, 80),
    ...subjectColors,
    ...objectColors,
  ].filter(Boolean).join(", ").slice(0, 200);

  const primary = subjects.find((s) => s?.salience === "primary") || subjects[0] || null;
  const objectPhrases = objects
    .map((o) => {
      const label = str(o?.label, 80);
      if (!label) return "";
      const color = str(o?.color, 40);
      return color ? `${color} ${label}` : label;
    })
    .filter(Boolean);
  const sceneCandidates = [
    ...regions.map((r) => str(r?.label, 80)),
    ...objectPhrases,
    ...(composition.primary_mass ? [str(composition.primary_mass, 40)] : []),
    ...(composition.negative_space && composition.negative_space !== "none"
      ? [`${str(composition.negative_space, 40)} negative space`]
      : []),
  ].filter(Boolean).slice(0, 6);
  const detailCandidates = [
    ...objectPhrases,
    ...typography.map((t) => str(t?.text, 80)),
    ...(fx.family && fx.family !== "none" ? [`${str(fx.family, 40)} effect`] : []),
    ...subjects.flatMap((s) => [str(s?.wardrobe, 80), str(s?.hair, 80), str(s?.makeup, 80)]),
  ].filter(Boolean).slice(0, 6);

  const preset = {
    version: STYLE_PRESET_VERSION,
    name: "",
    tags: [],
    style: {
      color: {
        climate: str(obs.palette_climate, 40),
        roles,
        description: colorDescription,
      },
      light: {
        pattern: str(lighting.pattern, 40),
        exposure: str(lighting.exposure, 40),
        key_side: str(lighting.key_side, 40),
        source: str(lighting.source, 40),
        quality: str(lighting.quality, 40),
        climate: str(lighting.climate, 40),
      },
      lens: {
        angle: str(camera.angle, 40),
        vantage: str(camera.vantage, 40),
        lens_feel: str(camera.lens_feel, 40),
      },
      material: {
        render_family: str(obs.render_family, 40),
        capture_style: str(obs.capture_style, 40),
        content_type: str(obs.content_type, 40),
        presentation: str(obs.presentation, 40),
        finish: str(obs.finish, 200),
        finish_technique: str(obs.finish_technique, 40),
        fx: str(fx.family, 40),
      },
      composition: {
        primary_mass: str(composition.primary_mass, 40),
        anchor: str(composition.anchor, 40),
        negative_space: str(composition.negative_space, 40),
        depth_stack: Array.isArray(composition.depth_stack)
          ? composition.depth_stack.map((x) => str(x, 40)).filter(Boolean).slice(0, 10)
          : [],
      },
    },
    slots: [
      {
        id: "subject",
        label: "主体",
        type: "text",
        required: true,
        default: primary ? str(primary.label, 120) : "",
        target: "elements.primary.name",
        options: [],
      },
      {
        id: "scene",
        label: "场景",
        type: "text",
        required: false,
        default: sceneCandidates.join(", ").slice(0, 200),
        target: "layout",
        options: [],
      },
      {
        id: "detail",
        label: "细节",
        type: "text",
        required: false,
        default: detailCandidates.join(", ").slice(0, 200),
        target: "positive",
        options: [],
      },
    ],
  };

  return sanitizeStylePreset(preset);
}

/**
 * 从模板条目生成/补齐 stylePreset。
 * @param {object} template
 */
export function stylePresetFromTemplate(template) {
  if (!template || typeof template !== "object") return null;
  const existing = sanitizeStylePreset(template.stylePreset);
  if (existing) {
    if (!existing.name && template.name) existing.name = str(template.name, 80);
    if (!existing.tags.length && Array.isArray(template.tags)) {
      existing.tags = strArr(template.tags, 24, 8);
    }
    return existing;
  }
  const generated = stylePresetFromObservation(template.obsSummary, template.pack);
  if (template.name) generated.name = str(template.name, 80);
  if (Array.isArray(template.tags)) generated.tags = strArr(template.tags, 24, 8);
  return generated;
}

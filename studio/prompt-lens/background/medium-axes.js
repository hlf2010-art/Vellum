/**
 * 正交 medium 四轴（期 2）→ 旧 MediumClass 桥接
 */

/** @typedef {"photo"|"cgi"|"illustration"|"flat_graphic"|"watercolor"|"infographic"|"unknown"} RenderFamily */
/** @typedef {"flash"|"studio"|"cinematic"|"documentary"|"product_shot"|"none"|"unknown"} CaptureStyle */
/** @typedef {"portrait"|"product"|"scene"|"poster"|"ui"|"abstract"|"other"} ContentType */
/** @typedef {"full_bleed"|"framed"|"collage"|"mockup"|"plain"|"unknown"} Presentation */

export const RENDER_FAMILY_IDS = Object.freeze([
  "photo",
  "cgi",
  "illustration",
  "flat_graphic",
  "watercolor",
  "infographic",
  "unknown",
]);
export const CAPTURE_STYLE_IDS = Object.freeze([
  "flash",
  "studio",
  "cinematic",
  "documentary",
  "product_shot",
  "none",
  "unknown",
]);
export const CONTENT_TYPE_IDS = Object.freeze([
  "portrait",
  "product",
  "scene",
  "poster",
  "ui",
  "abstract",
  "other",
]);
export const PRESENTATION_IDS = Object.freeze([
  "full_bleed",
  "framed",
  "collage",
  "mockup",
  "plain",
  "unknown",
]);

const RENDER_SET = new Set(RENDER_FAMILY_IDS);
const CAPTURE_SET = new Set(CAPTURE_STYLE_IDS);
const CONTENT_SET = new Set(CONTENT_TYPE_IDS);
const PRESENT_SET = new Set(PRESENTATION_IDS);

/**
 * @param {unknown} v
 * @param {Set<string>} set
 * @param {string} fallback
 */
function pickEnum(v, set, fallback) {
  const key = String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return set.has(key) ? key : fallback;
}

/**
 * @param {unknown} raw
 * @returns {{
 *   render_family: RenderFamily,
 *   capture_style: CaptureStyle,
 *   content_type: ContentType,
 *   presentation: Presentation,
 * }}
 */
export function normalizeMediumAxes(raw) {
  const o = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    render_family: /** @type {RenderFamily} */ (
      pickEnum(o.render_family ?? o.renderFamily, RENDER_SET, "unknown")
    ),
    capture_style: /** @type {CaptureStyle} */ (
      pickEnum(o.capture_style ?? o.captureStyle, CAPTURE_SET, "unknown")
    ),
    content_type: /** @type {ContentType} */ (
      pickEnum(o.content_type ?? o.contentType, CONTENT_SET, "other")
    ),
    presentation: /** @type {Presentation} */ (
      pickEnum(o.presentation, PRESENT_SET, "unknown")
    ),
  };
}

/**
 * 四轴 → 旧 medium 枚举（供模块/UI/缓存）
 * @param {{ render_family?: string, capture_style?: string, content_type?: string, presentation?: string }} axes
 * @returns {import("./prompt-modules.js").MediumClass | string}
 */
export function axesToLegacyMedium(axes) {
  const a = normalizeMediumAxes(axes || {});
  if (a.render_family === "watercolor") return "watercolor";
  if (a.render_family === "infographic") return "infographic";
  if (a.render_family === "flat_graphic") return "flat";
  if (a.render_family === "cgi") return "render3d";
  if (a.render_family === "illustration") return "illustration";
  if (a.render_family === "photo") {
    if (a.capture_style === "flash") return "flash_photo";
    if (a.capture_style === "cinematic" || a.content_type === "poster") return "cinematic";
    if (a.capture_style === "product_shot" || a.content_type === "product") return "product";
    return "photo";
  }
  return "generic";
}

/**
 * 校验四轴是否齐全且为合法枚举（原始值，不做 unknown 吞掉）
 * @param {unknown} raw
 * @returns {string[]} 错误码
 */
export function validateMediumAxesRaw(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return ["axes.missing"];
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  const checks = [
    ["render_family", RENDER_SET],
    ["capture_style", CAPTURE_SET],
    ["content_type", CONTENT_SET],
    ["presentation", PRESENT_SET],
  ];
  for (const [key, set] of checks) {
    if (!(key in o)) {
      errors.push(`axes.${key}.missing`);
      continue;
    }
    const keyNorm = String(o[key] || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (!set.has(keyNorm)) errors.push(`axes.${key}.enum`);
  }
  return errors;
}

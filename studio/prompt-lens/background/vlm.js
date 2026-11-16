/**
 * PromptLens — VLM 调用（OpenAI 兼容，BYOK）+ Prompt Pack
 */

import { t, normalizeLocale, DEFAULT_LOCALE } from "../shared/i18n.js";
import {
  LEGACY_CLASSIFY_SYSTEM_PROMPT,
  LEGACY_DETAIL_CHECKLIST,
  LEGACY_MEDIUM_MODULES,
  LEGACY_MEDIUM_USER_HINTS,
  buildBaselineSystemPrompt,
  buildBaselineUserText,
  composeBaselinePromptFingerprint,
  buildLegacySystemPrompt,
  legacyNormalizeMediumClass,
} from "./prompt-modules.js";
import { axesToLegacyMedium } from "./medium-axes.js";
import {
  applyFinishTechniqueBand,
  applyRatioLight,
  coerceFinishTechnique,
  compilePackFromObservation,
  copyPackLocks,
  lightNormalizePack,
} from "./pack-compiler.js";
import { decomposeObservation } from "./decompose-observation.js";
import { applyHonestyGates, isSightPayload, fillObservationFromSight } from "./sight-to-observation.js";
import {
  resolveMediumFamily,
  resolveFramingMode,
  clarifyStyleByFamily,
  repairFramingByMode,
  repairMiniatureFigureScale,
  negativesForFamily,
  applyFramingToText,
  repairCameraAngle,
  hasHardEdgeFlatGraphicEvidence,
  scrubAnimeMangaSoftStack,
  scrubAnimeMangaPhotoOptics,
} from "./fidelity-core.js";
import {
  DEFAULT_REVERSE_BUDGET,
  createReverseBudget,
  detectReverseGaps,
  isTransientProbeError,
  isReverseWallClockError,
} from "./reverse-budget.js";
import {
  buildCacheKey,
  buildSettingsFingerprint,
  getReverseCache,
  putReverseCache,
  sha256HexFromDataUrl,
  touchReverseCache,
} from "./reverse-cache.js";
import {
  pickObservationSchema,
  PIPELINE_VERSION,
  fnv1aHex,
  validateObservation,
  buildObsSummary,
  mergeObservationField,
  coerceLightSource,
  coerceLightQuality,
  coerceLightClimate,
  coerceLightBeams,
  coerceLightingKeySide,
  coerceCameraVantage,
  coerceLensFeel,
} from "./observation-schema.js";
import {
  REMOTE_IMAGE_MAX_BYTES,
  REMOTE_IMAGE_TIMEOUT_MS,
  isAllowedApiBaseUrl,
  readResponseBlobGuarded,
  signalWithTimeout,
  sourceLikelyHasAlpha,
} from "../shared/net-guards.js";

export {
  DEFAULT_REVERSE_BUDGET,
  createReverseBudget,
  detectReverseGaps,
  isReverseWallClockError,
} from "./reverse-budget.js";
export { decomposeObservation, pickDecompositionProfile, formatDecompositionJson } from "./decompose-observation.js";
export {
  SYSTEM_PROMPT,
  buildLegacySystemPrompt as buildSystemPrompt,
  legacyNormalizeMediumClass as normalizeMediumClass,
} from "./prompt-modules.js";
export {
  resolveMediumFamily,
  resolveFramingMode,
  clarifyStyleByFamily,
  repairFramingByMode,
  repairMiniatureFigureScale,
  negativesForFamily,
  repairCameraAngle,
  hasHardEdgeFlatGraphicEvidence,
} from "./fidelity-core.js";


export const DEFAULT_SETTINGS = {
  apiKey: "",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: "qwen3.8-max",
  autoGenerate: false,
  /** 全站 Alt+单击：需可选 host 权限 + 注册 content script，默认关闭 */
  siteWideAltClick: false,
  /** 显式勾选后才把 identity_guess 真人名人编入 Pack；默认仅观察展示 */
  useCelebrityName: false,
  /** 显式勾选后才把 identity_guess 动漫角色名编入 Pack */
  includeAnimeCharacter: false,
  stylePreset: "balanced",
  locale: "zh-CN",
  /** 生成提示词语言（与界面语言独立），默认英语 */
  promptLocale: "en",
  /** 外观：system | light | dark，默认跟随系统 */
  theme: "system",
  /** 是否已看过首次权限说明 */
  onboarded: false,
  /** 密钥：session 仅会话持有（默认）；persistent 写入 local（显式「记住密钥」） */
  keyStorage: "session",
  /** 单图反推预算上限 */
  reverseMaxCalls: DEFAULT_REVERSE_BUDGET.maxCalls,
  reverseMaxOutputTokens: DEFAULT_REVERSE_BUDGET.maxOutputTokens,
  reverseWallClockMs: DEFAULT_REVERSE_BUDGET.wallClockMs,
};

/** 视频时长软/硬上限（秒）：软警告可继续；硬上限阻断 */
export const VIDEO_SOFT_DURATION_SEC = 120;
export const VIDEO_HARD_DURATION_SEC = 600;

/** 按时长决定抽帧数：首尾必含 */
export function frameCountForDuration(durationSec) {
  const d = Number(durationSec) || 0;
  if (d < 4) return 4;
  if (d <= 60) return 6;
  return 8;
}

export const PROVIDER_PRESETS = {
  qwenCN: {
    label: "Qwen 国内",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.8-max",
  },
  qwenIntl: {
    label: "Qwen 国际",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.8-max",
  },
};

/** 风格预设：注入用户提示；保真优先，风格只作语气偏置 */
export const STYLE_PRESETS = {
  balanced: {
    label: "均衡",
    hint: "Fidelity first: classify medium with face/skin + shading + frame-presentation + photo-capture (Gate E: flash/grain/studio vs cinematic) gates before writing. Angled device/product photos stay product shots — never rewrite as flat front-facing UI. Never upgrade candid flash/Instagram grit into soft cinematic key art. Open with correct medium/shading/palette/camera, then layout, then content.",
  },
  photoreal: {
    label: "写实摄影",
    hint: "Photoreal capture language only where visible: flash vs soft light, grain/noise, lens softness, skin — never invent. Prefer candid snapshot / editorial / studio tokens that match the frame. Ban flat-vector and fake cinematic key-art wording when the shot is a real photo.",
  },
  cinematic: {
    label: "电影感",
    hint: "Cinematic bias ONLY when the image truly is key art / film still / photoreal CGI poster: lock that medium + volumetric lighting + real facial anatomy; keep title/credits as typography overlay. If it is a candid flash phone/Instagram photo, ignore this bias and lock flash + grain instead.",
  },
  illustration: {
    label: "插画",
    hint: "Illustration bias ONLY when the image is actually illustrated: name the real drawn/painted medium visible in THIS image. If skin is photographic, ignore this bias and stay photoreal.",
  },
  product: {
    label: "产品图",
    hint: "Product/device lock first: physical chassis, materials, hero camera angle, environment/bokeh — THEN any on-screen UI. Never collapse an angled device photo into a flat front-facing UI mockup.",
  },
  infographic: {
    label: "信息图",
    hint: "Infographic / data-viz bias: prioritize exact on-image text, layout grid, chart type, legend, icon style, and palette tokens — never invent stats or labels.",
  },
};

/**
 * 视频反推系统提示：面向通用视频生成器（运动/镜头语言），输出含 motion 的 Prompt Pack
 */
export const VIDEO_SYSTEM_PROMPT = `You are a senior prompt engineer for production VIDEO generation (generic motion/camera language usable across Kling, Runway, Luma, Wanx-video, and similar tools — NOT Midjourney-only flags).
Your ONLY job: reverse-engineer the ordered keyframe sequence so another video generator can recreate a CLOSE visual + motion likeness — not a loosely related “same vibe” clip.

Return ONLY valid JSON (no markdown fences) with exactly these keys:
{
  "positive": "string — main positive prompt in the requested prompt language, 140–240 words, comma-separated dense phrases; MUST open with real style-field tokens (not the bare word medium) → face identity anchors when readable → palette → camera → motion summary → content; MUST end with aspect-ratio tokens (--ar stays ASCII)",
  "negative": "string — negatives that block common mismatches for THIS clip (30–90 words); include static/slideshow/flicker bans when motion is central",
  "style": "string — 28–70 words of reproducible artistic-style tokens ONLY (medium, shading, line, stylization, finish). Usable alone as a style prompt. No biography. Role colors belong in palette.",
  "layout": "string — 20–70 words DOMINANT composition skeleton across frames (bands/columns/grid OR fg/mid/bg depth, subject placement). Note major layout shifts only briefly. Must rebuild the dominant frame alone.",
  "palette": "string — 3–6 ROLE colors only, pipe-separated role:#RRGGBB. Allowed roles: bg, hero, skin, accent, text, secondary, mute, rim, glow. Format: bg:#RRGGBB | hero:#RRGGBB | skin:#RRGGBB (sample from visible frames; never paste placeholders or invent neon/fire accents). skin REQUIRED when readable face/skin dominates. Use the dominant look across frames; if lighting shifts, pick the prevailing roles. NEVER invent a 12-swatch card.",
  "camera": "string — 18–55 words DOMINANT angle/framing/perspective PLUS optics for the clip: lens feel (wide/normal/tele), focus plane, DOF magnitude (deep/shallow/razor) + bokeh only if visible. NEVER invent camera body/brand models. For true flat graphics: flat orthographic / no perspective.",
  "motion": "string — 20–80 words: GLOBAL motion summary for the whole clip — camera moves, subject action, pacing/duration feel, and visible transitions ONLY. Must be supported by frame-to-frame differences. Usable alone as a motion prompt. No audio, no dialogue, no off-screen plot.",
  "ratio": "string — exact aspect ratio from the provided measurement; keep --ar W:H in ASCII (format only — use the measured W:H, never invent a stock ratio)",
  "shots": [
    {
      "index": 1,
      "tStart": 0,
      "tEnd": 1.2,
      "motion": "string — per-shot motion (mandatory for each shot): camera/subject moves visible within this shot span",
      "layout": "optional coarse composition for this shot",
      "camera": "optional angle/framing for this shot",
      "content": "optional visible subject/scene beats for this shot"
    }
  ]
}

Classify medium once across frames using THESE gates (condensed — get them wrong and the whole prompt fails):
Gate A — FACE / SKIN: photoreal pores/specular/iris → real photograph subtype (Gate E) or photoreal CGI. NEVER “flat vector / dot eyes / single-line smile” for photographic skin. Photoreal skin alone ≠ cinematic key art.
Gate B — SHADING: continuous falloff, bloom, volumetric haze → photoreal / 3D CGI. Hard on-camera flash + sharp cast shadows → still a photograph (Gate E), not soft-light CGI. Flat solid fills + hard edges → flat vector / graphic.
Gate C — POSTER ≠ FLAT: photoreal/CGI hero + title credits stays photoreal/CGI with typography overlay — NOT flat vector.
Gate D — FRAME PRESENTATION: physical device in a scene → PRODUCT/DEVICE (chassis + angle + environment first; on-screen UI secondary). Pure flat UI with no bezel/environment → UI screenshot / flat graphic. NEVER collapse angled device footage into a front-facing flat mockup.
Gate E — PHOTO CAPTURE: flash snapshot / Instagram grit / studio editorial / cinematic key art — pick what is visible. Never upgrade grainy flash phone footage to soft bloom cinematic key art; never invent contour lines on real footage.

Fidelity rules (highest priority):
0) Style / medium lock: name rendering medium with generator-usable tokens matching Gates A–E (candid flash snapshot, high-ISO grain, studio editorial, photoreal cinematic ONLY if true, cel animation, watercolor, flat vector, low-poly 3D, UI capture, etc.). State shading model, edge treatment, stylization level, surface finish/grain — only what is visible. Wrong-style bans: never call photoreal skin flat vector; never call flat vector a film still; never invent soft bloom / no-hard-shadows / contour lines on flash photos; typography overlay does not flip medium.
1) Observe first, invent never. Every adjective must be visible across the provided frames or clearly implied by their differences. If unsure, omit.
2) Cross-frame palette: keep role colors stable; sample hex from visible pixels only (bg=backdrop, hero=dominant subject/garment, skin=mid-tone face/skin when readable, accent=smaller real highlight). Never invent orange/neon accents absent from frames; never copy format-example hex.
3) Layout / camera describe the DOMINANT composition; put major composition changes inside motion (or a short note in layout).
4) motion MUST reflect observable change only — camera moves (dolly, pan, tilt, orbit, push-in, handheld shake), subject action (walk, gesture, transform), pacing/duration feel (slow, snappy, sustained), and visible transitions (cut, dissolve, wipe) ONLY when evidenced by frame differences. FORBIDDEN: invented plot, off-screen events, audio, dialogue, lyrics, narrator voice, “someone says…”.
4b) When shots[] is requested: top-level motion is the GLOBAL summary; EACH shot MUST have its own motion string covering that shot's span. Use provided frame labels (shot=N) to assign frames to shots. shots[].index must match provided shot bounds (1-based).
5) Identity / wardrobe / environment / on-image text: lock only what stays readable across frames; do not invent missing letters or fake chart numbers. When faces stay readable: lock stable skin tone band+undertone, iris hue, expression family, and distinctive jewelry/garment construction — put skin+iris early in positive; never let defaults rewrite them.
6) Aspect ratio: use the MEASURED ratio from the user message. Put it in "ratio" and append to positive as ", {W}:{H} aspect ratio, --ar {W}:{H}".
7) No audio assumptions of any kind.

positive structure:
real style-field tokens (rendering medium + finish — never bare label \"medium\") → (when faces readable: skin+iris+expression anchors) → compact palette tokens → camera (dominant) → short motion summary → content/identity/environment/text → aspect ratio tokens

Ban list:
- Filler: masterpiece, best quality, 8k, trending on artstation
- Vague vibe words replacing facts: “cinematic vibe”, “dynamic energy” without concrete camera/subject moves
- Invented dialogue, SFX, music beds, voice-over
- Plot not visible across frames
- Flat-vector hallucination on photoreal faces / device→UI collapse
- Wrong aspect ratio

negative must fight likely mismatches for THIS clip:
static pose, freeze-frame, slideshow hard cuts when continuous motion is visible, flicker, warped limbs, extra captions, wrong camera move, wrong hair/eye/skin, softened or hardened expression vs frames, missing distinctive accessories, flat vector when photoreal, missing title text when readable, wrong aspect ratio

JSON only`;

/**
 * 从 grounded pack.palette 抽出 role→HEX，供 decomposition.color_system 使用
 * @param {unknown} pack
 * @returns {Record<string, string>}
 */
function paletteGroundFromPack(pack) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!pack || typeof pack !== "object") return out;
  for (const e of parsePalette(/** @type {{ palette?: string }} */ (pack).palette)) {
    const hex = String(e.hex || "").toUpperCase();
    if (e.role && /^#[0-9A-F]{6}$/.test(hex)) out[e.role] = hex;
  }
  return out;
}

/**
 * Stage A：分镜结构抽取（每镜一代表帧）
 */
export const VIDEO_STRUCTURE_SYSTEM_PROMPT = `You analyze an ordered set of video shot representative frames.
Return ONLY valid JSON:
{
  "shots": [
    {
      "index": 1,
      "tStart": 0,
      "tEnd": 1.2,
      "content": "short visible subject/scene beats",
      "layout": "optional coarse composition",
      "camera": "optional coarse angle/framing"
    }
  ],
  "styleHint": "optional one-line medium/style note"
}
Rules: trust provided shotBounds times unless a frame clearly belongs elsewhere; do not invent audio/dialogue/plot; keep shots count equal to input bounds; JSON only.`;

/** 常见画幅预设（用于贴合生成器 --ar） */
const RATIO_PRESETS = [
  [1, 1],
  [5, 4],
  [4, 3],
  [3, 2],
  [16, 9],
  [21, 9],
  [4, 5],
  [3, 4],
  [2, 3],
  [9, 16],
  [2, 1],
  [1, 2],
  [3, 1],
  [1, 3],
];

/**
 * 由宽高计算贴合后的 image ratio
 * @param {number} width
 * @param {number} height
 * @param {string} [promptLocale]
 * @returns {{ w: number, h: number, label: string, ar: string, orientation: string, exact: string, promptToken: string, ratioLine: string } | null}
 */
export function snapAspectRatio(width, height, promptLocale = "en") {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w < 2 || h < 2) return null;

  const value = w / h;
  let best = [1, 1];
  let bestDiff = Infinity;
  for (const [a, b] of RATIO_PRESETS) {
    const diff = Math.abs(value - a / b);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [a, b];
    }
  }

  // 与预设偏差过大时，用约简分数
  let [rw, rh] = best;
  if (bestDiff > 0.045) {
    const g = gcd(Math.round(w), Math.round(h));
    rw = Math.max(1, Math.round(w / g));
    rh = Math.max(1, Math.round(h / g));
    // 限制过大的分数
    if (rw > 32 || rh > 32) {
      const scale = Math.max(rw, rh) / 16;
      rw = Math.max(1, Math.round(rw / scale));
      rh = Math.max(1, Math.round(rh / scale));
    }
  }

  const orientation = rw === rh ? "square" : rw > rh ? "landscape" : "portrait";
  const label = `${rw}:${rh}`;
  const zh = String(promptLocale || "").toLowerCase().startsWith("zh");
  const orientationLabel = zh
    ? orientation === "square"
      ? "方形"
      : orientation === "landscape"
        ? "横向"
        : "纵向"
    : orientation;
  const promptToken = zh
    ? `${label} 画幅, ${orientationLabel}, --ar ${label}`
    : `${label} aspect ratio, ${orientation}, --ar ${label}`;
  const ratioLine = `${label} ${orientationLabel}, --ar ${label}`;

  return {
    w: rw,
    h: rh,
    label,
    ar: `--ar ${label}`,
    orientation,
    exact: `${Math.round(w)}×${Math.round(h)}`,
    promptToken,
    ratioLine,
  };
}

/** @param {number} a @param {number} b */
function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * 从 dataUrl 读取像素尺寸
 * @param {string} dataUrl
 * @returns {Promise<{ width: number, height: number }>}
 */
export async function readImageSize(dataUrl) {
  if (!dataUrl) return { width: 0, height: 0 };
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

/**
 * 确保 Pack 含 ratio，并在 positive 末尾带上 --ar
 * @param {ReturnType<typeof normalizePack>} pack
 * @param {ReturnType<typeof snapAspectRatio>} ratioMeta
 */
export function applyRatioToPack(pack, ratioMeta) {
  const next = normalizePack(pack);
  if (!ratioMeta) return next;

  const ratioLine = ratioMeta.ratioLine || `${ratioMeta.label} ${ratioMeta.orientation}, ${ratioMeta.ar}`;
  next.ratio = next.ratio?.trim() || ratioLine;

  const pos = next.positive;
  const hasAr =
    /--ar\s*\d+\s*:\s*\d+/i.test(pos) ||
    new RegExp(`${ratioMeta.w}\\s*:\\s*${ratioMeta.h}`).test(pos);
  if (pos && !hasAr) {
    next.positive = `${pos.replace(/[,\s]+$/, "")}, ${ratioMeta.promptToken}`;
  } else if (!pos) {
    next.positive = ratioMeta.promptToken;
  }
  return next;
}

/**
 * Optional host completer override (used when running embedded inside Vellum).
 */
let _customVlmCompleter = null;

export function setCustomVlmCompleter(fn) {
  _customVlmCompleter = typeof fn === "function" ? fn : null;
}

export function hasCustomVlmCompleter() {
  return typeof _customVlmCompleter === "function";
}

/**
 * OpenAI 兼容 chat.completions 调用，返回 assistant 文本
 * @param {{ apiKey: string, baseUrl: string, model: string, messages: object[], temperature?: number, maxTokens?: number, signal?: AbortSignal, locale?: string, onUsage?: (usage: { prompt_tokens?: number, completion_tokens?: number, total_tokens?: number } | null) => void }} opts
 */
async function callChatCompletions({
  apiKey,
  baseUrl,
  model,
  messages,
  temperature = 0.1,
  maxTokens = 2200,
  signal,
  locale = DEFAULT_LOCALE,
  onUsage,
}) {
  const ui = normalizeLocale(locale);
  if (_customVlmCompleter) {
    const out = await _customVlmCompleter({
      apiKey,
      baseUrl,
      model,
      messages,
      temperature,
      maxTokens,
      signal,
      locale: ui,
    });
    const text = typeof out === "string" ? out.trim() : String(out?.text || "").trim();
    if (!text) throw new Error(t(ui, "err.modelEmpty"));
    if (out && typeof out === "object" && out.usage) {
      try {
        onUsage?.(out.usage);
      } catch {
        /* 用量回调失败不影响主路径 */
      }
    }
    return text;
  }
  const root = (baseUrl || DEFAULT_SETTINGS.baseUrl).replace(/\/$/, "");
  if (!isAllowedApiBaseUrl(root)) {
    throw new Error(t(ui, "err.apiInsecureBase"));
  }
  const url = `${root}/chat/completions`;
  const modelId = model || DEFAULT_SETTINGS.model;
  const payload = {
    model: modelId,
    temperature,
    max_tokens: maxTokens,
    messages,
  };
  // qwen3.8-max 默认 thinking 会把一次观察拖到数分钟；识图不需要推理链
  if (/^qwen3\.8/i.test(String(modelId))) payload.enable_thinking = false;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    signal,
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(t(ui, "err.apiNotJson", { status: res.status }));
  }
  if (!res.ok) {
    throw new Error(json?.error?.message || json?.message || `HTTP ${res.status}`);
  }
  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(t(ui, "err.modelEmpty"));
  try {
    onUsage?.(json?.usage || null);
  } catch {
    /* 用量回调失败不影响主路径 */
  }
  return text;
}


/**
 * 从模型输出里抠 JSON 对象（允许 markdown fence）
 * @param {string} text
 */
function extractJsonObject(text) {
  let raw = String(text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no json object");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * 预分类：单独一次轻量 VLM 调用，失败时回落 generic
 * （视频路径仍用；单图反推走 probeImagePreflight）
 * @param {{ apiKey: string, baseUrl?: string, model?: string, dataUrl: string, locale?: string, signal?: AbortSignal }} opts
 * @returns {Promise<import("./prompt-modules.js").MediumClass>}
 */
export async function classifyImageMedium({
  apiKey,
  baseUrl,
  model,
  dataUrl,
  locale = DEFAULT_LOCALE,
  signal,
}) {
  const ui = normalizeLocale(locale);
  if (!_customVlmCompleter && !apiKey?.trim()) throw new Error(t(ui, "err.noApiKey"));
  if (!dataUrl) throw new Error(t(ui, "err.noImage"));

  try {
    const text = await callChatCompletions({
      apiKey,
      baseUrl,
      model,
      temperature: 0,
      maxTokens: 80,
      signal,
      locale: ui,
      messages: [
        { role: "system", content: LEGACY_CLASSIFY_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Classify this image. Return JSON only: {"medium":"<id>"}.',
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        },
      ],
    });
    const obj = extractJsonObject(text);
    return legacyNormalizeMediumClass(obj?.medium);
  } catch (err) {
    // 分类失败不阻断反推：回落 generic 模块
    console.warn("[PromptLens] medium classify failed, fallback generic:", err);
    return "generic";
  }
}

/**
 * 单图统一预检：媒介 + FX + 机位 + 光影，一次调用
 * @typedef {{
 *   medium: import("./prompt-modules.js").MediumClass,
 *   fx: GraphicFxProbe | null,
 *   angle: { angle: CameraAngleClass, confidence: "high"|"medium"|"low", cues: string } | null,
 *   light: { pattern: LightingPatternClass, exposure?: LightingExposureClass, confidence: "high"|"medium"|"low", cues: string } | null,
 * }} ImagePreflight
 */

export const IMAGE_PREFLIGHT_PROMPT = `You inspect ONE image and return a compact preflight JSON for reverse-prompting.
Return JSON only (no markdown) with EXACTLY these keys:
{
  "medium":"<id>",
  "fx":{"family":"motion_blur|double_exposure|optical_bokeh|volumetric_wrap|none|other","axis":"horizontal|vertical|none","zone":"camera-left|camera-right|full|none","sharp_region":"short","soft_region":"short"},
  "angle":{"angle":"eye_level|high_angle|low_angle|top_down|orthographic|unknown","vantage":"worms_eye|none|unknown","lens_feel":"ultra_wide|wide|normal|tele|unknown","confidence":"high|medium|low","cues":"short"},
  "lighting":{"pattern":"blinds_slat|dappled_foliage|backlight_rim|split_chiaroscuro|directional|flash|soft_even|unknown","exposure":"high_key|low_key|balanced|unknown","key_side":"camera_left|camera_right|overhead|unknown","source":"studio|natural|mixed","quality":"hard|soft","climate":"daylight|overcast|golden_hour|cool_skylight|tungsten","beams":"god_rays|none|unknown","confidence":"high|medium|low","cues":"short"}
}

## medium (pick ONE id — first match wins)
1) product — physical device chassis in scene, OR photographed physical sculpture ONLY when a true studio seamless backdrop is visible.
2) infographic — flat charts/dashboards/slideware with NO device chassis.
3) flat — flat vector / UI screenshot / hard-edge flat-color GRAPHIC portrait or poster art (hard color shapes, posterized/duotone lighting, NO soft blended skin gradients). Neon rim + magenta/pink light slabs on black void counts as flat graphic — NOT soft 2D illustration.
4) flash_photo — real photo with on-camera flash / hard cast shadow / high-ISO grit. NEVER upgrade to cinematic.
5) watercolor — wet wash / gouache / paper tooth.
6) render3d — 3D CGI/PBR OR sculptural relief / thick impasto dimensional paint. Soft translucent fluid/smoke mobile-wallpaper abstracts still count here when volumetric — but they are SOFT decorative CGI, not dense PBR product renders. Thick sculpted paint ≠ 2D comic; do NOT invent studio slab presentation.
7) cinematic — graphic design / sports / key-art POSTER: flat graphic ground OR layered photo-cutout collage PLUS frame-level name/title/signature typography. Movie credits optional — vertical athlete name + signature counts. NOT a single candid photo; NOT a documentary room scene.
8) illustration — clearly soft-painted OR inked 2D comic/manga ONLY (continuous blended shading OR true cel bands). FORBIDDEN for hard-edge flat-color graphic portraits, photo-cutout collage posters, or sports graphic design posters.
9) photo — other real photographs.
10) generic — only if none fit.

## fx.family (pick ONE)
- motion_blur: directional speed streak / smear on the subject into a side of the frame; one region often stays sharper. NOT soft background bokeh.
- double_exposure: second translucent/ghosted face or figure plate layered in a zone — soft duplicate form, not linear streaks.
- optical_bokeh: background points of light form soft circles / creamy optical defocus; subject silhouette NOT directionally smeared. Flat seamless solid-color void with no circular highlights → none.
- volumetric_wrap: smoke / haze / fog / cloud / dust whose wisps or denser lobes sit BOTH in front of AND behind the figure (or partially submerge a limb) — depth interpenetration, NOT a flat color plate, NOT bokeh, NOT motion streak. Put front-of-subject parts in sharp_region and behind-subject parts in soft_region.
- none: no dominant FX of the above kinds.
- other: a different namable FX (glitch, light leak, etc.).
axis is none unless family is motion_blur. zone may be set for motion_blur / double_exposure / volumetric_wrap; otherwise none. sharp_region/soft_region: brief visible facts or empty string.

## angle.angle (pick ONE)
- eye_level: camera roughly level with subject; intimate bed/neck crops usually eye_level even if head tilted.
- high_angle: elevated camera LOOKING DOWN (crown foreshortened, floor visible below).
- low_angle: looking UP with underside/chin emphasis AND sky/ceiling dominance. FORBIDDEN inventing low_angle on pillow/bed close-ups.
- top_down: near bird's-eye / straight overhead.
- orthographic: flat graphic / UI / no perspective.
- unknown: truly ambiguous.
Prefer high_angle over eye_level when clearly looking down. Prefer eye_level over low_angle when no sky/ceiling dominance. cues: 3–12 words or empty.

## angle.vantage / lens_feel (ORTHOGONAL — when readable)
- vantage: worms_eye | none | unknown — worms_eye = below-hip camera, hips dominate foreground, head smaller up-frame (implies low_angle). none = default when unsure. FORBIDDEN top_down with worms_eye. FORBIDDEN labeling mild below-eye beauty as worms_eye.
- lens_feel: ultra_wide | wide | normal | tele | unknown — set only when FOV readable; hips-huge vs head-small → ultra_wide. FORBIDDEN inventing 20mm on every portrait.

## lighting.pattern (pick ONE primary)
- blinds_slat: MULTIPLE PARALLEL window-blind / bar shadows striped across skin with regular spacing.
- dappled_foliage: IRREGULAR organic leaf/gobo mottled patches — NEVER regular parallel bars.
- backlight_rim: key BEHIND subject — bright rim/halo on hair against bright sky/void; key_side = behind origin (upper-right→camera_right), NOT frontal beauty key; FORBIDDEN side-lit close-ups with body-painted shadows.
- split_chiaroscuro: strong one-side key, half face in deep shadow.
- directional: clear side key without striped/dappled/backlight pattern. Geometry only — NOT a color-temperature label.
- flash: on-camera flash, hard cast shadow, glossy flash skin.
- soft_even: soft wrap / even fill, no strong pattern.
- unknown: ambiguous.
Prefer blinds_slat / dappled_foliage / backlight_rim over vague directional when those are visible. cues: 3–12 words naming geometry.

## lighting.exposure (pick ONE when face/skin readable)
- high_key: clipped/blown near-white highlights on skin, shoulder, or cloth; overall bright key.
- low_key: shadow-dominant, dim key, deep falloff.
- balanced: normal contrast, highlights not clipped.
- unknown: unreadable.
FORBIDDEN rewriting clipped white skin as warm amber fill.

## lighting.key_side (REQUIRED when key direction readable — pick ONE)
- overhead: KEY from ABOVE (ceiling/boom top). Crown/forehead brighter; under-chin + brow-ridge shadows from above; nose shadow falls down. NOT left/right Rembrandt.
- camera_left: KEY from the CAMERA'S LEFT; shadow mass on camera-right cheek/side.
- camera_right: KEY from the CAMERA'S RIGHT; shadow mass on camera-left cheek/side.
- unknown: truly unreadable.
Name KEY origin, not the dark cheek. FORBIDDEN omitting overhead when under-chin top-falloff is clear. FORBIDDEN left↔right swap. FORBIDDEN inventing side key for pure top light.
BACKLIGHT RIM: when pattern=backlight_rim, key_side = BEHIND light origin (upper-left→camera_left, upper-right→camera_right) — NOT frontal Rembrandt/beauty key. FORBIDDEN collapsing behind rim into directional camera_right frontal key.

## lighting.source (pick when readable)
- studio | natural | mixed — softbox/seamless = studio; sun/sky/window = natural; both = mixed.

## lighting.quality (pick when shadow edge readable)
- hard | soft — crisp cast vs diffused wrap.

## lighting.climate (pick when color/time readable)
- daylight | overcast | golden_hour | cool_skylight | tungsten

## lighting.beams (REQUIRED when air/haze volume readable — ORTHOGONAL to pattern)
- god_rays: visible diagonal crepuscular light shafts / 丁达尔光束 cutting through haze (bright beams, not mere soft particles). cues MUST name origin side (e.g. "god rays from upper-left"). key_side MUST match that origin. FORBIDDEN collapsing into fx.volumetric_wrap smoke.
- none: no readable light shafts.
- unknown: unreadable.
Prefer god_rays over none when bright shafts are visible. FORBIDDEN rewriting shafts as only soft haze dust.

Rules: observe only; never invent; JSON only. cues should name KEY direction when readable (e.g. "under-chin top key" / "key from camera-right").`;

/**
 * @param {unknown} raw
 * @returns {ImagePreflight}
 */
export function normalizeImagePreflight(raw) {
  const o = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const medium = legacyNormalizeMediumClass(o.medium);
  const fx = normalizeGraphicFxProbe(o.fx || o.graphic_fx || o.graphicFx);
  const angle = normalizeCameraAngleProbe(o.angle || o.camera || o.camera_angle);
  const light = normalizeLightingPatternProbe(o.lighting || o.light || o.light_pattern);
  return { medium, fx, angle, light };
}

/**
 * 单图统一预检（媒介+FX+机位+光影），失败时 medium=generic、探针 null
 * @param {{ apiKey: string, baseUrl?: string, model?: string, dataUrl: string, locale?: string, signal?: AbortSignal }} opts
 * @returns {Promise<ImagePreflight>}
 */
export async function probeImagePreflight({
  apiKey,
  baseUrl,
  model,
  dataUrl,
  locale = DEFAULT_LOCALE,
  signal,
}) {
  const ui = normalizeLocale(locale);
  const fallback = /** @type {ImagePreflight} */ ({
    medium: "generic",
    fx: null,
    angle: null,
    light: null,
  });
  if (!apiKey?.trim() || !dataUrl) return fallback;
  try {
    const text = await callChatCompletions({
      apiKey,
      baseUrl,
      model,
      temperature: 0,
      maxTokens: 280,
      signal,
      locale: ui,
      messages: [
        { role: "system", content: IMAGE_PREFLIGHT_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Preflight THIS image: medium + graphic FX + camera angle + lighting pattern. JSON only.",
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });
    return normalizeImagePreflight(extractJsonObject(text));
  } catch (err) {
    console.warn("[PromptLens] image preflight failed, fallback generic:", err);
    return fallback;
  }
}

/** @typedef {"motion_blur"|"double_exposure"|"optical_bokeh"|"volumetric_wrap"|"none"|"other"} GraphicFxFamily */
/** @typedef {"horizontal"|"vertical"|"none"} GraphicFxAxis */
/** @typedef {"camera-left"|"camera-right"|"full"|"none"} GraphicFxZone */

/**
 * @typedef {{
 *   family: GraphicFxFamily,
 *   axis: GraphicFxAxis,
 *   zone: GraphicFxZone,
 *   sharpRegion: string,
 *   softRegion: string,
 * }} GraphicFxProbe
 */

export const GRAPHIC_FX_PROBE_PROMPT = `You inspect ONE image for dominant graphic FX only.
Return JSON only (no markdown):
{"family":"motion_blur|double_exposure|optical_bokeh|volumetric_wrap|none|other","axis":"horizontal|vertical|none","zone":"camera-left|camera-right|full|none","sharp_region":"short","soft_region":"short"}

Definitions (pick ONE family):
- motion_blur: directional speed streak / smear on the subject (hair, body, product edge) into a side of the frame; often one region stays sharper while the trailing side streaks. NOT the same as soft background bokeh.
- double_exposure: a second translucent/ghosted face or figure plate layered in a zone (often enlarged) — soft duplicate form, not linear streaks.
- optical_bokeh: background points of light form soft circles / creamy optical defocus while the subject silhouette is NOT directionally smeared. A flat seamless solid-color void with no circular highlights is NOT bokeh → use none.
- volumetric_wrap: smoke / haze / fog / cloud / dust whose wisps or denser lobes sit BOTH in front of AND behind the figure (or partially submerge a limb) — depth interpenetration, NOT a flat color plate, NOT bokeh, NOT motion streak. Put front-of-subject parts in sharp_region and behind-subject parts in soft_region.
- none: no dominant FX of the above kinds.
- other: a different namable FX (glitch, light leak, etc.).

Rules: observe only; never invent. If unsure between motion_blur and optical_bokeh, prefer motion_blur when streaks are directional on the subject. Prefer volumetric_wrap over none when smoke/haze clearly crosses in front of the body. axis is none unless family is motion_blur. zone may be set for motion_blur / double_exposure / volumetric_wrap. sharp_region/soft_region: brief visible facts or empty string.`;

/**
 * @param {unknown} raw
 * @returns {GraphicFxProbe | null}
 */
export function normalizeGraphicFxProbe(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const familyRaw = String(o.family || o.fx || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  /** @type {GraphicFxFamily} */
  let family = "none";
  if (/motion|speed_streak|speedstreak|拖影|运动模糊/.test(familyRaw)) family = "motion_blur";
  else if (/double|ghost|exposure|叠脸|双重/.test(familyRaw)) family = "double_exposure";
  else if (/volumetric|smoke_wrap|haze_wrap|fog_wrap|atmosphere_wrap|wrap_around|体积|穿插|烟雾绕/.test(familyRaw))
    family = "volumetric_wrap";
  else if (/bokeh|shallow|optical|景深|光斑/.test(familyRaw)) family = "optical_bokeh";
  else if (/other|glitch|leak/.test(familyRaw)) family = "other";
  else if (/none|no_|absent|没有/.test(familyRaw)) family = "none";
  else if (
    ["motion_blur", "double_exposure", "optical_bokeh", "volumetric_wrap", "none", "other"].includes(
      familyRaw
    )
  ) {
    family = /** @type {GraphicFxFamily} */ (familyRaw);
  }

  const axisRaw = String(o.axis || "").trim().toLowerCase();
  /** @type {GraphicFxAxis} */
  let axis = "none";
  if (/horiz/.test(axisRaw)) axis = "horizontal";
  else if (/vert/.test(axisRaw)) axis = "vertical";

  const zoneRaw = String(o.zone || o.side || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  /** @type {GraphicFxZone} */
  let zone = "none";
  if (/left/.test(zoneRaw)) zone = "camera-left";
  else if (/right/.test(zoneRaw)) zone = "camera-right";
  else if (/full|both|entire/.test(zoneRaw)) zone = "full";

  if (family === "none" || family === "other" || family === "optical_bokeh" || family === "volumetric_wrap") {
    axis = "none";
  }
  if (family === "motion_blur" && axis === "none") axis = "horizontal";
  if (family === "volumetric_wrap" && zone === "none") zone = "full";
  // zone 未知时保持 none，合并阶段用中性 trailing 表述，禁止默认 camera-left

  const sharpRegion = String(o.sharp_region || o.sharpRegion || "")
    .trim()
    .slice(0, 80);
  const softRegion = String(o.soft_region || o.softRegion || "")
    .trim()
    .slice(0, 80);

  return { family, axis, zone, sharpRegion, softRegion };
}

/**
 * Phase 1：图形特效微探测（枚举题，失败返回 null）
 * @param {{ apiKey: string, baseUrl?: string, model?: string, dataUrl: string, locale?: string, signal?: AbortSignal }} opts
 * @returns {Promise<GraphicFxProbe | null>}
 */
export async function probeGraphicFx({
  apiKey,
  baseUrl,
  model,
  dataUrl,
  locale = DEFAULT_LOCALE,
  signal,
}) {
  const ui = normalizeLocale(locale);
  if (!apiKey?.trim() || !dataUrl) return null;
  try {
    const text = await callChatCompletions({
      apiKey,
      baseUrl,
      model,
      temperature: 0,
      maxTokens: 120,
      signal,
      locale: ui,
      messages: [
        { role: "system", content: GRAPHIC_FX_PROBE_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Probe dominant graphic FX on THIS image. JSON only.",
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });
    return normalizeGraphicFxProbe(extractJsonObject(text));
  } catch (err) {
    console.warn("[PromptLens] graphic FX probe failed:", err);
    return null;
  }
}

/** @typedef {"eye_level"|"high_angle"|"low_angle"|"top_down"|"orthographic"|"unknown"} CameraAngleClass */

export const CAMERA_ANGLE_PROBE_PROMPT = `You inspect ONE image for camera ANGLE / vantage only.
Return JSON only (no markdown):
{"angle":"eye_level|high_angle|low_angle|top_down|orthographic|unknown","vantage":"worms_eye|none|unknown","lens_feel":"ultra_wide|wide|normal|tele|unknown","confidence":"high|medium|low","cues":"short"}

Definitions (pick ONE angle):
- eye_level: camera roughly level with the subject's face/torso; horizon near mid; NOT looking clearly down or up. Intimate bed/close-up neck-shoulder crops are usually eye_level even if the head is tilted.
- high_angle: elevated camera LOOKING DOWN at the subject (crown/top of head foreshortened, floor/ground plane visible below, body recedes downward). Studio portraits can still be high_angle.
- low_angle: camera LOOKING UP at the subject with clear underside/chin emphasis AND sky or ceiling dominance above (includes mild hero-from-below). FORBIDDEN calling a pillow/bed close-up or neck crop low_angle just because the face fills the frame.
- top_down: near bird's-eye / straight-down overhead (canyon map view, looking straight down a shaft, full overhead dance). FORBIDDEN combining with low_angle or worms_eye.
- orthographic: flat graphic / UI / no perspective.
- unknown: truly ambiguous.

vantage (ORTHOGONAL — pick ONE when readable):
- worms_eye: camera clearly BELOW hip/waist; hips/lower torso dominate foreground; head appears smaller up-frame; exaggerated foreshortening. Implies angle=low_angle. FORBIDDEN for mild "slightly below eyes" beauty. FORBIDDEN with top_down.
- none: not that extreme (DEFAULT when unsure).
- unknown: unreadable.

lens_feel (optional when FOV readable): ultra_wide | wide | normal | tele | unknown — hips huge vs head small → ultra_wide. FORBIDDEN inventing 20mm on every portrait.

Rules: observe only. Prefer high_angle over eye_level when the camera is clearly above and looking down — even if the figure stands upright on a rope/prop. Prefer top_down only when nearly straight overhead. Prefer eye_level over low_angle when there is no sky/ceiling dominance. Prefer worms_eye over bare low_angle when hips dominate and head shrinks. Never emit top_down together with low_angle or worms_eye. cues: 3–12 words of visible evidence or empty.`;

/**
 * @param {unknown} raw
 * @returns {{ angle: CameraAngleClass, vantage?: string, lens_feel?: string, confidence: "high"|"medium"|"low", cues: string } | null}
 */
export function normalizeCameraAngleProbe(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  // 勿把 vantage 字段误当 angle（worms_eye ≠ top_down）
  const a = String(o.angle || o.camera_angle || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  /** @type {CameraAngleClass} */
  let angle = "unknown";
  if (/top_down|birds?_eye|birdseye|overhead_straight|直俯|鸟瞰/.test(a) || a === "topdown") {
    angle = "top_down";
  } else if (/high_angle|highangle|looking_down|from_above|elevated|俯视|高机位/.test(a)) {
    angle = "high_angle";
  } else if (/low_angle|lowangle|looking_up|from_below|仰视|低机位|worms_eye|wormseye/.test(a)) {
    angle = "low_angle";
  } else if (/eye_level|eyelevel|level|平视/.test(a)) {
    angle = "eye_level";
  } else if (/ortho|flat|no_perspective/.test(a)) {
    angle = "orthographic";
  } else if (["eye_level", "high_angle", "low_angle", "top_down", "orthographic", "unknown"].includes(a)) {
    angle = /** @type {CameraAngleClass} */ (a);
  }

  const confRaw = String(o.confidence || "").trim().toLowerCase();
  /** @type {"high"|"medium"|"low"} */
  let confidence = "medium";
  if (/high|强|高/.test(confRaw)) confidence = "high";
  else if (/low|弱|低/.test(confRaw)) confidence = "low";
  else if (/med|中/.test(confRaw)) confidence = "medium";

  let cues = String(o.cues || o.evidence || "")
    .trim()
    .slice(0, 80);
  const vantage =
    coerceCameraVantage(o.vantage, cues) || coerceCameraVantage("", cues) || "";
  const lens_feel =
    coerceLensFeel(o.lens_feel ?? o.lensFeel, cues) || coerceLensFeel("", cues) || "";
  if (vantage === "worms_eye") {
    if (angle === "top_down" || angle === "high_angle" || angle === "unknown" || angle === "eye_level") {
      angle = "low_angle";
    }
    if (!/\bbelow\s+hip|worm/i.test(cues)) {
      cues = (cues ? `${cues}, below hip worms-eye` : "below hip worms-eye").slice(0, 80);
    }
  }

  /** @type {{ angle: CameraAngleClass, vantage?: string, lens_feel?: string, confidence: "high"|"medium"|"low", cues: string }} */
  const out = { angle, confidence, cues };
  if (vantage) out.vantage = vantage;
  if (lens_feel) out.lens_feel = lens_feel;
  return out;
}

/**
 * Phase 1：镜头角度微探测（枚举题，失败返回 null）
 * @param {{ apiKey: string, baseUrl?: string, model?: string, dataUrl: string, locale?: string, signal?: AbortSignal }} opts
 */
export async function probeCameraAngle({
  apiKey,
  baseUrl,
  model,
  dataUrl,
  locale = DEFAULT_LOCALE,
  signal,
}) {
  const ui = normalizeLocale(locale);
  if (!apiKey?.trim() || !dataUrl) return null;
  try {
    const text = await callChatCompletions({
      apiKey,
      baseUrl,
      model,
      temperature: 0,
      maxTokens: 80,
      signal,
      locale: ui,
      messages: [
        { role: "system", content: CAMERA_ANGLE_PROBE_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Probe camera angle / vantage on THIS image. JSON only.",
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });
    return normalizeCameraAngleProbe(extractJsonObject(text));
  } catch (err) {
    console.warn("[PromptLens] camera angle probe failed:", err);
    return null;
  }
}

/**
 * 将角度探测合并进 Pack：有高置信枚举且 Pack 漏写时注入
 * @param {ReturnType<typeof normalizePack>} pack
 * @param {{ angle: CameraAngleClass, confidence?: string, cues?: string } | null | undefined} probe
 */
export function mergeCameraAngleIntoPack(pack, probe) {
  const base = normalizePack(pack || {});
  if (!probe?.angle || probe.angle === "unknown") return base;

  const tidy = (s) =>
    String(s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .replace(/\s+,/g, ",")
      .trim();

  // 互斥剥离：注入前清掉所有竞争机位词（含中英）
  const STRIP_ALL_ANGLES =
    /\b(?:eye[-\s]?level(?:\s+(?:angle|view|perspective|shot))?|high[-\s]?angle(?:\s+looking\s+down)?|low[-\s]?angle(?:\s+looking\s+up)?|top[-\s]?down(?:\s+(?:bird'?s[-\s]?eye|view|perspective|shot))?(?:\s*\/\s*overhead)?|bird'?s[-\s]?eye(?:\s*\/\s*overhead)?(?:\s+(?:view|perspective))?|overhead(?:\s+(?:view|perspective|shot))?|aerial(?:\s+view)?|looking straight down|from above|from below|平视|俯视|仰视|高机位|低机位|鸟瞰|直俯)\b/gi;

  /** @type {Record<string, { phrase: string, already: RegExp, neg: string }>} */
  const MAP = {
    high_angle: {
      phrase: "high-angle looking down",
      // 不含 bare "looking down"（视线/习语会假阳性）；top-down 视为已覆盖抬升机位
      already:
        /\b(high[-\s]?angle|from above|elevated (?:camera|angle)|top[-\s]?down|bird'?s[-\s]?eye|overhead|俯视|高机位|鸟瞰|直俯)\b/i,
      neg: "eye-level frontal, low-angle looking up",
    },
    top_down: {
      phrase: "top-down bird's-eye / overhead",
      already: /\b(top[-\s]?down|bird'?s[-\s]?eye|overhead|aerial view|直俯|鸟瞰)\b/i,
      neg: "eye-level frontal, low-angle looking up",
    },
    low_angle: {
      phrase: "low-angle looking up",
      // 不含 bare "looking up"（视线假阳性）
      already: /\b(low[-\s]?angle|from below|仰视|低机位)\b/i,
      neg: "eye-level frontal, high-angle looking down",
    },
    orthographic: {
      phrase: "flat orthographic, no perspective",
      already: /\b(orthographic|no perspective|flat (?:vector )?view)\b/i,
      neg: "perspective camera, eye-level photo",
    },
    eye_level: {
      phrase: "eye-level",
      already: /\beye[-\s]?level\b/i,
      neg: "",
    },
  };

  const spec = MAP[probe.angle];
  if (!spec) return base;

  const camText = String(base.camera || "");
  const packBlob = `${base.positive} ${base.layout} ${base.elements} ${base.style} ${probe.cues || ""}`;
  // 亲密特写 / 床上肖像：无天空/天花板主导时禁止注入 low-angle
  if (probe.angle === "low_angle") {
    const trueLowCue =
      /\b(sky|clouds?|ceiling|worm'?s[-\s]?eye|chin underside|looking up (?:at|toward) (?:the )?(?:sky|ceiling)|仰视|低机位)\b/i.test(
        packBlob
      );
    const intimateFlat =
      /\b(close[-\s]?up|bust|neck|collarbone|lying|bed|pillow|sheet|intimate|shoulder)\b/i.test(packBlob) &&
      !trueLowCue;
    if (intimateFlat || (!trueLowCue && probe.confidence !== "high")) {
      return base;
    }
  }

  const hasCameraAngle =
    /\b(eye[-\s]?level|high[-\s]?angle|low[-\s]?angle|top[-\s]?down|bird'?s[-\s]?eye|overhead|aerial|orthographic|平视|俯视|仰视|高机位|低机位|鸟瞰|直俯)\b/i.test(
      camText
    );
  const hasWrongElevated =
    /\b(high[-\s]?angle|low[-\s]?angle|top[-\s]?down|bird'?s[-\s]?eye|overhead|aerial|俯视|仰视|高机位|低机位|鸟瞰|直俯)\b/i.test(
      camText
    );

  // already 只看 camera，避免 positive 里 "gaze looking down" 挡注入
  if (probe.angle !== "eye_level" && spec.already.test(camText)) {
    return base;
  }

  // eye_level：仅高置信且 camera 已有错误抬升/仰视时纠回；否则不动（防抹真俯视）
  if (probe.angle === "eye_level") {
    if (probe.confidence !== "high" || !hasWrongElevated) return base;
  } else if (probe.confidence === "low" || probe.confidence === "medium") {
    // 中低置信：仅 camera 完全无角度词时补写；禁止覆盖已有 eye-level
    if (hasCameraAngle) return base;
  }

  let camera = tidy(camText.replace(STRIP_ALL_ANGLES, " "));
  camera = camera ? `${spec.phrase}, ${camera}` : spec.phrase;

  let positive = String(base.positive || "");
  // positive 前置：仅当尚未有明确机位短语（仍不含 bare looking down/up）
  if (!spec.already.test(positive)) {
    positive = tidy(positive.replace(STRIP_ALL_ANGLES, " "));
    positive = `${spec.phrase}, ${positive}`;
  }

  let negative = String(base.negative || "");
  if (spec.neg && !new RegExp(spec.neg.split(",")[0].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(negative)) {
    negative = negative ? `${negative}, ${spec.neg}` : spec.neg;
  }

  return normalizePack({
    ...base,
    camera: tidy(camera),
    positive: tidy(positive),
    negative: tidy(negative),
  });
}

/** @typedef {"blinds_slat"|"dappled_foliage"|"backlight_rim"|"split_chiaroscuro"|"directional"|"flash"|"soft_even"|"unknown"} LightingPatternClass */
/** @typedef {"high_key"|"low_key"|"balanced"|"unknown"} LightingExposureClass */

export const LIGHTING_PATTERN_PROBE_PROMPT = `You inspect ONE image for LIGHTING / SHADOW PATTERN only (not camera angle, not wardrobe).
Return JSON only (no markdown):
{"pattern":"blinds_slat|dappled_foliage|backlight_rim|split_chiaroscuro|directional|flash|soft_even|unknown","exposure":"high_key|low_key|balanced|unknown","key_side":"camera_left|camera_right|overhead|unknown","source":"studio|natural|mixed","quality":"hard|soft","climate":"daylight|overcast|golden_hour|cool_skylight|tungsten","beams":"god_rays|none|unknown","confidence":"high|medium|low","cues":"short"}

Definitions (pick ONE primary):
- blinds_slat: MULTIPLE PARALLEL straight bar/window-blind shadows striped across skin (neck/shoulder/face) with regular spacing — like light through venetian blinds. Soft-edged is OK if bands stay parallel and evenly spaced. Not a single soft shadow edge. FORBIDDEN calling parallel blind bars \"dappled\" or \"foliage\".
- dappled_foliage: IRREGULAR organic leaf/branch/gobo mottled patches (blob/amoeba shapes, uneven sizes). NEVER regular parallel bars — those are blinds_slat.
- backlight_rim: primary key is BEHIND the subject — bright rim/halo on hair edges against bright sky/void behind the head; face often softer/fill; lens flare OK. key_side names the BEHIND origin (upper-right → camera_right), NOT a frontal beauty key. FORBIDDEN: side-lit warm close-ups with shadows painted ON the body (even if hair has specular sheen); FORBIDDEN rewriting true behind rim as directional frontal camera_right key.
- split_chiaroscuro: strong one-side key, half face in deep shadow (Rembrandt/split), no striped/dappled gobo required.
- directional: clear key from ONE origin (side OR overhead) without striped/dappled pattern and without true backlight rim. Geometry only — NOT a color-temperature label. When used, key_side is REQUIRED if direction is readable.
- flash: on-camera flash, hard cast shadow, glossy flash skin.
- soft_even: soft wrap / even fill, no strong pattern.
- unknown: ambiguous.

Exposure (pick ONE when face/skin readable):
- high_key: clipped/blown near-white highlights on skin, shoulder, or cloth; overall bright key.
- low_key: shadow-dominant, dim key, deep falloff.
- balanced: normal contrast, highlights not clipped.
- unknown: unreadable.
FORBIDDEN rewriting clipped white skin as warm amber fill.

KEY DIRECTION key_side (REQUIRED when readable — pick ONE):
- overhead: KEY from ABOVE — crown lit, under-chin / brow-ridge shadows from above, nose shadow falls down. Studio top/ceiling softbox common. FORBIDDEN calling this camera_left/right.
- camera_left: KEY from CAMERA LEFT; shadow mass on camera-right side of face.
- camera_right: KEY from CAMERA RIGHT; shadow mass on camera-left side of face.
- unknown: unreadable.
Name KEY origin, not the dark cheek. cues MUST mention direction when set (e.g. "under-chin overhead key").
When pattern=backlight_rim: key_side = BEHIND origin (upper-left→camera_left, upper-right→camera_right). FORBIDDEN treating that as frontal Rembrandt/beauty key.

Source / quality / climate (when readable):
- source: studio | natural | mixed
- quality: hard | soft
- climate: daylight | overcast | golden_hour | cool_skylight | tungsten

BEAMS (REQUIRED when air/haze volume readable — ORTHOGONAL to pattern):
- god_rays: visible diagonal crepuscular light shafts / 丁达尔光束 cutting through haze — bright beams, NOT mere soft particles. cues MUST include origin (e.g. "god rays from upper-left"). key_side MUST match that origin. FORBIDDEN collapsing into smoke wrap / volumetric_wrap FX.
- none: no readable light shafts.
- unknown: unreadable.
Prefer god_rays over none when bright shafts are visible.

Rules: observe only. Prefer blinds_slat / dappled_foliage / backlight_rim over vague directional when those patterns are visible. If unsure between blinds_slat and dappled_foliage, choose by parallel-vs-irregular geometry. Never omit key_side=overhead when under-chin top-falloff is clear. Never omit beams=god_rays when crepuscular shafts are clear. cues: 3–12 words naming geometry + key direction (+ beams origin when set).`;

/**
 * @param {unknown} raw
 * @returns {{ pattern: LightingPatternClass, exposure?: LightingExposureClass, key_side?: string, source?: string, quality?: string, climate?: string, beams?: string, confidence: "high"|"medium"|"low", cues: string } | null}
 */
export function normalizeLightingPatternProbe(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const p = String(o.pattern || o.lighting || o.light_pattern || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  /** @type {LightingPatternClass} */
  let pattern = "unknown";
  if (/blind|slat|barred|stripe|window_shadow|百叶|条纹/.test(p) || p === "blinds_slat") {
    pattern = "blinds_slat";
  } else if (/dappl|mottled|foliage|gobo|leaf|斑驳|树叶/.test(p) || p === "dappled_foliage") {
    pattern = "dappled_foliage";
  } else if (/backlight|backlit|rim|halo|contre|逆光|轮廓/.test(p) || p === "backlight_rim") {
    pattern = "backlight_rim";
  } else if (/split|chiaroscuro|rembrandt|半脸|明暗/.test(p) || p === "split_chiaroscuro") {
    pattern = "split_chiaroscuro";
  } else if (/flash|直闪/.test(p) || p === "flash") {
    pattern = "flash";
  } else if (/soft_even|even_fill|softbox/.test(p) || p === "soft_even") {
    pattern = "soft_even";
  } else if (/directional|side_lit|侧光|顶光|overhead/.test(p) || p === "directional") {
    pattern = "directional";
  } else if (
    [
      "blinds_slat",
      "dappled_foliage",
      "backlight_rim",
      "split_chiaroscuro",
      "directional",
      "flash",
      "soft_even",
      "unknown",
    ].includes(p)
  ) {
    pattern = /** @type {LightingPatternClass} */ (p);
  }

  const confRaw = String(o.confidence || "").trim().toLowerCase();
  /** @type {"high"|"medium"|"low"} */
  let confidence = "medium";
  if (/high|强|高/.test(confRaw)) confidence = "high";
  else if (/low|弱|低/.test(confRaw)) confidence = "low";
  else if (/med|中/.test(confRaw)) confidence = "medium";

  let cues = String(o.cues || o.evidence || "")
    .trim()
    .slice(0, 80);
  const expRaw = String(o.exposure || o.key || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  /** @type {LightingExposureClass | undefined} */
  let exposure;
  if (expRaw === "high_key" || /overexpos|blown|clipped|highkey/.test(expRaw)) exposure = "high_key";
  else if (expRaw === "low_key" || /lowkey|underexpos/.test(expRaw)) exposure = "low_key";
  else if (expRaw === "balanced" || expRaw === "normal") exposure = "balanced";
  else if (expRaw === "unknown") exposure = "unknown";

  const keySide =
    coerceLightingKeySide(o.key_side ?? o.keySide, cues) || coerceLightingKeySide("", cues);
  const source = coerceLightSource(o.source) || coerceLightSource(cues);
  const quality = coerceLightQuality(o.quality) || coerceLightQuality(cues);
  const climate = coerceLightClimate(o.climate) || coerceLightClimate(cues);
  const beams = coerceLightBeams(o.beams, cues) || coerceLightBeams("", cues);
  if (beams === "god_rays" && !/\bgod\s*rays?\b/i.test(cues)) {
    cues = (cues ? `${cues}, god rays` : "god rays").slice(0, 80);
  }

  /** @type {{ pattern: LightingPatternClass, exposure?: LightingExposureClass, key_side?: string, source?: string, quality?: string, climate?: string, beams?: string, confidence: "high"|"medium"|"low", cues: string }} */
  const out = { pattern, confidence, cues };
  if (exposure && exposure !== "unknown") out.exposure = exposure;
  if (keySide) out.key_side = keySide;
  if (source) out.source = source;
  if (quality) out.quality = quality;
  if (climate) out.climate = climate;
  if (beams) out.beams = beams;
  return out;
}

/**
 * @param {{ apiKey: string, baseUrl?: string, model?: string, dataUrl: string, locale?: string, signal?: AbortSignal }} opts
 */
export async function probeLightingPattern({
  apiKey,
  baseUrl,
  model,
  dataUrl,
  locale = DEFAULT_LOCALE,
  signal,
}) {
  const ui = normalizeLocale(locale);
  if (!apiKey?.trim() || !dataUrl) return null;
  try {
    const text = await callChatCompletions({
      apiKey,
      baseUrl,
      model,
      temperature: 0,
      maxTokens: 80,
      signal,
      locale: ui,
      messages: [
        { role: "system", content: LIGHTING_PATTERN_PROBE_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Probe lighting/shadow pattern on THIS image. JSON only." },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });
    return normalizeLightingPatternProbe(extractJsonObject(text));
  } catch (err) {
    console.warn("[PromptLens] lighting pattern probe failed:", err);
    return null;
  }
}

/**
 * finish 技法六桶探针（像素互斥；不含受众标签）
 * @typedef {{ technique: import("./pack-compiler.js").FinishTechnique | "line_art"|"hard_cel"|"ink_print"|"soft_color_draw"|"tonal_sketch"|"painted"|"unknown", confidence: "high"|"medium"|"low", cues: string }} FinishTechniqueProbe
 */

export const FINISH_TECHNIQUE_PROBE_PROMPT = `You inspect ONE image for DRAWING/PAINT FINISH TECHNIQUE only (not wardrobe, not camera, not audience genre).
Return JSON only (no markdown):
{"technique":"line_art|hard_cel|ink_print|soft_color_draw|flat_cartoon|tonal_sketch|painted|unknown","confidence":"high|medium|low","cues":"short"}

Pick ONE primary TECHNIQUE BUCKET from pixels:
- line_art: outline-led, sparse/no fill (clean contours dominate).
- hard_cel: clean ink outlines + flat cel shadow bands / hard cut shading.
- ink_print: B&W screentone OR dense B&W hatch OR bold US comic ink/Ben-Day OR ligne claire print fills. Color crosshatch + wash → painted (graphic novel ink), not ink_print.
- soft_color_draw: soft gradient anime shading OR full-color soft-skin webtoon (soft color must be true).
- flat_cartoon: minimalist angular/geometric flat cartoon — limited flat fills, bold uneven contour, geometric hair masses, elongated caricature, simple/pupil-less eyes, almost NO soft face shading. NOT anime soft-shaded. NOT detailed iris. NOT strand hair.
- tonal_sketch: graphite/charcoal with readable tonal fill (not outline-only).
- painted: oil/gouache/watercolor/soft digital paint / sumi wash / graphic novel ink (dense color crosshatch + wash).
- unknown: photo/CGI OR ambiguous.

FORBIDDEN inventing shonen/shojo/seinen as technique. Put dialect hints only in cues (e.g. "webtoon vertical", "angular elongated face", "academic graphite").
FORBIDDEN calling flat_cartoon soft_color_draw or hard_cel. FORBIDDEN calling hard cel soft_color_draw. FORBIDDEN calling line art tonal_sketch when fill is absent.
CRITICAL: elongated geometric face + limited flat skin fills + bold uneven contour + solid color void + simple/pupil-less eyes + almost no soft cheek shading → flat_cartoon — even if the subject "feels anime". Soft gradient cheeks / detailed iris / strand hair → soft_color_draw or hard_cel, NOT flat_cartoon.
`;

/**
 * @param {unknown} raw
 * @returns {FinishTechniqueProbe | null}
 */
export function normalizeFinishTechniqueProbe(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const technique = coerceFinishTechnique(o.technique ?? o.finish ?? o.band);
  if (!technique || technique === "unknown") {
    // 仍返回 unknown 以便调试；调用方可忽略
    const confRaw = String(o.confidence || "").trim().toLowerCase();
    /** @type {"high"|"medium"|"low"} */
    let confidence = "low";
    if (/high|强|高/.test(confRaw)) confidence = "high";
    else if (/med|中/.test(confRaw)) confidence = "medium";
    const cues = String(o.cues || o.evidence || "")
      .trim()
      .slice(0, 80);
    return { technique: "unknown", confidence, cues };
  }
  const confRaw = String(o.confidence || "").trim().toLowerCase();
  /** @type {"high"|"medium"|"low"} */
  let confidence = "medium";
  if (/high|强|高/.test(confRaw)) confidence = "high";
  else if (/low|弱|低/.test(confRaw)) confidence = "low";
  else if (/med|中/.test(confRaw)) confidence = "medium";
  const cues = String(o.cues || o.evidence || "")
    .trim()
    .slice(0, 80);
  return { technique, confidence, cues };
}

/**
 * @param {{ apiKey: string, baseUrl?: string, model?: string, dataUrl: string, locale?: string, signal?: AbortSignal }} opts
 */
export async function probeFinishTechnique({
  apiKey,
  baseUrl,
  model,
  dataUrl,
  locale = DEFAULT_LOCALE,
  signal,
}) {
  const ui = normalizeLocale(locale);
  if (!apiKey?.trim() || !dataUrl) return null;
  try {
    const text = await callChatCompletions({
      apiKey,
      baseUrl,
      model,
      temperature: 0,
      maxTokens: 60,
      signal,
      locale: ui,
      messages: [
        { role: "system", content: FINISH_TECHNIQUE_PROBE_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Probe finish technique bucket on THIS image. JSON only." },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });
    return normalizeFinishTechniqueProbe(extractJsonObject(text));
  } catch (err) {
    console.warn("[PromptLens] finish technique probe failed:", err);
    return null;
  }
}

/**
 * Pack 是否炭笔/石墨/墨晕素描（避免写真 chiaroscuro 前置）
 * @param {{ style?: string, positive?: string, elements?: string, camera?: string }} pack
 */
export function packLooksCharcoalSketch(pack) {
  const blob = `${pack?.style || ""} ${pack?.positive || ""} ${pack?.elements || ""} ${pack?.camera || ""}`;
  return /\b(charcoal|graphite|pencil\s*(?:sketch|drawing|portrait)|ink\s*wash|cross[-\s]?hatch|paper\s*tooth|fine[-\s]?art\s*sketch|素描|炭笔|铅笔)\b/i.test(
    blob
  );
}

/**
 * 将光影图案探测合并进 Pack
 * @param {ReturnType<typeof normalizePack>} pack
 * @param {{ pattern: LightingPatternClass, exposure?: LightingExposureClass, confidence?: string, cues?: string } | null | undefined} probe
 */
export function mergeLightingProbeIntoPack(pack, probe) {
  const base = normalizePack(pack || {});
  if (!probe?.pattern || probe.pattern === "unknown") return base;
  if (probe.confidence === "low") return base;

  const tidy = (s) =>
    String(s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();

  const blob = `${base.positive} ${base.camera} ${base.layout} ${base.style} ${base.elements}`;
  const cues = String(probe.cues || "");
  /** @type {LightingPatternClass} */
  let pattern = probe.pattern;
  const sketchPack = packLooksCharcoalSketch(base);

  // 炭笔素描：明暗对比用石墨明暗话术，禁止写真 chiaroscuro / soft even 前置
  if (sketchPack && (pattern === "split_chiaroscuro" || pattern === "directional" || pattern === "soft_even")) {
    const sketchPhrase = "tonal graphite contrast, soft smudge shading";
    if (/\b(tonal graphite|graphite contrast|soft smudge)\b/i.test(blob)) {
      return normalizePack({
        ...base,
        negative: tidy(
          [base.negative, "photorealistic skin", "smooth digital painting", "hyperdetailed pores"]
            .filter(Boolean)
            .join(", ")
        ),
      });
    }
    const positive = tidy(
      String(base.positive || "").replace(
        /\bGraphic FX:\s*subtle directional light streaks[^.]*(?:\.|$)/gi,
        " "
      )
    );
    return normalizePack({
      ...base,
      positive: tidy(positive ? `${sketchPhrase}, ${positive}` : sketchPhrase),
      negative: tidy(
        [base.negative, "photorealistic skin", "smooth digital painting", "hyperdetailed pores"]
          .filter(Boolean)
          .join(", ")
      ),
    });
  }

  // soft_even：若 Pack 已有明确投影图案 / 闪光 / 逆光，勿用柔光覆盖
  if (pattern === "soft_even") {
    if (
      hasProjectedShadowPatternEvidence(blob) ||
      hasFlashCaptureEvidence(blob) ||
      hasBacklightRimEvidence(blob) ||
      /\b(chiaroscuro|split lighting|Rembrandt|half[-\s]?lit)\b/i.test(blob)
    ) {
      return base;
    }
  }

  // 探针纠偏：平行条 vs 不规则斑；侧光特写误标逆光
  if (pattern === "blinds_slat" && /\b(leaf|foliage|dappl|mottled|organic|irregular)\b/i.test(cues)) {
    pattern = "dappled_foliage";
  } else if (pattern === "dappled_foliage" && /\b(parallel|blind|slat|bar(?:red)?|regular)\b/i.test(cues)) {
    pattern = "blinds_slat";
  }
  if (pattern === "backlight_rim") {
    const behindCue =
      /\b(backlit|behind|sky|halo|contre|逆光|sun behind)\b/i.test(`${blob} ${cues}`) ||
      /\brim\b/i.test(cues);
    const sideLitBody =
      /\b(neck|shoulder|collarbone|from the left|from the right|illuminates?\s+from)\b/i.test(blob) &&
      !/\b(sky|clouds?)\b/i.test(blob);
    const hairVisible =
      /\b(hair|bangs|fringe|ponytail|bun|braid)\b/i.test(blob) &&
      !/\b(hair not visible|no (?:visible )?hair|natural hair not visible|hair out of frame)\b/i.test(blob);
    if (!behindCue && sideLitBody) {
      pattern = /\b(blind|slat|stripe|bar)\b/i.test(`${blob} ${cues}`)
        ? "blinds_slat"
        : /\b(dappl|leaf|foliage|mottled|gobo)\b/i.test(`${blob} ${cues}`)
          ? "dappled_foliage"
          : "directional";
    } else if (!hairVisible && !/\b(sky|clouds?|sun behind)\b/i.test(`${blob} ${cues}`)) {
      // 无发丝/天空背光证据时，不注入「发丝逆光 rim」
      pattern = "directional";
    }
  }

  /** @type {Record<string, { phrase: string, already: RegExp, neg: string }>} */
  const MAP = {
    blinds_slat: {
      phrase: "window-blind / slat bar shadows striped across skin",
      already: /\b(blind|slat|bar(?:red)? shadow|striped shadow|banded shadow|window shadow|百叶|条纹阴影)\b/i,
      neg: "soft even lighting, dappled foliage gobo, missing slat shadows",
    },
    dappled_foliage: {
      phrase: "dappled foliage / leaf gobo shadow patches",
      already: /\b(dappl|mottled|gobo|foliage shadow|leaf(?:y)? shadow|斑驳|树叶光斑)\b/i,
      neg: "soft even lighting, window-blind slat shadows, missing dappled light",
    },
    backlight_rim: {
      phrase:
        "intense golden backlight from behind, glowing amber rim through hair, high contrast with softly shadowed face",
      already: /\b(backlit|backlight|rim light|edge light|hair halo|contre[-\s]?jour|逆光|轮廓光|golden backlight)\b/i,
      neg: "frontal beauty key, soft front fill, flat even lighting, missing rim light",
    },
    split_chiaroscuro: {
      phrase: "high-contrast split / chiaroscuro face lighting",
      already: /\b(chiaroscuro|split lighting|Rembrandt|half[-\s]?lit|high[-\s]?contrast face)\b/i,
      neg: "soft even lighting, even warm fill, flat beauty light",
    },
    directional: {
      phrase: "directional key light from one side",
      already: /\b(directional (?:key |sun)?light|warm directional|side[-\s]?lit|illuminates?\s+from)\b/i,
      neg: "soft even lighting, flat frontal fill",
    },
    flash: {
      phrase: "on-camera flash, hard flash cast shadow",
      already: /\b(on[-\s]?camera flash|hard flash(?: cast)? shadow|flash snapshot)\b/i,
      neg: "soft even lighting, soft bloom, cinematic softbox",
    },
    soft_even: {
      phrase: "soft even overcast daylight, no patterned cast shadows",
      already: /\bsoft even(?:\s+(?:overcast\s+)?(?:daylight|lighting|fill|light))?\b/i,
      neg: "window-blind slat shadows, dappled foliage gobo, invented patterned light, split chiaroscuro",
    },
  };

  const spec = MAP[pattern];
  if (!spec) return base;

  const HIGH_KEY_PHRASE = "high-key overexposed key, clipped white highlights on skin";
  const injectHighKey = (positive) => {
    if (probe.exposure !== "high_key") return positive;
    if (/\bhigh[-\s]?key|clipped white highlights\b/i.test(`${positive} ${blob}`)) return positive;
    return positive ? `${HIGH_KEY_PHRASE}, ${positive}` : HIGH_KEY_PHRASE;
  };

  const mergeNeg = (negative) => {
    let next = String(negative || "");
    if (!spec.neg) return next;
    for (const part of spec.neg.split(/,\s*/)) {
      const p = part.trim();
      if (!p) continue;
      if (!new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(next)) {
        next = next ? `${next}, ${p}` : p;
      }
    }
    return next;
  };

  if (spec.already.test(blob)) {
    let positive = String(base.positive || "").replace(
      /\bGraphic FX:\s*subtle directional light streaks[^.]*(?:\.|$)/gi,
      " "
    );
    return normalizePack({
      ...base,
      positive: tidy(injectHighKey(positive)),
      negative: tidy(mergeNeg(base.negative)),
    });
  }

  if (probe.confidence === "medium") {
    if (
      pattern !== "soft_even" &&
      /\b(directional|shadow play|casting shadows|rim light|backlit|dappl|blind|slat|chiaroscuro|flash)\b/i.test(
        blob
      )
    ) {
      return base;
    }
  }

  let positive = tidy(
    String(base.positive || "").replace(
      /\bGraphic FX:\s*subtle directional light streaks[^.]*(?:\.|$)/gi,
      " "
    )
  );
  positive = positive ? `${spec.phrase}, ${positive}` : spec.phrase;

  return normalizePack({
    ...base,
    positive: tidy(injectHighKey(positive)),
    negative: tidy(mergeNeg(base.negative)),
  });
}

/**
 * 将 FX 探测结果合并进 Pack（有枚举证据才写；不凭空发明）
 * @param {ReturnType<typeof normalizePack>} pack
 * @param {GraphicFxProbe | null | undefined} fx
 */
export function mergeGraphicFxIntoPack(pack, fx) {
  const base = normalizePack(pack || {});
  if (!fx || !fx.family || fx.family === "other") {
    return base;
  }

  let { positive, elements, layout, camera, negative, style } = base;
  const tidy = (s) =>
    String(s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .replace(/\s+,/g, ",")
      .trim();

  const stripFalseBokeh = (s) =>
    String(s || "")
      .replace(/\bwith\s+soft\s+bokeh\s+blur\s+effect\b/gi, "")
      .replace(/\bsoft\s+bokeh\s+blur\s+effect\b/gi, "")
      .replace(/\b,\s*soft\s+bokeh(?:\s+blur)?(?:\s+effect)?\b/gi, "")
      .replace(/\bsoft\s+bokeh(?:\s+blur)?\b/gi, "")
      .replace(/\bbokeh\s+blur\b/gi, "");

  if (fx.family === "none") {
    // 明确无特效：去掉假 bokeh / 假拖影套话
    positive = stripFalseBokeh(positive);
    camera = stripFalseBokeh(camera);
    layout = stripFalseBokeh(layout);
    positive = positive
      .replace(/\b(?:heavy|directional)\s+motion\s+blur(?:\s+speed\s+streak)?\b/gi, "")
      .replace(/\bhorizontal\s+motion\s+streak\b/gi, "");
    return normalizePack({
      ...base,
      positive: tidy(positive),
      layout: tidy(layout),
      camera: tidy(camera),
    });
  }

  if (fx.family === "optical_bokeh") {
    if (!/\bbokeh|shallow\s+(?:DOF|depth)/i.test(`${positive} ${camera}`)) {
      positive = `optical background bokeh, ${positive}`;
    }
    return normalizePack({
      ...base,
      positive: tidy(positive),
      negative: mergeNegatives(negative, "motion blur speed streak, double-exposure ghost overlay"),
    });
  }

  if (fx.family === "motion_blur") {
    const evidenceBlob = `${positive} ${elements} ${layout} ${camera} ${style}`;
    // 硬边全锐利 / 明确否认拖影时，不接受 probe 误报 motion
    if (
      hasHardEdgeFlatGraphicEvidence(evidenceBlob) &&
      /\b(no motion|no streak|deep graphic sharpness|fully static|fully sharp)\b/i.test(evidenceBlob)
    ) {
      positive = positive
        .replace(/\b(?:heavy|directional)\s+motion\s+blur(?:\s+speed\s+streak)?\b/gi, "")
        .replace(/\bhorizontal\s+motion\s+streak\b/gi, "");
      return normalizePack({
        ...base,
        positive: tidy(stripFalseBokeh(positive)),
        layout: tidy(stripFalseBokeh(layout)),
        camera: tidy(stripFalseBokeh(camera)),
        negative: mergeNegatives(negative, "motion blur speed streak, soft bokeh background blur"),
      });
    }
    const axis = fx.axis === "vertical" ? "vertical" : "horizontal";
    const zoneLabel =
      fx.zone === "camera-left" || fx.zone === "camera-right" || fx.zone === "full"
        ? fx.zone
        : "trailing side";
    const elemZone =
      fx.zone === "camera-left"
        ? "mid-left"
        : fx.zone === "camera-right"
          ? "mid-right"
          : fx.zone === "full"
            ? "full"
            : "mid";
    const sharp = fx.sharpRegion || "leading subject edge";
    const soft = fx.softRegion || "trailing side";
    const clause = `${axis} motion streak|${elemZone}|secondary`;
    const lock = `${axis} motion blur speed streak on ${zoneLabel} (${soft} smeared, ${sharp} clearer)`;

    positive = stripFalseBokeh(positive);
    camera = stripFalseBokeh(camera);
    layout = stripFalseBokeh(layout);

    if (!/\bmotion\s*(blur|streak)|speed\s*streak|\bstreak\b/i.test(positive)) {
      positive = `${lock}, ${positive}`;
    } else if (!/\b(camera-left|camera-right|horizontal|vertical|trailing)\b/i.test(positive)) {
      positive = `${lock}, ${positive}`;
    }

    if (elements && !/\bmotion|streak\b/i.test(elements)) {
      elements = `${clause}; ${elements}`;
    } else if (!elements) {
      elements = clause;
    }

    if (layout && !/\bmotion|streak\b/i.test(layout)) {
      layout = `${axis} motion streak on ${zoneLabel}; ${layout}`;
    }

    if (!/\bmotion|streak\b/i.test(camera)) {
      camera = tidy(
        `${camera ? `${camera}, ` : ""}${axis} subject motion streak on ${zoneLabel}, ${sharp} remains clearer while ${soft} smears`
      );
    }
    camera = camera
      .replace(
        /\bdeep\s+DOF\s+with\s+fully\s+sharp\s+focus\s+on\s+the\s+face\s+and\s+upper\s+torso\b/gi,
        "leading edge clearer with trailing motion streak"
      )
      .replace(/\bfully\s+sharp\b/gi, "partially sharp with motion streak")
      .replace(/\bdeep\s+DOF\b/gi, "mixed sharpness with motion streak");

    negative = mergeNegatives(
      negative,
      "soft bokeh background blur, double-exposure ghost overlay, fully static subject with no streak"
    );

    return normalizePack({
      ...base,
      positive: tidy(positive),
      elements: tidy(elements),
      layout: tidy(layout),
      camera: tidy(camera),
      negative: tidy(negative),
      style,
    });
  }

  if (fx.family === "double_exposure") {
    const zoneLabel =
      fx.zone === "camera-left" || fx.zone === "camera-right" || fx.zone === "full"
        ? fx.zone
        : "offset zone";
    const elemZone =
      fx.zone === "camera-left"
        ? "mid-left"
        : fx.zone === "camera-right"
          ? "mid-right"
          : fx.zone === "full"
            ? "full"
            : "mid";
    const lock = `translucent double-exposure ghost overlay on ${zoneLabel}`;
    const clause = `ghost overlay|${elemZone}|secondary`;

    positive = stripFalseBokeh(positive);
    if (!/\b(double[-\s]?exposure|ghost(?:ed)?\s+overlay)\b/i.test(positive)) {
      positive = `${lock}, ${positive}`;
    }
    if (elements && !/\bghost|double[-\s]?exposure\b/i.test(elements)) {
      elements = `${clause}; ${elements}`;
    }
    if (layout && !/\bghost|double[-\s]?exposure\b/i.test(layout)) {
      layout = `${lock}; ${layout}`;
    }
    negative = mergeNegatives(negative, "motion blur speed streak, soft bokeh background blur");

    return normalizePack({
      ...base,
      positive: tidy(positive),
      elements: tidy(elements),
      layout: tidy(layout),
      negative: tidy(negative),
    });
  }

  if (fx.family === "volumetric_wrap") {
    const front = fx.sharpRegion || "wisps across torso/limbs";
    const behind = fx.softRegion || "denser cloud behind the figure";
    const lock = `volumetric smoke/haze wrap (in front: ${front}; behind: ${behind})`;
    const clause = `volumetric haze wrap|full|secondary`;

    positive = stripFalseBokeh(positive);
    if (!/\b(volumetric|wrap(?:-|\s)?around|in front of (?:the )?subject|wisps? (?:across|over|in front))\b/i.test(positive)) {
      positive = `${lock}, ${positive}`;
    }
    if (elements && !/\b(volumetric|haze wrap|smoke wrap|fog wrap)\b/i.test(elements)) {
      elements = `${clause}; ${elements}`;
    } else if (!elements) {
      elements = clause;
    }
    if (layout && !/\b(volumetric|wrap|in front of|behind (?:the )?figure)\b/i.test(layout)) {
      layout = `${lock}; ${layout}`;
    }
    negative = mergeNegatives(
      negative,
      "flat pasted cutout, smoke only as solid backdrop plate, subject entirely in front of unbroken FX wall"
    );

    return normalizePack({
      ...base,
      positive: tidy(positive),
      elements: tidy(elements),
      layout: tidy(layout),
      negative: tidy(negative),
    });
  }

  return base;
}

/**
 * 构造失败事故包（无 Key、无整图）
 * @param {object} partial
 */
function buildReverseIncident(partial) {
  return {
    ts: Date.now(),
    phase: String(partial.phase || "baseline").slice(0, 24),
    error: String(partial.error || "").slice(0, 300),
    budget: partial.budget && typeof partial.budget === "object" ? partial.budget : null,
    gaps: Array.isArray(partial.gaps) ? partial.gaps.map(String).slice(0, 8) : [],
    assetHash: String(partial.assetHash || "").slice(0, 16),
    settingsFp: String(partial.settingsFp || "").slice(0, 200),
    retry: {
      attempted: Boolean(partial.retry?.attempted),
      reason: partial.retry?.reason ? String(partial.retry.reason).slice(0, 80) : undefined,
    },
  };
}

/**
 * 补探：瞬时失败时在预算允许下再试 1 次
 * @template T
 * @param {() => Promise<T>} run
 * @param {{ canRetry: () => boolean }} opts
 * @returns {Promise<{ value: T|null, retryAttempted: boolean, error: unknown }>}
 */
async function runProbeWithRetry(run, opts) {
  try {
    return { value: await run(), retryAttempted: false, error: null };
  } catch (err) {
    if (!isTransientProbeError(err) || !opts.canRetry()) {
      return { value: null, retryAttempted: false, error: err };
    }
    try {
      return { value: await run(), retryAttempted: true, error: null };
    } catch (err2) {
      return { value: null, retryAttempted: true, error: err2 };
    }
  }
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.baseUrl
 * @param {string} opts.model
 * @param {string} opts.dataUrl
 * @param {string} [opts.stylePreset]
 * @param {string} [opts.locale] 界面语言（错误文案）
 * @param {string} [opts.promptLocale]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {AbortSignal} [opts.signal]
 * @param {string} [opts.medium] 可选：跳过自分类，直接注入该类
 * @param {Partial<typeof DEFAULT_REVERSE_BUDGET>} [opts.budget] 调用数 / 输出 token / 墙钟上限
 * @param {boolean} [opts.skipCache] 跳过同图反推缓存（强制重跑）
 * @param {(p: { phase: string, done: string[], callsUsed: number, callsMax: number, startedAt: number, gaps?: string[], pack?: object }) => void} [opts.onProgress]
 */
export async function reversePrompt({
  apiKey,
  baseUrl,
  model,
  dataUrl,
  stylePreset = "balanced",
  useCelebrityName = false,
  includeAnimeCharacter = false,
  locale = DEFAULT_LOCALE,
  promptLocale = "en",
  width = 0,
  height = 0,
  signal,
  medium: mediumOverride,
  budget: budgetOpts,
  skipCache = false,
  onProgress,
}) {
  const ui = normalizeLocale(locale);
  if (!_customVlmCompleter && !apiKey?.trim()) throw new Error(t(ui, "err.noApiKey"));
  if (!dataUrl) throw new Error(t(ui, "err.noImage"));

  const style = STYLE_PRESETS[stylePreset] || STYLE_PRESETS.balanced;
  const promptLang = String(promptLocale || "en").toLowerCase().startsWith("zh")
    ? "Simplified Chinese"
    : "English";

  let w = Number(width) || 0;
  let h = Number(height) || 0;
  if (w < 2 || h < 2) {
    const size = await readImageSize(dataUrl);
    w = size.width;
    h = size.height;
  }
  const ratioMeta = snapAspectRatio(w, h, promptLocale);

  const decomposeCtx = (pack) => ({
    ratioMeta,
    width: w,
    height: h,
    useCelebrityName: Boolean(useCelebrityName),
    includeAnimeCharacter: Boolean(includeAnimeCharacter),
    paletteGround: paletteGroundFromPack(pack),
  });

  const budget = createReverseBudget(
    {
      maxCalls: budgetOpts?.maxCalls ?? DEFAULT_SETTINGS.reverseMaxCalls,
      maxOutputTokens: budgetOpts?.maxOutputTokens ?? DEFAULT_SETTINGS.reverseMaxOutputTokens,
      wallClockMs: budgetOpts?.wallClockMs ?? DEFAULT_SETTINGS.reverseWallClockMs,
    },
    signal
  );

  const emit = (phase, done, gaps, pack) => {
    try {
      onProgress?.({
        phase,
        done,
        callsUsed: budget.calls,
        callsMax: budget.maxCalls,
        startedAt: Date.now() - budget.elapsedMs,
        gaps,
        ...(pack ? { pack } : {}),
      });
    } catch {
      /* 进度回调失败不影响主链路 */
    }
  };

  const promptFingerprint = fnv1aHex(composeBaselinePromptFingerprint(pickObservationSchema()));
  const settingsFp = buildSettingsFingerprint({
    model,
    baseUrl,
    stylePreset,
    promptLocale,
    pipelineVersion: PIPELINE_VERSION,
    promptFingerprint,
  });
  let assetHash = "";
  try {
    assetHash = await sha256HexFromDataUrl(dataUrl);
  } catch (err) {
    console.warn("[PromptLens] asset hash failed, skip cache:", err);
  }
  const cacheKey = assetHash ? buildCacheKey(assetHash, settingsFp) : "";

  try {
    if (cacheKey && !skipCache) {
      const cached = await getReverseCache(cacheKey);
      if (cached?.pack || cached?.observation) {
        await touchReverseCache(cacheKey);
        let packOut = cached.pack;
        const cachedPalette = String(cached.pack?.palette || "").trim();
        if (cached.observation && typeof cached.observation === "object") {
          try {
            packOut = lightNormalizePack(
              applyRatioLight(
                compilePackFromObservation(cached.observation, {
                  promptLocale,
                  ratioMeta,
                  stylePreset,
                  useCelebrityName: Boolean(useCelebrityName),
                  includeAnimeCharacter: Boolean(includeAnimeCharacter),
                  palette: cachedPalette,
                }),
                ratioMeta
              )
            );
          } catch {
            packOut = cached.pack;
          }
        }
        if (!String(packOut?.palette || "").trim()) {
          try {
            packOut = await groundPackToReferenceImage(packOut, dataUrl, { light: true });
          } catch (err) {
            console.warn("[PromptLens] cache groundPack failed:", err);
          }
        }
        emit("cache", ["cache"], [], packOut);
        const trace = normalizeReverseTrace({
          medium: mediumOverride
            ? legacyNormalizeMediumClass(mediumOverride)
            : cached.medium || "generic",
          fx: cached.traits?.fx ?? null,
          angle: cached.traits?.angle ?? null,
          light: cached.traits?.light ?? null,
          gaps: [],
          probed: false,
          phases: ["cache"],
          observationQuality: "ready",
        });
        const cachedObs = cached.observation ?? null;
        const packFinal = normalizePack(packOut);
        if (cacheKey && String(packFinal.palette || "").trim() && !cachedPalette) {
          await putReverseCache(cacheKey, {
            pack: packFinal,
            medium: cached.medium,
            traits: cached.traits,
            observation: cachedObs,
            grounded: true,
          });
        }
        return {
          pack: packFinal,
          trace,
          quality: "ready",
          observation: cachedObs,
          obsSummary: buildObsSummary(cachedObs),
          decomposition: cachedObs
            ? decomposeObservation(cachedObs, decomposeCtx(packFinal))
            : null,
        };
      }
    }

    // 1) 单次结构化基线（Pack + medium + FX/机位/光影 sidecar + observation）
    let pack;
    let traits;
    /** @type {unknown} */
    let observationRaw;
    try {
      const BASELINE_TOKENS = 2200;
      if (!budget.beginCall(BASELINE_TOKENS)) {
        throw new Error(t(ui, "err.modelEmpty"));
      }
      emit("baseline", [], undefined);

      const seedMedium = mediumOverride ? legacyNormalizeMediumClass(mediumOverride) : "generic";
      const systemPrompt = buildBaselineSystemPrompt();
      const schemaHint = pickObservationSchema();
      // 图片观察路径不再注入 LEGACY_MEDIUM_USER_HINTS（避免 phenotype / pack 方言污染）

      let usageBaseline = null;
      const text = await callChatCompletions({
        apiKey,
        baseUrl,
        model,
        temperature: 0.1,
        maxTokens: BASELINE_TOKENS,
        signal: budget.signal,
        locale: ui,
        onUsage: (u) => {
          usageBaseline = u;
        },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildBaselineUserText(schemaHint, {
                  seedMedium: mediumOverride ? seedMedium : "",
                }),
              },
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
              },
            ],
          },
        ],
      });
      budget.settleCall(usageBaseline, BASELINE_TOKENS);

      const parsed = parseStructuredBaseline(text);
      traits = parsed.traits;
      observationRaw = parsed.observationRaw;
      // 正交轴桥接旧 medium（override 优先）
      if (!mediumOverride && observationRaw && typeof observationRaw === "object") {
        const bridged = axesToLegacyMedium(/** @type {object} */ (observationRaw));
        traits = { ...traits, medium: legacyNormalizeMediumClass(bridged) };
      } else if (mediumOverride) {
        traits = { ...traits, medium: legacyNormalizeMediumClass(mediumOverride) };
      }
      // 期 3：Pack 由 observation 本地编译（忽略 VLM Pack 字段）
      const obsEarly = validateObservation(observationRaw);
      // 基线 VLM 已直接给出 finish_technique → 记入 traits，避免重复补探
      const earlyTech = coerceFinishTechnique(obsEarly.observation?.finish_technique);
      if (earlyTech && earlyTech !== "unknown") {
        traits = {
          ...traits,
          finishTechnique: {
            technique: earlyTech,
            confidence: "high",
            cues: "observe",
          },
        };
      }
      pack = compilePackFromObservation(obsEarly.observation, {
        promptLocale,
        ratioMeta,
        stylePreset,
        useCelebrityName: Boolean(useCelebrityName),
        includeAnimeCharacter: Boolean(includeAnimeCharacter),
      });
      pack = applyRatioLight(pack, ratioMeta);
      pack = lightNormalizePack(pack);
    } catch (err) {
      const incident = buildReverseIncident({
        phase: "baseline",
        error: err?.message || err,
        budget: budget.snapshot(),
        gaps: [],
        assetHash,
        settingsFp,
        retry: { attempted: false },
      });
      const e = err instanceof Error ? err : new Error(String(err));
      /** @type {Error & { incident?: object }} */ (e).incident = incident;
      throw e;
    }

    // 2) 本地校验
    const gaps = detectReverseGaps(pack, traits);
    // 基线已产出部分 Prompt：失败/取消时可保留
    emit("validate", ["baseline"], gaps, pack);

    // 3) 按需补探（受调用数 / token / 墙钟约束）
    // finish 探针仅需 ~60 token：外层门槛用 60，避免「只缺 finish」时被 120 门槛卡死
    let probed = false;
    if (gaps.length && budget.canAfford(60) && budget.remainingMs >= 4000) {
      const probeOpts = {
        apiKey,
        baseUrl,
        model,
        dataUrl,
        locale: ui,
        signal: budget.signal,
      };

      // finish 技法桶单独补探（不走 IMAGE_PREFLIGHT）
      const FINISH_PROBE_TOKENS = 60;
      if (
        gaps.includes("finish") &&
        budget.canAfford(FINISH_PROBE_TOKENS) &&
        budget.beginCall(FINISH_PROBE_TOKENS)
      ) {
        probed = true;
        emit("probe", ["baseline"], gaps, pack);
        const finishResult = await runProbeWithRetry(
          async () => {
            try {
              const value = await probeFinishTechnique(probeOpts);
              budget.settleCall({ completion_tokens: FINISH_PROBE_TOKENS }, FINISH_PROBE_TOKENS);
              return value;
            } catch (err) {
              budget.settleCall({ completion_tokens: FINISH_PROBE_TOKENS }, FINISH_PROBE_TOKENS);
              throw err;
            }
          },
          {
            canRetry: () => {
              if (!budget.canAfford(FINISH_PROBE_TOKENS)) return false;
              return budget.beginCall(FINISH_PROBE_TOKENS);
            },
          }
        );
        if (finishResult.value) {
          traits = { ...traits, finishTechnique: finishResult.value };
          emit("probe", ["baseline"], gaps, pack);
        } else if (finishResult.error) {
          console.warn("[PromptLens] finish technique probe failed:", finishResult.error);
        }
      }

      const otherGaps = gaps.filter((g) => g !== "finish");
      if (otherGaps.length >= 2 && budget.canAfford(280)) {
        const PROBE_TOKENS = 280;
        if (budget.beginCall(PROBE_TOKENS)) {
          probed = true;
          emit("probe", ["baseline"], gaps, pack);
          let usageProbe = null;
          let retryAttempted = false;
          const runOnce = async () => {
            usageProbe = null;
            try {
              const textProbe = await callChatCompletions({
                apiKey,
                baseUrl,
                model,
                temperature: 0,
                maxTokens: PROBE_TOKENS,
                signal: budget.signal,
                locale: ui,
                onUsage: (u) => {
                  usageProbe = u;
                },
                messages: [
                  { role: "system", content: IMAGE_PREFLIGHT_PROMPT },
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: `Supplemental probe for gaps: ${otherGaps.join(", ")}. JSON only.`,
                      },
                      { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
                    ],
                  },
                ],
              });
              budget.settleCall(usageProbe, PROBE_TOKENS);
              return normalizeImagePreflight(extractJsonObject(textProbe));
            } catch (err) {
              budget.settleCall(usageProbe, PROBE_TOKENS);
              throw err;
            }
          };
          const result = await runProbeWithRetry(runOnce, {
            canRetry: () => {
              if (!budget.canAfford(PROBE_TOKENS)) return false;
              return budget.beginCall(PROBE_TOKENS);
            },
          });
          retryAttempted = result.retryAttempted;
          if (result.value) {
            const extra = result.value;
            // 期 3：只更新 traits，结束时重编译 Pack
            if (otherGaps.includes("fx") && extra.fx) traits = { ...traits, fx: extra.fx };
            if (otherGaps.includes("angle") && extra.angle) traits = { ...traits, angle: extra.angle };
            if (otherGaps.includes("lighting") && extra.light) traits = { ...traits, light: extra.light };
            emit("probe", ["baseline"], gaps, pack);
          } else if (result.error) {
            console.warn("[PromptLens] supplemental preflight failed:", result.error);
          }
          void retryAttempted;
        }
      } else if (otherGaps.length === 1) {
        const gap = otherGaps[0];
        const PROBE_TOKENS = gap === "fx" ? 120 : 80;
        if (budget.beginCall(PROBE_TOKENS)) {
          probed = true;
          emit("probe", ["baseline"], gaps, pack);
          let retryAttempted = false;
          const runOnce = async () => {
            try {
              let value = null;
              if (gap === "angle") {
                value = await probeCameraAngle(probeOpts);
              } else if (gap === "lighting") {
                value = await probeLightingPattern(probeOpts);
              } else if (gap === "fx") {
                value = await probeGraphicFx(probeOpts);
              }
              budget.settleCall({ completion_tokens: PROBE_TOKENS }, PROBE_TOKENS);
              return value;
            } catch (err) {
              budget.settleCall({ completion_tokens: PROBE_TOKENS }, PROBE_TOKENS);
              throw err;
            }
          };
          const result = await runProbeWithRetry(runOnce, {
            canRetry: () => {
              if (!budget.canAfford(PROBE_TOKENS)) return false;
              return budget.beginCall(PROBE_TOKENS);
            },
          });
          retryAttempted = result.retryAttempted;
          if (result.value) {
            if (gap === "angle") traits = { ...traits, angle: result.value };
            else if (gap === "lighting") traits = { ...traits, light: result.value };
            else if (gap === "fx") traits = { ...traits, fx: result.value };
            emit("probe", ["baseline"], gaps, pack);
          } else if (result.error) {
            console.warn("[PromptLens] supplemental probe failed:", result.error);
          }
          void retryAttempted;
        }
      }
    }

    // 4) 探针写回 observation 后重编译；轻量清洗 + 色板锚定
    const phases = ["baseline", "validate", ...(probed ? ["probe"] : []), "compile", "ground"];
    const obsResult = validateObservation(observationRaw);
    const quality = obsResult.quality;
    /** @type {object|null} */
    let obsForCompile = obsResult.observation ? { ...obsResult.observation } : null;
    if (obsForCompile) {
      if (traits?.angle?.angle && traits.angle.angle !== "unknown") {
        obsForCompile.camera = {
          angle: traits.angle.angle,
          confidence: traits.angle.confidence || "high",
          evidence: String(traits.angle.cues || "probe").slice(0, 120),
          ...(traits.angle.vantage
            ? { vantage: traits.angle.vantage }
            : obsForCompile.camera?.vantage
              ? { vantage: obsForCompile.camera.vantage }
              : {}),
          ...(traits.angle.lens_feel
            ? { lens_feel: traits.angle.lens_feel }
            : obsForCompile.camera?.lens_feel
              ? { lens_feel: obsForCompile.camera.lens_feel }
              : {}),
        };
      } else if (traits?.angle?.vantage === "worms_eye" || traits?.angle?.lens_feel) {
        obsForCompile.camera = {
          ...(obsForCompile.camera || {}),
          angle: obsForCompile.camera?.angle || "low_angle",
          confidence: traits.angle.confidence || obsForCompile.camera?.confidence || "high",
          evidence: String(
            traits.angle.cues || obsForCompile.camera?.evidence || "probe"
          ).slice(0, 120),
          ...(traits.angle.vantage ? { vantage: traits.angle.vantage } : {}),
          ...(traits.angle.lens_feel ? { lens_feel: traits.angle.lens_feel } : {}),
        };
      }
      // pattern 未知时仍可写回 beams/key_side 等正交轴
      if (
        traits?.light &&
        ((traits.light.pattern && traits.light.pattern !== "unknown") ||
          traits.light.beams === "god_rays" ||
          traits.light.key_side ||
          traits.light.source ||
          traits.light.quality ||
          traits.light.climate ||
          (traits.light.exposure && traits.light.exposure !== "unknown"))
      ) {
        const pattern =
          traits.light.pattern && traits.light.pattern !== "unknown"
            ? traits.light.pattern
            : obsForCompile.lighting?.pattern && obsForCompile.lighting.pattern !== "unknown"
              ? obsForCompile.lighting.pattern
              : "directional";
        obsForCompile.lighting = {
          pattern,
          confidence: traits.light.confidence || "high",
          evidence: String(traits.light.cues || obsForCompile.lighting?.evidence || "probe").slice(
            0,
            120
          ),
          ...(traits.light.exposure && traits.light.exposure !== "unknown"
            ? { exposure: traits.light.exposure }
            : obsForCompile.lighting?.exposure
              ? { exposure: obsForCompile.lighting.exposure }
              : {}),
          ...(traits.light.key_side
            ? { key_side: traits.light.key_side }
            : obsForCompile.lighting?.key_side
              ? { key_side: obsForCompile.lighting.key_side }
              : {}),
          ...(traits.light.source
            ? { source: traits.light.source }
            : obsForCompile.lighting?.source
              ? { source: obsForCompile.lighting.source }
              : {}),
          ...(traits.light.quality
            ? { quality: traits.light.quality }
            : obsForCompile.lighting?.quality
              ? { quality: obsForCompile.lighting.quality }
              : {}),
          ...(traits.light.climate
            ? { climate: traits.light.climate }
            : obsForCompile.lighting?.climate
              ? { climate: obsForCompile.lighting.climate }
              : {}),
          ...(traits.light.beams
            ? { beams: traits.light.beams }
            : obsForCompile.lighting?.beams
              ? { beams: obsForCompile.lighting.beams }
              : {}),
        };
      }
      if (traits?.fx?.family) {
        obsForCompile.fx = {
          family: traits.fx.family,
          confidence: "high",
          evidence: "probe",
        };
      }
      // 技法探针写回 finish 头部
      if (
        traits?.finishTechnique?.technique &&
        traits.finishTechnique.technique !== "unknown" &&
        traits.finishTechnique.confidence !== "low"
      ) {
        obsForCompile.finish = applyFinishTechniqueBand(
          obsForCompile.finish,
          traits.finishTechnique.technique,
          traits.finishTechnique.cues
        );
        // 扁平角形卡通：轴落到 flat_graphic，避免被当 soft anime illustration
        if (traits.finishTechnique.technique === "flat_cartoon") {
          obsForCompile.render_family = "flat_graphic";
        }
      }
      pack = applyRatioLight(
        compilePackFromObservation(obsForCompile, {
          promptLocale,
          ratioMeta,
          stylePreset,
          useCelebrityName: Boolean(useCelebrityName),
          includeAnimeCharacter: Boolean(includeAnimeCharacter),
        }),
        ratioMeta
      );
    }
    pack = lightNormalizePack(pack);
    emit("ground", ["baseline", "validate", ...(probed ? ["probe"] : []), "compile"], gaps, pack);
    const trace = normalizeReverseTrace({
      medium: traits.medium,
      fx: traits.fx,
      angle: traits.angle,
      light: traits.light,
      finishTechnique: traits.finishTechnique ?? null,
      gaps,
      probed,
      phases,
      observationQuality: quality,
      observationErrors: obsResult.errors,
    });
    try {
      const grounded = await groundPackToReferenceImage(pack, dataUrl, { light: true });
      console.debug("[PromptLens] reverse budget", budget.snapshot(), {
        gaps,
        probed,
        quality,
        obsErrors: obsResult.errors.slice(0, 6),
      });
      // 仅 ready 入缓存，避免脏观察被复用
      if (cacheKey && quality === "ready") {
        await putReverseCache(cacheKey, {
          pack: grounded,
          medium: traits.medium,
          traits,
          observation: obsResult.observation,
          grounded: true,
        });
      }
      return {
        pack: grounded,
        trace,
        quality,
        observation: obsResult.observation,
        obsSummary: buildObsSummary(obsResult.observation),
        decomposition: decomposeObservation(obsResult.observation, decomposeCtx(grounded)),
      };
    } catch (err) {
      console.warn("[PromptLens] groundPack failed, keep merged pack:", err);
      if (cacheKey && quality === "ready") {
        await putReverseCache(cacheKey, {
          pack,
          medium: traits.medium,
          traits,
          observation: obsResult.observation,
          grounded: true,
        });
      }
      return {
        pack,
        trace,
        quality,
        observation: obsResult.observation,
        obsSummary: buildObsSummary(obsResult.observation),
        decomposition: decomposeObservation(obsResult.observation, decomposeCtx(pack)),
      };
    }
  } finally {
    budget.dispose();
  }
}

const REPROBE_FIELDS = new Set(["camera", "style", "layout"]);

function reprobeUserPrompt(field) {
  if (field === "camera") {
    return [
      "Re-observe CAMERA ANGLE and LIGHTING only on THIS image.",
      "KEY DIRECTION (lighting.key_side) REQUIRED when readable: overhead = top/ceiling key with under-chin shadows; camera_left/camera_right = side key from that camera side. Name KEY origin, not the dark cheek. FORBIDDEN omitting overhead for clear top light.",
      "JSON only:",
      '{"camera":{"angle":"eye_level|high_angle|low_angle|top_down|orthographic|unknown","confidence":"high|medium|low","evidence":"cue"},"lighting":{"pattern":"blinds_slat|dappled_foliage|backlight_rim|split_chiaroscuro|directional|flash|soft_even|unknown","exposure":"high_key|low_key|balanced|unknown","key_side":"camera_left|camera_right|overhead|unknown","source":"studio|natural|mixed","quality":"hard|soft","climate":"daylight|overcast|golden_hour|cool_skylight|tungsten","confidence":"high|medium|low","evidence":"cue"}}',
    ].join("\n");
  }
  if (field === "style") {
    return [
      "Re-observe STYLE / MEDIUM / FX only on THIS image.",
      "finish REQUIRED when illustration: first token anime|manga|painted|sketch|other, then 5–8 precise tokens.",
      "sketch fidelity: rough gestural | study/WIP | stylized character graphite (manga-proportion) | line art / 线稿 | academic refined | near-photoreal graphite — never bare sketch. When outline-led 线稿, MUST include token line art.",
      "painted fidelity: flat gouache | soft digital paint | oil impasto | painterly speed-paint | sumi-e ink-wash digital | watercolor wash | graphic novel ink (dense crosshatch + color wash) — never default soft blended shading.",
      "Discriminate: warm oil/impasto + opaque brush vortex ≠ sumi-e sparse paper white + calligraphic ink splash. Dense color crosshatch graphic novel ≠ watercolor painting only ≠ B&W screentone manga ≠ american superhero bold ink.",
      "anime/manga TECHNIQUE BUCKET: line_art | hard_cel | ink_print | soft_color_draw | flat_cartoon | tonal_sketch — never invent shonen/shojo as technique; FORBIDDEN rewriting flat angular cartoon as soft anime; never default semi-realistic soft blend.",
      "Checklist when readable: technique band, tool/material, line/edge, shading/tone, chroma/climate, highlight/specular, paper/surface, background mark language, mixed marks.",
      "FORBIDDEN vague-only: artistic, epic, detailed illustration, painterly alone, ink style alone.",
      "JSON only:",
      '{"render_family":"photo|cgi|illustration|flat_graphic|watercolor|infographic|unknown","capture_style":"flash|studio|cinematic|documentary|product_shot|none|unknown","content_type":"portrait|product|scene|poster|ui|abstract|other","presentation":"full_bleed|framed|collage|mockup|plain|unknown","finish":"sketch|painted|anime|manga|other, then 5-8 precise technique/material/edge/tone/chroma/bg-mark tokens as seen","fx":{"family":"motion_blur|double_exposure|optical_bokeh|volumetric_wrap|none|other","confidence":"high|medium|low","evidence":"cue"}}',
    ].join("\n");
  }
  return [
    "Re-observe SUBJECTS, OBJECTS, REGIONS, TYPOGRAPHY as seen on THIS image.",
    "Typography lettering REQUIRED when readable: sans|serif|script|display|mono. FORBIDDEN collapsing handwritten/cursive/signature into serif.",
    "JSON only:",
    '{"subjects":[{"id":"s1","label":"short","placement":"mid-left","facing":"front|profile-left|profile-right|three-quarter|back|unknown","pose":"seated|standing|kneeling|lying|leaning|crouching|riding|walking|airborne|unknown","arm_pose":"at_sides|crossed|behind_back|on_hips|clasped_front|raised|in_pockets|drawing_weapon|two_hand_grip|one_hand_weapon","action":"short concrete torso/limb action when dynamic","support":"as seen","age":"infant|toddler|child|early_teens|late_teens|early_20s|mid_20s|late_20s|early_30s|mid_30s|late_30s|early_40s|mid_40s|late_40s|early_50s|mid_50s|late_50s|early_60s|mid_60s|late_60s|seventies_plus","species":"human|dog|cat|wolf|fox|bird|horse|cattle|rabbit|dragon|other","phenotype":"east_asian|southeast_asian|south_asian|west_asian|north_african|black_african|european|latino|indigenous","build":"lean|average|athletic|lean_muscular|muscular|bulky|heavy|stocky","stature":"short|average|tall","facial_hair":"none|stubble|mustache|goatee|short_beard|full_beard","hair":"length + wave + color + style/part/bangs as seen","eyes":"iris when readable","shot_scale":"extreme_closeup|closeup|bust|waist|full_body|wide","crop":"edge cut as seen","expression":"brow/eye facts","mouth":"closed|pursed|parted|open_teeth","lip_finish":"matte|satin|gloss|wet_gloss","blush":"none|soft|heavy","makeup":"short distinctive marks","skin_finish":"pore_detail|natural|soft_focus|dewy_beauty|airbrushed","skin_tone":"fair|light|mid|tan|deep","skin_undertone":"cool|warm|neutral","identity_guess":{"name":"public figure or anime character if clear","kind":"celebrity|anime","confidence":"high|medium|low"},"wardrobe":"as seen","confidence":"high|medium|low","evidence":"cue"}],"objects":[{"id":"o1","label":"short","placement":"mid-center","color":"true hue for a small brand mark","relation":"held by s1 / leaning against s2 / worn on back of s1 / none","confidence":"high|medium|low","evidence":"cue"}],"regions":[],"typography":[{"text":"OCR glyphs","role":"title|caption|logo|garment_print|prop_print|other","on":"s2 for prints on a person; o1 for a bag/prop; null for frame titles","placement":"","lettering":"sans|serif|script|display|mono","weight":"thin|regular|bold|black","confidence":"high|medium|low","evidence":"cue"}]}',
    "Do not invent. Empty arrays if unreadable.",
  ].join("\n");
}

/** 测试/调试：导出复探用户提示 */
export { reprobeUserPrompt };

/**
 * 定点复探单个 Pack 字段（独立小预算，不重跑整图反推）
 * @param {{
 *   apiKey: string,
 *   baseUrl?: string,
 *   model?: string,
 *   dataUrl: string,
 *   field: string,
 *   currentObservation: object,
 *   locale?: string,
 *   promptLocale?: string,
 *   stylePreset?: string,
 *   useCelebrityName?: boolean,
 *   width?: number,
 *   height?: number,
 *   signal?: AbortSignal,
 * }} opts
 */
export async function reprobeField({
  apiKey,
  baseUrl,
  model,
  dataUrl,
  field,
  currentObservation,
  locale = DEFAULT_LOCALE,
  promptLocale = "en",
  stylePreset = "balanced",
  useCelebrityName = false,
  includeAnimeCharacter = false,
  width = 0,
  height = 0,
  signal,
}) {
  const ui = normalizeLocale(locale);
  const key = String(field || "");
  if (!REPROBE_FIELDS.has(key)) throw new Error(t(ui, "err.reprobeFail"));
  if (!_customVlmCompleter && !apiKey?.trim()) throw new Error(t(ui, "err.noApiKey"));
  if (!dataUrl) throw new Error(t(ui, "err.noImage"));
  if (!currentObservation || typeof currentObservation !== "object") {
    throw new Error(t(ui, "err.reprobeNoObs"));
  }

  const budget = createReverseBudget(
    { maxCalls: 1, maxOutputTokens: 600, wallClockMs: 15000 },
    signal
  );
  try {
    const TOKENS = 600;
    if (!budget.beginCall(TOKENS)) throw new Error(t(ui, "err.reverseTimeout"));
    let usage = null;
    let text;
    try {
      text = await callChatCompletions({
        apiKey,
        baseUrl,
        model,
        temperature: 0,
        maxTokens: TOKENS,
        signal: budget.signal,
        locale: ui,
        onUsage: (u) => {
          usage = u;
        },
        messages: [
          { role: "system", content: "You re-observe ONE image slice. SEE-ONLY. JSON only. No markdown." },
          {
            role: "user",
            content: [
              { type: "text", text: reprobeUserPrompt(key) },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
          },
        ],
      });
    } catch (err) {
      budget.settleCall(usage, TOKENS);
      if (isReverseWallClockError(err)) throw new Error(t(ui, "err.reverseTimeout"));
      throw err;
    }
    budget.settleCall(usage, TOKENS);

    const patch = extractJsonObject(text);
    const merged = mergeObservationField(currentObservation, /** @type {"camera"|"style"|"layout"} */ (key), patch);
    const obsResult = validateObservation(merged);
    if (!obsResult.observation) throw new Error(t(ui, "err.modelEmpty"));

    let w = Number(width) || 0;
    let h = Number(height) || 0;
    if (w < 2 || h < 2) {
      const size = await readImageSize(dataUrl);
      w = size.width;
      h = size.height;
    }
    const ratioMeta = snapAspectRatio(w, h, promptLocale);
    let pack = compilePackFromObservation(obsResult.observation, {
      promptLocale,
      ratioMeta,
      stylePreset,
      useCelebrityName: Boolean(useCelebrityName),
      includeAnimeCharacter: Boolean(includeAnimeCharacter),
    });
    pack = applyRatioLight(pack, ratioMeta);
    pack = lightNormalizePack(pack);
    try {
      pack = await groundPackToReferenceImage(pack, dataUrl, { light: true });
    } catch (err) {
      console.warn("[PromptLens] reprobe groundPack failed:", err);
    }
    return {
      pack,
      observation: obsResult.observation,
      obsSummary: buildObsSummary(obsResult.observation),
      quality: obsResult.quality === "invalid" ? "invalid" : "ready",
    };
  } finally {
    budget.dispose();
  }
}

/**
 * 只观察：同 schema baseline，不 compile / 不 probe / 不写主反推缓存
 * @returns {Promise<{ observation: object|null, quality: string, errors: string[], traits: object }>}
 */
export async function observeImageOnly({
  apiKey,
  baseUrl,
  model,
  dataUrl,
  locale = DEFAULT_LOCALE,
  signal,
  medium: mediumOverride,
}) {
  const ui = normalizeLocale(locale);
  if (!_customVlmCompleter && !apiKey?.trim()) throw new Error(t(ui, "err.noApiKey"));
  if (!dataUrl) throw new Error(t(ui, "err.noImage"));

  const seedMedium = mediumOverride ? legacyNormalizeMediumClass(mediumOverride) : "generic";
  const systemPrompt = buildBaselineSystemPrompt();
  const schemaHint = pickObservationSchema();
  const BASELINE_TOKENS = 2200;

  const text = await callChatCompletions({
    apiKey,
    baseUrl,
    model,
    temperature: 0.1,
    maxTokens: BASELINE_TOKENS,
    signal,
    locale: ui,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildBaselineUserText(schemaHint, {
              seedMedium: mediumOverride ? seedMedium : "",
            }),
          },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
  });

  const parsed = parseStructuredBaseline(text);
  let traits = parsed.traits;
  if (!mediumOverride && parsed.observationRaw && typeof parsed.observationRaw === "object") {
    const bridged = axesToLegacyMedium(/** @type {object} */ (parsed.observationRaw));
    traits = { ...traits, medium: legacyNormalizeMediumClass(bridged) };
  } else if (mediumOverride) {
    traits = { ...traits, medium: legacyNormalizeMediumClass(mediumOverride) };
  }

  const obsResult = validateObservation(parsed.observationRaw);
  return {
    observation: obsResult.observation,
    quality: obsResult.quality,
    errors: obsResult.errors || [],
    traits,
  };
}

/**
 * 从 baseline JSON 取出 observation（支持嵌套或顶层摊平）
 * @param {unknown} obj
 */
export function extractObservationRaw(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (o.observation && typeof o.observation === "object" && !Array.isArray(o.observation)) {
    return o.observation;
  }
  // 顶层摊平：含 render_family / subjects 等则整包当作 observation
  if (
    "render_family" in o ||
    "renderFamily" in o ||
    "subjects" in o ||
    "objects" in o ||
    "typography" in o
  ) {
    const skip = new Set(["medium", "fx", "angle", "lighting", "elements", "positive", "negative", "style", "layout", "palette", "ratio", "camera"]);
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      if (skip.has(k)) continue;
      out[k] = v;
    }
    // 顶层 camera/lighting/fx sidecar 也可并入 observation
    if (o.camera && typeof o.camera === "object") out.camera = o.camera;
    if (o.lighting && typeof o.lighting === "object") out.lighting = o.lighting;
    if (o.fx && typeof o.fx === "object" && !Array.isArray(o.fx)) out.fx = o.fx;
    return out;
  }
  return undefined;
}

/**
 * 解析结构化基线：Pack 字段 + 探针 sidecar + observation
 * @param {string} text
 * @returns {{ pack: ReturnType<typeof normalizePack>, traits: ImagePreflight, observationRaw: unknown }}
 */
export function parseStructuredBaseline(text) {
  try {
    const obj = extractJsonObject(text);
    return {
      pack: normalizePack(obj),
      traits: normalizeImagePreflight(obj),
      observationRaw: resolveObservationRaw(obj),
    };
  } catch {
    return {
      pack: parsePromptPack(text),
      traits: normalizeImagePreflight({}),
      observationRaw: undefined,
    };
  }
}

/**
 * 见闻 JSON 本地入桶；旧 observation 形状走诚实门
 * @param {unknown} obj
 */
function resolveObservationRaw(obj) {
  if (isSightPayload(obj)) return fillObservationFromSight(obj);
  const raw = extractObservationRaw(obj);
  return raw ? applyHonestyGates(raw) : undefined;
}

/**
 * @typedef {{
 *   medium: string,
 *   fx: GraphicFxProbe | null,
 *   angle: { angle: CameraAngleClass, confidence: "high"|"medium"|"low", cues: string } | null,
 *   light: { pattern: string, confidence: "high"|"medium"|"low", cues: string } | null,
 *   finishTechnique: FinishTechniqueProbe | null,
 *   gaps: Array<"angle"|"lighting"|"fx"|"finish">,
 *   probed: boolean,
 *   phases: string[],
 *   observationQuality?: "ready"|"partial"|"invalid"| "",
 *   observationErrors?: string[],
 * }} ReverseTrace
 */

/**
 * 规范化反推痕迹（供 UI / 历史落盘；裁短 cues）
 * @param {Partial<ReverseTrace> | null | undefined} raw
 * @returns {ReverseTrace}
 */
export function normalizeReverseTrace(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const gapSet = new Set(["angle", "lighting", "fx", "finish"]);
  const gaps = Array.isArray(o.gaps)
    ? o.gaps
        .filter((g) => gapSet.has(String(g)))
        .map((g) => /** @type {"angle"|"lighting"|"fx"|"finish"} */ (String(g)))
    : [];
  const phases = Array.isArray(o.phases)
    ? o.phases.map((p) => String(p || "").slice(0, 24)).filter(Boolean).slice(0, 8)
    : [];
  const fx = o.fx ? normalizeGraphicFxProbe(o.fx) : null;
  const angle = o.angle ? normalizeCameraAngleProbe(o.angle) : null;
  const light = o.light ? normalizeLightingPatternProbe(o.light) : null;
  const finishTechnique = o.finishTechnique
    ? normalizeFinishTechniqueProbe(o.finishTechnique)
    : null;
  // cues 落盘截断，避免历史膨胀
  if (angle?.cues) angle.cues = String(angle.cues).slice(0, 80);
  if (light?.cues) light.cues = String(light.cues).slice(0, 80);
  if (finishTechnique?.cues) finishTechnique.cues = String(finishTechnique.cues).slice(0, 80);
  if (fx) {
    fx.sharpRegion = String(fx.sharpRegion || "").slice(0, 64);
    fx.softRegion = String(fx.softRegion || "").slice(0, 64);
  }
  const qRaw = String(o.observationQuality || "").trim();
  const observationQuality =
    qRaw === "ready" || qRaw === "partial" || qRaw === "invalid" ? qRaw : "";
  const observationErrors = Array.isArray(o.observationErrors)
    ? o.observationErrors.map((e) => String(e || "").slice(0, 64)).filter(Boolean).slice(0, 16)
    : [];
  return {
    medium: legacyNormalizeMediumClass(o.medium),
    fx,
    angle,
    light,
    finishTechnique,
    gaps,
    probed: Boolean(o.probed),
    phases,
    observationQuality,
    observationErrors,
  };
}

/**
 * 统一解包 reversePrompt / reverseVideoPrompt 返回值（兼容旧「只回 pack」）
 * @param {unknown} result
 * @returns {{
 *   pack: ReturnType<typeof normalizePack>,
 *   trace: ReverseTrace | null,
 *   quality: "ready"|"partial"|"invalid",
 *   observation: object|null,
 *   obsSummary: object|null,
 * }}
 */
export function unwrapReverseResult(result) {
  if (result && typeof result === "object" && "pack" in /** @type {object} */ (result)) {
    const r = /** @type {{ pack: unknown, trace?: unknown, quality?: string, observation?: unknown, obsSummary?: unknown }} */ (result);
    const q = String(r.quality || "").trim();
    const quality =
      q === "partial" || q === "invalid" || q === "ready"
        ? /** @type {"ready"|"partial"|"invalid"} */ (q)
        : "ready";
    const observation = r.observation && typeof r.observation === "object" ? r.observation : null;
    const obsSummary =
      r.obsSummary && typeof r.obsSummary === "object"
        ? r.obsSummary
        : buildObsSummary(observation);
    return {
      pack: normalizePack(r.pack),
      trace: r.trace ? normalizeReverseTrace(/** @type {Partial<ReverseTrace>} */ (r.trace)) : null,
      quality,
      observation,
      obsSummary,
    };
  }
  return { pack: normalizePack(result), trace: null, quality: "ready", observation: null, obsSummary: null };
}


/**
 * 为每镜选代表帧（优先 frameMeta 中间条目）
 * @param {string[]} frames
 * @param {{ t: number, shotIndex: number }[]} frameMeta
 * @param {{ index: number, tStart: number, tEnd: number }[]} shotBounds
 */
function pickRepFramesForShots(frames, frameMeta, shotBounds) {
  const reps = [];
  for (const bound of shotBounds) {
    const idxs = [];
    for (let i = 0; i < frameMeta.length; i++) {
      if (frameMeta[i]?.shotIndex === bound.index) idxs.push(i);
    }
    let pick = idxs.length ? idxs[Math.floor(idxs.length / 2)] : 0;
    if (pick >= frames.length) pick = 0;
    reps.push({
      dataUrl: frames[pick],
      t: frameMeta[pick]?.t ?? bound.tStart,
      shotIndex: bound.index,
      tStart: bound.tStart,
      tEnd: bound.tEnd,
    });
  }
  return reps;
}

/**
 * 构建带帧标注的用户消息 content 数组
 * @param {string[]} frames
 * @param {{ t: number, shotIndex: number }[]} [frameMeta]
 * @param {string[]} [extraLines]
 */
function buildVideoFrameContent(frames, frameMeta, extraLines = []) {
  const meta =
    Array.isArray(frameMeta) && frameMeta.length === frames.length
      ? frameMeta
      : frames.map(() => ({ t: 0, shotIndex: 1 }));
  const labelLines = meta.map(
    (m, i) => `Frame t=${Number(m.t || 0).toFixed(2)}s shot=${m.shotIndex || 1} (image ${i + 1})`
  );
  const text = [...extraLines, "Frame list (time order):", ...labelLines].filter(Boolean).join("\n");
  return [
    { type: "text", text },
    ...frames.map((dataUrl) => ({
      type: "image_url",
      image_url: { url: dataUrl, detail: "high" },
    })),
  ];
}

/**
 * Stage A：分镜结构轻量抽取
 * @param {object} opts
 */
async function structureVideoShots({
  apiKey,
  baseUrl,
  model,
  frames,
  frameMeta,
  shotBounds,
  durationSec,
  locale = DEFAULT_LOCALE,
  signal,
}) {
  const ui = normalizeLocale(locale);
  const meta = Array.isArray(frameMeta) ? frameMeta : [];
  const reps = pickRepFramesForShots(frames, meta, shotBounds);
  const dur = Math.max(0, Number(durationSec) || 0);
  const boundsLines = shotBounds.map(
    (b) => `Shot ${b.index}: ${b.tStart.toFixed(2)}s–${b.tEnd.toFixed(2)}s`
  );
  const frameLines = reps.map(
    (r, i) =>
      `Image ${i + 1}: shot=${r.shotIndex} t=${r.t.toFixed(2)}s (representative for shot ${r.shotIndex})`
  );
  const content = [
    {
      type: "text",
      text: [
        `VIDEO duration ≈ ${dur.toFixed(2)}s; ${shotBounds.length} shots.`,
        "Shot bounds:",
        ...boundsLines,
        "Representative frames (one per shot):",
        ...frameLines,
        "Return structure JSON only.",
      ].join("\n"),
    },
    ...reps.map((r) => ({
      type: "image_url",
      image_url: { url: r.dataUrl, detail: "high" },
    })),
  ];
  const text = await callChatCompletions({
    apiKey,
    baseUrl,
    model,
    temperature: 0.1,
    maxTokens: 1200,
    signal,
    locale: ui,
    messages: [
      { role: "system", content: VIDEO_STRUCTURE_SYSTEM_PROMPT },
      { role: "user", content },
    ],
  });
  const obj = extractJsonObject(text);
  return {
    shots: Array.isArray(obj.shots) ? obj.shots : [],
    styleHint: String(obj.styleHint || "").trim(),
  };
}

/**
 * Stage B：完整 Prompt Pack 抽取（含 motion / shots）
 * @param {object} opts
 */
async function fillVideoPack({
  apiKey,
  baseUrl,
  model,
  frames,
  frameMeta,
  shotBounds,
  durationSec = 0,
  stylePreset = "balanced",
  locale = DEFAULT_LOCALE,
  promptLocale = "en",
  width = 0,
  height = 0,
  signal,
  medium,
  structure = null,
  requireShots = false,
}) {
  const ui = normalizeLocale(locale);
  const list = Array.isArray(frames)
    ? frames.filter((u) => typeof u === "string" && u.startsWith("data:"))
    : [];
  const style = STYLE_PRESETS[stylePreset] || STYLE_PRESETS.balanced;
  const promptLang = String(promptLocale || "en").toLowerCase().startsWith("zh")
    ? "Simplified Chinese"
    : "English";

  let w = Number(width) || 0;
  let h = Number(height) || 0;
  if (w < 2 || h < 2) {
    const size = await readImageSize(list[0]);
    w = size.width;
    h = size.height;
  }
  const ratioMeta = snapAspectRatio(w, h, promptLocale);
  const dur = Math.max(0, Number(durationSec) || 0);
  const bounds = Array.isArray(shotBounds) && shotBounds.length ? shotBounds : [];

  const mediumModule = LEGACY_MEDIUM_MODULES[medium] || LEGACY_MEDIUM_MODULES.generic;
  const classHint = LEGACY_MEDIUM_USER_HINTS[medium] || LEGACY_MEDIUM_USER_HINTS.generic;
  const systemPrompt = `${VIDEO_SYSTEM_PROMPT}\n\n${mediumModule}`;

  const extraLines = [
    `Preclassified medium (from first frame): ${medium}`,
    classHint,
    LEGACY_DETAIL_CHECKLIST,
    `Style bias (secondary to fidelity): ${style.hint}`,
    `Prompt language: write positive, negative, style, layout, palette, camera, motion, and ratio descriptions in ${promptLang}.`,
    "Keep --ar W:H and palette hex in ASCII.",
    `VIDEO META: duration ≈ ${dur.toFixed(2)}s; keyframe count = ${list.length}; frames are in time order (first → last).`,
    ratioMeta
      ? `MEASURED frame size: ${ratioMeta.exact}px. MUST set ratio to "${ratioMeta.ratioLine}" and append ", ${ratioMeta.promptToken}" at end of positive.`
      : "Aspect ratio unknown; estimate only if obvious.",
    "Analyze ALL frames together. motion must reflect observable change only — no invented dialogue or off-screen plot.",
    "Follow the injected MEDIUM MODULE for look/capture.",
  ];

  if (bounds.length) {
    extraLines.push(
      "Shot bounds:",
      ...bounds.map((b) => `  Shot ${b.index}: ${b.tStart.toFixed(2)}s–${b.tEnd.toFixed(2)}s`)
    );
  }

  if (structure?.shots?.length) {
    extraLines.push(
      "Stage A structure (use as guide for per-shot motion/layout/camera/content):",
      JSON.stringify(structure.shots)
    );
    if (structure.styleHint) extraLines.push(`Style hint: ${structure.styleHint}`);
  }

  if (requireShots) {
    extraLines.push(
      `MUST include shots[] with exactly ${bounds.length || 1} entries; per-shot motion is mandatory for each shot.`,
      "Return the Prompt Pack JSON only."
    );
  } else {
    extraLines.push("Return the Prompt Pack JSON only (shots[] optional).");
  }

  const content = buildVideoFrameContent(list, frameMeta, extraLines);

  const text = await callChatCompletions({
    apiKey,
    baseUrl,
    model,
    temperature: 0.1,
    maxTokens: 3200,
    signal,
    locale: ui,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
  });

  const pack = applyRatioToPack(parsePromptPack(text), ratioMeta);
  // 视频：用首帧/代表帧像素锚定色板
  const refFrame = list?.[0] || "";
  return refFrame ? groundPackToReferenceImage(pack, refFrame) : pack;
}

/**
 * 视频反推：多帧两阶段（结构 → 保真）；单镜一次调用；Stage A 失败降级
 * @param {{ apiKey: string, baseUrl?: string, model?: string, frames: string[], durationSec?: number, stylePreset?: string, locale?: string, promptLocale?: string, width?: number, height?: number, signal?: AbortSignal, medium?: string, frameMeta?: { t: number, shotIndex: number }[], shotBounds?: { index: number, tStart: number, tEnd: number }[], onProgress?: (p: { phase: string, done: string[], callsUsed: number, callsMax: number, startedAt: number, pack?: object }) => void }} opts
 */
export async function reverseVideoPrompt({
  apiKey,
  baseUrl,
  model,
  frames,
  durationSec = 0,
  stylePreset = "balanced",
  locale = DEFAULT_LOCALE,
  promptLocale = "en",
  width = 0,
  height = 0,
  signal,
  medium: mediumOverride,
  frameMeta,
  shotBounds,
  onProgress,
}) {
  const ui = normalizeLocale(locale);
  if (!_customVlmCompleter && !apiKey?.trim()) throw new Error(t(ui, "err.noApiKey"));
  const list = Array.isArray(frames) ? frames.filter((u) => typeof u === "string" && u.startsWith("data:")) : [];
  if (!list.length) throw new Error(t(ui, "err.noVideoFrames"));

  const bounds =
    Array.isArray(shotBounds) && shotBounds.length
      ? shotBounds
      : [{ index: 1, tStart: 0, tEnd: Number(durationSec) || 0 }];

  const meta = Array.isArray(frameMeta) ? frameMeta : [];
  const multi = bounds.length > 1;
  const callsMax = multi ? 3 : 2;
  const startedAt = Date.now();
  /** @param {string} phase @param {string[]} done @param {number} callsUsed @param {object} [pack] */
  const emit = (phase, done, callsUsed, pack) => {
    try {
      onProgress?.({
        phase,
        done,
        callsUsed,
        callsMax,
        startedAt,
        ...(pack ? { pack } : {}),
      });
    } catch {
      /* ignore */
    }
  };

  // 用首帧预分类，注入同类介质模块
  emit("classify", [], 1);
  const medium = mediumOverride
    ? legacyNormalizeMediumClass(mediumOverride)
    : await classifyImageMedium({ apiKey, baseUrl, model, dataUrl: list[0], locale: ui, signal });

  const common = {
    apiKey,
    baseUrl,
    model,
    frames: list,
    frameMeta: meta,
    shotBounds: bounds,
    durationSec,
    stylePreset,
    locale: ui,
    promptLocale,
    width,
    height,
    signal,
    medium,
  };

  // 单镜：一次保真调用，补齐 shots[1]
  if (!multi) {
    emit("fidelity", ["classify"], 2);
    const pack = await fillVideoPack({ ...common, requireShots: true });
    if (!pack.shots.length) {
      pack.shots = normalizeShots([
        {
          index: 1,
          tStart: bounds[0].tStart,
          tEnd: bounds[0].tEnd,
          motion: pack.motion,
        },
      ]);
    }
    emit("fidelity", ["classify", "fidelity"], 2, pack);
    return {
      pack,
      trace: normalizeReverseTrace({
        medium,
        fx: null,
        angle: null,
        light: null,
        gaps: [],
        probed: false,
        phases: ["classify", "fidelity"],
      }),
    };
  }

  // 多镜 Stage A
  emit("structure", ["classify"], 2);
  let structure = null;
  try {
    structure = await structureVideoShots(common);
    if (!structure?.shots?.length) structure = null;
  } catch (err) {
    console.warn("[PromptLens] structureVideoShots failed, degrade:", err);
    structure = null;
  }

  // Stage A 失败：降级为 v1 式单次多图，不强制 shots
  if (!structure) {
    emit("fidelity", ["classify"], 3);
    const pack = await fillVideoPack({ ...common, requireShots: false });
    emit("fidelity", ["classify", "fidelity"], 3, pack);
    return {
      pack,
      trace: normalizeReverseTrace({
        medium,
        fx: null,
        angle: null,
        light: null,
        gaps: [],
        probed: false,
        phases: ["classify", "fidelity"],
      }),
    };
  }

  // Stage B：带结构的全量保真
  emit("fidelity", ["classify", "structure"], 3);
  const pack = await fillVideoPack({ ...common, structure, requireShots: true });
  if (!pack.shots.length) {
    pack.shots = normalizeShots(
      bounds.map((bound) => {
        const structShot =
          structure.shots.find((s) => Number(s.index) === bound.index) ||
          structure.shots[bound.index - 1] ||
          {};
        return {
          index: bound.index,
          tStart: bound.tStart,
          tEnd: bound.tEnd,
          motion: String(structShot.motion || pack.motion || "").trim(),
          layout: structShot.layout,
          camera: structShot.camera,
          content: structShot.content,
        };
      })
    );
  }
  emit("fidelity", ["classify", "structure", "fidelity"], 3, pack);
  return {
    pack,
    trace: normalizeReverseTrace({
      medium,
      fx: null,
      angle: null,
      light: null,
      gaps: [],
      probed: false,
      phases: ["classify", "structure", "fidelity"],
    }),
  };
}

/** @param {string} text */
export function parsePromptPack(text) {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();

  try {
    const obj = JSON.parse(raw);
    return normalizePack(obj);
  } catch {
    // 兜底：模型偶发纯文本
    return normalizePack({ positive: raw });
  }
}

/**
 * 解析 elements 清单（字符串 / 对象数组均可）
 * @param {unknown} raw
 * @returns {{ name: string, zone: string, salience: "primary"|"secondary" }[]}
 */
export function parseElements(raw) {
  if (raw == null || raw === "") return [];
  /** @type {{ name: string, zone: string, salience: "primary"|"secondary" }[]} */
  const out = [];

  const push = (name, zone, salience) => {
    const n = String(name || "").trim();
    if (!n) return;
    const z = String(zone || "mid-center").trim() || "mid-center";
    const s = String(salience || "secondary").toLowerCase() === "primary" ? "primary" : "secondary";
    out.push({ name: n, zone: z, salience: s });
  };

  if (Array.isArray(raw)) {
    for (const item of raw.slice(0, 12)) {
      if (typeof item === "string") {
        const parts = item.split("|").map((x) => x.trim());
        push(parts[0], parts[1], parts[2]);
      } else if (item && typeof item === "object") {
        push(item.name || item.label || item.id, item.zone || item.placement, item.salience || item.role);
      }
    }
    return out;
  }

  const text = String(raw).trim();
  if (!text) return [];
  for (const clause of text.split(/\s*;\s*/).filter(Boolean).slice(0, 12)) {
    const parts = clause.split("|").map((x) => x.trim());
    if (parts.length >= 2) push(parts[0], parts[1], parts[2]);
    else push(clause, "mid-center", "secondary");
  }
  return out;
}

/** @param {{ name: string, zone: string, salience: "primary"|"secondary" }[]} elements */
export function formatElements(elements) {
  if (!Array.isArray(elements) || !elements.length) return "";
  return elements
    .slice(0, 12)
    .map((e) => `${e.name}|${e.zone}|${e.salience}`)
    .join("; ");
}

/**
 * 用 elements 修补 layout：补回遗漏形，并去掉与实体冲突的「空区」声称
 * @param {string} layout
 * @param {{ name: string, zone: string, salience: "primary"|"secondary" }[]} elements
 */
export function repairLayoutWithElements(layout, elements) {
  if (!elements?.length) return String(layout || "").trim();
  let next = String(layout || "").trim();
  const blob = next.toLowerCase();

  // full-height / full-width 占满纵向/横向时，上下左右都算有实体
  const hasUpper = elements.some((e) =>
    /upper|top|peak|mountain|sky|full[-\s]?height|full[-\s]?width/i.test(`${e.zone} ${e.name}`)
  );
  const hasLower = elements.some((e) =>
    /lower|bottom|base|ground|shadow|water|ocean|road|full[-\s]?height/i.test(`${e.zone} ${e.name}`)
  );
  const hasLeft = elements.some((e) =>
    /\bleft\b|full[-\s]?height|full[-\s]?width/i.test(`${e.zone} ${e.name}`)
  );
  const hasRight = elements.some((e) =>
    /\bright\b|full[-\s]?height|full[-\s]?width/i.test(`${e.zone} ${e.name}`)
  );

  if (hasUpper) {
    next = next.replace(
      /\b(?:residual\s+)?(?:large\s+)?(?:negative\s+space|(?:empty|vacant)(?:\s+\w+){0,3}(?:\s+field)?)\s+(?:exists\s+)?(?:in\s+)?(?:on\s+)?(?:the\s+)?(?:TOP|upper)(?:\s+(?:two[-\s]?thirds|2\/3|half|third|band|region|field|of\s+the\s+frame))?\b[,;]?\s*/gi,
      ""
    );
  }
  if (hasLower) {
    next = next.replace(
      /\b(?:residual\s+)?(?:large\s+)?(?:negative\s+space|(?:empty|vacant)(?:\s+\w+){0,3}(?:\s+field)?)\s+(?:exists\s+)?(?:in\s+)?(?:on\s+)?(?:the\s+)?(?:BOTTOM|lower)(?:\s+(?:two[-\s]?thirds|2\/3|half|third|band|region|field|of\s+the\s+frame))?\b[,;]?\s*/gi,
      ""
    );
  }
  if (hasLeft) {
    next = next.replace(
      /\b(?:residual\s+)?(?:large\s+)?(?:negative\s+space|(?:empty|vacant)(?:\s+\w+){0,3}(?:\s+field)?)\s+(?:exists\s+)?(?:in\s+)?(?:on\s+)?(?:the\s+)?LEFT(?:\s+(?:half|side|field|third|of\s+the\s+frame))?\b[,;]?\s*/gi,
      ""
    );
  }
  if (hasRight) {
    next = next.replace(
      /\b(?:residual\s+)?(?:large\s+)?(?:negative\s+space|(?:empty|vacant)(?:\s+\w+){0,3}(?:\s+field)?)\s+(?:exists\s+)?(?:in\s+)?(?:on\s+)?(?:the\s+)?RIGHT(?:\s+(?:half|side|field|third|of\s+the\s+frame))?\b[,;]?\s*/gi,
      ""
    );
  }

  // 补回 layout/blob 未提及的元素（用名称首词粗匹配）；背景虚空不注入
  const layoutHasPrimaryLock = /\bprimary\s+subject\b|\bhero\s+(?:subject|figure)\b/i.test(next);
  const missing = elements.filter((e) => {
    if (isVoidBackgroundElementName(e.name)) return false;
    // layout 已有 Primary subject 锁时，勿再前置 primary Name at zone
    if (layoutHasPrimaryLock && String(e.salience || "").toLowerCase() === "primary") {
      return false;
    }
    const nameLow = String(e.name || "").toLowerCase();
    // text / typography / type 互认，避免 "Text overlay" 仍注入 typography
    if (
      /\b(text|typography|type|lettering|caption)\b/.test(nameLow) &&
      /\b(text|typography|type|lettering|caption|overlay)\b/.test(blob)
    ) {
      return false;
    }
    const tokens = String(e.name)
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .filter((t) => t.length >= 3);
    if (!tokens.length) return !blob.includes(String(e.name).toLowerCase());
    return !tokens.some((t) => blob.includes(t));
  });
  if (missing.length) {
    const inject = missing
      .map((e) => `${e.salience} ${e.name} at ${e.zone}`)
      .join("; ");
    next = next ? `${inject}; ${next}` : inject;
  }

  // 跨度诚实（保守）：上半轮廓形 + 下半笔触/路径并存时，禁止 full-height 吞并
  // 注意：裸 wash（水彩 mist wash）不算笔触路径，避免误注 stock「not merged」套话
  const hasUpperSilhouette = elements.some(
    (e) => /peak|mountain|silhouette|ridge|summit/i.test(e.name) && /upper|top/i.test(e.zone)
  );
  const hasStrokeLike = elements.some((e) =>
    /stroke|brush(?:stroke)?|path|ribbon|trail/i.test(e.name)
  );
  if (hasUpperSilhouette && hasStrokeLike) {
    next = next
      .replace(
        /\bfull[-\s]?height(?:\s+center)?\b(?=[\s\S]{0,64}?(?:brushstroke|stroke|wash|path|column|anchor))/gi,
        "mid-to-lower-center"
      )
      .replace(
        /\b(?:vertical\s+)?(?:brushstroke|stroke|wash|path)\b([^.;]{0,40}?)\bspans\s+entire\s+height\b/gi,
        (m) => m.replace(/\bspans\s+entire\s+height\b/gi, "occupies mid-to-lower band")
      )
      .replace(/\bdominates(?:\s+the)?\s+center\s+axis\b/gi, "on center axis below the upper silhouette");
    const lock = elements
      .filter((e) => /peak|mountain|silhouette|ridge|summit/i.test(e.name))
      .map((e) => `${e.name} remains separate in ${e.zone} (not merged into the lower stroke)`)
      .join("; ");
    if (lock && !/not merged into/i.test(next)) {
      next = `${lock}; ${next}`;
    }
  }

  // 水体已铺满全高时，清掉「下三分之一为空」残留措辞
  if (
    elements.some((e) => /water|ocean|river|lake|sea/i.test(e.name) && /full[-\s]?height|full[-\s]?width|edges?/i.test(`${e.zone} ${next}`))
  ) {
    next = next
      .replace(
        /\b(?:residual\s+)?negative\s+space\s+(?:exists\s+)?(?:in\s+)?(?:the\s+)?lower(?:\s+third)?(?:\s+of\s+the\s+frame)?[^.;]{0,80}[.!]?\s*/gi,
        ""
      )
      .replace(/\bbelow the water level\b[,;.]?\s*/gi, "");
  }

  // 人物↔场景：补回关系，去掉与人物区位冲突的门口错位声称
  next = repairFigureSceneRelations(next, elements);
  // 开口 beyond：雨景误标 interior 时纠正
  next = scrubFalseInteriorBeyond(next);

  return next
    .replace(/\s{2,}/g, " ")
    .replace(/;\s*;/g, ";")
    .replace(/;\s*\./g, ".")
    .replace(/\.\s*;/g, ";")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .trim();
}

/**
 * 裸「family group」元素：若 positive 已有个体 roster，则展开为具体人物条款
 * @param {string} elements
 * @param {string} positive
 */
export function repairBareFamilyGroupElements(elements, positive) {
  const list = parseElements(elements);
  const bareIdx = list.findIndex((e) => /\bfamily group\b/i.test(e.name));
  if (bareIdx < 0) return formatElements(list);
  const pos = String(positive || "");
  /** @type {{ name: string, zone: string, salience: "primary"|"secondary" }[]} */
  const injected = [];
  const zone = list[bareIdx].zone || "mid-center";
  const pushUnique = (name, salience = "secondary") => {
    if (injected.some((e) => e.name === name) || list.some((e) => e.name === name)) return;
    injected.push({ name, zone, salience });
  };
  if (/\belderly\s+man\b|\bfather\b|\bmiddle[-\s]?aged(?:\s+\w+)?\s+man\b/i.test(pos)) {
    pushUnique(/\bfather\b/i.test(pos) ? "father" : "elderly man", "primary");
  }
  if (/\belderly\s+woman\b|\bmother\b|\bmiddle[-\s]?aged(?:\s+\w+)?\s+woman\b/i.test(pos)) {
    pushUnique(/\bmother\b/i.test(pos) ? "mother" : "elderly woman");
  }
  if (/\bboy\b/i.test(pos)) pushUnique("boy");
  if (/\bgirls?\b/i.test(pos)) pushUnique(/\btwo girls\b/i.test(pos) ? "two girls" : "girl");
  if (/\bchild(?:ren)?\b/i.test(pos) && !injected.some((e) => /boy|girl|child/i.test(e.name))) {
    pushUnique("children");
  }
  if (injected.length < 2) {
    // 无法从 positive 展开时，至少改名避免裸 family group
    list[bareIdx] = {
      ...list[bareIdx],
      name: "family of people on sofa",
    };
    return formatElements(list);
  }
  const next = [...list.slice(0, bareIdx), ...injected, ...list.slice(bareIdx + 1)];
  return formatElements(next);
}

/**
 * 纪录片式室内写真被误升格 CGI：改回 photograph，并清掉空 style 标签
 * @param {string} style
 * @param {string} evidenceBlob
 */
export function scrubFalseCgiDocumentary(style, evidenceBlob = "") {
  let s = String(style || "").trim();
  const blob = `${s} ${evidenceBlob}`;
  s = s
    .replace(/\b,\s*style\s*,/gi, ",")
    .replace(/\bstyle\s*,\s*with\b/gi, "with")
    .replace(/^style\s*,\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
  const documentary =
    /\b(living room|sofa|family|film grain|war[-\s]?torn|peeling|documentary)\b/i.test(blob) &&
    !/\b(hypercar|pbr materials|octane|unreal engine|path[-\s]?traced|sports?\s*car|supercar)\b/i.test(
      blob
    );
  if (documentary) {
    s = s
      .replace(/\bphotoreal(?:istic)?\s+CGI\b/gi, "photoreal photograph")
      .replace(/\brender3d\b/gi, "")
      .replace(/\bCGI\b/gi, "")
      .replace(/\bphotoreal photograph(?:\s*,\s*photoreal photograph)+\b/gi, "photoreal photograph")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s]+|[,;\s]+$/g, "")
      .trim();
  }
  return s;
}

/**
 * 纪录片室内 positive 开头的 CGI 升格 → photograph
 * @param {string} positive
 * @param {string} evidenceBlob
 */
export function scrubFalseCgiDocumentaryPositive(positive, evidenceBlob = "") {
  let p = String(positive || "").trim();
  const blob = `${p} ${evidenceBlob}`;
  const documentary =
    /\b(living room|sofa|family|film grain|war[-\s]?torn|peeling|documentary)\b/i.test(blob) &&
    !/\b(hypercar|pbr materials|octane|unreal engine|path[-\s]?traced|sports?\s*car|supercar)\b/i.test(
      blob
    );
  if (!documentary) return p;
  return p
    .replace(/^photoreal(?:istic)?\s+CGI[.,]?\s*/i, "photoreal photograph, ")
    .replace(/\bphotoreal(?:istic)?\s+CGI\b/gi, "photoreal photograph")
    .replace(/\brender3d\b/gi, "")
    .replace(/\bphotoreal CGI\b/gi, "photoreal photograph")
    .replace(/\b,\s*style\s*[.,]/gi, ",")
    .replace(/\bstyle\s*[.,]\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .trim();
}

/**
 * 影棚/虚空背景不应进 elements 清单（色板 bg 已表达）
 * @param {string} name
 */
export function isVoidBackgroundElementName(name) {
  const n = String(name || "").trim();
  return /^(?:solid\s+)?(?:white|black|gray|grey|seamless|plain)\s+(?:background|backdrop|void|field)$/i.test(
    n
  ) || /^(?:white|black)\s+(?:background|void|backdrop)$/i.test(n) || /^(?:black|white)\s+void$/i.test(n);
}

/**
 * 去掉虚空背景元素；校正船+水等 full-height 跨度冲突
 * @param {string|{ name?: string, zone?: string, salience?: string }[]} elements
 */
export function repairElementsInventory(elements) {
  const list = Array.isArray(elements)
    ? elements.map((e) => ({
        name: String(e?.name || "").trim(),
        zone: String(e?.zone || "").trim() || "mid-center",
        salience: e?.salience === "primary" ? "primary" : "secondary",
      }))
    : parseElements(elements);
  const kept = list.filter((e) => e.name && !isVoidBackgroundElementName(e.name));
  const working = kept.length ? kept : list.filter((e) => e.name);

  const hasFullHeightWater = working.some(
    (e) => /water|ocean|river|lake|sea/i.test(e.name) && /full[-\s]?height/i.test(e.zone)
  );
  if (hasFullHeightWater) {
    for (const e of working) {
      if (/boat|ship|vessel|raft|kayak|canoe/i.test(e.name) && /full[-\s]?height/i.test(e.zone)) {
        e.zone = e.zone
          .replace(/full[-\s]?height[-\s]?center/gi, "mid-center")
          .replace(/full[-\s]?height/gi, "mid");
      }
    }
  }
  return formatElements(working);
}

/**
 * 校正人物与场景结构的空间关系（支撑面 / 禁止门口错位）
 * @param {string} layout
 * @param {{ name: string, zone: string, salience: "primary"|"secondary" }[]} elements
 */
export function repairFigureSceneRelations(layout, elements) {
  if (!elements?.length) return String(layout || "").trim();
  let next = String(layout || "").trim();
  const blob = next.toLowerCase();

  const figures = elements.filter((e) =>
    /\b(figure|figures|person|people|woman|man|child|children|group|crowd|human|character|silhouette)\b/i.test(
      e.name
    )
  );
  if (!figures.length) return next;

  // 人物名已含场景关系时，layout 需复述（避免只剩门口/空楼梯）
  for (const f of figures) {
    const relBit = String(f.name).trim();
    const keyTokens = relBit
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .filter((t) => t.length >= 4);
    if (!keyTokens.length) continue;
    const hit = keyTokens.filter((t) => blob.includes(t)).length;
    if (hit < Math.min(2, keyTokens.length)) {
      next = `${f.salience} ${relBit} at ${f.zone} (figure-scene lock); ${next}`;
    }
  }

  // 人物在楼梯/中心/地面时，删除「门口剪影离场」类错位
  const anchoredCenter = figures.some((f) =>
    /stair|center|floor|ground|ascending|descending/i.test(`${f.zone} ${f.name}`)
  );
  if (anchoredCenter) {
    next = next.replace(
      /\b(?:figure|silhouette|person|people|character)s?\b[^.;]{0,48}?\b(?:exits?|exit(?:ing)?|in|at|through)\s+(?:the\s+)?(?:right|left)(?:-|\s)?(?:side\s+)?doorway(?:\s*,\s*(?:secondary|primary)(?:\s+element)?)?\b[,;]?\s*/gi,
      ""
    );
  }

  return next;
}

/** 肖像裁切套话：layout 未声称裁切时，从 camera/positive 清掉（防 Frame Crop 范例污染） */
const PORTRAIT_CROP_STOCK_RE =
  /\b(?:medium shot framing from mid-thigh up|tight vertical crop(?:,)?\s*|crown\/?forehead cut by top frame edge(?:,)?\s*|mid-thigh-up body framing)\b[, ]*/gi;

/**
 * @param {string} camera
 * @param {string} layout
 * @param {string} positive
 */
export function scrubMismatchedPortraitCrop(camera, layout, positive) {
  const lay = String(layout || "");
  const layoutHasCrop =
    /\b(cropped|cut by|clipped by|truncat(?:ed|ion)?|forehead cut|crown(?:\/forehead)? cut|mid-thigh|chin cut|edge contact)\b/i.test(
      lay
    ) && !/\bno\s+crop\b|\bwithout\s+(?:a\s+)?crop\b|\bnot\s+cropped\b/i.test(lay);
  if (layoutHasCrop) {
    return {
      camera: String(camera || "").trim(),
      positive: String(positive || "").trim(),
    };
  }
  const clean = (s) =>
    String(s || "")
      .replace(PORTRAIT_CROP_STOCK_RE, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[,;\s]+|[,;\s]+$/g, "")
      .replace(/\s+,/g, ",")
      .trim();
  return { camera: clean(camera), positive: clean(positive) };
}

/**
 * positive 中与人物区位冲突的门口错位套话
 * @param {string} positive
 * @param {{ name: string, zone: string, salience: "primary"|"secondary" }[]} elements
 */
export function scrubRelocatedFigureClaims(positive, elements) {
  if (!elements?.length) return String(positive || "").trim();
  const figures = elements.filter((e) =>
    /\b(figure|figures|person|people|woman|man|child|children|group|crowd|human|character|silhouette)\b/i.test(
      e.name
    )
  );
  const anchoredCenter = figures.some((f) =>
    /stair|center|floor|ground|ascending|descending/i.test(`${f.zone} ${f.name}`)
  );
  if (!anchoredCenter) return String(positive || "").trim();
  return String(positive || "")
    .replace(
      /\b(?:figure|silhouette|person|people|character)s?\b[^,]{0,48}?\b(?:exits?|exit(?:ing)?|in|at|through)\s+(?:the\s+)?(?:right|left)(?:-|\s)?(?:side\s+)?doorway(?:\s*,\s*(?:secondary|primary)(?:\s+element)?)?\b[, ]*/gi,
      " "
    )
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .replace(/\s+,/g, ",")
    .trim();
}

/** 雨景/门外景被误标为 interior stairs 时纠正 */
/**
 * @param {string} text
 */
export function scrubFalseInteriorBeyond(text) {
  let s = String(text || "");
  // 明确搭配：interior stairs and rain → exterior…
  s = s.replace(/\binterior\s+stairs?\s+and\s+rain\b/gi, "exterior rain and outdoor stairs");
  // doorway/opening + interior stairs 且同句有 rain → exterior
  s = s.replace(
    /\b((?:doorway|door|opening|break)[^.;]{0,64}?)\binterior\s+stairs?\b([^.;]{0,40}?\brain\b)/gi,
    "$1exterior outdoor stairs$2"
  );
  s = s.replace(
    /\b((?:doorway|door|opening|break)[^.;]{0,64}?)\brain\b([^.;]{0,40}?)\binterior\s+stairs?\b/gi,
    "$1rain$2exterior outdoor stairs"
  );
  return s.replace(/\s{2,}/g, " ").trim();
}

/**
 * 景别诚实：人物半身主导时禁止抬成 wide；仅在明显全景却写了过紧特写时放宽
 * @param {string} camera
 * @param {string} layout
 * @param {string} positive
 * @param {{ name: string, zone: string, salience: "primary"|"secondary" }[]} elements
 */
/**
 * 景别诚实：按构图模式纠偏（完整物件 / 人物半身 / 全景）
 * @param {string} camera
 * @param {string} layout
 * @param {string} positive
 * @param {{ name: string, zone: string, salience: "primary"|"secondary" }[]} elements
 * @param {string} [style]
 */
export function scrubUnderscaledShot(camera, layout, positive, elements = [], style = "") {
  const blob = `${camera} ${layout} ${positive} ${style} ${formatElements(elements)}`;
  const mode = resolveFramingMode(blob, elements);
  return {
    camera: applyFramingToText(camera, mode),
    layout: String(layout || "").trim(),
    positive: applyFramingToText(positive, mode),
    style: applyFramingToText(style, mode),
    framingMode: mode,
  };
}

/** @typedef {{ index: number, tStart: number, tEnd: number, layout?: string, camera?: string, motion: string, content?: string }} Shot */

/** 规范化 shots：最多 6 条，index 1-based */
export function normalizeShots(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (let i = 0; i < raw.length && out.length < 6; i++) {
    const s = raw[i] || {};
    const motion = String(s.motion || "").trim();
    const tStart = Math.max(0, Number(s.tStart) || 0);
    let tEnd = Math.max(tStart, Number(s.tEnd) || tStart);
    const shot = {
      index: out.length + 1,
      tStart,
      tEnd,
      motion,
    };
    const layout = String(s.layout || "").trim();
    const camera = String(s.camera || "").trim();
    const content = String(s.content || "").trim();
    if (layout) shot.layout = layout;
    if (camera) shot.camera = camera;
    if (content) shot.content = content;
    out.push(shot);
  }
  return out;
}

/** @param {Partial<{elements:string|unknown,positive:string,negative:string,style:string,layout:string,palette:string,camera:string,motion:string,ratio:string,shots:unknown}>} obj */
export function normalizePack(obj = {}) {
  const rawPalette = String(obj.palette || "").trim();
  const rawPositive = String(obj.positive || "").trim();
  const rawLayout = String(obj.layout || "").trim();
  const rawElements = String(obj.elements || "").trim();
  const hadGeneratorWatermark = /\bGemini X Nano Banana\b|\bNano Banana\b/i.test(
    `${rawPositive} ${rawLayout} ${rawElements}`
  );
  const elementsList = parseElements(repairElementsInventory(obj.elements));
  const layout = repairLayoutWithElements(rawLayout, elementsList);
  const scrubbed = scrubMismatchedPortraitCrop(
    String(obj.camera || "").trim(),
    layout,
    rawPositive
  );
  let positive = scrubRelocatedFigureClaims(scrubbed.positive, elementsList);
  positive = scrubFalseInteriorBeyond(positive);
  const cameraBeyond = scrubFalseInteriorBeyond(scrubbed.camera);
  const styleRaw = String(obj.style || "").trim();
  const scaled = scrubUnderscaledShot(
    cameraBeyond,
    layout,
    positive,
    elementsList,
    styleRaw
  );
  const packBlob = `${scaled.positive} ${layout} ${scaled.style} ${scaled.camera}`;
  let palette = repairPaletteHonesty(
    formatPalette(parsePalette(rawPalette)) || rawPalette,
    packBlob
  );
  // 示例色板被清空时，同步从 positive 去掉这些指纹 hex，避免仍被前置
  let nextPositive = scaled.positive;
  if (!palette && /#2F3A28/i.test(`${rawPalette} ${scaled.positive}`)) {
    nextPositive = scrubExamplePaletteTokens(nextPositive);
  }
  // 清掉无证据的 cel/ink illustration 粘性套话
  const celScrub = scrubStockCelInk(
    scaled.style,
    nextPositive,
    `${layout} ${scaled.camera} ${scaled.style} ${nextPositive}`
  );
  // 清掉契约示例指纹 + 无裁切时的 anti-heal 样板（颜色锚定在 groundPackToReferenceImage）
  const cleanStr = (v) => String(v || "").replace(/\[object Object\]/g, "").replace(/,\s*,+/g, ",").replace(/\s{2,}/g, " ").trim();
  const layoutClean = cleanStr(scrubStockSchemaPhrases(scrubFalseInteriorBeyond(layout)));
  const styleClean = cleanStr(scrubStockSchemaPhrases(celScrub.style));
  const posClean = cleanStr(scrubStockSchemaPhrases(celScrub.positive));
  const camClean = cleanStr(scrubStockSchemaPhrases(scaled.camera));
  const negClean = cleanStr(scrubStockSchemaPhrases(String(obj.negative || "").trim()));
  const healScrub = scrubAntiHealWhenNoCrop(negClean, layoutClean, posClean, camClean);
  // 硬边平涂图形：先纠偏，避免后续 looksDrawn 钉成软涂插画（色板黑底也算虚空证据）
  const hardEdge = repairHardEdgeFlatGraphicShading({
    style: styleClean,
    positive: healScrub.positive,
    layout: layoutClean,
    elements: formatElements(elementsList),
    negative: healScrub.negative,
    camera: camClean,
    palette: palette || rawPalette,
  });
  const layoutAfterHard = hardEdge.layout || layoutClean;
  let elementsAfterHard = hardEdge.elements || formatElements(elementsList);
  // 裸 family group → 从 positive 展开个体
  elementsAfterHard = repairBareFamilyGroupElements(
    elementsAfterHard,
    hardEdge.positive || healScrub.positive
  );
  const posterScrub = scrubFalsePosterChrome(
    hardEdge.style,
    hardEdge.positive,
    layoutAfterHard,
    elementsAfterHard
  );
  // 先清纪录片 CGI 升格（style + positive），再澄清族——避免 evidence 里残留 CGI 把 style 钉回去
  const evidForCgi = `${posterScrub.positive} ${layoutAfterHard} ${elementsAfterHard}`;
  const styleNoCgi = scrubFalseCgiDocumentary(posterScrub.style, evidForCgi);
  const posNoCgi = scrubFalseCgiDocumentaryPositive(posterScrub.positive, `${styleNoCgi} ${evidForCgi}`);
  const styleClarified = clarifyStyleField(
    styleNoCgi,
    `${posNoCgi} ${layoutAfterHard} ${elementsAfterHard}`
  );
  const family = resolveMediumFamily(
    `${styleClarified} ${posNoCgi} ${layoutAfterHard} ${elementsAfterHard}`
  );
  // 浮雕族：清掉 positive 里残留的 photoreal CGI 串味
  let posForFrame = posNoCgi;
  if (family === "relief") {
    posForFrame = posForFrame
      .replace(/\bphotoreal(?:istic)?\s+CGI(?:\s+rendering)?\b/gi, "")
      .replace(/\bCGI rendering of\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();
  }
  // 漫画/anime：拆 soft blended + smooth，避免生成器软涂化（仅 anime/manga/manhua，不动 soft-paint comic）
  if (family === "comic" && /\b(anime|manga|manhua|动漫)\b/i.test(`${styleClarified} ${posForFrame}`)) {
    posForFrame = scrubAnimeMangaSoftStack(posForFrame);
  }
  const framed = repairFullObjectFraming(
    posForFrame,
    layoutAfterHard,
    hardEdge.camera || healScrub.camera,
    elementsAfterHard,
    styleClarified
  );
  const mini = repairMiniatureFigureScale({
    positive: framed.positive,
    layout: framed.layout,
    elements: elementsAfterHard,
    style: styleClarified,
  });
  // 俯视角纠偏（峡谷俯视等不得默认 eye-level）；亲密特写假仰视同步清 positive
  const camAngled = repairCameraAngle(
    framed.camera,
    `${mini.positive} ${mini.layout} ${mini.elements} ${styleClarified}`
  );
  let posAfterAngle = mini.positive;
  {
    const angleBlob = `${posAfterAngle} ${mini.layout} ${mini.elements} ${styleClarified} ${camAngled}`;
    const trueLowCue =
      /\b(sky|clouds?|ceiling|worm'?s[-\s]?eye|chin underside|looking up (?:at|toward) (?:the )?(?:sky|ceiling))\b/i.test(
        angleBlob
      );
    const intimateClose =
      /\b(close[-\s]?up|bust|neck|collarbone|lying|bed|pillow|sheet|intimate)\b/i.test(angleBlob);
    if (intimateClose && !trueLowCue) {
      posAfterAngle = posAfterAngle
        .replace(/\blow[-\s]?angle(?:\s+looking\s+up)?\b/gi, " ")
        .replace(/\bcrown(?:\s+of\s+head)?\s+foreshortening[^,]*/gi, " ")
        .replace(/\bfloor plane below[^,]*/gi, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/,\s*,+/g, ",")
        .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
        .trim();
    }
  }
  // 负向按介质族整理：只对抗，不跨族发明
  const negAfterPoster = negativesForFamily(hardEdge.negative, family);
  const elementsClean = scrubStockSchemaPhrases(mini.elements);
  // 浮雕比例尺小人 / 硬边色光肖像：不外人种
  const skipPheno =
    /\btiny miniature\b/i.test(`${posAfterAngle} ${mini.elements}`) ||
    hasHardEdgeFlatGraphicEvidence(
      `${styleClarified} ${posAfterAngle} ${mini.layout} ${elementsClean}`
    );
  const pheno = skipPheno
    ? { positive: posAfterAngle, elements: elementsClean }
    : repairMissingPhenotype(posAfterAngle, elementsClean, mini.layout, styleClarified);
  const form = repairObjectFormFactors(pheno.positive, pheno.elements, mini.layout);
  const fx = repairGraphicFxMislabel({
    positive: form.positive,
    elements: form.elements,
    layout: scrubStockSchemaPhrases(mini.layout),
    camera: camAngled,
    negative: negAfterPoster,
    style: styleClarified,
  });
  // 镜头光学诚实：在 FX 合并之后再纠 DOF / 虚化 / 拖影矛盾
  const camOptics = repairCameraOpticsHonesty(
    fx.camera,
    `${fx.positive} ${fx.elements} ${fx.layout} ${styleClarified}`
  );
  // 漫画/anime：去掉假摄影浅景深（仅 anime/manga/manhua）
  const camForHead =
    family === "comic" &&
    /\b(anime|manga|manhua|动漫)\b/i.test(`${styleClarified} ${fx.positive}`)
      ? scrubAnimeMangaPhotoOptics(camOptics)
      : camOptics;
  const head = repairHeadAngleConsistency(fx.positive, camForHead);
  let outLayout = fx.layout;
  let outElements = fx.elements;
  let outPositive = head.positive;
  let outNegative = fx.negative;
  // 排版：引用镜像 + 有字短负向（在 slim 之前）
  const typeFix = repairTypographyLocks({
    positive: outPositive,
    layout: outLayout,
    elements: outElements,
    negative: outNegative,
    locks: copyPackLocks(obj),
  });
  outPositive = typeFix.positive;
  outNegative = typeFix.negative;
  // 姿势朝向：torso/head 侧向镜像 + 禁翻转
  const poseFix = repairPoseLocks({
    positive: outPositive,
    layout: outLayout,
    camera: head.camera,
    elements: outElements,
    negative: outNegative,
  });
  outPositive = poseFix.positive;
  outNegative = poseFix.negative;
  // 光影：闪光禁柔光升格 + 脸部光比前置；发丝 rim 只认 locks.backlightRim
  const lightFix = repairLightingLocks({
    positive: outPositive,
    style: styleClarified,
    layout: outLayout,
    camera: head.camera,
    elements: outElements,
    negative: outNegative,
    locks: copyPackLocks(obj),
  });
  outPositive = lightFix.positive;
  outNegative = lightFix.negative;
  // 仅清宿主页 search-bar 幻觉；风格/密度交给 VLM
  const hostUi = scrubInventedHostUiChrome({
    style: lightFix.style || styleClarified,
    positive: outPositive,
    layout: outLayout,
    elements: outElements,
    negative: outNegative,
    camera: lightFix.camera || head.camera,
  });
  // 下半脸特写：剥假眼睛/发丝逆光/flare（确定幻觉）
  const cropFix = scrubCroppedPortraitHallucinations(hostUi);
  outPositive = cropFix.positive;
  outNegative = cropFix.negative;
  outLayout = cropFix.layout;
  outElements = cropFix.elements;
  const outStyle = cropFix.style;
  const outCamera = cropFix.camera;
  // 平台水印已剥：顺带清残留 Logo 句 / elements logo 项
  if (hadGeneratorWatermark) {
    const stripMark = (s) =>
      String(s || "")
        .replace(/\bLogo in upper-left corner,\s*small and discrete\.?\s*/gi, "")
        .replace(/\bLogo:\s*[^.]*?(?:\.|$)/gi, "")
        .replace(/;?\s*[^;]*\blogo\b[^;]*/gi, "")
        .replace(/^;\s*|;\s*$/g, "")
        .replace(/\s{2,}/g, " ")
        .replace(/,\s*,+/g, ",")
        .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
        .trim();
    outPositive = stripMark(outPositive);
    outLayout = stripMark(outLayout);
    outElements = stripMark(outElements);
  }
  const outLocks = copyPackLocks(obj);
  return {
    elements: outElements,
    positive: outPositive,
    negative: slimNegatives(scrubPinkElephantNegatives(outNegative), 120),
    style: outStyle,
    layout: outLayout,
    palette,
    camera: outCamera,
    motion: String(obj.motion || "").trim(),
    ratio: String(obj.ratio || "").trim(),
    shots: normalizeShots(obj.shots),
    ...(outLocks ? { locks: outLocks } : {}),
  };
}

/** 可识别的人种/地域外貌短语；招牌上的 Japanese text 不算外貌 */
export const PHENOTYPE_APPEARANCE_RE =
  /\b(east[-\s]?asian|southeast[-\s]?asian|south[-\s]?asian|west[-\s]?asian|middle[-\s]?eastern|north[-\s]?african|sub[-\s]?saharan|black african|african(?:[-\s]american)?|european|caucasian|latino|latina|hispanic|indigenous|native american|han chinese|korean(?!\s+(?:text|sign|calligraphy|lettering|hangul|script))|japanese(?!\s+(?:text|sign|calligraphy|lettering|kanji|script|characters?))|chinese (?:facial features|appearance|features|faces?|family|people)|东亚(?:面孔|外貌|人种)?|西亚|中东|南亚|东南亚|非洲)\b/i;

/**
 * 仅当 blob 已含明确外貌短语时回传规范化锁；禁止从服饰/文字/建筑推断 ethnicity
 * @param {string} blob
 */
export function inferPhenotypeLock(blob) {
  const b = String(blob || "");
  const m = b.match(PHENOTYPE_APPEARANCE_RE);
  if (!m) return "";
  const token = String(m[1] || m[0] || "").toLowerCase().replace(/\s+/g, " ").trim();
  // southeast 必须先于 east，避免误归 East Asian
  if (/southeast|东南亚/i.test(token)) return "Southeast Asian facial features";
  if (/south asian|南亚/i.test(token)) return "South Asian facial features";
  if (/west asian|middle eastern|中东|西亚/i.test(token)) return "West Asian facial features";
  if (/east[-\s]?asian|东亚|han chinese|korean|japanese|chinese (?:facial|appearance|features|faces?)/i.test(token)) {
    return "East Asian facial features";
  }
  if (/north african|非洲|black african|african/i.test(token)) return "Black African facial features";
  if (/european|caucasian/i.test(token)) return "European facial features";
  if (/latino|latina|hispanic/i.test(token)) return "Latino facial features";
  if (/indigenous|native american/i.test(token)) return "Indigenous facial features";
  return "";
}

/** 形态关键词：落地/挂壁/台式/CRT 等（全物品通用） */
const OBJECT_FORM_TOKEN_RE =
  /\b(floor[-\s]?standing|wall[-\s]?mounted|ceiling[-\s]?mounted|tabletop|desktop|handheld|portable|built[-\s]?in|freestanding|pedestal|tower|cabinet[-\s]?style|CRT|flat[-\s]?panel|flat[-\s]?screen|side[-\s]?by[-\s]?side|top[-\s]?freezer|bottom[-\s]?freezer|french[-\s]?door|chest[-\s]?freezer|boxy|slim|folding|reclining|bunk|loft|四门|对开|立式|挂壁|壁挂|柜机|座机|落地|吊装|台式|手持|便携|嵌入式)\b/i;

/**
 * 物品形态锁：凡 elements 已写明的形态（落地/挂壁/CRT/台式等）必须同步进 positive；
 * 对裸写品类名仅在已有明确形态线索时补全——禁止按房间类型臆造形态。
 * @param {string} positive
 * @param {string} elements
 * @param {string} layout
 */
export function repairObjectFormFactors(positive, elements, layout = "") {
  let pos = String(positive || "").trim();
  let els = String(elements || "").trim();
  const blob = `${els} ${pos} ${layout}`;

  // 0) 台灯误写成 floor-standing：桌面灯一律改回 tabletop desk lamp
  const fixDeskLamp = (text) =>
    String(text || "")
      .replace(/\bfloor[-\s]?standing desk lamp\b/gi, "tabletop desk lamp")
      .replace(/\bfloor[-\s]?standing (?:vintage |brass |green[-\s]?shade )?lamp\b/gi, (m) =>
        /desk|table|shade/i.test(m) ? m.replace(/floor[-\s]?standing/i, "tabletop") : m
      )
      .replace(/\bstanding desk lamp\b/gi, "tabletop desk lamp");
  pos = fixDeskLamp(pos);
  els = fixDeskLamp(els);

  // 1) elements 里已带形态词的物品名 → 同步进 positive
  const listed = parseElements(els);
  for (const el of listed) {
    const name = String(el.name || "").trim();
    if (!name || !OBJECT_FORM_TOKEN_RE.test(name)) continue;
    // 取形态核心词；若 positive 已含该形态+大致品类则跳过
    const formBits = name.match(OBJECT_FORM_TOKEN_RE);
    if (!formBits) continue;
    const formKey = formBits[0];
    if (new RegExp(formKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(pos)) continue;
    // 形态未进 positive：前置该元素全名（短）
    const short = name.length > 72 ? `${name.slice(0, 70)}…` : name;
    pos = `${short}, ${pos}`.replace(/\s{2,}/g, " ").trim();
  }

  // 2) 空调：仅当 blob 已有明确立式/挂壁线索时，把裸写升级（不按客厅臆造）
  if (/\b(air conditioner|ac unit|a\/c|空调)\b/i.test(blob)) {
    const hasFloorForm =
      /\b(floor[-\s]?standing|standing cabinet|cabinet[-\s]?style ac|tower ac|立式|柜机|座机)\b/i.test(blob);
    const hasWallForm =
      /\b(wall[-\s]?mounted|split ac|high[-\s]?wall|挂壁|壁挂)\b/i.test(blob);

    if (hasFloorForm && !/\b(floor[-\s]?standing|standing cabinet|tower ac|立式|柜机|座机)\b/i.test(pos)) {
      pos = `tall floor-standing cabinet air conditioner (not wall-mounted), ${pos}`
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    if (hasWallForm && !hasFloorForm && !/\b(wall[-\s]?mounted|split ac|挂壁|壁挂)\b/i.test(pos)) {
      pos = `wall-mounted split air conditioner, ${pos}`.replace(/\s{2,}/g, " ").trim();
    }

    if (!hasFloorForm && !hasWallForm) {
      // 仅明确落地/挂壁措辞或 upper 区位 → 升级；mid 不得臆造立式
      const floorCue =
        /\b(floor[-\s]?standing|standing cabinet|tower ac|立式|柜机|座机|against (?:the )?(?:back )?wall on the floor|standing on the floor)\b/i.test(
          blob
        ) || /\b(?:air conditioner|ac unit|空调)[^|;]{0,40}\|lower/i.test(els);
      const wallCue =
        /\b(wall[-\s]?mounted|split ac|high[-\s]?wall|挂壁|壁挂|near (?:the )?ceiling|high on (?:the )?wall|mounted (?:high|on wall))\b/i.test(
          blob
        ) || /\b(?:air conditioner|ac unit|空调)[^|;]{0,40}\|upper/i.test(els);

      const replaceBareAc = (text, replacement) =>
        String(text || "")
          .replace(/\bair conditioner unit\b/gi, replacement)
          .replace(/\bac unit\b/gi, replacement)
          .replace(/\ba\/c(?: unit)?\b/gi, replacement)
          .replace(/\b空调\b/g, replacement)
          .replace(/(?<!cabinet )(?<!split )(?<!standing )\bair conditioner\b/gi, replacement);

      if (floorCue && !wallCue) {
        els = replaceBareAc(els, "tall floor-standing cabinet air conditioner");
        pos = replaceBareAc(pos, "tall floor-standing cabinet air conditioner");
      } else if (wallCue && !floorCue) {
        els = replaceBareAc(els, "wall-mounted split air conditioner");
        pos = replaceBareAc(pos, "wall-mounted split air conditioner");
      }
      // 无线索：保持裸写，交给 VLM 契约强制下次写形态——禁止按房间类型臆造
    }
  }

  // 3) 电视：CRT vs 平板 — 仅镜像已有线索，不臆造
  if (/\b(crt(?:\s+(?:tv|television|set|monitor))?)\b/i.test(blob) && !/\bcrt\b/i.test(pos)) {
    pos = `CRT television, ${pos}`.replace(/\s{2,}/g, " ").trim();
  }
  if (
    /\b(flat[-\s]?panel|flat[-\s]?screen|lcd|led tv|oled)\b/i.test(blob) &&
    !/\b(flat[-\s]?panel|flat[-\s]?screen|lcd|led|oled)\b/i.test(pos)
  ) {
    pos = `flat-panel television, ${pos}`.replace(/\s{2,}/g, " ").trim();
  }

  return { positive: pos, elements: els };
}

/** @deprecated 使用 repairObjectFormFactors */
export const repairApplianceFormFactors = repairObjectFormFactors;

/**
 * 图形特效纠偏：运动拖影 ≠ 双重曝光 ≠ 光学 bokeh
 * - 包内已有 motion/ghost 证据时，清掉互相矛盾的 bokeh / fully-sharp 表述
 * - 实心影棚色底误写 soft bokeh 时，去掉假 bokeh（不凭空发明 motion）
 * - 负向里的 motion 禁词不是证据；硬边全锐利帧去掉假拖影
 * @param {{ positive?: string, elements?: string, layout?: string, camera?: string, negative?: string, style?: string }} pack
 */
export function repairGraphicFxMislabel(pack = {}) {
  let positive = String(pack.positive || "").trim();
  let elements = String(pack.elements || "").trim();
  let layout = String(pack.layout || "").trim();
  let camera = String(pack.camera || "").trim();
  let negative = String(pack.negative || "").trim();
  const style = String(pack.style || "").trim();
  // 证据只看正向字段——负向禁词（如 "motion blur"）不得触发注入
  const evidenceBlob = `${positive} ${elements} ${layout} ${camera}`;
  const hardEdgeBlob = `${style} ${evidenceBlob}`;

  const hasMotionEvidence =
    /\b(motion\s*blur|speed\s*streak|motion\s*streak|horizontal\s*(?:motion\s*)?streak|vertical\s*(?:motion\s*)?streak|directional\s*(?:smear|streak)|运动模糊|速度拖影|拖影)\b/i.test(
      evidenceBlob
    );
  const hasMotionDenial =
    /\b(no motion(?:\s+(?:blur|streak))?|without motion(?:\s+blur)?|fully static|no streaks?|deep graphic sharpness|crisp(?:\s+graphic)?(?:\s+edges?)?(?:\s+with)?\s+no\s+(?:motion|streak))\b/i.test(
      evidenceBlob
    );
  const hasGhostEvidence =
    /\b(double[-\s]?exposure|ghost(?:ed)?\s+(?:face|overlay|figure|portrait)|translucent\s+(?:face|overlay|figure)|半透明叠脸|双重曝光)\b/i.test(
      evidenceBlob
    );
  const hasOpticalBokehEvidence =
    /\b(bokeh\s+circles?|circular\s+bokeh|optical\s+bokeh|defocus\s+circles?|奶油景深|光斑虚化)\b/i.test(
      evidenceBlob
    );
  const hasBokehClaim =
    /\b(soft\s+bokeh(?:\s+blur)?(?:\s+effect)?|bokeh\s+blur|background\s+bokeh|shallow\s+(?:DOF|depth of field))\b/i.test(
      `${positive} ${camera} ${layout}`
    );
  const solidStudioVoid =
    /\b(solid|seamless|full-frame|flat)\b[^.]{0,40}\b(background|backdrop|void)\b|\b(background|backdrop)\b[^.]{0,40}\b(solid|seamless|full-frame)\b/i.test(
      `${positive} ${layout}`
    );
  const stripFalseMotion = (s) =>
    String(s || "")
      .replace(
        /\bdirectional\s+motion\s+blur\s+speed\s+streak\s+on\s+the\s+trailing\s+side\s+of\s+the\s+primary\s+subject(?:,\s*)?/gi,
        ""
      )
      .replace(
        /\b(?:horizontal|vertical|directional)\s+motion\s+blur(?:\s+speed\s+streak)?(?:\s+on\s+(?:the\s+)?(?:trailing\s+side|camera-left|camera-right|full)(?:\s+of\s+the\s+primary\s+subject)?)?/gi,
        ""
      )
      .replace(/\bmotion\s+blur\s+speed\s+streak(?:\s+on\s+[^,.;]+)?/gi, "")
      .replace(/\b(?:horizontal|vertical)\s+motion\s+streak(?:\s+on\s+[^,.;]+)?/gi, "")
      .replace(/\b(?:heavy|directional)\s+motion\s+blur\b/gi, "")
      .replace(/\bmotion\s+blur\b/gi, "")
      .replace(/\bspeed\s+streak\b/gi, "")
      .replace(/(?:^|,\s*)on the trailing side of the primary subject(?:,\s*)+/gi, " ")
      .replace(/\bon the trailing side of the primary subject(?:,\s*)+/gi, " ");

  const tidy = (s) =>
    String(s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .replace(/\s+,/g, ",")
      .trim();

  // 硬边全锐利 / 明确否认拖影：去掉假 motion（不伤真有拖影且无否认的帧）
  if (
    hasMotionEvidence &&
    (hasMotionDenial ||
      (hasHardEdgeFlatGraphicEvidence(hardEdgeBlob) &&
        /\b(deep graphic sharpness|fully sharp|no streaks?|crisp edges)\b/i.test(evidenceBlob)))
  ) {
    positive = stripFalseMotion(positive);
    elements = elements
      .replace(/;?\s*[^;]*\b(?:motion|streak)\b[^;]*/gi, "")
      .replace(/^;\s*|;\s*$/g, "");
    layout = stripFalseMotion(layout);
    camera = stripFalseMotion(camera);
    negative = mergeNegatives(negative, "motion blur speed streak, soft bokeh background blur");
    return {
      positive: tidy(positive),
      elements: tidy(elements),
      layout: tidy(layout),
      camera: tidy(camera),
      negative: tidy(negative),
    };
  }

  if (hasMotionEvidence) {
    if (hasBokehClaim && !hasOpticalBokehEvidence) {
      positive = positive
        .replace(/\bwith\s+soft\s+bokeh\s+blur\s+effect\b/gi, "with directional motion blur speed streak")
        .replace(/\bsoft\s+bokeh\s+blur\s+effect\b/gi, "directional motion blur speed streak")
        .replace(/\bsoft\s+bokeh(?:\s+blur)?\b/gi, "motion blur streak")
        .replace(/\bbokeh\s+blur\b/gi, "motion blur");
      camera = camera
        .replace(/\bsoft\s+bokeh(?:\s+blur)?\b/gi, "motion streak")
        .replace(/\bshallow\s+(?:DOF|depth of field)\b/gi, "subject motion blur");
      layout = layout
        .replace(/\bsoft\s+bokeh(?:\s+blur)?(?:\s+effect)?\b/gi, "motion blur streak")
        .replace(/\bbokeh\b/gi, "motion streak");
    }
    // 半边拖影时，禁止整人 fully sharp / deep DOF 全锐
    if (/\b(fully\s+sharp|deep\s+DOF[^.]*fully\s+sharp|whole\s+subject\s+(?:is\s+)?sharp)\b/i.test(camera)) {
      camera = camera
        .replace(
          /\bdeep\s+DOF\s+with\s+fully\s+sharp\s+focus\s+on\s+the\s+face\s+and\s+upper\s+torso\b/gi,
          "leading edge remains clearer while the trailing side shows motion streak"
        )
        .replace(/\bfully\s+sharp\b/gi, "partially sharp with motion streak")
        .replace(/\bdeep\s+DOF\b/gi, "mixed sharpness with motion streak");
    }
    if (!/\bmotion\b|\bstreak\b/i.test(positive)) {
      positive = `directional motion blur speed streak on the trailing side of the primary subject, ${positive}`;
    }
    negative = mergeNegatives(
      negative,
      "soft bokeh background blur, double-exposure ghost overlay, fully static subject with no streak"
    );
  } else if (hasGhostEvidence && hasBokehClaim && !hasOpticalBokehEvidence) {
    positive = positive
      .replace(/\bwith\s+soft\s+bokeh\s+blur\s+effect\b/gi, "with translucent double-exposure ghost overlay")
      .replace(/\bsoft\s+bokeh\s+blur\s+effect\b/gi, "translucent double-exposure ghost overlay")
      .replace(/\bsoft\s+bokeh(?:\s+blur)?\b/gi, "ghost overlay");
    negative = mergeNegatives(negative, "motion blur speed streak, soft bokeh background blur");
  } else if (hasBokehClaim && !hasOpticalBokehEvidence && solidStudioVoid) {
    // 实心影棚色底上的假 bokeh：只删除误标，不发明 motion
    positive = positive
      .replace(/\bwith\s+soft\s+bokeh\s+blur\s+effect\b/gi, "")
      .replace(/\bsoft\s+bokeh\s+blur\s+effect\b/gi, "")
      .replace(/\b,\s*soft\s+bokeh(?:\s+blur)?\b/gi, "")
      .replace(/\bsoft\s+bokeh(?:\s+blur)?\b/gi, "");
    camera = camera
      .replace(/\bsoft\s+bokeh(?:\s+blur)?\b/gi, "")
      .replace(/\bshallow\s+(?:DOF|depth of field)\b/gi, "deep DOF");
    layout = layout.replace(/\bsoft\s+bokeh(?:\s+blur)?(?:\s+effect)?\b/gi, "");
    negative = mergeNegatives(negative, "soft bokeh background blur");
  }

  return {
    positive: tidy(positive),
    elements: tidy(elements),
    layout: tidy(layout),
    camera: tidy(camera),
    negative: tidy(negative),
  };
}

/**
 * 有人像却缺人种/外貌锁时补写到 positive（必要时也写入 elements）
 * @param {string} positive
 * @param {string} elements
 * @param {string} layout
 * @param {string} [style]
 */
export function repairMissingPhenotype(positive, elements, layout, style = "") {
  const pos = String(positive || "").trim();
  const els = String(elements || "").trim();
  const lay = String(layout || "").trim();
  const peopleBlob = `${els} ${pos} ${lay}`;
  const hasPeople =
    /\b(woman|man|boy|girl|child|children|people|person|family|figure|figures|elderly|crowd|character)\b/i.test(
      peopleBlob
    );
  if (!hasPeople) return { positive: pos, elements: els };

  // 硬边色光肖像：自然肤色/人种不可靠，不补写
  if (hasHardEdgeFlatGraphicEvidence(`${style} ${peopleBlob}`)) {
    return { positive: pos, elements: els };
  }

  // 已有外貌短语：确保出现在 positive 前部
  const existing = peopleBlob.match(PHENOTYPE_APPEARANCE_RE);
  if (existing) {
    if (PHENOTYPE_APPEARANCE_RE.test(pos)) return { positive: pos, elements: els };
    const cue = existing[0];
    return {
      positive: `${cue}, ${pos}`.replace(/\s{2,}/g, " ").trim(),
      elements: els,
    };
  }

  const inferred = inferPhenotypeLock(`${peopleBlob} ${style}`);
  if (!inferred) return { positive: pos, elements: els };

  let nextElements = els;
  // 给首个含人物的 element 名补上外貌词（若尚未含）
  if (nextElements && !PHENOTYPE_APPEARANCE_RE.test(nextElements)) {
    nextElements = nextElements.replace(
      /^([^|;]*?\b(?:woman|man|boy|girl|child|people|person|family|figure|elderly)[^|;]*)\|/i,
      (m, name) => `${String(name).trim()} ${inferred}|`
    );
  }

  return {
    positive: `${inferred}, ${pos}`.replace(/\s{2,}/g, " ").trim(),
    elements: nextElements,
  };
}

/** 从正文去掉旧示例指纹色 */
export function scrubExamplePaletteTokens(text) {
  return String(text || "")
    .replace(
      /\bcolor palette\s+bg\s*#?1A1A1A\s*,\s*hero\s*#?2F3A28\s*,\s*accent\s*#?8B0000\s*,\s*glow\s*#?E08940\s*,\s*secondary\s*#?5A5A5A\b[, ]*/gi,
      " "
    )
    .replace(/#2F3A28\b/gi, "")
    .replace(/#E08940\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .replace(/\s+,/g, ",")
    .trim();
}

/** 粘性套话：无明确 2D 线稿证据时，清掉误注入的 cel/ink illustration */
const CEL_INK_STOCK_RE =
  /\b(?:painted\s+)?cel(?:\/|\s+)?ink(?:\s+illustration|\s+style)?(?:\s+with\s+soft\s+shading(?:\s+and\s+muted\s+palette)?)?\b/gi;

/**
 * 契约污染模式（举一反三）：
 * 凡「出现在 system/schema/FORBIDDEN/负向样板里的具体场景短语」都可能被模型原样粘贴。
 * 处理原则：契约只写规则与格式占位；运行时 scrub 清掉已知指纹；frontLoad 负向按证据门控。
 * 新增规则时禁止再写可迁移到其他图的具体例句。
 */
/** 契约示例指纹 + 常见半帧空区套话 */
const STOCK_SCHEMA_PHRASE_RES = [
  /\bright doorway\s*→\s*EXTERIOR rain\s*\+\s*outdoor stairs\b/gi,
  /\bupper-left break\s*→\s*EXTERIOR sunlit ruins\b/gi,
  /\bmountain peaks\|upper-center\|secondary;\s*path stroke\|mid-to-lower-center\|primary;\s*soft bleed shadow\|lower-left\|secondary\b/gi,
  /\bwhite\s*["""]9["""]\s*\+\s*red\s*["""]11["""]\b/gi,
  /\bfull-height\s+SOLID\s+red\s+vertical\s+stripe\s+on\s+exact\s+center\s+axis\b/gi,
  /\belderly woman grey hair;\s*two young boys;\s*elderly man gaunt;\s*young woman dark hoodie;\s*young woman tactical jacket\b/gi,
  /\bChinese\s+福\s+calendar;\s*Arabic\s+news\s+banner\b/gi,
  /\bempty (?:black )?field on (?:the )?(?:LEFT|RIGHT)\b/gi,
  /\blower-(?:RIGHT|LEFT)[^.…]{0,40}?empty (?:black )?(?:field|half|side)\b/gi,
  /\bempty upper two[-\s]?thirds\b/gi,
  /\bclasped[-\s]?behind[-\s]?back\b/gi,
  // 浮雕误注入的「影棚岩板物件」套话
  /\bsculptural relief art object\b/gi,
  /\bstudio seamless backdrop\b/gi,
  /\bseamless studio backdrop\b/gi,
  /\bfull-object product framing\b/gi,
];

/** 无裁切时不应出现的 anti-heal 样板句 */
const ANTI_HEAL_STOCK_RES = [
  /\bfull uncropped head with headroom\b[,;.]?\s*/gi,
  /\bconsistent margins on all edges\b[,;.]?\s*/gi,
  /\bsubject fully inside safe frame\b[,;.]?\s*/gi,
  /\bsafe headroom\b[,;.]?\s*/gi,
  /\bmargins consistent on all edges\b[,;.]?\s*/gi,
  /\buncropped (?:head|forehead|chin|shoulders)\b[,;.]?\s*/gi,
  /\banti[-\s]?crop\b[,;.]?\s*/gi,
  /\bheadroom above cut heads?\b[,;.]?\s*/gi,
  /\bsafe margins on all edges\b[,;.]?\s*/gi,
];

/**
 * 负向里点名身份/文化具体词会诱发粉红象——一律换成抽象或删除
 * @param {string} negative
 */
export function scrubPinkElephantNegatives(negative) {
  return String(negative || "")
    .replace(/\binvented or missing hijab\b[,;]?\s*/gi, "")
    .replace(/\binvented or missing white beard\b[,;]?\s*/gi, "")
    .replace(/\bhijab\b[,;]?\s*/gi, "")
    .replace(/\bwhite beard\b[,;]?\s*/gi, "")
    .replace(/\bArabic TV banner\b[,;]?\s*/gi, "")
    .replace(/\bGaza posters?\b[,;]?\s*/gi, "")
    .replace(/\bChinese fortune calendar\b[,;]?\s*/gi, "")
    .replace(/\bMiddle Eastern cast swap\b[,;]?\s*/gi, "regional cast swap, ")
    .replace(/\bEast-Asian cast swap\b[,;]?\s*/gi, "regional cast swap, ")
    // 点名人种/地域 → 抽象对抗（粉红象）
    .replace(/\bwrong ethnicity\s*\([^)]*\)\b/gi, "wrong ethnicity")
    .replace(/\bwrong ethnicity\s*[—\-–:]\s*[^,;.]+/gi, "wrong ethnicity")
    .replace(/\bnon[-\s]?(?:East[-\s]?Asian|European|African|Latino|Hispanic|South[-\s]?Asian|West[-\s]?Asian)\b[,;]?\s*/gi, "")
    .replace(
      /\b(?:East[-\s]?Asian|European|African|Latino|Hispanic|South[-\s]?Asian|West[-\s]?Asian)\s+(?:cast|faces?|people|phenotype)\b[,;]?\s*/gi,
      "wrong regional cast, "
    )
    .replace(/\bhistorical war-epic restyle\b[,;]?\s*/gi, "")
    .replace(/\bancient dynasty signage\b[,;]?\s*/gi, "")
    .replace(/\bperiod costumes\b[,;]?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .trim();
}

/**
 * 风格场澄清（兼容入口）→ fidelity-core 按介质族纠错
 * @param {string} style
 * @param {string} [evidenceBlob]
 */
export function clarifyStyleField(style, evidenceBlob = "") {
  return clarifyStyleByFamily(style, evidenceBlob);
}

/**
 * 完整物件构图纠偏（兼容入口）→ fidelity-core
 * @param {string} positive
 * @param {string} layout
 * @param {string} camera
 * @param {string} elements
 * @param {string} style
 */
export function repairFullObjectFraming(positive, layout, camera, elements = "", style = "") {
  const r = repairFramingByMode({ positive, layout, camera, elements, style });
  return { positive: r.positive, layout: r.layout, camera: r.camera };
}

/**
 * 是否具备真实 UI chrome 证据（孤立 search bar 不算）
 * @param {string} blob
 */
export function hasRealUiChromeEvidence(blob) {
  return /\b(dashboard|toolbar|sidebar|button row|toggle|checkbox|dropdown|modal|status bar|nav(?:igation)? bar|wireframe|app screen|settings panel|window chrome|tab bar|menu bar)\b/i.test(
    String(blob || "")
  );
}

/**
 * 剥离无证据的 search-bar / 生成器宿主 UI 幻觉
 * @param {string} text
 */
function stripInventedSearchUiChrome(text) {
  return String(text || "")
    .replace(/;?\s*[^;]*\bsearch\s*bar(?:\s+UI(?:\s+element)?)?\b[^;]*/gi, "")
    .replace(/\bsearch\s*bar(?:\s+UI(?:\s+element)?)?(?:\s*\([^)]*\))?/gi, " ")
    .replace(/\bsearch\s*(?:image\s*)?(?:button|field|box|icon|chrome)\b/gi, " ")
    .replace(/\b(?:floating|host|generator)\s+UI\s+chrome\b/gi, " ")
    .replace(/\bUI\s+element\s*\(lower-right\)\b/gi, " ")
    .replace(/^;\s*|;\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .trim();
}

/**
 * 仅清宿主页 / 生成器 UI 幻觉；不改写艺术风格与密度（交给 VLM）
 * @param {{ style?: string, positive?: string, layout?: string, elements?: string, negative?: string, camera?: string }} pack
 */
export function scrubInventedHostUiChrome(pack = {}) {
  let style = String(pack.style || "").trim();
  let positive = String(pack.positive || "").trim();
  let layout = String(pack.layout || "").trim();
  let elements = String(pack.elements || "").trim();
  let negative = String(pack.negative || "").trim();
  let camera = String(pack.camera || "").trim();
  const blob = `${style} ${positive} ${layout} ${elements} ${camera}`;

  const tidy = (s) =>
    String(s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();

  if (!hasRealUiChromeEvidence(blob)) {
    elements = stripInventedSearchUiChrome(elements);
    positive = stripInventedSearchUiChrome(positive);
    layout = stripInventedSearchUiChrome(layout);
  }

  return {
    style: tidy(style),
    positive: tidy(positive),
    layout: tidy(layout),
    elements: tidy(elements),
    negative: tidy(negative),
    camera: tidy(camera),
  };
}

/** 身体部位条款（不算独立人数） */
export const BODY_PART_ELEMENT_RE =
  /\b(lips?|mouth|chin|jaw(?:line)?|nose|eyes?|iris|shoulders?|collarbones?|clavicles?|necks?|hands?|arms?|legs?|feet|foot|cheeks?|foreheads?|lower face|upper face|bare (?:left |right )?shoulder|half[-\s]?face)\b/i;

/**
 * 画面叠字 / 标题条款（不当人物、也不进 Scene）
 * @param {string} name
 */
export function isOverlayTypeElement(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  if (/^text\s*["“'`]/i.test(n)) return true;
  if (/\b(text overlay|typography overlay|type overlay|on-image type)\b/i.test(n)) return true;
  if (/\bsuperimposed on\b/i.test(n)) return true;
  return false;
}

/** Scene 不要再列 Type 已引用的同一句叠字 */
function sceneNameIsOverlayQuote(name, pack) {
  const n = String(name || "")
    .replace(/^text\s+/i, "")
    .replace(/^["“'`]+|["”'`]+$/g, "")
    .trim()
    .toLowerCase();
  if (!n) return false;
  return overlayTypeQuotesFromPack(pack).some((q) => {
    const t = String(q || "")
      .replace(/^["“'`]+|["”'`]+$/g, "")
      .trim()
      .toLowerCase();
    return Boolean(t) && t === n;
  });
}

/**
 * elements 名是否算「独立人物」（woman's lips / bare shoulder 不算）
 * @param {string} name
 */
export function isPersonFigureElement(name) {
  const n = String(name || "").trim();
  // 叠字叠在脸上：含 man/face 也不算第二个人
  if (isOverlayTypeElement(n)) return false;
  // 投影 / 剪影 / 倒影不算独立人物
  if (/\b(shadow|silhouette|reflection|cast shadow|投影|剪影|倒影)\b/i.test(n)) {
    return false;
  }
  // 道具/区域通过 relation 挂宿主：held by / behind <person> — 不算独立人物
  // 注意：behind glasses / beside the ear 等部位介词不算道具关系
  if (
    /\b(held by|holding|carried by|gripped by|in (?:the )?hands? of|in[- ]hand|in lap of|worn by|worn on|leaning against|sat on by|sitting on|attached to|background behind)\b/i.test(
      n
    ) ||
    /\b(?:behind|beside|in front of)\s+(?:a\s+|the\s+)?(?:[\w\-]+\s+){0,4}(?:woman|man|girl|boy|child|person|figure|character|officer|warrior)\b/i.test(
      n
    )
  ) {
    return false;
  }
  // 远景小点人影：不算可读人脸
  if (/\b(distant|tiny|far[- ]off)\b/i.test(n)) {
    return false;
  }
  if (
    !/\b(women|woman|men|man|boys?|girls?|children|child|kids?|people|persons?|family|figures?|elderly|crowd|characters?|humans?|father|mother|dad|mom|son|daughter|husband|wife|brother|sister|couple|parents?)\b/i.test(
      n
    )
  ) {
    return false;
  }
  // woman's lips / woman's bare shoulder → 部位，非第二个人
  if (
    /\b(?:woman|man|girl|boy|person|figure)'s\s+(?:bare\s+)?(?:lips?|mouth|chin|jaw|nose|eyes?|iris|shoulder|collarbone|clavicle|neck|hand|arm|lower face|upper face)\b/i.test(
      n
    )
  ) {
    return false;
  }
  // 以部位为主的条款（即便带 woman）
  if (BODY_PART_ELEMENT_RE.test(n)) {
    const withoutPossessive = n.replace(/\b(?:woman|man|girl|boy|person|figure)'s\b/gi, " ");
    if (
      !/\b(woman|man|girl|boy|person|figure|people|child)\b/i.test(withoutPossessive) ||
      (/^(?:[\w\-]+\s+){0,2}(?:lips?|mouth|chin|jaw|shoulder|collarbone|lower face)\b/i.test(
        withoutPossessive.trim()
      ) &&
        !/\b(standing|sitting|walking|waist[-\s]?up|full[-\s]?body|wearing)\b/i.test(n))
    ) {
      return false;
    }
  }
  // 枪/几何形等非人物头词开头且仅靠 relation 里的 figure 命中 — 上面已挡；再挡明显道具头
  if (
    /\b(rifle|gun|weapon|sword|bag|chair|backdrop|background|shape|triangle|poster|sign|logo|vehicle|car|bike)\b/i.test(
      n
    ) &&
    !/^\s*(?:young\s+|old(?:er)?\s+)?(?:muscular\s+)?(?:woman|man|boy|girl|child|person|figure|character)\b/i.test(
      n
    )
  ) {
    return false;
  }
  return true;
}

/**
 * 下半脸/无发特写：剥掉眼睛、注视、发丝逆光、假 flare；冷蓝底时剥暖红氛围误锁
 * @param {{ style?: string, positive?: string, layout?: string, elements?: string, negative?: string, camera?: string }} pack
 */
export function scrubCroppedPortraitHallucinations(pack = {}) {
  let style = String(pack.style || "").trim();
  let positive = String(pack.positive || "").trim();
  let layout = String(pack.layout || "").trim();
  let elements = String(pack.elements || "").trim();
  let negative = String(pack.negative || "").trim();
  let camera = String(pack.camera || "").trim();

  const tidy = (s) =>
    String(s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();

  const el = elements;
  const hasEyeInElements = /\b(eyes?|iris|gaze|brow|forehead)\b/i.test(el);
  const hasHairInElements =
    /\b(hair|bangs|fringe|ponytail|bun|braid)\b/i.test(el) &&
    !/\b(hair not visible|no (?:visible )?hair)\b/i.test(`${el} ${positive}`);
  const lowerFaceCrop =
    /\b(lips?|mouth|chin|jaw|lower face)\b/i.test(el) &&
    !hasEyeInElements &&
    !/\b(full face|face portrait|eyes? (?:open|visible)|forehead)\b/i.test(el);

  const stripEyesGaze = (s) =>
    tidy(
      String(s || "")
        .replace(/\bdeep brown eyes?\b/gi, " ")
        .replace(/\b(?:dark |light |hazel |green |blue |brown )?iris(?:\s+hue)?\b/gi, " ")
        .replace(/\biris hue\b/gi, " ")
        .replace(/\bgaze (?:directed )?at camera\b/gi, " ")
        .replace(/\blooking at camera\b/gi, " ")
        .replace(/\beye contact\b/gi, " ")
        .replace(/\beyes?\s*\([^)]*\)\b/gi, " ")
    );

  const stripHairRimFlare = (s) =>
    tidy(
      String(s || "")
        .replace(/\bbacklit golden rim light on hair edges\b/gi, " ")
        .replace(/\bbacklit(?:\s+golden)?\s+rim(?:\s+light)?(?:\s+on hair edges)?\b/gi, " ")
        .replace(/\bhair halo\b/gi, " ")
        .replace(/\brim light on hair(?:\s+edges?)?\b/gi, " ")
        .replace(/\blens flare\b/gi, " ")
        .replace(/\bcontre[-\s]?jour\b/gi, " ")
    );

  if (lowerFaceCrop) {
    positive = stripEyesGaze(positive);
    camera = stripEyesGaze(camera);
    layout = stripEyesGaze(layout);
    // 特写下半脸：front-facing torso / gaze 过重
    camera = tidy(
      camera
        .replace(/\bfront[-\s]?facing torso orientation\b/gi, "lower-face close-up")
        .replace(/\bfront[-\s]?facing torso\b/gi, "lower-face close-up")
    );
  }

  // 仅下半脸特写或明确无发时剥发丝逆光；天空逆光全身人像保留
  const hairExplicitlyAbsent =
    /\b(hair not visible|no (?:visible )?hair|natural hair not visible|hair out of frame)\b/i.test(
      `${el} ${positive} ${layout}`
    );
  if (lowerFaceCrop || hairExplicitlyAbsent) {
    positive = stripHairRimFlare(positive);
    camera = stripHairRimFlare(camera);
    layout = stripHairRimFlare(layout);
    style = stripHairRimFlare(style);
    if (!/invented rim|missing hair|false backlight/i.test(negative)) {
      negative = negative
        ? `${negative}, invented backlight rim, lens flare`
        : "invented backlight rim, lens flare";
    }
  }

  // 冷蓝底 vs 暖红氛围矛盾：以画面命名的蓝底为准
  const coolBlueBackdrop =
    /\b(blue|cool(?:\s+blue)?|cyan|灰蓝|蓝灰)\s+(?:backdrop|background|void|studio)\b/i.test(
      `${positive} ${layout} ${elements}`
    ) || /\bsoft[-\s]?focus blue\b/i.test(`${positive} ${layout} ${elements}`);
  if (coolBlueBackdrop) {
    positive = tidy(
      positive.replace(
        /\bdominant atmosphere grade:\s*warm\s+red[^,.]*/gi,
        "dominant atmosphere grade: cool blue ambient sampled from reference"
      )
    );
    positive = tidy(
      positive.replace(/\bwarm red ambient\b/gi, "cool blue ambient")
    );
  }

  return {
    style: tidy(style),
    positive: tidy(positive),
    layout: tidy(layout),
    elements: tidy(elements),
    negative: tidy(negative),
    camera: tidy(camera),
  };
}

/** @deprecated 兼容旧名 → scrubInventedHostUiChrome */
export function repairSoftAbstractWallpaper(pack = {}) {
  return scrubInventedHostUiChrome(pack);
}

/**
 * 硬边平涂图形肖像：纠偏软涂误标、假拖影、色光吃肤色时的人种锁、UI/buckle/通天光板脏词
 * @param {{ style?: string, positive?: string, layout?: string, elements?: string, negative?: string, camera?: string }} pack
 */
export function repairHardEdgeFlatGraphicShading(pack = {}) {
  const style = String(pack.style || "").trim();
  let positive = String(pack.positive || "").trim();
  let layout = String(pack.layout || "").trim();
  let elements = String(pack.elements || "").trim();
  let camera = String(pack.camera || "").trim();
  let negative = String(pack.negative || "").trim();
  const blob = `${style} ${positive} ${layout} ${elements} ${camera} ${pack.palette || ""}`;
  if (!hasHardEdgeFlatGraphicEvidence(blob)) {
    return { style, positive, layout, elements, negative, camera };
  }

  const tidy = (s) =>
    String(s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s]+|[,;\s]+$/g, "")
      .trim();

  const stripSoft = (s) =>
    tidy(
      String(s || "")
        .replace(/\b2D illustration\b/gi, " ")
        .replace(/\b(?:2D\s+)?soft[-\s]?paint(?:ed)?\/?(?:\s*comic)?(?:\s+illustration)?\b/gi, " ")
        .replace(/\bcomic illustration\b/gi, " ")
        .replace(/\bpainted illustration\b/gi, " ")
        .replace(/\bsoft blended(?:\s+shading)?\b/gi, " ")
        .replace(/\bthin clean contours\b/gi, " ")
        .replace(/\bsmooth finish\b/gi, " ")
        .replace(/\bsoft painterly(?:\s+shading)?\b/gi, " ")
        .replace(/\bcomic\b/gi, " ")
        .replace(/\/+(?=\s|,|$)/g, " ")
    );

  const stripFalseMotion = (s) =>
    tidy(
      String(s || "")
        .replace(
          /\bdirectional\s+motion\s+blur\s+speed\s+streak\s+on\s+the\s+trailing\s+side\s+of\s+the\s+primary\s+subject(?:,\s*)?/gi,
          " "
        )
        .replace(
          /\b(?:horizontal|vertical|directional)\s+motion\s+blur(?:\s+speed\s+streak)?(?:\s+on\s+(?:the\s+)?(?:trailing\s+side|camera-left|camera-right)(?:\s+of\s+the\s+primary\s+subject)?)?(?:,\s*)?/gi,
          " "
        )
        .replace(/\bmotion\s+blur\s+speed\s+streak(?:\s+on\s+[^,.;]+)?(?:,\s*)?/gi, " ")
        .replace(/\b(?:heavy|directional)\s+motion\s+blur(?:,\s*)?/gi, " ")
        // 拖影套话被剥后残留的 trailing-side 尾巴
        .replace(/(?:^|,\s*)on the trailing side of the primary subject(?:,\s*)+/gi, " ")
        .replace(/\bon the trailing side of the primary subject(?:,\s*)+/gi, " ")
    );

  const hasUiEvidence =
    /\b(dashboard|toolbar|sidebar|button|toggle|checkbox|dropdown|modal|status bar|nav(?:igation)? bar|wireframe|app screen|settings panel)\b/i.test(
      blob
    );
  const graphicLightDominates =
    /\b(electric blue|magenta|neon|pink (?:light|slab|rim|highlights?)|blue (?:suit|light|slab)|colored light|duotone|high[-\s]?contrast graphic|pink and blue|blue and pink)\b/i.test(
      blob
    ) &&
    (/\b(black void|solid black|pitch[-\s]?black|black background)\b/i.test(blob) ||
      /\bbg:#0{3,6}\b/i.test(blob));
  // 「belt buckle form-factor」本身不能当腰带证据
  const blobSansFalseBuckle = blob.replace(/\bbelt buckle form-factor(?:\s*\([^)]*\))?/gi, " ");
  const hasBeltEvidence =
    /\b(waist\s*belt|waistband|belted(?:\s+waist)?|腰带)\b/i.test(blobSansFalseBuckle) ||
    /\bbelt\b/i.test(blobSansFalseBuckle);
  const hasRealMotionMass =
    /\b(?:motion|streak)\s*\|/i.test(elements) &&
    !/\bno motion|\bno streak|deep graphic sharpness|fully static/i.test(`${positive} ${camera}`);

  let styleOut = stripSoft(style);
  if (!hasUiEvidence) {
    styleOut = tidy(
      styleOut
        .replace(/\s*\/\s*UI screenshot\b/gi, "")
        .replace(/\bUI screenshot\b/gi, "")
        .replace(/\s*\/\s*UI\b/gi, "")
    );
  }
  let posOut = stripSoft(positive);
  let layOut = layout;
  let elOut = elements;
  let camOut = camera;

  if (
    !/\b(flat graphic|hard[-\s]?edge flat|flat vector|flat color fills|flat solid fills)\b/i.test(
      styleOut
    )
  ) {
    styleOut = tidy(`flat graphic, hard-edge flat color fills, high-contrast graphic lighting, ${styleOut}`);
  } else if (!/\bhard[-\s]?edge flat\b/i.test(styleOut) && !/\bflat color fills\b/i.test(styleOut)) {
    styleOut = tidy(`${styleOut}, hard-edge flat color fills`);
  }

  // 假拖影：硬边色光肖像默认静态，除非 elements 有独立 streak 质量证据
  if (!hasRealMotionMass) {
    posOut = stripFalseMotion(posOut);
    layOut = stripFalseMotion(layOut);
    camOut = stripFalseMotion(camOut);
    elOut = tidy(
      elOut
        .replace(/;?\s*[^;]*\b(?:motion|streak)\b[^;]*/gi, "")
        .replace(/^;\s*|;\s*$/g, "")
    );
    if (!/motion blur/i.test(negative)) {
      negative = negative
        ? `${negative}, motion blur speed streak`
        : "motion blur speed streak";
    }
  }

  // 色光吃掉自然肤色：去掉人种/自然肤色带锁（保留表情/虹膜）
  if (graphicLightDominates) {
    const scrubPheno = (s) =>
      tidy(
        String(s || "")
          .replace(PHENOTYPE_APPEARANCE_RE, " ")
          .replace(/\bSkin:\s*[^,]*(?:\(#[0-9A-Fa-f]{6}\))?[, ]*/gi, " ")
          .replace(
            /\bmid-tone(?:\s+\w[\w-]*)?\s+with\s+(?:warm|cool|neutral)\s+undertone(?:\s*\(#[0-9A-Fa-f]{6}\))?[, ]*/gi,
            " "
          )
          .replace(/\bfacial features\b/gi, " ")
      );
    posOut = scrubPheno(posOut);
    elOut = scrubPheno(elOut);
  }

  // 无腰带证据时：领带/领口上的 buckle 多为高光误读
  if (!hasBeltEvidence) {
    const scrubBuckle = (s) =>
      tidy(
        String(s || "")
          .replace(/\bTie:\s*visible belt buckle form-factor\s*\([^)]*\)\.?/gi, "Tie: visible.")
          .replace(/\bbelt buckle form-factor(?:\s*\([^)]*\))?/gi, " ")
          .replace(/\bsmall round metallic(?:\s+buckle)?\b/gi, " ")
          .replace(/\bconcrete garment subtype:\s*/gi, "")
      );
    posOut = scrubBuckle(posOut);
    elOut = scrubBuckle(elOut);
  }

  // 肖像色光 ≠ 通天左右半幅色条（几何海报有独立色条证据时跳过）
  const trueFullFrameSlabs =
    /\b(vertical (?:color )?slab|full-height (?:color |light )?band|geometric (?:color )?blocks?)\b/i.test(
      blob
    ) && !/\b(face|portrait|collar|cheek)\b/i.test(blob);
  if (!trueFullFrameSlabs && /\b(portrait|face|collar|cheek)\b/i.test(blob)) {
    const scrubSlabs = (s) =>
      tidy(
        String(s || "")
          .replace(
            /\b(?:Blue|Pink|Magenta) light slab spans (?:the )?(left|right) half of (?:the )?frame from top to bottom\.?/gi,
            (m, side) =>
              `${/pink|magenta/i.test(m) ? "Pink" : "Blue"} light on the ${side} side of the subject`
          )
          .replace(
            /\bBoth light slabs are sharp and distinct, occupying the full height of the frame\.?/gi,
            "Blue/pink light split across the face and collar with hard edges"
          )
          .replace(
            /\bPink light slab occupies right half of frame, blue light slab left half, both sharp with no streaks or bokeh\.?/gi,
            "Pink light on the right side of the subject, blue light on the left side, both hard-edged with no streaks or bokeh"
          )
      );
    posOut = scrubSlabs(posOut);
    layOut = scrubSlabs(layOut);
  }

  // 负向：禁止 ban 真 finish；对抗软涂/毛孔
  negative = tidy(
    negative
      .replace(/\b(?:do not:?\s*|avoid\s+)?flat color fills\b/gi, " ")
      .replace(/\b(?:do not:?\s*|avoid\s+)?flat solid fills\b/gi, " ")
      .replace(/\b(?:do not:?\s*|avoid\s+)?hard[-\s]?edge flat(?:\s+fills?)?\b/gi, " ")
  );
  const softBan = "soft blended shading, photoreal skin pores, painterly gradients";
  for (const part of softBan.split(/,\s*/)) {
    if (!new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(negative)) {
      negative = negative ? `${negative}, ${part}` : part;
    }
  }

  return {
    style: styleOut,
    positive: posOut,
    layout: tidy(layOut),
    elements: tidy(elOut),
    negative: tidy(negative),
    camera: tidy(camOut),
  };
}

/**
 * 画面文字证据：双引号 ∪ 单引号标题 ∪ 关键词（三处导出/纠偏共用）
 * @param {string} blob
 */
export function hasTypographyEvidence(blob) {
  const b = String(blob || "");
  if (!b.trim()) return false;
  if (/["“][^"”]{1,}["”]/.test(b)) return true;
  // 单引号标题：'FORM' / ‘MESSI’ — 避开 don't 类缩写（字母间撇号）
  if (/(?:^|[^A-Za-z])['‘]([^'’\n]{1,80})['’](?![A-Za-z])/.test(b)) return true;
  return /\b(title text|poster title|credit block|directed by|name text|vertical (?:name )?text|signature|lettering|typography overlay|type overlay|text overlay|text block|frame[-\s]?level (?:title|name|type|typography)|演职员|海报标题|字幕|标题文字)\b/i.test(
    b
  );
}

/**
 * 抽出引用字符串（最多 4 条），统一成双引号
 * @param {string} text
 * @returns {string[]}
 */
export function extractQuotedTypePhrases(text) {
  const s = String(text || "");
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const push = (q) => {
    const t = String(q || "").trim();
    if (!t || t.length > 80) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(`"${t}"`);
  };
  let m;
  const dbl = /["“]([^"”]{1,80})["”]/g;
  while ((m = dbl.exec(s)) && out.length < 4) push(m[1]);
  const sgl = /(?:^|[^A-Za-z])['‘]([^'’\n]{1,80})['’](?![A-Za-z])/g;
  while ((m = sgl.exec(s)) && out.length < 4) push(m[1]);
  return out;
}

const GARMENT_QUOTE_CTX_RE =
  /\b(wearing|jersey|shirt|shorts|uniform|tee|hoodie|vest|kit|singlet|printed on|garment|chest (?:print|number)|number on)\b/i;

/**
 * 无 locks 的旧 Pack 回退：引号落在衣服语境里 → 不当成画面标题
 * @param {string} blob
 * @param {string} quote
 */
export function quoteLooksGarmentBound(blob, quote) {
  const q = String(quote || "")
    .replace(/^["“]|["”]$/g, "")
    .trim();
  if (!q) return false;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(.{0,90})['"“”‘’]${esc}['"“”‘’](.{0,48})`, "gi");
  let m;
  const s = String(blob || "");
  while ((m = re.exec(s))) {
    if (GARMENT_QUOTE_CTX_RE.test(`${m[1]} ${m[2]}`)) return true;
  }
  return false;
}

/**
 * 画面标题/字幕引号（排除球衣印刷）
 * @param {{ positive?: string, layout?: string, elements?: string, style?: string }} pack
 */
export function overlayTypeQuotesFromPack(pack) {
  const blob = `${pack?.positive || ""} ${pack?.layout || ""} ${pack?.elements || ""}`;
  return extractQuotedTypePhrases(blob).filter((q) => !quoteLooksGarmentBound(blob, q));
}

/**
 * 有真正的画面层文字（标题/字幕），不是衣服上的印刷
 * @param {{ positive?: string, layout?: string, elements?: string, style?: string }} pack
 */
export function hasOverlayTypographyEvidence(pack) {
  if (typeof pack?.locks?.overlayType === "boolean") return pack.locks.overlayType;
  const blob = `${pack?.positive || ""} ${pack?.layout || ""} ${pack?.elements || ""} ${pack?.style || ""}`;
  if (overlayTypeQuotesFromPack(pack).length) return true;
  const overlayKw =
    /\b(title text|poster title|credit block|directed by|name text|vertical (?:name )?text|signature|typography overlay|type overlay|text overlay|on-image type|frame[-\s]?level (?:title|name|type|typography)|演职员|海报标题|字幕|标题文字)\b/i.test(
      blob
    );
  if (!overlayKw) return false;
  const quotes = extractQuotedTypePhrases(blob);
  if (quotes.length && quotes.every((q) => quoteLooksGarmentBound(blob, q))) return false;
  return true;
}

/**
 * 长正文/段落引号（>80 字时短引号提取器会丢弃）
 * @param {string} text
 * @returns {string[]}
 */
export function extractLongBodyQuotes(text) {
  const s = String(text || "");
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  let m;
  const dbl = /["“]([^"”]{48,400})["”]/g;
  while ((m = dbl.exec(s)) && out.length < 3) {
    const t = String(m[1] || "").trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(`"${t}"`);
  }
  const sgl = /(?:^|[^A-Za-z])['‘]([^'’\n]{48,400})['’](?![A-Za-z])/g;
  while ((m = sgl.exec(s)) && out.length < 3) {
    const t = String(m[1] || "").trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(`"${t}"`);
  }
  return out;
}

/**
 * 导出/前置用的短排版锁
 * @param {{ positive?: string, layout?: string, elements?: string }} pack
 */
export function extractTypographyLockSnippet(pack) {
  if (pack?.locks?.overlayType === false) return "";
  const blob = `${pack?.positive || ""} ${pack?.layout || ""} ${pack?.elements || ""}`;
  const quotes = overlayTypeQuotesFromPack(pack);
  if (!quotes.length && !hasOverlayTypographyEvidence(pack)) return "";
  /** @type {string[]} */
  const bits = [];
  if (quotes.length) bits.push(`on-image type ${quotes.join(", ")}`);
  else bits.push("on-image typography as visible");
  if (/\bletterspaced|wide(?:\s+letter)?[-\s]?spac(?:ed|ing)|wide tracking\b/i.test(blob)) {
    bits.push("letterspaced wide tracking");
  } else if (/\btight tracking|tight kerning|condensed tracking\b/i.test(blob)) {
    bits.push("tight tracking");
  }
  const family = blob.match(
    /\b(sans[-\s]?serif|cursive|handwritten|serif|script|monospace)\b/i
  );
  if (family) bits.push(family[1].toLowerCase().replace(/\s+/g, "-"));
  if (/\b(thin|regular|bold|black)\s+(?:weight|sans|serif|type|lettering|caps|all-caps)\b/i.test(blob)) {
    const w = blob.match(/\b(thin|regular|bold|black)\b/i);
    if (w) bits.push(`${w[1].toLowerCase()} weight`);
  }
  bits.push("preserve placement and hierarchy");
  return bits.join(", ");
}

/**
 * Pack 级排版纠偏：layout/elements 有引用而 positive 没有时前置；有字时补短负向
 * @param {{ positive?: string, layout?: string, elements?: string, negative?: string }} pack
 */
export function repairTypographyLocks(pack) {
  const positive = String(pack?.positive || "").trim();
  const layout = String(pack?.layout || "").trim();
  const elements = String(pack?.elements || "").trim();
  let negative = String(pack?.negative || "").trim();
  const blob = `${positive} ${layout} ${elements}`;
  if (!hasOverlayTypographyEvidence({ positive, layout, elements })) {
    return { positive, negative };
  }

  let nextPos = positive;
  const posQuotes = overlayTypeQuotesFromPack({ positive });
  const otherQuotes = overlayTypeQuotesFromPack({ layout, elements });
  const snippet = extractTypographyLockSnippet({ positive, layout, elements });

  if (!posQuotes.length && snippet) {
    // positive 漏引号：从 layout/elements 或关键词镜像前置
    nextPos = nextPos ? `${snippet}, ${nextPos}` : snippet;
  } else if (
    posQuotes.length &&
    /\bletterspaced|wide(?:\s+letter)?[-\s]?spac(?:ed|ing)|wide tracking\b/i.test(`${layout} ${elements}`) &&
    !/\bletterspaced|wide tracking\b/i.test(positive)
  ) {
    nextPos = `letterspaced wide tracking, ${nextPos}`;
  } else if (!posQuotes.length && otherQuotes.length && snippet) {
    nextPos = nextPos ? `${snippet}, ${nextPos}` : snippet;
  }

  // 长正文：layout/elements 有长引号而 positive 缺漏或明显更短 → 镜像最长引号
  const longOthers = extractLongBodyQuotes(`${layout} ${elements}`);
  if (longOthers.length) {
    const longest = longOthers.reduce((a, b) => (a.length >= b.length ? a : b));
    const core = longest.replace(/^["']|["']$/g, "");
    if (core && !nextPos.includes(core.slice(0, Math.min(40, core.length)))) {
      nextPos = nextPos
        ? `body paragraph ${longest}, ${nextPos}`
        : `body paragraph ${longest}`;
    }
    const typeNegLong =
      "shortened body copy, truncated on-image prompt text, missing paragraph body text";
    for (const part of typeNegLong.split(/,\s*/)) {
      if (!new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(negative)) {
        negative = negative ? `${negative}, ${part}` : part;
      }
    }
  }

  const typeNeg =
    "invented extra caption, wrong type weight, tight tracking when letterspaced, missing on-image type";
  for (const part of typeNeg.split(/,\s*/)) {
    if (!new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(negative)) {
      negative = negative ? `${negative}, ${part}` : part;
    }
  }
  const famHit = blob.match(/\b(sans[-\s]?serif|cursive|handwritten|serif|script)\b/i);
  if (famHit) {
    const f = String(famHit[1] || "").toLowerCase();
    /** @type {string[]} */
    let famNeg = [];
    if (/cursive|handwritten|script/.test(f) && !/sans/.test(f)) {
      famNeg = ["serif title", "decorative serif lettering", "roman serif type"];
    } else if (/sans/.test(f)) {
      famNeg = ["serif title", "cursive script lettering"];
    } else if (f === "serif") {
      famNeg = ["sans-serif title", "cursive handwritten script"];
    }
    for (const part of famNeg) {
      if (!new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(negative)) {
        negative = negative ? `${negative}, ${part}` : part;
      }
    }
  }

  const tidy = (s) =>
    String(s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();
  return { positive: tidy(nextPos), negative: tidy(negative) };
}

/**
 * 从 camera/layout/elements 提取躯干朝向（camera-left / camera-right）
 * @param {string} blob
 * @returns {"camera-left"|"camera-right"|null}
 */
function extractTorsoFacingSide(blob) {
  const b = String(blob || "");
  const m =
    b.match(
      /\btorso[^\n.,;]{0,40}?(?:profile|three[-\s]?quarter|front|back)?[^\n.,;]{0,24}?(?:toward|towards|to|facing)?\s*(camera[-\s]?left|camera[-\s]?right)\b/i
    ) ||
    b.match(
      /\b(?:body|figure)\s+(?:in\s+)?(?:profile|three[-\s]?quarter)?[^\n.,;]{0,20}?(?:toward|towards|facing)\s*(camera[-\s]?left|camera[-\s]?right|left|right)\b/i
    ) ||
    b.match(
      /\b(?:facing|toward|towards)\s*(camera[-\s]?left|camera[-\s]?right)\b[^\n.,;]{0,24}?\btorso\b/i
    ) ||
    b.match(/\btorso[-\s]?profile[-\s]?(left|right)\b/i) ||
    b.match(/\bturn side:\s*(camera[-\s]?left|camera[-\s]?right)\b/i);
  if (!m) return null;
  const raw = String(m[1] || "").toLowerCase().replace(/\s+/g, "-");
  if (raw === "left" || raw === "camera-left") return "camera-left";
  if (raw === "right" || raw === "camera-right") return "camera-right";
  return null;
}

/**
 * Pack 级姿势朝向纠偏：镜像 torso/head 朝向到 positive，并禁镜像翻转
 * @param {{ positive?: string, layout?: string, camera?: string, elements?: string, negative?: string }} pack
 */
export function repairPoseLocks(pack) {
  const positive = String(pack?.positive || "").trim();
  const layout = String(pack?.layout || "").trim();
  const camera = String(pack?.camera || "").trim();
  const elements = String(pack?.elements || "").trim();
  let negative = String(pack?.negative || "").trim();
  const src = `${layout} ${camera} ${elements}`;
  const side = extractTorsoFacingSide(src);
  if (!side) {
    return { positive, negative };
  }

  const opposite = side === "camera-right" ? "camera-left" : "camera-right";
  let nextPos = positive;
  const sideInPos =
    extractTorsoFacingSide(positive) === side ||
    new RegExp(`torso[^\\n.,;]{0,40}${side.replace("-", "[-\\\\s]?")}`, "i").test(positive) ||
    new RegExp(`\\b(?:facing|toward|towards)\\s*${side.replace("-", "[-\\\\s]?")}\\b`, "i").test(
      positive
    );

  if (!sideInPos) {
    const headCue = /\bhead\s+(?:turned|three[-\s]?quarter).{0,40}camera\b|\blook[-\s]?back\b|\bgaze\s+at\s+camera\b/i.test(
      src
    )
      ? ", head turned to camera / look-back gaze"
      : "";
    const phrase = `torso profile toward ${side}${headCue}`;
    nextPos = nextPos ? `${phrase}, ${nextPos}` : phrase;
  }

  const poseNeg = `mirrored pose, torso facing ${opposite}, wrong turn direction`;
  for (const part of poseNeg.split(/,\s*/)) {
    if (!new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(negative)) {
      negative = negative ? `${negative}, ${part}` : part;
    }
  }

  const tidy = (s) =>
    String(s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();
  return { positive: tidy(nextPos), negative: tidy(negative) };
}

/** @param {string} s */
function tidyLightText(s) {
  return String(s || "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .trim();
}

/**
 * 直闪/抓拍光影证据
 * @param {string} blob
 */
export function hasFlashCaptureEvidence(blob) {
  const b = String(blob || "");
  if (
    /\b(on[-\s]?camera flash|direct (?:camera )?flash|flash snapshot|hard flash(?: cast)? shadow|flash cast shadow|glossy flash skin|candid flash|手机快照|直闪)\b/i.test(
      b
    )
  ) {
    return true;
  }
  return /\bflash\b/i.test(b) && /\b(high[-\s]?iso|pixel grain|lo[-\s]?fi|hard cast shadow)\b/i.test(b);
}

/**
 * 脸部方向光 / 高对比光比证据（不含「高对比图形光」这类平面海报措辞）
 * @param {string} blob
 */
export function hasFaceLightingEvidence(blob) {
  const b = String(blob || "");
  if (
    /\b(Rembrandt|split lighting|side[-\s]?lit|chiaroscuro|half[-\s]?lit|lit (?:from|on) (?:the )?(?:left|right|camera[-\s]?left|camera[-\s]?right)|key light|fill light|shadow side|rim light|edge light|面部光比|侧光|伦勃朗)\b/i.test(
      b
    )
  ) {
    return true;
  }
  if (/\b(warm )?directional (?:key |sun)?light|illuminates?\s+(?:the\s+)?subject\s+from|shadow play|casting shadows across\b/i.test(b)) {
    return true;
  }
  if (/\bhigh[-\s]?contrast(?:\s+(?:portrait|face|key(?:\s+light)?))\b/i.test(b)) return true;
  if (
    /\bhigh[-\s]?contrast\s+lighting\b/i.test(b) &&
    /\b(face|portrait|cheek|jaw|woman|man|person|girl|boy)\b/i.test(b) &&
    !/\bhigh[-\s]?contrast graphic\b/i.test(b)
  ) {
    return true;
  }
  return (
    /\b(face|portrait|cheek|jaw|neck|shoulder)\b/i.test(b) &&
    /\b(hard shadow|deep shadow|half[-\s]?lit)\b/i.test(b)
  );
}

/**
 * 投影图案：百叶条纹 / 树叶斑驳 gobo
 * @param {string} blob
 */
export function hasProjectedShadowPatternEvidence(blob) {
  const b = String(blob || "");
  return /\b(blind|slat|bar(?:red)? shadow|striped shadow|banded shadow|window shadow|linear shadow|dappl|mottled|gobo|foliage shadow|leaf(?:y)? shadow|斑驳|百叶|条纹阴影|树叶光斑)\b/i.test(
    b
  );
}

/**
 * 逆光轮廓光（禁止用 framing/primary 子串，也禁止 “no rim light” 假阳性）
 * 单独 lens flare / 樱桃高光不够 — 需背光或发丝轮廓证据
 * @param {string} blob
 */
export function hasBacklightRimEvidence(blob) {
  const b = String(blob || "");
  if (/\b(no rim|without rim|rim absent|no rim light)\b/i.test(b)) return false;
  if (/\b(backlit|hair halo|contre[-\s]?jour|逆光|轮廓光|sun behind)\b/i.test(b)) {
    return true;
  }
  // 招牌/屏幕 backlight ≠ 发丝轮廓光
  if (/\bbacklight\b/i.test(b)) {
    if (
      /\b(sign|panel|screen|display|lettering|text|calligraphy|noren|illuminated)\b/i.test(b) &&
      !/\b(hair|head)\b/i.test(b)
    ) {
      return false;
    }
    return true;
  }
  // rim/edge light 需与头发/背光同现；禁止 cherry specular 被当成 rim
  if (/\b(rim light|edge light)\b/i.test(b) && /\b(hair|backlit|backlight|halo|contre)\b/i.test(b)) {
    return true;
  }
  return false;
}

/**
 * 氛围色证据：烟雾 ∪ 霓虹/夜景/湿反射/emissive ∪ glow hex ∪ 金色小时逆光
 * @param {string} blob
 */
export function hasAtmosphereLightingEvidence(blob) {
  const b = String(blob || "");
  if (/\bglow\s*:?\s*#?[0-9a-f]{6}\b/i.test(b)) return true;
  if (hasBacklightRimEvidence(b)) return true;
  return /\b(smoke|haze|fog|smoky|雾|烟|neon|霓虹|夜景|night (?:scene|street|city|alley)|dusk|twilight|golden[-\s]?hour|wet (?:asphalt|street|pavement)|emissive|volumetric light|sun[-\s]?shaft|practical lamp|screen glow|lamplight|torch|fire glow|atmosphere grade|warm ambient)\b/i.test(
    b
  );
}

/**
 * 发光 spill 证据（控制 glow 角色是否保留/注入）
 * @param {string} blob
 */
export function hasEmissiveGlowEvidence(blob) {
  const b = String(blob || "");
  if (/\bglow\s*:?\s*#?[0-9a-f]{6}\b/i.test(b)) return true;
  if (hasBacklightRimEvidence(b)) return true;
  return /\b(neon|霓虹|emissive|fire|flame|ember|glow spill|screen glow|lamp(?:light)?|torch|led|backlit sign|发光)\b/i.test(
    b
  );
}

/**
 * 导出/前置用的短光影锁
 * @param {{ positive?: string, layout?: string, camera?: string, style?: string, elements?: string }} pack
 */
export function extractLightingLockSnippet(pack) {
  const blob = `${pack?.positive || ""} ${pack?.layout || ""} ${pack?.camera || ""} ${pack?.style || ""} ${pack?.elements || ""}`;
  const locks = pack?.locks;
  const rimLocked = locks && typeof locks.backlightRim === "boolean";
  const faceLocked = locks && typeof locks.faceLight === "boolean";
  // 炭笔素描：不输出写真 chiaroscuro / soft even 锁，避免生成器走写实人像
  if (packLooksCharcoalSketch(pack)) {
    if (/\b(tonal graphite|graphite contrast|soft smudge)\b/i.test(blob)) {
      return "tonal graphite contrast, soft smudge shading";
    }
    return "hand-drawn charcoal tonal shading";
  }
  /** @type {string[]} */
  const bits = [];
  if (hasFlashCaptureEvidence(blob)) {
    bits.push("on-camera flash lighting");
    bits.push(
      /\bhard flash(?: cast)? shadow|flash cast shadow\b/i.test(blob)
        ? "hard flash cast shadow"
        : "hard cast shadow"
    );
  } else if (/\b(blind|slat|bar(?:red)? shadow|striped shadow|banded shadow|window shadow|百叶|条纹)\b/i.test(blob)) {
    bits.push("window-blind / slat bar shadows striped across skin");
  } else if (/\b(dappl|mottled|gobo|foliage shadow|leaf(?:y)? shadow|斑驳|树叶)\b/i.test(blob)) {
    bits.push("dappled foliage / leaf gobo shadow patches");
  } else if (rimLocked ? locks.backlightRim : hasBacklightRimEvidence(blob)) {
    bits.push("intense golden backlight rim on hair strands");
    if (/\b(god\s*rays?|volumetric|light\s*shafts?|haze)\b/i.test(blob)) {
      bits.push("volumetric sunlight beams through atmospheric haze");
    }
    bits.push("high contrast between golden rim light and softly shadowed face");
    if (/\blens flare|bloom|halation\b/i.test(blob)) bits.push("subtle lens bloom and halation");
  } else if (
    /\bsoft even(?:\s+(?:overcast\s+)?(?:daylight|lighting|fill|light))?\b/i.test(blob) &&
    !hasFaceLightingEvidence(blob) &&
    !hasProjectedShadowPatternEvidence(blob)
  ) {
    bits.push("soft even lighting");
    if (/\bovercast|no patterned\b/i.test(blob)) bits.push("no patterned cast shadows");
  } else if (faceLocked && locks.faceLight === false) {
    // 无可读人脸：不把产品/街景方向光写成脸部光比
  } else if (
    hasFaceLightingEvidence(blob) ||
    hasProjectedShadowPatternEvidence(blob) ||
    (locks && locks.highKey)
  ) {
    if (
      (locks && locks.highKey) ||
      /\bhigh[-\s]?key|overexpos|clipped (?:white )?highlights\b/i.test(blob)
    ) {
      bits.push("high-key overexposed key, clipped white highlights on skin");
    }
    if (/\b(chiaroscuro|split lighting|Rembrandt|half[-\s]?lit|high[-\s]?contrast)\b/i.test(blob)) {
      bits.push("high-contrast split / chiaroscuro face lighting");
    }
    const side =
      blob.match(/\bfrom\s+(camera[-\s]?(?:left|right)|overhead)\b/i) ||
      blob.match(/\blit (?:from|on) (?:the )?(camera[-\s]?(?:left|right)|left|right|overhead)\b/i) ||
      blob.match(/\billuminates?\s+(?:the\s+)?subject\s+from\s+(?:the\s+)?(left|right|camera[-\s]?left|camera[-\s]?right|overhead)\b/i) ||
      blob.match(/\bfrom\s+(?:the\s+)?(left|right)\s+side\b/i) ||
      blob.match(/\bkey from\s+(camera[-\s]?(?:left|right)|overhead)\b/i);
    if (side) bits.push(`key from ${side[1].toLowerCase().replace(/\s+/g, "-")}`);
    if (/\b(hard light|crisp shadow|sharp cast)\b/i.test(blob)) bits.push("hard light");
    else if (/\b(soft diffused|soft wrap|soft even)\b/i.test(blob)) bits.push("soft light");
    if (/\b(controlled studio|studio key|studio top)\b/i.test(blob)) bits.push("studio key");
    else if (/\bnatural light\b/i.test(blob)) bits.push("natural light");
    if (/\bno rim|without rim|rim absent|no rim light\b/i.test(blob)) {
      bits.push("no rim light");
    } else if (/\brim light|edge light\b/i.test(blob)) {
      bits.push("rim/edge light present");
    }
    const hasDirBit = bits.some((b) => /\bdirectional\b/i.test(b));
    // 高曝光时禁止把 clipped white 改写成暖琥珀侧光；仅当正文已写 warm 且非 high-key 才透传
    if (
      /\bwarm directional\b/i.test(blob) &&
      !hasDirBit &&
      !(locks && locks.highKey) &&
      !/\bhigh[-\s]?key\b/i.test(bits.join(" "))
    ) {
      bits.push("warm directional key light");
    } else if (/\bdirectional\b/i.test(blob) && !hasDirBit) {
      bits.push("directional key light");
    }
    if (!bits.length) bits.push("directional face lighting");
  }
  if (!bits.length) return "";
  // 无 reference 编辑时 preserve lighting ratio 无锚点；rim 已写高反光比
  if (!/\bhigh contrast between golden rim\b/i.test(bits.join(" "))) {
    // 仅当正文已有明确光比描述时才保留短锁，不再无条件追加 preserve
  }
  return bits.join(", ");
}

/**
 * Pack 级光影纠偏：禁闪光→柔光升格；脸部光比/投影图案前置；短负向
 * @param {{ positive?: string, style?: string, layout?: string, camera?: string, elements?: string, negative?: string }} pack
 */
export function repairLightingLocks(pack) {
  let positive = String(pack?.positive || "").trim();
  let style = String(pack?.style || "").trim();
  let negative = String(pack?.negative || "").trim();
  let camera = String(pack?.camera || "").trim();
  const layout = String(pack?.layout || "").trim();
  const elements = String(pack?.elements || "").trim();
  const locks = pack?.locks;
  // lock 明确否定时，剥掉误注入的发丝轮廓光套话
  if (locks && locks.backlightRim === false) {
    positive = String(positive || "")
      .replace(/\bbacklit golden rim light on hair edges\b/gi, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();
  }
  let blob = `${positive} ${style} ${layout} ${camera} ${elements}`;
  const sketchPack = packLooksCharcoalSketch({ style, positive, elements, camera });

  const addNeg = (parts) => {
    for (const part of parts) {
      if (!new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(negative)) {
        negative = negative ? `${negative}, ${part}` : part;
      }
    }
  };

  const stripSoftUpgrade = (s) =>
    tidyLightText(
      String(s || "")
        .replace(/\bsoft even(?:\s+(?:warm\s+)?)?(?:lighting|fill|light)\b/gi, " ")
        .replace(/\beven warm fill\b/gi, " ")
        .replace(/\bsoft bloom\b/gi, " ")
        .replace(/\bno[-\s]?hard[-\s]?shadows\b/gi, " ")
        .replace(/\bstudio softbox\b/gi, " ")
        .replace(/\bcinematic (?:lighting|key light|soft light)\b/gi, " ")
    );

  // 把「发丝光」误标成 Graphic FX streak 清掉
  positive = tidyLightText(
    positive.replace(/\bGraphic FX:\s*subtle directional light streaks[^.]*(?:\.|$)/gi, " ")
  );
  blob = `${positive} ${style} ${layout} ${camera} ${elements}`;

  // 炭笔素描：剥写真 chiaroscuro 前置，改用石墨明暗；加写实皮负向
  if (sketchPack) {
    positive = tidyLightText(
      positive
        .replace(/\bhigh-contrast split\s*\/\s*chiaroscuro face lighting\b/gi, " ")
        .replace(/\bpreserve lighting ratio\b/gi, " ")
        .replace(/\bsplit chiaroscuro key\b/gi, " ")
        .replace(/\bsoft even wrap\b/gi, " ")
        .replace(/\bsoft even lighting\b/gi, " ")
    );
    camera = tidyLightText(
      camera
        .replace(/\bsplit chiaroscuro key\b/gi, "tonal graphite contrast")
        .replace(/\bsoft even wrap\b/gi, "tonal graphite contrast")
        .replace(/\bfully sharp flat 2D rendering\b/gi, "hand-drawn sketch on paper")
    );
    if (!/\b(tonal graphite|soft smudge|charcoal tonal)\b/i.test(`${positive} ${style}`)) {
      positive = positive
        ? `tonal graphite contrast, soft smudge shading, ${positive}`
        : "tonal graphite contrast, soft smudge shading";
    }
    addNeg([
      "photorealistic skin",
      "smooth digital painting",
      "hyperdetailed pores",
      "photoreal CGI",
      "anime faces",
    ]);
    return {
      positive: tidyLightText(positive),
      style: tidyLightText(style),
      camera: tidyLightText(camera),
      negative: tidyLightText(negative),
    };
  }

  if (hasFlashCaptureEvidence(blob)) {
    positive = stripSoftUpgrade(positive);
    style = stripSoftUpgrade(style);
    if (!/\bon[-\s]?camera flash|direct (?:camera )?flash|flash snapshot\b/i.test(`${positive} ${style}`)) {
      positive = positive ? `on-camera flash, ${positive}` : "on-camera flash";
    }
    if (!/\bhard (?:flash )?cast shadow|flash cast shadow\b/i.test(positive)) {
      positive = `hard flash cast shadow, ${positive}`;
    }
    addNeg(["soft even lighting", "soft bloom", "cinematic lighting upgrade", "missing hard cast shadow"]);
  } else if (
    hasFaceLightingEvidence(blob) ||
    hasProjectedShadowPatternEvidence(blob) ||
    hasBacklightRimEvidence(blob)
  ) {
    if (
      /\bhigh[-\s]?contrast|Rembrandt|split lighting|side[-\s]?lit|chiaroscuro|dappl|blind|slat|backlit|shadow pattern\b/i.test(
        blob
      )
    ) {
      positive = stripSoftUpgrade(positive);
      style = stripSoftUpgrade(style);
      camera = stripSoftUpgrade(camera);
      style = style.replace(/\bsoft continuous gradients\b/gi, "natural finish");
      // 有投影图案时清掉 camera/positive 里的 soft even fill 污染
      positive = positive.replace(/\bsoft even fill(?:\s+lighting)?\b/gi, " ");
      camera = camera.replace(/\bsoft even fill(?:\s+lighting)?\b/gi, " ");
    }
    addNeg(["soft even lighting", "even warm fill", "invented rim light", "flat beauty light"]);
  } else if (/\bsoft even(?:\s+(?:overcast\s+)?(?:daylight|lighting|fill|light))?\b/i.test(blob)) {
    // 柔光均匀：钉住 soft even，禁止生成器发明百叶/斑驳投影
    if (!/\bsoft even\b/i.test(positive)) {
      positive = positive ? `soft even lighting, ${positive}` : "soft even lighting";
    }
    addNeg([
      "window-blind slat shadows",
      "dappled foliage gobo",
      "invented patterned light",
      "split chiaroscuro",
    ]);
  }

  const snippet = extractLightingLockSnippet({
    positive,
    style,
    layout,
    camera,
    elements,
    locks,
  });
  if (snippet) {
    const head = positive.slice(0, 280).toLowerCase();
    // 仅认「已前置的锁短语」，勿因正文里偶然出现 high-contrast 而跳过
    if (
      !/preserve lighting ratio|on-camera flash lighting|high-contrast split|high-contrast face lighting|slat bar shadows|dappled foliage|backlit golden rim|warm directional key|directional key light|directional face lighting|high-key|tonal graphite|hand-drawn charcoal/i.test(
        head
      )
    ) {
      positive = positive ? `${snippet}, ${positive}` : snippet;
    }
  }

  return {
    positive: tidyLightText(positive),
    style: tidyLightText(style),
    camera: tidyLightText(camera),
    negative: tidyLightText(negative),
  };
}

/**
 * 无片名证据时去掉海报/电影原画措辞；照片拼贴/运动图形海报则反向纠偏出插画软涂
 * @param {string} style
 * @param {string} positive
 * @param {string} layout
 * @param {string} elements
 */
export function scrubFalsePosterChrome(style, positive, layout, elements = "") {
  const blob = `${style} ${positive} ${layout} ${elements}`;
  const hasType = hasTypographyEvidence(blob);
  // 照片抠图拼贴 / 运动图形海报：不是手绘 2D
  const looksGraphicPoster =
    /\b(graphic design poster|sports poster|photo[-\s]?collage(?:\s+poster)?|poster collage|photo(?:graphic)? cutout|cutout (?:figure|photo|portrait))\b/i.test(
      blob
    ) ||
    (hasType &&
      /\b(flat (?:cream |beige |graphic |textured )?(?:ground|background|field|wash)|haze wash|solid (?:cream|beige|color) (?:background|ground))\b/i.test(
        blob
      ) &&
      /\b(cutout|jersey|uniform|photograph|photoreal|full[-\s]?body (?:figure|shot)|action shot)\b/i.test(blob));

  const looksHardEdgeFlat = hasHardEdgeFlatGraphicEvidence(blob);

  const looksDrawn =
    /\b(illustration|illustrated|comic|manga|manhua|painted (?:comic|illustration)|brush[-\s]?paint|手绘|漫画|插画)\b/i.test(
      blob
    ) &&
    !looksGraphicPoster &&
    !looksHardEdgeFlat &&
    !/\b(photoreal|photographic|dslr|live[-\s]?action|octane|unreal engine|pbr)\b/i.test(blob);

  const tidy = (s) =>
    String(s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s]+|[,;\s]+$/g, "")
      .trim();

  if (looksHardEdgeFlat) {
    // 硬边平涂：去掉软涂 finish，钉 flat graphic（细节由 repairHardEdgeFlatGraphicShading 负责）
    const pinFlat = (s, isStyle) => {
      let t = String(s || "")
        .replace(/\b2D illustration\b/gi, " ")
        .replace(/\bpainted illustration\b/gi, " ")
        .replace(/\bsoft blended shading\b/gi, " ")
        .replace(/\bthin clean contours\b/gi, " ")
        .replace(/\bsmooth finish\b/gi, " ");
      if (
        isStyle &&
        !/\b(flat graphic|hard[-\s]?edge flat|flat vector|flat color fills)\b/i.test(t)
      ) {
        t = `flat graphic, hard-edge flat color fills, ${t}`;
      }
      return tidy(t);
    };
    return { style: pinFlat(style, true), positive: pinFlat(positive, false) };
  }

  if (looksGraphicPoster) {
    // 图形海报：去掉软涂插画 finish，钉 graphic design poster
    const pinPoster = (s, isStyle) => {
      let t = String(s || "")
        .replace(/\b2D illustration\b/gi, " ")
        .replace(/\bpainted illustration\b/gi, " ")
        .replace(/\bsoft blended shading\b/gi, " ")
        .replace(/\bthin clean contours\b/gi, " ")
        .replace(/\bsmooth finish\b/gi, " ");
      if (
        isStyle &&
        !/\b(cinematic key art|graphic design poster|sports poster|movie poster|key art)\b/i.test(t)
      ) {
        t = `graphic design poster, ${t}`;
      }
      return tidy(t);
    };
    return { style: pinPoster(style, true), positive: pinPoster(positive, false) };
  }

  if (hasType && !looksDrawn) {
    return {
      style: String(style || "").trim(),
      positive: String(positive || "").trim(),
    };
  }

  const stripPoster = (s) =>
    tidy(
      String(s || "")
        .replace(/\bcinematic still style\b/gi, " ")
        .replace(/\bcinematic film still\b/gi, " ")
        .replace(/\bcinematic key art\b/gi, " ")
        .replace(/\bgraphic design poster\b/gi, " ")
        .replace(/\bsports poster\b/gi, " ")
        .replace(/\bmovie poster\b/gi, " ")
        .replace(/\bkey art\b/gi, " ")
        .replace(/\bunreal engine\b/gi, " ")
        .replace(/\boctane(?:\s+render)?\b/gi, " ")
    );

  if (looksDrawn) {
    // 2D 插画：去掉电影原画升级；不要强行钉成 comic
    const pin = (s) => {
      let t = stripPoster(s);
      t = t
        .replace(/\bpainted comic(?:\s+illustration)?\b/gi, "painted illustration")
        .replace(/\bcomic illustration\b/gi, "painted illustration");
      if (!/\b(illustration|comic|manga|manhua|painted|watercolor)\b/i.test(t)) {
        t = `painted illustration, ${t}`.replace(/\s{2,}/g, " ").trim();
      }
      return tidy(t);
    };
    return { style: pin(style), positive: stripPoster(positive) };
  }

  // 写实纪实误标海报时：降回 documentary，而非保留 cinematic
  if (!hasType) {
    return {
      style: tidy(stripPoster(style).replace(/\bcinematic\b/gi, " ")),
      positive: tidy(stripPoster(positive).replace(/\bcinematic\b/gi, " ")),
    };
  }

  return {
    style: String(style || "").trim(),
    positive: String(positive || "").trim(),
  };
}

/**
 * 清掉契约粘性示例短语（与当前画面无关时仍被原样粘贴）
 * @param {string} text
 */
export function scrubStockSchemaPhrases(text) {
  let s = String(text || "");
  for (const re of STOCK_SCHEMA_PHRASE_RES) {
    s = s.replace(re, " ");
  }
  return scrubPositiveLeadContamination(
    scrubPromptMetaLeakage(
      s
        .replace(/\s{2,}/g, " ")
        .replace(/,\s*,+/g, ",")
        .replace(/;\s*;+/g, ";")
        .replace(/^[,;\s]+|[,;\s]+$/g, "")
        .replace(/\s+,/g, ",")
        .trim()
    )
  );
}

/**
 * 清生成器元语言泄漏：采样备注、elements zone 行话、etc.、平台水印
 * @param {string} text
 */
export function scrubPromptMetaLeakage(text) {
  let s = String(text || "");
  // VLM 过程备注，不进生成提示（保留句号以免粘句）
  s = s.replace(/,?\s*sampled from visible pixels\.?/gi, ".");
  s = s.replace(/\bsampled from (?:the\s+)?(?:visible\s+)?pixels\.?/gi, ".");
  s = s.replace(/\.\s*\./g, ".");
  s = s.replace(/([)\w])\.(?=[A-Z])/g, "$1. ");
  // elements zone 标签漏进散文
  s = s.replace(/\bFigure stands on full-height-center zone\b/gi, "Figure centered in frame");
  s = s.replace(/\bon full-height-center zone\b/gi, "centered in frame");
  s = s.replace(
    /\b((?:upper|mid|lower)-(?:left|center|right)|full-height-center|full-width-(?:upper|mid|lower))\s+zone\b/gi,
    "$1 of the frame"
  );
  // 模糊省略（吃掉 etc. 后的句点，避免 'FOO'. arranged）
  s = s.replace(/\s*,?\s*etc\b\.?\s*/gi, " ");
  // 已知平台水印（非画面内容）
  s = s.replace(
    /\bLogo:\s*['"“”]?Gemini X Nano Banana['"“”]?[^.]*?(?:\.|$)/gi,
    ""
  );
  s = s.replace(
    /\b['"“”]?Gemini X Nano Banana['"“”]?(?:\s+with\s+(?:diamond and banana icon|[^.,;]{0,60}))?/gi,
    ""
  );
  s = s.replace(/\bNano Banana\b/gi, "");
  return s
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .replace(/\s+,/g, ",")
    .trim();
}

/**
 * 镜头光学诚实：光学虚化不得写 deep DOF；主体拖影不得写 fully sharp whole subject
 * @param {string} camera
 * @param {string} [packBlob]
 */
export function repairCameraOpticsHonesty(camera, packBlob = "") {
  let cam = String(camera || "").trim();
  const blob = `${cam} ${packBlob}`;

  const hasOpticalBokeh =
    /\b(optical bokeh|soft bokeh|bokeh(?:\s+circles?)?|creamy (?:background )?blur|shallow(?:\s+DOF|\s+depth of field)|defocus(?:ed)? (?:circles?|lights?)|circular (?:light )?highlights?|out[-\s]?of[-\s]?focus (?:lights?|highlights?|background)|light spots?)\b/i.test(
      blob
    );
  const hasMotionStreak =
    /\b(motion\s*(?:blur|streak)|speed\s*streak|directional\s+(?:motion|streak)|trailing (?:side |hair )?smear)\b/i.test(
      blob
    );
  const solidVoidNoOptics =
    /\b(solid (?:\w+\s+)?(?:void|backdrop|background|field)|seamless (?:studio )?(?:void|backdrop)|flat (?:color |studio )?void|black void)\b/i.test(
      blob
    ) && !hasOpticalBokeh;

  const tidy = (s) =>
    String(s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();

  // 光学虚化证据：禁止 deep DOF / fully sharp 独占整帧
  if (hasOpticalBokeh && !hasMotionStreak) {
    cam = cam
      .replace(/\bdeep(?:\s+depth of field|\s+DOF)\b/gi, "shallow DOF")
      .replace(
        /\bfully sharp(?:\s+(?:focus\s+)?(?:throughout|across|on)[^,.]{0,40})?/gi,
        "subject sharp with soft optical bokeh background"
      )
      .replace(
        /\bdeep DOF on (?:her |his |the )?(?:face and upper body|subject|figure)\b/gi,
        "shallow DOF, subject sharp"
      );
    if (!/\b(shallow|bokeh|defocus|soft (?:optical )?bokeh)\b/i.test(cam)) {
      cam = cam
        ? `${cam}, shallow DOF with optical bokeh background`
        : "eye-level, shallow DOF with optical bokeh background";
    }
  }

  // 主体拖影：禁止 fully sharp whole + deep DOF
  if (hasMotionStreak) {
    cam = cam
      .replace(/\bdeep(?:\s+depth of field|\s+DOF)\b/gi, "mixed sharpness with motion streak")
      .replace(
        /\bfully sharp(?:\s+focus)?(?:\s+on the (?:face and upper torso|whole subject|entire (?:figure|subject)))?/gi,
        "leading edge clearer, trailing side motion-streaked"
      )
      .replace(/\bdeep DOF with fully sharp focus on the face and upper torso\b/gi, "leading face clearer with trailing motion streak");
  }

  // 实色虚空无光学证据：清假 soft bokeh（留给 FX 探针；此处兜底 camera）
  if (solidVoidNoOptics) {
    cam = cam
      .replace(/\b(?:soft )?bokeh(?:\s+background)?(?:\s+blur)?\b/gi, " ")
      .replace(/\bshallow(?:\s+DOF|\s+depth of field)\b/gi, "deep DOF")
      .replace(/\bno\s+or\s+optical\s+bokeh\b/gi, "no optical bokeh");
  }

  return tidy(cam);
}

/**
 * 头身朝向：positive 的 profile 与 camera 的 three-quarter 冲突时对齐
 * 略转 / 可见半侧脸 → 以 three-quarter 为准
 * @param {string} positive
 * @param {string} camera
 */
export function repairHeadAngleConsistency(positive, camera) {
  let pos = String(positive || "").trim();
  let cam = String(camera || "").trim();
  const softTurn = /\b(slightly|showing (?:the\s+)?(?:left|right) side|three[-\s]?quarter)\b/i.test(
    `${pos} ${cam}`
  );
  const posBareProfile =
    /\b(?:in\s+)?profile(?:\s+view)?\b/i.test(pos) && !/\bthree[-\s]?quarter\b/i.test(pos);
  const posThreeQ = /\bthree[-\s]?quarter\b/i.test(pos);
  const camThreeQ = /\bthree[-\s]?quarter(?:\s+profile)?\b/i.test(cam);
  const camBareProfile = /\bprofile\b/i.test(cam) && !/\bthree[-\s]?quarter\b/i.test(cam);

  const toThreeQ = (s) =>
    String(s || "")
      .replace(/\bin (?!three[-\s]?quarter\s)profile view\b/gi, "in three-quarter profile view")
      .replace(/(?<!three[-\s]?quarter\s)\bprofile view\b/gi, "three-quarter profile view")
      .replace(/\bin (?!three[-\s]?quarter\s)profile\b/gi, "in three-quarter profile")
      .replace(/\bdirectly in (?!three[-\s]?quarter\s)profile\b/gi, "in three-quarter profile");

  if (posBareProfile && (camThreeQ || softTurn)) {
    pos = toThreeQ(pos);
  }
  if (posThreeQ && camBareProfile && softTurn) {
    cam = toThreeQ(cam);
  }
  // camera 已写 three-quarter、positive 仍裸 profile 时再扫一次（无 softTurn 也跟 camera）
  if (/\b(?:in\s+)?profile(?:\s+view)?\b/i.test(pos) && !/\bthree[-\s]?quarter\b/i.test(pos) && camThreeQ) {
    pos = toThreeQ(pos);
  }
  return {
    positive: pos.replace(/\s{2,}/g, " ").trim(),
    camera: cam.replace(/\s{2,}/g, " ").trim(),
  };
}

/**
 * 清掉写序标签污染：模型把 \"medium/style\" 等契约标签抄进 positive 开头
 * 同时把肤色 band 的 \"medium\" 归一成 \"mid\"，避免与渲染介质撞词
 * @param {string} text
 */
export function scrubPositiveLeadContamination(text) {
  let s = String(text || "");
  // 开头：medium / medium/style / style lock + 空逗号/句点
  // 禁止误吃镜头词 medium shot / medium-wide / medium two-shot
  s = s.replace(
    /^(?:medium(?:\s*\/\s*style)?(?!\s*(?:shot|two[-\s]?shot|wide|close|framing|crop|angle))|style(?:\s*field)?(?:\s*tokens?)?|style\s*lock|rendering\s+medium)\b\s*(?:,\s*)*\.?\s*/i,
    ""
  );
  // 残留空前缀：, , . / , .
  s = s.replace(/^(?:,\s*)+\.?\s*/, "");
  s = s.replace(/^\.\s+/, "");
  // 真 style 后仍粘贴的空槽：", , ." / ", ."（禁例 medium, , . 被抄到词中）
  s = s.replace(/,\s*(?:,\s*)+\.?\s*/g, ", ");
  s = s.replace(/,\s*\.\s+/g, ". ");
  s = s.replace(/,\s*\.\s*$/g, "");
  // 尾部悬空画幅词（模型把 orientation 当标签甩在末尾）
  s = s.replace(/[,.\s]+\b(portrait|landscape|square)\s*$/i, "");
  // 悬空 mid-tone,（缺 hex）→ 去掉空壳
  s = s.replace(/\bmid[-\s]?tone\s*,\s*(?=[a-z])/gi, "");
  // 肤色 band：Medium/light-medium skin → mid/light skin（保留 \"medium shot\" 等镜头词）
  s = s.replace(/\blight[-\s]?medium\s+skin\b/gi, "light skin");
  s = s.replace(/\bmedium\s+skin\s+tone\b/gi, "mid skin tone");
  s = s.replace(/\bmedium[-\s]?tone\s+skin\b/gi, "mid-tone skin");
  s = s.replace(/\bmedium\s+skin\b/gi, "mid skin");
  // 光学残句：depth of field 被吃掉后留下 "no or optical bokeh"
  s = s.replace(
    /\bwith\s+no\s+or\s+optical\s+bokeh(?:\s+present)?\b/gi,
    "with deep DOF and no optical bokeh"
  );
  s = s.replace(/\bno\s+or\s+optical\s+bokeh(?:\s+present)?\b/gi, "no optical bokeh");
  return s
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/\.\s*,\s*/g, ". ")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .replace(/\s+,/g, ",")
    .trim();
}

/**
 * layout 未声称裁切时，从 negative/positive/camera 清掉 anti-heal 样板
 * @param {string} negative
 * @param {string} layout
 * @param {string} positive
 * @param {string} camera
 */
export function scrubAntiHealWhenNoCrop(negative, layout, positive, camera) {
  const lay = String(layout || "");
  const layoutHasCrop =
    /\b(cropped|cut by|clipped by|truncat(?:ed|ion)?|forehead cut|crown(?:\/forehead)? cut|mid-thigh|chin cut|edge contact)\b/i.test(
      lay
    ) && !/\bno\s+crop\b|\bwithout\s+(?:a\s+)?crop\b|\bnot\s+cropped\b/i.test(lay);
  // 样板 anti-heal 几乎总是污染：无真实裁切时必清；有裁切时也清掉无差别样板词
  const clean = (s) => {
    let t = String(s || "");
    for (const re of ANTI_HEAL_STOCK_RES) {
      t = t.replace(re, " ");
    }
    if (!layoutHasCrop) {
      t = t
        .replace(/\bheadroom\b[,;.]?\s*/gi, " ")
        .replace(/\bsafe margins?\b[,;.]?\s*/gi, " ");
    }
    return t
      .replace(/\s{2,}/g, " ")
      .replace(/[,;]\s*[,;]+/g, ",")
      .replace(/^[,;\s]+|[,;\s]+$/g, "")
      .replace(/\s+,/g, ",")
      .trim();
  };
  return {
    negative: clean(negative),
    positive: clean(positive),
    camera: clean(camera),
  };
}

/**
 * @param {string} style
 * @param {string} positive
 * @param {string} blob
 */
export function scrubStockCelInk(style, positive, blob = "") {
  const b = `${blob} ${style} ${positive}`.toLowerCase();
  const hasHardCelEvidence =
    /\b(hard flat (?:shadow )?bands?|flat cel(?:\s+shad(?:e|ing))?|cel animation(?: frames)?|discrete (?:tone|shadow) steps|posteriz(?:ed|e)(?:\s+shadows?)?|anime cel)\b/i.test(
      b
    );
  const hasRealInkEvidence =
    hasHardCelEvidence ||
    /\b(visible (ink |cel )?linework|hard ink outlines|comic ink|hand-inked)\b/i.test(b);
  const looksDrawn =
    /\b(illustration|illustrated|comic|manga|manhua|painted (?:comic|illustration)|手绘|漫画|插画)\b/i.test(b);
  const looksPhotoreal =
    !looksDrawn &&
    /\b(photoreal|photographic|cgi|live-action|dslr|pores|lens(?:\s+feel)?|octane|unreal engine|pbr)\b/i.test(b);
  const hadCelShadedClaim = /\bcel[-\s]?shaded(?:\s+line\s+art)?\b|\bcel\s+shading\b/i.test(
    `${style} ${positive}`
  );
  // 写实主导、或没有真实硬赛璐璐/墨线证据时，去掉 cel/ink / cel-shaded 套话
  // 注意：勿把「cinematic still」单独当成写实证据——插画常被误贴该词
  if (hasRealInkEvidence && !looksPhotoreal) {
    return {
      style: String(style || "").trim(),
      positive: String(positive || "").trim(),
    };
  }
  const clean = (s) => {
    let t = String(s || "")
      .replace(CEL_INK_STOCK_RE, " ")
      .replace(/\bpainted\s+cel(?:\/|\s+)?ink\b/gi, " ")
      .replace(/\bcel(?:\/|\s+)ink(?:\s+illustration|\s+style)?\b/gi, " ")
      .replace(/\bcel[-\s]?shaded(?:\s+line\s+art)?\b/gi, " ")
      .replace(/\bcel\s+shading\b/gi, " ");
    if (looksPhotoreal) {
      t = t.replace(/\billustration medium\b/gi, " ");
    }
    return t
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s]+|[,;\s]+$/g, "")
      .replace(/\s+,/g, ",")
      .trim();
  };
  let styleOut = clean(style);
  let posOut = clean(positive);
  // 误升格的 cel-shaded → 软涂细线（仅当曾声称 cel-shaded 且仍是 painted illustration）
  if (
    hadCelShadedClaim &&
    !hasHardCelEvidence &&
    /\bpainted illustration\b/i.test(styleOut) &&
    !/\b(soft blended|soft painterly|thin clean contours)\b/i.test(styleOut)
  ) {
    styleOut = styleOut
      .replace(
        /\bpainted illustration\b/i,
        "painted illustration, soft blended shading, thin clean contours"
      )
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .trim();
  }
  // 写真/CGI：清掉插画 finish 串味
  if (looksPhotoreal || /\b(photoreal|studio-editorial|photograph)\b/i.test(`${styleOut} ${posOut}`)) {
    const stripIllust = (t) =>
      String(t || "")
        .replace(/\bsoft blended shading\b/gi, " ")
        .replace(/\bthin clean contours\b/gi, " ")
        .replace(/\bthick dimensional relief\b/gi, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/,\s*,+/g, ",")
        .replace(/^[,;\s]+|[,;\s]+$/g, "")
        .trim();
    styleOut = stripIllust(styleOut);
    posOut = stripIllust(posOut);
  }
  return { style: styleOut, positive: posOut };
}

/** 允许的角色色 */
export const PALETTE_ROLES = [
  "bg",
  "hero",
  "skin",
  "skin_lo",
  "skin_hi",
  "accent",
  "text",
  "secondary",
  "mute",
  "rim",
  "glow",
];

const PALETTE_ROLE_RE =
  "skin_hi|skin_lo|bg|hero|skin|accent|text|secondary|mute|rim|glow";

/**
 * 主色：有色簇用簇；脸部满幅浅肤可用淡色簇。禁止整幅中心均值。
 * @param {{ clusterHex?: string, faceFill?: boolean, toneBand?: string, paleClusterHex?: string }} [opts]
 * @returns {string}
 */
export function resolveSampledHeroHex(opts = {}) {
  const cluster = String(opts.clusterHex || "").trim();
  const pale = String(opts.paleClusterHex || "").trim();
  if (opts.faceFill && opts.toneBand === "light" && pale) return pale;
  if (cluster) return cluster;
  return "";
}

/** 观察/着装色族 → 中心色相；只用于核对，不从色名发明 hex */
const NAMED_COLOR_FAMILIES = [
  { key: "indigo", h: 255, word: /indigo|靛蓝|藏青/i },
  { key: "navy", h: 230, word: /\bnavy\b|藏蓝/i },
  { key: "teal", h: 185, word: /teal|cyan|turquoise|青绿|青蓝|湖蓝/i },
  { key: "crimson", h: 8, word: /crimson|vermil+ion|scarlet|朱红|绯红/i },
  { key: "burgundy", h: 350, word: /burgundy|maroon|\bwine\b|酒红/i },
  { key: "ochre", h: 38, word: /ochre|sienna|赭/i },
  { key: "violet", h: 280, word: /violet|\bpurple\b|magenta|紫/i },
  { key: "emerald", h: 145, word: /emerald|翠绿/i },
  { key: "olive", h: 75, word: /\bolive\b|\bkhaki\b|军绿/i },
];

const COLOR_CLAIM_MOD =
  "(?:(?:deep|muted|saturated|vivid|hot|bright|dark|pale|light|cool|warm|fluorescent|neon|desaturated|near-mono)\\s+)*";

/**
 * @param {string} text
 * @returns {{ key: string, h: number }[]}
 */
export function namedColorFamilyHits(text) {
  const t = String(text || "");
  const hits = [];
  const seen = new Set();
  for (const fam of NAMED_COLOR_FAMILIES) {
    if (!fam.word.test(t) || seen.has(fam.key)) continue;
    seen.add(fam.key);
    hits.push({ key: fam.key, h: fam.h });
  }
  return hits;
}

/**
 * 色族散文 vs 采样 hero/accent：冲突时保留像素，丢掉更饱和/更灰的色名。不从色名发明 hex，不平均色相。
 * @param {string} text
 * @param {{ role?: string, hex: string }[]} sampled
 * @returns {string}
 */
export function reconcileColorClaimsWithSamples(text, sampled) {
  let s = String(text || "");
  if (!s) return s;
  const chromas = (Array.isArray(sampled) ? sampled : [])
    .filter((e) => e?.hex && (e.role === "hero" || e.role === "accent" || !e.role))
    .map((e) => ({ hex: e.hex, hsl: hexToHsl(e.hex) }))
    .filter((e) => e.hsl && e.hsl.s >= 0.08);
  if (!chromas.length) return s;

  const closest = (h) => {
    let best = null;
    let bestD = 999;
    for (const c of chromas) {
      const d = hueDistanceDeg(h, c.hsl.h);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return { entry: best, dist: bestD };
  };

  for (const fam of NAMED_COLOR_FAMILIES) {
    const phraseRe = new RegExp(`${COLOR_CLAIM_MOD}(?:${fam.word.source})`, "gi");
    s = s.replace(phraseRe, (match) => {
      const { entry, dist } = closest(fam.h);
      if (!entry) return match;
      if (dist > 48) return "";
      if (dist > 32) return match;
      let out = match;
      if (entry.hsl.s < 0.35) {
        out = out.replace(/\b(saturated|vivid|hot|fluorescent|neon)\s+/gi, "");
      } else if (entry.hsl.s > 0.55) {
        out = out.replace(/\b(muted|desaturated|near-mono|grey|gray)\s+/gi, "");
      }
      return out;
    });
  }
  return s
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,(?:\s*,)+/g, ",")
    .replace(/^,\s*|\s*,\s*$/g, "")
    .trim();
}

/**
 * 解析角色色字符串 → [{ role, hex }]
 * 支持：bg:#0A0A0A | hero:#C4A484  或  bg #0A0A0A, hero #C4A484
 * @param {string} text
 * @returns {{ role: string, hex: string }[]}
 */
export function parsePalette(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const out = [];
  const seen = new Set();
  // 兼容 role:#HEX、role #HEX、以及模型误写的 role|#HEX
  const re = new RegExp(`\\b(${PALETTE_ROLE_RE})\\b\\s*[:=|\\-]?\\s*(#?[0-9A-Fa-f]{6})\\b`, "gi");
  let m;
  while ((m = re.exec(raw)) && out.length < 10) {
    const role = m[1].toLowerCase();
    let hex = m[2].toUpperCase();
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (seen.has(role)) continue;
    seen.add(role);
    out.push({ role, hex });
  }
  return out;
}

/**
 * @param {{ role: string, hex: string }[]} entries
 */
export function formatPalette(entries) {
  if (!Array.isArray(entries) || !entries.length) return "";
  return entries
    .filter((e) => e?.role && e?.hex)
    .slice(0, 8)
    .map((e) => `${String(e.role).toLowerCase()}:${normalizeHex(e.hex)}`)
    .join(" | ");
}

/** @param {string} hex */
function normalizeHex(hex) {
  const h = String(hex || "").trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(h)) return h;
  if (/^[0-9A-F]{6}$/.test(h)) return `#${h}`;
  return h.startsWith("#") ? h : `#${h}`;
}

function rgbLuma(p) {
  return 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
}

function avgPixelsHex(pixels) {
  if (!pixels?.length) return "";
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of pixels) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  const n = pixels.length;
  const to = (v) =>
    Math.max(0, Math.min(255, Math.round(v / n)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * 从像素集抽 mid / 高光 / 暗部。明度跨度太小则只返回 mid。
 * @param {{ r: number, g: number, b: number }[]} pixels
 * @param {{ midHex?: string, minSpread?: number }} [opts]
 * @returns {{ mid: string, highlight?: string, shadow?: string }}
 */
export function toneRangeFromPixels(pixels, opts = {}) {
  const list = Array.isArray(pixels)
    ? pixels.filter((p) => p && Number.isFinite(p.r) && Number.isFinite(p.g) && Number.isFinite(p.b))
    : [];
  const midLock = normalizeHex(opts.midHex || "");
  const midOk = /^#[0-9A-F]{6}$/.test(midLock) ? midLock : "";
  if (list.length < 8) return midOk ? { mid: midOk } : {};
  const sorted = [...list].sort((a, b) => rgbLuma(a) - rgbLuma(b));
  const n = sorted.length;
  const loN = Math.max(3, Math.floor(n * 0.18));
  const hiStart = Math.floor(n * 0.82);
  const midStart = Math.floor(n * 0.38);
  const midEnd = Math.max(midStart + 1, Math.ceil(n * 0.62));
  const shadow = avgPixelsHex(sorted.slice(0, loN));
  const highlight = avgPixelsHex(sorted.slice(hiStart));
  const midAvg = avgPixelsHex(sorted.slice(midStart, midEnd));
  const mid = midOk || midAvg;
  const minSpread = Number.isFinite(opts.minSpread) ? Number(opts.minSpread) : 22;
  const spread = rgbLuma(sorted[Math.min(n - 1, hiStart)]) - rgbLuma(sorted[0]);
  if (spread < minSpread || !highlight || !shadow) return { mid };
  if (highlight === mid && shadow === mid) return { mid };
  return { mid, highlight, shadow };
}

/** @param {string} hex @returns {{ h: number, s: number, l: number } | null} */
function hexToHsl(hex) {
  const n = normalizeHex(hex).replace("#", "");
  if (!/^[0-9A-F]{6}$/.test(n)) return null;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/** 色相距离（度，0–180） */
function hueDistanceDeg(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** 由采样 hex 生成氛围色相描述（仅描述采样结果，不预写场景色名） */
export function hueFamilyFromHex(hex) {
  const hsl = hexToHsl(hex);
  if (!hsl) return "";
  const { h, s, l } = hsl;
  const temp =
    h < 70 || h >= 300 ? "warm" : h >= 70 && h < 160 ? "greenish" : h >= 160 && h < 260 ? "cool" : "neutral";
  let family = "grey";
  if (s < 0.08) family = l < 0.35 ? "dark grey" : l > 0.65 ? "pale grey" : "grey";
  else if (h < 20 || h >= 340) family = "red";
  else if (h < 45) family = "orange-amber";
  else if (h < 70) family = "yellow-gold";
  else if (h < 100) family = "yellow-green";
  else if (h < 150) family = "green";
  else if (h < 180) family = "teal-green";
  else if (h < 210) family = "cyan";
  else if (h < 255) family = "blue";
  else if (h < 290) family = "purple";
  else family = "magenta";
  if (s < 0.08) return family;
  return `${temp} ${family}`;
}

/**
 * 非活体表面（石膏/雕像/石墨灰等）— 禁止用暖肤色 soft-skin 先验
 * @param {string} blob
 */
export function bodySurfaceCueIsNonLiving(blob) {
  const t = String(blob || "");
  // CJK 不用 \b
  if (/石膏|石像|雕像|灰泥/.test(t)) return true;
  if (
    /\b(plaster|statue|marble|stone[-\s]?(?:figure|body|skin)|cast\s+plaster)\b/i.test(t) ||
    /\b(cool|graphite|charcoal)\s+(?:grey|gray)\b/i.test(t) ||
    /\bmonochrome\s+(?:body|figure|skin|statue)\b/i.test(t)
  ) {
    return true;
  }
  // sketch + 排线/单色表面
  if (
    /\bsketch\b/i.test(t) &&
    /\b(hatching|cross[-\s]?hatch|construction\s+lines?|graphite|charcoal|plaster|monochrome)\b/i.test(t)
  ) {
    return true;
  }
  if (/素描|炭笔/.test(t) && /石膏|石像|排线|单色/.test(t)) return true;
  return false;
}

/**
 * 暖活体肤 hex 带（与 isSkinLike 暖支对齐）
 * @param {string} hex
 */
export function skinHexIsWarmLiving(hex) {
  const hsl = hexToHsl(hex);
  if (!hsl) return false;
  return hsl.h >= 12 && hsl.h <= 48 && hsl.s >= 0.12 && hsl.l > 0.22 && hsl.l < 0.88;
}

/**
 * Pack 正文里的活体肤色明度带（fair/light vs tan/deep）
 * @param {string} blob
 * @returns {""|"light"|"deep"}
 */
export function cueSkinLightnessBand(blob) {
  const t = String(blob || "");
  // 只用编译器正向短语；负向里的 porcelain pale / deep dark 不得反客为主
  const light = /\b(fair pale skin|fair skin|light skin)\b/i.test(t) || /白皙|浅肤/.test(t);
  const deep = /\b(deep dark skin|tan bronzed skin)\b/i.test(t) || /深肤|黝黑/.test(t);
  if (light) return "light";
  if (deep) return "deep";
  return "";
}

/**
 * 采样肤 hex 与 Pack 肤色锁冲突时丢弃（浅肤被头发棕抢走）
 * @param {string} hex
 * @param {string} blob
 */
export function skinHexConflictsToneCue(hex, blob) {
  const hsl = hexToHsl(hex);
  if (!hsl) return false;
  const band = cueSkinLightnessBand(blob);
  if (band === "light" && hsl.l < 0.48) return true;
  if (band === "deep" && hsl.l > 0.62) return true;
  return false;
}

/**
 * Pack/观察线索：脸部满幅特写（边框常不是真实背景）
 * @param {string} blob
 */
export function cueSuggestsFaceFillCloseup(blob) {
  const t = String(blob || "");
  if (/特写|大头特写|唇部特写|面部特写/.test(t)) return true;
  return (
    /\bextreme[-\s]?close[-\s]?up\b/i.test(t) ||
    /\bface filling the frame\b/i.test(t) ||
    /\bhead filling the frame\b/i.test(t) ||
    /\btight close[-\s]?up\b/i.test(t) ||
    /\bbeauty (?:macro|crop)\b/i.test(t) ||
    /\bextreme_closeup\b/i.test(t) ||
    (/\bcloseup\b/i.test(t) && /\b(face|lips?|beauty)\b/i.test(t))
  );
}

/**
 * 像素列表 → 量化众数簇均值 hex（比整区 RGB 均值更能抗边框混入杂色）
 * @param {{r:number,g:number,b:number}[]} pixels
 * @param {{ step?: number, minShare?: number }} [opts]
 * @returns {string}
 */
export function modeAvgHexFromPixels(pixels, opts = {}) {
  if (!Array.isArray(pixels) || !pixels.length) return "";
  const step = Math.max(8, Number(opts.step) || 24);
  const minShare = opts.minShare == null ? 0.18 : Number(opts.minShare);
  /** @type {Map<string, { count: number, r: number, g: number, b: number }>} */
  const buckets = new Map();
  for (const p of pixels) {
    if (!p) continue;
    const qr = Math.round(p.r / step) * step;
    const qg = Math.round(p.g / step) * step;
    const qb = Math.round(p.b / step) * step;
    const key = `${qr},${qg},${qb}`;
    const cur = buckets.get(key);
    if (cur) {
      cur.count += 1;
      cur.r += p.r;
      cur.g += p.g;
      cur.b += p.b;
    } else {
      buckets.set(key, { count: 1, r: p.r, g: p.g, b: p.b });
    }
  }
  let best = null;
  for (const b of buckets.values()) {
    if (!best || b.count > best.count) best = b;
  }
  if (!best) return "";
  const share = best.count / pixels.length;
  const to = (v) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  // 众数不够稳时退回全量均值，避免噪声簇
  if (share < minShare) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const p of pixels) {
      r += p.r;
      g += p.g;
      b += p.b;
    }
    const n = pixels.length;
    return `#${to(r / n)}${to(g / n)}${to(b / n)}`;
  }
  return `#${to(best.r / best.count)}${to(best.g / best.count)}${to(best.b / best.count)}`;
}

/**
 * 特写 / 肤色边框：采样 bg 不可信则省略（宁缺勿把皮肤当背景）
 * @param {{ bgHex?: string, heroHex?: string, skinHex?: string, cueBlob?: string }} args
 */
export function shouldOmitSampledBg(args = {}) {
  const bgHex = normalizeHex(args.bgHex || "");
  if (!/^#[0-9A-F]{6}$/.test(bgHex)) return true;
  const cue = String(args.cueBlob || "");
  const faceFill = cueSuggestsFaceFillCloseup(cue);
  const bgHsl = hexToHsl(bgHex);
  if (!bgHsl) return true;

  const skinHex = normalizeHex(args.skinHex || "");
  const heroHex = normalizeHex(args.heroHex || "");
  const skinHsl = /^#[0-9A-F]{6}$/.test(skinHex) ? hexToHsl(skinHex) : null;
  const heroHsl = /^#[0-9A-F]{6}$/.test(heroHex) ? hexToHsl(heroHex) : null;

  // 仅在脸部满幅时弱化：暖肤边框、或与 skin/hero 几乎同色
  if (!faceFill) return false;
  if (skinHexIsWarmLiving(bgHex)) return true;
  if (skinHsl && hueDistanceDeg(bgHsl.h, skinHsl.h) < 22 && Math.abs(bgHsl.l - skinHsl.l) < 0.18) {
    return true;
  }
  if (heroHsl && hueDistanceDeg(bgHsl.h, heroHsl.h) < 18 && Math.abs(bgHsl.l - heroHsl.l) < 0.12) {
    return true;
  }
  return false;
}

/**
 * 从用户上传参考图像素采样 bg / hero / skin / accent / glow（禁止预配置色）
 * 用粗量化直方图抓主色与次要品牌色，避免中心平均把黄/紫等小面积色抹掉。
 * bg：四角众数（非整圈均值）；脸部满幅特写时弱化/省略不可信 bg。
 * @param {string} dataUrl
 * @param {string} [cueBlob] style/elements/positive 等线索，用于石膏等非活体表面
 * @returns {Promise<{ role: string, hex: string }[]>}
 */
export async function samplePaletteFromReference(dataUrl, cueBlob = "") {
  if (!dataUrl || typeof dataUrl !== "string") return [];
  const nonLiving = bodySurfaceCueIsNonLiving(cueBlob);
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const size = 64;
    const canvas = new OffscreenCanvas(size, size);
    let ctx = null;
    try {
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    } catch {
      ctx = null;
    }
    if (!ctx) ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return [];
    }
    ctx.drawImage(bitmap, 0, 0, size, size);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, size, size);

    /** @param {number} idx */
    const rgbAt = (idx) => ({
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
    });
    /** @param {{r:number,g:number,b:number}[]} pixels */
    const avgHex = (pixels) => {
      if (!pixels.length) return "";
      let r = 0;
      let g = 0;
      let b = 0;
      for (const p of pixels) {
        r += p.r;
        g += p.g;
        b += p.b;
      }
      const n = pixels.length;
      const to = (v) =>
        Math.max(0, Math.min(255, Math.round(v / n)))
          .toString(16)
          .padStart(2, "0")
          .toUpperCase();
      return `#${to(r)}${to(g)}${to(b)}`;
    };
    /** @param {{r:number,g:number,b:number}} p */
    const chroma = (p) => Math.max(p.r, p.g, p.b) - Math.min(p.r, p.g, p.b);
    /** @param {{r:number,g:number,b:number}} p */
    const luma = (p) => 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
    /** @param {{r:number,g:number,b:number}} p */
    const toHex = (p) => {
      const to = (v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0")
          .toUpperCase();
      return `#${to(p.r)}${to(p.g)}${to(p.b)}`;
    };
    /**
     * 活体肤：暖黄-橙 + 足够彩度（抬高门槛，减少纸奶油误判）
     * 非活体：只认中心中灰 / 冷灰，禁止暖肤带
     * @param {{r:number,g:number,b:number}} p @param {{h:number,s:number,l:number}|null} hsl
     */
    const isSkinLike = (p, hsl) => {
      if (!hsl) return false;
      const L = luma(p);
      const c = chroma(p);
      if (nonLiving) {
        return c < 22 && hsl.s < 0.14 && L > 70 && L < 200;
      }
      if (
        hsl.h >= 12 &&
        hsl.h <= 48 &&
        hsl.s >= 0.18 &&
        hsl.s <= 0.55 &&
        L > 55 &&
        L < 210 &&
        c >= 28 &&
        c <= 110
      ) {
        return true;
      }
      // 浅白活体肤：高明度、中低彩度暖相（雀斑特写常被头发棕抢走）
      if (
        hsl.h >= 8 &&
        hsl.h <= 55 &&
        hsl.s >= 0.08 &&
        hsl.s <= 0.45 &&
        L > 155 &&
        L < 240 &&
        c >= 12 &&
        c <= 90
      ) {
        return true;
      }
      // 黑白/低彩肖像：中等明度、极低彩度
      if (c < 18 && hsl.s < 0.12 && L > 75 && L < 190) {
        return true;
      }
      return false;
    };

    const corner = [];
    const center = [];
    /** @type {{r:number,g:number,b:number}[]} */
    const skinPixels = [];
    /** @type {{p:{r:number,g:number,b:number}, score:number}[]} */
    const glowCands = [];
    /** @type {Map<string, { count: number, r: number, g: number, b: number }>} */
    const buckets = new Map();
    const step = 24;
    // 四角块：比整圈边框更能避开贴边头发/肩膀
    const cornerN = 10;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const p = rgbAt(idx);
        const inCorner =
          (x < cornerN && y < cornerN) ||
          (x >= size - cornerN && y < cornerN) ||
          (x < cornerN && y >= size - cornerN) ||
          (x >= size - cornerN && y >= size - cornerN);
        const inCenter =
          x >= size * 0.28 && x < size * 0.72 && y >= size * 0.28 && y < size * 0.72;
        if (inCorner) corner.push(p);
        if (inCenter) {
          center.push(p);
          const hslPx = hexToHsl(toHex(p));
          if (hslPx && isSkinLike(p, hslPx)) skinPixels.push(p);
        }
        const c = chroma(p);
        const L = luma(p);
        if (L > 70 && L < 245 && c > 18) {
          glowCands.push({ p, score: c * 0.55 + L * 0.45 });
        }
        if (L <= 18 || L >= 245) continue;
        const qr = Math.round(p.r / step) * step;
        const qg = Math.round(p.g / step) * step;
        const qb = Math.round(p.b / step) * step;
        const key = `${qr},${qg},${qb}`;
        const cur = buckets.get(key);
        if (cur) {
          cur.count += 1;
          cur.r += p.r;
          cur.g += p.g;
          cur.b += p.b;
        } else {
          buckets.set(key, { count: 1, r: p.r, g: p.g, b: p.b });
        }
      }
    }

    /** @type {{ hex: string, count: number, chroma: number, hsl: {h:number,s:number,l:number}, skin: boolean, p: {r:number,g:number,b:number} }[]} */
    const clusters = [];
    for (const b of buckets.values()) {
      const p = { r: b.r / b.count, g: b.g / b.count, b: b.b / b.count };
      const c = chroma(p);
      if (c < 16 && b.count < size * size * 0.04) continue;
      const hex = toHex(p);
      const hsl = hexToHsl(hex);
      if (!hsl) continue;
      clusters.push({
        hex,
        count: b.count,
        chroma: c,
        hsl,
        skin: isSkinLike(p, hsl),
        p,
      });
    }
    clusters.sort((a, b) => b.count * (1 + b.chroma / 80) - a.count * (1 + a.chroma / 80));

    const chromatic = clusters.filter((c) => c.chroma >= 22 && c.hsl.s >= 0.12);
    const garment = chromatic.filter((c) => !c.skin);
    const skinClusters = clusters.filter((c) => c.skin);
    let pickHero = garment[0] || chromatic[0] || null;
    let pickAccent = null;
    if (pickHero) {
      const minAccent = Math.max(4, Math.floor(pickHero.count * 0.05));
      const accentScore = (c) => c.chroma * 0.6 + Math.min(c.count, pickHero.count) * 0.4;
      const accentCands = garment
        .filter(
          (c) =>
            c.hex !== pickHero.hex &&
            hueDistanceDeg(c.hsl.h, pickHero.hsl.h) > 28 &&
            c.count >= minAccent
        )
        .sort((a, b) => accentScore(b) - accentScore(a));
      pickAccent = accentCands[0] || null;
      if (!pickAccent) {
        pickAccent =
          chromatic.find(
            (c) =>
              !c.skin &&
              c.hex !== pickHero.hex &&
              hueDistanceDeg(c.hsl.h, pickHero.hsl.h) > 28 &&
              c.count >= 4 &&
              c.chroma >= 30
          ) || null;
      }
    }
    let pickSkin = skinClusters[0] || null;
    const toneBand = cueSkinLightnessBand(cueBlob);
    const faceFill = cueSuggestsFaceFillCloseup(cueBlob);
    const lumaOf = (c) => luma(c.p);
    if (skinClusters.length) {
      if (toneBand === "light") {
        const lightOk = skinClusters.filter((c) => lumaOf(c) >= 140);
        const pool = lightOk.length ? lightOk : skinClusters;
        pickSkin = [...pool].sort((a, b) => lumaOf(b) - lumaOf(a))[0];
      } else if (toneBand === "deep") {
        const deepOk = skinClusters.filter((c) => lumaOf(c) <= 150);
        const pool = deepOk.length ? deepOk : skinClusters;
        pickSkin = [...pool].sort((a, b) => lumaOf(a) - lumaOf(b))[0];
      }
    }
    // 非活体：若误拾暖肤簇，丢弃，改走中灰回退
    if (nonLiving && pickSkin && skinHexIsWarmLiving(pickSkin.hex)) {
      pickSkin = null;
    }
    if (toneBand === "light" && pickSkin && lumaOf(pickSkin) < 130) {
      pickSkin = null;
    }
    // 脸部满幅：暗发/暗底不当 hero
    if (faceFill && pickHero && luma(pickHero.p) < 90) {
      pickHero = null;
    }

    glowCands.sort((a, b) => b.score - a.score);
    const topGlow = glowCands.slice(0, Math.max(8, Math.floor(glowCands.length * 0.08))).map((c) => c.p);

    /** @type {{ role: string, hex: string }[]} */
    const out = [];
    // 四角众数：抗「一边贴边混色」；无四角像素时退回空
    let bg = modeAvgHexFromPixels(corner, { step: 24, minShare: 0.18 });
    const paleHeroPx = center.filter((p) => {
      const L = luma(p);
      return L >= 140 && L < 235;
    });
    const paleClusterHex =
      faceFill && toneBand === "light" && paleHeroPx.length >= 8 ? avgHex(paleHeroPx) : "";
    const hero = resolveSampledHeroHex({
      clusterHex: pickHero?.hex || "",
      faceFill,
      toneBand,
      paleClusterHex,
    });
    let skin = pickSkin?.hex || "";
    if (!skin) {
      const graySkinPixels = center.filter((p) => {
        const L = luma(p);
        const c = chroma(p);
        return c < 18 && L > 75 && L < 190;
      });
      if (graySkinPixels.length >= Math.max(8, Math.floor(center.length * 0.08))) {
        skin = avgHex(graySkinPixels);
      }
    }
    // 浅肤锁：中心高明度暖像素回填，避免丢掉 skin 后只剩头发棕
    if ((!skin || skinHexConflictsToneCue(skin, cueBlob)) && toneBand === "light") {
      const paleSkinPx = center.filter((p) => {
        const L = luma(p);
        const c = chroma(p);
        return L >= 155 && L < 240 && c >= 12 && c <= 90;
      });
      if (paleSkinPx.length >= Math.max(8, Math.floor(center.length * 0.06))) {
        skin = avgHex(paleSkinPx);
      } else if (skinHexConflictsToneCue(skin, cueBlob)) {
        skin = "";
      }
    }
    if (nonLiving && skin && skinHexIsWarmLiving(skin)) {
      skin = "";
    }
    if (
      shouldOmitSampledBg({
        bgHex: bg,
        heroHex: hero,
        skinHex: skin,
        cueBlob,
      })
    ) {
      bg = "";
    }
    const accent = pickAccent?.hex || "";
    const glow = avgHex(topGlow);
    if (bg) out.push({ role: "bg", hex: bg });
    if (hero) out.push({ role: "hero", hex: hero });
    if (skin && skin !== hero) {
      out.push({ role: "skin", hex: skin });
      if (!nonLiving) {
        let pool = skinPixels;
        if (pool.length < 12) {
          pool = [];
          for (const c of skinClusters) {
            const copies = Math.max(1, Math.min(40, Math.round(c.count / 4)));
            for (let i = 0; i < copies; i++) pool.push(c.p);
          }
        }
        if (toneBand === "light") pool = pool.filter((px) => luma(px) >= 110);
        else if (toneBand === "deep") pool = pool.filter((px) => luma(px) <= 200);
        const range = toneRangeFromPixels(pool, { midHex: skin });
        if (range.shadow && range.shadow !== skin) out.push({ role: "skin_lo", hex: range.shadow });
        if (range.highlight && range.highlight !== skin) out.push({ role: "skin_hi", hex: range.highlight });
      }
    }
    if (accent && accent !== hero && accent !== skin) out.push({ role: "accent", hex: accent });
    if (glow && glow !== hero && glow !== accent) out.push({ role: "glow", hex: glow });
    return out;
  } catch (err) {
    console.warn("[PromptLens] samplePaletteFromReference failed:", err);
    return [];
  }
}

/**
 * 用参考图像素锚定色板：补缺、纠正与采样严重冲突的角色色（不注入任何预配置 hex）
 * @param {string} palette
 * @param {{ role: string, hex: string }[]} sampled
 * @param {string} [blob]
 */
export function groundPaletteToReference(palette, sampled, blob = "") {
  const sampleEntries = Array.isArray(sampled) ? sampled.filter((e) => e?.role && e?.hex) : [];
  let entries = parsePalette(palette);
  const text = String(blob || "");
  const hasWhiteRimCue = /white rim|rim light|specular highlight|cool white edge/i.test(text);

  // 旧契约示例指纹 → 清空后改用采样
  if (entries.length) {
    const EXAMPLE_SIGNATURE = ["#2F3A28", "#E08940", "#8B0000"];
    const hexSet = new Set(entries.map((e) => normalizeHex(e.hex)));
    if (EXAMPLE_SIGNATURE.every((h) => hexSet.has(h))) entries = [];
  }

  /** @type {Record<string, { role: string, hex: string }>} */
  const byRole = {};
  for (const e of entries) byRole[e.role] = { role: e.role, hex: normalizeHex(e.hex) };
  /** @type {Record<string, { role: string, hex: string }>} */
  const sampleBy = {};
  for (const e of sampleEntries) sampleBy[e.role] = { role: e.role, hex: normalizeHex(e.hex) };

  // 有采样则采像素（含同色相但更饱和/更灰的 VLM hex）；不平均两边
  for (const role of ["bg", "hero", "skin", "skin_lo", "skin_hi", "accent", "glow"]) {
    const s = sampleBy[role];
    if (!s) continue;
    byRole[role] = s;
  }

  // VLM 独有角色：对不上点名色族、而采样 hero/accent 已锁住该色族 → 丢掉错误继承
  {
    const named = namedColorFamilyHits(text);
    const sampleChromas = ["hero", "accent"]
      .map((role) => sampleBy[role])
      .filter(Boolean)
      .map((e) => ({ hex: e.hex, hsl: hexToHsl(e.hex) }))
      .filter((e) => e.hsl && e.hsl.s >= 0.08);
    if (named.length && sampleChromas.length) {
      const sampleCoversNamed = named.some((n) =>
        sampleChromas.some((c) => hueDistanceDeg(c.hsl.h, n.h) <= 40)
      );
      for (const role of ["hero", "accent"]) {
        if (sampleBy[role] || !byRole[role]) continue;
        const hsl = hexToHsl(byRole[role].hex);
        if (!hsl || hsl.s < 0.1) continue;
        const clashesNamed = named.every((n) => hueDistanceDeg(hsl.h, n.h) > 48);
        if (clashesNamed && sampleCoversNamed) delete byRole[role];
      }
    }
  }

  // 浅肤锁 vs 头发棕采样：丢掉冲突的 skin
  if (byRole.skin && skinHexConflictsToneCue(byRole.skin.hex, text)) {
    const alt =
      sampleBy.skin && !skinHexConflictsToneCue(sampleBy.skin.hex, text) ? sampleBy.skin : null;
    if (alt) byRole.skin = { role: "skin", hex: normalizeHex(alt.hex) };
    else {
      delete byRole.skin;
      delete byRole.skin_hi;
      delete byRole.skin_lo;
    }
  }
  if (
    byRole.hero &&
    cueSuggestsFaceFillCloseup(text) &&
    cueSkinLightnessBand(text) === "light"
  ) {
    const h = hexToHsl(byRole.hero.hex);
    if (h && h.l < 0.28) delete byRole.hero;
  }

  // 脸部满幅特写：采样未给出可信 bg 时，剥掉肤色/近肤 VLM bg，避免皮肤当背景
  if (cueSuggestsFaceFillCloseup(text) && byRole.bg) {
    if (
      shouldOmitSampledBg({
        bgHex: byRole.bg.hex,
        heroHex: byRole.hero?.hex || sampleBy.hero?.hex,
        skinHex: byRole.skin?.hex || sampleBy.skin?.hex,
        cueBlob: text,
      })
    ) {
      delete byRole.bg;
    }
  }

  // 非活体表面：剥掉暖肤 skin，宁缺毋假
  if (bodySurfaceCueIsNonLiving(text) && byRole.skin && skinHexIsWarmLiving(byRole.skin.hex)) {
    if (sampleBy.skin && !skinHexIsWarmLiving(sampleBy.skin.hex)) {
      byRole.skin = { role: "skin", hex: normalizeHex(sampleBy.skin.hex) };
    } else {
      delete byRole.skin;
      delete byRole.skin_hi;
      delete byRole.skin_lo;
    }
  }

  // accent 与 text/hero 同色时：优先换成采样 accent；否则丢掉重复的低优先级角色
  // 近黑/近白/低饱和同色：文字色优先于 accent（海报黑字场景）
  const ROLE_PRIORITY = [
    "bg",
    "hero",
    "skin",
    "skin_lo",
    "skin_hi",
    "accent",
    "glow",
    "text",
    "secondary",
    "mute",
    "rim",
  ];
  const isNeutralHex = (hex) => {
    const hsl = hexToHsl(hex);
    if (!hsl) return false;
    return hsl.s < 0.12 || hsl.l < 0.08 || hsl.l > 0.92;
  };
  // 预调整：accent===text 且为中性色 → 丢掉 accent（留给 text）；有彩色采样则下一步补回
  if (
    byRole.accent &&
    byRole.text &&
    normalizeHex(byRole.accent.hex) === normalizeHex(byRole.text.hex) &&
    isNeutralHex(byRole.accent.hex)
  ) {
    if (sampleBy.accent && normalizeHex(sampleBy.accent.hex) !== normalizeHex(byRole.text.hex)) {
      byRole.accent = { role: "accent", hex: normalizeHex(sampleBy.accent.hex) };
    } else {
      delete byRole.accent;
    }
  }

  const usedHex = new Map();
  for (const role of ROLE_PRIORITY) {
    const cur = byRole[role];
    if (!cur) continue;
    const hex = normalizeHex(cur.hex);
    const owner = usedHex.get(hex);
    if (!owner) {
      usedHex.set(hex, role);
      continue;
    }
    // 同色冲突：accent 可尝试采样替换；否则删除当前低优先级角色
    if (role === "accent" && sampleBy.accent) {
      const alt = normalizeHex(sampleBy.accent.hex);
      if (alt !== hex && !usedHex.has(alt)) {
        byRole.accent = { role: "accent", hex: alt };
        usedHex.set(alt, "accent");
        continue;
      }
    }
    delete byRole[role];
  }

  let next = Object.values(byRole).filter((e) => {
    if (e.role !== "rim") return true;
    const hex = normalizeHex(e.hex);
    if (!hasWhiteRimCue && (hex === "#FFFFFF" || hex === "#FEFEFE" || hex === "#FAFAFA")) {
      return false;
    }
    return true;
  });

  // 保持角色展示顺序稳定
  next.sort((a, b) => ROLE_PRIORITY.indexOf(a.role) - ROLE_PRIORITY.indexOf(b.role));

  // 无 VLM 色板时，直接用采样（至少 bg/hero）
  if (!next.length && sampleEntries.length) next = sampleEntries.slice(0, 8);

  // 浅肤锁：采样回填不得把头发棕再写回 skin/hero
  next = next.filter((e) => {
    if (e.role === "skin" && skinHexConflictsToneCue(e.hex, text)) return false;
    if (
      e.role === "hero" &&
      cueSuggestsFaceFillCloseup(text) &&
      cueSkinLightnessBand(text) === "light"
    ) {
      const h = hexToHsl(e.hex);
      if (h && h.l < 0.28) return false;
    }
    return true;
  });
  if (!next.some((e) => e.role === "skin")) {
    next = next.filter((e) => e.role !== "skin_hi" && e.role !== "skin_lo");
  }

  return formatPalette(next) || "";
}

/**
 * 仅采样色板字符串（对比 diff 用；不改 Pack）
 * @param {string} dataUrl
 * @returns {Promise<string>}
 */
export async function groundPaletteOnly(dataUrl) {
  const sampled = await samplePaletteFromReference(dataUrl);
  return formatPalette(sampled);
}

/**
 * 用参考图像素锚定 Pack 色板与氛围措辞（异步）
 * @param {ReturnType<typeof normalizePack>} pack
 * @param {string} dataUrl
 */
export async function groundPackToReferenceImage(pack, dataUrl, opts = {}) {
  const light = Boolean(opts.light);
  const base = light ? lightNormalizePack(pack || {}) : normalizePack(pack || {});
  const blob = `${base.positive} ${base.style} ${base.layout} ${base.elements} ${base.camera} ${base.negative}`;
  const sampled = await samplePaletteFromReference(dataUrl, blob);
  if (!sampled.length) return base;

  let palette = groundPaletteToReference(base.palette, sampled, blob);
  const claimSamples = sampled.filter((e) => e.role === "hero" || e.role === "accent");
  let positive = reconcileColorClaimsWithSamples(base.positive, claimSamples);
  let style = reconcileColorClaimsWithSamples(base.style, claimSamples);
  let elements = reconcileColorClaimsWithSamples(base.elements, claimSamples);
  const sampleBg = sampled.find((e) => e.role === "bg");
  const sampleGlow = sampled.find((e) => e.role === "glow");
  const gradeHex = sampleBg?.hex || sampleGlow?.hex || "";
  const family = gradeHex ? hueFamilyFromHex(gradeHex) : "";
  const hasHaze = /\b(smoke|haze|fog|smoky|雾|烟)\b/i.test(blob);
  const hasAtmo = hasHaze || hasAtmosphereLightingEvidence(blob);
  const hasEmissive = hasEmissiveGlowEvidence(blob);

  // glow：无发光证据则剥掉采样/VLM 的 glow；有证据且缺 glow 则注入采样
  {
    let entries = parsePalette(palette);
    if (!hasEmissive) {
      entries = entries.filter((e) => e.role !== "glow");
    } else if (!entries.some((e) => e.role === "glow") && sampleGlow) {
      entries.push({ role: "glow", hex: normalizeHex(sampleGlow.hex) });
    }
    palette = formatPalette(entries) || palette;
  }

  // 将正文里残留的示例/冲突 hex 替换为采样 glow/bg（仅替换已知指纹与被覆盖角色）
  const replaceHex = (text, fromRoles) => {
    let s = String(text || "");
    for (const role of fromRoles) {
      const grounded = parsePalette(palette).find((e) => e.role === role);
      const prev = parsePalette(base.palette).find((e) => e.role === role);
      if (!grounded || !prev) continue;
      if (normalizeHex(grounded.hex) === normalizeHex(prev.hex)) continue;
      const bare = normalizeHex(prev.hex).replace(/^#/, "");
      const re = new RegExp(`#?${bare}\\b`, "gi");
      s = s.replace(re, grounded.hex);
    }
    return s;
  };
  positive = replaceHex(positive, ["glow", "bg", "hero", "skin", "accent"]);
  style = replaceHex(style, ["glow", "bg", "hero", "skin", "accent"]);
  elements = replaceHex(elements, ["glow", "bg", "hero", "skin", "accent"]);

  // 轻量路径：只锚定色板，不做氛围句/风格语义改写
  if (light) {
    const tokens = paletteToPromptTokens(palette);
    if (tokens && positive && !/#([0-9a-f]{6})\b/i.test(positive)) {
      positive = `${positive}, ${tokens}`.replace(/\s{2,}/g, " ").trim();
    }
    return lightNormalizePack({
      ...base,
      palette,
      positive,
      style,
      elements,
    });
  }

  // 氛围等级：烟雾 / 霓虹夜景 / emissive 均写入（不污染精简 style）
  if (hasAtmo && family && !/dominant atmosphere grade:/i.test(positive)) {
    const kind = hasHaze ? "haze" : "ambient";
    const grade = `dominant atmosphere grade: ${family} ${kind} sampled from reference`;
    if (!new RegExp(family.replace(/[-\s]/g, "[-\\s]*"), "i").test(positive)) {
      positive = `${grade}, ${positive}`.replace(/\s{2,}/g, " ").trim();
    }
  }

  return {
    ...base,
    palette,
    positive,
    elements,
    style: clarifyStyleField(style, `${positive} ${base.layout || ""}`),
  };
}

export function paletteToPromptTokens(palette) {
  const entries = Array.isArray(palette) ? palette : parsePalette(palette);
  if (!entries.length) return "";
  const by = Object.fromEntries(entries.map((e) => [e.role, normalizeHex(e.hex)]));
  const parts = [];
  for (const e of entries) {
    if (e.role === "skin_hi" || e.role === "skin_lo") continue;
    if (e.role === "skin" && (by.skin_hi || by.skin_lo)) {
      const bits = [`skin ${normalizeHex(e.hex)}`];
      if (by.skin_hi) bits.push(`highlight ${by.skin_hi}`);
      if (by.skin_lo) bits.push(`shadow ${by.skin_lo}`);
      parts.push(bits.join(" "));
      continue;
    }
    parts.push(`${e.role} ${normalizeHex(e.hex)}`);
  }
  return `color palette ${parts.join(", ")}`;
}

/**
 * hex → 描述性色彩词。扩散平台（MJ / Flux）对 #RRGGBB 无梯度响应，
 * 读得懂的是色彩关系词；精确色号保留在色板 UI 给人审。
 * @param {string} hex
 * @returns {string} 非法输入返回 ""
 */
export function hexToColorPhrase(hex) {
  const m = String(hex || "").trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return "";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 510;
  const d = (max - min) / 255;
  // 近灰：按明度分档，不带色相
  if (d < 0.12) {
    if (l < 0.12) return "near-black";
    if (l < 0.32) return "dark gray";
    if (l < 0.62) return "medium gray";
    if (l < 0.85) return "light gray";
    return "near-white";
  }
  const s = Math.min(1, d / (1 - Math.abs(2 * l - 1)));
  let h = 0;
  if (max === r) h = ((g - b) / 255 / d) * 60;
  else if (max === g) h = ((b - r) / 255 / d) * 60 + 120;
  else h = ((r - g) / 255 / d) * 60 + 240;
  if (h < 0) h += 360;

  const families = [
    [15, "red", "warm"],
    [45, "orange", "warm"],
    [70, "yellow", "warm"],
    [160, "green", ""],
    [195, "teal", "cool"],
    [250, "blue", "cool"],
    [290, "violet", ""],
    [345, "magenta", ""],
    [360, "red", "warm"],
  ];
  let family = "red";
  let warmCool = "warm";
  for (const [edge, name, wc] of families) {
    if (h < edge) {
      family = name;
      warmCool = wc;
      break;
    }
  }
  const parts = [];
  if (l < 0.3) parts.push("deep");
  else if (l > 0.82) parts.push("pale");
  else if (s > 0.65) parts.push("saturated");
  else if (s < 0.3) parts.push("muted");
  else if (l > 0.6) parts.push("light");
  if (warmCool) parts.push(warmCool);
  parts.push(family);
  return parts.join(" ");
}

/**
 * 文本内全部 #RRGGBB → 色彩词；「label:#hex」补空格；多余空白收敛
 * @param {string} text
 */
export function translateHexColors(text) {
  return String(text || "")
    .replace(/#([0-9a-fA-F]{6})\b/g, (m) => hexToColorPhrase(m) || m)
    .replace(/([a-z]):(?=[a-z])/gi, "$1: ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * MJ --no 优先级精选：介质抗漂移词 > 通用禁令；去重、去低价值词、上限 max
 * （--no 项数越多单份权重越稀，宁可少而准）
 * @param {string} negative
 * @param {string} medium detectMediumClass 结果
 * @param {number} [max]
 */
function pickMjNoItems(negative, medium, max = 5) {
  const anti = String(MEDIUM_ANTI_DRIFT_NEGATIVE[medium] || "")
    .split(/[,;]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const rest = String(negative || "")
    .split(/[,;]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const item of [...anti, ...rest]) {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) continue;
    if (LOW_VALUE_NEGATIVE_RE.test(item)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 负面条目的关键词是否已在正向文本（含 NOT X 硬锁）中覆盖
 * @param {string} item
 * @param {string} positive
 */
function negWordsCoveredByPositive(item, positive) {
  const p = ` ${String(positive || "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const words = String(item)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  return words.length > 0 && words.every((w) => p.includes(` ${w} `));
}

/**
 * Flux 无原生负向输入：负面清单折叠为正向尾部的自然语言否定句；
 * 硬锁已覆盖的条目不重复出现。
 * @param {string} positive
 * @param {string} negative
 * @returns {string} 形如 " Do not include: a, b."；无剩余项时返回 ""
 */
function buildFluxNegation(positive, negative) {
  const items = String(negative || "")
    .split(/[,;]\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((item) => !negWordsCoveredByPositive(item, positive));
  if (!items.length) return "";
  const sep = /[.!?]\s*$/.test(String(positive || "").trim()) ? " " : ". ";
  return `${sep}Do not include: ${softTrim(items.join(", "), 180)}.`;
}

/**
 * 色板诚实修补：去掉无依据的纯白 rim；拦截抄自契约示例的「指纹色板」。
 * 不做任何预配置色注入；真实色锚定见 groundPackToReferenceImage。
 * @param {string} palette
 * @param {string} blob  positive+layout+style+camera 等
 */
export function repairPaletteHonesty(palette, blob = "") {
  return groundPaletteToReference(palette, [], blob);
}

/** 导出目标平台 */
export const EXPORT_PLATFORMS = {
  generic: { label: "通用", media: "both" },
  midjourney: { label: "Midjourney", media: "image" },
  flux: { label: "Flux", media: "image" },
  wanx: { label: "通义万相", media: "image" },
  seedream: { label: "Seedream", media: "image" },
  gemini: { label: "Gemini", media: "image" },
  gptImage: { label: "GPT Image 2", media: "image" },
  kling: { label: "Kling", media: "video" },
  wanxVideo: { label: "万相视频", media: "video" },
  seedance: { label: "Seedance", media: "video" },
};

/** 锁强度：weak 不前置；normal 前置一次；strong 前置并强化负向 */
export const LOCK_WEIGHTS = ["weak", "normal", "strong"];

/**
 * 从 style/positive 粗分介质，用于负向对抗模板
 * @param {ReturnType<typeof normalizePack>} pack
 * @returns {"flash_photo"|"photo"|"watercolor"|"flat"|"illustration"|"render3d"|"infographic"|"cinematic"|"product"|"generic"}
 */
export function detectMediumClass(pack) {
  const p = normalizePack(pack);
  const blob = `${p.style} ${p.positive} ${p.layout} ${p.camera}`.toLowerCase();
  // 实物设备/产品图（含带屏 UI）优先于纯信息图，避免塌成 flat dashboard
  if (
    /rugged tablet|handheld device|physical (phone|tablet|laptop|monitor)|device chassis|product (photo|shot|viz)|bezel|three-quarter|isometric (product|device)|产品图|工业平板|设备外壳/.test(
      blob
    )
  ) {
    return "product";
  }
  if (/infographic|diagram|data.?viz|dashboard|timeline|org chart|slideware|流程图|信息图/.test(blob)) {
    // 若同时强调透视/景深/实物，仍按产品/摄影处理
    if (/shallow depth|bokeh|three-quarter|angled (tablet|device|monitor)|physical device/.test(blob)) {
      return "product";
    }
    return "infographic";
  }
  // 直闪抓拍：单独介质，禁止塌成普通 photo（否则丢失 flash 硬锁）
  if (
    hasFlashCaptureEvidence(blob) &&
    !/flat vector|flat color fills only|dot eyes|single-line smile/.test(blob)
  ) {
    return "flash_photo";
  }
  // 写实快照 / 噪点优先于「电影海报」粗分类（避免 photoreal 一律进 cinematic）
  if (
    /instagram|high-?iso|digital noise|pixel grain|lo-?fi|point-and-shoot|candid (lifestyle|snapshot)|手机快照|噪点/.test(
      blob
    ) &&
    !/flat vector|flat color fills only|dot eyes|single-line smile/.test(blob)
  ) {
    return "photo";
  }
  // 室内纪实/客厅多人：即使 style 写了 film still，也不按电影海报介质注入负向
  const looksDocumentaryInterior =
    /\b(sofa|couch|living room|sitting room|family|coffee table|crt|television|tv set|bare (light )?bulb)\b/.test(
      blob
    );
  const hasPosterChrome =
    /\b(movie poster|key art|poster title|title credits|credit block|frame-level title|directed by|海报标题|演职员)\b/.test(
      blob
    );
  // 电影海报 / 关键艺术 — 需要明确海报/片名线索；裸 “cinematic film still” 不够
  if (
    /cinematic key art|movie poster|key art|anamorphic|电影海报|关键艺术/.test(blob) ||
    (hasPosterChrome && /cinematic|film still|电影/.test(blob))
  ) {
    if (!/flat vector|flat color fills only|dot eyes|single-line smile/.test(blob)) {
      return "cinematic";
    }
  }
  if (looksDocumentaryInterior && !hasPosterChrome) {
    if (/photoreal|cgi|film still|cinematic|documentary|写真|写实/.test(blob)) return "photo";
  }
  if (/flat vector|flat design|bauhaus|geometric poster|no gradients|solid color blocks|平面|扁平/.test(blob)) {
    return "flat";
  }
  // 炭笔/石墨/墨晕素描：不要因 "ink wash" 里的 wash 塌成水彩
  if (
    /\b(charcoal|graphite|pencil\s*(?:sketch|drawing|portrait)|ink\s*wash|fine[-\s]?art\s*sketch|cross[-\s]?hatch|素描|炭笔|铅笔)\b/.test(
      blob
    )
  ) {
    return "illustration";
  }
  if (/watercolor|watercolour|gouache|wet-on-wet|水彩|pigment wash|wet wash/.test(blob)) {
    return "watercolor";
  }
  if (/3d render|octane|cinema 4d|blender|low-poly|helical|parametric|cgi|三维|渲染/.test(blob)) {
    return "render3d";
  }
  if (/cinematic|film still|volumetric|movie still|anamorphic|电影/.test(blob) && hasPosterChrome) {
    return "cinematic";
  }
  if (/illustration|vector|cel-shad|comic|anime|插画/.test(blob)) {
    return "illustration";
  }
  if (/photoreal|photograph|dslr|editorial photo|studio softbox|cinematic film still|film still|写真|摄影|写实/.test(blob)) {
    return "photo";
  }
  return "generic";
}

/** 介质对抗负向（极短；默认不灌长词表） */
const MEDIUM_NEGATIVE = {
  watercolor: "photoreal photograph, sharp vector edges",
  flat: "photoreal, soft painterly brushstrokes",
  illustration: "photoreal skin, cinematic film still, Unreal Engine, octane CGI",
  render3d: "flat 2d vector, anime faces",
  infographic: "invented numbers, illegible text",
  cinematic: "flat vector, anime faces, comic illustration upgrade",
  product: "flat UI mockup, missing device chassis",
  flash_photo: "soft even lighting, soft bloom, cinematic lighting upgrade",
  photo: "anime faces, movie title overlay",
  generic: "watermark, deformed anatomy",
};

/**
 * 弱平台（Flux / 万相）介质硬锁：前置一行，抗水彩→吉卜力、平面→写实等漂移
 * 刻意短句；budget 裁剪时必须保留头部
 */
const MEDIUM_HARD_LOCK = {
  watercolor:
    "traditional watercolor on textured paper, wet-on-wet pigment bloom, paper tooth visible — NOT anime, NOT ghibli, NOT digital illustration",
  flat:
    "hard-edge flat vector poster, solid geometric color blocks, locked placement — NOT soft painterly, NOT photoreal, NOT watercolor",
  illustration:
    "hand-drawn illustration finish locked — NOT photoreal skin, NOT cinematic film still, NOT Unreal CGI",
  render3d: "3D CGI render with PBR materials — NOT flat 2d vector, NOT anime faces",
  cinematic: "cinematic key art / film still look locked — NOT flat vector, NOT anime upgrade",
  flash_photo:
    "on-camera flash photograph, hard flash cast shadow, high-ISO grit locked — NOT soft even lighting, NOT soft bloom, NOT cinematic softbox",
  photo: "photoreal photograph medium locked — NOT anime faces, NOT illustrated upgrade",
  product: "physical product photograph — keep device chassis and true form-factor",
  infographic: "infographic / diagram layout locked — no invented numbers",
  generic: "",
};

/** 弱平台抗漂移负向（比 MEDIUM_NEGATIVE 更针对已知失败模式） */
const MEDIUM_ANTI_DRIFT_NEGATIVE = {
  watercolor: "ghibli, anime cel, digital illustration, sharp vector, photoreal photograph",
  flat: "soft painterly brushstrokes, watercolor wash, photoreal, cinematic bokeh, ghibli",
  illustration: "photoreal skin, Unreal Engine, octane CGI, cinematic film still",
  render3d: "flat 2d vector, anime faces, watercolor wash",
  cinematic: "flat vector, anime faces, comic illustration upgrade",
  flash_photo: "soft even lighting, soft bloom, cinematic softbox, no-hard-shadows",
  photo: "anime faces, ghibli, illustrated upgrade",
  product: "flat UI mockup, missing device chassis",
  infographic: "invented numbers, illegible text",
  generic: "",
};

/**
 * 弱平台导出方言：介质硬锁前置 +（平面）构图提前 + 抗漂移负向
 * 在 frontLoadLocks 之后调用；softTrim 会从尾部裁，头部硬锁得以保留
 * @param {ReturnType<typeof normalizePack>} pack
 */
export function applyWeakPlatformDialect(pack) {
  const p = normalizePack(pack);
  const medium = detectMediumClass(p);
  const hardLock = MEDIUM_HARD_LOCK[medium] || "";
  const antiDrift = MEDIUM_ANTI_DRIFT_NEGATIVE[medium] || "";

  /** @type {string[]} */
  const headParts = [];
  if (hardLock && !alreadyContains(p.positive, hardLock)) {
    headParts.push(hardLock);
  }
  // 平面海报：构图几何必须尽早出现（盲测常见「颜色对、排版完全跑偏」）
  if (medium === "flat" && p.layout) {
    const layoutTip = softTrim(stripGeneratorFlags(p.layout), 140);
    if (layoutTip && !alreadyContains(p.positive.slice(0, 260), layoutTip)) {
      headParts.push(layoutTip);
    }
  }

  let positive = p.positive;
  if (headParts.length) {
    const head = headParts.join(", ");
    positive = positive ? `${head}, ${positive}` : head;
  }

  const negative = antiDrift ? mergeNegatives(p.negative, antiDrift) : p.negative;
  return { ...p, positive, negative };
}

/** 低价值负向：正向已锁介质/构图时容易粉红象，优先丢掉 */
const LOW_VALUE_NEGATIVE_RE =
  /^(illustration|cartoon|flat vector|cel shading|ink line art|ink outlines?|clean line art|comic outlines?|thin black contour lines|watermark|wrong aspect ratio|deformed anatomy|over-smoothed plastic skin|inconsistent art style across cast|cheerful bright daylight|corporate memphis shapes|wrong color palette|shifted hue|wrong garment hue|lines)$/i;

/**
 * 压缩负向：去低价值词 + 去重 + 长度上限
 * @param {string} negative
 * @param {number} maxChars
 */
export function slimNegatives(negative, maxChars = 160) {
  const seen = new Set();
  const out = [];
  for (const part of String(negative || "").split(/[,;]\s*/)) {
    const item = part.trim();
    if (!item) continue;
    if (LOW_VALUE_NEGATIVE_RE.test(item)) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return softTrim(out.join(", "), maxChars);
}

/**
 * @param {string} existing
 * @param {string} extra
 */
function mergeNegatives(existing, extra) {
  const parts = [existing, extra]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  if (!parts.length) return "";
  // 去重粗词（兼容逗号/分号分隔）
  const seen = new Set();
  const out = [];
  for (const part of parts.join(", ").split(/[,;]\s*/)) {
    const key = part.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(part.trim());
  }
  return out.join(", ");
}

/**
 * 判断 haystack 是否已含 needle 的主要片段
 * @param {string} haystack
 * @param {string} needle
 */
function alreadyContains(haystack, needle) {
  const h = String(haystack || "").toLowerCase();
  const n = String(needle || "").trim().toLowerCase();
  if (!n) return true;
  // 取前 48 字符作为指纹，避免整段重复
  const tip = n.slice(0, Math.min(48, n.length));
  return tip.length >= 8 ? h.includes(tip) : h.includes(n);
}

/**
 * 截断到约 maxChars，尽量在逗号处断开
 * @param {string} text
 * @param {number} maxChars
 */
function softTrim(text, maxChars) {
  const s = String(text || "").trim();
  if (s.length <= maxChars) return s;
  const slice = s.slice(0, maxChars);
  const cutComma = slice.lastIndexOf(",");
  const cutSemi = slice.lastIndexOf(";");
  const cut = Math.max(cutComma, cutSemi);
  return (cut > maxChars * 0.55 ? slice.slice(0, cut) : slice).trim().replace(/[,;\s]+$/, "");
}

/**
 * 将 style / palette / camera / motion / layout 前置进 positive（按权重）。
 * 内部按 chunk 记录来源与强度，MJ 等平台可用 chunk 级 `::` 权重；
 * frontLoadLocks 保持旧行为（纯文本拼接），其他平台零改动。
 * @param {ReturnType<typeof normalizePack>} pack
 * @param {{ style?: string, layout?: string, palette?: string, camera?: string, motion?: string }} weights
 * @returns {{ pack: object, basePositive: string, chunks: Array<{ text: string, strong: boolean }> }}
 */
function buildFrontLoadedState(pack, weights = {}) {
  const p = normalizePack(pack);
  const sw = LOCK_WEIGHTS.includes(weights.style) ? weights.style : "normal";
  const lw = LOCK_WEIGHTS.includes(weights.layout) ? weights.layout : "normal";
  const pw = LOCK_WEIGHTS.includes(weights.palette) ? weights.palette : "normal";
  const cw = LOCK_WEIGHTS.includes(weights.camera) ? weights.camera : "normal";
  // motion 权重：优先 weights.motion；否则回退 style（与 UI 单一保真控件对齐）
  const mw = LOCK_WEIGHTS.includes(weights.motion)
    ? weights.motion
    : LOCK_WEIGHTS.includes(weights.style)
      ? weights.style
      : "normal";

  const chunks = [];
  if (sw !== "weak" && p.style && !alreadyContains(p.positive, p.style)) {
    chunks.push({ text: p.style, strong: sw === "strong" });
  }
  const paletteTokens = paletteToPromptTokens(p.palette);
  if (pw !== "weak" && paletteTokens && !alreadyContains(p.positive, paletteTokens)) {
    chunks.push({ text: paletteTokens, strong: pw === "strong" });
  }
  // 镜头锁在构图之前：避免弱平台把透视/景深裁掉，塌成正面 UI
  if (cw !== "weak" && p.camera && !alreadyContains(p.positive, p.camera)) {
    chunks.push({ text: p.camera, strong: cw === "strong" });
  }
  // 运动锁：插在 camera 之后、layout 之前
  if (mw !== "weak" && p.motion && !alreadyContains(p.positive, p.motion)) {
    chunks.push({ text: p.motion, strong: mw === "strong" });
  }
  // 分镜运动摘要（strong）：最多前 3 镜，避免 positive 爆炸
  if (mw === "strong" && Array.isArray(p.shots) && p.shots.length) {
    const motionShots = p.shots.filter((s) => s.motion);
    const selected = (motionShots.length ? motionShots : p.shots).slice(0, 3);
    const parts = selected
      .filter((s) => s.motion)
      .map((s) => `shot${s.index}: ${softTrim(s.motion, 80)}`);
    if (parts.length) {
      const summary = parts.join("; ");
      if (!alreadyContains(p.positive, summary)) chunks.push({ text: summary, strong: true });
    }
  }
  // 排版锁：插在 motion 之后、layout 之前，避免 softTrim 裁掉尾部字号/字距
  const typeLock = extractTypographyLockSnippet(p);
  if (typeLock && !alreadyContains(p.positive, typeLock)) {
    chunks.push({ text: typeLock, strong: false });
  }
  // 光影锁：紧随排版，保留闪光/脸部光比
  const lightLock = extractLightingLockSnippet(p);
  if (lightLock && !alreadyContains(p.positive, lightLock)) {
    chunks.push({ text: lightLock, strong: false });
  }
  if (lw !== "weak" && p.layout && !alreadyContains(p.positive, p.layout)) {
    chunks.push({ text: p.layout, strong: lw === "strong" });
    if (lw === "strong") chunks.push({ text: p.layout, strong: true });
  }

  let positive = p.positive;
  if (chunks.length) {
    const head = chunks.map((c) => c.text).join(", ");
    positive = positive ? `${head}, ${positive}` : head;
  }

  let negative = p.negative;
  const packBlob = `${p.positive} ${p.layout} ${p.style} ${p.camera} ${p.elements}`.toLowerCase();
  const medium = detectMediumClass(p);
  const anyStrong =
    sw === "strong" || lw === "strong" || pw === "strong" || cw === "strong" || mw === "strong";

  // 默认不灌介质长禁词；仅 strong 时补极短介质对抗
  if (anyStrong) {
    const ban = MEDIUM_NEGATIVE[medium] || MEDIUM_NEGATIVE.generic;
    negative = mergeNegatives(negative, ban);
  }

  // 无画面文字：只在 strong 或电影/海报介质时禁标题（避免每张图都堆负向）
  const hasType = hasOverlayTypographyEvidence(p);
  if (!hasType && (anyStrong || medium === "cinematic")) {
    negative = mergeNegatives(negative, "movie title overlay, credit block");
  }
  if (hasType) {
    negative = slimNegatives(
      String(negative || "")
        .replace(/\bmovie title overlays?\b/gi, "")
        .replace(/\bcredit blocks?\b/gi, ""),
      180
    );
    negative = mergeNegatives(
      negative,
      "invented extra caption, wrong type weight, tight tracking when letterspaced"
    );
  }
  const hasFlash = hasFlashCaptureEvidence(packBlob);
  const hasFaceLight = hasFaceLightingEvidence(packBlob);
  if (hasFlash) {
    negative = mergeNegatives(negative, "soft even lighting, soft bloom, cinematic lighting upgrade");
  } else if (hasFaceLight) {
    negative = mergeNegatives(negative, "soft even lighting, even warm fill, invented rim light");
  }

  // 以下仅 strong：把保真压力放在正向锁，负向点到为止
  if (pw === "strong" && p.palette) {
    negative = mergeNegatives(negative, "wrong color palette");
  }
  if (anyStrong) {
    const hasFire = /\b(fire|flame|ember|glow|lamplight|torch)\b/i.test(packBlob);
    const hasGlowRole =
      /\bglow\s*:?\s*#?[0-9a-f]{6}\b/i.test(p.palette || "") ||
      /\bglow\s+#?[0-9a-f]{6}\b/i.test(p.positive || "");
    if (hasFire && !hasGlowRole) {
      negative = mergeNegatives(negative, "missing warm fire glow");
    }
  }
  if (
    anyStrong &&
    /\bhero figure\b/i.test(packBlob) &&
    !/\b(man|woman|boy|girl|male|female)\b/i.test(packBlob)
  ) {
    negative = mergeNegatives(negative, "gender-swapped protagonist");
  }
  // 人种：正向已锁 phenotype 时，负向只留一词；无人种锁时也不堆长禁词
  if (anyStrong && PHENOTYPE_APPEARANCE_RE.test(packBlob)) {
    negative = mergeNegatives(negative, "wrong ethnicity");
  }
  if (lw === "strong" && p.layout) {
    negative = mergeNegatives(negative, "relocated figures");
  }
  if (cw === "strong" && p.camera) {
    negative = mergeNegatives(negative, "wrong camera angle");
  }
  if (mw === "strong" && p.motion) {
    negative = mergeNegatives(negative, "static pose, slideshow cuts");
  }

  // 清粉红象 + 丢低价值词 + 硬上限（标准档更短）
  negative = scrubPinkElephantNegatives(negative);
  negative = slimNegatives(negative, anyStrong ? 180 : 120);

  return { pack: { ...p, positive, negative }, basePositive: p.positive, chunks };
}

/**
 * 前置锁合并（旧行为：纯文本拼接，其他平台沿用）
 * @param {ReturnType<typeof normalizePack>} pack
 * @param {{ style?: string, layout?: string, palette?: string, camera?: string, motion?: string }} weights
 */
export function frontLoadLocks(pack, weights = {}) {
  return buildFrontLoadedState(pack, weights).pack;
}

/**
 * 从 ratio 字段或 positive 里抽出 --ar W:H
 * @param {ReturnType<typeof normalizePack>} pack
 */
export function extractArToken(pack) {
  const p = normalizePack(pack);
  const m = `${p.ratio} ${p.positive}`.match(/--ar\s*(\d+)\s*:\s*(\d+)/i);
  return m ? `--ar ${m[1]}:${m[2]}` : "";
}

/** 去掉生成器旗标 / 冗余宽高比尾巴，便于对话式图模 */
function stripGeneratorFlags(text) {
  return String(text || "")
    .replace(/--ar\s*\d+\s*:\s*\d+/gi, "")
    .replace(/--\w+(?:\s+[\w.-]+)?/gi, "")
    .replace(/\b\d+\s*:\s*\d+\s+aspect ratio\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .trim();
}

/**
 * 分栏导出时从 positive 去掉已单独列出的 style/palette/camera/layout，避免三重复
 * @param {string} positive
 * @param {{ style?: string, palette?: string, camera?: string, layout?: string }} sections
 */
export function stripSectionEchoFromPositive(positive, sections = {}) {
  let s = stripGeneratorFlags(positive);
  // 角色色板短语
  s = s.replace(
    /\bcolor palette\s+(?:skin_hi|skin_lo|bg|hero|skin|accent|text|secondary|mute|rim|glow)\s*#?[0-9a-f]{3,8}(?:\s*,\s*(?:skin_hi|skin_lo|bg|hero|skin|accent|text|secondary|mute|rim|glow|highlight|shadow)\s*#?[0-9a-f]{3,8})*/gi,
    " "
  );
  // role:#hex 管道串
  s = s.replace(
    /\b(?:skin_hi|skin_lo|bg|hero|skin|accent|text|secondary|mute|rim|glow)\s*:\s*#?[0-9a-f]{3,8}(?:\s*\|\s*(?:skin_hi|skin_lo|bg|hero|skin|accent|text|secondary|mute|rim|glow)\s*:\s*#?[0-9a-f]{3,8})*/gi,
    " "
  );

  const stripExact = (chunk) => {
    const c = stripGeneratorFlags(chunk);
    if (!c || c.length < 10) return;
    const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(esc, "ig"), " ");
  };

  const stripClauses = (chunk, sep) => {
    const c = stripGeneratorFlags(chunk);
    if (!c) return;
    for (const clause of c.split(sep).map((x) => x.trim()).filter(Boolean)) {
      if (clause.length < 12) continue;
      const esc = clause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      s = s.replace(new RegExp(esc, "ig"), " ");
    }
  };

  if (sections.style) {
    stripExact(sections.style);
    stripClauses(sections.style, /,\s*/);
  }
  if (sections.camera) {
    stripExact(sections.camera);
    stripClauses(sections.camera, /,\s*/);
  }
  if (sections.layout) {
    stripExact(sections.layout);
    stripClauses(sections.layout, /\s*;\s*/);
  }
  if (sections.palette) {
    stripExact(paletteToPromptTokens(sections.palette) || sections.palette);
    stripExact(sections.palette);
  }

  return s
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .trim();
}

function scrubInternalIds(text, peopleEls = []) {
  const who = String(peopleEls[0]?.name || "")
    .split(/[,，]/)[0]
    .trim();
  return String(text || "").replace(/\b([sor]\d+)\b/gi, () => who || "");
}

const EXPORT_CROP_TAIL_RE =
  /,\s*((?:(?:upper|lower)\s+)?(?:legs?|feet|shoes?|knees?|ankles?|hips?|waist|chest|bust|shoulders?|chin|forehead|crown|head|neck|lower\s+(?:body|torso)|below\s+(?:the\s+)?(?:waist|bust|chest|knee)|crop(?:ped)?).+)$/i;
const EXPORT_WEAR_RE = /,\s*wearing\s+(.+)$/i;
const EXPORT_EXPRESSION_RE = /^expression:\s*(.+)$/i;
const EXPORT_POSE_TOKEN_RE =
  /^(seated|standing|kneeling|lying|leaning|sitting on\s+.+|three-quarter(?: view)?|profile(?:-(?:left|right))?|front|back view|front-facing)$/i;
const EXPORT_LIMB_ACTION_RE =
  /\b(hand raised|arms?(?:\s+\w+){0,6}|hands?(?:\s+\w+){0,8}|fists?|elbows?|torso upright|gaze directed|head tilted|looking |mid-draw|weapon hilt|clenched|raised to)\b/i;
const EXPORT_FRAMING_TOKEN_RE =
  /\b((?:extreme\s+)?close-?up|bust crop|waist-up|full-body|wide establishing|filling the frame|framing)\b/i;
const EXPORT_HAIR_TOKEN_RE =
  /\b(updo|bun|chignon|braid|ponytail|topknot|bald|hair)\b|^(long|short|medium)\b/i;
const EXPORT_HAIR_COLOR_RE = /^(black|brown|blonde|blond|white|red|auburn|silver|gray|grey|jet-black)$/i;

/**
 * 把人物 roster 拆成脸 / 表情 / 发 / 衣 / 裁切 / 姿态，供分栏 MECE 导出
 * @param {string} name
 */
function splitPersonExportBlocks(name) {
  let rest = String(name || "").trim();
  /** @type {{ face: string, expression: string, hair: string, wardrobe: string, crop: string, pose: string }} */
  const out = { face: "", expression: "", hair: "", wardrobe: "", crop: "", pose: "" };
  const cropM = rest.match(EXPORT_CROP_TAIL_RE);
  if (cropM && cropM.index != null) {
    out.crop = cropM[1].trim();
    rest = rest.slice(0, cropM.index).trim();
  }
  const wearM = rest.match(EXPORT_WEAR_RE);
  if (wearM && wearM.index != null) {
    out.wardrobe = wearM[1].trim();
    rest = rest.slice(0, wearM.index).trim();
  }
  const parts = rest
    .split(/,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  /** @type {string[]} */
  const face = [];
  /** @type {string[]} */
  const pose = [];
  /** @type {string[]} */
  const cropBits = out.crop ? [out.crop] : [];
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    const exprM = p.match(EXPORT_EXPRESSION_RE);
    if (exprM) {
      out.expression = out.expression ? `${out.expression}, ${exprM[1].trim()}` : exprM[1].trim();
      continue;
    }
    if (
      /^(mouth:\s+)?(closed lips|pursed lips|parted lips|open mouth showing teeth)$/i.test(p) ||
      /^mouth:\s+/i.test(p)
    ) {
      const bit = p.replace(/^mouth:\s+/i, "").trim();
      out.expression = out.expression ? `${out.expression}, ${bit}` : bit;
      continue;
    }
    if (EXPORT_POSE_TOKEN_RE.test(p) || EXPORT_LIMB_ACTION_RE.test(p)) {
      pose.push(p);
      continue;
    }
    if (EXPORT_FRAMING_TOKEN_RE.test(p)) {
      cropBits.push(p);
      continue;
    }
    if (EXPORT_HAIR_TOKEN_RE.test(p)) {
      let hair = p;
      if (parts[i + 1] && EXPORT_HAIR_COLOR_RE.test(parts[i + 1])) {
        i += 1;
        hair = `${hair}, ${parts[i]}`;
      }
      out.hair = out.hair ? `${out.hair}, ${hair}` : hair;
      continue;
    }
    face.push(p);
  }
  out.face = face.join(", ");
  out.pose = pose.join(", ");
  out.crop = cropBits.join(", ");
  return out;
}

/**
 * Layout/Camera 去掉 Subject 已写的长身份串，只留短称呼
 * @param {string} text
 * @param {{ name: string }[]} peopleEls
 */
function stripPersonIdentityEcho(text, peopleEls) {
  let s = String(text || "");
  for (const e of peopleEls || []) {
    const b = splitPersonExportBlocks(e.name);
    if (b.face && b.face.length >= 12) {
      const shortWho = b.face.split(",")[0].trim();
      if (shortWho) {
        const esc = b.face.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        s = s.replace(new RegExp(esc, "ig"), shortWho);
      }
    }
    if (b.hair && b.hair.length >= 3) {
      const esc = b.hair.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      s = s.replace(new RegExp(`,\\s*${esc}\\b`, "ig"), "");
    }
  }
  return s
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/;\s*;+/g, ";")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .trim();
}

/**
 * MECE 人物分栏：身份 / 表情 / 姿态 / 发 / 衣
 * @param {{ name: string, zone: string }[]} peopleEls
 */
function formatMecePersonSections(peopleEls) {
  /** @type {string[]} */
  const subjects = [];
  /** @type {string[]} */
  const expressions = [];
  /** @type {string[]} */
  const poses = [];
  /** @type {string[]} */
  const hairs = [];
  /** @type {string[]} */
  const wardrobes = [];
  for (const e of peopleEls.slice(0, 8)) {
    const b = splitPersonExportBlocks(e.name);
    const zoneTag = peopleEls.length > 1 && e.zone ? ` at ${e.zone}` : "";
    if (b.face) subjects.push(`${b.face}${zoneTag}`);
    else if (!b.expression && !b.pose && !b.hair && !b.wardrobe) subjects.push(`${e.name}${zoneTag}`);
    if (b.expression) expressions.push(peopleEls.length > 1 ? `${b.expression}${zoneTag}` : b.expression);
    if (b.pose) poses.push(peopleEls.length > 1 ? `${b.pose}${zoneTag}` : b.pose);
    if (b.hair) hairs.push(peopleEls.length > 1 ? `${b.hair}${zoneTag}` : b.hair);
    if (b.wardrobe) wardrobes.push(peopleEls.length > 1 ? `${b.wardrobe}${zoneTag}` : b.wardrobe);
  }
  return {
    subject: subjects.join("; "),
    expression: expressions.join("; "),
    pose: poses.join("; "),
    hair: hairs.join("; "),
    wardrobe: wardrobes.join("; "),
  };
}

/**
 * @param {{ name: string, zone: string }[]} peopleEls
 */
function formatSequencedSubject(peopleEls) {
  const m = formatMecePersonSections(peopleEls);
  const bits = [];
  if (m.subject) bits.push(m.subject);
  if (m.expression) bits.push(`Expression: ${m.expression}`);
  if (m.pose) bits.push(`Pose: ${m.pose}`);
  if (m.hair) bits.push(`Hair: ${m.hair}`);
  if (m.wardrobe) bits.push(`Wardrobe: ${m.wardrobe}`);
  return bits.join(". ");
}

/**
 * Layout 只补裁切/区位；姿态已在 Subject，不前置复读
 * @param {string} layout
 * @param {{ name: string }[]} peopleEls
 */
function formatSequencedLayout(layout, peopleEls) {
  /** @type {string[]} */
  const head = [];
  for (const e of peopleEls) {
    const b = splitPersonExportBlocks(e.name);
    if (b.crop && !head.includes(b.crop)) head.push(b.crop);
  }
  const rest = stripPersonIdentityEcho(String(layout || "").trim(), peopleEls);
  const prefix = head.join("; ");
  if (prefix && rest) {
    const restLow = rest.toLowerCase();
    const novel = head.filter((h) => !restLow.includes(h.slice(0, 18).toLowerCase()));
    return novel.length ? `${novel.join("; ")}; ${rest}` : rest;
  }
  return prefix || rest;
}

/**
 * Composition 去掉即将在 Scene 列出的道具/区域，避免两栏复读
 * @param {string} layout
 * @param {{ name: string, zone?: string }[]} sceneEls
 */
function layoutMinusSceneElements(layout, sceneEls) {
  const parts = String(layout || "")
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length || !sceneEls?.length) return String(layout || "").trim();
  const keys = sceneEls
    .map((e) =>
      String(e?.name || "")
        .split(",")[0]
        .trim()
        .toLowerCase()
        .slice(0, 32)
    )
    .filter((k) => k.length >= 4);
  const kept = parts.filter((part) => {
    const low = part.toLowerCase();
    // 介质/画幅词保留在 Composition
    if (
      /^(full[-\s]?bleed|full_bleed|portrait|poster|scene|product|plain|framed|collage|mockup|presentation)\b/i.test(
        part
      )
    ) {
      return true;
    }
    return !keys.some((k) => low.includes(k) || k.includes(low.slice(0, Math.min(20, low.length))));
  });
  return kept.join("; ");
}

/**
 * 通用/Gemini 分栏导出：Style → 脸/发/衣 → 裁切占幅 → 光 → 场景 → 色 → 负向 → 控制
 * @param {object} pack
 * @param {{ style?: string, layout?: string, palette?: string, camera?: string, motion?: string }} [weights]
 */
function formatSectionedExport(pack, weights = {}) {
  const locked = frontLoadLocks(pack, {
    style: "weak",
    layout: "weak",
    palette: "weak",
    camera: "weak",
    motion: weights.motion === "strong" ? "normal" : "weak",
  });

  const styleRaw = stripGeneratorFlags(locked.style);
  const style = /^(other|unknown|none)$/i.test(String(styleRaw || "").trim()) ? "" : styleRaw;
  const layout = stripGeneratorFlags(locked.layout);
  let camera = stripGeneratorFlags(locked.camera)
    .replace(/\bfully sharp flat 2D rendering\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s]+|[,;\s.]+$/g, "")
    .trim();
  const motion = stripGeneratorFlags(locked.motion);
  const ratioMatch = String(locked.ratio || "").match(/(\d+)\s*:\s*(\d+)/);
  const ratio = ratioMatch
    ? `${ratioMatch[1]}:${ratioMatch[2]}`
    : stripGeneratorFlags(String(locked.ratio || "").replace(/--ar\s*/gi, ""));

  const elementsList = parseElements(locked.elements);
  const peopleEls = elementsList.filter((e) => isPersonFigureElement(e.name));
  const hasType = hasOverlayTypographyEvidence(locked);
  const sceneEls = elementsList.filter(
    (e) => !isPersonFigureElement(e.name) && !(hasType && sceneNameIsOverlayQuote(e.name, locked))
  );
  const layoutOut = formatSequencedLayout(scrubInternalIds(layout, peopleEls), peopleEls.map((e) => ({
    ...e,
    name: scrubInternalIds(e.name, peopleEls),
  })));

  const lines = [];
  if (style) {
    lines.push(`Style: ${style}`);
    if (weights.style === "strong") {
      lines.push(
        packLooksCharcoalSketch(locked)
          ? "Keep this medium/finish — charcoal/graphite sketch, not photoreal skin."
          : "Keep this medium/finish."
      );
    }
  }
  if (peopleEls.length) {
    const named = peopleEls.map((e) => ({ ...e, name: scrubInternalIds(e.name, peopleEls) }));
    const mece = formatMecePersonSections(named);
    if (mece.subject) lines.push(`Subject: ${mece.subject}`);
    if (mece.expression) lines.push(`Expression: ${mece.expression}`);
    if (mece.pose) lines.push(`Pose: ${mece.pose}`);
    if (mece.hair) lines.push(`Hair: ${mece.hair}`);
    if (mece.wardrobe) lines.push(`Wardrobe: ${mece.wardrobe}`);
  }
  if (layoutOut) {
    // Layout 只留人物+画幅；道具留给 Scene，避免复读
    const layoutForComp = layoutMinusSceneElements(layoutOut, sceneEls);
    if (layoutForComp) lines.push(`Layout: ${layoutForComp}`);
    if (weights.layout === "strong" && layoutForComp && peopleEls.length >= 2) {
      lines.push("Preserve the same composition, subject placement, and people count.");
    }
  }
  const lightSnippet = extractLightingLockSnippet(locked);
  if (lightSnippet) lines.push(`Lighting: ${lightSnippet}`);
  if (lightSnippet && camera) {
    camera = camera
      .replace(/\bdirectional key light(?: from camera-(?:left|right))?\b/gi, " ")
      .replace(/\bpreserve lighting ratio\b/gi, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();
  }
  if (sceneEls.length) {
    lines.push(
      `Scene: ${sceneEls
        .slice(0, 6)
        .map((e) => `${scrubInternalIds(e.name, peopleEls)} (${e.zone})`)
        .join("; ")}`
    );
  } else if (!peopleEls.length) {
    let leftover = stripSectionEchoFromPositive(locked.positive, {
      style,
      palette: locked.palette,
      camera,
      layout,
    });
    let inlineType = "";
    leftover = leftover.replace(
      /\bon-image type\s+(.+?),\s*preserve placement and hierarchy[,\s]*/i,
      (_, t) => {
        inlineType = String(t || "").trim();
        return "";
      }
    );
    leftover = leftover
      .replace(/\bWardrobe lock:\s*/gi, "")
      .replace(/\bpreserve lighting ratio\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();
    leftover = scrubInternalIds(leftover, peopleEls);
    leftover = softTrim(leftover, 1200);
    if (leftover) lines.push(`Subject: ${leftover}`);
    if (inlineType && !hasOverlayTypographyEvidence(locked)) {
      lines.push(`Type: ${inlineType}`);
    }
  }
  const typeSnippet = extractTypographyLockSnippet(locked);
  if (hasOverlayTypographyEvidence(locked) && typeSnippet) {
    lines.push(`Type: ${typeSnippet}`);
  }
  if (locked.palette) lines.push(`Palette: ${stripGeneratorFlags(locked.palette)}`);
  let exportNeg = locked.negative;
  if (hasType) {
    exportNeg = slimNegatives(
      String(exportNeg || "")
        .replace(/\bmovie title overlays?\b/gi, "")
        .replace(/\bcredit blocks?\b/gi, ""),
      180
    );
  }
  if (exportNeg) lines.push("", `Negative: ${softTrim(exportNeg, 180)}`);
  if (camera) {
    const camOut = stripPersonIdentityEcho(scrubInternalIds(camera, peopleEls), peopleEls);
    if (camOut) lines.push(`Camera: ${camOut}`);
  }
  if (motion) lines.push(`Motion: ${motion}`);
  if (Array.isArray(locked.shots) && locked.shots.length) {
    lines.push("", "[Shots]");
    for (const s of locked.shots) {
      const span = `${s.tStart.toFixed(1)}–${s.tEnd.toFixed(1)}s`;
      lines.push(`## Shot ${s.index} (${span})`);
      if (s.motion) lines.push(`Motion: ${stripGeneratorFlags(s.motion)}`);
      if (s.layout) lines.push(`Layout: ${stripGeneratorFlags(s.layout)}`);
      if (s.camera) lines.push(`Camera: ${stripGeneratorFlags(s.camera)}`);
      if (s.content) lines.push(`Content: ${stripGeneratorFlags(s.content)}`);
    }
  }
  if (ratio) lines.push(`Ratio: ${ratio}`);
  return lines.join("\n").trim();
}

/**
 * 姿态/关系约束：优先 pack.locks；一条覆盖坐站躺，不靠运动写真词表
 * @param {Record<string, boolean>|undefined} locks
 * @param {string} rosterBlob
 */
function gptPoseRelationConstraint(locks, rosterBlob) {
  const hasLocks = Boolean(locks && typeof locks === "object");
  const poseClass = hasLocks
    ? typeof locks.poseClass === "boolean"
      ? locks.poseClass
      : Boolean(locks.seated || locks.standing)
    : /\b(seated|sitting on|standing)\b/i.test(rosterBlob);
  const relation = hasLocks
    ? typeof locks.relation === "boolean"
      ? locks.relation
      : Boolean(locks.heldProp)
    : /\b(held in lap|held in|sat on by)\b/i.test(rosterBlob);
  if (!poseClass && !relation) return "";
  const keep = [];
  if (poseClass) keep.push("each figure's pose class");
  if (relation) keep.push("listed subject-object relations");
  const bans = [];
  if (poseClass) bans.push("swap seated↔standing or lying↔upright");
  if (relation) bans.push("detach related props");
  return `Preserve ${keep.join(" and ")} from the roster; do not ${bans.join(", or ")}.`;
}

/**
 * GPT Image 2 导出顺序：介质 → 脸/发/衣 → 裁切占幅 → 光 → 场景 → 色 → 约束 → 镜头/画幅
 * @param {object} pack
 * @param {{ style?: string, layout?: string, palette?: string, camera?: string, motion?: string }} [weights]
 */
export function formatGptImageBrief(pack, weights = {}) {
  // 不把 style/layout 前置进 positive；仍走 frontLoad 以合并短负向
  const locked = frontLoadLocks(pack, {
    style: "weak",
    layout: "weak",
    palette: "weak",
    camera: "weak",
    motion: weights.motion === "strong" ? "normal" : "weak",
  });
  const locks = locked.locks || pack?.locks;

  const styleRaw = stripGeneratorFlags(locked.style);
  const style = /^(other|unknown|none)$/i.test(String(styleRaw || "").trim()) ? "" : styleRaw;
  const positive = softTrim(stripGeneratorFlags(locked.positive), 900);
  const layout = stripGeneratorFlags(locked.layout);
  let camera = stripGeneratorFlags(locked.camera)
    .replace(/\bfully sharp flat 2D rendering\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
  const motion = stripGeneratorFlags(locked.motion);
  const elementsList = parseElements(locked.elements);

  const peopleEls = elementsList.filter((e) => isPersonFigureElement(e.name));
  const sceneEls = elementsList.filter(
    (e) => !isPersonFigureElement(e.name) && !sceneNameIsOverlayQuote(e.name, locked)
  );
  const hasReadableFace =
    locks && typeof locks.faceLight === "boolean" ? locks.faceLight : peopleEls.length > 0;

  const blob = `${style} ${positive} ${layout}`.toLowerCase();
  const exportFamily = resolveMediumFamily(`${style} ${positive} ${layout} ${locked.elements}`);
  // 浮雕/插画/漫画族禁止前置 photorealistic；含 anime/illustration 词也不锚写真
  const looksDrawnExport =
    exportFamily === "relief" ||
    exportFamily === "illustration2d" ||
    exportFamily === "comic" ||
    /\b(anime|manga|manhua|illustration|cel[-\s]?shad|ink line|2d illustration)\b/i.test(blob);
  const needsPhotorealAnchor =
    !looksDrawnExport &&
    /\b(photoreal|photograph|documentary still|live-action|dslr|cgi|film still)\b/.test(blob) &&
    !/\bphotorealistic\b/.test(blob);

  const phenoMatch = `${locked.positive} ${locked.elements} ${locked.layout}`.match(PHENOTYPE_APPEARANCE_RE);
  let phenoCue = phenoMatch ? phenoMatch[0] : "";
  // 表型只钉可读人脸；招牌语言或远景人影不算
  if (!hasReadableFace) phenoCue = "";

  // 从 positive 去掉已在分栏出现的介质/人种前缀，减少重复
  let contentBody = positive;
  if (style) {
    const styleEsc = style.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    contentBody = contentBody.replace(new RegExp(`^${styleEsc}[,\\s]*`, "i"), "");
  }
  if (phenoCue) {
    // 整段去掉「East Asian phenotype / facial features」，避免残留裸词 phenotype
    const cueEsc = phenoCue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    contentBody = contentBody
      .replace(
        new RegExp(
          `${cueEsc}(?:\\s*(?:facial\\s+)?(?:features|phenotype|appearance|look))?`,
          "gi"
        ),
        " "
      )
      .replace(PHENOTYPE_APPEARANCE_RE, " ")
      .replace(/\b(?:with\s+)?(?:facial\s+)?(?:features|phenotype|appearance)\b/gi, " ")
      .replace(/\bwith\s*,/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s]+|[,;\s]+$/g, "")
      .trim();
  }
  // 氛围等级单独成行，正文里去掉重复前缀
  contentBody = contentBody
    .replace(/\bdominant atmosphere grade:[^,.]*(?:\(NOT warm gold\))?[, ]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();

  const peopleNamed = peopleEls.map((e) => ({
    ...e,
    name: scrubInternalIds(e.name, peopleEls),
  }));
  const layoutOut = formatSequencedLayout(layout, peopleNamed);
  const sceneBits = sceneEls.slice(0, 6).map((e) => `${scrubInternalIds(e.name, peopleEls)} (${e.zone})`);

  const lines = [];

  // 1) 介质：只写一次；strong 时加短 Keep 句，不再复读整段 finish
  const lead = [];
  if (needsPhotorealAnchor) lead.push("photorealistic");
  if (style) lead.push(style);
  if (lead.length) lines.push(`${lead.join(", ")}.`);
  if (weights.style === "strong" && style) {
    lines.push(
      packLooksCharcoalSketch(locked)
        ? "Keep this medium/finish — charcoal/graphite sketch, not photoreal skin."
        : "Keep this medium/finish."
    );
  }

  // 2) 主体 MECE：身份 / 表情 / 姿态 / 发 / 衣（多人 Roster 前缀）
  if (peopleNamed.length || phenoCue || contentBody) {
    if (phenoCue) {
      lines.push(
        `Cast appearance: ${phenoCue} — keep this ethnicity/phenotype consistent for every visible person.`
      );
    }
    if (peopleNamed.length) {
      const mece = formatMecePersonSections(peopleNamed);
      const rosterPrefix = peopleNamed.length >= 2 ? "Roster (left-to-right / as listed): " : "";
      if (mece.subject) lines.push(`Subject: ${rosterPrefix}${mece.subject}.`);
      if (mece.expression) lines.push(`Expression: ${mece.expression}.`);
      if (mece.pose) lines.push(`Pose: ${mece.pose}.`);
      if (mece.hair) lines.push(`Hair: ${mece.hair}.`);
      if (mece.wardrobe) lines.push(`Wardrobe: ${mece.wardrobe}.`);
    }
    if (contentBody && !peopleNamed.length && (phenoCue || !sceneBits.length)) {
      lines.push(`Subject: ${/[.!?]$/.test(contentBody) ? contentBody : `${contentBody}.`}`);
    }
  }

  // 3) 构图：人物+画幅；道具进 Scene，两栏不复读
  const layoutForComp = layoutMinusSceneElements(layoutOut, sceneEls);
  if (layoutForComp) lines.push(`Composition: ${layoutForComp}.`);
  if (weights.layout === "strong" && layoutForComp && peopleNamed.length >= 2) {
    lines.push("Preserve the same composition, subject placement, and people count.");
  }

  // 4) 光
  const lightBlob = `${locked.positive} ${locked.style} ${locked.layout} ${locked.camera}`;
  const lightSnippet = extractLightingLockSnippet(locked);
  if (lightSnippet) {
    lines.push(`Lighting: ${lightSnippet}.`);
  }
  if (lightSnippet && camera) {
    camera = camera
      .replace(/\bdirectional key light(?: from camera-(?:left|right))?\b/gi, " ")
      .replace(/\bpreserve lighting ratio\b/gi, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();
  }

  // 5) 场景（非人物 elements；已从 Composition 剥离）
  if (sceneBits.length) {
    lines.push(`Scene: ${sceneBits.join("; ")}.`);
  } else if (contentBody && !peopleNamed.length) {
    lines.push(`Scene: ${/^[.!?]$/.test(contentBody) ? contentBody : `${contentBody}.`}`);
  }

  // 6) 氛围色 / 色板
  const gradeMatch = `${locked.style} ${locked.positive}`.match(
    /dominant atmosphere grade:\s*([^,.]+)/i
  );
  const atmoBlob = `${layout} ${positive} ${locked.style} ${locked.palette}`;
  const coolBlueBackdrop =
    /\b(blue|cool(?:\s+blue)?|cyan|灰蓝|蓝灰)\s+(?:backdrop|background|void|studio)\b/i.test(
      atmoBlob
    ) || /\bsoft[-\s]?focus blue\b/i.test(atmoBlob);
  if (gradeMatch) {
    let grade = gradeMatch[1].trim();
    if (coolBlueBackdrop && /\bwarm\s+red\b/i.test(grade)) {
      grade = "cool blue ambient sampled from reference";
    }
    lines.push(
      `Atmosphere grade: ${grade} — keep this ambient hue sampled from the reference; do not invent a different color grade.`
    );
  } else if (hasAtmosphereLightingEvidence(atmoBlob)) {
    lines.push(
      "Atmosphere grade: match the ambient light/haze hue visible in the reference image — do not invent a dramatic warm or cool grade."
    );
  }
  if (locked.palette) {
    const colorBits = paletteToPromptTokens(locked.palette) || locked.palette;
    lines.push(`Colors: ${colorBits}.`);
  }

  // 7) 排版
  const typeSnippet = extractTypographyLockSnippet(locked);
  const hasType = hasOverlayTypographyEvidence(locked);
  if (hasType && typeSnippet) {
    lines.push(`Type: ${typeSnippet}.`);
  }

  // 8) 约束（≤6；介质抗漂移优先于通用禁词）
  const gptMedium = detectMediumClass(locked);
  const MAX_GPT_CONSTRAINTS = 6;

  /** @type {string[]} */
  const constraints = [];
  if (locks?.faceCovered && constraints.length < MAX_GPT_CONSTRAINTS) {
    constraints.push(
      "Do not invent a visible face, scalp, or hair — keep the listed mask/helmet covering."
    );
  }
  // 介质漂移：学院写实炭笔→anime；漫画比例石墨不要禁 manga proportions
  const stylePosBlob = `${locked.style} ${locked.positive}`;
  const stylizedMangaGraphite =
    /\b(stylized\s+character\s+graphite|manga[-\s]?proportion|anime[-\s]?proportion|comic[-\s]?character)\b/i.test(
      stylePosBlob
    ) || /\b(manga|anime)\b/i.test(String(locked.style || "").split(",")[0] || "");
  if (
    /\b(charcoal|graphite|ink\s*wash|pencil\s*(?:sketch|drawing)|fine[-\s]?art\s*sketch)\b/i.test(
      stylePosBlob
    )
  ) {
    if (stylizedMangaGraphite) {
      constraints.push(
        "Do not: academic atelier life-drawing volume or photoreal graphite upgrade — keep stylized manga-proportion monochrome character graphite."
      );
    } else {
      constraints.push(
        "Do not: anime faces, manga proportions, or cel-shaded upgrade — keep realistic charcoal/graphite/ink-wash sketch finish."
      );
    }
  } else if (gptMedium === "watercolor") {
    constraints.push(
      "Do not: ghibli, anime cel, or digital-illustration upgrade — keep traditional watercolor on paper."
    );
  } else if (gptMedium === "flat") {
    constraints.push(
      "Do not: rearrange poster geometry, soft-painterly upgrade, or photoreal rendering."
    );
  } else if (gptMedium === "flash_photo" || hasFlashCaptureEvidence(lightBlob)) {
    constraints.push(
      "Do not: soft even lighting, soft bloom, or cinematic softbox upgrade — keep on-camera flash and hard cast shadow."
    );
  }
  const rosterBlob = `${locked.elements} ${locked.positive} ${locked.layout}`;
  if (peopleEls.length >= 2 && weights.layout !== "weak") {
    const faceBlob = peopleEls.map((e) => e.name).join(" ");
    const hasFront = /\bfront-facing\b/i.test(faceBlob);
    const hasTurned =
      /\b(?:back view|profile facing|profile view|three-quarter view)\b/i.test(faceBlob);
    let rosterLock = `Preserve exactly ${peopleEls.length} people left-to-right, zones, and facing from the roster — do not mirror swap sides`;
    if (hasFront) rosterLock += "; keep listed front-facing figures front-facing";
    if (hasTurned) {
      rosterLock += "; do not force turned or back-view figures to face the camera";
    }
    if (
      (locks && typeof locks.identityCues === "boolean"
        ? locks.identityCues
        : /\b(bald|shaved head|buzz(?:ed| cut)?|cropped|short hair|long hair|older|young(?:er)?|elderly|middle[-\s]?aged|child)\b/i.test(
            faceBlob
          ))
    ) {
      rosterLock +=
        "; preserve each person's age band, hair length/color (or bald), and eye color — do not swap or invert them";
    }
    constraints.push(`${rosterLock}.`);
  }
  if (locks?.frameCrop && constraints.length < MAX_GPT_CONSTRAINTS) {
    constraints.push(
      "Do not heal cropped body parts back into frame — keep the listed out-of-frame cuts."
    );
  }
  const poseLine = gptPoseRelationConstraint(locks, rosterBlob);
  if (poseLine && constraints.length < MAX_GPT_CONSTRAINTS) {
    constraints.push(poseLine);
  }
  const heightChart =
    /\b(height\s*ruler|height\s*scale|身高尺|刻度|cm\b|height\s*chart)\b/i.test(rosterBlob);
  if (heightChart && constraints.length < MAX_GPT_CONSTRAINTS) {
    constraints.push(
      "Preserve the vertical height ruler range/step and each figure's head-to-mark height; do not invent or swap cm labels."
    );
  }
  // 着装：编译写入 locks.wardrobe；无锁时只认 Wardrobe lock 字样
  const hasWardrobeLock =
    locks && typeof locks.wardrobe === "boolean"
      ? locks.wardrobe
      : /\bwardrobe lock\b/i.test(rosterBlob);
  if (hasWardrobeLock && constraints.length < MAX_GPT_CONSTRAINTS) {
    constraints.push(
      "Preserve each person's wardrobe from the roster (tops, bottoms, shoes, bags/jewelry); do not swap into different outfits."
    );
  }
  if (
    hasReadableFace &&
    !hasFlashCaptureEvidence(lightBlob) &&
    constraints.length < MAX_GPT_CONSTRAINTS
  ) {
    const hasRim =
      locks && typeof locks.backlightRim === "boolean"
        ? locks.backlightRim
        : hasBacklightRimEvidence(lightBlob);
    if (hasRim) {
      constraints.push(
        "Preserve backlit rim/halo on hair edges; do not flatten to front softbox or soft even fill."
      );
    } else if (hasProjectedShadowPatternEvidence(lightBlob)) {
      constraints.push(
        "Preserve the cast shadow pattern on skin; do not smooth into soft even light."
      );
    } else if (hasFaceLightingEvidence(lightBlob)) {
      if (locks?.highKey) {
        constraints.push(
          "Preserve high-key overexposed key and clipped whites on skin; do not rewrite as warm amber low-key fill."
        );
      } else {
        constraints.push(
          "Preserve face lighting ratio (key side / contrast / rim presence); do not flatten to soft even fill or invent rim light."
        );
      }
    } else if (locks?.highKey) {
      constraints.push(
        "Preserve high-key overexposed key and clipped whites on skin; do not rewrite as warm amber low-key fill."
      );
    }
  } else if (
    /\bsoft even(?:\s+(?:overcast\s+)?(?:daylight|lighting|fill|light))?\b/i.test(lightBlob) &&
    !hasProjectedShadowPatternEvidence(lightBlob) &&
    !hasFlashCaptureEvidence(lightBlob) &&
    constraints.length < MAX_GPT_CONSTRAINTS
  ) {
    constraints.push(
      "Preserve soft even / overcast lighting; do not invent window-blind slat shadows, dappled gobo, or split chiaroscuro."
    );
  }
  if (hasType && constraints.length < MAX_GPT_CONSTRAINTS) {
    constraints.push(
      "Preserve quoted on-image type (lettering family, weight, tracking, placement); do not rewrite cursive/handwritten as serif, or change typeface family."
    );
  }
  if (!hasType && constraints.length < MAX_GPT_CONSTRAINTS) {
    constraints.push("Do not add movie titles, credit blocks, or poster captions.");
  }
  if (phenoCue && constraints.length < MAX_GPT_CONSTRAINTS) {
    constraints.push("Do not change the cast ethnicity/phenotype.");
  }
  if (
    constraints.length < MAX_GPT_CONSTRAINTS &&
    OBJECT_FORM_TOKEN_RE.test(`${locked.positive} ${locked.elements}`)
  ) {
    constraints.push(
      "Do not swap object form-factors (mounting, silhouette, or subtype) away from the reference — keep each prop’s true form."
    );
  }
  if (constraints.length < MAX_GPT_CONSTRAINTS && hasAtmosphereLightingEvidence(atmoBlob)) {
    constraints.push("Do not invent a different atmosphere color grade than the reference image.");
  }
  // 截断到上限（介质约束已优先入队）
  if (constraints.length > MAX_GPT_CONSTRAINTS) constraints.length = MAX_GPT_CONSTRAINTS;
  const negItems = String(locked.negative || "")
    .split(/[,;]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const item of negItems) {
    if (constraints.length >= MAX_GPT_CONSTRAINTS) break;
    if (LOW_VALUE_NEGATIVE_RE.test(item)) continue;
    if (/wrong ethnicity|regional cast|watermark|aspect ratio/i.test(item)) continue;
    // 无字时 invent-title 已在约束里；有字时保留 extra caption / type weight 等负向
    if (
      !hasType &&
      /movie title|credit block|poster caption|extra (bottom )?caption/i.test(item)
    ) {
      continue;
    }
    if (hasType && /^(?:movie title(?: overlay)?|credit blocks?)$/i.test(item)) {
      continue;
    }
    const line = (() => {
      let body = String(item || "").trim();
      body = body.replace(/^(?:do not:?\s*)/i, "").trim();
      body = body.replace(/^avoid\s+/i, "").trim();
      if (!body) return "";
      const withPrefix = `Do not: ${body}`;
      return withPrefix.endsWith(".") ? withPrefix : `${withPrefix}.`;
    })();
    if (!line) continue;
    if (!constraints.some((c) => c.toLowerCase() === line.toLowerCase())) {
      constraints.push(line);
    }
  }
  if (constraints.length) {
    lines.push("");
    lines.push("Constraints:");
    for (const c of constraints) lines.push(`- ${c}`);
  }

  // 控制项：镜头 / 运动 / 画幅
  if (camera) {
    const camOut = stripPersonIdentityEcho(scrubInternalIds(camera, peopleEls), peopleNamed);
    if (camOut) lines.push(`Camera: ${camOut}.`);
  }
  if (motion) lines.push(`Motion: ${motion}.`);
  const ar = extractArToken(locked);
  const arMatch = ar.match(/(\d+)\s*:\s*(\d+)/);
  if (arMatch) {
    lines.push("");
    lines.push(`Frame: ${arMatch[1]}:${arMatch[2]} aspect ratio.`);
  } else if (locked.ratio) {
    const r = stripGeneratorFlags(String(locked.ratio).replace(/--ar\s*/gi, ""));
    if (r) {
      lines.push("");
      lines.push(`Frame: ${r}.`);
    }
  }

  if (Array.isArray(locked.shots) && locked.shots.length) {
    lines.push("");
    lines.push("Shots:");
    for (const s of locked.shots) {
      const span = `${s.tStart.toFixed(1)}–${s.tEnd.toFixed(1)}s`;
      lines.push(`- Shot ${s.index} (${span})${s.motion ? `: ${stripGeneratorFlags(s.motion)}` : ""}`);
      if (s.content) lines.push(`  Content: ${stripGeneratorFlags(s.content)}`);
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Kling 视频导出：单段可粘贴正向 + 运动/分镜摘要 + 可选负向
 * @param {object} pack
 * @param {{ style?: string, layout?: string, palette?: string, camera?: string, motion?: string }} [weights]
 */
export function formatKlingExport(pack, weights = {}) {
  const locked = frontLoadLocks(pack, {
    style: weights.style || "normal",
    layout: weights.layout || "normal",
    palette: weights.palette || "weak",
    camera: weights.camera || "normal",
    motion: weights.motion || weights.style || "strong",
  });

  const style = stripGeneratorFlags(locked.style);
  let positive = softTrim(
    stripGeneratorFlags(locked.positive.replace(/--ar\s*\d+\s*:\s*\d+/gi, "")),
    900
  );
  if (style && !alreadyContains(positive, style)) {
    positive = softTrim(`${style}, ${positive}`, 900);
  }

  const motion = stripGeneratorFlags(locked.motion);
  const camera = stripGeneratorFlags(locked.camera);
  const ratioMatch = String(locked.ratio || "").match(/(\d+)\s*:\s*(\d+)/);
  const ratio = ratioMatch ? `${ratioMatch[1]}:${ratioMatch[2]}` : "";

  /** @type {string[]} */
  const headBits = [];
  if (positive) headBits.push(positive);
  if (motion && !alreadyContains(positive, motion)) {
    headBits.push(`Camera/subject motion: ${softTrim(motion, 160)}`);
  } else if (camera && !alreadyContains(positive, camera)) {
    headBits.push(`Camera: ${softTrim(camera, 100)}`);
  }

  if (Array.isArray(locked.shots) && locked.shots.length) {
    const shotParts = locked.shots
      .slice(0, 3)
      .map((s) => {
        const m = softTrim(stripGeneratorFlags(s.motion || s.content || ""), 72);
        return m ? `Shot${s.index}: ${m}` : "";
      })
      .filter(Boolean);
    if (shotParts.length) headBits.push(shotParts.join("; "));
  }
  if (ratio) headBits.push(`aspect ratio ${ratio}`);

  const lines = [headBits.join(", ").replace(/,\s*,+/g, ",").trim()];
  if (locked.negative) {
    lines.push("", `Negative prompt: ${softTrim(locked.negative, 160)}`);
  }
  return lines.join("\n").trim();
}

/**
 * 万相视频导出：运动优先 + 紧预算正向 + 分镜摘要
 * @param {object} pack
 * @param {{ style?: string, layout?: string, palette?: string, camera?: string, motion?: string }} [weights]
 */
export function formatWanxVideoExport(pack, weights = {}) {
  const locked = frontLoadLocks(pack, {
    style: weights.style || "strong",
    layout: weights.layout || "normal",
    palette: weights.palette || "weak",
    camera: weights.camera || "normal",
    motion: weights.motion || "strong",
  });

  const motion = stripGeneratorFlags(locked.motion);
  let positive = stripGeneratorFlags(locked.positive.replace(/--ar\s*\d+\s*:\s*\d+/gi, ""));
  // 运动锁前置：弱视频模型常丢掉全局运动句
  if (motion && !alreadyContains(positive, motion)) {
    positive = `${softTrim(motion, 120)}, ${positive}`;
  }
  positive = softTrim(positive, 780);

  const lines = [positive];
  if (motion) lines.push("", `运动/镜头: ${softTrim(motion, 160)}`);
  if (Array.isArray(locked.shots) && locked.shots.length) {
    lines.push("分镜:");
    for (const s of locked.shots.slice(0, 4)) {
      const span = `${s.tStart.toFixed(1)}–${s.tEnd.toFixed(1)}s`;
      const m = softTrim(stripGeneratorFlags(s.motion || s.content || ""), 90);
      lines.push(`- 镜${s.index} (${span})${m ? `: ${m}` : ""}`);
    }
  }
  if (locked.negative) {
    lines.push("", `Negative: ${softTrim(locked.negative, 140)}`);
  }
  const ratioMatch = String(locked.ratio || "").match(/(\d+)\s*:\s*(\d+)/);
  if (ratioMatch) lines.push(`Ratio: ${ratioMatch[1]}:${ratioMatch[2]}`);
  return lines.join("\n").trim();
}

/**
 * Seedance（豆包视频）导出：运动/镜头优先 + 正向 + 分镜摘要
 * @param {object} pack
 * @param {{ style?: string, layout?: string, palette?: string, camera?: string, motion?: string }} [weights]
 */
export function formatSeedanceExport(pack, weights = {}) {
  const locked = frontLoadLocks(pack, {
    style: weights.style || "strong",
    layout: weights.layout || "normal",
    palette: weights.palette || "weak",
    camera: weights.camera || "normal",
    motion: weights.motion || "strong",
  });

  const motion = stripGeneratorFlags(locked.motion);
  const camera = stripGeneratorFlags(locked.camera);
  let positive = stripGeneratorFlags(locked.positive.replace(/--ar\s*\d+\s*:\s*\d+/gi, ""));
  if (motion && !alreadyContains(positive, motion)) {
    positive = `${softTrim(motion, 140)}, ${positive}`;
  }
  positive = softTrim(positive, 900);

  const lines = [positive];
  const motionBits = [];
  if (motion) motionBits.push(`Motion: ${softTrim(motion, 180)}`);
  if (camera && !alreadyContains(`${motion} ${positive}`, camera)) {
    motionBits.push(`Camera: ${softTrim(camera, 120)}`);
  }
  if (motionBits.length) lines.push("", motionBits.join("\n"));

  if (Array.isArray(locked.shots) && locked.shots.length) {
    lines.push("Shots:");
    for (const s of locked.shots.slice(0, 4)) {
      const span = `${s.tStart.toFixed(1)}–${s.tEnd.toFixed(1)}s`;
      const m = softTrim(stripGeneratorFlags(s.motion || s.content || ""), 100);
      lines.push(`- Shot ${s.index} (${span})${m ? `: ${m}` : ""}`);
    }
  }

  // Seedance 视频常见漂移：静态帧/闪烁/形变/文字水印，缺失时补一轮
  const negative = String(locked.negative || "");
  const seedanceAntiDrift = ["static frame", "flicker", "morphing", "watermark", "text overlay"]
    .filter((term) => !new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(negative))
    .join(", ");
  const finalNegative = [negative, seedanceAntiDrift].filter(Boolean).join(", ");
  if (finalNegative) lines.push("", `Negative: ${softTrim(finalNegative, 220)}`);

  const ratioMatch = String(locked.ratio || "").match(/(\d+)\s*:\s*(\d+)/);
  if (ratioMatch) lines.push(`Ratio: ${ratioMatch[1]}:${ratioMatch[2]}`);
  return lines.join("\n").trim();
}

/**
 * 按平台导出可粘贴文本
 * @param {object} pack
 * @param {{ platform?: keyof typeof EXPORT_PLATFORMS, weights?: { style?: string, layout?: string } }} [opts]
 */
export function formatPackForExport(pack, opts = {}) {
  const platform = EXPORT_PLATFORMS[opts.platform] ? opts.platform : "generic";
  const weights = opts.weights || {};

  if (platform === "gptImage") {
    return formatGptImageBrief(pack, weights);
  }

  if (platform === "kling") {
    return formatKlingExport(pack, weights);
  }

  if (platform === "wanxVideo") {
    return formatWanxVideoExport(pack, weights);
  }

  if (platform === "seedance") {
    return formatSeedanceExport(pack, weights);
  }

  // 通用 / Gemini / Seedream：分栏各写一次，禁止 frontLoad 再堆进 positive
  if (platform === "generic" || platform === "gemini" || platform === "seedream") {
    return formatSectionedExport(pack, weights);
  }

  if (platform === "midjourney") {
    const state = buildFrontLoadedState(pack, weights);
    const locked = state.pack;
    const medium = detectMediumClass(locked);
    const ar = extractArToken(locked);

    // 分段权重：strong 前置锁 ::1.4；normal 无标记；同段重复只保留一次
    const seenChunk = new Set();
    const parts = [];
    for (const chunk of state.chunks) {
      if (seenChunk.has(chunk.text)) continue;
      seenChunk.add(chunk.text);
      parts.push(chunk.strong ? `${chunk.text}::1.4` : chunk.text);
    }
    if (state.basePositive) parts.push(state.basePositive);
    let pos = parts.join(", ");
    pos = translateHexColors(pos.replace(/--ar\s*\d+\s*:\s*\d+/gi, "").trim().replace(/[,\s]+$/, ""));
    // MJ 对超长正向注意力衰减：上限 650，尾部裁剪、头部锁存活
    pos = softTrim(pos, 650);
    if (ar) pos = `${pos}, ${ar}`;
    // 摄影类介质关 MJ 默认美化；其余维持低 stylize
    const rawMedia =
      medium === "photo" ||
      medium === "flash_photo" ||
      medium === "cinematic" ||
      medium === "product";
    const flag = rawMedia
      ? " --style raw"
      : weights.style === "strong"
        ? " --stylize 50"
        : " --stylize 100";
    // --no 项数越多单份权重越稀：优先级精选，上限 5
    const no = pickMjNoItems(locked.negative, medium).join(", ");
    return no ? `${pos}${flag} --no ${no}` : `${pos}${flag}`;
  }

  const locked = frontLoadLocks(pack, weights);
  const ar = extractArToken(locked);

  if (platform === "flux" || platform === "wanx") {
    // 弱平台方言：介质硬锁前置；万相更紧预算，Flux 稍宽
    const dialected = applyWeakPlatformDialect(locked);
    const maxPos = platform === "wanx" ? 780 : 900;
    const maxNeg = platform === "wanx" ? 140 : 180;
    const posBody = translateHexColors(
      dialected.positive.replace(/--ar\s*\d+\s*:\s*\d+/gi, "").trim()
    );
    if (platform === "wanx") {
      // 万相支持原生负向：保留独立 Negative 行
      const pos = softTrim(posBody, maxPos);
      const lines = [pos];
      if (dialected.negative) {
        lines.push("", `Negative: ${softTrim(dialected.negative, maxNeg)}`);
      }
      return lines.join("\n").trim();
    }
    // Flux 无原生负向：折叠为正向尾部否定句；裁剪预算预留否定句，保证不被尾部截断
    const negSentence = buildFluxNegation(posBody, dialected.negative);
    const bodyBudget = negSentence ? Math.max(400, maxPos - negSentence.length) : maxPos;
    return `${softTrim(posBody, bodyBudget)}${negSentence}`;
  }

  return formatSectionedExport(pack, weights);
}

/** 复制单镜块（1-based index） */
export function formatShotForCopy(pack, shotIndex) {
  const p = normalizePack(pack);
  const s = p.shots.find((x) => x.index === Number(shotIndex));
  if (!s) return "";
  const span = `${s.tStart.toFixed(1)}–${s.tEnd.toFixed(1)}s`;
  const lines = [`## Shot ${s.index} (${span})`];
  if (s.motion) lines.push(`Motion: ${s.motion}`);
  if (s.layout) lines.push(`Layout: ${s.layout}`);
  if (s.camera) lines.push(`Camera: ${s.camera}`);
  if (s.content) lines.push(`Content: ${s.content}`);
  return lines.join("\n").trim();
}

/** 拼成一键复制全文（通用导出） */
export function formatPackForCopy(pack) {
  return formatPackForExport(pack, {
    platform: "generic",
    weights: { style: "normal", layout: "normal", palette: "normal", camera: "normal" },
  });
}

/**
 * 取图：dataUrl → fetch（带页面 Referer）→ 失败交由 SW 截图裁剪
 * @param {{ src?: string, dataUrl?: string, pageUrl?: string }} input
 * @param {{ maxEdge?: number, quality?: number, locale?: string }} [opts]
 */
export async function resolveImageDataUrl(input, opts = {}) {
  const maxEdge = opts.maxEdge ?? 1280;
  const quality = opts.quality ?? 0.85;
  const ui = normalizeLocale(opts.locale || DEFAULT_LOCALE);
  const src = input?.src || "";
  const pageUrl = input?.pageUrl || "";
  let dataUrl = input?.dataUrl || "";

  if (dataUrl.startsWith("data:")) {
    try {
      return await resizeDataUrl(dataUrl, maxEdge, quality);
    } catch {
      /* fall through */
    }
  }

  if (src && !src.startsWith("blob:")) {
    return await srcToDataUrl(src, maxEdge, quality, pageUrl, ui);
  }

  if (src.startsWith("blob:")) {
    throw new Error(t(ui, "err.blobNeedCapture"));
  }

  throw new Error(t(ui, "err.noImageUrl"));
}

/**
 * @param {string} src
 * @param {number} [maxEdge]
 * @param {number} [quality]
 * @param {string} [pageUrl]
 * @param {string} [locale]
 */
export async function srcToDataUrl(src, maxEdge = 1280, quality = 0.85, pageUrl = "", locale = DEFAULT_LOCALE) {
  const ui = normalizeLocale(locale);
  if (src.startsWith("data:")) {
    return resizeDataUrl(src, maxEdge, quality);
  }

  const attempts = [];
  if (pageUrl) {
    let origin = "";
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      /* ignore */
    }
    const headers = { Referer: pageUrl };
    if (origin) headers.Origin = origin;
    attempts.push({ cache: "no-cache", credentials: "omit", headers });
  }
  attempts.push({ cache: "force-cache", credentials: "omit" });
  attempts.push({ cache: "no-cache", credentials: "omit" });

  let lastErr = null;
  for (const init of attempts) {
    const { signal, cancel } = signalWithTimeout(REMOTE_IMAGE_TIMEOUT_MS);
    try {
      const res = await fetch(src, { ...init, signal });
      if (!res.ok) {
        lastErr = new Error(t(ui, "err.fetchHttp", { status: res.status }));
        continue;
      }
      const blob = await readResponseBlobGuarded(res, {
        maxBytes: REMOTE_IMAGE_MAX_BYTES,
        kind: "image",
        timeoutMs: REMOTE_IMAGE_TIMEOUT_MS,
        signal,
      });
      return await blobToDataUrl(blob, maxEdge, quality);
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      if (code === "SIZE_LIMIT") {
        lastErr = new Error(t(ui, "err.fetchTooLarge"));
      } else if (code === "MIME_REJECTED") {
        lastErr = new Error(t(ui, "err.fetchBadMime"));
      } else if (code === "TIMEOUT" || err?.name === "TimeoutError" || err?.name === "AbortError") {
        lastErr = new Error(t(ui, "err.fetchTimeout"));
      } else {
        lastErr = err instanceof Error ? err : new Error(String(err));
      }
    } finally {
      cancel();
    }
  }
  throw lastErr || new Error(t(ui, "err.fetchFail"));
}

/**
 * 从整页截图按视口矩形裁出目标图
 * @param {string} shotDataUrl
 * @param {{ x:number, y:number, width:number, height:number, devicePixelRatio?: number }} rect
 * @param {number} [maxEdge]
 * @param {number} [quality]
 * @param {string} [locale]
 */
export async function cropViewportShot(shotDataUrl, rect, maxEdge = 1280, quality = 0.85, locale = DEFAULT_LOCALE) {
  if (!shotDataUrl || !rect || rect.width < 2 || rect.height < 2) {
    throw new Error(t(normalizeLocale(locale), "err.cropInvalid"));
  }
  const dpr = rect.devicePixelRatio || 1;
  const blob = await (await fetch(shotDataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  let sx = Math.round(rect.x * dpr);
  let sy = Math.round(rect.y * dpr);
  let sw = Math.round(rect.width * dpr);
  let sh = Math.round(rect.height * dpr);

  sx = Math.max(0, Math.min(sx, bitmap.width - 1));
  sy = Math.max(0, Math.min(sy, bitmap.height - 1));
  sw = Math.max(1, Math.min(sw, bitmap.width - sx));
  sh = Math.max(1, Math.min(sh, bitmap.height - sy));

  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
  bitmap.close();

  const out = await canvas.convertToBlob({ type: "image/jpeg", quality });
  const buf = await out.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

export async function resizeDataUrl(dataUrl, maxEdge, quality = 0.72) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return blobToDataUrl(blob, maxEdge, quality);
}

async function blobToDataUrl(blob, maxEdge, quality) {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const keepAlpha = sourceLikelyHasAlpha(blob, head);
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // 有透明通道的 PNG/WebP 保留 PNG，避免 JPEG 压掉 alpha
  const out = keepAlpha
    ? await canvas.convertToBlob({ type: "image/png" })
    : await canvas.convertToBlob({ type: "image/jpeg", quality });
  const buf = await out.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const mime = keepAlpha ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${btoa(binary)}`;
}

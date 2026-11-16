/**
 * 期 3：由 canonical observation 确定性编译 Prompt Pack
 * 不做 medium 重分类、不做视觉恢复、不写库存负向
 */

import { normalizeMediumAxes } from "./medium-axes.js";
import { negativesForFamily } from "./fidelity-core.js";
import {
  coercePose,
  coerceArmPose,
  coerceBuild,
  coerceStature,
  coerceAgeBand,
  ageBandPhrase,
  coerceSpecies,
  coercePhenotype,
  coerceFacialHair,
  coerceFinishClass,
  coerceFinishTechnique,
  coerceFaceCover,
  coerceCrop,
  coerceShotScale,
  coerceFrameFocus,
  coercePaletteClimate,
  coerceLipFinish,
  coerceMouth,
  coerceBlush,
  coerceSkinFinish,
  coerceSkinTone,
  coerceSkinUndertone,
  namedIdentityFromGuess,
  celebrityNameFromGuess,
  coerceLightingKeySide,
  coerceLightSource,
  coerceLightQuality,
  coerceLightClimate,
  coerceCameraVantage,
  coerceLensFeel,
  coercePrimaryMass,
  coerceCompositionAnchor,
  coerceNegativeSpace,
  coerceDepthStack,
  coerceTypeLettering,
  coerceTypeWeight,
  isFaceCovered,
  frameFocusHidesMouth,
  cropHidesMouth,
  validateObservation,
  typographyHasScaleGlyphs,
  cropHidesLowerBody,
  shotScaleHidesLowerBody,
  scrubVagueAction,
  scrubVagueExpression,
} from "./observation-schema.js";

const ANGLE_PHRASE = {
  eye_level: "eye-level",
  high_angle: "high-angle looking down",
  low_angle: "low-angle looking up",
  top_down: "top-down bird's-eye",
  orthographic: "flat orthographic",
  unknown: "",
};

const LENS_FEEL_PHRASE = {
  ultra_wide: "20mm ultra-wide lens feel, exaggerated perspective foreshortening",
  wide: "wide-angle lens feel",
  normal: "normal lens feel",
  tele: "short-tele portrait lens feel",
  macro: "macro lens, extremely close working distance, shallow depth of field",
};

/** @param {object|null|undefined} camera */
export function cameraIsWormsEye(camera) {
  if (!camera || camera.confidence === "low") return false;
  if (String(camera.vantage || "") === "worms_eye") return true;
  return coerceCameraVantage("", camera.evidence) === "worms_eye";
}

const PRIMARY_MASS_PHRASE = {
  hips_lower: "hips and lower torso",
  bust_face: "face and bust",
  full_figure: "full figure",
  product: "product / device",
  type_band: "typography / title band",
  sky_void: "sky / void field",
  other: "dominant mass",
};

/**
 * bust_face 在特写里只写 face，避免叠出「胸像/头肩」
 * @param {string} mass
 * @param {object[]} [subjects]
 */
function primaryMassExportPhrase(mass, subjects = []) {
  if (mass === "bust_face") {
    const tight = (Array.isArray(subjects) ? subjects : []).some((s) => {
      const sc = coerceShotScale(s?.shot_scale);
      return sc === "extreme_closeup" || sc === "closeup";
    });
    return tight ? "face" : PRIMARY_MASS_PHRASE.bust_face;
  }
  return PRIMARY_MASS_PHRASE[mass] || "";
}

/**
 * @param {object|null|undefined} composition
 * @param {object[]} [subjects]
 * @returns {string}
 */
export function compositionSkeletonPhrase(composition, subjects = []) {
  if (!composition || composition.confidence === "low") return "";
  const mass = coercePrimaryMass(composition.primary_mass);
  const anchor = coerceCompositionAnchor(composition.anchor);
  const neg = coerceNegativeSpace(composition.negative_space);
  const stack = Array.isArray(composition.depth_stack)
    ? coerceDepthStack(composition.depth_stack)
    : [];
  if (!mass && !anchor && !neg && !stack.length) return "";
  /** @type {string[]} */
  const bits = [];
  if (mass) {
    const massBit = primaryMassExportPhrase(mass, subjects) || mass.replace(/_/g, " ");
    bits.push(
      anchor
        ? `primary mass: ${massBit} at ${anchor}`
        : `primary mass: ${massBit}`
    );
  } else if (anchor) {
    bits.push(`composition anchor at ${anchor}`);
  }
  if (neg && neg !== "none") {
    bits.push(
      neg === "upper"
        ? "large upper sky negative space"
        : `negative space toward ${neg}`
    );
  } else if (neg === "none") {
    bits.push("frame packed, no intentional negative space");
  }
  if (stack.length) {
    bits.push(`depth near→far: ${stack.map((t) => t.replace(/_/g, " ")).join(", ")}`);
  }
  return bits.join("; ");
}

const LIGHT_PHRASE = {
  blinds_slat: "window-blind slat shadows",
  dappled_foliage: "dappled foliage light",
  backlight_rim: "backlight rim",
  split_chiaroscuro: "split chiaroscuro key",
  directional: "directional key light",
  flash: "on-camera flash",
  soft_even: "soft even wrap, light open shadows",
  unknown: "",
};

const LIGHT_SOURCE_PHRASE = {
  studio: "controlled studio key",
  natural: "natural light",
  mixed: "mixed studio and natural light",
};

const LIGHT_QUALITY_PHRASE = {
  hard: "hard light with crisp shadow edges",
  soft: "soft diffused wrap",
};

const LIGHT_CLIMATE_PHRASE = {
  daylight: "neutral daylight climate",
  overcast: "overcast soft daylight climate",
  golden_hour: "golden-hour warm climate",
  cool_skylight: "cool skylight climate",
  tungsten: "warm tungsten climate",
};

const LIGHT_EXPOSURE_PHRASE = {
  high_key: "high-key bright airy exposure, near-clipped highlights on skin",
  low_key: "low-key shadow-dominant lighting",
  balanced: "",
};

const SKIN_TONE_PHRASE = {
  fair: "fair pale skin",
  light: "light skin",
  mid: "mid skin tone",
  tan: "tan bronzed skin",
  deep: "deep dark skin",
};

const SKIN_UNDERTONE_PHRASE = {
  cool: "cool pink undertone",
  warm: "warm golden undertone",
  neutral: "neutral undertone",
};

const FX_PHRASE = {
  motion_blur: "subject motion blur streak",
  double_exposure: "double-exposure ghost overlay",
  optical_bokeh: "optical background bokeh",
  volumetric_wrap: "volumetric atmosphere wrap",
  none: "",
  other: "graphic FX",
};

/** held/carried 闭集；leaning/worn/seated 不算 heldProp */
const HELD_PROP_RE =
  /\b(held|holding|carries|carried|carrying|gripped|gripping|in[-\s]?hand|in[-\s]?lap)\b/i;

/**
 * @param {object|null|undefined} lighting
 */
function lightingKeySideToken(lighting) {
  if (!lighting || lighting.confidence === "low") return "";
  const side = coerceLightingKeySide(lighting?.key_side, lighting?.evidence);
  if (side === "camera_right") return "camera-right";
  if (side === "camera_left") return "camera-left";
  if (side === "overhead") return "overhead";
  return "";
}

/** backlight_rim 下 key_side = 身后光源方位（非正面 key） */
function lightingIsBacklightRim(lighting) {
  return String(lighting?.pattern || "") === "backlight_rim" && lighting?.confidence !== "low";
}

/** 毛孔质感：禁止把 evidence 里的 soft 写成 beauty wrap */
function resolvedLightQuality(lighting, observation) {
  if (!lighting || lighting.confidence === "low") return "";
  const q = coerceLightQuality(lighting.quality) || coerceLightQuality(lighting.evidence);
  const textured = (Array.isArray(observation?.subjects) ? observation.subjects : []).some(
    (s) => coerceSkinFinish(s?.skin_finish) === "pore_detail"
  );
  if (textured && q === "soft") return "";
  return q;
}

/**
 * 光柱/rim 起源措辞：rim 模式用 upper-*-behind，侧光模式用 camera-*
 * @param {object|null|undefined} lighting
 */
function lightingShaftOriginPhrase(lighting) {
  const side = lightingKeySideToken(lighting);
  if (!side) return "";
  if (lightingIsBacklightRim(lighting)) {
    if (side === "camera-right") return "upper-right behind the subject";
    if (side === "camera-left") return "upper-left behind the subject";
    if (side === "overhead") return "overhead behind the subject";
  }
  return side;
}

function lightingPatternPhrase(observation) {
  if (!observation?.lighting?.pattern || observation.lighting.confidence === "low") return "";
  const lighting = observation.lighting;
  const pat = lighting.pattern;
  const base = LIGHT_PHRASE[pat] || "";
  if (!base) return "";
  const side = lightingKeySideToken(lighting);
  const source = coerceLightSource(lighting.source) || coerceLightSource(lighting.evidence);
  const quality = resolvedLightQuality(lighting, observation);
  const climate = coerceLightClimate(lighting.climate) || coerceLightClimate(lighting.evidence);
  const exp = String(lighting.exposure || "");
  const expBit = LIGHT_EXPOSURE_PHRASE[exp] || "";
  // directional / split 仅有 pattern、无方向与质量/光源/曝光 → 笼统，不输出
  if (
    (pat === "directional" || pat === "split_chiaroscuro") &&
    !side &&
    !source &&
    !quality &&
    !climate &&
    !expBit
  ) {
    return "";
  }
  let bit = base;
  // 逆光 rim：key_side = 身后方位；色温/光束只写已观察字段
  if (pat === "backlight_rim") {
    const origin = lightingShaftOriginPhrase(lighting) || "behind the subject";
    bit = `backlight rim from ${origin}, no frontal beauty key`;
    if (climate === "golden_hour") {
      bit = `golden ${bit}`;
    }
    if (lightingHasGodRays(lighting)) {
      bit = `${bit}, strong diagonal volumetric sunlight beams through atmospheric haze`;
    }
  } else if (side === "overhead" && (pat === "directional" || pat === "soft_even" || pat === "flash")) {
    // 顶光几何可推下巴投影；studio 只在光源已观察时写
    const studioBit = source === "studio" ? "studio " : "";
    bit =
      pat === "soft_even"
        ? `soft overhead ${studioBit}top key, under-chin open shadows`
        : `overhead ${studioBit}top key, under-chin shadows`;
    if (exp === "low_key" || pat === "directional") {
      bit = `${bit}, deep shadow falloff`;
    }
  } else if (
    side &&
    (pat === "directional" || pat === "split_chiaroscuro" || pat === "soft_even" || pat === "flash")
  ) {
    bit = `${base} from ${side}`;
  }
  const srcBit =
    source && !(side === "overhead" && source === "studio")
      ? LIGHT_SOURCE_PHRASE[source] || ""
      : "";
  // soft_even + soft 已含柔光语义，避免重复；overhead 短语已含 studio
  const qualBit =
    quality && !(pat === "soft_even" && quality === "soft") && !(side === "overhead" && quality === "soft")
      ? LIGHT_QUALITY_PHRASE[quality] || ""
      : "";
  const climBit = climate ? LIGHT_CLIMATE_PHRASE[climate] || "" : "";
  if (srcBit) bit = `${bit}, ${srcBit}`;
  if (qualBit) bit = `${bit}, ${qualBit}`;
  if (climBit) bit = `${bit}, ${climBit}`;
  if (expBit) bit = `${bit}, ${expBit}`;
  // 丁达尔光束：与 soft beauty flat 对锁；rim 短语已含光束时跳过
  if (lightingHasGodRays(lighting) && pat !== "backlight_rim") {
    const origin = lightingShaftOriginPhrase(lighting);
    const from = origin ? ` from ${origin}` : "";
    if (!/\b(god\s*rays?|light\s*shafts?|crepuscular|volumetric\s+sunlight\s+beams)\b/i.test(bit)) {
      bit = `${bit}, visible diagonal crepuscular god rays as bright light shafts cutting through haze${from}`;
    } else if (origin && !new RegExp(origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(bit)) {
      bit = `${bit}, shafts from ${origin}`;
    }
  }
  // 原图光句（色相/掠光/阴影）进 Pack，避免只剩闭集套话
  const seen = String(lighting.evidence || "")
    .replace(/;\s*key reveals skin texture/gi, "")
    .trim();
  if (seen && !bit.toLowerCase().includes(seen.slice(0, 18).toLowerCase())) {
    bit = `${bit}; ${seen}`;
  }
  return bit;
}

function skinTonePhrase(it) {
  if (isFaceCovered(it)) return "";
  const tone = coerceSkinTone(it?.skin_tone);
  const under = coerceSkinUndertone(it?.skin_undertone);
  const toneBit = tone ? SKIN_TONE_PHRASE[tone] || `${tone} skin` : "";
  const underBit = under ? SKIN_UNDERTONE_PHRASE[under] || `${under} undertone` : "";
  if (toneBit && underBit) return `${toneBit}, ${underBit}`;
  return toneBit || underBit;
}

function tidy(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
}

function observationHasSeatObject(observation) {
  const objs = Array.isArray(observation?.objects) ? observation.objects : [];
  return objs.some((o) => /\b(chairs?|thrones?|stools?|armchairs?|benches?|seats?)\b/i.test(String(o?.label || "")));
}

/**
 * 线稿可读时，finish/style 必须显式含 line art（避免只写 contour 却不落风格名）
 * @param {string} finish
 */
export function ensureLineArtInFinish(finish) {
  const f = String(finish || "").trim();
  if (!f) return f;
  if (/\b(line\s*arts?|linework|line\s*drawing|线稿|线描)\b/i.test(f)) {
    // 统一成 line art 词形，便于导出检索
    return f.replace(/\bline\s*arts?\b/gi, "line art").replace(/\b线稿\b/g, "line art");
  }
  if (
    /\b(ink\s+outlines?|contour\s+only|outline[-\s]?only|clean\s+(?:ink\s+)?contours?|sparse\s+(?:unfilled|fill)|unfilled|no\s+fill|线描|纯线)\b/i.test(
      f
    )
  ) {
    const parts = f.split(/,\s*/).filter(Boolean);
    if (!parts.length) return "line art";
    parts.splice(1, 0, "line art");
    return parts.join(", ");
  }
  return f;
}

/** finish 是否线稿主导 */
export function finishLooksLineArt(finish) {
  return /\b(line\s*arts?|linework|line\s*drawing|线稿|线描|contour\s+only|outline[-\s]?only|sparse\s+unfilled)\b/i.test(
    String(finish || "")
  );
}

export { coerceFinishTechnique };

/** finish 是否扁平角形卡通主导 */
export function finishLooksFlatCartoon(finish) {
  return /\b(flat\s+angular\s+cartoon|angular\s+(?:flat\s+)?cartoon|minimalist\s+(?:flat\s+)?cartoon|graphic\s+flat\s+cartoon|limited[-\s]?palette\s+cartoon|flat\s+vector\s+character|geometric\s+caricature|角形扁平|扁平卡通)\b/i.test(
    String(finish || "")
  );
}

/** 彩色排线图像小说（非美漫网点、非水墨书法） */
export const GRAPHIC_NOVEL_HATCH_HEAD =
  "painted, graphic novel ink, dense crosshatch, color wash";

export function finishLooksGraphicNovelHatch(finish) {
  const s = String(finish || "");
  if (!s.trim()) return false;
  if (
    /\b(american\s+superhero|superhero\s+comic|ben[-\s]?day|screentone|ink[-\s]?heavy)\b/i.test(s) ||
    /美漫|网点/.test(s)
  ) {
    return false;
  }
  if (/\b(sumi[-\s]?e|suibokuga|calligraphic\s+ink)\b/i.test(s) || /水墨|书法笔触/.test(s)) {
    return false;
  }
  if (
    /\b(cross[-\s]?hatch(?:ing)?|hatching|dense\s+hatch|ink[_\s-]?hatch|graphic\s+novel(?:\s+ink)?)\b/i.test(
      s
    )
  ) {
    return true;
  }
  // 水彩族误标：墨线 + 薄涂 + 点刻/飞白（排线未写进 finish 时）
  return (
    /\b(ink[_\s-]?lines?|ink_line|scratchy)\b/i.test(s) &&
    /\b(watercolor\s+wash|color\s+wash)\b/i.test(s) &&
    /\b(stippling|splatter|scratchy)\b/i.test(s)
  );
}

/**
 * 用技法桶重写 finish 头部；保留原 finish 中尚有用的尾部词
 * @param {string} finish
 * @param {unknown} technique
 * @param {string} [cues]
 */
export function applyFinishTechniqueBand(finish, technique, cues = "") {
  const tech = coerceFinishTechnique(technique);
  if (!tech || tech === "unknown") return ensureLineArtInFinish(finish);
  const cue = String(cues || "");
  const prev = String(finish || "").trim();
  const evidence = `${prev} ${cue}`;
  const colorHatch = finishLooksGraphicNovelHatch(evidence);
  /** @type {Record<string, string>} */
  const head = {
    line_art: "sketch, line art, clean outlines, sparse fill",
    hard_cel: "anime, hard cel, clean ink outlines, flat cel shadow bands",
    ink_print: /\b(superhero|bold\s+ink|ben[-\s]?day|美漫)\b/i.test(evidence)
      ? "manga, american superhero comic, bold ink outlines, crosshatch shadows"
      : /\b(ligne|clear\s+line|franco|bd|法漫)\b/i.test(evidence)
        ? "manga, franco-belgian ligne claire, clear even contour, flat color fills"
        : colorHatch
          ? GRAPHIC_NOVEL_HATCH_HEAD
          : "manga, ink-heavy, screentone texture, dense hatch",
    soft_color_draw: /\b(webtoon|vertical|条漫|韩漫)\b/i.test(cue)
      ? "manga, webtoon full-color, soft digital skin, cinematic panel lighting"
      : "anime, soft-shaded, clean character linework, soft gradient shading",
    tonal_sketch: /\b(academic|atelier|life[-\s]?draw|anatomy|学院)\b/i.test(cue)
      ? "sketch, academic refined graphite, smooth tonal modeling, controlled contour"
      : "sketch, stylized character graphite, manga-proportion face, clean character contour, soft graphite fill",
    painted: colorHatch ? GRAPHIC_NOVEL_HATCH_HEAD : "painted, soft digital paint, smooth blend",
    // 扁平角形卡通：禁止塌成 soft anime
    flat_cartoon:
      "other, flat angular cartoon, limited flat fills, bold uneven contour, geometric hair masses, minimal face shading",
  };
  const base = head[tech] || "";
  if (!prev) return ensureLineArtInFinish(base);
  // 去掉旧首词家族，保留未覆盖的细节 token
  const skip = new Set(
    `${base} ${tech} sketch anime manga painted other line art flat angular cartoon`
      .toLowerCase()
      .split(/[,\s]+/)
      .filter(Boolean)
  );
  const extras = prev
    .split(/,\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => {
      const low = p.toLowerCase();
      if (skip.has(low)) return false;
      if (base.toLowerCase().includes(low.slice(0, Math.min(12, low.length)))) return false;
      // flat_cartoon 时丢掉 anime 软阴影残留
      if (
        tech === "flat_cartoon" &&
        /\b(soft[-\s]?shaded|soft\s+gradient|anime|webtoon|hard\s+cel|semi[-\s]?realistic)\b/i.test(low)
      ) {
        return false;
      }
      // 彩色排线：丢掉软涂/赛璐璐残留
      if (
        colorHatch &&
        /\b(soft[-\s]?digital\s+paint|smooth\s+blend|airbrush|cel\s+shading|hard\s+cel|soft blended)\b/i.test(
          low
        )
      ) {
        return false;
      }
      return true;
    })
    .slice(0, 4);
  return ensureLineArtInFinish(extras.length ? `${base}, ${extras.join(", ")}` : base);
}

/**
 * 照片 style 的画面气质：气候 / 光型 / 色板，避免千篇一律的 controlled lighting
 * @param {object|null|undefined} observation
 * @returns {string[]}
 */
function photoLookTokens(observation) {
  /** @type {string[]} */
  const looks = [];
  const lighting = observation?.lighting;
  if (lighting && lighting.confidence !== "low") {
    const climate = coerceLightClimate(lighting.climate) || coerceLightClimate(lighting.evidence);
    if (climate === "golden_hour") looks.push("golden-hour warmth");
    else if (climate === "tungsten") looks.push("warm tungsten");
    else if (climate === "overcast") looks.push("overcast daylight");
    else if (climate === "cool_skylight") looks.push("cool skylight");
    const pat = String(lighting.pattern || "");
    if (pat === "backlight_rim") looks.push("backlit rim");
    else if (pat === "blinds_slat") looks.push("window-blind shadows");
    else if (pat === "dappled_foliage") looks.push("dappled daylight");
    else if (pat === "split_chiaroscuro") looks.push("chiaroscuro");
    const quality = coerceLightQuality(lighting.quality) || coerceLightQuality(lighting.evidence);
    if (quality === "hard" && pat !== "flash") looks.push("hard light");
    const exp = String(lighting.exposure || "");
    if (exp === "low_key") looks.push("low-key");
    else if (exp === "high_key") looks.push("high-key");
  }
  const pal = coercePaletteClimate(observation?.palette_climate);
  if (pal === "muted_antique") looks.push("muted antique");
  else if (pal === "desaturated") looks.push("desaturated");
  else if (pal === "warm_earthy") looks.push("warm earthy");
  else if (pal === "vivid") looks.push("vivid chroma");
  else if (pal === "neon") looks.push("neon");
  else if (pal === "monochrome") looks.push("monochrome");
  return looks;
}

/**
 * 只映射 canonical axes；不猜 medium、不因 mask 改 CGI、presentation 不进 style
 * @param {object|null|undefined} observation
 */
function styleFromObservation(observation) {
  const axes = normalizeMediumAxes(observation || {});
  const rf = axes.render_family;
  const cs = axes.capture_style;
  const finish = ensureLineArtInFinish(String(observation?.finish || "").trim());
  /** @type {string[]} */
  const parts = [];
  if (rf === "photo") {
    if (cs === "flash") parts.push("candid flash photograph", "hard flash", "snapshot grain");
    else if (cs === "cinematic") {
      parts.push("cinematic photograph", "filmic contrast");
      // volumetric 只在 lighting/fx 支持时进 positive，不因 capture 猜 natural/catalog light
      if (
        String(observation?.fx?.family || "") === "volumetric_wrap" &&
        observation?.fx?.confidence !== "low"
      ) {
        parts.push("volumetric light");
      }
    } else if (cs === "studio") {
      parts.push("photoreal studio photograph");
    } else if (cs === "product_shot") {
      parts.push("product photograph");
    } else if (cs === "documentary") {
      parts.push("documentary photograph");
    } else {
      parts.push("photoreal photograph");
    }
    const seen = new Set(parts.map((p) => p.toLowerCase()));
    for (const look of photoLookTokens(observation)) {
      const key = look.toLowerCase();
      if (seen.has(key) || parts.some((p) => p.toLowerCase().includes(key))) continue;
      seen.add(key);
      parts.push(look);
    }
  } else if (rf === "cgi") {
    // 有丁达尔时不要「干净美妆 CGI」抢戏
    if (lightingHasGodRays(observation?.lighting) || fxIsGodRaysMislabel(observation?.fx)) {
      parts.push("photoreal CGI", "atmospheric haze", "filmic volumetric light shafts");
    } else {
      parts.push("photoreal CGI");
    }
  } else if (rf === "illustration") {
    if (finish && !/^other$/i.test(finish)) parts.push(finish);
    else parts.push("2D illustration");
  } else if (rf === "flat_graphic") {
    // 角色扁平卡通：优先用 finish 细节，避免只剩 posterized fills
    if (finish && !/^other$/i.test(finish)) parts.push(finish);
    else parts.push("hard-edge flat graphic", "posterized fills");
  } else if (rf === "watercolor") {
    if (finishLooksGraphicNovelHatch(finish)) parts.push(finish);
    else parts.push("watercolor painting");
  } else if (rf === "infographic") {
    parts.push("flat infographic", "diagrammatic graphic");
  } else if (finish) {
    parts.push(finish);
  } else if (rf === "unknown") {
    // unknown 保持未知，不默认 illustration
    parts.push("unknown medium");
  }
  return tidy(parts.slice(0, rf === "photo" ? 6 : 5).join(", "));
}

/**
 * 负向只来自 render_family + finish class + canonical fx/light locks
 * @param {object|null|undefined} observation
 */
function baseNegatives(observation) {
  const axes = normalizeMediumAxes(observation || {});
  const rf = axes.render_family;
  const finishClass = coerceFinishClass(observation?.finish);
  /** @type {string[]} */
  const bans = [];
  if (axes.content_type === "ui" || axes.content_type === "infographic" || rf === "infographic") {
    bans.push("blurry text", "garbled UI", "distorted typography", "mangled layout");
  } else if (rf === "photo" || rf === "cgi") {
    bans.push("anime faces", "cel shading", "comic outlines", "watercolor bleed");
  } else if (rf === "illustration") {
    const antiAnime = [
      "anime faces",
      "manga proportions",
      "cel shading",
      "clean anime linework",
      "moe stylization",
      "photoreal CGI",
      "photorealistic skin",
      "smooth digital painting",
      "hyperdetailed pores",
      "3D render",
    ];
    const antiPhoto = [
      "photoreal CGI",
      "photorealistic skin",
      "live-action still",
      "cinematic film still",
      "Unreal Engine",
      "shallow DOF bokeh",
    ];
    if (finishClass === "sketch") {
      const finishLow = String(observation?.finish || "").toLowerCase();
      const finishSrc = String(observation?.finish || "");
      const stylizedMangaGraphite =
        /\b(stylized\s+character\s+graphite|manga[-\s]?proportion|anime[-\s]?proportion|comic[-\s]?character\s+graphite|character[-\s]?design\s+graphite)\b/.test(
          finishLow
        ) || /漫画比例|角色设定石墨|动漫比例石墨/.test(finishSrc);
      const lineArt = finishLooksLineArt(finishSrc) || finishLooksLineArt(ensureLineArtInFinish(finishSrc));
      if (lineArt) {
        bans.push(
          "soft blended shading",
          "painted soft fill",
          "photoreal skin",
          "heavy charcoal volume",
          "smooth tonal modeling fill",
          "oil paint fill",
          "photoreal CGI"
        );
      } else if (stylizedMangaGraphite) {
        // 漫画比例石墨：禁学院写生体块，不要禁 anime/manga 比例
        bans.push(
          "academic atelier life drawing",
          "volumetric academic anatomy study",
          "classical figure drawing volume",
          "near-photoreal graphite rendering",
          "hyperdetailed photoreal graphite",
          "warm living skin",
          "photoreal CGI",
          "photorealistic skin",
          "3D render"
        );
      } else {
        bans.push(
          ...antiAnime,
          "soft blended shading",
          "smooth digital painting",
          "warm living skin",
          "painted illustration rewrite"
        );
      }
      // 精细/学院素描：禁止塌成粗糙乱线素描
      if (
        /\b(academic|refined|atelier|fine[-\s]?art|neoclassical|hyperdetailed|photoreal(?:istic)?\s+graphite|near[-\s]?photoreal|smooth\s+tonal|controlled\s+contour|precise\s+anatom)\b/.test(
          finishLow
        ) ||
        /学院|精细|细致|照片级|写实铅笔|精细炭笔/.test(finishSrc)
      ) {
        if (!stylizedMangaGraphite) {
          bans.push(
            "rough gestural scribble",
            "crude charcoal scrawl",
            "loose unfinished sketch only",
            "messy sketchy linework"
          );
        }
      }
      // 漫画比例石墨：再钉一次禁学院升级
      if (stylizedMangaGraphite) {
        bans.push(
          "polished academic atelier finish",
          "realistic life-drawing proportions"
        );
      }
      // 粗糙草稿：禁止抬成照片级石墨
      if (
        /\b(rough|gestural|loose\s+construction|quick\s+sketch|scribble|unfinished\s+construction)\b/.test(
          finishLow
        ) ||
        /粗糙|速写乱线|未完成草稿/.test(finishSrc)
      ) {
        bans.push("hyperdetailed photoreal graphite", "polished academic atelier finish");
      }
    } else if (finishClass === "anime" || finishClass === "manga") {
      bans.push(...antiPhoto);
      const finishLow = String(observation?.finish || "").toLowerCase();
      const finishSrc = String(observation?.finish || "");
      if (finishLooksLineArt(finishSrc) || finishLooksLineArt(ensureLineArtInFinish(finishSrc))) {
        bans.push(
          "soft blended shading",
          "painted soft fill",
          "photoreal skin",
          "heavy charcoal volume",
          "smooth tonal modeling fill"
        );
      }
      if (/\b(hard\s+cel|flat\s+cel|cel\s+shadow\s+bands)\b/.test(finishLow)) {
        bans.push("soft airbrush anime shading", "semi-realistic soft blend", "webtoon soft skin");
      }
      if (/\b(soft[-\s]?shaded|soft\s+gradient)\b/.test(finishLow)) {
        bans.push("hard flat cel bands only", "screentone manga rewrite");
      }
      if (/\b(ink[-\s]?heavy|screentone|dense\s+hatch)\b/.test(finishLow)) {
        bans.push("webtoon soft skin", "full-color vertical comic", "soft digital webtoon");
      }
      if (/\b(webtoon|vertical\s+scroll|full[-\s]?color\s+vertical)\b/.test(finishLow) || /条漫|韩漫/.test(finishSrc)) {
        bans.push(
          "screentone",
          "black-and-white manga",
          "B&W manga",
          "ink-heavy hatch only",
          "hard flat cel bands only"
        );
      }
      if (/\b(shojo|shoujo)\b/.test(finishLow) || /少女漫画/.test(finishSrc)) {
        bans.push("hard flat cel bands", "shonen speed lines", "superhero crosshatch");
      }
      if (/\b(shonen|shounen|speed\s+lines?|impact\s+fram)\b/.test(finishLow) || /少年漫画/.test(finishSrc)) {
        bans.push("shojo sparkling eyes", "decorative flower screentone", "webtoon soft skin");
      }
      if (/\b(seinen|josei|heavy\s+crosshatch)\b/.test(finishLow) || /青年漫画|女性向剧情漫/.test(finishSrc)) {
        bans.push("chibi gag proportions", "shojo sparkling eyes", "hard flat cel bands only");
      }
      if (/\b(gag|chibi|four[-\s]?panel|yonkoma)\b/.test(finishLow) || /四格|Q版/.test(finishSrc)) {
        bans.push("seinen heavy crosshatch", "photoreal anatomy", "webtoon cinematic lighting");
      }
      if (
        /\b(american\s+superhero|superhero\s+comic|bold\s+ink|ben[-\s]?day)\b/.test(finishLow) ||
        /美漫|英雄漫画/.test(finishSrc)
      ) {
        bans.push("webtoon soft skin", "soft digital webtoon", "anime soft gradient", "shojo sparkling eyes");
      }
      if (
        /\b(ligne\s+claire|franco[-\s]?belgian|\bbd\b|clear\s+line)\b/.test(finishLow) ||
        /法漫|清线/.test(finishSrc)
      ) {
        bans.push("anime soft gradient", "screentone B&W", "webtoon soft skin", "heavy crosshatch comic");
      }
    } else if (finishClass === "painted") {
      bans.push("anime faces", "cel shading", "photoreal CGI", "shallow DOF bokeh");
      const finishLow = String(observation?.finish || "").toLowerCase();
      if (/\b(oil|impasto)\b/.test(finishLow)) {
        bans.push(
          "flat digital airbrush only",
          "matte gouache poster fill",
          "sparse sumi-e paper white",
          "calligraphic ink splash only"
        );
      }
      if (/\b(gouache|poster\s+paint|flat\s+opaque)\b/.test(finishLow)) {
        bans.push("oil impasto ridges", "soft airbrush overblend");
      }
      if (/\b(soft\s+digital|airbrush)\b/.test(finishLow)) {
        bans.push("thick oil impasto", "visible dry-brush ridges", "sumi-e calligraphic ink splash");
      }
      if (/\b(sumi[-\s]?e|suibokuga|ink[-\s]?wash|calligraphic\s+ink|ink\s+splash)\b/.test(finishLow) || /水墨|泼墨/.test(String(observation?.finish || ""))) {
        bans.push(
          "thick oil impasto ridges",
          "warm opaque oil body paint",
          "soft airbrush overblend",
          "swirling impasto oil vortex background"
        );
      }
      if (/\b(painterly|speed[-\s]?paint)\b/.test(finishLow) && !/\b(sumi|ink[-\s]?wash)\b/.test(finishLow)) {
        bans.push("flat cel bands", "soft airbrush only", "sparse calligraphic ink void");
      }
      if (finishLooksGraphicNovelHatch(String(observation?.finish || ""))) {
        bans.push(
          "soft digital paint",
          "smooth blend",
          "airbrush skin",
          "B&W screentone",
          "american superhero bold ink",
          "oil impasto ridges"
        );
      }
    } else {
      // other / unknown finish — 扁平卡通对锁 anime
      bans.push("photoreal CGI", "cinematic film still", "shallow DOF bokeh");
      const finishSrc = String(observation?.finish || "");
      if (finishLooksFlatCartoon(finishSrc)) {
        bans.push(
          "anime soft gradient",
          "semi-realistic anime",
          "detailed iris eyes",
          "strand-by-strand hair",
          "soft cel face shading",
          "moe anime face",
          "webtoon soft skin"
        );
      }
    }
  } else if (rf === "flat_graphic" || rf === "infographic") {
    bans.push("photoreal skin", "soft painterly blend", "shallow bokeh");
    const finishSrc = String(observation?.finish || "");
    if (finishLooksFlatCartoon(finishSrc) || /\b(angular\s+cartoon|geometric\s+hair|limited\s+flat)\b/i.test(finishSrc)) {
      bans.push(
        "anime soft gradient",
        "semi-realistic anime",
        "detailed iris eyes",
        "strand-by-strand hair",
        "soft cel face shading",
        "moe anime face",
        "webtoon soft skin",
        "painterly digital skin"
      );
    }
  } else if (rf === "watercolor") {
    bans.push("hard vector edges", "anime cel", "octane render");
    if (finishLooksGraphicNovelHatch(String(observation?.finish || ""))) {
      bans.push("soft digital paint", "smooth blend", "B&W screentone");
    }
  }
  // low-confidence FX 不进负向
  const fx = observation?.fx?.confidence !== "low" ? observation?.fx?.family : "";
  if (fx === "motion_blur") bans.push("optical bokeh circles", "double exposure ghost");
  if (fx === "optical_bokeh") bans.push("subject motion streak", "double exposure");
  if (fx === "double_exposure") bans.push("motion blur streak", "shallow DOF bokeh only");
  if (fx === "volumetric_wrap") bans.push("flat pasted cutout", "smoke only as solid backdrop");
  const keySide = lightingKeySideToken(observation?.lighting);
  if (lightingIsBacklightRim(observation?.lighting)) {
    bans.push("frontal beauty key", "soft front fill key", "Rembrandt side key only");
    if (keySide === "camera-right") bans.push("beauty key from camera-right", "frontal key from camera-right");
    if (keySide === "camera-left") bans.push("beauty key from camera-left", "frontal key from camera-left");
  } else {
    if (keySide === "camera-right") bans.push("key light from camera-left");
    if (keySide === "camera-left") bans.push("key light from camera-right");
  }
  return tidy(bans.join(", "));
}

/**
 * 语法级清洗（不做语义推断；不做 120 字符截断）
 * @param {object} pack
 */
export function lightNormalizePack(pack = {}) {
  const out = {
    elements: tidy(pack.elements),
    positive: tidy(pack.positive),
    negative: tidy(pack.negative),
    style: tidy(pack.style),
    layout: tidy(pack.layout),
    palette: tidy(pack.palette),
    camera: tidy(pack.camera),
    ratio: tidy(pack.ratio),
    motion: tidy(pack.motion),
    shots: Array.isArray(pack.shots) ? pack.shots : undefined,
  };
  const locks = copyPackLocks(pack);
  if (locks) out.locks = locks;
  return out;
}

const PACK_LOCK_KEYS = [
  "seated",
  "standing",
  "poseClass",
  "heldProp",
  "relation",
  "wardrobe",
  "attachedPrint",
  "overlayType",
  "identityCues",
  "frameCrop",
  "faceLight",
  "backlightRim",
  "highKey",
  "faceCovered",
];

/**
 * @param {object} [pack]
 * @returns {Record<string, boolean>|undefined}
 */
export function copyPackLocks(pack) {
  const src = pack?.locks;
  if (!src || typeof src !== "object") return undefined;
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const k of PACK_LOCK_KEYS) {
    if (typeof src[k] === "boolean") out[k] = src[k];
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * 写入比例；已有旧 --ar 则 replace
 * @param {object} pack
 * @param {{ ratioLine?: string, promptToken?: string, w?: number, h?: number }|null|undefined} ratioMeta
 */
export function applyRatioLight(pack, ratioMeta) {
  const next = lightNormalizePack(pack);
  if (!ratioMeta) return next;
  const ratioLine = ratioMeta.ratioLine || next.ratio;
  if (ratioLine) next.ratio = ratioLine;
  const token = ratioMeta.promptToken;
  if (!token) return next;
  let pos = next.positive || "";
  if (/--ar\s*\d+\s*:\s*\d+/i.test(pos)) {
    pos = pos.replace(/--ar\s*\d+\s*:\s*\d+/gi, token);
  } else if (pos) {
    pos = `${pos}, ${token}`;
  } else {
    pos = token;
  }
  next.positive = tidy(pos);
  return next;
}

/**
 * 只解析 placement 字段；缺失 → ""；保留 full-height/full-width；profile-left 不翻左右
 * @param {unknown} raw
 */
export function normalizePlacementZone(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (!s) return "";
  if (/full[-\s]?height[-\s]?left/.test(s)) return "full-height-left";
  if (/full[-\s]?height[-\s]?right/.test(s)) return "full-height-right";
  if (/full[-\s]?height/.test(s)) return "full-height-center";
  if (/full[-\s]?width[-\s]?upper|full[-\s]?width[-\s]?top/.test(s)) return "full-width-upper";
  if (/full[-\s]?width[-\s]?lower|full[-\s]?width[-\s]?bottom/.test(s)) return "full-width-lower";
  if (/full[-\s]?width/.test(s)) return "full-width-mid";
  const hasLR = /\bleft|左侧|左边|right|右侧|右边\b/.test(s);
  const hasUD = /\b(upper|top|上方|lower|bottom|下方|mid|middle|center|centre|中)\b/.test(s);
  if (!hasLR && !hasUD) return "";
  const lr = /\bleft|左侧|左边\b/.test(s) ? "left" : /\bright|右侧|右边\b/.test(s) ? "right" : "center";
  const ud = /\b(upper|top|上方)\b/.test(s)
    ? "upper"
    : /\b(lower|bottom|下方)\b/.test(s)
      ? "lower"
      : "mid";
  return `${ud}-${lr}`;
}

function stripLayerWords(raw) {
  return String(raw || "")
    .replace(/\bbackgrounds?\b/gi, " ")
    .replace(/\bforegrounds?\b/gi, " ")
    .replace(/\bbackdrops?\b/gi, " ");
}

function parseFacingText(raw) {
  const s = stripLayerWords(raw).toLowerCase();
  if (!s.trim()) return "";
  if (/profile[-\s]?left|facing\s*left|look(?:ing)?\s*left|朝左|左侧脸/.test(s)) return "profile facing left";
  if (/profile[-\s]?right|facing\s*right|look(?:ing)?\s*right|朝右|右侧脸/.test(s)) return "profile facing right";
  if (/three[-\s]?quarter/.test(s)) return "three-quarter view";
  if (/\bback(?:[-\s]?view)?\b|背面|背对/.test(s)) return "back view";
  if (/\bprofile\b/.test(s)) return "profile view";
  if (/\bfront(?:[-\s]?facing)?\b|正面|facing\s*(?:camera|forward)/.test(s)) return "front-facing";
  return "";
}

/**
 * 优先 facing 字段；字段空时才回退 label
 * @param {unknown} facing
 * @param {string} [label]
 */
export function facingPhrase(facing, label = "") {
  return parseFacingText(facing) || parseFacingText(label);
}

/** 坐/站/环抱等可读姿态 → 导出短句 */
const POSE_EXPORT_PHRASE = {
  seated: "seated",
  standing: "standing",
  kneeling: "kneeling",
  lying: "lying",
  leaning: "leaning",
  crouching: "crouching",
  hugging: "self-embracing hug, arms wrapped around torso and prop, head bowed",
  hunched: "hunched over, head bowed inward",
  riding: "riding",
  walking: "walking",
  airborne: "airborne",
};

export function posePhrase(pose, label = "") {
  const p = coercePose(pose) || coercePose(label);
  if (!p) return "";
  return POSE_EXPORT_PHRASE[p] || p;
}

/**
 * 半身/特写不写 standing/walking（下半身不可见时禁止发明站姿）
 * @param {object} s
 */
export function subjectPosePhrase(s) {
  const pose = posePhrase(s?.pose, s?.label);
  if (!pose) return "";
  const scale = coerceShotScale(s?.shot_scale);
  const hidesLegs =
    shotScaleHidesLowerBody(scale) ||
    cropHidesLowerBody(s?.crop) ||
    scale === "bust" ||
    scale === "closeup" ||
    scale === "extreme_closeup" ||
    scale === "waist";
  if (hidesLegs && /^(standing|walking)$/i.test(pose)) return "";
  return pose;
}

const ARM_POSE_EXPORT_PHRASE = {
  at_sides: "arms at sides",
  crossed: "arms crossed over chest",
  behind_back: "hands clasped behind back",
  on_hips: "hands on hips",
  clasped_front: "hands clasped in front",
  raised: "hand raised",
  in_pockets: "hands in pockets",
  drawing_weapon: "mid-draw weapon grip at hip",
  two_hand_grip: "both hands on weapon hilt",
  one_hand_weapon: "one hand on weapon hilt",
};

/** @param {unknown} armPose */
export function armPosePhrase(armPose, label = "") {
  const a = coerceArmPose(armPose) || coerceArmPose(label);
  if (!a) return "";
  return ARM_POSE_EXPORT_PHRASE[a] || a.replace(/_/g, " ");
}

/**
 * action 已写清手脚时跳过粗粒度 arm_pose，避免 "hand raised" vs "both fists" 打架
 * @param {unknown} action
 * @param {string} armPhrase
 */
export function armPoseCoveredByAction(action, armPhrase) {
  const a = String(action || "").trim();
  if (!a || isBlankCue(a)) return false;
  const arm = String(armPhrase || "").trim().toLowerCase();
  const al = a.toLowerCase();
  if (
    !/\b(fists?|hands?\b|arms?\b|elbows?|wrists?|palms?|grip|clenched|raised to|at chest|behind|crossed|pockets|hips|weapon|hilt|draw)\b/i.test(
      a
    )
  ) {
    return false;
  }
  if (
    /^(hand raised|arms at sides|arms crossed|hands clasped|hands on hips|hands in pockets|mid-draw|both hands on|one hand on)/i.test(
      arm
    )
  ) {
    return true;
  }
  if (arm && al.includes(arm.slice(0, Math.min(14, arm.length)))) return true;
  return false;
}

/** @param {string} bit @param {object} s */
function withArmPose(bit, s) {
  if (shotHidesArms(s)) return bit;
  const arm = armPosePhrase(s?.arm_pose, s?.label);
  if (!arm) return bit;
  if (armPoseCoveredByAction(s?.action, arm)) return bit;
  if (new RegExp(arm.replace(/\s+/g, "\\s+"), "i").test(String(bit || ""))) return bit;
  return bit ? `${bit}, ${arm}` : arm;
}

/**
 * 去掉称呼里的粗粒度年龄词，避免与十岁段短语叠写
 * @param {string} who
 */
function stripVagueAgeWords(who) {
  return String(who || "")
    .replace(/\b(young(?:er)?|old(?:er)?|middle[-\s]?aged|elderly|aged)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
}

/**
 * 布局/镜头用短称呼，完整身份只在 elements / Subject
 * @param {object} s
 * @param {{ useCelebrityName?: boolean, includeAnimeCharacter?: boolean }} [opts]
 */
function shortWhoCue(s, opts = {}) {
  if (!s) return "figure";
  const covered = isFaceCovered(s);
  const celeb = !covered
    ? namedIdentityFromGuess(s?.identity_guess, {
        useCelebrityName: Boolean(opts.useCelebrityName),
        includeAnimeCharacter: Boolean(opts.includeAnimeCharacter),
      })
    : "";
  const age = ageBandPhrase(s?.age);
  let who = celeb || String(s?.label || "figure").split(/[,，]/)[0].trim() || "figure";
  if (age) who = stripVagueAgeWords(who) || who;
  if (age && !who.toLowerCase().includes(age.toLowerCase())) who = `${age} ${who}`;
  return who;
}

/** @param {string} bit @param {object} s */
function withAction(bit, s) {
  const action = scrubVagueAction(s?.action);
  if (!action || isBlankCue(action)) return bit;
  const needle = action.slice(0, 28).toLowerCase();
  if (String(bit || "").toLowerCase().includes(needle)) return bit;
  return bit ? `${bit}, ${action}` : action;
}

const ATTACHED_TYPE_ROLES = new Set(["garment_print", "prop_print"]);
const OVERLAY_TYPE_ROLES = new Set(["title", "caption", "logo"]);

const LETTERING_PHRASE = {
  sans: "sans-serif lettering",
  serif: "serif lettering",
  script: "cursive handwritten script lettering",
  display: "decorative display lettering",
  mono: "monospace lettering",
};

/**
 * 叠字字体族 + 字重锁（OCR 之外必须带上，否则生成器会默认装饰衬线）
 * @param {object} t
 */
function overlayLetteringBits(t) {
  const lettering =
    coerceTypeLettering(t?.lettering) ||
    coerceTypeLettering(`${t?.evidence || ""} ${t?.script || ""}`);
  const weight = coerceTypeWeight(t?.weight) || coerceTypeWeight(t?.evidence);
  /** @type {string[]} */
  const bits = [];
  if (lettering && LETTERING_PHRASE[lettering]) bits.push(LETTERING_PHRASE[lettering]);
  if (weight === "thin" || weight === "regular" || weight === "bold" || weight === "black") {
    bits.push(`${weight} weight`);
  }
  return { lettering, weight, bits };
}

/**
 * @param {object} t
 * @param {{ zoneStyle?: "paren"|"at"|"" }} [opts]
 */
function overlayTypePhrase(t, opts = {}) {
  const zone = normalizePlacementZone(t?.placement);
  const { bits } = overlayLetteringBits(t);
  let head = `text "${t.text}"`;
  if (opts.zoneStyle === "paren" && zone) head = `text "${t.text}" (${zone})`;
  else if (opts.zoneStyle === "at" && zone) head = `text "${t.text}" at ${zone}`;
  return [head, ...bits].join(", ");
}

function normalizeTypeRole(role) {
  return String(role || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function hostByOn(onId, subjects = [], objects = []) {
  const id = String(onId || "").trim();
  if (!id || /^(null|none|unknown|n\/a)$/i.test(id)) return null;
  return (
    subjects.find((s) => String(s?.id || "") === id) ||
    objects.find((o) => String(o?.id || "") === id) ||
    null
  );
}

/**
 * 先验证 role，再验证 host
 * @returns {"attached"|"overlay"|"drop"}
 */
export function classifyTypographyItem(item, subjects = [], objects = []) {
  const role = normalizeTypeRole(item?.role);
  if (role === "garment_print") {
    const host = hostByOn(item?.on, subjects, []);
    return host ? "attached" : "drop";
  }
  if (role === "prop_print") {
    const host = hostByOn(item?.on, [], objects);
    return host ? "attached" : "drop";
  }
  if (OVERLAY_TYPE_ROLES.has(role)) {
    if (item?.on && !hostByOn(item.on, subjects, objects)) return "drop";
    const text = String(item?.text || "").trim();
    const ev = String(item?.evidence || item?.placement || "").toLowerCase();
    // 宿主查看器角标 / AI modified 等非画面字
    if (isHostUiChromeText(text) || isHostUiChromeText(ev)) return "drop";
    // micro-mark 仅在角落/示意图证据时丢弃
    if (
      /^(?=[A-Za-z0-9]{1,2}$)(?=.*[A-Za-z])/i.test(text) &&
      /\b(corner|schematic|角标|watermark)\b/.test(ev)
    ) {
      return "drop";
    }
    return "overlay";
  }
  return "drop";
}

function foldAttachedPrints(subjects, objects, typeItems) {
  const nextS = subjects.map((s) => ({ ...s }));
  const nextO = objects.map((o) => ({ ...o }));
  for (const t of typeItems) {
    if (classifyTypographyItem(t, nextS, nextO) !== "attached") continue;
    const host = hostByOn(t?.on, nextS, nextO);
    if (!host) continue;
    const text = String(t?.text || "").trim();
    if (!text) continue;
    const esc = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(esc, "i").test(`${host.wardrobe || ""} ${host.label || ""}`)) continue;
    const asPerson = nextS.includes(host);
    if (asPerson) {
      // 胸前印字但无上衣词时补 jersey/shirt，避免只剩披旗→半裸
      const add = wardrobeHasTorsoGarment(host.wardrobe)
        ? `printed '${text}'`
        : `jersey or shirt with printed '${text}'`;
      host.wardrobe = [host.wardrobe, add].filter(Boolean).join(", ");
    } else {
      host.label = [host.label, `printed '${text}'`].filter(Boolean).join(", ");
    }
  }
  return { subjects: nextS, objects: nextO };
}

function isBlankCue(v) {
  return !String(v || "").trim() || /^(none|unknown|n\/a)$/i.test(String(v).trim());
}

/** 宿主/查看器 UI chrome（非画面内容） */
export function isHostUiChromeText(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (/^ai\s*modified$/i.test(s)) return true;
  return /\b(AI\s*modified|Edit\s*button|expand\s*icon|fullscreen\s*icon|magic\s*wand|regenerate\s*icon|share\s*icon|upload\s*icon|viewer\s*chrome|host\s*UI\s*chrome|floating\s*(?:tool)?bar)\b/i.test(
    s
  ) || /展开按钮|魔法棒|分享按钮|重新生成/.test(s);
}

/** 物体/区域是否宿主 UI */
export function isHostUiChromeItem(it) {
  const blob = `${it?.label || ""} ${it?.text || ""} ${it?.evidence || ""} ${it?.kind || ""} ${it?.role || ""}`;
  return isHostUiChromeText(blob) || isHostUiChromeText(it?.label) || isHostUiChromeText(it?.text);
}

/** lighting 是否含丁达尔/god rays（beams 闭集或 evidence） */
export function lightingHasGodRays(lighting) {
  if (!lighting) return false;
  if (String(lighting.beams || "") === "god_rays") return true;
  const blob = `${lighting?.evidence || ""} ${lighting?.pattern || ""} ${lighting?.source || ""}`;
  return /\b(god\s*rays?|crepuscular|light\s*shafts?|sun\s*shafts?|volumetric\s*light\s*beams?|beam(?:s)?\s+of\s+light)\b/i.test(
    blob
  ) || /丁达尔|体积光柱|光束穿过/.test(blob);
}

/** fx 是否误把 god rays 标成 smoke wrap */
function fxIsGodRaysMislabel(fx) {
  if (!fx || fx.family !== "volumetric_wrap") return false;
  const ev = String(fx.evidence || "");
  if (!/\b(god\s*rays?|crepuscular|light\s*shafts?|sun\s*shafts?|丁达尔|光束)\b/i.test(ev)) return false;
  // 无烟雾穿插证据 → 当作光柱误标
  return !/\b(smoke|fog|wisps?|wrap(?:-|\s)?around|in front of (?:the )?subject)\b/i.test(ev);
}

/** 上衣/球衣等躯干服装词（披旗/披风不算；「no shirt」不算有上衣） */
export function wardrobeHasTorsoGarment(wardrobe) {
  const w = String(wardrobe || "")
    .replace(
      /\b(no\s+shirt|without\s+(?:a\s+)?shirt|shirtless|topless|nude\s+torso|naked\s+chest|bare\s+(?:chest|torso|upper\s+body)|uncovered\s+upper\s+body|bare\s+shoulders?|chest\s+fully\s+outside\s+frame)\b/gi,
      " "
    )
    .replace(/裸(?:胸|上身)|赤膊|没穿上衣/g, " ");
  return /\b(jersey|shirt|tee\b|t-?shirts?|uniform|tank(?:top)?|singlet|blouse|crop\s*top|\btop\b|jacket|hoodie|sweater|pullover|vest|robe|dress|suit|coat|armor|gi\b|kimono|qipao|polo)\b/i.test(
    w
  );
}

/** 赤膊 / 无上衣（与 torso garment 互斥） */
export function wardrobeIsBareTorso(wardrobe) {
  const w = String(wardrobe || "").trim();
  if (!w) return false;
  if (wardrobeHasTorsoGarment(w)) return false;
  return /\b(shirtless|bare\s+(?:chest|torso|upper\s+body)|no\s+shirt|without\s+(?:a\s+)?shirt|topless|nude\s+torso|naked\s+chest|uncovered\s+upper\s+body|bare\s+shoulders?|collarbones?|chest\s+fully\s+outside\s+frame|裸(?:胸|上身)|赤膊|没穿上衣)\b/i.test(
    w
  );
}

/** 女读（label）：女性赤膊需软化，避免平台拒生 */
export function subjectReadsFemale(s) {
  return /\b(women|woman|girls?|female|lady|女士们?|女子|女孩|女士)\b/i.test(String(s?.label || ""));
}

/** 脸/肩特写：胸部出画，赤膊应写成肩颈而非裸体躯干 */
export function shotHidesChest(s) {
  const scale = coerceShotScale(s?.shot_scale);
  const focus = coerceFrameFocus(s?.frame_focus);
  if (scale === "extreme_closeup") return true;
  if (
    scale === "closeup" &&
    (!focus ||
      focus === "full_face" ||
      focus === "upper_face" ||
      focus === "single_eye" ||
      focus === "lips_chin" ||
      focus === "half_face")
  ) {
    return true;
  }
  return false;
}

/** 手臂出画：极近/脸特写不要写 arm_pose */
export function shotHidesArms(s) {
  return shotHidesChest(s);
}

/**
 * 赤膊着装写入口：男保留 shirtless；女软化；脸特写改肩颈出画
 * @param {object|null|undefined} s
 */
export function wardrobePhraseForSubject(s) {
  const cloth = String(s?.wardrobe || "").trim();
  const acc = String(s?.accessories || "").trim();
  const raw = [cloth, acc].filter(Boolean).join(", ");
  if (!raw) return "";
  if (!wardrobeIsBareTorso(cloth)) return raw;
  if (!subjectReadsFemale(s)) {
    // 男性：规范化硬锁
    if (/\bshirtless\b/i.test(cloth) && /\bbare\s+torso\b/i.test(cloth)) {
      return acc ? `${cloth}, ${acc}` : cloth;
    }
    const rest = cloth
      .replace(
        /\b(shirtless|bare\s+(?:chest|torso|upper\s+body)|no\s+shirt|without\s+(?:a\s+)?shirt|topless|nude\s+torso|naked\s+chest|uncovered\s+upper\s+body|bare\s+shoulders?|collarbones?|chest\s+fully\s+outside\s+frame)\b/gi,
        ""
      )
      .replace(/裸(?:胸|上身)|赤膊|没穿上衣/g, "")
      .replace(/^[,\s]+|[,\s]+$/g, "")
      .replace(/\s{2,}/g, " ");
    const core = rest ? `shirtless, bare torso, ${rest}` : "shirtless, bare torso";
    return acc ? `${core}, ${acc}` : core;
  }
  // 女性脸/肩特写：肩颈可见、胸部出画——避免 no shirt 与 shirtless 负向互殴
  if (shotHidesChest(s)) {
    const core = "bare shoulders, collarbones subtly visible, chest fully outside frame";
    return acc ? `${core}, ${acc}` : core;
  }
  // 女性半身+：软化措辞，去掉易触发安全过滤的词
  const softRest = cloth
    .replace(
      /\b(shirtless|topless|nude\s+torso|naked\s+chest|bare\s+(?:chest|torso|upper\s+body)|no\s+shirt|without\s+(?:a\s+)?shirt|uncovered\s+upper\s+body|bare\s+shoulders?|collarbones?|chest\s+fully\s+outside\s+frame)\b/gi,
      ""
    )
    .replace(/裸(?:胸|上身)|赤膊|没穿上衣|上身裸/g, "")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .replace(/\s{2,}/g, " ");
  const core = softRest ? `no shirt, uncovered upper body, ${softRest}` : "no shirt, uncovered upper body";
  return acc ? `${core}, ${acc}` : core;
}

/** 着装短语前缀：赤膊不用 wearing */
function withWardrobeBit(bit, s) {
  const wardrobe = wardrobePhraseForSubject(s);
  if (!wardrobe) return bit;
  if (bit.toLowerCase().includes(wardrobe.slice(0, 12).toLowerCase())) return bit;
  if (wardrobeIsBareTorso(s?.wardrobe) || wardrobeIsBareTorso(wardrobe)) {
    return `${bit}, ${wardrobe}`;
  }
  return `${bit}, wearing ${wardrobe}`;
}

/** 活体肤色描述：已有 skin_tone 时不要再前置 body surface（防半裸漂移） */
function colorIsLivingSkinSurface(color) {
  const c = String(color || "").trim();
  if (!c) return false;
  if (/石膏|石像|雕像|石墨|炭笔|灰泥/.test(c)) return false;
  if (/\b(plaster|statue|marble|graphite|charcoal|stone)\b/i.test(c)) return false;
  return (
    /\b(warm|cool|living|fair|pale|light|mid|tan|deep|dark)\b/i.test(c) && /\bskin\b/i.test(c)
  );
}

/** relation 里的 s1/o1 换成宿主短名；未解析 id 则丢弃整段 relation */
function resolveHostIds(text, subjects = [], objects = []) {
  const src = String(text || "");
  let unresolved = false;
  const out = src.replace(/\b([sor]\d+)\b/gi, (raw) => {
    const host = hostByOn(raw, subjects, objects);
    if (!host) {
      unresolved = true;
      return raw;
    }
    const name = String(host.label || "").split(/[,，]/)[0].trim();
    return name || raw;
  });
  return unresolved ? "" : out;
}

function mergeColorIntoLabel(color, label) {
  const c = String(color || "").trim();
  const lab = String(label || "").trim();
  if (!c || !lab) return lab || c;
  const labLow = lab.toLowerCase();
  // 已有完整 color 串则不重复
  if (labLow.includes(c.toLowerCase())) return lab;
  // 按 token 合并：只补 label 里没有的词（避免 "vibrant orange" + "orange shape" → "orange orange"）
  const missing = c
    .split(/\s+/)
    .filter((tok) => tok && !labLow.includes(tok.toLowerCase()));
  if (!missing.length) return lab;
  return `${missing.join(" ")} ${lab}`.trim();
}

function objectLabelWithRelation(o, subjects = [], objects = []) {
  const color = isBlankCue(o?.color) ? "" : String(o?.color || "").trim();
  let label = String(o?.label || "").trim();
  if (color && label) label = mergeColorIntoLabel(color, label);
  const rel = resolveHostIds(isBlankCue(o?.relation) ? "" : String(o?.relation || "").trim(), subjects, objects);
  if (!rel) return label;
  if (label.toLowerCase().includes(rel.slice(0, 16).toLowerCase())) return label;
  return `${label}, ${rel}`;
}

/** held prop：布局区跟随宿主，避免 mid-right 枪 vs full-height-center 人打架 */
function placementForItem(it, subjects = [], objects = []) {
  const own = normalizePlacementZone(it?.placement || it?.zone);
  if (!relationIsHeld(it?.relation)) return own;
  const rel = String(it?.relation || "");
  const idMatch = rel.match(/\b([sor]\d+)\b/i);
  if (!idMatch) return own;
  const host = hostByOn(idMatch[1], subjects, objects);
  if (!host) return own;
  const hostZone = normalizePlacementZone(host.placement || host.zone);
  return hostZone || own;
}

function relationIsHeld(rel) {
  return HELD_PROP_RE.test(String(rel || ""));
}

function itemSalience(it, fallback = "secondary") {
  const s = String(it?.salience || "").toLowerCase();
  if (s === "primary" || s === "secondary") return s;
  return fallback;
}

const FACIAL_HAIR_PHRASE = {
  none: "clean-shaven",
  stubble: "light stubble",
  mustache: "mustache",
  goatee: "goatee",
  short_beard: "short beard",
  full_beard: "full beard",
};

const BUILD_PHRASE = {
  lean: "lean build",
  average: "average build",
  athletic: "athletic toned build",
  lean_muscular: "lean muscular build, defined muscles without bulk",
  muscular: "muscular build, moderate visible muscle mass",
  bulky: "bulky muscular build, broad shoulders, thick arms, barrel chest",
  heavy: "heavy build",
  stocky: "stocky build",
};

const STATURE_PHRASE = {
  short: "short stature",
  average: "average height",
  tall: "tall stature",
};

const PHENOTYPE_PHRASE = {
  east_asian: "East Asian facial features",
  southeast_asian: "Southeast Asian facial features",
  south_asian: "South Asian facial features",
  west_asian: "West Asian facial features",
  north_african: "North African facial features",
  black_african: "Black African facial features",
  european: "European facial features",
  latino: "Latino facial features",
  indigenous: "Indigenous facial features",
};

const SPECIES_PHRASE = {
  human: "",
  dog: "dog",
  cat: "cat",
  wolf: "wolf",
  fox: "fox",
  bird: "bird",
  horse: "horse",
  cattle: "cattle",
  rabbit: "rabbit",
  dragon: "dragon",
  other: "non-human creature",
};

const SHOT_SCALE_PHRASE = {
  extreme_closeup: "extreme close-up",
  closeup: "tight close-up",
  bust: "bust crop",
  waist: "waist-up framing",
  full_body: "full-body framing, head to toe",
  wide: "wide establishing framing",
};

const FRAME_FOCUS_PHRASE = {
  full_face: "full face filling the frame",
  upper_face: "upper face only, lower face cropped or covered",
  single_eye: "single eye dominates the frame",
  lips_chin: "lips and chin crop only",
  half_face: "half-face crop",
};

/** 色板气候：压生成器默认抬饱和 */
const PALETTE_CLIMATE_PHRASE = {
  muted_antique:
    "muted antique low-chroma palette, aged parchment cream, desaturated traditional print colors",
  desaturated: "desaturated low-chroma palette, muted restrained colors",
  warm_earthy: "warm earthy ochre-sepia palette, restrained chroma",
  natural: "natural moderate chroma palette",
  vivid: "vivid saturated high-chroma digital palette, clean bright fills",
  neon: "neon high-chroma emissive palette",
  monochrome: "monochrome near-grey palette, no invented full color",
};

const LIP_FINISH_PHRASE = {
  matte: "matte lips",
  satin: "satin lips",
  gloss: "glossy lips",
  wet_gloss: "plump wet-gloss high-shine lips",
};

const MOUTH_PHRASE = {
  closed: "closed lips",
  pursed: "pursed lips",
  parted: "parted lips",
  open_teeth: "open mouth showing teeth",
};

const MOUTH_NEG = {
  closed: ["parted lips", "open mouth", "toothy grin"],
  pursed: ["parted lips", "open mouth", "toothy grin"],
  parted: ["closed mouth", "sealed lips", "closed-mouth smile"],
  open_teeth: ["closed mouth", "sealed lips", "closed-mouth smile"],
};

/**
 * @param {object|null|undefined} it
 */
function resolveMouth(it) {
  if (!it || isFaceCovered(it)) return "";
  if (frameFocusHidesMouth(it.frame_focus) || cropHidesMouth(it.crop)) return "";
  return coerceMouth(it.mouth) || coerceMouth(String(it.expression || "")) || "";
}

/**
 * @param {string} text
 * @param {string} mouth
 */
function mouthCoveredByText(text, mouth) {
  const t = String(text || "").toLowerCase();
  if (mouth === "open_teeth") return /\b(teeth|toothy|wide[-\s]?open mouth|open mouth showing)\b/.test(t);
  if (mouth === "parted") return /\b(parted lips|lips parted|slightly parted|open[-\s]?mouth)\b/.test(t);
  if (mouth === "pursed") return /\bpursed\b/.test(t);
  if (mouth === "closed") return /\b(closed[-\s]?mouth|closed lips|lips closed|sealed lips)\b/.test(t);
  return false;
}

/**
 * 表情 + 嘴巴开合硬锁
 * @param {object|null|undefined} it
 */
function expressionWithMouth(it) {
  const expr = scrubVagueExpression(it?.expression);
  const mouth = resolveMouth(it);
  const bit = mouth ? MOUTH_PHRASE[mouth] : "";
  if (!bit) return expr;
  if (expr && mouthCoveredByText(expr, mouth)) return expr;
  return expr ? `${expr}, ${bit}` : bit;
}

const BLUSH_PHRASE = {
  none: "no blush",
  soft: "soft blush",
  heavy: "heavy rosy blush on cheeks",
};

const SKIN_FINISH_PHRASE = {
  pore_detail: "visible pore detail skin",
  natural: "natural skin texture",
  soft_focus: "soft-focus skin",
  dewy_beauty: "dewy glassy beauty skin",
  airbrushed: "smooth airbrushed beauty skin",
};

/**
 * 扁平/二次元/线稿类：压写真美容锁（dewy / 毛孔肤）
 * 丁达尔氛围片同样压 dewy glassy（否则生成塌成暖棕美容棚拍、光柱消失）
 * @param {object|null|undefined} obs
 */
export function observationSuppressesPhotoBeauty(obs) {
  if (lightingHasGodRays(obs?.lighting) || fxIsGodRaysMislabel(obs?.fx)) return true;
  const rf = String(obs?.render_family || "");
  if (rf === "photo" || rf === "cgi") return false;
  if (rf === "flat_graphic") return true;
  const tech = coerceFinishTechnique(obs?.finish_technique);
  if (tech === "flat_cartoon" || tech === "hard_cel" || tech === "ink_print" || tech === "line_art") {
    return true;
  }
  if (finishLooksFlatCartoon(obs?.finish)) return true;
  const finish = String(obs?.finish || "");
  if (
    /\b(hard[-\s]?edge|flat\s+fills?|flat\s+graphic|flat\s+angular|graphic\s+illustration|bold\s+(?:ink\s+)?contour|opaque\s+graphic\s+makeup)\b/i.test(
      finish
    )
  ) {
    return true;
  }
  const fc = coerceFinishClass(finish);
  return fc === "anime" || fc === "manga" || fc === "sketch";
}

/** 非写真/CGI：去掉虹膜放射纹等写真微细节 */
export function observationScrubsIrisMicro(obs) {
  const rf = String(obs?.render_family || "");
  return rf === "illustration" || rf === "flat_graphic" || rf === "watercolor" || rf === "infographic";
}

/**
 * @param {string} eyes
 */
function scrubPhotorealEyeMicro(eyes) {
  return String(eyes || "")
    .replace(/\bwith\s+detailed\s+radial\s+striations\b/gi, "")
    .replace(/\bdetailed\s+radial\s+striations\b/gi, "")
    .replace(/\bradial\s+striations\b/gi, "")
    .replace(/\bpore[-\s]?level\s+(?:iris|detail)\b/gi, "")
    .replace(/\bphotoreal(?:istic)?\s+iris\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
}

function withIdentityCues(name, it, opts = {}) {
  if (it?.confidence === "low") return String(name || "").trim();
  const covered = isFaceCovered(it);
  const suppressPhotoBeauty = Boolean(opts.suppressPhotoBeauty);
  const scrubIris = Boolean(opts.scrubIrisMicro);
  const age = ageBandPhrase(it?.age);
  const species = coerceSpecies(it?.species);
  const phenotype = covered || (species && species !== "human") ? "" : coercePhenotype(it?.phenotype);
  const build = coerceBuild(it?.build);
  const stature = coerceStature(it?.stature);
  const facial = covered ? "" : coerceFacialHair(it?.facial_hair);
  const hair = covered || isBlankCue(it?.hair) ? "" : String(it?.hair || "").trim();
  let eyes = covered || isBlankCue(it?.eyes) ? "" : String(it?.eyes || "").trim();
  if (eyes && scrubIris) eyes = scrubPhotorealEyeMicro(eyes);
  const lip = covered ? "" : coerceLipFinish(it?.lip_finish);
  const blush = covered ? "" : coerceBlush(it?.blush);
  const makeup = covered || isBlankCue(it?.makeup) ? "" : String(it?.makeup || "").trim();
  const marks = covered || isBlankCue(it?.skin_marks) ? "" : String(it?.skin_marks || "").trim();
  let skin = covered ? "" : coerceSkinFinish(it?.skin_finish);
  // 扁平/二次元：压美容肤；照片丁达尔只压水光/毛孔，保留磨皮
  if (suppressPhotoBeauty && (skin === "dewy_beauty" || skin === "pore_detail")) {
    skin = "";
  }
  if (scrubIris && (skin === "airbrushed" || skin === "soft_focus" || skin === "dewy_beauty" || skin === "pore_detail")) {
    skin = "";
  }
  const skinToneBit = covered ? "" : skinTonePhrase(it);
  const color = isBlankCue(it?.color) ? "" : String(it?.color || "").trim();
  const celeb =
    !covered
      ? namedIdentityFromGuess(it?.identity_guess, {
          useCelebrityName: Boolean(opts.useCelebrityName),
          includeAnimeCharacter: Boolean(opts.includeAnimeCharacter),
        })
      : "";
  let n = celeb || String(name || "").trim();
  if (age) n = stripVagueAgeWords(n) || n;
  if (age && !n.toLowerCase().includes(age.toLowerCase())) n = `${age} ${n}`;
  if (!celeb && species && species !== "human") {
    const spBit = SPECIES_PHRASE[species] || species;
    if (spBit && !n.toLowerCase().includes(spBit.toLowerCase())) n = `${spBit} ${n}`;
  }
  if (phenotype) {
    const phBit = PHENOTYPE_PHRASE[phenotype] || phenotype.replace(/_/g, " ");
    if (!n.toLowerCase().includes(phBit.toLowerCase()) && !/\bfacial features\b/i.test(n)) {
      n = `${n}, ${phBit}`;
    }
  }
  if (stature) {
    const statureBit = STATURE_PHRASE[stature] || `${stature} stature`;
    if (
      !/\b(short stature|average height|tall stature)\b/i.test(n) &&
      !(stature === "tall" && /\btall\b/i.test(n)) &&
      !(stature === "short" && /\b(short stature|petite)\b/i.test(n))
    ) {
      n = `${n}, ${statureBit}`;
    }
  }
  if (build) {
    const buildBit = BUILD_PHRASE[build] || `${build.replace(/_/g, " ")} build`;
    const needle = buildBit.split(",")[0].trim();
    if (!n.toLowerCase().includes(needle.toLowerCase())) n = `${n}, ${buildBit}`;
  }
  if (facial) {
    const facialBit = FACIAL_HAIR_PHRASE[facial] || facial.replace(/_/g, " ");
    const facialNeedle = facialBit.toLowerCase();
    // 女像 facial_hair=none 不写 clean-shaven（男像光洁才需要）
    const femaleCue = /\b(women|woman|girls?|female|lady|女士们?|女子|女孩|女士)\b/i.test(
      `${name} ${it?.label || ""}`
    );
    if (facial === "none" && femaleCue) {
      // skip
    } else if (
      !n.toLowerCase().includes(facialNeedle) &&
      !(facial === "none" && /\bclean[-\s]?shaven\b/i.test(n)) &&
      !(facial !== "none" && /\bbeard|mustache|moustache|stubble|goatee\b/i.test(n))
    ) {
      n = `${n}, ${facialBit}`;
    }
  }
  if (hair && !n.toLowerCase().includes(hair.toLowerCase())) n = `${n}, ${hair}`;
  if (eyes) {
    const eyeBit = /\beyes?\b/i.test(eyes) ? eyes : `${eyes} eyes`;
    if (!n.toLowerCase().includes(eyeBit.toLowerCase()) && !n.toLowerCase().includes(eyes.toLowerCase())) {
      n = `${n}, ${eyeBit}`;
    }
  }
  if (skinToneBit && !n.toLowerCase().includes(skinToneBit.split(",")[0].trim().toLowerCase())) {
    n = `${n}, ${skinToneBit}`;
  }
  if (skin) {
    const skinBit = SKIN_FINISH_PHRASE[skin] || skin.replace(/_/g, " ");
    if (!n.toLowerCase().includes(skinBit.toLowerCase())) n = `${n}, ${skinBit}`;
  }
  if (lip) {
    const lipBit = LIP_FINISH_PHRASE[lip] || `${lip.replace(/_/g, " ")} lips`;
    if (!n.toLowerCase().includes(lipBit.toLowerCase()) && !/\b(matte|satin|gloss|wet)[-\s]?lips?\b/i.test(n)) {
      n = `${n}, ${lipBit}`;
    }
  }
  if (blush && blush !== "none") {
    const blushBit = BLUSH_PHRASE[blush] || `${blush} blush`;
    if (!n.toLowerCase().includes(blushBit.toLowerCase()) && !/\bblush\b/i.test(n)) {
      n = `${n}, ${blushBit}`;
    }
  }
  if (makeup && !n.toLowerCase().includes(makeup.slice(0, 16).toLowerCase())) {
    n = `${n}, ${makeup}`;
  }
  if (marks && !n.toLowerCase().includes(marks.slice(0, 16).toLowerCase())) {
    n = `${n}, ${marks}`;
  }
  if (color && !n.toLowerCase().includes(color.slice(0, 12).toLowerCase())) {
    // 非活体表面色前置（石膏灰等）；活体肤色已由 skin_tone 覆盖，避免 body surface 抢戏→半裸
    if (!colorIsLivingSkinSurface(color)) {
      n = `body surface ${color}, ${n}`;
    }
  }
  return n;
}

function subjectShotScalePhrase(it) {
  const scale = coerceShotScale(it?.shot_scale);
  if (!scale) return "";
  const focus = coerceFrameFocus(it?.frame_focus);
  // 极近：按 frame_focus 展开，禁止无焦点时默认「整脸填满」
  if (scale === "extreme_closeup") {
    if (focus === "single_eye") return "extreme close-up, single eye dominates the frame";
    if (focus === "upper_face") return "extreme close-up, upper face only, lower face cropped or covered";
    if (focus === "lips_chin") return "extreme close-up, lips and chin only";
    if (focus === "half_face") return "extreme close-up, half-face crop";
    if (focus === "full_face") return "extreme close-up beauty crop, face filling the frame";
    return "extreme close-up";
  }
  if (scale === "closeup" && focus === "single_eye") {
    return "tight close-up, single eye dominates the frame";
  }
  if (scale === "closeup" && focus === "upper_face") {
    return "tight close-up, upper face only";
  }
  return SHOT_SCALE_PHRASE[scale] || scale.replace(/_/g, " ");
}

function subjectCropPhrase(it) {
  return coerceCrop(it?.crop);
}

/** 景别 + 画面焦点 + 边缘裁切写入 layout/positive */
function withFramingBits(bit, s) {
  let out = String(bit || "");
  const scale = subjectShotScalePhrase(s);
  const focus = coerceFrameFocus(s?.frame_focus);
  const focusBit =
    focus && focus !== "other" && focus !== "full_face" ? FRAME_FOCUS_PHRASE[focus] || "" : "";
  const crop = subjectCropPhrase(s);
  if (scale && !out.toLowerCase().includes(scale.slice(0, 18).toLowerCase())) {
    out = `${out}, ${scale}`;
  }
  if (
    focusBit &&
    !out.toLowerCase().includes(focusBit.slice(0, 14).toLowerCase()) &&
    !(focus === "single_eye" && /\bsingle eye\b/i.test(out)) &&
    !(focus === "upper_face" && /\bupper face\b/i.test(out))
  ) {
    out = `${out}, ${focusBit}`;
  }
  if (crop && !out.toLowerCase().includes(crop.slice(0, 16).toLowerCase())) {
    out = `${out}, ${crop}`;
  }
  return out;
}

function isTurnedFacingPhrase(phrase) {
  return /back view|profile|three-quarter/.test(String(phrase || ""));
}

/**
 * @param {object} it
 * @param {"primary"|"secondary"} salience
 */
function formatElementClause(
  it,
  salience,
  {
    asPerson = false,
    subjects = [],
    objects = [],
    useCelebrityName = false,
    includeAnimeCharacter = false,
    suppressPhotoBeauty = false,
    scrubIrisMicro = false,
  } = {}
) {
  if (it?.confidence === "low") return "";
  const label = String(it?.label || it?.text || "").trim();
  if (!label) return "";
  const face = facingPhrase(it?.facing, label);
  const pose = asPerson ? subjectPosePhrase(it) : posePhrase(it?.pose, label);
  const actionRaw = asPerson ? scrubVagueAction(it?.action) : "";
  const armRaw =
    asPerson && !shotHidesArms(it) ? armPosePhrase(it?.arm_pose, label) : "";
  const arm =
    armRaw && !armPoseCoveredByAction(actionRaw, armRaw) ? armRaw : "";
  const expr =
    asPerson && !isFaceCovered(it) ? expressionWithMouth(it) : "";
  const support = isBlankCue(it?.support) ? "" : String(it?.support || "").trim();
  const relation = isBlankCue(it?.relation) ? "" : String(it?.relation || "").trim();
  const wardrobe = wardrobePhraseForSubject(it);
  let name = asPerson
    ? withIdentityCues(label, it, {
        useCelebrityName,
        includeAnimeCharacter,
        suppressPhotoBeauty,
        scrubIrisMicro,
      })
    : objectLabelWithRelation({ ...it, label, relation: "" }, subjects, objects);
  // 无 man/woman 时补 figure：插在首段后，避免落成 "matte lips figure"
  if (
    asPerson &&
    !/\b(women|woman|men|man|boys?|girls?|children|child|kids?|people|persons?|figures?|characters?|humans?)\b/i.test(
      name
    )
  ) {
    const comma = name.indexOf(",");
    if (comma > 0) {
      name = `${name.slice(0, comma)} figure${name.slice(comma)}`;
    } else {
      name = `${name} figure`;
    }
  }
  if (expr && !name.toLowerCase().includes(expr.slice(0, 18).toLowerCase())) {
    name = `${name}, expression: ${expr}`;
  }
  if (pose && !new RegExp(`\\b${pose.replace(/\s+/g, "\\s+")}\\b`, "i").test(name)) {
    name = `${name}, ${pose}`;
  }
  if (arm && !new RegExp(arm.replace(/\s+/g, "\\s+"), "i").test(name)) {
    name = `${name}, ${arm}`;
  }
  if (asPerson) {
    if (
      actionRaw &&
      !isBlankCue(actionRaw) &&
      !name.toLowerCase().includes(actionRaw.slice(0, 24).toLowerCase())
    ) {
      name = `${name}, ${actionRaw}`;
    }
  }
  if (face && !new RegExp(face.replace(/\s+/g, "\\s+"), "i").test(name)) {
    name = `${name}, ${face}`;
  }
  if (asPerson && support) {
    const sit = pose === "seated" || /seated|sitting/i.test(name) ? "sitting on" : "on";
    if (!name.toLowerCase().includes(support.slice(0, 12).toLowerCase())) {
      name = `${name}, ${sit} ${support}`;
    }
  }
  if (asPerson) {
    const cover = coerceFaceCover(it?.face_cover);
    if (cover === "mask" && !/\bmask\b/i.test(name)) name = `${name}, full-head mask`;
    if (cover === "helmet" && !/\bhelmet\b/i.test(name)) name = `${name}, helmet`;
  }
  if (relation) {
    const resolved = resolveHostIds(relation, subjects, objects);
    if (resolved && !name.toLowerCase().includes(resolved.slice(0, 16).toLowerCase())) {
      name = `${name}, ${resolved}`;
    }
  }
  if (wardrobe) {
    name = withWardrobeBit(name, it);
  }
  // 景别/裁切只进 layout，不进 elements，保持 Subject 与 Layout MECE
  const isText = Boolean(it?.text) && !it?.label;
  const zone = asPerson
    ? normalizePlacementZone(it?.placement || it?.zone)
    : placementForItem(it, subjects, objects);
  const n = isText ? `text "${label}"` : name;
  return `${n}|${zone}|${salience}`;
}

function isReadableFaceSubject(s) {
  if (!s || s.confidence === "low") return false;
  if (isFaceCovered(s)) return false;
  const lab = String(s.label || "").trim();
  if (!lab) return false;
  if (/\b(distant|tiny|far[- ]off)\b/i.test(lab)) return false;
  if (String(s.facing || "") === "back") return false;
  return /\b(woman|man|boy|girl|child|person|figure|people|character|elderly)\b/i.test(lab);
}

/**
 * @param {object|null|undefined} observation
 * @param {{
 *   promptLocale?: string,
 *   ratioMeta?: object|null,
 *   stylePreset?: string,
 *   useCelebrityName?: boolean,
 *   includeAnimeCharacter?: boolean,
 *   palette?: string,
 * }} [ctx]
 */
export function compilePackFromObservation(observation, ctx = {}) {
  const result = validateObservation(observation);
  if (!result.ok) {
    throw new Error(`invalid observation: ${result.errors.join("; ")}`);
  }
  let obs = result.observation;
  // VLM 直接给出的 finish_technique → 重写 finish 头；flat_cartoon 抬轴
  const tech = coerceFinishTechnique(obs?.finish_technique);
  if (tech && tech !== "unknown") {
    const nextFinish = applyFinishTechniqueBand(obs?.finish, tech, obs?.finish);
    const hatchLift =
      finishLooksGraphicNovelHatch(`${obs?.finish || ""} ${nextFinish}`) &&
      obs.render_family === "watercolor";
    obs = {
      ...obs,
      finish: nextFinish,
      ...(tech === "flat_cartoon" ? { render_family: "flat_graphic" } : {}),
      ...(hatchLift ? { render_family: "illustration" } : {}),
    };
  } else if (
    finishLooksGraphicNovelHatch(obs?.finish) &&
    obs.render_family === "watercolor"
  ) {
    obs = {
      ...obs,
      render_family: "illustration",
      finish: applyFinishTechniqueBand(obs?.finish, "painted", obs?.finish),
    };
  } else if (
    finishLooksFlatCartoon(obs?.finish) &&
    (!obs?.render_family ||
      obs.render_family === "illustration" ||
      obs.render_family === "unknown")
  ) {
    obs = { ...obs, render_family: "flat_graphic" };
  }
  const useCelebrityName = Boolean(ctx.useCelebrityName);
  const includeAnimeCharacter = Boolean(ctx.includeAnimeCharacter);
  const suppressPhotoBeauty = observationSuppressesPhotoBeauty(obs);
  const scrubIrisMicro = observationScrubsIrisMicro(obs);
  const idCue = (name, it) =>
    withIdentityCues(name, it, {
      useCelebrityName,
      includeAnimeCharacter,
      suppressPhotoBeauty,
      scrubIrisMicro,
    });
  const axes = normalizeMediumAxes(obs || {});
  const style = styleFromObservation(obs);

  const regionItems = Array.isArray(obs?.regions) ? obs.regions : [];
  const typeItems = Array.isArray(obs?.typography) ? obs.typography : [];
  const folded = foldAttachedPrints(
    Array.isArray(obs?.subjects) ? obs.subjects : [],
    Array.isArray(obs?.objects) ? obs.objects : [],
    typeItems
  );
  // 置信度过滤：low 一致排除；宿主 UI chrome 丢弃
  const subjectItems = folded.subjects.filter((s) => s?.confidence !== "low");
  const objectItems = folded.objects.filter(
    (o) => o?.confidence !== "low" && !isHostUiChromeItem(o)
  );
  const regionOk = regionItems.filter(
    (r) => r?.confidence !== "low" && !isHostUiChromeItem(r)
  );
  const overlayTypes = typeItems.filter(
    (t) => t?.confidence !== "low" && classifyTypographyItem(t, folded.subjects, folded.objects) === "overlay"
  );
  const attachedTypes = typeItems.filter(
    (t) => t?.confidence !== "low" && classifyTypographyItem(t, folded.subjects, folded.objects) === "attached"
  );
  const poses = subjectItems.map((s) => subjectPosePhrase(s)).filter(Boolean);
  const hasRelation = objectItems.some((o) => !isBlankCue(o?.relation));
  const heldProp = objectItems.some((o) => relationIsHeld(o?.relation));
  const readableFace = subjectItems.some((s) => isReadableFaceSubject(s));
  const lightPat =
    obs?.lighting?.pattern && obs.lighting.confidence !== "low" ? obs.lighting.pattern : "";
  const locks = {
    seated: poses.includes("seated"),
    standing: poses.includes("standing"),
    poseClass: poses.length > 0,
    relation: hasRelation,
    heldProp,
    wardrobe: subjectItems.some((s) => Boolean(String(s?.wardrobe || "").trim())),
    attachedPrint: attachedTypes.length > 0,
    overlayType: overlayTypes.length > 0,
    identityCues: subjectItems.some(
      (s) =>
        !isFaceCovered(s) &&
        (!isBlankCue(s?.age) || !isBlankCue(s?.hair) || !isBlankCue(s?.eyes))
    ),
    frameCrop: subjectItems.some(
      (s) => Boolean(subjectCropPhrase(s)) || Boolean(subjectShotScalePhrase(s))
    ),
    faceLight: readableFace,
    backlightRim: readableFace && lightPat === "backlight_rim",
    highKey:
      readableFace &&
      obs?.lighting?.exposure === "high_key" &&
      obs.lighting.confidence !== "low",
    faceCovered: subjectItems.some((s) => isFaceCovered(s)),
  };

  const elementParts = [];
  for (const s of subjectItems) {
    const clause = formatElementClause(s, itemSalience(s, "secondary"), {
      asPerson: true,
      subjects: subjectItems,
      objects: objectItems,
      useCelebrityName,
      includeAnimeCharacter,
      suppressPhotoBeauty,
      scrubIrisMicro,
    });
    if (clause) elementParts.push(clause);
  }
  for (const o of objectItems) {
    const clause = formatElementClause(o, itemSalience(o, "secondary"), {
      subjects: subjectItems,
      objects: objectItems,
    });
    if (clause) elementParts.push(clause);
  }
  for (const r of regionOk) {
    const clause = formatElementClause(r, itemSalience(r, "secondary"));
    if (clause) elementParts.push(clause);
  }
  for (const t of overlayTypes) {
    const clause = formatElementClause({ ...t, label: overlayTypePhrase(t) }, "secondary");
    if (clause) elementParts.push(clause);
  }

  const fxFam = obs?.fx?.family && obs.fx.confidence !== "low" ? obs.fx.family : "";
  let fxPhrase = FX_PHRASE[fxFam] || "";
  if (fxFam === "other") {
    const ev = String(obs?.fx?.evidence || "").trim();
    fxPhrase = ev ? ev.slice(0, 160) : "";
  }
  const keepFx =
    Boolean(fxPhrase) &&
    !(axes.render_family === "illustration" && fxFam === "optical_bokeh") &&
    !fxIsGodRaysMislabel(obs?.fx);
  if (keepFx) elementParts.push(`${fxPhrase}|mid-center|secondary`);

  const angle =
    obs?.camera?.angle && obs.camera.confidence !== "low"
      ? ANGLE_PHRASE[obs.camera.angle] || ""
      : "";
  const wormsEye = cameraIsWormsEye(obs?.camera);
  const lensFeel =
    obs?.camera?.confidence !== "low"
      ? coerceLensFeel(obs?.camera?.lens_feel, obs?.camera?.evidence)
      : "";

  // camera：普通只编 angle；worms_eye 闸门下才写 DNA（禁 top-down）
  /** @type {string[]} */
  const camParts = [];
  if (wormsEye) {
    camParts.push("extreme worm's-eye view, camera positioned below hip level");
    if (lensFeel && LENS_FEEL_PHRASE[lensFeel]) camParts.push(LENS_FEEL_PHRASE[lensFeel]);
    camParts.push(
      "hips and lower torso dominating foreground, head appearing smaller in the upper frame"
    );
  } else if (angle) {
    camParts.push(angle);
    if (lensFeel && LENS_FEEL_PHRASE[lensFeel]) camParts.push(LENS_FEEL_PHRASE[lensFeel]);
  } else if (lensFeel && LENS_FEEL_PHRASE[lensFeel]) {
    camParts.push(LENS_FEEL_PHRASE[lensFeel]);
  }

  const light = lightingPatternPhrase(obs);

  /** @type {string[]} */
  const layoutParts = [];
  if (subjectItems.length >= 2) {
    layoutParts.push(
      "people left-to-right: " +
        subjectItems
          .map((s) => {
            const zone = normalizePlacementZone(s?.placement);
            const face = facingPhrase(s?.facing, s?.label);
            const who = shortWhoCue(s, { useCelebrityName, includeAnimeCharacter });
            // 多人布局：短称呼 + 区位 + 朝向 + 景别；姿态/动作留给 Subject
            let bit = zone ? `${who} at ${zone}` : who;
            if (face) bit += ` (${face})`;
            bit = withFramingBits(bit, s);
            return bit;
          })
          .join("; ")
    );
  } else {
    for (const s of subjectItems) {
      const zone = normalizePlacementZone(s?.placement);
      const face = facingPhrase(s?.facing, s?.label);
      const who = shortWhoCue(s, { useCelebrityName, includeAnimeCharacter });
      // 单人布局：区位/朝向/裁切，不复读完整身份与拳姿
      let bit = zone ? `${who} at ${zone}` : who;
      if (face) bit += `, ${face}`;
      bit = withFramingBits(bit, s);
      layoutParts.push(bit);
    }
  }
  for (const o of objectItems) {
    const zone = placementForItem(o, subjectItems, objectItems);
    const label = objectLabelWithRelation(o, subjectItems, objectItems);
    layoutParts.push(zone ? `${label} at ${zone}` : label);
  }
  // regions 镜像进 layout
  for (const r of regionOk) {
    const zone = normalizePlacementZone(r?.placement);
    const lab = String(r?.label || "").trim();
    if (!lab) continue;
    layoutParts.push(zone ? `${lab} at ${zone}` : lab);
  }
  for (const t of overlayTypes.slice(0, 10)) {
    layoutParts.push(overlayTypePhrase(t, { zoneStyle: "at" }));
  }
  // presentation 只进 layout，不进 style
  if (axes.presentation && axes.presentation !== "unknown") {
    layoutParts.push(axes.presentation.replace(/_/g, " "));
  }
  // portrait 不进 layout：会与景别叠成 bust/头肩治愈
  if (axes.content_type && axes.content_type !== "other" && axes.content_type !== "portrait") {
    layoutParts.push(axes.content_type.replace(/_/g, " "));
  }
  // composition 骨架优先；无 composition 时 worms_eye 只写机位必然推出的髋前景
  const skeleton = compositionSkeletonPhrase(obs?.composition, subjectItems);
  if (skeleton) {
    layoutParts.unshift(skeleton);
  } else if (wormsEye) {
    layoutParts.unshift(
      lensFeel === "ultra_wide"
        ? "hips and lower torso dominating lower frame, exaggerated foreshortening toward camera, head smaller in upper frame"
        : "hips and lower torso dominating lower frame, head smaller in upper frame"
    );
    const skyUpper = regionOk.some(
      (r) =>
        /\b(sky|cloud|云|天空)\b/i.test(String(r?.label || "")) &&
        /upper|full-width-upper|top/i.test(String(r?.placement || ""))
    );
    if (skyUpper) {
      layoutParts.push("large upper sky negative space");
    }
    if (subjectItems.some((s) => /right/i.test(String(s?.placement || "")))) {
      layoutParts.push("subject biased toward frame-right");
    } else if (subjectItems.some((s) => /left/i.test(String(s?.placement || "")))) {
      layoutParts.push("subject biased toward frame-left");
    }
  }

  const positiveParts = [];
  if (style) positiveParts.push(style);
  // composition / worms_eye DNA 尽早进 positive
  if (skeleton) {
    positiveParts.push(skeleton);
  }
  if (wormsEye) {
    positiveParts.push(
      "extreme worm's-eye view from below hip level, hips pushed toward camera dominating foreground"
    );
  }
  // 丁达尔尽早写入：避免皮肤/虹膜美容词抢权重导致光柱丢失
  const hasGodRays =
    lightingHasGodRays(obs?.lighting) || fxIsGodRaysMislabel(obs?.fx);
  const rayOriginEarly = hasGodRays ? lightingShaftOriginPhrase(obs?.lighting) : "";
  if (hasGodRays) {
    positiveParts.push(
      rayOriginEarly
        ? `visible diagonal crepuscular god rays as bright light shafts cutting through haze from ${rayOriginEarly}`
        : "visible diagonal crepuscular god rays as bright light shafts cutting through haze"
    );
  }
  // 色板气候：与 hex 正交，尽早写入，压默认鲜艳数码
  const paletteClimate = coercePaletteClimate(obs?.palette_climate);
  const climateBit = paletteClimate ? PALETTE_CLIMATE_PHRASE[paletteClimate] || "" : "";
  if (climateBit) positiveParts.push(climateBit);
  if (subjectItems.length >= 2) {
    positiveParts.push(
      "Roster left-to-right: " +
        subjectItems
          .map((s) => {
            const zone = normalizePlacementZone(s?.placement);
            const face = facingPhrase(s?.facing, s?.label);
            const pose = subjectPosePhrase(s);
            const support = isBlankCue(s?.support) ? "" : String(s?.support || "").trim();
            const wardrobe = wardrobePhraseForSubject(s);
            let bit = zone
              ? `${idCue(s.label, s)} at ${zone}`
              : idCue(s.label, s);
            const expr = expressionWithMouth(s);
            if (expr) bit += `, expression: ${expr}`;
            if (pose) bit += `, ${pose}`;
            bit = withArmPose(bit, s);
            bit = withAction(bit, s);
            if (face) bit += `, ${face}`;
            if (support && pose === "seated") bit += `, sitting on ${support}`;
            if (wardrobe) bit = withWardrobeBit(bit, s);
            bit = withFramingBits(bit, s);
            return bit;
          })
          .join("; ")
    );
  } else {
    for (const s of subjectItems) {
      const face = facingPhrase(s?.facing, s?.label);
      const pose = subjectPosePhrase(s);
      const support = isBlankCue(s?.support) ? "" : String(s?.support || "").trim();
      const wardrobe = wardrobePhraseForSubject(s);
      let bit = idCue(s.label, s);
      const expr = expressionWithMouth(s);
      if (expr) bit = `${bit}, expression: ${expr}`;
      if (pose) bit = `${bit}, ${pose}`;
      bit = withArmPose(bit, s);
      bit = withAction(bit, s);
      if (face) bit = `${bit}, ${face}`;
      if (support && pose === "seated") bit = `${bit}, sitting on ${support}`;
      if (wardrobe) bit = withWardrobeBit(bit, s);
      bit = withFramingBits(bit, s);
      positiveParts.push(bit);
    }
  }
  const wardrobeLocks = subjectItems
    .map((s) => {
      const w = wardrobePhraseForSubject(s);
      if (!w) return "";
      const who = idCue(String(s?.label || "figure").split(/[,，]/)[0].trim(), s);
      return `${who}: ${w}`;
    })
    .filter(Boolean);
  if (wardrobeLocks.length) {
    positiveParts.splice(1, 0, `Wardrobe lock: ${wardrobeLocks.join(" | ")}`);
  }
  for (const o of objectItems.slice(0, 8)) {
    positiveParts.push(objectLabelWithRelation(o, subjectItems, objectItems));
  }
  // regions 进 positive
  for (const r of regionOk.slice(0, 6)) {
    const lab = String(r?.label || "").trim();
    if (lab) positiveParts.push(lab);
  }
  if (angle) positiveParts.push(angle);
  if (light) positiveParts.push(light);
  if (fxPhrase && keepFx) positiveParts.push(fxPhrase);
  const typeQuoted = overlayTypes
    .filter((x) => String(x?.text || "").trim())
    .slice(0, 12)
    .map((t) => overlayTypePhrase(t, { zoneStyle: "paren" }));
  if (typeQuoted.length) positiveParts.push(`on-image type: ${typeQuoted.join("; ")}`);
  else positiveParts.push("no on-image text, textless background");

  let negative = baseNegatives(obs);
  const keepHeightRuler = typographyHasScaleGlyphs(obs);
  if (subjectItems.length >= 2) {
    const anyTurned = subjectItems.some((s) =>
      isTurnedFacingPhrase(facingPhrase(s?.facing, s?.label))
    );
    negative = tidy(
      [
        negative,
        "mirrored left-right swap",
        anyTurned ? "both figures front-facing if profiles are true" : "",
        keepHeightRuler ? "wrong height marks on ruler" : "",
      ]
        .filter(Boolean)
        .join(", ")
    );
  }
  // 无库存着装负向（invented skirt/heels 等已删）
  const lockNeg = [];
  // 有躯干上衣时禁半裸；仅有披旗不算着装锁定
  if (subjectItems.some((s) => wardrobeHasTorsoGarment(s?.wardrobe))) {
    lockNeg.push("shirtless", "bare chest", "topless", "nude torso", "naked chest");
  }
  // 赤膊负向：男硬锁禁补衫；女只弱禁，避免 shirtless/clothed chest 触发拒生
  const bareMale = subjectItems.some(
    (s) => wardrobeIsBareTorso(s?.wardrobe) && !subjectReadsFemale(s)
  );
  const bareFemale = subjectItems.some(
    (s) => wardrobeIsBareTorso(s?.wardrobe) && subjectReadsFemale(s)
  );
  if (bareMale) {
    lockNeg.push(
      "wearing a shirt",
      "jersey on torso",
      "blouse",
      "t-shirt on chest",
      "invented top",
      "added clothing on torso",
      "clothed chest",
      "fully clothed upper body"
    );
  } else if (bareFemale) {
    const faceCropBare = subjectItems.some(
      (s) => wardrobeIsBareTorso(s?.wardrobe) && subjectReadsFemale(s) && shotHidesChest(s)
    );
    if (faceCropBare) {
      lockNeg.push("visible chest", "topless composition", "nude torso");
    } else {
      lockNeg.push("invented heavy winter coat", "fully buttoned dress shirt covering chest");
    }
  }
  const keySideLock = lightingKeySideToken(obs?.lighting);
  const isRimLock = lightingIsBacklightRim(obs?.lighting);
  // 逆光 rim：禁正面 beauty key / Rembrandt 侧光塌缩；侧光只互斥对侧
  if (isRimLock) {
    lockNeg.push(
      "frontal beauty key",
      "soft front fill key",
      "Rembrandt side key only",
      "even front key lighting",
      "directional key light from camera-right as frontal key",
      "directional key light from camera-left as frontal key"
    );
    if (keySideLock === "camera-right") {
      lockNeg.push(
        "beauty key from camera-right",
        "frontal key from camera-right",
        "key light from camera-left"
      );
    } else if (keySideLock === "camera-left") {
      lockNeg.push(
        "beauty key from camera-left",
        "frontal key from camera-left",
        "key light from camera-right"
      );
    }
  } else {
    // 侧光只互斥对侧；不要禁 overhead（VLM 误标侧光时会把真顶光锁死）
    if (keySideLock === "camera-right") lockNeg.push("key light from camera-left");
    if (keySideLock === "camera-left") lockNeg.push("key light from camera-right");
  }
  if (keySideLock === "overhead" && !isRimLock) {
    lockNeg.push(
      "strong side key from camera-left",
      "strong side key from camera-right",
      "underlighting from below",
      "Rembrandt side triangle only",
      "even front fill lighting",
      "fully lit face with soft front key"
    );
  }
  if (wormsEye) {
    lockNeg.push(
      "top-down bird's-eye view",
      "overhead looking down",
      "eye-level beauty portrait",
      "centered bust beauty crop",
      "head-and-shoulders dominating frame",
      "35mm normal lens proportions",
      "undistorted fashion mid-shot",
      "upright standing pose",
      "static vertical torso",
      "direct beauty gaze at eye level"
    );
  }
  const massLock = coercePrimaryMass(obs?.composition?.primary_mass);
  if (obs?.composition?.confidence !== "low" && massLock === "hips_lower") {
    lockNeg.push("centered bust beauty crop", "face dominating frame");
  }
  if (obs?.composition?.confidence !== "low" && massLock === "bust_face") {
    lockNeg.push("hips dominating foreground", "full-body establishing");
  }
  if (
    obs?.composition?.confidence !== "low" &&
    coerceNegativeSpace(obs?.composition?.negative_space) === "upper"
  ) {
    lockNeg.push("subject vertically centered filling sky", "busy upper third");
  }
  const hairBlob = subjectItems.map((s) => String(s?.hair || "")).join(" ");
  if (/\b(updo|bun|chignon|topknot|发髻)\b/i.test(hairBlob)) {
    lockNeg.push("loose long hair");
  }
  if (/\b(ponytail|马尾)\b/i.test(hairBlob)) {
    lockNeg.push("hair fully loose");
  }
  if (/\b(buzz-cut|buzz cut|shaved head|\bbald\b|cropped pixie)\b/i.test(hairBlob)) {
    lockNeg.push("long flowing hair", "waist-length hair");
  } else if (
    /\b(ear-length|jaw-length|cropped)\b/i.test(hairBlob) &&
    !/\b(long|mid-back|waist|shoulder-length)\b/i.test(hairBlob)
  ) {
    lockNeg.push("long flowing hair");
  }
  if (/\b(waist-length|mid-back length)\b/i.test(hairBlob)) {
    lockNeg.push("buzz cut", "pixie crop");
  }
  if (/\bfull bangs\b/i.test(hairBlob)) {
    lockNeg.push("fully exposed forehead");
  }
  if (/\bno bangs\b/i.test(hairBlob)) {
    lockNeg.push("full fringe covering forehead");
  }
  if (
    subjectItems.some((s) => cropHidesLowerBody(s?.crop) || shotScaleHidesLowerBody(s?.shot_scale)) &&
    !observationHasSeatObject(obs)
  ) {
    lockNeg.push("chair", "visible legs");
  }
  // 身材锁：细分肌肉带对锁
  const builds = subjectItems.map((s) => coerceBuild(s?.build)).filter(Boolean);
  if (builds.some((b) => b === "lean" || b === "average")) {
    lockNeg.push("muscular bodybuilder physique", "barrel chest", "huge arms", "buff body", "bulky muscular");
  }
  if (builds.some((b) => b === "athletic")) {
    lockNeg.push("bodybuilder bulk", "barrel chest", "huge arms");
  }
  if (builds.some((b) => b === "lean_muscular")) {
    lockNeg.push("skinny soft body", "bodybuilder bulk", "barrel chest", "huge arms");
  }
  if (builds.some((b) => b === "muscular")) {
    lockNeg.push("skinny frame", "emaciated body", "soft untrained body");
  }
  if (builds.some((b) => b === "bulky")) {
    lockNeg.push(
      "skinny frame",
      "slim anime proportions",
      "narrow shoulders",
      "soft athletic body",
      "lean untrained arms"
    );
  }
  if (builds.some((b) => b === "heavy" || b === "stocky")) {
    lockNeg.push("skinny frame", "willowy body");
  }
  // 身高锁：与 build 正交
  const statures = subjectItems.map((s) => coerceStature(s?.stature)).filter(Boolean);
  if (statures.some((h) => h === "tall")) {
    lockNeg.push("short stature", "chibi proportions", "squat body");
  }
  if (statures.some((h) => h === "short")) {
    lockNeg.push("towering height", "very tall lanky figure");
  }
  if (statures.some((h) => h === "average")) {
    lockNeg.push("extremely tall", "chibi short stature");
  }
  // 年龄十岁段对锁：禁止跨代塌缩
  const ages = subjectItems
    .filter((s) => !isFaceCovered(s))
    .map((s) => coerceAgeBand(s?.age))
    .filter(Boolean);
  if (ages.some((a) => a === "infant" || a === "toddler" || a === "child")) {
    lockNeg.push("adult face", "elderly wrinkles", "middle-aged face");
  }
  if (ages.some((a) => /teens$|_20s$/.test(a))) {
    lockNeg.push(
      "deep elderly wrinkles",
      "elderly face",
      "70-year-old face",
      "grey elderly hair",
      "middle-aged face",
      "40-year-old face"
    );
  }
  if (ages.some((a) => /_30s$/.test(a))) {
    lockNeg.push("deep elderly wrinkles", "elderly face", "70-year-old face", "grey elderly hair", "teenage baby-face only");
  }
  if (ages.some((a) => /_40s$|_50s$/.test(a))) {
    lockNeg.push("child face", "toddler proportions", "teenage baby-face only");
  }
  if (ages.some((a) => /_60s$|seventies_plus/.test(a))) {
    lockNeg.push("teenage face", "child proportions", "smooth baby-face only");
  }
  // 胡须锁：光洁禁长须；有须禁 clean-shaven
  const facials = subjectItems
    .filter((s) => !isFaceCovered(s))
    .map((s) => coerceFacialHair(s?.facial_hair))
    .filter(Boolean);
  if (facials.some((f) => f === "none")) {
    lockNeg.push("beard", "thick beard", "goatee", "heavy stubble");
  }
  if (facials.some((f) => f === "full_beard" || f === "short_beard" || f === "goatee")) {
    lockNeg.push("clean-shaven face", "no beard");
  }
  if (facials.some((f) => f === "mustache")) {
    lockNeg.push("full thick beard", "clean-shaven face");
  }
  if (facials.some((f) => f === "stubble")) {
    lockNeg.push("full thick beard", "bushy beard");
  }
  // 人种：只抽象禁词，不点名其他 ethnicity（粉红象）
  const phenos = subjectItems
    .filter((s) => !isFaceCovered(s))
    .map((s) => coercePhenotype(s?.phenotype))
    .filter(Boolean);
  if (phenos.length) {
    lockNeg.push("wrong ethnicity", "wrong regional cast");
  }
  // 物种锁：非人禁人脸；人不堆动物禁词（粉红象）
  const speciesList = subjectItems.map((s) => coerceSpecies(s?.species)).filter(Boolean);
  if (speciesList.some((sp) => sp && sp !== "human")) {
    lockNeg.push("human face", "human hands");
  }
  // 产品图：没有可读人脸时禁止生成器默认补人
  if (
    (axes.content_type === "product" || axes.content_type === "scene" || axes.content_type === "abstract") &&
    !subjectItems.some((s) => isReadableFaceSubject(s))
  ) {
    lockNeg.push("human figure", "portrait of a person", "fashion model");
  }
  // 景别锁：极近/特写禁全身与头肩治愈
  const scales = subjectItems.map((s) => coerceShotScale(s?.shot_scale)).filter(Boolean);
  if (scales.some((sc) => sc === "extreme_closeup")) {
    lockNeg.push(
      "full body",
      "head-and-shoulders portrait",
      "wide establishing shot",
      "distant figure",
      "even margins around full head"
    );
  }
  const lensLock =
    obs?.camera?.confidence !== "low"
      ? coerceLensFeel(obs?.camera?.lens_feel, obs?.camera?.evidence)
      : "";
  if (lensLock === "macro") {
    lockNeg.push(
      "wide-angle environmental shot",
      "full-body vertical poster",
      "50mm head-and-shoulders",
      "distant figure in tall frame"
    );
  }
  if (scales.some((sc) => sc === "closeup")) {
    lockNeg.push("full body", "wide establishing shot", "waist-up portrait");
  }
  if (scales.some((sc) => sc === "bust")) {
    lockNeg.push(
      "extreme face-filling close-up",
      "tight headshot only",
      "face filling the frame",
      "cropped above neck only"
    );
  }
  // 丁达尔光束：与 soft beauty flat 对锁；误标 smoke wrap 时补光柱
  if (hasGodRays) {
    const raySide = lightingKeySideToken(obs?.lighting);
    lockNeg.push(
      "flat even beauty lighting",
      "soft even studio wrap only",
      "no volumetric light shafts",
      "featureless dark void without god rays",
      "clean beauty CGI without atmospheric haze",
      "soft side beauty key without light shafts",
      "dewy glassy beauty skin wash"
    );
    if (!isRimLock) {
      if (raySide === "camera-left") {
        lockNeg.push("key light from camera-right", "beauty key from camera-right only");
      } else if (raySide === "camera-right") {
        lockNeg.push("key light from camera-left", "beauty key from camera-left only");
      }
    }
    // 朝光源看：禁直视镜头美妆眼神
    const gazeBlob = subjectItems
      .filter((s) => !isFaceCovered(s))
      .map((s) => `${s?.expression || ""} ${s?.evidence || ""}`)
      .join(" ");
    const gazeToLight =
      /\b(looking\s+up|gaze\s+up|chin\s+up|toward\s+(?:the\s+)?light|eyes?\s+(?:up|toward)|仰视|抬头|朝光)\b/i.test(
        gazeBlob
      );
    if (gazeToLight || /\b(chin\s+up|looking\s+up)\b/i.test(gazeBlob)) {
      lockNeg.push("direct eye contact at camera", "soft beauty gaze straight to lens");
    }
  }
  // 视线锁：对镜 / 移开
  {
    const gazeBlob = subjectItems
      .filter((s) => !isFaceCovered(s))
      .map((s) => String(s?.expression || ""))
      .join(" ");
    if (/\bgaze at camera|looking at camera|eye contact|gaze straight to lens\b/i.test(gazeBlob)) {
      lockNeg.push("looking away", "gaze averted", "downcast eyes", "eyes closed");
    }
    if (/\bgaze averted|looking away|looking aside\b/i.test(gazeBlob)) {
      lockNeg.push("direct eye contact at camera", "gaze straight to lens");
    }
    if (/\bgaze down|looking down|downcast\b/i.test(gazeBlob)) {
      lockNeg.push("direct eye contact at camera", "gaze up to the sky");
    }
  }
  // 色板气候锁：双向——低饱和禁抬艳；高饱和禁发明旧纸去饱和
  if (
    paletteClimate === "muted_antique" ||
    paletteClimate === "desaturated" ||
    paletteClimate === "warm_earthy"
  ) {
    lockNeg.push(
      "oversaturated colors",
      "vivid digital palette",
      "high chroma boost",
      "neon cyan",
      "bright turquoise",
      "hot fluorescent red",
      "candy pop colors"
    );
  }
  if (paletteClimate === "muted_antique") {
    lockNeg.push("modern neon palette", "fresh high-saturation anime colors");
  }
  if (paletteClimate === "vivid" || paletteClimate === "neon") {
    lockNeg.push(
      "aged parchment wash",
      "sepia desaturated antique palette",
      "muted indigo rewrite",
      "yellowed scroll paper",
      "near-mono ink wash desaturation",
      "weathered antique low-chroma"
    );
  }
  if (paletteClimate === "monochrome") {
    lockNeg.push("full color invent", "vivid chromatic palette", "neon accents");
  }
  // 画面焦点锁：单眼/上半脸禁整脸美容摆拍
  const focuses = subjectItems.map((s) => coerceFrameFocus(s?.frame_focus)).filter(Boolean);
  if (focuses.some((f) => f === "single_eye")) {
    lockNeg.push(
      "full face filling the frame",
      "both eyes equally visible",
      "centered full-face beauty portrait",
      "full frontal face headshot"
    );
  }
  if (focuses.some((f) => f === "upper_face")) {
    lockNeg.push(
      "full face with mouth clearly visible",
      "centered full-face beauty portrait",
      "lips-and-chin hero crop"
    );
  }
  if (focuses.some((f) => f === "lips_chin")) {
    lockNeg.push("full face with both eyes", "eye macro dominating the frame");
  }
  // 妆面 / 肤质锁
  const lips = subjectItems
    .filter((s) => !isFaceCovered(s))
    .map((s) => coerceLipFinish(s?.lip_finish))
    .filter(Boolean);
  if (lips.some((l) => l === "wet_gloss" || l === "gloss")) {
    lockNeg.push("matte lips", "natural nude lips", "thin dry lips");
  }
  if (lips.some((l) => l === "matte")) {
    lockNeg.push("wet gloss lips", "glass shine lips");
  }
  const mouths = subjectItems
    .filter((s) => !isFaceCovered(s) && !frameFocusHidesMouth(s?.frame_focus) && !cropHidesMouth(s?.crop))
    .map((s) => resolveMouth(s))
    .filter(Boolean);
  for (const m of mouths) {
    const negs = MOUTH_NEG[m] || [];
    for (const n of negs) {
      if (!lockNeg.includes(n)) lockNeg.push(n);
    }
  }
  const blushes = subjectItems
    .filter((s) => !isFaceCovered(s))
    .map((s) => coerceBlush(s?.blush))
    .filter(Boolean);
  if (blushes.some((b) => b === "heavy")) {
    lockNeg.push("no makeup", "bare natural cheeks", "matte no-blush look");
  }
  const makeupBlob = subjectItems
    .filter((s) => !isFaceCovered(s))
    .map((s) => String(s?.makeup || ""))
    .join(" ");
  if (/\b(smoky|heavy (?:eye )?makeup|dramatic (?:eye )?makeup|thick eyeliner|dark liner)\b/i.test(makeupBlob)) {
    lockNeg.push("no makeup", "bare eyelids", "natural no-makeup look", "nude everyday makeup");
  }
  const wardBlob = subjectItems.map((s) => String(s?.wardrobe || "")).join(" ");
  const accBlob = subjectItems.map((s) => String(s?.accessories || "")).join(" ");
  if (/\bearrings?\b/i.test(`${wardBlob} ${accBlob}`)) {
    lockNeg.push("no earrings", "bare earlobes", "unadorned ears");
  }
  if (/\blace\b/i.test(wardBlob) && /\b(collar|neckline|high[- ]neck|turtleneck)\b/i.test(wardBlob)) {
    lockNeg.push("bare neck", "open neckline", "no collar");
  }
  const skins = subjectItems
    .filter((s) => !isFaceCovered(s))
    .map((s) => coerceSkinFinish(s?.skin_finish))
    .filter(Boolean);
  if (skins.some((sk) => sk === "dewy_beauty" || sk === "airbrushed" || sk === "soft_focus")) {
    lockNeg.push(
      "visible pores",
      "raw freckled skin",
      "documentary skin texture",
      "film grain on skin",
      "high-frequency pore texture",
      "unretouched raw skin",
      "gritty sharp skin"
    );
  }
  if (skins.some((sk) => sk === "pore_detail")) {
    lockNeg.push("airbrushed skin", "plastic beauty filter", "porcelain doll skin", "soft even beauty wrap");
  }
  // 扁平/二次元：对锁写真美容微细节（防 dewy + 虹膜放射纹把生成拉回真人）
  if (suppressPhotoBeauty) {
    lockNeg.push(
      "photoreal skin",
      "visible pores",
      "dewy glassy beauty skin",
      "realistic iris detail",
      "detailed radial iris striations",
      "strand-by-strand hair",
      "soft beauty photography",
      "DSLR portrait"
    );
  } else if (
    scrubIrisMicro &&
    subjectItems.some((s) =>
      /\b(radial\s+striations?|pore[-\s]?level|photoreal(?:istic)?\s+iris)\b/i.test(String(s?.eyes || ""))
    )
  ) {
    lockNeg.push("detailed radial iris striations", "photoreal iris microdetail");
  }
  // 肤色明度 / 冷暖对锁
  const tones = subjectItems
    .filter((s) => !isFaceCovered(s))
    .map((s) => coerceSkinTone(s?.skin_tone))
    .filter(Boolean);
  if (tones.some((t) => t === "fair" || t === "light")) {
    lockNeg.push(
      "tanned skin",
      "bronzed skin",
      "deep olive skin",
      "warm golden tan",
      "deep dark skin",
      "very dark skin"
    );
  }
  if (tones.some((t) => t === "tan" || t === "deep")) {
    lockNeg.push("porcelain pale skin", "overly fair washed-out skin");
  }
  const undertones = subjectItems
    .filter((s) => !isFaceCovered(s))
    .map((s) => coerceSkinUndertone(s?.skin_undertone))
    .filter(Boolean);
  if (undertones.some((u) => u === "cool")) {
    lockNeg.push("warm golden undertone", "orange bronze cast");
  }
  if (undertones.some((u) => u === "warm")) {
    lockNeg.push("cool pink undertone", "blue-cold skin cast");
  }
  // 曝光 / 柔光对锁
  const lockLightExp =
    obs?.lighting?.confidence !== "low" ? String(obs?.lighting?.exposure || "") : "";
  const lockLightPat =
    obs?.lighting?.confidence !== "low" ? String(obs?.lighting?.pattern || "") : "";
  if (lockLightExp === "high_key") {
    lockNeg.push("low-key dramatic shadows", "deep cheek hollow shadows", "moody underexposed face");
  }
  if (lockLightExp === "low_key") {
    lockNeg.push("high-key blown white skin", "overexposed airy face");
  }
  if (lockLightPat === "soft_even") {
    lockNeg.push("hard sun cast shadows", "harsh split lighting", "golden-hour bronze drama");
  }
  if (lockLightPat === "directional" || lockLightPat === "split_chiaroscuro") {
    lockNeg.push("flat even softbox wrap with no direction", "shadowless beauty lighting", "even diffused fill");
  }
  if (lockLightPat === "split_chiaroscuro") {
    lockNeg.push("open even wrap", "no facial shadows", "soft beauty dish frontal key");
  }
  const lockSrc =
    obs?.lighting?.confidence !== "low"
      ? coerceLightSource(obs?.lighting?.source) || coerceLightSource(obs?.lighting?.evidence)
      : "";
  const lockQual =
    obs?.lighting?.confidence !== "low" ? resolvedLightQuality(obs.lighting, obs) : "";
  const lockClim =
    obs?.lighting?.confidence !== "low"
      ? coerceLightClimate(obs?.lighting?.climate) || coerceLightClimate(obs?.lighting?.evidence)
      : "";
  if (lockSrc === "studio") {
    lockNeg.push("natural outdoor sunlight only", "harsh midday sun");
  }
  if (lockSrc === "natural") {
    lockNeg.push("studio softbox beauty dish", "seamless backdrop studio key");
  }
  if (lockQual === "soft") {
    lockNeg.push("hard crisp cast shadows", "harsh specular sun spikes");
  }
  if (lockQual === "hard") {
    lockNeg.push("soft diffused wrap with no hard edges");
  }
  if (lockClim === "daylight" || lockClim === "overcast" || lockClim === "cool_skylight") {
    lockNeg.push("golden-hour bronze drama", "warm tungsten indoor cast");
  }
  if (lockClim === "golden_hour") {
    lockNeg.push("cool skylight cast", "neutral noon daylight only");
  }
  if (lockClim === "tungsten") {
    lockNeg.push("cool daylight skylight", "neutral noon outdoor only");
  }
  // 手臂姿态对锁：背手 禁 抱臂；抱臂 禁 背手
  const arms = subjectItems
    .filter((s) => !shotHidesArms(s))
    .map((s) => coerceArmPose(s?.arm_pose))
    .filter(Boolean);
  if (arms.some((a) => a === "behind_back")) {
    lockNeg.push("arms crossed", "arms folded over chest", "hands on hips");
  }
  if (arms.some((a) => a === "crossed")) {
    lockNeg.push("hands behind back", "hands clasped behind back", "arms at sides");
  }
  if (arms.some((a) => a === "at_sides")) {
    lockNeg.push("arms crossed", "hands behind back");
  }
  if (arms.some((a) => a === "on_hips")) {
    lockNeg.push("arms crossed over chest", "hands behind back");
  }
  if (arms.some((a) => a === "clasped_front")) {
    lockNeg.push("arms crossed", "hands behind back");
  }
  if (arms.some((a) => a === "drawing_weapon" || a === "one_hand_weapon")) {
    lockNeg.push(
      "symmetric frontal pose",
      "both hands centered on vertical sword",
      "static portrait stance",
      "straight-on two-hand sword pose"
    );
  }
  if (arms.some((a) => a === "two_hand_grip")) {
    lockNeg.push("hands behind back", "empty hands at sides");
  }
  // 动态 action / 三分侧：禁静态正面摆拍
  const actionBlob = subjectItems.map((s) => String(s?.action || "")).join(" ");
  const anyThreeQ = subjectItems.some((s) => /three[-\s]?quarter/i.test(String(s?.facing || "")));
  if (
    anyThreeQ ||
    /\b(twist|mid[-\s]?draw|draw(?:ing)?|asymmetric|hip|iaido|corkscrew)\b/i.test(actionBlob) ||
    /扭转|拔刀|侧身|非对称/.test(actionBlob)
  ) {
    lockNeg.push(
      "symmetric front-facing portrait pose",
      "static centered stance",
      "both hands on vertical centered sword"
    );
  }
  // 无框内字：国风先验强时才禁竖排书法/印章（避免挤占 Flux 负面预算）
  if (!overlayTypes.length) {
    const typePriorBlob = [
      ...subjectItems.map((s) => `${s?.label || ""} ${s?.wardrobe || ""} ${s?.hair || ""} ${s?.phenotype || ""}`),
      ...objectItems.map((o) => `${o?.label || ""} ${o?.color || ""}`),
    ].join(" ");
    const eastAsianTypePrior =
      phenos.some((p) => p === "east_asian" || p === "southeast_asian") ||
      /\b(fan|folding\s+fan|hairpin|kimono|hanfu|cheongsam|qipao|obi|parasol)\b/i.test(typePriorBlob) ||
      /扇|发簪|旗袍|汉服|和服|团扇/.test(typePriorBlob);
    if (eastAsianTypePrior) {
      lockNeg.push("vertical calligraphy", "red seal stamp", "invented on-image text");
    }
  }
  // 字体族对锁：手写/连笔不得塌成装饰衬线
  if (overlayTypes.length) {
    const letterings = overlayTypes.map((t) => overlayLetteringBits(t).lettering).filter(Boolean);
    const weights = overlayTypes.map((t) => overlayLetteringBits(t).weight).filter(Boolean);
    if (letterings.some((l) => l === "script")) {
      lockNeg.push(
        "serif title",
        "decorative serif lettering",
        "roman serif type",
        "sans-serif title"
      );
    }
    if (letterings.some((l) => l === "sans")) {
      lockNeg.push("serif title", "cursive script lettering");
    }
    if (letterings.some((l) => l === "serif")) {
      lockNeg.push("sans-serif title", "cursive handwritten script");
    }
    if (letterings.some((l) => l === "mono")) {
      lockNeg.push("proportional serif title", "cursive script lettering");
    }
    if (letterings.some((l) => l === "display")) {
      lockNeg.push("plain sans-serif title", "generic system font");
    }
    if (weights.some((w) => w === "thin")) {
      lockNeg.push("bold heavy type", "black weight lettering");
    }
    if (weights.some((w) => w === "bold" || w === "black")) {
      lockNeg.push("thin hairline type");
    }
  }
  if (lockNeg.length) {
    negative = tidy([...lockNeg, negative].join(", "));
  }
  // 负向家族：直接用 render_family，不再 resolveMediumFamily 二次猜
  const familyHint =
    axes.render_family === "photo"
      ? "photo"
      : axes.render_family === "cgi"
        ? "cgi"
        : axes.render_family === "illustration"
          ? "illustration"
          : axes.render_family === "watercolor"
            ? "watercolor"
            : axes.render_family === "flat_graphic" || axes.render_family === "infographic"
              ? "flat"
              : "generic";
  negative = tidy(negativesForFamily(negative, familyHint) || negative);
  if (overlayTypes.length) {
    negative = tidy(
      negative
        .replace(/\bmovie title overlays?\b/gi, "")
        .replace(/\bcredit blocks?\b/gi, "")
    );
  }

  void ctx.promptLocale;
  void ctx.stylePreset;

  const pack = lightNormalizePack({
    style,
    elements: elementParts.join("; "),
    layout: layoutParts.join("; "),
    camera: camParts.join(", "),
    positive: positiveParts.join(", "),
    negative,
    palette: String(ctx.palette || "").trim(),
    ratio: "",
    locks,
  });
  return applyRatioLight(pack, ctx.ratioMeta);
}

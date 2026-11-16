/**
 * observation → decomposition 本地映射
 * B1：meta / frame / subjects / lighting / camera / composition
 * B2：background / materials / effects / color_system
 * B3：profile 稀疏填充
 * 约束：anatomy_constraints / rendering_constraints（规则表，非 VLM）
 */

import { ageBandPhrase } from "./observation-schema.js";
import { armPosePhrase, subjectPosePhrase } from "./pack-compiler.js";

/** @typedef {import('./decomposition-types.js').Decomposition} Decomposition */
/** @typedef {import('./decomposition-types.js').DecomposeContext} DecomposeContext */
/** @typedef {import('./decomposition-types.js').DecompositionProfile} DecompositionProfile */

const MEDIUM_MAP = {
  photo: "photograph",
  cgi: "CGI",
  illustration: "illustration",
  flat_graphic: "flat graphic",
  watercolor: "watercolor illustration",
  infographic: "infographic",
  unknown: "unknown",
};

const KEY_SIDE_TO_DIRECTION = {
  camera_left: "camera-left",
  camera_right: "camera-right",
  overhead: "top",
};

const SHOT_SCALE_CROP = {
  extreme_closeup: "extreme close-up",
  closeup: "close-up",
  bust: "bust",
  waist: "waist-up",
  full_body: "full-body",
  wide: "wide shot",
};

const FACING_ORIENTATION = {
  front: "front-facing",
  "profile-left": "profile left",
  "profile-right": "profile right",
  "three-quarter": "three-quarter",
  back: "back-facing",
};

const PLACEMENT_POSITION = {
  "mid-center": "center",
  "mid-left": "left-of-center",
  "mid-right": "right-of-center",
  "upper-left": "upper-left",
  "upper-center": "upper-center",
  "upper-right": "upper-right",
  "lower-left": "lower-left",
  "lower-center": "lower-center",
  "lower-right": "lower-right",
};

const NEGATIVE_SPACE_PROSE = {
  none: "",
  upper: "upper frame void",
  "upper-left": "upper-left void",
  "upper-right": "upper-right void",
  lower: "lower frame void",
  "side-left": "left-side void",
  "side-right": "right-side void",
  surround: "surrounding negative space",
};

const LENS_FEEL_MM = {
  ultra_wide: "24mm ultra-wide feel",
  wide: "35mm wide feel",
  normal: "50mm normal feel",
  tele: "85mm telephoto feel",
  macro: "macro close working distance",
};

const SKIN_FINISH_DETAIL = {
  pore_detail: ["visible pores", "subtle tonal variation", "uneven micro-roughness"],
  natural: ["natural skin texture"],
  soft_focus: ["soft-focus skin"],
  dewy_beauty: ["localized natural skin sheen"],
  airbrushed: [],
};

const LIGHTING_AVOID_DEFAULT = [
  "uniform rim lighting",
  "overexposed specular highlights",
  "neon glow unless explicitly visible",
];

const SKIN_SURFACE = {
  pore_detail: "photographic skin with visible pores",
  natural: "natural photographic skin",
  soft_focus: "soft-focus photographic skin",
  dewy_beauty: "dewy photographic skin",
  airbrushed: "smooth airbrushed photographic skin",
};

const MATERIAL_AVOID_SKIN = {
  photo: ["plastic CGI skin", "waxy subsurface", "uniform porcelain fill"],
  cgi: ["waxy skin", "dead matte clay"],
  illustration: ["photoreal pores", "dewy glassy beauty skin"],
  flat_graphic: ["photoreal pores", "soft airbrush skin", "subsurface scatter"],
  watercolor: ["photoreal pores", "CGI gloss"],
  infographic: ["photoreal pores", "dewy glassy beauty skin"],
};

const FABRIC_AVOID = ["plastic clothing", "chrome fabric", "wet-look unless visible"];

/** shot_scale：脸或肢体在画内 */
const FACE_OR_LIMB_SCALES = new Set([
  "extreme_closeup",
  "closeup",
  "bust",
  "waist",
  "full_body",
  "wide",
]);

/** frame_focus：脸部可见 */
const FACE_FOCUS = new Set(["full_face", "upper_face", "single_eye", "lips_chin", "half_face"]);

/** 人体解剖固定模板：不发明画外肢体 */
const ANATOMY_CONSTRAINTS_TEMPLATE = {
  desired: [
    "keep visible limb count and joint positions as seen",
    "keep facial landmark placement when the face is in frame",
    "hands and fingers only as visible; do not complete occluded anatomy",
  ],
  avoid: [
    "extra limbs or fused anatomy",
    "extra or missing fingers when hands are visible",
    "off-frame invented body parts",
    "asymmetric warped facial features unless visible in the source",
  ],
};

/** 按 render_family 查表；watercolor / infographic 别名到邻近族 */
const RENDERING_CONSTRAINTS = {
  photo: {
    desired: ["natural material separation", "fine surface texture"],
    avoid: ["plastic skin", "CGI gloss"],
  },
  cgi: {
    desired: ["physically plausible reflections"],
    avoid: ["waxy skin"],
  },
  illustration: {
    desired: ["clear silhouette", "flat color separation"],
    avoid: ["photoreal pores"],
  },
  flat_graphic: {
    desired: ["hard-edge fills"],
    avoid: ["soft airbrush", "depth blur"],
  },
};

const RENDERING_FAMILY_ALIAS = {
  watercolor: "illustration",
  infographic: "flat_graphic",
};

const FX_TYPE = {
  motion_blur: "motion streak",
  optical_bokeh: "optical bokeh",
  double_exposure: "double exposure overlay",
  volumetric_wrap: "volumetric wrap",
};

const BG_REGION_ROLES = new Set(["background", "sky", "sky_void", "void", "ground"]);

/**
 * @param {unknown} obs
 * @returns {DecompositionProfile}
 */
export function pickDecompositionProfile(obs) {
  const o = obs && typeof obs === "object" ? /** @type {Record<string, unknown>} */ (obs) : {};
  const ct = String(o.content_type || "").toLowerCase();
  if (ct === "product") return "product";
  if (ct === "ui") return "ui";
  if (ct === "poster") return "poster";
  const typography = Array.isArray(o.typography) ? o.typography : [];
  if (typography.some((t) => t && typeof t === "object" && ["title", "caption", "logo"].includes(String(/** @type {any} */ (t).role)))) {
    return "poster";
  }
  if (ct === "scene" || ct === "abstract") return "environment";
  const subjects = Array.isArray(o.subjects) ? o.subjects : [];
  if (!subjects.length && ct !== "portrait") return "environment";
  return "portrait";
}

/**
 * @param {string} label
 */
function genderFromLabel(label) {
  const l = String(label || "").trim().toLowerCase();
  if (/^(woman|girl|female)\b/.test(l)) return "female";
  if (/^(man|boy|male)\b/.test(l)) return "male";
  return undefined;
}

/**
 * @param {Record<string, unknown>} s
 * @returns {string[]}
 */
function visibleFeaturesFromSubject(s) {
  /** @type {string[]} */
  const out = [];
  if (s.skin_tone) out.push(`${String(s.skin_tone).replace(/_/g, " ")} skin tone`);
  if (s.skin_undertone) out.push(`${String(s.skin_undertone)} undertone`);
  if (s.eyes) out.push(String(s.eyes));
  if (s.build) out.push(`${String(s.build).replace(/_/g, " ")} build`);
  if (s.stature) out.push(`${String(s.stature)} stature`);
  if (s.color) {
    const c = String(s.color).trim();
    // 禁止把 VLM 猜的 HEX 写进可见特征
    if (c && !/^#[0-9A-Fa-f]{6}$/.test(c)) out.push(c);
  }
  return out.filter(Boolean);
}

/**
 * @param {Record<string, unknown>} s
 * @returns {string[]}
 */
function distinctiveTraitsFromSubject(s) {
  /** @type {string[]} */
  const out = [];
  if (s.hair) out.push(String(s.hair));
  if (s.facial_hair && s.facial_hair !== "none") out.push(String(s.facial_hair).replace(/_/g, " "));
  if (s.makeup) out.push(String(s.makeup));
  if (s.lip_finish) out.push(`${String(s.lip_finish).replace(/_/g, " ")} lips`);
  if (s.blush && s.blush !== "none") out.push(`${String(s.blush)} blush`);
  return out.filter(Boolean);
}

/**
 * @param {string} wardrobe
 */
function fabricTypeFromWardrobe(wardrobe) {
  const w = String(wardrobe || "").toLowerCase();
  if (/\b(jersey|knit|wool|sweater|ribbed)\b/.test(w)) return "knit textile";
  if (/\b(leather|suede)\b/.test(w)) return "leather";
  if (/\b(satin|silk|chiffon)\b/.test(w)) return "satin";
  if (/\b(denim|jeans|cotton|linen)\b/.test(w)) return "woven cotton";
  if (/\b(trench|coat|wool)\b/.test(w)) return "woven outerwear";
  return undefined;
}

/**
 * @param {unknown} obs
 * @param {DecomposeContext} ctx
 * @returns {Decomposition['meta']}
 */
function mapMeta(obs, ctx) {
  const o = /** @type {Record<string, unknown>} */ (obs || {});
  const rf = String(o.render_family || "unknown");
  const cs = String(o.capture_style || "");
  const finish = String(o.finish || "").trim();
  const climate = String(o.palette_climate || "").replace(/_/g, " ");

  /** @type {string[]} */
  const styleParts = [];
  if (finish) styleParts.push(finish);
  else if (rf === "photo" && cs) styleParts.push(cs.replace(/_/g, " "));
  if (climate && climate !== "natural") styleParts.push(climate);

  let realism = "stylized";
  if (rf === "photo" || rf === "cgi") realism = "photoreal";
  else if (rf === "illustration" && /near-photoreal|hyperdetailed/i.test(finish)) realism = "semi-real";

  const w = Number(ctx.width || ctx.ratioMeta?.w || 0);
  const h = Number(ctx.height || ctx.ratioMeta?.h || 0);
  let aspect = ctx.ratioMeta?.ratioLine || "";
  if (!aspect && w > 1 && h > 1) aspect = `${w}:${h}`;

  /** @type {Decomposition['meta']} */
  const meta = {
    style: styleParts.join(", ") || undefined,
    medium: MEDIUM_MAP[rf] || rf,
    realism_target: /** @type {'photoreal'|'semi-real'|'stylized'} */ (realism),
  };
  if (aspect) meta.aspect_ratio = aspect.replace(/^--ar\s*/i, "").trim();
  if (w > 0 && h > 0) meta.orientation = w >= h ? "landscape" : "portrait";
  return meta;
}

/**
 * @param {unknown} obs
 * @param {Record<string, unknown>|undefined} primary
 * @returns {Decomposition['frame']}
 */
function mapFrame(obs, primary) {
  const o = /** @type {Record<string, unknown>} */ (obs || {});
  const comp = o.composition && typeof o.composition === "object" ? /** @type {Record<string, unknown>} */ (o.composition) : {};

  /** @type {string[]} */
  const cropParts = [];
  const scale = primary ? String(primary.shot_scale || "") : "";
  if (scale && SHOT_SCALE_CROP[scale]) cropParts.push(SHOT_SCALE_CROP[scale]);
  if (primary?.frame_focus) cropParts.push(String(primary.frame_focus).replace(/_/g, " "));
  if (primary?.crop) cropParts.push(String(primary.crop));

  const placement = primary ? String(primary.placement || "") : "";
  const anchor = String(comp.anchor || "");
  let subject_position =
    PLACEMENT_POSITION[placement] ||
    (anchor ? anchor.replace(/-/g, " ") : undefined);

  const ns = String(comp.negative_space || "");
  const negative_space = NEGATIVE_SPACE_PROSE[ns] || ns.replace(/_/g, " ") || undefined;

  /** @type {string[]} */
  let depth_order = [];
  if (Array.isArray(comp.depth_stack)) {
    depth_order = comp.depth_stack.map((t) => String(t).replace(/_/g, " "));
  } else if (primary) {
    depth_order = ["subject", "background"];
  }

  return {
    crop: cropParts.filter(Boolean).join("; ") || undefined,
    subject_position,
    negative_space,
    depth_order: depth_order.length ? depth_order : undefined,
  };
}

/**
 * @param {Record<string, unknown>} s
 */
function mapSubjectEntry(s) {
  const arm = armPosePhrase(s.arm_pose, s.label);
  const poseTorso = subjectPosePhrase(s) || String(s.pose || "").replace(/_/g, " ") || undefined;
  const action = String(s.action || "").trim();

  /** @type {import('./decomposition-types.js').SubjectDecomposition} */
  return {
    id: s.id ? String(s.id) : undefined,
    identity: {
      age_range: ageBandPhrase(s.age) || undefined,
      gender: genderFromLabel(String(s.label || "")),
      build: [s.build, s.stature].filter(Boolean).map((x) => String(x).replace(/_/g, " ")).join(", ") || undefined,
      visible_features: visibleFeaturesFromSubject(s),
      distinctive_traits: distinctiveTraitsFromSubject(s),
    },
    head: {
      orientation: FACING_ORIENTATION[String(s.facing || "")] || String(s.facing || "") || undefined,
      gaze: action || undefined,
      expression: s.expression ? String(s.expression) : undefined,
      mouth: s.mouth ? String(s.mouth).replace(/_/g, " ") : undefined,
      hair: s.hair ? { description: String(s.hair) } : undefined,
    },
    pose: {
      torso: poseTorso,
      left_arm: arm || undefined,
      right_arm: arm || undefined,
    },
    wardrobe: s.wardrobe
      ? {
          description: String(s.wardrobe),
          fabric_type: fabricTypeFromWardrobe(String(s.wardrobe)),
        }
      : undefined,
  };
}

/**
 * @param {unknown} obs
 * @returns {Decomposition['subjects']}
 */
function mapSubjects(obs) {
  const list = Array.isArray(/** @type {any} */ (obs)?.subjects) ? /** @type {any[]} */ (/** @type {any} */ (obs).subjects) : [];
  return list
    .filter((s) => s && typeof s === "object" && s.confidence !== "low")
    .map((s) => mapSubjectEntry(/** @type {Record<string, unknown>} */ (s)));
}

/**
 * @param {unknown} obs
 * @returns {Decomposition['lighting']}
 */
function mapLighting(obs) {
  const l =
    obs && typeof obs === "object" && /** @type {any} */ (obs).lighting && typeof /** @type {any} */ (obs).lighting === "object"
      ? /** @type {Record<string, unknown>} */ (/** @type {any} */ (obs).lighting)
      : null;
  if (!l || l.confidence === "low") return undefined;

  const keySide = String(l.key_side || "");
  const direction = KEY_SIDE_TO_DIRECTION[keySide] || undefined;
  const pattern = String(l.pattern || "");
  const evidence = String(l.evidence || "");

  /** @type {'low'|'medium'|'high'|undefined} */
  let intensity;
  if (l.exposure === "high_key") intensity = "high";
  else if (l.exposure === "low_key") intensity = "low";
  else if (l.exposure === "balanced") intensity = "medium";

  /** @type {Decomposition['lighting']} */
  const out = {
    key_light: {
      direction,
      quality: l.quality === "hard" || l.quality === "soft" ? l.quality : undefined,
      color: climateToColor(String(l.climate || ""), evidence),
      intensity,
    },
    contrast: l.exposure === "high_key" && l.quality === "hard" ? "high" : l.exposure === "low_key" ? "high" : "medium",
    dynamic_range: String(/** @type {any} */ (obs).capture_style || "") === "cinematic" ? "cinematic" : "natural",
    avoid: [...LIGHTING_AVOID_DEFAULT],
  };

  if (pattern === "backlight_rim") {
    out.rim_light = {
      presence: "strong",
      color: /warm|golden|amber|orange/i.test(evidence) ? "warm" : undefined,
      coverage: "localized, not full outline",
    };
  } else if (pattern === "soft_even" || pattern === "split_chiaroscuro") {
    out.fill_light = { direction: "ambient", intensity: "low" };
  }

  if (/bounce|reflect/i.test(evidence)) {
    out.environment_reflection = { description: evidence, emissive_source: false };
  }

  if (!out.key_light?.direction && !out.rim_light && !evidence) return undefined;
  return out;
}

/**
 * @param {string} climate
 * @param {string} evidence
 */
function climateToColor(climate, evidence) {
  if (climate === "golden_hour") return "warm";
  if (climate === "cool_skylight") return "cool";
  if (climate === "tungsten") return "warm";
  if (/cyan|blue|cool/i.test(evidence)) return "cool";
  if (/warm|amber|orange|golden/i.test(evidence)) return "warm";
  if (climate === "daylight" || climate === "overcast") return "neutral";
  return undefined;
}

/**
 * @param {unknown} obs
 * @returns {Decomposition['camera']}
 */
function mapCamera(obs) {
  const c =
    obs && typeof obs === "object" && /** @type {any} */ (obs).camera && typeof /** @type {any} */ (obs).camera === "object"
      ? /** @type {Record<string, unknown>} */ (/** @type {any} */ (obs).camera)
      : null;
  if (!c || c.confidence === "low") return undefined;

  const angle = String(c.angle || "").replace(/_/g, " ");
  const vantage = String(c.vantage || "");
  let view = angle || undefined;
  if (vantage === "worms_eye") view = "low-angle worms-eye";

  const lens = String(c.lens_feel || "");
  const lens_feel = LENS_FEEL_MM[lens] || undefined;

  const fx =
    obs && typeof obs === "object" && /** @type {any} */ (obs).fx && typeof /** @type {any} */ (obs).fx === "object"
      ? /** @type {Record<string, unknown>} */ (/** @type {any} */ (obs).fx)
      : null;
  let depth_of_field = "moderate";
  if (fx?.family === "optical_bokeh") depth_of_field = "shallow";
  else if (String(/** @type {any} */ (obs).render_family) === "flat_graphic") depth_of_field = "deep";

  let motion_capture = "static";
  if (fx?.family === "motion_blur") motion_capture = "motion blur";

  return {
    view,
    lens_feel,
    perspective: lens === "ultra_wide" ? "dramatic" : "natural",
    depth_of_field,
    motion_capture,
  };
}

/**
 * @param {unknown} obs
 * @param {Record<string, unknown>|undefined} primary
 * @returns {Decomposition['composition']}
 */
function mapComposition(obs, primary) {
  const comp =
    obs && typeof obs === "object" && /** @type {any} */ (obs).composition && typeof /** @type {any} */ (obs).composition === "object"
      ? /** @type {Record<string, unknown>} */ (/** @type {any} */ (obs).composition)
      : null;

  const mass = comp ? String(comp.primary_mass || "") : "";
  const visual_focus = mass ? mass.replace(/_/g, " ") : primary ? "subject" : undefined;

  const scale = primary ? String(primary.shot_scale || "") : "";
  /** @type {'small'|'medium'|'dominant'|undefined} */
  let subject_scale;
  if (scale === "wide") subject_scale = "small";
  else if (scale === "extreme_closeup" || scale === "closeup") subject_scale = "dominant";
  else if (scale) subject_scale = "medium";

  const anchor = comp ? String(comp.anchor || "") : "";
  const balance = anchor.includes("center") ? "centered" : anchor ? "asymmetric" : undefined;

  return {
    visual_focus,
    leading_direction: primary?.facing ? String(primary.facing).replace(/_/g, " ") : undefined,
    subject_scale,
    balance,
    empty_space: comp ? NEGATIVE_SPACE_PROSE[String(comp.negative_space || "")] : undefined,
  };
}

/**
 * @param {string} hex
 */
function groundedHex(hex) {
  const h = String(hex || "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(h) ? h : "";
}

/**
 * @param {unknown} obs
 */
function asRecord(obs) {
  return obs && typeof obs === "object" ? /** @type {Record<string, unknown>} */ (obs) : {};
}

/**
 * @param {unknown} obs
 * @returns {Record<string, unknown>[]}
 */
function listOf(obs, key) {
  const raw = asRecord(obs)[key];
  return Array.isArray(raw) ? raw.filter((x) => x && typeof x === "object") : [];
}

/**
 * @param {unknown} obs
 * @param {DecomposeContext} ctx
 * @returns {import('./decomposition-types.js').DecompositionBackground|undefined}
 */
function mapBackground(obs, ctx) {
  const o = asRecord(obs);
  const regions = listOf(obs, "regions");
  const objects = listOf(obs, "objects");
  const labels = [];
  for (const r of regions) {
    const role = String(r.role || "").toLowerCase();
    if (BG_REGION_ROLES.has(role) || /background|sky|void/.test(role)) {
      if (r.label) labels.push(String(r.label));
    }
  }
  for (const obj of objects) {
    const role = String(obj.role || obj.kind || "").toLowerCase();
    if (BG_REGION_ROLES.has(role) || role === "backdrop") {
      if (obj.label) labels.push(String(obj.label));
    }
  }

  const ns = String(asRecord(o.composition).negative_space || "");
  let description = labels.filter(Boolean).join("; ");
  if (!description && (ns === "surround" || ns === "upper")) description = "atmospheric void";

  const finish = String(o.finish || "");
  const fxFam = String(asRecord(o.fx).family || "");
  const climate = String(asRecord(o.lighting).climate || "");
  let texture;
  if (/\bgrain|film\s*grain|iso\s*grit\b/i.test(finish)) texture = "film grain";
  else if (fxFam === "volumetric_wrap" || /haze|fog|smoke/i.test(finish)) texture = "haze";
  else if (String(o.render_family) === "flat_graphic") texture = "clean";
  else if (climate === "overcast") texture = "soft atmospheric";

  /** @type {'minimal'|'moderate'|'dense'|undefined} */
  let density;
  const nObj = objects.length;
  if (ns === "surround" || (ns && ns !== "none" && nObj <= 1)) density = "minimal";
  else if (nObj >= 6) density = "dense";
  else if (description || ns) density = "moderate";

  const anchor_color = groundedHex(ctx.paletteGround?.bg) || undefined;
  if (!description && !texture && !density && !anchor_color) return undefined;

  return { description: description || undefined, anchor_color, texture, density };
}

/**
 * @param {unknown} s
 */
function isHumanSubject(s) {
  if (!s || typeof s !== "object") return false;
  const rec = /** @type {Record<string, unknown>} */ (s);
  const species = String(rec.species || "").toLowerCase();
  if (species && species !== "human" && species !== "unknown") return false;
  if (species === "human") return true;
  const label = String(rec.label || "");
  return Boolean(genderFromLabel(label) || /\b(person|human|woman|man|girl|boy)\b/i.test(label));
}

/**
 * @param {unknown} s
 */
function subjectShowsLimbOrFace(s) {
  if (!s || typeof s !== "object") return false;
  const rec = /** @type {Record<string, unknown>} */ (s);
  if (FACE_OR_LIMB_SCALES.has(String(rec.shot_scale || ""))) return true;
  if (FACE_FOCUS.has(String(rec.frame_focus || ""))) return true;
  return false;
}

/**
 * 解剖约束：仅 human + 脸/肢体可见；product/ui/environment 整段 omit
 * @param {unknown} obs
 * @param {DecompositionProfile} profile
 * @returns {import('./decomposition-types.js').DecompositionConstraintBlock|undefined}
 */
function mapAnatomyConstraints(obs, profile) {
  if (profile === "product" || profile === "ui" || profile === "environment") return undefined;
  const hit = listOf(obs, "subjects").some(
    (s) => s.confidence !== "low" && isHumanSubject(s) && subjectShowsLimbOrFace(s)
  );
  if (!hit) return undefined;
  return {
    desired: [...ANATOMY_CONSTRAINTS_TEMPLATE.desired],
    avoid: [...ANATOMY_CONSTRAINTS_TEMPLATE.avoid],
  };
}

/**
 * 绘制约束：按 render_family 查表，不来自 VLM
 * @param {unknown} obs
 * @returns {import('./decomposition-types.js').DecompositionConstraintBlock|undefined}
 */
function mapRenderingConstraints(obs) {
  const rf = String(asRecord(obs).render_family || "");
  const key = RENDERING_CONSTRAINTS[rf] ? rf : RENDERING_FAMILY_ALIAS[rf];
  const row = key ? RENDERING_CONSTRAINTS[key] : undefined;
  if (!row) return undefined;
  return {
    desired: [...row.desired],
    avoid: [...row.avoid],
  };
}

/**
 * @param {unknown} obs
 */
function hasHumanLikeSubject(obs) {
  return listOf(obs, "subjects").some((s) => {
    if (s.confidence === "low") return false;
    const species = String(s.species || "human");
    return species === "human" || species === "unknown";
  });
}

/**
 * @param {unknown} obs
 * @param {Record<string, unknown>|undefined} primary
 * @returns {import('./decomposition-types.js').DecompositionMaterials|undefined}
 */
function mapMaterials(obs, primary) {
  const rf = String(asRecord(obs).render_family || "unknown");
  /** @type {import('./decomposition-types.js').DecompositionMaterials} */
  const out = {};

  if (hasHumanLikeSubject(obs) && rf !== "ui") {
    const finish = String(primary?.skin_finish || "");
    const stylized = rf === "illustration" || rf === "flat_graphic" || rf === "watercolor" || rf === "infographic";
    let surface;
    if (stylized) surface = rf === "watercolor" ? "watercolor wash skin" : "flat illustration fill";
    else if (SKIN_SURFACE[finish]) surface = SKIN_SURFACE[finish];

    const lip = String(primary?.lip_finish || "");
    let specular;
    if (finish === "dewy_beauty") specular = "localized natural sheen";
    else if (lip === "glossy" || lip === "glassy") specular = "lip gloss specular";

    out.skin = {
      surface,
      micro_detail: stylized ? [] : SKIN_FINISH_DETAIL[finish],
      specular,
      finish: finish ? finish.replace(/_/g, " ") : undefined,
      avoid: MATERIAL_AVOID_SKIN[rf] || MATERIAL_AVOID_SKIN.photo,
    };
    if (!out.skin.micro_detail?.length) delete out.skin.micro_detail;
  }

  const wardrobe = String(primary?.wardrobe || "");
  if (wardrobe && !/\b(shirtless|nude|bare(?:[- ]chested| torso))\b/i.test(wardrobe)) {
    out.fabric = {
      type: fabricTypeFromWardrobe(wardrobe),
      description: wardrobe,
      avoid: [...FABRIC_AVOID],
    };
  }

  const fx = asRecord(asRecord(obs).fx);
  const lighting = asRecord(asRecord(obs).lighting);
  const evidence = `${fx.evidence || ""} ${lighting.evidence || ""}`.trim();
  const fxFam = String(fx.family || "");
  const beams = String(lighting.beams || "");

  if (fxFam === "volumetric_wrap" && fx.confidence !== "low") {
    let kind = "haze";
    if (/\bsmoke\b|烟/i.test(evidence)) kind = "smoke";
    else if (/\bdust\b/i.test(evidence)) kind = "dust";
    else if (/\b(water|splash|spray|mist)\b/i.test(evidence)) kind = "water";
    else if (/\bparticle/i.test(evidence)) kind = "particles";
    else if (/\b(fog|cloud)\b/i.test(evidence)) kind = "fog";
    out.effect_material = {
      type: kind,
      description: String(fx.evidence || "volumetric wrap around subject"),
    };
  } else if (beams === "god_rays") {
    out.effect_material = {
      type: "illuminated haze",
      description: "god-ray shafts through participating medium",
    };
  }

  if (!out.skin && !out.fabric && !out.effect_material) return undefined;
  return out;
}

/**
 * @param {string} evidence
 * @param {string} [zone]
 */
function locationsFrom(evidence, zone) {
  /** @type {string[]} */
  const out = [];
  const z = String(zone || "");
  if (z && z !== "none") out.push(z === "full" ? "full frame" : z.replace(/_/g, " "));
  const e = String(evidence || "").toLowerCase();
  for (const token of [
    "upper-left",
    "upper-right",
    "upper-center",
    "camera-left",
    "camera-right",
    "behind",
    "foreground",
  ]) {
    if (e.includes(token.replace("-", " ")) || e.includes(token)) out.push(token);
  }
  return [...new Set(out)];
}

/**
 * @param {string} evidence
 * @returns {'low'|'medium'|'high'}
 */
function densityFromEvidence(evidence) {
  const e = String(evidence || "");
  if (/\b(dense|thick|heavy|strong)\b/i.test(e)) return "high";
  if (/\b(faint|subtle|thin|light|soft)\b/i.test(e)) return "low";
  return "medium";
}

/**
 * @param {unknown} obs
 * @returns {import('./decomposition-types.js').DecompositionEffects|undefined}
 */
function mapEffects(obs) {
  const o = asRecord(obs);
  const fx = asRecord(o.fx);
  const lighting = asRecord(o.lighting);
  const fxFam = String(fx.family || "");
  const fxOk = fxFam && fxFam !== "none" && fxFam !== "other" && fx.confidence !== "low";
  const beams = String(lighting.beams || "");
  const pattern = String(lighting.pattern || "");

  /** @type {import('./decomposition-types.js').DecompositionPrimaryEffect[]} */
  const items = [];

  // lighting.beams 与 fx.family 分轨，禁止合并成一条
  if (beams === "god_rays") {
    items.push({
      type: "volumetric light shafts",
      locations: locationsFrom(String(lighting.evidence || "")),
      shape_language: ["crepuscular shafts"],
      density: densityFromEvidence(String(lighting.evidence || "")),
    });
  }

  if (fxOk) {
    const axis = String(fx.axis || "");
    items.push({
      type: FX_TYPE[fxFam] || fxFam.replace(/_/g, " "),
      locations: locationsFrom(String(fx.evidence || ""), String(fx.zone || "")),
      motion: fxFam === "motion_blur" ? (axis === "vertical" ? "vertical streak" : "horizontal streak") : undefined,
      shape_language: fxFam === "volumetric_wrap" ? ["front-and-behind wrap"] : undefined,
      density: densityFromEvidence(String(fx.evidence || "")),
    });
  }

  if (pattern === "blinds_slat") {
    items.push({
      type: "slat light",
      locations: locationsFrom(String(lighting.evidence || "")),
      shape_language: ["parallel bars"],
      density: "medium",
    });
  }

  for (const obj of listOf(obs, "objects")) {
    const label = String(obj.label || "");
    if (/\b(splash|spark|particle|droplet|confetti)\b/i.test(label) && obj.confidence !== "low") {
      items.push({
        type: label,
        locations: obj.placement ? [String(obj.placement).replace(/_/g, " ")] : undefined,
      });
    }
  }

  if (!items.length) return undefined;
  const [primary_effect, ...rest] = items;
  return {
    primary_effect,
    secondary_effects: rest.length ? rest : undefined,
  };
}

/**
 * HEX 仅接受 ctx.paletteGround，禁止从 observation 文本猜色号
 * @param {DecomposeContext} ctx
 * @returns {import('./decomposition-types.js').DecompositionColorSystem|undefined}
 */
function mapColorSystem(ctx) {
  const g = ctx.paletteGround;
  if (!g || typeof g !== "object") return undefined;
  const pick = (role) => groundedHex(g[role]);
  /** @type {import('./decomposition-types.js').DecompositionColorSystem} */
  const out = {};
  const bg = pick("bg");
  const skin = pick("skin");
  const hero = pick("hero");
  const accent = pick("accent");
  const glow = pick("glow");
  if (bg) out.background = { anchor: bg };
  if (skin) {
    out.skin = { anchor: skin };
    const hi = pick("skin_hi");
    const lo = pick("skin_lo");
    if (hi) out.skin.highlight = hi;
    if (lo) out.skin.shadow = lo;
  }
  if (hero) out.hero = { anchor: hero };
  if (accent) out.accent = { anchor: accent };
  if (glow) out.effect = { accent: glow };
  else if (accent) out.effect = { accent };
  return Object.keys(out).length ? out : undefined;
}

/**
 * observation → decomposition（纯函数，不调用 VLM）
 * @param {unknown} observation
 * @param {DecomposeContext} [ctx]
 * @returns {Decomposition}
 */
export function decomposeObservation(observation, ctx = {}) {
  if (!observation || typeof observation !== "object") {
    return { profile: "portrait", meta: {}, subjects: [] };
  }

  const profile = ctx.profile && ctx.profile !== "auto" ? ctx.profile : pickDecompositionProfile(observation);
  const subjects = Array.isArray(/** @type {any} */ (observation).subjects) ? /** @type {any[]} */ (/** @type {any} */ (observation).subjects) : [];
  const primary = subjects.find((s) => s && s.salience !== "secondary") || subjects[0];

  const mappedSubjects = mapSubjects(observation);
  const heroHex = groundedHex(ctx.paletteGround?.hero);
  if (heroHex && mappedSubjects[0]?.wardrobe) {
    mappedSubjects[0].wardrobe.base_color = heroHex;
  }

  /** @type {Decomposition} */
  const out = {
    profile,
    meta: mapMeta(observation, ctx),
    frame: mapFrame(observation, primary),
    background: mapBackground(observation, ctx),
    subjects: mappedSubjects,
    materials: mapMaterials(observation, primary),
    effects: mapEffects(observation),
    color_system: mapColorSystem(ctx),
    lighting: mapLighting(observation),
    composition: mapComposition(observation, primary),
    camera: mapCamera(observation),
    anatomy_constraints: mapAnatomyConstraints(observation, profile),
    rendering_constraints: mapRenderingConstraints(observation),
  };

  // 去掉空数组字段
  if (out.subjects?.length === 0) delete out.subjects;
  for (const sub of out.subjects || []) {
    if (sub.identity?.visible_features?.length === 0) delete sub.identity.visible_features;
    if (sub.identity?.distinctive_traits?.length === 0) delete sub.identity.distinctive_traits;
  }

  applyProfileSparse(out, observation);
  return out;
}

/**
 * @param {unknown} obs
 * @returns {{ text: string, role?: string }[]}
 */
function mapTypography(obs) {
  return listOf(obs, "typography")
    .filter((t) => t.confidence !== "low" && t.text)
    .map((t) => ({
      text: String(t.text),
      role: t.role ? String(t.role) : undefined,
    }));
}

/**
 * 按 profile 省略无关区块（不反向喂 compiler）
 * @param {Decomposition} dec
 * @param {unknown} obs
 */
function applyProfileSparse(dec, obs) {
  const profile = dec.profile;
  if (profile === "poster") {
    const ty = mapTypography(obs);
    if (ty.length) {
      dec.typography = ty;
      const titles = ty.filter((t) => t.role === "title" || t.role === "logo").map((t) => t.text);
      if (titles.length) {
        dec.background = dec.background || {};
        const extra = titles.join(" · ");
        dec.background.description = dec.background.description
          ? `${dec.background.description}; on-image type: ${extra}`
          : `on-image type: ${extra}`;
      }
    }
  }

  if (profile === "product" || profile === "ui") {
    for (const sub of dec.subjects || []) {
      if (!sub.identity) continue;
      delete sub.identity.visible_features;
      delete sub.identity.distinctive_traits;
      delete sub.identity.age_range;
      delete sub.identity.gender;
      delete sub.identity.build;
      if (!Object.keys(sub.identity).length) delete sub.identity;
    }
  }

  if (profile === "ui" || profile === "product" || profile === "environment") {
    if (dec.materials?.skin) delete dec.materials.skin;
    if (dec.materials && !dec.materials.fabric && !dec.materials.effect_material) delete dec.materials;
  }

  if (profile === "environment") {
    delete dec.subjects;
    delete dec.anatomy_constraints;
    if (dec.frame) {
      delete dec.frame.crop;
      delete dec.frame.subject_position;
      if (!dec.frame.negative_space && !dec.frame.depth_order) delete dec.frame;
    }
  }

  if (profile === "product" || profile === "ui") {
    delete dec.anatomy_constraints;
  }
}

/**
 * @param {unknown} value
 */
function pruneEmpty(value) {
  if (Array.isArray(value)) {
    return value.map(pruneEmpty).filter((x) => x !== undefined && x !== null && x !== "");
  }
  if (value && typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const next = pruneEmpty(v);
      if (next === undefined || next === null || next === "") continue;
      if (Array.isArray(next) && next.length === 0) continue;
      if (typeof next === "object" && !Array.isArray(next) && !Object.keys(next).length) continue;
      out[k] = next;
    }
    return out;
  }
  return value;
}

/**
 * 导出 decomposition JSON（空对象已剔除）
 * @param {unknown} dec
 */
export function formatDecompositionJson(dec) {
  if (!dec || typeof dec !== "object") return "";
  return `${JSON.stringify(pruneEmpty(dec), null, 2)}\n`;
}

export { SKIN_FINISH_DETAIL };

/**
 * 见闻 JSON → observation IR
 * VLM 只描述可见像素；CLOSED enum 由本地填桶
 */

import {
  coerceAgeBand,
  coerceBlush,
  coerceFacialHair,
  coerceFrameFocus,
  frameFocusHidesMouth,
  cropHidesMouth,
  coerceLensFeel,
  coerceLightBeams,
  coerceLightClimate,
  coerceLightQuality,
  coerceLightSource,
  coerceLipFinish,
  coerceMouth,
  coercePaletteClimate,
  coercePhenotype,
  coerceSkinFinish,
  coerceSkinTone,
  coerceSkinUndertone,
  scrubVagueExpression,
} from "./observation-schema.js";

/**
 * 短识图任务（进 user，不进 system）
 */
export const SIGHT_JSON_HINT = `Look at THIS image only. Return ONE JSON object, no markdown, no Pack fields, no #hex.

Describe visible pixels. Omit anything occluded, off-frame, or uncertain. Do not invent story.
Glowing liquid / splash / particles are NOT proof of CGI or 3D.
If a face is readable, gender, age, and skin are required — never collapse them into the word "person".
If the frame is a product / packshot / still-life / landscape / interior / street / UI / empty scene with NO person, set subject_kind accordingly and OMIT who/gender/skin/hair/eyes/expression/mouth/makeup/wardrobe/arms/frame_focus. Do NOT invent a person.

{
  "subject_kind": "person | product | scene | ui | poster | abstract",
  "medium": "photo | cgi_3d | painted_digital | flat_graphic | other",
  "finish": "5-8 visible technique tokens (brush, cel, grain, splash…)",
  "product": "hero object as seen (device, bottle, packshot). Omit if no product",
  "scene": "place as seen (street, forest, interior). Omit if no readable setting",
  "who": "public-figure name only if unmistakable person, else short appearance. Omit if no person",
  "gender": "woman | man | omit if no readable face or no person",
  "age": "apparent decade as seen (late_teens, early_20s, mid_30s…). Omit if unreadable",
  "skin": "tone fair|light|mid|tan|deep; undertone if readable",
  "skin_texture": "pores | smooth | dewy | soft_focus | omit. pores only if pores are actually readable. smooth = retouch/磨皮 — FORBIDDEN inventing grain. dewy = oily sheen",
  "skin_marks": "freckles/moles as seen. Omit if none",
  "hair": {"length":"buzz | crop | ear | jaw | shoulder | mid-back | waist | bald | omit","color":"as seen (black, dark brown, ash blonde). Omit if unreadable","wave":"straight | wavy | curly | coily | omit","style":"loose | ponytail | bun | braid | updo | slicked | twin-tails | omit","part":"center | side-left | side-right | none | omit","bangs":"full | side | wispy | none | omit","wetness":"wet | oily sheen | omit","note":"one extra visible fact (strands across face, flyaways). Omit unused keys. Omit whole object if hair out of frame"},
  "eyes": {"iris":"color as seen","wetness":"wet tear film | dry | omit","highlight":"catchlight | none | omit","which":"left | right | both | omit"},
  "expression": "brows/eyes fact (squint, furrowed…). No vibe words. Do not put mouth aperture here.",
  "mouth": "closed | pursed | parted | open_teeth | omit if mouth unreadable",
  "gaze": "at camera | averted | down | up | omit if unreadable",
  "colors": "skin / hair / bg families as seen, no #hex. Do not put key-light color here",
  "makeup": {"eyes":"as seen (smoky/liner/none)","lips":"as seen (matte mauve | gloss | natural)","brows":"as seen. Omit unused keys. Omit whole object if bare face"},
  "wardrobe": "garment/collar/neckline/fabric if ANY cloth is visible, even in a face crop (high-neck lace counts). Omit only if no cloth",
  "accessories": "visible jewelry as seen (gold hoop earrings, necklace). Omit if none",
  "facing": "front | profile-left | profile-right | three-quarter | back",
  "right_arm": "visible fact, or omit if out of frame",
  "left_arm": "visible fact, or omit if out of frame",
  "torso": "twist / crop / stance as seen",
  "material_fx": {
    "mode": "replace_limb | wrap | overlay | none",
    "part": "which body part if replace_limb or overlay",
    "material": "water | smoke | energy | other as seen",
    "evidence": "one sentence from pixels"
  },
  "lighting": {"pattern":"rim | split | directional | even | omit","from":"behind-right | behind-left | camera-right | camera-left | overhead | omit","quality":"hard | soft | omit","exposure":"low_key | high_key | omit","beams":"god_rays | none | omit","hue":"key-light color as seen (amber rim). Omit if white","note":"one sentence: halo/shadows/haze as seen. Do not flatten to beauty wrap"},
  "environment": "studio seamless | outdoor | interior | interior void | omit",
  "background": "short",
  "lens": "macro | tele | normal | wide | ultra_wide | omit if unreadable",
  "camera_angle": "eye_level | high_angle | low_angle | omit if unreadable",
  "in_frame": "visible parts only. Face parts (right eye, nose, lips) ONLY if a face is in frame. Omit if no person",
  "frame_focus": "full_face | upper_face | single_eye | lips_chin | half_face | omit if no face",
  "crop": "what the frame cuts away"
}

material_fx.mode:
- replace_limb = a body part IS the material (arm made of water). Not wrap.
- wrap = haze/smoke passes in front of AND behind a still-solid body.
- overlay = glow/particles on top of solid flesh.
- none = no material FX.

JSON only.`;

/**
 * @param {unknown} obj
 */
export function isSightPayload(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (o.observation && typeof o.observation === "object") return false;
  if (o.render_family && Array.isArray(o.subjects)) return false;
  return (
    "medium" in o &&
    ("wardrobe" in o ||
      "material_fx" in o ||
      "right_arm" in o ||
      "left_arm" in o ||
      "pose" in o ||
      "finish" in o ||
      "skin" in o ||
      "gender" in o ||
      "age" in o ||
      "expression" in o ||
      "mouth" in o ||
      "gaze" in o ||
      "colors" in o ||
      "makeup" in o ||
      "skin_marks" in o ||
      "skin_texture" in o ||
      "accessories" in o ||
      "environment" in o ||
      "lighting" in o ||
      "in_frame" in o ||
      "lens" in o ||
      "eyes" in o ||
      "crop" in o ||
      "frame_focus" in o ||
      "subject_kind" in o ||
      "product" in o ||
      "scene" in o)
  );
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>|undefined}
 */
export function fillObservationFromSight(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const s = /** @type {Record<string, unknown>} */ (raw);
  const finishIn = str(s.finish);
  const mediumIn = str(s.medium);
  const subjectKindRaw = str(s.subject_kind).toLowerCase().replace(/[\s-]+/g, "_");
  const axes = mapMedium(mediumIn, finishIn, subjectKindRaw);
  const pose = poseParts(s);
  const who = str(s.who);
  const wardrobe = formatProseSlot(s.wardrobe, 240);
  const accessories = formatProseSlot(s.accessories, 160);
  const background = str(s.background);
  const fx = mapFx(s.material_fx);
  const action = [pose.right, pose.left, pose.torso].filter(Boolean).join("; ");
  const identity = identityFromWho(who, s.gender);
  const person = hasPersonEvidence(s, who, identity);
  const content_type = inferSightContentType(s, who, person);
  const productLabel = productLabelFromSight(s, who, person, content_type);
  const sceneLabel = sceneLabelFromSight(s, who, person, content_type);
  const skinMap = mapSkinAppearance(s.skin, who, s.skin_texture);
  const makeup = formatMakeup(s.makeup);
  const skin_marks = formatSkinMarks(s.skin_marks, skinMap.skin_marks);
  const textureLight = skinMap.skin_finish === "pore_detail";
  const lighting = mapLighting(s.lighting, {
    texture: textureLight,
    environment: s.environment,
  });
  const inFrame = str(s.in_frame);
  const crop = person ? inferCropAnatomy(s.crop, inFrame) : formatProseSlot(s.crop, 160);
  const frameFocus = person
    ? inferFrameFocusFromAnatomy(inFrame, s.frame_focus, crop, who)
    : undefined;
  const shotScale = inferShotScale(crop, action, frameFocus);
  const mass = person
    ? inferPrimaryMass(shotScale)
    : content_type === "product"
      ? "product"
      : inferPrimaryMass(shotScale);
  const hair = inferHair(who, s.hair);
  const facialHair =
    identity.label === "woman" ? "none" : coerceFacialHair(`${who} ${hair || ""}`) || undefined;
  const age = inferAge(s.age, who);
  const expression = inferExpression(s.expression, s.gaze);
  const camera = mapCamera(s.lens, s.camera_angle);
  const mouthHidden = frameFocusHidesMouth(frameFocus) || cropHidesMouth(crop);
  const mouth = mouthHidden
    ? undefined
    : coerceMouth(str(s.mouth)) || coerceMouth(str(s.expression)) || undefined;

  /** @type {Record<string, unknown>} */
  const subject = {
    id: "s1",
    label: identity.label,
    confidence: "high",
    salience: "primary",
    evidence: "visible in frame",
    facing: pose.facing,
    wardrobe,
    accessories,
    pose: inferBodyPose(pose.torso || action),
    arm_pose: inferArmPose(pose.right, pose.left),
    action: action || undefined,
    crop: crop || undefined,
    shot_scale: shotScale,
    frame_focus: frameFocus,
    hair,
    eyes: inferEyesDetailed(s.eyes, who, skinBlob(s.skin)),
    expression,
    mouth,
    makeup,
    skin_marks,
    lip_finish: coerceLipFinish(makeup) || undefined,
    blush: coerceBlush(makeup) || undefined,
    skin_tone: skinMap.skin_tone,
    skin_undertone: skinMap.skin_undertone,
    skin_finish: skinMap.skin_finish,
    phenotype: skinMap.phenotype,
    facial_hair: facialHair,
    age,
    identity_guess: identity.guess,
  };

  let capture_style = inferPhotoCaptureStyle(axes, lighting, s.environment, background);
  if (content_type === "product" && axes.render_family === "photo") capture_style = "product_shot";

  /** @type {Record<string, unknown>[]} */
  const objects = productLabel
    ? [
        {
          id: "o1",
          label: productLabel,
          confidence: "high",
          salience: person ? "secondary" : "primary",
          evidence: "visible in frame",
        },
      ]
    : [];

  /** @type {Record<string, unknown>} */
  const obs = {
    render_family: axes.render_family,
    capture_style,
    content_type,
    presentation: "full_bleed",
    finish: scrubFinishGrain(normalizeFinishProse(finishIn, axes.render_family), skinMap.skin_finish),
    finish_technique: axes.finish_technique,
    palette_climate: coercePaletteClimate(str(s.colors)) || undefined,
    subjects: person ? [subject] : [],
    objects,
    regions: buildSightRegions(sceneLabel, background),
    typography: [],
    camera,
    lighting,
    fx,
    ...(mass || /void|black|empty/i.test(background)
      ? {
          composition: {
            ...(mass ? { primary_mass: mass } : {}),
            ...(/void|black|empty/i.test(background) ? { negative_space: "surround" } : {}),
            confidence: "medium",
            evidence: background || "frame mass",
          },
        }
      : {}),
  };

  return applyHonestyGates(obs);
}

/**
 * 模型 JSON → observation：见闻优先；旧 observation 形状走诚实门
 * @param {unknown} obj
 */
export function observationFromModelJson(obj) {
  if (!obj || typeof obj !== "object") return undefined;
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (isSightPayload(o)) return fillObservationFromSight(o);
  if (o.observation && typeof o.observation === "object" && !Array.isArray(o.observation)) {
    return applyHonestyGates(/** @type {Record<string, unknown>} */ (o.observation));
  }
  return undefined;
}

/**
 * painted 可见时禁止 cgi/flat_graphic；肢体即材质时禁止 wrap
 * @param {unknown} raw
 */
export function applyHonestyGates(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const o = /** @type {Record<string, unknown>} */ ({ ...raw });
  const finish = String(o.finish || "");
  const tech = String(o.finish_technique || "");
  const painted =
    /^painted\b/i.test(finish) ||
    tech === "painted" ||
    /\b(painted_digital|digital paint|painterly|brush)\b/i.test(finish);
  const pbr = /\b(pbr|mesh highlight|hard-surface ior|true 3d mesh)\b/i.test(JSON.stringify(o));
  if (painted && !pbr && (o.render_family === "cgi" || o.render_family === "flat_graphic")) {
    o.render_family = "illustration";
    if (!tech || tech === "unknown") o.finish_technique = "painted";
  }

  const sub = Array.isArray(o.subjects) ? o.subjects[0] : null;
  const fx = o.fx && typeof o.fx === "object" ? /** @type {Record<string, unknown>} */ ({ ...o.fx }) : {};
  const blob = `${sub?.action || ""} ${sub?.wardrobe || ""} ${fx.evidence || ""} ${fx.family || ""}`.toLowerCase();
  if (looksLikeLimbReplace(blob) && fx.family === "volumetric_wrap") {
    fx.family = "other";
    o.fx = fx;
  }
  return o;
}

/**
 * @param {string} medium
 * @param {string} finish
 */
function mapMedium(medium, finish, subjectKind = "") {
  const m = `${medium} ${finish}`.toLowerCase();
  const painted = /\b(painted_digital|painted|digital paint|illustration|splash art|brushstroke|painterly)\b/.test(m);
  if (/\bwatercolor\b/.test(m)) {
    return { render_family: "watercolor", capture_style: "none", finish_technique: "painted" };
  }
  if (painted) {
    return { render_family: "illustration", capture_style: "none", finish_technique: "painted" };
  }
  if (subjectKind === "ui" || /\b(screenshot|web\s?ui|user interface|screen capture|app ui|webpage)\b/.test(m)) {
    return { render_family: "flat_graphic", capture_style: "none", finish_technique: "flat_cartoon" };
  }
  if (/\b(photo|photograph|live[- ]action)\b/.test(m) && !/\bcgi\b/.test(m)) {
    return { render_family: "photo", capture_style: "unknown", finish_technique: "unknown" };
  }
  if (/\b(flat_graphic|hard-edge|posterized|vector)\b/.test(m)) {
    return { render_family: "flat_graphic", capture_style: "none", finish_technique: "flat_cartoon" };
  }
  if (/\b(cgi_3d|cgi|photoreal|pbr|octane|unreal)\b/.test(m)) {
    return { render_family: "cgi", capture_style: "none", finish_technique: "unknown" };
  }
  return { render_family: "unknown", capture_style: "none", finish_technique: "unknown" };
}

/**
 * 照片捕捉风格：只认环境/闪光等可见证据，不因 lighting.source=studio 一律写成影棚
 * @param {{ render_family?: string, capture_style?: string }} axes
 * @param {object|null|undefined} lighting
 * @param {unknown} environment
 * @param {string} background
 */
function inferPhotoCaptureStyle(axes, lighting, environment, background) {
  if (axes.render_family !== "photo") return axes.capture_style;
  const env = `${str(environment)} ${background || ""}`.toLowerCase();
  const pat = String(lighting?.pattern || "");
  if (pat === "flash") return "flash";
  if (/\b(cinematic|filmic|anamorphic)\b/.test(env)) return "cinematic";
  if (/\b(product[\s-]?shot|packshot)\b/.test(env)) return "product_shot";
  if (/\b(studio seamless|seamless backdrop|cyclorama|\bcyc\b)\b/.test(env)) return "studio";
  return axes.capture_style;
}

/**
 * @param {string} finish
 * @param {string} rf
 */
function normalizeFinishProse(finish, rf) {
  const f = String(finish || "").trim();
  if (!f) {
    if (rf === "illustration") return "painted, digital paint";
    if (rf === "flat_graphic") return "other, hard-edge flat fills";
    return undefined;
  }
  if (/^(anime|manga|painted|sketch|other)\b/i.test(f)) return f;
  if (rf === "illustration" || /\bpaint|splash|brush/i.test(f)) return `painted, ${f}`;
  if (rf === "flat_graphic") return `other, ${f}`;
  return f;
}

/**
 * @param {Record<string, unknown>} s
 */
function poseParts(s) {
  const pose = s.pose;
  if (pose && typeof pose === "object" && !Array.isArray(pose)) {
    const p = /** @type {Record<string, unknown>} */ (pose);
    return {
      facing: coerceFacing(p.facing || s.facing),
      right: str(p.right_arm || s.right_arm),
      left: str(p.left_arm || s.left_arm),
      torso: str(p.torso || s.torso),
    };
  }
  const blob = str(pose);
  return {
    facing: coerceFacing(s.facing) || inferFacing(blob),
    right: str(s.right_arm) || captureArm(blob, "right"),
    left: str(s.left_arm) || captureArm(blob, "left"),
    torso: str(s.torso) || blob,
  };
}

const SIGHT_PLACEHOLDER_RE = /^(?:omit|none|n\/a|na|unreadable|unknown|null|undefined|-)$/i;

/**
 * Safely flatten scalars, arrays, and plain objects without emitting "[object Object]".
 * @param {unknown} v
 */
function str(v, depth = 0) {
  if (v == null || depth > 3) return "";
  if (typeof v === "string") {
    const t = v.trim();
    return SIGHT_PLACEHOLDER_RE.test(t) ? "" : t;
  }
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return "";
  if (Array.isArray(v)) {
    return v.map((x) => str(x, depth + 1)).filter(Boolean).join(", ");
  }
  if (typeof v === "object") {
    const rec = /** @type {Record<string, unknown>} */ (v);
    const preferred = [rec.label, rec.name, rec.text, rec.value, rec.description, rec.summary]
      .map((x) => str(x, depth + 1))
      .filter(Boolean);
    if (preferred.length) return preferred.join(", ");
    return Object.entries(rec)
      .filter(([k]) => !/^(id|confidence|evidence|salience|role)$/i.test(k))
      .map(([, val]) => str(val, depth + 1))
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

/**
 * @param {unknown} facing
 */
function coerceFacing(facing) {
  const f = String(facing || "")
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (["front", "profile-left", "profile-right", "three-quarter", "back"].includes(f)) return f;
  // 裸 profile 不猜左右
  return undefined;
}

/**
 * @param {string} blob
 */
function inferFacing(blob) {
  const s = blob.toLowerCase();
  if (!s.trim()) return undefined;
  if (/\bprofile[- ]left|facing left\b/.test(s)) return "profile-left";
  if (/\bprofile[- ]right|facing right\b/.test(s)) return "profile-right";
  if (/\bthree[- ]quarter\b/.test(s)) return "three-quarter";
  if (/\bback(?:[- ]facing)?\b/.test(s)) return "back";
  if (/\bfront[- ]facing|facing (?:the )?viewer|toward (?:the )?camera\b/.test(s)) return "front";
  return undefined;
}

/**
 * @param {string} blob
 * @param {string} side
 */
function captureArm(blob, side) {
  const re = new RegExp(`${side}\\s+arm[^.;]*`, "i");
  const m = blob.match(re);
  return m ? m[0].trim() : "";
}

/**
 * @param {string} torso
 */
function inferBodyPose(torso) {
  const s = torso.toLowerCase();
  if (/\bseated|sitting\b/.test(s)) return "seated";
  if (/\bkneel/.test(s)) return "kneeling";
  if (/\blying|prone\b/.test(s)) return "lying";
  if (/\blean/.test(s)) return "leaning";
  if (/\bwalk/.test(s)) return "walking";
  if (/\bairborne|jump/.test(s)) return "airborne";
  if (/\bstand/.test(s)) return "standing";
  return undefined;
}

/**
 * @param {string} right
 * @param {string} left
 */
function inferArmPose(right, left) {
  const blob = `${right} ${left}`.toLowerCase();
  if (/\bpunch|extended forward|thrust|outstretched\b/.test(blob)) return "raised";
  if (/\bcrossed\b/.test(blob)) return "crossed";
  if (/\bhip\b/.test(blob)) return "on_hips";
  if (/\bbehind\b/.test(blob)) return "behind_back";
  return undefined;
}

/**
 * @param {string} crop
 * @param {string} action
 * @param {string} [frameFocus]
 */
function inferShotScale(crop, action, frameFocus) {
  const focus = coerceFrameFocus(frameFocus) || coerceFrameFocus(crop);
  const s = `${crop} ${action} ${frameFocus || ""}`.toLowerCase();
  if (
    focus === "single_eye" ||
    focus === "lips_chin" ||
    focus === "half_face" ||
    focus === "upper_face"
  ) {
    return "extreme_closeup";
  }
  if (
    /\bextreme close[- ]?up|single eye|eye macro|one eye|only (?:the )?(?:right|left|one) eye|macro close\b/.test(
      s
    )
  ) {
    return "extreme_closeup";
  }
  if (/\b(half[-\s]?face|bridge of (?:the )?nose|lips? and (?:the )?nose)\b/.test(s)) {
    return "extreme_closeup";
  }
  if (focus === "full_face") return "closeup";
  if (/\bclose[- ]?up|face[- ]fill|face filling\b/.test(s)) return "closeup";
  if (/\bbust|chest[- ]up\b/.test(s)) return "bust";
  if (/\bwaist|waist[- ]up\b/.test(s)) return "waist";
  if (/\bfull[- ]body|head[- ]to[- ]toe\b/.test(s)) return "full_body";
  if (/\bwide\b/.test(s)) return "wide";
  if (/\blower (?:torso|chest|waist).{0,20}(clip|cut|fade|void)\b/.test(s)) return "waist";
  return undefined;
}

/**
 * 极近/脸特写不要写成 bust「头肩」主质量，否则生成器会治愈成半身像
 * @param {string|undefined} scale
 */
function inferPrimaryMass(scale) {
  if (scale === "bust") return "bust_face";
  if (scale === "full_body" || scale === "wide") return "full_figure";
  return undefined;
}

/**
 * @param {unknown} explicit
 * @param {string} crop
 * @param {string} who
 */
function inferFrameFocus(explicit, crop, who) {
  return (
    coerceFrameFocus(str(explicit)) ||
    coerceFrameFocus(crop) ||
    coerceFrameFocus(who) ||
    undefined
  );
}

/**
 * @param {string} raw
 */
function hairToken(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

/**
 * @param {string} raw
 */
function normalizeHairLength(raw) {
  const src = String(raw || "").trim();
  const k = hairToken(src);
  if (!k || /^(omit|none|unreadable|n\/a|unknown)$/.test(k)) return "";
  if (/\b(buzz-cut|buzz cut|shaved head|ear-length|jaw-length|shoulder-length|mid-back|waist-length)\b/i.test(src)) {
    return src.replace(/\s+/g, " ").trim();
  }
  if (/bald|shaved/.test(k)) return "bald";
  if (/buzz/.test(k)) return "buzz-cut";
  if (/pixie/.test(k)) return "cropped pixie";
  if (/crop/.test(k)) return "cropped";
  if (/ear/.test(k)) return "ear-length";
  if (/jaw|chin|bob/.test(k)) return "jaw-length";
  if (/shoulder|collarbone|medium/.test(k)) return "shoulder-length";
  if (/mid-?back|below.?shoulder/.test(k)) return "mid-back length";
  if (/waist|hip|very.?long/.test(k)) return "waist-length";
  if (/^long$/.test(k) || k === "long-hair") return "long";
  if (/^short$/.test(k) || k === "short-hair") return "short";
  return "";
}

/**
 * @param {string} raw
 */
function normalizeHairWave(raw) {
  const k = hairToken(raw);
  if (!k || /^(omit|none|unreadable|n\/a|unknown)$/.test(k)) return "";
  if (/coil|kink/.test(k)) return "coily";
  if (/curl/.test(k)) return "curly";
  if (/wav/.test(k)) return "wavy";
  if (/straight/.test(k)) return "straight";
  return "";
}

/**
 * @param {string} raw
 */
function normalizeHairStyle(raw) {
  const k = hairToken(raw);
  if (!k || /^(omit|none|unreadable|n\/a|unknown|loose|down)$/.test(k)) return "";
  if (/twin|pigtail/.test(k)) return "twin-tails";
  if (/pony/.test(k)) return "in a ponytail";
  if (/bun|chignon|topknot/.test(k)) return "in a bun";
  if (/braid|plait/.test(k)) return "in braids";
  if (/up-?do/.test(k)) return "in an updo";
  if (/slick|gel/.test(k)) return "slicked-back";
  if (/hood/.test(k)) return "hood covering hair";
  return "";
}

/**
 * @param {string} raw
 */
function normalizeHairPart(raw) {
  const k = hairToken(raw);
  if (!k || /^(omit|none|unreadable|n\/a|unknown|no-part)$/.test(k)) return "";
  if (/center|middle/.test(k)) return "center part";
  if (/left/.test(k)) return "side part";
  if (/right/.test(k)) return "side part";
  if (/side/.test(k)) return "side part";
  return "";
}

/**
 * @param {string} raw
 */
function normalizeHairBangs(raw) {
  const k = hairToken(raw);
  if (!k || /^(omit|unreadable|n\/a|unknown)$/.test(k)) return "";
  if (/^(none|no|no-bangs)$/.test(k)) return "no bangs";
  if (/wispy|curtain/.test(k)) return "wispy bangs";
  if (/side/.test(k)) return "side-swept bangs";
  if (/full|straight|blunt|fringe/.test(k)) return "full bangs";
  return "";
}

/**
 * @param {string} raw
 */
function normalizeHairWet(raw) {
  const k = hairToken(raw);
  if (!k || /^(omit|none|unreadable|n\/a|unknown|dry)$/.test(k)) return "";
  if (/oil|sheen|gloss/.test(k)) return "oily sheen";
  if (/damp/.test(k)) return "damp";
  if (/wet/.test(k)) return "wet";
  return "";
}

/**
 * 头发：长度 + 卷度 + 颜色 + 发型/分缝/刘海；字符串槽位原样保留
 * @param {string} who
 * @param {unknown} hairField
 */
function inferHair(who, hairField) {
  if (hairField && typeof hairField === "object" && !Array.isArray(hairField)) {
    const o = /** @type {Record<string, unknown>} */ (hairField);
    const length = normalizeHairLength(str(o.length));
    const wave = normalizeHairWave(str(o.wave || o.silhouette));
    const color = str(o.color);
    const style = normalizeHairStyle(str(o.style));
    const part = normalizeHairPart(str(o.part));
    const bangs = normalizeHairBangs(str(o.bangs || o.fringe));
    const wet = normalizeHairWet(str(o.wetness || o.condition));
    const note = str(o.note || o.detail);
    if (length === "bald") return "bald";
    const head = [length, wave, color && !/^(omit|unreadable|n\/a)$/i.test(color) ? color : ""]
      .filter(Boolean)
      .join(" ");
    let core = head;
    if (core && !/\bhair\b/i.test(core) && !/\bbald\b/i.test(core)) core = `${core} hair`;
    /** @type {string[]} */
    const extras = [];
    if (style) extras.push(style);
    if (part) extras.push(part);
    if (bangs) extras.push(bangs);
    if (wet) extras.push(wet);
    if (note && !`${core} ${extras.join(" ")}`.toLowerCase().includes(note.slice(0, 12).toLowerCase())) {
      extras.push(note);
    }
    const out = [core, ...extras].filter(Boolean).join(", ");
    if (out) return out.slice(0, 180);
  }
  const h = str(hairField);
  if (h) return h.slice(0, 180);
  const m = String(who).match(
    /\b((?:short|long|bald|dark|wet|messy|wavy|straight|curly)[^,]{0,60}hair[^,.]{0,60})/i
  );
  return m ? m[1].trim() : undefined;
}

/**
 * @param {string} blob
 */
function inferEyes(blob) {
  const m = String(blob || "").match(
    /\b((?:hazel|amber|green|blue|grey|gray|brown|dark brown)(?:-eyed|\s+eyes?)?)\b/i
  );
  if (!m) return undefined;
  const t = m[1].trim();
  return /\beyes?\b/i.test(t) ? t : `${t} eyes`;
}

/**
 * 眼睛独立槽：虹膜色 / 湿润 / 高光 / 左右眼
 * @param {unknown} eyesField
 * @param {string} who
 * @param {string} skin
 */
function inferEyesDetailed(eyesField, who, skin) {
  /** @type {string[]} */
  const bits = [];
  if (eyesField && typeof eyesField === "object" && !Array.isArray(eyesField)) {
    const o = /** @type {Record<string, unknown>} */ (eyesField);
    const which = str(o.which || o.side);
    if (/^right$/i.test(which)) bits.push("right eye");
    else if (/^left$/i.test(which)) bits.push("left eye");
    else if (/both/i.test(which)) bits.push("both eyes");
    const iris = str(o.iris || o.color);
    if (iris) bits.push(/\biris\b/i.test(iris) ? iris : `${iris} iris`);
    const wet = str(o.wetness || o.moisture);
    if (/\b(wet|moist|tear|dewy|glassy)\b/i.test(wet)) bits.push("wet tear film");
    if (/\bdry\b/i.test(wet)) bits.push("dry eye surface");
    const hi = str(o.highlight || o.catchlight);
    if (hi === "none" || /^none$/i.test(hi)) bits.push("no catchlight");
    else if (hi && !/^(omit|unknown|n\/a)$/i.test(hi)) bits.push("corneal catchlight");
    const extra = str(o.detail);
    if (extra) bits.push(extra);
  }
  const prose = typeof eyesField === "string" ? eyesField : "";
  const fallback = inferEyes(`${prose} ${who} ${skin}`);
  if (fallback && !bits.some((b) => /iris|hazel|amber|green|blue|grey|gray|brown/i.test(b))) {
    bits.unshift(fallback);
  }
  const joined = bits.join(", ").replace(/\s{2,}/g, " ").trim();
  return joined ? joined.slice(0, 140) : undefined;
}

/**
 * 框内解剖 + 裁切边
 * @param {unknown} cropField
 * @param {string} inFrame
 */
function inferCropAnatomy(cropField, inFrame) {
  const cut = str(cropField);
  const inside = str(inFrame);
  if (inside && cut) return `in frame: ${inside}; cropped: ${cut}`.slice(0, 160);
  if (inside) return `in frame: ${inside}`.slice(0, 160);
  return cut || undefined;
}

/**
 * @param {string} inFrame
 * @param {unknown} explicit
 * @param {string} crop
 * @param {string} who
 */
function inferFrameFocusFromAnatomy(inFrame, explicit, crop, who) {
  const parts = String(inFrame || "").toLowerCase();
  if (parts) {
    const hasEye = /\beyes?\b/.test(parts);
    const bothEyes =
      /\bboth eyes\b/.test(parts) || (/\bleft eye\b/.test(parts) && /\bright eye\b/.test(parts));
    const hasLips = /\blips?|mouth\b/.test(parts);
    const hasNose = /\bnose\b/.test(parts);
    if (hasEye && !bothEyes && (hasLips || hasNose)) return "half_face";
    if (hasEye && !bothEyes && !hasLips) return "single_eye";
    if (!hasEye && hasLips) return "lips_chin";
    if (bothEyes && !hasLips) return "upper_face";
    if (bothEyes) return "full_face";
  }
  return inferFrameFocus(explicit, crop, who);
}

/**
 * @param {unknown} lensField
 * @param {unknown} angleField
 */
function mapCamera(lensField, angleField) {
  const lens = coerceLensFeel(str(lensField), str(lensField));
  const angle = coerceAngleLocal(angleField) || undefined;
  if (!lens && !angle) return undefined;
  return {
    ...(angle ? { angle } : {}),
    ...(lens ? { lens_feel: lens } : {}),
    confidence: "high",
    evidence: str(lensField) || str(angleField) || undefined,
  };
}

/**
 * @param {unknown} raw
 */
function coerceAngleLocal(raw) {
  const t = str(raw)
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (["eye_level", "high_angle", "low_angle", "top_down", "orthographic"].includes(t)) return t;
  if (/\beye[-_]?level\b/.test(t)) return "eye_level";
  if (/\bhigh[-_]?angle|from_above\b/.test(t)) return "high_angle";
  if (/\blow[-_]?angle|from_below\b/.test(t)) return "low_angle";
  return "";
}

/**
 * 表情 + 视线合成可见事实；vibe 词会被 scrub 掉
 * @param {unknown} expression
 * @param {unknown} gaze
 */
function inferExpression(expression, gaze) {
  const bits = [];
  const ex = scrubVagueExpression(str(expression));
  if (ex) bits.push(ex);
  const g = inferGazePhrase(gaze, expression);
  if (g && !new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(bits.join(" "))) {
    bits.push(g);
  }
  return scrubVagueExpression(bits.join(", ")) || undefined;
}

/**
 * @param {unknown} gaze
 * @param {unknown} expression
 */
function inferGazePhrase(gaze, expression) {
  const blob = `${str(gaze)} ${str(expression)}`.toLowerCase();
  if (!blob.trim()) return undefined;
  if (/\b(at camera|to (?:the )?lens|eye contact|looking (?:at )?the camera|looking at camera|直视|对镜)\b/.test(blob)) {
    return "gaze at camera";
  }
  if (/\b(averted|looking away|looking aside|off[- ]camera|侧视|目光移开)\b/.test(blob)) {
    return "gaze averted";
  }
  if (/\b(down|downcast|looking down|低头)\b/.test(blob)) return "gaze down";
  if (/\b(up|upward|looking up|仰视)\b/.test(blob)) return "gaze up";
  return undefined;
}

/**
 * @param {unknown} skin
 */
function skinBlob(skin) {
  if (skin == null) return "";
  if (typeof skin === "string") return skin.trim();
  if (typeof skin === "object") return JSON.stringify(skin);
  return String(skin).trim();
}

/**
 * 肤色 / 雀斑 / 人种：只从可见皮肤与外貌词填，不从服饰猜
 * @param {unknown} skin
 * @param {string} who
 * @param {unknown} [textureSlot]
 */
function mapSkinAppearance(skin, who, textureSlot) {
  const blob = `${skinBlob(skin)} ${who || ""}`.trim();
  const fromSlot = coerceSkinFinish(str(textureSlot)) || undefined;
  if (!blob && !fromSlot) {
    return {
      skin_tone: undefined,
      skin_undertone: undefined,
      skin_finish: undefined,
      makeup: undefined,
      skin_marks: undefined,
      phenotype: undefined,
    };
  }
  const skin_tone = coerceSkinTone(blob) || undefined;
  const skin_undertone = coerceSkinUndertone(blob) || undefined;
  let skin_finish = fromSlot || coerceSkinFinish(blob) || undefined;
  const retouched =
    skin_finish === "airbrushed" ||
    skin_finish === "soft_focus" ||
    /\b(smooth|retouch|airbrush|磨皮|美颜)\b/i.test(`${str(textureSlot)} ${blob}`);
  // 磨皮/柔焦优先：浅雀斑不当成纪录片毛孔
  if (retouched && skin_finish === "pore_detail") skin_finish = fromSlot || "airbrushed";
  // 真毛孔+雀斑：不要写成 dewy_beauty（编译器会把雀斑写进负向）
  if (!retouched && /\bfreckle/i.test(blob) && skin_finish === "dewy_beauty") skin_finish = "pore_detail";
  const phenotype = coercePhenotype(blob) || undefined;
  return {
    skin_tone,
    skin_undertone,
    skin_finish,
    skin_marks: inferSkinMarks(blob),
    phenotype,
  };
}

/**
 * 磨皮质感：去掉 finish 里的颗粒/毛孔词，避免 style 把图锁成高锐纪录片
 * @param {string|undefined} finish
 * @param {string|undefined} skinFinish
 */
function scrubFinishGrain(finish, skinFinish) {
  const f = String(finish || "").trim();
  if (!f) return undefined;
  if (skinFinish !== "airbrushed" && skinFinish !== "soft_focus") return f;
  const cleaned = f
    .replace(
      /\b(photoreal(?:istic)?\s+grain|film\s+grain|visible\s+pores?|high[- ]frequency(?:\s+texture)?|pore[- ]level|raw\s+skin\s+texture|documentary\s+grit)\b/gi,
      ""
    )
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .trim();
  if (cleaned) return cleaned;
  return skinFinish === "soft_focus" ? "other, soft focus" : "other, smooth retouch";
}

/**
 * @param {string} blob
 */
function inferSkinMarks(blob) {
  const m = String(blob || "").match(
    /\b(?:dense |heavy |visible |scattered )?freckles?(?:\s+across[^,.;]+)?/i
  );
  if (!m) return undefined;
  return m[0].trim().slice(0, 160);
}

/**
 * 妆容独立槽：只收眼妆/唇/眉，不并入雀斑
 * @param {unknown} makeup
 */
function formatMakeup(makeup) {
  const parts = [];
  if (makeup && typeof makeup === "object" && !Array.isArray(makeup)) {
    const o = /** @type {Record<string, unknown>} */ (makeup);
    for (const k of ["eyes", "brows", "lips"]) {
      const v = str(o[k]);
      if (v && !/^(omit|none|n\/a|unreadable|bare)$/i.test(v)) parts.push(v);
    }
  } else {
    const slot = str(makeup);
    if (slot && !/^(omit|none|n\/a|unreadable|bare)$/i.test(slot)) parts.push(slot);
  }
  return uniqueJoin(parts).slice(0, 200) || undefined;
}

/**
 * @param {unknown} slot
 * @param {string|undefined} fromSkin
 */
function formatSkinMarks(slot, fromSkin) {
  const explicit = formatProseSlot(slot, 160);
  return uniqueJoin([explicit, fromSkin]).slice(0, 160) || undefined;
}

/**
 * @param {unknown} raw
 * @param {number} max
 */
function formatProseSlot(raw, max) {
  const t = str(raw);
  if (!t || /^(omit|none|n\/a|unreadable)$/i.test(t)) return undefined;
  return t.slice(0, max);
}

/**
 * @param {string[]} parts
 */
function uniqueJoin(parts) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const t = String(p || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.join(", ");
}

/**
 * 表观年龄：优先独立 age 槽，再从 who 里的 decade/岁数词填
 * @param {unknown} ageField
 * @param {string} who
 */
function inferAge(ageField, who) {
  if (typeof ageField === "number") {
    const fromNum = coerceAgeBand(String(ageField));
    if (fromNum) return fromNum;
  }
  const fromSlot = coerceAgeBand(str(ageField));
  if (fromSlot) return fromSlot;
  return coerceAgeBand(who) || undefined;
}

/**
 * @param {string} who
 * @param {unknown} gender
 */
function identityFromWho(who, gender) {
  const w = who.trim();
  const g = str(gender).toLowerCase();
  const low = `${w} ${g}`.toLowerCase();
  let label = "person";
  if (g === "woman" || g === "female" || /\b(woman|girl|female|lady)\b/.test(low)) label = "woman";
  else if (g === "man" || g === "male" || /\b(man|boy|male)\b/.test(low)) label = "man";
  const proper = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(w);
  /** @type {{ name: string, kind: string, confidence: string }|undefined} */
  let guess;
  if (proper && !PLACE_NAME.test(w)) {
    guess = { name: w, kind: "celebrity", confidence: "high" };
  }
  return { label, guess };
}

const PERSON_WORD =
  /\b(woman|women|man|men|girl|boy|lady|gentleman|child|children|people|person|portrait|face|celebrity)\b/i;
const GARMENT_WORD =
  /\b(dress|shirt|collar|sleeve|garment|lace|jacket|coat|hoodie|sweater|blouse|tee|jeans|skirt|kimono|cheongsam|qipao|suit|top)\b/i;
const FACE_PART = /\b(eye|eyes|nose|lips|mouth|cheek|forehead|face|iris|chin)\b/i;
const PACKSHOT_ENV = /\b(product[\s-]?shot|packshot|studio seamless|seamless backdrop|cyclorama|\bcyc\b)\b/i;
const PLACE_NAME =
  /\b(square|park|street|st\.?|avenue|ave\.?|road|rd\.?|blvd|boulevard|plaza|alley|valley|beach|mountain|mt\.?|river|bridge|harbor|forest|desert|ocean|lake|island|temple|cathedral|tower|hall|museum|gallery|airport|station|market|district|village|town|bay|canyon|falls|garden|palace|castle|city|building)\b/i;

/**
 * 有可读人物证据才建 subject；默认 label=person 不算证据
 * @param {Record<string, unknown>} s
 * @param {string} who
 * @param {{ label: string, guess?: unknown }} identity
 */
function hasPersonEvidence(s, who, identity) {
  const kind = str(s.subject_kind).toLowerCase().replace(/[\s-]+/g, "_");
  const hasRealWho = Boolean(identity.guess || PERSON_WORD.test(who) || identity.label === "woman" || identity.label === "man");
  const hasFaceParts = FACE_PART.test(str(s.in_frame));
  if (kind === "ui") return hasRealWho && hasFaceParts;
  if (kind === "product" || kind === "scene" || kind === "abstract" || kind === "poster") {
    return hasRealWho && (hasFaceParts || Boolean(str(s.hair) || str(s.eyes) || str(s.expression)));
  }
  if (identity.label === "woman" || identity.label === "man") return true;
  if (identity.guess) return true;
  if (PERSON_WORD.test(who)) return true;
  if (
    str(s.hair) ||
    str(s.eyes) ||
    str(s.makeup) ||
    str(s.mouth) ||
    str(s.expression) ||
    str(s.skin) ||
    str(s.age) ||
    str(s.skin_marks) ||
    str(s.skin_texture) ||
    str(s.gaze)
  ) {
    return true;
  }
  if (str(s.right_arm) || str(s.left_arm)) return true;
  if (hasFaceParts) return true;
  if (str(s.wardrobe) && GARMENT_WORD.test(str(s.wardrobe))) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} s
 * @param {string} who
 * @param {boolean} person
 */
function inferSightContentType(s, who, person) {
  const kind = str(s.subject_kind)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (kind === "person" || kind === "portrait") return "portrait";
  if (kind === "product" || kind === "ui" || kind === "poster" || kind === "abstract") return kind;
  if (kind === "scene") return "scene";
  if (person) return "portrait";
  if (formatProseSlot(s.product, 240) || looksLikeProductFrame(s, who)) return "product";
  return "scene";
}

/**
 * @param {Record<string, unknown>} s
 * @param {string} who
 */
function looksLikeProductFrame(s, who) {
  const blob = `${who} ${str(s.product)} ${str(s.environment)} ${str(s.finish)} ${str(s.background)}`.toLowerCase();
  if (PERSON_WORD.test(who)) return false;
  return PACKSHOT_ENV.test(blob);
}

/**
 * @param {Record<string, unknown>} s
 * @param {string} who
 * @param {boolean} person
 * @param {string} contentType
 */
function productLabelFromSight(s, who, person, contentType) {
  const explicit = formatProseSlot(s.product, 240);
  if (explicit) return explicit;
  if (contentType === "product" && who && !person) return who.slice(0, 240);
  return undefined;
}

/**
 * @param {Record<string, unknown>} s
 * @param {string} who
 * @param {boolean} person
 * @param {string} contentType
 */
function sceneLabelFromSight(s, who, person, contentType) {
  const explicit = formatProseSlot(s.scene, 280);
  if (explicit) return explicit;
  if ((contentType === "scene" || contentType === "abstract") && who && !person) return who.slice(0, 280);
  return undefined;
}

/**
 * @param {string|undefined} sceneLabel
 * @param {string} background
 */
function buildSightRegions(sceneLabel, background) {
  const scene = String(sceneLabel || "").trim();
  const bg = String(background || "").trim();
  /** @type {Record<string, unknown>[]} */
  const regions = [];
  if (scene) {
    regions.push({
      id: "r1",
      label: scene,
      role: "background",
      confidence: "high",
      evidence: "visible ground/void",
    });
  }
  if (bg && (!scene || !regionTextCovers(scene, bg))) {
    regions.push({
      id: regions.length ? "r2" : "r1",
      label: bg,
      role: "background",
      confidence: "high",
      evidence: "visible ground/void",
    });
  }
  return regions;
}

/**
 * @param {string} a
 * @param {string} b
 */
function regionTextCovers(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.includes(y) || y.includes(x)) return true;
  const head = y.slice(0, 24);
  return head.length >= 8 && x.includes(head);
}

/**
 * @param {unknown} lighting
 * @param {{ texture?: boolean, environment?: unknown }} [opts]
 */
function mapLighting(lighting, opts = {}) {
  const rec =
    lighting && typeof lighting === "object" && !Array.isArray(lighting)
      ? /** @type {Record<string, unknown>} */ (lighting)
      : null;
  const s = rec
    ? [rec.pattern, rec.from, rec.quality, rec.exposure, rec.beams, rec.hue, rec.note, rec.evidence]
        .map((x) => str(x))
        .filter(Boolean)
        .join("; ")
    : typeof lighting === "string"
      ? lighting
      : JSON.stringify(lighting || "");
  const env = str(opts.environment);
  const low = `${s} ${env}`.toLowerCase();
  if ((!s.trim() || s === "{}") && !env) return undefined;
  let key_side;
  if (
    /behind[- ]?(?:upper[- ]?)?left|upper[- ]left behind|from behind.{0,24}left|camera[- ]left|from the left|left side/i.test(
      low
    )
  ) {
    key_side = "camera_left";
  } else if (
    /behind[- ]?(?:upper[- ]?)?right|upper[- ]right behind|from behind.{0,24}right|camera[- ]right|from the right|right side/i.test(
      low
    )
  ) {
    key_side = "camera_right";
  } else if (/\b(overhead|from above|ceiling|top[- ]behind)\b/.test(low) && !/\bleft|\bright\b/.test(low)) {
    key_side = "overhead";
  }
  const pattern = inferLightPattern(str(rec?.pattern)) || inferLightPattern(low);
  let quality = coerceLightQuality(str(rec?.quality)) || coerceLightQuality(s) || coerceLightQuality(env);
  if (!quality && /\b(rak(?:e|es|ing)|specular|crisp shadow|direct key)\b/.test(low)) {
    quality = "hard";
  }
  // 毛孔/雀斑质感：不要默认 soft wrap；未写硬/柔则宁缺
  if (opts.texture && quality === "soft") quality = undefined;
  // 气候只认环境/时段词，不从暖橙/青蓝色相猜 golden_hour / daylight
  const climate = coerceLightClimate(env) || coerceLightClimate(s) || undefined;
  const source = coerceLightSource(env) || coerceLightSource(s) || undefined;
  const exposure = /\bhigh[- ]key\b/.test(low)
    ? "high_key"
    : /\b(low[- ]key|shadow[- ]dominant|deep shadows?|underexposed|face in (?:deep )?shadow)\b/.test(low)
      ? "low_key"
      : undefined;
  const beams = coerceLightBeams(str(rec?.beams), `${s} ${env}`) || undefined;
  const evidence = s.slice(0, 220) || env.slice(0, 220);
  return {
    ...(pattern ? { pattern } : {}),
    ...(key_side ? { key_side } : {}),
    ...(quality ? { quality } : {}),
    ...(climate ? { climate } : {}),
    ...(exposure ? { exposure } : {}),
    ...(source ? { source } : {}),
    ...(beams && beams !== "none" ? { beams } : {}),
    confidence: "high",
    evidence,
  };
}

/**
 * 光型只从可见阴影/方向认，不默认 beauty wrap
 * @param {string} low
 */
function inferLightPattern(low) {
  const s = String(low || "").toLowerCase();
  if (!s.trim()) return undefined;
  if (
    /\b(backlight_rim|backlight|backlit|hair[- ]?halo|halo on (?:the )?hair|contour light|逆光|轮廓光)\b/.test(s) ||
    /\brim\b/.test(s) ||
    /\bfrom behind\b/.test(s) ||
    /\bbehind[- ](?:upper[- ]?)?(?:left|right)\b/.test(s)
  ) {
    return "backlight_rim";
  }
  if (
    /\b(split|chiaroscuro|rembrandt)\b/.test(s) ||
    /\b(half[- ]shadowed|one side (?:of (?:the )?face )?(?:in |into )?shadow|far cheek in (?:deep )?shadow|deep shadow on (?:the )?(?:left|right|far) (?:cheek|side))\b/.test(
      s
    )
  ) {
    return "split_chiaroscuro";
  }
  if (/\b(soft even|beauty wrap|shadowless|no (?:visible )?cast shadows?)\b/.test(s) || s === "even") {
    return "soft_even";
  }
  if (/\b(on-camera\s+flash|\bflash\b)/.test(s)) return "flash";
  if (/\b(directional|key from|raking|direct key)\b/.test(s)) return "directional";
  return undefined;
}

/**
 * @param {unknown} fx
 */
function mapFx(fx) {
  if (fx == null || fx === "none") return undefined;
  if (typeof fx === "string") {
    const t = fx.trim();
    if (!t) return undefined;
    const low = t.toLowerCase();
    if (looksLikeLimbReplace(low)) {
      return { family: "other", confidence: "high", evidence: t.slice(0, 220) };
    }
    if (/\bwrap/.test(low) && !looksLikeLimbReplace(low)) {
      return { family: "volumetric_wrap", confidence: "high", evidence: t.slice(0, 220) };
    }
    if (/\bmotion blur/.test(low)) return { family: "motion_blur", confidence: "high", evidence: t.slice(0, 220) };
    if (/\bbokeh/.test(low)) return { family: "optical_bokeh", confidence: "high", evidence: t.slice(0, 220) };
    return { family: "other", confidence: "high", evidence: t.slice(0, 220) };
  }
  if (typeof fx !== "object") return undefined;
  const rec = /** @type {Record<string, unknown>} */ (fx);
  const mode = String(rec.mode || "").toLowerCase();
  const evidence = [rec.part, rec.material, rec.evidence].filter(Boolean).join("; ").slice(0, 220);
  if (mode === "none" || (!mode && !evidence)) return undefined;
  if (mode === "replace_limb" || mode === "replace" || looksLikeLimbReplace(evidence.toLowerCase())) {
    return { family: "other", confidence: "high", evidence: evidence || "limb replaced by visible material" };
  }
  if (mode === "wrap") return { family: "volumetric_wrap", confidence: "high", evidence };
  if (mode === "overlay") return { family: "other", confidence: "high", evidence };
  return evidence ? { family: "other", confidence: "high", evidence } : undefined;
}

/**
 * @param {string} blob
 */
function looksLikeLimbReplace(blob) {
  const s = String(blob || "").toLowerCase();
  if (!/\b(water|liquid|ice|smoke|sand|stone)\b/.test(s)) return false;
  if (/\b(arm|fist|forearm|hand|leg|torso)\b/.test(s) && /\b(is|are|made of|composed of|becomes|replaced)\b/.test(s)) {
    return true;
  }
  return /\b(arm|fist|forearm|hand).{0,80}\b(water|liquid)\b/.test(s) || /\b(water|liquid).{0,40}\b(arm|fist|forearm)\b/.test(s);
}

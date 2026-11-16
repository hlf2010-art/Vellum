/**
 * Observation Schema — 唯一 canonicalization boundary
 * 不可变 normalize；硬错误 / 软警告分离；compiler 只消费本模块输出
 */

import {
  normalizeMediumAxes,
  validateMediumAxesRaw,
} from "./medium-axes.js";

export const PIPELINE_VERSION = "pack-compile-5.4";
export const OBSERVATION_SCHEMA_VERSION = 24;

/** @typedef {"high"|"medium"|"low"} ObsConfidence */
/** @typedef {"ready"|"partial"|"invalid"} ObservationQuality */

const CONF_SET = new Set(["high", "medium", "low"]);
const ANGLE_SET = new Set([
  "eye_level",
  "high_angle",
  "low_angle",
  "top_down",
  "orthographic",
  "unknown",
]);
const LIGHT_SET = new Set([
  "blinds_slat",
  "dappled_foliage",
  "backlight_rim",
  "split_chiaroscuro",
  "directional",
  "flash",
  "soft_even",
  "unknown",
]);
const EXPOSURE_SET = new Set(["high_key", "low_key", "balanced", "unknown"]);
/** 光源族：影棚 vs 自然 vs 混合 */
const LIGHT_SOURCE_SET = new Set(["studio", "natural", "mixed"]);
const LIGHT_SOURCE_ALIAS = {
  softbox: "studio",
  studio_light: "studio",
  artificial: "studio",
  indoor_studio: "studio",
  outdoor: "natural",
  daylight: "natural",
  sunlight: "natural",
  window_light: "natural",
  ambient_daylight: "natural",
  mixed_light: "mixed",
};
/** 软硬质 */
const LIGHT_QUALITY_SET = new Set(["hard", "soft"]);
const LIGHT_QUALITY_ALIAS = {
  harsh: "hard",
  sharp: "hard",
  softbox_soft: "soft",
  diffused: "soft",
  wrap: "soft",
};
/** 色温/时段气候 */
const LIGHT_CLIMATE_SET = new Set([
  "daylight",
  "overcast",
  "golden_hour",
  "cool_skylight",
  "tungsten",
]);
const LIGHT_CLIMATE_ALIAS = {
  noon: "daylight",
  neutral_daylight: "daylight",
  cloudy: "overcast",
  overcast_daylight: "overcast",
  sunset: "golden_hour",
  sunrise: "golden_hour",
  warm_sun: "golden_hour",
  blue_hour: "cool_skylight",
  cool_daylight: "cool_skylight",
  skylight: "cool_skylight",
  indoor_tungsten: "tungsten",
  warm_indoor: "tungsten",
  incandescent: "tungsten",
};
const FX_SET = new Set([
  "motion_blur",
  "double_exposure",
  "optical_bokeh",
  "volumetric_wrap",
  "none",
  "other",
]);
const POSE_SET = new Set([
  "seated",
  "standing",
  "kneeling",
  "lying",
  "leaning",
  "crouching",
  "hugging",
  "hunched",
  "riding",
  "walking",
  "airborne",
  "unknown",
]);
const POSE_ALIAS = {
  sitting: "seated",
  sit: "seated",
  sat: "seated",
  reclining: "lying",
  recline: "lying",
  laying: "lying",
  lying_down: "lying",
  prone: "lying",
  supine: "lying",
  squat: "crouching",
  squatting: "crouching",
  crouch: "crouching",
  kneel: "kneeling",
  jump: "airborne",
  jumping: "airborne",
  mid_jump: "airborne",
  midjump: "airborne",
  lean: "leaning",
  ride: "riding",
  walk: "walking",
  stand: "standing",
  // 环抱 / 低头蜷缩 — 禁止塌成 crouching
  hug: "hugging",
  embracing: "hugging",
  embrace: "hugging",
  self_embrace: "hugging",
  self_embracing: "hugging",
  clutching: "hugging",
  cradling: "hugging",
  curled: "hunched",
  curled_up: "hunched",
  fetal: "hunched",
  tucked: "hunched",
  bowed: "hunched",
};

const ROOT_KEYS = new Set([
  "subjects",
  "objects",
  "regions",
  "typography",
  "camera",
  "lighting",
  "fx",
  "composition",
  "render_family",
  "capture_style",
  "content_type",
  "presentation",
  "finish",
  "finish_technique",
  "palette_climate",
]);

const ITEM_KEYS = new Set([
  "id",
  "label",
  "kind",
  "role",
  "placement",
  "facing",
  "zone",
  "pose",
  "arm_pose",
  "action",
  "expression",
  "mouth",
  "support",
  "relation",
  "age",
  "species",
  "phenotype",
  "build",
  "stature",
  "facial_hair",
  "hair",
  "eyes",
  "shot_scale",
  "frame_focus",
  "crop",
  "lip_finish",
  "blush",
  "makeup",
  "skin_marks",
  "skin_finish",
  "skin_tone",
  "skin_undertone",
  "identity_guess",
  "face_cover",
  "color",
  "wardrobe",
  "accessories",
  "salience",
  "confidence",
  "evidence",
]);
/** 肤色明度闭集：禁 medium 词（与渲染 medium 冲突） */
const SKIN_TONE_SET = new Set(["fair", "light", "mid", "tan", "deep"]);
const SKIN_TONE_ALIAS = {
  pale: "fair",
  porcelain: "fair",
  very_fair: "fair",
  fair_skin: "fair",
  light_skin: "light",
  mid_tone: "mid",
  medium: "mid",
  medium_skin: "mid",
  olive: "mid",
  tanned: "tan",
  tan_skin: "tan",
  bronzed: "tan",
  brown: "deep",
  dark: "deep",
  deep_skin: "deep",
};
/** 肤色冷暖闭集 */
const SKIN_UNDERTONE_SET = new Set(["cool", "warm", "neutral"]);
const SKIN_UNDERTONE_ALIAS = {
  cool_pink: "cool",
  pink: "cool",
  rosy: "cool",
  cold: "cool",
  golden: "warm",
  peach: "warm",
  yellow: "warm",
  olive_undertone: "neutral",
};
/** 景别闭集：与 crop 自由文本正交；防极近美妆特写被治成头肩照 */
const SHOT_SCALE_SET = new Set([
  "extreme_closeup",
  "closeup",
  "bust",
  "waist",
  "full_body",
  "wide",
]);
const SHOT_SCALE_ALIAS = {
  extreme_close_up: "extreme_closeup",
  extreme_close: "extreme_closeup",
  macro: "extreme_closeup",
  beauty_crop: "extreme_closeup",
  face_fill: "extreme_closeup",
  face_filling: "extreme_closeup",
  tight_closeup: "closeup",
  tight_close_up: "closeup",
  headshot: "closeup",
  head_shot: "closeup",
  close_up: "closeup",
  bust_shot: "bust",
  chest_up: "bust",
  waist_up: "waist",
  medium_shot: "waist",
  fullbody: "full_body",
  full_figure: "full_body",
  head_to_toe: "full_body",
  establishing: "wide",
  wide_shot: "wide",
};

/**
 * 画面焦点闭集：与 shot_scale 正交 — 极近不等于「整脸填满」
 * 根因：缺此轴时 extreme_closeup 塌成 full-face beauty crop
 */
const FRAME_FOCUS_SET = new Set([
  "full_face",
  "upper_face",
  "single_eye",
  "lips_chin",
  "half_face",
  "other",
]);
const FRAME_FOCUS_ALIAS = {
  whole_face: "full_face",
  both_eyes: "full_face",
  face_fill: "full_face",
  full_face_fill: "full_face",
  brow_eyes: "upper_face",
  eyes_only: "upper_face",
  upper_half: "upper_face",
  one_eye: "single_eye",
  single_eye_macro: "single_eye",
  eye_macro: "single_eye",
  mono_eye: "single_eye",
  mouth_chin: "lips_chin",
  lips_only: "lips_chin",
  lower_face: "lips_chin",
  split_face: "half_face",
  vertical_half: "half_face",
};

/** 嘴巴开合闭集：禁 vibe，只锁可见开合 */
const MOUTH_SET = new Set(["closed", "pursed", "parted", "open_teeth"]);
const MOUTH_ALIAS = {
  closed_mouth: "closed",
  closed_lips: "closed",
  lips_closed: "closed",
  mouth_closed: "closed",
  sealed: "closed",
  sealed_lips: "closed",
  pursed_lips: "pursed",
  tight_lips: "pursed",
  parted_lips: "parted",
  lips_parted: "parted",
  slightly_parted: "parted",
  slightly_open: "parted",
  open_mouth: "parted",
  mouth_open: "parted",
  teeth_showing: "open_teeth",
  teeth_visible: "open_teeth",
  toothy: "open_teeth",
  wide_open: "open_teeth",
};

/** 唇材质闭集 */
const LIP_FINISH_SET = new Set(["matte", "satin", "gloss", "wet_gloss"]);
const LIP_FINISH_ALIAS = {
  matte_lips: "matte",
  satin_lips: "satin",
  glossy: "gloss",
  gloss_lips: "gloss",
  lip_gloss: "gloss",
  wet_look: "wet_gloss",
  wetlook: "wet_gloss",
  glass_lips: "wet_gloss",
  high_shine: "wet_gloss",
  high_gloss: "wet_gloss",
};
/** 腮红强度闭集 */
const BLUSH_SET = new Set(["none", "soft", "heavy"]);
const BLUSH_ALIAS = {
  no_blush: "none",
  bare: "none",
  natural: "soft",
  light: "soft",
  subtle: "soft",
  light_blush: "soft",
  soft_blush: "soft",
  heavy_blush: "heavy",
  strong: "heavy",
  intense: "heavy",
  dramatic: "heavy",
};
/** 肤质/美容质感闭集（照片与写实脸） */
const SKIN_FINISH_SET = new Set([
  "pore_detail",
  "natural",
  "soft_focus",
  "dewy_beauty",
  "airbrushed",
]);
const SKIN_FINISH_ALIAS = {
  pores: "pore_detail",
  pore: "pore_detail",
  raw_skin: "pore_detail",
  documentary_skin: "pore_detail",
  freckled: "pore_detail",
  natural_skin: "natural",
  softfocus: "soft_focus",
  soft_focus_skin: "soft_focus",
  dewy: "dewy_beauty",
  dewy_skin: "dewy_beauty",
  glassy_skin: "dewy_beauty",
  beauty_skin: "dewy_beauty",
  beauty_retouch: "airbrushed",
  retouched: "airbrushed",
  smooth_filter: "airbrushed",
  porcelain: "airbrushed",
  smooth: "airbrushed",
  smoothed: "airbrushed",
  smooth_skin: "airbrushed",
  beauty_filter: "airbrushed",
};
const SALIENCE_SET = new Set(["primary", "secondary"]);
/** 物种闭集：人/动物/幻想生物；与 phenotype 正交 */
const SPECIES_SET = new Set([
  "human",
  "dog",
  "cat",
  "wolf",
  "fox",
  "bird",
  "horse",
  "cattle",
  "rabbit",
  "dragon",
  "other",
]);
const SPECIES_ALIAS = {
  man: "human",
  woman: "human",
  person: "human",
  people: "human",
  boy: "human",
  girl: "human",
  child: "human",
  canine: "dog",
  puppy: "dog",
  hound: "dog",
  feline: "cat",
  kitten: "cat",
  kitty: "cat",
  avian: "bird",
  eagle: "bird",
  hawk: "bird",
  crow: "bird",
  equine: "horse",
  stallion: "horse",
  mare: "horse",
  cow: "cattle",
  bull: "cattle",
  ox: "cattle",
  bunny: "rabbit",
  wyvern: "dragon",
  creature: "other",
  monster: "other",
  animal: "other",
};
/** 人种/地域外貌闭集：仅脸/肤可读时；禁止从服饰推断 */
const PHENOTYPE_SET = new Set([
  "east_asian",
  "southeast_asian",
  "south_asian",
  "west_asian",
  "north_african",
  "black_african",
  "european",
  "latino",
  "indigenous",
]);
const PHENOTYPE_ALIAS = {
  eastasian: "east_asian",
  asian: "east_asian",
  chinese: "east_asian",
  japanese: "east_asian",
  korean: "east_asian",
  han_chinese: "east_asian",
  southeastasian: "southeast_asian",
  southasian: "south_asian",
  indian: "south_asian",
  westasian: "west_asian",
  middle_eastern: "west_asian",
  middleeastern: "west_asian",
  northafrican: "north_african",
  blackafrican: "black_african",
  african: "black_african",
  african_american: "black_african",
  black: "black_african",
  caucasian: "european",
  white: "european",
  hispanic: "latino",
  latina: "latino",
  native_american: "indigenous",
  indigenous_american: "indigenous",
};
/** 身材闭集：肌肉细分 lean_muscular / muscular / bulky，防塌成笼统 muscular */
const BUILD_SET = new Set([
  "lean",
  "average",
  "athletic",
  "lean_muscular",
  "muscular",
  "bulky",
  "heavy",
  "stocky",
]);
const BUILD_ALIAS = {
  thin: "lean",
  skinny: "lean",
  slim: "lean",
  slender: "lean",
  wiry: "lean",
  normal: "average",
  medium: "average",
  regular: "average",
  fit: "athletic",
  toned: "athletic",
  ripped: "lean_muscular",
  lean_muscle: "lean_muscular",
  defined_muscle: "lean_muscular",
  buff: "bulky",
  bulky_muscular: "bulky",
  bodybuilder: "bulky",
  hyper_muscular: "bulky",
  barrel_chested: "bulky",
  soft_muscular: "muscular",
  moderately_muscular: "muscular",
  overweight: "heavy",
  thick: "stocky",
  stout: "stocky",
};
/** 身高闭集：与 build 正交（tall + muscular）；仅全身可读时锁定 */
const STATURE_SET = new Set(["short", "average", "tall"]);
const STATURE_ALIAS = {
  petite: "short",
  diminutive: "short",
  shorty: "short",
  short_height: "short",
  short_stature: "short",
  medium: "average",
  medium_height: "average",
  normal: "average",
  normal_height: "average",
  average_height: "average",
  towering: "tall",
  very_tall: "tall",
  tall_height: "tall",
  tall_stature: "tall",
};

/**
 * 表观年龄十岁段闭集（禁止仅用 young / middle-aged / old）
 * @type {Set<string>}
 */
const AGE_BAND_SET = new Set([
  "infant",
  "toddler",
  "child",
  "early_teens",
  "late_teens",
  "early_20s",
  "mid_20s",
  "late_20s",
  "early_30s",
  "mid_30s",
  "late_30s",
  "early_40s",
  "mid_40s",
  "late_40s",
  "early_50s",
  "mid_50s",
  "late_50s",
  "early_60s",
  "mid_60s",
  "late_60s",
  "seventies_plus",
]);

/** 粗粒度 / 口语 → 十岁段（兼容旧 observation） */
const AGE_BAND_ALIAS = {
  baby: "infant",
  newborn: "infant",
  infant: "infant",
  toddler: "toddler",
  kid: "child",
  child: "child",
  preteen: "child",
  pre_teen: "child",
  teen: "late_teens",
  teens: "late_teens",
  teenager: "late_teens",
  adolescent: "late_teens",
  early_teen: "early_teens",
  early_teenager: "early_teens",
  late_teen: "late_teens",
  late_teenager: "late_teens",
  young: "early_20s",
  younger: "early_20s",
  young_adult: "early_20s",
  youth: "early_20s",
  twenties: "mid_20s",
  mid_twenties: "mid_20s",
  thirties: "mid_30s",
  mid_thirties: "mid_30s",
  forties: "mid_40s",
  mid_forties: "mid_40s",
  fifties: "mid_50s",
  mid_fifties: "mid_50s",
  sixties: "mid_60s",
  middle_aged: "mid_40s",
  middleaged: "mid_40s",
  midlife: "mid_40s",
  older: "early_60s",
  elderly: "seventies_plus",
  aged: "seventies_plus",
  old: "seventies_plus",
  senior: "seventies_plus",
  geriatric: "seventies_plus",
  "70s": "seventies_plus",
  "70s_plus": "seventies_plus",
  seventies: "seventies_plus",
};
/** 手臂/手势闭集：与全身 pose 正交；含武器握持 */
const ARM_POSE_SET = new Set([
  "at_sides",
  "crossed",
  "behind_back",
  "on_hips",
  "clasped_front",
  "raised",
  "in_pockets",
  "drawing_weapon",
  "two_hand_grip",
  "one_hand_weapon",
]);
const ARM_POSE_ALIAS = {
  arms_at_sides: "at_sides",
  arms_down: "at_sides",
  hands_at_sides: "at_sides",
  arms_crossed: "crossed",
  arms_folded: "crossed",
  folded_arms: "crossed",
  cross_arms: "crossed",
  hands_behind_back: "behind_back",
  behind_the_back: "behind_back",
  parade_rest: "behind_back",
  at_ease: "behind_back",
  hands_on_hips: "on_hips",
  akimbo: "on_hips",
  hands_clasped: "clasped_front",
  clasped_hands: "clasped_front",
  hands_together: "clasped_front",
  hand_raised: "raised",
  arm_raised: "raised",
  hands_raised: "raised",
  hands_in_pockets: "in_pockets",
  pocketed: "in_pockets",
  drawing: "drawing_weapon",
  mid_draw: "drawing_weapon",
  drawing_sword: "drawing_weapon",
  iaido: "drawing_weapon",
  two_handed_grip: "two_hand_grip",
  both_hands_on_hilt: "two_hand_grip",
  two_hand_hilt: "two_hand_grip",
  one_hand_on_hilt: "one_hand_weapon",
  hand_on_hilt: "one_hand_weapon",
  gripping_weapon: "one_hand_weapon",
};
/** 胡须闭集：none=光洁；可读下颌时锁定，防发明/漏掉胡须 */
const FACIAL_HAIR_SET = new Set(["none", "stubble", "mustache", "goatee", "short_beard", "full_beard"]);
const FACIAL_HAIR_ALIAS = {
  clean_shaven: "none",
  cleanshaven: "none",
  shaved: "none",
  no_beard: "none",
  unbearded: "none",
  five_o_clock: "stubble",
  five_oclock: "stubble",
  stubble_beard: "stubble",
  moustache: "mustache",
  mustache_only: "mustache",
  soul_patch: "goatee",
  chinstrap: "goatee",
  van_dyke: "goatee",
  shortbeard: "short_beard",
  trimmed_beard: "short_beard",
  fullbeard: "full_beard",
  thick_beard: "full_beard",
  long_beard: "full_beard",
  bushy_beard: "full_beard",
};
const TYPE_KEYS = new Set([
  "text",
  "role",
  "on",
  "script",
  "placement",
  "lettering",
  "weight",
  "font",
  "family",
  "font_family",
  "confidence",
  "evidence",
]);
const TYPE_ROLE_SET = new Set(["title", "caption", "logo", "garment_print", "prop_print", "other"]);
const TYPE_LETTERING_SET = new Set(["sans", "serif", "script", "display", "mono"]);
const TYPE_LETTERING_ALIAS = {
  sans: "sans",
  sans_serif: "sans",
  sansserif: "sans",
  grotesk: "sans",
  gothic: "sans",
  humanist: "sans",
  serif: "serif",
  roman: "serif",
  didone: "serif",
  slab: "serif",
  slab_serif: "serif",
  script: "script",
  cursive: "script",
  handwriting: "script",
  handwritten: "script",
  signature: "script",
  calligraphy: "script",
  calligraphic: "script",
  copperplate: "script",
  connected_script: "script",
  display: "display",
  decorative: "display",
  ornate: "display",
  blackletter: "display",
  mono: "mono",
  monospace: "mono",
  typewriter: "mono",
};
const TYPE_WEIGHT_SET = new Set(["thin", "regular", "bold", "black"]);
const TYPE_WEIGHT_ALIAS = {
  thin: "thin",
  hairline: "thin",
  light: "thin",
  regular: "regular",
  book: "regular",
  medium: "regular",
  bold: "bold",
  heavy: "black",
  black: "black",
};
const TYPE_ROLE_ALIAS = {
  jersey_print: "garment_print",
  clothing_print: "garment_print",
  print: "garment_print",
  body: "caption",
  headline: "title",
  subtitle: "caption",
  tagline: "caption",
};
const CAMERA_KEYS = new Set(["angle", "vantage", "lens_feel", "confidence", "evidence"]);
const CAMERA_VANTAGE_SET = new Set(["worms_eye", "none"]);
const CAMERA_VANTAGE_ALIAS = {
  worms_eye: "worms_eye",
  worms_eye_view: "worms_eye",
  worm_eye: "worms_eye",
  wormseye: "worms_eye",
  extreme_low: "worms_eye",
  below_hip: "worms_eye",
  hip_level_up: "worms_eye",
  none: "none",
  normal: "none",
  mild: "none",
};
const LENS_FEEL_SET = new Set(["ultra_wide", "wide", "normal", "tele", "macro"]);
const LENS_FEEL_ALIAS = {
  ultra_wide: "ultra_wide",
  ultrawide: "ultra_wide",
  ultra_wide_angle: "ultra_wide",
  "20mm": "ultra_wide",
  "24mm": "ultra_wide",
  fisheye: "ultra_wide",
  wide: "wide",
  wide_angle: "wide",
  "28mm": "wide",
  "35mm": "wide",
  normal: "normal",
  standard: "normal",
  "50mm": "normal",
  tele: "tele",
  telephoto: "tele",
  "85mm": "tele",
  "135mm": "tele",
  macro: "macro",
  macro_lens: "macro",
  beauty_macro: "macro",
  "100mm_macro": "macro",
};

/** 构图骨架：画面质量心带 */
const PRIMARY_MASS_SET = new Set([
  "hips_lower",
  "bust_face",
  "full_figure",
  "product",
  "type_band",
  "sky_void",
  "other",
]);
const PRIMARY_MASS_ALIAS = {
  hips: "hips_lower",
  hip: "hips_lower",
  lower_torso: "hips_lower",
  jeans: "hips_lower",
  face: "bust_face",
  bust: "bust_face",
  beauty_face: "bust_face",
  head: "bust_face",
  full_body: "full_figure",
  whole_body: "full_figure",
  device: "product",
  packshot: "product",
  title: "type_band",
  typography: "type_band",
  poster_type: "type_band",
  sky: "sky_void",
  void: "sky_void",
};

const COMPOSITION_ANCHOR_SET = new Set([
  "upper-left",
  "upper-center",
  "upper-right",
  "mid-left",
  "mid-center",
  "mid-right",
  "lower-left",
  "lower-center",
  "lower-right",
]);

const NEGATIVE_SPACE_SET = new Set([
  "none",
  "upper",
  "upper-left",
  "upper-right",
  "lower",
  "side-left",
  "side-right",
  "surround",
]);
const NEGATIVE_SPACE_ALIAS = {
  top: "upper",
  sky: "upper",
  bottom: "lower",
  left: "side-left",
  right: "side-right",
  packed: "none",
  full: "none",
};

const DEPTH_STACK_SET = new Set([
  "hips_lower",
  "torso",
  "head",
  "product",
  "type",
  "ground",
  "sky",
  "void",
  "other",
]);
const DEPTH_STACK_ALIAS = {
  hips: "hips_lower",
  hip: "hips_lower",
  face: "head",
  bust: "torso",
  typography: "type",
  title: "type",
  floor: "ground",
  clouds: "sky",
};

const COMPOSITION_KEYS = new Set([
  "primary_mass",
  "anchor",
  "negative_space",
  "depth_stack",
  "confidence",
  "evidence",
]);
const LIGHT_KEYS = new Set([
  "pattern",
  "exposure",
  "key_side",
  "source",
  "quality",
  "climate",
  "beams",
  "confidence",
  "evidence",
]);
const KEY_SIDE_SET = new Set(["camera_left", "camera_right", "overhead"]);
/** 体积光柱：与 pattern 正交（directional + god_rays 可共存） */
const LIGHT_BEAMS_SET = new Set(["god_rays", "none"]);
const LIGHT_BEAMS_ALIAS = {
  godray: "god_rays",
  god_ray: "god_rays",
  crepuscular: "god_rays",
  light_shafts: "god_rays",
  light_shaft: "god_rays",
  sun_shafts: "god_rays",
  volumetric_beams: "god_rays",
  shafts: "god_rays",
  no_beams: "none",
  no_shafts: "none",
};
const FX_KEYS = new Set(["family", "confidence", "evidence"]);

const LIMITS = {
  subjects: 12,
  objects: 24,
  regions: 16,
  typography: 32,
  id: 32,
  label: 120,
  evidence: 120,
  text: 240,
  script: 32,
  lettering: 24,
  weight: 16,
  kind: 32,
  role: 32,
  placement: 40,
  facing: 40,
  pose: 48,
  arm_pose: 28,
  action: 140,
  expression: 100,
  mouth: 16,
  support: 80,
  relation: 100,
  age: 32,
  species: 24,
  phenotype: 32,
  build: 32,
  stature: 16,
  facial_hair: 24,
  hair: 180,
  eyes: 140,
  shot_scale: 24,
  frame_focus: 24,
  crop: 160,
  lip_finish: 24,
  blush: 16,
  makeup: 200,
  skin_marks: 160,
  skin_finish: 24,
  skin_tone: 16,
  skin_undertone: 16,
  identity_guess_name: 80,
  face_cover: 24,
  color: 80,
  wardrobe: 240,
  accessories: 160,
  finish: 240,
  palette_climate: 24,
};

/** 色板气候闭集：与 hex 角色色正交；防色相大致对但被生成器抬饱和 */
const PALETTE_CLIMATE_SET = new Set([
  "muted_antique",
  "desaturated",
  "warm_earthy",
  "natural",
  "vivid",
  "neon",
  "monochrome",
]);
const PALETTE_CLIMATE_ALIAS = {
  antique: "muted_antique",
  aged_parchment: "muted_antique",
  parchment: "muted_antique",
  vintage_print: "muted_antique",
  low_chroma: "desaturated",
  muted: "desaturated",
  near_mono: "desaturated",
  near_monochrome: "desaturated",
  earthy: "warm_earthy",
  ochre_sepia: "warm_earthy",
  sepia: "warm_earthy",
  saturated: "vivid",
  high_chroma: "vivid",
  vibrant: "vivid",
  bw: "monochrome",
  black_and_white: "monochrome",
  greyscale: "monochrome",
  grayscale: "monochrome",
};

/**
 * 短指纹（FNV-1a 32-bit → 8 hex）
 * @param {string} text
 */
export function fnv1aHex(text) {
  let h = 0x811c9dc5;
  const s = typeof text === "string" ? text : "";
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** @param {unknown} v */
function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * 严格字符串读取：非 string 不转成 "[object Object]"
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} warnings
 * @param {{ max?: number }} [opts]
 * @returns {string|undefined}
 */
export function readStrictString(value, path, warnings, opts = {}) {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    warnings.push(`${path}:non_string`);
    return undefined;
  }
  const max = opts.max ?? 240;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/**
 * whitelist pick → 新对象（不改原对象）
 * @param {Record<string, unknown>} obj
 * @param {Set<string>} allowed
 * @param {string} path
 * @param {string[]} warnings
 */
function pickAllowedKeys(obj, allowed, path, warnings) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of Object.keys(obj)) {
    if (allowed.has(k)) {
      out[k] = obj[k];
    } else {
      warnings.push(`${path}.extra_key:${k}`);
    }
  }
  return out;
}

/**
 * 身材闭集；unknown/空则 ""
 * @param {unknown} raw
 */
export function coerceBuild(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (BUILD_SET.has(token)) return token;
  if (BUILD_ALIAS[token]) return BUILD_ALIAS[token];
  const low = src.toLowerCase();
  // lean_muscular 先于 lean / muscular
  if (
    /\b(lean[-\s]?muscular|ripped|shredded|defined\s+muscles?|lean\s+muscle)\b/.test(low) ||
    /精瘦肌肉|干练肌肉|线条分明/.test(src)
  ) {
    return "lean_muscular";
  }
  // bulky 先于笼统 muscular
  if (
    /\b(bulky|bodybuilder|hyper[-\s]?muscular|barrel[-\s]?chested|massive\s+arms|thick\s+arms|broad\s+shoulders)\b/.test(
      low
    ) ||
    /壮硕|膀大腰圆|肌肉块|粗臂|宽肩厚胸/.test(src)
  ) {
    return "bulky";
  }
  if (/\b(lean|thin|skinny|slim|slender|wiry)\b/.test(low) || /瘦|纤细|精瘦/.test(src)) return "lean";
  if (/\b(muscular|buff|muscle\s+mass)\b/.test(low) || /肌肉|健美/.test(src)) return "muscular";
  if (/\b(athletic|toned|fit)\b/.test(low) || /匀称|健壮/.test(src)) return "athletic";
  if (/\b(heavy|overweight|obese)\b/.test(low) || /肥胖|厚重/.test(src)) return "heavy";
  if (/\b(stocky|stout|thick[-\s]?set)\b/.test(low) || /敦实|粗壮/.test(src)) return "stocky";
  if (/\b(average|normal|regular|medium\s+build)\b/.test(low) || /中等身材|普通体型/.test(src)) return "average";
  return "";
}

/**
 * 物种闭集；unknown/空则 ""
 * @param {unknown} raw
 */
export function coerceSpecies(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (SPECIES_SET.has(token)) return token;
  if (SPECIES_ALIAS[token]) return SPECIES_ALIAS[token];
  const low = src.toLowerCase();
  if (/\b(human|person|people|man|woman|boy|girl|child)\b/.test(low) || /人类|男人|女人|男孩|女孩/.test(src))
    return "human";
  if (/\b(dogs?|canine|puppy|hound)\b/.test(low) || /狗|犬/.test(src)) return "dog";
  if (/\b(cats?|feline|kitten)\b/.test(low) || /猫/.test(src)) return "cat";
  if (/\b(wolves|wolf)\b/.test(low) || /狼/.test(src)) return "wolf";
  if (/\b(foxes|fox)\b/.test(low) || /狐狸/.test(src)) return "fox";
  if (/\b(birds?|eagle|hawk|crow|avian)\b/.test(low) || /鸟|鹰|鸦/.test(src)) return "bird";
  if (/\b(horses?|equine|stallion|mare)\b/.test(low) || /马/.test(src)) return "horse";
  if (/\b(cattle|cow|bull|ox)\b/.test(low) || /牛/.test(src)) return "cattle";
  if (/\b(rabbits?|bunny)\b/.test(low) || /兔/.test(src)) return "rabbit";
  if (/\b(dragons?|wyvern)\b/.test(low) || /龙/.test(src)) return "dragon";
  if (/\b(creature|monster|beast|animal)\b/.test(low) || /生物|怪兽|动物/.test(src)) return "other";
  return "";
}

/**
 * 人种/地域外貌闭集；仅显式外貌词；unknown/空则 ""
 * @param {unknown} raw
 */
export function coercePhenotype(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (PHENOTYPE_SET.has(token)) return token;
  if (PHENOTYPE_ALIAS[token]) return PHENOTYPE_ALIAS[token];
  const low = src.toLowerCase();
  // southeast 先于 east
  if (/\bsoutheast[-\s]?asian\b/.test(low) || /东南亚/.test(src)) return "southeast_asian";
  if (/\bsouth[-\s]?asian\b/.test(low) || /南亚/.test(src)) return "south_asian";
  if (/\b(west[-\s]?asian|middle[-\s]?eastern)\b/.test(low) || /西亚|中东/.test(src)) return "west_asian";
  if (
    /\b(east[-\s]?asian|han\s+chinese|chinese\s+(?:facial|appearance|features|faces?))\b/.test(low) ||
    /\bkorean(?!\s+(?:text|sign|calligraphy|lettering|hangul|script))\b/.test(low) ||
    /\bjapanese(?!\s+(?:text|sign|calligraphy|lettering|kanji|script|characters?))\b/.test(low) ||
    /东亚|汉族|华人面孔/.test(src)
  ) {
    return "east_asian";
  }
  if (/\bnorth[-\s]?african\b/.test(low) || /北非/.test(src)) return "north_african";
  if (/\b(black[-\s]?african|african[-\s]?american|sub[-\s]?saharan)\b/.test(low) || /非洲裔|黑人面孔/.test(src))
    return "black_african";
  if (/\b(european|caucasian)\b/.test(low) || /欧洲|白人面孔/.test(src)) return "european";
  if (/\b(latino|latina|hispanic)\b/.test(low) || /拉美|拉丁裔/.test(src)) return "latino";
  if (/\b(indigenous|native\s+american)\b/.test(low) || /原住民|印第安/.test(src)) return "indigenous";
  return "";
}

/**
 * 身高闭集；与 build 正交；unknown/空则 ""
 * @param {unknown} raw
 */
export function coerceStature(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (STATURE_SET.has(token)) return token;
  if (STATURE_ALIAS[token]) return STATURE_ALIAS[token];
  const low = src.toLowerCase();
  // 避免 short hair / short beard 误判身高
  if (
    /\b(short\s+(?:stature|height|figure|build)|petite|diminutive)\b/.test(low) ||
    /矮个|个子矮|身材矮小|矮小/.test(src)
  ) {
    return "short";
  }
  if (
    /\b(tall\s+(?:stature|height|figure|man|woman|person)|towering|very\s+tall)\b/.test(low) ||
    /高个|个子高|身材高大|高大修长/.test(src)
  ) {
    return "tall";
  }
  if (/\b(average|medium|normal)\s+height\b/.test(low) || /中等身高|普通身高/.test(src)) return "average";
  return "";
}

/**
 * 由大致岁数映射到十岁段
 * @param {number} n
 */
function ageBandFromNumber(n) {
  if (!Number.isFinite(n) || n < 0 || n > 120) return "";
  if (n < 2) return "infant";
  if (n < 5) return "toddler";
  if (n < 13) return "child";
  if (n < 16) return "early_teens";
  if (n < 20) return "late_teens";
  if (n < 24) return "early_20s";
  if (n < 27) return "mid_20s";
  if (n < 30) return "late_20s";
  if (n < 34) return "early_30s";
  if (n < 37) return "mid_30s";
  if (n < 40) return "late_30s";
  if (n < 44) return "early_40s";
  if (n < 47) return "mid_40s";
  if (n < 50) return "late_40s";
  if (n < 54) return "early_50s";
  if (n < 57) return "mid_50s";
  if (n < 60) return "late_50s";
  if (n < 64) return "early_60s";
  if (n < 67) return "mid_60s";
  if (n < 70) return "late_60s";
  return "seventies_plus";
}

/**
 * 表观年龄十岁段闭集；unknown/空则 ""
 * 接受 early_20s / "early 20s" / "~25" / 旧词 young→early_20s
 * @param {unknown} raw
 */
export function coerceAgeBand(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (AGE_BAND_SET.has(token)) return token;
  if (AGE_BAND_ALIAS[token]) return AGE_BAND_ALIAS[token];

  const low = src.toLowerCase();
  // 数字岁数 / 约数优先
  const numM = low.match(
    /\b(?:about|around|approx(?:imately)?|roughly|~|≈)?\s*(\d{1,3})\s*(?:yo|y\/o|yrs?|years?\s*old)?\b/
  );
  if (numM) {
    const band = ageBandFromNumber(Number(numM[1]));
    if (band) return band;
  }

  // early|mid|late + teens|20s|30s…
  const decadeM = low.match(
    /\b(early|mid(?:dle)?|late)\s*[- ]?(teens?|twenties|thirties|forties|fifties|sixties|20s|30s|40s|50s|60s|70s)\b/
  );
  if (decadeM) {
    let phase = decadeM[1];
    if (phase === "middle") phase = "mid";
    let dec = decadeM[2];
    if (/^teen/.test(dec)) return phase === "late" ? "late_teens" : "early_teens";
    if (/twenties|20s/.test(dec)) return `${phase}_20s`;
    if (/thirties|30s/.test(dec)) return `${phase}_30s`;
    if (/forties|40s/.test(dec)) return `${phase}_40s`;
    if (/fifties|50s/.test(dec)) return `${phase}_50s`;
    if (/sixties|60s/.test(dec)) return `${phase}_60s`;
    if (/70s/.test(dec)) return "seventies_plus";
  }
  if (/\b(in\s+(?:her|his|their)\s+)?(20s|30s|40s|50s|60s)\b/.test(low)) {
    const d = low.match(/\b(20s|30s|40s|50s|60s)\b/)?.[1];
    if (d === "20s") return "mid_20s";
    if (d === "30s") return "mid_30s";
    if (d === "40s") return "mid_40s";
    if (d === "50s") return "mid_50s";
    if (d === "60s") return "mid_60s";
  }
  if (/\b(70s|80s|90s)\b/.test(low) || /七十|八十|高龄/.test(src)) return "seventies_plus";

  if (/\b(infant|newborn|baby)\b/.test(low) || /婴儿|新生儿/.test(src)) return "infant";
  if (/\btoddler\b/.test(low) || /幼儿|学步/.test(src)) return "toddler";
  if (/\b(child|kid|pre[-\s]?teen)\b/.test(low) || /儿童|小孩|少年儿童/.test(src)) return "child";
  if (/\bearly[-\s]?teens?\b/.test(low) || /十三四|早熟少年/.test(src)) return "early_teens";
  if (/\b(late[-\s]?teens?|teenager|adolescent)\b/.test(low) || /青少年|十八九/.test(src)) return "late_teens";
  if (/\b(middle[-\s]?aged|midlife)\b/.test(low) || /中年/.test(src)) return "mid_40s";
  if (/\b(elderly|senior|aged|geriatric)\b/.test(low) || /老年|高龄|长者/.test(src)) return "seventies_plus";
  if (/\bolder\b/.test(low) || /年长|偏老/.test(src)) return "early_60s";
  if (/\b(young\s*adult|youth)\b/.test(low) || /青年|年轻成人/.test(src)) return "early_20s";
  // 裸 young：兼容旧数据 → early_20s（OBSERVE 已禁止再写裸 young）
  if (/^\s*young(er)?\s*$/i.test(src) || /\byoung\b/.test(low)) return "early_20s";

  return "";
}

/**
 * 十岁段 → 提示词短语（early-20s）
 * @param {unknown} raw
 */
export function ageBandPhrase(raw) {
  const band = coerceAgeBand(raw);
  if (!band) return "";
  /** @type {Record<string, string>} */
  const map = {
    infant: "infant",
    toddler: "toddler",
    child: "child",
    early_teens: "early-teens",
    late_teens: "late-teens",
    early_20s: "early-20s",
    mid_20s: "mid-20s",
    late_20s: "late-20s",
    early_30s: "early-30s",
    mid_30s: "mid-30s",
    late_30s: "late-30s",
    early_40s: "early-40s",
    mid_40s: "mid-40s",
    late_40s: "late-40s",
    early_50s: "early-50s",
    mid_50s: "mid-50s",
    late_50s: "late-50s",
    early_60s: "early-60s",
    mid_60s: "mid-60s",
    late_60s: "late-60s",
    seventies_plus: "70s+",
  };
  return map[band] || band.replace(/_/g, "-");
}

/**
 * 胡须闭集；unknown/空则 ""；none = 明确光洁无胡
 * @param {unknown} raw
 */
export function coerceFacialHair(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (FACIAL_HAIR_SET.has(token)) return token;
  if (FACIAL_HAIR_ALIAS[token]) return FACIAL_HAIR_ALIAS[token];
  const low = src.toLowerCase();
  // none 须显式光洁词，禁止从「没写」推断
  if (
    /\b(clean[-\s]?shaven|no\s+beard|beardless|shaved\s+face|smooth[-\s]?shaven)\b/.test(low) ||
    /光洁|无胡|没胡子|刮净|不留胡/.test(src)
  ) {
    return "none";
  }
  if (/\b(full\s+beard|thick\s+beard|bushy\s+beard|long\s+beard|heavy\s+beard)\b/.test(low) || /络腮|大胡子|浓密胡/.test(src))
    return "full_beard";
  if (/\b(short\s+beard|trimmed\s+beard|neat\s+beard)\b/.test(low) || /短须|修剪胡/.test(src)) return "short_beard";
  if (/\b(goatee|soul\s*patch|chinstrap|van\s*dyke)\b/.test(low) || /山羊胡|腮须/.test(src)) return "goatee";
  if (/\b(moustache|mustache)\b/.test(low) || /八字胡|髭|小胡子/.test(src)) return "mustache";
  if (/\b(stubble|five[-\s]?o[’']?clock|light\s+beard)\b/.test(low) || /胡茬|青茬/.test(src)) return "stubble";
  // 泛称 beard / 有胡子 → short_beard（比 full 更保守）
  if (/\bbearded\b|\bbeard\b/.test(low) || /胡子|胡须/.test(src)) return "short_beard";
  return "";
}

/**
 * 手臂/手势闭集；与全身 pose 正交；unknown/空则 ""
 * @param {unknown} raw
 */
export function coerceArmPose(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (ARM_POSE_SET.has(token)) return token;
  if (ARM_POSE_ALIAS[token]) return ARM_POSE_ALIAS[token];
  const low = src.toLowerCase();
  // behind_back 先于 crossed，避免「双手背后交叉」误判
  if (
    /\b(hands?\s+(?:clasped\s+)?behind\s+(?:the\s+)?back|arms?\s+behind\s+(?:the\s+)?back|parade\s+rest|at\s+ease)\b/.test(
      low
    ) ||
    /背手|双手背后|背在身后|稍息/.test(src)
  ) {
    return "behind_back";
  }
  // 拔刀 / 握武器 先于笼统 clasped
  if (
    /\b(draw(?:ing)?\s+(?:a\s+)?(?:sword|katana|blade|weapon)|mid[-\s]?draw|iaido|about\s+to\s+draw)\b/.test(low) ||
    /拔刀|出鞘|抽刀|将拔/.test(src)
  ) {
    return "drawing_weapon";
  }
  if (
    /\b(both\s+hands?\s+on\s+(?:the\s+)?(?:hilt|sword|katana)|two[-\s]?hand(?:ed)?\s+grip|hands?\s+clasped\s+on\s+(?:the\s+)?hilt)\b/.test(
      low
    ) ||
    /双手握刀|双手持柄|双手握持/.test(src)
  ) {
    return "two_hand_grip";
  }
  if (
    /\b((?:one\s+)?hand\s+on\s+(?:the\s+)?(?:hilt|sword|katana)|gripping\s+(?:a\s+)?(?:sword|weapon)|holding\s+(?:a\s+)?(?:sword|katana))\b/.test(
      low
    ) ||
    /单手握刀|握柄|持刀于腰/.test(src)
  ) {
    return "one_hand_weapon";
  }
  if (
    /\b(arms?\s+crossed|crossed\s+arms|arms?\s+folded|folded\s+arms)\b/.test(low) ||
    /抱臂|双臂交叉|交叉抱胸|环胸/.test(src)
  ) {
    return "crossed";
  }
  if (/\b(hands?\s+on\s+hips|akimbo)\b/.test(low) || /叉腰|双手叉腰/.test(src)) return "on_hips";
  if (
    /\b(hands?\s+clasped(?:\s+in\s+front)?|clasped\s+hands|hands?\s+together\s+in\s+front)\b/.test(low) ||
    /双手交握|合十|抱拳于前/.test(src)
  ) {
    return "clasped_front";
  }
  if (/\b(hands?\s+in\s+(?:the\s+)?pockets?|pocketed\s+hands)\b/.test(low) || /插手|插兜/.test(src))
    return "in_pockets";
  if (/\b((?:one|both)\s+)?(hand|arm)s?\s+raised|raised\s+(hand|arm)s?\b/.test(low) || /举手|扬手|抬臂/.test(src))
    return "raised";
  if (/\b(arms?\s+at\s+(?:the\s+)?sides|hands?\s+at\s+(?:the\s+)?sides|arms?\s+down)\b/.test(low) || /垂手|双手垂放/.test(src))
    return "at_sides";
  return "";
}

/**
 * pose 闭集；sitting/reclining 等别名折进枚举；unknown/空则省略
 * @param {unknown} raw
 */
export function coercePose(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a)$/i.test(src)) return "";
  const pose = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (pose === "unknown") return "";
  if (POSE_SET.has(pose)) return pose;
  if (POSE_ALIAS[pose]) return POSE_ALIAS[pose];
  const low = src.toLowerCase();
  // hugging / hunched 必须先于 crouching，否则「低头环抱」会塌成 crouching
  if (
    /\b(hugging|embracing|self[-\s]?embrac|clutching|cradling|arms?\s+wrapped|holding\s+(?:himself|herself|themselves|the\s+rifle\s+to))\b/.test(
      low
    ) ||
    /环抱|拥抱|抱住|抱枪/.test(src)
  ) {
    return "hugging";
  }
  if (
    /\b(hunched|curled(?:\s+up)?|fetal|head\s+bowed|head\s+down|tucked\s+in)\b/.test(low) ||
    /低头|蜷缩|弓身/.test(src)
  ) {
    return "hunched";
  }
  if (/\b(seated|sitting)\b/.test(low)) return "seated";
  if (/\bstanding\b/.test(low)) return "standing";
  if (/\b(kneeling|kneel)\b/.test(low)) return "kneeling";
  if (/\b(lying|reclining|prone|supine)\b/.test(low)) return "lying";
  if (/\b(leaning|lean)\b/.test(low)) return "leaning";
  if (/\b(crouching|squatting)\b/.test(low)) return "crouching";
  if (/\b(riding|ride)\b/.test(low)) return "riding";
  if (/\bwalking\b/.test(low)) return "walking";
  if (/\b(airborne|jumping|mid[-\s]?jump)\b/.test(low)) return "airborne";
  return "";
}

/** 脸被遮住：mask/helmet 不可读脸；hood 仍可能露脸 */
const FACE_COVER_SET = new Set(["mask", "helmet", "hood", "none"]);
const FACE_COVER_ALIAS = {
  full_mask: "mask",
  full_face_mask: "mask",
  costume_mask: "mask",
  visor: "helmet",
  helmet_visor: "helmet",
  cowl: "mask",
  balaclava: "mask",
  hood_up: "hood",
};

/**
 * face_cover 闭集；空则 ""
 * @param {unknown} raw
 */
export function coerceFaceCover(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (FACE_COVER_SET.has(token) && token !== "none") return token;
  if (FACE_COVER_ALIAS[token]) return FACE_COVER_ALIAS[token];
  const low = src.toLowerCase();
  // 分组优先：避免 scowling / masking tape 误命中
  if (/\b(?:(?:full[-\s]?face\s+)?mask|cowl|balaclava)\b/.test(low)) return "mask";
  if (/\b(helmet|visor)\b/.test(low)) return "helmet";
  // hood 只认明确短语，不因 hooded + over 共现判定
  if (
    /\bhood\s+up\b/.test(low) ||
    /\bhood\s+pulled\s+up\b/.test(low) ||
    /\bhood\s+over\s+head\b/.test(low) ||
    /\bhood\s+covering\s+head\b/.test(low)
  ) {
    return "hood";
  }
  return "";
}

/** @param {object|null|undefined} s */
export function isFaceCovered(s) {
  const cover =
    coerceFaceCover(s?.face_cover) ||
    coerceFaceCover(
      [s?.label, s?.wardrobe, s?.evidence].filter((x) => typeof x === "string").join(" ")
    );
  return cover === "mask" || cover === "helmet";
}

/**
 * 技法桶闭集（VLM 直接判断；与 pack-compiler applyFinishTechniqueBand 对齐）
 * @typedef {"line_art"|"hard_cel"|"ink_print"|"soft_color_draw"|"tonal_sketch"|"painted"|"flat_cartoon"|"unknown"} FinishTechnique
 */
const FINISH_TECHNIQUE_SET = new Set([
  "line_art",
  "hard_cel",
  "ink_print",
  "soft_color_draw",
  "tonal_sketch",
  "painted",
  "flat_cartoon",
  "unknown",
]);

/**
 * @param {unknown} raw
 * @returns {FinishTechnique}
 */
export function coerceFinishTechnique(raw) {
  if (raw == null || typeof raw !== "string") return "unknown";
  const s = raw.trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (FINISH_TECHNIQUE_SET.has(s)) return /** @type {FinishTechnique} */ (s);
  if (/line_?art|linework|线稿|线描|contour_only|outline_only/.test(s)) return "line_art";
  if (
    /flat_cartoon|angular_cartoon|graphic_cartoon|minimalist_cartoon|flat_vector_character|limited_palette_cartoon|几何卡通|扁平卡通|角形卡通/.test(
      s
    ) ||
    /angular_caricature|geometric_hair|pupil_?less/.test(s)
  ) {
    return "flat_cartoon";
  }
  if (/hard_?cel|cel_shadow|flat_cel/.test(s)) return "hard_cel";
  if (/ink_print|screentone|ink_heavy|crosshatch|ben_?day|superhero|ligne_claire|\bbd\b/.test(s)) {
    return "ink_print";
  }
  if (/soft_color|soft_shaded|webtoon|full_color_vertical|条漫/.test(s)) return "soft_color_draw";
  if (/tonal_sketch|graphite|charcoal|pencil_sketch|素描/.test(s)) return "tonal_sketch";
  if (/painted|gouache|oil|impasto|watercolor|sumi|painterly|airbrush/.test(s)) return "painted";
  return "unknown";
}

/** finish 分类：首 token 闭集 */
const FINISH_CLASS_SET = new Set(["anime", "manga", "painted", "sketch", "other"]);
const FINISH_CLASS_ALIAS = {
  manhua: "manga",
  webtoon: "manga",
  web_toon: "manga",
  comic: "manga",
  bd: "manga",
  cel: "anime",
  cel_shaded: "anime",
  charcoal: "sketch",
  graphite: "sketch",
  pencil: "sketch",
  // 水墨/书法笔触数字绘 → painted（非炭笔素描）
  ink_wash: "painted",
  sumi_e: "painted",
  sumie: "painted",
  suibokuga: "painted",
  soft_painted: "painted",
  painterly: "painted",
  oil: "painted",
  gouache: "painted",
  impasto: "painted",
};

/**
 * illustration finish 首档 → anime|manga|painted|sketch|other；空则 ""
 * @param {unknown} raw
 */
export function coerceFinishClass(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src) return "";
  // 逗号分段首词；保留 underscore 以便 ink_wash / soft_painted 命中 alias
  const head = src
    .toLowerCase()
    .split(/[,:]/)[0]
    .trim()
    .replace(/[\s-]+/g, "_");
  if (FINISH_CLASS_SET.has(head)) return head;
  if (FINISH_CLASS_ALIAS[head]) return FINISH_CLASS_ALIAS[head];
  // "ink_wash_tonal" → 前缀匹配 alias
  for (const [alias, cls] of Object.entries(FINISH_CLASS_ALIAS)) {
    if (head === alias || head.startsWith(`${alias}_`)) return cls;
  }
  const first = head.split("_")[0];
  if (FINISH_CLASS_SET.has(first)) return first;
  const low = src.toLowerCase();
  // 水墨/书法笔触绘先于素描 ink_wash，避免 sumi-e 塌成 sketch
  if (
    /水墨|墨绘|书法笔触|泼墨/.test(src) ||
    /\b(sumi[-\s]?e|suibokuga|calligraphic\s+ink|ink[_\s-]*wash|gestural\s+ink\s+splash|ink\s+splash\s+streaks)\b/.test(
      low
    )
  ) {
    return "painted";
  }
  // 扁平角形卡通 → other（勿塌成 anime）
  if (
    /扁平卡通|角形卡通|几何卡通/.test(src) ||
    /\b(flat\s+angular\s+cartoon|angular\s+(?:flat\s+)?cartoon|minimalist\s+(?:flat\s+)?cartoon|graphic\s+flat\s+cartoon|flat\s+vector\s+character|geometric\s+caricature)\b/.test(
      low
    )
  ) {
    return "other";
  }
  // CJK 不用 \b；炭笔/铅笔/排线才进 sketch
  if (
    /素描|炭笔|铅笔|石膏|速写/.test(src) ||
    /\b(charcoal|graphite|pencil|cross[-\s]?hatch|hatching|plaster|statue|stone\s+figure|monochrome\s+sketch|construction\s+lines?)\b/.test(
      low
    )
  ) {
    return "sketch";
  }
  if (/二次元/.test(src) || /\b(anime|cel[-\s]?shad)\b/.test(low)) return "anime";
  if (/漫画/.test(src) || /\b(manga|manhua)\b/.test(low)) return "manga";
  if (
    /\b(painted|painterly|oil|impasto|gouache|soft[_\s-]?painted|soft\s+blended|soft\s+blend|speed[-\s]?paint)\b/.test(
      low
    )
  ) {
    return "painted";
  }
  if (/\b(?:no[-\s]?outlines?|without\s+outlines?|no\s+hard\s+(?:ink\s+)?outlines?)\b/.test(low)) {
    return "painted";
  }
  return "";
}

/**
 * 规范化 finish：首 token 闭集 + 可选描述；裸 other 无效
 * @param {unknown} raw
 * @param {string[]} warnings
 * @param {string} path
 * @returns {string}
 */
function canonicalizeFinish(raw, warnings, path) {
  const src = readStrictString(raw, path, warnings, { max: LIMITS.finish });
  if (!src) return "";
  if (/^other$/i.test(src)) {
    warnings.push(`${path}:bare_other`);
    return "";
  }
  const cls = coerceFinishClass(src);
  if (!cls) {
    warnings.push(`${path}:unrecognized`);
    return "";
  }
  const rest = src
    .replace(/^[^,]+/, "")
    .replace(/^[,:\s]+/, "")
    .trim();
  // 已有合法首 token 则保留后续；否则用 class 作为首 token
  const firstTok = src.split(/[,:]/)[0].trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (FINISH_CLASS_SET.has(firstTok.split(/[_,]/)[0]) || FINISH_CLASS_ALIAS[firstTok.split(/[_,]/)[0]]) {
    const canonFirst = FINISH_CLASS_ALIAS[firstTok.split(/[_,]/)[0]] || firstTok.split(/[_,]/)[0];
    return rest ? `${canonFirst}, ${rest}`.slice(0, LIMITS.finish) : canonFirst;
  }
  return rest ? `${cls}, ${rest}`.slice(0, LIMITS.finish) : cls;
}

/**
 * 极端仰拍闸门：worms_eye | none（与 angle 正交）
 * @param {unknown} raw
 * @param {unknown} [evidence]
 */
export function coerceCameraVantage(raw, evidence = "") {
  if (raw != null && typeof raw === "string") {
    const src = raw.trim();
    if (src && !/^(n\/a|unknown|unreadable)$/i.test(src)) {
      const token = src.toLowerCase().replace(/['']/g, "").replace(/[\s-]+/g, "_");
      if (CAMERA_VANTAGE_SET.has(token)) return token;
      if (CAMERA_VANTAGE_ALIAS[token]) return CAMERA_VANTAGE_ALIAS[token];
      if (
        /\b(worm'?s?[-\s]?eye|below\s+hip|below\s+waist|hips?\s+dominat|exaggerated\s+(?:perspective\s+)?foreshorten)\b/i.test(
          src
        ) ||
        /超低机位|髋下仰拍|虫瞰|臀部前景/.test(src)
      ) {
        return "worms_eye";
      }
    }
  }
  const ev = typeof evidence === "string" ? evidence : String(evidence || "");
  if (
    /\b(worm'?s?[-\s]?eye|below\s+hip|below\s+waist|hip[-\s]?level\s+up|camera\s+below\s+(?:the\s+)?hip|hips?\s+dominat|exaggerated\s+(?:perspective\s+)?foreshorten)\b/i.test(
      ev
    ) ||
    /超低机位|髋下仰拍|虫瞰|臀部前景/.test(ev)
  ) {
    return "worms_eye";
  }
  if (/\b(vantage\s*=\s*none|not\s+worms?\s*eye|mild\s+low[-\s]?angle)\b/i.test(ev)) {
    return "none";
  }
  return "";
}

/**
 * 镜头感闭集（可读才写）
 * @param {unknown} raw
 * @param {unknown} [evidence]
 */
export function coerceLensFeel(raw, evidence = "") {
  if (raw != null && typeof raw === "string") {
    const src = raw.trim();
    if (src && !/^(n\/a|unknown|unreadable)$/i.test(src)) {
      const token = src.toLowerCase().replace(/['']/g, "").replace(/[\s-]+/g, "_");
      if (LENS_FEEL_SET.has(token)) return token;
      if (LENS_FEEL_ALIAS[token]) return LENS_FEEL_ALIAS[token];
      if (/\bmacro\b/i.test(src) || /微距/.test(src)) return "macro";
      if (/\b(20|22|24)\s*mm\b/i.test(src) || /超广角/.test(src)) return "ultra_wide";
      if (/\b(28|35)\s*mm\b/i.test(src) || /广角/.test(src)) return "wide";
      if (/\b(50|55)\s*mm\b/i.test(src)) return "normal";
      if (/\b(85|100|105|135)\s*mm\b/i.test(src) || /长焦/.test(src)) return "tele";
    }
  }
  const ev = typeof evidence === "string" ? evidence : String(evidence || "");
  if (/\bmacro\b/i.test(ev) || /微距/.test(ev)) return "macro";
  if (/\b(ultra[-\s]?wide|20\s*mm|24\s*mm|exaggerated\s+foreshorten)\b/i.test(ev) || /超广角/.test(ev)) {
    return "ultra_wide";
  }
  if (/\b(wide[-\s]?angle|28\s*mm|35\s*mm)\b/i.test(ev)) return "wide";
  if (/\b(telephoto|85\s*mm|135\s*mm)\b/i.test(ev) || /长焦/.test(ev)) return "tele";
  if (/\b(normal\s+lens|50\s*mm)\b/i.test(ev)) return "normal";
  return "";
}

/**
 * 构图主质量心带
 * @param {unknown} raw
 */
export function coercePrimaryMass(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (PRIMARY_MASS_SET.has(token)) return token;
  if (PRIMARY_MASS_ALIAS[token]) return PRIMARY_MASS_ALIAS[token];
  if (/\b(hips?|jeans|lower\s+torso|butt|胯|臀)\b/i.test(src)) return "hips_lower";
  if (/\b(bust|chest[-\s]?up|shoulders?|头肩|胸像)\b/i.test(src)) return "bust_face";
  if (/\b(full[-\s]?body|full[-\s]?figure|全身)\b/i.test(src)) return "full_figure";
  if (/\b(product|device|packshot|产品)\b/i.test(src)) return "product";
  if (/\b(title|type\s*band|typography|海报字)\b/i.test(src)) return "type_band";
  if (/\b(sky|void|负空间主导)\b/i.test(src)) return "sky_void";
  return "";
}

/**
 * 构图锚点区位（与 placement 词表对齐）
 * @param {unknown} raw
 */
export function coerceCompositionAnchor(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (!src || /^(n\/a|unknown|unreadable)$/i.test(src)) return "";
  if (COMPOSITION_ANCHOR_SET.has(src)) return src;
  const hasL = /\bleft|左/.test(src);
  const hasR = /\bright|右/.test(src);
  const hasU = /\b(upper|top|上)/.test(src);
  const hasLo = /\b(lower|bottom|下)/.test(src);
  const hasMid = /\b(mid|middle|center|centre|中)/.test(src);
  if (!hasL && !hasR && !hasU && !hasLo && !hasMid) return "";
  const lr = hasL ? "left" : hasR ? "right" : "center";
  const ud = hasU ? "upper" : hasLo ? "lower" : "mid";
  const zone = `${ud}-${lr}`;
  return COMPOSITION_ANCHOR_SET.has(zone) ? zone : "";
}

/**
 * 故意留白带
 * @param {unknown} raw
 */
export function coerceNegativeSpace(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s_]+/g, "-");
  if (NEGATIVE_SPACE_SET.has(token)) return token;
  const compact = token.replace(/-/g, "_");
  if (NEGATIVE_SPACE_ALIAS[compact]) return NEGATIVE_SPACE_ALIAS[compact];
  if (NEGATIVE_SPACE_ALIAS[token]) return NEGATIVE_SPACE_ALIAS[token];
  if (/\bnone|packed|full|无留白/.test(src)) return "none";
  if (/\bupper[-\s]?left|左上/.test(src)) return "upper-left";
  if (/\bupper[-\s]?right|右上/.test(src)) return "upper-right";
  if (/\bupper|top|sky|上方/.test(src)) return "upper";
  if (/\blower|bottom|下方/.test(src)) return "lower";
  if (/\bleft|左侧/.test(src)) return "side-left";
  if (/\bright|右侧/.test(src)) return "side-right";
  if (/\bsurround|四周/.test(src)) return "surround";
  return "";
}

/**
 * depth_stack 单项
 * @param {unknown} raw
 */
export function coerceDepthStackToken(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (DEPTH_STACK_SET.has(token)) return token;
  if (DEPTH_STACK_ALIAS[token]) return DEPTH_STACK_ALIAS[token];
  return "";
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function coerceDepthStack(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {string[]} */
  const out = [];
  for (const it of raw.slice(0, 5)) {
    const t = coerceDepthStackToken(it);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * 主光左右：camera_left | camera_right；也可从 evidence 读
 * @param {unknown} raw
 * @param {unknown} [evidence]
 */
export function coerceLightingKeySide(raw, evidence = "") {
  const evRaw = typeof evidence === "string" ? evidence : "";
  const ev = evRaw.toLowerCase();
  // 丁达尔光束来向：证据优先于误标 key_side（常见：光束左上却写成 camera_right）
  const godRaySide = coerceGodRayKeySideFromEvidence(evRaw);
  if (godRaySide) return godRaySide;

  // 顶光强证据优先：VLM 常因侧脸/抬头把影棚顶光误标成 camera_left/right
  const overheadEv =
    /\b(overhead|top[-\s]?light|from above|ceiling\s+(?:softbox|key|light)|under[-\s]?chin|brow[-\s]?ridge\s+shadow|crown\s+lit|lit\s+crown|forehead\s+(?:bright|highlight)|nose\s+shadow\s+(?:falls\s+)?down|top[-\s]?of[-\s]?head\s+highlight)\b/.test(
      ev
    ) || /顶光|顶灯|下巴下投影|眉弓投影|头顶高光/.test(evRaw);

  const src =
    typeof raw === "string"
      ? raw
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_")
      : "";
  if (src === "unknown" && !overheadEv) return "";
  if (overheadEv) return "overhead";
  if (src && KEY_SIDE_SET.has(src)) return src;
  if (src === "left" || src === "from_left") return "camera_left";
  if (src === "right" || src === "from_right") return "camera_right";
  if (
    src === "above" ||
    src === "top" ||
    src === "from_above" ||
    src === "from_top" ||
    src === "top_light" ||
    src === "ceiling" ||
    src === "overhead_key"
  ) {
    return "overhead";
  }
  const right = /camera[_\s-]?right|from camera-right|key from (?:the )?right\b/.test(ev);
  const left = /camera[_\s-]?left|from camera-left|key from (?:the )?left\b/.test(ev);
  if (right && !left) return "camera_right";
  if (left && !right) return "camera_left";
  return "";
}

/**
 * 从 lighting.evidence 读丁达尔光束来向（可覆盖错误 key_side）
 * @param {string} evidence
 */
export function coerceGodRayKeySideFromEvidence(evidence) {
  const src = String(evidence || "");
  if (!src) return "";
  const hasRay =
    /\b(god\s*rays?|crepuscular|light\s*shafts?|sun\s*shafts?|volumetric\s*light\s*beams?|beam(?:s)?\s+of\s+light)\b/i.test(
      src
    ) || /丁达尔|体积光柱|光束/.test(src);
  if (!hasRay) return "";
  const low = src.toLowerCase();
  // 左上/右上光束 → 对应侧，不要塌成纯 overhead（否则丢失侧向光柱）
  if (
    /\b(upper[-\s]?left|top[-\s]?left|from\s+(?:the\s+)?(?:upper\s+)?left|camera[-\s]?left)\b/.test(low) ||
    /左上|左上方|从左/.test(src)
  ) {
    return "camera_left";
  }
  if (
    /\b(upper[-\s]?right|top[-\s]?right|from\s+(?:the\s+)?(?:upper\s+)?right|camera[-\s]?right)\b/.test(low) ||
    /右上|右上方|从右/.test(src)
  ) {
    return "camera_right";
  }
  if (/\b(overhead|from\s+above|from\s+top|ceiling)\b/.test(low) || /正上方|顶光光束/.test(src)) {
    return "overhead";
  }
  return "";
}

/**
 * 光源族闭集：studio | natural | mixed
 * @param {unknown} raw
 */
export function coerceLightSource(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (LIGHT_SOURCE_SET.has(token)) return token;
  if (LIGHT_SOURCE_ALIAS[token]) return LIGHT_SOURCE_ALIAS[token];
  const low = src.toLowerCase();
  if (/\b(studio|softbox|beauty\s+dish|seamless\s+backdrop)\b/.test(low) || /影棚|柔光箱/.test(src))
    return "studio";
  if (/\b(natural|daylight|sunlight|window\s+light|outdoor)\b/.test(low) || /自然光|日光|窗光|户外光/.test(src))
    return "natural";
  if (/\bmixed\b/.test(low) || /混合光/.test(src)) return "mixed";
  return "";
}

/**
 * 软硬质闭集：hard | soft
 * @param {unknown} raw
 */
export function coerceLightQuality(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (LIGHT_QUALITY_SET.has(token)) return token;
  if (LIGHT_QUALITY_ALIAS[token]) return LIGHT_QUALITY_ALIAS[token];
  const low = src.toLowerCase();
  if (/\b(hard|harsh|sharp\s+cast|crisp\s+shadow)\b/.test(low) || /硬光|锐利投影/.test(src)) return "hard";
  if (/\b(soft|diffused|wrap|softbox)\b/.test(low) || /柔光|漫射/.test(src)) return "soft";
  return "";
}

/**
 * 色温/时段气候闭集
 * @param {unknown} raw
 */
export function coerceLightClimate(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (LIGHT_CLIMATE_SET.has(token)) return token;
  if (LIGHT_CLIMATE_ALIAS[token]) return LIGHT_CLIMATE_ALIAS[token];
  const low = src.toLowerCase();
  if (/\b(golden[-\s]?hour|sunset|sunrise|warm\s+sun)\b/.test(low) || /黄金时刻|夕阳|暖阳/.test(src))
    return "golden_hour";
  if (/\b(overcast|cloudy)\b/.test(low) || /阴天|多云漫射/.test(src)) return "overcast";
  if (/\b(cool\s+skylight|blue\s+hour|cool\s+daylight)\b/.test(low) || /冷天光|蓝调天光/.test(src))
    return "cool_skylight";
  if (/\b(tungsten|incandescent|warm\s+indoor)\b/.test(low) || /钨丝|暖室内光/.test(src)) return "tungsten";
  if (/\b(daylight|noon|neutral\s+day)\b/.test(low) || /日光|中性日光/.test(src)) return "daylight";
  return "";
}

/**
 * 体积光柱闭集：god_rays | none；与 pattern 正交（directional + god_rays 可共存）
 * @param {unknown} raw
 * @param {unknown} [evidence]
 */
export function coerceLightBeams(raw, evidence = "") {
  if (raw != null && typeof raw === "string") {
    const src = raw.trim();
    if (src && !/^(n\/a|unknown|unreadable)$/i.test(src)) {
      const token = src.toLowerCase().replace(/[\s-]+/g, "_");
      if (LIGHT_BEAMS_SET.has(token)) return token;
      if (LIGHT_BEAMS_ALIAS[token]) return LIGHT_BEAMS_ALIAS[token];
    }
  }
  const ev = typeof evidence === "string" ? evidence : String(evidence || "");
  if (
    /\b(god\s*rays?|crepuscular|light\s*shafts?|sun\s*shafts?|volumetric\s*light\s*beams?|beam(?:s)?\s+of\s+light)\b/i.test(
      ev
    ) ||
    /丁达尔|体积光柱|光束穿过/.test(ev)
  ) {
    return "god_rays";
  }
  if (/\b(no\s+(?:god\s*)?rays?|no\s+light\s*shafts?|beams?\s*=\s*none)\b/i.test(ev) || /无光束|无丁达尔/.test(ev)) {
    return "none";
  }
  return "";
}

/**
 * 肤色明度闭集；禁止 medium 字面（与渲染 medium 冲突）
 * @param {unknown} raw
 */
export function coerceSkinTone(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (SKIN_TONE_SET.has(token)) return token;
  if (SKIN_TONE_ALIAS[token]) return SKIN_TONE_ALIAS[token];
  const low = src.toLowerCase();
  if (/\b(fair|pale|porcelain|very\s+fair)\b/.test(low) || /白皙|苍白|瓷白/.test(src)) return "fair";
  if (/\b(light\s+skin|light[-\s]?toned)\b/.test(low) || /浅肤|偏白/.test(src)) return "light";
  if (/\b(tan|tanned|bronzed|sun[-\s]?kissed)\b/.test(low) || /古铜|晒黑|小麦色/.test(src)) return "tan";
  if (/\b(deep|dark\s+skin|deep\s+brown)\b/.test(low) || /深肤|黝黑/.test(src)) return "deep";
  if (/\b(mid|medium\s+skin|olive)\b/.test(low) || /中等肤色|橄榄肤/.test(src)) return "mid";
  return "";
}

/**
 * 肤色冷暖闭集
 * @param {unknown} raw
 */
export function coerceSkinUndertone(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (SKIN_UNDERTONE_SET.has(token)) return token;
  if (SKIN_UNDERTONE_ALIAS[token]) return SKIN_UNDERTONE_ALIAS[token];
  const low = src.toLowerCase();
  if (/\b(cool|pink|rosy|cold)\b/.test(low) || /冷调|粉调|冷白皮/.test(src)) return "cool";
  if (/\b(warm|golden|peach|yellow)\b/.test(low) || /暖调|金调|黄调/.test(src)) return "warm";
  if (/\bneutral\b/.test(low) || /中性调/.test(src)) return "neutral";
  return "";
}

/**
 * 身份猜测：真人名人 / 动漫角色；仅高/中置信保留；unknown/空则 null
 * @param {unknown} raw
 * @returns {{ name: string, confidence: "high"|"medium"|"low", kind: "celebrity"|"anime" }|null}
 */
export function coerceIdentityGuess(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const name = raw.trim().slice(0, LIMITS.identity_guess_name);
    if (!name || /^(none|n\/a|unknown|unreadable)$/i.test(name)) return null;
    return {
      name,
      confidence: /** @type {"medium"} */ ("medium"),
      kind: /** @type {"celebrity"} */ ("celebrity"),
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const nameRaw = typeof o.name === "string" ? o.name.trim() : "";
  const name = nameRaw.slice(0, LIMITS.identity_guess_name);
  if (!name || /^(none|n\/a|unknown|unreadable)$/i.test(name)) return null;
  let confidence = /** @type {"high"|"medium"|"low"} */ ("medium");
  if (typeof o.confidence === "string") {
    const c = o.confidence.trim().toLowerCase();
    if (c === "high" || c === "medium" || c === "low") confidence = c;
  }
  let kind = /** @type {"celebrity"|"anime"} */ ("celebrity");
  if (typeof o.kind === "string") {
    const k = o.kind.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (
      k === "anime" ||
      k === "anime_character" ||
      k === "character" ||
      k === "cartoon" ||
      k === "manga"
    ) {
      kind = "anime";
    } else if (k === "celebrity" || k === "real" || k === "person" || k === "public_figure") {
      kind = "celebrity";
    }
  }
  return { name, confidence, kind };
}

/**
 * 按勾选门闩导出具名身份；仅 high|medium；low 丢弃
 * @param {unknown} raw
 * @param {{ useCelebrityName?: boolean, includeAnimeCharacter?: boolean }} [opts]
 */
export function namedIdentityFromGuess(raw, opts = {}) {
  const g = coerceIdentityGuess(raw);
  if (!g || g.confidence === "low") return "";
  if (g.kind === "anime") {
    return opts.includeAnimeCharacter ? g.name : "";
  }
  return opts.useCelebrityName ? g.name : "";
}

/**
 * 导出用真人名人名（兼容旧调用）
 * @param {unknown} raw
 */
export function celebrityNameFromGuess(raw) {
  return namedIdentityFromGuess(raw, { useCelebrityName: true, includeAnimeCharacter: false });
}

/** 笼统动作填充词（整段或子句） */
const VAGUE_ACTION_FILLER_RE =
  /\b(dynamic pose|action stance|powerful pose|dramatic pose|cool pose|hero pose|neutral pose|torso upright|confident stance|strong pose|epic pose)\b/gi;

/**
 * 去掉笼统动作词；只留可见肢体/躯干事实。整段皆笼统 → ""
 * @param {unknown} raw
 */
export function scrubVagueAction(raw) {
  if (raw == null || typeof raw !== "string") return "";
  let s = raw.trim();
  if (!s) return "";
  if (/^(dynamic pose|action stance|powerful pose|dramatic pose|cool pose|hero pose|neutral pose|torso upright)$/i.test(s)) {
    return "";
  }
  s = s
    .replace(VAGUE_ACTION_FILLER_RE, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
  return s.slice(0, LIMITS.action);
}

/** 笼统表情/神态词 */
const VAGUE_EXPRESSION_RE =
  /^(neutral|calm|serious|intense|emotional|expressive|confident(?: look)?|natural expression|dramatic expression|cool expression|powerful expression|blank expression|normal expression)$/i;

/**
 * 表情必须是眉/眼/嘴可见事实；vibes → ""
 * @param {unknown} raw
 */
export function scrubVagueExpression(raw) {
  if (raw == null || typeof raw !== "string") return "";
  let s = raw
    .trim()
    .replace(/\b(neutral|normal|blank|calm)\s+mouth\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
  if (!s) return "";
  if (VAGUE_EXPRESSION_RE.test(s)) return "";
  // 仅 vibe 形容词、无部位事实
  if (
    /^(neutral|calm|serious|intense|emotional|expressive|confident|dramatic|cool|powerful)\b/i.test(s) &&
    !/\b(brow|brows|forehead|eye|eyes|gaze|lid|lids|mouth|lip|lips|jaw|teeth|smile|frown|scowl|grin|glare|stare|furrow|clench|parted|pursed|squint)\b/i.test(
      s
    )
  ) {
    return "";
  }
  return s.slice(0, LIMITS.expression);
}

/**
 * 画框裁切：none/unknown → 空
 * @param {unknown} raw
 */
export function coerceCrop(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src) return "";
  if (/^(none|unknown|n\/a|full|in[_\s-]?frame|uncropped|no[_\s-]?crop)$/i.test(src)) return "";
  return src.slice(0, LIMITS.crop);
}

/**
 * 景别闭集；unknown/空则 ""
 * @param {unknown} raw
 */
export function coerceShotScale(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (SHOT_SCALE_SET.has(token)) return token;
  if (SHOT_SCALE_ALIAS[token]) return SHOT_SCALE_ALIAS[token];
  const low = src.toLowerCase();
  if (
    /\b(extreme[-\s]?close[-\s]?up|macro\s+(?:beauty|face|lip)|face[-\s]?filling|beauty\s+crop)\b/.test(low) ||
    /极近|大特写|脸贴满|美妆特写/.test(src)
  ) {
    return "extreme_closeup";
  }
  if (/\b(close[-\s]?up|headshot|tight\s+portrait)\b/.test(low) || /特写|近景头像/.test(src)) return "closeup";
  if (/\b(bust(?:\s+shot)?|chest[-\s]?up|肩上|半身胸)\b/.test(low) || /胸像|半身胸/.test(src)) return "bust";
  if (/\b(waist[-\s]?up|medium\s+shot)\b/.test(low) || /腰上|半身/.test(src)) return "waist";
  if (/\b(full[-\s]?body|full[-\s]?figure|head[-\s]?to[-\s]?toe)\b/.test(low) || /全身|头到脚/.test(src))
    return "full_body";
  if (/\b(wide|establishing|full\s+scene)\b/.test(low) || /远景|大场面/.test(src)) return "wide";
  return "";
}

/**
 * 色板气候闭集（与 palette hex / lighting.climate 正交）；unknown/空则 ""
 * @param {unknown} raw
 */
export function coercePaletteClimate(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (PALETTE_CLIMATE_SET.has(token)) return token;
  if (PALETTE_CLIMATE_ALIAS[token]) return PALETTE_CLIMATE_ALIAS[token];
  const low = src.toLowerCase();
  if (
    /\b(muted[-\s]?antique|aged[-\s]?parchment|antique[-\s]?print|weathered[-\s]?paper|vintage[-\s]?scroll)\b/.test(
      low
    ) ||
    /古风低饱和|旧纸|仿古纸|绢本低饱和/.test(src)
  ) {
    return "muted_antique";
  }
  if (
    /\b(monochrome|black[-\s]?and[-\s]?white|\bb\s*&\s*w\b|greyscale|grayscale)\b/.test(low) ||
    /黑白|灰度近单色/.test(src)
  ) {
    return "monochrome";
  }
  if (
    /\b(neon|fluorescent|emissive\s+cyber|electric\s+neon)\b/.test(low) ||
    /霓虹|荧光高饱和/.test(src)
  ) {
    return "neon";
  }
  if (
    /\b(vivid|high[-\s]?chroma|saturated\s+anime|hyper[-\s]?saturated|vibrant\s+digital)\b/.test(low) ||
    /高饱和|鲜艳数码|糖果色/.test(src)
  ) {
    return "vivid";
  }
  if (
    /\b(warm[-\s]?earthy|ochre[-\s]?sepia|earthy\s+ochre|sepia\s+warm)\b/.test(low) ||
    /暖土|赭石|焦茶色板/.test(src)
  ) {
    return "warm_earthy";
  }
  if (
    /\b(desaturat(?:ed|ion)?|low[-\s]?chroma|muted\s+palette|near[-\s]?mono)\b/.test(low) ||
    /低饱和|去饱和|近单色/.test(src)
  ) {
    return "desaturated";
  }
  if (/\b(natural\s+chroma|moderate\s+chroma|realistic\s+palette)\b/.test(low) || /自然彩度/.test(src)) {
    return "natural";
  }
  return "";
}

/**
 * 画面焦点闭集（与 shot_scale 正交）；unknown/空则 ""
 * @param {unknown} raw
 */
export function coerceFrameFocus(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (FRAME_FOCUS_SET.has(token)) return token;
  if (FRAME_FOCUS_ALIAS[token]) return FRAME_FOCUS_ALIAS[token];
  const low = src.toLowerCase();
  // single_eye 先于 upper_face
  if (
    /\b(single[-\s]?eye|one[-\s]?eye|eye[-\s]?macro|mono[-\s]?eye|only\s+one\s+eye)\b/.test(low) ||
    /单眼|一只眼|独眼特写/.test(src)
  ) {
    return "single_eye";
  }
  if (
    /\b(lips?[-\s]?chin|mouth[-\s]?chin|lower[-\s]?face\s+only|lips?\s+only)\b/.test(low) ||
    /唇部下巴|下半脸|只露嘴/.test(src)
  ) {
    return "lips_chin";
  }
  if (
    /\b(upper[-\s]?face|brow\s+and\s+eyes|eyes?\s+only|lower\s+face\s+(?:covered|cropped|hidden|occluded))\b/.test(
      low
    ) ||
    /上半脸|下半脸遮挡|嘴被挡住/.test(src)
  ) {
    return "upper_face";
  }
  if (/\b(half[-\s]?face|split\s+face|vertical\s+half)\b/.test(low) || /半张脸|左右半脸/.test(src)) {
    return "half_face";
  }
  if (
    /\b(full[-\s]?face|whole\s+face|both\s+eyes|face\s+filling|centered\s+face)\b/.test(low) ||
    /整脸|满脸|双眼可见/.test(src)
  ) {
    return "full_face";
  }
  return "";
}

/**
 * 嘴巴开合闭集
 * @param {unknown} raw
 */
export function coerceMouth(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable|omit|neutral)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (MOUTH_SET.has(token)) return token;
  if (MOUTH_ALIAS[token]) return MOUTH_ALIAS[token];
  const low = src.toLowerCase();
  if (
    /\b(teeth|toothy|grin(?:ning)?\s+with\s+teeth|wide[-\s]?open\s+mouth)\b/.test(low) ||
    /露齿|张大嘴/.test(src)
  ) {
    return "open_teeth";
  }
  if (/\b(pursed|tight[-\s]?lips)\b/.test(low) || /抿嘴|噘嘴/.test(src)) return "pursed";
  if (
    /\b(parted\s+lips|lips?\s+parted|slightly\s+parted|slightly\s+open|open[-\s]?mouth|mouth\s+open|lips?\s+apart)\b/.test(
      low
    ) ||
    /微张|张嘴|嘴唇分开/.test(src)
  ) {
    return "parted";
  }
  if (
    /\b(closed[-\s]?mouth|closed\s+lips|lips?\s+closed|sealed\s+lips|lips?\s+together)\b/.test(low) ||
    /闭嘴|嘴唇闭合/.test(src)
  ) {
    return "closed";
  }
  return "";
}

/**
 * 唇材质闭集
 * @param {unknown} raw
 */
export function coerceLipFinish(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable|bare)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (LIP_FINISH_SET.has(token)) return token;
  if (LIP_FINISH_ALIAS[token]) return LIP_FINISH_ALIAS[token];
  const low = src.toLowerCase();
  if (/\b(wet[-\s]?gloss|wet[-\s]?look|glass\s+lips?|high[-\s]?shine|high[-\s]?gloss)\b/.test(low) || /水光唇|镜面唇/.test(src))
    return "wet_gloss";
  if (/\b(gloss(?:y)?|lip\s+gloss|shine)\b/.test(low) || /唇蜜|亮泽唇/.test(src)) return "gloss";
  if (/\bsatin\b/.test(low) || /缎光/.test(src)) return "satin";
  if (/\bmatte\b/.test(low) || /哑光唇/.test(src)) return "matte";
  return "";
}

/**
 * 腮红强度闭集
 * @param {unknown} raw
 */
export function coerceBlush(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (BLUSH_SET.has(token)) return token;
  if (BLUSH_ALIAS[token]) return BLUSH_ALIAS[token];
  const low = src.toLowerCase();
  if (/\b(no\s+blush|without\s+blush|bare\s+cheeks?)\b/.test(low) || /无腮红|不化妆颊/.test(src)) return "none";
  if (/\b(heavy|intense|dramatic|strong)\s*blush\b/.test(low) || /浓腮红|重腮红/.test(src)) return "heavy";
  if (/\b(soft|light|subtle|natural)\s*blush\b/.test(low) || /淡腮红|轻腮红/.test(src)) return "soft";
  if (/\bblush\b/.test(low) || /腮红/.test(src)) return "soft";
  return "";
}

/**
 * 肤质闭集
 * @param {unknown} raw
 */
export function coerceSkinFinish(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (SKIN_FINISH_SET.has(token)) return token;
  if (SKIN_FINISH_ALIAS[token]) return SKIN_FINISH_ALIAS[token];
  const low = src.toLowerCase();
  if (/\b(airbrushed|retouched|porcelain|beauty\s+filter|smooth(?:ed)?(?:\s+skin)?|no\s+visible\s+pores)\b/.test(low) || /磨皮|空气感磨皮|美颜磨皮/.test(src))
    return "airbrushed";
  if (/\b(pore[-\s]?detail|visible\s+pores?|raw\s+skin)\b/.test(low) || /毛孔/.test(src))
    return "pore_detail";
  if (/\bfreckles?\b/.test(low) || /雀斑肤质/.test(src)) return "pore_detail";
  if (/\b(dewy|glassy\s+skin|glass\s+skin|beauty\s+skin)\b/.test(low) || /水光肌|玻璃肌/.test(src))
    return "dewy_beauty";
  if (/\b(soft[-\s]?focus|softened\s+skin)\b/.test(low) || /柔焦/.test(src)) return "soft_focus";
  if (/\bnatural\s+skin\b/.test(low) || /自然肤质/.test(src)) return "natural";
  return "";
}

/**
 * 景别是否隐藏下半身（不可可靠读身高）
 * @param {unknown} scale
 */
export function shotScaleHidesLowerBody(scale) {
  const s = coerceShotScale(typeof scale === "string" ? scale : "");
  return s === "extreme_closeup" || s === "closeup" || s === "bust" || s === "waist";
}

/** 画面焦点是否切掉嘴巴 */
export function frameFocusHidesMouth(focus) {
  const f = coerceFrameFocus(typeof focus === "string" ? focus : "");
  return f === "upper_face" || f === "single_eye";
}

/** 裁切描述是否暗示嘴部出框 */
export function cropHidesMouth(crop) {
  const s = typeof crop === "string" ? crop.trim() : "";
  if (!s) return false;
  const inPart = s.match(/in frame:\s*([^;]+)/i)?.[1] || "";
  if (/\b(lips?|mouth|chin)\b/i.test(inPart)) return false;
  if (/\b(upper\s+face|eyes?\s+only|brow\s+and\s+eyes)\b/i.test(s)) return true;
  return /\b(lips?|mouth|chin)\b/i.test(s) && CROP_OUT_RE.test(s);
}

/** 裁切描述是否暗示眼部出框 */
export function cropHidesEyes(crop) {
  const s = typeof crop === "string" ? crop.trim() : "";
  if (!s) return false;
  const inPart = s.match(/in frame:\s*([^;]+)/i)?.[1] || "";
  if (/\beyes?\b/i.test(inPart)) return false;
  if (/\b(lower\s+face|lips?\s*(?:and|&)\s*chin|nose[-\s]?down|from\s+the\s+nose)\b/i.test(s)) return true;
  // 仅当明确写 eyes/brows 被切；forehead clipped ≠ 眼睛出框
  return /\b(eyes?|brows?|eyebrows?)\b/i.test(s) && CROP_OUT_RE.test(s);
}

/** @param {unknown} c @param {string} path @param {string[]} warnings */
function readConfidence(c, path, warnings) {
  if (c == null || c === "") {
    warnings.push(`${path}.confidence`);
    return /** @type {ObsConfidence} */ ("medium");
  }
  if (typeof c !== "string") {
    warnings.push(`${path}.confidence:non_string`);
    return /** @type {ObsConfidence} */ ("medium");
  }
  const s = c.trim().toLowerCase();
  if (!CONF_SET.has(s)) {
    warnings.push(`${path}.confidence`);
    return /** @type {ObsConfidence} */ ("medium");
  }
  return /** @type {ObsConfidence} */ (s);
}

/** @param {unknown} e @param {string} path @param {string[]} warnings */
function readEvidence(e, path, warnings, max = LIMITS.evidence) {
  if (e == null) {
    warnings.push(`${path}.evidence`);
    return "";
  }
  if (typeof e !== "string") {
    warnings.push(`${path}.evidence:non_string`);
    return "";
  }
  return e.slice(0, max);
}

/**
 * item 是否有除 id/confidence/evidence 外的视觉事实
 * @param {Record<string, string>} item
 */
function itemHasMeaning(item) {
  for (const [k, v] of Object.entries(item)) {
    if (k === "id" || k === "confidence" || k === "evidence") continue;
    if (String(v || "").trim()) return true;
  }
  return false;
}

/**
 * @param {unknown} raw
 * @param {string} path
 * @param {string[]} errors
 * @param {string[]} warnings
 * @param {"subjects"|"objects"|"regions"} kind
 */
function normalizeItem(raw, path, errors, warnings, kind) {
  if (!isPlainObject(raw)) {
    errors.push(`${path}.type`);
    return null;
  }
  const o = pickAllowedKeys(/** @type {Record<string, unknown>} */ (raw), ITEM_KEYS, path, warnings);
  const confidence = readConfidence(o.confidence, path, warnings);
  const evidence = readEvidence(o.evidence, path, warnings);
  /** @type {Record<string, string>} */
  const item = { confidence, evidence };

  const id = readStrictString(o.id, `${path}.id`, warnings, { max: LIMITS.id });
  if (id) item.id = id;

  const label = readStrictString(o.label, `${path}.label`, warnings, { max: LIMITS.label });
  if (label) item.label = label;

  if (kind === "regions") {
    const role = readStrictString(o.role, `${path}.role`, warnings, { max: LIMITS.role });
    if (role) item.role = role;
  } else {
    const kindStr = readStrictString(o.kind, `${path}.kind`, warnings, { max: LIMITS.kind });
    if (kindStr) item.kind = kindStr;
  }

  const placeRaw = o.placement ?? o.zone;
  const place = readStrictString(placeRaw, `${path}.placement`, warnings, { max: LIMITS.placement });
  if (place) item.placement = place;

  const facing = readStrictString(o.facing, `${path}.facing`, warnings, { max: LIMITS.facing });
  if (facing) item.facing = facing;

  let wardrobe = readStrictString(o.wardrobe, `${path}.wardrobe`, warnings, { max: LIMITS.wardrobe });
  // 证据写明赤膊但漏填 wardrobe → 补锁；女性用软措辞，降低生成拒生
  if (!wardrobe && kind === "subjects") {
    const bareCue = [o.evidence, o.label, o.action].filter(Boolean).join(" ");
    if (
      /\b(shirtless|bare\s+(?:chest|torso|upper\s+body)|no\s+shirt|without\s+(?:a\s+)?shirt|topless|nude\s+torso|裸(?:胸|上身)|赤膊)\b/i.test(
        bareCue
      )
    ) {
      const female =
        /\b(women|woman|girls?|female|lady|女士们?|女子|女孩|女士)\b/i.test(String(o.label || ""));
      wardrobe = female ? "no shirt, uncovered upper body" : "shirtless, bare torso";
      warnings.push(`${path}.wardrobe:recovered-shirtless`);
    }
  }
  if (wardrobe) item.wardrobe = wardrobe;

  if (kind === "subjects") {
    const accessories = readStrictString(o.accessories, `${path}.accessories`, warnings, {
      max: LIMITS.accessories,
    });
    if (accessories) item.accessories = accessories;
  }

  const poseRaw = readStrictString(o.pose, `${path}.pose`, warnings, { max: LIMITS.pose });
  if (poseRaw) {
    const pose = coercePose(poseRaw);
    if (pose) item.pose = pose;
  }

  // 手臂姿态仅对人物；可与 standing 等正交共存
  if (kind === "subjects") {
    const armRaw = readStrictString(o.arm_pose, `${path}.arm_pose`, warnings, { max: LIMITS.arm_pose });
    let arm = armRaw ? coerceArmPose(armRaw) : "";
    if (armRaw && !arm) warnings.push(`${path}.arm_pose:invalid`);
    if (!arm) {
      arm = coerceArmPose([item.label, item.evidence, item.pose].filter(Boolean).join(" "));
    }
    // hugging 已含环抱语义，不再叠 crossed
    if (arm === "crossed" && item.pose === "hugging") arm = "";
    if (arm) item.arm_pose = arm;

    const actionRaw = readStrictString(o.action, `${path}.action`, warnings, { max: LIMITS.action });
    const action = actionRaw ? scrubVagueAction(actionRaw) : "";
    if (actionRaw && !action) warnings.push(`${path}.action:vague`);
    if (action) item.action = action;

    const exprRaw = readStrictString(o.expression, `${path}.expression`, warnings, {
      max: LIMITS.expression,
    });
    const expression = exprRaw ? scrubVagueExpression(exprRaw) : "";
    if (exprRaw && !expression) warnings.push(`${path}.expression:vague`);
    if (expression) item.expression = expression;

    const mouthRaw = readStrictString(o.mouth, `${path}.mouth`, warnings, { max: LIMITS.mouth });
    let mouth = mouthRaw ? coerceMouth(mouthRaw) : "";
    if (mouthRaw && !mouth) warnings.push(`${path}.mouth:invalid`);
    if (!mouth) {
      mouth = coerceMouth([item.expression, item.label, item.evidence].filter(Boolean).join(" "));
    }
    if (mouth) item.mouth = mouth;
  }

  const support = readStrictString(o.support, `${path}.support`, warnings, { max: LIMITS.support });
  if (support) item.support = support;

  const relation = readStrictString(o.relation, `${path}.relation`, warnings, { max: LIMITS.relation });
  if (relation) item.relation = relation;

  const ageRaw = readStrictString(o.age, `${path}.age`, warnings, { max: LIMITS.age });
  if (ageRaw) {
    const age = coerceAgeBand(ageRaw);
    if (age) item.age = age;
    else warnings.push(`${path}.age:invalid`);
  }

  // 身材 / 胡须 / 物种 / 人种仅对人物条目有意义
  if (kind === "subjects") {
    const speciesRaw = readStrictString(o.species, `${path}.species`, warnings, { max: LIMITS.species });
    let species = speciesRaw ? coerceSpecies(speciesRaw) : "";
    if (speciesRaw && !species) warnings.push(`${path}.species:invalid`);
    if (!species) {
      species = coerceSpecies([item.label, item.kind, item.evidence].filter(Boolean).join(" "));
    }
    if (species) item.species = species;

    const buildRaw = readStrictString(o.build, `${path}.build`, warnings, { max: LIMITS.build });
    if (buildRaw) {
      const build = coerceBuild(buildRaw);
      if (build) item.build = build;
      else warnings.push(`${path}.build:invalid`);
    }

    const facialRaw = readStrictString(o.facial_hair, `${path}.facial_hair`, warnings, {
      max: LIMITS.facial_hair,
    });
    let facial = facialRaw ? coerceFacialHair(facialRaw) : "";
    if (facialRaw && !facial) warnings.push(`${path}.facial_hair:invalid`);
    // 字段空时，从 label/evidence 恢复显式胡须/光洁词
    if (!facial) {
      facial = coerceFacialHair([item.label, item.evidence].filter(Boolean).join(" "));
    }
    if (facial) item.facial_hair = facial;

    // 人种：仅 human（或未标物种）且脸可读；非人不保留
    const phenoRaw = readStrictString(o.phenotype, `${path}.phenotype`, warnings, {
      max: LIMITS.phenotype,
    });
    let phenotype = phenoRaw ? coercePhenotype(phenoRaw) : "";
    if (phenoRaw && !phenotype) warnings.push(`${path}.phenotype:invalid`);
    if (!phenotype) {
      phenotype = coercePhenotype([item.label, item.evidence].filter(Boolean).join(" "));
    }
    const isNonHuman = Boolean(species && species !== "human");
    if (phenotype && !isNonHuman) item.phenotype = phenotype;
  }

  const hair = readStrictString(o.hair, `${path}.hair`, warnings, { max: LIMITS.hair });
  if (hair) item.hair = hair;

  const eyes = readStrictString(o.eyes, `${path}.eyes`, warnings, { max: LIMITS.eyes });
  if (eyes) item.eyes = eyes;

  const cropRaw = readStrictString(o.crop, `${path}.crop`, warnings, { max: LIMITS.crop });
  const crop = coerceCrop(cropRaw);
  if (crop) item.crop = crop;

  // 景别闭集；可从 crop 自由文本恢复
  if (kind === "subjects") {
    const scaleRaw = readStrictString(o.shot_scale, `${path}.shot_scale`, warnings, {
      max: LIMITS.shot_scale,
    });
    let shotScale = scaleRaw ? coerceShotScale(scaleRaw) : "";
    if (scaleRaw && !shotScale) warnings.push(`${path}.shot_scale:invalid`);
    if (!shotScale) {
      shotScale = coerceShotScale([item.crop, item.label, item.evidence].filter(Boolean).join(" "));
    }
    if (shotScale) item.shot_scale = shotScale;

    // 画面焦点：与 shot_scale 正交；可从 crop 恢复
    const focusRaw = readStrictString(o.frame_focus, `${path}.frame_focus`, warnings, {
      max: LIMITS.frame_focus,
    });
    let frameFocus = focusRaw ? coerceFrameFocus(focusRaw) : "";
    if (focusRaw && !frameFocus) warnings.push(`${path}.frame_focus:invalid`);
    if (!frameFocus) {
      frameFocus = coerceFrameFocus(
        [item.crop, item.label, item.evidence, item.makeup].filter(Boolean).join(" ")
      );
    }
    if (frameFocus) item.frame_focus = frameFocus;
  }

  // 妆面 / 肤质：仅人物；先读 makeup 再恢复闭集
  if (kind === "subjects") {
    const makeup = readStrictString(o.makeup, `${path}.makeup`, warnings, { max: LIMITS.makeup });
    if (makeup) item.makeup = makeup;

    const marks = readStrictString(o.skin_marks, `${path}.skin_marks`, warnings, {
      max: LIMITS.skin_marks,
    });
    if (marks) item.skin_marks = marks;

    const lipRaw = readStrictString(o.lip_finish, `${path}.lip_finish`, warnings, {
      max: LIMITS.lip_finish,
    });
    let lip = lipRaw ? coerceLipFinish(lipRaw) : "";
    if (lipRaw && !lip) warnings.push(`${path}.lip_finish:invalid`);
    if (!lip) {
      lip = coerceLipFinish([item.makeup, item.label, item.evidence].filter(Boolean).join(" "));
    }
    if (lip) item.lip_finish = lip;

    const blushRaw = readStrictString(o.blush, `${path}.blush`, warnings, { max: LIMITS.blush });
    let blush = blushRaw ? coerceBlush(blushRaw) : "";
    if (blushRaw && !blush) warnings.push(`${path}.blush:invalid`);
    if (!blush) {
      blush = coerceBlush([item.makeup, item.label, item.evidence].filter(Boolean).join(" "));
    }
    if (blush) item.blush = blush;

    const skinRaw = readStrictString(o.skin_finish, `${path}.skin_finish`, warnings, {
      max: LIMITS.skin_finish,
    });
    let skin = skinRaw ? coerceSkinFinish(skinRaw) : "";
    if (skinRaw && !skin) warnings.push(`${path}.skin_finish:invalid`);
    if (!skin) {
      skin = coerceSkinFinish([item.label, item.evidence, item.makeup].filter(Boolean).join(" "));
    }
    if (skin) item.skin_finish = skin;

    const toneRaw = readStrictString(o.skin_tone, `${path}.skin_tone`, warnings, {
      max: LIMITS.skin_tone,
    });
    let tone = toneRaw ? coerceSkinTone(toneRaw) : "";
    if (toneRaw && !tone) warnings.push(`${path}.skin_tone:invalid`);
    if (!tone) {
      tone = coerceSkinTone([item.color, item.label, item.evidence, item.makeup].filter(Boolean).join(" "));
    }
    if (tone) item.skin_tone = tone;

    const underRaw = readStrictString(o.skin_undertone, `${path}.skin_undertone`, warnings, {
      max: LIMITS.skin_undertone,
    });
    let undertone = underRaw ? coerceSkinUndertone(underRaw) : "";
    if (underRaw && !undertone) warnings.push(`${path}.skin_undertone:invalid`);
    if (!undertone) {
      undertone = coerceSkinUndertone(
        [item.color, item.label, item.evidence, item.makeup].filter(Boolean).join(" ")
      );
    }
    if (undertone) item.skin_undertone = undertone;

    // 名人猜测：可选；不进 label；面具时清除
    const ig = coerceIdentityGuess(o.identity_guess);
    if (ig) item.identity_guess = ig;
  }

  // 身高：全身可读时锁定；半身/特写裁切不可靠则省略
  if (kind === "subjects") {
    const statureRaw = readStrictString(o.stature, `${path}.stature`, warnings, { max: LIMITS.stature });
    let stature = statureRaw ? coerceStature(statureRaw) : "";
    if (statureRaw && !stature) warnings.push(`${path}.stature:invalid`);
    if (!stature) {
      stature = coerceStature([item.label, item.evidence].filter(Boolean).join(" "));
    }
    if (
      stature &&
      !cropHidesLowerBody(item.crop) &&
      !shotScaleHidesLowerBody(item.shot_scale)
    ) {
      item.stature = stature;
    }
  }

  const coverRaw = readStrictString(o.face_cover, `${path}.face_cover`, warnings, { max: LIMITS.face_cover });
  const cover =
    coerceFaceCover(coverRaw) ||
    coerceFaceCover([item.label, item.wardrobe, item.evidence].filter(Boolean).join(" "));
  if (cover) item.face_cover = cover;
  // 面具/盔挡住头：禁止把看不见的头发/瞳色/胡须/人种/妆面写成事实
  if (cover === "mask" || cover === "helmet") {
    delete item.hair;
    delete item.eyes;
    delete item.facial_hair;
    delete item.phenotype;
    delete item.lip_finish;
    delete item.blush;
    delete item.makeup;
    delete item.skin_finish;
    delete item.skin_tone;
    delete item.skin_undertone;
    delete item.identity_guess;
    delete item.expression;
    delete item.mouth;
  }
  // 眼部出框：禁止发明虹膜
  if (cropHidesEyes(item.crop)) {
    delete item.eyes;
  }
  // 嘴部出框 / 上半脸焦点：禁止发明开合
  if (frameFocusHidesMouth(item.frame_focus) || cropHidesMouth(item.crop)) {
    delete item.mouth;
  }

  const color = readStrictString(o.color, `${path}.color`, warnings, { max: LIMITS.color });
  if (color) item.color = color;

  const salience = readStrictString(o.salience, `${path}.salience`, warnings, { max: 16 });
  if (salience && SALIENCE_SET.has(salience.toLowerCase())) {
    item.salience = salience.toLowerCase();
  } else if (salience) {
    warnings.push(`${path}.salience:invalid`);
  }

  // 空 item（仅有默认 confidence/evidence）丢弃
  if (!itemHasMeaning(item) && !item.id) return null;
  if (!itemHasMeaning(item)) return null;

  return item;
}

/**
 * 闭集 role；球衣别名折进 garment_print；非法 → other（随后可 drop）
 * @param {unknown} raw
 */
function coerceTypeRole(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const role = raw
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .trim();
  if (!role) return "";
  if (TYPE_ROLE_SET.has(role)) return role;
  if (TYPE_ROLE_ALIAS[role]) return TYPE_ROLE_ALIAS[role];
  return "other";
}

/**
 * 字体族闭集：sans | serif | script | display | mono
 * script = 连笔手写 / 签名体 / 书法，禁止塌成衬线
 * @param {unknown} raw
 */
export function coerceTypeLettering(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (TYPE_LETTERING_SET.has(token)) return token;
  if (TYPE_LETTERING_ALIAS[token]) return TYPE_LETTERING_ALIAS[token];
  const low = src.toLowerCase();
  // sans 先于 serif，避免 sans-serif 误判
  if (/\bsans[-\s]?serif\b/.test(low) || /无衬线|黑体字/.test(src)) return "sans";
  if (
    /\b(cursive|handwritten|hand[-\s]?letter(?:ed|ing)?|signature[-\s]?style|connected\s+script|calligraphy)\b/.test(
      low
    ) ||
    /手写|连笔|草书|花体|签名体|书法体/.test(src)
  ) {
    return "script";
  }
  if (/\b(monospace|typewriter|equal[-\s]?width)\b/.test(low) || /等宽|打字机/.test(src)) return "mono";
  if (/\b(blackletter|decorative display|ornate lettering)\b/.test(low) || /装饰体|哥特体/.test(src)) {
    return "display";
  }
  if (/\bserif\b/.test(low) || /衬线/.test(src)) return "serif";
  return "";
}

/**
 * 字重闭集：thin | regular | bold | black
 * 长 evidence 里的裸 black/light 不回收，避免背景色误判
 * @param {unknown} raw
 */
export function coerceTypeWeight(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const src = raw.trim();
  if (!src || /^(none|n\/a|unknown|unreadable)$/i.test(src)) return "";
  const token = src.toLowerCase().replace(/[\s-]+/g, "_");
  if (TYPE_WEIGHT_SET.has(token)) return token;
  if (TYPE_WEIGHT_ALIAS[token]) return TYPE_WEIGHT_ALIAS[token];
  const low = src.toLowerCase();
  if (
    /\b(thin|hairline|light)\s+(?:weight|lettering|type|script|sans|serif|caps)\b/.test(low) ||
    /细体|极细|细笔画/.test(src)
  ) {
    return "thin";
  }
  if (/\bblack\s+(?:weight|lettering|type|sans|serif)\b/.test(low) || /超黑|特粗/.test(src)) return "black";
  if (/\bbold\s+(?:weight|lettering|type|sans|serif|caps)\b/.test(low) || /粗体|加粗/.test(src)) return "bold";
  if (/\bregular\s+(?:weight|lettering|type)\b/.test(low) || /常规字重/.test(src)) return "regular";
  return "";
}

/** @param {unknown} raw */
function coerceTypeOn(raw) {
  if (raw == null || typeof raw !== "string") return "";
  const on = raw.trim();
  if (!on || /^(null|none|unknown|n\/a)$/i.test(on)) return "";
  return on.slice(0, LIMITS.id);
}

/**
 * @param {unknown} raw
 * @param {string} path
 * @param {string[]} errors
 * @param {string[]} warnings
 */
function normalizeTypography(raw, path, errors, warnings) {
  if (!isPlainObject(raw)) {
    errors.push(`${path}.type`);
    return null;
  }
  const o = pickAllowedKeys(/** @type {Record<string, unknown>} */ (raw), TYPE_KEYS, path, warnings);
  const confidence = readConfidence(o.confidence, path, warnings);
  const evidence = readEvidence(o.evidence, path, warnings);
  const text = readStrictString(o.text, `${path}.text`, warnings, { max: LIMITS.text });
  if (!text) {
    warnings.push(`${path}.text:empty`);
    return null;
  }
  /** @type {Record<string, string>} */
  const item = { text, confidence, evidence };
  const roleRaw = readStrictString(o.role, `${path}.role`, warnings, { max: LIMITS.role });
  if (roleRaw) {
    const role = coerceTypeRole(roleRaw);
    if (role) item.role = role;
  }
  const onRaw = o.on;
  if (typeof onRaw === "string") {
    const on = coerceTypeOn(onRaw);
    if (on) item.on = on;
  } else if (onRaw != null) {
    warnings.push(`${path}.on:non_string`);
  }
  const script = readStrictString(o.script, `${path}.script`, warnings, { max: LIMITS.script });
  if (script) item.script = script;
  const placement = readStrictString(o.placement, `${path}.placement`, warnings, {
    max: LIMITS.placement,
  });
  if (placement) item.placement = placement;

  const letteringRaw = readStrictString(
    o.lettering ?? o.font ?? o.family ?? o.font_family,
    `${path}.lettering`,
    warnings,
    { max: LIMITS.lettering }
  );
  let lettering = letteringRaw ? coerceTypeLettering(letteringRaw) : "";
  if (letteringRaw && !lettering) warnings.push(`${path}.lettering:invalid`);
  if (!lettering) {
    lettering = coerceTypeLettering([evidence, script].filter(Boolean).join(" "));
  }
  if (lettering) item.lettering = lettering;

  const weightRaw = readStrictString(o.weight, `${path}.weight`, warnings, { max: LIMITS.weight });
  let weight = weightRaw ? coerceTypeWeight(weightRaw) : "";
  if (weightRaw && !weight) warnings.push(`${path}.weight:invalid`);
  if (!weight) weight = coerceTypeWeight(o.evidence);
  if (weight) item.weight = weight;

  return item;
}

/**
 * 空 block / 仅 confidence+evidence → null
 * @param {Record<string, string>|null} block
 * @param {string[]} factKeys
 */
function blockHasFact(block, factKeys) {
  if (!block) return false;
  return factKeys.some((k) => {
    const v = block[k];
    return Boolean(v) && v !== "unknown" && v !== "none";
  });
}

/**
 * @param {unknown} raw
 * @param {string} path
 * @param {string[]} errors
 * @param {string[]} warnings
 * @param {Set<string>} allowedKeys
 * @param {(o: Record<string, unknown>, path: string, errors: string[], warnings: string[]) => Record<string, string>|null} build
 * @param {string[]} factKeys
 */
function normalizeNullableBlock(raw, path, errors, warnings, allowedKeys, build, factKeys) {
  if (raw == null) return null;
  if (!isPlainObject(raw)) {
    errors.push(`${path}.type`);
    return null;
  }
  const o = pickAllowedKeys(/** @type {Record<string, unknown>} */ (raw), allowedKeys, path, warnings);
  const block = build(o, path, errors, warnings);
  if (!block) return null;
  if (!blockHasFact(block, factKeys)) return null;
  return block;
}

const SEAT_SUPPORT_RE = /\b(chairs?|thrones?|stools?|armchairs?|benches?|seats?)\b/i;
/** 真半身裁切：bust/腰/大腿以上被切；脚尖贴底边不算「下半身不可见」 */
const BUST_WAIST_CROP_RE =
  /\b(bust|chest|torso|waist|hips?|mid[-\s]?thigh|upper\s+body|lower\s+(?:body|torso)|below\s+(?:the\s+)?(?:waist|bust|chest)|legs?\s+(?:out|cut|cropped)|knees?\s+(?:out|cut|cropped))\b/i;
const CROP_OUT_RE = /\b(out|crop(?:ped)?|cut|bottom|frame|edge|hidden|omitted)\b/i;
const FEET_TIP_RE = /\b(feet|foot|shoes?|ankles?|toes?)\b/i;

/** @param {unknown} crop */
export function cropHidesLowerBody(crop) {
  const s = typeof crop === "string" ? crop.trim() : "";
  if (!s) return false;
  // 全身 / head-to-toe 明确在场时，不算半身裁切
  if (/\b(full[-\s]?body|full[-\s]?height|head[-\s]?to[-\s]?toe|头到脚)\b/i.test(s)) return false;
  // 仅「脚/鞋在底边被切」不是 bust crop
  if (FEET_TIP_RE.test(s) && !BUST_WAIST_CROP_RE.test(s)) return false;
  return BUST_WAIST_CROP_RE.test(s) && CROP_OUT_RE.test(s);
}

function observationHasSeatObject(observation) {
  const objs = Array.isArray(observation?.objects) ? observation.objects : [];
  return objs.some((o) => SEAT_SUPPORT_RE.test(String(o?.label || "")));
}

/**
 * 半身裁切且无座椅 → 去掉推断 seated / seat support
 * @param {object} observation
 */
function applyBustCropRecovery(observation) {
  if (observationHasSeatObject(observation)) return observation;
  const subjects = Array.isArray(observation.subjects) ? observation.subjects : [];
  let changed = false;
  const next = subjects.map((s) => {
    if (!cropHidesLowerBody(s?.crop) && !shotScaleHidesLowerBody(s?.shot_scale)) return s;
    const support = String(s?.support || "");
    const pose = coercePose(s?.pose);
    const dropSupport = Boolean(support) && SEAT_SUPPORT_RE.test(support);
    const dropSeated = pose === "seated";
    if (!dropSupport && !dropSeated) return s;
    changed = true;
    const copy = { ...s };
    if (dropSupport) delete copy.support;
    if (dropSeated) delete copy.pose;
    return copy;
  });
  return changed ? { ...observation, subjects: next } : observation;
}

const SCALE_GLYPH_RE = /\d+\s*(?:cm|mm)\b|\bHEIGHT\b|身高|身長|厘米/i;
const HEIGHT_RULER_NAME_RE =
  /\b(height\s*ruler|height\s*scale|身高尺|height\s*chart|刻度尺)\b/i;
const RULER_WORD_RE = /\b(vertical\s+)?ruler\b/i;
const RULER_MARK_RE = /\b(cm|marks?|刻度|身高)\b/i;
const VERTICAL_SCALE_RE = /\bvertical\s+(?:height\s+)?scale\b/i;

/** @param {object|null|undefined} observation */
export function typographyHasScaleGlyphs(observation) {
  const items = Array.isArray(observation?.typography) ? observation.typography : [];
  return items.some((t) => SCALE_GLYPH_RE.test(String(t?.text || "")));
}

function isHeightRulerObject(it) {
  const blob = `${it?.label || ""} ${it?.kind || ""} ${it?.evidence || ""}`;
  if (HEIGHT_RULER_NAME_RE.test(blob)) return true;
  if (RULER_WORD_RE.test(blob) && RULER_MARK_RE.test(blob)) return true;
  if (VERTICAL_SCALE_RE.test(blob) && RULER_MARK_RE.test(blob)) return true;
  return false;
}

function stripInferredHeightFromLabel(label) {
  return String(label || "")
    .replace(/\s*\([^)]*inferred from ruler[^)]*\)/gi, "")
    .replace(/,?\s*~?\d+(?:\.\d+)?\s*cm\b/gi, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * worms_eye 缺 composition 时只恢复必然推出的髋前景；不发明锚点/景深/特写 bust
 * @param {object} observation
 * @param {string[]} warnings
 */
function applyCompositionSoftRecover(observation, warnings) {
  if (observation?.composition?.primary_mass) return observation;
  const cam = observation?.camera;
  const subjects = Array.isArray(observation?.subjects) ? observation.subjects : [];
  const regions = Array.isArray(observation?.regions) ? observation.regions : [];
  const worms =
    String(cam?.vantage || "") === "worms_eye" ||
    coerceCameraVantage("", cam?.evidence) === "worms_eye";

  if (worms) {
    const skyUpper = regions.some(
      (r) =>
        /\b(sky|cloud|云|天空)\b/i.test(String(r?.label || "")) &&
        /upper|top|full-width-upper/i.test(String(r?.placement || ""))
    );
    const place = String(subjects[0]?.placement || "");
    const anchor = coerceCompositionAnchor(place);
    /** @type {Record<string, unknown>} */
    const block = {
      primary_mass: "hips_lower",
      confidence: "medium",
      evidence: "recovered from worms_eye",
    };
    if (anchor) block.anchor = anchor;
    if (skyUpper) block.negative_space = "upper";
    warnings.push("composition:recovered-from-worms_eye");
    return { ...observation, composition: block };
  }

  return observation;
}

/**
 * 无 OCR 刻度 → 丢掉幻觉身高尺与推断身高
 * @param {object} observation
 */
function applyHeightChartRecovery(observation) {
  if (typographyHasScaleGlyphs(observation)) return observation;
  const objects = Array.isArray(observation.objects)
    ? observation.objects.filter((o) => !isHeightRulerObject(o))
    : observation.objects;
  const subjects = Array.isArray(observation.subjects)
    ? observation.subjects.map((s) => {
        const next = stripInferredHeightFromLabel(s?.label);
        if (!next || next === (s?.label || "")) return s;
        return { ...s, label: next };
      })
    : observation.subjects;
  return { ...observation, objects, subjects };
}

/**
 * 是否存在有效视觉事实（非空 block / 空 item）
 * @param {object} obs
 */
export function hasVisualFact(obs) {
  if (!obs || typeof obs !== "object") return false;
  for (const list of [obs.subjects, obs.objects, obs.regions, obs.typography]) {
    if (Array.isArray(list) && list.some((it) => it && itemHasMeaning(it))) return true;
  }
  if (blockHasFact(obs.camera, ["angle", "vantage", "lens_feel"])) return true;
  if (
    blockHasFact(obs.lighting, [
      "pattern",
      "exposure",
      "key_side",
      "source",
      "quality",
      "climate",
      "beams",
    ])
  )
    return true;
  if (blockHasFact(obs.fx, ["family"])) return true;
  if (
    obs.composition &&
    typeof obs.composition === "object" &&
    (obs.composition.primary_mass ||
      obs.composition.anchor ||
      obs.composition.negative_space ||
      (Array.isArray(obs.composition.depth_stack) && obs.composition.depth_stack.length))
  ) {
    return true;
  }
  // 有意义的 medium 轴也算事实（非全 unknown）
  if (obs.render_family && obs.render_family !== "unknown") return true;
  if (obs.finish) return true;
  return false;
}

/**
 * 宽松规范化（不可变）；收集 errors + warnings
 * @param {unknown} raw
 * @returns {{ observation: object|null, errors: string[], warnings: string[] }}
 */
export function normalizeObservation(raw) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  if (raw == null) {
    return { observation: null, errors: ["observation.missing"], warnings };
  }
  if (!isPlainObject(raw)) {
    return { observation: null, errors: ["observation.type"], warnings };
  }

  // keySide → key_side：在 unknown-key strip 之前（lighting 子对象内处理）
  const rootRaw = /** @type {Record<string, unknown>} */ (raw);
  const o = pickAllowedKeys(rootRaw, ROOT_KEYS, "observation", warnings);

  /** @param {unknown} arr @param {string} name @param {number} max @param {Function} mapFn */
  const readArr = (arr, name, max, mapFn) => {
    if (arr == null) return [];
    if (!Array.isArray(arr)) {
      errors.push(`${name}.type`);
      return [];
    }
    if (arr.length > max) errors.push(`${name}.max`);
    const out = [];
    for (let i = 0; i < Math.min(arr.length, max); i++) {
      const item = mapFn(arr[i], `${name}[${i}]`, errors, warnings);
      if (item) out.push(item);
    }
    return out;
  };

  let subjects = readArr(o.subjects, "subjects", LIMITS.subjects, (item, path, errs, warns) =>
    normalizeItem(item, path, errs, warns, "subjects")
  );
  let objects = readArr(o.objects, "objects", LIMITS.objects, (item, path, errs, warns) =>
    normalizeItem(item, path, errs, warns, "objects")
  );
  const regions = readArr(o.regions, "regions", LIMITS.regions, (item, path, errs, warns) =>
    normalizeItem(item, path, errs, warns, "regions")
  );
  let typography = readArr(o.typography, "typography", LIMITS.typography, normalizeTypography);

  // ID：非空 + 唯一；重复 → 硬错误并丢弃后续重复项
  /** @type {Set<string>} */
  const seenIds = new Set();
  const dedupeById = (list, listName) => {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const id = String(it.id || "").trim();
      if (!id) {
        // 无 id 但有内容：允许（regions/部分 objects），不进 seen
        out.push(it);
        continue;
      }
      if (seenIds.has(id)) {
        errors.push(`${listName}.id.duplicate:${id}`);
        continue;
      }
      seenIds.add(id);
      out.push(it);
    }
    return out;
  };
  subjects = dedupeById(subjects, "subjects");
  objects = dedupeById(objects, "objects");
  // regions 也参与全局唯一
  const regionsDeduped = dedupeById(regions, "regions");

  const subjectIds = new Set(subjects.map((s) => s.id).filter(Boolean));
  const objectIds = new Set(objects.map((o) => o.id).filter(Boolean));

  // typography：role/host 校验；role=other 或非法 host → drop + warning
  typography = typography.filter((t, i) => {
    const path = `typography[${i}]`;
    const role = t.role || "";
    if (role === "other" || !role) {
      warnings.push(`${path}.role:drop`);
      return false;
    }
    if (role === "garment_print") {
      if (!t.on || !subjectIds.has(t.on)) {
        warnings.push(`${path}.on:garment_host_invalid`);
        return false;
      }
    } else if (role === "prop_print") {
      if (!t.on || !objectIds.has(t.on)) {
        warnings.push(`${path}.on:prop_host_invalid`);
        return false;
      }
    } else if (t.on) {
      // title/caption/logo：on 必须存在，否则 drop on（overlay 允许无 on）
      if (!subjectIds.has(t.on) && !objectIds.has(t.on)) {
        warnings.push(`${path}.on:unresolved`);
        delete t.on;
      }
    }
    return true;
  });

  const camera = normalizeNullableBlock(
    o.camera,
    "camera",
    errors,
    warnings,
    CAMERA_KEYS,
    (co, path, _errs, warns) => {
      const confidence = readConfidence(co.confidence, path, warns);
      const evidence = readEvidence(co.evidence, path, warns);
      /** @type {Record<string, string>} */
      const block = { confidence, evidence };
      const angleStr = readStrictString(co.angle, `${path}.angle`, warns, { max: 32 });
      if (angleStr) {
        const a = angleStr.toLowerCase().replace(/[\s-]+/g, "_");
        if (!ANGLE_SET.has(a)) warns.push(`${path}.angle:invalid`);
        else if (a !== "unknown") block.angle = a;
      }
      const vantageRaw = readStrictString(co.vantage, `${path}.vantage`, warns, { max: 24 });
      let vantage = vantageRaw ? coerceCameraVantage(vantageRaw, evidence) : "";
      if (vantageRaw && !vantage) warns.push(`${path}.vantage:invalid`);
      if (!vantage) vantage = coerceCameraVantage("", evidence);
      if (vantage && vantage !== "none") block.vantage = vantage;
      else if (vantage === "none") block.vantage = "none";

      const lensRaw = readStrictString(co.lens_feel ?? co.lensFeel, `${path}.lens_feel`, warns, {
        max: 24,
      });
      let lens = lensRaw ? coerceLensFeel(lensRaw, evidence) : "";
      if (lensRaw && !lens) warns.push(`${path}.lens_feel:invalid`);
      if (!lens) lens = coerceLensFeel("", evidence);
      if (lens) block.lens_feel = lens;

      // worms_eye 闸门：强制 low_angle，禁止 top_down/high_angle 共存
      if (block.vantage === "worms_eye") {
        if (block.angle === "top_down" || block.angle === "high_angle" || block.angle === "orthographic") {
          warns.push(`${path}.angle:coerced_low_for_worms_eye`);
          block.angle = "low_angle";
        } else if (!block.angle || block.angle === "eye_level") {
          block.angle = "low_angle";
        }
      }
      return block;
    },
    ["angle", "vantage", "lens_feel"]
  );

  // lighting：先 canonicalize keySide → key_side
  let lightingRaw = o.lighting;
  if (isPlainObject(lightingRaw)) {
    const lr = /** @type {Record<string, unknown>} */ ({ ...lightingRaw });
    if (!("key_side" in lr) && "keySide" in lr) {
      lr.key_side = lr.keySide;
      delete lr.keySide;
    } else if ("keySide" in lr) {
      delete lr.keySide;
    }
    lightingRaw = lr;
  }

  const lighting = normalizeNullableBlock(
    lightingRaw,
    "lighting",
    errors,
    warnings,
    LIGHT_KEYS,
    (lo, path, _errs, warns) => {
      const confidence = readConfidence(lo.confidence, path, warns);
      const evidence = readEvidence(lo.evidence, path, warns);
      /** @type {Record<string, string>} */
      const block = { confidence, evidence };
      const patStr = readStrictString(lo.pattern, `${path}.pattern`, warns, { max: 40 });
      if (patStr) {
        const p = patStr.toLowerCase().replace(/[\s-]+/g, "_");
        if (!LIGHT_SET.has(p)) warns.push(`${path}.pattern:invalid`);
        else if (p !== "unknown") block.pattern = p;
      }
      const expStr = readStrictString(lo.exposure, `${path}.exposure`, warns, { max: 32 });
      if (expStr) {
        const e = expStr.toLowerCase().replace(/[\s-]+/g, "_");
        if (!EXPOSURE_SET.has(e)) warns.push(`${path}.exposure:invalid`);
        else if (e !== "unknown") block.exposure = e;
      }
      const keySideRaw = lo.key_side;
      if (typeof keySideRaw === "string" && keySideRaw.trim().toLowerCase() === "unknown") {
        // raw unknown → omit，不造 schema error
      } else {
        const keySide = coerceLightingKeySide(keySideRaw, evidence);
        if (keySide) block.key_side = keySide;
        else if (keySideRaw != null && typeof keySideRaw === "string" && keySideRaw.trim()) {
          warns.push(`${path}.key_side:invalid`);
        } else if (keySideRaw != null && typeof keySideRaw !== "string") {
          warns.push(`${path}.key_side:non_string`);
        }
      }

      const srcRaw = readStrictString(lo.source, `${path}.source`, warns, { max: 24 });
      let source = srcRaw ? coerceLightSource(srcRaw) : "";
      if (srcRaw && !source) warns.push(`${path}.source:invalid`);
      if (!source) source = coerceLightSource(evidence);
      if (source) block.source = source;

      const qualRaw = readStrictString(lo.quality, `${path}.quality`, warns, { max: 16 });
      let quality = qualRaw ? coerceLightQuality(qualRaw) : "";
      if (qualRaw && !quality) warns.push(`${path}.quality:invalid`);
      if (!quality) quality = coerceLightQuality(evidence);
      if (quality) block.quality = quality;

      const climRaw = readStrictString(lo.climate, `${path}.climate`, warns, { max: 24 });
      let climate = climRaw ? coerceLightClimate(climRaw) : "";
      if (climRaw && !climate) warns.push(`${path}.climate:invalid`);
      if (!climate) climate = coerceLightClimate(evidence);
      if (climate) block.climate = climate;

      const beamsRaw = readStrictString(lo.beams, `${path}.beams`, warns, { max: 24 });
      let beams = beamsRaw ? coerceLightBeams(beamsRaw, evidence) : "";
      if (beamsRaw && !beams) warns.push(`${path}.beams:invalid`);
      if (!beams) beams = coerceLightBeams("", evidence);
      if (beams) block.beams = beams;
      // god_rays 时 evidence 补短标，便于下游与导出
      if (beams === "god_rays" && !/\bgod\s*rays?\b/i.test(block.evidence || "")) {
        const prev = String(block.evidence || "").trim();
        block.evidence = (prev ? `${prev}, god rays` : "god rays").slice(0, LIMITS.evidence);
      }

      return block;
    },
    ["pattern", "exposure", "key_side", "source", "quality", "climate", "beams"]
  );

  // directional / split 缺 key_side → warning（quality 至少 partial）
  if (
    lighting &&
    (lighting.pattern === "directional" || lighting.pattern === "split_chiaroscuro") &&
    !lighting.key_side
  ) {
    warnings.push("lighting.key_side:required_for_directional");
  }

  const fx = normalizeNullableBlock(
    o.fx,
    "fx",
    errors,
    warnings,
    FX_KEYS,
    (fo, path, _errs, warns) => {
      const confidence = readConfidence(fo.confidence, path, warns);
      const evidence = readEvidence(fo.evidence, path, warns);
      /** @type {Record<string, string>} */
      const block = { confidence, evidence };
      const famStr = readStrictString(fo.family, `${path}.family`, warns, { max: 40 });
      if (famStr) {
        const f = famStr.toLowerCase().replace(/[\s-]+/g, "_");
        if (!FX_SET.has(f)) warns.push(`${path}.family:invalid`);
        else if (f !== "none") block.family = f;
      }
      return block;
    },
    ["family"]
  );

  /** @type {Record<string, unknown>|null} */
  let composition = null;
  if (o.composition != null) {
    if (!isPlainObject(o.composition)) {
      errors.push("composition.type");
    } else {
      const co = pickAllowedKeys(
        /** @type {Record<string, unknown>} */ (o.composition),
        COMPOSITION_KEYS,
        "composition",
        warnings
      );
      const confidence = readConfidence(co.confidence, "composition", warnings);
      const evidence = readEvidence(co.evidence, "composition", warnings);
      const massRaw = readStrictString(co.primary_mass, "composition.primary_mass", warnings, {
        max: 24,
      });
      let primary_mass = massRaw ? coercePrimaryMass(massRaw) : "";
      if (massRaw && !primary_mass) warnings.push("composition.primary_mass:invalid");
      const anchorRaw = readStrictString(co.anchor, "composition.anchor", warnings, { max: 24 });
      let anchor = anchorRaw ? coerceCompositionAnchor(anchorRaw) : "";
      if (anchorRaw && !anchor) warnings.push("composition.anchor:invalid");
      const negRaw = readStrictString(co.negative_space, "composition.negative_space", warnings, {
        max: 24,
      });
      let negative_space = negRaw ? coerceNegativeSpace(negRaw) : "";
      if (negRaw && !negative_space) warnings.push("composition.negative_space:invalid");
      const depth_stack = coerceDepthStack(co.depth_stack);
      if (
        primary_mass ||
        anchor ||
        negative_space ||
        depth_stack.length ||
        (evidence && confidence !== "low")
      ) {
        /** @type {Record<string, unknown>} */
        const block = { confidence, evidence };
        if (primary_mass) block.primary_mass = primary_mass;
        if (anchor) block.anchor = anchor;
        if (negative_space) block.negative_space = negative_space;
        if (depth_stack.length) block.depth_stack = depth_stack;
        composition = block;
      }
    }
  }

  const axes = normalizeMediumAxes(o);
  const axisErrors = validateMediumAxesRaw(o);
  for (const e of axisErrors) warnings.push(e);

  const finish = canonicalizeFinish(o.finish, warnings, "finish");
  // 仅采纳 VLM 显式 finish_technique；勿从 finish 散文推断后强行重写（会破坏已写好的 line art / academic 头）
  const techRaw = readStrictString(o.finish_technique ?? o.finishTechnique, "finish_technique", warnings, {
    max: 40,
  });
  let finish_technique = "";
  if (techRaw) {
    finish_technique = coerceFinishTechnique(techRaw);
    if (!finish_technique || finish_technique === "unknown") {
      warnings.push("finish_technique:invalid");
      finish_technique = "";
    }
  }

  const climateRaw = readStrictString(
    o.palette_climate ?? o.paletteClimate,
    "palette_climate",
    warnings,
    { max: LIMITS.palette_climate }
  );
  let palette_climate = "";
  if (climateRaw) {
    palette_climate = coercePaletteClimate(climateRaw);
    if (!palette_climate) {
      warnings.push("palette_climate:invalid");
    }
  }
  // 省略的 palette_climate 保持省略；禁止从 finish 散文回填（finish 词可留在 finish 字段）

  let observation = {
    ...axes,
    ...(finish ? { finish } : {}),
    ...(finish_technique ? { finish_technique } : {}),
    ...(palette_climate ? { palette_climate } : {}),
    subjects,
    objects,
    regions: regionsDeduped,
    typography,
    camera,
    lighting,
    fx,
    ...(composition ? { composition } : {}),
  };

  observation = applyBustCropRecovery(observation);
  observation = applyHeightChartRecovery(observation);
  observation = applyCompositionSoftRecover(observation, warnings);

  return { observation, errors, warnings };
}

/**
 * 校验 → quality；ready 仍保留 warnings
 * @param {unknown} raw
 * @returns {{ ok: boolean, quality: ObservationQuality, observation: object|null, errors: string[], warnings: string[] }}
 */
export function validateObservation(raw) {
  const { observation, errors, warnings } = normalizeObservation(raw);

  if (!observation) {
    return { ok: false, quality: "invalid", observation: null, errors, warnings };
  }

  const hard = errors.filter((e) => {
    return (
      e === "observation.missing" ||
      e === "observation.type" ||
      e.endsWith(".type") ||
      e.endsWith(".max") ||
      e.includes(".id.duplicate:")
    );
  });

  if (hard.length) {
    return {
      ok: false,
      quality: "invalid",
      observation,
      errors: [...new Set(hard)],
      warnings: [...new Set(warnings)],
    };
  }

  if (!hasVisualFact(observation)) {
    return {
      ok: false,
      quality: "invalid",
      observation,
      errors: [...new Set([...errors, "observation.empty"])],
      warnings: [...new Set(warnings)],
    };
  }

  /** @type {string[]} */
  const confidences = [];
  for (const list of [observation.subjects, observation.objects, observation.regions, observation.typography]) {
    for (const it of list) confidences.push(it.confidence);
  }
  for (const block of [observation.camera, observation.lighting, observation.fx]) {
    if (block?.confidence) confidences.push(block.confidence);
  }
  const lowCount = confidences.filter((c) => c === "low").length;
  const lowHeavy = confidences.length > 0 && lowCount * 2 > confidences.length;

  // 语义 warning（非 nit）→ partial；缺轴/多余键/缺 conf 为 nit
  const isNit = (w) =>
    /\.extra_key:|\.confidence|\.evidence|\.text:empty|non_string|axes\./.test(String(w));
  const semanticWarn = warnings.some((w) => !isNit(w));

  const uniqWarnings = [...new Set(warnings)];
  const uniqErrors = [...new Set(errors.filter((e) => !hard.includes(e)))];

  if (lowHeavy || semanticWarn) {
    return {
      ok: true,
      quality: "partial",
      observation,
      errors: [...uniqErrors, ...(lowHeavy ? ["observation.low_confidence_ratio"] : [])],
      warnings: uniqWarnings,
    };
  }

  return {
    ok: true,
    quality: "ready",
    observation,
    errors: uniqErrors,
    warnings: uniqWarnings,
  };
}

const CONF_RANK = { high: 3, medium: 2, low: 1 };

/** @param {unknown} block @param {"angle"|"pattern"|"family"|""} [enumKey] */
function blockConfidence(block, enumKey = "") {
  if (!block || typeof block !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (block);
  let confidence = CONF_SET.has(String(o.confidence || "")) ? String(o.confidence) : "medium";
  if (enumKey) {
    const v = String(o[enumKey] || "").trim();
    if (!v || v === "unknown") confidence = "low";
  }
  return {
    confidence,
    evidence: String(o.evidence || o.label || o.text || "").slice(0, 120),
  };
}

function worstOf(items) {
  /** @type {"high"|"medium"|"low"} */
  let worst = "high";
  const evidence = [];
  for (const it of items) {
    if (!it) continue;
    const c = String(it.confidence || "medium");
    if ((CONF_RANK[c] || 2) < (CONF_RANK[worst] || 3)) worst = /** @type {"high"|"medium"|"low"} */ (c);
    if (c !== "high" && it.evidence) evidence.push(String(it.evidence).slice(0, 120));
  }
  return { confidence: worst, evidence: evidence.slice(0, 6) };
}

/**
 * 把 observation 压成 Pack 字段级摘要
 * style ← render_family/capture_style/content_type/presentation/finish/fx
 * @param {unknown} observation
 */
export function buildObsSummary(observation) {
  if (!observation || typeof observation !== "object") return null;
  const o = /** @type {Record<string, any>} */ (observation);
  const layoutItems = [];
  for (const list of [o.subjects, o.objects, o.regions, o.typography]) {
    if (!Array.isArray(list)) continue;
    for (const it of list) {
      const row = blockConfidence(it);
      if (row) layoutItems.push(row);
    }
  }
  const cameraItems = [
    blockConfidence(o.camera, "angle"),
    blockConfidence(o.lighting, "pattern"),
  ].filter(Boolean);

  /** @type {Array<{confidence: string, evidence: string}>} */
  const styleItems = [];
  for (const key of [
    "render_family",
    "capture_style",
    "content_type",
    "presentation",
    "finish",
    "finish_technique",
    "palette_climate",
  ]) {
    if (o[key] && o[key] !== "unknown" && o[key] !== "none" && o[key] !== "other") {
      styleItems.push({ confidence: "medium", evidence: String(o[key]) });
    }
  }
  const fxRow = blockConfidence(o.fx, "family");
  if (fxRow) styleItems.push(fxRow);

  /** @type {Record<string, { confidence: "high"|"medium"|"low", evidence: string[] }>} */
  const summary = {};
  if (layoutItems.length) summary.layout = worstOf(layoutItems);
  if (cameraItems.length) summary.camera = worstOf(cameraItems);
  if (styleItems.length) summary.style = worstOf(styleItems);
  return Object.keys(summary).length ? summary : null;
}

/**
 * 定点复探：显式 null 可清 camera/lighting/fx；合并后必须重新 normalize
 * @param {object|null|undefined} current
 * @param {"camera"|"style"|"layout"} field
 * @param {unknown} patch
 */
export function mergeObservationField(current, field, patch) {
  const base = current && typeof current === "object" ? { ...current } : {};
  const p = patch && typeof patch === "object" ? /** @type {Record<string, unknown>} */ (patch) : {};
  if (field === "camera") {
    if ("camera" in p) base.camera = p.camera;
    if ("lighting" in p) base.lighting = p.lighting;
  } else if (field === "style") {
    for (const k of ["render_family", "capture_style", "content_type", "presentation", "finish", "finish_technique", "fx"]) {
      if (k in p) base[k] = p[k];
    }
  } else if (field === "layout") {
    for (const k of ["subjects", "objects", "regions", "typography"]) {
      if (k in p && Array.isArray(p[k])) base[k] = p[k];
    }
  }
  const { observation } = normalizeObservation(base);
  return observation || base;
}

/** baseline 用户消息中的 observation 形状说明（紧凑） */
export const OBSERVATION_JSON_HINT = `Also include "observation" (REQUIRED) with orthogonal medium axes + SEE-ONLY facts:
{"observation":{"render_family":"photo|cgi|illustration|flat_graphic|watercolor|infographic|unknown","capture_style":"flash|studio|cinematic|documentary|product_shot|none|unknown","content_type":"portrait|product|scene|poster|ui|abstract|other","presentation":"full_bleed|framed|collage|mockup|plain|unknown","finish_technique":"line_art|hard_cel|ink_print|soft_color_draw|flat_cartoon|tonal_sketch|painted|unknown","finish":"anime|manga|painted|sketch|other + 5-8 precise tokens","palette_climate":"muted_antique|desaturated|warm_earthy|natural|vivid|neon|monochrome","subjects":[{"id":"s1","label":"short name","placement":"mid-left|mid-right|...","facing":"front|profile-left|profile-right|three-quarter|back|unknown","pose":"seated|standing|kneeling|lying|leaning|crouching|hugging|hunched|riding|walking|airborne|unknown","arm_pose":"at_sides|crossed|behind_back|on_hips|clasped_front|raised|in_pockets|drawing_weapon|two_hand_grip|one_hand_weapon","action":"short concrete torso/limb action as seen","expression":"brow/eye/mouth facts when face readable","mouth":"closed|pursed|parted|open_teeth","support":"chair/floor/daybed/none","face_cover":"mask|helmet|hood|none","salience":"primary|secondary","age":"infant|toddler|child|early_teens|late_teens|early_20s|mid_20s|late_20s|early_30s|mid_30s|late_30s|early_40s|mid_40s|late_40s|early_50s|mid_50s|late_50s|early_60s|mid_60s|late_60s|seventies_plus","species":"human|dog|cat|wolf|fox|bird|horse|cattle|rabbit|dragon|other","phenotype":"east_asian|southeast_asian|south_asian|west_asian|north_african|black_african|european|latino|indigenous","build":"lean|average|athletic|lean_muscular|muscular|bulky|heavy|stocky","stature":"short|average|tall","facial_hair":"none|stubble|mustache|goatee|short_beard|full_beard","color":"body surface family when readable","hair":"length + wave + color + style/part/bangs as seen","eyes":"iris color when readable","shot_scale":"extreme_closeup|closeup|bust|waist|full_body|wide","frame_focus":"full_face|upper_face|single_eye|lips_chin|half_face|other","crop":"body part + frame edge when cut","lip_finish":"matte|satin|gloss|wet_gloss","blush":"none|soft|heavy","makeup":"short distinctive marks","skin_finish":"pore_detail|natural|soft_focus|dewy_beauty|airbrushed","skin_tone":"fair|light|mid|tan|deep","skin_undertone":"cool|warm|neutral","identity_guess":{"name":"public figure or anime character","kind":"celebrity|anime","confidence":"high|medium|low"},"wardrobe":"concrete garments as seen","confidence":"high|medium|low","evidence":"visible cue"}],"objects":[{"id":"o1","label":"short","placement":"mid-center","salience":"primary|secondary","color":"color family + saturation cue","relation":"held by s1 / none","confidence":"high|medium|low","evidence":"cue"}],"regions":[{"id":"r1","label":"short","placement":"optional","confidence":"high|medium|low","evidence":"cue"}],"typography":[{"text":"OCR exact glyphs","role":"title|caption|logo|garment_print|prop_print","on":"subject/object id or null","placement":"upper-left|...","lettering":"sans|serif|script|display|mono","weight":"thin|regular|bold|black","confidence":"high|medium|low","evidence":"where"}],"camera":{"angle":"eye_level|high_angle|low_angle|top_down|orthographic|unknown","vantage":"worms_eye|none","lens_feel":"ultra_wide|wide|normal|tele","confidence":"high|medium|low","evidence":"cue"}|null,"composition":{"primary_mass":"hips_lower|bust_face|full_figure|product|type_band|sky_void|other","anchor":"upper-left|upper-center|upper-right|mid-left|mid-center|mid-right|lower-left|lower-center|lower-right","negative_space":"none|upper|upper-left|upper-right|lower|side-left|side-right|surround","depth_stack":["hips_lower","torso","head","sky"],"confidence":"high|medium|low","evidence":"cue"}|null,"lighting":{"pattern":"blinds_slat|dappled_foliage|backlight_rim|split_chiaroscuro|directional|flash|soft_even|unknown","exposure":"high_key|low_key|balanced|unknown","key_side":"camera_left|camera_right|overhead|unknown","source":"studio|natural|mixed","quality":"hard|soft","climate":"daylight|overcast|golden_hour|cool_skylight|tungsten","beams":"god_rays|none","confidence":"high|medium|low","evidence":"cue"}|null,"fx":{"family":"motion_blur|double_exposure|optical_bokeh|volumetric_wrap|none|other","confidence":"high|medium|low","evidence":"cue"}|null}}
Field semantics, FORBIDDEN rules, and wardrobe/lighting gates: apply the field guide in this message. Omit unreadables; prefer []/null over guessing.`;

/**
 * Phase A stub：按 profile 切换 schema。首次观察前未知 content_type，一律 observation 形状。
 * @param {string} [_profile]
 */
export function pickObservationSchema(_profile = "auto") {
  return OBSERVATION_JSON_HINT;
}

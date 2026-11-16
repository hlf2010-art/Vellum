/**
 * 保真核心：介质族优先 + 构图分流 + 只纠错不发明
 * normalizePack / classify 共用，避免补丁互相打架。
 */

/** @typedef {"comic"|"illustration2d"|"relief"|"photo"|"cgi"|"cinematic"|"other"} MediumFamily */
/** @typedef {"full_object"|"figure_medium"|"wide_scene"|"unknown"} FramingMode */

/**
 * 真·浮雕/厚涂证据（不含 render3d/relief 套话，避免 CGI 超跑被钉成浮雕）
 * 注意：衣褶里的 "sculptural creases/folds" 不是浮雕介质
 * @param {string} b
 */
function hasTrueReliefEvidence(b) {
  const s = String(b || "");
  // 先剥掉服装结构用词，避免 sculptural hard creases → 误判 relief
  const scrubbed = s
    .replace(
      /\bsculptur(?:al|ed)?\s+(?:hard\s+)?(?:creases?|folds?|pleats?|drapes?|knit|fabric|collar|neckline)\b/gi,
      " "
    )
    .replace(/\bthick\s+sculptural\s+knit\b/gi, " ")
    .replace(/\b(?:hard\s+)?structured\s+(?:creases?|folds?)\b/gi, " ");

  if (
    /\b(bas[-\s]?relief|impasto|paint[-\s]?volume|paint wave|厚涂|浮雕)\b/i.test(scrubbed) ||
    /\bsculptural\s+relief\b/i.test(scrubbed) ||
    /\b(thick (?:paint|brushstrokes?)|sculpted from|sculpted (?:paint|wave|brush))\b/i.test(scrubbed)
  ) {
    return true;
  }
  // 独立雕塑主体（非时装衣褶）
  if (
    /\b(stone sculpture|clay sculpture|sculpted (?:figure|bust|plaque)|bas-relief sculpture)\b/i.test(
      scrubbed
    )
  ) {
    return true;
  }
  // 裸 sculpture：仅当没有写真/时装语境
  if (
    /\bsculpture\b/i.test(scrubbed) &&
    !/\b(photoreal|photograph|studio-editorial|fashion|blouse|dress|garment|crease|fold)\b/i.test(s)
  ) {
    return true;
  }
  // 裸 relief：仅当没有 CGI/商品渲染串味时成立
  if (/\brelief(?:\s+art)?\b/i.test(scrubbed)) {
    if (
      /\b(render3d\s*\/\s*relief|photoreal cgi|octane|unreal|pbr|glossy reflective|hypercar|sports?\s*car|automotive|supercar)\b/i.test(
        s
      )
    ) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * 文案是否已写明贴边裁切（与四边留白互斥）
 * @param {string} b
 */
export function hasEdgeCropEvidence(b) {
  const s = String(b || "");
  if (/\b(no edge crops?|without(?: an)? edge crops?|not cropped|no crops? visible)\b/i.test(s)) {
    // 含明确「无裁切」时，只有同时出现具体边裁切才算
    return /\b((?:top|bottom|left|right) edge crops?)\b/i.test(s);
  }
  return (
    /\b((?:top|bottom|left|right) edge crops?|edge crops?|crops? the |cropped (?:at|on|by|off))\b/i.test(
      s
    ) ||
    /\b(frame edges?\s*:|bleeds? (?:off|past|at) (?:the )?(?:frame|edge)|touches? the (?:frame|edge))\b/i.test(
      s
    )
  );
}

/**
 * 完整物件呈现证据（岩板/影棚整件）—— 禁止仅因介质词或 seamless 人像背景触发
 * @param {string} b
 */
export function hasFullObjectPresentationEvidence(b) {
  const s = String(b || "");
  if (
    /\b(art object|plain (?:\w+\s+)?(?:grey|gray) wall|studio seamless backdrop|seamless studio backdrop)\b/i.test(
      s
    )
  ) {
    return true;
  }
  // 产品整件：必须同时有墙/底板呈现，避免「product shot of the complete car」误触发
  if (
    /\bproduct shot of the complete\b/i.test(s) &&
    /\b(wall|backdrop|plain (?:grey|gray)|light grey wall)\b/i.test(s)
  ) {
    return true;
  }
  // 经典「厚涂浪 + 灰墙」产品照
  if (
    /\b(paint wave|sculpted from thick brushstrokes|thick brushstrokes)\b/i.test(s) &&
    /\b(wall|backdrop)\b/i.test(s) &&
    /\b(plain|grey|gray|seamless)\b/i.test(s)
  ) {
    return true;
  }
  return false;
}

/**
 * 从文案证据判定介质族（先族后词，禁止跨族默认）
 * @param {string} blob
 * @returns {MediumFamily}
 */
export function resolveMediumFamily(blob) {
  const b = String(blob || "");

  // 写真/时装主导：禁止被衣褶 sculptural 或误贴的 thick dimensional relief 套话抢走
  const photoDominant =
    /\b(photoreal(?:istic)?(?:\s+(?:cgi|photograph))?|studio-editorial|fashion photograph|photographic)\b/i.test(
      b
    ) &&
    !/\b(bas[-\s]?relief|impasto|paint[-\s]?volume|paint wave|厚涂|sculpted from thick)\b/i.test(b);

  // 真·浮雕/厚涂：优先于 illustration（避免 paint 纹理误判 comic）
  if (!photoDominant && hasTrueReliefEvidence(b)) {
    return "relief";
  }

  // 硬边平涂：即使 VLM 误写 comic/soft paint，也优先于 comic（避免族锁死）
  if (hasHardEdgeFlatGraphicEvidence(b)) {
    return "other";
  }

  if (/\b(comic|manga|manhua|anime|动漫|漫画面板|连环画)\b/i.test(b)) return "comic";

  if (
    /\b(cinematic key art|movie poster|key art|graphic design poster|sports poster|photo[-\s]?collage poster|poster collage)\b/i.test(
      b
    )
  ) {
    return "cinematic";
  }

  // CGI / 商品渲染（在裸 relief 套话之后）
  if (
    /\b(octane|unreal engine|pbr|path[-\s]?traced|3d render|photoreal cgi|render3d|glossy reflective|hypercar|sports?\s*car|supercar|automotive (?:studio|render))\b/i.test(
      b
    )
  ) {
    return "cgi";
  }

  if (
    /\b(photograph|photographic|dslr|flash snapshot|editorial photo|studio softbox|studio-editorial|直闪|写真)\b/i.test(
      b
    )
  ) {
    return "photo";
  }

  // 迟到的真浮雕（无写真主导时）
  if (hasTrueReliefEvidence(b)) {
    return "relief";
  }

  if (/\b(illustration|illustrated|painted(?:\s+medium)?|watercolor|手绘|插画)\b/i.test(b)) {
    return "illustration2d";
  }

  return "other";
}

/**
 * 硬边平涂 / 双色调图形肖像证据（非软涂插画）
 * @param {string} b
 */
export function hasHardEdgeFlatGraphicEvidence(b) {
  const s = String(b || "");
  if (
    /\b(photoreal(?:istic)?|photograph|dslr|pores|studio-editorial|fashion photograph)\b/i.test(s) &&
    !/\b(flat graphic|hard[-\s]?edge flat|posteriz(?:ed|e)|duotone)\b/i.test(s)
  ) {
    return false;
  }
  if (
    /\b(hard[-\s]?edge flat(?:\s+color)?(?:\s+fills?)?|flat color fills|flat graphic(?:\s+portrait)?|posteriz(?:ed|e)d?(?:\s+(?:duotone|shadows?))?|duotone(?:\s+graphic)?|hard color shapes?|hard[-\s]?edge flat fills)\b/i.test(
      s
    )
  ) {
    return true;
  }
  const solidVoid =
    /\b(solid black (?:void|background|backdrop|ground|field)|black void|pitch[-\s]?black (?:bg|background|void)|deep black (?:void|ground|backdrop)|black background)\b/i.test(
      s
    ) || /\bbg:#0{3,6}\b/i.test(s);
  const graphicLight =
    /\b(electric blue|magenta|neon (?:rim|pink|magenta|blue|light)|pink (?:light|slab|glow|rim|highlights?)|blue (?:suit|light|slab|glow)|colored light slabs?|graphic (?:colored )?light|high[-\s]?contrast (?:graphic|duotone|lighting)|duotone lighting|light slabs?|pink and blue|blue and pink)\b/i.test(
      s
    ) || /(?:hero|accent|glow):#(?:0000FF|FF00FF|EF0D9B|00(?:00)?FF|FF00(?:FF)?)\b/i.test(s);
  const softMisclaim =
    /\b(soft blended(?:\s+shading)?|thin clean contours|painted illustration|2D illustration|smooth finish|soft[-\s]?painted|comic illustration)\b/i.test(
      s
    );
  // 误标软涂/漫画：黑底 + 高对比色光 + 软涂/漫画措辞
  if (softMisclaim && solidVoid && graphicLight) return true;
  // 诚实硬边：黑底 + 色光 + 肖像/脸，且无湿水彩
  if (
    solidVoid &&
    graphicLight &&
    /\b(portrait|face|head|bust|close[-\s]?up|necktie|suit collar)\b/i.test(s) &&
    !/\b(watercolor|wet wash|gouache)\b/i.test(s)
  ) {
    return true;
  }
  return false;
}

/**
 * 构图分流：完整物件 / 人物半身 / 全景
 * @param {string} blob
 * @param {{ name?: string }[]} [elements]
 * @returns {FramingMode}
 */
export function resolveFramingMode(blob, elements = []) {
  const b = String(blob || "").toLowerCase();
  const people = (Array.isArray(elements) ? elements : []).filter((e) =>
    /\b(figure|person|people|woman|man|girl|boy|child|hiker|character|elderly)\b/i.test(
      String(e?.name || "")
    )
  ).length;

  // 已写贴边裁切 → 绝不走 full_object（避免与 margins 打架）
  if (hasEdgeCropEvidence(b)) {
    // 人物半身优先
  } else if (hasFullObjectPresentationEvidence(b)) {
    return "full_object";
  }

  if (
    /\b(waist[-\s]?up|upper[-\s]?body|torso|medium two[-\s]?shot|半身|上半身)\b/i.test(b) ||
    (people >= 2 &&
      /\b(desk|table|leaning|pointing|documents?|map)\b/i.test(b) &&
      !/\b(full[-\s]?body|wide establishing|entire room)\b/i.test(b))
  ) {
    return "figure_medium";
  }

  if (/\b(wide establishing|full scene|entire scene|establishing shot|远景|全景)\b/i.test(b)) {
    return "wide_scene";
  }

  return "unknown";
}

/**
 * 清掉「四边留白 / 完整入画不裁切」库存套话（无呈现证据时）
 * @param {string} text
 */
export function scrubFullObjectMarginStock(text) {
  return String(text || "")
    .replace(
      /\bcomplete subject(?: centered)? in frame(?: with even residual margins on all four sides)?,?\s*(?:no edge crop,?)?\s*/gi,
      ""
    )
    .replace(/\beven residual margins on all four sides;?\s*(?:no edge crop\.?)?\s*/gi, "")
    .replace(/\bthe frame shows even margins on all (?:four )?sides,?\s*with no edge crops?\.?\s*/gi, "")
    .replace(/\bframe shows even margins on all (?:four )?sides,?\s*with no edge crops?\.?\s*/gi, "")
    .replace(/\bno edge crops? visible;?\s*/gi, "")
    .replace(/\bwith no edge crops? visible\.?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
}

/**
 * 俯视角纠偏：文案已有俯视证据时，禁止默认 eye-level；
 * 同时清掉室内/半身写真上的假俯视
 * @param {string} camera
 * @param {string} blob
 */
export function repairCameraAngle(camera, blob) {
  let cam = String(camera || "").trim();
  const b = `${cam} ${blob}`;

  // 仰拍 / worm's-eye + 天空：剥掉互殴的 top-down / bird's-eye，禁止再注入
  const wormsOrHeroUp =
    /\b(worm'?s?[-\s]?eye|below\s+hip|below\s+waist|hips?\s+dominat)\b/i.test(b) ||
    (/\blow[-\s]?angle(?:\s+looking\s+up)?\b/i.test(b) &&
      /\b(sky|clouds?|ceiling)\b/i.test(b));
  if (wormsOrHeroUp) {
    cam = cam
      .replace(/\btop[-\s]?down(?:\s+\/\s+)?(?:bird'?s[-\s]?eye)?(?:\s+\/\s+)?(?:overhead)?(?:\s+(?:view|perspective|shot))?\b/gi, " ")
      .replace(/\bbird'?s[-\s]?eye(?:\s+(?:view|perspective))?\b/gi, " ")
      .replace(/\boverhead(?:\s+(?:view|perspective|shot))?\b/gi, " ")
      .replace(/\baerial(?:\s+view)?\b/gi, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
      .trim();
    if (!/\blow[-\s]?angle\b/i.test(cam) && !/\bworm'?s?[-\s]?eye\b/i.test(cam)) {
      cam = cam ? `low-angle looking up, ${cam}` : "low-angle looking up";
    }
    return cam;
  }

  const trueTopDownScene =
    (/\bcliffs?\|upper-left\b/i.test(blob) &&
      /\bcliffs?\|upper-right\b/i.test(blob) &&
      /\bboat\|(?:full-height-center|mid(?:-center)?|center)\b/i.test(blob)) ||
    (/\b(canyon|gorge|fjord|shaft|井|峡谷)\b/i.test(blob) &&
      /\b(cliffs?|walls?|岩壁)\b/i.test(blob) &&
      /\b(boat|water|水面|船)\b/i.test(blob));

  // 假俯视：仅纪录片式室内（沙发家庭等）却写成 top-down，且无真俯视场景
  // 禁止把时装/运动/绳上高机位误杀成 eye-level
  const indoorDocFalseTop =
    /\b(living room|sofa|war[-\s]?torn|peeling|CRT(?:\s+box)?|coffee table)\b/i.test(b) &&
    /\b(family|father|mother|children|boy|girl)\b/i.test(b);
  const falseTopDown =
    /\b(top[-\s]?down|bird'?s[-\s]?eye|overhead|aerial view|俯视|鸟瞰)\b/i.test(cam) &&
    !trueTopDownScene &&
    indoorDocFalseTop &&
    !/\b(high[-\s]?angle|looking down|from above|rope|climbing|aerial yoga|overhead sports)\b/i.test(b);

  if (falseTopDown) {
    cam = cam
      .replace(/\btop[-\s]?down(?:\s+\/\s+)?(?:bird'?s[-\s]?eye)?(?:\s+\/\s+)?(?:overhead)?(?:\s+(?:view|perspective|shot))?\b/gi, "eye-level")
      .replace(/\bbird'?s[-\s]?eye(?:\s+(?:view|perspective))?\b/gi, "eye-level")
      .replace(/\boverhead(?:\s+(?:view|perspective|shot))?\b/gi, "eye-level")
      .replace(/\baerial(?:\s+view)?\b/gi, "eye-level")
      .replace(/\beye-level(?:\s*,\s*eye-level)+\b/gi, "eye-level");
    if (!/\beye[-\s]?level\b/i.test(cam)) {
      cam = cam ? `eye-level, ${cam}` : "eye-level";
    }
    return cam.replace(/\s{2,}/g, " ").replace(/,\s*,+/g, ",").trim();
  }

  // 假仰视：亲密床上/颈肩特写却写 low-angle + crown/floor（无天空/天花板）
  const trueLowCue =
    /\b(sky|clouds?|ceiling|worm'?s[-\s]?eye|chin underside|looking up (?:at|toward) (?:the )?(?:sky|ceiling))\b/i.test(
      b
    );
  const intimateClose =
    /\b(close[-\s]?up|bust|neck|collarbone|lying|bed|pillow|sheet|intimate)\b/i.test(b) ||
    (/\b(shoulder|jaw|lips)\b/i.test(b) && /\b(portrait|close)\b/i.test(b));
  const falseLowAngle =
    /\blow[-\s]?angle(?:\s+looking\s+up)?\b/i.test(cam) &&
    intimateClose &&
    !trueLowCue;
  if (falseLowAngle) {
    cam = cam
      .replace(/\blow[-\s]?angle(?:\s+looking\s+up)?\b/gi, "eye-level")
      .replace(/\bcrown(?:\s+of\s+head)?\s+foreshortening[^,]*/gi, " ")
      .replace(/\bfloor plane below[^,]*/gi, " ")
      .replace(/\bcapturing crown[^,]*/gi, " ")
      .replace(/\beye-level(?:\s*,\s*eye-level)+\b/gi, "eye-level");
    if (!/\beye[-\s]?level\b/i.test(cam)) {
      cam = cam ? `eye-level, ${cam}` : "eye-level";
    }
    return cam.replace(/\s{2,}/g, " ").replace(/,\s*,+/g, ",").trim();
  }

  // 仅真鸟瞰词才升 top-down。FORBIDDEN：bare "looking down"（含 high-angle looking down / 街道习语）
  // 「俯视」常等同高机位，不单独当作鸟瞰证据。
  const topDownWords =
    /\b(top[-\s]?down|bird'?s[-\s]?eye|overhead|looking straight down|aerial view|鸟瞰|直俯)\b/i.test(
      b
    );
  // 两侧上沿悬崖夹船：典型峡谷俯视，即使模型漏写 top-down
  const flankingCliffs =
    /\bcliffs?\|upper-left\b/i.test(blob) && /\bcliffs?\|upper-right\b/i.test(blob);
  const boatCenter = /\bboat\|(?:full-height-center|mid(?:-center)?|center)\b/i.test(blob);
  const canyonLike =
    /\b(canyon|gorge|fjord|shaft|井|峡谷)\b/i.test(blob) &&
    /\b(cliffs?|walls?|岩壁)\b/i.test(blob) &&
    /\b(boat|water|水面|船)\b/i.test(blob);
  const canyonScene = trueTopDownScene || (flankingCliffs && boatCenter) || canyonLike;

  if (!topDownWords && !canyonScene) return cam;

  // 已有明确 high-angle、且非峡谷/无真鸟瞰词：保持高机位，禁止再升成 bird's-eye
  if (
    /\bhigh[-\s]?angle\b/i.test(cam) &&
    !canyonScene &&
    !/\b(top[-\s]?down|bird'?s[-\s]?eye|overhead|looking straight down|aerial view|鸟瞰|直俯)\b/i.test(b)
  ) {
    return cam;
  }

  cam = cam.replace(/\beye[-\s]?level(?:\s+perspective|\s+view|\s+angle)?\b/gi, "top-down bird's-eye");
  if (!/\b(top[-\s]?down|bird'?s[-\s]?eye|overhead|aerial)\b/i.test(cam)) {
    cam = cam ? `top-down bird's-eye view, ${cam}` : "top-down bird's-eye view";
  }
  return cam.replace(/\s{2,}/g, " ").replace(/,\s*,+/g, ",").trim();
}

/** 各族允许的 style 主标签（纠错用，不发明场景） */
/** 各族兜底标签：仅在文案被清空时用最短中性词，禁止发明场景道具（岩板/影棚等） */
export const FAMILY_STYLE_LOCK = {
  comic: "comic illustration",
  illustration2d: "painted illustration",
  relief: "thick dimensional relief",
  photo: "photoreal photograph",
  cgi: "photoreal CGI",
  cinematic: "cinematic key art",
  other: "",
};

/** 各族对抗负向（极短） */
export const FAMILY_NEGATIVE = {
  comic:
    "photoreal CGI, cinematic film still, Unreal Engine, soft blended painterly wash, smooth photoreal skin, shallow DOF",
  illustration2d: "photoreal CGI, cinematic film still, Unreal Engine",
  relief: "flat 2D comic rewrite, large hero-sized person, painted comic upgrade",
  photo: "anime faces, movie title overlay",
  cgi: "flat 2d comic, anime faces, sculptural relief plaque",
  cinematic: "flat vector, comic illustration upgrade, soft blended 2D illustration",
  other: "",
};

/**
 * 按介质族澄清 style：只清冲突、钉本族标签；无证据不发明 comic/relief
 * @param {string} style
 * @param {string} [evidenceBlob]
 */
export function clarifyStyleByFamily(style, evidenceBlob = "") {
  let s = String(style || "").trim();
  if (!s) return "";
  const family = resolveMediumFamily(`${s} ${evidenceBlob}`);

  // 任何族都剔除镜头/色板/构图串味
  s = s
    .replace(
      /\b(?:eye[-\s]?level|high[-\s]?angle|low[-\s]?angle|worm'?s[-\s]?eye|bird'?s[-\s]?eye)(?:\s+shot)?\b/gi,
      " "
    )
    .replace(
      /\b(?:wide establishing|full scene|medium[-\s]?wide|medium two[-\s]?shot|medium shot|close[-\s]?up|bust shot|waist[-\s]?up)(?:\s+framing|\s+shot)?\b/gi,
      " "
    )
    .replace(/\b(?:shallow|deep)\s+DOF\b/gi, " ")
    .replace(/\b(?:bokeh|anamorphic|lens(?:\s+feel)?|telephoto|wide[-\s]?angle lens)\b/gi, " ")
    .replace(/#?[0-9A-Fa-f]{6}\b/g, " ")
    .replace(/\bprimary_anchor\b[^,]*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();

  const strip = (re) => {
    s = s.replace(re, " ").replace(/\s{2,}/g, " ").replace(/,\s*,+/g, ",").replace(/^[,;\s]+|[,;\s]+$/g, "").trim();
  };

  if (family === "relief") {
    strip(/\bpainted comic(?:\s+illustration)?\b/gi);
    strip(/\bcomic illustration\b/gi);
    strip(/\bpainted illustration\b/gi);
    strip(/\bpainted medium\b/gi);
    strip(/\bsoft painterly shading\b/gi);
    strip(/\bclean figure edges\b/gi);
    strip(/\billustration\b/gi);
    strip(/\bpainted\b/gi);
    strip(/\bcinematic\b/gi);
    strip(/\bcomic\b/gi);
    // 清掉本工具曾注入的固定「岩板物件/影棚」套话（无图证也不该留）
    strip(/\bsculptural relief art object\b/gi);
    strip(/\bstudio seamless backdrop\b/gi);
    strip(/\bseamless studio backdrop\b/gi);
    strip(/\bart object\b/gi);
    // 仅当原文已有立体/厚涂证据词时保留；否则用最短中性词，不发明岩板/影棚
    if (!/\b(sculptur|relief|impasto|paint[-\s]?volume|dimensional|浮雕|厚涂)\b/i.test(s)) {
      const fromEvidence = String(evidenceBlob || "");
      if (/\bimpasto\b/i.test(fromEvidence)) s = "thick impasto relief";
      else if (/\b(sculptur|relief|浮雕)\b/i.test(fromEvidence)) s = "dimensional relief";
      else s = FAMILY_STYLE_LOCK.relief;
    }
  } else if (family === "comic") {
    strip(/\bcinematic(?:\s+still(?:\s+style)?|\s+film still|\s+key art)?\b/gi);
    strip(/\bunreal engine\b/gi);
    strip(/\boctane(?:\s+render)?\b/gi);
    strip(/\bphotoreal(?:istic)?(?:\s+cgi)?\b/gi);
    // 保留 anime/manga/manhua；去掉泛 soft-paint 塌缩标签
    strip(/\bpainted illustration\b/gi);
    const animeManga = /\b(anime|manga|manhua|动漫)\b/i.test(`${s} ${evidenceBlob}`);
    if (animeManga) {
      // 角色 anime/manga：拆「半写实软涂磨皮」默认栈，避免生成器画出数字软插画
      strip(/\bsmooth finish\b/gi);
      strip(/\bsmooth digital finish\b/gi);
      s = s
        .replace(/\bsemi-realistic anime illustration\b/gi, "anime illustration")
        .replace(/\bsoft blended(?:\s+shading)?\b/gi, "stylized shading")
        .replace(/\bsoft painterly shading\b/gi, "stylized shading");
      if (!/\b(cel[-\s]?shad(?:ed|ing)|hard flat (?:shadow )?bands?|stylized shading)\b/i.test(s)) {
        s = `${s}${s ? ", " : ""}stylized shading`;
      }
      if (!/\b(clean (?:ink |character )?linework|ink line(?:work)?|clean lines?)\b/i.test(s)) {
        s = `${s}${s ? ", " : ""}clean ink linework`;
      }
    }
    if (!/\b(comic|manga|manhua|anime)\b/i.test(s)) {
      s = `${FAMILY_STYLE_LOCK.comic}${s ? `, ${s}` : ""}`;
    }
    s = s.replace(/\s{2,}/g, " ").replace(/,\s*,+/g, ",").replace(/^[,;\s]+|[,;\s]+$/g, "").trim();
  } else if (family === "illustration2d") {
    strip(/\bcinematic(?:\s+still(?:\s+style)?|\s+film still|\s+key art)?\b/gi);
    strip(/\bunreal engine\b/gi);
    strip(/\boctane(?:\s+render)?\b/gi);
    strip(/\bphotoreal(?:istic)?(?:\s+cgi)?\b/gi);
    // 禁止把普通插画发明成 comic（anime 已由 comic 族处理）
    s = s
      .replace(/\bpainted comic(?:\s+illustration)?\b/gi, "painted illustration")
      .replace(/\bcomic illustration\b/gi, "painted illustration")
      .replace(/\bpainted medium(?:\s+with\s+detailed\s+shading(?:\s+and\s+texture)?)?\b/gi, "soft painterly shading");
    if (/^illustration\b/i.test(s) && /\bpainted\b/i.test(s)) {
      s = s.replace(/^illustration\b[, ]*/i, "painted illustration, ");
    }
    // 介质互斥：水彩 / 软涂 / flat vector / 赛璐璐 不得同场
    const evid = `${s} ${evidenceBlob}`;
    const isWatercolor = /\bwatercolor|gouache|wet wash\b/i.test(evid);
    const hasCel = /\b(cel[-\s]?shad(?:ed|ing)|anime(?:\s+cel)?|hard flat (?:shadow )?bands?|manga panel)\b/i.test(
      evid
    );
    const hasFlatVector = /\bflat vector\b/i.test(s);
    const hasSoftPaint = /\b(painted illustration|soft blended|soft painterly)\b/i.test(s);
    if (isWatercolor) {
      strip(/\bflat vector\b/gi);
      strip(/\bpainted illustration\b/gi);
      strip(/\bclean lines?\b/gi);
      if (!/\bwatercolor\b/i.test(s)) s = `watercolor${s ? `, ${s}` : ""}`;
    } else if (hasCel) {
      strip(/\bpainted illustration\b/gi);
      strip(/\bsoft blended(?:\s+shading)?\b/gi);
      strip(/\bsoft painterly shading\b/gi);
      strip(/\bflat vector\b/gi);
    } else if (hasSoftPaint) {
      strip(/\bflat vector\b/gi);
    } else if (hasFlatVector) {
      strip(/\bpainted illustration\b/gi);
      strip(/\bsoft blended(?:\s+shading)?\b/gi);
    }
  } else if (family === "cgi") {
    strip(/\b(?:comic|manga|manhua|anime|cel[-\s]?ink)\b/gi);
    strip(/\bcinematic still style\b/gi);
    strip(/\bcinematic film still\b/gi);
    // 清掉误挂在商品 CGI 上的浮雕套话
    strip(/\bsculptur(?:al|e)?\b/gi);
    strip(/\bbas[-\s]?relief\b/gi);
    strip(/\bimpasto\b/gi);
    strip(/\bpaint[-\s]?volume\b/gi);
    s = s.replace(/\brender3d\s*\/\s*relief\b/gi, "photoreal CGI");
    strip(/\brelief\b/gi);
    if (!/\b(cgi|3d|octane|unreal|pbr|render)\b/i.test(s)) {
      s = `${FAMILY_STYLE_LOCK.cgi}${s ? `, ${s}` : ""}`;
    }
  } else if (family === "cinematic") {
    strip(/\b(?:comic|manga|manhua|anime|cel[-\s]?ink)\b/gi);
    strip(/\b2D illustration\b/gi);
    strip(/\bpainted illustration\b/gi);
    strip(/\bsoft blended shading\b/gi);
    strip(/\bthin clean contours\b/gi);
    s = s.replace(/\bcinematic film still\b/gi, "cinematic key art");
    if (/\bcinematic key art\b/i.test(s) && /\bmovie poster\b/i.test(s)) {
      strip(/\bmovie poster\b/gi);
    }
    // 图形/运动海报：无电影 key art 词时钉 graphic design poster
    if (
      !/\b(cinematic key art|graphic design poster|sports poster|movie poster|key art)\b/i.test(s) &&
      /\b(graphic design poster|sports poster|photo[-\s]?collage|photo(?:graphic)? cutout|poster collage)\b/i.test(
        `${s} ${evidenceBlob}`
      )
    ) {
      s = `graphic design poster${s ? `, ${s}` : ""}`;
    } else if (!/\b(cinematic|graphic design poster|sports poster|key art|movie poster)\b/i.test(s)) {
      s = `${FAMILY_STYLE_LOCK.cinematic}${s ? `, ${s}` : ""}`;
    }
  } else if (family === "photo") {
    strip(/\b(?:comic|manga|manhua|anime|cel[-\s]?ink|cinematic still style|octane|unreal)\b/gi);
    strip(/\bthick dimensional relief\b/gi);
    strip(/\bsculptural relief\b/gi);
    strip(/\bsoft blended shading\b/gi);
    strip(/\bthin clean contours\b/gi);
    // 写真禁止残留线稿词
    strip(/\bclean line(?:\s+art)?s?\b/gi);
    strip(/\bcontour lines?\b/gi);
    strip(/\bink outlines?\b/gi);
    if (!/\b(photoreal|photograph|photographic|editorial|studio)\b/i.test(s)) {
      s = `${FAMILY_STYLE_LOCK.photo}${s ? `, ${s}` : ""}`;
    }
  }

  // 压缩：最多 4 段
  const parts = s
    .split(/,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set();
  const uniq = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    const wc = p.split(/\s+/).length;
    if (wc > 12) continue;
    seen.add(key);
    uniq.push(p);
    if (uniq.length >= 4) break;
  }
  return uniq.join(", ");
}

/**
 * 按构图模式修正景别措辞（只纠偏，不发明场景）
 * @param {string} text
 * @param {FramingMode} mode
 */
export function applyFramingToText(text, mode) {
  let t = String(text || "");
  if (mode === "figure_medium") {
    return t
      .replace(/\bwide establishing(?:\s+shot)?\b/gi, "medium two-shot")
      .replace(/\bfull scene\b/gi, "medium two-shot")
      .replace(/\bmedium[-\s]?wide(?:\s+framing|\s+shot)?\b/gi, "medium two-shot")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  if (mode === "full_object") {
    return t
      .replace(/\bmedium[-\s]?wide(?:\s+framing|\s+shot)?\b/gi, "complete subject in frame, no edge crop")
      .replace(/\bmedium shot\b/gi, "complete subject in frame, no edge crop")
      .replace(/\bclose[-\s]?up\b/gi, "complete subject in frame, no edge crop")
      .replace(/\bfull-object product framing\b/gi, "complete subject in frame, no edge crop")
      .replace(/\bproduct\/full-object scale for complete piece\b/gi, "complete subject scale")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  if (mode === "wide_scene") {
    return t.replace(/\bclose[-\s]?up\b/gi, "wide establishing shot").replace(/\s{2,}/g, " ").trim();
  }
  return t.trim();
}

/**
 * 微型人物尺度锁：小人就是小人，与是否浮雕无关
 * 仅在有「微小/比例尺」证据，或大物件上的人被误抬成 primary 时纠偏
 * 人物主导半身/桌景叙事不触发
 * @param {{ positive: string, layout: string, elements: string, style?: string }} pack
 */
export function repairMiniatureFigureScale(pack) {
  let pos = String(pack.positive || "").trim();
  let lay = String(pack.layout || "").trim();
  let els = String(pack.elements || "").trim();
  const style = String(pack.style || "").trim();
  const blob = `${pos} ${lay} ${els} ${style}`;

  // 人物主导叙事（半身、桌前双人等）直接跳过
  const figureDominantScene =
    resolveFramingMode(blob) === "figure_medium" ||
    /\b(waist[-\s]?up|medium two[-\s]?shot|upper body|at (?:a |the )?desk|leaning|pointing)\b/i.test(blob);

  if (figureDominantScene) {
    return { positive: pos, layout: lay, elements: els };
  }

  const hasExplicitTiny =
    /\b(tiny|miniature|miniscule|minuscule|scale (?:figure|accent|prop)|speck[- ]sized|微小|比例尺|极小)\b/i.test(
      blob
    );

  const hasLargeMass =
    /\b(paint wave|wave mass|sculptur|assemblage|landscape mass|mountain|cliff face|building facade|vast|dominat(?:es|ing) (?:the )?(?:frame|right|left|center))\b/i.test(
      blob
    ) || resolveFramingMode(blob) === "full_object";

  const personWronglyPrimary =
    /\b(primary(?: element)? is the (?:hiker|tiny|miniature)|(?:hiker|climber)\|[^;]*\|primary)\b/i.test(blob) &&
    hasLargeMass;

  // 无「已是小人」证据、也无「大物件上误抬成人」→ 不动
  if (!hasExplicitTiny && !personWronglyPrimary) {
    return { positive: pos, layout: lay, elements: els };
  }

  // 只改已是微小词 / hiker·climber 比例尺角色，不改普通叙事人名
  els = els
    .split(/\s*;\s*/)
    .filter(Boolean)
    .map((clause) => {
      const parts = clause.split("|").map((x) => x.trim());
      if (parts.length < 2) return clause;
      let [name, zone, salience = "secondary"] = parts;
      const isScalePropNoun =
        /\b(tiny|miniature|miniscule|scale figure|hiker|climber)\b/i.test(name) ||
        (personWronglyPrimary && /\b(hiker|climber|figure|person)\b/i.test(name));
      if (!isScalePropNoun) return clause;
      if (!/\b(tiny|miniature|miniscule|scale figure|微小|比例)\b/i.test(name)) {
        name = `tiny miniature ${name.replace(/^(tiny|miniature)\s+/i, "")}`.replace(/\s{2,}/g, " ");
      }
      salience = "secondary";
      return `${name}|${zone}|${salience}`;
    })
    .join("; ");

  // 大物件场景若无人以外的 primary，补主导质量
  if (
    hasLargeMass &&
    !/\|\w[^|]*\|primary\b/i.test(els)
  ) {
    const waveBit = /\bpaint wave\b/i.test(blob)
      ? "thick white paint-wave mass|mid-center|primary"
      : "dominant large mass|mid-center|primary";
    els = els ? `${waveBit}; ${els}` : waveBit;
  }

  lay = lay
    .replace(
      /\b(?:the )?primary(?: element)? is the hiker[^.]{0,140}\./gi,
      "primary: dominant large mass at frame center; tiny miniature figure is only a secondary scale accent."
    )
    .replace(/\bprimary_anchor[^,]{0,80}hiker[^,]{0,40}/gi, "primary_anchor: center mid for dominant mass")
    .replace(/\bhiker[^\n,]{0,40}primary\b/gi, "tiny miniature figure secondary");

  if (!/\btiny miniature\b/i.test(lay) && (hasExplicitTiny || personWronglyPrimary)) {
    lay = `${lay} Tiny miniature figure for scale only — not a hero-sized person.`
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  if ((hasExplicitTiny || personWronglyPrimary) && !/\btiny miniature\b/i.test(pos)) {
    pos = `tiny miniature figure for scale only (NOT a large hero figure), ${pos}`
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  pos = pos
    .replace(/\bA hiker\b/g, "A tiny miniature hiker")
    .replace(/\bthe hiker is the primary subject\b/gi, "the tiny figure is only a scale accent");

  return { positive: pos, layout: lay, elements: els };
}

/**
 * 完整物件被误写成人物偏移裁切时纠回（仅当证据充分）
 * @param {{ positive: string, layout: string, camera: string, elements?: string, style?: string }} pack
 */
export function repairFramingByMode(pack) {
  let pos = String(pack.positive || "").trim();
  let lay = String(pack.layout || "").trim();
  let cam = String(pack.camera || "").trim();
  const style = String(pack.style || "").trim();
  const els = String(pack.elements || "").trim();
  const blob = `${pos} ${lay} ${cam} ${els} ${style}`;
  const mode = resolveFramingMode(blob);
  const edgeCrop = hasEdgeCropEvidence(blob);
  const presentation = hasFullObjectPresentationEvidence(blob);

  pos = applyFramingToText(pos, mode);
  cam = applyFramingToText(cam, mode);
  lay = applyFramingToText(lay, mode);

  // 贴边裁切 或 非完整物件呈现：清掉冲突的留白套话，绝不注入
  if (edgeCrop || mode !== "full_object" || !presentation) {
    pos = scrubFullObjectMarginStock(pos);
    lay = scrubFullObjectMarginStock(lay);
    cam = scrubFullObjectMarginStock(cam);
    if (mode !== "full_object" || edgeCrop || !presentation) {
      return {
        positive: pos,
        layout: lay,
        camera: cam,
        framingMode: edgeCrop ? (mode === "full_object" ? "unknown" : mode) : mode,
      };
    }
  }

  // 完整物件模式：一律清掉本工具曾注入的「岩板物件 / 影棚底板」套话（即使 framing 已正确）
  const scrubSlabStock = (s) =>
    String(s || "")
      .replace(
        /\bfull sculptural object centered in frame with even residual margins on all four sides, no edge crop of the (?:object|wave or rock) silhouette,?\s*/gi,
        ""
      )
      .replace(/\bstudio seamless backdrop\b/gi, "")
      .replace(/\bseamless studio backdrop\b/gi, "")
      .replace(/\bsculptural relief art object\b/gi, "")
      .replace(/\bfull-object product framing\b/gi, "complete subject in frame, no edge crop")
      .replace(/\bproduct\/full-object scale for complete piece\b/gi, "complete subject scale")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,+/g, ",")
      .replace(/^[,;\s]+|[,;\s]+$/g, "")
      .trim();

  pos = scrubSlabStock(pos);
  cam = scrubSlabStock(cam);
  lay = scrubSlabStock(lay);

  const falseOffset = /\b(upper[-\s]?left quadrant|lower left of the frame|slightly offset from the vertical)\b/i.test(
    blob
  );
  const alreadyFull = /\b(complete subject|full object in frame|even margins on all|no edge crop)\b/i.test(
    `${pos} ${lay} ${cam}`
  );

  if (falseOffset || !alreadyFull) {
    // 只锁「完整入画 + 留白/不裁切」，不发明「雕塑岩板/影棚物件」
    const framing =
      "complete subject centered in frame with even residual margins on all four sides, no edge crop";
    if (!/\b(complete subject|full (?:sculptural )?object) in frame\b/i.test(pos)) {
      pos = `${framing}, ${pos}`.replace(/\s{2,}/g, " ").trim();
    }
    pos = pos
      .replace(/\bThe rock is positioned on the lower left of the frame\.?\s*/gi, "")
      .replace(/\bdominates the mid-right area\b/gi, "forms the right mass of the centered composition");

    lay = lay
      .replace(
        /\bThe primary element is the hiker[^.]{0,120}\./gi,
        "primary: dominant mass at frame center; tiny miniature figure is only a secondary scale accent."
      )
      .replace(/\bupper[-\s]?left quadrant\b/gi, "center")
      .replace(/\bslightly offset from the vertical\b/gi, "center-weighted");
    if (!/\beven residual margins|no edge crop\b/i.test(lay)) {
      lay = `${lay} Even residual margins on all four sides; no edge crop.`.replace(/\s{2,}/g, " ").trim();
    }
    if (!/\b(complete subject|no (?:edge )?crop)\b/i.test(cam)) {
      cam = cam
        ? `${cam}, complete subject in frame, no edge crop`
        : "eye-level, complete subject in frame, no edge crop";
    }
  }

  return { positive: pos, layout: lay, camera: cam, framingMode: mode };
}

/**
 * 按族整理负向：清冲突粉红象，只补本族最短对抗
 * @param {string} negative
 * @param {MediumFamily} family
 */
export function negativesForFamily(negative, family) {
  let n = String(negative || "").trim();
  if (family === "relief") {
    n = n
      .replace(/\bphotoreal skin\b/gi, "")
      .replace(/\bcinematic film still\b/gi, "")
      .replace(/\bUnreal\/octane CGI\b/gi, "")
      .replace(/\bunreal engine\b/gi, "")
      .replace(/\boctane(?:\s+CGI|\s+render)?\b/gi, "")
      .replace(/\blive-action upgrade\b/gi, "")
      .replace(/\bcel[-\s]?ink(?:\s+illustration)?\b/gi, "");
  } else if (family === "comic" || family === "illustration2d") {
    n = n.replace(/\bcel[-\s]?ink(?:\s+illustration)?\b/gi, "").replace(/\bcomic outlines?\b/gi, "");
    // 禁止把可见的赛璐璐/动漫/墨线完成面写进负向
    n = n
      .replace(/\b(?:do not:?\s*)?avoid cel[-\s]?shading\b/gi, "")
      .replace(/\b(?:do not:?\s*)?avoid anime(?:[-\s]?style)?(?:\s+faces)?\b/gi, "")
      .replace(/\b(?:do not:?\s*)?avoid (?:ink\s+)?outlines?\b/gi, "")
      .replace(/\b(?:avoid\s+)?ink outlines?\b/gi, "")
      .replace(/\bcontour lines?\b/gi, "")
      .replace(/\bclean line art\b/gi, "")
      .replace(/\bno cel[-\s]?shading\b/gi, "")
      .replace(/\bcel[-\s]?shading\b/gi, "")
      // 软绘/漫画正脸：负向勿禁 cartoonish / 简化五官 / cel-shaded line art
      .replace(/\bcel[-\s]?shaded(?:\s+line\s+art)?\b/gi, "")
      .replace(/\bcartoonish(?:\s+style)?\b/gi, "")
      .replace(/\bsimplified facial features\b/gi, "")
      // “missing X” 负向易粉红象，且与插画完成面无关
      .replace(/\bmissing\s+[A-Za-z0-9][\w-]*(?:\s+[A-Za-z0-9][\w-]*){0,3}\b/gi, "");
  } else if (family === "cgi") {
    n = n
      .replace(/\bsculptural relief(?:\s+art object)?\b/gi, "")
      .replace(/\bimpasto\b/gi, "");
  }
  n = n
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();

  const extra = FAMILY_NEGATIVE[family] || "";
  if (!extra) return n;
  const parts = [...n.split(/,\s*/), ...extra.split(/,\s*/)]
    .map((x) => x.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.join(", ");
}

/**
 * 漫画/anime 族：清掉会把生成器推向软涂数字插画的措辞
 * @param {string} text
 */
export function scrubAnimeMangaSoftStack(text) {
  return String(text || "")
    .replace(/\bsemi-realistic anime illustration\b/gi, "anime illustration")
    .replace(/\bsoft blended(?:\s+shading)?\b/gi, "stylized shading")
    .replace(/\bsoft painterly shading\b/gi, "stylized shading")
    .replace(/\bsmooth(?:\s+digital)? finish\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .trim();
}

/**
 * 漫画/anime 族：清掉假摄影景深（平面 2D 不该浅景深/bokeh）
 * @param {string} camera
 */
export function scrubAnimeMangaPhotoOptics(camera) {
  let c = String(camera || "");
  // 残缺 "no or optical bokeh" 之类先修成明确否定，再处理浅景深
  c = c.replace(/\bno\s+or\s+optical\s+bokeh\b/gi, "no optical bokeh");
  if (/\bshallow(?:\s+depth(?:\s+of\s+field)?|\s+DOF)\b/i.test(c)) {
    c = c
      .replace(/\bshallow(?:\s+depth(?:\s+of\s+field)?|\s+DOF)\b[^,]*/gi, "fully sharp flat 2D rendering")
      .replace(
        /\b(?:soft\s+)?(?:background\s+)?(?:tile\s+)?blur(?:\s+while\s+subject\s+remains\s+sharply\s+rendered)?\b/gi,
        ""
      )
      .replace(/\boptical bokeh\b[^,]*/gi, "")
      .replace(/\bbokeh(?:\s+circles?)?\b/gi, "");
  }
  return c
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[,;\s.]+|[,;\s.]+$/g, "")
    .trim();
}

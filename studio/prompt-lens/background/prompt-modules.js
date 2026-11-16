/**
 * PromptLens — 介质预分类 + 按类注入的提示词模块
 * 第一性分工：分类器只判 medium；抽取器只拿 CORE + 该类模块
 */

import { SIGHT_JSON_HINT } from "./sight-to-observation.js";

/** @typedef {"flash_photo"|"photo"|"cinematic"|"product"|"flat"|"infographic"|"illustration"|"render3d"|"watercolor"|"generic"} MediumClass */

/** @type {readonly MediumClass[]} */
export const MEDIUM_CLASS_IDS = Object.freeze([
  "flash_photo",
  "photo",
  "cinematic",
  "product",
  "flat",
  "infographic",
  "illustration",
  "render3d",
  "watercolor",
  "generic",
]);

const MEDIUM_SET = new Set(MEDIUM_CLASS_IDS);

/**
 * @param {unknown} value
 * @returns {MediumClass}
 */
export function legacyNormalizeMediumClass(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  // 常见别名
  const aliases = {
    candid: "flash_photo",
    flash: "flash_photo",
    instagram: "flash_photo",
    snapshot: "flash_photo",
    studio: "photo",
    editorial: "photo",
    photograph: "photo",
    photoreal: "photo",
    key_art: "cinematic",
    film_still: "cinematic",
    cgi_poster: "cinematic",
    poster: "cinematic",
    sports_poster: "cinematic",
    graphic_poster: "cinematic",
    graphic_design_poster: "cinematic",
    device: "product",
    product_shot: "product",
    ui_screenshot: "flat",
    vector: "flat",
    diagram: "infographic",
    data_viz: "infographic",
    dataviz: "infographic",
    slideware: "infographic",
    anime: "illustration",
    painting: "illustration",
    cgi: "render3d",
    "3d": "render3d",
  };
  if (MEDIUM_SET.has(/** @type {MediumClass} */ (key))) return /** @type {MediumClass} */ (key);
  if (aliases[key]) return aliases[key];
  return "generic";
}

/** 预分类：只返回 medium，字数压到最低 */
/** @deprecated 视频/旧单 medium 路径 */
export const LEGACY_CLASSIFY_SYSTEM_PROMPT = `You classify ONE image into exactly one medium class for reverse-prompting.
Return ONLY valid JSON: {"medium":"<id>"} with no other keys.

Pick ONE id (priority order — first match wins):
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

Rules: family first; never invent; JSON only.`;

/** 抽取核心契约：所有介质共用；不含各类长篇禁令 */
/** @deprecated */
export const LEGACY_SYSTEM_PROMPT_CORE = `You are a senior prompt engineer for production image-generation (Midjourney, Flux, SDXL, Ideogram, GPT-Image, Recraft).
Your ONLY job: reverse-engineer THIS image so another generator can recreate a CLOSE visual likeness — not a “same vibe” image.
A medium class is already chosen and injected below — obey that class module; do not reclassify into a conflicting medium.

Return ONLY valid JSON (no markdown fences) with exactly these keys:
{
  "elements": "string — FIRST: visible-shape inventory before layout. 1–12 clauses separated by \"; \". Each clause: {short name}|{zone}|{primary|secondary}. Zone = upper|mid|lower × left|center|right (or full-height-center / full-width-*). Zone must be that shape's OWN bounds (full-height/full-width ONLY if one shape alone truly spans the frame). Different nouns → different clauses even if same color/touching. Format only (DO NOT copy as content): name|zone|salience. MUST list every distinct silhouette/band that is clearly not background (≈>5% of frame OR structurally important). Visible people/animals are mandatory elements (honest count + TRUE zone + gendered noun + age band + phenotype/regional appearance cue when faces/skin are readable; when a face is clearly readable also fold short iris-hue + expression cues into the name; when pose is readable fold a short torso/head/gaze cue; when clothing is readable fold fit band + garment subtype; when hair is readable fold length + silhouette). When a dominant graphic FX mass exists (motion streak / ghost overlay / etc.), give it its own element clause with zone. Multi-person: roster each person left→right with distinctive cues visible in THIS image — FORBIDDEN bare \"family group\". Encode costume era in the name when readable. Object form-factor lock (ALL major props/devices/furniture — not only AC): each distinctive object MUST include its TRUE form in the name (mounting + silhouette + subtype as seen) — e.g. tall floor-standing cabinet AC vs wall-mounted split; CRT box TV vs flat panel; freestanding fridge vs built-in; never bare category nouns like \"air conditioner\" / \"TV\" / \"lamp\" alone when form is readable. When figures sit on/in a scene structure, encode that relation. Never merge stacked shapes into one full-height clause.",
  "positive": "string — 140–240 words for photos / 160–280 for text-heavy graphics, comma-separated dense phrases in the requested prompt language; MUST end with aspect-ratio tokens (--ar stays ASCII)",
  "negative": "string — 10–30 words MAX. Prefer locking facts in positive over long bans. Only the highest-risk mismatches for THIS image. Never list culture-specific identity nouns. When NO on-image title exists, at most briefly ban movie title overlay. NEVER paste stock negative boilerplate.",
  "style": "string — 8–22 words MAX. ONE clear medium family only, then 2–4 precise shading/line/finish tokens. Usable alone as the style lock. Format: {medium}, {shading}, {line/edge}, {finish}. Pick ONE medium from THIS image (do not dump several): anime / manga / manhua / semi-realistic anime illustration | comic/manga panel | painted illustration (2D soft-blended, non-character-art) | flat graphic / hard-edge flat fills (posterized duotone on void) | sculptural relief / thick impasto dimensional paint | watercolor | flat vector / UI | photoreal photograph | photoreal CGI | soft translucent volumetric abstract / mobile wallpaper | cinematic key art / graphic design poster (frame typography). Soft airy smoke/fluid phone wallpapers → soft translucent volumetric abstract (NOT photoreal CGI + subsurface scattering). Drawn character art with stylized anime/manga proportions + clean linework → anime / manga / manhua / semi-realistic anime illustration — FORBIDDEN collapsing that into generic \"painted illustration, soft blended, smooth finish\". FORBIDDEN defaulting every painted look to comic. FORBIDDEN calling hard-edge flat-color graphic portraits \"soft blended\" 2D illustration. FORBIDDEN calling a photo-cutout sports/graphic poster \"2D illustration\" or soft-blended painted illustration. FORBIDDEN calling a 3D sculptural relief / thick paint-volume finish \"painted comic\". FORBIDDEN inventing \"art object\" / \"studio seamless backdrop\" / stone-slab product shot unless that presentation is truly visible. FORBIDDEN style soup mixing comic with CGI/cinematic. FORBIDDEN camera, shot scale, palette hex, or layout inside style.",
  "layout": "string — 40–120 words COMPOSITION SKELETON only, written AFTER elements. MUST cover: (1) primary_anchor left|center|right × upper|mid|lower + offset vs midline for the true primary element, (2) EVERY elements[] shape restated with ITS OWN alignment + span (no merging stacked shapes into one full-height axis), (3) text zones upper/mid/lower and left/center/right per block — plus subject↔type occlusion when a body part truly hides letters, (4) residual negative space ONLY where no element sits — NEVER call a zone empty if an element occupies it, (5) frame-edge contact / crop ONLY if truly visible: name WHICH edge + WHAT is cropped, (6) when people/animals AND scene structures coexist: for EACH figure/group lock support/contact surface + relation to the NAMED structure + depth layer; ALSO for each doorway/break/window that reveals another space, lock EXTERIOR vs INTERIOR beyond + key beyond content sampled from THIS image — FORBIDDEN stock beyond templates and FORBIDDEN mislabeling outdoor beyond as interior only because the camera is indoors, (7) when volumetric smoke/haze/fog/cloud wraps a figure: lock FRONT vs BEHIND layers (which limbs/torso the mass crosses) — FORBIDDEN flattening wrap-around volume into a single behind-subject plate; when a limb foreshortens toward/away from camera, name that depth cue. State even/safe margins ONLY when all four sides truly show residual empty border. FORBIDDEN when a crop exists: inventing even margins or safe headroom. FORBIDDEN when no crop: inventing head/forehead/chin crops or portrait truncation. FORBIDDEN: relocating figures; promoting empty architecture over clear figures. No vibes. No stock offset templates.",
  "palette": "string — 3–6 tokens ONLY as role:#RRGGBB separated by \" | \". Allowed roles: bg, hero, skin, accent, text, secondary, mute, rim, glow. hero = dominant subject/garment hue sampled from THIS uploaded image (honest hue family). skin = REQUIRED when readable face/skin dominates the subject — sample mid-tone skin pixels from THIS image (not highlight, not deep shadow). accent = solid graphic reds/bands OR selective non-emissive accent marks. glow = the DOMINANT emissive spill that tints haze/air — TRUE hex sampled from THIS image only. When emissive light is visible, glow is REQUIRED. rim = actual rim/edge light only — FORBIDDEN inventing rim:#FFFFFF when no white rim exists. Format only (DO NOT copy these letters as real colors): bg:#RRGGBB | hero:#RRGGBB | skin:#RRGGBB | glow:#RRGGBB. NEVER reuse palette hexes from the schema/examples, prior images, or any preconfigured swatch — sample visible pixels of THIS frame only. Colon after role is mandatory.",
  "camera": "string — 18–55 words for non-flat frames: angle FIRST and REQUIRED when readable — eye-level / high-angle looking down / low-angle looking up / top-down bird's-eye / flat orthographic. High-angle cues: camera above subject, crown/top-of-head foreshortening, floor plane visible below, limbs receding downward. FORBIDDEN omitting a clear high-angle / overhead look or rewriting it as eye-level. Then subject orientation (REQUIRED when people visible: torso vs head orientation separately if they differ — front/three-quarter/profile/back + turn side; gaze at-camera or off; which shoulder leads if readable), framing, perspective, PLUS optics — (1) lens feel wide/normal/tele (no body/brand models), (2) focus plane, (3) DOF: deep/fully sharp when the whole subject is sharp; shallow/razor ONLY if background truly softens with optical bokeh. If a subject motion blur / speed streak is present, SAY SO in camera (which side streaked, axis) and do NOT claim the whole figure is fully sharp or relabel the streak as bokeh. Shot scale MUST match how much of the figures fill the frame. Allowed labels: wide establishing / full scene / medium-wide / medium / medium two-shot / close-up. Figure-dominant waist-up / torso crops → medium or medium two-shot even with 2+ people and a room behind them. Wide establishing / full scene ONLY when environment dominates or figures are small in frame. FORBIDDEN forcing medium-wide/wide establishing on figure-dominant medium crops. FORBIDDEN vague-only orientation like \"angled slightly\" when torso/head split or shoulder lead is readable. Never invent portrait crop language when none exists. If a REAL edge crop exists, name edge + truncated part with shot scale. Flat graphics: flat orthographic / no perspective — still name band/type bleed or crop by edge if present.",
  "ratio": "string — measured aspect ratio; keep --ar W:H ASCII"
}

Universal fidelity:
- Schema hygiene (CRITICAL — apply everywhere): This contract teaches HOW to observe. ONLY THIS image supplies WHAT. NEVER copy concrete nouns, scenes, people, garments, cultures, hexes, crops, offsets, or opening-beyond phrases from the schema/FORBIDDEN lists into the pack. Format placeholders (role:#RRGGBB, name|zone|salience) are NOT content. If a phrase could fit a different image unchanged, it is contamination — rewrite from visible evidence.
- Observe first, invent never. Omit unsure MATERIAL/MOOD/GESTURE details — but NEVER omit a clearly visible shape/silhouette/band, and NEVER reclassify a visible mark as negative space.
- Write order: build elements inventory FIRST → then layout from those elements → then positive. positive MUST open with REAL style tokens copied from the style field (rendering medium + shading/finish — never the bare label words \"medium\" or \"style\"), THEN (when face/skin readable) Face / portrait identity anchors, THEN compact palette role:#hex tokens, THEN camera (if non-flat), THEN layout facts, THEN typography facts, THEN remaining content (MUST name every elements entry), THEN ratio tokens. FORBIDDEN: opening positive with section labels or placeholders such as \"medium,\", \"medium/style\", \"style:\", \"layout:\", or empty comma stubs like \"medium, , .\".
- style holds medium+shading+finish; layout is spatial only; palette is role:#hex only; camera holds angle+optics (not lighting essays).
- Elements → Layout lock (CRITICAL):
  • Inventory before compression: every major visible shape is an element; layout only arranges those elements — do not invent layout shapes absent from elements, and do not drop elements when writing layout.
  • Noun / separability test (universal): if two regions can be named with different nouns, they MUST be separate elements — even when same color, touching, or connected by wash/bleed/gradient. Shared hue is NOT a merge license.
  • Span honesty (universal): each element's zone/span describes THAT element's own bounds only. FORBIDDEN: claiming full-height / full-width / "dominates center axis" for the UNION of stacked or adjacent elements. Stacked marks → separate spans per mark, never one full-height stroke that swallows an upper silhouette.
  • primary_anchor: left|center|right × upper|mid|lower for the TRUE primary mass. Prefer people as primary ONLY when they dominate the frame as narrative focus. FORBIDDEN promoting a tiny/miniature scale figure on a large object/sculpture to primary — primary stays the whole assemblage / dominant mass; the tiny figure is secondary scale prop. When offset, quantify THAT element's half + edge vs midline, and name a residual empty side ONLY if truly empty. FORBIDDEN: stock half-frame empty-field templates when the frame is center-weighted.
  • Figure scale honesty (CRITICAL): a tiny person is a tiny person — lock relative scale from THIS image, independent of medium (comic / photo / sculpture / CGI). If the figure is clearly miniature vs the dominant mass, MUST say tiny/miniature scale figure in elements+positive and keep them secondary. FORBIDDEN enlarging scale figures into hero-sized people. Normal waist-up / narrative-dominant people stay normal size.
  • Graphic axes separately: stripes/bands/shapes with alignment + vertical/horizontal span and true color — treat graphic bands separately from emissive glow. Secondary silhouettes get their own clause and their own span — never fold them into the primary axis as internal texture.
  • Text zones: each major type block gets its own band (only if actually present: upper stack, bottom caption, garment print, etc.).
  • Negative space is RESIDUAL only: name empty sides/thirds solely where no element occupies that zone. FORBIDDEN: claiming a band/half is empty when any element sits there.
  • FORBIDDEN: calling the subject "centered" / "lower-center" only because a stripe/logo/title is centered. Mirror placement facts early in positive AND in layout.
- Frame Crop Lock (CRITICAL):
  • Inspect all four frame edges for subject/hero contact or truncation (people, products, graphics — name the ACTUAL truncated part).
  • If a crop exists, the SAME fact MUST appear in layout, camera, AND positive (wording may vary; omission forbidden).
  • negative MUST fight healing THAT crop — write anti-heal phrases tailored only to the cut parts visible in THIS image. NEVER paste stock headroom / safe-margin boilerplate.
  • FORBIDDEN when a crop exists: inventing even margins; implying large empty headroom above a cut head; describing a half-head as a full head in frame.
  • If no crop exists: normal margin language is allowed; FORBIDDEN inventing crops or portrait stock framing on wide / architectural / multi-subject frames.
- Figure ↔ scene spatial lock (CRITICAL when people or animals are visible):
  • Every visible person/figure is an element with honest count and TRUE zone matching their support surface.
  • Multi-person: keep count (group of N at zone, or separate clauses) — FORBIDDEN collapsing several figures into one relocated silhouette.
  • Support / contact (REQUIRED): name the surface each figure stands on or touches. Relation verb must match what is seen. Mid-air / jumping with no visible ground contact → say airborne / no ground contact — do not invent a floor.
  • Relative to named scene parts: state figure vs nearby structures with left/right/above/below or on/in — figures stay on their TRUE support; empty openings stay void anchors without stealing the figure locus.
  • Depth: fg / mid-ground / bg for figures vs architecture when depth is readable.
  • Volumetric FX interweave (CRITICAL when smoke / haze / fog / cloud / dust / powder / ribbon mass wraps the figure — not only a flat color wash behind them):
    — Treat the mass as DEPTH LAYERS, not one solid backdrop plate.
    — Name which figure parts the mass sits BEHIND vs IN FRONT OF / wrapping (e.g. wisps across torso or thigh while denser cloud stays behind the body; foot/leg partially submerged).
    — Density honesty: solid wall vs wispy tendrils vs partial occlusion — FORBIDDEN collapsing wrap-around volume into \"solid smoke behind the subject\" only, or pasting a full-body cutout entirely in front of an unbroken FX wall when weave is visible.
    — Give the FX mass its own elements clause when it is a distinct silhouette/band; mirror the SAME front/behind wrap facts in layout AND early in positive. negative MAY briefly fight flat pasted cutout / subject entirely in front of a solid FX plate when wrap is clear.
  • Subject ↔ type occlusion (when figure and large title/logo type coexist): if head/shoulder/limb truly overlaps and hides part of a letter, MUST name which letter/zone is occluded — FORBIDDEN keeping the full word fully legible behind an unoccluded silhouette when overlap is visible.
  • Opening beyond (REQUIRED when a doorway / broken wall / window reveals another space): lock whether the view THROUGH the opening is exterior or interior, plus the key beyond content from THIS image. FORBIDDEN stock beyond templates; FORBIDDEN calling outdoor beyond "interior" only because the camera stands indoors.
  • Mirror the SAME figure↔scene relations (volumetric wrap, type occlusion, and opening beyond facts) in layout AND positive (wording may vary; omission forbidden).
  • FORBIDDEN: moving figures to a different zone or prop; inventing a lone doorway silhouette when figures are elsewhere; demoting clear narrative figures to secondary while promoting empty architecture/props to primary.
- Optics / shot-scale honesty:
  • deep DOF when fully sharp; eye-level ONLY when the camera is truly level with the subject — REQUIRED high-angle / looking-down / top-down / low-angle / looking-up when that vantage is visible (crown-of-head foreshortening, visible floor plane below, or looking up a torso). FORBIDDEN defaulting every upright figure to eye-level. no default anamorphic.
  • Shot scale follows how much of the figures fill the frame. Waist-up / torso two-shots stay medium / medium two-shot even with multiple people or a visible room behind them.
  • Use wide establishing / full scene ONLY when the environment truly dominates or figures are small in frame — FORBIDDEN forcing medium-wide / wide establishing on figure-dominant medium crops.
  • DOF / bokeh honesty (CRITICAL): shallow DOF / soft bokeh ONLY when the BACKGROUND optically softens into round/defocus circles or creamy blur WHILE the subject stays sharp without directional streaking. FORBIDDEN calling a solid seamless studio color field \"bokeh\". FORBIDDEN relabeling horizontal/vertical subject speed streaks as bokeh / soft blur / shallow DOF.
- Typography lock (CRITICAL when any type is visible):
  • Quote ONLY legible strings in double quotes.
  • Completeness (CRITICAL): inventory EVERY major readable text block — brand/title, subtitle, tagline, AND body/caption/paragraph copy when letters are legible. FORBIDDEN keeping only the largest title while dropping a clearly readable bottom caption / multi-line blurb. When a multi-line justified body/prompt paragraph is readable, quote the FULL paragraph (or the longest contiguous legible span) — FORBIDDEN compressing it to a one-line tagline paraphrase. Unreadable dense microtype → say \"additional unreadably dense rows\" once — never invent missing words.
  • Per major text block lock: placement (zone), role (title / subtitle / brand / caption / body / garment print), size rank (largest / mid / small), weight (thin / regular / bold / black), case (all-caps / title / as-seen), tracking (tight / normal / wide / letterspaced — if letters are clearly spaced apart, MUST say wide/letterspaced in positive), alignment (left / center / right), color including mixed-color segments when present.
  • Lock distinctive chrome: underline/hairline under a logo, arched vs flat baseline, stacked vs single-line; font family REQUIRED when readable: sans | serif | script (cursive/handwritten/signature) | display | mono — FORBIDDEN collapsing handwritten/cursive/signature into serif or sans. Do not invent brand typeface names.
  • Invented-copy ban: do NOT add bottom captions, taglines, or extra brand lines that are not clearly visible. Only quote what exists. Equally FORBIDDEN omitting a visible caption that exists.
  • Structure: "multi-line title/year LIST" OR "paragraph" OR "single title" OR "stacked brand+model". Dense unreadables → "additional unreadably dense rows" — never invent missing words/years.
  • Put key quoted strings + lettering family + tracking/weight/color hierarchy into positive (title AND any readable body/caption). Negative should fight: serif/decorative roman when script/handwritten is true, wrong kerning (tight when wide), wrong title color split, centered/lower-center subject when offset-right/left, missing hairline, missing bottom caption when one exists, extra invented caption, manifesto paraphrase.
- Pose / action lock (CRITICAL when people or animals are visible):
  • ONLY visible limbs/joints/actions. Hidden hands → omit; never invent hidden-hand, behind-back, or off-frame gestures.
  • Body vs head decoupling (REQUIRED when readable): lock TORSO orientation and HEAD orientation as SEPARATE facts. State each as front / three-quarter / profile / back-view relative to the camera, plus turn direction (toward camera-left / camera-right). FORBIDDEN collapsing both into vague \"angled slightly\" / \"looking back\" alone when the split is readable (classic case: torso three-quarter one way while head turns to camera). FORBIDDEN mirroring left↔right turn direction.
  • Gaze (REQUIRED when eyes readable): looking at camera / over shoulder to camera / off-camera toward a named side — never invent eye contact if gaze is away. When god rays / light shafts are visible and chin/gaze lift toward the beams, MUST say looking up / gaze toward the light (name side) — FORBIDDEN rewriting that as soft beauty eye contact straight to camera.
  • Head attitude when readable: chin up / level / down; head tilt toward which shoulder (subject-left / subject-right) — only if clearly seen.
  • Shoulder / silhouette bias when readable: which shoulder is nearer/higher/forward in frame (camera-left vs camera-right prominence) — especially on fashion / portrait crops where one shoulder leads.
  • Visible limbs (when in frame): lock side + rough action only as seen (hand in hair / on hip / holding X / raised / resting). Omit occluded limbs entirely.
  • Depth / foreshortening (REQUIRED when readable): name limbs that ADVANCE toward the camera vs RECEDE; torso twist / corkscrew in depth; which leg/arm is nearer. Classic sports-poster case: kicked leg foreshortened toward viewer while the other tucks back — MUST say so. FORBIDDEN flattening a foreshortened kick/jump/leap into a planar side-profile pose on one depth plane.
  • Weight / lean when readable: upright / leaning toward a side / arched back / seated / airborne mid-jump — one short cue, no invented motion verbs.
  • Mirror the SAME pose stack in elements (short cue in the person name), positive (concrete phrase early with the figure), layout (orientation + which side leads + foreshortening when present), and camera (subject orientation clause). Wording may vary; omission forbidden when the cue is clear.
  • FORBIDDEN stock pose templates: \"dynamic pose\", \"elegant stance\", \"standing casually\", \"posing\" without the concrete orientation facts above. FORBIDDEN swapping turn direction or inventing a second arm/hand.
- Identity / gender lock (CRITICAL when people are visible):
  • When sex/gender presentation is readable, MUST name it with a concrete noun in elements + positive + layout subject clauses: man / woman / boy / girl (or clearly androgynous only if truly ambiguous).
  • Phenotype / ethnicity appearance (CRITICAL when faces or skin are readable): MUST lock a short honest regional-appearance cue in elements AND positive for the cast (shared family cue once is OK if everyone matches). Use generator-usable appearance phrases sampled from THIS image only, e.g. East Asian / Southeast Asian / South Asian / West Asian / North African / Black African / European / Latino — plus skin tone band when clearly visible (fair / light / mid / deep). FORBIDDEN omitting phenotype on clear faces (leads to wrong-default cast). FORBIDDEN inventing a phenotype that contradicts faces, wardrobe culture, or on-image script. If truly unreadable (silhouette/back-view only), omit once — do not invent. FORBIDDEN using the bare word \"medium\" as a skin-tone band (conflicts with rendering-medium language) — use \"mid\" instead. EXCEPTION — hard-edge flat graphic portraits where face skin is fully replaced by posterized colored light slabs (e.g. electric blue + magenta on black void): natural skin hue/phenotype is NOT reliably readable — lock iris/expression/pose instead; FORBIDDEN inventing East Asian / European / etc. from lit color fills alone.
  • Lock distinctive visible identity cues that fix the read: hair (see Hair lock), head covering if present, facial hair if present, face shape, age band — only what is seen.
  • FORBIDDEN gender-washing: bare \"hero figure\", \"person\", \"character\", \"protagonist\", or bare \"family group\" as the ONLY subject label when individuals are readable.
- Hair length / silhouette lock (CRITICAL when hair is clearly readable):
  • Lock length band: buzz / cropped / short (ear–chin) / medium (shoulder) / long (below shoulder) / very long — REQUIRED when length is obvious.
  • Lock silhouette / style family as seen only: straight / wavy / curly / coily; bun / ponytail / bob / fringe / windswept / slicked-back — pick what is visible, do not dump a style soup.
  • Lock color family when readable (blonde / brunette / black / red / gray / dyed hue) — short honest token, not a dye brand.
  • Lock length + silhouette (+ color) in elements name cue AND positive early with the figure. negative MAY briefly fight the opposite length only (e.g. long hair when short is true) — abstract, no alternate hairstyle list.
  • FORBIDDEN bare \"hair\" with no length; FORBIDDEN upgrading short crops into long waves or collapsing long hair into a bob when length is clear.
- Face / portrait identity lock (CRITICAL when a face is clearly readable — roughly medium / close-up / figure-dominant crop, or face occupies a material share of the frame):
  • Purpose: stop generator defaults from rewriting identity while composition stays correct. Lock ONLY facts visible in THIS image; omit any cue that is not readable.
  • Skin (REQUIRED when skin is readable): phenotype cue + tone band (fair / light / mid / deep) + undertone (warm / cool / neutral as seen) in elements AND positive. Also put skin:#RRGGBB in palette (mid-tone sample from THIS image) and mirror the same skin:#hex token in positive — never leave a dangling \"mid-tone,\" without a hex. Restate the same skin words early in positive (first third). FORBIDDEN vague-only skin words that let models drift lighter/darker/yellower (bare \"tanned\", \"brown skin\", \"fair skin\" without band+undertone+skin hex when those are readable). FORBIDDEN labeling skin tone as \"medium\" — say \"mid\". When hard-edge graphic colored light fully replaces natural skin (posterized blue/magenta fills), OMIT natural skin-band/phenotype locks — do not invent mid-tone hex from the light color.
  • Body-part inventory ≠ people count: lips / shoulder / hand clauses describe ONE person — never treat each body part as a separate person in roster or "exactly N people" locks.
  • Cast shadow / silhouette / reflection of a person is NOT a second person — inventory it as a secondary scene element only.
  • Lower-face / crop honesty: when eyes or hair are out of frame, OMIT iris/gaze/hair rim/lens flare — FORBIDDEN inventing deep brown eyes, gaze at camera, or backlit hair rim on a lips-and-chin crop.
  • Iris / eye color (REQUIRED when iris hue is readable): lock the TRUE iris hue family in elements name cues AND positive early. FORBIDDEN omitting a distinctive non-default iris (models often force brown/dark defaults). If eyes are closed, occluded, or hue unreadable → omit once.
  • Expression / brow–mouth set (REQUIRED when readable): 1–2 concrete tokens from THIS face only (e.g. fierce furrowed brows, soft closed-mouth smile, parted lips) — MUST include mouth aperture (closed / pursed / parted / teeth visible). FORBIDDEN inventing emotion; FORBIDDEN softening a hard expression or hardening a soft one; FORBIDDEN "neutral mouth".
  • Makeup / facial finish: lock only distinctive readable marks (lipstick hue family, eyeliner shape/wing, blush, beauty mark) — omit if subtle/unreadable.
  • Jewelry & small hardware accessories: treat as form-factor locks when clearly visible — earrings, necklaces, AND belt buckles / clasps / buttons / zipper pulls. Lock count, metal/finish color, shape (round / teardrop / rectangular…), relative size (small / large), and structure/drop length. Mirror in elements + positive. negative may briefly fight missing accessory OR wrong hardware shape/size using ABSTRACT opposite only. Specular highlight dots / light glints are NOT buckles — FORBIDDEN inventing belt buckle form-factor on a necktie or collar when no belt/hardware structure is visible.
  • Garment construction (when hero clothing is readable at portrait scale): lock fit + neckline family + sleeve state + wrap/closure + fabric behavior + belt presence/absence — not only a color + garment noun. Fit band REQUIRED when readable: body-hugging / fitted / tailored / relaxed / oversized-loose. FORBIDDEN upgrading fitted/structured woven into soft ruched chiffon billow, collar+V-wrap into sleeveless halter, or dropping a visible belt. FORBIDDEN using the word \"sculptural\" for garment folds — say hard/structured creases instead.
  • Lighting ratio on the face (when directional light is readable): which side/edge is lit, shadow depth (high-contrast / soft fill), and whether a real rim/edge light exists — FORBIDDEN flattening a high-contrast portrait into even warm fill, or inventing dramatic rim when absent.
  • Lighting / shadow PATTERN (CRITICAL when readable — beyond bare \"directional\"): name the TRUE cast pattern early in positive — window-blind / parallel slat bars across skin; OR dappled foliage / leaf gobo mottling; OR backlit rim/halo with sun behind (plus lens flare if visible); OR split/chiaroscuro half-face; OR plain one-side key; OR on-camera flash hard cast shadow; OR soft even / overcast wrap with NO patterned cast shadows (when true, MUST say soft even early and FORBIDDEN inventing blinds/slat/dappled/split patterns). FORBIDDEN collapsing patterned light into vague \"shadow play\" / \"directional light\" only. FORBIDDEN labeling hair light as Graphic FX motion streak.
  • positive placement: after real style-field tokens, BEFORE wardrobe essays — skin + iris + expression (+ skin:#hex) must appear in the first third of positive. Never insert the label \"medium\" as a stand-in for the style field.
  • negative (SHORT): only the highest-risk identity defaults for THIS face — abstract mismatches such as wrong skin lightness, wrong iris hue, softened/hardened expression, missing distinctive accessory — NEVER list alternate ethnicities by name; NEVER paste a fixed stock face-ban list.
- Multi-person roster lock (CRITICAL when 2+ people are clearly visible):
  • Enumerate EACH distinct person (or tight pair only if truly overlapping) in elements with: gendered noun + age decade band (early-20s / mid-40s / late-teens… — NOT bare young/middle-aged/elderly) + phenotype cue (or one shared cast phenotype) + seat/standing order (left→right or front→back) + 1–2 distinctive cues visible in THIS image only — do NOT paste roster examples from the schema.
  • positive MUST restate the same roster (order + cues) AND the phenotype/ethnicity appearance early (within the first third of positive).
  • layout may compress zones but MUST NOT collapse everyone into a vague group label without the roster.
  • FORBIDDEN: replacing the visible roster with unrelated ages/genders/roles/phenotypes; mixing inconsistent face styles across people unless truly visible.
  • negative may briefly fight wrong regional cast — use abstract \"wrong ethnicity / wrong regional cast\" only; do NOT list other ethnicities by name (pink-elephant risk).
- Cultural markers / on-image text (CRITICAL when readable):
  • Quote or name visible scripts/languages on TV tickers, posters, calendars exactly as shown in THIS image. FORBIDDEN inventing a different culture’s wall decor/signage than what is visible.
  • Distinctive wall art / posters that anchor place identity must appear in elements or positive when clearly visible.
- Object form-factor lock (CRITICAL for EVERY major visible prop / device / furniture — not only appliances):
  • Any object with multiple common form factors MUST lock the TRUE form in elements AND positive — never a bare category noun that lets generators default to the wrong subtype.
  • Lock mounting + silhouette + subtype as seen: floor-standing / freestanding / pedestal vs wall-mounted / ceiling-mounted / built-in vs tabletop / desktop / handheld / portable; boxy vs slim; open vs closed when distinctive.
  • Examples of contrast pairs (illustrative only — pick what THIS image shows; do NOT copy unused pairs): AC floor-standing cabinet vs wall-mounted split; CRT box TV vs flat panel; tabletop desk lamp vs floor lamp vs pendant; top-freezer fridge vs side-by-side; desktop PC vs laptop. FORBIDDEN gluing \"floor-standing\" onto a lamp that sits on a desk.
  • If TWO units of related types are visible (e.g. tall cabinet AC + wall split), list BOTH as separate elements with form + zone — do not collapse into one.
  • Mirror the same form-factor words in layout and positive; negative may briefly fight the opposite form when clear (abstract opposite only — do not invent absent units).
  • FORBIDDEN: locking form for AC only while leaving other props as bare nouns.
- Costume / era lock (CRITICAL when people are visible):
  • For the hero AND every visible crowd/group, lock costume era from visible evidence: contemporary / modern civilian clothes OR period / historical — state concrete garments as seen, not bare \"groups of people\".
  • Name concrete garment types in elements + positive. Hero garment and each roster member’s garments are separate facts when distinctive.
  • Garment fit / silhouette lock (CRITICAL when hero clothing silhouette is readable): treat clothing like object form-factor — lock ALL of the following that are visible:
    (1) fit band: body-hugging / fitted / tailored / relaxed / oversized-loose — REQUIRED when the body–cloth gap is readable;
    (2) garment subtype: concrete noun (wrap blouse / shirt-dress / blazer / gown…) not bare \"top\" / \"shirt\" / \"dress\" / \"clothes\";
    (3) neckline / collar family (REQUIRED when upper chest/neck is readable) — pick the TRUE family, not a fashion default:
        pointed/spread collar | funnel/turtleneck | crew | V-neck / wrap-V | halter / straps around neck | off-shoulder / one-shoulder | square / boat.
        FORBIDDEN swapping collar+V-wrap into halter/choker neck, or halter into turtleneck, when the visible construction differs;
    (4) sleeve state (REQUIRED when shoulder/arm is readable): sleeveless / cap / short / long — and whether shoulders are covered or bare. FORBIDDEN inventing bare shoulders/sleeveless when long sleeves are visible, or the reverse;
    (5) wrap / closure geometry when readable: left-over-right wrap, button front, pull-on, belted waist, open lapels — only as seen;
    (6) fabric behavior: thick structured woven folds / soft chiffon billow / thin clingy jersey / stiff tailor — as seen. FORBIDDEN upgrading structured blouse fabric into soft ruched chiffon (or the reverse) when the fold language differs;
    (7) belt / buckle: if a belt is clearly visible, lock it (plus buckle form-factor). If NO belt is visible, FORBIDDEN inventing a waist belt; if a belt IS visible, FORBIDDEN dropping it.
  • Mirror fit + subtype + neckline family + sleeve state + fabric behavior (+ belt if any) in elements name cue AND positive (near the figure, not buried at the end).
  • negative MAY briefly fight the highest-risk wardrobe defaults for THIS garment only — abstract opposites such as sleeveless when long-sleeve is true, halter/choker neck when collar/V-wrap is true, soft chiffon drape when structured woven is true, missing belt when belted is true, loose oversized when fitted is true. No wardrobe essay; never list unrelated garments.
  • FORBIDDEN: color-only garment locks (\"orange dress\"); FORBIDDEN defaulting fitted knits/tailoring into loose loungewear; FORBIDDEN inventing belts/layers/open buttons not seen; FORBIDDEN swapping a small round buckle for a large rectangular statement buckle (or the reverse).
  • Historical architecture does NOT license period costumes; modern civilian clothes stay modern.
  • Mirror costume-era facts in layout and positive; negative MUST fight the opposite era when era is clear.
- Graphic FX / overlay lock (CRITICAL when a non-ordinary photographic/illustration treatment dominates the frame):
  • Discrimination gate (do this BEFORE writing positive/camera): inspect whether the subject or a side of the frame shows DIRECTIONAL smear streaks vs a translucent second face/figure vs optical background defocus vs volumetric atmosphere that wraps through the subject.
    — Motion blur / speed streak: any primary subject mass (person, product, vehicle, type) smears in ONE axis into a side of the frame; often one side/trailing edge is streaked while another region stays sharper. Flat seamless color fields can still host subject motion streaks.
    — Double exposure / ghost overlay: a second semi-transparent subject plate layered in a zone (often enlarged or offset) — readable as a soft duplicate form, NOT linear streaks.
    — Optical bokeh / shallow DOF: background points of light become soft circles / creamy defocus; the subject silhouette itself is NOT pulled into horizontal/vertical streaks. A flat seamless void with no circular highlights is NOT bokeh.
    — Volumetric atmosphere wrap: smoke / haze / fog / cloud / dust / powder whose wisps or denser lobes sit BOTH in front of AND behind the figure (or partially submerge a limb) — readable as depth interpenetration, NOT a flat color plate, NOT bokeh, NOT motion streak.
    — God rays / crepuscular shafts: bright directional LIGHT BEAMS cutting through air/haze (丁达尔光束) — this is a LIGHTING fact, NOT fx.volumetric_wrap. Put shafts into lighting.evidence WITH origin side (upper-left → key_side=camera_left). FORBIDDEN collapsing god rays into volumetric_wrap smoke, inventing smoke wrap when only light shafts are visible, OR rewriting visible beams as mere soft haze / bokeh particles.
  • First name the TRUE mechanism from that gate — pick ONE primary family (only what is seen): horizontal/vertical motion blur or speed streak; double exposure / ghosted translucent face-or-figure overlay; soft bokeh / shallow DOF (optics); volumetric atmosphere wrap; glitch / RGB split; film grain / halftone; light leak; mirror / kaleidoscope; other only if clearly namable.
  • Lock geometry: which side/zone is affected (camera-left / right / full), streak AXIS when motion (horizontal vs vertical), what is sharp vs smeared/ghosted (e.g. face sharp while trailing hair/torso streaks camera-left; or large faded face occupying left half behind a sharp foreground figure). For volumetric wrap: name front-of-subject vs behind-subject parts explicitly.
  • Lock opacity / strength qualitatively when obvious (heavy streak vs faint ghost; dense cloud vs wispy tendril).
  • Put the FX mechanism in elements as its OWN clause when it is a distinct graphic mass (format only: name|zone|salience — do NOT copy sample zones) AND early in positive (within the first third, right after style tokens) AND in layout (zone + relation to the primary subject). camera MUST NOT contradict FX (no \"deep DOF fully sharp whole subject\" when part of the subject is motion-smeared; no \"soft bokeh background\" when the only blur is a directional speed streak on a flat void).
  • negative MUST briefly fight the nearest wrong mechanism when FX is clear — for motion blur: ban soft bokeh background blur / double-exposure ghost overlay / fully static subject with no streak. For ghost overlay: ban motion streak. For true optical bokeh: ban motion streak. For volumetric wrap: ban flat pasted cutout entirely in front of a solid FX wall / smoke only as unbroken backdrop. Keep SHORT — abstract opposite only; never paste a fixed FX ban list.
  • FORBIDDEN vibe words replacing mechanism (\"dynamic energy\", \"ethereal vibe\", \"soft blur effect\" without naming the family). FORBIDDEN swapping motion blur ↔ double exposure ↔ shallow DOF/bokeh ↔ volumetric wrap as if equivalent. FORBIDDEN inventing an overlay/streak/wrap that is not visible. FORBIDDEN writing only \"soft bokeh blur effect\" when the visible treatment is a directional subject streak. FORBIDDEN writing only \"pink smoke background\" when wisps clearly cross in front of the body.
  • Hard-edge flat graphic + fully sharp / \"no streak\" / deep graphic sharpness on a solid void → FORBIDDEN inventing directional motion blur. Negative bans of motion blur are NOT evidence that motion exists.
- Style / medium honesty (CRITICAL):
  • style MUST be short, clear, and single-family — not a pile of mixed art-direction words.
  • Open with ONE true medium, then at most 2–4 shading/line/finish tokens.
  • Sculptural relief / thick impasto dimensional paint (3D volume finish) → sculptural relief — describe the finish only. FORBIDDEN inventing stone slab / floating panel / studio seamless backdrop unless that presentation is truly visible. FORBIDDEN rewriting as painted comic / soft painterly illustration.
  • 2D comic/manga/manhua/anime: use when the frame truly reads as drawn character art / comic panel — never as a default for photos, CGI, or sculptural relief.
  • Drawn 2D illustration stays 2D; FORBIDDEN upgrading to cinematic/Unreal because lighting is dramatic.
  • Photo-cutout / sports / graphic design posters with frame name/title/signature → cinematic / graphic design poster — FORBIDDEN rewriting as 2D illustration + soft blended shading + thin clean contours.
  • FORBIDDEN in style: camera/shot-scale words, palette hex, layout geometry, multi-medium soup.
  • Anime / manga / manhua character art (stylized face/body proportions, clean character linework, drawn eyes/hair) → open with anime / manga / manhua (prefer manga/manhua when the look is comic-like; use anime illustration for digital character art). Finish tokens: clean ink linework + stylized shading; add cel-shaded / hard flat shadow bands ONLY when those bands are truly visible. FORBIDDEN default stack "semi-realistic anime illustration, soft blended shading, smooth finish" — that collapses manga into soft digital painting. FORBIDDEN inventing photographic shallow DOF / optical bokeh on flat 2D anime/manga frames.
  • NEVER invent cel-shaded without HARD flat shadow bands / discrete tone steps. Non-character soft-paint scenes (landscapes, still life, non-anime figures) with soft blended gradients + thin contours → painted illustration + soft blended shading + thin clean contours — FORBIDDEN upgrading that to cel-shaded / manga.
  • Shading model honesty (CRITICAL for drawn/graphic frames): hard-edge flat color fills / posterized duotone light slabs (e.g. electric blue + magenta on black void) → flat graphic / hard-edge flat fills — FORBIDDEN rewriting as soft blended shading + thin clean contours. Soft continuous gradients on non-anime painted scenes → soft blended painted illustration — FORBIDDEN banning flat color fills on a true hard-edge graphic.
  • Flat graphic portraits with colored light on the subject: describe light ON face/collar — FORBIDDEN inventing full-frame left/right vertical light slabs spanning top-to-bottom unless those slabs are true graphic shapes filling the frame. FORBIDDEN appending \"UI screenshot\" to style without visible UI chrome (panels/buttons/toolbar).
  • Soft abstract / mobile-wallpaper density (when the frame is decorative fluid/smoke/haze with no people/product): name opacity + airiness as YOU see them — soft translucent wisps and breathing room when soft; denser folds only when truly dense. Prefer honest density over defaulting every volumetric look to photoreal CGI + subsurface scattering.
  • Host / generator UI chrome (CRITICAL): ONLY inventory UI that is clearly painted INTO the artwork (readable app panels baked in the pixels). FORBIDDEN inventing OR copying host/viewer chrome from the surrounding page or image viewer — including "AI modified" badges/watermarks, Edit buttons, expand/fullscreen icons, magic-wand regenerate icons, share/upload buttons, floating toolbars, search bars, "Search image" controls. Those are NOT part of the reference artwork. Put them in NO field (not typography, not objects, not regions).
  • One medium for the whole frame; obey the injected MEDIUM MODULE.
  • negative fights the opposite medium when unified.
- Full-object framing (CRITICAL when a self-contained object/sculpture sits on a plain backdrop with visible margins):
  • Primary is the WHOLE assemblage (wave+rock+tiny figure as one object), center-weighted — FORBIDDEN promoting a miniature figure inside it to primary / hero subject.
  • MUST lock even residual margins on all four sides and explicitly say no edge crop / full object in frame when that is what is seen.
  • MUST lock figure scale: tiny/miniature hiker (or similar) as a small scale accent — FORBIDDEN enlarging them to medium/hero size.
  • Camera: product/full-object shot of the complete piece — FORBIDDEN tight crops that clip the sculpture silhouette.
- Setting / atmosphere era (CRITICAL when readable):
  • Lock the social/temporal atmosphere separately from architecture age: contemporary disaster / refugee aftermath / modern civilian crowd OR historical war epic / period battle — from costumes + props + vehicles + signage, NOT from historic buildings alone.
  • Modern streetwear + historic buildings → contemporary scene in historic setting (state this explicitly). FORBIDDEN restyling into period war-painting / period soldiers epic when costumes are modern.
  • Lock fire/light scale honestly: dominant structural blaze vs small ground fires vs soft embers — do not upgrade small fires into full-building infernos, or collapse a blazing structure into tiny campfires.
  • Put atmosphere cue in style (short) and mirror in positive; negative fights the opposite atmosphere when clear.
- Face hidden / back-view: wardrobe construction is identity — still lock gender if silhouette/hair/build makes it readable; if truly unreadable, say \"figure (gender unclear)\" once — do not invent. Skip Face / portrait iris/expression locks when the face is not readable; still lock jewelry/garment fit+construction/light if those parts are visible.
- People/animals: lock visible identity/expression/pose/wardrobe-fit/hair facts only — after Identity / gender lock, Hair length / silhouette lock, Face / portrait identity lock (when face readable), Pose / action lock (including foreshortening), Multi-person roster lock, Costume / era lock (including garment fit + hardware), Graphic FX / overlay lock (when present, including volumetric wrap), and Figure ↔ scene spatial lock (including FX interweave + subject↔type occlusion).
- Palette honesty (CRITICAL):
  • ALL role hexes MUST be sampled from THIS uploaded reference image. FORBIDDEN preconfigured / stock / schema / previous-image colors.
  • bg = dominant void/ground/haze wash as seen in THIS image.
  • skin = REQUIRED when readable face/skin is a major subject — mid-tone sample from THIS image; put skin:#hex into positive with the face identity anchors. FORBIDDEN substituting garment hero hex for skin when skin is clearly visible.
  • Atmosphere grade (REQUIRED when smoke/haze/fog fills much of the frame): name the TRUE ambient hue family in style AND positive early — ONLY as sampled from THIS image. Dominant haze grade ≠ a small hanging bulb. FORBIDDEN inventing a dramatic warm or cool grade that contradicts visible pixels. Hue alone is NOT enough when wrap/interweave is visible — also obey Volumetric FX interweave under Figure ↔ scene spatial lock.
  • When fire / lamp / neon / sun-shaft / screen blast emissive light is visible → MUST include glow:#RRGGBB matching the spill that actually tints the air in THIS image.
  • A local practical lamp may be mentioned, but MUST NOT overwrite the dominant atmosphere grade sampled from the frame.
  • accent = non-emissive selective marks or graphic bands; do NOT use accent as a substitute for missing glow.
  • rim only when a real rim/edge light exists; FORBIDDEN default rim:#FFFFFF / pure white rim on muted smoky scenes without white rim light.
  • FORBIDDEN: copying palette hexes from prompt-schema examples, unrelated prior images, or any hardcoded swatch list.
  • Put the same role:#hex tokens into positive; also restate atmosphere grade in words (not only hex).
- Light: only what is visible — including fire scale honesty and face lighting-ratio honesty above. Never invent camera body/brand models.
- Ban mismatches by medium: on smooth photoreal/CGI, ban line art / clean line art / low-poly unless faceted; on drawn illustration, ban DSLR photoreal skin upgrades.

JSON only.`;

/**
 * 按类模块：只注入当前 medium 的 P0/P1 规则
 * @type {Record<MediumClass, string>}
 */
/** @deprecated */
export const LEGACY_MEDIUM_MODULES = {
  flash_photo: `MEDIUM MODULE — flash_photo / candid grit (LOCKED):
- Tokens: direct camera flash, hard flash cast shadow, glossy flash skin, high-ISO / pixel grain / lo-fi phone as visible.
- Ban: photoreal cinematic key art, soft natural lighting, soft bloom, no hard shadows, thin black contour/outline on photo skin, studio softbox cleanup.
- Keep noise/grain/soft phone focus if present. Negative should fight cinematic upgrades and missing flash/grain.`,

  photo: `MEDIUM MODULE — photo / studio-editorial (LOCKED):
- Real photograph: pores/specular/iris → photographic anatomy, never flat vector / dot eyes / single-line smile.
- Pick capture honestly: studio softbox / even editorial OR clean photoreal scene — only if cues match.
- If film grain / pixel noise is visible, name it in style; do not invent ultra-clean polish when the frame is grainy.
- Ban prestige cinematic key-art / volumetric bloom upgrades unless those cues are truly visible.
- Camera optics mandatory. Negative: flat vector, contour lines, wrong identity, missing DOF when shallow.
- Face / portrait: when face readable, enforce Face / portrait identity lock (skin band+undertone+skin hex, iris hue, expression, jewelry form, garment construction, face light ratio).
- Pose / action: when people visible, lock torso vs head orientation separately, gaze, chin/tilt, leading shoulder, visible limb actions, and foreshortening when a limb advances toward camera — never vague \"angled slightly\" alone.
- Wardrobe fit: when clothing readable, lock fitted vs loose + subtype + neckline + fold behavior; fight opposite fit in negative if clear.
- Hair: length band + silhouette when readable; fight opposite length if clear.
- Graphic FX: when a dominant streak/ghost/overlay/volumetric wrap exists, lock the true mechanism + zone — never swap motion blur with double exposure or relabel subject streaks as bokeh; never flatten wrap-around smoke into a solid backdrop plate.
- Optics: bokeh only for true optical background defocus; solid studio voids are not bokeh.
- Typography: quote all major readable blocks including captions — not title-only. If the body occludes letters, lock that occlusion.
- Frame crop: ONLY when a real edge cut is visible — name edge + truncated part in layout+camera+positive; negative fights headroom / full uncropped head. If no crop, do not invent portrait truncation.
- Figure↔scene: lock support surface + relation to named architecture (on stairs ≠ in doorway); keep count and true zone. Opening beyond: exterior vs interior must be honest. When smoke/haze wraps the figure, lock front vs behind layers. Costume + atmosphere era — architecture ≠ costume era.`,

  cinematic: `MEDIUM MODULE — cinematic key art / graphic design poster / sports poster (LOCKED):
- Use when FRAME-level name/title/signature/credits OR clear poster/key-art / photo-cutout collage on a flat graphic ground is visible. A dramatic living-room / documentary interior is NOT cinematic — reclassify as photo/photoreal and do NOT invent poster chrome.
- Gate C: photoreal/CGI/photo-cutout hero + FRAME typography = poster with type overlay — NOT flat vector, NOT painted 2D illustration. Garment prints alone ≠ poster chrome. Vertical athlete/name lockup + signature counts as frame chrome.
- Sports / editorial graphic posters: lock layered collage honestly (large processed portrait vs full-body photo cutout vs type vs signature) + flat ground texture/haze. When haze/smoke WEAVES through the hero (front+behind), lock that interweave — FORBIDDEN treating wrap-around volume as a solid behind-only plate under a pasted cutout. Style label: graphic design poster or cinematic key art — then finish tokens matching THIS image (textured monochrome portrait, photoreal cutout, grain/haze wash) — FORBIDDEN soft blended shading / thin clean contours / 2D illustration defaults.
- FORBIDDEN inventing movie titles, credit blocks, "directed by" lines, or poster captions when none are visible in THIS image.
- No default anamorphic / line art / low-poly on smooth CGI. Fully sharp studio/void → deep DOF, no bokeh.
- Layout: if hero truly occupies mostly one half, quantify half + edge-vs-midline and name residual empty side ONLY if empty. Center-weighted architecture stays center. Stripe/title axes stay independent when present. Subject↔type occlusion when the body hides letters.
- Figure↔scene: lock support surface + relation to named structures; opening beyond = exterior|interior from evidence. Volumetric FX front/behind layers when smoke/haze wraps the figure. Costume + atmosphere era — architecture era ≠ costume era.
- Style: stay in poster/cinematic/photoreal family — FORBIDDEN cel/ink / anime faces / soft-blended painted illustration rewrite. Mixed finishes OK when truly layered (e.g. B&W textured head + color photo cutout).
- Face / portrait: when faces readable, enforce Face / portrait identity lock across the cast (shared phenotype OK; per-face iris/expression when distinctive).
- Pose / action: lock per-figure torso/head/gaze/limb facts when readable; keep poster-hero orientation honest — including foreshortened limbs toward camera when visible (FORBIDDEN planar side-leap rewrite).
- Hair + wardrobe fit + hardware form-factors when readable; Graphic FX mechanism when streak/ghost/overlay/volumetric-wrap treatments are visible (any medium — not poster-only).
- Typography: quote title/name AND any readable body/caption/signature blocks — completeness required. ONLY if visible — quote + zone + weight/tracking. Do NOT invent titles or taglines. If hero overlaps type, lock the occluded letter/zone.
- Camera: collage on flat ground → eye-level / flat poster framing, deep DOF, no invented bokeh. Multi-figure / full-room scenes → wide establishing or full scene — not bare medium shot.
- Negative: keep SHORT — wrong placement, line art, 2D illustration upgrade, relocated figures, flat pasted cutout when wrap is true. Do NOT list culture-specific identity nouns.
- Frame crop: ONLY when hero is truly cut by the frame — never invent head crops on full-scene frames.`,

  product: `MEDIUM MODULE — product / device photo (LOCKED):
- Physical chassis FIRST: form factor, materials, bezel, tilt/three-quarter/isometric, environment/bokeh/ground plane.
- On-screen UI is SECONDARY summary after camera + chassis — never collapse to flat front-facing UI mockup / orthographic full-bleed dashboard.
- Layout: device placement L/C/R in frame separately from any on-screen UI grid. Camera: perspective + optics mandatory.
- Negative: flat UI mockup, missing bezel/chassis, wrong angle, no environment.
- Frame crop: chassis touching or cut by an edge → name that edge in layout+camera+positive; do not invent four-side safe margins when clipped. If no clip, do not invent crops.`,

  flat: `MEDIUM MODULE — flat vector / hard-edge flat graphic / UI screenshot (LOCKED):
- Covers: UI/geometric flat design AND hard-edge flat-color graphic portraits/posters (posterized duotone light, hard color shapes on void).
- Tokens: flat solid fills, hard edges, hard-edge flat color fills, high-contrast graphic lighting when seen. FORBIDDEN soft blended shading / thin clean contours / smooth painterly finish on hard-edge graphic frames.
- Layout: bands/columns/shapes OR subject+light slabs with explicit L/C/R anchors; margins and negative space; quantify offsets vs center.
- Typography: quote exact type; lock weight, tracking (wide when letterspaced), alignment, hierarchy; color per string if split. No invented captions.
- Ban photoreal skin pores, DSLR, soft painterly gradients, 3D skeuomorphism. Negative MUST fight soft blended shading / photoreal skin — NEVER ban flat color fills when that is the true finish.
- Camera: flat orthographic / no perspective for pure UI; graphic portraits may stay eye-level close-up with deep/graphic sharpness (no soft bokeh void).
- Frame crop: band/title bleed or crop → name the edge; do not default to margins on all edges when content touches the frame.`,

  infographic: `MEDIUM MODULE — infographic / data-viz / slideware (LOCKED):
- Layout skeleton with zone anchors (header / columns / legend / footer) — L/C/R per block; do not invent extra footer lines.
- Quote ONLY readable titles/labels/numbers; lock type hierarchy, weight, tracking, alignment.
- Unreadable → omit or "partial" — never invent stats. Ban photoreal office scene / cinematic photo of a slide.
- Frame crop: header/footer/blocks clipped or bleeding → name the edge; do not invent safe margins on cropped sides.`,

  illustration: `MEDIUM MODULE — non-flat 2D illustration / comic / anime / manhua (LOCKED):
- If pixel grain / film grain / halftone / digital noise is visible, name it in style finish; do not invent ultra-smooth polish.
- Use ONLY for soft-painted OR inked/anime 2D pictures with continuous blended shading OR true cel bands. Thick sculptural relief / 3D impasto paint-volume objects belong in render3d — do NOT claim this module for them.
- FORBIDDEN for hard-edge flat-color graphic portraits (posterized duotone slabs on black void) — those are flat.
- FORBIDDEN for photo-cutout collage / sports graphic design / key-art posters with frame name/title/signature on a flat poster ground — those are cinematic.
- style field: ONE clear label + 2–4 finish tokens MAX. Drawn character art → open with anime / manga / manhua (pick closest; prefer manga/manhua when comic-like). Prefer: clean ink linework, stylized shading. Add cel-shaded / hard flat shadow bands ONLY when truly visible. FORBIDDEN default "semi-realistic anime illustration, soft blended shading, smooth finish". Non-character soft-paint scenes → painted illustration, soft blended shading, thin clean contours — FORBIDDEN calling that cel-shaded/manga. Never auto-upgrade every painted look to comic; never auto-downgrade anime/manga character art to soft-paint wallpaper language.
- Camera: lock the TRUE angle. Top-down / bird's-eye / overhead / high-angle looking down when that vantage is true — FORBIDDEN defaulting those frames to eye-level. Flat 2D anime/manga: fully sharp / deep graphic sharpness — FORBIDDEN inventing shallow DOF, optical bokeh, or soft photographic background blur.
- FORBIDDEN upgrades: cinematic film still, Unreal/octane CGI, live-action still, photoreal skin pores, photographic DOF (unless the source is truly that).
- Identity / phenotype / roster / costume / fire-scale as visible.
- Face / portrait: when face readable, enforce Face / portrait identity lock (skin band+undertone+skin hex, TRUE iris hue — lilac/purple/blue when seen, expression, jewelry form, garment construction, face light ratio) — illustration defaults often rewrite these first (esp. brown eyes + soft-paint wash).
- Pose / action: torso vs head split, gaze, tilt, leading shoulder, visible limbs, foreshortening when readable — concrete only; no vague angled-slightly.
- Figure proportion (CRITICAL for anime/manga/manhua when body readable): lock stylized anatomy — hourglass / narrow waist / wide hips / bust emphasis / long legs as seen — early in positive. FORBIDDEN reducing exaggerated manga body to only body-hugging / fitted garment language or realistic proportions.
- Wardrobe fit: fitted vs loose + subtype + neckline + sleeve state (long/short/sleeveless) + fabric behavior as seen; footwear / metal accent color when readable; never color-only garment locks. Wardrobe fit does NOT replace figure proportion.
- Hair length/silhouette + Graphic FX mechanism when present; typography completeness for all readable blocks.
- Shot scale honest to figure fill; do not force wide establishing on waist-up crops.
- Negative: photoreal CGI / live-action upgrade when fighting a true 2D/anime source. FORBIDDEN banning cel-shading / ink line art / anime finish when those are truly visible. Do not ban sculptural depth if the source is relief.`,

  render3d: `MEDIUM MODULE — 3D CGI / sculptural relief / thick paint-volume finish (LOCKED):
- Covers: PBR/CGI renders AND sculptural relief / bas-relief / thick impasto dimensional paint / clay-like volume finish — pick the TRUE one, never both. Soft translucent fluid/smoke decorative wallpaper may land here when volumetric — judge density/airiness from the image (soft wallpaper vs dense product PBR), do not auto-upgrade.
- style: name the TRUE visible finish only. Glossy product / automotive / hypercar CGI → photoreal CGI (or PBR materials) — FORBIDDEN appending \"/relief\" or calling it sculptural relief. Thick impasto / bas-relief / carved plaster → sculptural relief / thick impasto only. Soft airy smoke/fluid wallpaper → describe soft translucent / wispy / negative-space finish as seen — do not invent denser SSS/PBR product language when the frame is airy.
- FORBIDDEN stock phrases "sculptural relief art object" / "studio seamless backdrop" / stone-slab product shot unless that presentation is truly visible. FORBIDDEN painted-comic rewrite. FORBIDDEN inventing search-bar / generator UI chrome into elements.
- Keep strong 3D depth and material thickness when visible on products/sculptures. Miniature figures are tiny scale props when tiny — primary is the dominant mass. Soft wallpaper frames: prioritize what you see (translucency vs thickness).
- When the subject sits complete in frame with even margins on a plain wall/backdrop, lock complete subject in frame + even margins + no edge crop — do NOT invent a stone slab / floating panel / studio product shot when the scene is full-bleed.
- Tokens: materials + volume as visible. No line art / cel ink on smooth CGI.
- Camera: honest angle/DOF; complete-subject framing only when margins exist.
- Negative: flat 2D comic rewrite, large hero-sized person when figure is tiny; for CGI products also ban sculptural relief plaque / stone slab.`,

  watercolor: `MEDIUM MODULE — watercolor / gouache (LOCKED):
- Paper tooth, wet wash, pigment blooms, soft bleeds as visible. Ban photoreal DSLR, sharp vector edges, oily impasto, anime defaults unless seen.
- Multi-shape honesty: list every distinct wash/silhouette in elements; do not collapse a multi-mark composition into a single brushstroke plus a false empty upper field.`,

  generic: `MEDIUM MODULE — generic (fallback):
- Confirm medium from visible cues. Prefer concrete tokens over “digital art”.
- Always split subject placement vs graphic axes; lock typography weight/tracking/zone when type exists.
- Camera optics for any non-flat frame. Never invent.`,
};

/** 用户消息里的短提醒（按类） */
/** @deprecated */
export const LEGACY_MEDIUM_USER_HINTS = {
  flash_photo: "Class lock: flash_photo — keep flash + hard shadow + grain; ban soft bloom / cinematic upgrade.",
  photo: "Class lock: photo — photographic anatomy; phenotype/ethnicity when faces readable; Face/portrait identity (skin+iris+expression) when face readable; precise pose (torso vs head, gaze, leading shoulder); hair length/silhouette; wardrobe fit+hardware; graphic FX mechanism when present; typography completeness; no flat-vector faces; optics in camera.",
  cinematic: "Class lock: cinematic — graphic design/sports/key-art poster OR photoreal/CGI key art; photo-cutout collage + frame typography stay poster (not 2D illustration); phenotype when faces readable; Face/portrait identity; precise pose; hair+wardrobe; graphic FX honesty; quote all readable type/signature; no anime/cel/soft-blended-illustration rewrite; costume+atmosphere era; fire scale honest.",
  product: "Class lock: product — chassis + angle + environment first; device placement L/C/R; never flat UI mockup.",
  flat: "Class lock: flat — hard-edge flat fills / UI / hard-edge graphic portraits; FORBIDDEN soft blended shading rewrite; when type is visible quote EVERY readable block + lock weight/tracking (letterspaced when wide) / hierarchy; negative fights soft paint not flat fills.",
  infographic: "Class lock: infographic — zone anchors + type hierarchy; quote only readable text including captions; no invented footers/stats.",
  illustration: "Class lock: 2D anime/manga/manhua OR soft-paint — prefer anime/manga + clean ink linework + stylized shading (not soft blended + smooth finish); figure proportion lock when body readable; no invented shallow DOF on flat 2D; cel-shaded ONLY with hard flat bands; Face/portrait (true iris hue); sleeve state; footwear color; grain if visible; precise pose; lock high-angle/top-down when looking down.",
  render3d: "Class lock: render3d — CGI/PBR vs sculptural relief/impasto vs soft translucent wallpaper abstract as truly seen; never append /relief onto glossy product CGI; judge density honestly; no invented studio slab/backdrop or search-bar UI chrome.",
  watercolor: "Class lock: watercolor — wash/paper cues; inventory every wash/silhouette in elements; ban DSLR/vector defaults.",
  generic: "Class lock: generic — one honest medium for whole frame; roster + phenotype when faces readable; Face/portrait identity when face readable; precise pose; hair length; wardrobe fit+hardware; graphic FX honesty; typography completeness; costume+atmosphere era; honest palette.",
};

/** 反推前短核对清单：逼出易漏细节，尤其非照片艺术图的风格族 */
/** @deprecated */
export const LEGACY_DETAIL_CHECKLIST = `Pre-JSON detail checklist (scan once; lock only what is readable — do not invent):
1) Non-photo style family: if drawn/illustrated (not a photo), name the TRUE finish first — realistic charcoal/graphite/ink-wash sketch vs anime/manga/manhua vs soft painted illustration vs flat graphic. ONLY use anime/manga/manhua when stylized anime proportions/eyes/linework are truly visible. Realistic monochrome fine-art sketches MUST stay charcoal/graphite/ink wash — FORBIDDEN rewriting them as anime illustration. When anime/manga is true: clean ink linework + stylized shading (cel bands only if visible) — FORBIDDEN soft stack "semi-realistic anime illustration, soft blended shading, smooth finish" and FORBIDDEN inventing shallow DOF / optical bokeh on flat 2D frames.
2) Figure proportion lock (CRITICAL for anime/manga/manhua character art when body is readable): lock stylized body shape — hourglass / narrow waist / wide hips / bust emphasis / long legs as truly seen. Put this early in positive (with style family). FORBIDDEN collapsing exaggerated manga anatomy into only "body-hugging" / "fitted dress" / realistic proportions. Skip this lock for realistic charcoal/fine-art portraits.
3) Iris hue: true color family (lilac / purple / blue / brown / …) — FORBIDDEN default brown when cool/lilac irises are visible.
4) Surface finish: pixel grain / film grain / paper tooth / charcoal dust / ink splatter / halftone / digital noise if present — FORBIDDEN inventing ultra-smooth polish when grain/tooth is visible.
5) Sleeve state: long / short / sleeveless + shoulders covered or bare — FORBIDDEN sleeveless when long sleeves are visible.
6) Footwear / small metal accents: true color family (silver vs gold, etc.) when shoes/jewelry are readable.
Put style/finish + figure proportion (when anime) + iris + sleeve early in positive when people dominate.`;

/**
 * @param {MediumClass | string} medium
 * @returns {string}
 */
/** @deprecated 视频路径 */
export function buildLegacySystemPrompt(medium) {
  const id = legacyNormalizeMediumClass(medium);
  const mod = LEGACY_MEDIUM_MODULES[id] || LEGACY_MEDIUM_MODULES.generic;
  return `${LEGACY_SYSTEM_PROMPT_CORE}\n\n${mod}`;
}

/**
 * 期 3 全局观察政策（Phase A）：固定短政策，不含字段枚举
 * 契约测试仍读 OBSERVE_SYSTEM_PROMPT = 政策 + 字段指南
 */
export const GLOBAL_OBSERVATION_POLICY = `You are a structured visual observer for reverse-prompting.
Return ONE JSON object only. Your ONLY job is accurate observation of THIS image.

OBSERVATION RULES
- Observe first, invent never: if a detail is not clearly visible, omit it.
- Use visible pixel evidence only. Prefer [] / null over guessing.
- FORBIDDEN: off-frame body, implied story, vibe essays, guessed glyphs, ethnicity/phenotype inferred from wardrobe/text/architecture.
- Describe visible physical features directly rather than assigning demographic labels from contextual cues.
- Transcribe on-image text only when glyphs are clearly legible — never reconstruct, autocorrect, or complete partial text.

OUTPUT RULES
- Follow the provided JSON schema. Omit unsupported fields instead of filling guesses.
- Do not add commentary, explanations, markdown, or prose outside the JSON.
- Do NOT write Prompt Pack fields (elements/positive/negative/style/layout/palette/ratio).
- Aspect ratio is computed locally from image width/height — do NOT invent --ar.
- Color fields use readable family names only — do NOT invent precise #RRGGBB hex.`;

/**
 * 字段语义与 FORBIDDEN 门：契约对照用，不再塞进 baseline user
 */
export const OBSERVE_FIELD_GUIDE = `ORTHOGONAL MEDIUM (required inside observation):
- render_family: photo | cgi | illustration | flat_graphic | watercolor | infographic | unknown
  • illustration = soft-painted OR inked anime/manga/comic OR graphite/paint 2D with continuous shading OR true cel bands. Do NOT collapse all into anime.
  • flat_graphic = hard-edge flat fills / posterized graphic OR minimalist angular flat cartoon character (geometric hair masses, limited flat skin fills, bold uneven contour, almost NO soft face shading / NO detailed iris). FORBIDDEN rewriting that look as anime soft-shaded.
  • cgi = TRUE 3D/PBR OR photoreal character CGI — NOT 2D character drawings.
  • photo = real camera photograph / live-action still.
- finish_technique CLOSED enum (REQUIRED when drawn/illustrated/flat cartoon — pick ONE from pixels):
  line_art | hard_cel | ink_print | soft_color_draw | flat_cartoon | tonal_sketch | painted | unknown
  Put on observation.finish_technique (orthogonal to finish prose).
  • flat_cartoon = angular/geometric flat cartoon, limited fills, bold contour, minimal face shading — NOT soft_color_draw
  • soft_color_draw = soft gradient anime OR webtoon soft skin; hard_cel = cel bands; ink_print = screentone/hatch/comic ink
  • line_art = outline-led sparse fill; tonal_sketch = graphite fill; painted = paint mediums
  FORBIDDEN inventing shonen/shojo as finish_technique. FORBIDDEN defaulting every stylized character to soft_color_draw.
- finish (REQUIRED when render_family=illustration OR flat_graphic character portrait):
  First token MUST be anime|manga|painted|sketch|other, then 5–8 precise visible tokens (not vague vibe words).
  Flat angular cartoon → first token other + flat angular cartoon tokens — FORBIDDEN starting with anime/manga when geometric flat cartoon.
  CHECKLIST (omit unreadables): fidelity band, tool/material, line/edge, shading/tone, surface/support, chroma / palette climate, highlight/specular, background mark language, mixed marks.
  FORBIDDEN vague-only: "artistic", "epic", "cinematic painting", "detailed illustration", "painterly" alone, "ink style" alone.
  FORBIDDEN bare "sketch"/"painted"/"anime"/"manga"/"other".

  TECHNIQUE BUCKET (REQUIRED — pick ONE primary; mirrors finish_technique):
  line_art | hard_cel | ink_print | soft_color_draw | flat_cartoon | tonal_sketch | painted
  • line_art / 线稿: outline-led sparse fill — MUST include exact token "line art" early when outline-led dominates
  • tonal_sketch bands: rough gestural | study/WIP | stylized character graphite (manga/anime-proportion face, NOT atelier life drawing) | academic refined (realistic anatomy volume) | near-photoreal graphite
  • painted bands: flat gouache | soft digital paint | oil impasto | painterly digital speed-paint | sumi-e ink-wash digital | watercolor wash | graphic novel ink (dense crosshatch + color wash)
  • anime/manga dialects: hard cel | soft-shaded | ink-heavy screentone | webtoon full-color | american superhero comic | franco-belgian ligne claire
  OPTIONAL soft tag (never replace bucket): shonen action manga | shojo manga | seinen/josei drama manga | gag/chibi comic — only when unmistakable.

  Key pairs — do not collapse:
  • oil/impasto + brush vortex bg ≠ sumi-e sparse ink; sumi-e calligraphic ink-wash ≠ soft digital paint or oil impasto
  • dense color crosshatch graphic novel ink ≠ soft digital paint smooth blend; ≠ B&W screentone manga; ≠ american superhero bold ink / Ben-Day
  • hatched ink + watercolor/color wash on a drawn face → render_family=illustration + finish painted graphic novel ink — FORBIDDEN render_family=watercolor when ink hatch structures the face
  • monochrome graphite WITH manga/anime eye proportions → stylized character graphite — FORBIDDEN rewriting as academic refined volumetric atelier life-drawing
  • outline-led 线稿 → finish MUST include "line art" — FORBIDDEN rewriting as soft tonal academic graphite or painted fill
  • flat_cartoon ≠ anime soft-shaded; hard_cel flat bands ≠ soft_color_draw/webtoon; webtoon full-color ≠ B&W screentone OR hard cel anime
  • graphic flat beauty closeups → finish_technique=flat_cartoon, NOT "painted, soft digital paint, smooth blend"

  Examples (STRUCTURE only — copy band, not content):
  • other, flat angular cartoon, limited flat fills, bold uneven contour, geometric hair masses, elongated face, minimal face shading, solid color void
  • sketch, line art, clean ink outlines, sparse fill, paper white
  • manga, line art, clean character contour, minimal shading, monochrome ink
  • manga, webtoon full-color, soft digital skin, cinematic panel lighting, vertical scroll comic
  • manga, shojo manga, soft-shaded, large sparkling eyes, decorative screentone, soft delicate lines
  • manga, shonen action manga, ink-heavy, speed lines, impact framing, bold ink
  • manga, american superhero comic, bold ink outlines, crosshatch shadows, heroic anatomy
  • manga, franco-belgian ligne claire, clear even contour, flat color fills
  • anime, hard cel, clean ink outlines, flat cel shadow bands
  • anime, soft-shaded, clean character linework, soft gradient shading
  • sketch, stylized character graphite, manga-proportion face, clean character contour, soft graphite fill, paper tooth
  • sketch, academic refined graphite, smooth tonal modeling, controlled contour, paper tooth, red construction lines
  • sketch, rough gestural charcoal, loose search lines, unfinished construction marks
  • sketch, near-photoreal graphite rendering, hyperdetailed tonal blend, photographic edge control
  • painted, graphic novel ink, dense crosshatch, watercolor wash, ink splatter, scratchy contour
  • painted, soft digital paint, smooth airbrush blend, low brush texture
  • painted, oil impasto, thick directional brush ridges, warm earthy ochre-sepia, wet specular skin peaks, swirling impasto background
  • painted, painterly digital speed-paint, visible opaque brush dabs, dramatic chiaroscuro, gritty stroke texture
  • painted, sumi-e ink-wash digital, calligraphic wet-ink edges, near-mono desaturated, gestural ink splash streaks, sparse paper white
  • manga, monochrome graphite, stylized eyes, clean character contour, soft tonal fill
  • manga, ink-heavy, screentone texture, dense hatch
  Sumi-e / calligraphic ink-wash → finish MUST start with painted + sumi-e/ink-wash tokens. Dense color crosshatch / graphic novel ink → finish MUST start with painted + graphic novel ink / dense crosshatch; FORBIDDEN collapsing that look into watercolor painting or soft digital paint. Local compiler repairs finish_technique mismatches — still lock the true bucket from pixels.
- palette_climate CLOSED enum (REQUIRED when overall chroma/saturation climate is readable — ORTHOGONAL to palette hex roles AND to lighting.climate):
  muted_antique | desaturated | warm_earthy | natural | vivid | neon | monochrome
  • muted_antique = ONLY when pixels truly read aged parchment / weathered scroll / antique low-chroma print (paper yellowing + restrained fills). Traditional motifs alone (fan, hairpin, calligraphy subject) do NOT equal muted_antique.
  • desaturated = low-chroma / near-mono muted colors (not necessarily antique paper)
  • warm_earthy = ochre-sepia / warm earth restrained chroma
  • natural = moderate realistic chroma
  • vivid = intentional high-chroma clean digital / manhua / poster (bright crimson makeup, saturated teal/cyan props, clean cream skin) — FORBIDDEN inventing aged parchment / sepia wash / muted indigo rewrite
  • neon = emissive neon / fluorescent
  • monochrome = B&W / near-grey ink (no invented full color)
  Put on observation.palette_climate. Hex roles alone do NOT lock saturation. CRITICAL both ways:
  • FORBIDDEN rewriting vivid saturated digital as muted_antique / sumi-e near-mono / aged paper (East-Asian props ≠ automatic antique climate).
  • FORBIDDEN rewriting true muted_antique parchment print as vivid digital cyan + hot vermillion.
- Object / prop color (REQUIRED when a large prop has a dominant readable fill): color family + saturation honesty — e.g. "saturated teal cyan" OR "deep muted indigo" as truly seen — NOT bare "blue". FORBIDDEN upgrading muted indigo into bright turquoise when pixels are muted; FORBIDDEN collapsing saturated teal/cyan into navy/indigo antique wash when pixels are vivid.
- Subject color / body surface (REQUIRED when torso/face surface readable): lock the TRUE visible surface family — e.g. warm living mid skin | cool plaster grey | graphite grey | stone statue. Put it on subjects[].color. FORBIDDEN inventing warm beige living skin when the body reads as plaster/statue/monochrome grey. FORBIDDEN omitting surface color when the body fill is a dominant readable hue. When the torso is CLOTHED, still lock skin on readable face/arms — do NOT treat clothing fabric as subjects[].color.
- wardrobe (REQUIRED when any torso garment is readable on a person): concrete garments as seen — color family + garment noun (e.g. "dark navy Team USA basketball jersey").
  • Draped flag / cape / shawl is an OBJECT (or extra layer) — NOT a substitute for the shirt/jersey UNDER it.
  • Chest letters/numbers on fabric (USA, 10, team marks) → subjects[].wardrobe MUST name the jersey/shirt AND typography role garment_print on that subject id.
  • FORBIDDEN omitting a clearly visible jersey/shirt/uniform because a flag is draped over the shoulders.
  • FORBIDDEN wardrobe that is only "flag draped" / "cape" when a knit jersey with chest print is readable underneath.
  • FORBIDDEN implying bare chest / shirtless when a torso garment is visible.
  • Bare torso / shirtless (REQUIRED when the chest/upper torso is clearly bare with no shirt/jersey/top):
    — man / boy: wardrobe "shirtless, bare torso" (plus bottoms if visible)
    — woman / girl face/shoulder extreme close-up with chest out of frame: wardrobe "bare shoulders, collarbones subtly visible, chest fully outside frame" — FORBIDDEN "no shirt / uncovered upper body" on face-fill crops (draws nude-torso attention) AND FORBIDDEN shirtless/topless/nude
    — woman / girl with bare chest/torso IN frame: wardrobe "no shirt, uncovered upper body" (plus bottoms if visible) — FORBIDDEN shirtless / topless / bare torso / nude on female subjects (platforms often refuse generation)
    FORBIDDEN omitting wardrobe on a clear bare-chest portrait (generators invent a shirt). FORBIDDEN inventing a shirt/jersey when the torso is bare.
- age CLOSED decade band (REQUIRED when face readable and uncovered): infant | toddler | child | early_teens | late_teens | early_20s | mid_20s | late_20s | early_30s | mid_30s | late_30s | early_40s | mid_40s | late_40s | early_50s | mid_50s | late_50s | early_60s | mid_60s | late_60s | seventies_plus
  Put on subjects[].age as the token above (e.g. mid_20s). FORBIDDEN bare young / middle-aged / older / elderly / old alone.
  Judge ONLY from visible pixels (checklist — use what is readable, omit unreadables):
  1) soft-tissue: cheek fullness vs hollow / jowl
  2) skin texture: smooth vs fine lines vs deep wrinkles / crow's feet
  3) periocular + fold: eyelid hooding, nasolabial fold depth
  4) hair cues when readable: grey density, hairline recession (not dye alone)
  5) body proportion when full-body: child head-to-body ratio vs adult
  6) anime/manga/flat cartoon: lock the DESIGNED apparent decade from face proportions + shape language (elongated weary droop ≠ early_20s soft anime face) — not vibe "young"
  Prefer early|mid|late within a decade when cues allow; if only a rough decade is clear, use mid_XXs. FORBIDDEN inventing exact birth year. OMIT when face fully covered/silhouette.
- build CLOSED enum (REQUIRED when torso silhouette readable): lean | average | athletic | lean_muscular | muscular | bulky | heavy | stocky
  • lean = slim/narrow shoulders, no visible muscle bulk
  • average = ordinary civilian proportions, clothes hang normally
  • athletic = fit/toned without heavy muscle mass
  • lean_muscular = defined muscle lines, fighter/ripped look, NOT bulky chest/arms
  • muscular = clear muscle mass, moderate bulk (between athletic and bodybuilder)
  • bulky = hyper-muscular / bodybuilder: broad shoulders, thick arms, barrel chest, tight shirt stretch
  • heavy / stocky = thickset or heavyset silhouette without bodybuilder peak
  Put on subjects[].build. FORBIDDEN collapsing bulky/bodybuilder into athletic or soft muscular. FORBIDDEN collapsing lean_muscular into lean-only or bulky. FORBIDDEN defaulting every adult male to bulky. FORBIDDEN omitting build when the figure's torso is clearly readable.
- stature CLOSED enum (REQUIRED when full-body / head-to-toe readable; orthogonal to build): short | average | tall
  • short = visibly short / petite relative adult proportions
  • average = ordinary adult height
  • tall = visibly tall / long-legged towering adult
  Put on subjects[].stature. FORBIDDEN inventing exact cm heights. FORBIDDEN omitting stature on clear full-body character sheets. OMIT on bust/waist crops where height is unreadable.
- facial_hair CLOSED enum (REQUIRED when lower face / jaw is readable): none | stubble | mustache | goatee | short_beard | full_beard
  • none = clean-shaven, no beard or mustache
  • stubble = light five-o'clock shadow / short stubble only
  • mustache = mustache without full beard
  • goatee = chin beard / soul patch / chinstrap
  • short_beard = trimmed short beard covering jaw
  • full_beard = thick / bushy / long full beard
  Put on subjects[].facial_hair. FORBIDDEN inventing a beard or stubble when the face is clean-shaven. FORBIDDEN omitting a clearly visible beard/mustache/stubble. When face_cover is mask|helmet, OMIT facial_hair.
- hair (REQUIRED when hair is clearly readable and not fully covered): 8–28 words, order length → wave → color → style → part → bangs → wet/dry only if distinctive.
  Examples of STRUCTURE: "shoulder-length wavy dark brown hair, center part, wispy bangs" / "cropped straight black hair, no bangs" / "long straight black hair in a ponytail, side part"
  Put on subjects[].hair. FORBIDDEN bare "hair" / "dark hair" / "long hair" with no length+color. FORBIDDEN inventing bangs, part, or updo not visible. OMIT when hair is out of frame or face_cover is helmet.
- pose CLOSED enum: seated|standing|kneeling|lying|leaning|crouching|hugging|hunched|riding|walking|airborne
  • hugging = arms wrapped around self/prop, self-embrace, clutching rifle to chest
  • hunched = head bowed inward, curled protective posture
  FORBIDDEN collapsing a head-down self-embrace into crouching or three-quarter “hero crouch”.
- arm_pose CLOSED enum (REQUIRED when arms/hands silhouette readable; orthogonal to pose): at_sides | crossed | behind_back | on_hips | clasped_front | raised | in_pockets | drawing_weapon | two_hand_grip | one_hand_weapon
  • behind_back = hands clasped behind the back / parade rest (chest clear of arms)
  • crossed = arms folded across the chest
  • at_sides = arms hanging naturally at sides
  • on_hips = hands on hips / akimbo
  • clasped_front = hands clasped in front of body (no weapon)
  • raised = one or both hands/arms raised
  • in_pockets = hands in pockets
  • drawing_weapon = mid-draw / about to draw / hand pulling blade from hip or scabbard
  • two_hand_grip = both hands on one weapon hilt (often vertical front grip)
  • one_hand_weapon = one hand on hilt/weapon (hip or side), other arm free/asymmetric
  Put on subjects[].arm_pose. FORBIDDEN rewriting hands-behind-back as arms-crossed (or the reverse). FORBIDDEN collapsing mid-draw / hip-hilt one-hand grip into symmetric two-hand front sword pose. FORBIDDEN omitting arm_pose when the figure is upright and arm placement is clearly readable. Skip when arms fully cropped/occluded. FORBIDDEN inventing arms at sides on extreme close-up / face-filling crops where arms are outside the frame.
- action (REQUIRED when the figure is clearly mid-action / asymmetric / torso-twisted — not a static idle): 8–25 words of ONLY visible torso+limb facts.
  Examples of STRUCTURE (do not copy content): "torso twisted three-quarter, right hand on katana hilt at hip mid-draw, left arm bent across chest"
  FORBIDDEN vague "dynamic pose" / "action stance" / "powerful pose" / "torso upright" alone. FORBIDDEN inventing hidden limbs. When action is set, still fill arm_pose with the closest closed token.
- expression (REQUIRED when face is readable and uncovered): 4–16 words of ONLY visible brow/eye/mouth facts.
  Examples of STRUCTURE: "furrowed brows, clenched jaw, parted lips" / "soft closed-mouth smile, relaxed lids" / "wide eyes, parted lips"
  Put on subjects[].expression. One half-clause MUST name mouth aperture (closed lips / pursed / parted lips / teeth visible). FORBIDDEN vibe-only words: neutral / calm / serious / intense / emotional / confident look / neutral mouth. FORBIDDEN inventing emotion not visible. When face_cover is mask|helmet, OMIT expression.
- mouth CLOSED enum (REQUIRED when the mouth is readable and uncovered): closed | pursed | parted | open_teeth
  • closed = lips together (including closed-mouth smile)
  • pursed = lips tight / pressed
  • parted = lips slightly or clearly open, teeth not the hero
  • open_teeth = mouth open with teeth clearly visible
  Put on subjects[].mouth. FORBIDDEN omitting aperture on a readable uncovered mouth. FORBIDDEN "neutral". OMIT when face_cover is mask|helmet OR frame_focus is upper_face|single_eye OR mouth is cropped.
- species CLOSED enum (REQUIRED when the subject is a living being / creature): human | dog | cat | wolf | fox | bird | horse | cattle | rabbit | dragon | other
  Put on subjects[].species. FORBIDDEN calling a clearly non-human creature human. FORBIDDEN inventing a fantasy species not visible.
- phenotype CLOSED enum (REQUIRED when species is human OR unspecified humanoid AND face/skin are readable AND face_cover is not mask|helmet): east_asian | southeast_asian | south_asian | west_asian | north_african | black_african | european | latino | indigenous
  • Lock ONLY from visible face/skin anatomy — generator-usable regional appearance.
  • FORBIDDEN inferring phenotype from wardrobe, kimono, on-image text, architecture, or cultural props.
  • FORBIDDEN omitting phenotype on clear uncovered human faces (leads to wrong-default cast).
  • If silhouette / back-view / fully covered: OMIT. If non-human species: OMIT phenotype.
  Put on subjects[].phenotype.
- capture_style: flash | studio | cinematic | documentary | product_shot | none | unknown
  (use none when not a camera capture; beauty/editorial glam → studio, NOT documentary)
- content_type: portrait | product | scene | poster | ui | abstract | other
- presentation: full_bleed | framed | collage | mockup | plain | unknown
- shot_scale CLOSED enum (REQUIRED when a living subject dominates the frame): extreme_closeup | closeup | bust | waist | full_body | wide
  • extreme_closeup = face / lips / beauty detail fills most of the frame (Douyin/editorial macro)
  • closeup = head fills frame, little or no torso
  • bust = chest-up; waist = waist-up; full_body = head-to-toe; wide = environment dominates
  Put on subjects[].shot_scale. FORBIDDEN rewriting an extreme face-fill beauty crop as a head-and-shoulders or full-body portrait. OMIT only when scale is truly ambiguous.
- frame_focus CLOSED enum (REQUIRED when shot_scale is extreme_closeup|closeup OR face is heavily cropped/occluded — ORTHOGONAL to shot_scale): full_face | upper_face | single_eye | lips_chin | half_face | other
  • full_face = both eyes + nose + mouth (or most of face) readable in frame
  • upper_face = brow/eyes dominate; mouth/chin cropped OR covered by prop (fan/hand/mask edge)
  • single_eye = ONE eye dominates the frame (other eye out of frame or tiny) — NOT "full face filling the frame"
  • lips_chin = lower face / lips only
  • half_face = vertical left/right half of face
  Put on subjects[].frame_focus. CRITICAL: extreme_closeup ≠ automatic full_face. A single-eye graphic crop MUST be single_eye (or upper_face if both brows/eyes but mouth covered). FORBIDDEN defaulting every beauty extreme_closeup to full_face / "face filling the frame".
- crop (free text, orthogonal to shot_scale + frame_focus): name which body part meets which frame edge when cut — e.g. "forehead and chin clipped by frame" OR "only left eye in frame, mouth covered by fan". OMIT if fully in frame with readable margins.
- lip_finish CLOSED enum (REQUIRED when lips are a distinctive readable hero): matte | satin | gloss | wet_gloss
  Put on subjects[].lip_finish. wet_gloss = glass/wet-look high shine. FORBIDDEN omitting wet-look plump lips. OMIT if lips unreadable or bare/natural with no distinctive finish.
- blush CLOSED enum (REQUIRED when cheek color is clearly styled): none | soft | heavy
  Put on subjects[].blush. heavy = thick rosy blush high on cheeks. FORBIDDEN collapsing heavy blush into natural bare cheeks.
- makeup (short free text, when distinctive): 5–20 words of ONLY visible beauty marks beyond lip_finish/blush — e.g. "plump oversized pink-red lips, winged liner". FORBIDDEN vibe essays. OMIT if subtle.
- skin_finish CLOSED enum (REQUIRED when face skin texture is clearly readable on photo/CGI/beauty stills): pore_detail | natural | soft_focus | dewy_beauty | airbrushed
  • pore_detail = visible pores / freckles / raw documentary skin
  • dewy_beauty = glassy/dewy beauty glow; airbrushed = heavy retouch/smooth filter; soft_focus = optical soft-focus skin
  Put on subjects[].skin_finish. FORBIDDEN rewriting dewy beauty skin as pore-level documentary texture (or the reverse).
  • FORBIDDEN on flat graphic / anime / manga / hard-edge illustration faces: inventing dewy_beauty / pore_detail / airbrushed when skin is flat matte cream fill with no photoreal texture — OMIT skin_finish (or use nothing) and describe flat matte illustration skin in finish tokens instead.
- eyes (when iris readable): hue family only on stylized/flat/anime/manga faces (e.g. "amber brown iris"). FORBIDDEN "detailed radial striations" / pore-level iris essays on non-photo frames — that pulls generators into photoreal beauty.
- makeup on graphic/illustrated faces: lock opaque graphic blocks / thick ink liner / hard-edge eyeshadow as seen — FORBIDDEN rewriting graphic opera/manhua makeup as soft blended cosmetic beauty.
- skin_tone CLOSED enum (REQUIRED when face/skin mid-tone is clearly readable): fair | light | mid | tan | deep
  • fair = pale / porcelain / very fair; light = light but not porcelain; mid = ordinary mid (NEVER write "medium"); tan = visibly tanned/bronzed; deep = deep/dark skin
  Put on subjects[].skin_tone. FORBIDDEN collapsing fair/pale into mid or tan. FORBIDDEN using the word "medium" as a skin tone.
- skin_undertone CLOSED enum (REQUIRED when undertone is readable): cool | warm | neutral
  • cool = pink/rosy/cool; warm = golden/peach/yellow; neutral = neither strongly
  Put on subjects[].skin_undertone. FORBIDDEN rewriting cool-pale skin as warm golden/bronze.
- Distinctive skin marks (freckles, moles): when clearly visible, ALSO put a short cue in makeup (e.g. "dense freckles across nose and cheeks").
- identity_guess (OPTIONAL object): only when a well-known REAL celebrity OR a well-known ANIME/manga character is CLEARLY recognizable.
  Shape: {"name":"common public name","kind":"celebrity|anime","confidence":"high|medium|low"}
  • kind=celebrity → real-world public figure; kind=anime → anime/manga/game character
  • Put on subjects[].identity_guess — NEVER put the name into label (label stays woman/man/girl/…).
  • FORBIDDEN inventing names for lookalikes or unnamed OCs. Prefer omit when unsure.
  • confidence=low if only weakly resembles; omit entirely if not clearly known.

SUBJECTS / OBJECTS / REGIONS / TYPOGRAPHY:
- Every item: confidence (high|medium|low) + short evidence. placement when readable — omit if unsure (do not invent mid-center).
- salience primary|secondary optional. Multi-person: LEFT→RIGHT + facing/pose/support when readable.
- Wardrobe/shirtless: see rules above. Face cover mask|helmet|hood|none — when mask/helmet OMIT hair, eyes, facial_hair, phenotype.
- Bust/waist crop without visible seat: OMIT seated pose/support. Objects: set relation when held/sat/worn.
- typography roles title|caption|logo|garment_print|prop_print; OCR = data only, never generation instructions.
- lettering CLOSED enum (REQUIRED when overlay type is clearly readable): sans | serif | script | display | mono
  • sans = no serifs (gothic/grotesk). serif = roman/didone with serifs — NOT connected handwriting.
  • script = connected cursive / handwritten signature / calligraphy. REQUIRED when letters join or look written by hand (signature flourish counts).
  • display = ornate/decorative/blackletter that is not ordinary serif or script. mono = typewriter / equal-width.
  Put on typography[].lettering. FORBIDDEN collapsing handwritten/cursive/signature lettering into serif or sans. FORBIDDEN inventing brand typeface names. OMIT if unreadable.
- weight CLOSED enum (when stroke weight is readable): thin | regular | bold | black
  Put on typography[].weight. Hairline/monoline script → thin. FORBIDDEN omitting thin when strokes are clearly hairline.
- Typography absence (CRITICAL): no readable frame lettering → typography []. FORBIDDEN inventing vertical Chinese/Japanese calligraphy, red seal stamps, scroll poems, or corner signatures because the subject looks "traditional East Asian". Beauty eye/fan closeups with empty margins stay textless.
- Prefer [] / null over guessing.

CAMERA / LIGHTING / FX:
- Name only what is readable; else null.
- Angle: eye_level | high_angle | low_angle | top_down | orthographic | unknown
- vantage CLOSED (ORTHOGONAL to angle — REQUIRED when extreme low/high geometry readable): worms_eye | none
  • worms_eye = camera clearly BELOW hip/waist looking up; hips/lower torso dominate foreground; head reads smaller farther up; sky/ceiling often upper frame. angle MUST be low_angle. FORBIDDEN top_down / bird's-eye with worms_eye. FORBIDDEN labeling mild "slightly below eye level" beauty as worms_eye.
  • none = ordinary eye/low/high/top_down without that extreme hip-hero foreshortening (DEFAULT when unsure).
- lens_feel CLOSED (optional, when FOV/foreshortening readable): ultra_wide | wide | normal | tele | macro
  • hips huge vs head small + extreme near-camera mass → ultra_wide. Eye/pore filling the frame at very close working distance → macro. Omit when unreadable — FORBIDDEN inventing 20mm on every portrait. FORBIDDEN inventing macro on every portrait.
- When worms_eye: action MUST name hips toward camera + torso twist/arch + head tilt/gaze (down into lens when true). FORBIDDEN upright standing-only rewrite. placement SHOULD be honest off-center when biased; shot_scale MUST NOT heal hip-hero into face-fill bust.
- composition CLOSED summary (OPTIONAL but REQUIRED when mass/void/depth are clearly readable — ORTHOGONAL to placement/crop/vantage):
  • primary_mass: hips_lower | bust_face | full_figure | product | type_band | sky_void | other — which BAND owns frame weight (not "who is important")
  • anchor: upper-left|upper-center|upper-right|mid-left|mid-center|mid-right|lower-left|lower-center|lower-right — centroid of primary mass
  • negative_space: none | upper | upper-left | upper-right | lower | side-left | side-right | surround
  • depth_stack: ordered near→far tokens from hips_lower|torso|head|product|type|ground|sky|void|other (2–5)
  Gates: omit whole composition when unsure. worms_eye usually → primary_mass=hips_lower + upper void when sky readable. extreme face close-up → bust_face. product packshot → product. FORBIDDEN defaulting every portrait to bust_face or every outdoor to hips_lower.
- Lighting (REQUIRED when face light is readable on portraits):
  • pattern: blinds_slat | dappled_foliage | backlight_rim | split_chiaroscuro | directional | flash | soft_even | unknown
  • exposure: high_key | low_key | balanced | unknown — high_key = bright airy / near-clipped highlights on skin; low_key = shadow-dominant
  • key_side CLOSED (REQUIRED when key direction is readable — do NOT leave blank on portraits with clear shadows):
    camera_left | camera_right | overhead
    KEY DIRECTION GATE (decide BEFORE writing pattern extras — look at face shadows):
    1) overhead — KEY from ABOVE / ceiling / boom top: crown / forehead brighter; under-chin hollow + brow-ridge / eye-socket shadows from ABOVE; nose shadow falls DOWN toward lips; NOT a left/right Rembrandt triangle. Typical studio portrait top light.
    2) camera_left — KEY arrives from the CAMERA'S LEFT (subject's right cheek often brighter). Shadow mass on the camera-right side of the face.
    3) camera_right — KEY arrives from the CAMERA'S RIGHT. Shadow mass on the camera-left side of the face.
    Rules: name the KEY origin, NOT which cheek is dark. FORBIDDEN omitting key_side when under-chin OR one-side face shadows are clear. FORBIDDEN calling overhead top light "directional" without key_side=overhead. FORBIDDEN swapping left↔right. FORBIDDEN inventing side key when only top falloff is visible.
    BACKLIGHT RIM OVERRIDE: when pattern=backlight_rim, key_side names the BEHIND light origin (upper-left → camera_left; upper-right → camera_right; top-behind → overhead) — NOT a frontal Rembrandt/beauty key. Face may stay soft/fill while hair rim glows. FORBIDDEN rewriting true behind rim as directional camera_right frontal key.
  • source CLOSED (REQUIRED when readable): studio | natural | mixed
    — studio = softbox / beauty dish / seamless controlled set; natural = sun / sky / window daylight; mixed = both readable
  • quality CLOSED (REQUIRED when shadow edge readable): hard | soft
    — hard = sharp cast shadows; soft = diffused wrap / open soft shadows
  • climate CLOSED (REQUIRED when color/time-of-day readable): daylight | overcast | golden_hour | cool_skylight | tungsten
  • beams CLOSED (REQUIRED when air/haze volume is readable — ORTHOGONAL to pattern): god_rays | none
    — god_rays = visible diagonal crepuscular light shafts / 丁达尔光束 cutting through haze (not mere soft particles)
    — none = no readable light shafts
    Put on lighting.beams. ALSO put beam origin into lighting.evidence (e.g. "god rays from upper-left"). key_side MUST match beam origin when god_rays. FORBIDDEN collapsing god_rays into fx.volumetric_wrap. FORBIDDEN beams=none when bright shafts are visible.
  Lighting gates:
  • soft even + high_key pale daylight → soft_even + high_key + source=natural + quality=soft — NOT studio softbox OR golden-hour bronze drama
  • studio TOP / ceiling key with under-chin shadows → pattern=directional + key_side=overhead + source=studio — NOT side Rembrandt
  • one-side Rembrandt → pattern=directional|split_chiaroscuro + key_side=camera_left|camera_right — NOT overhead
  • backlight_rim: key_side = BEHIND origin (upper-right → camera_right) — NOT frontal beauty key
  • God rays / crepuscular light shafts / 丁达尔光束: lighting.beams=god_rays + origin in evidence; key_side MUST match origin. FORBIDDEN putting god rays only in fx as volumetric_wrap. FORBIDDEN omitting beams when shafts are clear.
  • Lock skin_tone/undertone WITH lighting — fair cool high-key ≠ warm bronze drama
  FORBIDDEN bare pattern=directional without key_side + quality/source/exposure. Prefer omit over vague lighting.
- FX family: motion_blur | double_exposure | optical_bokeh | volumetric_wrap | none | other
  • volumetric_wrap = smoke/haze WISPS wrapping through the figure (front+behind). God rays / light shafts alone → lighting.evidence, fx=none (or omit wrap).
- Host UI chrome: never put "AI modified", Edit, expand icon, magic wand, share controls into typography/objects/regions.`;

/** 契约对照：全局政策 + 字段指南（测试仍匹配此拼接） */
export const OBSERVE_SYSTEM_PROMPT = `${GLOBAL_OBSERVATION_POLICY}

${OBSERVE_FIELD_GUIDE}`;

/** @deprecated 期 3 起 Pack 由本地编译；保留供对照 */
export const PACK_WRITE_BRIEF = `PROMPT PACK fields are compiled locally — omit them from the model JSON.`;

/** 图片反推 baseline system（Phase A：仅全局观察政策） */
export function buildBaselineSystemPrompt() {
  return GLOBAL_OBSERVATION_POLICY;
}

/**
 * baseline user 文本：短见闻 JSON，不塞字段指南
 * @param {string} [_schemaHint]
 * @param {{ seedMedium?: string }} [opts]
 */
export function buildBaselineUserText(_schemaHint, opts = {}) {
  const seed = String(opts.seedMedium || "").trim();
  const task = seed
    ? `Optional seed medium label: ${seed}. Still describe visible pixels only — do not invent ethnicity or Pack essays.`
    : "Observe THIS image. Fill the JSON from visible pixels only.";
  return [SIGHT_JSON_HINT, task, "JSON only."].join("\n\n");
}

/** 缓存指纹：政策 + 见闻任务，字段指南不再进请求 */
export function composeBaselinePromptFingerprint(_schemaHint = "") {
  return `${GLOBAL_OBSERVATION_POLICY}\n${SIGHT_JSON_HINT}`;
}

/** 生产观察 prompt；兼容旧 SYSTEM_PROMPT 名 */
export const SYSTEM_PROMPT = OBSERVE_SYSTEM_PROMPT;

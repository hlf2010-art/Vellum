/**
 * 导出平台 → 一键交接（打开目标站）配置
 * open_copied：复制后打开；可选 queryParam（如 ChatGPT ?q=）把文案带进 URL
 * 空 openUrl 运行时强制 copy_only
 *
 * 后期工具（如 Magnific 放大）见 POST_TOOLS：不绑生图方言，单独入口
 */

/** @typedef {"open_copied" | "copy_only"} HandoffMode */

/**
 * @typedef {{
 *   openUrl: string,
 *   mode: HandoffMode,
 *   openLabel?: string,
 *   queryParam?: string,
 *   maxQueryChars?: number,
 * }} HandoffConfig
 */

/**
 * @typedef {{
 *   openUrl: string,
 *   label: string,
 *   media: "image" | "video" | "both",
 * }} PostToolConfig
 */

/**
 * @type {Record<string, HandoffConfig>}
 */
export const HANDOFF_BY_PLATFORM = {
  generic: { openUrl: "", mode: "copy_only" },
  midjourney: { openUrl: "https://www.midjourney.com/imagine", mode: "open_copied" },
  flux: { openUrl: "", mode: "copy_only" },
  wanx: { openUrl: "", mode: "copy_only" },
  seedream: { openUrl: "", mode: "copy_only" },
  // 打开 Gemini 对话；?q= 预填导出文案（与 ChatGPT 同类快捷方式）
  gemini: {
    openUrl: "https://gemini.google.com/app",
    mode: "open_copied",
    openLabel: "Gemini",
    queryParam: "q",
    maxQueryChars: 4000,
  },
  // 打开 ChatGPT 普通新对话；?q= 预填导出文案（可能自动提交）
  gptImage: {
    openUrl: "https://chatgpt.com/",
    mode: "open_copied",
    openLabel: "ChatGPT",
    queryParam: "q",
    maxQueryChars: 4000,
  },
  kling: { openUrl: "", mode: "copy_only" },
  wanxVideo: { openUrl: "", mode: "copy_only" },
  seedance: { openUrl: "", mode: "copy_only" },
};

/**
 * 生成后工具：不走 EXPORT_PLATFORMS 方言，仅复制当前导出文案并打开入口页
 * @type {Record<string, PostToolConfig>}
 */
export const POST_TOOLS = {
  magnific: {
    openUrl: "https://www.magnific.com/ai/image-upscaler",
    label: "Magnific",
    media: "image",
  },
};

/**
 * @param {string} platform
 * @returns {{ platform: string, mode: HandoffMode, openUrl: string, openLabel: string }}
 */
export function resolveHandoff(platform) {
  const id = String(platform || "").trim();
  const row = HANDOFF_BY_PLATFORM[id] || HANDOFF_BY_PLATFORM.generic;
  const openUrl = String(row?.openUrl || "").trim();
  const openLabel = String(row?.openLabel || "").trim();
  if (!openUrl) {
    return { platform: id || "generic", mode: "copy_only", openUrl: "", openLabel: "" };
  }
  const mode = row.mode === "open_copied" ? "open_copied" : "copy_only";
  return { platform: id || "generic", mode, openUrl, openLabel };
}

/**
 * 构造实际打开的 URL；带 queryParam 时把导出文案写入查询串（过长则退回裸 URL）
 * @param {string} platform
 * @param {string} [text]
 * @returns {string}
 */
export function buildHandoffOpenUrl(platform, text = "") {
  const handoff = resolveHandoff(platform);
  if (handoff.mode !== "open_copied" || !handoff.openUrl) return "";
  const row = HANDOFF_BY_PLATFORM[handoff.platform] || HANDOFF_BY_PLATFORM.generic;
  const param = String(row.queryParam || "").trim();
  if (!param) return handoff.openUrl;

  const body = String(text || "").trim();
  const max = Number(row.maxQueryChars) > 0 ? Number(row.maxQueryChars) : 4000;
  if (!body || body.length > max) return handoff.openUrl;

  try {
    const u = new URL(handoff.openUrl);
    u.searchParams.set(param, body);
    return u.href;
  } catch {
    return handoff.openUrl;
  }
}

/**
 * @param {string} toolId
 * @returns {{ id: string, openUrl: string, label: string, media: "image" | "video" | "both" }}
 */
export function resolvePostTool(toolId) {
  const id = String(toolId || "").trim();
  const row = POST_TOOLS[id];
  if (!row) {
    return { id: id || "", openUrl: "", label: "", media: "both" };
  }
  return {
    id,
    openUrl: String(row.openUrl || "").trim(),
    label: String(row.label || id).trim(),
    media: row.media === "image" || row.media === "video" ? row.media : "both",
  };
}

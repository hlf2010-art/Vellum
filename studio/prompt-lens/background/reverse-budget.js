/**
 * 单图反推预算：调用次数 / 输出 token 预留 / 墙钟
 */

export const DEFAULT_REVERSE_BUDGET = {
  maxCalls: 3,
  maxOutputTokens: 4500,
  wallClockMs: 120000,
};

/**
 * @param {Partial<typeof DEFAULT_REVERSE_BUDGET>} [opts]
 * @param {AbortSignal} [parentSignal]
 */
export function createReverseBudget(opts = {}, parentSignal) {
  const maxCalls = Math.max(1, Number(opts.maxCalls) || DEFAULT_REVERSE_BUDGET.maxCalls);
  const maxOutputTokens = Math.max(
    500,
    Number(opts.maxOutputTokens) || DEFAULT_REVERSE_BUDGET.maxOutputTokens
  );
  const wallClockMs = Math.max(
    5000,
    Number(opts.wallClockMs) || DEFAULT_REVERSE_BUDGET.wallClockMs
  );
  const startedAt = Date.now();
  let calls = 0;
  let outputTokensReserved = 0;
  let outputTokensActual = 0;

  const ac = new AbortController();
  const onParentAbort = () => {
    try {
      ac.abort(parentSignal?.reason);
    } catch {
      ac.abort();
    }
  };
  if (parentSignal) {
    if (parentSignal.aborted) onParentAbort();
    else parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }
  const timer = setTimeout(() => {
    try {
      ac.abort(new DOMException("Reverse budget wall clock exceeded", "TimeoutError"));
    } catch {
      ac.abort();
    }
  }, wallClockMs);

  return {
    signal: ac.signal,
    maxCalls,
    maxOutputTokens,
    wallClockMs,
    get calls() {
      return calls;
    },
    get outputTokens() {
      return Math.max(outputTokensActual, outputTokensReserved);
    },
    get elapsedMs() {
      return Date.now() - startedAt;
    },
    get remainingMs() {
      return Math.max(0, wallClockMs - (Date.now() - startedAt));
    },
    /** @param {number} [tokenCap] */
    canAfford(tokenCap = 200) {
      const need = Math.max(0, Number(tokenCap) || 0);
      if (ac.signal.aborted) return false;
      if (calls >= maxCalls) return false;
      if (Date.now() - startedAt >= wallClockMs) return false;
      if (outputTokensReserved + need > maxOutputTokens) return false;
      if (wallClockMs - (Date.now() - startedAt) < 2500) return false;
      return true;
    },
    /** @param {number} tokenCap */
    beginCall(tokenCap) {
      const need = Math.max(0, Number(tokenCap) || 0);
      if (!this.canAfford(need)) return false;
      calls += 1;
      outputTokensReserved += need;
      return true;
    },
    /**
     * @param {{ completion_tokens?: number } | null | undefined} usage
     * @param {number} tokenCap
     */
    settleCall(usage, tokenCap) {
      const cap = Math.max(0, Number(tokenCap) || 0);
      const actual = Number(usage?.completion_tokens);
      if (Number.isFinite(actual) && actual >= 0) {
        outputTokensActual += actual;
        const over = Math.max(0, cap - actual);
        outputTokensReserved = Math.max(outputTokensActual, outputTokensReserved - over);
      } else {
        outputTokensActual += cap;
      }
    },
    dispose() {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
    },
    snapshot() {
      return {
        calls,
        outputTokens: Math.max(outputTokensActual, outputTokensReserved),
        elapsedMs: Date.now() - startedAt,
        maxCalls,
        maxOutputTokens,
        wallClockMs,
      };
    },
  };
}

const ANGLE_TOKEN_RE =
  /\b(eye[-\s]?level|high[-\s]?angle|low[-\s]?angle|top[-\s]?down|bird'?s[-\s]?eye|orthographic|overhead|俯视|平视|仰视|鸟瞰|高机位|低机位|直俯)\b/i;
const LIGHT_TOKEN_RE =
  /\b(blinds?|slat|dappled|foliage|gobo|backlit|backlight|rim light|chiaroscuro|split lighting|on[-\s]?camera flash|hard flash|soft even|directional (?:key )?light|百叶|斑驳|逆光|轮廓光|明暗)\b/i;
const FLAT_STYLE_RE =
  /\b(flat(?:\s+vector|\s+graphic)?|orthographic|UI(?:\s+screenshot)?|infographic|hard[-\s]?edge)\b/i;
const PHOTO_LIKE_RE =
  /\b(photo(?:graph|real)?|cinematic|flash|portrait|CGI|render|illustration)\b/i;

/**
 * 本地校验：基线 Pack + sidecar 仍缺关键锁时标记缺口（不发模型）
 * @param {{ camera?: string, positive?: string, style?: string } | null | undefined} pack
 * @param {{ medium?: string, fx?: { family?: string } | null, angle?: { angle?: string } | null, light?: { pattern?: string } | null } | null | undefined} traits
 * @returns {Array<"angle"|"lighting"|"fx"|"finish">}
 */
export function detectReverseGaps(pack, traits) {
  /** @type {Array<"angle"|"lighting"|"fx"|"finish">} */
  const gaps = [];
  const camBlob = `${pack?.camera || ""} ${pack?.positive || ""}`;
  const styleBlob = `${pack?.style || ""} ${pack?.positive || ""}`;
  const flat = FLAT_STYLE_RE.test(styleBlob) || traits?.angle?.angle === "orthographic";

  const hasAngle = ANGLE_TOKEN_RE.test(camBlob);
  const traitAngleOk = Boolean(traits?.angle?.angle && traits.angle.angle !== "unknown");
  if (!flat && !hasAngle && !traitAngleOk) gaps.push("angle");

  const hasLight = LIGHT_TOKEN_RE.test(camBlob);
  const vagueOnly =
    /\b(directional light|shadow play|casting shadows)\b/i.test(camBlob) &&
    !/\b(blinds?|slat|dappled|foliage|backlit|rim|chiaroscuro|flash)\b/i.test(camBlob);
  const traitLightOk = Boolean(traits?.light?.pattern && traits.light.pattern !== "unknown");
  const photoLike =
    PHOTO_LIKE_RE.test(styleBlob) ||
    /photo|flash_photo|cinematic|render3d/.test(String(traits?.medium || ""));
  if (!flat && (vagueOnly || (!hasLight && photoLike)) && !traitLightOk) {
    gaps.push("lighting");
  }

  const fxContradiction =
    /\bbokeh\b/i.test(camBlob) && /\b(motion\s*blur|speed\s*streak)\b/i.test(camBlob);
  const softBokehStock = /\bsoft\s+bokeh\s+blur\s+effect\b/i.test(camBlob);
  const traitFxOk = Boolean(traits?.fx?.family && traits.fx.family !== "other");
  if ((fxContradiction || softBokehStock) && !traitFxOk) gaps.push("fx");

  // 绘制/扁平角色：只要尚未探针确认技法桶，就补探。
  // 旧逻辑在已有 soft-shaded/anime 时跳过补探 → 错锁成 soft anime 后无法纠正 flat_cartoon。
  const drawnLike =
    /\b(illustration|anime|manga|sketch|comic|drawn|cartoon|flat\s+graphic|flat\s+vector|vector\s+character|マンガ|アニメ|线稿|卡通)\b/i.test(
      styleBlob
    ) || /illustration2d|^illustration$|^flat$/.test(String(traits?.medium || ""));
  const traitFinishOk = Boolean(
    traits?.finishTechnique?.technique &&
      traits.finishTechnique.technique !== "unknown" &&
      traits.finishTechnique.confidence !== "low"
  );
  if (drawnLike && !traitFinishOk) gaps.push("finish");

  return gaps;
}

/**
 * 反推墙钟超时（内部 abort reason，不可直接展示给用户）
 * @param {unknown} err
 */
export function isReverseWallClockError(err) {
  if (!err) return false;
  const msg = String(/** @type {{ message?: string }} */ (err).message || err);
  const cause = /** @type {{ cause?: { message?: string } }} */ (err).cause;
  const causeMsg = cause ? String(cause.message || cause) : "";
  return /budget wall clock/i.test(msg) || /budget wall clock/i.test(causeMsg);
}

/**
 * 补探是否值得瞬时重试（网络 / 5xx / 超时；非用户取消、非 4xx、非坏 JSON）
 * @param {unknown} err
 */
export function isTransientProbeError(err) {
  if (!err) return false;
  const name = String(/** @type {{ name?: string }} */ (err).name || "");
  const msg = String(/** @type {{ message?: string }} */ (err).message || err);
  // 用户取消或墙钟 Abort：不重试
  if (name === "AbortError") return false;
  if (isReverseWallClockError(err)) return false;
  // 鉴权 / 客户端错误
  if (/\b401\b|\b403\b|\b400\b|\b404\b|invalid.?api.?key|unauthorized/i.test(msg)) {
    return false;
  }
  // 坏 JSON / 空响应（业务失败）
  if (/no json object|modelEmpty|empty/i.test(msg)) return false;
  // 瞬时：5xx、网络、超时、fetch 失败
  if (/\b5\d\d\b|timeout|network|Failed to fetch|ECONNRESET|ETIMEDOUT|TypeError/i.test(msg)) {
    return true;
  }
  if (name === "TimeoutError") return true;
  if (name === "TypeError" && /fetch/i.test(msg)) return true;
  return false;
}

/** 单图反推结果缓存：素材哈希 + 设置指纹 → Pack（LRU） */

export const STORAGE_REVERSE_CACHE = "reverseCache";
export const REVERSE_CACHE_MAX = 24;
export const REVERSE_CACHE_QUOTA_MAX = 12;

/**
 * @param {{
 *   model?: string,
 *   baseUrl?: string,
 *   stylePreset?: string,
 *   promptLocale?: string,
 *   pipelineVersion?: string,
 *   promptFingerprint?: string,
 * }} s
 */
export function buildSettingsFingerprint(s = {}) {
  return [
    String(s.model || "").trim(),
    String(s.baseUrl || "").trim().replace(/\/$/, ""),
    String(s.stylePreset || "balanced").trim(),
    String(s.promptLocale || "en").trim(),
    // 算法升级自动失效：缺省空串时与旧 key 不兼容（显式要求调用方传入）
    String(s.pipelineVersion || "").trim(),
    String(s.promptFingerprint || "").trim(),
  ].join("|");
}

/** @param {string} assetHash @param {string} settingsFp */
export function buildCacheKey(assetHash, settingsFp) {
  return `${String(assetHash || "")}:${String(settingsFp || "")}`;
}

/** dataUrl → SHA-256 hex；失败抛错由调用方降级 */
export async function sha256HexFromDataUrl(dataUrl) {
  const raw = String(dataUrl || "");
  const comma = raw.indexOf(",");
  const b64 = comma >= 0 ? raw.slice(comma + 1) : raw;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {Record<string, { lastAccess?: number }>} entries
 * @param {number} max
 */
export function evictLru(entries, max) {
  const cap = Math.max(1, Number(max) || REVERSE_CACHE_MAX);
  const keys = Object.keys(entries || {});
  if (keys.length <= cap) return { ...(entries || {}) };
  const ranked = keys
    .map((k) => ({ k, t: Number(entries[k]?.lastAccess) || 0 }))
    .sort((a, b) => a.t - b.t);
  const drop = ranked.length - cap;
  const next = { ...entries };
  for (let i = 0; i < drop; i++) delete next[ranked[i].k];
  return next;
}

const memoryReverseCache = {};

async function readStore() {
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    const { [STORAGE_REVERSE_CACHE]: bag } = await chrome.storage.local.get(STORAGE_REVERSE_CACHE);
    const entries =
      bag && typeof bag === "object" && bag.entries && typeof bag.entries === "object"
        ? bag.entries
        : {};
    return /** @type {Record<string, object>} */ (entries);
  }
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_REVERSE_CACHE);
      const bag = raw ? JSON.parse(raw) : null;
      if (bag && typeof bag === "object" && bag.entries && typeof bag.entries === "object") {
        return /** @type {Record<string, object>} */ (bag.entries);
      }
    }
  } catch {
    /* ignore storage read errors */
  }
  return memoryReverseCache.entries && typeof memoryReverseCache.entries === "object"
    ? memoryReverseCache.entries
    : {};
}

async function writeStore(entries) {
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    await chrome.storage.local.set({
      [STORAGE_REVERSE_CACHE]: { entries },
    });
    return;
  }
  memoryReverseCache.entries = entries;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_REVERSE_CACHE, JSON.stringify({ entries }));
    }
  } catch {
    /* ignore storage quota errors */
  }
}

/** @param {string} cacheKey */
export async function getReverseCache(cacheKey) {
  try {
    const key = String(cacheKey || "");
    if (!key) return null;
    const entries = await readStore();
    const hit = entries[key];
    if (!hit || !hit.pack) return null;
    return hit;
  } catch (err) {
    console.warn("[PromptLens] reverse cache get failed:", err);
    return null;
  }
}

/** 命中后更新 lastAccess */
export async function touchReverseCache(cacheKey) {
  try {
    const key = String(cacheKey || "");
    const entries = await readStore();
    const hit = entries[key];
    if (!hit?.pack) return null;
    const now = Date.now();
    entries[key] = { ...hit, lastAccess: now };
    await writeStore(entries);
    return entries[key];
  } catch (err) {
    console.warn("[PromptLens] reverse cache touch failed:", err);
    return null;
  }
}

/**
 * @param {string} cacheKey
 * @param {{ pack: object, medium?: string, traits?: object|null, observation?: object|null, grounded?: boolean }} value
 */
export async function putReverseCache(cacheKey, value) {
  const key = String(cacheKey || "");
  if (!key || !value?.pack) return;
  const now = Date.now();
  const entry = {
    pack: value.pack,
    medium: value.medium != null ? String(value.medium).slice(0, 32) : "",
    traits: value.traits ?? null,
    observation: value.observation ?? null,
    grounded: true,
    ts: now,
    lastAccess: now,
  };

  const tryWrite = async (max, stripTraits) => {
    let entries = await readStore();
    entries[key] = stripTraits ? { ...entry, traits: null } : entry;
    entries = evictLru(entries, max);
    await writeStore(entries);
  };

  try {
    await tryWrite(REVERSE_CACHE_MAX, false);
  } catch (err) {
    console.warn("[PromptLens] reverse cache put quota, trim:", err);
    try {
      await tryWrite(REVERSE_CACHE_QUOTA_MAX, true);
    } catch (err2) {
      console.warn("[PromptLens] reverse cache put failed:", err2);
    }
  }
}

/**
 * 按素材哈希前缀删除缓存（删历史级联）
 * @param {string} assetHash
 * @returns {Promise<number>} 删除条数
 */
export async function removeReverseCacheByAssetHash(assetHash) {
  const prefix = String(assetHash || "").trim();
  if (!prefix || prefix.length < 16) return 0;
  try {
    const entries = await readStore();
    let n = 0;
    for (const key of Object.keys(entries)) {
      if (key === prefix || key.startsWith(`${prefix}:`)) {
        delete entries[key];
        n += 1;
      }
    }
    if (n) await writeStore(entries);
    return n;
  } catch (err) {
    console.warn("[PromptLens] reverse cache cascade delete failed:", err);
    return 0;
  }
}

/**
 * 远程拉取与 API 基址安全闸门（P1）
 */

export const REMOTE_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const REMOTE_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const REMOTE_IMAGE_TIMEOUT_MS = 15_000;
export const REMOTE_VIDEO_TIMEOUT_MS = 30_000;

/**
 * 合并超时与外部 AbortSignal
 * @param {number} ms
 * @param {AbortSignal} [outer]
 */
export function signalWithTimeout(ms, outer) {
  const timeoutMs = Math.max(1, Number(ms) || 1);
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    const timed = AbortSignal.timeout(timeoutMs);
    if (outer && typeof AbortSignal.any === "function") {
      return { signal: AbortSignal.any([outer, timed]), cancel: () => {} };
    }
    if (!outer) return { signal: timed, cancel: () => {} };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onOuter = () => ctrl.abort();
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener("abort", onOuter, { once: true });
  }
  return {
    signal: ctrl.signal,
    cancel: () => {
      clearTimeout(timer);
      if (outer) outer.removeEventListener("abort", onOuter);
    },
  };
}

/**
 * 允许的 API baseUrl：https，或本机 http
 * @param {string} baseUrl
 */
export function isAllowedApiBaseUrl(baseUrl) {
  try {
    const u = new URL(String(baseUrl || "").trim());
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:") {
      const host = u.hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * @param {Headers} headers
 * @param {"image"|"video"} kind
 */
export function contentTypeLooksOk(headers, kind) {
  const ct = String(headers?.get?.("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!ct) return true; // 部分 CDN 不回 Content-Type，稍后靠魔数/blob.type
  if (kind === "image") {
    return ct.startsWith("image/") || ct === "application/octet-stream";
  }
  return (
    ct.startsWith("video/") ||
    ct === "application/octet-stream" ||
    ct === "application/mp4"
  );
}

/**
 * @param {Headers} headers
 * @param {number} maxBytes
 */
export function contentLengthWithinLimit(headers, maxBytes) {
  const raw = headers?.get?.("content-length");
  if (raw == null || raw === "") return true;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return true;
  return n <= maxBytes;
}

/**
 * 魔数嗅探
 * @param {Uint8Array} bytes
 * @returns {"image"|"video"|""}
 */
export function sniffMediaKind(bytes) {
  if (!bytes || bytes.length < 12) return "";
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image";
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image";
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image";
  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image";
  }
  // MP4 / ISO BMFF: ....ftyp
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "video";
  // WebM / EBML
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video";
  return "";
}

/**
 * PNG / WebP（可能含透明）
 * @param {Blob} blob
 * @param {Uint8Array} [head]
 */
export function sourceLikelyHasAlpha(blob, head) {
  const type = String(blob?.type || "").toLowerCase();
  if (type.includes("png") || type.includes("webp")) return true;
  if (head && head.length >= 12) {
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true;
    if (
      head[0] === 0x52 &&
      head[1] === 0x49 &&
      head[2] === 0x46 &&
      head[3] === 0x46 &&
      head[8] === 0x57 &&
      head[9] === 0x45 &&
      head[10] === 0x42 &&
      head[11] === 0x50
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 带超时与字节上限读取 Response → Blob，并做 MIME/魔数校验
 * @param {Response} res
 * @param {{
 *   maxBytes: number,
 *   kind: "image"|"video",
 *   timeoutMs?: number,
 *   signal?: AbortSignal,
 * }} opts
 */
export async function readResponseBlobGuarded(res, opts) {
  const maxBytes = Math.max(1, Number(opts.maxBytes) || 1);
  const kind = opts.kind === "video" ? "video" : "image";
  if (!contentTypeLooksOk(res.headers, kind)) {
    const err = new Error(`MIME_REJECTED`);
    err.code = "MIME_REJECTED";
    throw err;
  }
  if (!contentLengthWithinLimit(res.headers, maxBytes)) {
    const err = new Error(`SIZE_LIMIT`);
    err.code = "SIZE_LIMIT";
    throw err;
  }

  const { signal, cancel } = signalWithTimeout(opts.timeoutMs || 15_000, opts.signal);
  try {
    if (!res.body || typeof res.body.getReader !== "function") {
      const blob = await res.blob();
      if (blob.size > maxBytes) {
        const err = new Error(`SIZE_LIMIT`);
        err.code = "SIZE_LIMIT";
        throw err;
      }
      await assertBlobKind(blob, kind);
      return blob;
    }

    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      if (signal.aborted) {
        const err = new Error("TIMEOUT");
        err.code = "TIMEOUT";
        throw err;
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          const err = new Error(`SIZE_LIMIT`);
          err.code = "SIZE_LIMIT";
          throw err;
        }
        chunks.push(value);
      }
    }
    const blob = new Blob(chunks, {
      type: String(res.headers.get("content-type") || "").split(";")[0].trim() || undefined,
    });
    await assertBlobKind(blob, kind);
    return blob;
  } finally {
    cancel();
  }
}

/**
 * @param {Blob} blob
 * @param {"image"|"video"} kind
 */
async function assertBlobKind(blob, kind) {
  const type = String(blob.type || "").toLowerCase();
  if (kind === "image" && type.startsWith("image/")) return;
  if (kind === "video" && (type.startsWith("video/") || type === "application/mp4")) return;

  const headBuf = await blob.slice(0, 16).arrayBuffer();
  const head = new Uint8Array(headBuf);
  const sniffed = sniffMediaKind(head);
  if (sniffed === kind) return;
  // 视频 CDN 常给空 type 且魔数不完整时放行过小头；仍拒绝明显的 image↔video 错配
  if (!type && !sniffed && kind === "video" && blob.size > 1024) return;
  const err = new Error(`MIME_REJECTED`);
  err.code = "MIME_REJECTED";
  throw err;
}

/**
 * PromptLens — 本地视频探测与关键帧抽取（侧栏 DOM / canvas）
 */

import {
  frameCountForDuration,
  VIDEO_HARD_DURATION_SEC,
} from "../background/vlm.js";

export const MAX_VIDEO_SHOTS = 6;
export const MAX_VLM_FRAMES = 12;
export const MAX_PROBE_FRAMES = 60;

/** 灰度缓冲平均绝对差 [0,1] */
export function meanAbsDiffGray(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (n * 255);
}

/**
 * 由探测分数找切点；threshold 默认 0.18
 * @param {{ t: number, score: number }[]} scores 相邻对：score 为 frame[i] vs frame[i-1]
 */
export function cutsFromProbeScores(scores, threshold = 0.18, minGapSec = 0.4) {
  const cuts = [];
  for (const row of scores) {
    if (row.score < threshold) continue;
    const t = row.t;
    if (cuts.length && t - cuts[cuts.length - 1] < minGapSec) {
      // 保留更强的一侧：简化为跳过过近点
      continue;
    }
    cuts.push(t);
  }
  return cuts;
}

/** cuts + duration → shotBounds（≤ maxShots，合并最短邻段） */
export function boundsFromCuts(durationSec, cuts, maxShots = MAX_VIDEO_SHOTS) {
  const dur = Math.max(0, Number(durationSec) || 0);
  const edges = [0, ...cuts.filter((t) => t > 0.05 && t < dur - 0.05).sort((a, b) => a - b), dur];
  let segs = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const tStart = edges[i];
    const tEnd = edges[i + 1];
    if (tEnd - tStart < 0.05) continue;
    segs.push({ tStart, tEnd });
  }
  if (!segs.length) segs = [{ tStart: 0, tEnd: dur || 0 }];
  while (segs.length > maxShots) {
    // 合并最短段与较短邻居
    let best = 0;
    let bestLen = Infinity;
    for (let i = 0; i < segs.length; i++) {
      const len = segs[i].tEnd - segs[i].tStart;
      if (len < bestLen) {
        bestLen = len;
        best = i;
      }
    }
    if (best === 0) {
      segs[1] = { tStart: segs[0].tStart, tEnd: segs[1].tEnd };
      segs.splice(0, 1);
    } else {
      segs[best - 1] = { tStart: segs[best - 1].tStart, tEnd: segs[best].tEnd };
      segs.splice(best, 1);
    }
  }
  return segs.map((s, i) => ({ index: i + 1, tStart: s.tStart, tEnd: s.tEnd }));
}

/** 每镜采样时间点：2 或 3 个 */
export function sampleTimesForShot(bound, preferThree = true) {
  const { tStart, tEnd } = bound;
  const len = Math.max(0, tEnd - tStart);
  if (len < 0.35 || !preferThree) {
    return [tStart, Math.max(tStart, tEnd - 0.05)];
  }
  return [tStart, tStart + len / 2, Math.max(tStart, tEnd - 0.05)];
}

/** 总帧 > max 时优先丢掉各镜 mid */
export function allocateShotSampleTimes(bounds, maxFrames = MAX_VLM_FRAMES) {
  let per = bounds.map((b) => sampleTimesForShot(b, true));
  const total = () => per.reduce((n, a) => n + a.length, 0);
  while (total() > maxFrames) {
    let shrunk = false;
    for (let i = 0; i < per.length; i++) {
      if (per[i].length === 3) {
        per[i] = [per[i][0], per[i][2]];
        shrunk = true;
        if (total() <= maxFrames) break;
      }
    }
    if (!shrunk) break;
  }
  // 仍超限：从末镜开始再砍到只留起点
  while (total() > maxFrames) {
    for (let i = per.length - 1; i >= 0 && total() > maxFrames; i--) {
      if (per[i].length > 1) per[i] = [per[i][0]];
    }
    break;
  }
  return per;
}

/** @param {string} url */
function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    const fail = () => reject(Object.assign(new Error("decode"), { code: "DECODE" }));
    video.onerror = fail;
    video.onloadedmetadata = () => resolve(video);
    video.src = url;
  });
}

/** 已在目标时间附近则无需等待 seeked */
const SEEK_EPS = 0.001;
/** seek 超时（毫秒），避免 seeked 永不触发导致挂死 */
const SEEK_TIMEOUT_MS = 5000;
/** 细采样时间去重间隔（秒） */
const SAMPLE_DEDUP_EPS = 0.04;

/** @param {HTMLVideoElement} video @param {number} t */
function seekTo(video, t) {
  return new Promise((resolve, reject) => {
    const dur = Number(video.duration) || 0;
    const target = Math.min(Math.max(0, t), Math.max(0, dur - 0.05));
    // 目标与当前时间几乎相同（常见首帧 t=0）：浏览器可能不触发 seeked
    if (Math.abs(video.currentTime - target) < SEEK_EPS) {
      resolve();
      return;
    }

    let settled = false;
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      clearTimeout(timer);
    };
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(arg);
    };
    const onSeeked = () => finish(resolve);
    const timer = setTimeout(() => {
      finish(reject, Object.assign(new Error("seek timeout"), { code: "EXTRACT" }));
    }, SEEK_TIMEOUT_MS);

    video.addEventListener("seeked", onSeeked);
    video.onerror = () =>
      finish(reject, Object.assign(new Error("seek"), { code: "EXTRACT" }));
    video.currentTime = target;
  });
}

/**
 * @param {HTMLVideoElement} video
 * @param {number} maxEdge
 * @param {number} quality
 */
function drawFrame(video, maxEdge, quality) {
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (vw < 2 || vh < 2) throw Object.assign(new Error("empty"), { code: "EXTRACT" });
  const scale = Math.min(1, maxEdge / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(video, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), width: w, height: h };
}

/**
 * 小画布抽取灰度缓冲（每隔 4 像素采样）
 * @param {HTMLVideoElement} video
 * @param {number} [maxEdge=160]
 * @returns {Uint8Array}
 */
function extractGrayBuffer(video, maxEdge = 160) {
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (vw < 2 || vh < 2) throw Object.assign(new Error("empty"), { code: "EXTRACT" });
  const scale = Math.min(1, maxEdge / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const step = 4;
  const gray = new Uint8Array(Math.ceil((w * h) / step));
  let j = 0;
  for (let i = 0; i < w * h; i += step) {
    const p = i * 4;
    // 简单亮度近似
    gray[j++] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0;
  }
  return gray.length === j ? gray : gray.subarray(0, j);
}

/**
 * 探测视频元数据（时长与分辨率）
 * @param {string} url
 * @returns {Promise<{ durationSec: number, width: number, height: number }>}
 */
export async function probeVideo(url) {
  const video = await loadVideo(url);
  const durationSec = Number(video.duration) || 0;
  const width = video.videoWidth || 0;
  const height = video.videoHeight || 0;
  video.removeAttribute("src");
  video.load();
  return { durationSec, width, height };
}

/**
 * 切点感知关键帧抽取：粗探测 → 分镜 → 每镜细采样
 * @param {string} url
 * @param {{ maxEdge?: number, quality?: number, onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {Promise<{
 *   frames: string[],
 *   frameMeta: { t: number, shotIndex: number }[],
 *   shotBounds: { index: number, tStart: number, tEnd: number }[],
 *   cuts: number[],
 *   durationSec: number,
 *   width: number,
 *   height: number,
 *   posterDataUrl: string
 * }>}
 */
export async function extractKeyframes(url, opts = {}) {
  const maxEdge = opts.maxEdge ?? 1280;
  const quality = opts.quality ?? 0.85;
  const video = await loadVideo(url);
  const durationSec = Number(video.duration) || 0;
  if (durationSec > VIDEO_HARD_DURATION_SEC) {
    video.removeAttribute("src");
    video.load();
    throw Object.assign(new Error("too long"), { code: "TOO_LONG", durationSec });
  }

  const frames = [];
  /** @type {{ t: number, shotIndex: number }[]} */
  let frameMeta = [];
  /** @type {{ index: number, tStart: number, tEnd: number }[]} */
  let shotBounds = [];
  /** @type {number[]} */
  let cuts = [];
  let width = 0;
  let height = 0;

  try {
    // 粗探测：均匀时间点上的帧间灰度差
    const probeCount = Math.min(
      MAX_PROBE_FRAMES,
      Math.max(8, Math.ceil(durationSec / 0.75))
    );
    const probeTimes = [];
    if (probeCount <= 1) probeTimes.push(0);
    else {
      for (let i = 0; i < probeCount; i++) {
        probeTimes.push((durationSec * i) / (probeCount - 1));
      }
    }

    /** @type {{ t: number, score: number }[]} */
    const scores = [];
    let prevGray = null;
    for (let i = 0; i < probeTimes.length; i++) {
      await seekTo(video, probeTimes[i]);
      const gray = extractGrayBuffer(video, 160);
      if (prevGray) {
        scores.push({ t: probeTimes[i], score: meanAbsDiffGray(gray, prevGray) });
      }
      prevGray = gray;
    }

    cuts = cutsFromProbeScores(scores);
    // 短片且无切点：单镜；否则按切点合并为 ≤6 镜
    if (durationSec <= 10 && cuts.length === 0) {
      shotBounds = [{ index: 1, tStart: 0, tEnd: durationSec }];
    } else {
      shotBounds = boundsFromCuts(durationSec, cuts);
    }

    let perTimes = allocateShotSampleTimes(shotBounds, MAX_VLM_FRAMES);
    // 单镜回退：按旧时长规则补到更均匀的帧数（不超过上限）
    if (shotBounds.length === 1) {
      const n = Math.min(MAX_VLM_FRAMES, frameCountForDuration(durationSec));
      if (n > (perTimes[0]?.length || 0)) {
        const times = [];
        if (n <= 1) times.push(0);
        else {
          for (let i = 0; i < n; i++) times.push((durationSec * i) / (n - 1));
        }
        perTimes = [times];
      }
    }

    /** @type {{ t: number, shotIndex: number }[]} */
    let samples = [];
    for (let i = 0; i < perTimes.length; i++) {
      const shotIndex = shotBounds[i].index;
      for (const t of perTimes[i]) {
        samples.push({ t, shotIndex });
      }
    }
    samples.sort((a, b) => a.t - b.t);

    // 近邻时间去重，保留先出现的
    const deduped = [];
    for (const s of samples) {
      if (deduped.length && Math.abs(s.t - deduped[deduped.length - 1].t) < SAMPLE_DEDUP_EPS) {
        continue;
      }
      deduped.push(s);
    }
    samples = deduped;

    // 保证整段首尾帧存在
    const lastShotIndex = shotBounds[shotBounds.length - 1]?.index || 1;
    const endT = Math.max(0, durationSec - 0.05);
    if (!samples.length || samples[0].t > SAMPLE_DEDUP_EPS) {
      samples.unshift({ t: 0, shotIndex: 1 });
    }
    const lastSample = samples[samples.length - 1];
    if (
      !samples.length ||
      (Math.abs(lastSample.t - endT) > SAMPLE_DEDUP_EPS &&
        Math.abs(lastSample.t - durationSec) > SAMPLE_DEDUP_EPS)
    ) {
      samples.push({ t: endT, shotIndex: lastShotIndex });
    }

    // 注入后仍不超过上限
    while (samples.length > MAX_VLM_FRAMES) {
      // 优先去掉中间点（保留首尾）
      if (samples.length <= 2) break;
      samples.splice(Math.floor(samples.length / 2), 1);
    }

    const totalFine = samples.length;
    for (let i = 0; i < samples.length; i++) {
      await seekTo(video, samples[i].t);
      const shot = drawFrame(video, maxEdge, quality);
      frames.push(shot.dataUrl);
      frameMeta.push({ t: samples[i].t, shotIndex: samples[i].shotIndex });
      width = shot.width;
      height = shot.height;
      opts.onProgress?.(i + 1, totalFine);
    }
  } catch (err) {
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
      code: err?.code || "EXTRACT",
    });
  } finally {
    video.removeAttribute("src");
    video.load();
  }

  if (!frames.length) throw Object.assign(new Error("no frames"), { code: "EXTRACT" });

  // 海报：优先最长镜的中间帧，否则用全局中位帧
  let longestIdx = 0;
  let longestLen = -1;
  for (let i = 0; i < shotBounds.length; i++) {
    const len = shotBounds[i].tEnd - shotBounds[i].tStart;
    if (len > longestLen) {
      longestLen = len;
      longestIdx = i;
    }
  }
  const longestShotIndex = shotBounds[longestIdx]?.index;
  const longestFrameIdxs = [];
  for (let i = 0; i < frameMeta.length; i++) {
    if (frameMeta[i].shotIndex === longestShotIndex) longestFrameIdxs.push(i);
  }
  const posterIdx =
    longestFrameIdxs.length > 0
      ? longestFrameIdxs[Math.floor(longestFrameIdxs.length / 2)]
      : Math.floor(frames.length / 2);
  const posterDataUrl = frames[posterIdx] || frames[0];

  return {
    frames,
    frameMeta,
    shotBounds,
    cuts,
    durationSec,
    width,
    height,
    posterDataUrl,
  };
}

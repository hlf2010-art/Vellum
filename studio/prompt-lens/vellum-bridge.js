/**
 * Vellum <-> PromptLens headless bridge.
 * Imports only pure ESM + browser Web API modules (no chrome.* dependencies).
 */

import {
  reversePrompt,
  reprobeField,
  formatPackForExport,
  formatPackForCopy,
  setCustomVlmCompleter,
  hasCustomVlmCompleter,
  EXPORT_PLATFORMS,
} from "./background/vlm.js";
import { compilePackFromObservation, lightNormalizePack } from "./background/pack-compiler.js";
import { decomposeObservation } from "./background/decompose-observation.js";
import { diffObservation } from "./background/observation-diff.js";
import {
  extractKeyframes,
  probeVideo,
  cutsFromProbeScores,
  boundsFromCuts,
  meanAbsDiffGray,
} from "./sidepanel/video-frames.js";

export const IMAGE_DIALECTS = [
  { id: "generic", label: "Universal" },
  { id: "flux", label: "Flux" },
  { id: "midjourney", label: "Midjourney" },
  { id: "gptImage", label: "GPT Image" },
  { id: "gemini", label: "Gemini" },
  { id: "seedream", label: "Seedream" },
  { id: "wanx", label: "Wanx" },
];

export const VIDEO_DIALECTS = [
  { id: "kling", label: "Kling" },
  { id: "wanxVideo", label: "Wanx Video" },
  { id: "seedance", label: "Seedance" },
];

export function setVellumCompleter(fn) {
  setCustomVlmCompleter(fn);
}

export function isVellumCompleterReady() {
  return hasCustomVlmCompleter();
}

export async function reverseImageCard({
  dataUrl,
  promptLocale = "en",
  stylePreset = "balanced",
  width = 0,
  height = 0,
  skipCache = false,
  medium,
  budget,
  onProgress,
  signal,
  apiKey = "vellum-bridge",
  baseUrl,
  model,
} = {}) {
  return await reversePrompt({
    apiKey,
    baseUrl,
    model,
    dataUrl,
    locale: promptLocale === "zh-CN" ? "zh-CN" : "en",
    promptLocale,
    stylePreset,
    width,
    height,
    skipCache,
    medium,
    budget,
    onProgress,
    signal,
  });
}

export async function reprobeImageField({
  dataUrl,
  field,
  currentObservation,
  promptLocale = "en",
  width = 0,
  height = 0,
  signal,
  apiKey = "vellum-bridge",
  baseUrl,
  model,
} = {}) {
  return await reprobeField({
    apiKey,
    baseUrl,
    model,
    dataUrl,
    field,
    currentObservation,
    locale: promptLocale === "zh-CN" ? "zh-CN" : "en",
    promptLocale,
    width,
    height,
    signal,
  });
}

export function exportPromptDialect(pack, platform = "generic", weights = {}) {
  if (!pack || typeof pack !== "object") return { platform: "generic", text: "", copyText: "" };
  const safePlatform = EXPORT_PLATFORMS[platform] ? platform : "generic";
  const text = formatPackForExport(pack, { platform: safePlatform, weights });
  const copyText = formatPackForCopy(pack);
  return { platform: safePlatform, text, copyText };
}

export function compileFromObservation(observation, opts = {}) {
  return lightNormalizePack(compilePackFromObservation(observation, opts));
}

export {
  EXPORT_PLATFORMS,
  decomposeObservation,
  diffObservation,
  extractKeyframes,
  probeVideo,
  cutsFromProbeScores,
  boundsFromCuts,
  meanAbsDiffGray,
};

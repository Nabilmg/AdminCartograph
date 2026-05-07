/**
 * Classification helpers — turn an array of numeric values into a list of
 * class break thresholds suitable for a 5-class choropleth.
 *
 * Quantile: roughly equal counts per class (omits null/NaN).
 * Equal:    equally spaced between min and max.
 * Manual:   user-supplied list of breaks.
 */
import type { Classification } from "../settings";

export interface ClassBreaks {
  /** N-1 thresholds for N classes, sorted ascending. */
  breaks: number[];
  min: number;
  max: number;
  classCount: number;
}

export function buildBreaks(values: number[], method: Classification, classCount: number, manualText: string): ClassBreaks {
  const finite = values.filter((v) => Number.isFinite(v)) as number[];
  if (finite.length === 0) return { breaks: [], min: 0, max: 0, classCount: 0 };
  const sorted = finite.slice().sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const k = Math.max(2, Math.min(7, Math.floor(classCount || 5)));

  if (method === "manual") {
    const parsed = parseManual(manualText);
    if (parsed.length) return { breaks: parsed, min, max, classCount: parsed.length + 1 };
  }
  if (method === "equal") {
    const step = (max - min) / k;
    const breaks: number[] = [];
    for (let i = 1; i < k; i++) breaks.push(min + step * i);
    return { breaks, min, max, classCount: k };
  }
  // quantile
  const breaks: number[] = [];
  for (let i = 1; i < k; i++) {
    const q = (i / k) * (sorted.length - 1);
    const lo = Math.floor(q);
    const hi = Math.ceil(q);
    breaks.push(lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (q - lo));
  }
  return { breaks: dedupe(breaks), min, max, classCount: k };
}

export function classIndex(breaks: number[], value: number): number {
  for (let i = 0; i < breaks.length; i++) if (value < breaks[i]) return i;
  return breaks.length;
}

function parseManual(text: string): number[] {
  if (!text) return [];
  return text.split(/[\s,;]+/).map((t) => Number(t.trim())).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
}

function dedupe(arr: number[]): number[] {
  const out: number[] = [];
  for (const v of arr) if (out.length === 0 || v > out[out.length - 1]) out.push(v);
  return out;
}

/**
 * Generates a sequential color ramp from a base color (white -> base) when the
 * user picks "automatic" mode. Otherwise the user supplies the colors directly.
 */
export function rampColors(baseColor: string, n: number): string[] {
  const base = parseHex(baseColor) || { r: 31, g: 119, b: 180 };
  const white = { r: 255, g: 255, b: 255 };
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : (i + 1) / n; // skip pure white at index 0
    const r = Math.round(white.r + (base.r - white.r) * t);
    const g = Math.round(white.g + (base.g - white.g) * t);
    const b = Math.round(white.b + (base.b - white.b) * t);
    out.push(toHex(r, g, b));
  }
  return out;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = hex.replace(/^#/, "");
  if (m.length === 3) {
    return { r: parseInt(m[0] + m[0], 16), g: parseInt(m[1] + m[1], 16), b: parseInt(m[2] + m[2], 16) };
  }
  if (m.length === 6) {
    return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
  }
  return null;
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

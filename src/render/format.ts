/**
 * Number formatting helpers used by labels and legends. The host's locale-aware
 * formatter is preferred when available; we fall back to toLocaleString.
 */
import type { LabelFormat } from "../settings";

export function formatNumber(value: number | null, decimals: number, fmt: LabelFormat): string {
  if (value == null || !Number.isFinite(value)) return "";
  const d = Math.max(0, Math.min(6, decimals | 0));
  switch (fmt) {
    case "thousands":
      return scale(value, 1e3, "K", d);
    case "millions":
      return scale(value, 1e6, "M", d);
    case "percent":
      return `${(value * 100).toFixed(d)}%`;
    case "auto":
    default:
      if (Math.abs(value) >= 1e9) return scale(value, 1e9, "B", d);
      if (Math.abs(value) >= 1e6) return scale(value, 1e6, "M", d);
      if (Math.abs(value) >= 1e3) return scale(value, 1e3, "K", d);
      return value.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }
}

function scale(value: number, divisor: number, suffix: string, decimals: number): string {
  return `${(value / divisor).toFixed(decimals)}${suffix}`;
}

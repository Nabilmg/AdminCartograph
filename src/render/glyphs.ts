/**
 * Glyph chart layer: pie / donut / column chart per area, sized by total
 * (or fixed) and coloured per category.
 *
 * Each polygon gets one glyph anchored at its interior centroid (pole of
 * inaccessibility), so the same anchor logic the bubbles use places these
 * glyphs in a visually sensible spot. Glyphs use pointer-events: none so
 * clicks pass through to the underlying choropleth path for drill /
 * selection.
 */
import * as d3 from "d3";
import type { GeoProjection } from "d3-geo";
import { pickAnchor } from "./labelPlacement";
import type { AreaDatum } from "../types";

export type GlyphType = "pie" | "donut" | "column" | "concentric";

export interface GlyphStyle {
  show: boolean;
  type: GlyphType;
  /** Min / max glyph size in px (pie+donut: radius; column: total height). */
  minSize: number;
  maxSize: number;
  /** When true, the glyph's overall size scales with the sum of its values
   *  per area (bigger total = bigger pie). When false, every glyph uses
   *  maxSize. */
  scaleByTotal: boolean;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  /** Inner-radius / outer-radius ratio for "donut" type (0 = pie). */
  donutInnerRatio: number;
  /** Color per category, in the same order as glyph values come in. */
  colors: string[];
  /** When true, each glyph is wrapped with translate(cx,cy) +
   *  scale(1/zoom) so it keeps its authored on-screen size as the
   *  user zooms. Default true to match the bubble layer. */
  constantSize: boolean;
}

export interface GlyphAnchor {
  x: number;
  y: number;
  /** Bounding-box half-extent of the glyph in px (radius for pie/donut,
   *  half the column-chart's max height). Used to position labels next
   *  to the glyph. */
  size: number;
  values: number[];
}

export interface GlyphResult {
  anchors: Map<string, GlyphAnchor>;
}

export function renderGlyphs(
  parent: SVGGElement,
  projection: GeoProjection,
  features: any[],
  areaByPcode: Map<string, AreaDatum>,
  pcodeKey: "ADM1_PCODE" | "ADM2_PCODE",
  style: GlyphStyle,
  currentZoom: number = 1
): GlyphResult | null {
  const sel = d3.select(parent);
  sel.selectAll("*").remove();
  if (!style.show) return null;

  // Glyphs are decorative — clicks pass through to the choropleth below
  // so drill / cross-filter still works when the cursor is on a glyph.
  sel.attr("pointer-events", "none");

  // Pick which features have glyph data.
  const valued = features
    .map((f) => {
      const code = f.properties?.[pcodeKey];
      if (!code) return null;
      const datum = areaByPcode.get(code);
      if (!datum || !datum.glyphValues || !datum.glyphValues.length) return null;
      const total = datum.glyphValues.reduce((a, b) => a + (b > 0 ? b : 0), 0);
      if (total <= 0) return null;
      const anchorGeo = pickAnchor(f.geometry, { largestPartOnly: true, avoidHoles: false });
      if (!anchorGeo) return null;
      const projected = projection(anchorGeo as [number, number]);
      if (!projected) return null;
      return { feature: f, datum, anchor: projected as [number, number], total };
    })
    .filter(Boolean) as { feature: any; datum: AreaDatum; anchor: [number, number]; total: number }[];

  if (!valued.length) return { anchors: new Map() };

  // Size scale. Square-root keeps perceived area proportional to total.
  const minTotal = Math.min(...valued.map((v) => v.total));
  const maxTotal = Math.max(...valued.map((v) => v.total));
  const scale = (total: number) => {
    if (!style.scaleByTotal || maxTotal === minTotal) return style.maxSize;
    const t = Math.sqrt(Math.max(0, total - minTotal)) / Math.sqrt(Math.max(1e-9, maxTotal - minTotal));
    return style.minSize + (style.maxSize - style.minSize) * t;
  };

  // Largest first so smaller glyphs sit on top.
  valued.sort((a, b) => b.total - a.total);

  const anchors = new Map<string, GlyphAnchor>();

  for (const v of valued) {
    const size = scale(v.total);
    // Per-glyph wrapper carries position + counter-zoom transform so a
    // later zoom step can rebuild the transform via updateGlyphTransforms
    // without recomputing the glyph's children. Glyph children are
    // drawn at (0,0) inside the wrapper.
    const g = sel.append("g").attr("class", "map-glyph");
    g.attr("data-anchor-x", String(v.anchor[0]));
    g.attr("data-anchor-y", String(v.anchor[1]));
    if (style.constantSize) g.attr("data-constant-size", "1");
    applyGlyphTransform(g.node() as SVGGElement, currentZoom);
    if (style.type === "pie" || style.type === "donut") {
      drawPie(g, 0, 0, size, v.datum.glyphValues, style);
    } else if (style.type === "concentric") {
      drawConcentric(g, 0, 0, size, v.datum.glyphValues, style);
    } else {
      drawColumn(g, 0, 0, size, v.datum.glyphValues, style);
    }
    // size has same semantics for both kinds: half the bbox extent.
    // Pie/donut/concentric: outer radius. Column: half of total height.
    anchors.set(v.datum.pcode, {
      x: v.anchor[0],
      y: v.anchor[1],
      size: style.type === "column" ? size / 2 : size,
      values: v.datum.glyphValues
    });
  }

  return { anchors };
}

function drawPie(parent: any, cx: number, cy: number, radius: number, values: number[], style: GlyphStyle) {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return;
  const innerRatio = style.type === "donut"
    ? Math.max(0, Math.min(0.85, style.donutInnerRatio || 0.5))
    : 0;
  const innerRadius = radius * innerRatio;
  let startAngle = -Math.PI / 2; // 12 o'clock
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(0, values[i]);
    if (v <= 0) continue;
    const sliceAngle = (v / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;
    const path = arcPath(cx, cy, innerRadius, radius, startAngle, endAngle);
    parent.append("path")
      .attr("d", path)
      .attr("fill", style.colors[i % style.colors.length] || "#888")
      .attr("fill-opacity", style.opacity)
      .attr("stroke", style.stroke)
      .attr("stroke-width", style.strokeWidth);
    startAngle = endAngle;
  }
}

/**
 * Concentric circles: one circle per measure, all sharing (cx, cy).
 * Each circle's radius is proportional to sqrt(value / peak) so the
 * AREA is proportional (matches the bubble layer's convention).
 * Drawn largest-first so smaller circles sit on top and stay visible.
 * Stroke colour is the matching category colour from `style.colors`.
 */
function drawConcentric(parent: any, cx: number, cy: number, outerRadius: number, values: number[], style: GlyphStyle) {
  const positives = values.map((v) => Math.max(0, v));
  const peak = Math.max(...positives, 0);
  if (peak <= 0) return;
  // Pair value with its original index so colours stay consistent
  // with the legend after we sort by value below.
  const indexed = positives.map((v, i) => ({ v, i })).filter((p) => p.v > 0);
  indexed.sort((a, b) => b.v - a.v);
  for (const { v, i } of indexed) {
    const r = outerRadius * Math.sqrt(v / peak);
    if (r <= 0) continue;
    parent.append("circle")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", r)
      .attr("fill", style.colors[i % style.colors.length] || "#888")
      .attr("fill-opacity", style.opacity)
      .attr("stroke", style.stroke)
      .attr("stroke-width", style.strokeWidth);
  }
}

function drawColumn(parent: any, cx: number, cy: number, totalHeight: number, values: number[], style: GlyphStyle) {
  // Each value is its own column; columns stand next to each other on a
  // baseline at cy. Width per column scales so the whole glyph stays
  // around totalHeight in pixels (square-ish footprint).
  const positives = values.map((v) => Math.max(0, v));
  const peak = Math.max(...positives, 0);
  if (peak <= 0) return;
  const colW = Math.max(2, totalHeight * 0.18);
  const gap = Math.max(1, totalHeight * 0.08);
  const totalW = positives.length * colW + (positives.length - 1) * gap;
  const x0 = cx - totalW / 2;
  const baselineY = cy + totalHeight / 2;
  for (let i = 0; i < positives.length; i++) {
    const h = (positives[i] / peak) * totalHeight;
    if (h <= 0) continue;
    const x = x0 + i * (colW + gap);
    parent.append("rect")
      .attr("x", x)
      .attr("y", baselineY - h)
      .attr("width", colW)
      .attr("height", h)
      .attr("fill", style.colors[i % style.colors.length] || "#888")
      .attr("fill-opacity", style.opacity)
      .attr("stroke", style.stroke)
      .attr("stroke-width", style.strokeWidth);
  }
}

function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const x0o = cx + r1 * Math.cos(a0);
  const y0o = cy + r1 * Math.sin(a0);
  const x1o = cx + r1 * Math.cos(a1);
  const y1o = cy + r1 * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  if (r0 <= 0) {
    return `M ${cx},${cy} L ${x0o},${y0o} A ${r1},${r1} 0 ${large} 1 ${x1o},${y1o} Z`;
  }
  const x0i = cx + r0 * Math.cos(a1);
  const y0i = cy + r0 * Math.sin(a1);
  const x1i = cx + r0 * Math.cos(a0);
  const y1i = cy + r0 * Math.sin(a0);
  return `M ${x0o},${y0o} A ${r1},${r1} 0 ${large} 1 ${x1o},${y1o} L ${x0i},${y0i} A ${r0},${r0} 0 ${large} 0 ${x1i},${y1i} Z`;
}

/** Build a per-glyph transform from data-* attributes. translate(cx,cy)
 *  + scale(1/zoom) when constantSize is on. Same shape as the bubble
 *  layer's applyBubbleTransform. */
function applyGlyphTransform(g: SVGGElement, zoom: number): void {
  const x = parseFloat(g.getAttribute("data-anchor-x") || "0");
  const y = parseFloat(g.getAttribute("data-anchor-y") || "0");
  const constant = g.getAttribute("data-constant-size") === "1";
  const s = constant && zoom > 0 ? 1 / zoom : 1;
  g.setAttribute("transform", s !== 1 ? `translate(${x},${y}) scale(${s})` : `translate(${x},${y})`);
}

/** Walk the glyph layer and re-apply per-glyph transforms with the
 *  given zoom level. Mirrors updateBubbleTransforms / updateLabel-
 *  Transforms — used so zoom steps update glyph size without
 *  re-running the full glyph layout. */
export function updateGlyphTransforms(parent: SVGGElement, zoom: number): void {
  if (!parent) return;
  const groups = parent.querySelectorAll<SVGGElement>(":scope > g.map-glyph, :scope g.map-glyph");
  groups.forEach((g) => applyGlyphTransform(g, zoom));
}

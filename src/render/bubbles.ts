/**
 * Renders proportional bubbles. Square-root scaling keeps perceived size
 * proportional to value. Operates on UNPROJECTED features — we use the
 * supplied projection to convert anchors to screen coords.
 */
import * as d3 from "d3";
import type { GeoProjection } from "d3-geo";
import { pickAnchor } from "./labelPlacement";
import type { AreaDatum } from "../types";

export interface BubbleStyle {
  show: boolean;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  minRadius: number;
  maxRadius: number;
  /** When true, each bubble is wrapped with a translate(cx,cy) +
   *  scale(1/zoom) transform so it keeps its original on-screen size
   *  as the user zooms. Default true. */
  constantSize: boolean;
}

export interface BubbleAnchor {
  x: number;
  y: number;
  /** Bubble radius in screen pixels. */
  r: number;
}

export interface BubbleResult {
  minValue: number;
  maxValue: number;
  scale: (v: number) => number;
  /** Anchor (in screen px) keyed by the same pcode the labels look up. */
  anchors: Map<string, BubbleAnchor>;
  /** Most-common fill / stroke colour actually painted on screen.
   *  Equal to the static card values when no conditional formatting
   *  rule is bound; otherwise it's the most-frequent rule-resolved
   *  colour across visible bubbles, which is what the bubble legend
   *  should show so the swatch doesn't lie about what the user is
   *  looking at. */
  effectiveFillColor: string;
  effectiveStrokeColor: string;
}

export function renderBubbles(
  parent: SVGGElement,
  projection: GeoProjection,
  features: any[],
  areaByPcode: Map<string, AreaDatum>,
  pcodeKey: "ADM1_PCODE" | "ADM2_PCODE",
  style: BubbleStyle,
  ruleColorsByPcode?: Map<string, Map<string, Map<string, string>>>,
  currentZoom: number = 1
): BubbleResult | null {
  const sel = d3.select(parent);
  sel.selectAll("*").remove();
  if (!style.show) return null;

  const valued = features
    .map((f) => {
      const code = f.properties && f.properties[pcodeKey];
      if (!code) return null;
      const datum = areaByPcode.get(code);
      if (!datum || datum.bubbleSize == null) return null;
      const anchorGeo = pickAnchor(f.geometry, { largestPartOnly: true, avoidHoles: false });
      if (!anchorGeo) return null;
      const projected = projection(anchorGeo as [number, number]);
      if (!projected) return null;
      return { feature: f, datum, anchor: projected as [number, number] };
    })
    .filter(Boolean) as { feature: any; datum: AreaDatum; anchor: [number, number] }[];

  if (!valued.length) return null;

  const values = valued.map((v) => v.datum.bubbleSize as number);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const scale = (v: number) => {
    if (maxV === minV) return (style.minRadius + style.maxRadius) / 2;
    const t = Math.sqrt(Math.max(0, v - minV)) / Math.sqrt(Math.max(1e-9, maxV - minV));
    return style.minRadius + (style.maxRadius - style.minRadius) * t;
  };

  // Largest-first painting so smaller bubbles sit on top.
  valued.sort((a, b) => (b.datum.bubbleSize as number) - (a.datum.bubbleSize as number));

  // Bubbles are decorative — pointer-events: none lets clicks fall through
  // to the underlying Admin1 / Admin2 polygon so drill / selection still
  // works when the user clicks on a bubble.
  sel.attr("pointer-events", "none");

  const anchors = new Map<string, BubbleAnchor>();
  // Tally the colours actually painted so the legend can report the
  // most-common one when conditional formatting is in play.
  const fillTally = new Map<string, number>();
  const strokeTally = new Map<string, number>();
  for (const v of valued) {
    const r = scale(v.datum.bubbleSize as number);
    // Per-bubble fx overrides: rule wins over the static card value.
    const rule = ruleColorsByPcode?.get(v.datum.pcode)?.get("bubbles");
    const fillColor = rule?.get("fillColor") || style.fillColor;
    const strokeColor = rule?.get("strokeColor") || style.strokeColor;
    fillTally.set(fillColor, (fillTally.get(fillColor) || 0) + 1);
    strokeTally.set(strokeColor, (strokeTally.get(strokeColor) || 0) + 1);
    // Per-bubble group with the position + counter-zoom transform so a
    // later zoom step can rebuild the transform via updateBubble-
    // Transforms without recomputing scaled radii. data-anchor-x/y are
    // the projected (pre-zoom) screen coords; data-constant-size is
    // the current toggle state.
    const g = sel.append("g").attr("class", "map-bubble");
    g.attr("data-anchor-x", String(v.anchor[0]));
    g.attr("data-anchor-y", String(v.anchor[1]));
    if (style.constantSize) g.attr("data-constant-size", "1");
    applyBubbleTransform(g.node() as SVGGElement, currentZoom);
    g.append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", r)
      .attr("fill", fillColor)
      .attr("fill-opacity", style.opacity)
      .attr("stroke", strokeColor)
      .attr("stroke-width", style.strokeWidth)
      .attr("data-pcode", v.datum.pcode);
    anchors.set(v.datum.pcode, { x: v.anchor[0], y: v.anchor[1], r });
  }

  const mostCommon = (m: Map<string, number>, fallback: string): string => {
    let bestKey = fallback;
    let bestN = 0;
    m.forEach((n, k) => { if (n > bestN) { bestN = n; bestKey = k; } });
    return bestKey;
  };
  return {
    minValue: minV,
    maxValue: maxV,
    scale,
    anchors,
    effectiveFillColor: mostCommon(fillTally, style.fillColor),
    effectiveStrokeColor: mostCommon(strokeTally, style.strokeColor)
  };
}

/** Build a per-bubble transform from data-* attributes. translate(cx,cy)
 *  + scale(1/zoom) when constantSize is on. */
function applyBubbleTransform(g: SVGGElement, zoom: number): void {
  const x = parseFloat(g.getAttribute("data-anchor-x") || "0");
  const y = parseFloat(g.getAttribute("data-anchor-y") || "0");
  const constant = g.getAttribute("data-constant-size") === "1";
  const s = constant && zoom > 0 ? 1 / zoom : 1;
  g.setAttribute("transform", s !== 1 ? `translate(${x},${y}) scale(${s})` : `translate(${x},${y})`);
}

/** Walk the bubble layer and re-apply per-bubble transforms with the
 *  given zoom level. Mirrors updateLabelTransforms — used so zoom
 *  steps update bubble size without re-running the full render. */
export function updateBubbleTransforms(parent: SVGGElement, zoom: number): void {
  if (!parent) return;
  const groups = parent.querySelectorAll<SVGGElement>(":scope > g.map-bubble, :scope g.map-bubble");
  groups.forEach((g) => applyBubbleTransform(g, zoom));
}

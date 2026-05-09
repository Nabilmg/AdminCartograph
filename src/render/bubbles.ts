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
}

export function renderBubbles(
  parent: SVGGElement,
  projection: GeoProjection,
  features: any[],
  areaByPcode: Map<string, AreaDatum>,
  pcodeKey: "ADM1_PCODE" | "ADM2_PCODE",
  style: BubbleStyle,
  ruleColorsByPcode?: Map<string, Map<string, Map<string, string>>>
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
  for (const v of valued) {
    const r = scale(v.datum.bubbleSize as number);
    // Per-bubble fx overrides: rule wins over the static card value.
    const rule = ruleColorsByPcode?.get(v.datum.pcode)?.get("bubbles");
    const fillColor = rule?.get("fillColor") || style.fillColor;
    const strokeColor = rule?.get("strokeColor") || style.strokeColor;
    sel.append("circle")
      .attr("cx", v.anchor[0])
      .attr("cy", v.anchor[1])
      .attr("r", r)
      .attr("fill", fillColor)
      .attr("fill-opacity", style.opacity)
      .attr("stroke", strokeColor)
      .attr("stroke-width", style.strokeWidth)
      .attr("data-pcode", v.datum.pcode);
    anchors.set(v.datum.pcode, { x: v.anchor[0], y: v.anchor[1], r });
  }

  return { minValue: minV, maxValue: maxV, scale, anchors };
}

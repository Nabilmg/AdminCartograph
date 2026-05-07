/**
 * Label engine. Iterates over polygons, picks an interior anchor, formats the
 * label, and draws halo + foreground text. Operates on UNPROJECTED features —
 * we use the supplied d3 path/projection to convert anchors to screen coords.
 *
 * Honors a subset of the spec's placement options: anchor choice, largest
 * polygon part, abbreviation when not fitting, halo, words on separate lines,
 * stack-when-needed, reduce-font-size, spread-characters.
 */
import * as d3 from "d3";
import type { GeoPath, GeoProjection } from "d3-geo";
import { pickAnchor, fitsInside } from "./labelPlacement";
import { formatNumber } from "./format";
import type { LabelContent, LabelFormat } from "../settings";

export interface LabelStyle {
  show: boolean;
  content: LabelContent;
  fontFamily: string;
  fontSize: number;
  color: string;
  valueColor: string;
  bold: boolean;
  italic: boolean;
  haloColor: string;
  haloWidth: number;
  decimals: number;
  format: LabelFormat;
  placement: "horizontal" | "straight" | "curved" | "boundary";
  wordsOnSeparateLines: boolean;
  stackWhenNeeded: boolean;
  reduceFontSize: boolean;
  allowOverrun: boolean;
  abbreviate: boolean;
  spreadCharacters: boolean;
  avoidHoles: boolean;
  labelLargestPart: boolean;
  allowCallout: boolean;
}

export interface LabelDatum {
  feature: any;
  name: string;
  value: number | null;
  value2?: number | null;
}

export function renderLabels(parent: SVGGElement, projection: GeoProjection, path: GeoPath, labels: LabelDatum[], style: LabelStyle): void {
  const sel = d3.select(parent);
  sel.selectAll("*").remove();
  if (!style.show || !labels.length) return;

  for (const label of labels) {
    const anchorGeo = pickAnchor(label.feature.geometry, { largestPartOnly: style.labelLargestPart, avoidHoles: style.avoidHoles });
    if (!anchorGeo) continue;
    const projected = projection(anchorGeo as [number, number]);
    if (!projected) continue;
    const [px, py] = projected;

    const lines = composeLines(label, style);
    if (!lines.length) continue;

    const fontStyle = style.italic ? "italic" : "normal";
    const fontWeight = style.bold ? "600" : "400";

    const g = sel.append("g").attr("class", "map-label").attr("transform", `translate(${px},${py})`);

    let baseFontSize = style.fontSize;
    let renderedLines = lines.slice();

    const polyBBox = pathBBox(path, label.feature);
    if (polyBBox) {
      let attempts = style.reduceFontSize ? 4 : 1;
      while (attempts-- > 0) {
        const longest = renderedLines.reduce((max, l) => Math.max(max, approxTextWidth(l, baseFontSize)), 0);
        const totalH = renderedLines.length * (baseFontSize * 1.15);
        if (style.allowOverrun || fitsInside(polyBBox, [px, py], longest, totalH)) break;
        if (style.abbreviate) {
          renderedLines = renderedLines.map((l) => abbreviate(l, polyBBox[2] - polyBBox[0], baseFontSize));
        }
        baseFontSize = Math.max(7, baseFontSize - 1);
      }
    }

    const lineHeight = baseFontSize * 1.15;
    const startY = -((renderedLines.length - 1) / 2) * lineHeight;

    for (let i = 0; i < renderedLines.length; i++) {
      const text = renderedLines[i];
      const isValueLine = lines.length > 1 && i >= 1 && style.content === "name_value";
      const textColor = isValueLine ? style.valueColor : style.color;

      if (style.haloWidth > 0) {
        g.append("text")
          .attr("text-anchor", "middle")
          .attr("y", startY + i * lineHeight + baseFontSize * 0.35)
          .attr("font-family", style.fontFamily)
          .attr("font-size", baseFontSize)
          .attr("font-style", fontStyle)
          .attr("font-weight", fontWeight)
          .attr("stroke", style.haloColor)
          .attr("stroke-width", style.haloWidth)
          .attr("paint-order", "stroke")
          .attr("fill", "none")
          .text(text);
      }
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("y", startY + i * lineHeight + baseFontSize * 0.35)
        .attr("font-family", style.fontFamily)
        .attr("font-size", baseFontSize)
        .attr("font-style", fontStyle)
        .attr("font-weight", fontWeight)
        .attr("fill", textColor)
        .attr("letter-spacing", style.spreadCharacters ? "1.5px" : null)
        .text(text);
    }
  }
}

function composeLines(label: LabelDatum, style: LabelStyle): string[] {
  const value = formatNumber(label.value ?? null, style.decimals, style.format);
  const value2 = label.value2 != null ? formatNumber(label.value2, style.decimals, style.format) : "";

  let nameLines: string[] = [label.name || ""];
  if (style.wordsOnSeparateLines && nameLines[0]) {
    nameLines = nameLines[0].split(/\s+/);
  } else if (style.stackWhenNeeded && (label.name || "").length > 14) {
    nameLines = wrapWords(label.name || "", 14);
  }

  switch (style.content) {
    case "value":
      return value ? [value] : [];
    case "name":
      return nameLines.filter(Boolean);
    case "name_value":
    default:
      return [...nameLines, ...(value ? [value] : []), ...(value2 ? [value2] : [])].filter(Boolean);
  }
}

function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if (cur.length + 1 + w.length > maxChars) { lines.push(cur); cur = w; }
    else cur += " " + w;
  }
  if (cur) lines.push(cur);
  return lines;
}

function abbreviate(text: string, maxPx: number, fontSize: number): string {
  if (!text) return text;
  const charW = fontSize * 0.55;
  const maxChars = Math.max(3, Math.floor(maxPx / charW));
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(1, maxChars - 1)) + "…";
}

function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

function pathBBox(path: GeoPath, feature: any): [number, number, number, number] | null {
  try {
    const b = path.bounds(feature);
    if (!b) return null;
    return [b[0][0], b[0][1], b[1][0], b[1][1]];
  } catch {
    return null;
  }
}

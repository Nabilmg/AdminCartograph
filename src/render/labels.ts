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
  /** Color for the choropleth measure value line. */
  valueColor: string;
  /** Color for the bubble-size value line. */
  bubbleValueColor: string;
  /** Color for the Label Value 2 (custom) line. */
  customValueColor: string;
  /** Which numeric value lines to show. Each string lists the sources to
   *  draw, in display order: choropleth → bubble → custom. The "_custom"
   *  / "all" / "custom" variants only contribute a custom line when
   *  Label Value 2 is actually bound (label.value2 != null). */
  valueSource: "choropleth" | "bubble" | "both" | "custom" | "choropleth_custom" | "bubble_custom" | "all";
  /** Where to source the area name from. "geometry" uses the polygon's
   *  ADM*_EN; "labelText1" uses the bound Label Text 1 override. */
  nameSource: "geometry" | "labelText1";
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
  /**
   * If true, drop the label entirely when it cannot be made to fit inside
   * its polygon's bounding box (after stack / abbreviate / reduce-font).
   * Used for neighbour Admin1 labels in drill view so they never spill on
   * top of the focused state.
   */
  hideOnOverflow?: boolean;
}

export interface LabelDatum {
  feature: any;
  name: string;
  /** Choropleth color value. */
  value: number | null;
  /** Optional Label Value 2 binding. Rendered only when valueSource
   *  includes the "custom" source. Null otherwise. */
  value2?: number | null;
  /** Optional Label Text 1 override. Used as the area name when
   *  nameSource is "labelText1". Null when not bound. */
  nameOverride?: string | null;
  /** Bubble size value (used when valueSource is "bubble" or "both"). */
  bubbleValue?: number | null;
  /** PCODE used for cross-referencing with bubble anchors. */
  pcode?: string;
}

export interface LabelAnchorOverride {
  /** Centre of the label, in screen-space px. */
  x: number;
  y: number;
  /**
   * If non-zero, the label engine will shift the text further from this
   * point so it doesn't overlap (e.g. above a bubble).
   */
  padAbove?: number;
  padBelow?: number;
  padLeft?: number;
  padRight?: number;
}

export function renderLabels(
  parent: SVGGElement,
  projection: GeoProjection,
  path: GeoPath,
  labels: LabelDatum[],
  style: LabelStyle,
  anchorOverrides?: Map<string, LabelAnchorOverride>
): void {
  const sel = d3.select(parent);
  sel.selectAll("*").remove();
  if (!style.show || !labels.length) return;

  for (const label of labels) {
    let px: number;
    let py: number;
    const override = label.pcode ? anchorOverrides?.get(label.pcode) : undefined;
    if (override) {
      px = override.x;
      py = override.y;
    } else {
      const anchorGeo = pickAnchor(label.feature.geometry, { largestPartOnly: style.labelLargestPart, avoidHoles: style.avoidHoles });
      if (!anchorGeo) continue;
      const projected = projection(anchorGeo as [number, number]);
      if (!projected) continue;
      px = projected[0];
      py = projected[1];
    }

    const lines = composeLines(label, style);
    if (!lines.length) continue;

    const fontStyle = style.italic ? "italic" : "normal";
    const fontWeight = style.bold ? "600" : "400";

    const g = sel.append("g").attr("class", "map-label").attr("transform", `translate(${px},${py})`);

    let baseFontSize = style.fontSize;
    let renderedLines = lines.slice();
    let labelFits = true;

    // When an override is supplied (e.g. label positioned relative to a
    // bubble) we trust the caller and skip fit-to-shape / abbreviate logic.
    const polyBBox = override ? null : pathBBox(path, label.feature);
    if (polyBBox) {
      let attempts = style.reduceFontSize ? 4 : 1;
      // stack-when-needed is a one-shot fitting fallback: try to wrap each
      // multi-word name line if the label still overflows after font size
      // and abbreviation fixes have been considered.
      let stackedAlready = false;
      while (attempts-- > 0) {
        const longest = renderedLines.reduce((m, l) => Math.max(m, approxTextWidth(l.text, baseFontSize)), 0);
        const totalH = renderedLines.length * (baseFontSize * 1.15);
        labelFits = fitsInside(polyBBox, [px, py], longest, totalH);
        if (style.allowOverrun || labelFits) break;

        if (style.stackWhenNeeded && !stackedAlready) {
          stackedAlready = true;
          const polyW = polyBBox[2] - polyBBox[0];
          const charW = baseFontSize * 0.55;
          const maxChars = Math.max(6, Math.floor(polyW / charW));
          renderedLines = renderedLines.flatMap((line) => {
            if (line.kind !== "name" || !line.text.includes(" ")) return [line];
            return wrapWords(line.text, maxChars).map((t) => ({ text: t, kind: line.kind }));
          });
          continue; // try fit again with the stacked layout before shrinking
        }

        if (style.abbreviate) {
          renderedLines = renderedLines.map((l) => ({ ...l, text: abbreviate(l.text, polyBBox[2] - polyBBox[0], baseFontSize) }));
        }
        baseFontSize = Math.max(7, baseFontSize - 1);
      }
      // After the loop, recompute fit one final time using the chosen size
      // and content so callers can decide whether to drop overflow labels.
      const longest = renderedLines.reduce((m, l) => Math.max(m, approxTextWidth(l.text, baseFontSize)), 0);
      const totalH = renderedLines.length * (baseFontSize * 1.15);
      labelFits = fitsInside(polyBBox, [px, py], longest, totalH);
    }

    // Hide-on-overflow: drop labels that still overflow even after fit
    // attempts. Used for neighbour Admin1 labels in drill view so a small
    // state's label never spills onto the focused state next door.
    if (style.hideOnOverflow && polyBBox && !labelFits) {
      // Remove the empty group we created so we don't leave debris behind.
      g.remove();
      continue;
    }

    const lineHeight = baseFontSize * 1.15;
    const startY = -((renderedLines.length - 1) / 2) * lineHeight;

    // Placement modes:
    //   horizontal: 0deg rotation, anchor at polygon centroid
    //   straight  : principal-axis rotation; text laid in a single straight
    //               run along the polygon's long direction
    //   curved    : principal-axis rotation AND the name line flows along a
    //               quadratic Bezier so the line bends. Distinct from
    //               straight: straight has no curvature, curved does.
    //   boundary  : anchor nudged toward the polygon's upper edge
    let rotation = 0;
    let dy = 0;
    const bbox = polyBBox || (label.feature ? pathBBox(path, label.feature) : null);
    if (style.placement === "straight" || style.placement === "curved") {
      rotation = normalizeRotation(principalAxisAngleDeg(label.feature.geometry, projection));
    }
    if (style.placement === "boundary" && !override && bbox) {
      const h = bbox[3] - bbox[1];
      dy = -(h / 2) * 0.55;
    }
    if (rotation || dy) {
      g.attr("transform", `translate(${px},${py + dy}) rotate(${rotation})`);
    }

    const useCurvedPath = style.placement === "curved" && !!bbox && renderedLines.some((l) => l.kind === "name");

    for (let i = 0; i < renderedLines.length; i++) {
      const line = renderedLines[i];
      const textColor = line.kind === "value"
        ? style.valueColor
        : line.kind === "bubble_value"
          ? style.bubbleValueColor
          : line.kind === "custom_value"
            ? style.customValueColor
            : style.color;
      const yOffset = startY + i * lineHeight + baseFontSize * 0.35;

      // Curved rendering applies only to NAME lines. Value lines keep
      // straight rotated rendering so numbers stay easy to read.
      if (useCurvedPath && line.kind === "name") {
        const w = approxTextWidth(line.text, baseFontSize) * 1.05;
        const h = bbox![3] - bbox![1];
        const arcDepth = Math.max(2, Math.min(h * 0.18, w * 0.12));
        const pathId = `adm-curve-${(label.pcode || Math.random().toString(36).slice(2))}-${i}`;
        const pathD = `M ${-w / 2},${yOffset} Q 0,${yOffset - arcDepth} ${w / 2},${yOffset}`;
        g.append("path")
          .attr("id", pathId)
          .attr("d", pathD)
          .attr("fill", "none")
          .attr("stroke", "none");

        const t = g.append("text")
          .attr("font-family", style.fontFamily)
          .attr("font-size", baseFontSize)
          .attr("font-style", fontStyle)
          .attr("font-weight", fontWeight)
          .attr("fill", textColor)
          .attr("letter-spacing", style.spreadCharacters ? "1.5px" : null);
        if (style.haloWidth > 0) {
          t.attr("stroke", style.haloColor)
            .attr("stroke-width", style.haloWidth)
            .attr("stroke-linejoin", "round")
            .attr("paint-order", "stroke fill");
        }
        t.append("textPath")
          .attr("href", `#${pathId}`)
          .attr("startOffset", "50%")
          .attr("text-anchor", "middle")
          .text(line.text);
        continue;
      }

      // Default straight-line rendering.
      const t = g.append("text")
        .attr("text-anchor", "middle")
        .attr("y", yOffset)
        .attr("font-family", style.fontFamily)
        .attr("font-size", baseFontSize)
        .attr("font-style", fontStyle)
        .attr("font-weight", fontWeight)
        .attr("fill", textColor)
        .attr("letter-spacing", style.spreadCharacters ? "1.5px" : null);
      if (style.haloWidth > 0) {
        t.attr("stroke", style.haloColor)
          .attr("stroke-width", style.haloWidth)
          .attr("stroke-linejoin", "round")
          .attr("paint-order", "stroke fill");
      }
      t.text(line.text);
    }
  }
}

interface ComposedLine {
  text: string;
  /** "name" uses the label color; "value" uses valueColor; "bubble_value"
   *  uses bubbleValueColor; "custom_value" uses customValueColor (Label
   *  Value 2 binding). */
  kind: "name" | "value" | "bubble_value" | "custom_value";
}

/** Decode the valueSource enum into a per-source on/off flag set. */
function sourcesFor(s: LabelStyle["valueSource"]): { choropleth: boolean; bubble: boolean; custom: boolean } {
  switch (s) {
    case "choropleth":         return { choropleth: true,  bubble: false, custom: false };
    case "bubble":             return { choropleth: false, bubble: true,  custom: false };
    case "both":               return { choropleth: true,  bubble: true,  custom: false };
    case "custom":             return { choropleth: false, bubble: false, custom: true  };
    case "choropleth_custom":  return { choropleth: true,  bubble: false, custom: true  };
    case "bubble_custom":      return { choropleth: false, bubble: true,  custom: true  };
    case "all":                return { choropleth: true,  bubble: true,  custom: true  };
    default:                   return { choropleth: true,  bubble: false, custom: false };
  }
}

function composeLines(label: LabelDatum, style: LabelStyle): ComposedLine[] {
  // Decode which sources the dropdown selected. Each "_custom" / "all" /
  // "custom" variant only contributes a custom line when Label Value 2
  // is actually bound; binding-less reports get the base behaviour.
  const sources = sourcesFor(style.valueSource);
  const colorTxt = label.value != null ? formatNumber(label.value, style.decimals, style.format) : "";
  const bubbleTxt = label.bubbleValue != null ? formatNumber(label.bubbleValue, style.decimals, style.format) : "";
  const customTxt = label.value2 != null ? formatNumber(label.value2, style.decimals, style.format) : "";

  const valueLines: ComposedLine[] = [];
  if (sources.choropleth && colorTxt) valueLines.push({ text: colorTxt, kind: "value" });
  if (sources.bubble && bubbleTxt) valueLines.push({ text: bubbleTxt, kind: "bubble_value" });
  if (sources.custom && customTxt) valueLines.push({ text: customTxt, kind: "custom_value" });

  // Pick the area name. Falls back to the geometry name if "labelText1"
  // is requested but no override is bound.
  const rawName = (style.nameSource === "labelText1" && label.nameOverride)
    ? label.nameOverride
    : (label.name || "");

  // Words on separate lines is the only thing that splits a name into
  // multiple lines up front. stack-when-needed is a fitting strategy that
  // only kicks in inside renderLabels when a label doesn't fit at its
  // placed size, and it never runs unless the user enables it.
  let nameLines: string[] = [rawName];
  if (style.wordsOnSeparateLines && nameLines[0]) {
    nameLines = nameLines[0].split(/\s+/);
  }
  const nameLinesTagged: ComposedLine[] = nameLines.filter(Boolean).map((t) => ({ text: t, kind: "name" }));

  switch (style.content) {
    case "value":
      return valueLines;
    case "name":
      return nameLinesTagged;
    case "name_value":
    default:
      return [...nameLinesTagged, ...valueLines];
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

/**
 * Returns the principal-axis angle (in degrees) of a polygon's outer ring,
 * after projecting it through the supplied projection. Uses PCA on the
 * vertex cloud: the eigenvector of the larger eigenvalue of the 2x2
 * covariance matrix, expressed as an angle in screen space.
 *
 * Returns 0 for empty / degenerate input.
 */
function principalAxisAngleDeg(geometry: any, projection: GeoProjection): number {
  const ring = largestProjectedOuterRing(geometry, projection);
  if (!ring || ring.length < 3) return 0;
  let mx = 0;
  let my = 0;
  for (const [x, y] of ring) { mx += x; my += y; }
  mx /= ring.length;
  my /= ring.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of ring) {
    const dx = x - mx;
    const dy = y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angleRad = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return (angleRad * 180) / Math.PI;
}

function largestProjectedOuterRing(geometry: any, projection: GeoProjection): number[][] | null {
  if (!geometry) return null;
  let candidate: number[][] | null = null;
  if (geometry.type === "Polygon") {
    candidate = geometry.coordinates[0];
  } else if (geometry.type === "MultiPolygon") {
    let bestArea = -Infinity;
    for (const poly of geometry.coordinates as number[][][][]) {
      const area = absRingArea(poly[0]);
      if (area > bestArea) {
        bestArea = area;
        candidate = poly[0];
      }
    }
  }
  if (!candidate) return null;
  const out: number[][] = [];
  for (const c of candidate) {
    const p = projection(c as [number, number]);
    if (p) out.push(p);
  }
  return out;
}

function absRingArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[i][1] + ring[j][1]);
  }
  return Math.abs(a / 2);
}

/** Keeps text right-side-up: clamps an angle to [-90, 90] degrees. */
function normalizeRotation(deg: number): number {
  let d = deg;
  while (d > 90) d -= 180;
  while (d < -90) d += 180;
  return d;
}

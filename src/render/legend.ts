/**
 * Renders the value legend (choropleth class swatches) and bubble legend
 * (nested circles) into a single container. When both legends share a corner
 * they are stacked inside one rounded box per the spec.
 */
import * as d3 from "d3";
import type { Position, LegendSize } from "../settings";
import { formatNumber } from "./format";
import type { ClassBreaks } from "./classification";

export interface LegendInputs {
  width: number;
  height: number;
  /** Choropleth value legend. */
  value?: {
    title: string;
    /** One swatch per class. Numeric modes set `from` / `to` and the
     *  legend formats them as a range; categorical mode sets `label`
     *  directly with the category text. */
    classes: { color: string; from: number; to: number; label?: string }[];
    decimals: number;
    orientation: "vertical" | "horizontal";
    position: Position;
    size: LegendSize;
    breaks: ClassBreaks;
  };
  /** Glyph-category legend (pie / donut / column categories). */
  glyph?: {
    title: string;
    /** One entry per category, in the input order. */
    items: { label: string; color: string }[];
    orientation: "vertical" | "horizontal";
    position: Position;
    size: LegendSize;
  };
  /** Bubble legend. */
  bubble?: {
    title: string;
    fillColor: string;
    strokeColor: string;
    minRadius: number;
    maxRadius: number;
    minValue: number;
    maxValue: number;
    position: Position;
    size: LegendSize;
    orientation: "vertical" | "horizontal" | "compact";
    /** Maps a measure value to a radius — same scale used by the bubbles. */
    scale: (v: number) => number;
  };
  /** Values legend — explains the numbers on labels. One entry per
   *  active value source (Choropleth / Bubble / Label Value 2),
   *  showing the bound measure's name with a `#` swatch in the
   *  matching label-value colour. */
  values?: {
    title: string;
    items: { label: string; color: string }[];
    position: Position;
    size: LegendSize;
    orientation: "vertical" | "horizontal";
  };
  container: {
    borderColor: string;
    borderWidth: number;
    cornerRadius: number;
    padding: number;
    background: string;
    backgroundOpacity: number;
    /** Header (title) styling. headerFontSize === 0 means "let each
     *  legend pick its own size based on body font" (the legacy
     *  behaviour: title = bodyFont * 1.2). Any positive value forces
     *  every legend's title to that size. */
    headerColor: string;
    headerBold: boolean;
    headerFontSize: number;
    /** "vertical" stacks combined legends top-to-bottom (default).
     *  "horizontal" arranges them left-to-right so the container reads
     *  wide rather than tall — useful when many legends share a corner
     *  and the user wants a single horizontal strip instead of a tall
     *  column. */
    orientation: "vertical" | "horizontal";
  };
}

const SIZE_SCALE: Record<LegendSize, number> = { small: 0.8, medium: 1.0, large: 1.2 };

/** Outer footprint of the rendered legend container at a given corner,
 * including padding but excluding the corner margin. Returned so callers
 * (e.g. the scale bar) can offset themselves to avoid overlap when they
 * share a corner. */
export type LegendFootprint = { width: number; height: number };
export type LegendFootprints = Partial<Record<Position, LegendFootprint>>;

export function renderLegends(
  parent: SVGGElement,
  inputs: LegendInputs,
  /** Optional scale-bar footprint per corner. When the scale bar
   *  occupies the same corner as a legend, the legend is shifted
   *  inward by `height + 8 px` so the scale bar can sit flush
   *  against the corner with the legend stacked above it. */
  scaleBarFootprints?: Partial<Record<Position, { height: number }>>
): LegendFootprints {
  const root = d3.select(parent);
  root.selectAll("*").remove();
  const footprints: LegendFootprints = {};

  // Group legends by position so we can combine when they share a corner.
  const groups: Record<string, {
    value?: LegendInputs["value"];
    bubble?: LegendInputs["bubble"];
    glyph?: LegendInputs["glyph"];
    values?: LegendInputs["values"];
  }> = {};
  if (inputs.value) {
    groups[inputs.value.position] = groups[inputs.value.position] || {};
    groups[inputs.value.position].value = inputs.value;
  }
  if (inputs.values) {
    groups[inputs.values.position] = groups[inputs.values.position] || {};
    groups[inputs.values.position].values = inputs.values;
  }
  if (inputs.bubble) {
    groups[inputs.bubble.position] = groups[inputs.bubble.position] || {};
    groups[inputs.bubble.position].bubble = inputs.bubble;
  }
  if (inputs.glyph) {
    groups[inputs.glyph.position] = groups[inputs.glyph.position] || {};
    groups[inputs.glyph.position].glyph = inputs.glyph;
  }

  for (const [position, contents] of Object.entries(groups)) {
    const group = root.append("g").attr("class", `legend legend-${position}`);
    const inner = group.append("g").attr("class", "legend-inner");

    // Render each legend into its own sub-group so we can stack them
    // afterwards with the natural map z-order: layers that sit ON TOP
    // of the choropleth on the map (glyph charts, bubbles) appear
    // ABOVE the choropleth in the legend container. Reads as: legend
    // top = whatever's on top on the map.
    const headerStyle: HeaderStyle = {
      color: inputs.container.headerColor || "#222222",
      bold: inputs.container.headerBold !== false,
      forceFontSize: inputs.container.headerFontSize > 0 ? inputs.container.headerFontSize : 0
    };
    // Values legend is the top of the stack — it explains the labels
    // (which sit on top of every other map layer), so it reads first.
    // Then glyph (charts on top of bubbles), bubble, and finally
    // choropleth at the bottom — top-to-bottom matches the map's
    // z-order from above to below.
    const stack: SVGGElement[] = [];
    if (contents.values) {
      const sub = inner.append("g").attr("class", "legend-values-sub");
      drawValuesLegend(sub, contents.values as any, 0, headerStyle);
      stack.push(sub.node() as SVGGElement);
    }
    if (contents.glyph) {
      const sub = inner.append("g").attr("class", "legend-glyph-sub");
      drawGlyphLegend(sub, contents.glyph as any, 0, headerStyle);
      stack.push(sub.node() as SVGGElement);
    }
    if (contents.bubble) {
      const sub = inner.append("g").attr("class", "legend-bubble-sub");
      drawBubbleLegend(sub, contents.bubble as any, 0, headerStyle);
      stack.push(sub.node() as SVGGElement);
    }
    if (contents.value) {
      const sub = inner.append("g").attr("class", "legend-value-sub");
      drawValueLegend(sub, contents.value as any, 0, headerStyle);
      stack.push(sub.node() as SVGGElement);
    }
    // Stack the sub-groups with an 8px gap. Vertical mode (default)
    // stacks them top-to-bottom; horizontal mode arranges them
    // left-to-right side by side. Each sub-group keeps its own
    // internal layout — the orientation toggle only changes how the
    // sub-groups themselves are positioned relative to each other.
    const horizontal = inputs.container.orientation === "horizontal";
    let cursor = 0;
    for (const sub of stack) {
      const subBox = sub.getBBox();
      if (horizontal) {
        const targetLeft = cursor;
        const tx = targetLeft - subBox.x;
        sub.setAttribute("transform", `translate(${tx},0)`);
        cursor = targetLeft + subBox.width + 8;
      } else {
        const targetTop = cursor;
        const ty = targetTop - subBox.y;
        sub.setAttribute("transform", `translate(0,${ty})`);
        cursor = targetTop + subBox.height + 8;
      }
    }

    // Measure and frame.
    const node = inner.node() as SVGGElement;
    const bbox = node.getBBox();
    const pad = inputs.container.padding;
    inner.insert("rect", ":first-child")
      .attr("x", bbox.x - pad)
      .attr("y", bbox.y - pad)
      .attr("width", bbox.width + pad * 2)
      .attr("height", bbox.height + pad * 2)
      .attr("rx", inputs.container.cornerRadius)
      .attr("ry", inputs.container.cornerRadius)
      .attr("fill", inputs.container.background)
      .attr("fill-opacity", inputs.container.backgroundOpacity)
      .attr("stroke", inputs.container.borderColor)
      .attr("stroke-width", inputs.container.borderWidth);

    const totalW = bbox.width + pad * 2;
    const totalH = bbox.height + pad * 2;
    const margin = 12;
    // When the scale bar shares this corner, legend dodges it by its
    // height + 8 px gap. Top corners push the legend down; bottom
    // corners push it up. Side corners (no top/bottom collision)
    // never need this since legend and scale bar occupy different
    // vertical edges.
    const sbHeight = scaleBarFootprints?.[position as Position]?.height || 0;
    const sbOffset = sbHeight ? sbHeight + 8 : 0;
    let dx = 0;
    let dy = 0;
    if (position === "topLeft") { dx = margin - bbox.x + pad; dy = margin - bbox.y + pad + sbOffset; }
    else if (position === "topRight") { dx = inputs.width - margin - totalW - bbox.x + pad; dy = margin - bbox.y + pad + sbOffset; }
    else if (position === "bottomLeft") { dx = margin - bbox.x + pad; dy = inputs.height - margin - totalH - bbox.y + pad - sbOffset; }
    else { dx = inputs.width - margin - totalW - bbox.x + pad; dy = inputs.height - margin - totalH - bbox.y + pad - sbOffset; }
    group.attr("transform", `translate(${dx},${dy})`);
    footprints[position as Position] = { width: totalW, height: totalH };
  }
  return footprints;
}

function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

/**
 * Glyph category legend: a swatch + measure-name row per category. Mirrors
 * the value legend's vertical / horizontal layouts so it slots into the
 * combined-legend container without surprises.
 */
/** Legend title style shared by all three legend kinds. forceFontSize=0
 *  keeps the legacy auto-sized title; >0 pins every title to that
 *  pixel size. */
interface HeaderStyle { color: string; bold: boolean; forceFontSize: number; }

/** Default header style — used when the renderer didn't pass one (older
 *  callers, tests). Matches the pre-feature look: dark text, bold,
 *  legend picks its own size. */
const DEFAULT_HEADER: HeaderStyle = { color: "#222222", bold: true, forceFontSize: 0 };

function drawGlyphLegend(parent: any, glyph: NonNullable<LegendInputs["glyph"]>, yStart: number, header: HeaderStyle = DEFAULT_HEADER): number {
  const scaleFactor = SIZE_SCALE[glyph.size];
  const fontSize = 11 * scaleFactor;
  const autoTitleSize = 12 * scaleFactor;
  const titleSize = header.forceFontSize > 0 ? header.forceFontSize : autoTitleSize;
  const swatch = 12 * scaleFactor;
  const gap = 4;

  parent.append("text")
    .attr("x", 0).attr("y", yStart + titleSize)
    .attr("font-size", titleSize).attr("font-weight", header.bold ? 600 : 400)
    .attr("fill", header.color)
    .text(glyph.title || "Categories");

  let y = yStart + titleSize + 6;
  if (glyph.orientation === "horizontal") {
    let x = 0;
    for (const it of glyph.items) {
      parent.append("rect").attr("x", x).attr("y", y).attr("width", swatch).attr("height", swatch).attr("fill", it.color).attr("stroke", "#666").attr("stroke-width", 0.5);
      parent.append("text").attr("x", x + swatch + 4).attr("y", y + swatch * 0.8).attr("font-size", fontSize).text(it.label);
      const colWidth = swatch + 4 + approxTextWidth(it.label, fontSize) + gap * 2;
      x += colWidth;
    }
    return y + swatch + 8;
  }
  for (const it of glyph.items) {
    parent.append("rect").attr("x", 0).attr("y", y).attr("width", swatch).attr("height", swatch).attr("fill", it.color).attr("stroke", "#666").attr("stroke-width", 0.5);
    parent.append("text").attr("x", swatch + gap).attr("y", y + swatch * 0.8).attr("font-size", fontSize).text(it.label);
    y += swatch + gap;
  }
  return y;
}

function drawValueLegend(parent: any, value: NonNullable<LegendInputs["value"]>, yStart: number, header: HeaderStyle = DEFAULT_HEADER): number {
  const scale = SIZE_SCALE[value.size];
  const swatch = 14 * scale;
  const fontSize = 11 * scale;
  const autoTitleSize = 12 * scale;
  const titleSize = header.forceFontSize > 0 ? header.forceFontSize : autoTitleSize;
  const gap = 4;

  parent.append("text")
    .attr("x", 0).attr("y", yStart + titleSize)
    .attr("font-size", titleSize).attr("font-weight", header.bold ? 600 : 400)
    .attr("fill", header.color)
    .text(value.title || "");

  let y = yStart + titleSize + 6;
  // Class label resolution differs by layout. Horizontal shows ONE
  // value per swatch — for numeric modes that's the class's upper
  // bound only ('50' rather than '10 – 50'), since adjacent swatches
  // already convey the lower bound visually. Vertical shows the full
  // range ('10 – 50') because each class gets its own line. Both
  // layouts pass the categorical label through verbatim.
  const horizontalLabelFor = (c: { from: number; to: number; label?: string }): string => {
    if (c.label != null) return c.label;
    return formatNumber(c.to, value.decimals, "auto");
  };
  const verticalLabelFor = (c: { from: number; to: number; label?: string }): string => {
    if (c.label != null) return c.label;
    const fromTxt = formatNumber(c.from, value.decimals, "auto");
    const toTxt = formatNumber(c.to, value.decimals, "auto");
    return c.from === c.to ? fromTxt : `${fromTxt} – ${toTxt}`;
  };
  if (value.orientation === "horizontal") {
    // Width each column to fit the longest label so adjacent labels don't
    // overlap. Numeric class labels (e.g. "5.4M") are wider than the 14 px
    // swatch, so the previous fixed swatch+gap stride was wrong.
    const labels = value.classes.map((c) => horizontalLabelFor(c));
    const maxLabelWidth = labels.reduce((m, t) => Math.max(m, approxTextWidth(t, fontSize)), 0);
    const colWidth = Math.max(swatch, maxLabelWidth) + gap * 2;
    let x = 0;
    for (let i = 0; i < value.classes.length; i++) {
      const c = value.classes[i];
      // Centre the swatch inside its column so swatches align with their
      // labels even when the column is wider than the swatch.
      const swatchX = x + (colWidth - swatch) / 2;
      parent.append("rect")
        .attr("x", swatchX).attr("y", y)
        .attr("width", swatch).attr("height", swatch)
        .attr("fill", c.color).attr("stroke", "#666").attr("stroke-width", 0.5);
      parent.append("text")
        .attr("x", x + colWidth / 2).attr("y", y + swatch + fontSize + 2)
        .attr("font-size", fontSize).attr("text-anchor", "middle")
        .text(labels[i]);
      x += colWidth;
    }
    return y + swatch + fontSize + 8;
  }
  for (const c of value.classes) {
    parent.append("rect").attr("x", 0).attr("y", y).attr("width", swatch).attr("height", swatch).attr("fill", c.color).attr("stroke", "#666").attr("stroke-width", 0.5);
    parent.append("text").attr("x", swatch + gap).attr("y", y + swatch * 0.75).attr("font-size", fontSize)
      .text(verticalLabelFor(c));
    y += swatch + gap;
  }
  return y;
}

/**
 * Values legend — explains the numbers shown on the map's labels by
 * listing each bound measure with a `#` swatch in the matching label
 * value colour. Same layout family as the glyph legend (vertical or
 * horizontal). Empty rows (no measure name) are skipped.
 */
function drawValuesLegend(parent: any, values: NonNullable<LegendInputs["values"]>, yStart: number, header: HeaderStyle = DEFAULT_HEADER): number {
  const scale = SIZE_SCALE[values.size];
  const fontSize = 11 * scale;
  const autoTitleSize = 12 * scale;
  const titleSize = header.forceFontSize > 0 ? header.forceFontSize : autoTitleSize;
  const gap = 6;

  if (values.title) {
    parent.append("text")
      .attr("x", 0).attr("y", yStart + titleSize)
      .attr("font-size", titleSize).attr("font-weight", header.bold ? 600 : 400)
      .attr("fill", header.color)
      .text(values.title);
  }

  let y = yStart + (values.title ? titleSize + 6 : 0);
  const rows = values.items.filter((it) => it && (it.label || "").trim());
  if (!rows.length) return y;

  if (values.orientation === "horizontal") {
    let x = 0;
    for (const it of rows) {
      // Render `#` symbol in the matching colour, then measure name in
      // the default text colour. Use a small approximate width per
      // entry so they don't bleed into each other.
      parent.append("text")
        .attr("x", x).attr("y", y + fontSize)
        .attr("font-size", fontSize).attr("font-weight", 700)
        .attr("fill", it.color)
        .text("#");
      parent.append("text")
        .attr("x", x + fontSize * 0.8 + 4).attr("y", y + fontSize)
        .attr("font-size", fontSize)
        .text(it.label);
      // Approximate: # plus name width plus padding.
      x += fontSize * 0.8 + 4 + Math.max(40, (it.label.length * fontSize * 0.55)) + 14;
    }
    return y + fontSize + gap;
  }

  // Vertical: one entry per line.
  for (const it of rows) {
    parent.append("text")
      .attr("x", 0).attr("y", y + fontSize)
      .attr("font-size", fontSize).attr("font-weight", 700)
      .attr("fill", it.color)
      .text("#");
    parent.append("text")
      .attr("x", fontSize * 0.8 + 4).attr("y", y + fontSize)
      .attr("font-size", fontSize)
      .text(it.label);
    y += fontSize + gap;
  }
  return y;
}

function drawBubbleLegend(parent: any, bubble: NonNullable<LegendInputs["bubble"]>, yStart: number, header: HeaderStyle = DEFAULT_HEADER): number {
  const scaleFactor = SIZE_SCALE[bubble.size];
  const fontSize = 11 * scaleFactor;
  const autoTitleSize = 12 * scaleFactor;
  const titleSize = header.forceFontSize > 0 ? header.forceFontSize : autoTitleSize;

  parent.append("text")
    .attr("x", 0).attr("y", yStart + titleSize)
    .attr("font-size", titleSize).attr("font-weight", header.bold ? 600 : 400)
    .attr("fill", header.color)
    .text(bubble.title || "");

  if (bubble.orientation === "compact") {
    return drawBubbleLegendCompact(parent, bubble, yStart + titleSize + 8, fontSize);
  }
  if (bubble.orientation === "horizontal") {
    return drawBubbleLegendHorizontal(parent, bubble, yStart + titleSize + 8, fontSize);
  }
  return drawBubbleLegendVertical(parent, bubble, yStart + titleSize + 8, fontSize);
}

/**
 * Compact bubble legend: just the smallest and largest bubble baseline-
 * aligned, with a thin connecting bracket between them and their values
 * labelled at the ends. Roughly half the footprint of the 3-4 bubble
 * horizontal layout.
 */
function drawBubbleLegendCompact(parent: any, bubble: NonNullable<LegendInputs["bubble"]>, yStart: number, fontSize: number): number {
  const minR = Math.max(2, bubble.scale(bubble.minValue));
  const maxR = Math.max(minR + 1, bubble.scale(bubble.maxValue));
  const baselineY = yStart + maxR * 2 + 2;

  const minCx = maxR; // first column reserved for largest-bubble width
  const minCy = baselineY - minR;
  // Compact gap between the two centres — width is mostly the larger bubble
  // diameter plus a fixed margin for the bracket and labels.
  const gap = Math.max(36, fontSize * 3.5);
  const maxCx = minCx + maxR + gap + maxR;
  const maxCy = baselineY - maxR;

  // Connecting bracket — a thin horizontal line at baseline with tiny
  // tick marks at each end indicating the range.
  const tick = 4;
  parent.append("line")
    .attr("x1", minCx + minR + 2).attr("y1", baselineY)
    .attr("x2", maxCx - maxR - 2).attr("y2", baselineY)
    .attr("stroke", "#888").attr("stroke-width", 1);
  parent.append("line")
    .attr("x1", minCx + minR + 2).attr("y1", baselineY - tick)
    .attr("x2", minCx + minR + 2).attr("y2", baselineY).attr("stroke", "#888").attr("stroke-width", 1);
  parent.append("line")
    .attr("x1", maxCx - maxR - 2).attr("y1", baselineY - tick)
    .attr("x2", maxCx - maxR - 2).attr("y2", baselineY).attr("stroke", "#888").attr("stroke-width", 1);

  parent.append("circle").attr("cx", minCx).attr("cy", minCy).attr("r", minR)
    .attr("fill", bubble.fillColor).attr("fill-opacity", 0.7).attr("stroke", bubble.strokeColor);
  parent.append("circle").attr("cx", maxCx).attr("cy", maxCy).attr("r", maxR)
    .attr("fill", bubble.fillColor).attr("fill-opacity", 0.5).attr("stroke", bubble.strokeColor);

  parent.append("text").attr("x", minCx).attr("y", baselineY + fontSize + 4)
    .attr("text-anchor", "middle").attr("font-size", fontSize)
    .text(formatNumber(bubble.minValue, 0, "auto"));
  parent.append("text").attr("x", maxCx).attr("y", baselineY + fontSize + 4)
    .attr("text-anchor", "middle").attr("font-size", fontSize)
    .text(formatNumber(bubble.maxValue, 0, "auto"));

  return baselineY + fontSize + 8;
}

function drawBubbleLegendVertical(parent: any, bubble: NonNullable<LegendInputs["bubble"]>, yStart: number, fontSize: number): number {
  const cx = bubble.maxRadius;
  const cyMax = yStart + bubble.maxRadius;

  parent.append("circle").attr("cx", cx).attr("cy", cyMax).attr("r", bubble.maxRadius).attr("fill", bubble.fillColor).attr("fill-opacity", 0.4).attr("stroke", bubble.strokeColor);
  parent.append("circle").attr("cx", cx).attr("cy", cyMax + bubble.maxRadius - bubble.minRadius).attr("r", bubble.minRadius).attr("fill", bubble.fillColor).attr("fill-opacity", 0.7).attr("stroke", bubble.strokeColor);

  parent.append("text").attr("x", cx + bubble.maxRadius + 6).attr("y", cyMax - bubble.maxRadius + fontSize).attr("font-size", fontSize).text(formatNumber(bubble.maxValue, 0, "auto"));
  parent.append("text").attr("x", cx + bubble.maxRadius + 6).attr("y", cyMax + bubble.maxRadius - bubble.minRadius * 2 + fontSize).attr("font-size", fontSize).text(formatNumber(bubble.minValue, 0, "auto"));

  return cyMax + bubble.maxRadius + 6;
}

/**
 * Horizontal bubble legend: 3-4 baseline-aligned circles ascending in size,
 * left to right, with their values labelled beneath. Uses the same scale
 * function the bubbles themselves use, so the legend reflects the actual
 * visual mapping (square-root area scaling) instead of a synthetic ramp.
 */
function drawBubbleLegendHorizontal(parent: any, bubble: NonNullable<LegendInputs["bubble"]>, yStart: number, fontSize: number): number {
  const min = bubble.minValue;
  const max = bubble.maxValue;
  // Three steps when the dynamic range is small, four when it's large
  // (>= one order of magnitude). Keeps the legend honest.
  const stepCount = max > 0 && min > 0 && max / min >= 10 ? 4 : 3;
  const stops: number[] = [];
  if (max === min) {
    stops.push(min);
  } else if (stepCount === 3) {
    stops.push(min, Math.sqrt(min * max), max);
  } else {
    // Four geometric-mean-ish stops between min and max.
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const v = min > 0 ? min * Math.pow(max / min, t) : min + (max - min) * t;
      stops.push(v);
    }
  }

  const radii = stops.map((v) => bubble.scale(v));
  const colGap = Math.max(8, fontSize * 0.6);
  const baselineY = yStart + bubble.maxRadius * 2 + 4; // bottom of the largest circle
  let x = 0;

  for (let i = 0; i < stops.length; i++) {
    const r = radii[i];
    const cx = x + bubble.maxRadius;
    const cy = baselineY - r;
    parent.append("circle")
      .attr("cx", cx).attr("cy", cy).attr("r", r)
      .attr("fill", bubble.fillColor)
      .attr("fill-opacity", 0.6)
      .attr("stroke", bubble.strokeColor);
    parent.append("text")
      .attr("x", cx).attr("y", baselineY + fontSize + 4)
      .attr("text-anchor", "middle")
      .attr("font-size", fontSize)
      .text(formatNumber(stops[i], 0, "auto"));
    x += bubble.maxRadius * 2 + colGap;
  }

  return baselineY + fontSize + 8;
}

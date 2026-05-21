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
  /** Admin levels legend — small stroke samples for Admin1 / Admin2
   *  border styles, labelled with the user's level aliases. Renders
   *  whichever entries the user has toggled on. */
  levels?: {
    title: string;
    items: { label: string; color: string; width: number }[];
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
    /** Item-row styling (legend body, beneath the title). When
     *  itemFontSize / itemSwatchSize are 0 each legend picks its own
     *  size from the Size dropdown's SIZE_SCALE; positive values
     *  pin them across every combined legend. */
    itemColor: string;
    itemFontSize: number;
    itemSwatchSize: number;
    /** "vertical" stacks combined legends top-to-bottom (default).
     *  "horizontal" arranges them left-to-right so the container reads
     *  wide rather than tall — useful when many legends share a corner
     *  and the user wants a single horizontal strip instead of a tall
     *  column. */
    orientation: "vertical" | "horizontal";
  };
}

const SIZE_SCALE: Record<LegendSize, number> = { minimal: 0.6, small: 0.8, medium: 1.0, large: 1.2 };

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
    levels?: LegendInputs["levels"];
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
  if (inputs.levels) {
    groups[inputs.levels.position] = groups[inputs.levels.position] || {};
    groups[inputs.levels.position].levels = inputs.levels;
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
    const itemStyle: ItemStyle = {
      color: inputs.container.itemColor || "#1a1a1a",
      forceFontSize: inputs.container.itemFontSize > 0 ? inputs.container.itemFontSize : 0,
      forceSwatchSize: inputs.container.itemSwatchSize > 0 ? inputs.container.itemSwatchSize : 0
    };
    // Values legend is the top of the stack — it explains the labels
    // (which sit on top of every other map layer), so it reads first.
    // Then glyph (charts on top of bubbles), bubble, and finally
    // choropleth at the bottom — top-to-bottom matches the map's
    // z-order from above to below.
    const stack: SVGGElement[] = [];
    if (contents.values) {
      const sub = inner.append("g").attr("class", "legend-values-sub");
      drawValuesLegend(sub, contents.values as any, 0, headerStyle, itemStyle);
      stack.push(sub.node() as SVGGElement);
    }
    if (contents.glyph) {
      const sub = inner.append("g").attr("class", "legend-glyph-sub");
      drawGlyphLegend(sub, contents.glyph as any, 0, headerStyle, itemStyle);
      stack.push(sub.node() as SVGGElement);
    }
    if (contents.bubble) {
      const sub = inner.append("g").attr("class", "legend-bubble-sub");
      drawBubbleLegend(sub, contents.bubble as any, 0, headerStyle, itemStyle);
      stack.push(sub.node() as SVGGElement);
    }
    if (contents.value) {
      const sub = inner.append("g").attr("class", "legend-value-sub");
      drawValueLegend(sub, contents.value as any, 0, headerStyle, itemStyle);
      stack.push(sub.node() as SVGGElement);
    }
    if (contents.levels) {
      const sub = inner.append("g").attr("class", "legend-levels-sub");
      drawAdminLevelsLegend(sub, contents.levels as any, 0, headerStyle, itemStyle);
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
    // Helper anchors: left / centre / right for x, and top / middle /
    // bottom for y. Centre positions land the legend's centre on the
    // viewport centre, with bbox-correction so the visible content
    // (not just the layout origin) lines up.
    const xLeft = margin - bbox.x + pad;
    const xRight = inputs.width - margin - totalW - bbox.x + pad;
    const xCentre = (inputs.width - totalW) / 2 - bbox.x + pad;
    const yTop = margin - bbox.y + pad + sbOffset;
    const yBottom = inputs.height - margin - totalH - bbox.y + pad - sbOffset;
    const yMiddle = (inputs.height - totalH) / 2 - bbox.y + pad;
    let dx = 0;
    let dy = 0;
    switch (position) {
      case "topLeft":      dx = xLeft;   dy = yTop;    break;
      case "topRight":     dx = xRight;  dy = yTop;    break;
      case "bottomLeft":   dx = xLeft;   dy = yBottom; break;
      case "bottomRight":  dx = xRight;  dy = yBottom; break;
      case "topCenter":    dx = xCentre; dy = yTop;    break;
      case "bottomCenter": dx = xCentre; dy = yBottom; break;
      case "leftCenter":   dx = xLeft;   dy = yMiddle; break;
      case "rightCenter":  dx = xRight;  dy = yMiddle; break;
      default:             dx = xRight;  dy = yBottom; break;
    }
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
/** Body-row style for legend items. forceFontSize / forceSwatchSize
 *  of 0 keep the legacy auto-sized values (each legend uses its own
 *  Size dropdown's SIZE_SCALE); positive values pin them. */
interface ItemStyle { color: string; forceFontSize: number; forceSwatchSize: number; }
const DEFAULT_ITEM: ItemStyle = { color: "#1a1a1a", forceFontSize: 0, forceSwatchSize: 0 };

/** Default header style — used when the renderer didn't pass one (older
 *  callers, tests). Matches the pre-feature look: dark text, bold,
 *  legend picks its own size. */
const DEFAULT_HEADER: HeaderStyle = { color: "#222222", bold: true, forceFontSize: 0 };

function drawGlyphLegend(parent: any, glyph: NonNullable<LegendInputs["glyph"]>, yStart: number, header: HeaderStyle = DEFAULT_HEADER, item: ItemStyle = DEFAULT_ITEM): number {
  const scaleFactor = SIZE_SCALE[glyph.size];
  const autoFont = 11 * scaleFactor;
  const autoTitleSize = 12 * scaleFactor;
  const autoSwatch = 12 * scaleFactor;
  const fontSize = item.forceFontSize > 0 ? item.forceFontSize : autoFont;
  const titleSize = header.forceFontSize > 0 ? header.forceFontSize : autoTitleSize;
  const swatch = item.forceSwatchSize > 0 ? item.forceSwatchSize : autoSwatch;
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
      parent.append("text").attr("x", x + swatch + 4).attr("y", y + swatch * 0.8).attr("font-size", fontSize).attr("fill", item.color).text(it.label);
      const colWidth = swatch + 4 + approxTextWidth(it.label, fontSize) + gap * 2;
      x += colWidth;
    }
    return y + swatch + 8;
  }
  for (const it of glyph.items) {
    parent.append("rect").attr("x", 0).attr("y", y).attr("width", swatch).attr("height", swatch).attr("fill", it.color).attr("stroke", "#666").attr("stroke-width", 0.5);
    parent.append("text").attr("x", swatch + gap).attr("y", y + swatch * 0.8).attr("font-size", fontSize).attr("fill", item.color).text(it.label);
    y += swatch + gap;
  }
  return y;
}

function drawValueLegend(parent: any, value: NonNullable<LegendInputs["value"]>, yStart: number, header: HeaderStyle = DEFAULT_HEADER, item: ItemStyle = DEFAULT_ITEM): number {
  const scale = SIZE_SCALE[value.size];
  const autoSwatch = 14 * scale;
  const autoFont = 11 * scale;
  const autoTitleSize = 12 * scale;
  const swatch = item.forceSwatchSize > 0 ? item.forceSwatchSize : autoSwatch;
  const fontSize = item.forceFontSize > 0 ? item.forceFontSize : autoFont;
  const titleSize = header.forceFontSize > 0 ? header.forceFontSize : autoTitleSize;
  const gap = 4;

  parent.append("text")
    .attr("x", 0).attr("y", yStart + titleSize)
    .attr("font-size", titleSize).attr("font-weight", header.bold ? 600 : 400)
    .attr("fill", header.color)
    .text(value.title || "");

  let y = yStart + titleSize + 6;

  // Minimal size — collapse to TWO swatches: first class with a "−"
  // marker (lowest values) and last class with a "+" marker (highest).
  // Skipped for categorical classes (label property is set) since
  // there's no inherent "low / high" ordering.
  const isMinimal = value.size === "minimal";
  const hasNumericClasses = value.classes.length > 0 && value.classes.every((c) => c.label == null);
  if (isMinimal && hasNumericClasses && value.classes.length >= 2) {
    const first = value.classes[0];
    const last = value.classes[value.classes.length - 1];
    const markerFontWeight = "700";
    if (value.orientation === "horizontal") {
      let x = 0;
      const colW = swatch + 6 + Math.ceil(fontSize * 0.9) + 10;
      [{ c: first, mark: "−" }, { c: last, mark: "+" }].forEach(({ c, mark }) => {
        parent.append("rect").attr("x", x).attr("y", y).attr("width", swatch).attr("height", swatch).attr("fill", c.color).attr("stroke", "#666").attr("stroke-width", 0.5);
        parent.append("text").attr("x", x + swatch + 6).attr("y", y + swatch * 0.78).attr("font-size", fontSize).attr("font-weight", markerFontWeight).attr("fill", item.color).text(mark);
        x += colW;
      });
      return y + swatch + 6;
    }
    [{ c: first, mark: "−" }, { c: last, mark: "+" }].forEach(({ c, mark }) => {
      parent.append("rect").attr("x", 0).attr("y", y).attr("width", swatch).attr("height", swatch).attr("fill", c.color).attr("stroke", "#666").attr("stroke-width", 0.5);
      parent.append("text").attr("x", swatch + gap).attr("y", y + swatch * 0.78).attr("font-size", fontSize).attr("font-weight", markerFontWeight).attr("fill", item.color).text(mark);
      y += swatch + gap;
    });
    return y;
  }
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
    // Per-item column width based on each label's actual width.
    // Earlier we used max(swatch, longestLabel) for every column,
    // which padded every entry to the widest one — fine when all
    // labels were similar numeric strings ('5.4M', '8.1M'), but
    // a disaster for categorical labels of varying lengths
    // ('Good Coverage', 'No Coverage', 'Moderate Coverage'…)
    // where the legend bled past the visual edge and clipped both
    // ends. Each column now fits its own label only.
    const labels = value.classes.map((c) => horizontalLabelFor(c));
    const colWidths = labels.map((t) => Math.max(swatch, approxTextWidth(t, fontSize)) + gap * 2);
    let x = 0;
    for (let i = 0; i < value.classes.length; i++) {
      const c = value.classes[i];
      const colWidth = colWidths[i];
      const swatchX = x + (colWidth - swatch) / 2;
      parent.append("rect")
        .attr("x", swatchX).attr("y", y)
        .attr("width", swatch).attr("height", swatch)
        .attr("fill", c.color).attr("stroke", "#666").attr("stroke-width", 0.5);
      parent.append("text")
        .attr("x", x + colWidth / 2).attr("y", y + swatch + fontSize + 2)
        .attr("font-size", fontSize).attr("text-anchor", "middle").attr("fill", item.color)
        .text(labels[i]);
      x += colWidth;
    }
    return y + swatch + fontSize + 8;
  }
  for (const c of value.classes) {
    parent.append("rect").attr("x", 0).attr("y", y).attr("width", swatch).attr("height", swatch).attr("fill", c.color).attr("stroke", "#666").attr("stroke-width", 0.5);
    parent.append("text").attr("x", swatch + gap).attr("y", y + swatch * 0.75).attr("font-size", fontSize).attr("fill", item.color)
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
function drawValuesLegend(parent: any, values: NonNullable<LegendInputs["values"]>, yStart: number, header: HeaderStyle = DEFAULT_HEADER, item: ItemStyle = DEFAULT_ITEM): number {
  const scale = SIZE_SCALE[values.size];
  const autoFont = 11 * scale;
  const autoTitleSize = 12 * scale;
  const fontSize = item.forceFontSize > 0 ? item.forceFontSize : autoFont;
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
        .attr("font-size", fontSize).attr("fill", item.color)
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
      .attr("font-size", fontSize).attr("fill", item.color)
      .text(it.label);
    y += fontSize + gap;
  }
  return y;
}

/**
 * Admin levels legend — one row per administrative level. Each row is
 * a short stroke sample (using the level's border colour + width) plus
 * the level alias label. Stroke samples mirror what's actually drawn
 * on the map so users can decode the boundary thicknesses.
 */
function drawAdminLevelsLegend(parent: any, levels: NonNullable<LegendInputs["levels"]>, yStart: number, header: HeaderStyle = DEFAULT_HEADER, item: ItemStyle = DEFAULT_ITEM): number {
  const scale = SIZE_SCALE[levels.size];
  const autoFont = 11 * scale;
  const autoTitleSize = 12 * scale;
  const autoSampleLen = 22 * scale;
  const fontSize = item.forceFontSize > 0 ? item.forceFontSize : autoFont;
  const titleSize = header.forceFontSize > 0 ? header.forceFontSize : autoTitleSize;
  const sampleLen = item.forceSwatchSize > 0 ? item.forceSwatchSize : autoSampleLen;
  const gap = 6;

  if (levels.title) {
    parent.append("text")
      .attr("x", 0).attr("y", yStart + titleSize)
      .attr("font-size", titleSize).attr("font-weight", header.bold ? 600 : 400)
      .attr("fill", header.color)
      .text(levels.title);
  }
  let y = yStart + (levels.title ? titleSize + 6 : 0);
  const rows = levels.items.filter((it) => it && (it.label || "").trim());
  if (!rows.length) return y;

  if (levels.orientation === "horizontal") {
    let x = 0;
    for (const it of rows) {
      const sampleY = y + fontSize * 0.6;
      parent.append("line")
        .attr("x1", x).attr("y1", sampleY)
        .attr("x2", x + sampleLen).attr("y2", sampleY)
        .attr("stroke", it.color)
        .attr("stroke-width", Math.max(1, it.width))
        .attr("stroke-linecap", "round");
      parent.append("text")
        .attr("x", x + sampleLen + 4).attr("y", y + fontSize)
        .attr("font-size", fontSize).attr("fill", item.color)
        .text(it.label);
      x += sampleLen + 4 + Math.max(40, it.label.length * fontSize * 0.55) + 12;
    }
    return y + fontSize + gap;
  }

  // Vertical
  for (const it of rows) {
    const sampleY = y + fontSize * 0.6;
    parent.append("line")
      .attr("x1", 0).attr("y1", sampleY)
      .attr("x2", sampleLen).attr("y2", sampleY)
      .attr("stroke", it.color)
      .attr("stroke-width", Math.max(1, it.width))
      .attr("stroke-linecap", "round");
    parent.append("text")
      .attr("x", sampleLen + 4).attr("y", y + fontSize)
      .attr("font-size", fontSize).attr("fill", item.color)
      .text(it.label);
    y += fontSize + gap;
  }
  return y;
}

function drawBubbleLegend(parent: any, bubble: NonNullable<LegendInputs["bubble"]>, yStart: number, header: HeaderStyle = DEFAULT_HEADER, item: ItemStyle = DEFAULT_ITEM): number {
  const scaleFactor = SIZE_SCALE[bubble.size];
  const autoFont = 11 * scaleFactor;
  const autoTitleSize = 12 * scaleFactor;
  const fontSize = item.forceFontSize > 0 ? item.forceFontSize : autoFont;
  const titleSize = header.forceFontSize > 0 ? header.forceFontSize : autoTitleSize;

  parent.append("text")
    .attr("x", 0).attr("y", yStart + titleSize)
    .attr("font-size", titleSize).attr("font-weight", header.bold ? 600 : 400)
    .attr("fill", header.color)
    .text(bubble.title || "");

  // Minimal size forces the compact layout — just smallest and largest
  // bubbles with their values, no intermediate. Matches the cramped
  // canvas the user picks 'minimal' for.
  const effectiveOrientation = bubble.size === "minimal" ? "compact" : bubble.orientation;
  if (effectiveOrientation === "compact") {
    return drawBubbleLegendCompact(parent, bubble, yStart + titleSize + 8, fontSize);
  }
  if (effectiveOrientation === "horizontal") {
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

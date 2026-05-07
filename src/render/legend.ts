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
    classes: { color: string; from: number; to: number }[];
    decimals: number;
    orientation: "vertical" | "horizontal";
    position: Position;
    size: LegendSize;
    breaks: ClassBreaks;
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
    orientation: "vertical" | "horizontal";
    /** Maps a measure value to a radius — same scale used by the bubbles. */
    scale: (v: number) => number;
  };
  container: {
    borderColor: string;
    borderWidth: number;
    cornerRadius: number;
    padding: number;
    background: string;
    backgroundOpacity: number;
  };
}

const SIZE_SCALE: Record<LegendSize, number> = { small: 0.8, medium: 1.0, large: 1.2 };

export function renderLegends(parent: SVGGElement, inputs: LegendInputs): void {
  const root = d3.select(parent);
  root.selectAll("*").remove();

  // Group legends by position so we can combine when they share a corner.
  const groups: Record<string, { value?: LegendInputs["value"]; bubble?: LegendInputs["bubble"] }> = {};
  if (inputs.value) {
    groups[inputs.value.position] = groups[inputs.value.position] || {};
    groups[inputs.value.position].value = inputs.value;
  }
  if (inputs.bubble) {
    groups[inputs.bubble.position] = groups[inputs.bubble.position] || {};
    groups[inputs.bubble.position].bubble = inputs.bubble;
  }

  for (const [position, contents] of Object.entries(groups)) {
    const group = root.append("g").attr("class", `legend legend-${position}`);
    const inner = group.append("g").attr("class", "legend-inner");

    let yOffset = 0;
    if (contents.value) {
      yOffset = drawValueLegend(inner, contents.value as any, yOffset);
      yOffset += 8;
    }
    if (contents.bubble) {
      yOffset = drawBubbleLegend(inner, contents.bubble as any, yOffset);
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
    let dx = 0;
    let dy = 0;
    if (position === "topLeft") { dx = margin - bbox.x + pad; dy = margin - bbox.y + pad; }
    else if (position === "topRight") { dx = inputs.width - margin - totalW - bbox.x + pad; dy = margin - bbox.y + pad; }
    else if (position === "bottomLeft") { dx = margin - bbox.x + pad; dy = inputs.height - margin - totalH - bbox.y + pad; }
    else { dx = inputs.width - margin - totalW - bbox.x + pad; dy = inputs.height - margin - totalH - bbox.y + pad; }
    group.attr("transform", `translate(${dx},${dy})`);
  }
}

function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

function drawValueLegend(parent: any, value: NonNullable<LegendInputs["value"]>, yStart: number): number {
  const scale = SIZE_SCALE[value.size];
  const swatch = 14 * scale;
  const fontSize = 11 * scale;
  const titleSize = 12 * scale;
  const gap = 4;

  parent.append("text")
    .attr("x", 0).attr("y", yStart + titleSize)
    .attr("font-size", titleSize).attr("font-weight", 600)
    .text(value.title || "");

  let y = yStart + titleSize + 6;
  if (value.orientation === "horizontal") {
    // Width each column to fit the longest label so adjacent labels don't
    // overlap. Numeric class labels (e.g. "5.4M") are wider than the 14 px
    // swatch, so the previous fixed swatch+gap stride was wrong.
    const labels = value.classes.map((c) => formatNumber(c.to, value.decimals, "auto"));
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
    const fromTxt = formatNumber(c.from, value.decimals, "auto");
    const toTxt = formatNumber(c.to, value.decimals, "auto");
    const text = c.from === c.to ? fromTxt : `${fromTxt} – ${toTxt}`;
    parent.append("text").attr("x", swatch + gap).attr("y", y + swatch * 0.75).attr("font-size", fontSize)
      .text(text);
    y += swatch + gap;
  }
  return y;
}

function drawBubbleLegend(parent: any, bubble: NonNullable<LegendInputs["bubble"]>, yStart: number): number {
  const scaleFactor = SIZE_SCALE[bubble.size];
  const fontSize = 11 * scaleFactor;
  const titleSize = 12 * scaleFactor;

  parent.append("text")
    .attr("x", 0).attr("y", yStart + titleSize)
    .attr("font-size", titleSize).attr("font-weight", 600)
    .text(bubble.title || "");

  if (bubble.orientation === "horizontal") {
    return drawBubbleLegendHorizontal(parent, bubble, yStart + titleSize + 8, fontSize);
  }
  return drawBubbleLegendVertical(parent, bubble, yStart + titleSize + 8, fontSize);
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

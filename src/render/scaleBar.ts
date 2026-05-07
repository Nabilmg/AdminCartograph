/**
 * Map scale bar — a small horizontal bar in a corner of the canvas showing
 * how many kilometres (or miles) a span on the map represents at the
 * current projection + zoom.
 *
 * The bar adapts to whatever the current projection is doing: we measure
 * how many pixels correspond to a 1° longitude step at the centre of the
 * visible area, then convert that into a "nice" round distance for a
 * target on-screen length (about 100 px). This works for any country and
 * accommodates the visual's runtime zoom (the caller passes the current
 * pxPerKm so the bar shrinks when zoomed out and grows when zoomed in).
 */
import * as d3 from "d3";
import type { GeoProjection } from "d3-geo";

export type ScaleUnits = "km" | "mi";
export type ScalePosition = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export interface ScaleBarStyle {
  show: boolean;
  units: ScaleUnits;
  position: ScalePosition;
  color: string;
  fontSize: number;
}

const KM_TO_MI = 0.621371;

/**
 * Render the scale bar into `parent`. The projection is used to compute
 * pixels-per-kilometre at the viewport centre. zoomLevel scales that
 * value so the bar stays accurate when the user zooms in / out via the
 * mapGroup transform (legends are NOT inside mapGroup, so we apply the
 * zoom factor manually).
 */
export function renderScaleBar(
  parent: SVGGElement,
  projection: GeoProjection,
  viewportW: number,
  viewportH: number,
  zoomLevel: number,
  style: ScaleBarStyle
): void {
  const sel = d3.select(parent);
  sel.selectAll("*").remove();
  if (!style.show) return;

  // Probe the projection at the viewport centre.
  const cx = viewportW / 2;
  const cy = viewportH / 2;
  const center = projection.invert ? projection.invert([cx, cy]) : null;
  if (!center) return;
  const [lon, lat] = center;

  // 1 degree of longitude in km, scaled by latitude.
  const kmPerDegLon = 111.32 * Math.cos((lat * Math.PI) / 180);
  if (!Number.isFinite(kmPerDegLon) || kmPerDegLon <= 0) return;

  // Pixel distance for a 1° longitude step. Then derive pxPerKm.
  const east = projection([lon + 1, lat]);
  const here = projection([lon, lat]);
  if (!east || !here) return;
  const pxPerDegLon = Math.hypot(east[0] - here[0], east[1] - here[1]);
  if (!Number.isFinite(pxPerDegLon) || pxPerDegLon <= 0) return;
  const pxPerKm = (pxPerDegLon / kmPerDegLon) * (zoomLevel || 1);

  // Pick a "nice" round distance whose on-screen length is about 100 px.
  const targetPx = Math.max(60, Math.min(180, viewportW * 0.18));
  const factor = style.units === "mi" ? KM_TO_MI : 1;
  const targetUnits = (targetPx / pxPerKm) * factor;
  const niceUnits = niceRound(targetUnits);
  const niceKm = niceUnits / factor;
  const barPx = niceKm * pxPerKm;

  if (!Number.isFinite(barPx) || barPx <= 8) return;

  // Bar geometry.
  const fontSize = style.fontSize;
  const labelGap = 4;
  const barHeight = 6;
  const tickHeight = 10;
  const bbox = { width: barPx + 2, height: tickHeight + labelGap + fontSize + 4 };

  // Position the bar inside the viewport with a 12 px margin from the
  // chosen corner.
  const margin = 12;
  let x: number;
  let y: number;
  switch (style.position) {
    case "topLeft":     x = margin;                              y = margin; break;
    case "topRight":    x = viewportW - margin - bbox.width;     y = margin; break;
    case "bottomRight": x = viewportW - margin - bbox.width;     y = viewportH - margin - bbox.height; break;
    case "bottomLeft":
    default:            x = margin;                              y = viewportH - margin - bbox.height; break;
  }

  const root = sel.append("g").attr("class", "scale-bar").attr("transform", `translate(${x},${y})`);

  // Two-segment style: white-then-color alternating bar with end ticks
  // and a midpoint tick. Reads like a classic cartographic scale.
  const half = barPx / 2;
  root.append("rect")
    .attr("x", 0).attr("y", tickHeight - barHeight)
    .attr("width", half).attr("height", barHeight)
    .attr("fill", "#ffffff").attr("stroke", style.color).attr("stroke-width", 1);
  root.append("rect")
    .attr("x", half).attr("y", tickHeight - barHeight)
    .attr("width", barPx - half).attr("height", barHeight)
    .attr("fill", style.color).attr("stroke", style.color).attr("stroke-width", 1);

  // Ticks at 0 / mid / end.
  const tick = (tx: number) => root.append("line")
    .attr("x1", tx).attr("y1", 0).attr("x2", tx).attr("y2", tickHeight)
    .attr("stroke", style.color).attr("stroke-width", 1);
  tick(0); tick(half); tick(barPx);

  // Numeric labels.
  const unitsLabel = style.units === "mi" ? "mi" : "km";
  root.append("text")
    .attr("x", 0).attr("y", tickHeight + labelGap + fontSize)
    .attr("font-size", fontSize).attr("text-anchor", "start")
    .attr("fill", style.color)
    .text("0");
  root.append("text")
    .attr("x", barPx).attr("y", tickHeight + labelGap + fontSize)
    .attr("font-size", fontSize).attr("text-anchor", "end")
    .attr("fill", style.color)
    .text(`${formatNice(niceUnits)} ${unitsLabel}`);
}

/**
 * Round a positive value to the nearest "human-friendly" number in the
 * 1-2-5 sequence within its decade (1, 2, 5, 10, 20, 50, ...). Used so
 * the scale bar always reads as a clean round figure.
 */
function niceRound(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const f = v / Math.pow(10, exp);
  let nice: number;
  if (f < 1.5) nice = 1;
  else if (f < 3.5) nice = 2;
  else if (f < 7.5) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}

function formatNice(v: number): string {
  if (v >= 1000) return `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
  if (v >= 100) return String(Math.round(v));
  if (v >= 10) return String(Math.round(v));
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

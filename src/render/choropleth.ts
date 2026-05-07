/**
 * Renders polygon fills + borders. Choropleth class colors are computed up
 * front by the view controller; this file only handles drawing.
 */
import * as d3 from "d3";
import type { GeoPath } from "d3-geo";
import type { AreaDatum } from "../types";

export interface ChoroplethRow {
  feature: any;
  pcode: string;
  fill: string;
  fillOpacity: number;
  highlighted: boolean;
}

export interface BordersStyle {
  stateColor: string;
  stateWidth: number;
  stateOpacity: number;
  localityColor: string;
  localityWidth: number;
  localityOpacity: number;
}

export function renderChoropleth(parent: SVGGElement, path: GeoPath, rows: ChoroplethRow[], pathClass: string): d3.Selection<SVGPathElement, ChoroplethRow, SVGGElement, any> {
  const sel = d3.select(parent);
  sel.selectAll("*").remove();
  return sel.selectAll<SVGPathElement, ChoroplethRow>("path")
    .data(rows)
    .join("path")
    .attr("class", pathClass)
    .attr("d", (r) => path(r.feature) as string)
    .attr("fill", (r) => r.fill)
    .attr("fill-opacity", (r) => r.fillOpacity)
    .attr("data-pcode", (r) => r.pcode)
    .attr("tabindex", 0)
    .attr("role", "button");
}

export function applyBorders(stateLayer: SVGGElement, localityLayer: SVGGElement, style: BordersStyle): void {
  d3.select(stateLayer).selectAll("path")
    .attr("stroke", style.stateColor)
    .attr("stroke-width", style.stateWidth)
    .attr("stroke-opacity", style.stateOpacity)
    .attr("vector-effect", "non-scaling-stroke");
  d3.select(localityLayer).selectAll("path")
    .attr("stroke", style.localityColor)
    .attr("stroke-width", style.localityWidth)
    .attr("stroke-opacity", style.localityOpacity)
    .attr("vector-effect", "non-scaling-stroke");
}

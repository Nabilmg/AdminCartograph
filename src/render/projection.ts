/**
 * Projects a country's geometry into screen space. We use d3.geoMercator with
 * fitExtent so the polygons fill the available canvas; this works well for
 * country-level maps and avoids dependence on global projections.
 */
import * as d3geo from "d3-geo";

export interface ProjectionResult {
  projection: d3geo.GeoProjection;
  path: d3geo.GeoPath;
  width: number;
  height: number;
}

export function buildProjection(featureCollection: any, width: number, height: number, padding: number): ProjectionResult {
  const proj = d3geo.geoMercator();
  const inner = [
    [padding, padding],
    [Math.max(padding + 1, width - padding), Math.max(padding + 1, height - padding)]
  ] as [[number, number], [number, number]];
  proj.fitExtent(inner, featureCollection);
  const path = d3geo.geoPath(proj);
  return { projection: proj, path, width, height };
}

/**
 * GeoJSON polygon winding helpers.
 *
 * d3-geo uses the SPHERICAL right-hand rule: the interior of a polygon
 * must lie to the *right* of the direction of travel along its boundary.
 * In lon/lat coords that means outer rings should be CLOCKWISE (negative
 * signed area in planar shoelace) and inner rings counter-clockwise.
 * This is the OPPOSITE of RFC 7946, which is what most modern GeoJSON
 * producers emit. A CCW outer ring fed to d3.geoBounds / d3.geoPath is
 * interpreted as the COMPLEMENT (the whole sphere minus the region),
 * which is why uploaded files render as the projection's clip extent
 * with a tiny hole.
 */
import type { CountryGeometry } from "../types";

export function rewindFeatureCollection(fc: any): { ringsFlipped: number; featuresVisited: number } {
  let ringsFlipped = 0;
  let featuresVisited = 0;
  if (!fc || !Array.isArray(fc.features)) return { ringsFlipped, featuresVisited };
  for (const f of fc.features) {
    if (!f || !f.geometry) continue;
    featuresVisited += 1;
    ringsFlipped += rewindGeometry(f.geometry);
  }
  return { ringsFlipped, featuresVisited };
}

export function rewindCountryGeometry(country: CountryGeometry): { adm1: number; adm2: number } {
  const a1 = rewindFeatureCollection(country.adm1);
  const a2 = country.adm2 ? rewindFeatureCollection(country.adm2) : { ringsFlipped: 0, featuresVisited: 0 };
  return { adm1: a1.ringsFlipped, adm2: a2.ringsFlipped };
}

export function rewindGeometry(g: any): number {
  if (!g || typeof g !== "object") return 0;
  if (g.type === "Polygon") return rewindPolygon(g.coordinates);
  if (g.type === "MultiPolygon") {
    let total = 0;
    for (const p of g.coordinates) total += rewindPolygon(p);
    return total;
  }
  if (g.type === "GeometryCollection" && Array.isArray(g.geometries)) {
    let total = 0;
    for (const inner of g.geometries) total += rewindGeometry(inner);
    return total;
  }
  return 0;
}

function rewindPolygon(polygon: number[][][]): number {
  if (!Array.isArray(polygon) || polygon.length === 0) return 0;
  let count = 0;
  // d3-geo spherical convention: outer CW, inner CCW.
  if (rewindRing(polygon[0], /* targetCCW */ false)) count += 1;
  for (let i = 1; i < polygon.length; i++) {
    if (rewindRing(polygon[i], /* targetCCW */ true)) count += 1;
  }
  return count;
}

function rewindRing(ring: number[][], targetCCW: boolean): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  const isCCW = sum > 0;
  if (isCCW === targetCCW) return false;
  ring.reverse();
  return true;
}

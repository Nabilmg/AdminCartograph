/**
 * Pick a "pole of inaccessibility" inside each polygon as the label anchor.
 * polylabel handles concave shapes better than raw centroids and lets us
 * implement spec features like "label largest polygon part" and "avoid holes".
 */
import polylabel from "polylabel";

export interface AnchorOptions {
  largestPartOnly: boolean;
  avoidHoles: boolean;
}

/**
 * Returns the anchor in the same coordinate space as the geometry. Callers
 * pass either geographic (lon/lat) or already-projected (px) coordinates and
 * the result is consistent with that input.
 */
export function pickAnchor(geometry: any, options: AnchorOptions): [number, number] | null {
  if (!geometry) return null;
  const rings = collectRings(geometry, options.largestPartOnly, options.avoidHoles);
  if (!rings.length) return null;
  try {
    const [x, y] = polylabel(rings, 1.0);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  } catch {
    // fall through
  }
  const outer = rings[0];
  if (!outer) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of outer) { sx += x; sy += y; }
  return [sx / outer.length, sy / outer.length];
}

function collectRings(geometry: any, largestPartOnly: boolean, avoidHoles: boolean): number[][][] {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    return avoidHoles ? [rings[0]] : rings;
  }
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as number[][][][];
    if (!polys.length) return [];
    let chosen = polys[0];
    if (largestPartOnly) {
      let bestIdx = 0;
      let bestArea = -Infinity;
      for (let i = 0; i < polys.length; i++) {
        const a = ringArea(polys[i][0]);
        if (a > bestArea) { bestArea = a; bestIdx = i; }
      }
      chosen = polys[bestIdx];
    }
    return avoidHoles ? [chosen[0]] : chosen;
  }
  return [];
}

function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[i][1] + ring[j][1]);
  }
  return Math.abs(a / 2);
}

export function fitsInside(bbox: [number, number, number, number], anchor: [number, number], width: number, height: number): boolean {
  const [minX, minY, maxX, maxY] = bbox;
  const halfW = width / 2;
  const halfH = height / 2;
  return anchor[0] - halfW >= minX && anchor[0] + halfW <= maxX && anchor[1] - halfH >= minY && anchor[1] + halfH <= maxY;
}

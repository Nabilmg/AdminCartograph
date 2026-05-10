/**
 * Pick a centred anchor inside each polygon for labels and bubbles.
 *
 * Strategy: use the area-weighted geometric centroid first — it matches
 * what users expect by "the centre" for most shapes. For genuinely
 * concave polygons where the centroid lands outside the outer ring we
 * fall back to polylabel (pole of inaccessibility), which guarantees a
 * point inside the polygon at the cost of biasing toward the polygon's
 * widest section. This hybrid keeps elongated / irregular states like
 * North Darfur visually centred without breaking concave / L-shaped
 * polygons.
 */
import polylabel from "polylabel";
import * as d3 from "d3";

export interface AnchorOptions {
  largestPartOnly: boolean;
  avoidHoles: boolean;
  /** Outer rings of sibling features that are spatially enclosed by
   *  the polygon being anchored — Budapest inside Pest megye, Vatican
   *  inside Lazio, Lesotho inside South Africa, etc. Treated as
   *  additional holes when picking the anchor so the label sits in
   *  the surrounding ring rather than on top of the enclave. Same
   *  coordinate space as `geometry`. */
  virtualHoles?: number[][][];
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
  const outer = rings[0];
  // Real holes from the polygon's inner rings + any virtual holes
  // (sibling enclaves) supplied by the caller. Both are treated the
  // same way: the centroid candidate is rejected if it lies inside
  // any of them, and polylabel is given all of them so the largest
  // inscribed circle skips them.
  const realHoles = rings.slice(1);
  const virtualHoles = (options.virtualHoles || []).filter((r) => r && r.length >= 3);
  const allHoles = [...realHoles, ...virtualHoles];
  const allRings = [outer, ...allHoles];

  // Try the area-weighted centroid first — most polygons are mostly
  // convex and the centroid is what users intuit as "the centre". The
  // candidate is accepted only when it actually lies inside the
  // polygon: inside the outer ring AND outside every (real OR
  // virtual) hole.
  if (outer && outer.length >= 3) {
    const centroid = d3.polygonCentroid(outer as [number, number][]);
    if (
      Number.isFinite(centroid[0]) && Number.isFinite(centroid[1]) &&
      d3.polygonContains(outer as [number, number][], centroid) &&
      !allHoles.some((h) => d3.polygonContains(h as [number, number][], centroid))
    ) {
      return [centroid[0], centroid[1]];
    }
  }

  // Concave / weird shapes (or centroid landed in a hole): polylabel
  // guarantees an interior point and naturally avoids holes when they
  // are passed in alongside the outer ring.
  try {
    const [x, y] = polylabel(allRings, 1.0);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  } catch {
    // fall through
  }
  if (!outer) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of outer) { sx += x; sy += y; }
  return [sx / outer.length, sy / outer.length];
}

function collectRings(geometry: any, largestPartOnly: boolean, avoidHoles: boolean): number[][][] {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    // avoidHoles=true (default) — keep the holes so polylabel /
    // centroid avoid placing the label inside them. avoidHoles=false
    // strips the holes, letting the label sit anywhere inside the
    // outer ring (including over an enclave). The previous
    // implementation had this inverted.
    return avoidHoles ? rings : [rings[0]];
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
    return avoidHoles ? chosen : [chosen[0]];
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

/**
 * Pick a label anchor inside a polygon that is biased TOWARD a given
 * target point in the same coordinate space. Used in drill view so that
 * neighbour Admin1 labels come close to the border they share with the
 * drilled state instead of sitting at the polygon's interior centroid
 * (which is often outside the visible canvas).
 *
 * Implementation: linearly interpolate between the polygon's centroid
 * (polylabel) and the closest vertex on its outer ring to the target.
 * `weight` of 0 returns the centroid, 1 returns the boundary point.
 * 0.7 reads as "70% of the way from centroid to the border that faces
 * the focused state".
 *
 * Coordinates of `geometry` and `target` must be in the same space —
 * i.e. both already projected to screen pixels.
 */
export function pickAnchorTowardPoint(geometry: any, target: [number, number], weight: number): [number, number] | null {
  if (!geometry) return null;
  const rings = collectRings(geometry, true, true);
  if (!rings.length) return null;
  const outer = rings[0];
  if (!outer || outer.length < 3) return null;

  // Centroid via polylabel (best interior point even for concave shapes).
  let centroid: [number, number];
  try {
    const [cx, cy] = polylabel(rings, 1.0);
    centroid = Number.isFinite(cx) && Number.isFinite(cy) ? [cx, cy] : averagePoint(outer);
  } catch {
    centroid = averagePoint(outer);
  }

  // Closest vertex on the outer ring to the target.
  let bestDist = Infinity;
  let closest = outer[0] as [number, number];
  for (const p of outer) {
    const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
    if (d < bestDist) {
      bestDist = d;
      closest = p as [number, number];
    }
  }

  const w = Math.max(0, Math.min(1, weight));
  return [
    centroid[0] + (closest[0] - centroid[0]) * w,
    centroid[1] + (closest[1] - centroid[1]) * w
  ];
}

function averagePoint(ring: number[][]): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  return [sx / ring.length, sy / ring.length];
}

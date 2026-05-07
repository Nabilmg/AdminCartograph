/**
 * Loads the embedded TopoJSON bundle and decodes it into per-country
 * FeatureCollections. The bundle is generated at build time by
 * scripts/build-topojson.js and webpacked as a JSON module via the embedded
 * data import in visual.ts.
 */
import type { CountryGeometry } from "../types";
import { feature } from "topojson-client";

interface CountryIndexEntry {
  iso3: string;
  name: string;
  maxAdm: number;
  bbox: [number, number, number, number];
  adm1Count: number;
  adm2Count: number;
}

export class GeometryLoader {
  private topology: any;
  private index: Record<string, CountryIndexEntry>;
  private adm1All: any;
  private adm2All: any;
  private cache = new Map<string, CountryGeometry>();

  constructor(topology: any, index: Record<string, CountryIndexEntry>) {
    this.topology = topology;
    this.index = index || {};
    // Decode once — these are FeatureCollections that span every country.
    this.adm1All = topology && topology.objects && topology.objects.adm1 ? feature(topology, topology.objects.adm1) : { type: "FeatureCollection", features: [] };
    this.adm2All = topology && topology.objects && topology.objects.adm2 ? feature(topology, topology.objects.adm2) : { type: "FeatureCollection", features: [] };
  }

  listCountries(): { iso3: string; name: string }[] {
    return Object.values(this.index).map((c) => ({ iso3: c.iso3, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Get the geometry for an ISO-3 code, or null if not embedded. */
  forIso3(iso3: string): CountryGeometry | null {
    if (!iso3) return null;
    const key = iso3.toUpperCase();
    if (this.cache.has(key)) return this.cache.get(key)!;
    if (!this.index[key]) return null;
    const adm1 = filterFC(this.adm1All, key);
    const adm2 = filterFC(this.adm2All, key);
    const result: CountryGeometry = {
      iso3: key,
      name: this.index[key].name,
      adm1,
      adm2: adm2.features.length ? adm2 : null
    };
    this.cache.set(key, result);
    return result;
  }

  /**
   * Best-effort guess: pick the country whose ADM1 PCODEs cover the most rows
   * in the dataset. PCODEs from fieldmaps.io start with the ISO-2 country code,
   * so we group by the leading 2 chars and look up the ISO-3 of that ISO-2.
   */
  inferIso3(pcodes: Iterable<string>): string | null {
    const counts: Record<string, number> = {};
    for (const p of pcodes) {
      if (!p) continue;
      const prefix = p.slice(0, 2).toUpperCase();
      counts[prefix] = (counts[prefix] || 0) + 1;
    }
    let bestPrefix: string | null = null;
    let bestCount = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (v > bestCount) {
        bestCount = v;
        bestPrefix = k;
      }
    }
    if (!bestPrefix) return null;
    // Find an ISO-3 in our index whose ADM1 features start with this prefix.
    for (const iso3 of Object.keys(this.index)) {
      const sample = (this.adm1All.features as any[]).find((f) => f.properties.ISO3 === iso3);
      if (sample && sample.properties.ADM1_PCODE && String(sample.properties.ADM1_PCODE).startsWith(bestPrefix)) {
        return iso3;
      }
    }
    return null;
  }
}

function filterFC(fc: any, iso3: string): any {
  return {
    type: "FeatureCollection",
    features: (fc.features as any[]).filter((f) => f.properties && f.properties.ISO3 === iso3)
  };
}

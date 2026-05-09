# country-geojson/

Drop fieldmaps.io GeoJSON zips here, one per country, named
`<ISO3>.geojson.zip`. The build pipeline reads every zip in this
folder and merges them into a single `releases/AdminCartograph.pbiviz`.

```
country-geojson/
  AFG.geojson.zip
  COD.geojson.zip
  HTI.geojson.zip
  IRN.geojson.zip
  LBN.geojson.zip
  SDN.geojson.zip
  SYR.geojson.zip
  YEM.geojson.zip
  ...
```

## Quick recipe

```bash
# 1. Drop a fieldmaps.io zip into this folder.
cp ~/Downloads/KEN.geojson.zip country-geojson/

# 2. Rebuild — sync, build TopoJSON, package.
npm run release

# 3. The new releases/AdminCartograph.pbiviz now contains Kenya
#    alongside everything that was already bundled.
```

The Country dropdown in the visual's format pane is auto-generated
from this folder at build time, so it always reflects exactly what's
bundled.

## What `npm run release` does

1. **Extract**: every `<ISO3>.geojson.zip` is unpacked into
   `scripts/data/raw/<ISO3>/`.
2. **Build**: `scripts/build-topojson.js` merges every country's
   ADM1 + (optional) ADM2 GeoJSONs into a single simplified
   TopoJSON at `assets/geometry/world.topojson.json`. It also writes
   `src/generated/countries.ts` so the dropdown options match.
3. **Package**: `pbiviz package` produces the final `.pbiviz`.

## Filename conventions

- **Always uppercase ISO-3** in the filename (`SDN.geojson.zip`, not
  `sdn.geojson.zip`). The sync script normalises lowercase, but
  uppercase is the canonical form. CI / collaborators avoid the
  case-collision warning if you stick to uppercase.
- The expected suffix is `.geojson.zip` (the format fieldmaps.io
  ships).

## Where to find fieldmaps.io zips

<https://fieldmaps.io/data/cod/originals/>

Each country has three downloads (Shapefile, GeoJSON, GPKG). Use
the **GeoJSON** link.

For OCHA's full Common Operational Datasets catalog see
<https://data.humdata.org/dataset/cod-ab>.

## Per-country builds (advanced)

If you also want individual `.pbiviz` files per country (each with
its own GUID and display name, so Power BI can host several
side-by-side without conflict), use the secondary pipeline:

```bash
node scripts/release-all.js              # all countries
node scripts/release-all.js SDN YEM      # just these two
```

Outputs land in `releases/admChoroplethBubbleMap-<ISO>.pbiviz`. The
default `npm run release` produces only the unified bundle — the
recommended distribution.

## Bundle size budget

Power BI's hard limit is ~50 MB per `.pbiviz`. Practical loading
time stays comfortable up to about 5 MB of bundle.

| Countries | Approximate `.pbiviz` size at default simplify |
|-----------|------------------------------------------------|
| 1 | ~150 KB |
| 8 (current default bundle) | ~630 KB |
| 25 | ~2-3 MB |
| 50 | ~5-6 MB |
| 100+ | ~12-15 MB |

For very large bundles, increase the simplification weight:

```bash
node scripts/build-topojson.js --simplify 0.001 --quantize 5000
```

See [Build Pipeline](../wiki/Build-Pipeline.md) for the full set of
flags and options.

## See also

- [Adding a Country to the Bundle](../wiki/Adding-Your-Own-Country-to-the-Bundle.md)
- [Custom Geometry Upload](../wiki/Custom-Geometry-Upload.md) — the
  *runtime* upload alternative (no rebuild needed)
- [Build Pipeline](../wiki/Build-Pipeline.md)

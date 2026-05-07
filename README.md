# ADM Choropleth + Bubble Map (Power BI custom visual)

A choropleth + bubble map visual for Power BI that renders country-level
administrative boundaries (ADM1 / ADM2) using **PCODE matching** against
geometry that is **embedded inside the visual at build time**. Report users
do not need to upload TopoJSON, GeoJSON or shapefiles into Power BI.

Source geometry: <https://fieldmaps.io/data/cod/>.

## Capabilities

- Choropleth fills with quantile / equal-interval / manual classification
- Automatic ramp from a base color, or 5 user-defined class colors
- Proportional bubbles (square-root scaling)
- Combined value + bubble legend in a stylable container
- State / locality drill: click a state to view its localities
- View modes: Auto, States (ADM1), Localities (ADM2)
- Highlights, cross-filtering, tooltips, keyboard focus
- Per-level border, label, font, halo, decimals, number-format options
- 154 countries supported out of the box (sourced from the workbook in
  `scripts/data/`); only ADM1+ADM2 are bundled

## Project layout

```
capabilities.json      Power BI data role + objects schema
pbiviz.json            Visual metadata
src/
  visual.ts            Entry point, lifecycle, layer composition
  settings.ts          Strongly-typed formatting model
  data/dataConverter.ts  DataView -> AreaDatum map
  geo/geometryLoader.ts  Decodes embedded TopoJSON, exposes per-country FCs
  render/
    classification.ts    Quantile / equal / manual breaks + ramp
    choropleth.ts        Polygon fills + borders
    bubbles.ts           Proportional circle layer
    labels.ts            Label engine (anchor, halo, fit-to-shape)
    labelPlacement.ts    polylabel-based anchor selection
    legend.ts            Combined value + bubble legend
    projection.ts        d3.geoMercator + fitExtent
    format.ts            Number formatter
scripts/
  parse-countries-excel.js  Reads the workbook -> scripts/data/countries.json
  fetch-geometry.js         Downloads each country's GeoJSON zip from fieldmaps.io
  build-topojson.js         Merges into a single simplified+quantized TopoJSON
  data/countries.json       Source-of-truth country list (154 countries)
assets/
  geometry/world.topojson.json   Embedded geometry bundle (built artifact)
  geometry/country-index.json    Per-country bbox + counts (built artifact)
  icon.png                       Visual icon
style/visual.less               Visual styles
```

## Build prerequisites

- Node.js 18+
- `pbiviz` (`npm i -g powerbi-visuals-tools`)
- A Power BI Pro / PPU account to upload the visual

## Build the geometry bundle (one-time)

```bash
npm install
# (Re)generate scripts/data/countries.json from the workbook:
node scripts/parse-countries-excel.js path/to/all_countries_maps_links.xlsx
# Download every country's GeoJSON zip into scripts/data/raw/<ISO3>/:
npm run fetch-geometry
# Merge ADM1 + ADM2 into a single simplified TopoJSON in assets/geometry/:
npm run build-topojson
# (`npm run build-data` runs both steps in sequence.)
```

`build-topojson.js` accepts `--simplify <weight>` and `--quantize <int>` flags
to trade off bundle size against visual fidelity. Defaults (simplify 0.0005,
quantize 10000) produce a ~25-35 MB bundle for the full 154-country set.

You can shrink the bundle further by either:

1. Editing `scripts/data/countries.json` to drop countries you don't need, or
2. Increasing the simplify weight (e.g. `npm run build-topojson -- --simplify 0.001`).

## Build / package the visual

```bash
npm start              # interactive dev (pbiviz start)
npm run package        # produces dist/<name>.pbiviz
```

Upload the `.pbiviz` to Power BI Service > Workspace > Get more visuals > Import a visual file.

## Using the visual in a report

1. Add the visual to the report.
2. Bind one of:
   - `State PCODE (ADM1)` — required for ADM1 view
   - `Locality PCODE (ADM2)` — enables drill / locality view
3. Optional bindings: `Color Value`, `Bubble Size`, `Label Value 2`, `Label Text 1`, `Tooltips`.
4. In the format pane:
   - `General > Country (ISO-3)` — set explicitly (e.g. `SDN`) or leave blank
     to auto-detect from the leading two characters of the PCODE.
   - `General > View mode` — Auto (default), States, or Localities.

PCODEs must match the values stored in the embedded geometry. fieldmaps.io
COD data uses official OCHA PCODEs (e.g. `SD01` for Khartoum state).

## Why TopoJSON

The bundle uses TopoJSON because:

- Shared topology between ADM1 / ADM2 deduplicates boundary arcs and reduces
  size by ~40-60 % vs. raw GeoJSON.
- Quantization rounds coordinates to a fixed integer grid, further reducing
  size with imperceptible loss at country zoom levels.
- `topojson-simplify` produces tier-able simplification so you can re-bundle
  at different fidelities without re-downloading source data.

## Notes / limitations

- Curved label placement is approximated; complex SDF-based labelling is left
  for a future revision.
- The visual respects Power BI's filter context implicitly (categories that
  fall out of scope simply disappear from the dataView). Cross-filter on
  click selects the locality and pushes through `selectionManager`.
- Some countries in the workbook only ship ADM1 (`maxAdm = 1`). The visual
  detects this and disables locality drill for those countries.

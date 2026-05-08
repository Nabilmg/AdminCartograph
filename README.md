# AdminCartograph

A Power BI custom visual for **multi-layer subnational mapping**:
choropleth fills, proportional bubbles, and pie / donut / column overlays
on top of administrative boundaries (Admin1 + Admin2), with **boundaries
embedded inside the visual** so report users don't have to upload TopoJSON
or shapefiles. Boundaries source: <https://fieldmaps.io/data/cod/>.

![logo](assets/logo.png)

## Why not just use Shape Map?

Power BI's built-in **Shape Map** visual has real gaps for serious admin-
boundary reporting. AdminCartograph closes them:

| Feature | Built-in Shape Map | AdminCartograph |
|---|---|---|
| **Area labels** (name / value) | ✗ — none at all | ✓ full halo, font, color, rotation, fit-to-shape |
| **Embedded boundaries** | ✗ — must upload TopoJSON | ✓ 8 countries bundled |
| **PCODE-native binding** | ✗ — manual property mapping | ✓ |
| **Bubble overlay** | ✗ | ✓ size by measure |
| **Pie / donut / column overlay** | ✗ | ✓ multi-measure glyphs per area |
| **Drill Admin1 → Admin2** | ✗ | ✓ click + filter-driven + prev/next nav |
| **Scale bar** (km / miles) | ✗ | ✓ |
| **PNG / SVG export** | ✗ | ✓ A5 landscape + portable SVG |
| **Mouse / button zoom + pan** | ✗ | ✓ |
| **Custom upload** | ✓ TopoJSON | ✓ TopoJSON or GeoJSON, with auto field mapping |

Same data binding, dramatically more capability.

## Bundled countries

The shipping `.pbiviz` embeds the following 8 countries' Admin1 + Admin2
boundaries (165 Admin1 + 1,772 Admin2 features). The dropdown auto-detects
the correct country from your bound PCODEs, or you can pick one explicitly:

| ISO | Country | Admin1 | Admin2 |
|-----|---------|-------|--------|
| AFG | Afghanistan | 34 provinces | 421 districts |
| COD | DR Congo | provinces | territories |
| HTI | Haiti | departments | communes |
| IRN | Iran | provinces | counties |
| LBN | Lebanon | governorates | districts |
| SDN | Sudan | 19 states | 189 localities |
| SYR | Syria | governorates | districts |
| YEM | Yemen | 21 governorates | 333 districts |

The ninth dropdown option is **Custom (upload TopoJSON)** — see
[Using a custom country](#using-a-custom-country) below.

## Capabilities

- **Choropleth fill** with quantile / equal-interval / manual classification,
  automatic ramp from a base color or 5 user-defined class colors,
  optional "Treat 0 as no-data" mode.
- **Bubble overlay** (square-root scaling) with min/max radius, opacity,
  stroke and per-position label placement (above / below / left / right /
  center of the bubble).
- **Pie / Donut / Column overlay** driven by 2+ measures bound to a
  single role. Each measure becomes one slice / column. Independent
  category color palette and label placement.
- **Drill** from Admin1 to Admin2: click an Admin1 area to focus its
  children. Prev / next arrows navigate alphabetically through Admin1
  areas in drill view. "Country View" button returns to the all-Admin1
  view.
- **Cross-filter** through `selectionManager.select` so other visuals
  (tables, charts, slicers) respond to clicks on the map.
- **Filter-driven drill** in Auto mode: when an external slicer narrows
  the dataset to one Admin1 (or several Admin2 areas under one parent),
  the visual auto-drills into that focus.
- **Tooltips** on every layer with Admin1 + Admin2 names, color value,
  bubble value and any user-bound Tooltip fields.
- **Legends**: choropleth (vertical / horizontal), bubble size
  (vertical / horizontal / compact min-max), pie / column categories
  (vertical / horizontal). All three stack into a single rounded
  container when they share a corner.
- **Scale bar** (km or miles), latitude-aware, "nice round" distances,
  follows zoom.
- **Zoom + pan** with on-canvas controls (off by default). Mouse drag
  pans, mouse wheel zooms, directional buttons step the map.
- **PNG / SVG export** — A5-landscape PNG (1748 × 1240 @ ~300 DPI) for
  PowerPoint paste, or portable SVG with inlined CSS for vector tools.
- **Custom geometry upload** (separate Admin1 / Admin2 files, GeoJSON
  or TopoJSON, with auto-detected field mapping that the user confirms
  via dropdowns).

## Format pane (top-down flow)

1. **Map setup** — country dropdown, view mode, background, interaction
2. **Choropleth fill** — color mode, classification, breaks, opacity
3. **Bubble overlay** — size / color / label placement
4. **Pie / Column overlay** — type, categories, sizes
5. **Borders** — Admin1 / Admin2 stroke styling
6. **Admin1 labels**
7. **Admin2 labels — default view**
8. **Admin2 labels — drill view**
9. **Choropleth legend**
10. **Bubble legend**
11. **Pie / Column legend**
12. **Legend container** (shared frame styling)
13. **Scale bar**
14. **Map controls** (zoom / pan / export buttons)

## Data roles

| Role | Required | Used by |
|------|----------|---------|
| **Admin1 PCODE** | yes (or Admin2) | choropleth + bubble at Admin1 level |
| **Admin2 PCODE** | optional | choropleth + bubble at Admin2 level |
| **Color Value** | optional | choropleth fill |
| **Bubble Size** | optional | bubble overlay |
| **Glyph Values (pie / column)** | optional | pie / donut / column overlay (multi-measure) |
| **Label Value 2** | optional | overrides the auto-shown number in labels |
| **Label Text 1** | optional | overrides the area name shown in labels |
| **Tooltips** | optional | extra fields appended to every tooltip |

Bind at least one PCODE field to render. If only Admin1 PCODE is bound
(or the country has no Admin2 geometry), the visual stays in Admin1
mode and clicks just cross-filter without drilling.

## Project layout

```
capabilities.json                  Power BI data role + objects schema
pbiviz.json                        Visual metadata (name = adminCartograph)
country-geojson/                   Drop fieldmaps.io <ISO>.geojson.zip files here
  AFG.geojson.zip                  (8 countries already included)
  ...
src/
  visual.ts                        Entry point, lifecycle, layer composition
  settings.ts                      Strongly-typed formatting model
  data/dataConverter.ts            DataView -> AreaDatum map
  geo/geometryLoader.ts            Decodes embedded TopoJSON, exposes per-country FCs
  generated/countries.ts           AUTO-GENERATED — bundled country dropdown options
  render/
    classification.ts              Quantile / equal / manual breaks + ramp
    choropleth.ts                  Polygon fills + borders
    bubbles.ts                     Bubble layer
    glyphs.ts                      Pie / donut / column overlay
    labels.ts                      Label engine (anchor, halo, fit, curved/straight)
    labelPlacement.ts              polylabel + boundary-toward-target helpers
    legend.ts                      Choropleth + bubble + glyph legends, combined container
    scaleBar.ts                    Latitude-aware scale bar
    projection.ts                  d3.geoMercator + fitExtent
    format.ts                      Number formatter
scripts/
  sync-countries-from-geojson.js   Extracts country-geojson/*.zip -> raw + countries.json
  build-topojson.js                Merges into single simplified TopoJSON; writes generated/countries.ts
  release-all.js                   Optional: produce one .pbiviz per country
  parse-countries-excel.js         Helper for fieldmaps.io workbook (no longer required)
  fetch-geometry.js                Helper that fetches every fieldmaps.io zip if you want all 154 countries
assets/
  geometry/world.topojson.json     Embedded geometry bundle (built artifact)
  geometry/country-index.json      Per-country bbox + counts (built artifact)
  icon.png                         Visual icon
  logo.png / logo.svg              Hi-res logo
style/visual.less                  Visual styles
releases/
  AdminCartograph.pbiviz           Built visual, ready to import
```

## Build prerequisites

- Node.js 18+
- `pbiviz` CLI (`npm i -g powerbi-visuals-tools@5.4.0`)
- A Power BI Pro / PPU account if you want to upload to a workspace

## Build the visual

```bash
npm install                  # one time
npm run release              # sync country-geojson/ -> bundle -> .pbiviz
```

`npm run release` runs three steps in sequence:

1. `node scripts/sync-countries-from-geojson.js` — extract every
   `country-geojson/<ISO3>.geojson.zip` into `scripts/data/raw/<ISO3>/`
   and rewrite `scripts/data/countries.json`.
2. `node scripts/build-topojson.js` — merge ADM1 + ADM2 across every
   country into a single simplified, quantized TopoJSON at
   `assets/geometry/world.topojson.json`. Auto-writes
   `src/generated/countries.ts` so the country dropdown reflects the
   bundle.
3. `pbiviz package` — produces `dist/adminCartograph2026A1Pbi.1.0.0.0.pbiviz`.

Copy that file (or the latest `releases/AdminCartograph.pbiviz`) into
Power BI: **Visualizations → ⋯ → Import a visual file**.

## Adding more countries

```bash
# 1. Drop fieldmaps.io zips into the folder, named <ISO3>.geojson.zip
cp ~/Downloads/KEN.geojson.zip country-geojson/

# 2. Rebuild
npm run release

# 3. Import the new releases/AdminCartograph.pbiviz
```

The bundle scales: typical countries add 50–500 KB after simplification.
With Power BI's ~50 MB visual cap you can comfortably bundle 50+ countries
at the default simplification, more if you crank up `--simplify`:

```bash
node scripts/build-topojson.js --simplify 0.001 --quantize 5000
```

## Using a custom country

If you don't want to rebuild the bundle, the visual also supports
**runtime upload** of geometry (handy for one-off countries or non-OCHA
data sources):

1. In the format pane → **1. Map setup** → set **Country** to
   *Custom (upload TopoJSON)*.
2. The map canvas shows an upload card. Pick the Admin1 file (required)
   and Admin2 file (optional). Both accept TopoJSON (`type: "Topology"`)
   and GeoJSON (`type: "FeatureCollection"`).
3. The visual lists every property name found in the file's features
   and pre-fills four mapping dropdowns (Admin1 PCODE, Admin1 Name,
   Admin2 PCODE, Admin2 Name) using fuzzy matches against common
   patterns (`ADM1_PCODE` / `ADM1PCODE` / `pcode_1` / `gid_1` / etc.).
4. Confirm or override the mapping, then click **Load map**. The
   uploaded geometry is saved into the report's metadata via
   `host.persistProperties` so it survives report save / reload.

The uploaded TopoJSON / GeoJSON content is stored inside the `.pbix`,
so each MB of geometry adds about that much to the report file.
Practical limit ~5 MB per upload.

## Using the visual in a report

1. Add the visual to the report.
2. Bind any of:
   - **Admin1 PCODE** — required for an Admin1-only choropleth
   - **Admin2 PCODE** — adds drill / locality view
3. Optional bindings: **Color Value**, **Bubble Size**,
   **Glyph Values** (multiple measures for pie / column),
   **Label Value 2**, **Label Text 1**, **Tooltips**.
4. In the format pane:
   - **1. Map setup** → **Country** auto-detects from PCODE prefix; pick
     a specific country to override or **Custom** to upload.
   - **1. Map setup** → **View mode**: Auto / Admin1 / Admin2.
   - Tweak any of the 14 cards.

## Notes / limitations

- Curved label placement is approximated with a quadratic Bezier; full
  text-on-arc-along-medial-axis is left for a future revision.
- Cross-filter on click submits selection through the host's
  `selectionManager`. If interaction is disabled in the format pane,
  clicks no longer drill or filter (tooltips still work).
- Some countries in the workbook only ship ADM1. The visual detects
  this and stays in Admin1 mode for those countries.
- PNG export depends on the host allowing canvas serialisation; falls
  back to a download in environments where the clipboard / canvas API
  is restricted.

## License

ISC, but the bundled OCHA Common Operational Datasets carry their own
licensing terms. See <https://fieldmaps.io/data/cod/> and the OCHA HDX
licence for each country.

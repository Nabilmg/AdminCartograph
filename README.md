# AdminCartograph

A Power BI custom visual for **multi-layer subnational maps**.
Upload your country's GeoJSON or TopoJSON, bind a PCODE column, and
get choropleth fills, bubbles, and pie / donut / column overlays with
drill-down between Admin1 and Admin2.

![logo](assets/logo.png)

## What it looks like

> 📸 *Real-data screenshots go here. Drop PNGs into
> `assets/screenshots/` with the filenames listed below and the
> README will pick them up.*

![Hero — choropleth + bubbles + labels](assets/screenshots/01-hero.png)

![Drill view — focused Admin1 with title pill and prev/next navigation](assets/screenshots/04-drill.png)

| File | What to capture |
|---|---|
| `01-hero.png` | Full-canvas Admin1 view: choropleth + bubbles + labels visible, value legend in a corner |
| `02-format-pane.png` | Format pane open with the 14 numbered cards visible |
| `03-three-layers.png` | Choropleth + bubbles + donut overlay all active |
| `04-drill.png` | Drill view: title pill top-left, prev/next arrows, focused state's Admin2 polygons |
| `05-custom-upload.png` | Custom upload card with the field-mapping dropdowns populated |
| `06-powerpoint.png` | A PowerPoint slide with the exported A5 PNG inserted |

See [`assets/screenshots/README.md`](assets/screenshots/README.md) for
how to capture each shot in Power BI Desktop.

## Bring your own geometry — the headline feature

Most users get here because Power BI's stock map visuals don't handle
subnational boundaries the way they need. AdminCartograph makes
geometry **your data, not the visual's**:

1. Open the format pane → **1. Map setup** → set **Country** to
   *Custom (upload TopoJSON)*.
2. The map canvas shows an upload card. Pick the **Admin1** file
   (required) and the **Admin2** file (optional). Both accept
   `.json`, `.topojson` and `.geojson`.
3. The visual reads every distinct property name from your file and
   pre-fills four dropdowns (Admin1 PCODE, Admin1 Name, Admin2
   PCODE, Admin2 Name) using fuzzy matches against common patterns
   (`ADM1_PCODE` / `pcode_1` / `gid_1` / `state_id` / etc.).
4. Confirm or override the field mapping, then click **Load map**.

The uploaded geometry is saved into the report's metadata via
`host.persistProperties` so it survives report save / reload. ~5 MB
total per upload is a comfortable ceiling — each MB adds about that
much to the .pbix.

> Whatever country, whatever property names, whatever level of
> simplification you want — bring it. The visual adapts.

## Bundled countries

For convenience only, the shipping `.pbiviz` includes eight countries
(165 Admin1 + 1,772 Admin2 features) you can pick from a dropdown
without uploading anything: **AFG, COD, HTI, IRN, LBN, SDN, SYR, YEM**.
None of this is required — the Custom upload path covers any country
or any boundary version you prefer.

## Capabilities

- **Choropleth fill** — quantile / equal-interval / manual classification
  for numeric measures, plus a **Categorical** mode for string columns
  (`High` / `Medium` / `Low`, `Severity 1-N`) or numeric values you want
  shown as discrete labels. Automatic ramp from a base color or 5 user-
  defined classes; optional "Treat 0 as no-data".
- **Bubble overlay** — square-root scaling; constant on-screen size as
  the user zooms (toggle, default on); label placement above / below /
  left / right / center.
- **Pie / Donut / Column / Concentric circles overlay** — driven by 2+
  measures. Pie / donut slice each value; column draws side-by-side
  bars; concentric stacks circles sharing the same centre, each sized
  by sqrt(value) so area is proportional. Constant on-screen size on
  zoom (toggle, default on); independent palette and label placement.
- **Country outer glow** — soft halo behind every layer, colour /
  radius / opacity controls; off by default.
- **Drill** — click an Admin1 to focus its Admin2 children. The
  focused state's name pill stays anchored top-left across pan / zoom;
  prev / next arrows step alphabetically; "Country View" returns to
  all-Admin1. Neighbour state borders + labels dim to ~55%, polygon
  fills are blanked to the visual background, and neighbour labels
  drop their value lines so the focused state reads cleanly.
- **Filter dimming** — in Admin2 view, states excluded by a slicer get
  the same dim / blank-fill treatment (no drill click required).
- **Cross-filter** through `selectionManager.select`. Re-clicking the
  same area or clicking the map background clears the filter; Ctrl /
  Cmd-click multi-selects.
- **Filter-driven drill** — in Auto mode, when a slicer narrows to one
  Admin1 (or several Admin2 in one parent), the visual auto-drills.
- **Admin1-only when only Admin1 PCODE is bound** — visual stays a flat
  Admin1 choropleth, no drill / Admin2 view, regardless of the View
  Mode dropdown. Bind both PCODEs to re-enable drill.
- **Admin1 / Admin2 aliases** — text inputs on card 1 (Map setup) so
  tooltips read in your terminology (Governorate / District,
  State / Locality, etc.).
- **Tooltips** with Admin1 + Admin2 names (using your aliases), the
  choropleth measure, bubble measure, every Glyph Values measure
  (with `(% of total)` when 2+ are bound), and any extra Tooltip
  fields. Pulls in the user's chosen terminology.
- **Five legends** — choropleth, bubble size, pie / column / concentric
  categories, **Values legend** (lists each bound label measure with a
  `#` swatch in the matching label-value colour), and a unified
  container that combines them when they share a corner. Header
  colour / bold / font-size and a vertical-or-horizontal stacking
  toggle on the container card.
- **Scale bar** — km or miles, latitude-aware, sits flush against its
  corner (legend dodges the bar) and live-updates with zoom.
- **Zoom + pan** — on-canvas buttons, mouse drag, mouse wheel. The
  reset button always appears after any pan / zoom regardless of the
  "Show zoom buttons" toggle.
- **Hide map chrome** — single toggle in Map setup that drops the
  drill back-bar + control panel for clean dashboard embeds.
- **PCODE-tolerant matching** — case + separator differences (`sd-01`,
  `SD_01`, `SD 01`) all match the canonical `SD01`. When no PCODEs
  match, an on-canvas banner shows samples from both data and
  geometry side so you can spot the convention mismatch immediately.
- **SVG export** — portable SVG with inlined CSS for Illustrator /
  Inkscape / browser. **Download button** in the export modal saves
  the file directly so big-country exports don't get truncated by
  the clipboard. The SVG includes everything visible — choropleth,
  bubbles, charts, labels, all five legends, scale bar, drill title
  pill, country glow.
- **Rich label engine** — explicit *Name source* (Geometry vs Label
  Text 1 override) and *Value source* (any combination of Choropleth /
  Bubble / Label Value 2) dropdowns; constant on-screen size on zoom
  (toggle); halo, italic, bold, decimals, K/M format, curved /
  straight / boundary placement, fit-to-shape, abbreviation,
  hide-on-overflow; spatial-enclave detection so labels avoid embedded
  sibling polygons (Pest megye → Budapest, Lazio → Vatican).

## Format pane (top-down flow)

1. **Map setup** — country, view mode, background, aliases, hide chrome
2. **Choropleth fill** — Quantile / Equal / Manual / **Categorical**
3. **Bubble overlay**
4. **Pie / Donut / Column / Concentric overlay**
5. **Borders** (incl. country outer glow)
6. **Admin1 labels**
7. **Admin2 labels — default view**
8. **Admin2 labels — drill view**
9. **Choropleth legend**
10. **Bubble legend**
11. **Pie / Column legend**
12. **Values legend** — lists each bound label measure with a `#` swatch
13. **Legend container** — header style, vertical / horizontal stacking
14. **Scale bar**
15. **Map controls** (zoom / pan / SVG export)

## Data roles

| Role | Required | Used by |
|------|----------|---------|
| **Admin1 PCODE** | yes (or Admin2) | choropleth + bubble at Admin1 level |
| **Admin2 PCODE** | optional | choropleth + bubble at Admin2 level |
| **Choropleth fill** | optional | choropleth fill (numeric or categorical) |
| **Bubble Size** | optional | bubble overlay |
| **Glyph Values (pie / column)** | optional | multi-measure pie / donut / column |
| **Label Value 2** | optional | overrides the auto-shown number in labels |
| **Label Text 1** | optional | overrides the area name shown in labels |
| **Tooltips** | optional | extra fields appended to every tooltip |

If only Admin1 PCODE is bound (or your geometry has no Admin2), the
visual stays in Admin1 mode and clicks just cross-filter without
drilling.

## Build

```bash
npm install                  # one time
npm run release              # builds releases/AdminCartograph.pbiviz
```

Imports into Power BI Desktop / Service via **Visualizations → ⋯ →
Import a visual file**.

## Bundled countries are a closed set

The shipped `.pbiviz` includes AFG, COD, HTI, IRN, LBN, SDN, SYR,
YEM. That set is closed — additions aren't accepted. For any other
country, end users go through the visual's design-time **Custom
(upload TopoJSON)** flow; the uploaded geometry persists with the
`.pbix` so anyone opening the saved report sees the right map.

## Project layout

```
capabilities.json                Power BI data role + objects schema
pbiviz.json                      Visual metadata
country-geojson/                 fieldmaps.io <ISO>.geojson.zip files for the bundle
src/
  visual.ts                      Entry point, lifecycle, layer composition
  settings.ts                    Strongly-typed formatting model
  data/dataConverter.ts          DataView -> AreaDatum map
  geo/geometryLoader.ts          Decodes embedded TopoJSON
  generated/countries.ts         AUTO-GENERATED dropdown options
  render/
    classification.ts            Quantile / equal / manual breaks + ramp
    choropleth.ts                Polygon fills + borders
    bubbles.ts                   Bubble layer
    glyphs.ts                    Pie / donut / column overlay
    labels.ts                    Label engine
    labelPlacement.ts            Anchor helpers
    legend.ts                    Three legends + combined container
    scaleBar.ts                  Latitude-aware scale bar
    projection.ts                d3.geoMercator + fitExtent
    format.ts                    Number formatter
scripts/
  sync-countries-from-geojson.js Extracts country-geojson/*.zip
  build-topojson.js              Bundle builder + dropdown writer
  release-all.js                 Optional per-country builds
  fetch-geometry.js              Bulk fetch from fieldmaps.io
assets/
  geometry/                      Built geometry artifacts
  icon.png, logo.png/svg         Visual logo
  screenshots/                   Real-data screenshots (drop PNGs here)
style/visual.less                Visual styles
releases/
  AdminCartograph.pbiviz         Built visual, ready to import
```

## Notes / limitations

- Curved label placement is a quadratic Bezier approximation; full
  text-on-medial-axis is on the roadmap.
- Cross-filter on click flows through the host's `selectionManager`.
  Disabling Interaction in the format pane stops drill / filter (but
  keeps tooltips).
- PNG copy-to-clipboard is currently disabled — Power BI Service +
  Desktop both block `navigator.clipboard.write` on PNG blobs from a
  visual iframe. Use the **SVG** button for portable export; paste
  the SVG into Illustrator / Inkscape / a browser, or save it as
  `.svg` and rasterise externally.

## License

ISC. Bundled OCHA Common Operational Datasets carry their own
licensing terms — see <https://fieldmaps.io/data/cod/>.

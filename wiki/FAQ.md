# FAQ

Quick answers to common questions. For deeper coverage, follow the
links to detailed pages.

## What is AdminCartograph?

A custom Power BI visual for multi-layer subnational maps. It
renders choropleth fills, bubbles, and pie/donut/column overlays
on top of administrative boundaries (Admin1 + Admin2), with drill
between the two levels and **boundaries-as-data** (you bring your
own GeoJSON / TopoJSON).

## How does it differ from "just upload a Shape Map"?

The big-three differences:

1. **Labels.** AdminCartograph has a full label engine (halo, font,
   placement, fit-to-shape). The built-in Shape Map shows no labels
   at all.
2. **Multi-layer.** Choropleth + bubbles + pie/column overlays
   stacked on the same map.
3. **Drill.** Click an Admin1, drill into its Admin2 children;
   prev/next arrows step alphabetically through Admin1s; "Country
   View" returns.

Plus PCODE-native binding, scale bar, PNG/SVG export, zoom + pan,
and 8 countries pre-bundled for convenience.

## Do I have to upload geometry?

No — eight countries (AFG, COD, HTI, IRN, LBN, SDN, SYR, YEM) are
embedded in the visual already. If your data is for one of those,
just bind the PCODE column and the right country renders.

For any other country, **Country = Custom** lets you upload
GeoJSON or TopoJSON at runtime. See [Custom Geometry
Upload](Custom-Geometry-Upload.md).

## Can I add my country to the bundle so my colleagues don't have to upload?

Yes. Drop `<ISO3>.geojson.zip` (the OCHA COD geojson zip from
fieldmaps.io) into `country-geojson/`, run `npm run release`,
share the new `.pbiviz`. See [Adding a Country to the
Bundle](Adding-Your-Own-Country-to-the-Bundle.md).

## What format do I upload?

Either **TopoJSON** (`type: "Topology"`) or **GeoJSON**
FeatureCollection. Both work. See [Custom Geometry
Upload](Custom-Geometry-Upload.md).

## What if my geometry's property names aren't `ADM1_PCODE`?

The visual asks you. After uploading, four dropdowns let you map
your file's property names (`STATE_ID`, `district_code`, whatever)
to the Admin1 PCODE / Admin1 Name / Admin2 PCODE / Admin2 Name
roles.

## My data uses Pcodes like `01` instead of `SD01` — how do I match?

Either:

- Pre-pend the ISO-2 in your data: `"SD" & [Pcode]` in DAX.
- Upload geometry whose `ADM1_PCODE` property uses the short
  format (`01`, `02`, ...). The visual matches whatever's in
  the property to whatever's in your data — exact string equality.

See [PCODE Matching](PCODE-Matching.md).

## What about Admin3 / Admin4 levels?

Not currently supported. The visual is two-level (Admin1 + Admin2).
For deeper hierarchies, fold the deeper levels into Admin2 in your
data, or restrict to Admin2 only.

## Can the visual show two countries at once?

Not in one instance — each instance shows one country. You can drop
two AdminCartograph instances on the same page bound to different
data and showing different countries.

## How big can my custom upload be?

Practically, ~5 MB combined (Admin1 + Admin2 files). Power BI
truncates very large `persistProperties` payloads, and bigger
payloads also bloat the .pbix. If your file is over 5 MB, simplify
it first with mapshaper or `topojson-simplify`.

## Does cross-filter work?

Yes. Click a polygon → other visuals on the page filter to that
area. External slicers also drive AdminCartograph. See [Cross-
Filter Behaviour](Cross-Filter-Behavior.md).

## Can I disable cross-filter?

**1. Map setup → Interaction enabled → Off**. Tooltips still work,
but clicks no longer drill or filter.

## Why is my map zoomed in / out wrong?

The visual auto-fits the country to the canvas via d3.geoPath's
`fitExtent`. If the framing's wrong:

- Make sure **Country** is set correctly (either an explicit ISO
  or the right Auto-detect result).
- Use the zoom + pan controls if you want a custom view.
- Resize the visual itself in Power BI's layout to change aspect.

## Why is performance slow?

Common causes:

- High-resolution geometry. Increase `--simplify` weight in the
  build pipeline.
- Many distinct values in bound columns (>30,000 rows of Admin2).
- Heavy label fitting (multiple iterations). Set fixed font
  size or turn off `reduceFontSize`.

See [Troubleshooting](Troubleshooting.md).

## Will my report file get bigger?

Yes if you use **Custom upload**: each MB of uploaded TopoJSON adds
roughly that much to the .pbix. Use the bundled countries (or build
your own bundle) to avoid this.

## Can I export the map?

Yes. **14. Map controls → Show export buttons (PNG / SVG)**:

- **PNG** → A5 landscape (1748×1240, ~300 DPI) for PowerPoint
  paste / Insert.
- **SVG** → portable vector for Illustrator / Inkscape / browsers.

See [PNG and SVG Export](PNG-and-SVG-Export.md).

## Does it work in Power BI Service?

Yes. Most features work identically. The two host-dependent ones:

- **Custom upload persistence** sometimes truncates very large
  payloads in Service. Stick to <2 MB if you publish.
- **PNG export to clipboard** is blocked by some tenants in
  Service. The visual falls back to a download.

## Does it work in Power BI Mobile?

Mostly. Touch interaction + drill should work. Mouse-drag pan,
mouse wheel zoom obviously don't apply. Export buttons fall back
to download (no clipboard) on mobile.

## Can I customise the format pane (rename / reorder)?

Yes — edit `displayName` fields in `capabilities.json` and the
order in `cards = [...]` in `src/settings.ts`, then rebuild. See
[Settings Model Internals](Settings-Model-Internals.md).

## Where can I file bugs?

[github.com/nabilaljarmozi/AdminCartograph/issues](https://github.com/nabilaljarmozi/AdminCartograph/issues).
Include browser / Power BI version, repro steps, and console output
if relevant.

## How is it licensed?

ISC. The bundled OCHA Common Operational Datasets carry their own
licensing — see <https://fieldmaps.io/data/cod/> and the OCHA HDX
licence per country.

## Who built it?

Built by the AdminCartograph contributors. See the
[GitHub repo](https://github.com/nabilaljarmozi/AdminCartograph) for the
full history.

## See also

- [Home](Home.md) — wiki landing page
- [Getting Started](Getting-Started.md)
- [Troubleshooting](Troubleshooting.md)

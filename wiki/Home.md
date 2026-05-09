# AdminCartograph Wiki

A Power BI custom visual for **multi-layer subnational maps**. Upload
your country's GeoJSON or TopoJSON, bind a PCODE column, and get
choropleth fills, bubbles, pie / donut / column overlays, drill-down
between Admin1 and Admin2, scale bar, PNG / SVG export, and a rich
label engine — all driven by your data.

This wiki is the exhaustive reference. The repo's
[`README.md`](../README.md) is the elevator pitch; the wiki is the
manual.

## Start here

- [**Getting Started**](Getting-Started.md) — install, import, render
  your first map in 5 minutes
- [**Quick-Start Tutorial**](Quick-Start-Tutorial.md) — step-by-step
  walkthrough with sample data
- [**FAQ**](FAQ.md) — common questions answered up front

## Bringing geometry to the visual

- [**Custom Geometry Upload**](Custom-Geometry-Upload.md) — the
  recommended path: upload any GeoJSON / TopoJSON, confirm the field
  mapping, render
- [**Bundled Countries**](Bundled-Countries.md) — what ships in the
  `.pbiviz` and how the dropdown auto-detects from your PCODE
- [**Adding a Country to the Bundle**](Adding-Your-Own-Country-to-the-Bundle.md)
  — bake a country into the visual at build time
- [**PCODE Matching**](PCODE-Matching.md) — how the visual joins your
  data to geometry, and what to do when codes don't line up

## Data binding

- [**Data Roles Reference**](Data-Roles-Reference.md) — every role,
  what it does, when to bind it
- [**Cross-Filter Behaviour**](Cross-Filter-Behavior.md) — how clicks
  drive other visuals on the page

## Format pane (every card, every setting)

- [**Format Pane Reference**](Format-Pane-Reference.md) — master index
- [**1. Map Setup**](Map-Setup-Settings.md)
- [**2. Choropleth Fill**](Choropleth-Settings.md)
- [**3. Bubble Overlay**](Bubble-Settings.md)
- [**4. Pie / Column Overlay**](Pie-Donut-Column-Settings.md)
- [**5. Borders**](Borders-Settings.md)
- [**6 / 7 / 8. Label Cards**](Label-Engine.md) — Admin1, Admin2 default,
  Admin2 drill
- [**9 / 10 / 11 / 12. Legends**](Legend-System.md) — Choropleth,
  Bubble, Pie/Column, Container
- [**13. Scale Bar**](Scale-Bar.md)
- [**14. Map Controls**](Map-Controls-and-Navigation.md)

## Behaviours

- [**View Modes and Drill**](View-Modes-and-Drill.md) — Auto / Admin1 /
  Admin2, click to drill, prev/next, "Country View" return
- [**Map Controls and Navigation**](Map-Controls-and-Navigation.md) —
  zoom, pan, mouse drag, mouse wheel, directional pad
- [**PNG and SVG Export**](PNG-and-SVG-Export.md) — A5 landscape PNG
  for PowerPoint, portable SVG for vector tools

## Under the hood

- [**Architecture Overview**](Architecture-Overview.md) — module
  responsibilities, render pipeline, layer order
- [**Build Pipeline**](Build-Pipeline.md) — `sync-countries-from-geojson.js`
  → `build-topojson.js` → `pbiviz package`
- [**Settings Model Internals**](Settings-Model-Internals.md) — how
  the formatting model rounds-trips through the host
- [**Custom Properties Persistence**](Custom-Properties-Persistence.md)
  — `host.persistProperties` for uploaded geometry

## Troubleshooting

- [**Troubleshooting**](Troubleshooting.md) — symptoms, causes, fixes

---

If you hit something this wiki doesn't answer, open an issue on
[github.com/nabilaljarmozi/AdminCartograph](https://github.com/nabilaljarmozi/AdminCartograph).

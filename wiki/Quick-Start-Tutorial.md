# Quick-Start Tutorial

A complete walkthrough: build a small Sudan dataset, import the
visual, bind it, drill down, export the result. Should take about
fifteen minutes.

## 1. Prepare a tiny dataset

Open Power BI Desktop. Use **Get Data → Enter Data** and paste in this
small table (or build something equivalent in your data):

| StatePcode | StateName | Population | CasesReported |
|---|---|---|---|
| SD01 | Khartoum | 5400000 | 1240 |
| SD02 | Al Jazira | 4100000 | 880 |
| SD03 | South Darfur | 4200000 | 2360 |
| SD04 | West Darfur | 1300000 | 940 |
| SD05 | South Kordofan | 2300000 | 540 |
| SD06 | Central Darfur | 800000 | 410 |
| SD07 | Red Sea | 1450000 | 220 |
| SD08 | River Nile | 1300000 | 175 |
| SD09 | Northern | 850000 | 65 |
| SD10 | Kassala | 2400000 | 480 |

Name the table **Sudan**. PCODEs `SD01`–`SD10` are the actual OCHA
Admin1 PCODEs that the bundled Sudan geometry uses.

## 2. Import the visual

1. **Visualizations → ⋯ → Import a visual from a file**.
2. Pick `AdminCartograph.pbiviz`.
3. Confirm any "uncertified visual" warning.
4. The new AdminCartograph icon appears in the Visualizations pane.

## 3. Add to the report

Click the AdminCartograph icon to drop a new instance onto the canvas.
You'll see a "Bind State PCODE…" landing card — that's expected.

## 4. Bind the data

Drag from the Fields panel:

- `Sudan[StatePcode]` → **Admin1 PCODE** role
- `Sudan[Population]` → **Color Value** role (the Sigma sum aggregation
  is fine)
- `Sudan[CasesReported]` → **Bubble Size** role
- `Sudan[StateName]` → **Label Text 1** role (so labels show your
  preferred names instead of the geometry's `ADM1_EN`)

The map should render: ten Sudan states coloured by population, with
proportional bubbles sized by cases.

## 5. Add a slicer to demo cross-filtering

Add a standard **Slicer** visual on the page bound to
`Sudan[StateName]`. When you select one or two states in the slicer,
the map auto-drills:

- One state selected → AdminCartograph zooms into that state and
  shows its Admin2 polygons (whether or not you bound an Admin2 PCODE
  column).
- Two states selected → Country View (because the filter spans
  multiple Admin1s).

If you also bound `Admin2 PCODE`, an external slicer narrowing to
several Admin2 areas under one Admin1 would auto-drill into that
Admin1.

See [View Modes and Drill](View-Modes-and-Drill.md) for the full
auto-drill rules.

## 6. Drill manually

In Country View, click the **Khartoum** polygon. The visual:

1. Cross-filters other visuals to Khartoum.
2. Drills into Khartoum's localities (Admin2 areas).
3. Shows a "Khartoum / 5,400,000" pill in the top-left.
4. Adds **‹ ›** prev / next arrows.

Click **‹** to step to the previous Admin1 alphabetically. Click
**← Country View** in the top bar to step back out.

## 7. Style it

Open the format pane (paint-roller icon) and try:

- **2. Choropleth fill → Classification**: switch from Quantile to
  Equal interval, then Manual breaks (try `1000000, 3000000, 5000000`).
- **2. Choropleth fill → Treat 0 as no-data**: turn on if any
  population is 0 in your data.
- **3. Bubble overlay → Show**: turn on; set Min radius 4, Max radius
  20.
- **9. Choropleth legend → Orientation**: try Horizontal.
- **13. Scale bar → Show**: turn on; pick Bottom-left, Kilometres.
- **14. Map controls → Show pan buttons / zoom buttons**: turn both on
  to expose the directional pad and +/- buttons.

## 8. Export

Open **14. Map controls** and turn on **Show export buttons (PNG /
SVG)**. Two new buttons appear in the controls panel:

- **PNG** — produces an A5 landscape PNG (1748 × 1240 @ 300 DPI)
  letterboxed in white. Perfect for **Insert into PowerPoint**.
- **SVG** — produces a vector file with inlined CSS that opens
  cleanly in Illustrator / Inkscape / browsers. Good for editorial
  print work.

See [PNG and SVG Export](PNG-and-SVG-Export.md) for details.

## 9. Save

File → Save. The visual's settings (chosen country, custom upload if
any, format-pane changes) are persisted with the report.

## 10. Where next

- Try **Custom upload**: switch Country to "Custom (upload TopoJSON)"
  and feed in your own country's geometry. See
  [Custom Geometry Upload](Custom-Geometry-Upload.md).
- Try the **Pie / Column overlay**: bind 2-3 measures to **Glyph
  Values (pie / column)** and turn on **4. Pie / Column overlay**.
- Tighten labels: open **6. Admin1 labels** and play with placement
  (Horizontal / Straight / Curved / Boundary) and font / halo.

If you'd rather have a single canonical reference for every setting,
read [Format Pane Reference](Format-Pane-Reference.md).

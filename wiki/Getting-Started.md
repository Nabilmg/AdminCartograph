# Getting Started

Five minutes from "I have a `.pbiviz` file" to "my map is rendering
in Power BI Desktop with my data".

> Looking for the longer step-by-step including Power BI Service,
> permission-errors, and the troubleshooting checklist? See
> [Install and Use](Install-and-Use.md).

## What you need

| Thing | Why |
|---|---|
| `releases/AdminCartograph.pbiviz` | The visual itself. Get it from the [releases folder on GitHub](https://github.com/nabilaljarmozi/AdminCartograph/tree/base/releases) or build it yourself (see [Build Pipeline](Build-Pipeline.md)). |
| Power BI Desktop *or* a Power BI Service workspace | Either works. Desktop is the easiest place to test. |
| A table with at least one **PCODE** column | The visual joins your data to geometry by PCODE. If you have OCHA Common Operational Datasets data already, you have PCODEs. |

## Step 1 — Import the visual

1. Open Power BI Desktop and load (or create) any report.
2. In the **Visualizations** pane, click the **⋯** (More options) menu.
3. Choose **Import a visual from a file**.
4. Pick `AdminCartograph.pbiviz`.
5. Power BI may warn that the visual is not certified. Accept and
   continue.

A new **AdminCartograph** icon appears in the Visualizations pane.

## Step 2 — Add the visual to a page

Click the AdminCartograph icon. An empty visual frame appears on the
canvas with a card asking you to bind a PCODE field.

## Step 3 — Bind your data

In the **Fields** panel:

| Drag this column | Into this role |
|---|---|
| Your Admin1 PCODE column (e.g. `state_pcode`) | **Admin1 PCODE** |
| Your Admin2 PCODE column, if you have one (e.g. `district_pcode`) | **Admin2 PCODE** |
| A measure to colour by | **Color Value** |
| A measure to size bubbles by, optional | **Bubble Size** |

For more on data roles, see [Data Roles Reference](Data-Roles-Reference.md).

## Step 4 — Pick the country

By default, **Country** is set to *Auto-detect (from PCODE)*. The
visual reads the leading two characters of your PCODE values
(`SD…` → SDN, `YE…` → YEM, etc.) and picks the matching bundled
country.

If your data isn't from one of the eight bundled countries, you have
two options:

- **(Recommended)** Upload your country's GeoJSON or TopoJSON. See
  [Custom Geometry Upload](Custom-Geometry-Upload.md).
- Or build a fresh `.pbiviz` with your country baked in. See
  [Adding a Country to the Bundle](Adding-Your-Own-Country-to-the-Bundle.md).

## Step 5 — Format the map

Open the **Format your visual** pane (the paint-roller icon). You'll
see fourteen numbered cards:

1. Map setup
2. Choropleth fill
3. Bubble overlay
4. Pie / Column overlay
5. Borders
6. Admin1 labels
7. Admin2 labels — default view
8. Admin2 labels — drill view
9. Choropleth legend
10. Bubble legend
11. Pie / Column legend
12. Legend container
13. Scale bar
14. Map controls

The numbers are the order you'd typically work top-down. See the
[Format Pane Reference](Format-Pane-Reference.md) for an exhaustive
walkthrough of every setting.

## Step 6 — Use the map

- **Hover** an Admin1 → tooltip with name, color value, bubble value.
- **Click** an Admin1 → drill into its Admin2 children. The focused
  state's name appears as a pill in the top-left, with prev / next
  arrows to step through other Admin1s alphabetically.
- **Click** an Admin2 → cross-filter the rest of the report.
- **Click "← Country View"** → back to the Admin1-only view.

## Common stumbles

| Symptom | Likely cause |
|---|---|
| Visual shows "Bind State PCODE…" | No data role is bound yet. Drag at least one PCODE column into Admin1 PCODE or Admin2 PCODE. |
| Country auto-detect picks the wrong country | Your PCODEs don't follow the OCHA convention (leading ISO-2). Set Country explicitly in **1. Map setup**. |
| Map appears but is mostly grey | No areas matched any data. Open the Power BI tooltips for one of your data rows and confirm its PCODE matches a feature in the geometry. See [PCODE Matching](PCODE-Matching.md). |
| Visual feels sluggish | You may have bound a column with thousands of distinct categories. The visual is designed for ~30,000-row Admin2 datasets at most. |

For more, see [Troubleshooting](Troubleshooting.md).

## Next steps

- [Custom Geometry Upload](Custom-Geometry-Upload.md) — for any country
  not in the bundle
- [Format Pane Reference](Format-Pane-Reference.md) — every setting
- [Quick-Start Tutorial](Quick-Start-Tutorial.md) — step-by-step with
  sample data

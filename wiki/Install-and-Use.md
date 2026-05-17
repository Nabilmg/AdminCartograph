# Install and Use — Step-by-Step

A start-to-finish guide for adding **AdminCartograph** to a Power BI
report and getting it to render your data. Covers installation in
both Power BI Desktop and the Power BI Service, plus the minimum
binding + formatting steps you need on a fresh report.

If you already have the visual on a page and just need a binding
walkthrough with a worked Sudan example, jump to
[Quick-Start Tutorial](Quick-Start-Tutorial.md).

---

## 1. Get the `.pbiviz` file

The shipping visual file lives at the repository's
[`releases/AdminCartograph.pbiviz`](https://github.com/nabilaljarmozi/AdminCartograph/blob/base/releases/AdminCartograph.pbiviz).

- Open the link in a browser.
- Click the **Download** button (or three-dot menu → Download).
- Save the file somewhere convenient. You don't need to unzip it —
  Power BI imports `.pbiviz` files directly.

> If you've cloned the repo and built locally, the same artifact is
> produced at `releases/AdminCartograph.pbiviz` after `npm run release`.

## 2. Add the visual to your report

### Power BI Desktop

1. Open your `.pbix` report.
2. In the **Visualizations** pane, click the ellipsis (`⋯`) at the
   bottom of the visual icons.
3. Choose **Import a visual from a file**.
4. Acknowledge the warning that the visual is from a third-party
   author. AdminCartograph is published by **Nabil ALJARMOZI**
   (`nabilmg@gmail.com`); the source is open at
   [github.com/nabilaljarmozi/AdminCartograph](https://github.com/nabilaljarmozi/AdminCartograph).
5. Pick `AdminCartograph.pbiviz`. A new icon appears in the
   Visualizations pane.

### Power BI Service (web)

1. Open or edit a report in [app.powerbi.com](https://app.powerbi.com).
2. Visualizations pane → `⋯` → **Import a visual from a file**.
3. Same warning + file picker as Desktop.

Imports made in Desktop save with the report — opening the same
`.pbix` later, the visual is already available without re-importing.
Same in Service for the workspace's reports.

### Permission errors during import

If your tenant blocks unmanaged custom visuals, import will fail with
a permission error. Two options:

- **Ask your admin** to allow the visual via Power BI admin portal →
  *Tenant settings → Developer settings → Allow custom visuals*.
- **Submit the visual to AppSource** so it's covered by your tenant's
  certified-visuals allowlist. (Not required for personal / smaller
  organisation use.)

## 3. Drop the visual on a page

1. With your report open in Edit mode, click the AdminCartograph icon
   in the Visualizations pane to drop a new instance on the canvas.
2. Resize the visual — at least ~400 × 300 px is comfortable; smaller
   sizes still work but the UI compacts (see
   [View Modes and Drill → Drill UI bits](View-Modes-and-Drill.md#drill-ui-bits)).
3. You'll see a **landing screen** explaining what to bind. Empty
   visual at this stage is normal.

## 4. Bind data

Drag fields from the **Fields** pane into the visual's roles. The
visual needs at least one of these PCODE roles bound to render
anything map-shaped:

| Role | What it expects | Bind when |
|---|---|---|
| **Admin1 PCODE** | A column whose values match `ADM1_PCODE` in the geometry (e.g. `SD01`, `SD02` for Sudan) | Always, unless your data only goes down to Admin2 |
| **Admin2 PCODE** | A column whose values match `ADM2_PCODE` (`SD0101`, `SD0102`...) | When you have locality-level data and want drill / Admin2 view |
| **Choropleth fill** | Numeric measure — drives the polygon colour. For *Categorical* mode it can be a string column (`High`/`Medium`/`Low`). | When you want polygons coloured by a value |
| **Bubble Size** | Numeric measure — drives the bubble radius | When you want a proportional-bubble overlay |
| **Glyph Values** | 2 or more measures — slice / column / concentric-ring per area | When you want a pie / donut / column / concentric overlay per polygon |
| **Label Value 2** | Numeric measure — extra value line on labels | When the choropleth + bubble values aren't enough |
| **Label Text 1** | String column — overrides each polygon's name | When your data has nicer / localised names than the bundled geometry |
| **Tooltips** | Any extra columns | Surfaces them on hover |

**Minimum viable binding:** Admin1 PCODE + Choropleth fill. Drop those
two and the country choropleth renders.

## 5. Pick the country

Open **Format pane → 1. Map setup → Country**:

- **Auto-detect (from PCODE)** — default. The visual peeks at the first
  ~50 PCODEs you bound, takes the 2-letter prefix (`SD` → Sudan,
  `YE` → Yemen, ...) and matches against the bundled countries. Works
  for the 8 countries shipped in the visual: **AFG, COD, HTI, IRN,
  LBN, SDN, SYR, YEM**.
- **A specific country** — pick from the dropdown when auto-detect
  picks the wrong one (or your data uses a non-OCHA convention).
- **Custom (upload TopoJSON)** — for countries / geographies not in
  the bundle. The visual shows a small upload card; pick the Admin1
  (required) and Admin2 (optional) TopoJSON or GeoJSON files. See
  [Custom Geometry Upload](Custom-Geometry-Upload.md).

If you see an orange banner saying *"No PCODE matches"*, your data's
PCODE values don't line up with the geometry's. The banner shows
samples from both sides so you can spot the difference — see
[PCODE Matching → Mismatch banner](PCODE-Matching.md#mismatch-banner).

## 6. Common first-render configurations

Once the choropleth renders, these are the most common first edits:

1. **6. Admin1 labels → Content** → switch from *Name only* to
   *Name + value* if you want the bound measure printed on each
   polygon.
2. **2. Choropleth fill → Classification** → try *Quantile* (default),
   *Equal interval*, *Manual breaks* (with a comma-separated breakpoints
   list), or *Categorical* (for `High`/`Low` style columns).
3. **2. Choropleth fill → Number of classes** → 5 by default, change
   to taste.
4. **2. Choropleth fill → Base color** → click the swatch to recolour
   the whole ramp.
5. **3. Bubble overlay → Show** → on, then bind a measure to
   **Bubble Size** to get bubbles per area.
6. **9. Choropleth legend → Show** + **10. Bubble legend → Show** →
   turn on so the reader can decode colours / sizes.

## 7. Drill down

Click any Admin1 polygon to drill into that state's Admin2 children
(requires the Admin2 PCODE role bound + geometry that has Admin2
features).

In drill view:

- A **home icon** in the top-left returns to country view.
- **‹ ›** arrows step alphabetically through the country's Admin1s.
- The focused state's **name + values** show inline next to the
  buttons (or in a title pill below at larger viewport sizes — see
  [View Modes and Drill → Drill UI bits](View-Modes-and-Drill.md#drill-ui-bits)).
- Neighbour states dim to ~55 % so the focused state reads as
  foreground. The fill turns white so the choropleth doesn't bleed
  through.

Click the home icon, or click any background area, to clear and
return to the country view.

## 8. Cross-filter with other visuals

Clicking an Admin1 / Admin2 polygon cross-filters every other visual
on the page (same as Power BI's native visuals). Reverse direction
works too — a slicer in another visual narrows the data shown on the
map and (in Auto mode) can auto-drill the map to a single state.

- **Click an area** → other visuals filter to it.
- **Re-click the same area** → clears the filter.
- **Click on the map background** → clears the filter.
- **Ctrl / Cmd-click** → multi-select.

See [Cross-Filter Behavior](Cross-Filter-Behavior.md) for the full
matrix.

## 9. Export

Card **15. Map controls → Show export buttons** → on. A small **SVG**
button appears on the controls panel. Clicking it opens a modal with
the full SVG source (every layer — choropleth, bubbles, charts,
labels, all legends, scale bar, drill title pill) plus a **Download
.svg** button. The download path is the most reliable for big-country
exports — see [PNG and SVG Export](PNG-and-SVG-Export.md).

## 10. Save the report

Standard `Ctrl + S` in Desktop or **File → Save** in Service. The
imported visual + all your bindings + format-pane edits + uploaded
custom geometry (if any) all persist with the `.pbix`.

---

## Troubleshooting checklist

| Symptom | Most common cause | Fix |
|---|---|---|
| Landing message says "Bind State PCODE..." | No data bound | Drop a column into Admin1 PCODE (or Admin2 PCODE) |
| Landing message says "Couldn't auto-detect a country" | PCODE prefix isn't one of the 8 bundled ISO-3s | Pick the country manually in 1. Map setup, or use Custom upload |
| Orange "No PCODE matches" banner | Bound column values don't match geometry's `ADM1_PCODE` | Compare the banner's samples — switch the country dropdown or upload custom geometry |
| Choropleth renders but values look wrong | Wrong classification mode for the data | Try *Categorical* for string buckets, *Quantile* for skewed numerics, *Equal interval* for linear ones |
| Labels are tiny / huge | Font size on the labels card is fixed; visual is much smaller / larger than the card was set for | Adjust **6. Admin1 labels → Font size**, or turn on **Constant size on zoom** so labels stay readable when users zoom |
| Drill doesn't work when clicking | Admin2 PCODE not bound OR country has no Admin2 geometry | Bind Admin2 PCODE; upload Admin2 geometry via Custom if missing |
| The visual reverts to country view after a slicer | Filter narrowed to >1 state in Auto mode | Pick a specific View Mode (Admin1 / Admin2) in 1. Map setup if you want a fixed view regardless of slicers |

For deeper failure modes see [Troubleshooting](Troubleshooting.md).

---

## What's next

- Learn the data-role nuances → [Data Roles Reference](Data-Roles-Reference.md)
- Tune the colour ramp / classification → [Choropleth Settings](Choropleth-Settings.md)
- Customise labels → [Label Engine](Label-Engine.md)
- Format the legends → [Legend System](Legend-System.md)
- Walk through a worked example end-to-end → [Quick-Start Tutorial](Quick-Start-Tutorial.md)

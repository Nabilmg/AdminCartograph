# LinkedIn post — AdminCartograph

A short, professional post you can paste into LinkedIn. Includes a
single-image variant, a longer carousel variant, screenshot
suggestions, and a Shape Map differentiator table you can drop in
as a slide.

---

## Short version (single image)

> **Power BI's built-in Shape Map can't show labels.**
>
> No state names. No values. Nothing.
>
> So I built **AdminCartograph** — a custom visual for multi-layer
> subnational mapping that does. And while I was at it, I also embedded
> the OCHA / fieldmaps.io boundaries so you don't have to upload
> TopoJSON to every report, added bubble + pie/donut/column overlays,
> click-to-drill from Admin1 to Admin2, a scale bar, PNG/SVG export,
> and PCODE-native binding so you bind one column and the right country
> renders.
>
> What's inside (and what Shape Map can't do):
>
> 🏷  Area labels — name + value, halo, rotation, fit-to-shape
> 🗺  Choropleth fill (quantile / equal-interval / manual breaks)
> ⚪ Bubble overlay (size by measure)
> 🥧 Pie / Donut / Column overlay (one slice per measure)
> ↘  Click-to-drill Admin1 → Admin2, with filter-driven auto-drill
> 🔗 Cross-filtering with the rest of the report
> 🧭 Latitude-aware scale bar (km / miles)
> 🧰 Pan, zoom, and PNG / SVG export
>
> 8 countries today (AFG, COD, HTI, IRN, LBN, SDN, SYR, YEM) — 165
> Admin1 + 1,772 Admin2 features in a 632 KB .pbiviz. Custom upload
> for any other country.
>
> The whole pipeline is open-source — drop fieldmaps.io zips into a
> folder, run `npm run release`, the dropdown auto-updates.
>
> Repo: <https://github.com/Nabilmg/AdminCartograph>
>
> #PowerBI #DataViz #Humanitarian #GIS #OCHA #Cartography

**Image to attach:** the full-canvas screenshot you took of Sudan or
Yemen showing choropleth + bubbles + the value legend. Make sure the
country is recognisable (not zoomed in too far) and that **labels are
visible** — that's the whole point of the post.

---

## Longer version (LinkedIn carousel, 5–7 slides)

If LinkedIn lets you upload multiple images / a PDF carousel, this
version reads better.

### Slide 1 — Hook

> **Power BI's built-in Shape Map doesn't show labels.**
>
> No state names. No values. Nothing.

(Image: a Shape Map screenshot of any country — unlabeled blobs of
color. Shock value.)

### Slide 2 — The full Shape Map gap

> Built-in Shape Map limitations:
> - ✗ No labels (name / value)
> - ✗ No bubble overlay
> - ✗ No pie / column / donut overlay
> - ✗ No drill between Admin1 and Admin2
> - ✗ No scale bar
> - ✗ No image export
> - ✗ Boundaries must be uploaded as TopoJSON every time

(Image: a clear table — Shape Map vs AdminCartograph, ✓/✗ in two
columns. The differentiator table from the README works perfectly.)

### Slide 3 — AdminCartograph

> A custom Power BI visual for **multi-layer subnational mapping**.
>
> Choropleth + bubbles + pie/column on top of admin boundaries —
> with the boundaries already inside.

(Image: hero shot — Sudan or Yemen full canvas, choropleth + bubbles
+ labels visible.)

### Slide 4 — Multiple visualization layers

> Three composable layers, all driven by your data:
> - Choropleth fill (quantile, equal-interval, or manual breaks)
> - Bubble overlay (size by measure)
> - Pie / Donut / Column overlay (multi-measure)
>
> Plus borders, halos, scale bar, three legends.

(Image: a screenshot showing all three layers active simultaneously —
e.g. choropleth + bubbles + small donuts on a few states.)

### Slide 5 — Drill + cross-filter

> Click an Admin1 → drill into its Admin2 children.
> Click any Admin2 → cross-filter the rest of the report.
> External slicer narrows to one state → visual auto-drills.
> "Country View" button + prev/next arrows for navigation.

(Image: drill view of one state with the title pill in the top-left,
prev/next arrows, and the localities visible.)

### Slide 6 — Bring your own country

> 8 countries bundled today: AFG, COD, HTI, IRN, LBN, SDN, SYR, YEM.
>
> Need another? Upload your own GeoJSON or TopoJSON — the visual
> auto-detects the property names (ADM1_PCODE, ADM1_EN, ...) and
> asks you to confirm the mapping in 4 dropdowns.

(Image: the upload card UI with the field-mapping dropdowns visible.)

### Slide 7 — Outputs

> Export the map as **A5 landscape PNG (300 DPI)** for PowerPoint,
> or **portable SVG** for Illustrator / Inkscape / vector tools.
> Open-source repo:
> <https://github.com/Nabilmg/AdminCartograph>

(Image: PowerPoint slide with the exported PNG embedded — proves the
end-to-end story.)

---

## Screenshots to take in Power BI Desktop

For best LinkedIn engagement, take these in order, on a clean
report background:

1. **Hero — choropleth + bubbles + labels (full canvas)**
   - Bind Admin1 PCODE + Color Value + Bubble Size to a country
     with bold geography (Sudan / Yemen work great).
   - Turn on Admin1 labels, set placement = horizontal, with halo.
   - Turn on the bubble label placement = above. Show legends in
     the bottom-right.
   - Crop the screenshot to just the visual (no Power BI chrome).

2. **Format pane**
   - Open the format pane.
   - Expand "1. Map setup" so the country dropdown is visible.
   - Scroll so the numbered cards 1–14 are visible.
   - Crop to just the format pane.

3. **All-three-layers**
   - Same data, but enable Pie / Column overlay with 2–3 measures.
   - Set type = donut, position labels above the donuts.
   - Crop to just the visual.

4. **Drill view**
   - Click a state with several Admin2 areas.
   - You should see: the title pill in the top-left, prev/next
     arrows beside it, the focused state's Admin2 polygons, and
     dimmed neighbouring Admin1 borders.

5. **Custom upload card**
   - Switch Country to "Custom (upload TopoJSON)".
   - Upload an Admin1 file so the field-mapping dropdowns appear.
   - Screenshot the card with the mapping panel populated.

6. **Shape Map vs AdminCartograph side-by-side**
   - Render the same country in built-in Shape Map (no labels, no
     overlays) and AdminCartograph (full labels + layers).
   - Side-by-side screenshot. This is the most viral image possible.

7. **PowerPoint paste**
   - Take a fresh PowerPoint slide.
   - Click the **PNG** button on the visual.
   - Insert the downloaded `map-A5.png` into the slide.
   - Screenshot the PowerPoint slide.

## Suggested hashtags

Pick 5–8 from:

`#PowerBI` `#DataViz` `#GIS` `#Cartography` `#OCHA` `#Humanitarian`
`#PublicHealth` `#OpenSource` `#PCODE` `#AdminBoundaries` `#Choropleth`
`#FieldMaps` `#TypeScript` `#DataAnalytics` `#BusinessIntelligence`
`#SubnationalData`

## Tag suggestions

If relevant to your audience: `OCHA`, `UN OCHA`, `Humanitarian Data
Exchange (HDX)`, `Microsoft Power BI`, `fieldmaps.io`.

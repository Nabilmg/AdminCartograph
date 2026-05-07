# LinkedIn post — ADM Choropleth + Bubble Map

A short, professional post you can paste into LinkedIn. Includes
suggested screenshots and a longer "carousel" variant.

---

## Short version (single image)

> **I built a Power BI custom visual for ADM1 / ADM2 choropleth
> mapping — and it ships with the boundaries already inside.**
>
> Most map visuals ask you to bring your own GeoJSON or shapefile
> every time. For humanitarian, public-health, and development
> reporting that's a real friction point: every report needs the same
> OCHA boundaries re-uploaded, every country re-modelled.
>
> So the visual I built embeds the geometry. You bind the **PCODE**
> column in your data and the right country renders automatically.
> Today it ships with 8 countries (AFG, COD, HTI, IRN, LBN, SDN, SYR,
> YEM) — 165 Admin1 + 1,772 Admin2 features in a 630 KB .pbiviz —
> with a runtime upload for any other country.
>
> What's inside:
>
> 🗺  Choropleth fills with quantile / equal-interval / manual breaks
> ⚪ Bubble overlay (size by measure)
> 🥧 Pie / Donut / Column overlay (one slice per measure)
> ↘ Click-to-drill from Admin1 to Admin2 + prev/next state nav
> 🔗 Cross-filtering with the rest of the report
> 🧭 Scale bar (km / miles)
> 🧰 Pan, zoom, and "Copy to clipboard" as A5-landscape PNG for
>     PowerPoint
>
> The whole pipeline is open-source — drop fieldmaps.io zips into a
> folder, run `npm run release`, the dropdown auto-updates.
>
> Repo: <https://github.com/Nabilmg/MapVisual>
>
> #PowerBI #DataViz #Humanitarian #GIS #OCHA #Cartography

**Image to attach:** the full-canvas screenshot you took of Sudan or
Yemen showing choropleth + bubbles + the value legend. Make sure the
country is recognisable (not zoomed in too far).

---

## Longer version (LinkedIn carousel, 4–6 slides)

If LinkedIn lets you upload multiple images / a PDF carousel, this
version reads better.

### Slide 1 — Hook
> **Open-source Power BI custom visual for OCHA-PCODE choropleth maps.**
>
> Built it so humanitarian / development teams can stop re-uploading
> the same boundary files into every report.

(Image: hero shot — Sudan choropleth + bubbles, full canvas)

### Slide 2 — The problem
> Most Power BI map visuals make you bring your own boundaries. For
> ADM1 / ADM2 reporting that means:
> - Upload TopoJSON to every report
> - Match feature properties to your data manually
> - Repeat for every country, every report
>
> Friction every step of the way.

(Image: screenshot of any common GIS-import error, OR a blank "bind
shapefile" prompt from another visual)

### Slide 3 — What this visual does differently
> The geometry lives **inside** the .pbiviz.
> You bind your PCODE column — the right country renders.
>
> 8 countries today (AFG, COD, HTI, IRN, LBN, SDN, SYR, YEM).
> ~50 fit comfortably in one bundle. Or upload your own (TopoJSON or
> GeoJSON) at runtime — the visual auto-maps the field names and
> asks you to confirm.

(Image: format pane showing the Country dropdown expanded with the
8 countries + Custom option visible)

### Slide 4 — Layers
> Three composable visualization layers, all driven by your data:
> - Choropleth fill (quantile, equal-interval, or manual breaks)
> - Bubble overlay (size by measure)
> - Pie / Donut / Column overlay (multi-measure)
>
> Plus borders, halos, scale bar, two legends per layer.

(Image: a screenshot showing all three layers active simultaneously —
e.g. choropleth + bubbles + small pies on a few states)

### Slide 5 — Drill + cross-filter
> Click an Admin1 → drill into its Admin2 children.
> Click any Admin2 → cross-filter the rest of the report.
> External slicer narrows to one state → visual auto-drills.
> "Country View" button + prev/next arrows for navigation.

(Image: drill view of one state with the title pill in the top-left,
prev/next arrows, and the localities visible)

### Slide 6 — Outputs
> Copy-to-clipboard exports the map as **A5 landscape PNG (300 DPI)**
> ready for PowerPoint. Scale bar in km or miles. Latitude-aware.
>
> The whole thing is open-source. Repo:
> <https://github.com/Nabilmg/MapVisual>

(Image: PowerPoint slide with the exported PNG embedded — proves the
end-to-end story)

---

## Screenshots to take in Power BI Desktop

For best LinkedIn engagement, take these in order, on a clean
report background:

1. **Hero — choropleth + bubbles (full canvas)**
   - Bind Admin1 PCODE + Color Value + Bubble Size to a country
     with bold geography (Sudan / Yemen work great).
   - Turn on the bubble label placement = above. Show legends in
     the bottom-right.
   - Crop the screenshot to just the visual (no Power BI chrome).

2. **Format pane**
   - Open the format pane.
   - Expand "1. Map setup" so the country dropdown is visible.
   - Show the numbered cards 1–14 above/below it.
   - Crop to just the format pane.

3. **All-three-layers**
   - Same data, but enable Glyph chart with 2–3 measures.
   - Set type = donut, position labels above the donuts.
   - Crop to just the visual.

4. **Drill view**
   - Click a state with several Admin2 areas.
   - You should see: the title pill in the top-left, prev/next
     arrows beside it, the focused state's Admin2 polygons, and
     dimmed neighbouring Admin1 borders.

5. **PowerPoint paste**
   - Take a fresh PowerPoint slide.
   - Click the clipboard button on the visual.
   - Paste into PowerPoint — the A5 landscape image fits the slide
     beautifully.
   - Screenshot the PowerPoint slide.

## Suggested hashtags

Pick 5–8 from:

`#PowerBI` `#DataViz` `#GIS` `#Cartography` `#OCHA` `#Humanitarian`
`#PublicHealth` `#OpenSource` `#PCODE` `#AdminBoundaries` `#Choropleth`
`#FieldMaps` `#TypeScript` `#DataAnalytics` `#BusinessIntelligence`

## Tag suggestions

If relevant to your audience: `OCHA`, `UN OCHA`, `HumanitarianData
Exchange (HDX)`, `Microsoft Power BI`, `fieldmaps.io`.

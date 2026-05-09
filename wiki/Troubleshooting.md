# Troubleshooting

Symptoms, causes, and fixes for the most common issues. Open an
issue at [github.com/nabilaljarmozi/AdminCartograph](https://github.com/nabilaljarmozi/AdminCartograph)
if you hit something this page doesn't cover.

## The visual won't render

### "Bind State PCODE..." prompt

You haven't bound any data role yet. Drag a column with PCODE
values into **Admin1 PCODE** (and optionally **Admin2 PCODE**).
See [Data Roles Reference](Data-Roles-Reference.md).

### Blank canvas after binding

Most likely: the visual loaded a country whose Admin1 PCODEs don't
match yours. Open the format pane → **1. Map setup** → check the
**Country** dropdown. Set it explicitly to your country, or pick
**Custom** and upload your own geometry.

### Visual loads but no polygons coloured

The geometry is there but no PCODEs match between data and
geometry. See [PCODE Matching → When matching fails](PCODE-Matching.md#when-matching-fails)
for the most common mismatches (case, padding, separators).

### "Embedded geometry not found" error

The bundled TopoJSON is missing from the build. Run
`npm run release` to rebuild.

## The visual renders the wrong country

### Auto-detect picked the wrong one

Two-character ISO prefixes can collide between countries (`SD…`
could be Sudan or…well, Sudan, but you get the idea — Yemen and
some other ISO-2s share patterns in different scripts). Set
**Country** explicitly in the format pane.

### A specific country selection doesn't render

The bundled `.pbiviz` may not include that country. Look at the
dropdown — only countries that were in `country-geojson/` at build
time appear. Either:

- Use **Custom** and upload your country's GeoJSON / TopoJSON.
- Add the country's zip to `country-geojson/` and run `npm run release`.

## Custom upload issues

### "Choose file..." button does nothing

Browser blocking a programmatic click. The visual uses a `<label>`
wrapping a hidden `<input type="file">`, which propagates clicks
natively without JS. Should always work — but if it doesn't:

1. Open browser DevTools console and click again. Look for
   warnings.
2. Try a different browser (Chrome/Edge are safest with Power BI).
3. Try Power BI Desktop instead of Service if you're on Service —
   Desktop has fewer iframe restrictions.

### "No features found in file"

Your file isn't valid TopoJSON or GeoJSON. Check:

- Has `type: "Topology"` (TopoJSON) or `type: "FeatureCollection"`
  (GeoJSON).
- Contains at least one feature.
- File is valid JSON (try `python -m json.tool < file.json` or
  similar).

### Field-mapping dropdowns are empty

The visual found no `properties` on any feature. Either:

- The file is malformed.
- Your features don't have a `properties` block.

For GeoJSON, every feature must look like:

```json
{
  "type": "Feature",
  "properties": { "ADM1_PCODE": "SD01", "ADM1_EN": "Khartoum" },
  "geometry": { "type": "Polygon", "coordinates": [...] }
}
```

### "Load map" does nothing after Confirm

This was a fixed bug in earlier builds (the persisted properties
weren't in the slices array, so the formatting service ignored them).

If you're hitting it on a recent build:

1. Open DevTools console.
2. Click "Load map".
3. Look for `[ADM Map export]`-style log lines or errors.

Likely fixes: re-import the visual, restart Power BI, or re-upload
the file.

### Upload survives the session but not save / reload

Power BI Service may be truncating the persistence at a few
hundred KB. Either:

- Simplify your TopoJSON to under 1 MB before uploading.
- Save the report with the visual on Power BI Desktop where
  persistence is more lenient.
- Use the bundle path instead of custom upload (drop the country
  into `country-geojson/` and rebuild).

## Performance issues

### Sluggish drag / pan

Most often caused by:

- Very high-resolution geometry (millions of vertices). Re-build
  the bundle with higher simplification: `node scripts/build-topojson.js
  --simplify 0.001 --quantize 5000`.
- Bound data with thousands of distinct categories. The visual is
  designed for ~30,000-row Admin2 datasets at most.
- Active labels with many polygons + reduce-font-size + multiple
  iterations of fitting. Try simpler labels or **Allow overrun =
  on**.

### Slow first render

Usually because the embedded TopoJSON is large (>10 MB inside the
bundle). Reduce by:

- Trimming `country-geojson/` to only the countries you ship.
- Increasing `--simplify` weight on the build.

### Labels jump around when zooming

Labels recompute their anchor and fit each time the projection
changes. With many polygons + `reduceFontSize: true`, every zoom
triggers a fit-loop. Either:

- Set a fixed font size.
- Turn off `reduceFontSize`.

## Drill issues

### Clicking an Admin1 doesn't drill

Two checks:

- Does the country have Admin2 geometry? (Some uploaded countries
  have only Admin1.)
- Is **Admin2 PCODE** bound to a column?

If either is no, the visual stays in Admin1 view by design — see
[View Modes and Drill](View-Modes-and-Drill.md).

### Drill triggers but Admin2 polygons are blank

You're in drill view but no Admin2 row matches the focused state's
children. Check that:

- Your Admin2 PCODEs are correct.
- Your data has rows for the Admin2s of that state.

### Filter from another visual doesn't auto-drill

Auto-drill only fires when:

- View mode is **Auto**.
- The filter narrows to exactly one Admin1 (or all Admin2s in one
  parent).
- `prepared.hasLocalityBinding` is true (you bound Admin2 PCODE).

In Admin1 / Admin2 locked modes, auto-drill is disabled.

## Export issues

### PNG button does nothing visibly

The file may have downloaded silently to your Downloads folder.
Check there. If it's not there:

1. Open DevTools console.
2. Click PNG.
3. Look for `[ADM Map export]` log lines.

The button cycles through ✓ (success) / ⬇ (download fallback) /
⚠ (error) icons after the click — wait 2 seconds.

### PNG renders blank / missing labels

CSS not inlined into the cloned SVG. Console will show
`[ADM Map export]` with the cause. The visual does inline
`document.styleSheets`, but cross-origin sheets throw on `cssRules`
access and are skipped — if the styling lives in a cross-origin
stylesheet, it won't reach the export.

Workaround: edit `style/visual.less` to put critical visual styles
under classes the visual sets explicitly (instead of relying on
host CSS).

### SVG button works, PNG doesn't

Canvas serialisation is being blocked (typically by a strict CSP).
SVG export skips canvas entirely, so it works in more places.

### Power BI Service blocks both buttons

Try Power BI Desktop. Some tenant CSPs block both `<a download>`
and clipboard / canvas. Desktop has looser policies.

## Tooltips show only the value

Bug in earlier builds (the tooltip getter was reading the wrong
shape). Fixed in current build. If reproducing on the current
release, check console for errors.

## Layer rendering issues

### Bubbles appear under choropleth fills

Old build issue. Bubbles now sit above the choropleth in the
correct layer order. Re-import the latest `.pbiviz`.

### Glyph chart and bubbles overlap

Both render at the same anchor (polygon's interior centroid). If
both layers are on, expect overlap. Either:

- Hide one of the two layers (turn off Show in the relevant card).
- Use different placement settings (e.g. bubble label = above,
  glyph label = below) so they don't compete for space.

### Drilled state's pill overlaps a top-left controls panel

When **Map controls → Position** is set to **Top left**, the panel
is automatically pushed down to `top: 80px` so it sits below the
title pill. If you've moved the pill or modified positions, they
may collide.

## Diagnostic console messages

The visual logs to the browser console under these prefixes:

- `[ADM Map export]` — PNG / SVG export status
- Plain `console.warn` — recoverable issues like clipboard fallback
- Plain `console.error` — unrecoverable rendering errors

Right-click the visual → Inspect → Console to see them.

## Where to file issues

Open a GitHub issue at:

```
https://github.com/nabilaljarmozi/AdminCartograph/issues
```

Include:

- Power BI version (Desktop or Service, version number from
  Help → About).
- Browser and version (if Service).
- A minimal repro: which steps lead to the symptom.
- Console output if relevant.
- Whether the issue reproduces in Power BI Desktop or only in
  Service.

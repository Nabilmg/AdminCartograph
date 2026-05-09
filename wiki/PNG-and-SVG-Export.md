# PNG and SVG Export

Two export buttons in the controls panel let you save the visual
as either a raster PNG (for PowerPoint paste, Word documents, web
images) or a vector SVG (for Illustrator, Inkscape, web embeds,
print).

Enable them in **Map controls → Show export buttons (PNG / SVG)**.
Both default to off.

## PNG export

### Output

- Filename: `map-A5.png`
- Dimensions: **1748 × 1240 px** (A5 landscape at ~300 DPI)
- Background: white (or your configured background colour)
- Aspect ratio of the source visual is preserved; if the source is
  squarer than A5, the result is letterboxed in white.

### How it's built

1. Clone the live SVG (it already has every layer, label, and
   legend rendered).
2. Set explicit `width`, `height`, and `viewBox` attributes on the
   clone.
3. Inline a coloured background `<rect>` at the start so the PNG
   renders opaque.
4. Inline `document.styleSheets` into a `<style>` tag inside the
   SVG. Critical: SVG-as-image rendering is sandboxed and can't
   read the parent document's CSSOM, so without inlining you'd
   lose halos, fonts, opacity, etc.
5. Serialise the SVG with `XMLSerializer`.
6. Wrap as a `Blob` with type `image/svg+xml;charset=utf-8`.
7. Load via `<img src="blob:...">` (with a 6-second timeout so a
   bad SVG doesn't hang).
8. Draw onto a 1748×1240 canvas, fitted with `Math.min(scaleX,
   scaleY)`, centred in white.
9. Export the canvas via `canvas.toBlob("image/png")`.
10. Trigger a download via a synthetic `<a download>` anchor.

### Why A5 landscape?

A standard PowerPoint slide is 13.33 × 7.5 inches (≈ 1280 × 720 px
at 96 DPI). A5 landscape (8.27 × 5.83 inches) is large enough to
fit cleanly with margins on a standard slide, but small enough that
the file size is manageable (~150-300 KB per export).

If you need a different size, edit `A5_WIDTH` / `A5_HEIGHT` in
`exportPng()` and rebuild.

### What it captures

Whatever the visual currently shows on screen — choropleth, bubbles,
glyphs, labels, legends, scale bar, drill-state title pill if
present. Zoom and pan transforms are baked in. The controls panel
itself (zoom buttons, export buttons) is **not** in the output —
it lives in the HTML overlay, not the SVG.

## SVG export

### Output

- Filename: `map.svg`
- Format: SVG with all CSS rules from `document.styleSheets` inlined
  in a `<style>` tag at the top.
- Self-contained: no external font references, no external image
  references. Opens in any vector tool.

### How it's built

Steps 1-6 of the PNG path. Then the SVG `Blob` is downloaded
directly — no canvas rasterisation.

### Use cases

- **Illustrator / Inkscape**: open the SVG, ungroup, and edit
  individual labels / paths / colours for one-off custom outputs.
- **PowerPoint**: Insert → Pictures → "From a file" → `map.svg`.
  PowerPoint can ungroup the SVG and let you click-edit individual
  elements.
- **Web embed**: include directly via `<img src="map.svg">` for
  vector quality at any zoom level.
- **Print**: send to a printing house at any DPI without quality
  loss.

### Editability tips

After opening in Illustrator:

1. Ungroup repeatedly (Ctrl/Cmd + Shift + G) until you see
   individual paths.
2. Each Admin1 polygon, each bubble, each label is now a separate
   editable object.
3. Layers are named `adm1-layer`, `adm2-layer`, `bubble-layer`,
   `glyph-layer`, etc. in the cloned SVG, matching the source
   structure.

## Both formats: opt-in white background

If you've enabled **Transparent background** in Map setup, the
on-screen visual is transparent. The PNG / SVG exports still
render with a white background (since transparency in PowerPoint
paste creates the wrong impression that the user can see through
to the slide).

To get a transparent PNG: open the exported SVG in an editor and
remove the first `<rect>` (the background), then re-rasterise.
Or use the SVG directly — vector tools give you control over the
background.

## What can go wrong

| Symptom | Cause | Fix |
|---|---|---|
| Click PNG, nothing happens | Browser blocking programmatic download | Look for the file in your Downloads folder anyway — Power BI sometimes downloads silently. |
| PNG is mostly blank | Inline CSS step failed (cross-origin stylesheet) | Open DevTools console, look for `[ADM Map export]` warnings. The visual does fall back gracefully. |
| Labels missing in PNG but present on screen | Same root cause as above | Same diagnosis. If reproducible, file an issue with the console output. |
| SVG file is huge (multi-MB) | Inlined CSS includes the entire host stylesheet | Use the PNG export for distribution; SVG is only worth it for editing. |

For diagnostics, the visual logs every successful and failed
export to the browser console under the `[ADM Map export]` prefix.

## See also

- [Map Controls and Navigation](Map-Controls-and-Navigation.md)
- [Troubleshooting](Troubleshooting.md)

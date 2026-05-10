# SVG Export

A single export button in the controls panel lets you grab the
visual as a self-contained SVG. No PNG button, no clipboard write,
no automatic download — Power BI's iframe blocks all three reliably
in practice. Instead, clicking **SVG** opens a modal showing the
full SVG source; you select-all and copy with Ctrl/Cmd + C.

Enable it in **Map controls → Show export button (SVG)**. Defaults
to off.

## Why the manual-copy flow

Earlier builds tried, in order:

1. `<a download="map.png">` — blocked by Power BI Service in many
   tenants.
2. `navigator.clipboard.write([new ClipboardItem({"image/png": …})])`
   — blocked almost everywhere inside the Power BI iframe (image
   clipboard writes need both a user gesture and host permission;
   Service refuses).
3. `navigator.clipboard.writeText(svgXml)` — sometimes worked, often
   silently failed without throwing, leaving users wondering why
   nothing was on the clipboard.

The current build skips all three and goes straight to a modal so
the result is predictable: the SVG source is in front of you, you
copy it manually, you know it worked.

## What clicking the button does

1. Clones the live `<svg>` (every layer, label, legend, scale bar
   already rendered).
2. Sets explicit `width`, `height`, and `viewBox` on the clone.
3. Inlines a coloured background `<rect>` so the export is opaque.
4. Inlines `document.styleSheets` into a `<style>` tag at the top
   so halos, fonts, opacity, and stroke widths survive when opened
   outside Power BI.
5. Serialises with `XMLSerializer`.
6. Drops the result into a textarea inside a centred modal.

## The copy modal

```
┌─ Copy SVG manually ─────────────────────────────────── × ─┐
│ The SVG includes every visible map element — choropleth,  │
│ bubbles, charts, labels, legends, scale bar, drill pill.  │
│                                                            │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ <svg xmlns="http://www.w3.org/2000/svg" …           │  │
│ │   <style>…inlined CSS…</style>                      │  │
│ │   <rect …/>                                         │  │
│ │   <g class="map-group">…</g>                        │  │
│ │   <g class="legend-layer">…</g>                     │  │
│ │   <g class="scale-bar-layer">…</g>                  │  │
│ │   <g class="drill-pill-layer">…</g>                 │  │
│ │ </svg>                                              │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│ [Download .svg] [Select all] [Try copy]         [Close]   │
└────────────────────────────────────────────────────────────┘
```

- **Download .svg** is the primary action — saves the file
  directly via a Blob download. **Use this for big-country
  exports** (many Admin2 polygons + labels can produce huge
  SVGs that the textarea-and-copy path silently truncates).
- The textarea auto-selects on open, so Ctrl/Cmd + C works
  immediately if your focus is on it.
- **Select all** re-selects the textarea contents (useful if you
  clicked outside).
- **Try copy** attempts `document.execCommand("copy")` and falls
  back to `navigator.clipboard.writeText`. When the host allows it,
  you get a "Copied. Paste anywhere." status; when it doesn't, you
  get a hint to use Ctrl/Cmd + C manually.
- **Close**, the × button, or clicking the dimmed backdrop dismisses
  the modal.

## What's in the export

The cloned SVG captures **every child of the visual's root `<svg>`** —
so the exported file contains:

- Country outer glow + choropleth fills (`map-group → glow-layer / adm2-layer / adm1-layer`)
- Bubbles, glyph charts, labels (`bubble-layer / glyph-layer / adm[12]-label-layer`)
- Scale bar (`scale-bar-layer`)
- All legends — choropleth, bubble, pie / column, **values** (`legend-layer`)
- Drill title pill in drill view (`drill-pill-layer`)

The HTML overlay items — *Country View* back-bar, +/- controls
panel, mismatch banner, custom-upload card — live outside the
SVG and are intentionally excluded since they're interactive
chrome rather than data.

## Saving the SVG to a file

Paste the copied text into:

- **A new file in any text editor**, save with a `.svg` extension.
  Double-click to open in your browser, Inkscape, Illustrator.
- **Inkscape / Illustrator** directly via File → New → paste, or
  via "Open clipboard" in some tools.
- **A browser address bar** prefixed with `data:image/svg+xml,` to
  preview without saving (URL-encode the angle brackets / hash
  signs first).

## Use cases

- **Illustrator / Inkscape** — open the saved SVG, ungroup
  repeatedly (Ctrl/Cmd + Shift + G) until each Admin polygon,
  bubble, and label becomes a separately selectable object. Layers
  in the cloned SVG are named `adm1-layer`, `adm2-layer`,
  `bubble-layer`, `glyph-layer`, etc.
- **PowerPoint** — Insert → Pictures → "From a file" → your saved
  `.svg`. PowerPoint will let you ungroup and click-edit individual
  elements.
- **Web embed** — include directly via `<img src="map.svg">` for
  vector quality at any zoom level.
- **Print** — send to a printing house at any DPI without quality
  loss.

## Need a PNG?

The PNG button is intentionally gone — Power BI hosts blocked it
too aggressively to be worth keeping. To get a raster image:

1. Save the copied SVG to a `.svg` file as above.
2. Open it in your browser, Inkscape, Illustrator, or use an online
   SVG-to-PNG converter.
3. Export at whatever resolution you need.

This is one extra step, but it works in 100% of host environments,
which is more than the in-visual PNG export ever did.

## Transparent vs white background

The export inlines whatever background colour the visual uses. If
you've turned on **Transparent background** in Map setup, the
exported SVG is also transparent — the inlined `<rect>` is omitted
or uses a transparent fill. To swap a transparent background for
white, edit the first `<rect>` in the saved SVG, or set a fill on
the canvas in your vector editor.

## What can go wrong

| Symptom | Cause | Fix |
|---|---|---|
| Modal opens but textarea is empty | `buildExportSvg()` failed | Open DevTools console; look for `[ADM Map export]` errors. Most likely a cross-origin stylesheet threw on `cssRules` access. |
| Pasted SVG renders blank in editor | Inline CSS step skipped a cross-origin sheet | Edit `style/visual.less` to put critical rules under classes the visual sets explicitly, then rebuild. |
| Labels missing | Same root cause as blank render | Same fix. |
| File is huge (multi-MB) | Inlined CSS includes the entire host stylesheet | Strip unused rules from the `<style>` block in your editor before saving, or accept it — modern editors handle large SVGs fine. |
| "Try copy" status says blocked | Host CSP refuses both `execCommand` and `writeText` | Use Ctrl/Cmd + C while the textarea is selected. |

The visual logs export attempts to the browser console under the
`[ADM Map export]` prefix.

## See also

- [Map Controls and Navigation](Map-Controls-and-Navigation.md)
- [Troubleshooting](Troubleshooting.md)

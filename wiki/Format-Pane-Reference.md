# Format Pane Reference

Master index of every formatting card in AdminCartograph. The cards
are numbered 1–14 in the format pane so you can walk top-down.

This page summarises each card and links to detailed pages where they
deserve their own deep dive.

| # | Card | What it controls | Detail page |
|---|---|---|---|
| 1 | Map setup | Country, view mode, background, interaction | [Map Setup Settings](Map-Setup-Settings.md) |
| 2 | Choropleth fill | Polygon colour, classification, breaks, no-data | [Choropleth Settings](Choropleth-Settings.md) |
| 3 | Bubble overlay | Proportional bubble layer | [Bubble Settings](Bubble-Settings.md) |
| 4 | Pie / Column overlay | Multi-measure glyph layer (Pie / Donut / Column / Concentric circles) | [Pie / Donut / Column Settings](Pie-Donut-Column-Settings.md) |
| 5 | Borders | Admin1 / Admin2 stroke styling | [Borders Settings](Borders-Settings.md) |
| 6 | Admin1 labels | Labels on Admin1 polygons | [Label Engine](Label-Engine.md) |
| 7 | Admin2 labels — default view | Labels in the all-Admin2 view | [Label Engine](Label-Engine.md) |
| 8 | Admin2 labels — drill view | Labels when drilled into one Admin1 | [Label Engine](Label-Engine.md) |
| 9 | Choropleth legend | Colour-class legend | [Legend System](Legend-System.md) |
| 10 | Bubble legend | Bubble size legend | [Legend System](Legend-System.md) |
| 11 | Pie / Column legend | Glyph categories legend | [Legend System](Legend-System.md) |
| 12 | Legend container | Shared frame styling for all three legends | [Legend System](Legend-System.md) |
| 13 | Scale bar | Distance bar in km / miles | [Scale Bar](Scale-Bar.md) |
| 14 | Map controls | Zoom / pan / export buttons | [Map Controls and Navigation](Map-Controls-and-Navigation.md) |

## Format pane mechanics

Power BI's format pane is the right-hand panel that appears when a
visual is selected. AdminCartograph contributes its 14 cards under
the **Format your visual** tab (paint roller icon).

Each card has a header that toggles open/closed. Inside, **slices**
expose individual settings — a colour picker, a number stepper, a
toggle, a dropdown.

## Settings that "do nothing"

Most settings are wired up; a few have specific dependencies:

| Setting | Only takes effect when |
|---|---|
| **Choropleth → Manual breaks** | Classification = Manual |
| **Pie / Column → Donut inner ratio** | Chart type = Donut |
| **Bubble label placement** | Bubble overlay is Show = on |
| **Glyph label placement** | Glyph chart is Show = on AND glyph data is bound |
| **Custom upload card** | Country = Custom |
| **Drill view labels (#8)** | The user has actually drilled into an Admin1 |

If a setting doesn't seem to do anything, double-check the dependent
toggle is on and the relevant data role is bound.

## Defaults

The default values are chosen so that:

- Bubble overlay, glyph overlay, scale bar, zoom buttons, pan
  buttons, export buttons all default to **OFF** (opt-in features).
- Admin1 labels default to **ON** with bold, font size 12, halo on.
- Admin2 labels (default view) default to **ON**, font size 9.
- Admin2 labels (drill view) default to **ON**, font size 10.
- Choropleth uses Quantile classification, 5 classes, blue ramp.
- Borders are visible on both layers.

## Persisting settings

Power BI persists every setting into the report (`.pbix`). Reopening
the report restores everything — the country dropdown, the colours,
the label fonts, even the uploaded TopoJSON if you used Custom.

For uploaded geometry specifically, see [Custom Properties
Persistence](Custom-Properties-Persistence.md).

## Renaming or restyling for your organisation

The card display names and order are defined in `src/settings.ts`
and `capabilities.json`. To rebrand:

1. Edit the `displayName` of each card / slice.
2. Reorder the `cards = [...]` array in `VisualFormattingSettingsModel`.
3. Rebuild via `npm run release`.

Internal property names (the keys of the `objects` block in
`capabilities.json`) should stay stable so existing reports retain
their persisted formatting after an upgrade.

## See also

- [Settings Model Internals](Settings-Model-Internals.md) — how the
  format pane communicates with the visual code

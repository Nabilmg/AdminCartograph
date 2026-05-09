# 4. Pie / Donut / Column Overlay Settings

A multi-measure data layer drawn on top of the choropleth and
bubble layers. Each polygon shows a small pie, donut, or column
chart whose slices / columns come from your bound measures.

## Prerequisites

Bind 2+ measures to the **Glyph Values (pie / column)** data role.
Each measure becomes one slice / column.

```
Bind:
  Children    → Glyph Values
  Adults      → Glyph Values
  Elderly     → Glyph Values
```

The order of bindings determines the order of slices around the
pie / columns left-to-right.

## Show

| | |
|---|---|
| Type | Toggle |
| Default | Off |

Master switch.

## Chart type

| | |
|---|---|
| Type | Dropdown |
| Default | Pie |
| Options | Pie, Donut, Column |

### Pie

Solid sector chart. Each measure's value is drawn as a slice
proportional to its share of the total.

### Donut

Pie with a hole in the middle (controlled by **Donut inner ratio**).
Useful when you want labels in the centre or just a different visual.

### Column

A small multi-bar chart. Each measure renders as one column;
column heights are scaled to the maximum value within that polygon.

## Min / Max size (px)

| | |
|---|---|
| Type | Number steppers |
| Defaults | Min: 14, Max: 36 |
| Range | 4-100 |

For Pie / Donut, this is the **outer radius**. For Column, this is
the **total height** of the columns. Bigger total = bigger glyph
when **Scale glyph by total** is on.

## Scale glyph by total

| | |
|---|---|
| Type | Toggle |
| Default | On |

When on, glyphs are sized by the sum of their values per area —
bigger total → bigger glyph (using the Min/Max size range, with
square-root scaling identical to bubbles).

When off, every glyph uses the **Max size** regardless of total.
Use this when the relative composition matters more than the
absolute total.

## Stroke color

| | |
|---|---|
| Type | Colour picker |
| Default | `#ffffff` (white) |

Slice / column outline. White against bright fills helps slice
boundaries read clearly.

## Stroke width

| | |
|---|---|
| Type | Number stepper |
| Default | 1 (px) |

## Opacity

| | |
|---|---|
| Type | Number stepper |
| Default | 0.9 |
| Range | 0-1 |

Glyph fill opacity.

## Donut inner ratio

| | |
|---|---|
| Type | Number stepper |
| Default | 0.5 |
| Range | 0-0.85 |
| Visible when | Chart type = Donut |

Hole size as a fraction of the outer radius. 0 makes a pie; 0.5
makes a thick ring; 0.85 makes a thin band.

## Category 1 – Category 8 colours

| | |
|---|---|
| Type | Colour pickers (8) |
| Defaults | A categorical palette (Tableau-like) |

One colour per slice / column. The visual cycles through these in
input order, so the *n*-th measure bound to **Glyph Values** uses
Category *n* color.

If you bind more than 8 measures, the colours cycle (the 9th measure
uses Category 1, etc.).

## Label position vs glyph

| | |
|---|---|
| Type | Dropdown |
| Default | Above glyph |
| Options | Above, Below, Left, Right, Center |

Same logic as the bubble label placement: the polygon's label is
anchored relative to the glyph. When a glyph is shown, glyph
anchors take priority over bubble anchors for label placement.

## Layer order

Glyphs render above bubbles, below labels:

```
choropleth fill
  ↓
Admin1 polygons
  ↓
bubble layer
  ↓
glyph layer  ← (you are here)
  ↓
labels
```

If both bubbles AND glyphs are shown, you'll see overlapping
visuals. The glyph is typically smaller (default Max 36 vs bubble
default Max 30), so they coexist OK; either layer can be hidden if
the combination feels busy.

## Pointer events

Glyphs use `pointer-events: none`. Clicks fall through to the
polygon below — so clicking a slice drills / filters the underlying
Admin area instead of activating slice-level interaction.

## Pie / Column legend

A category legend lists each measure as a swatch + name. See
[Legend System: Pie / Column legend](Legend-System.md#pie-column-legend).

The legend reads the measure's display name from the Power BI
field binding, so renaming a measure updates the legend
automatically.

## When to use which type

| Type | Best for |
|---|---|
| Pie | Composition of a small total (3-4 categories that add to a meaningful whole). |
| Donut | Same use case as pie but with a centre to anchor a label or hole-style visual. |
| Column | Comparing magnitudes across categories where the total isn't meaningful (e.g. 4 different metrics in different units). |

## See also

- [Bubble Settings](Bubble-Settings.md) — the layer below
- [Legend System](Legend-System.md) — how the category legend renders
- [Data Roles Reference](Data-Roles-Reference.md) — Glyph Values
  binding

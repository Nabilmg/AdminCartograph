# 5. Borders Settings

Stroke styling for Admin1 and Admin2 polygons. Independent control
per level so you can emphasise one over the other.

## Admin1 border color

| | |
|---|---|
| Type | Colour picker |
| Default | `#444444` (dark grey) |

The colour of every Admin1 polygon's outline.

## Admin1 border width

| | |
|---|---|
| Type | Number stepper |
| Default | 1 (px) |
| Range | 0-10 |

Set 0 to remove Admin1 borders entirely.

## Admin1 border opacity

| | |
|---|---|
| Type | Number stepper |
| Default | 1 |
| Range | 0-1 |

Helps subdue strong borders without changing colour.

## Admin2 border color

| | |
|---|---|
| Type | Colour picker |
| Default | `#888888` (medium grey) |

The colour of every Admin2 polygon's outline.

## Admin2 border width

| | |
|---|---|
| Type | Number stepper |
| Default | 0.5 (px) |

Admin2 borders are typically thinner than Admin1 by default — they
appear more often and can crowd the visual at high counts.

## Admin2 border opacity

| | |
|---|---|
| Type | Number stepper |
| Default | 0.8 |

## How borders are drawn

Both Admin1 and Admin2 use SVG `stroke` on their respective polygon
paths. The stroke is `vector-effect: non-scaling-stroke` so it stays
the same on-screen width regardless of the visual's zoom — a thin
line stays thin even when zoomed in.

## Layer order

Admin1 borders sit **above** Admin2 borders:

```
adm2-layer  (Admin2 polygon fills + borders)
  ↓
adm1-layer  (Admin1 polygon fills + borders)
  ↓
bubbles, glyphs, labels...
```

In the Admin1 view, the Admin1 layer carries fills *and* borders.
In Admin2 / drill view, the Admin1 layer is `fill: none` so only
its borders show — and they cover the Admin2 borders along the
shared boundary, which gives the cleaner cartographic look (Admin1
boundaries always read as "stronger" than Admin2 boundaries).

## In drill view: dimmed neighbours

When you drill into a single Admin1, its Admin2 children render
with full styling, but the **other** Admin1 borders dim to 35%
opacity (clamped by your configured Admin1 border opacity, so if
you set 0.5 the neighbours go to 0.35; if you set 0.3 they stay
at 0.3).

This makes the focused state's frame stand out without removing
context.

To hide neighbours entirely instead of dimming them, see
**1. Map setup → Hide unfiltered Admin1 in Admin2 mode**.

## Tips

- For dense Admin2 maps, reduce Admin2 border width to 0.25 or
  hide it (width = 0) to declutter.
- For print export (especially black-and-white), set both border
  colours to black and use opacity to differentiate (Admin1 = 1,
  Admin2 = 0.4).
- For subtle hierarchy, set Admin1 to a strong colour (`#1f2933`)
  and Admin2 to a much lighter version of the same hue.

## See also

- [Choropleth Settings](Choropleth-Settings.md) — what fills the
  polygons inside these borders
- [View Modes and Drill](View-Modes-and-Drill.md) — what governs
  which polygons are visible

# 2. Choropleth Fill Settings

Polygon fill colours. The choropleth is the base data layer — every
other layer (bubbles, glyphs, labels) sits on top of it.

## Color mode

| | |
|---|---|
| Type | Dropdown |
| Default | Automatic ramp |
| Options | Automatic ramp, Custom classes |

### Automatic ramp

Generates a 5-class sequential ramp from white to the chosen base
colour. Quick and consistent.

### Custom classes

Enables five colour pickers (Class 1 – Class 5) that let you set
each break-class colour explicitly.

## Base color

| | |
|---|---|
| Type | Colour picker |
| Default | `#1f77b4` (blue) |
| Visible when | Color mode = Automatic ramp |

The ramp's deepest colour. The visual interpolates from white
(class 1) to this colour (class 5).

## Classification

| | |
|---|---|
| Type | Dropdown |
| Default | Quantile |
| Options | Quantile, Equal interval, Manual breaks |

### Quantile

Each class holds roughly the same number of areas. Best when you
want every class to feel "occupied" — useful for ranked storytelling.

```
Sorted values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
5 classes:     [10..30, 30..50, 50..70, 70..90, 90..100]
```

### Equal interval

Classes are evenly spaced from min to max. Best when you want to
emphasise outliers — a few high-value areas can crowd the top class.

```
Range: 10..100, 5 classes
Breaks: 28, 46, 64, 82
```

### Manual breaks

Reads the **Manual breaks** input below; renders classes split at
exactly those numbers.

## Manual breaks

| | |
|---|---|
| Type | Text input |
| Default | empty |
| Format | Comma-separated list of numbers |

Used only when Classification = Manual. Example: `10, 50, 100, 500`
produces five classes:

```
class 1: < 10
class 2: 10 to < 50
class 3: 50 to < 100
class 4: 100 to < 500
class 5: ≥ 500
```

The breaks define the *upper bounds* (exclusive) of each class
except the last.

## Number of classes

| | |
|---|---|
| Type | Number stepper |
| Default | 5 |
| Range | 2-7 |

Used by Quantile / Equal interval. Manual breaks ignores this
(your break list controls class count instead).

## Class 1 – Class 5 colours

| | |
|---|---|
| Type | Colour pickers (5) |
| Default | A blue ramp from #deebf7 to #084594 |
| Visible when | Color mode = Custom classes |

Class 1 is the lightest / lowest, Class 5 the deepest / highest.

## No-data color

| | |
|---|---|
| Type | Colour picker |
| Default | `#eeeeee` (light grey) |

Used for any polygon whose `Color Value` is null, missing, or — if
*Treat 0 as no-data* is on — equal to zero.

## Transparent for no-data

| | |
|---|---|
| Type | Toggle |
| Default | Off |

When on, no-data polygons are transparent (the canvas background
shows through) instead of using the No-data color. Useful for
"absence as visual gap" reporting.

## Treat 0 as no-data

| | |
|---|---|
| Type | Toggle |
| Default | Off |

When on, polygons whose `Color Value` is exactly `0` use the No-data
colour and are excluded from the classification. Use it when `0`
means "no incidents reported" rather than "this area scored at the
bottom of the distribution".

When off (default), `0` is treated as a valid data point and gets
the lowest class colour.

## Fill opacity

| | |
|---|---|
| Type | Number stepper |
| Default | 0.85 |
| Range | 0-1 |

How opaque the polygon fills are. Lower values let underlying base
maps or backgrounds show through; higher values produce solid blocks
of colour.

## How classification works internally

For Quantile, `buildBreaks` (in `src/render/classification.ts`):

1. Filters out null and (optionally) zero values.
2. Sorts ascending.
3. Computes break thresholds at `(i / N) * (length - 1)` percentiles
   for `i = 1..N-1`.
4. Deduplicates so identical adjacent breaks collapse — you don't
   end up with 5 classes when the data really has only 2 distinct
   values. The class count adapts down accordingly.

For Equal interval, breaks are `min + step * i` for `i = 1..N-1`
where `step = (max - min) / N`.

For the Automatic ramp, the visual blends linearly between white
and the base colour at `t = (i + 1) / N` for each class.

## See also

- [Choropleth Legend](Legend-System.md#choropleth-legend) — how
  these classes are presented as a legend
- [Pie / Donut / Column Settings](Pie-Donut-Column-Settings.md) —
  the overlay that sits on top of the choropleth

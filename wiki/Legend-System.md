# Legend System

AdminCartograph has three independent legends (one per data layer)
plus a shared container that wraps any legends sharing the same
canvas corner.

## Three legends, one container

| Legend | Card | Drives |
|---|---|---|
| Choropleth legend | #9 | Colour ramp + class breaks |
| Bubble legend | #10 | Bubble size scale |
| Pie / Column legend | #11 | Glyph categories (one per measure) |
| Legend container | #12 | Frame styling shared by all three |

When two or three legends share a position (e.g. all set to
"Bottom right"), they stack vertically inside one rounded
container with **value first, then bubble, then glyph**. Otherwise
each legend gets its own container in its own corner.

## Choropleth legend (#9)

### Show

| | |
|---|---|
| Type | Toggle |
| Default | On |

### Title

| | |
|---|---|
| Type | Text input |
| Default | empty (uses the measure's display name) |

When blank, the title is taken from the **Color Value** column's
display name in your data binding.

### Orientation

| | |
|---|---|
| Type | Dropdown |
| Default | Vertical |
| Options | Vertical, Horizontal |

#### Vertical

```
Population
■ 0 – 500K
■ 500K – 1M
■ 1M – 2M
■ 2M – 5M
■ 5M+
```

Square swatch + range row, stacked vertically.

#### Horizontal

```
Population
■ ■ ■ ■ ■
500K 1M 2M 5M
```

Swatches in a row, with values labelled beneath. Column width is
calculated to fit the longest label, so "5.4M" never overlaps "10K".

### Position

| | |
|---|---|
| Type | Dropdown |
| Default | Bottom right |
| Options | Top left, Top right, Bottom left, Bottom right |

### Size

| | |
|---|---|
| Type | Dropdown |
| Default | Medium |
| Options | Small, Medium, Large |

Scales font / swatch sizes (×0.8 / ×1.0 / ×1.2).

### Decimals

| | |
|---|---|
| Type | Number stepper |
| Default | 0 |

Decimal places in the legend's range labels.

### Single-class collapse

When the data has only one distinct value (or all areas share the
same value — e.g. after a slicer narrows to one area), the legend
collapses to a single swatch showing just that value, instead of
five identical "v – v" rows.

## Bubble legend (#10)

### Show / Title

Same as choropleth.

### Orientation

| | |
|---|---|
| Type | Dropdown |
| Default | Vertical |
| Options | Vertical, Horizontal (3-4 bubbles), Compact (min / max) |

#### Vertical (default)

Two nested concentric circles — the largest on top with thin
opacity, the smallest centred at the bottom. ~50 px tall, narrow.

#### Horizontal (3-4 bubbles)

A row of 3-4 baseline-aligned circles ascending in size from left to
right, with their measure values labelled beneath. The legend uses
geometric-mean stops so the spacing reads as a clean log progression
that matches the bubbles' √-area scale.

When the dynamic range is large (`max / min ≥ 10`), four stops are
drawn instead of three.

#### Compact (min / max)

Two baseline-aligned circles (smallest + largest) connected by a
thin bracket with end ticks. Roughly half the footprint of the
3-4 bubble layout.

### Position / Size

Same as choropleth.

## Pie / Column legend (#11)

### Show / Title / Orientation / Position / Size

Same shape as the others.

### What it draws

One swatch + measure-name row per category. Labels come from the
display names of the measures bound to **Glyph Values**, so renaming
a measure updates the legend automatically.

```
Categories
■ Children
■ Adults
■ Elderly
```

The colours come from Pie / Column overlay → Category 1-8 colour
pickers in input order.

## Legend container (#12)

Frame styling shared by all three legends.

### Border width

| | |
|---|---|
| Type | Number stepper |
| Default | 1 |

### Border color

| | |
|---|---|
| Type | Colour picker |
| Default | `#cccccc` (light grey) |

### Corner radius

| | |
|---|---|
| Type | Number stepper |
| Default | 6 |

### Padding

| | |
|---|---|
| Type | Number stepper |
| Default | 8 |

### Background color

| | |
|---|---|
| Type | Colour picker |
| Default | `#ffffff` (white) |

### Background opacity

| | |
|---|---|
| Type | Number stepper |
| Default | 0.9 |

A semi-opaque background lets the legend sit over the choropleth
without occluding it entirely.

## How combined containers work

If three legends are at the same position, the visual:

1. Renders each legend into its own sub-group with its native bbox.
2. Stacks the sub-groups vertically with an 8 px gap, *Value
   first, then Bubble, then Glyph*.
3. Computes the union bbox of the stack.
4. Draws **one** rounded rect around the lot.
5. Translates the whole thing into the chosen corner.

Each legend's `Position` setting is independent — you can put the
choropleth legend at "Bottom right" and the bubble legend at "Top
left" if you want them separate; or put both at "Bottom right" and
they auto-combine.

## See also

- [Choropleth Settings](Choropleth-Settings.md)
- [Bubble Settings](Bubble-Settings.md)
- [Pie / Donut / Column Settings](Pie-Donut-Column-Settings.md)

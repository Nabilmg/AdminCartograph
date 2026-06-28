# Legend System

AdminCartograph has four independent legends (one per data layer, plus
the admin-levels legend) and a shared container that wraps any legends
sharing the same canvas corner.

## Five legends, one container

| Legend | Card | Drives |
|---|---|---|
| Choropleth legend | #9 | Colour ramp + class breaks (or category swatches in Categorical mode) |
| Bubble legend | #10 | Bubble size scale |
| Pie / Column legend | #11 | Glyph categories (one per measure) |
| Admin levels legend | #12 | Stroke samples for Admin1 / Admin2 borders, labelled with the level aliases |
| Values legend | #13 | One `#` swatch per active label value source (Choropleth / Bubble / Label Value 2) |
| Legend container | #14 | Frame styling, header style, orientation toggle |

When two or more legends share a position (e.g. all set to
"Bottom right"), they stack inside one rounded container in
**map z-order**: Values legend → Glyph legend → Admin levels →
Bubble legend → Choropleth legend (top to bottom). The container
itself can be oriented vertical (default — top-to-bottom) or
horizontal (side-by-side) via the container card's
**Container orientation** dropdown. Otherwise each legend gets its
own container in its own corner.

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
| Options | Top left, **Top centre**, Top right, **Left centre**, **Right centre**, Bottom left, **Bottom centre**, Bottom right |

The four centred variants snap the legend to the midpoint of an edge
(or the middle of a side, for left / right). Useful when a corner is
busy with overlapping labels or controls.

### Size

| | |
|---|---|
| Type | Dropdown |
| Default | Medium |
| Options | **Minimal**, Small, Medium, Large |

Scales font / swatch sizes (×0.6 / ×0.8 / ×1.0 / ×1.2).

**Minimal** is more than just a smaller scale — it also collapses
the legend's content:

- *Choropleth (numeric modes)*: only the **first and last** breakpoints
  are shown, marked with `−` (low end) and `+` (high end). Categorical
  mode still shows every category.
- *Bubble*: forces the **Compact (min / max)** orientation regardless
  of the orientation dropdown.
- *Other legends*: rendered at the ×0.6 size with no content
  collapse.

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

## Admin levels legend (#12)

A short stroke sample per administrative level with the level's
alias as the label — explains the line styles drawn by the
[Borders card (#5)](Borders-Settings.md).

```
Admin levels
━━━ Governorate
━━━ District
```

Stroke colour + width come from the Borders card (no separate
swatch settings here), so changing borders updates the legend
automatically. Labels come from the General card's
**Admin1 alias** / **Admin2 alias** — defaults are `Admin1` /
`Admin2`, but renames like `Governorate` / `District` flow through.

| Setting | Default |
|---|---|
| Show | Off |
| Show Admin1 | On |
| Show Admin2 | On |
| Title | empty (no header) |
| Orientation | Vertical |
| Position | Bottom left |
| Size | Medium |

The two per-level toggles let you draw just one row instead of
both — useful for reports that only bind one level.

## Values legend (#13)

Explains the numbers shown on the map's labels by listing each
bound measure with a `#` swatch in the matching label-value
colour. Reads the **Admin1 labels** card's *Value source* to decide
which entries appear (in drill view it switches to the
**drillLocalityLabels** card; in non-drilled Admin2 view, the
**localityLabels** card).

```
Values
# PiN                  (colour from Value color)
# Target               (colour from Bubble value color)
# Financial Req…       (colour from Custom value color)
```

| Setting | Default |
|---|---|
| Show | Off |
| Title | empty (no header) |
| Orientation | Vertical (one entry per line) / Horizontal (side by side) |
| Position | Top left |
| Size | Medium |

The `#` colour comes from the active label card's
`Value color` / `Bubble value color` / `Custom value color`
pickers — change those and the legend updates.

Empty entries (a measure isn't bound, or its display name is
blank) are skipped, so a single-source label setup produces a
single-line legend.

## Legend container (#14)

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

### Header color / Header bold / Header font size

Style for every legend's title text inside this container.

| Setting | Default |
|---|---|
| Header color | `#222222` |
| Header bold | On |
| Header font size (px) | `0` (auto — each legend uses its own body-relative size) |

Header font size of **0** keeps the legacy auto-sized titles
(legend's body fontSize × 1.2). Any positive value pins every
combined legend's header to that exact pixel size.

### Item color / Item font size / Item swatch size

Style for each legend's individual rows inside this container.

| Setting | Default |
|---|---|
| Item color | `#222222` (range labels, measure names, # text) |
| Item font size (px) | `0` (auto — each legend's body size) |
| Item swatch size (px) | `0` (auto — each legend's body-relative swatch) |

These overrides flow into every sub-legend (choropleth ranges,
bubble values, glyph categories, values `#`). A positive value pins
the size — `0` keeps the legend's own scale (driven by the legend's
own **Size** dropdown). Use these to harmonise mixed legends in a
single container.

### Container orientation

| | |
|---|---|
| Type | Dropdown |
| Default | Vertical (top → bottom) |
| Options | Vertical (top → bottom), Horizontal (left → right) |

Vertical stacks combined legends top-to-bottom; horizontal
arranges them side-by-side. Useful when several legends share a
single corner and you want the container as a wide strip rather
than a tall column. Each sub-legend keeps its own internal
layout — the orientation toggle only changes how the sub-groups
themselves are positioned relative to each other.

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

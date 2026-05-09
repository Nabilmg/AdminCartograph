# Label Engine

How AdminCartograph draws text labels on polygons. Three format
cards control the engine — Admin1 labels (#6), Admin2 labels —
default view (#7), Admin2 labels — drill view (#8) — and they all
share the same set of slices.

## Common slices (all three label cards)

### Show

| | |
|---|---|
| Type | Toggle |
| Defaults | Admin1: ON; Admin2 default: ON; Admin2 drill: ON |

Master switch per card.

### Content

| | |
|---|---|
| Type | Dropdown |
| Default | Name only |
| Options | Name only, Value only, Name + value |

What the label shows.

| Option | What it draws |
|---|---|
| **Name only** | The polygon's name — see *Name source* below. |
| **Value only** | The polygon's number — see *Value source* below. |
| **Name + value** | Name lines on top, value lines beneath. |

### Name source

| | |
|---|---|
| Type | Dropdown |
| Default | Geometry name |
| Options | Geometry name, Label Text 1 (override) |

Picks where the area name comes from.

| Option | Draws |
|---|---|
| Geometry name (default) | The polygon's bundled `ADM1_EN` / `ADM2_EN`, or its PCODE when neither exists. |
| Label Text 1 (override) | The string from the `Label Text 1` data role. Falls back to the geometry name when nothing is bound, so picking this option without binding the role is a safe no-op. |

This is explicit: nothing happens silently. Bind `Label Text 1` for
localised names, then flip the dropdown to use them.

### Value source

| | |
|---|---|
| Type | Dropdown |
| Default | Choropleth value |
| Options | Choropleth value, Bubble value, Choropleth + Bubble, Label Value 2 (only), Choropleth + Label Value 2, Bubble + Label Value 2, All three |

Picks which numeric line(s) the label shows. Each chosen source
contributes its own line in display order: choropleth → bubble →
custom (Label Value 2). Sources that include "Label Value 2" only
contribute a line when the role is actually bound — pick the option
without binding and you get an explicit no-op.

| Option | Draws |
|---|---|
| Choropleth value (default) | The colour-driving measure, painted in **Value color**. |
| Bubble value | The bubble-size-driving measure, painted in **Bubble value color**. |
| Choropleth + Bubble | Two lines: choropleth in **Value color**, bubble in **Bubble value color**. |
| Label Value 2 (only) | Just the bound `Label Value 2`, painted in **Custom value color**. |
| Choropleth + Label Value 2 | Two lines: choropleth + custom value, in their respective colours. |
| Bubble + Label Value 2 | Two lines: bubble + custom value. |
| All three | Three lines: choropleth, bubble, custom — each in its own colour. |

> **Heads-up if you upgrade an existing report.** Previous builds
> silently overrode the value source when `Label Value 2` was bound.
> After this change the override is gone — pick a "+ Label Value 2"
> combination explicitly to keep showing it. Same for `Label Text 1`
> (now requires *Name source = Label Text 1*).

### Font family

| | |
|---|---|
| Type | Font picker |
| Default | Segoe UI |

### Font size

| | |
|---|---|
| Type | Number stepper |
| Default | Admin1: 12, Admin2: 9 (default), 10 (drill) |

### Color (label color)

| | |
|---|---|
| Type | Colour picker |
| Default | `#222222` |

The colour for **Name** lines.

### Value color

| | |
|---|---|
| Type | Colour picker |
| Default | `#444444` |

The colour for **Value** lines (when the value comes from the
choropleth measure).

### Bubble value color

| | |
|---|---|
| Type | Colour picker |
| Default | `#e6550d` (orange) |

The colour for **Value** lines that come from the bubble-size
measure (any Value source containing "Bubble").

### Custom value color (Label Value 2)

| | |
|---|---|
| Type | Colour picker |
| Default | `#0f766e` (teal) |

The colour for **Value** lines that come from the `Label Value 2`
data role (any Value source containing "Label Value 2"). Defaults
to teal to read distinctly from the choropleth and bubble lines.

### Bold / Italic

Toggle pair.

### Halo color / Halo width

| | |
|---|---|
| Halo color default | White |
| Halo width default | 2 (px) |

Renders a stroke behind the glyphs so the label stays legible against
any choropleth fill colour. Achieved with SVG `paint-order: stroke
fill` on a single text element.

### Decimals

| | |
|---|---|
| Type | Number stepper |
| Default | 0 |

Number of decimal places in the value line.

### Number format

| | |
|---|---|
| Type | Dropdown |
| Default | Auto |
| Options | Auto, Thousands (K), Millions (M), Percent |

Formats large numbers compactly:

| Auto | Thousands | Millions | Percent |
|---|---|---|---|
| `5,400,000` becomes `5.4M` | `5,400` becomes `5.4K` | `5,400,000` becomes `5.4M` | `0.85` becomes `85%` |

Auto mode picks K / M / B based on magnitude.

## Placement (positioning)

| | |
|---|---|
| Type | Dropdown |
| Default | Horizontal |
| Options | Horizontal, Straight, Curved, Boundary |

Where the label is placed inside the polygon.

| Option | Behaviour |
|---|---|
| Horizontal | Text horizontal, anchor at the polygon's interior centroid (computed via `polylabel`). |
| Straight | Text rotated to align with the polygon's principal axis (PCA on the projected outer ring). Tilted polygons get tilted text. Normalised to ±90° so text never appears upside down. |
| Curved | Same axis rotation as Straight, *plus* the name line flows along a quadratic Bezier so the line bends. Distinct from Straight: Straight has zero curvature, Curved bends. |
| Boundary | Anchor nudged toward the polygon's upper edge, leaving the centre clear. |

Placement is a *positioning* choice and applies regardless of fit.
The fitting strategies (below) only kick in when the placed label
overflows.

## Fitting (only when the placed label doesn't fit)

### Words on separate lines

| | |
|---|---|
| Type | Toggle |
| Default | Off |

Splits a multi-word name into one word per line. **Always** applies
when on, regardless of fit.

### Stack when needed

| | |
|---|---|
| Type | Toggle |
| Default | On |

Word-wraps a multi-word name to fit the polygon width — but **only
if the label fails the fit check**. Try once, before falling back to
abbreviate or font-shrink.

### Reduce font size

| | |
|---|---|
| Type | Toggle |
| Default | On |

Iteratively shrinks the font (down to a 7 px floor) until the label
fits. Applies only when overflow.

### Allow overrun

| | |
|---|---|
| Type | Toggle |
| Default | Off |

When on, the engine never shrinks / wraps / abbreviates — labels
are allowed to extend past polygon boundaries.

### Abbreviate / truncate

| | |
|---|---|
| Type | Toggle |
| Default | On |

Truncates with ellipsis when the label is still too wide after
wrap / shrink. `Greater Khartoum Metropolitan Area` becomes
`Greater Khar…`.

### Spread characters

| | |
|---|---|
| Type | Toggle |
| Default | Off |

Adds 1.5 px letter-spacing — gives a more deliberate / cartographic
look. The halo idiom (`paint-order: stroke fill`) handles spread
characters cleanly.

### Avoid holes

| | |
|---|---|
| Type | Toggle |
| Default | On |

When picking the polygon's interior anchor, ignore inner holes
(the donut hole of an enclave). `polylabel` is given only the
outer ring.

### Label largest polygon part

| | |
|---|---|
| Type | Toggle |
| Default | On |

For multi-polygon features (a state plus an offshore island), label
only the largest part instead of trying to label every component.

### Allow callout if outside

| | |
|---|---|
| Type | Toggle |
| Default | Off |

Reserved for a future external-callout implementation. Currently
unused.

## Drill view: neighbour labels

In Admin2 drill view, the focused state's label is promoted to a
header pill anchored top-left (using the `Admin1 labels` card's
formatting). The other Admin1 areas around it still get on-polygon
labels, but with two adjustments:

1. Anchored 70% of the way from the polygon's interior centroid
   toward the boundary closest to the focused state — so the label
   sits near the shared border instead of the polygon's centroid
   (which is often off-canvas).
2. Rendered with `hideOnOverflow: true` and `allowOverrun: false`,
   so a label that can't fit at any size disappears entirely
   rather than spilling onto the focused state.

Plus the neighbour-labels group as a whole renders at 55% opacity
(neighbour Admin1 borders dim to 35%), so the focused state reads
as the foreground.

## Title pill (drill view, top-left)

The drilled state's label is rendered as an HTML / SVG pill in the
top-left corner of the canvas, not on the polygon. Sizing:

- Title (name) line: floor at 20 px or `card.fontSize + 6`,
  whichever is bigger; **always bold**.
- Value lines: title size × 0.85.

Plus a drop shadow so the pill reads as a screen header against
any choropleth.

## See also

- [Format Pane Reference](Format-Pane-Reference.md)
- [View Modes and Drill](View-Modes-and-Drill.md) — when each card
  applies

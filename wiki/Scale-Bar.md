# 13. Scale Bar

A small horizontal bar that shows how many kilometres (or miles) a
span on the map represents. Adapts to the projection and the user's
zoom level.

## Show

| | |
|---|---|
| Type | Toggle |
| Default | Off |

Master switch.

## Units

| | |
|---|---|
| Type | Dropdown |
| Default | Kilometres |
| Options | Kilometres, Miles |

Both options use the *same* underlying calculation (pixels per
degree of longitude at viewport centre); the units only change the
final label.

## Position

| | |
|---|---|
| Type | Dropdown |
| Default | Bottom left |
| Options | Top left, Top right, Bottom left, Bottom right |

Where the scale bar sits inside the canvas. 12 px margin from the
chosen corner.

## Color

| | |
|---|---|
| Type | Colour picker |
| Default | `#222222` (near-black) |

The colour of the bar's filled half, ticks, and text. The "white"
half of the bar uses pure white regardless.

## Font size

| | |
|---|---|
| Type | Number stepper |
| Default | 11 (px) |

## How the distance is calculated

For every render, the visual:

1. Inverts the projection at the viewport centre to get the
   geographic centre's `(lon, lat)`.
2. Computes 1 km per degree of longitude as
   `111.32 * cos(lat * π/180)` (the latitude-aware conversion).
3. Projects `(lon, lat)` and `(lon + 1°, lat)` to screen pixels;
   takes the difference to get pixels per degree of longitude.
4. Combines into pixels per kilometre.
5. Multiplies by the user's current zoom level (the legend lives
   outside `mapGroup`, so we apply zoom manually).
6. Picks a "nice round" target distance whose on-screen length is
   ~100 px: `1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, ...`
7. Renders a bar of that exact length.

When you zoom in, the bar shrinks (because each km covers more
pixels at higher zoom), so the next "nice" smaller value is
chosen. You'll see it snap from "100 km" to "50 km" to "20 km" as
you zoom.

## Visual style

The bar is a classic two-segment cartographic style:

```
| ────────  ════════ |
0          50      100 km
```

- White half + dark half, both 6 px tall.
- Tick marks at the start, midpoint, and end (10 px tall).
- Numeric labels at the end and midpoint.
- "0" on the left, "100 km" (or whatever distance) on the right.

## Latitude-aware: why it matters

A degree of longitude at the equator is ~111 km. At 60° latitude,
it's ~55 km. At 80°, only ~19 km. If you used a fixed conversion,
maps of high-latitude regions (Russia, Greenland, northern Canada)
would have wildly inaccurate scale bars.

The visual computes the conversion from the latitude at the
viewport centre, so the scale bar is always accurate for whatever
country / region is currently visible.

## When the scale bar doesn't render

The bar quietly hides when:

- `Show` is off.
- The projection's `invert` returns null (rare; happens at projection
  edge cases).
- The computed bar would be smaller than 8 px (the visual is too
  zoomed-out for any useful distance to show).

## Pre-projection vs post-projection

Important: the scale bar is rendered into the visual's `legend`
sibling group, NOT inside `mapGroup`. This means:

- The bar stays at a constant size when you zoom. The map content
  inside `mapGroup` scales; the scale bar stays put.
- Even though the visual *content* scales, the scale-bar
  *calculation* accounts for zoom — so the displayed distance is
  always correct.

## See also

- [Map Controls and Navigation](Map-Controls-and-Navigation.md) —
  zoom + pan that the scale bar adapts to
- [Architecture Overview](Architecture-Overview.md) — projection +
  layer order details

# View Modes and Drill

How the visual decides whether to show Admin1, Admin2, or a
focused-Admin1 drill. The behaviour combines:

- The **View mode** setting (Auto / Admin1 / Admin2)
- Whether the user clicked an Admin1 polygon (manual drill)
- Whether an external slicer / cross-filter narrows the data

…in roughly that priority order.

## The three views

### Admin1 view

All Admin1 polygons of the chosen country are visible. Choropleth
fill comes from your data at the Admin1 level (or, if you only
bound Admin2 PCODE, summed up from Admin2 to Admin1). Bubbles and
glyphs render at the Admin1 level. Labels: Admin1 labels card.

### Admin2 view (no drill)

All Admin2 polygons of the chosen country are visible. Each Admin2
gets its own choropleth fill / bubble / glyph from your Admin2
data. Admin1 polygons are still drawn underneath but with `fill:
none` and `pointer-events: none` (their borders are visible on
top to delineate Admin1 boundaries). Labels: Admin2 labels —
default view card.

### Drill view

You've drilled into a single Admin1. That Admin1's Admin2 children
render in full — coloured by data, labelled, optionally bubbled or
glyphed. Other Admin1s dim to 35% opacity (or hide entirely if you
turned on **Hide unfiltered Admin1 in Admin2 mode**).

The drilled Admin1's name + value appears in a top bar that adapts
to the viewport — see [Drill UI bits](#drill-ui-bits) below. Two
arrow buttons next to the home icon let you prev / next through
Admin1 areas alphabetically without leaving drill mode. Labels:
Admin2 labels — drill view card; the focused state itself uses
Admin1 labels formatting in pill form.

## Auto mode (default)

The visual starts at **Admin1 view**. It enters drill view when
**any** of the following happens:

### A. The user clicks an Admin1 polygon

If both Admin1 PCODE and Admin2 PCODE are bound, *and* the country
has Admin2 geometry, click-to-drill takes you into the focused
state. A click also submits the area's selection through
`selectionManager.select` so the rest of the report cross-filters
to that state.

If only Admin1 PCODE is bound (or the country has no Admin2),
clicks just cross-filter — no drill happens. The drill UI
(prev/next arrows, title pill) doesn't appear.

### B. An external slicer narrows to one Admin1

A slicer / cross-filter that reduces the dataset to exactly one
Admin1 PCODE triggers an auto-drill into that area. Clearing the
slicer takes you back to Admin1 view.

### C. An external slicer narrows to several Admin2 under one parent

Same idea: if every Admin2 in the filtered data has the same parent
Admin1, the visual auto-drills into that parent. This is the
common case for "click multiple districts in a table to see them
focused on the map".

### What auto-drill does NOT trigger on

- Sparse data. If your fact table only has rows for some Admin1s
  but the slicer is empty, the visual stays in Admin1 view. (An
  earlier version misread sparse data as a filter and auto-drilled
  spuriously; that was rolled back.)
- Filter context that spans multiple Admin1s. Two states selected
  in a slicer = stay in country view.

## Admin1 mode (locked)

The visual stays in Admin1 view regardless of clicks or filters.
Use this when you want a stable subnational choropleth that other
visuals cross-filter against, but you don't want the map itself to
zoom around.

## Admin2 mode (locked)

The visual stays in the all-Admin2 view. Every Admin2 polygon in
the country is visible. Use this when:

- You want to expose every Admin2 always, regardless of what's in
  your data.
- You're using AdminCartograph as a "dense locality map" rather
  than as a drill-from-state visual.

In Admin2 locked mode, slicer narrowing doesn't drill. You see
every Admin2; the filter context dims unfiltered ones (controlled
by `selectionManager.select`'s default highlight behaviour).

## Returning from drill

Three ways to exit drill view:

| Action | What it does |
|---|---|
| Click the **home icon** in the top-left | Returns to Admin1 view; clears the manual drill flag; clears the host selection so other visuals stop cross-filtering. |
| Click on map background (empty space) | Clears the selection / drill — same effect as the home icon. |
| Clear the external slicer that triggered the drill | Returns automatically (drill was filter-driven). |
| Switch View mode to Admin1 | Forces Admin1 view immediately. |

If you hit the **home icon** while in a filter-driven drill, the
visual remembers your "exit" intent — it won't immediately
re-drill back to the same Admin1 even though the slicer is still
active. The remembrance clears the moment the slicer changes.

## Prev / next navigation

In drill view, two small arrow buttons sit beside the home icon:

```
[🏠]  [‹]  [›]   Focused State — 1.2M
```

- **‹** drills into the alphabetically previous Admin1.
- **›** drills into the alphabetically next Admin1.

Both **also** submit a selection through `selectionManager.select`,
so flipping between states updates the rest of the report —
matching the click-to-drill behaviour.

### Navigation respects filters

When an external slicer narrows the data to a subset of states, the
prev / next buttons only walk through that subset. The visual builds
the nav order from the *in-data* Admin1 PCODEs (via the prepared
data view's filtered state list) rather than the geometry's full
country list — so you'll never get an *"No PCODE matches"* error
when stepping through a 5-state subset.

This works whether you've bound Admin1 PCODE, Admin2 PCODE, or
both. When only Admin2 is bound, the visual derives each Admin2's
parent Admin1 from the geometry and dedups to the in-filter
Admin1s.

## Drill UI bits

The drill view adds a few non-data overlays around the map. The top
bar itself has **three responsive layouts** keyed off the viewport
width:

### Top bar — three modes

| Mode | When | Layout |
|---|---|---|
| **Large** | `viewportW ≥ 500 px` | Home icon, prev / next arrows, an inline "Country View" hint, and a separate **title pill** below the bar showing the focused state's name + value. |
| **Medium** | `320 ≤ viewportW < 500 px` | Home icon + prev / next arrows; the focused state's name + value is inlined to the right of the buttons (no separate pill, no "Country View" hint). |
| **Small** | `viewportW < 320 px` | Just the home icon + arrows in a compact row. No inline name. Useful in the tiny "card" tile sizes Power BI dashboards often use. |

The pill / inline name uses the Admin1 labels card's *Content*
setting to decide whether to show name only or name + value. In
*Name + value* mode the value comes from the Choropleth fill / Bubble
size / Label Value 2 measures (whichever are bound), coloured to
match the label card's value-colour pickers.

The pill is a screen-space SVG element outside `mapGroup`, so it
stays glued to its position regardless of zoom / pan.
- **Reset zoom-and-pan button** — appears on the on-canvas controls
  panel any time `zoomLevel > 1` or `panX/Y != 0`, regardless of
  whether **Show zoom buttons** is on. Wheel / drag users can still
  reset their view without enabling the +/- buttons.
- **Neighbour Admin1 borders + labels** — dim to ~55% / 0.35
  stroke-opacity, with their polygon fills replaced by the visual
  background colour so the choropleth doesn't bleed through. The
  same dimming kicks in for partial-filter mode in Admin2 view
  (no drill click required) — see [Borders Settings →
  Filter dimming](Borders-Settings.md#in-drill-view--filter-dimming).
- **Neighbour labels never spill onto the focused state** — any
  neighbour Admin1 label whose anchor lies inside the focused
  polygon is dropped. Labels at the shared border with anchors
  in their own polygon stay visible.
- **Neighbour labels are name-only** — even if the **Admin1
  labels** card has Content set to *Name + Value*, the value lines
  are stripped from neighbour labels in drill view. The focused
  state's value still appears in the title pill, and per-neighbour
  values in a single-state-focus context just add noise.

To hide all of this for a clean dashboard embed, set **1. Map
setup → Hide map chrome** to on. The title pill stays (it's a
label, not chrome) but the back-bar and controls disappear.

The order is alphabetical by `ADM1_EN` from the bundled geometry
(or from your custom mapping's Admin1 Name field).

## When only one PCODE is bound

If only Admin1 PCODE is bound (no Admin2), the visual stays in
Admin1 view permanently. Clicks on Admin1 areas submit a selection
to cross-filter the report but never drill. This is the right
behaviour: with no Admin2 data bound, the drill view would just
show empty grey polygons. Better to stay where the data is.

If only Admin2 PCODE is bound (no Admin1), the visual aggregates
your Admin2 values up to their parent Admin1 (sum) for the Admin1
view, and uses the raw Admin2 data for Admin2 / drill views.
Drilling works normally.

## See also

- [Map Setup Settings](Map-Setup-Settings.md) — the View mode
  dropdown
- [Cross-Filter Behavior](Cross-Filter-Behavior.md)
- [Label Engine](Label-Engine.md) — which label card applies when

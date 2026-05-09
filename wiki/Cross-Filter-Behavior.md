# Cross-Filter Behaviour

How clicks on the map drive other visuals on the page, and how
external visuals drive AdminCartograph in return.

## What cross-filter is

In Power BI, when a visual on a page submits a "selection", the
host narrows the data on every other visual on the same page to
just that selection. Click a state on a map → the bar chart next
to it shows just that state's totals.

AdminCartograph submits selections via the host's
`ISelectionManager` API.

## What gets cross-filtered

### Click on Admin1 (Country View)

When you click an Admin1 polygon in Country View:

| If you bound | The selection submitted is |
|---|---|
| **Admin1 PCODE** | The Admin1 PCODE selection identifier (the row of data corresponding to that Admin1). |
| **Admin2 PCODE only** (no Admin1) | The union of every Admin2's selection identifier whose parent is the clicked Admin1. The host filters by the union, so other visuals see all Admin2s within that state. |

Other visuals on the page narrow to the Admin1's data.

### Click on Admin2 (Admin2 view or drill view)

The clicked Admin2's selection identifier is submitted directly.
Other visuals narrow to that single Admin2.

### Prev / next arrows

Same as a click on the corresponding Admin1 — the new Admin1's
selection is submitted, replacing whatever was selected before.

### "← Country View" button

Calls `selectionManager.clear()`. Other visuals drop the cross-
filter; they go back to showing the unfiltered dataset.

## Multi-select with Ctrl / Cmd

Hold **Ctrl** (Windows) or **Cmd** (macOS) while clicking to add
the click to the existing selection instead of replacing it. So:

```
Click SD01            → other visuals filter to Khartoum
Ctrl-click SD02       → other visuals filter to Khartoum + Al Jazira
Click SD03 (no Ctrl)  → other visuals filter to South Darfur only
```

Multi-select is supported on both Admin1 and Admin2 clicks.

## Visual highlight (the dimming effect)

When a cross-filter is active, every other visual on the page
*highlights* the selected portion of its data. The standard Power
BI behaviour is to dim the unselected portion to ~30% opacity.

AdminCartograph itself does the same in reverse — when it has a
host selection active:

- Selected polygon(s): full opacity.
- Other polygons: **dimmed to 40% of their normal fill opacity**.

This makes the selected area visually pop while keeping the rest
as soft context. (Bubble fill opacity isn't dimmed since bubbles
are decorative; only the choropleth fill dims.)

## External cross-filter coming the other way

When another visual on the page (a slicer, a table, a chart)
narrows the data through its own selection, AdminCartograph sees
the narrower DataView on its next `update()`. Two things happen:

1. The choropleth, bubbles, glyphs only render for the areas in
   the filtered data. Other areas show as no-data.
2. **In Auto view mode**, the visual auto-drills if the filter
   resolves to one Admin1 — see [View Modes and Drill](View-Modes-and-Drill.md).

In **Admin1 / Admin2 locked** modes, auto-drill is disabled and the
visual just renders the filtered data without changing view.

## Disable interaction

To disable cross-filter from the map (keep tooltips, lose drill
and selection):

**1. Map setup → Interaction enabled → Off**

When off:

- No click handlers fire on Admin1 / Admin2 polygons.
- The drill state is still readable from the format pane (so a
  filter elsewhere can still drive the view in Auto mode), but
  the user can't trigger drill via clicks.
- Tooltips on hover still work.

This is the right setting for read-only / presentation views.

## Edges and gotchas

### Selection cleared on country change

Switching the **Country** dropdown to a different country wipes
any active selection (a different country has different Admin
identifiers).

### Highlights vs filters

Power BI distinguishes "highlight" (dim the rest, but show the
totals as faded) from "filter" (hide the unselected entirely).
The visual's `selectionManager.select` triggers a *highlight*
in most receiving visuals — that's the default. Visuals
explicitly configured for filtering will filter instead.

### Programmatic selection from external code

There's no public API to drive AdminCartograph's selection from
outside Power BI. Use slicers (which AdminCartograph reacts to)
or report-level filters.

### Accessibility

Every clickable element has `tabindex="0"` and `role="button"`
so keyboard users can focus and activate them with Enter or Space.

## See also

- [View Modes and Drill](View-Modes-and-Drill.md)
- [Data Roles Reference](Data-Roles-Reference.md) — which fields
  carry the selection identifiers

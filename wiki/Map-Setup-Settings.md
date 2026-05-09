# 1. Map Setup Settings

The first card in the format pane. Controls which country renders,
what level of detail the visual starts at, and overall canvas
appearance.

## Country

| | |
|---|---|
| Type | Dropdown |
| Default | Auto-detect (from PCODE) |
| Options | Auto-detect, the bundled countries, Custom |

The bundled options are auto-generated from `country-geojson/` at
build time. The current bundle ships eight: Afghanistan, DR Congo,
Haiti, Iran, Lebanon, Sudan, Syria, Yemen.

### Auto-detect (from PCODE)

Inspects the leading two characters of your bound PCODEs and picks
the matching bundled country. Falls back to a "pick explicitly"
prompt if no bundled country matches. See [PCODE
Matching](PCODE-Matching.md).

### A specific country (e.g. Sudan (SDN))

Skips auto-detect; uses the chosen country's geometry. Useful when:

- Auto-detect is picking the wrong country (e.g. ambiguous PCODE
  prefix).
- You want to lock a report to one country regardless of data.

### Custom (upload TopoJSON)

Hides the bundled geometry and shows the upload card on the canvas.
See [Custom Geometry Upload](Custom-Geometry-Upload.md).

## View mode

| | |
|---|---|
| Type | Dropdown |
| Default | Auto |
| Options | Auto, Admin1, Admin2 |

### Auto (default)

Starts at the Admin1 view. Drills into Admin2 only when **either**:

- The user has clicked an Admin1 polygon (manual drill), or
- An external slicer / cross-filter narrows the dataset to exactly
  one Admin1 (or several Admin2s under one parent Admin1).

When the slicer is cleared, the visual returns to Admin1 view.

### Admin1

Locks the visual to the Admin1 view. Clicks cross-filter but never
drill. Slicer narrowing doesn't drill either — the visual stays
showing all Admin1 polygons regardless.

### Admin2

Locks the visual to the all-Admin2 view (every Admin2 polygon in
the country, regardless of filter context). Clicks cross-filter at
the Admin2 level.

## Interaction enabled

| | |
|---|---|
| Type | Toggle |
| Default | On |

Master switch for click handling. When off, clicks no longer drill
or cross-filter (tooltips still work). Useful for pure presentation
mode.

## Hide unfiltered Admin1 in Admin2 mode

| | |
|---|---|
| Type | Toggle |
| Default | Off |

In Admin2 view (or after a drill / filter narrowing), this controls
whether non-focused Admin1 areas show their borders dimly in the
background or are hidden entirely.

| Setting | Result |
|---|---|
| Off (default) | Neighbour Admin1 borders dim to 35% opacity but stay visible as context. |
| On | Neighbour Admin1 polygons disappear; only the focused Admin1 (and its Admin2 children) renders. |

Use it when you want the focus state to be the *only* thing on
screen.

## Background color

| | |
|---|---|
| Type | Colour picker |
| Default | `#ffffff` (white) |

The canvas background colour. Affects the area outside the country's
geometry and in the letterboxed margins.

## Transparent background

| | |
|---|---|
| Type | Toggle |
| Default | Off |

When on, the canvas background becomes transparent so any colour
behind the visual (e.g. a coloured PowerPoint slide background, or
a gradient panel in the report) shows through.

The PNG export still renders a white background regardless, so the
transparent setting only affects on-screen rendering.

## Hidden persistence properties

Five properties in this card are populated programmatically and
hidden from the format pane UI:

| Property | What it stores |
|---|---|
| `customAdm1Json` | The full text of the uploaded Admin1 file |
| `customAdm2Json` | The full text of the uploaded Admin2 file (if any) |
| `customFieldMapping` | JSON mapping of field names |
| `customTopoName` | Friendly name for the uploaded dataset |

Don't try to edit these by hand. Use the Custom Geometry Upload UI.
See [Custom Properties Persistence](Custom-Properties-Persistence.md).

## See also

- [PCODE Matching](PCODE-Matching.md)
- [Custom Geometry Upload](Custom-Geometry-Upload.md)
- [View Modes and Drill](View-Modes-and-Drill.md)

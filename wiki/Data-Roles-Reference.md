# Data Roles Reference

Every data role on AdminCartograph, what it does, when to bind it,
and how it interacts with the rest of the visual.

In Power BI, you bind columns or measures from your dataset to
**data roles** by dragging them into the role slots in the
**Visualizations** pane. AdminCartograph defines eight roles, of
which only one is required.

## Required (one of)

### Admin1 PCODE

| | |
|---|---|
| **Kind** | Grouping (categorical column) |
| **Multiplicity** | At most 1 |
| **Required** | Yes — unless Admin2 PCODE is bound |
| **What it does** | Joins your data to the Admin1 polygons in the geometry. The visual picks the polygon whose `ADM1_PCODE` property equals each row's value, and uses that to drive choropleth fill, bubbles, glyphs, and labels at the Admin1 level. |
| **Typical column** | A column of OCHA Admin1 PCODEs (`SD01`, `SD02`, ..., or `YE12`, `YE13`, ...) |
| **Cardinality** | Up to ~50 typical for any country (countries with more Admin1 like France, Indonesia work too — performance OK to several thousand) |

### Admin2 PCODE

| | |
|---|---|
| **Kind** | Grouping |
| **Multiplicity** | At most 1 |
| **Required** | Yes — unless Admin1 PCODE is bound |
| **What it does** | Same as Admin1 PCODE but at the Admin2 level. Enables drill into Admin2, locality-level choropleth, and locality-level bubbles. |
| **Typical column** | A column of OCHA Admin2 PCODEs (`SD0101`, `SD0102`, ...) |
| **Cardinality** | Up to ~30,000 |

> **Both Admin1 and Admin2 bound** is the most flexible setup: you
> get Admin1 view by default, click-to-drill into Admin2, automatic
> filter-driven drill, and locality-level cross-filtering of the rest
> of your report.
>
> **Only Admin1 bound** keeps the visual locked to Admin1 view.
> Clicks just cross-filter; no drill happens (because there's no
> Admin2 data to show in drill view). See [View Modes and
> Drill](View-Modes-and-Drill.md).
>
> **Only Admin2 bound** is supported. The visual aggregates Admin2
> values up to Admin1 (sum) for the Admin1 view, and uses your data
> directly in Admin2 view.

## Measures

### Color Value

| | |
|---|---|
| **Kind** | Measure |
| **Multiplicity** | At most 1 |
| **What it does** | Drives the choropleth fill. Each polygon is classified into one of N colour buckets based on this measure's value. |
| **Typical measure** | `SUM(Population)`, `AVG(Score)`, `COUNT(Cases)`, etc. |

When a polygon has no row of data (or this measure is `null` for it),
it renders with the **No-data colour** from the Choropleth Fill card.

If you also enable **Treat 0 as no-data**, polygons with `Color
Value = 0` use the no-data colour and are excluded from classification.

### Bubble Size

| | |
|---|---|
| **Kind** | Measure |
| **Multiplicity** | At most 1 |
| **What it does** | Drives the proportional bubble overlay. Bubble radius is `√` of the measure value, scaled between Min radius and Max radius. |
| **Typical measure** | Population, total cases, anything where bigger = more |

Square-root scaling means bubble *area* (not radius) is proportional
to value — which matches how human visual perception interprets size.

### Glyph Values (pie / column)

| | |
|---|---|
| **Kind** | Measure |
| **Multiplicity** | Multiple — bind 2 or more measures |
| **What it does** | Drives the pie / donut / column overlay. Each measure becomes one slice (pie / donut) or one column. |
| **Typical measures** | `Children`, `Adults`, `Elderly` — three measures for a three-slice pie |

To enable the overlay:

1. Bind 2+ measures to **Glyph Values**.
2. Open **4. Pie / Column overlay** in the format pane.
3. Set **Show** to on, pick a **Chart type**, and adjust colors.

The legend (under **11. Pie / Column legend**) shows one swatch per
measure with the measure's display name as the label.

### Label Value 2

| | |
|---|---|
| **Kind** | Measure |
| **Multiplicity** | At most 1 |
| **What it does** | Overrides the auto-displayed number in labels. Without it, label content "Name + Value" shows the **Color Value**. With it bound, "Name + Value" shows this measure instead. |
| **Use it when** | You want the label to show a different number than the choropleth colour. E.g. choropleth by population, label by GDP per capita. |

### Tooltips

| | |
|---|---|
| **Kind** | Measure |
| **Multiplicity** | Multiple |
| **What it does** | Adds extra fields to every hover tooltip. Each measure becomes one row beneath the standard rows (Admin1 name, Admin2 name, Color Value, Bubble Size). |
| **Typical use** | "Show me the underlying breakdown when I hover" — bind 3-5 measures, see them all in the tooltip. |

## Grouping fields

### Label Text 1

| | |
|---|---|
| **Kind** | Grouping |
| **Multiplicity** | At most 1 |
| **What it does** | Replaces the geometry's `ADM1_EN` / `ADM2_EN` name with whatever's in this column. |
| **Use it when** | Your data has a different naming convention — e.g. "St. Petersburg" instead of the geometry's "Saint Petersburg". |

If unbound, the visual falls back to the embedded geometry's
`ADM1_EN` / `ADM2_EN` properties (or the PCODE itself if no name
property is found).

## Worked example

A typical humanitarian binding setup:

| Role | Bound to |
|---|---|
| Admin1 PCODE | `SudanData[StatePcode]` |
| Admin2 PCODE | `SudanData[LocalityPcode]` |
| Color Value | `[Total Cases]` (a measure) |
| Bubble Size | `[Confirmed Cases]` (a measure) |
| Glyph Values | `[Children]`, `[Adults]`, `[Elderly]` (three measures) |
| Label Text 1 | `SudanData[LocalityNameAr]` (Arabic locality name) |
| Tooltips | `[Recovery Rate]`, `[Test Coverage]` |

Result: choropleth coloured by total cases, bubbles sized by
confirmed cases, pies showing the children/adults/elderly mix per
locality, labels in Arabic, tooltips with recovery rate and test
coverage.

## How the data view is read

Internally, AdminCartograph requests a single categorical
DataView with up to 30,000 rows (Admin2-level cap). The
`dataConverter.ts` walks the categorical channel and builds a flat
`AreaDatum` map keyed by PCODE. Locality rows take precedence over
state rows when both are bound — so an Admin1 area with no
specific row only shows up if its Admin2 children sum non-null.

For low-level details, see [Architecture
Overview](Architecture-Overview.md).

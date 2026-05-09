# Architecture Overview

How the visual is structured internally. This page is for
contributors and curious users who want to understand the moving
parts.

## High level

```
                ┌──────────────────────────────────────┐
                │  Power BI host (iframe)              │
                │                                      │
                │   ┌─────────────────────────────┐    │
                │   │  AdminCartograph (Visual)   │    │
                │   │                             │    │
                │   │  update(options) →          │    │
                │   │     → settings model        │    │
                │   │     → DataView -> AreaDatum │    │
                │   │     → resolveCountry        │    │
                │   │     → renderMap             │    │
                │   │                             │    │
                │   │  SVG layers:                │    │
                │   │  ┌───────────────────────┐  │    │
                │   │  │ legend layer          │  │    │
                │   │  │ scale bar layer       │  │    │
                │   │  │ ┌─ map group ──────┐  │  │    │
                │   │  │ │ adm2 layer       │  │  │    │
                │   │  │ │ adm1 layer       │  │  │    │
                │   │  │ │ bubble layer     │  │  │    │
                │   │  │ │ glyph layer      │  │  │    │
                │   │  │ │ adm2 label layer │  │  │    │
                │   │  │ │ adm1 label layer │  │  │    │
                │   │  │ └──────────────────┘  │  │    │
                │   │  └───────────────────────┘  │    │
                │   │                             │    │
                │   │  HTML overlay:              │    │
                │   │   - top bar (back, nav)     │    │
                │   │   - controls panel          │    │
                │   │   - upload card             │    │
                │   └─────────────────────────────┘    │
                └──────────────────────────────────────┘
```

## Module map

```
src/
├── visual.ts                    Entry point (Visual class)
├── settings.ts                  Formatting model (FormattingSettingsModel subclass)
├── types.ts                     AreaDatum, PreparedDataView, CountryGeometry
├── generated/
│   └── countries.ts             AUTO-WRITTEN: bundled country list for the dropdown
├── data/
│   └── dataConverter.ts         DataView -> AreaDatum map
├── geo/
│   └── geometryLoader.ts        Decode embedded TopoJSON, expose per-country FCs
└── render/
    ├── projection.ts            d3.geoMercator + fitExtent
    ├── classification.ts        Quantile / equal / manual breaks + ramp
    ├── choropleth.ts            Polygon fills + borders
    ├── bubbles.ts               Bubble layer
    ├── glyphs.ts                Pie / donut / column overlay
    ├── labels.ts                Label engine (rotation, halo, fit)
    ├── labelPlacement.ts        centroid (+ polylabel fallback) + biased-toward-target anchors
    ├── legend.ts                Three legends + combined container
    ├── scaleBar.ts              Latitude-aware scale bar
    └── format.ts                Number formatter
```

## Render pipeline

When Power BI calls `Visual.update(options)`:

### 1. Read settings

The formatting service walks the typed `VisualFormattingSettingsModel`
defined in `settings.ts` and populates each card's slices from the
DataView's `metadata.objects`. After this, `this.settings` mirrors
whatever the user picked in the format pane.

### 2. Prepare the DataView

`prepareDataView` (in `data/dataConverter.ts`) walks the
categorical channel of the DataView and builds a flat
`Map<pcode, AreaDatum>`:

```ts
type AreaDatum = {
  pcode: string;
  parentPcode?: string;
  level: 1 | 2;
  colorValue: number | null;
  bubbleSize: number | null;
  glyphValues: number[];
  labelValue2: number | null;
  labelText1: string | null;
  tooltips: VisualTooltipDataItem[];
  selectionId: ISelectionId;
  highlighted: boolean;
};
```

Locality-level rows take precedence over state-level when both are
bound — so an Admin1 entry only stays in the map if there's no
Admin2 row claiming the same parent.

In the same pass, `prepareDataView` also collects per-row colour
overrides from each PCODE column's `.objects` map (populated by
Power BI when the user binds a ColorPicker via **fx** /
conditional formatting) into
`PreparedDataView.ruleColorsByPcode: Map<pcode, Map<objectName, Map<propertyName, hex>>>`.
Bubble and label renderers consult this map per row before falling
back to the static formatting-card value.

### 3. Resolve country

`resolveCountry` reads the **Country** dropdown:

- `auto` → infer ISO-3 from PCODE prefixes via `inferIso3` in
  `GeometryLoader`.
- a specific ISO → return it.
- `custom` → use the persisted custom upload (loaded by
  `loadCustomCountry`).

If a custom upload exists, geometry is parsed from the persisted
JSON and normalised via the user's confirmed field mapping.

### 4. Apply filter-driven drill

`applyFilterDrill` looks at the current `prepared.filteredStatePcodes`
and `filteredLocalityPcodes` to decide whether the visual should
auto-drill into a single Admin1.

### 5. Resolve view mode

`resolveViewMode` returns `"states"` or `"localities"` based on
the View mode dropdown plus drill state.

### 6. Render the map

`renderMap` is the heart. It:

- Picks the visible feature set (Admin1 features always; Admin2
  features only in localities view, optionally filtered to the
  drilled state).
- Builds the projection via `buildProjection` (d3-geo Mercator
  + `fitExtent`).
- Computes Admin1 aggregation (sum of Admin2 values) when only
  Admin2 PCODE is bound.
- Builds the colour ramp, breaks, classes (`buildBreaks` /
  `rampColors`).
- Calls `renderChoropleth` for both adm1Layer and adm2Layer.
- Calls `renderBubbles` for the bubble layer.
- Calls `renderGlyphs` for the glyph layer.
- Calls `renderLabels` for adm1 and adm2 label layers (skipping
  the focused state in drill view, which gets the title pill).
- Calls `renderLegends` with the combined container logic.
- Calls `renderScaleBar`.
- Calls `applyZoom` (transforms the mapGroup).
- Calls `wireInteraction` (binds tooltips on the SVG selections).

### 7. Handle clicks (delegated)

A single click handler on `mapGroup`, attached **once** in the
constructor, dispatches based on `data-pcode` and class on the
event target:

```
event.target.closest("[data-pcode]")
  → adm1 in states view → drill (if Admin2 data) + select
  → adm2 in localities view → select
```

This delegated approach survives `d3.data().join()` rebuilds of
the path nodes — earlier per-render `.on("click")` bindings were
race-y in the Power BI iframe.

## Layer order rationale

```
adm2 fills + borders
  ↓
adm1 fills + borders
  ↓
bubble layer
  ↓
glyph layer
  ↓
adm2 labels
  ↓
adm1 labels (always on top)
```

Why adm1 above adm2: in Admin1 view, adm2 layer is empty; adm1
fills + borders need to be visible. In drill view, adm1 layer is
fill: none (so adm2 fills below show through) but its borders are
above adm2 borders, giving the cleaner cartographic effect.

Why bubbles + glyphs above adm1: they're data overlays meant to
read on top of fills regardless of which view is active.

Why adm1 labels last: state labels should never be occluded.
Locality labels can be hidden by state labels — that's a feature
(the focused state's name should always read).

## Settings persistence

Every formatting card's slices serialise to `dataView.metadata.
objects.<cardName>` and back through Power BI's report storage.
The four hidden custom-upload properties (`customAdm1Json`,
`customAdm2Json`, `customFieldMapping`, `customTopoName`) are
under the `general` object with `visible: false` so they round-trip
through the host without showing up in the format pane.

## See also

- [Build Pipeline](Build-Pipeline.md) — how the .pbiviz is produced
- [Settings Model Internals](Settings-Model-Internals.md) — how
  the format pane communicates with the visual code
- [Custom Properties Persistence](Custom-Properties-Persistence.md)

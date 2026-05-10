# Settings Model Internals

How AdminCartograph's formatting model works under the hood. For
contributors who want to add or modify cards.

## Two halves of the same coin

The formatting system has two synchronised definitions:

1. **`capabilities.json`** declares the *shape* — every object, its
   properties, and their types. Power BI uses this to render the
   format pane controls and to validate persisted values.
2. **`src/settings.ts`** declares the *types* — TypeScript classes
   subclassing `formattingSettings.SimpleCard`, with strongly typed
   slices that `populateFormattingSettingsModel` maps into.

Both must agree on:

- Object names (`general`, `choropleth`, `bubbles`, ...).
- Property names within each object (`selectedCountry`, `mode`, ...).
- Property types (text vs bool vs enumeration vs colour).

If they drift, properties silently fall back to defaults at runtime.

## Adding a new card

Walk through adding a hypothetical "Watermark" card with a single
text slice.

### Step 1: capabilities.json

```jsonc
"watermark": {
  "displayName": "15. Watermark",
  "properties": {
    "text": { "displayName": "Text", "type": { "text": true } },
    "color": { "displayName": "Color", "type": { "fill": { "solid": { "color": true } } } },
    "opacity": { "displayName": "Opacity", "type": { "numeric": true } }
  }
}
```

### Step 2: settings.ts

```ts
class WatermarkSettings extends FormattingSettingsCard {
  text = new formattingSettings.TextInput({
    name: "text",
    displayName: "Text",
    placeholder: "(none)",
    value: ""
  });
  color = new formattingSettings.ColorPicker({
    name: "color",
    displayName: "Color",
    value: { value: "#888888" }
  });
  opacity = new formattingSettings.NumUpDown({
    name: "opacity",
    displayName: "Opacity",
    value: 0.4
  });

  name = "watermark";
  displayName = "15. Watermark";
  slices = [this.text, this.color, this.opacity];
}
```

Then add the card to the model:

```ts
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
  // ... existing cards ...
  watermark = new WatermarkSettings();

  cards = [
    // ... existing cards ...
    this.scaleBar,
    this.controls,
    this.watermark
  ];
}
```

### Step 3: visual.ts

Read the values inside `renderMap`:

```ts
const wmText = this.settings.watermark.text.value;
const wmColor = this.settings.watermark.color.value.value;
const wmOpacity = this.settings.watermark.opacity.value;

if (wmText) {
  // ... render the watermark
}
```

Build with `npm run release`. The new card appears at the bottom of
the format pane.

## How `populateFormattingSettingsModel` works

`FormattingSettingsService.populateFormattingSettingsModel(Cls,
dataView)` does roughly this:

1. Instantiate `Cls` with default values (from the slices'
   constructors).
2. Walk every card in `cards`.
3. For each card, look up `dataView.metadata.objects[card.name]`.
4. For each slice, look up its corresponding property in that
   object and overwrite the slice's `value` with the persisted
   value.

The catch: **slices not in `cards[].slices` are not populated**.
A property declared in capabilities.json but not exposed as a
slice in settings.ts won't see persisted values. This is why the
hidden `customAdm1Json` etc. properties are kept in the slices array
with `visible: false` instead of just declared in capabilities.

## Slice types reference

| TS class | Capabilities type | Used for |
|---|---|---|
| `TextInput` | `text` | Free-form strings |
| `ColorPicker` | `fill.solid.color` | Colour pickers |
| `NumUpDown` | `numeric` | Numeric steppers |
| `ToggleSwitch` | `bool` | On/off toggles |
| `ItemDropdown` | `enumeration` | Single-select dropdowns |
| `FontPicker` | `formatting.fontFamily` | Font family picker |
| Slice with `formatting.fontSize` type | `formatting.fontSize` | Font size stepper with proper Power BI styling |

For ItemDropdown, the items array is hardcoded in TypeScript, but
capabilities.json's enumeration list must match — the host validates
persisted values against the capabilities enumeration. To make
items dynamic (like the country dropdown), the items array reads
from a runtime constant; capabilities.json declares the type as
`text` (which lets any string through) and the dropdown UI is
client-side only.

## Hidden slices

Setting `visible: false` on a slice keeps it in the model (so it
round-trips through persistProperties) but hides it from the format
pane UI. Used for:

- `customAdm1Json` (megabytes of TopoJSON text)
- `customAdm2Json`
- `customFieldMapping`
- `customTopoName`

These are populated programmatically by the upload UI, not by hand.

## Default values

Every slice's constructor takes a `value` field with the default.
The defaults form the visual's initial state when the user adds it
to a report or resets its formatting.

Choosing good defaults matters: they're what every new instance
shows. Conservative defaults (no bubbles, no glyphs, no zoom
controls) plus thoughtful colours (sequential blue ramp) keep the
visual sensible out of the box.

## Reading values at render time

Inside `update()`, after `populateFormattingSettingsModel`:

```ts
this.settings.choropleth.classification.value
// -> { value: "quantile", displayName: "Quantile" }

this.settings.choropleth.classification.value.value
// -> "quantile"

this.settings.bubbles.show.value
// -> true | false

this.settings.bubbles.fillColor.value.value
// -> "#e6550d"

this.settings.choropleth.classCount.value
// -> 5
```

Note the double `.value` on dropdowns and colour pickers: the outer
`.value` returns the structured object, the inner `.value` returns
the actual string.

## Conditional formatting (fx) — removed

Earlier builds opted bubble fill / stroke + four label colour
pickers into Power BI's **fx** button by setting
`instanceKind: ConstantOrRule` plus a wildcard selector. That code
path was removed: Power BI's format-pane preview swatch didn't
reliably round-trip the static value when fx was wired up, so a
colour the user picked rendered correctly on the map but the
swatch + downstream reads (e.g. the Values legend) saw stale
defaults.

The colour pickers are now plain `formattingSettings.ColorPicker`
without `instanceKind` / `selector`. The renderers' rule-aware
fallback paths and `PreparedDataView.ruleColorsByPcode` are kept
intact but inert — `dataConverter` skips the per-row `.objects`
extraction so the map is always empty, and consumers fall through
to `style.<colour>`. Re-enabling fx later is a one-line change in
each ColorPicker definition + restoring the
`readRuleObjectsAt` calls in `dataConverter`.

## See also

- [Custom Properties Persistence](Custom-Properties-Persistence.md)
- [Architecture Overview](Architecture-Overview.md)
- Power BI docs: [Formatting model utility](https://learn.microsoft.com/en-us/power-bi/developer/visuals/utils-formatting-model)

# Custom Properties Persistence

How AdminCartograph saves user-uploaded geometry into the report so
it survives save / reload / share. The mechanism is Power BI's
`host.persistProperties`, with four caveats specific to large
custom payloads.

## The four hidden properties

The Custom upload flow stores its state in four properties under
the `general` object:

| Property | Format | Typical size |
|---|---|---|
| `customAdm1Json` | Raw text of the Admin1 file (TopoJSON or GeoJSON) | 0.1 - 2 MB |
| `customAdm2Json` | Raw text of the Admin2 file (or empty string if not uploaded) | 0.1 - 3 MB |
| `customFieldMapping` | Small JSON: `{ adm1Pcode, adm1Name, adm2Pcode, adm2Name }` | <500 bytes |
| `customTopoName` | Friendly display name (defaults to filename) | <100 bytes |

All four are declared in `capabilities.json` as `text` types and
exposed in the settings model with `visible: false`. They're
populated by `host.persistProperties` and read by the visual's
`loadCustomCountry()`.

## How persistProperties works

```ts
host.persistProperties({
  merge: [
    {
      objectName: "general",
      properties: {
        customAdm1Json: text,
        customAdm2Json: adm2text,
        customFieldMapping: JSON.stringify(mapping),
        customTopoName: name
      },
      selector: null
    }
  ]
});
```

The host:

1. Validates the property names against `capabilities.json`.
2. Writes them to the report's persisted metadata.
3. Schedules an `update()` callback on the visual with a fresh
   DataView whose `metadata.objects.general` contains the new
   values.

Power BI persists this metadata inside the `.pbix` (or PowerBI
service report). When the report is reopened, the same metadata
is read back and `populateFormattingSettingsModel` populates
`this.settings.general.customAdm1Json.value` with the saved string.

## Race condition: persistence is async

`host.persistProperties` returns immediately. The actual `update()`
with the new values can come 100ms or several seconds later
depending on host load, especially in Power BI Service.

If the visual relied solely on the round-trip, clicking "Load
map" would show no change for a noticeable interval. To avoid
that, the visual seeds an in-memory cache of the parsed country
geometry inside `confirmCustomUpload()` and calls `rerender()`
immediately. The next host-driven `update()` then finds the same
values via the formatting model and uses them; the cache and
formatting model converge to the same parsed country.

## Cache key

`customGeometryCache` is keyed by a string derived from the
mapping + Admin1 raw + Admin2 raw lengths. Any change to either
file or the mapping invalidates the cache:

```ts
const key = `${mappingRaw}::${adm1Raw.length}-${adm1Raw.slice(0, 64)}::${adm2Raw.length}-${adm2Raw.slice(0, 64)}`;
```

The first 64 chars of each file are sampled to keep key
construction fast (no MD5 hash) while still detecting different
files of the same length.

## Fallback: read direct from DataView

Some Power BI hosts truncate very long `TextInput` properties at
a few hundred KB. The formatting model would silently report the
truncated value as the populated state.

To work around this, `loadCustomCountry()` includes a fallback:

```ts
let adm1Raw = this.settings.general.customAdm1Json.value || "";
if (!adm1Raw && this.lastUpdateOptions) {
  const dv = this.lastUpdateOptions.dataViews?.[0];
  const general = (dv?.metadata?.objects as any)?.general || {};
  adm1Raw = general.customAdm1Json || adm1Raw;
}
```

Reading directly from `dataView.metadata.objects.general` skips
the formatting service's truncation and gets the full persisted
text whenever the host did persist it correctly.

## Practical limits

| Payload size | Outcome |
|---|---|
| < 1 MB | Always persists fast; survives reload reliably. |
| 1-3 MB | Persists, but report load takes noticeably longer the first time. |
| 3-5 MB | Borderline. Some hosts handle, some balk. The visual still works in-session via the cache. |
| > 5 MB | Risky. Either the host refuses persistProperties silently, or report file size becomes uncomfortable. |

For TopoJSON files, ~5 MB is enough to bundle a full Admin1+Admin2
set for a country with a few hundred Admin2 areas at high
simplification. If your file is larger, simplify it first with
mapshaper / `topojson-simplify` before uploading.

## What gets shared with the .pbix

When you share the `.pbix` file or publish to a workspace, the
persisted custom properties travel with it. The recipient sees
the same map without having to re-upload. They can also change
the field mapping or upload different files; their changes
overwrite yours in their copy.

## Edge cases

### User clears the upload

There's no "clear upload" button. To reset:

1. Switch Country to a non-Custom value.
2. Power BI keeps the persisted properties — they're just unused.
3. Switch back to Custom.
4. Re-upload to overwrite.

A future improvement could expose a "Clear custom geometry" button
that explicitly nulls these four properties.

### Multiple visuals with different uploads

Each instance of AdminCartograph on a page (or across pages) has
its own independent persistence. Two visuals can show different
custom uploads at the same time.

### Edit mode vs view mode

`host.persistProperties` only writes when the report is in edit
mode. In published view mode, persistence is read-only — the
upload UI still works in-session (via the cache) but the
persistence call is a no-op. So end-users of a published report
get an A/B-quality upload experience: the map renders during
their session but doesn't persist.

## See also

- [Custom Geometry Upload](Custom-Geometry-Upload.md) — the user-
  facing flow
- [Settings Model Internals](Settings-Model-Internals.md)
- [Architecture Overview](Architecture-Overview.md)

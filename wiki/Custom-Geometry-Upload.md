# Custom Geometry Upload

The recommended path for most use cases. Upload your country's
boundaries directly to the visual at runtime — no rebuild, no
contributing back to the repo, no waiting.

## What the visual accepts

| Format | Notes |
|---|---|
| **TopoJSON** (`type: "Topology"`) | Smaller files; the recommended format if you control the conversion. The visual extracts the first object named `adm1` / `adm2` / `admin1` / `admin2` (case-insensitive) or any object with a non-empty `geometries` array. |
| **GeoJSON FeatureCollection** (`type: "FeatureCollection"`) | Used directly. |
| Single Feature | Wrapped into a one-feature collection. |

The visual reads the file with `FileReader.readAsText`, parses it as
JSON in the iframe, and validates the structure before showing the
field-mapping UI.

## How to upload

### 1. Switch the country to Custom

In the format pane → **1. Map setup** → **Country** → select
*Custom (upload TopoJSON)*.

Note: the option is labelled "TopoJSON" historically; both TopoJSON
and GeoJSON work.

### 2. The upload card appears

The map canvas is replaced by a card that looks like this:

```
Custom map data
Upload TopoJSON or GeoJSON for Admin1 (required) and Admin2
(optional).

Admin1 file:   [Choose file…]   (none)
Admin2 file:   [Choose file…]   (none — optional)

The file is saved inside the report (.pbix). Keep it under a few
MB.
```

### 3. Pick the Admin1 file

Click **Choose file…** next to "Admin1 file:". The browser's native
file picker opens. Select your Admin1 boundary file.

The visual:

1. Reads the file via FileReader.
2. Parses the JSON.
3. Walks the features and collects every distinct property name.
4. Pre-fills two dropdowns (Admin1 PCODE and Admin1 Name) using
   fuzzy matches against common patterns.

### 4. Pick the Admin2 file (optional)

Same workflow. Optional — if you skip it, the visual stays in
Admin1-only mode. (You can also bind only Admin1 PCODE in your data
and the visual will stay in Admin1 mode automatically, regardless
of Admin2 geometry being present.)

### 5. Confirm the field mapping

Below the file pickers, you'll see four dropdowns:

- **Admin1 PCODE** — the property whose values match your `Admin1
  PCODE` data column.
- **Admin1 Name** — the property whose values give human-readable
  state names.
- **Admin2 PCODE** — same idea at the locality level (only required
  if you uploaded an Admin2 file).
- **Admin2 Name** — same.

Each dropdown lists every property name discovered in the file. The
auto-fill picks the most likely match from these patterns:

| Role | Patterns matched (case-insensitive) |
|---|---|
| Admin1 PCODE | `ADM1_PCODE`, `ADM1PCODE`, `pcode_1`, `adm1_code`, `admin1_code`, `gid_1`, `iso_1` |
| Admin1 Name | `ADM1_EN`, `name_1`, `adm1_name`, `admin1_name`, `state_name`, `region` |
| Admin2 PCODE | `ADM2_PCODE`, `ADM2PCODE`, `pcode_2`, `adm2_code`, `admin2_code`, `gid_2` |
| Admin2 Name | `ADM2_EN`, `name_2`, `adm2_name`, `admin2_name`, `locality_name`, `district` |

If the auto-fill missed (e.g. your file uses `STATE_ID` for the
PCODE), the dropdown stays unselected and you pick manually.

### 6. Click "Load map"

Validation:

- Admin1 PCODE and Admin1 Name must be picked.
- If you uploaded an Admin2 file, Admin2 PCODE and Admin2 Name must
  also be picked.
- Otherwise the button shows a red error message inline.

On success:

1. The visual seeds an in-memory cache so the map re-renders
   immediately without a host round-trip.
2. The visual calls `host.persistProperties` to save the parsed file
   contents and the field mapping into the report metadata.
3. The next host-driven `update()` reconciles state — but the cached
   render keeps the experience snappy in the meantime.

## What gets saved into the report

Four properties under the `general` object:

| Property | Holds |
|---|---|
| `customAdm1Json` | The full text of the Admin1 file. Up to ~5 MB. |
| `customAdm2Json` | The full text of the Admin2 file (or empty). |
| `customFieldMapping` | A small JSON: `{ adm1Pcode, adm1Name, adm2Pcode, adm2Name }` |
| `customTopoName` | A friendly display name (defaults to the Admin1 filename). |

These are stored inside the .pbix when you save the report. They
travel with it — share the .pbix and the recipient gets the same
geometry without needing to re-upload.

## Practical limits

| Limit | Why |
|---|---|
| ~5 MB total per upload | Power BI's `persistProperties` handles megabyte-scale strings, but every uploaded MB is added to the .pbix on save. Past ~5 MB, report load time gets noticeable. |
| 2 files (Admin1 + Admin2) | The visual's data model is two-level. Deeper levels (Admin3+) can't be uploaded — fold them into the choropleth via grouping or use Admin2 only. |
| One country at a time | The custom upload replaces the bundled country selection. To switch back to a bundled country, set Country = a specific ISO. To clear the upload entirely, switch to Auto and uncheck "Show custom upload". |

## How to simplify large GeoJSON / TopoJSON

If your file is over ~3 MB, it's worth simplifying first:

```bash
# Mapshaper (npm install -g mapshaper):
mapshaper my-country.geojson \
  -simplify 5% keep-shapes \
  -o format=topojson my-country.topojson
```

Or use the visual's built-in pipeline locally on a single file:

```bash
node scripts/build-topojson.js \
  --simplify 0.001 --quantize 5000 \
  --only XYZ
```

(See [Build Pipeline](Build-Pipeline.md).)

## Updating the upload

If you got the field mapping wrong:

1. In the format pane → **1. Map setup**, switch Country to
   *Auto-detect* (which de-references the custom data) and back to
   *Custom* — the upload card reappears.
2. Re-pick files and re-confirm mapping.

The new persistence overwrites the old.

## File-shape examples

### TopoJSON (most compact)

```json
{
  "type": "Topology",
  "objects": {
    "adm1": {
      "type": "GeometryCollection",
      "geometries": [
        {
          "type": "Polygon",
          "arcs": [[0, 1, 2]],
          "properties": { "ADM1_PCODE": "SD01", "ADM1_EN": "Khartoum" }
        }
      ]
    },
    "adm2": { "type": "GeometryCollection", "geometries": [...] }
  },
  "arcs": [...],
  "transform": { "scale": [...], "translate": [...] }
}
```

### GeoJSON FeatureCollection

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "ADM1_PCODE": "SD01", "ADM1_EN": "Khartoum" },
      "geometry": { "type": "Polygon", "coordinates": [...] }
    }
  ]
}
```

For Admin2, upload a separate file with `ADM2_PCODE` and `ADM2_EN`
(or whatever your property names are — the field mapping handles it).

## See also

- [PCODE Matching](PCODE-Matching.md)
- [Bundled Countries](Bundled-Countries.md)
- [Custom Properties Persistence](Custom-Properties-Persistence.md)

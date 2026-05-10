# PCODE Matching

How the visual joins your data to the geometry. The short version:
it's an exact string equality on PCODE values. The long version
includes auto-detection, mismatch diagnosis, and what to do when
your data uses a different naming convention.

## What is a PCODE?

A **PCODE** is a stable, unique alphanumeric identifier for an
administrative area, used in OCHA's Common Operational Datasets
(COD) and most humanitarian / development data. Format:

```
<ISO-2 country code><Admin1 sequence>[<Admin2 sequence>...]
```

Examples (Sudan):

| Type | PCODE | Area |
|---|---|---|
| Admin1 | `SD01` | Khartoum State |
| Admin2 | `SD0101` | Khartoum locality |
| Admin1 | `SD02` | Al Jazira State |
| Admin2 | `SD0203` | South Gezira locality |

The convention varies slightly between countries — Yemen uses 5-digit
Admin2 (`YE1201`, `YE1202`, …), Lebanon uses different padding — but
the leading **two-character ISO-2 prefix** is universal.

## How matching works

For every Admin1 polygon in the geometry, the visual reads the
`ADM1_PCODE` property and compares it to the values in your bound
Admin1 PCODE column. **Exact string equality** is tried first.

If the exact lookup misses, the visual falls back to a
**normalised match**: both sides are uppercased and stripped of
spaces, dashes, and underscores, so:

| Your data | Geometry has | Matches? |
|---|---|---|
| `SD01` | `SD01` | ✅ exact |
| `sd01` | `SD01` | ✅ via normalised |
| `sd-01` / `SD_01` / `sd 01` | `SD01` | ✅ via normalised |
| `SDN001` | `SD01` | ❌ different convention — see [When matching fails](#when-matching-fails) |

Same for Admin2: `ADM2_PCODE` compared to your Admin2 PCODE column.

If a polygon's PCODE matches a data row, the polygon shows that
row's color / bubble / labels. If it doesn't match anything, the
polygon renders with the **No-data colour** from the Choropleth fill
card.

### Mismatch banner

When **every** lookup misses (your PCODE column doesn't line up
with any of the geometry's), the visual draws an orange info card
at the bottom-centre of the canvas showing concrete samples from
both sides:

```
No PCODE matches. Your bound Admin1 PCODE values don't line up
with the country's geometry.

Data sample:     [SD01, SD02, SD03]
Geometry sample: [SDN001, SDN002, SDN003]

Check the Country dropdown matches your data, or upload custom
geometry whose ADM1_PCODE field uses the same format. (Click to dismiss.)
```

Click anywhere on the banner to dismiss it. The same diagnostic
also goes to the browser console as a `console.warn`.

## The auto-detect

When **Country** is set to *Auto-detect (from PCODE)*:

1. The visual collects up to 50 distinct PCODEs from your bound data
   (mixing Admin1 and Admin2 if both are bound).
2. It strips each to its leading 2 characters.
3. Counts how many times each 2-char prefix appears.
4. Picks the most-frequent prefix.
5. Searches the bundled countries for an Admin1 feature whose
   `ADM1_PCODE` starts with that prefix.
6. Returns the matching ISO-3 code.

| Prefix | Bundled country picked |
|---|---|
| `SD` | SDN |
| `YE` | YEM |
| `AF` | AFG |
| `IR` | IRN |
| `LB` | LBN |
| `SY` | SYR |
| `HT` | HTI |
| `CD` | COD |

If the prefix doesn't match any bundled country, auto-detect returns
nothing and the visual shows a landing-page prompt asking you to
either pick a country explicitly or use *Custom*.

## When matching fails

### Symptom: most polygons are grey

Either the PCODE column doesn't contain the values the geometry
expects, or the casing / whitespace doesn't match.

**Diagnose**:

1. Hover one of your data rows in a Power BI table to confirm what
   the PCODE column actually contains.
2. Compare against the canonical OCHA PCODEs for that country at
   <https://data.humdata.org/dataset/cod-ab>.

**Common mismatches**:

| Your data | Geometry expects | Fix |
|---|---|---|
| `SD-01` | `SD01` | Strip the dash in your data (e.g. via `SUBSTITUTE`). |
| `sd01` | `SD01` | Uppercase: `UPPER([Pcode])`. |
| `01` | `SD01` | Prepend the ISO-2: `"SD" & [Pcode]`. |
| `SDN01` | `SD01` | Replace ISO-3 with ISO-2: `REPLACE([Pcode],"SDN","SD")`. |
| `SD 01` | `SD01` | Strip whitespace. |
| `1` (numeric) | `SD01` | Format with leading zeros: `"SD" & FORMAT([Pcode],"00")`. |

In Power Query / DAX, transform your column to match the canonical
PCODE format before binding.

### Symptom: country auto-detect is wrong

The two-char-prefix heuristic picked the wrong country (e.g. you have
`KE01` but the visual loaded Lebanon because `LB` was more common in
the same dataset).

**Fix**: explicitly set **Country** in the format pane → **1. Map
setup** → pick the right ISO from the dropdown.

### Symptom: the visual loaded the right country but only some polygons coloured

Your data has the right country's PCODEs but only for *some* states.
That's normal — uncoloured polygons show as no-data. To verify, hover
the no-data polygons and confirm those Admin1s really aren't in your
data.

If you expected them to be present, look for casing / whitespace
mismatches (see above).

## Custom geometry: the field-mapping flow

When you upload your own GeoJSON or TopoJSON via *Country = Custom*,
PCODE matching uses the property names you confirm in the field-
mapping dropdowns:

```
Admin1 PCODE:  [ STATE_ID  ▼ ]      <-- you picked this
Admin1 Name:   [ STATE_NAME  ▼ ]
Admin2 PCODE:  [ DISTRICT_ID  ▼ ]
Admin2 Name:   [ DISTRICT_NAME  ▼ ]
```

Internally the visual still does exact string equality between
your bound PCODE column and the value of whatever property you
mapped. So if your data has `01`, `02`, `03` and your geometry has
`STATE_ID = "01"`, you're fine.

For more, see [Custom Geometry Upload](Custom-Geometry-Upload.md).

## Matching is forgiving for case + separators

Exact equality is tried first; if it misses, a normalised match
(uppercase, no whitespace / dashes / underscores) is the fallback.
So `SD01`, `sd01`, `sd-01`, `SD_01`, and `sd 01` all match the
geometry's `SD01`. **Different conventions don't match** —
`SDN001` vs `SD01` requires picking the right country bundle (or
uploading custom geometry) since one uses the 3-letter ISO prefix
and the other the 2-letter.

## What about non-PCODE data?

If your data uses some other identifier — `state_id`, `geo_code`,
ISO-1, FIPS, GADM `GID_1` — you can still use AdminCartograph if the
geometry has the matching property:

1. Upload geometry whose features carry that identifier as a
   property.
2. In the field-mapping dropdowns, pick that property as Admin1 PCODE.
3. Bind your data column to **Admin1 PCODE**.

The visual just calls it "PCODE" because that's the canonical OCHA
term, but it's really "the identifier that joins data to geometry".

## Performance

Matching is `Map.get(pcode)` per polygon — `O(1)` per area. Even at
30,000 Admin2 features the matching pass takes a few milliseconds.

The visual's render time is dominated by SVG path rendering, label
fitting, and projection — not the join.

## See also

- [Data Roles Reference](Data-Roles-Reference.md)
- [Custom Geometry Upload](Custom-Geometry-Upload.md)
- [Bundled Countries](Bundled-Countries.md)

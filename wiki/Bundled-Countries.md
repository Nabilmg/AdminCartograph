# Bundled Countries

Eight countries' Admin1 + Admin2 boundaries ship inside the visual
as a convenience for quick starts and demos. None of them are
required — [Custom Geometry Upload](Custom-Geometry-Upload.md) is
the supported path for any country.

## What's in the bundle

| ISO | Country | Admin1 features | Admin2 features | Source |
|-----|---------|-------|-------|--------|
| **AFG** | Afghanistan | 34 provinces | 421 districts | OCHA COD via fieldmaps.io |
| **COD** | DR Congo | 26 provinces | 195 territories | OCHA COD via fieldmaps.io |
| **HTI** | Haiti | 10 departments | 42 communes | OCHA COD via fieldmaps.io |
| **IRN** | Iran | 31 provinces | 423 counties | OCHA COD via fieldmaps.io |
| **LBN** | Lebanon | 8 governorates | 26 districts | OCHA COD via fieldmaps.io |
| **SDN** | Sudan | 19 states | 189 localities | OCHA COD via fieldmaps.io |
| **SYR** | Syria | 14 governorates | 65 districts | OCHA COD via fieldmaps.io |
| **YEM** | Yemen | 21 governorates | 333 districts | OCHA COD via fieldmaps.io |

Totals: **165 Admin1 features** + **1,772 Admin2 features**, ~2.4 MB
of TopoJSON quantised + simplified into a 632 KB final `.pbiviz`.

## The dropdown

In the format pane → **1. Map setup** → **Country**, you'll see:

```
○ Auto-detect (from PCODE)
○ Afghanistan (AFG)
○ DR Congo (COD)
○ Haiti (HTI)
○ Iran (IRN)
○ Lebanon (LBN)
○ Sudan (SDN)
○ Syria (SYR)
○ Yemen (YEM)
○ Custom (upload TopoJSON)
```

The eight country options are baked into the shipped `.pbiviz` —
the bundled country set is closed. To use the visual with any
other country, pick **Custom (upload TopoJSON)** and load the
geometry at design time. See [Custom Geometry
Upload](Custom-Geometry-Upload.md).

## Auto-detect

When set to **Auto-detect**, the visual reads the leading two
characters of every bound PCODE in your data, finds the most common
prefix, and picks the bundled country whose Admin1 features start
with that prefix.

| Prefix | Country picked |
|---|---|
| `SD…` | SDN — Sudan |
| `YE…` | YEM — Yemen |
| `AF…` | AFG — Afghanistan |
| `IR…` | IRN — Iran |
| `LB…` | LBN — Lebanon |
| `SY…` | SYR — Syria |
| `HT…` | HTI — Haiti |
| `CD…` | COD — DR Congo |

If the prefix doesn't match a bundled country (e.g. `KE…` for Kenya),
auto-detect returns nothing and the visual shows a landing-page
prompt asking you to either pick a country explicitly or use
*Custom*.

For the full algorithm, see [PCODE Matching](PCODE-Matching.md).

## Geometry quality

The bundled geometry is OCHA Common Operational Datasets sourced
from [fieldmaps.io](https://fieldmaps.io/data/cod/), simplified at
build time to keep the `.pbiviz` under 1 MB:

```bash
node scripts/build-topojson.js --simplify 0.0005 --quantize 10000
```

- `--simplify 0.0005` — Visvalingam-style simplification weight.
  Removes vertices whose effective area falls below this threshold.
- `--quantize 10000` — Coordinate grid; lower numbers = blockier.
  10000 means coordinates round to 1/10000 of the bounding box.

The trade-offs:

| Setting | Bundle size | Visual fidelity |
|---|---|---|
| 0.0001 / 20000 | ~2-3× larger | Razor-sharp but slow |
| 0.0005 / 10000 (default) | Balanced | Excellent at country zoom |
| 0.001 / 5000 | ~50% smaller | Visible blockiness on small Admin2 |
| 0.005 / 2500 | Tiny | Cartoonish |

If you need higher fidelity for a specific country, override these
flags when re-bundling. See [Build Pipeline](Build-Pipeline.md).

## Property normalisation

Every bundled feature carries the same five properties, regardless of
what the source `.geojson` originally named them:

| Property | Holds |
|---|---|
| `ISO3` | The ISO-3 country code, used to filter features per country. |
| `ADM_LEVEL` | `1` or `2`. |
| `ADM1_PCODE` | OCHA Admin1 PCODE (`SD01`, `YE12`, …). |
| `ADM1_EN` | English Admin1 name (`Khartoum`, `Sana'a`, …). |
| `ADM2_PCODE` | OCHA Admin2 PCODE (only on Admin2 features). |
| `ADM2_EN` | English Admin2 name. |

The pipeline normalises whatever the source uses (`ADM1PCODE` vs
`ADM1_PCODE` vs `pcode_1` vs `pcode1`) into these canonical names so
the visual's render code doesn't have to branch.

For *uploaded* geometry, the field-mapping dropdowns do the same
normalisation at runtime. See [Custom Geometry Upload](Custom-Geometry-Upload.md).

## Need a country that isn't in the bundle?

Use **Custom (upload TopoJSON)** at design time. The bundled set
shown above is closed; everything else is a per-report upload that
persists with the `.pbix`. See [Custom Geometry
Upload](Custom-Geometry-Upload.md).

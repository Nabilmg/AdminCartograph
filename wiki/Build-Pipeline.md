# Build Pipeline

How a `country-geojson/*.geojson.zip` file becomes a
`releases/AdminCartograph.pbiviz`. Every npm script and what it does.

## Quick reference

```bash
npm install                 # one time
npm run release             # full pipeline: sync + build + package
```

Or step by step:

```bash
npm run sync-countries      # extracts country-geojson/*.zip
npm run build-topojson      # merges into one TopoJSON + writes generated/countries.ts
npm run package             # pbiviz package (TypeScript -> bundle -> .pbiviz)
```

`release` chains the three sequentially.

## The four scripts

### `scripts/sync-countries-from-geojson.js`

Walks `country-geojson/`, finds every `<ISO3>.geojson.zip`, extracts
each into `scripts/data/raw/<ISO3>/`, and rewrites
`scripts/data/countries.json`:

```json
[
  { "iso3": "AFG", "name": "Afghanistan", "maxAdm": 2, ... },
  { "iso3": "SDN", "name": "Sudan", "maxAdm": 2, ... },
  ...
]
```

Country names come from a small fallback dictionary (Sudan, Yemen,
Iran, etc.) plus whatever was in the previous `countries.json`
(preserves names you might have added by hand).

`maxAdm` is detected from the highest `_adm<N>.geojson` file in the
zip. Most COD countries ship adm0 / adm1 / adm2; some go to adm3 or
adm4. The visual uses adm1 + adm2 only.

### `scripts/build-topojson.js`

Merges all the country GeoJSONs into a single quantised + simplified
TopoJSON.

```bash
node scripts/build-topojson.js [--simplify <weight>] [--quantize <int>] [--only <ISO>[,<ISO>...]]
```

Defaults:

- `--simplify 0.0005` — Visvalingam simplification weight; lower =
  more detail, larger file. 0.0005 is balanced.
- `--quantize 10000` — coordinates round to a 10000×10000 grid.
- `--only` — limit the build to specific countries; rest are
  skipped. Used by `release-all.js` to produce per-country builds.

Process:

1. Read `scripts/data/countries.json`.
2. For each country, find its adm1.geojson and (if present)
   adm2.geojson under `scripts/data/raw/<ISO3>/`.
3. Normalise each feature's properties to the canonical
   `ADM1_PCODE / ADM1_EN / ADM2_PCODE / ADM2_EN / ISO3 /
   ADM_LEVEL` set.
4. Concatenate all features into two top-level FeatureCollections
   (`adm1`, `adm2`).
5. Build a TopoJSON via `topojson-server.topology()` with the
   given quantization.
6. Apply `topojson-simplify.presimplify()` then `simplify()`.
7. Write `assets/geometry/world.topojson.json` (the single file
   the visual imports at compile time).
8. Write `assets/geometry/country-index.json` with bbox + counts
   per country (used by GeometryLoader for lookup).
9. Write `src/generated/countries.ts` with the dropdown options.

### `scripts/release-all.js`

Optional secondary pipeline. Iterates every zip in
`country-geojson/` and produces a separate per-country `.pbiviz`:

```
releases/admChoroplethBubbleMap-AFG.pbiviz
releases/admChoroplethBubbleMap-SDN.pbiviz
releases/admChoroplethBubbleMap-YEM.pbiviz
...
```

Each release has a deterministic per-country GUID (FNV-1a hash of
the ISO) so Power BI treats them as distinct visuals. Useful when
you want to ship a slim country-specific build to a stakeholder.

The default `npm run release` produces only the unified bundle —
the recommended distribution path.

### `scripts/fetch-geometry.js`

Downloads `country-geojson/*.zip` files from `fieldmaps.io`. Reads
URLs from `scripts/data/countries.json`'s `geojsonUrl` field.

```bash
node scripts/fetch-geometry.js              # fetch every country in countries.json
node scripts/fetch-geometry.js SDN YEM      # fetch specific countries
node scripts/fetch-geometry.js --force      # re-download even if .done marker exists
```

Useful if you want to bulk-bundle 50+ countries from the OCHA COD
catalog without manually downloading each.

## `pbiviz package`

The `powerbi-visuals-tools` CLI bundles:

1. `src/visual.ts` and its imports through Webpack into a single JS
   file.
2. `style/visual.less` compiled to CSS.
3. `assets/icon.png` (the visual's icon).
4. `assets/geometry/world.topojson.json` (loaded as a JSON module by
   the bundler).
5. `capabilities.json` (data roles + objects schema).
6. `pbiviz.json` (visual metadata + display name + GUID).

…all into a single `.pbiviz` zip in `dist/`. The `npm run release`
step then copies that to `releases/AdminCartograph.pbiviz`.

## Webpack and TypeScript

`pbiviz` ships its own webpack config. TypeScript is transpiled
with `tsconfig.json` settings (target ES6, strict mode off for
flexibility with d3 / topojson types).

CSS / LESS goes through `less-loader`. The compiled CSS is
embedded inside the visual at runtime via `<style>` injection.

The TopoJSON file is imported via `require` in `src/visual.ts`,
which webpack picks up at compile time and embeds as a string
constant. There's no runtime fetch.

## Build outputs

| Path | Size (current) | Contents |
|---|---|---|
| `dist/admChoroplethBubbleMap1A2B3C.1.0.0.0.pbiviz` | ~630 KB | Raw `pbiviz package` output (the GUID + version live in the filename) |
| `releases/AdminCartograph.pbiviz` | ~630 KB | Same file, renamed for distribution |
| `assets/geometry/world.topojson.json` | ~2.4 MB | Built artifact, gitignored |
| `assets/geometry/country-index.json` | ~1.6 KB | Built artifact, gitignored |
| `scripts/data/raw/` | ~1.5 GB if you run fetch-geometry on every country | Extracted GeoJSON, gitignored |
| `node_modules/` | ~250 MB | Dependencies |

## Troubleshooting builds

| Symptom | Likely cause | Fix |
|---|---|---|
| `Module parse failed` | TypeScript error in your edit | Run `tsc --noEmit` to see the precise location. |
| `Visual didn't bundle world.topojson.json` | The build step didn't run before package | Always use `npm run release` (chains sync + build + package). |
| `pbiviz package` warns about icon size | `assets/icon.png` doesn't exist or is the wrong dimensions | Should be 20×20. The repo ships with one. |
| `eslint-plugin-powerbi-visuals` not found | The plugin needs a specific older version compatible with our pbiviz tools | Locked at `1.0.0` in `package.json`; if `npm install` upgrades it, force reinstall the pinned version. |

## See also

- [Architecture Overview](Architecture-Overview.md)
- [Adding a Country to the Bundle](Adding-Your-Own-Country-to-the-Bundle.md)

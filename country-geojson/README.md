# country-geojson/

Drop fieldmaps.io GeoJSON zips here, one per country, named
`<ISO3>.geojson.zip`. The release pipeline builds one `.pbiviz` per zip.

```
country-geojson/
  SDN.geojson.zip
  YEM.geojson.zip
  SOM.geojson.zip
```

To rebuild every release:

```bash
npm run release-all
```

Each run produces `releases/admChoroplethBubbleMap-<ISO3>.pbiviz` with
that single country's ADM1 + ADM2 geometry embedded. The visuals are
GUID-distinct so Power BI can host all of them side-by-side in the same
report (e.g. drop SDN and YEM visuals onto the same canvas).

URLs to download fieldmaps.io zips are in
`scripts/data/all_countries_maps_links.xlsx` (column "Link to GeoJSON").

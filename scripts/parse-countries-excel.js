#!/usr/bin/env node
/**
 * Parses an Excel workbook that lists countries with fieldmaps.io download links
 * and writes scripts/data/countries.json (the source of truth for fetch-geometry.js).
 *
 * Expected columns: ISO-3, ADM, Name, Date, Update, Link to Shape File,
 * Link to GeoJSON, Link ti gpkg.
 *
 * Usage:
 *   node scripts/parse-countries-excel.js <path-to-workbook.xlsx> [sheet]
 */
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const inputPath = process.argv[2] || path.join(__dirname, "data", "all_countries_maps_links.xlsx");
const sheetName = process.argv[3];

if (!fs.existsSync(inputPath)) {
  console.error("Workbook not found:", inputPath);
  process.exit(1);
}

const wb = xlsx.readFile(inputPath);
const sheet = wb.Sheets[sheetName || wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

const countries = rows
  .map((r) => ({
    iso3: r["ISO-3"] || r["ISO3"] || r["iso3"],
    name: r["Name"] || r["Country"] || r["name"],
    maxAdm: r["ADM"] != null ? Number(r["ADM"]) : null,
    geojsonUrl: r["Link to GeoJSON"] || r["GeoJSON"] || null,
    shpUrl: r["Link to Shape File"] || r["Shapefile"] || null,
    gpkgUrl: r["Link ti gpkg"] || r["Link to GPKG"] || r["GPKG"] || null,
  }))
  .filter((c) => c.iso3);

const outDir = path.join(__dirname, "data");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "countries.json");
fs.writeFileSync(outPath, JSON.stringify(countries, null, 2));

const dist = countries.reduce((a, c) => {
  a[c.maxAdm] = (a[c.maxAdm] || 0) + 1;
  return a;
}, {});

console.log(`Wrote ${countries.length} countries -> ${outPath}`);
console.log("Max ADM distribution:", dist);

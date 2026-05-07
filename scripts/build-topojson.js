#!/usr/bin/env node
/**
 * Reads the GeoJSON files in scripts/data/raw/<ISO3>/ and builds a single
 * embedded TopoJSON bundle at assets/geometry/world.topojson.json containing
 * ADM1 and ADM2 layers for every country, keyed by feature properties:
 *   ADM1_PCODE, ADM1_EN, ADM2_PCODE, ADM2_EN, ADM0_PCODE/iso3.
 *
 * fieldmaps.io ships a `<ISO3>_admN.geojson` file per admin level; this script
 * locates the highest level <= 2 that exists per country.
 *
 * The output is heavily simplified + quantized so the bundle stays small.
 *
 * Usage:
 *   node scripts/build-topojson.js
 *   node scripts/build-topojson.js --simplify 0.0005 --quantize 10000
 */
const fs = require("fs");
const path = require("path");
const topojsonServer = require("topojson-server");
const topojsonSimplify = require("topojson-simplify");

const DATA_DIR = path.join(__dirname, "data");
const RAW_DIR = path.join(DATA_DIR, "raw");
const OUT_DIR = path.join(__dirname, "..", "assets", "geometry");
const COUNTRIES_PATH = path.join(DATA_DIR, "countries.json");

const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const SIMPLIFY = parseFloat(opt("simplify", "0.0005"));
const QUANTIZE = parseInt(opt("quantize", "10000"), 10);
// --only <ISO3>[,<ISO3>...] limits the build to specific countries even
// when countries.json lists more. Used by release-all.js to produce one
// .pbiviz per country.
const onlyArg = opt("only", null);
const onlySet = onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)) : null;

fs.mkdirSync(OUT_DIR, { recursive: true });
let countries = JSON.parse(fs.readFileSync(COUNTRIES_PATH, "utf8"));
if (onlySet) countries = countries.filter((c) => onlySet.has(c.iso3));

function readGeoJSON(p) {
  const txt = fs.readFileSync(p, "utf8");
  return JSON.parse(txt);
}

function findAdmFile(dir, iso3, level) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  // Common patterns: AFG_adm2.geojson, afg_adm2.json, AFG_adm2.geojson
  const re = new RegExp(`(?:^|[_-])adm${level}\\b.*\\.(geo)?json$`, "i");
  const hit = files.find((f) => re.test(f));
  return hit ? path.join(dir, hit) : null;
}

function pickProp(props, candidates) {
  for (const k of candidates) {
    if (props[k] != null && props[k] !== "") return props[k];
  }
  return null;
}

function normalizeFeatures(fc, iso3, level) {
  if (!fc || !fc.features) return [];
  return fc.features.map((f) => {
    const p = f.properties || {};
    const adm1Pcode = pickProp(p, ["ADM1_PCODE", "ADM1PCODE", "adm1_pcode", "PCODE_1"]);
    const adm2Pcode = pickProp(p, ["ADM2_PCODE", "ADM2PCODE", "adm2_pcode", "PCODE_2"]);
    const adm1Name = pickProp(p, ["ADM1_EN", "ADM1_NAME", "ADM1EN", "name_1", "NAME_1"]);
    const adm2Name = pickProp(p, ["ADM2_EN", "ADM2_NAME", "ADM2EN", "name_2", "NAME_2"]);
    const cleanProps = {
      ISO3: iso3,
      ADM_LEVEL: level,
      ADM1_PCODE: adm1Pcode,
      ADM1_EN: adm1Name,
    };
    if (level >= 2) {
      cleanProps.ADM2_PCODE = adm2Pcode;
      cleanProps.ADM2_EN = adm2Name;
    }
    return { type: "Feature", properties: cleanProps, geometry: f.geometry };
  }).filter(f => f.geometry);
}

const adm1All = [];
const adm2All = [];
const summary = [];

for (const c of countries) {
  const dir = path.join(RAW_DIR, c.iso3);
  if (!fs.existsSync(dir)) {
    summary.push({ iso3: c.iso3, status: "missing-dir" });
    continue;
  }
  const f1 = findAdmFile(dir, c.iso3, 1);
  if (!f1) {
    summary.push({ iso3: c.iso3, status: "no-adm1" });
    continue;
  }
  const fc1 = readGeoJSON(f1);
  const feats1 = normalizeFeatures(fc1, c.iso3, 1);
  adm1All.push(...feats1);

  let admLevel = 1;
  if (c.maxAdm >= 2) {
    const f2 = findAdmFile(dir, c.iso3, 2);
    if (f2) {
      const fc2 = readGeoJSON(f2);
      const feats2 = normalizeFeatures(fc2, c.iso3, 2);
      adm2All.push(...feats2);
      admLevel = 2;
    }
  }
  summary.push({ iso3: c.iso3, status: "ok", admLevel, adm1Count: feats1.length });
}

console.log(`Countries with ADM1: ${adm1All.length === 0 ? 0 : new Set(adm1All.map(f=>f.properties.ISO3)).size}`);
console.log(`Total ADM1 features: ${adm1All.length}`);
console.log(`Total ADM2 features: ${adm2All.length}`);

const adm1FC = { type: "FeatureCollection", features: adm1All };
const adm2FC = { type: "FeatureCollection", features: adm2All };

console.log("Building topology...");
let topo = topojsonServer.topology({ adm1: adm1FC, adm2: adm2FC }, QUANTIZE);
console.log("Simplifying with weight =", SIMPLIFY);
topo = topojsonSimplify.presimplify(topo);
topo = topojsonSimplify.simplify(topo, SIMPLIFY);

const outPath = path.join(OUT_DIR, "world.topojson.json");
const outIndex = path.join(OUT_DIR, "country-index.json");
fs.writeFileSync(outPath, JSON.stringify(topo));

const index = {};
for (const c of countries) {
  const adm1Feats = adm1All.filter((f) => f.properties.ISO3 === c.iso3);
  if (!adm1Feats.length) continue;
  let bbox = null;
  for (const f of adm1Feats) {
    const b = boundsOfGeometry(f.geometry);
    bbox = bbox ? extendBox(bbox, b) : b;
  }
  index[c.iso3] = {
    iso3: c.iso3,
    name: c.name,
    maxAdm: c.maxAdm,
    bbox,
    adm1Count: adm1Feats.length,
    adm2Count: adm2All.filter((f) => f.properties.ISO3 === c.iso3).length,
  };
}
fs.writeFileSync(outIndex, JSON.stringify(index, null, 2));

const stat = fs.statSync(outPath);
console.log(`Wrote ${outPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Wrote ${outIndex} (${Object.keys(index).length} countries indexed)`);
console.log("Summary:");
const grouped = summary.reduce((a, s) => {
  a[s.status] = (a[s.status] || 0) + 1;
  return a;
}, {});
console.log(grouped);

function boundsOfGeometry(g) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function visit(coords) {
    if (typeof coords[0] === "number") {
      const [x, y] = coords;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    } else {
      for (const c of coords) visit(c);
    }
  }
  if (g && g.coordinates) visit(g.coordinates);
  return [minX, minY, maxX, maxY];
}

function extendBox(a, b) {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

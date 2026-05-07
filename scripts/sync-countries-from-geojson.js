#!/usr/bin/env node
/**
 * Sync scripts/data/raw and scripts/data/countries.json with whatever the
 * user has dropped into country-geojson/. The single-bundle pipeline calls
 * this before build-topojson.js so the bundle reflects the current set of
 * uploaded zips.
 *
 * Each <ISO3>.geojson.zip in country-geojson/ becomes:
 *   - scripts/data/raw/<ISO3>/* (extracted geojson files)
 *   - an entry in scripts/data/countries.json with iso3, name (best-effort)
 */
const fs = require("fs");
const path = require("path");
const yauzl = require("yauzl");

const ROOT = path.resolve(__dirname, "..");
const COUNTRY_DIR = path.join(ROOT, "country-geojson");
const RAW_DIR = path.join(ROOT, "scripts", "data", "raw");
const COUNTRIES_PATH = path.join(ROOT, "scripts", "data", "countries.json");

if (!fs.existsSync(COUNTRY_DIR)) {
  console.error(`Missing folder: ${COUNTRY_DIR}`);
  process.exit(1);
}

// Standard ISO3 -> common name fallback for entries we can't resolve from
// the existing countries.json. Keep small; just enough to keep the dropdown
// readable. Anything else falls back to the ISO code.
const FALLBACK_NAMES = {
  SDN: "Sudan", YEM: "Yemen", SOM: "Somalia", SSD: "South Sudan",
  ETH: "Ethiopia", KEN: "Kenya", UGA: "Uganda", TCD: "Chad",
  EGY: "Egypt", LBY: "Libya", TUN: "Tunisia", DZA: "Algeria",
  MAR: "Morocco", IRQ: "Iraq", IRN: "Iran", AFG: "Afghanistan",
  PAK: "Pakistan", LBN: "Lebanon", JOR: "Jordan", SYR: "Syria",
  PSE: "Palestine", TUR: "Turkey", NGA: "Nigeria"
};

const existingByIso = {};
if (fs.existsSync(COUNTRIES_PATH)) {
  for (const c of JSON.parse(fs.readFileSync(COUNTRIES_PATH, "utf8"))) {
    existingByIso[c.iso3] = c;
  }
}

const zips = fs.readdirSync(COUNTRY_DIR)
  .filter((f) => /\.geojson\.zip$/i.test(f))
  .map((f) => ({ file: f, iso: f.replace(/\.geojson\.zip$/i, "").toUpperCase() }))
  .filter((z) => /^[A-Z]{3}$/.test(z.iso));

if (!zips.length) {
  console.error(`No <ISO3>.geojson.zip files in ${COUNTRY_DIR}.`);
  process.exit(1);
}

async function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  await new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zf) => {
      if (err) return reject(err);
      zf.readEntry();
      zf.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zf.readEntry();
          return;
        }
        zf.openReadStream(entry, (err2, rs) => {
          if (err2) return reject(err2);
          const out = path.join(destDir, path.basename(entry.fileName));
          const ws = fs.createWriteStream(out);
          rs.pipe(ws);
          ws.on("close", () => zf.readEntry());
        });
      });
      zf.on("end", resolve);
      zf.on("error", reject);
    });
  });
}

(async () => {
  const out = [];
  for (const z of zips) {
    const dest = path.join(RAW_DIR, z.iso);
    fs.mkdirSync(dest, { recursive: true });
    // Always extract afresh so renames / updates of the source zip take effect.
    for (const f of fs.readdirSync(dest)) {
      if (f.endsWith(".geojson") || f.endsWith(".json")) fs.unlinkSync(path.join(dest, f));
    }
    await extractZip(path.join(COUNTRY_DIR, z.file), dest);
    fs.writeFileSync(path.join(dest, ".done"), new Date().toISOString());

    // Detect the deepest available admN file so build-topojson knows
    // whether ADM2 exists (some countries only ship ADM1).
    let maxAdm = 0;
    for (const f of fs.readdirSync(dest)) {
      const m = f.match(/adm(\d+)/i);
      if (m) maxAdm = Math.max(maxAdm, Number(m[1]));
    }

    const existing = existingByIso[z.iso] || {};
    const name = existing.name || FALLBACK_NAMES[z.iso] || z.iso;
    out.push({
      iso3: z.iso,
      name,
      maxAdm: maxAdm || existing.maxAdm || 1,
      geojsonUrl: existing.geojsonUrl || null,
      shpUrl: existing.shpUrl || null,
      gpkgUrl: existing.gpkgUrl || null
    });
    console.log(`+ ${z.iso} ${name} (maxAdm=${maxAdm})`);
  }
  fs.writeFileSync(COUNTRIES_PATH, JSON.stringify(out, null, 2));
  console.log(`Wrote ${COUNTRIES_PATH} with ${out.length} country/ies.`);
})();

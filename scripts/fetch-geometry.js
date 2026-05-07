#!/usr/bin/env node
/**
 * Downloads GeoJSON zips from fieldmaps.io for every country listed in
 * scripts/data/countries.json and unpacks them into scripts/data/raw/<ISO3>/.
 *
 * Re-running is safe: existing downloads are skipped unless --force is passed.
 *
 * Usage:
 *   node scripts/fetch-geometry.js              # all countries
 *   node scripts/fetch-geometry.js SDN YEM      # specific ISO3 codes
 *   node scripts/fetch-geometry.js --force      # re-download
 */
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const yauzl = require("yauzl");

const DATA_DIR = path.join(__dirname, "data");
const RAW_DIR = path.join(DATA_DIR, "raw");
const COUNTRIES_PATH = path.join(DATA_DIR, "countries.json");

const args = process.argv.slice(2);
const force = args.includes("--force");
const isoFilter = new Set(args.filter((a) => /^[A-Z]{3}$/.test(a)));

if (!fs.existsSync(COUNTRIES_PATH)) {
  console.error("Run parse-countries-excel.js first; missing", COUNTRIES_PATH);
  process.exit(1);
}

const countries = JSON.parse(fs.readFileSync(COUNTRIES_PATH, "utf8"));
fs.mkdirSync(RAW_DIR, { recursive: true });

async function downloadAndExtract(country) {
  const dir = path.join(RAW_DIR, country.iso3);
  const marker = path.join(dir, ".done");
  if (!force && fs.existsSync(marker)) {
    return { iso3: country.iso3, skipped: true };
  }
  fs.mkdirSync(dir, { recursive: true });

  const url = country.geojsonUrl;
  if (!url) {
    return { iso3: country.iso3, error: "no geojson url" };
  }

  const zipPath = path.join(dir, `${country.iso3}.geojson.zip`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    return { iso3: country.iso3, error: `HTTP ${res.status}` };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(zipPath, buf);

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
          const out = path.join(dir, path.basename(entry.fileName));
          const ws = fs.createWriteStream(out);
          rs.pipe(ws);
          ws.on("close", () => zf.readEntry());
        });
      });
      zf.on("end", resolve);
      zf.on("error", reject);
    });
  });

  fs.writeFileSync(marker, new Date().toISOString());
  return { iso3: country.iso3, ok: true };
}

(async () => {
  const targets = countries.filter((c) => (isoFilter.size ? isoFilter.has(c.iso3) : true));
  console.log(`Fetching ${targets.length} countries...`);
  let okCount = 0;
  let skipCount = 0;
  let errCount = 0;

  // Limit concurrency to avoid hammering the server.
  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const idx = cursor++;
      const c = targets[idx];
      try {
        const r = await downloadAndExtract(c);
        if (r.skipped) {
          skipCount++;
          process.stdout.write(`. ${c.iso3} cached\n`);
        } else if (r.ok) {
          okCount++;
          process.stdout.write(`+ ${c.iso3} downloaded\n`);
        } else {
          errCount++;
          process.stdout.write(`! ${c.iso3} ${r.error}\n`);
        }
      } catch (e) {
        errCount++;
        process.stdout.write(`! ${c.iso3} ${e.message}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`Done. ok=${okCount} cached=${skipCount} error=${errCount}`);
})();

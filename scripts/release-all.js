#!/usr/bin/env node
/**
 * Build one .pbiviz per zip in country-geojson/.
 *
 * For every <ISO3>.geojson.zip in country-geojson/:
 *   1. Extract into scripts/data/raw/<ISO3>/
 *   2. Run scripts/build-topojson.js with --only <ISO3> so the embedded
 *      world.topojson.json contains just that country
 *   3. Write a per-country pbiviz.json (unique visualClassName + GUID +
 *      displayName so Power BI treats each as a separate visual)
 *   4. Run `pbiviz package`
 *   5. Move dist/<...>.pbiviz to releases/admChoroplethBubbleMap-<ISO3>.pbiviz
 *
 * The original pbiviz.json is backed up before each iteration and restored
 * at the end (so you can keep editing it interactively).
 *
 * Usage:
 *   node scripts/release-all.js              # build everything in country-geojson/
 *   node scripts/release-all.js SDN YEM      # build only those ISO codes
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const yauzl = require("yauzl");

const ROOT = path.resolve(__dirname, "..");
const COUNTRY_DIR = path.join(ROOT, "country-geojson");
const RAW_DIR = path.join(ROOT, "scripts", "data", "raw");
const RELEASES_DIR = path.join(ROOT, "releases");
const PBIVIZ_PATH = path.join(ROOT, "pbiviz.json");
const PBIVIZ_BACKUP = path.join(ROOT, "pbiviz.json.bak");
const COUNTRIES_PATH = path.join(ROOT, "scripts", "data", "countries.json");
const DIST_DIR = path.join(ROOT, "dist");

const filterArgs = process.argv.slice(2).filter((a) => /^[A-Z]{3}$/.test(a));
const filterSet = filterArgs.length ? new Set(filterArgs) : null;

if (!fs.existsSync(COUNTRY_DIR)) {
  console.error(`Missing folder: ${COUNTRY_DIR}`);
  process.exit(1);
}
fs.mkdirSync(RELEASES_DIR, { recursive: true });

const zips = fs.readdirSync(COUNTRY_DIR)
  .filter((f) => /\.geojson\.zip$/i.test(f))
  .map((f) => ({ file: f, iso: f.replace(/\.geojson\.zip$/i, "").toUpperCase() }))
  .filter((z) => /^[A-Z]{3}$/.test(z.iso))
  .filter((z) => !filterSet || filterSet.has(z.iso));

if (!zips.length) {
  console.error(`No <ISO3>.geojson.zip files in ${COUNTRY_DIR}.`);
  process.exit(1);
}

// Country names for the displayName (best-effort; fall back to ISO).
let countryNames = {};
if (fs.existsSync(COUNTRIES_PATH)) {
  for (const c of JSON.parse(fs.readFileSync(COUNTRIES_PATH, "utf8"))) {
    countryNames[c.iso3] = c.name;
  }
}

const originalPbiviz = fs.readFileSync(PBIVIZ_PATH, "utf8");
fs.writeFileSync(PBIVIZ_BACKUP, originalPbiviz);
const basePbiviz = JSON.parse(originalPbiviz);

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

function shortGuid(iso) {
  // Stable per-country GUID. Power BI uses this to identify the visual.
  // Format: alphanumeric, must contain only letters/digits, max ~30 chars.
  return `admChoroplethBubbleMap${iso}A2B3C`;
}

function makePbivizFor(iso, name) {
  const variant = JSON.parse(JSON.stringify(basePbiviz));
  variant.visual.name = `admChoroplethBubbleMap_${iso}`;
  variant.visual.displayName = `ADM Map: ${name}`;
  variant.visual.guid = shortGuid(iso);
  variant.visual.visualClassName = "Visual";
  variant.visual.description = `Choropleth and bubble map for ${name} (${iso}). ADM1 / ADM2 boundaries are embedded; users bind PCODE only.`;
  return variant;
}

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

(async () => {
  let okCount = 0;
  let errCount = 0;
  try {
    for (const z of zips) {
      console.log(`\n=== Building ${z.iso} (${countryNames[z.iso] || z.iso}) ===`);
      try {
        // 1. Extract zip
        const dest = path.join(RAW_DIR, z.iso);
        // Clean previous extraction so stale files don't confuse the build.
        if (fs.existsSync(dest)) {
          for (const f of fs.readdirSync(dest)) fs.unlinkSync(path.join(dest, f));
        }
        await extractZip(path.join(COUNTRY_DIR, z.file), dest);
        fs.writeFileSync(path.join(dest, ".done"), new Date().toISOString());

        // 2. Build per-country topojson (only this ISO)
        run(`node scripts/build-topojson.js --only ${z.iso}`);

        // 3. Patch pbiviz.json for this country
        const variant = makePbivizFor(z.iso, countryNames[z.iso] || z.iso);
        fs.writeFileSync(PBIVIZ_PATH, JSON.stringify(variant, null, 2));

        // 4. Run pbiviz package
        // Wipe dist so we can pick the freshly produced .pbiviz unambiguously.
        if (fs.existsSync(DIST_DIR)) {
          for (const f of fs.readdirSync(DIST_DIR)) fs.unlinkSync(path.join(DIST_DIR, f));
        }
        run(`npx pbiviz package`);

        // 5. Move output
        const built = fs.readdirSync(DIST_DIR).find((f) => f.endsWith(".pbiviz"));
        if (!built) throw new Error("pbiviz package produced no .pbiviz file");
        const target = path.join(RELEASES_DIR, `admChoroplethBubbleMap-${z.iso}.pbiviz`);
        fs.copyFileSync(path.join(DIST_DIR, built), target);
        const size = (fs.statSync(target).size / 1024).toFixed(1);
        console.log(`  -> releases/admChoroplethBubbleMap-${z.iso}.pbiviz (${size} KB)`);
        okCount++;
      } catch (e) {
        errCount++;
        console.error(`  ! ${z.iso} failed: ${e.message}`);
      }
    }
  } finally {
    // Always restore the user's editable pbiviz.json.
    fs.writeFileSync(PBIVIZ_PATH, originalPbiviz);
    if (fs.existsSync(PBIVIZ_BACKUP)) fs.unlinkSync(PBIVIZ_BACKUP);
  }
  console.log(`\nDone. ok=${okCount} error=${errCount}`);
  process.exit(errCount ? 1 : 0);
})();

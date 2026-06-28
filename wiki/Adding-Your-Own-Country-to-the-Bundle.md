# Adding a Country

**The bundled country set is closed.** The eight countries baked into
the shipped `.pbiviz` (AFG, COD, HTI, IRN, LBN, SDN, SYR, YEM) are
maintained by the project; new countries are not accepted into the
distributed bundle.

## Use Custom upload instead

Every country outside the bundled set is a Power BI design-time
upload — no rebuild, no source-tree change, no maintainer
involvement. The flow is:

1. Format pane → **1. Map setup → Country** → **Custom (upload TopoJSON)**.
2. Pick your **Admin1** TopoJSON or GeoJSON file.
3. Optionally pick an **Admin2** file.
4. Confirm the field mapping (which property holds the PCODE and
   which holds the name on each level).
5. Save the report — the uploaded geometry is persisted into the
   `.pbix` so reopening reloads it automatically.

The full walkthrough lives at [Custom Geometry
Upload](Custom-Geometry-Upload.md). It works for any GeoJSON /
TopoJSON the user can produce (OCHA COD, custom internal
boundaries, planning zones, whatever).

## Why this is the supported path

- **No build access required.** Anyone in your org can use it.
- **Geometry stays with the report.** Anyone opening the `.pbix`
  gets the geometry without distributing a separate file.
- **Per-report scope.** Two reports can use different geometries
  for the same country without a build collision.
- **No bundle bloat.** Every country baked into the bundle adds
  weight to every report that uses the visual, even reports that
  never look at that country.

## See also

- [Custom Geometry Upload](Custom-Geometry-Upload.md) — the
  supported path for any country outside the bundle.
- [Bundled Countries](Bundled-Countries.md) — what currently ships.
- [PCODE Matching](PCODE-Matching.md) — how the visual joins your
  data to the uploaded geometry.

/**
 * Converts a Power BI categorical DataView into a flat AreaDatum map keyed by
 * PCODE. Locality rows take precedence over state rows when both are bound.
 */
import powerbi from "powerbi-visuals-api";
import type { AreaDatum, PreparedDataView } from "../types";

const ROLE_STATE = "statePcode";
const ROLE_LOCALITY = "localityPcode";
const ROLE_COLOR = "colorValue";
const ROLE_BUBBLE = "bubbleSize";
const ROLE_LABEL2 = "labelValue2";
const ROLE_LABEL_TEXT = "labelText1";
const ROLE_TOOLTIPS = "tooltips";
const ROLE_GLYPH = "glyphValues";

function roleOf(column: powerbi.DataViewMetadataColumn, role: string): boolean {
  return !!(column.roles && column.roles[role]);
}

function findCategory(categories: powerbi.DataViewCategoryColumn[] | undefined, role: string): powerbi.DataViewCategoryColumn | null {
  if (!categories) return null;
  for (const c of categories) if (roleOf(c.source, role)) return c;
  return null;
}

function findValue(values: powerbi.DataViewValueColumn[] | undefined, role: string): powerbi.DataViewValueColumn | null {
  if (!values) return null;
  for (const v of values) if (roleOf(v.source, role)) return v;
  return null;
}

function valuesFor(values: powerbi.DataViewValueColumn[] | undefined, role: string): powerbi.DataViewValueColumn[] {
  if (!values) return [];
  return values.filter((v) => roleOf(v.source, role));
}

/**
 * Per-pcode → object → property → resolved colour. Populated when the
 * user binds a ColorPicker with conditional formatting (fx) — Power BI
 * evaluates the rule per row and writes the resulting fill into the
 * category column's `.objects[rowIdx].<object>.<property>` map. We
 * collect those and the renderers look up by pcode.
 */
export type RuleColorMap = Map<string, Map<string, Map<string, string>>>;

function readRuleObjectsAt(cat: powerbi.DataViewCategoryColumn | null, i: number): Map<string, Map<string, string>> | null {
  if (!cat) return null;
  const objs = (cat as any).objects as any[] | undefined;
  const obj = objs?.[i];
  if (!obj) return null;
  const out = new Map<string, Map<string, string>>();
  for (const objectName of Object.keys(obj)) {
    const props = obj[objectName];
    if (!props) continue;
    const propMap = new Map<string, string>();
    for (const propName of Object.keys(props)) {
      const v = props[propName];
      const colour = v?.solid?.color;
      if (typeof colour === "string") propMap.set(propName, colour);
    }
    if (propMap.size) out.set(objectName, propMap);
  }
  return out.size ? out : null;
}

export function prepareDataView(dv: powerbi.DataView | undefined, host: any): PreparedDataView {
  const empty: PreparedDataView = {
    areas: new Map(),
    hasStateBinding: false,
    hasLocalityBinding: false,
    colorValueColumn: null,
    bubbleSizeColumn: null,
    glyphColumns: [],
    filteredStatePcodes: null,
    filteredLocalityPcodes: null,
    ruleColorsByPcode: new Map()
  };
  if (!dv || !dv.categorical) return empty;

  const cat = dv.categorical;
  const categories = cat.categories || [];
  const values = cat.values || ([] as any);

  const stateCat = findCategory(categories, ROLE_STATE);
  const locCat = findCategory(categories, ROLE_LOCALITY);
  const labelTextCat = findCategory(categories, ROLE_LABEL_TEXT);

  const colorCol = findValue(values, ROLE_COLOR);
  const bubbleCol = findValue(values, ROLE_BUBBLE);
  const label2Col = findValue(values, ROLE_LABEL2);
  const tooltipCols = valuesFor(values, ROLE_TOOLTIPS);
  const glyphCols = valuesFor(values, ROLE_GLYPH);

  const hasState = !!stateCat;
  const hasLocality = !!locCat;
  if (!hasState && !hasLocality) return empty;

  const rowCount = (locCat?.values?.length || stateCat?.values?.length || 0);

  // Try to take advantage of any existing slicer/filter selections that
  // already shrink the dataset down. We don't read filter JSON directly; we
  // simply look at what categories are still present.
  const filteredStates = hasState ? new Set<string>() : null;
  const filteredLocs = hasLocality ? new Set<string>() : null;
  if (filteredStates && stateCat) for (const v of stateCat.values) if (v != null) filteredStates.add(String(v));
  if (filteredLocs && locCat) for (const v of locCat.values) if (v != null) filteredLocs.add(String(v));

  const areas = new Map<string, AreaDatum>();
  const ruleColorsByPcode: RuleColorMap = new Map();

  for (let i = 0; i < rowCount; i++) {
    const statePcode = stateCat ? stringOrNull(stateCat.values[i]) : null;
    const locPcode = locCat ? stringOrNull(locCat.values[i]) : null;
    const labelText = labelTextCat ? stringOrNull(labelTextCat.values[i]) : null;

    const colorValue = numericAt(colorCol, i);
    const bubble = numericAt(bubbleCol, i);
    const label2 = numericAt(label2Col, i);
    const glyphValues = glyphCols.map((c) => {
      const raw = c.values[i];
      const n = raw == null ? null : Number(raw);
      return Number.isFinite(n as number) ? (n as number) : 0;
    });

    const tooltips: powerbi.extensibility.VisualTooltipDataItem[] = [];
    for (const t of tooltipCols) {
      const raw = t.values[i];
      tooltips.push({ displayName: t.source.displayName, value: formatTooltipValue(raw, t.source) });
    }

    const highlighted = !!(colorCol && colorCol.highlights && colorCol.highlights[i] != null);

    // Conditional-formatting (fx) results land on each category
    // column's .objects array. Power BI typically populates per-row
    // objects on every category column, so we read both and store
    // entries keyed by both the locality and the state pcode — the
    // bubble / label renderer then finds the rule whichever level
    // the visual is showing (Admin1 in country view, Admin2 in
    // drill).
    const ruleObjectsForLoc = readRuleObjectsAt(locCat, i);
    const ruleObjectsForState = readRuleObjectsAt(stateCat, i);

    if (locPcode) {
      const objs = ruleObjectsForLoc || ruleObjectsForState;
      if (objs && !ruleColorsByPcode.has(locPcode)) ruleColorsByPcode.set(locPcode, objs);
    }
    if (statePcode) {
      // First-write-wins so country-view bubbles get a stable colour
      // when a state has many Admin2 children with possibly differing
      // per-row rule outputs. Users wanting predictable per-state
      // behaviour should bind only Admin1 PCODE; with both bound, we
      // pick the rule colour from the first row of each state.
      const objs = ruleObjectsForState || ruleObjectsForLoc;
      if (objs && !ruleColorsByPcode.has(statePcode)) ruleColorsByPcode.set(statePcode, objs);
    }

    // Build a stable selection id so cross-filter / drill works correctly.
    const builder = host.createSelectionIdBuilder();
    if (locCat && locPcode) {
      builder.withCategory(locCat, i);
    } else if (stateCat && statePcode) {
      builder.withCategory(stateCat, i);
    }
    if (colorCol) builder.withMeasure(colorCol.source.queryName);
    const selectionId = builder.createSelectionId();

    if (locPcode) {
      areas.set(locPcode, {
        pcode: locPcode,
        name: labelText || undefined,
        parentPcode: statePcode || undefined,
        level: 2,
        colorValue,
        bubbleSize: bubble,
        glyphValues,
        labelValue2: label2,
        labelText1: labelText,
        tooltips,
        selectionId,
        highlighted
      });
    } else if (statePcode) {
      const existing = areas.get(statePcode);
      if (!existing || existing.level === 2) continue;
      areas.set(statePcode, {
        pcode: statePcode,
        name: labelText || undefined,
        parentPcode: statePcode,
        level: 1,
        colorValue,
        bubbleSize: bubble,
        glyphValues,
        labelValue2: label2,
        labelText1: labelText,
        tooltips,
        selectionId,
        highlighted
      });
    }
  }

  return {
    areas,
    hasStateBinding: hasState,
    hasLocalityBinding: hasLocality,
    colorValueColumn: colorCol ? colorCol.source : null,
    bubbleSizeColumn: bubbleCol ? bubbleCol.source : null,
    glyphColumns: glyphCols.map((c) => c.source),
    filteredStatePcodes: filteredStates,
    filteredLocalityPcodes: filteredLocs,
    ruleColorsByPcode
  };
}

function stringOrNull(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function numericAt(col: powerbi.DataViewValueColumn | null, i: number): number | null {
  if (!col) return null;
  const raw = col.values[i];
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatTooltipValue(raw: any, source: powerbi.DataViewMetadataColumn): string {
  if (raw == null) return "";
  if (source.type && source.type.numeric) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return String(raw);
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(raw);
}

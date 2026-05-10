import powerbi from "powerbi-visuals-api";

export interface AreaDatum {
  /** ADM1 or ADM2 PCODE used as join key. */
  pcode: string;
  /** Optional override name from the user dataset. */
  name?: string;
  /** ADM1 PCODE this area belongs to (always set; equals pcode for states). */
  parentPcode?: string;
  level: 1 | 2;
  colorValue: number | null;
  /** Raw cell value bound to Color Value, before any numeric coercion.
   *  Used by the categorical classification mode where the user binds
   *  a string column ("High" / "Medium" / "Low") or a numeric column
   *  treated as discrete labels (1 / 2 / 3). Null when the column
   *  isn't bound. */
  colorValueRaw: any;
  bubbleSize: number | null;
  /** Multi-measure values bound to the "Glyph Values" data role. Drives
   *  the pie / donut / column overlay layer. Display names live in the
   *  PreparedDataView for legend reuse. */
  glyphValues: number[];
  labelValue2: number | null;
  labelText1: string | null;
  tooltips: powerbi.extensibility.VisualTooltipDataItem[];
  selectionId: powerbi.extensibility.ISelectionId;
  highlighted: boolean;
}

export interface PreparedDataView {
  areas: Map<string, AreaDatum>;
  hasStateBinding: boolean;
  hasLocalityBinding: boolean;
  colorValueColumn: powerbi.DataViewMetadataColumn | null;
  bubbleSizeColumn: powerbi.DataViewMetadataColumn | null;
  /** Metadata column for Label Value 2 (custom value) so the new
   *  Values legend can show its display name alongside the
   *  choropleth and bubble measures. Null when not bound. */
  labelValue2Column: powerbi.DataViewMetadataColumn | null;
  /** Display names of the measures bound to "Glyph Values", in input
   *  order. Used as legend / tooltip labels for each pie slice or column. */
  glyphColumns: powerbi.DataViewMetadataColumn[];
  /** PCODEs that the report's slicers/filters keep in scope. */
  filteredStatePcodes: Set<string> | null;
  filteredLocalityPcodes: Set<string> | null;
  /** Per-pcode → object name → property name → resolved colour from
   *  conditional formatting rules (fx). Used by the bubble and label
   *  renderers to override the constant from the formatting card. */
  ruleColorsByPcode: Map<string, Map<string, Map<string, string>>>;
}

export interface CountryGeometry {
  iso3: string;
  name: string;
  /** GeoJSON FeatureCollection — extracted from the bundled topology. */
  adm1: any;
  adm2: any | null;
}

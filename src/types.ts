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
  bubbleSize: number | null;
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
  /** PCODEs that the report's slicers/filters keep in scope. */
  filteredStatePcodes: Set<string> | null;
  filteredLocalityPcodes: Set<string> | null;
}

export interface CountryGeometry {
  iso3: string;
  name: string;
  /** GeoJSON FeatureCollection — extracted from the bundled topology. */
  adm1: any;
  adm2: any | null;
}

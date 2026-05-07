"use strict";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import * as d3 from "d3";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { createTooltipServiceWrapper, ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";

import { VisualFormattingSettingsModel, ViewMode } from "./settings";
import { GeometryLoader } from "./geo/geometryLoader";
import { prepareDataView } from "./data/dataConverter";
import { buildBreaks, classIndex, rampColors } from "./render/classification";
import { renderChoropleth, applyBorders } from "./render/choropleth";
import { renderBubbles } from "./render/bubbles";
import { renderLabels, LabelDatum, LabelAnchorOverride } from "./render/labels";
import type { BubbleResult } from "./render/bubbles";
import { renderLegends } from "./render/legend";
import { buildProjection } from "./render/projection";
import type { AreaDatum, PreparedDataView, CountryGeometry } from "./types";

// Embedded geometry — emitted by scripts/build-topojson.js. The bundler picks
// it up via a JSON import; if missing we render an instructional landing
// page so the visual is still useful in dev environments without the data.
let embeddedTopology: any = null;
let embeddedIndex: Record<string, any> = {};
try {
  embeddedTopology = require("../assets/geometry/world.topojson.json");
  embeddedIndex = require("../assets/geometry/country-index.json");
} catch {
  embeddedTopology = null;
  embeddedIndex = {};
}

import IVisual = powerbi.extensibility.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

export class Visual implements IVisual {
  private host: IVisualHost;
  private root: HTMLElement;
  private svg: SVGSVGElement;
  private mapGroup: SVGGElement;
  private adm1Layer: SVGGElement;
  private adm2Layer: SVGGElement;
  private bubbleLayer: SVGGElement;
  private adm1LabelLayer: SVGGElement;
  private adm2LabelLayer: SVGGElement;
  private legendLayer: SVGGElement;
  private overlay: HTMLElement;

  private settingsService: FormattingSettingsService;
  private settings: VisualFormattingSettingsModel;
  private tooltipService: ITooltipServiceWrapper;
  private selectionManager: powerbi.extensibility.ISelectionManager;
  private loader: GeometryLoader | null = null;

  /** Pcode of the Admin1 currently in drill view. Either set by a user
   *  click (drillIsManual = true, persists until back button) or inferred
   *  from cross-filter context (drillIsManual = false, recomputed each
   *  render). */
  private drilledStatePcode: string | null = null;
  private drillIsManual = false;
  /** When the user hits the back button while a filter-inferred drill is
   *  active, we record the pcode so the same filter context doesn't
   *  immediately re-drill back in. Cleared the moment the filter changes
   *  (i.e. would now infer a different pcode or none at all). */
  private suppressedFilterDrill: string | null = null;
  private currentDataView: PreparedDataView | null = null;
  /** Cached so internal state changes (drill / drill-back) can re-render
   *  without waiting for Power BI to call update() again. */
  private lastUpdateOptions: VisualUpdateOptions | null = null;
  /** Cached resolved render inputs from the most recent successful update,
   *  used by drill / drill-back to recompute the view without re-walking the
   *  DataView. */
  private cached: { country: CountryGeometry; prepared: PreparedDataView; width: number; height: number } | null = null;
  /** Drill-back button (DOM, lives in this.overlay). */
  private backButton: HTMLButtonElement | null = null;
  /** Clipboard / export button (DOM, lives in this.overlay). */
  private exportButton: HTMLButtonElement | null = null;

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;
    this.root = options.element;
    this.root.classList.add("adm-map-visual");

    this.settingsService = new FormattingSettingsService(options.host.createLocalizationManager());
    this.tooltipService = createTooltipServiceWrapper(this.host.tooltipService, this.root);
    this.selectionManager = this.host.createSelectionManager();
    this.selectionManager.registerOnSelectCallback(() => this.refreshSelectionStyles());

    this.svg = svgEl("svg", { width: "100%", height: "100%" });
    this.svg.setAttribute("role", "img");
    this.svg.setAttribute("aria-label", "Administrative boundary map");
    this.root.appendChild(this.svg);

    this.mapGroup = svgEl("g", { class: "map-group" });
    this.svg.appendChild(this.mapGroup);
    this.adm1Layer = svgEl("g", { class: "adm1-layer" });
    this.adm2Layer = svgEl("g", { class: "adm2-layer" });
    this.bubbleLayer = svgEl("g", { class: "bubble-layer" });
    this.adm2LabelLayer = svgEl("g", { class: "adm2-label-layer" });
    this.adm1LabelLayer = svgEl("g", { class: "adm1-label-layer" });
    this.legendLayer = svgEl("g", { class: "legend-layer" });
    // Order (bottom -> top):
    //   adm2 (locality fills + borders)
    //   adm1 (Admin1 fills in Admin1 view, or just borders in drill view)
    //   bubbles (always above choropleth)
    //   adm2 labels
    //   adm1 labels (always on top)
    this.mapGroup.appendChild(this.adm2Layer);
    this.mapGroup.appendChild(this.adm1Layer);
    this.mapGroup.appendChild(this.bubbleLayer);
    this.mapGroup.appendChild(this.adm2LabelLayer);
    this.mapGroup.appendChild(this.adm1LabelLayer);
    this.svg.appendChild(this.legendLayer);

    this.overlay = document.createElement("div");
    this.overlay.className = "adm-overlay";
    this.root.appendChild(this.overlay);

    if (embeddedTopology) {
      this.loader = new GeometryLoader(embeddedTopology, embeddedIndex);
    }

    // Attach the click listener ONCE here, on the persistent mapGroup. Using
    // event delegation against [data-pcode] survives every re-render (d3's
    // .data().join() rebuilds path nodes, so per-render .on("click") bindings
    // were race-y inside the Power BI iframe). The handler reads the latest
    // cached state instead of capturing stale closures.
    this.mapGroup.addEventListener("click", (e: MouseEvent) => this.handleMapClick(e));
  }

  /**
   * Single click handler for every adm1 / adm2 path. Reads the current view
   * mode from the cached prepared data view and decides whether to drill,
   * cross-filter or no-op.
   */
  private handleMapClick(e: MouseEvent): void {
    if (!this.settings?.general?.interactionEnabled.value) return;
    if (!this.cached) return;
    const node = (e.target as Element)?.closest?.("[data-pcode]") as SVGElement | null;
    if (!node) return;
    const pcode = node.getAttribute("data-pcode");
    if (!pcode) return;
    e.stopPropagation();

    const view = this.resolveViewMode(this.cached.prepared, this.cached.country);
    const isAdm1 = node.classList.contains("adm1");
    const isAdm2 = node.classList.contains("adm2");

    if (view === "states" && isAdm1) {
      // Admin1 click does two things:
      //   1. cross-filter other visuals to the rows that belong to this
      //      Admin1 (so a bar chart / table responds to the click)
      //   2. drill into the Admin1's children
      this.applyAdmin1Selection(pcode, (e as any).ctrlKey || (e as any).metaKey);
      this.drilledStatePcode = pcode;
      this.drillIsManual = true;
      this.suppressedFilterDrill = null;
      this.rerender();
      return;
    }
    if (view === "localities" && isAdm2) {
      const datum = this.cached.prepared.areas.get(pcode);
      if (datum) {
        this.selectionManager.select(datum.selectionId, (e as any).ctrlKey || (e as any).metaKey);
      }
      this.refreshSelectionStyles();
    }
  }

  public update(options: VisualUpdateOptions): void {
    if (!options || !options.viewport) return;
    this.lastUpdateOptions = options;
    const dv = options.dataViews && options.dataViews[0];
    this.settings = this.settingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dv);

    const width = Math.max(40, options.viewport.width);
    const height = Math.max(40, options.viewport.height);
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.applyBackground(width, height);

    if (!this.loader) {
      this.renderLandingPage("Embedded geometry not found. Run `npm run build-data` to populate assets/geometry/world.topojson.json from fieldmaps.io.");
      return;
    }

    const prepared = prepareDataView(dv, this.host);
    this.currentDataView = prepared;

    const iso3 = this.resolveCountry(prepared);
    if (!iso3) {
      this.renderLandingPage("Bind State PCODE (ADM1) or Locality PCODE (ADM2), then optionally set the Country in the format pane (or it will be auto-detected from PCODE prefixes).");
      return;
    }
    const country = this.loader.forIso3(iso3);
    if (!country) {
      this.renderLandingPage(`Country '${iso3}' is not in the embedded bundle. Add it to scripts/data/countries.json and rebuild.`);
      return;
    }

    this.cached = { country, prepared, width, height };
    this.applyFilterDrill(prepared, country);
    const view = this.resolveViewMode(prepared, country);
    this.renderMap(country, prepared, view, width, height);
  }

  /**
   * Auto-drill from cross-filter context. If another visual / slicer has
   * narrowed the dataset to exactly one Admin1 (or any number of Admin2
   * areas that all share the same parent Admin1), treat that as a drill
   * into the focused area. A manual drill (drillIsManual) always wins —
   * we don't want a passing slicer change to drag the user away from
   * what they explicitly clicked.
   */
  private applyFilterDrill(prepared: PreparedDataView, country: CountryGeometry): void {
    if (this.drillIsManual) return;
    const inferred = this.inferDrillFromFilter(prepared, country);
    if (inferred && inferred !== this.suppressedFilterDrill) {
      this.drilledStatePcode = inferred;
      return;
    }
    // Filter no longer implies any drill — clear both the active drill and
    // any suppression that pointed at a different pcode.
    if (inferred === null) this.suppressedFilterDrill = null;
    this.drilledStatePcode = null;
  }

  private inferDrillFromFilter(prepared: PreparedDataView, country: CountryGeometry): string | null {
    if (!country.adm2) return null;
    const totalStates = country.adm1.features.length;

    // Case 1: filter narrowed to a single Admin1.
    const fs = prepared.filteredStatePcodes;
    if (fs && fs.size === 1 && fs.size < totalStates) {
      return Array.from(fs)[0];
    }

    // Case 2: filter narrowed to one or more Admin2 that all share a
    // single parent Admin1.
    const fl = prepared.filteredLocalityPcodes;
    if (fl && fl.size > 0) {
      const child2parent = new Map<string, string>();
      for (const f of country.adm2.features as any[]) {
        const c = f.properties?.ADM2_PCODE;
        const p = f.properties?.ADM1_PCODE;
        if (c && p) child2parent.set(c, p);
      }
      const parents = new Set<string>();
      for (const code of fl) {
        const p = child2parent.get(code);
        if (p) parents.add(p);
        if (parents.size > 1) return null;
      }
      if (parents.size === 1) return Array.from(parents)[0];
    }
    return null;
  }

  // -------------------------------------------------------------- formatting
  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.settingsService.buildFormattingModel(this.settings);
  }

  // -------------------------------------------------------------- internals
  private applyBackground(width: number, height: number): void {
    const g = this.settings?.general;
    if (!g) return;
    const bg = (this.svg as any);
    if (g.transparentBackground.value) {
      bg.style.background = "transparent";
      this.root.style.background = "transparent";
    } else {
      this.root.style.background = g.background.value.value;
      bg.style.background = g.background.value.value;
    }
  }

  private renderLandingPage(message: string): void {
    while (this.adm1Layer.firstChild) this.adm1Layer.removeChild(this.adm1Layer.firstChild);
    while (this.adm2Layer.firstChild) this.adm2Layer.removeChild(this.adm2Layer.firstChild);
    while (this.bubbleLayer.firstChild) this.bubbleLayer.removeChild(this.bubbleLayer.firstChild);
    while (this.adm1LabelLayer.firstChild) this.adm1LabelLayer.removeChild(this.adm1LabelLayer.firstChild);
    while (this.adm2LabelLayer.firstChild) this.adm2LabelLayer.removeChild(this.adm2LabelLayer.firstChild);
    while (this.legendLayer.firstChild) this.legendLayer.removeChild(this.legendLayer.firstChild);
    this.overlay.innerHTML = `<div class="adm-landing"><strong>ADM Choropleth + Bubble Map</strong><p>${escapeHtml(message)}</p></div>`;
  }

  private resolveCountry(prepared: PreparedDataView): string | null {
    const explicit = (this.settings.general.selectedCountry.value || "").trim().toUpperCase();
    if (explicit && explicit !== "AUTO") return explicit;
    if (!this.loader) return null;
    const sample = new Set<string>();
    for (const a of prepared.areas.values()) {
      sample.add(a.pcode);
      if (a.parentPcode) sample.add(a.parentPcode);
      if (sample.size > 50) break;
    }
    return this.loader.inferIso3(sample);
  }

  private resolveViewMode(prepared: PreparedDataView, country: CountryGeometry): "states" | "localities" {
    const setting = (this.settings.general.viewMode.value as any).value as ViewMode;
    if (setting === "states") return "states";
    if (setting === "localities") return country.adm2 ? "localities" : "states";

    // Auto: ALWAYS start at the Admin1 (states) view. The only thing that
    // moves the visual into the Admin2 (localities) view is an explicit
    // user click on an Admin1 area (which sets drilledStatePcode) or the
    // user picking "Admin2" from the View Mode dropdown.
    //
    // We deliberately do NOT auto-drill based on filter context anymore —
    // sparse data (e.g. a fact table that only has rows for a few states)
    // was being misread as a filter and triggering an unwanted drill.
    if (!country.adm2) return "states";
    if (this.drilledStatePcode) return "localities";
    return "states";
  }

  /**
   * Roll up Admin2-level color/bubble values to their parent Admin1. Used
   * when only Admin2 PCODE is bound but the visual is showing the Admin1
   * view (auto mode default). The parent map is derived from the embedded
   * geometry's ADM1_PCODE property so we don't rely on PCODE-prefix
   * heuristics that vary by country.
   */
  private aggregateToStates(prepared: PreparedDataView, country: CountryGeometry): Map<string, AreaDatum> {
    // Build adm2 -> adm1 lookup from the country's geometry once.
    const childToParent = new Map<string, string>();
    if (country.adm2 && country.adm2.features) {
      for (const f of country.adm2.features as any[]) {
        const c = f.properties?.ADM2_PCODE;
        const p = f.properties?.ADM1_PCODE;
        if (c && p) childToParent.set(c, p);
      }
    }

    const sums = new Map<string, { color: number | null; bubble: number | null; sample: AreaDatum }>();
    for (const a of prepared.areas.values()) {
      let key: string | null;
      if (a.level === 1) {
        key = a.pcode;
      } else {
        key = a.parentPcode || childToParent.get(a.pcode) || null;
      }
      if (!key) continue;
      if (!sums.has(key)) sums.set(key, { color: null, bubble: null, sample: a });
      const acc = sums.get(key)!;
      if (a.colorValue != null) acc.color = (acc.color ?? 0) + a.colorValue;
      if (a.bubbleSize != null) acc.bubble = (acc.bubble ?? 0) + a.bubbleSize;
    }

    const out = new Map<string, AreaDatum>();
    for (const [pcode, acc] of sums) {
      out.set(pcode, {
        pcode,
        name: undefined,
        parentPcode: pcode,
        level: 1,
        colorValue: acc.color,
        bubbleSize: acc.bubble,
        labelValue2: null,
        labelText1: null,
        tooltips: [],
        selectionId: acc.sample.selectionId,
        highlighted: acc.sample.highlighted
      });
    }
    return out;
  }

  private renderMap(country: CountryGeometry, prepared: PreparedDataView, view: "states" | "localities", width: number, height: number): void {
    this.overlay.innerHTML = "";
    this.renderTopBar(view);

    // Filter the visible feature set based on drill state and slicers.
    const adm1Features = (country.adm1.features as any[]).slice();
    const adm2FeaturesAll = (country.adm2?.features || []) as any[];

    let adm1Visible = adm1Features;
    let adm2Visible: any[] = [];

    if (view === "localities") {
      adm2Visible = adm2FeaturesAll;
      if (this.drilledStatePcode) {
        adm2Visible = adm2Visible.filter((f) => f.properties.ADM1_PCODE === this.drilledStatePcode);
        if (this.settings.general.hideUnfilteredStates.value) {
          adm1Visible = adm1Features.filter((f) => f.properties.ADM1_PCODE === this.drilledStatePcode);
        }
      } else if (prepared.filteredStatePcodes && prepared.filteredStatePcodes.size && prepared.filteredStatePcodes.size < adm1Features.length) {
        adm2Visible = adm2Visible.filter((f) => prepared.filteredStatePcodes!.has(f.properties.ADM1_PCODE));
        if (this.settings.general.hideUnfilteredStates.value) {
          adm1Visible = adm1Features.filter((f) => prepared.filteredStatePcodes!.has(f.properties.ADM1_PCODE));
        }
      }
    }

    // For the states view, if the user only bound Locality PCODE, aggregate
    // locality-level values up to the parent state so the choropleth still
    // works.
    // Compute the Admin1-level lookup unconditionally. We need it for
    // tooltips and the Admin1 label even when the visual is in Admin2 mode
    // (e.g. show the drilled state's name + value at the top of the canvas).
    let stateAreas = prepared.areas;
    const anyStateLevel = Array.from(prepared.areas.values()).some((a) => a.level === 1);
    if (!anyStateLevel) {
      stateAreas = this.aggregateToStates(prepared, country);
    }

    const fitFC = view === "localities" && adm2Visible.length
      ? { type: "FeatureCollection", features: adm2Visible }
      : { type: "FeatureCollection", features: adm1Visible };
    const { path, projection } = buildProjection(fitFC, width, height, 12);

    // Compute classification breaks from whichever features carry data.
    const pcodeKey = view === "localities" ? "ADM2_PCODE" : "ADM1_PCODE";
    const visibleFeatures = view === "localities" ? adm2Visible : adm1Visible;
    const lookup = view === "localities" ? prepared.areas : stateAreas;
    const valuedFeatures = visibleFeatures.map((f) => {
      const datum = lookup.get(f.properties[pcodeKey]);
      return { feature: f, datum };
    });
    const colorValues = valuedFeatures.map((v) => v.datum?.colorValue).filter((v): v is number => v != null);

    const cs = this.settings.choropleth;
    const breaks = buildBreaks(colorValues, (cs.classification.value as any).value, cs.classCount.value, cs.manualBreaks.value);
    const customColors = [cs.color1.value.value, cs.color2.value.value, cs.color3.value.value, cs.color4.value.value, cs.color5.value.value];
    const colors = (cs.mode.value as any).value === "custom"
      ? customColors.slice(0, breaks.classCount)
      : rampColors(cs.baseColor.value.value, breaks.classCount);

    const blank = cs.blankTransparent.value ? "transparent" : cs.blankColor.value.value;

    // Choropleth rows
    const rows = valuedFeatures.map(({ feature, datum }) => {
      const v = datum?.colorValue;
      const fill = v != null ? colors[Math.min(colors.length - 1, classIndex(breaks.breaks, v))] : blank;
      return {
        feature,
        pcode: feature.properties[pcodeKey],
        fill,
        fillOpacity: cs.fillOpacity.value,
        highlighted: !!datum?.highlighted
      };
    });

    // Render. State fills/strokes always live in adm1Layer (drawn on TOP so
    // state borders cover locality borders). In locality view the fill is
    // none and clicks pass through to the locality layer below.
    const adm1Rows = view === "states"
      ? rows
      : adm1Visible.map((f) => ({
          feature: f,
          pcode: f.properties.ADM1_PCODE,
          fill: "none",
          fillOpacity: 0,
          highlighted: false
        }));
    const adm2Rows = view === "localities" ? rows : [];

    const adm1Selection = renderChoropleth(this.adm1Layer, path, adm1Rows, "adm1");
    const adm2Selection = renderChoropleth(this.adm2Layer, path, adm2Rows, "adm2");

    // In locality view, state polygons exist only to draw borders on top.
    // Disable pointer events so clicks fall through to the locality below.
    adm1Selection.style("pointer-events", view === "localities" ? "none" : null);

    applyBorders(this.adm1Layer, this.adm2Layer, {
      stateColor: this.settings.borders.stateColor.value.value,
      stateWidth: this.settings.borders.stateWidth.value,
      stateOpacity: this.settings.borders.stateOpacity.value,
      localityColor: this.settings.borders.localityColor.value.value,
      localityWidth: this.settings.borders.localityWidth.value,
      localityOpacity: this.settings.borders.localityOpacity.value
    });

    // Bubbles
    const bubbleStyle = this.settings.bubbles;
    const bubbleResult = renderBubbles(
      this.bubbleLayer,
      projection,
      view === "localities" ? adm2Visible : adm1Visible,
      lookup,
      pcodeKey as any,
      {
        show: bubbleStyle.show.value,
        fillColor: bubbleStyle.fillColor.value.value,
        strokeColor: bubbleStyle.strokeColor.value.value,
        strokeWidth: bubbleStyle.strokeWidth.value,
        opacity: bubbleStyle.opacity.value,
        minRadius: bubbleStyle.minRadius.value,
        maxRadius: bubbleStyle.maxRadius.value
      }
    );

    // Labels — state labels always (when shown); locality labels depend on view.
    // When bubbles are visible, position labels for those areas relative to
    // the bubble (above / below / left / right / center) instead of at the
    // polygon's interior centroid. This is what makes the choropleth not
    // hide the bubble + label on top of an opaque fill.
    const bubblePlacement = (this.settings.bubbles.labelPlacement.value as any).value as string;
    const labelOverrides = bubbleResult ? this.buildBubbleLabelOverrides(bubbleResult, bubblePlacement, this.settings.stateLabels.fontSize.value) : undefined;
    const activeLocalityCard = this.drilledStatePcode ? this.settings.drillLocalityLabels : this.settings.localityLabels;
    const localityOverrides = bubbleResult && view === "localities"
      ? this.buildBubbleLabelOverrides(bubbleResult, bubblePlacement, activeLocalityCard.fontSize.value)
      : undefined;

    while (this.adm1LabelLayer.firstChild) this.adm1LabelLayer.removeChild(this.adm1LabelLayer.firstChild);
    if (this.settings.stateLabels.show.value) {
      const isDrill = !!this.drilledStatePcode && view === "localities";

      // Neighbour labels go into a sub-group so we can dim them as a unit
      // in drill view (30% opacity) without dimming the title pill, which
      // is rendered into adm1LabelLayer directly afterward.
      const neighborGroup = svgEl("g", { class: "adm1-neighbor-labels" });
      this.adm1LabelLayer.appendChild(neighborGroup);
      if (isDrill) neighborGroup.setAttribute("opacity", "0.3");

      const labelFeatures = isDrill
        ? adm1Visible.filter((f) => f.properties.ADM1_PCODE !== this.drilledStatePcode)
        : adm1Visible;
      if (labelFeatures.length) {
        const labels: LabelDatum[] = labelFeatures.map((f) => {
          const datum = stateAreas.get(f.properties.ADM1_PCODE);
          return {
            feature: f,
            pcode: f.properties.ADM1_PCODE,
            name: (datum?.labelText1 || datum?.name || f.properties.ADM1_EN || f.properties.ADM1_PCODE) as string,
            value: datum?.colorValue ?? null,
            value2: datum?.labelValue2 ?? null
          };
        });
        renderLabels(neighborGroup, projection, path, labels, this.styleFromCard(this.settings.stateLabels), view === "states" ? labelOverrides : undefined);
      }

      if (isDrill) {
        const drilledFeature = adm1Visible.find((f) => f.properties.ADM1_PCODE === this.drilledStatePcode);
        if (drilledFeature) {
          const datum = stateAreas.get(drilledFeature.properties.ADM1_PCODE);
          this.renderAdmin1Header(width, drilledFeature, datum);
        }
      }
    }

    // Pick the right Admin2 label card based on whether the user has drilled
    // into a single Admin1 (drill card) or is viewing every Admin2 in the
    // country (default card). View === "localities" alone isn't enough — the
    // user may have switched to Admin2 from the View Mode dropdown without
    // drilling, in which case the "default view" card should apply.
    const drilled = !!this.drilledStatePcode;
    const localityCard = drilled ? this.settings.drillLocalityLabels : this.settings.localityLabels;
    if (localityCard.show.value && adm2Visible.length) {
      const labels: LabelDatum[] = adm2Visible.map((f) => {
        const datum = prepared.areas.get(f.properties.ADM2_PCODE);
        return {
          feature: f,
          pcode: f.properties.ADM2_PCODE,
          name: (datum?.labelText1 || datum?.name || f.properties.ADM2_EN || f.properties.ADM2_PCODE) as string,
          value: datum?.colorValue ?? null,
          value2: datum?.labelValue2 ?? null
        };
      });
      renderLabels(this.adm2LabelLayer, projection, path, labels, this.styleFromCard(localityCard), localityOverrides);
    } else {
      while (this.adm2LabelLayer.firstChild) this.adm2LabelLayer.removeChild(this.adm2LabelLayer.firstChild);
    }

    // Legends
    const valueLegend = this.settings.valueLegend;
    const bubbleLegend = this.settings.bubbleLegend;
    const valueClasses = breaks.classCount > 0 ? makeLegendClasses(breaks, colors) : [];
    const valueTitle = valueLegend.title.value || prepared.colorValueColumn?.displayName || "";
    const bubbleTitle = bubbleLegend.title.value || prepared.bubbleSizeColumn?.displayName || "";
    renderLegends(this.legendLayer, {
      width,
      height,
      value: valueLegend.show.value && valueClasses.length ? {
        title: valueTitle,
        classes: valueClasses,
        decimals: valueLegend.decimals.value,
        orientation: (valueLegend.orientation.value as any).value,
        position: (valueLegend.position.value as any).value,
        size: (valueLegend.size.value as any).value,
        breaks
      } : undefined,
      bubble: bubbleLegend.show.value && bubbleResult ? {
        title: bubbleTitle,
        fillColor: bubbleStyle.fillColor.value.value,
        strokeColor: bubbleStyle.strokeColor.value.value,
        minRadius: bubbleStyle.minRadius.value,
        maxRadius: bubbleStyle.maxRadius.value,
        minValue: bubbleResult.minValue,
        maxValue: bubbleResult.maxValue,
        position: (bubbleLegend.position.value as any).value,
        size: (bubbleLegend.size.value as any).value
      } : undefined,
      container: {
        borderColor: this.settings.legendContainer.borderColor.value.value,
        borderWidth: this.settings.legendContainer.borderWidth.value,
        cornerRadius: this.settings.legendContainer.cornerRadius.value,
        padding: this.settings.legendContainer.padding.value,
        background: this.settings.legendContainer.background.value.value,
        backgroundOpacity: this.settings.legendContainer.backgroundOpacity.value
      }
    });

    // Wire interactivity (tooltips). Click handling is delegated through
    // handleMapClick attached once in the constructor.
    this.wireInteraction(adm1Selection, adm2Selection, prepared, stateAreas, view);
  }

  private wireInteraction(adm1Sel: any, adm2Sel: any, prepared: PreparedDataView, stateAreas: Map<string, AreaDatum>, view: "states" | "localities"): void {
    // Tooltips on both layers so a hover anywhere on the map produces info.
    // The bound datum on each path is a ChoroplethRow ({ feature, pcode, ... }).
    const adm1Tooltip = (row: any) => this.buildTooltip(row, prepared, stateAreas, /*isAdmin2*/ false);
    const adm2Tooltip = (row: any) => this.buildTooltip(row, prepared, prepared.areas, /*isAdmin2*/ true);

    this.tooltipService.addTooltip(
      adm1Sel,
      adm1Tooltip,
      (row: any) => stateAreas.get(row.pcode)?.selectionId
    );
    this.tooltipService.addTooltip(
      adm2Sel,
      adm2Tooltip,
      (row: any) => prepared.areas.get(row.pcode)?.selectionId
    );
  }

  /**
   * Build the tooltip rows for a single hovered area.
   *
   * Always shows the Admin1 name. Adds the Admin2 name when hovering an
   * Admin2 polygon. Then the color measure (if bound), the bubble measure
   * (if bound), and any user-supplied Tooltips fields.
   *
   * Names are taken from the embedded geometry's ADM1_EN / ADM2_EN
   * properties so they work even when the user binds only the PCODE.
   */
  private buildTooltip(
    row: any,
    prepared: PreparedDataView,
    lookup: Map<string, AreaDatum>,
    isAdmin2: boolean
  ): powerbi.extensibility.VisualTooltipDataItem[] {
    const items: powerbi.extensibility.VisualTooltipDataItem[] = [];
    const props = row?.feature?.properties || {};
    const datum = lookup.get(row?.pcode) || prepared.areas.get(row?.pcode);

    const admin1Name = props.ADM1_EN || (datum && datum.level === 1 ? datum.name : undefined) || props.ADM1_PCODE;
    if (admin1Name) items.push({ displayName: "Admin1", value: String(admin1Name) });

    if (isAdmin2) {
      const admin2Name = props.ADM2_EN || (datum && datum.level === 2 ? datum.name : undefined) || props.ADM2_PCODE;
      if (admin2Name) items.push({ displayName: "Admin2", value: String(admin2Name) });
    }

    if (datum?.colorValue != null && prepared.colorValueColumn) {
      items.push({
        displayName: prepared.colorValueColumn.displayName,
        value: formatTooltipNumber(datum.colorValue)
      });
    }
    if (datum?.bubbleSize != null && prepared.bubbleSizeColumn) {
      items.push({
        displayName: prepared.bubbleSizeColumn.displayName,
        value: formatTooltipNumber(datum.bubbleSize)
      });
    }
    if (datum?.tooltips?.length) items.push(...datum.tooltips);
    return items;
  }

  /**
   * Render the drilled Admin1's label as a small pill anchored to the top
   * left, just under the "Country View" back button. Honors the Admin1
   * labels card's content / colour / font / decimals so the user's
   * formatting still applies.
   */
  private renderAdmin1Header(width: number, feature: any, datum: AreaDatum | undefined): void {
    const card = this.settings.stateLabels;
    const content = (card.content.value as any).value as string;
    const fmtCard = this.styleFromCard(card);
    const lines: { text: string; kind: "name" | "value" }[] = [];

    const name = (datum?.labelText1 || datum?.name || feature.properties.ADM1_EN || feature.properties.ADM1_PCODE) as string;
    const value = datum?.colorValue;
    const value2 = datum?.labelValue2;

    if (content === "value") {
      if (value != null) lines.push({ text: this.fmt(value, fmtCard), kind: "value" });
    } else if (content === "name") {
      if (name) lines.push({ text: name, kind: "name" });
    } else {
      if (name) lines.push({ text: name, kind: "name" });
      if (value != null) lines.push({ text: this.fmt(value, fmtCard), kind: "value" });
      if (value2 != null) lines.push({ text: this.fmt(value2, fmtCard), kind: "value" });
    }
    if (!lines.length) return;

    // Drill pill should read like a screen title: clearly larger than the
    // surrounding labels even when the user's Admin1 label font size is
    // small. Floor at 20 px for the name; values render at 0.85x to keep
    // the hierarchy clear.
    const titleFontSize = Math.max(card.fontSize.value + 6, 20);
    const valueFontSize = Math.round(titleFontSize * 0.85);

    const baseX = 8;
    const baseY = 44;
    const sel = (this.adm1LabelLayer as any) as SVGGElement;
    const svgNS = "http://www.w3.org/2000/svg";

    const padX = 14;
    const padY = 10;
    let widest = 0;
    let totalH = padY * 2;
    const lineMetrics = lines.map((l) => {
      const fs = l.kind === "value" ? valueFontSize : titleFontSize;
      const lh = fs * 1.2;
      widest = Math.max(widest, approxTextWidth(l.text, fs));
      totalH += lh;
      return { fs, lh };
    });
    const totalW = widest + padX * 2;

    // Drop shadow gives the pill weight against busy choropleth fills.
    const filterId = "adm1-pill-shadow";
    const defs = document.createElementNS(svgNS, "defs");
    defs.innerHTML =
      `<filter id="${filterId}" x="-10%" y="-10%" width="120%" height="140%">` +
      `<feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.18"/>` +
      `</filter>`;
    sel.appendChild(defs);

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", String(baseX));
    rect.setAttribute("y", String(baseY));
    rect.setAttribute("width", String(totalW));
    rect.setAttribute("height", String(totalH));
    rect.setAttribute("rx", "8");
    rect.setAttribute("ry", "8");
    rect.setAttribute("fill", "rgba(255,255,255,0.97)");
    rect.setAttribute("stroke", "#9aa0a6");
    rect.setAttribute("stroke-width", "1");
    rect.setAttribute("filter", `url(#${filterId})`);
    sel.appendChild(rect);

    let cursorY = baseY + padY;
    for (let i = 0; i < lines.length; i++) {
      const m = lineMetrics[i];
      cursorY += m.lh;
      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("x", String(baseX + padX));
      t.setAttribute("y", String(cursorY - m.lh * 0.25));
      t.setAttribute("text-anchor", "start");
      t.setAttribute("font-family", card.fontFamily.value);
      t.setAttribute("font-size", String(m.fs));
      // Always render the title bold so it reads as a header even when the
      // Admin1 labels card has bold turned off for the on-map labels.
      t.setAttribute("font-weight", lines[i].kind === "value" ? (card.bold.value ? "600" : "500") : "700");
      t.setAttribute("font-style", card.italic.value ? "italic" : "normal");
      t.setAttribute("fill", lines[i].kind === "value" ? card.valueColor.value.value : card.color.value.value);
      t.textContent = lines[i].text;
      sel.appendChild(t);
    }
  }

  /**
   * Cross-filter other visuals when the user clicks an Admin1.
   *
   * If Admin1 PCODE was bound directly, the matching AreaDatum already
   * carries an Admin1-level selectionId — submit that. Otherwise the data
   * lives at Admin2 level only, in which case we collect every Admin2
   * AreaDatum whose parent (per the embedded geometry) is the clicked
   * Admin1 and submit them all together. selectionManager.select accepts
   * an array of selectionIds, so the host filters by the union.
   */
  private applyAdmin1Selection(pcode: string, multiSelect: boolean): void {
    if (!this.cached) return;
    const directly = this.cached.prepared.areas.get(pcode);
    if (directly && directly.level === 1) {
      this.selectionManager.select(directly.selectionId, multiSelect);
      return;
    }
    const country = this.cached.country;
    const child2parent = new Map<string, string>();
    if (country.adm2) {
      for (const f of country.adm2.features as any[]) {
        const c = f.properties?.ADM2_PCODE;
        const p = f.properties?.ADM1_PCODE;
        if (c && p) child2parent.set(c, p);
      }
    }
    const ids: powerbi.extensibility.ISelectionId[] = [];
    for (const a of this.cached.prepared.areas.values()) {
      const parent = a.parentPcode || child2parent.get(a.pcode);
      if (parent === pcode) ids.push(a.selectionId);
    }
    if (ids.length) {
      this.selectionManager.select(ids, multiSelect);
    }
  }
  private admin1NavOrder(): string[] {
    if (!this.cached) return [];
    const feats = (this.cached.country.adm1.features as any[]) || [];
    return feats
      .map((f) => ({
        pcode: f.properties.ADM1_PCODE as string,
        name: (f.properties.ADM1_EN || f.properties.ADM1_PCODE) as string
      }))
      .filter((x) => x.pcode)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => x.pcode);
  }

  private admin1NameFor(pcode: string): string {
    if (!this.cached) return pcode;
    const f = (this.cached.country.adm1.features as any[]).find((f) => f.properties.ADM1_PCODE === pcode);
    return f?.properties?.ADM1_EN || pcode;
  }

  private fmt(n: number, style: any): string {
    const d = Math.max(0, Math.min(6, style.decimals | 0));
    return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  /**
   * For each bubble, compute a screen-space anchor for the label using the
   * Bubbles > "Label position vs bubble" setting.
   */
  private buildBubbleLabelOverrides(bubbleResult: BubbleResult, placement: string, fontSize: number): Map<string, LabelAnchorOverride> {
    const out = new Map<string, LabelAnchorOverride>();
    const padding = 4;
    const lineHeight = fontSize * 1.15;
    const horizontalGap = 36; // approximate label half-width for left/right placement
    for (const [pcode, anchor] of bubbleResult.anchors) {
      let x = anchor.x;
      let y = anchor.y;
      switch (placement) {
        case "below":
          y = anchor.y + anchor.r + lineHeight / 2 + padding;
          break;
        case "left":
          x = anchor.x - anchor.r - horizontalGap - padding;
          break;
        case "right":
          x = anchor.x + anchor.r + horizontalGap + padding;
          break;
        case "center":
          // Bubble center — label sits inside the bubble.
          break;
        case "above":
        default:
          y = anchor.y - anchor.r - lineHeight / 2 - padding;
          break;
      }
      out.set(pcode, { x, y });
    }
    return out;
  }

  /** Re-renders using the cached state from the last successful update().
   *  This is what drill / drill-back call so view-mode changes happen
   *  instantly instead of waiting for Power BI to push another update. */
  private rerender(): void {
    if (!this.cached) return;
    const { country, prepared, width, height } = this.cached;
    const view = this.resolveViewMode(prepared, country);
    this.renderMap(country, prepared, view, width, height);
  }

  private renderTopBar(view: "states" | "localities"): void {
    let bar = this.overlay.querySelector(".adm-top-bar") as HTMLDivElement;
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "adm-top-bar";
      this.overlay.appendChild(bar);
    } else {
      while (bar.firstChild) bar.removeChild(bar.firstChild);
    }

    // Drill-back button (left side, only when drilled). Label says
    // "Country View" — i.e. zoom back out to all Admin1 areas.
    if (view === "localities" && this.drilledStatePcode) {
      const back = document.createElement("button");
      back.className = "adm-back-button";
      back.type = "button";
      back.setAttribute("aria-label", "Country View");
      back.innerHTML = "&#8592; Country View";
      back.addEventListener("click", (e) => {
        e.stopPropagation();
        // If the drill came from a slicer / cross-filter, remember the
        // user opted out so this exact filter context doesn't immediately
        // re-drill back in. Cleared automatically when the filter changes.
        if (!this.drillIsManual && this.drilledStatePcode) {
          this.suppressedFilterDrill = this.drilledStatePcode;
        }
        this.drilledStatePcode = null;
        this.drillIsManual = false;
        this.rerender();
      });
      bar.appendChild(back);
      this.backButton = back;

      // Prev / next arrows step through every Admin1 in the embedded
      // geometry alphabetically by ADM1_EN, so the user can flip between
      // states without going back to the Country View.
      const order = this.admin1NavOrder();
      const idx = order.indexOf(this.drilledStatePcode);
      const prev = order.length ? order[(idx - 1 + order.length) % order.length] : null;
      const next = order.length ? order[(idx + 1) % order.length] : null;

      const mkNav = (dir: "prev" | "next", target: string | null, glyph: string, label: string) => {
        const btn = document.createElement("button");
        btn.className = `adm-nav-button adm-nav-${dir}`;
        btn.type = "button";
        btn.setAttribute("aria-label", label);
        btn.title = label;
        btn.innerHTML = glyph;
        btn.disabled = !target;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!target) return;
          this.drilledStatePcode = target;
          // Treat prev/next as a manual override so a stale slicer
          // doesn't bounce us somewhere else on the next render.
          this.drillIsManual = true;
          this.suppressedFilterDrill = null;
          this.rerender();
        });
        return btn;
      };
      bar.appendChild(mkNav("prev", prev, "&#8249;", `Previous Admin1${prev ? ` (${this.admin1NameFor(prev)})` : ""}`));
      bar.appendChild(mkNav("next", next, "&#8250;", `Next Admin1${next ? ` (${this.admin1NameFor(next)})` : ""}`));
    } else {
      this.backButton = null;
    }

    // Spacer pushes the export button to the right.
    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    bar.appendChild(spacer);

    // Copy-to-clipboard button (right side, always visible).
    const exportBtn = document.createElement("button");
    exportBtn.className = "adm-export-button";
    exportBtn.type = "button";
    exportBtn.setAttribute("aria-label", "Copy map to clipboard (A5 landscape)");
    exportBtn.title = "Copy map to clipboard (A5 landscape)";
    exportBtn.innerHTML = clipboardIconSvg();
    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.exportToClipboard(exportBtn);
    });
    bar.appendChild(exportBtn);
    this.exportButton = exportBtn;
  }

  /**
   * Export the current map to the clipboard as a PNG sized to A5 landscape
   * (1748 x 1240 px ≈ 210 x 148 mm at 300 DPI). Falls back to a download if
   * clipboard write is blocked by Power BI's iframe sandbox.
   */
  private async exportToClipboard(btn: HTMLButtonElement): Promise<void> {
    const A5_WIDTH = 1748;
    const A5_HEIGHT = 1240;
    const originalLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "…";

    try {
      // Re-render the visual at the export resolution into a clone of the
      // SVG so the on-screen visual is untouched.
      const clone = this.svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("width", String(A5_WIDTH));
      clone.setAttribute("height", String(A5_HEIGHT));
      clone.setAttribute("viewBox", `0 0 ${A5_WIDTH} ${A5_HEIGHT}`);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

      // Re-rebuild the map at the target dimensions before serializing so
      // labels, projection, legends actually align with the larger canvas.
      if (this.cached) {
        this.renderMapInto(clone, this.cached.country, this.cached.prepared, this.resolveViewMode(this.cached.prepared, this.cached.country), A5_WIDTH, A5_HEIGHT);
      }

      const xml = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.crossOrigin = "anonymous";
      const loaded = new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = (e) => rej(e);
      });
      img.src = url;
      await loaded;

      const canvas = document.createElement("canvas");
      canvas.width = A5_WIDTH;
      canvas.height = A5_HEIGHT;
      const ctx = canvas.getContext("2d")!;
      // Fill white background (matches typical PowerPoint paste expectation).
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, A5_WIDTH, A5_HEIGHT);
      ctx.drawImage(img, 0, 0, A5_WIDTH, A5_HEIGHT);
      URL.revokeObjectURL(url);

      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));

      // Try the Async Clipboard API first.
      let copied = false;
      try {
        const navAny = navigator as any;
        if (navAny.clipboard && typeof navAny.clipboard.write === "function" && typeof (window as any).ClipboardItem === "function") {
          await navAny.clipboard.write([new (window as any).ClipboardItem({ "image/png": blob })]);
          copied = true;
        }
      } catch {
        // fall through to download
      }

      if (!copied) {
        // Fallback: trigger a download. Some Power BI hosts disallow
        // navigator.clipboard inside the visual iframe.
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "map-A5.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }

      btn.innerHTML = copied ? checkIconSvg() : downloadIconSvg();
      setTimeout(() => { btn.innerHTML = originalLabel; btn.disabled = false; }, 1500);
    } catch (e) {
      btn.innerHTML = errorIconSvg();
      setTimeout(() => { btn.innerHTML = originalLabel; btn.disabled = false; }, 1500);
    }
  }

  /**
   * Render the visual at an arbitrary size into a different SVG element.
   * Used by the clipboard exporter; resizes the projection / legends so the
   * exported image looks right at A5 instead of the on-screen viewport.
   */
  private renderMapInto(targetSvg: SVGSVGElement, country: CountryGeometry, prepared: PreparedDataView, view: "states" | "localities", width: number, height: number): void {
    while (targetSvg.firstChild) targetSvg.removeChild(targetSvg.firstChild);
    const mapGroup = svgEl("g", { class: "map-group" });
    targetSvg.appendChild(mapGroup);
    const adm2 = svgEl("g", { class: "adm2-layer" });
    const bubble = svgEl("g", { class: "bubble-layer" });
    const adm1 = svgEl("g", { class: "adm1-layer" });
    const adm2L = svgEl("g", { class: "adm2-label-layer" });
    const adm1L = svgEl("g", { class: "adm1-label-layer" });
    const legend = svgEl("g", { class: "legend-layer" });
    mapGroup.appendChild(adm2);
    mapGroup.appendChild(bubble);
    mapGroup.appendChild(adm1);
    mapGroup.appendChild(adm2L);
    mapGroup.appendChild(adm1L);
    targetSvg.appendChild(legend);

    // Save and swap the visual's layer references temporarily so the existing
    // renderMap implementation paints into the offscreen layers.
    const orig = {
      svg: this.svg,
      adm1: this.adm1Layer,
      adm2: this.adm2Layer,
      bubble: this.bubbleLayer,
      adm1L: this.adm1LabelLayer,
      adm2L: this.adm2LabelLayer,
      legend: this.legendLayer
    };
    this.svg = targetSvg;
    this.adm1Layer = adm1;
    this.adm2Layer = adm2;
    this.bubbleLayer = bubble;
    this.adm1LabelLayer = adm1L;
    this.adm2LabelLayer = adm2L;
    this.legendLayer = legend;
    try {
      this.renderMap(country, prepared, view, width, height);
    } finally {
      this.svg = orig.svg;
      this.adm1Layer = orig.adm1;
      this.adm2Layer = orig.adm2;
      this.bubbleLayer = orig.bubble;
      this.adm1LabelLayer = orig.adm1L;
      this.adm2LabelLayer = orig.adm2L;
      this.legendLayer = orig.legend;
    }
  }

  private refreshSelectionStyles(): void {
    const ids = this.selectionManager.getSelectionIds();
    const dimmed = ids.length > 0;
    d3.select(this.adm1Layer).selectAll("path").attr("fill-opacity", function (d: any) {
      const datum = (d as any).datum;
      const baseOp = (d as any).fillOpacity ?? 1;
      if (!dimmed) return baseOp;
      return datum && ids.some((id) => (id as any).equals(datum.selectionId)) ? baseOp : baseOp * 0.4;
    });
    d3.select(this.adm2Layer).selectAll("path").attr("fill-opacity", function (d: any) {
      const baseOp = (d as any).fillOpacity ?? 1;
      if (!dimmed) return baseOp;
      return baseOp * 0.4;
    });
  }

  private styleFromCard(card: any) {
    return {
      show: card.show.value,
      content: (card.content.value as any).value,
      fontFamily: card.fontFamily.value,
      fontSize: card.fontSize.value,
      color: card.color.value.value,
      valueColor: card.valueColor.value.value,
      bold: card.bold.value,
      italic: card.italic.value,
      haloColor: card.haloColor.value.value,
      haloWidth: card.haloWidth.value,
      decimals: card.decimals.value,
      format: (card.format?.value as any)?.value || "auto",
      placement: (card.placement?.value as any)?.value || "horizontal",
      wordsOnSeparateLines: card.wordsOnSeparateLines?.value || false,
      stackWhenNeeded: card.stackWhenNeeded?.value || false,
      reduceFontSize: card.reduceFontSize?.value || false,
      allowOverrun: card.allowOverrun?.value || false,
      abbreviate: card.abbreviate?.value || false,
      spreadCharacters: card.spreadCharacters?.value || false,
      avoidHoles: card.avoidHoles?.value || false,
      labelLargestPart: card.labelLargestPart?.value || true,
      allowCallout: card.allowCallout?.value || false
    };
  }
}

function svgEl<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name) as any;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

function formatTooltipNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function clipboardIconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="4" rx="1"></rect><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"></path></svg>`;
}
function checkIconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
}
function downloadIconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
}
function errorIconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
}

function makeLegendClasses(breaks: { breaks: number[]; min: number; max: number; classCount: number }, colors: string[]): { color: string; from: number; to: number }[] {
  const out: { color: string; from: number; to: number }[] = [];
  if (breaks.classCount <= 0) return out;
  // Single-class case (e.g. user filtered to a single area, or every area
  // shares the same value): produce one swatch covering the value.
  if (breaks.classCount === 1) {
    out.push({ color: colors[0] || "#999999", from: breaks.min, to: breaks.max });
    return out;
  }
  const edges = [breaks.min, ...breaks.breaks, breaks.max];
  for (let i = 0; i < breaks.classCount; i++) {
    out.push({ color: colors[Math.min(colors.length - 1, i)], from: edges[i], to: edges[i + 1] });
  }
  return out;
}


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
import { renderLabels, LabelDatum } from "./render/labels";
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

  /** Pcode of the state the user has clicked into (drill view). */
  private drilledStatePcode: string | null = null;
  private currentDataView: PreparedDataView | null = null;

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
    this.adm1LabelLayer = svgEl("g", { class: "adm1-label-layer" });
    this.adm2LabelLayer = svgEl("g", { class: "adm2-label-layer" });
    this.legendLayer = svgEl("g", { class: "legend-layer" });
    this.mapGroup.appendChild(this.adm1Layer);
    this.mapGroup.appendChild(this.adm2Layer);
    this.mapGroup.appendChild(this.bubbleLayer);
    this.mapGroup.appendChild(this.adm1LabelLayer);
    this.mapGroup.appendChild(this.adm2LabelLayer);
    this.svg.appendChild(this.legendLayer);

    this.overlay = document.createElement("div");
    this.overlay.className = "adm-overlay";
    this.root.appendChild(this.overlay);

    if (embeddedTopology) {
      this.loader = new GeometryLoader(embeddedTopology, embeddedIndex);
    }
  }

  public update(options: VisualUpdateOptions): void {
    if (!options || !options.viewport) return;
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

    const view = this.resolveViewMode(prepared, country);
    this.renderMap(country, prepared, view, width, height);
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

    // auto: localities if any locality data is bound and the country has ADM2,
    // or if the user has drilled into a state, or if the locality dimension is
    // filtered to a manageable subset.
    if (this.drilledStatePcode && country.adm2) return "localities";
    if (prepared.hasLocalityBinding && country.adm2) return "localities";
    return "states";
  }

  private renderMap(country: CountryGeometry, prepared: PreparedDataView, view: "states" | "localities", width: number, height: number): void {
    this.overlay.innerHTML = "";

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

    const fitFC = view === "localities" && adm2Visible.length
      ? { type: "FeatureCollection", features: adm2Visible }
      : { type: "FeatureCollection", features: adm1Visible };
    const { path, projection } = buildProjection(fitFC, width, height, 12);

    // Compute classification breaks from whichever features carry data.
    const pcodeKey = view === "localities" ? "ADM2_PCODE" : "ADM1_PCODE";
    const visibleFeatures = view === "localities" ? adm2Visible : adm1Visible;
    const valuedFeatures = visibleFeatures.map((f) => {
      const datum = prepared.areas.get(f.properties[pcodeKey]);
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

    // Render
    const adm1Rows = view === "localities" && adm1Visible.length === adm1Features.length
      ? adm1Visible.map((f) => ({ feature: f, pcode: f.properties.ADM1_PCODE, fill: "transparent", fillOpacity: 0, highlighted: false }))
      : (view === "states" ? rows : adm1Visible.map((f) => {
          const datum = prepared.areas.get(f.properties.ADM1_PCODE);
          return {
            feature: f,
            pcode: f.properties.ADM1_PCODE,
            fill: datum?.colorValue != null ? colors[Math.min(colors.length - 1, classIndex(breaks.breaks, datum.colorValue))] : "transparent",
            fillOpacity: view === "localities" ? 0 : cs.fillOpacity.value,
            highlighted: !!datum?.highlighted
          };
        }));
    const adm2Rows = view === "localities" ? rows : [];

    const adm1Selection = renderChoropleth(this.adm1Layer, path, adm1Rows, "adm1");
    const adm2Selection = renderChoropleth(this.adm2Layer, path, adm2Rows, "adm2");

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
      prepared.areas,
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
    if (this.settings.stateLabels.show.value) {
      const labels: LabelDatum[] = adm1Visible.map((f) => {
        const datum = prepared.areas.get(f.properties.ADM1_PCODE);
        return {
          feature: f,
          name: (datum?.labelText1 || datum?.name || f.properties.ADM1_EN || f.properties.ADM1_PCODE) as string,
          value: datum?.colorValue ?? null,
          value2: datum?.labelValue2 ?? null
        };
      });
      renderLabels(this.adm1LabelLayer, projection, path, labels, this.styleFromCard(this.settings.stateLabels));
    } else {
      while (this.adm1LabelLayer.firstChild) this.adm1LabelLayer.removeChild(this.adm1LabelLayer.firstChild);
    }

    const localityCard = view === "localities" ? this.settings.drillLocalityLabels : this.settings.localityLabels;
    if (localityCard.show.value && adm2Visible.length) {
      const labels: LabelDatum[] = adm2Visible.map((f) => {
        const datum = prepared.areas.get(f.properties.ADM2_PCODE);
        return {
          feature: f,
          name: (datum?.labelText1 || datum?.name || f.properties.ADM2_EN || f.properties.ADM2_PCODE) as string,
          value: datum?.colorValue ?? null,
          value2: datum?.labelValue2 ?? null
        };
      });
      renderLabels(this.adm2LabelLayer, projection, path, labels, this.styleFromCard(localityCard));
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

    // Wire interactivity (tooltips, click-to-drill, selection).
    this.wireInteraction(adm1Selection, adm2Selection, prepared, view);
  }

  private wireInteraction(adm1Sel: any, adm2Sel: any, prepared: PreparedDataView, view: "states" | "localities"): void {
    const allowInteract = this.settings.general.interactionEnabled.value;

    const tooltipFor = (datum: AreaDatum | undefined): powerbi.extensibility.VisualTooltipDataItem[] => {
      if (!datum) return [];
      const items: powerbi.extensibility.VisualTooltipDataItem[] = [];
      if (datum.name) items.push({ displayName: "Area", value: datum.name });
      if (datum.colorValue != null && prepared.colorValueColumn)
        items.push({ displayName: prepared.colorValueColumn.displayName, value: String(datum.colorValue) });
      if (datum.bubbleSize != null && prepared.bubbleSizeColumn)
        items.push({ displayName: prepared.bubbleSizeColumn.displayName, value: String(datum.bubbleSize) });
      return items.concat(datum.tooltips);
    };

    const target = view === "localities" ? adm2Sel : adm1Sel;
    this.tooltipService.addTooltip(
      target,
      (event: any) => tooltipFor(prepared.areas.get(event.pcode)),
      (event: any) => prepared.areas.get(event.pcode)?.selectionId
    );

    if (!allowInteract) {
      target.on("click", null);
      return;
    }

    target.on("click", (event: MouseEvent, row: any) => {
      const datum = prepared.areas.get(row.pcode);
      if (view === "states") {
        // Drill into the state's localities (if available).
        this.drilledStatePcode = row.pcode;
      } else {
        // Toggle selection cross-filter at the locality level.
        if (datum) {
          this.selectionManager.select(datum.selectionId, (event as any).ctrlKey || (event as any).metaKey);
        }
      }
      event.stopPropagation();
      this.refreshSelectionStyles();
      this.host.persistProperties({}); // no-op trigger to re-render
      // Force re-render with current viewport — Power BI calls update() when
      // selection changes, so this also recomputes view mode in 'auto'.
    });

    // Click on background to clear drill / selection.
    d3.select(this.svg).on("click", () => {
      if (this.drilledStatePcode) {
        this.drilledStatePcode = null;
        this.host.persistProperties({});
      } else {
        this.selectionManager.clear();
      }
      this.refreshSelectionStyles();
    });
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

function makeLegendClasses(breaks: { breaks: number[]; min: number; max: number; classCount: number }, colors: string[]): { color: string; from: number; to: number }[] {
  const out: { color: string; from: number; to: number }[] = [];
  const edges = [breaks.min, ...breaks.breaks, breaks.max];
  for (let i = 0; i < breaks.classCount; i++) {
    out.push({ color: colors[Math.min(colors.length - 1, i)], from: edges[i], to: edges[i + 1] });
  }
  return out;
}


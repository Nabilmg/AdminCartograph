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
import { renderGlyphs, GlyphType } from "./render/glyphs";
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
  private glyphLayer: SVGGElement;
  private adm1LabelLayer: SVGGElement;
  private adm2LabelLayer: SVGGElement;
  private legendLayer: SVGGElement;
  private overlay: HTMLElement;

  private settingsService: FormattingSettingsService;
  private settings: VisualFormattingSettingsModel;
  private tooltipService: ITooltipServiceWrapper;
  private selectionManager: powerbi.extensibility.ISelectionManager;
  private loader: GeometryLoader | null = null;

  /** Pcode of the Admin1 currently in drill view. Reset on every update
   *  from the cross-filter context — clicks and prev/next set it
   *  immediately for snappy feedback, but the next render confirms or
   *  overrides it from whatever filter the host has applied. */
  private drilledStatePcode: string | null = null;
  /** When the user hits the back button while a filter-implied drill is
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
  /** Cached parsed custom country geometry. Key includes both files +
   *  mapping so a re-edit recomputes the cache. */
  private customGeometryCache: { key: string; country: CountryGeometry } | null = null;
  /** In-flight upload state held in the upload card before the user
   *  hits "Load map". Files are read locally; nothing persists until
   *  Confirm. */
  private customUploadDraft: {
    adm1Raw: string | null;
    adm1Filename: string | null;
    adm2Raw: string | null;
    adm2Filename: string | null;
    adm1Properties: string[];
    adm2Properties: string[];
    mapping: { adm1Pcode: string; adm1Name: string; adm2Pcode: string; adm2Name: string };
  } | null = null;
  /** Current zoom level applied to the mapGroup (1 = 100%). */
  private zoomLevel = 1;
  /** Cached width/height for the zoom transform. */
  private viewportW = 0;
  private viewportH = 0;

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
    this.glyphLayer = svgEl("g", { class: "glyph-layer" });
    this.adm2LabelLayer = svgEl("g", { class: "adm2-label-layer" });
    this.adm1LabelLayer = svgEl("g", { class: "adm1-label-layer" });
    this.legendLayer = svgEl("g", { class: "legend-layer" });
    // Order (bottom -> top):
    //   adm2 (locality fills + borders)
    //   adm1 (Admin1 fills in Admin1 view, or just borders in drill view)
    //   bubbles (always above choropleth)
    //   glyphs (pie / donut / column charts on top of bubbles)
    //   adm2 labels
    //   adm1 labels (always on top)
    this.mapGroup.appendChild(this.adm2Layer);
    this.mapGroup.appendChild(this.adm1Layer);
    this.mapGroup.appendChild(this.bubbleLayer);
    this.mapGroup.appendChild(this.glyphLayer);
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
      // We set drilledStatePcode immediately for instant feedback. The
      // next update() reconciles via the filter context, which keeps the
      // visual in sync with whatever the host actually filtered to.
      this.applyAdmin1Selection(pcode, (e as any).ctrlKey || (e as any).metaKey);
      this.drilledStatePcode = pcode;
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
    let country: CountryGeometry | null = null;
    if (iso3 === "CUSTOM") {
      country = this.loadCustomCountry();
      if (!country) {
        this.renderCustomUploadPrompt();
        return;
      }
    } else {
      country = this.loader.forIso3(iso3);
      if (!country) {
        this.renderLandingPage(`Country '${iso3}' is not in the bundle. Add its zip to country-geojson/ and rebuild, or pick "Custom" to upload a TopoJSON.`);
        return;
      }
    }

    this.cached = { country, prepared, width, height };
    // Filter-driven drill is an Auto-mode behaviour. When the user has
    // explicitly picked "Admin1" or "Admin2" from the View Mode dropdown,
    // their choice wins — slicers no longer push the visual into drill.
    const viewSetting = (this.settings.general.viewMode.value as any).value as ViewMode;
    if (viewSetting === "auto") {
      this.applyFilterDrill(prepared, country);
    } else {
      this.drilledStatePcode = null;
      this.suppressedFilterDrill = null;
    }
    const view = this.resolveViewMode(prepared, country);
    this.renderMap(country, prepared, view, width, height);
  }

  /**
   * Reconcile the drill state with the host's current cross-filter context
   * on every update. The filter is the source of truth: a click or prev/
   * next sets drilledStatePcode immediately for instant visual feedback,
   * but selectionManager.select propagates the same selection back as a
   * filter on the next update, where this method confirms it.
   *
   * If the filter changes (a slicer in another visual narrows or shifts
   * the focus), the drill follows. The only exception is when the user
   * has explicitly hit "Country View" while a filter-driven drill was
   * active, in which case suppressedFilterDrill records the pcode they
   * stepped out of so we don't immediately re-drill back to it. Cleared
   * automatically when the filter changes.
   */
  private applyFilterDrill(prepared: PreparedDataView, country: CountryGeometry): void {
    const inferred = this.inferDrillFromFilter(prepared, country);
    if (inferred && inferred !== this.suppressedFilterDrill) {
      this.drilledStatePcode = inferred;
      return;
    }
    if (inferred === null) {
      this.suppressedFilterDrill = null;
      this.drilledStatePcode = null;
      return;
    }
    // inferred === suppressedFilterDrill: user opted out of this drill.
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

  /**
   * Build a CountryGeometry from the persisted custom files + field
   * mapping. Files can be TopoJSON (`type: "Topology"`) or GeoJSON
   * (`type: "FeatureCollection"`). Cached on the combined key so a
   * 1 MB string isn't re-parsed every render.
   */
  private loadCustomCountry(): CountryGeometry | null {
    // If we already cached a parsed CountryGeometry from the upload flow,
    // use that. Power BI's persistProperties round-trip can be slow or
    // truncate very large strings; the in-memory cache is the most
    // reliable source within a single session.
    if (this.customGeometryCache?.country) return this.customGeometryCache.country;

    // Fall back to whatever the formatting service has populated. If the
    // service didn't pick the values up (some hosts truncate long
    // TextInput properties), read straight from the raw DataView.
    let adm1Raw = this.settings.general.customAdm1Json.value || "";
    let adm2Raw = this.settings.general.customAdm2Json.value || "";
    let mappingRaw = this.settings.general.customFieldMapping.value || "";
    if (!adm1Raw && this.lastUpdateOptions) {
      const dv = this.lastUpdateOptions.dataViews?.[0];
      const general = (dv?.metadata?.objects as any)?.general || {};
      adm1Raw = general.customAdm1Json || adm1Raw;
      adm2Raw = general.customAdm2Json || adm2Raw;
      mappingRaw = general.customFieldMapping || mappingRaw;
    }
    if (!adm1Raw) return null;
    const key = `${mappingRaw}::${adm1Raw.length}-${adm1Raw.slice(0, 64)}::${adm2Raw.length}-${adm2Raw.slice(0, 64)}`;
    if (this.customGeometryCache && this.customGeometryCache.key === key) {
      return this.customGeometryCache.country;
    }
    let mapping: { adm1Pcode: string; adm1Name: string; adm2Pcode: string; adm2Name: string };
    try {
      mapping = JSON.parse(mappingRaw || "{}") || {};
    } catch {
      mapping = { adm1Pcode: "", adm1Name: "", adm2Pcode: "", adm2Name: "" };
    }
    try {
      const adm1 = parseUploadedShape(adm1Raw);
      const adm2 = adm2Raw ? parseUploadedShape(adm2Raw) : null;
      if (!adm1 || !adm1.features?.length) return null;
      this.applyMapping(adm1.features, 1, mapping);
      if (adm2 && adm2.features?.length) this.applyMapping(adm2.features, 2, mapping);
      const name = (this.settings.general.customTopoName.value || "Custom").trim() || "Custom";
      const country: CountryGeometry = {
        iso3: "CUSTOM",
        name,
        adm1,
        adm2: adm2 && adm2.features?.length ? adm2 : null
      };
      this.customGeometryCache = { key, country };
      return country;
    } catch (e) {
      console.warn("Custom geometry parse failed:", (e as any)?.message || e);
      return null;
    }
  }

  private applyMapping(features: any[], level: 1 | 2, mapping: { adm1Pcode?: string; adm1Name?: string; adm2Pcode?: string; adm2Name?: string }): void {
    for (const f of features) {
      const p = f.properties || {};
      const cleaned: any = { ISO3: "CUSTOM", ADM_LEVEL: level };
      const adm1PcodeKey = mapping.adm1Pcode || guessPropertyName(p, "adm1Pcode");
      const adm1NameKey = mapping.adm1Name || guessPropertyName(p, "adm1Name");
      if (adm1PcodeKey && p[adm1PcodeKey] != null) cleaned.ADM1_PCODE = String(p[adm1PcodeKey]);
      if (adm1NameKey && p[adm1NameKey] != null) cleaned.ADM1_EN = String(p[adm1NameKey]);
      if (level === 2) {
        const adm2PcodeKey = mapping.adm2Pcode || guessPropertyName(p, "adm2Pcode");
        const adm2NameKey = mapping.adm2Name || guessPropertyName(p, "adm2Name");
        if (adm2PcodeKey && p[adm2PcodeKey] != null) cleaned.ADM2_PCODE = String(p[adm2PcodeKey]);
        if (adm2NameKey && p[adm2NameKey] != null) cleaned.ADM2_EN = String(p[adm2NameKey]);
      }
      f.properties = cleaned;
    }
  }

  /** Pre-render UI shown when Custom is selected but no upload yet. */
  private renderCustomUploadPrompt(): void {
    while (this.adm1Layer.firstChild) this.adm1Layer.removeChild(this.adm1Layer.firstChild);
    while (this.adm2Layer.firstChild) this.adm2Layer.removeChild(this.adm2Layer.firstChild);
    while (this.bubbleLayer.firstChild) this.bubbleLayer.removeChild(this.bubbleLayer.firstChild);
    while (this.glyphLayer.firstChild) this.glyphLayer.removeChild(this.glyphLayer.firstChild);
    while (this.adm1LabelLayer.firstChild) this.adm1LabelLayer.removeChild(this.adm1LabelLayer.firstChild);
    while (this.adm2LabelLayer.firstChild) this.adm2LabelLayer.removeChild(this.adm2LabelLayer.firstChild);
    while (this.legendLayer.firstChild) this.legendLayer.removeChild(this.legendLayer.firstChild);

    this.overlay.innerHTML = "";
    const card = document.createElement("div");
    card.className = "adm-landing adm-custom-upload";
    this.overlay.appendChild(card);
    if (!this.customUploadDraft) {
      this.customUploadDraft = {
        adm1Raw: null,
        adm1Filename: null,
        adm2Raw: null,
        adm2Filename: null,
        adm1Properties: [],
        adm2Properties: [],
        mapping: { adm1Pcode: "", adm1Name: "", adm2Pcode: "", adm2Name: "" }
      };
    }
    this.refreshCustomUploadCard(card);
  }

  /** Re-render the upload card based on current draft state. */
  private refreshCustomUploadCard(card: HTMLDivElement): void {
    const draft = this.customUploadDraft!;
    const filesReady = !!draft.adm1Raw;
    card.innerHTML = `
      <strong>Custom map data</strong>
      <p style="margin:4px 0 12px">Upload TopoJSON or GeoJSON for Admin1 (required) and Admin2 (optional).</p>

      <div class="row">
        <span class="adm-row-label">Admin1 file:</span>
        <button class="adm-secondary" data-pick="adm1">${draft.adm1Filename ? "Change file…" : "Choose file…"}</button>
        <span class="adm-filename">${draft.adm1Filename || "(none)"}</span>
      </div>
      <div class="row">
        <span class="adm-row-label">Admin2 file:</span>
        <button class="adm-secondary" data-pick="adm2">${draft.adm2Filename ? "Change file…" : "Choose file…"}</button>
        <span class="adm-filename">${draft.adm2Filename || "(none — optional)"}</span>
      </div>

      <div class="adm-mapping" style="${filesReady ? "" : "display:none"}">
        <p style="margin:14px 0 6px;font-weight:600">Confirm field mapping</p>
        <div class="row">
          <span class="adm-row-label">Admin1 PCODE:</span>
          ${selectHtml("adm1Pcode", draft.adm1Properties, draft.mapping.adm1Pcode)}
        </div>
        <div class="row">
          <span class="adm-row-label">Admin1 Name:</span>
          ${selectHtml("adm1Name", draft.adm1Properties, draft.mapping.adm1Name)}
        </div>
        <div class="row" style="${draft.adm2Properties.length ? "" : "display:none"}">
          <span class="adm-row-label">Admin2 PCODE:</span>
          ${selectHtml("adm2Pcode", draft.adm2Properties, draft.mapping.adm2Pcode)}
        </div>
        <div class="row" style="${draft.adm2Properties.length ? "" : "display:none"}">
          <span class="adm-row-label">Admin2 Name:</span>
          ${selectHtml("adm2Name", draft.adm2Properties, draft.mapping.adm2Name)}
        </div>
        <button class="adm-primary" data-action="confirm" style="margin-top:14px">Load map</button>
        <span class="adm-error" style="color:#c0392b;margin-left:10px"></span>
      </div>

      <p style="font-size:11px;color:#666;margin-top:14px">The file is saved inside the report (.pbix). Keep it under a few MB.</p>
    `;
    card.querySelectorAll<HTMLButtonElement>("button[data-pick]").forEach((btn) => {
      btn.addEventListener("click", () => this.pickCustomFile(btn.dataset.pick as "adm1" | "adm2", card));
    });
    card.querySelectorAll<HTMLSelectElement>("select[data-role]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const role = sel.dataset.role as keyof typeof draft.mapping;
        draft.mapping[role] = sel.value;
      });
    });
    const confirmBtn = card.querySelector('button[data-action="confirm"]') as HTMLButtonElement | null;
    if (confirmBtn) confirmBtn.addEventListener("click", () => this.confirmCustomUpload(card));
  }

  /** Read a single file into draft state and re-render the card. */
  private pickCustomFile(slot: "adm1" | "adm2", card: HTMLDivElement): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.topojson,.geojson,application/json,application/geo+json";
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        try {
          const parsed = JSON.parse(text);
          const props = collectPropertyNames(parsed);
          if (!props.length) throw new Error("No features found in file");
          const draft = this.customUploadDraft!;
          if (slot === "adm1") {
            draft.adm1Raw = text;
            draft.adm1Filename = file.name;
            draft.adm1Properties = props;
            draft.mapping.adm1Pcode = guessFromList(props, "adm1Pcode");
            draft.mapping.adm1Name = guessFromList(props, "adm1Name");
          } else {
            draft.adm2Raw = text;
            draft.adm2Filename = file.name;
            draft.adm2Properties = props;
            draft.mapping.adm2Pcode = guessFromList(props, "adm2Pcode");
            draft.mapping.adm2Name = guessFromList(props, "adm2Name");
          }
          this.refreshCustomUploadCard(card);
        } catch (e) {
          const errSpan = card.querySelector(".adm-error");
          if (errSpan) errSpan.textContent = `Invalid file: ${(e as any)?.message || "parse error"}`;
        }
      };
      reader.onerror = () => {
        const errSpan = card.querySelector(".adm-error");
        if (errSpan) errSpan.textContent = "Could not read file.";
      };
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
    setTimeout(() => input.remove(), 1000);
  }

  /** User confirmed the mapping — persist everything via host. */
  private confirmCustomUpload(card: HTMLDivElement): void {
    const draft = this.customUploadDraft!;
    const errSpan = card.querySelector(".adm-error") as HTMLElement | null;
    if (errSpan) errSpan.textContent = "";
    if (!draft.adm1Raw || !draft.mapping.adm1Pcode || !draft.mapping.adm1Name) {
      if (errSpan) errSpan.textContent = "Pick the Admin1 PCODE and Name fields.";
      return;
    }
    if (draft.adm2Raw && (!draft.mapping.adm2Pcode || !draft.mapping.adm2Name)) {
      if (errSpan) errSpan.textContent = "Pick the Admin2 PCODE and Name fields, or remove the Admin2 file.";
      return;
    }
    const datasetName = (draft.adm1Filename || "Custom").replace(/\.(topojson|geojson|json)$/i, "");
    const mappingStr = JSON.stringify(draft.mapping);

    // Fast path: build the country geometry NOW and seed the cache so the
    // immediate re-render doesn't have to wait for persistProperties to
    // round-trip through the host. Without this the user clicks Load map
    // and sees no change until Power BI hands back a fresh dataView,
    // which can be several seconds and is sometimes silent on errors.
    try {
      const adm1 = parseUploadedShape(draft.adm1Raw);
      const adm2 = draft.adm2Raw ? parseUploadedShape(draft.adm2Raw) : null;
      if (adm1 && adm1.features?.length) {
        this.applyMapping(adm1.features, 1, draft.mapping);
        if (adm2 && adm2.features?.length) this.applyMapping(adm2.features, 2, draft.mapping);
        const country: CountryGeometry = {
          iso3: "CUSTOM",
          name: datasetName,
          adm1,
          adm2: adm2 && adm2.features?.length ? adm2 : null
        };
        const key = `${mappingStr}::${draft.adm1Raw.length}-${draft.adm1Raw.slice(0, 64)}::${(draft.adm2Raw || "").length}-${(draft.adm2Raw || "").slice(0, 64)}`;
        this.customGeometryCache = { key, country };
      }
    } catch (e) {
      if (errSpan) errSpan.textContent = `Could not load files: ${(e as any)?.message || "parse error"}`;
      return;
    }

    // Persist for save/reload.
    try {
      this.host.persistProperties({
        merge: [
          {
            objectName: "general",
            properties: {
              customAdm1Json: draft.adm1Raw,
              customAdm2Json: draft.adm2Raw || "",
              customFieldMapping: mappingStr,
              customTopoName: datasetName
            },
            selector: null as any
          }
        ]
      } as any);
    } catch (e) {
      // Non-fatal: fast-path cache still renders the map this session.
      console.warn("persistProperties failed — map will render this session only:", e);
    }

    this.customUploadDraft = null;
    // Trigger an immediate render using the seeded cache. The host will
    // also fire its own update() shortly with the persisted values.
    this.rerender();
  }

  private renderLandingPage(message: string): void {
    while (this.adm1Layer.firstChild) this.adm1Layer.removeChild(this.adm1Layer.firstChild);
    while (this.adm2Layer.firstChild) this.adm2Layer.removeChild(this.adm2Layer.firstChild);
    while (this.bubbleLayer.firstChild) this.bubbleLayer.removeChild(this.bubbleLayer.firstChild);
    while (this.glyphLayer.firstChild) this.glyphLayer.removeChild(this.glyphLayer.firstChild);
    while (this.adm1LabelLayer.firstChild) this.adm1LabelLayer.removeChild(this.adm1LabelLayer.firstChild);
    while (this.adm2LabelLayer.firstChild) this.adm2LabelLayer.removeChild(this.adm2LabelLayer.firstChild);
    while (this.legendLayer.firstChild) this.legendLayer.removeChild(this.legendLayer.firstChild);
    this.overlay.innerHTML = `<div class="adm-landing"><strong>ADM Choropleth + Bubble Map</strong><p>${escapeHtml(message)}</p></div>`;
  }

  private resolveCountry(prepared: PreparedDataView): string | null {
    const dropdownValue = (this.settings.general.selectedCountry.value as any)?.value as string | undefined;
    const value = (dropdownValue || "").trim();
    if (value === "custom") return "CUSTOM";
    if (value && value.toLowerCase() !== "auto") return value.toUpperCase();
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

    const sums = new Map<string, { color: number | null; bubble: number | null; glyph: number[]; sample: AreaDatum }>();
    for (const a of prepared.areas.values()) {
      let key: string | null;
      if (a.level === 1) {
        key = a.pcode;
      } else {
        key = a.parentPcode || childToParent.get(a.pcode) || null;
      }
      if (!key) continue;
      if (!sums.has(key)) sums.set(key, { color: null, bubble: null, glyph: [], sample: a });
      const acc = sums.get(key)!;
      if (a.colorValue != null) acc.color = (acc.color ?? 0) + a.colorValue;
      if (a.bubbleSize != null) acc.bubble = (acc.bubble ?? 0) + a.bubbleSize;
      // Sum glyph categories index-wise so the rolled-up Admin1 carries the
      // same number of segments as the source Admin2 areas.
      for (let i = 0; i < (a.glyphValues?.length || 0); i++) {
        acc.glyph[i] = (acc.glyph[i] || 0) + (a.glyphValues[i] || 0);
      }
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
        glyphValues: acc.glyph,
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
    this.viewportW = width;
    this.viewportH = height;
    this.renderTopBar(view);
    this.renderSecondaryControls();
    this.applyZoom();

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

    // In drill view, dim the neighbour Admin1 borders so the focused state
    // reads as the foreground. The drilled state's border keeps the user's
    // configured opacity; everyone else drops to 0.35.
    if (this.drilledStatePcode && view === "localities") {
      d3.select(this.adm1Layer).selectAll<SVGPathElement, any>("path")
        .attr("stroke-opacity", (d: any) => {
          if (!d || d.pcode === this.drilledStatePcode) return this.settings.borders.stateOpacity.value;
          return Math.min(this.settings.borders.stateOpacity.value, 0.35);
        });
    }

    // Glyph charts (pie / donut / column on top of choropleth+bubbles)
    const glyphStyle = this.settings.glyphChart;
    const glyphResult = renderGlyphs(
      this.glyphLayer,
      projection,
      view === "localities" ? adm2Visible : adm1Visible,
      lookup,
      pcodeKey as any,
      {
        show: glyphStyle.show.value,
        type: (glyphStyle.type.value as any).value as GlyphType,
        minSize: glyphStyle.minSize.value,
        maxSize: glyphStyle.maxSize.value,
        scaleByTotal: glyphStyle.scaleByTotal.value,
        stroke: glyphStyle.stroke.value.value,
        strokeWidth: glyphStyle.strokeWidth.value,
        opacity: glyphStyle.opacity.value,
        donutInnerRatio: glyphStyle.donutInnerRatio.value,
        colors: [
          glyphStyle.color1.value.value,
          glyphStyle.color2.value.value,
          glyphStyle.color3.value.value,
          glyphStyle.color4.value.value,
          glyphStyle.color5.value.value,
          glyphStyle.color6.value.value,
          glyphStyle.color7.value.value,
          glyphStyle.color8.value.value
        ]
      }
    );

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
    // Label-position overrides. Glyph charts win over bubbles when both
    // are shown — the glyph is typically the larger / more important
    // visual element so labels should sit relative to it. Bubbles are
    // the fallback when only bubbles are bound.
    const bubblePlacement = (this.settings.bubbles.labelPlacement.value as any).value as string;
    const glyphPlacement = (glyphStyle.labelPlacement.value as any).value as string;
    const labelOverrides = glyphResult && glyphResult.anchors.size
      ? this.buildGlyphLabelOverrides(glyphResult, glyphPlacement, this.settings.stateLabels.fontSize.value)
      : (bubbleResult ? this.buildBubbleLabelOverrides(bubbleResult, bubblePlacement, this.settings.stateLabels.fontSize.value) : undefined);
    const activeLocalityCard = this.drilledStatePcode ? this.settings.drillLocalityLabels : this.settings.localityLabels;
    const localityOverrides = view === "localities"
      ? (glyphResult && glyphResult.anchors.size
          ? this.buildGlyphLabelOverrides(glyphResult, glyphPlacement, activeLocalityCard.fontSize.value)
          : (bubbleResult ? this.buildBubbleLabelOverrides(bubbleResult, bubblePlacement, activeLocalityCard.fontSize.value) : undefined))
      : undefined;

    while (this.adm1LabelLayer.firstChild) this.adm1LabelLayer.removeChild(this.adm1LabelLayer.firstChild);
    if (this.settings.stateLabels.show.value) {
      const isDrill = !!this.drilledStatePcode && view === "localities";

      // Neighbour labels go into a sub-group so we can dim them as a unit
      // in drill view (30% opacity) without dimming the title pill, which
      // is rendered into adm1LabelLayer directly afterward.
      const neighborGroup = svgEl("g", { class: "adm1-neighbor-labels" });
      this.adm1LabelLayer.appendChild(neighborGroup);
      // Neighbour labels in drill view dim to 0.55 — readable enough as
      // context, but clearly subordinate to the focused state's labels.
      if (isDrill) neighborGroup.setAttribute("opacity", "0.55");

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
            value2: datum?.labelValue2 ?? null,
            bubbleValue: datum?.bubbleSize ?? null
          };
        });
        // In drill view, force neighbour labels to stay inside their own
        // polygon. If even the smallest size doesn't fit, drop the label
        // entirely rather than letting it spill onto the focused state.
        const baseStyle = this.styleFromCard(this.settings.stateLabels);
        const neighborStyle = isDrill
          ? { ...baseStyle, allowOverrun: false, hideOnOverflow: true }
          : baseStyle;
        renderLabels(neighborGroup, projection, path, labels, neighborStyle, view === "states" ? labelOverrides : undefined);
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
          value2: datum?.labelValue2 ?? null,
          bubbleValue: datum?.bubbleSize ?? null
        };
      });
      renderLabels(this.adm2LabelLayer, projection, path, labels, this.styleFromCard(localityCard), localityOverrides);
    } else {
      while (this.adm2LabelLayer.firstChild) this.adm2LabelLayer.removeChild(this.adm2LabelLayer.firstChild);
    }

    // Legends
    const valueLegend = this.settings.valueLegend;
    const bubbleLegend = this.settings.bubbleLegend;
    const glyphLegend = this.settings.glyphLegend;
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
      glyph: glyphLegend.show.value && glyphStyle.show.value && prepared.glyphColumns.length ? {
        title: glyphLegend.title.value || "Categories",
        items: prepared.glyphColumns.map((c, i) => ({
          label: c.displayName,
          color: [
            glyphStyle.color1.value.value,
            glyphStyle.color2.value.value,
            glyphStyle.color3.value.value,
            glyphStyle.color4.value.value,
            glyphStyle.color5.value.value,
            glyphStyle.color6.value.value,
            glyphStyle.color7.value.value,
            glyphStyle.color8.value.value
          ][i % 8]
        })),
        orientation: (glyphLegend.orientation.value as any).value,
        position: (glyphLegend.position.value as any).value,
        size: (glyphLegend.size.value as any).value
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
        size: (bubbleLegend.size.value as any).value,
        orientation: (bubbleLegend.orientation.value as any).value,
        scale: bubbleResult.scale
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
    // Same priority as the on-polygon labels:
    //   value2 (Label Value 2)      -> single line, valueColor
    //   else choropleth -> single line, valueColor
    //   else bubble     -> single line, bubbleValueColor
    //   else both       -> two lines (color value, then bubble value)
    const valueColor = card.valueColor.value.value;
    const bubbleValueColor = card.bubbleValueColor?.value?.value || "#e6550d";
    const source: string = (card.valueSource?.value as any)?.value || "choropleth";
    const numericLines: { text: string; kind: "value" }[] = [];
    type NumericPair = { text: string; color: string };
    const numericRows: NumericPair[] = [];
    if (datum?.labelValue2 != null) {
      numericRows.push({ text: this.fmt(datum.labelValue2, fmtCard), color: valueColor });
    } else if (source === "bubble") {
      if (datum?.bubbleSize != null) numericRows.push({ text: this.fmt(datum.bubbleSize, fmtCard), color: bubbleValueColor });
    } else if (source === "both") {
      if (datum?.colorValue != null) numericRows.push({ text: this.fmt(datum.colorValue, fmtCard), color: valueColor });
      if (datum?.bubbleSize != null) numericRows.push({ text: this.fmt(datum.bubbleSize, fmtCard), color: bubbleValueColor });
    } else {
      if (datum?.colorValue != null) numericRows.push({ text: this.fmt(datum.colorValue, fmtCard), color: valueColor });
    }

    type HeaderLine = { text: string; kind: "name" | "value"; color: string };
    const headerLines: HeaderLine[] = [];
    if (content === "value") {
      for (const r of numericRows) headerLines.push({ text: r.text, kind: "value", color: r.color });
    } else if (content === "name") {
      if (name) headerLines.push({ text: name, kind: "name", color: card.color.value.value });
    } else {
      if (name) headerLines.push({ text: name, kind: "name", color: card.color.value.value });
      for (const r of numericRows) headerLines.push({ text: r.text, kind: "value", color: r.color });
    }
    if (!headerLines.length) return;
    // Map onto the existing pill-render loop below by writing into `lines`.
    for (const hl of headerLines) lines.push({ text: hl.text, kind: hl.kind } as any);
    // Override colors per-line by stashing them on the lines array; the
    // render loop below reads card.valueColor / card.color uniformly so
    // we replicate it here with per-row colors instead of the loop's
    // fixed lookup. We do this by storing colors in a parallel array.
    const lineColors = headerLines.map((hl) => hl.color);
    (lines as any).__colors = lineColors;

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
      // Per-line color picked above (handles choropleth-vs-bubble palette).
      const perLineColor = (lines as any).__colors?.[i] as string | undefined;
      t.setAttribute("fill", perLineColor || (lines[i].kind === "value" ? card.valueColor.value.value : card.color.value.value));
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
   * Same idea as buildBubbleLabelOverrides but uses the glyph chart's
   * anchors and the Glyph chart > "Label position vs glyph" setting.
   */
  private buildGlyphLabelOverrides(glyphResult: { anchors: Map<string, { x: number; y: number; size: number; values: number[] }> }, placement: string, fontSize: number): Map<string, LabelAnchorOverride> {
    const out = new Map<string, LabelAnchorOverride>();
    const padding = 4;
    const lineHeight = fontSize * 1.15;
    const horizontalGap = 36;
    for (const [pcode, anchor] of glyphResult.anchors) {
      let x = anchor.x;
      let y = anchor.y;
      switch (placement) {
        case "below":
          y = anchor.y + anchor.size + lineHeight / 2 + padding;
          break;
        case "left":
          x = anchor.x - anchor.size - horizontalGap - padding;
          break;
        case "right":
          x = anchor.x + anchor.size + horizontalGap + padding;
          break;
        case "center":
          break;
        case "above":
        default:
          y = anchor.y - anchor.size - lineHeight / 2 - padding;
          break;
      }
      out.set(pcode, { x, y });
    }
    return out;
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
        // Remember the user opted out so the same filter context doesn't
        // immediately re-drill back in. Cleared automatically when the
        // filter changes (i.e. would now infer a different pcode or none).
        if (this.drilledStatePcode) {
          this.suppressedFilterDrill = this.drilledStatePcode;
        }
        this.drilledStatePcode = null;
        // Also clear any active host selection so other visuals stop
        // filtering by the state we just left.
        this.selectionManager.clear();
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
          // Cross-filter other visuals to the new Admin1 the same way a
          // click on the polygon would, then drill there. The selection
          // becomes the filter, and the next update reconciles drill from
          // the filter — so any later slicer change in another visual
          // will move us along too.
          this.applyAdmin1Selection(target, false);
          this.drilledStatePcode = target;
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

  }

  /**
   * Floating panel of secondary controls (zoom in / out, copy to
   * clipboard). Shown / hidden and positioned per the Controls settings
   * card. Lives in its own overlay group so it never interferes with the
   * drill-context bar at the top-left.
   */
  private renderSecondaryControls(): void {
    let panel = this.overlay.querySelector(".adm-controls") as HTMLDivElement;
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "adm-controls";
      this.overlay.appendChild(panel);
    } else {
      while (panel.firstChild) panel.removeChild(panel.firstChild);
    }

    const cs = this.settings.controls;
    panel.dataset.position = (cs.position.value as any).value;

    if (cs.showZoom.value) {
      const mkZoom = (delta: number, glyph: string, label: string) => {
        const b = document.createElement("button");
        b.className = "adm-zoom-button";
        b.type = "button";
        b.setAttribute("aria-label", label);
        b.title = label;
        b.innerHTML = glyph;
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          const next = Math.max(1, Math.min(8, this.zoomLevel * (delta > 0 ? 1.25 : 1 / 1.25)));
          this.zoomLevel = next;
          this.applyZoom();
        });
        return b;
      };
      panel.appendChild(mkZoom(+1, "+", "Zoom in"));
      panel.appendChild(mkZoom(-1, "&#8722;", "Zoom out"));
      // Reset zoom button only appears once the user has zoomed in.
      if (this.zoomLevel > 1.001) {
        const reset = document.createElement("button");
        reset.className = "adm-zoom-button adm-zoom-reset";
        reset.type = "button";
        reset.setAttribute("aria-label", "Reset zoom");
        reset.title = "Reset zoom";
        reset.innerHTML = "&#8634;";
        reset.addEventListener("click", (e) => {
          e.stopPropagation();
          this.zoomLevel = 1;
          this.applyZoom();
        });
        panel.appendChild(reset);
      }
    }

    if (cs.showCopy.value) {
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
      panel.appendChild(exportBtn);
      this.exportButton = exportBtn;
    } else {
      this.exportButton = null;
    }

    if (!panel.children.length) panel.style.display = "none";
    else panel.style.display = "";
  }

  /**
   * Apply the current zoom level to the map content. We zoom around the
   * centre of the viewport so everything stays framed sensibly. Legends
   * are NOT zoomed — they live in a separate top-level group.
   */
  private applyZoom(): void {
    const z = this.zoomLevel;
    const cx = this.viewportW / 2;
    const cy = this.viewportH / 2;
    this.mapGroup.setAttribute("transform", `translate(${cx},${cy}) scale(${z}) translate(${-cx},${-cy})`);
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
      bubbleValueColor: card.bubbleValueColor?.value?.value || "#e6550d",
      valueSource: (card.valueSource?.value as any)?.value || "choropleth",
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

/**
 * Parse a TopoJSON or GeoJSON string into a FeatureCollection. Returns
 * null if the structure is unrecognised.
 *
 * TopoJSON: extract the first GeometryCollection in `objects` (preferring
 * adm1/adm2/admin1/admin2 names) via topojson-client.
 * GeoJSON FeatureCollection: returned as-is.
 */
function parseUploadedShape(raw: string): any | null {
  if (!raw) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed?.type === "Topology" && parsed.objects) {
    const tjc = require("topojson-client");
    const preferred = ["adm1", "adm2", "ADM1", "ADM2", "admin1", "admin2"];
    let key = preferred.find((k) => parsed.objects[k]) ||
              Object.keys(parsed.objects).find((k) => parsed.objects[k]?.geometries?.length);
    if (!key) return null;
    return tjc.feature(parsed, parsed.objects[key]);
  }
  if (parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)) {
    return parsed;
  }
  if (parsed?.type === "Feature") {
    return { type: "FeatureCollection", features: [parsed] };
  }
  return null;
}

/** Collect every distinct property name across the file's features. */
function collectPropertyNames(parsed: any): string[] {
  const fc = parseUploadedShapeFromObject(parsed);
  if (!fc) return [];
  const seen = new Set<string>();
  for (const f of fc.features as any[]) {
    if (!f.properties) continue;
    for (const k of Object.keys(f.properties)) seen.add(k);
  }
  return Array.from(seen).sort();
}

function parseUploadedShapeFromObject(parsed: any): any | null {
  if (!parsed) return null;
  if (parsed.type === "Topology" && parsed.objects) {
    const tjc = require("topojson-client");
    const preferred = ["adm1", "adm2", "ADM1", "ADM2", "admin1", "admin2"];
    const key = preferred.find((k) => parsed.objects[k]) ||
                Object.keys(parsed.objects).find((k) => parsed.objects[k]?.geometries?.length);
    if (!key) return null;
    return tjc.feature(parsed, parsed.objects[key]);
  }
  if (parsed.type === "FeatureCollection") return parsed;
  if (parsed.type === "Feature") return { type: "FeatureCollection", features: [parsed] };
  return null;
}

/**
 * Heuristically pick a property name for one of the four mapping roles.
 * Used to pre-fill the mapping dropdowns; the user can always override.
 */
function guessPropertyName(props: Record<string, any>, role: "adm1Pcode" | "adm1Name" | "adm2Pcode" | "adm2Name"): string {
  return guessFromList(Object.keys(props), role);
}

function guessFromList(names: string[], role: "adm1Pcode" | "adm1Name" | "adm2Pcode" | "adm2Name"): string {
  const patterns: Record<typeof role, RegExp[]> = {
    adm1Pcode: [/^adm1[_]?pcode$/i, /^pcode[_]?1$/i, /^adm1[_]?code$/i, /^admin1[_]?code$/i, /^gid[_]?1$/i, /^iso[_]?1$/i],
    adm1Name: [/^adm1[_]?en$/i, /^name[_]?1$/i, /^adm1[_]?name$/i, /^admin1[_]?name$/i, /^state[_]?name$/i, /^region$/i],
    adm2Pcode: [/^adm2[_]?pcode$/i, /^pcode[_]?2$/i, /^adm2[_]?code$/i, /^admin2[_]?code$/i, /^gid[_]?2$/i],
    adm2Name: [/^adm2[_]?en$/i, /^name[_]?2$/i, /^adm2[_]?name$/i, /^admin2[_]?name$/i, /^locality[_]?name$/i, /^district$/i]
  };
  for (const re of patterns[role]) {
    const hit = names.find((n) => re.test(n));
    if (hit) return hit;
  }
  return "";
}

function selectHtml(role: string, options: string[], current: string): string {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const opts = ['<option value="">(pick a field)</option>']
    .concat(options.map((o) => `<option value="${escape(o)}"${o === current ? " selected" : ""}>${escape(o)}</option>`))
    .join("");
  return `<select data-role="${role}">${opts}</select>`;
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


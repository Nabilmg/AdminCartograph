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
import { renderBubbles, updateBubbleTransforms } from "./render/bubbles";
import { renderGlyphs, updateGlyphTransforms, GlyphType } from "./render/glyphs";
import { renderLabels, updateLabelTransforms, largestProjectedOuterRing, LabelDatum, LabelAnchorOverride } from "./render/labels";
import { pickAnchor, pickAnchorTowardPoint } from "./render/labelPlacement";
import type { BubbleResult } from "./render/bubbles";
import { renderLegends } from "./render/legend";
import { renderScaleBar } from "./render/scaleBar";
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
  /** Soft halo behind every other map layer. Toggled via the borders
   *  card's "Country outer glow" setting. */
  private glowLayer: SVGGElement;
  /** Drill title pill ("Country View" sub-header). Sits OUTSIDE
   *  mapGroup so the zoom / pan transform doesn't move it — it stays
   *  glued to the top-left in screen space at every zoom level. */
  private pillLayer: SVGGElement;
  private adm1Layer: SVGGElement;
  private adm2Layer: SVGGElement;
  private bubbleLayer: SVGGElement;
  private glyphLayer: SVGGElement;
  private adm1LabelLayer: SVGGElement;
  private adm2LabelLayer: SVGGElement;
  private legendLayer: SVGGElement;
  private scaleBarLayer: SVGGElement;
  /** Set by renderMap; called from applyZoom so the scale bar updates
   *  live as the user zooms without re-running renderMap. */
  private rerenderScaleBar: (() => void) | null = null;
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
  /** Pcode of an Admin1 the user explicitly drilled into via click /
   *  prev / next. Distinct from drilledStatePcode so updates that have
   *  nothing to do with the filter (format-pane edits, viewport resize)
   *  don't collapse the user's manual drill. Cleared by the back button,
   *  switching view mode away from Auto, or being overridden by a
   *  contradictory filter. */
  private manualDrillPcode: string | null = null;
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
  // (Export buttons used to live here; now created on-demand inside the
  // controls panel so we don't need a long-lived reference.)
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
  /** Pan offset in screen pixels — added to the zoom transform so the
   *  user can drag the map around when zoomed in. */
  private panX = 0;
  private panY = 0;
  /** Cached width/height for the zoom transform. */
  private viewportW = 0;
  private viewportH = 0;
  /** Drag state for mouse pan. didDrag is consulted by handleMapClick
   *  so the click that ends a drag doesn't trigger a drill. */
  private dragState: { startX: number; startY: number; basePanX: number; basePanY: number } | null = null;
  private didDrag = false;

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
    this.scaleBarLayer = svgEl("g", { class: "scale-bar-layer" });
    this.glowLayer = svgEl("g", { class: "country-glow-layer" });
    this.pillLayer = svgEl("g", { class: "drill-pill-layer" });
    // Order (bottom -> top):
    //   adm2 (locality fills + borders)
    //   adm1 (Admin1 fills in Admin1 view, or just borders in drill view)
    //   bubbles (always above choropleth)
    //   glyphs (pie / donut / column charts on top of bubbles)
    //   adm2 labels
    //   adm1 labels (always on top)
    // Glow first so it sits behind everything else inside mapGroup.
    this.mapGroup.appendChild(this.glowLayer);
    this.mapGroup.appendChild(this.adm2Layer);
    this.mapGroup.appendChild(this.adm1Layer);
    this.mapGroup.appendChild(this.bubbleLayer);
    this.mapGroup.appendChild(this.glyphLayer);
    this.mapGroup.appendChild(this.adm2LabelLayer);
    this.mapGroup.appendChild(this.adm1LabelLayer);
    // Scale bar before legend in the SVG tree so the legend renders on
    // top in z-order. With the scale bar flush against its corner and
    // the legend stacked above, legends overlapping the bar would
    // otherwise be partially hidden.
    this.svg.appendChild(this.scaleBarLayer);
    this.svg.appendChild(this.legendLayer);
    // Pill last so it draws on top of legend / scale bar in z-order
    // (it's rare for them to share screen space, but defensive).
    this.svg.appendChild(this.pillLayer);

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

    // Mouse drag pan + wheel zoom. Only active when zoomed in. didDrag
    // is checked by handleMapClick so a drag-then-release doesn't drill.
    this.svg.addEventListener("mousedown", (e: MouseEvent) => {
      if (this.zoomLevel <= 1) return;
      this.dragState = { startX: e.clientX, startY: e.clientY, basePanX: this.panX, basePanY: this.panY };
      this.didDrag = false;
      this.svg.style.cursor = "grabbing";
    });
    window.addEventListener("mousemove", (e: MouseEvent) => {
      if (!this.dragState) return;
      const dx = e.clientX - this.dragState.startX;
      const dy = e.clientY - this.dragState.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.didDrag = true;
      this.panX = this.dragState.basePanX + dx;
      this.panY = this.dragState.basePanY + dy;
      this.applyZoom();
    });
    window.addEventListener("mouseup", () => {
      if (!this.dragState) return;
      this.dragState = null;
      this.svg.style.cursor = "";
    });
    // Mouse wheel zooms in/out around the cursor. preventDefault stops
    // the page (Power BI report) from scrolling when the user wheels
    // over the visual.
    this.svg.addEventListener("wheel", (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.setZoom(this.zoomLevel * factor);
    }, { passive: false });
  }

  /** Pan the map by one button step in the requested direction. The
   *  step scales with the viewport so it feels consistent across visual
   *  sizes and tightens at higher zoom (where each px covers less
   *  ground). Always usable, even at zoom=1, in case the user wants to
   *  shift the framing slightly. */
  private panBy(direction: "up" | "down" | "left" | "right"): void {
    const base = Math.max(60, Math.min(this.viewportW, this.viewportH) * 0.18);
    const step = base / Math.max(1, this.zoomLevel * 0.6);
    if (direction === "up") this.panY += step;
    else if (direction === "down") this.panY -= step;
    else if (direction === "left") this.panX += step;
    else if (direction === "right") this.panX -= step;
    this.applyZoom();
    this.renderSecondaryControls();
  }

  /** Adjust zoom level, clamping to [1, 8] and snapping pan to 0 when
   *  fully zoomed out so the map stays centred. */
  private setZoom(z: number): void {
    const clamped = Math.max(1, Math.min(8, z));
    if (clamped <= 1.001) {
      this.panX = 0;
      this.panY = 0;
    }
    this.zoomLevel = clamped;
    this.applyZoom();
    // Re-render the secondary controls so the Reset button toggles
    // visibility correctly.
    this.renderSecondaryControls();
  }

  /**
   * Single click handler for every adm1 / adm2 path. Reads the current view
   * mode from the cached prepared data view and decides whether to drill,
   * cross-filter or no-op.
   */
  private handleMapClick(e: MouseEvent): void {
    if (!this.settings?.general?.interactionEnabled.value) return;
    if (!this.cached) return;
    // Suppress the click that ends a pan drag — the user was dragging
    // the map, not selecting an Admin1.
    if (this.didDrag) {
      this.didDrag = false;
      e.stopPropagation();
      return;
    }
    const node = (e.target as Element)?.closest?.("[data-pcode]") as SVGElement | null;
    if (!node) {
      // Click on the map background (no polygon under cursor): clear
      // any cross-filter the user previously triggered. Matches the
      // standard PBI "click outside to deselect" pattern.
      e.stopPropagation();
      const current = this.selectionManager.getSelectionIds() as powerbi.extensibility.ISelectionId[];
      if (current && current.length) {
        this.selectionManager.clear();
        this.refreshSelectionStyles();
      }
      return;
    }
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
      //   2. drill into the Admin1's children — but only when there's
      //      something at Admin2 level to drill into. If the user only
      //      bound Admin1 PCODE, or the country has no Admin2 geometry,
      //      a drill would show empty Admin2 polygons. We just stay in
      //      the Admin1 view in that case and only cross-filter.
      this.applyAdmin1Selection(pcode, (e as any).ctrlKey || (e as any).metaKey);
      const canDrill = !!this.cached.country.adm2 && this.cached.prepared.hasLocalityBinding;
      if (canDrill) {
        this.drilledStatePcode = pcode;
        this.manualDrillPcode = pcode;
        this.suppressedFilterDrill = null;
      }
      this.rerender();
      return;
    }
    if (view === "localities" && isAdm2) {
      const datum = this.cached.prepared.areas.get(pcode);
      if (datum) {
        const multi = (e as any).ctrlKey || (e as any).metaKey;
        const current = this.selectionManager.getSelectionIds() as powerbi.extensibility.ISelectionId[];
        // Re-clicking the same Admin2 with no modifier toggles the
        // selection off (PBI's select() without multiSelect is a
        // replace, so a re-click would otherwise leave the filter
        // stuck).
        const isOnlySelected = !multi
          && current && current.length === 1
          && typeof (current[0] as any).equals === "function"
          && (current[0] as any).equals(datum.selectionId);
        if (isOnlySelected) {
          this.selectionManager.clear();
        } else {
          this.selectionManager.select(datum.selectionId, multi);
        }
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
      // Two distinct failure modes share this branch — pick the
      // message that matches what the user actually did. If they
      // have something bound but auto-detection still failed, the
      // PCODEs don't start with one of the bundled ISO3 prefixes
      // (AFG, COD, HTI, IRN, LBN, SDN, SYR, YEM); they need to set
      // the country explicitly or upload custom geometry.
      const adm1Alias = (this.settings?.general?.admin1Alias?.value || "").trim() || "Admin1";
      const adm2Alias = (this.settings?.general?.admin2Alias?.value || "").trim() || "Admin2";
      const hasBinding = prepared.hasStateBinding || prepared.hasLocalityBinding;
      this.renderLandingPage(
        hasBinding
          ? `Couldn't auto-detect a country from your PCODE prefix. Open the format pane → 1. Map setup → Country and pick the right country, or choose Custom (upload TopoJSON) to bring your own geometry.`
          : `Drag a PCODE column into ${adm1Alias} PCODE (or ${adm2Alias} PCODE). The Country dropdown in 1. Map setup defaults to Auto and infers the right country from the PCODE prefix.`
      );
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
      this.manualDrillPcode = null;
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
    // Filter context wins outright when present and not the suppressed
    // pcode: a slicer in another visual moves the drill, regardless of
    // whether the user's last action was a manual click. A manual drill
    // is also overridden if the filter narrowed to a *different* Admin1.
    if (inferred && inferred !== this.suppressedFilterDrill) {
      if (this.manualDrillPcode && this.manualDrillPcode !== inferred) {
        this.manualDrillPcode = null;
      }
      this.drilledStatePcode = inferred;
      return;
    }
    // No filter-implied drill. Manual drills (set by click / prev / next)
    // persist across update() calls that have nothing to do with the
    // filter (format-pane edits, resize) — clearing them on every update
    // was the bug that collapsed drill view when users tweaked formatting.
    if (this.manualDrillPcode) {
      this.drilledStatePcode = this.manualDrillPcode;
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
    // No drill possible without Admin2 geometry, or without any data at
    // Admin2 level: drilling into a state with no locality bindings just
    // produces blank polygons. Stay in Admin1 view in those cases.
    if (!country.adm2) return null;
    if (!prepared.hasLocalityBinding) return null;
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
      <strong>AdminCartograph — Custom map data</strong>
      <p style="margin:4px 0 12px">Upload TopoJSON or GeoJSON for Admin1 (required) and Admin2 (optional).</p>

      <div class="row">
        <span class="adm-row-label">Admin1 file:</span>
        <label class="adm-secondary adm-file-label" tabindex="0">
          ${draft.adm1Filename ? "Change file…" : "Choose file…"}
          <input type="file" data-pick="adm1" accept=".json,.topojson,.geojson,application/json,application/geo+json" style="position:absolute;left:-9999px;width:1px;height:1px">
        </label>
        <span class="adm-filename">${draft.adm1Filename || "(none)"}</span>
      </div>
      <div class="row">
        <span class="adm-row-label">Admin2 file:</span>
        <label class="adm-secondary adm-file-label" tabindex="0">
          ${draft.adm2Filename ? "Change file…" : "Choose file…"}
          <input type="file" data-pick="adm2" accept=".json,.topojson,.geojson,application/json,application/geo+json" style="position:absolute;left:-9999px;width:1px;height:1px">
        </label>
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
      <p style="font-size:11px;color:#666;margin-top:4px">AdminCartograph &middot; <a href="https://github.com/nabilaljarmozi/AdminCartograph" target="_blank" rel="noopener noreferrer" style="color:#1f6feb;text-decoration:none">github.com/nabilaljarmozi/AdminCartograph</a></p>
    `;
    // File pickers: <label> wraps the hidden <input type="file"> so the
    // native click event opens the OS file dialog. No JS .click() needed —
    // works in every Power BI host (Service / Desktop / web embed) without
    // running into sandbox quirks.
    card.querySelectorAll<HTMLInputElement>('input[type="file"][data-pick]').forEach((inp) => {
      inp.addEventListener("change", () => this.handleCustomFileInput(inp, card));
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

  /** Handle a file selected via one of the inline <input type="file"> elements. */
  private handleCustomFileInput(input: HTMLInputElement, card: HTMLDivElement): void {
    const slot = input.dataset.pick as "adm1" | "adm2";
    const file = input.files && input.files[0];
    if (!file) return;
    const errSpan = card.querySelector(".adm-error") as HTMLElement | null;
    if (errSpan) errSpan.textContent = "";
    const reader = new FileReader();
    reader.onerror = () => {
      if (errSpan) errSpan.textContent = "Could not read file.";
    };
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
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
        if (errSpan) errSpan.textContent = `Invalid file: ${(e as any)?.message || "parse error"}`;
      }
    };
    reader.readAsText(file);
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
    this.overlay.innerHTML = `<div class="adm-landing"><strong>AdminCartograph</strong><p>${escapeHtml(message)}</p><p style="font-size:11px;color:#666;margin-top:8px"><a href="https://github.com/nabilaljarmozi/AdminCartograph" target="_blank" rel="noopener noreferrer" style="color:#1f6feb;text-decoration:none">github.com/nabilaljarmozi/AdminCartograph</a></p></div>`;
  }

  /**
   * On-canvas banner shown when bindings exist but no PCODE matches
   * the country's geometry. Appears at the bottom-centre so it doesn't
   * block legends in the corners. Click to dismiss.
   */
  private renderPcodeMismatchBanner(sampleData: string, sampleGeo: string, pcodeKey: string): void {
    let el = this.overlay.querySelector(".adm-pcode-mismatch") as HTMLDivElement | null;
    if (!el) {
      el = document.createElement("div");
      el.className = "adm-pcode-mismatch";
      el.style.cssText = "position:absolute;left:50%;bottom:12px;transform:translateX(-50%);max-width:80%;padding:10px 14px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;color:#7c2d12;font-size:12px;line-height:1.4;box-shadow:0 2px 8px rgba(0,0,0,.08);cursor:pointer;z-index:5";
      el.title = "Click to dismiss";
      el.addEventListener("click", () => el && el.remove());
      this.overlay.appendChild(el);
    }
    el.innerHTML =
      `<strong>No PCODE matches.</strong> Your bound ${escapeHtml(pcodeKey === "ADM2_PCODE" ? "Admin2" : "Admin1")} PCODE values don't line up with the country's geometry. ` +
      `<br><span style="font-family:monospace;color:#9a3412">Data sample:</span> [${escapeHtml(sampleData || "(empty)")}] ` +
      `<br><span style="font-family:monospace;color:#9a3412">Geometry sample:</span> [${escapeHtml(sampleGeo || "(empty)")}] ` +
      `<br>Check the Country dropdown matches your data, or upload custom geometry whose ${escapeHtml(pcodeKey)} field uses the same format. <em>(Click to dismiss.)</em>`;
  }

  private clearPcodeMismatchBanner(): void {
    const el = this.overlay.querySelector(".adm-pcode-mismatch");
    if (el) el.remove();
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
    // Hard rule: when only Admin1 PCODE is bound (no Admin2 binding),
    // the visual stays a flat Admin1 choropleth — no drill, no
    // Admin2 view, even if the View Mode dropdown says "Admin2" or
    // the country has Admin2 geometry. Drill / Admin2 layout has
    // nothing per-area to render in this case.
    if (!prepared.hasLocalityBinding) return "states";

    const setting = (this.settings.general.viewMode.value as any).value as ViewMode;
    if (setting === "states") return "states";
    if (setting === "localities") return country.adm2 ? "localities" : "states";

    // Auto: ALWAYS start at Admin1. Drill into Admin2 only when:
    //   - the country has Admin2 geometry, AND
    //   - either the user clicked an Admin1 (drilledStatePcode set), OR
    //     the filter context implies a single-Admin1 focus AND Admin2
    //     data is bound (handled in applyFilterDrill).
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

    const sums = new Map<string, { color: number | null; bubble: number | null; label2: number | null; glyph: number[]; rawTally: Map<string, number>; labelText: string | null; sample: AreaDatum }>();
    for (const a of prepared.areas.values()) {
      let key: string | null;
      if (a.level === 1) {
        key = a.pcode;
      } else {
        key = a.parentPcode || childToParent.get(a.pcode) || null;
      }
      if (!key) continue;
      if (!sums.has(key)) sums.set(key, { color: null, bubble: null, label2: null, glyph: [], rawTally: new Map(), labelText: null, sample: a });
      const acc = sums.get(key)!;
      if (a.colorValue != null) acc.color = (acc.color ?? 0) + a.colorValue;
      if (a.bubbleSize != null) acc.bubble = (acc.bubble ?? 0) + a.bubbleSize;
      if (a.labelValue2 != null) acc.label2 = (acc.label2 ?? 0) + a.labelValue2;
      // First non-empty Label Text 1 value across this state's child
      // rows wins. In typical datasets the Admin1 alias is duplicated
      // across every Admin2 row of a state, so 'first wins' is stable
      // and predictable. If a state has multiple distinct overrides,
      // the user can bind Admin1 PCODE directly to disambiguate.
      if (!acc.labelText && a.labelText1) acc.labelText = a.labelText1;
      // For categorical mode: tally each child's raw category value so
      // the rolled-up Admin1 can adopt the mode (most-common category).
      if (a.colorValueRaw != null && a.colorValueRaw !== "") {
        const k = String(a.colorValueRaw);
        acc.rawTally.set(k, (acc.rawTally.get(k) || 0) + 1);
      }
      // Sum glyph categories index-wise so the rolled-up Admin1 carries the
      // same number of segments as the source Admin2 areas.
      for (let i = 0; i < (a.glyphValues?.length || 0); i++) {
        acc.glyph[i] = (acc.glyph[i] || 0) + (a.glyphValues[i] || 0);
      }
    }

    const modeOf = (m: Map<string, number>): string | null => {
      let best: string | null = null;
      let bestN = 0;
      m.forEach((n, k) => { if (n > bestN) { bestN = n; best = k; } });
      return best;
    };

    const out = new Map<string, AreaDatum>();
    for (const [pcode, acc] of sums) {
      out.set(pcode, {
        pcode,
        name: undefined,
        parentPcode: pcode,
        level: 1,
        colorValue: acc.color,
        // Categorical mode: roll up by taking the mode (most-common
        // category) of the child Admin2 rows. So a state whose
        // localities are mostly 'High' renders as High in the Auto-
        // mode Admin1 view. Ties are broken by first-seen order
        // (Map iteration preserves insertion).
        colorValueRaw: modeOf(acc.rawTally),
        bubbleSize: acc.bubble,
        glyphValues: acc.glyph,
        labelValue2: acc.label2,
        labelText1: acc.labelText,
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
    // PCODE-format-tolerant lookup. The geometry uses canonical
    // OCHA-style codes (e.g. "SD01"); the user's data column may
    // arrive in mixed case or with separators ("sd01", "SD-01",
    // "sd_01"). Build a normalised secondary index so we still
    // match those rows. Empty-suffix collisions are unlikely at
    // admin-code level.
    const normPcode = (s: string | undefined | null): string => (s == null ? "" : String(s).toUpperCase().replace(/[\s_\-]+/g, ""));
    const normalizedLookup = new Map<string, AreaDatum>();
    lookup.forEach((datum, key) => {
      const n = normPcode(key);
      if (n && !normalizedLookup.has(n)) normalizedLookup.set(n, datum);
    });
    const valuedFeatures = visibleFeatures.map((f) => {
      const raw = f.properties[pcodeKey];
      const datum = lookup.get(raw) || normalizedLookup.get(normPcode(raw));
      return { feature: f, datum };
    });
    // Diagnostic — warn when bindings exist but nothing matched. Common
    // cause: user's PCODE column uses a different convention than the
    // bundled geometry (e.g. numeric IDs against a string geometry,
    // or the wrong country was picked from the dropdown). Console
    // warning + an on-canvas banner overlay so the user knows why the
    // map renders empty / no-data instead of just seeing a grey fill.
    if (lookup.size > 0 && valuedFeatures.every((v) => !v.datum)) {
      const sampleData = Array.from(lookup.keys()).slice(0, 3).join(", ");
      const sampleGeo = visibleFeatures.slice(0, 3).map((f) => f.properties[pcodeKey]).filter(Boolean).join(", ");
      console.warn(`[AdminCartograph] No PCODE matches between your data and the country's geometry. Data sample: [${sampleData}]. Geometry sample: [${sampleGeo}]. Check the Country dropdown matches your data, or upload custom geometry whose ${pcodeKey} values use the same format.`);
      this.renderPcodeMismatchBanner(sampleData, sampleGeo, pcodeKey);
    } else {
      this.clearPcodeMismatchBanner();
    }
    const cs = this.settings.choropleth;
    const treatZeroAsBlank = cs.zeroAsBlank.value;
    // Helper: is this color value missing for choropleth purposes?
    // null/undefined are always blank; 0 is blank only when the user
    // opted in via Treat 0 as no-data.
    const isBlankValue = (v: number | null | undefined): boolean =>
      v == null || (treatZeroAsBlank && v === 0);

    const colorValues = valuedFeatures
      .map((v) => v.datum?.colorValue)
      .filter((v): v is number => !isBlankValue(v));

    const classification = (cs.classification.value as any).value;
    const breaks = buildBreaks(colorValues, classification, cs.classCount.value, cs.manualBreaks.value);
    const customColors = [cs.color1.value.value, cs.color2.value.value, cs.color3.value.value, cs.color4.value.value, cs.color5.value.value];
    const colors = (cs.mode.value as any).value === "custom"
      ? customColors.slice(0, breaks.classCount)
      : rampColors(cs.baseColor.value.value, breaks.classCount);

    const blank = cs.blankTransparent.value ? "transparent" : cs.blankColor.value.value;

    // Categorical mode: collect unique raw values from the bound
    // colorValueRaw column (in first-seen order, then natural-sort
    // with numeric awareness so 'Severity 1, 2, 10' comes out right),
    // assign colours by cycling through the 5 custom class colours.
    // Each polygon's fill = the colour for its category.
    let categoryColorMap: Map<string, string> | null = null;
    let categoricalClasses: { color: string; label: string }[] | null = null;
    if (classification === "categorical") {
      const seen = new Set<string>();
      const cats: string[] = [];
      for (const v of valuedFeatures) {
        const raw = v.datum?.colorValueRaw;
        if (raw == null || raw === "") continue;
        const key = String(raw);
        if (!seen.has(key)) { seen.add(key); cats.push(key); }
      }
      cats.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      categoryColorMap = new Map();
      categoricalClasses = cats.map((cat, i) => {
        const color = customColors[i % customColors.length];
        categoryColorMap!.set(cat, color);
        return { color, label: cat };
      });
    }

    // Choropleth rows
    const rows = valuedFeatures.map(({ feature, datum }) => {
      let fill: string;
      if (classification === "categorical") {
        const raw = datum?.colorValueRaw;
        const key = raw == null ? null : String(raw);
        fill = key && categoryColorMap?.has(key) ? categoryColorMap!.get(key)! : blank;
      } else {
        const v = datum?.colorValue;
        fill = !isBlankValue(v) ? colors[Math.min(colors.length - 1, classIndex(breaks.breaks, v as number))] : blank;
      }
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

    // Country outer glow (optional). A blurred copy of the country
    // outline behind every other map layer creates a soft halo that
    // extends slightly outside the country border. The choropleth
    // fills sit on top so the interior isn't tinted.
    while (this.glowLayer.firstChild) this.glowLayer.removeChild(this.glowLayer.firstChild);
    const glow = this.settings.borders;
    if (glow.countryGlowShow.value) {
      const radius = Math.max(0, glow.countryGlowRadius.value);
      const stdDev = Math.max(0.5, radius / 2);
      const filterId = `country-glow-${Math.random().toString(36).slice(2, 8)}`;
      const svgNS = "http://www.w3.org/2000/svg";
      const defs = document.createElementNS(svgNS, "defs");
      defs.innerHTML =
        `<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">` +
        `<feGaussianBlur stdDeviation="${stdDev}"/>` +
        `</filter>`;
      this.glowLayer.appendChild(defs);
      const fc = { type: "FeatureCollection", features: adm1Visible } as any;
      const d = path(fc) || "";
      const pth = document.createElementNS(svgNS, "path");
      pth.setAttribute("d", d);
      pth.setAttribute("fill", glow.countryGlowColor.value.value);
      pth.setAttribute("stroke", glow.countryGlowColor.value.value);
      pth.setAttribute("stroke-width", String(Math.max(2, radius / 2)));
      pth.setAttribute("filter", `url(#${filterId})`);
      pth.setAttribute("opacity", String(glow.countryGlowOpacity.value));
      pth.setAttribute("pointer-events", "none");
      this.glowLayer.appendChild(pth);
    }

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

    // Dim out-of-focus Admin1 borders so the in-focus states read as
    // foreground. Two trigger conditions in localities view:
    //   1. Drill view — focus = the drilled state.
    //   2. Partial filter — focus = the set of state PCODEs whose
    //      Admin2 children remain visible (works whether Admin1 was
    //      bound directly or derived from the Admin2 column).
    // Outside drill, the partial-filter case lights up only when at
    // least one but not all states remain — avoids flicker at the
    // initial unfiltered render.
    let focusedStatePcodes: Set<string> | null = null;
    if (view === "localities") {
      if (this.drilledStatePcode) {
        focusedStatePcodes = new Set([this.drilledStatePcode]);
      } else {
        const inFilter = new Set(
          (adm2Visible as any[])
            .map((f) => f.properties && f.properties.ADM1_PCODE)
            .filter(Boolean) as string[]
        );
        if (inFilter.size && inFilter.size < adm1Features.length) {
          focusedStatePcodes = inFilter;
        }
      }
    }
    if (focusedStatePcodes) {
      // Out-of-focus states are blanked with the visual's background
      // colour so the choropleth fill (and any overlays drawn into
      // adm2Layer outside the focus set, in case a future feature
      // adds them) doesn't bleed through. Falls back to white when
      // the visual background is transparent — solid white reads
      // cleanly against most report backgrounds.
      const bgFill = this.settings?.general?.transparentBackground?.value
        ? "#ffffff"
        : (this.settings?.general?.background?.value?.value || "#ffffff");
      d3.select(this.adm1Layer).selectAll<SVGPathElement, any>("path")
        .attr("stroke-opacity", (d: any) => {
          if (!d || focusedStatePcodes!.has(d.pcode)) return this.settings.borders.stateOpacity.value;
          return Math.min(this.settings.borders.stateOpacity.value, 0.35);
        })
        .attr("fill", function (d: any) {
          if (!d || focusedStatePcodes!.has(d.pcode)) return (this as SVGPathElement).getAttribute("fill") || "none";
          return bgFill;
        })
        .attr("fill-opacity", (d: any) => {
          if (!d || focusedStatePcodes!.has(d.pcode)) return null as any;
          return 1;
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
        ],
        constantSize: glyphStyle.constantSize?.value ?? true
      },
      this.zoomLevel
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
        maxRadius: bubbleStyle.maxRadius.value,
        constantSize: bubbleStyle.constantSize?.value ?? true
      },
      prepared.ruleColorsByPcode,
      this.zoomLevel
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
    while (this.pillLayer.firstChild) this.pillLayer.removeChild(this.pillLayer.firstChild);
    // Detect spatial enclaves so e.g. Pest megye's label sits in the
    // ring around Budapest rather than over Budapest itself. Computed
    // once per render and reused by both Admin1 and Admin2 label
    // passes below.
    const adm1VirtualHoles = this.buildVirtualHolesByPcode(adm1Visible, "ADM1_PCODE");
    const adm2VirtualHoles = this.buildVirtualHolesByPcode(adm2Visible, "ADM2_PCODE");
    if (this.settings.stateLabels.show.value) {
      const isDrill = !!this.drilledStatePcode && view === "localities";
      // Partial-filter mode reuses the drill dim treatment but keeps
      // the in-filter states' labels rendered (no title pill).
      const partialFilter = !isDrill && !!focusedStatePcodes;

      // Out-of-focus labels go into a sub-group so we can dim them as
      // a unit (drill: neighbour states; partial filter: out-of-filter
      // states) without dimming the in-focus labels next to them.
      const neighborGroup = svgEl("g", { class: "adm1-neighbor-labels" });
      this.adm1LabelLayer.appendChild(neighborGroup);
      if (isDrill || partialFilter) neighborGroup.setAttribute("opacity", "0.55");

      // In partial filter mode, focused states' labels render at full
      // opacity in their own group so the dim group's opacity doesn't
      // bleed onto them.
      let focusGroup: SVGGElement | null = null;
      if (partialFilter) {
        focusGroup = svgEl("g", { class: "adm1-focus-labels" });
        this.adm1LabelLayer.appendChild(focusGroup);
      }

      const labelFeatures = isDrill
        ? adm1Visible.filter((f) => f.properties.ADM1_PCODE !== this.drilledStatePcode)
        : (partialFilter
          ? adm1Visible.filter((f) => !focusedStatePcodes!.has(f.properties.ADM1_PCODE))
          : adm1Visible);
      const focusLabelFeatures = partialFilter
        ? adm1Visible.filter((f) => focusedStatePcodes!.has(f.properties.ADM1_PCODE))
        : [];
      if (labelFeatures.length) {
        const labels: LabelDatum[] = labelFeatures.map((f) => {
          const datum = stateAreas.get(f.properties.ADM1_PCODE);
          return {
            feature: f,
            pcode: f.properties.ADM1_PCODE,
            name: (f.properties.ADM1_EN || f.properties.ADM1_PCODE) as string,
            nameOverride: datum?.labelText1 ?? null,
            value: datum?.colorValue ?? null,
            value2: datum?.labelValue2 ?? null,
            bubbleValue: datum?.bubbleSize ?? null
          };
        });
        // In drill view, force neighbour labels to stay inside their own
        // polygon. If even the smallest size doesn't fit, drop the label
        // entirely rather than letting it spill onto the focused state.
        const baseStyle = this.styleFromCard(this.settings.stateLabels);
        // In drill view, neighbour Admin1 labels render NAME ONLY (no
        // value lines) regardless of the card's Content setting. The
        // focused state's value still appears in the title pill, and
        // showing per-area values for unfocused neighbours just adds
        // noise to a view that's about a single state.
        const neighborStyle = isDrill
          ? { ...baseStyle, allowOverrun: false, hideOnOverflow: true, content: "name" as const }
          : baseStyle;
        // Drill view: leave neighbour anchors at each polygon's own
        // centroid (computed by pickAnchor / the centroid-with-
        // polylabel-fallback strategy). The earlier 70%-toward-the-
        // focused-state bias pushed labels too close to the focused
        // polygon — visually crowding it and making it hard to tell
        // which neighbour owned which label. Centroid placement
        // reads cleaner even when some labels fall outside the
        // visible viewport for narrow / off-canvas neighbours.
        const neighborOverrides = view === "states" ? labelOverrides : undefined;
        // Projected outer ring of the focused state (largest part for
        // multi-polygon features). renderLabels drops a neighbour
        // label only when its anchor lies *inside* this polygon —
        // less aggressive than the previous bbox check, which dropped
        // labels whose anchor was clearly outside the focused state
        // but whose bounding box happened to overlap the focused
        // state's bbox.
        let focusedRing: [number, number][] | undefined;
        if (isDrill) {
          const focused = adm1Visible.find((f) => f.properties.ADM1_PCODE === this.drilledStatePcode);
          if (focused) {
            const ring = largestProjectedOuterRing(focused.geometry, projection);
            if (ring && ring.length >= 3) focusedRing = ring as [number, number][];
          }
        }
        renderLabels(neighborGroup, projection, path, labels, neighborStyle, neighborOverrides, this.zoomLevel, this.ruleColorsForCard(prepared, "stateLabels"), focusedRing, adm1VirtualHoles);
      }

      // Render the focus group at full opacity (partial filter only —
      // drill view uses the title pill for the focused state's label).
      if (partialFilter && focusGroup && focusLabelFeatures.length) {
        const focusLabels: LabelDatum[] = focusLabelFeatures.map((f) => {
          const datum = stateAreas.get(f.properties.ADM1_PCODE);
          return {
            feature: f,
            pcode: f.properties.ADM1_PCODE,
            name: (f.properties.ADM1_EN || f.properties.ADM1_PCODE) as string,
            nameOverride: datum?.labelText1 ?? null,
            value: datum?.colorValue ?? null,
            value2: datum?.labelValue2 ?? null,
            bubbleValue: datum?.bubbleSize ?? null
          };
        });
        renderLabels(
          focusGroup,
          projection,
          path,
          focusLabels,
          this.styleFromCard(this.settings.stateLabels),
          undefined,
          this.zoomLevel,
          this.ruleColorsForCard(prepared, "stateLabels"),
          undefined,
          adm1VirtualHoles
        );
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
          name: (f.properties.ADM2_EN || f.properties.ADM2_PCODE) as string,
          nameOverride: datum?.labelText1 ?? null,
          value: datum?.colorValue ?? null,
          value2: datum?.labelValue2 ?? null,
          bubbleValue: datum?.bubbleSize ?? null
        };
      });
      const localityCardName = drilled ? "drillLocalityLabels" : "localityLabels";
      renderLabels(
        this.adm2LabelLayer,
        projection,
        path,
        labels,
        this.styleFromCard(localityCard),
        localityOverrides,
        this.zoomLevel,
        this.ruleColorsForCard(prepared, localityCardName),
        undefined,
        adm2VirtualHoles
      );
    } else {
      while (this.adm2LabelLayer.firstChild) this.adm2LabelLayer.removeChild(this.adm2LabelLayer.firstChild);
    }

    // Scale bar (optional). Rendered BEFORE legends now so legends can
    // dodge the bar's footprint and the bar sits flush against its
    // chosen corner (visually below legends in bottom corners — closer
    // to the screen edge — which is what users expect from a
    // cartographic key).
    const sb = this.settings.scaleBar;
    const sbStyle = {
      show: sb.show.value,
      units: (sb.units.value as any).value,
      position: (sb.position.value as any).value,
      color: sb.color.value.value,
      fontSize: sb.fontSize.value
    };
    const sbFootprint = renderScaleBar(this.scaleBarLayer, projection, width, height, this.zoomLevel, sbStyle);
    // Stash a closure so applyZoom can re-render the bar with the
    // current zoomLevel without a full renderMap pass. Settings are
    // read freshly so format-pane edits made between full renders
    // still apply.
    this.rerenderScaleBar = () => {
      const cardSb = this.settings.scaleBar;
      renderScaleBar(this.scaleBarLayer, projection, width, height, this.zoomLevel, {
        show: cardSb.show.value,
        units: (cardSb.units.value as any).value,
        position: (cardSb.position.value as any).value,
        color: cardSb.color.value.value,
        fontSize: cardSb.fontSize.value
      });
    };
    const sbFootprintByCorner = sbFootprint
      ? { [sbFootprint.position]: { height: sbFootprint.height } } as Partial<Record<typeof sbFootprint.position, { height: number }>>
      : undefined;

    // Legends
    const valueLegend = this.settings.valueLegend;
    const bubbleLegend = this.settings.bubbleLegend;
    const glyphLegend = this.settings.glyphLegend;
    // Legend classes: categorical mode emits one entry per unique
    // category with a `label`; numeric modes use the from/to range
    // formatter via makeLegendClasses.
    const valueClasses = classification === "categorical"
      ? (categoricalClasses || []).map((c) => ({ color: c.color, from: 0, to: 0, label: c.label }))
      : (breaks.classCount > 0 ? makeLegendClasses(breaks, colors) : []);
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
        // Use the colour actually painted on the bubbles. With no fx
        // rule this equals the static card value; with fx in play it's
        // the most-common rule-resolved colour, so the legend swatch
        // matches what's on the map.
        fillColor: bubbleResult.effectiveFillColor,
        strokeColor: bubbleResult.effectiveStrokeColor,
        minRadius: bubbleStyle.minRadius.value,
        maxRadius: bubbleStyle.maxRadius.value,
        minValue: bubbleResult.minValue,
        maxValue: bubbleResult.maxValue,
        position: (bubbleLegend.position.value as any).value,
        size: (bubbleLegend.size.value as any).value,
        orientation: (bubbleLegend.orientation.value as any).value,
        scale: bubbleResult.scale
      } : undefined,
      values: this.buildValuesLegendInput(prepared, view, !!this.drilledStatePcode),
      container: {
        borderColor: this.settings.legendContainer.borderColor.value.value,
        borderWidth: this.settings.legendContainer.borderWidth.value,
        cornerRadius: this.settings.legendContainer.cornerRadius.value,
        padding: this.settings.legendContainer.padding.value,
        background: this.settings.legendContainer.background.value.value,
        backgroundOpacity: this.settings.legendContainer.backgroundOpacity.value,
        headerColor: this.settings.legendContainer.headerColor?.value?.value || "#222222",
        headerBold: this.settings.legendContainer.headerBold?.value !== false,
        headerFontSize: this.settings.legendContainer.headerFontSize?.value || 0,
        orientation: ((this.settings.legendContainer.containerOrientation?.value as any)?.value === "horizontal" ? "horizontal" : "vertical") as "horizontal" | "vertical"
      }
    }, sbFootprintByCorner);

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

    const adm1Label = (this.settings?.general?.admin1Alias?.value || "").trim() || "Admin1";
    const adm2Label = (this.settings?.general?.admin2Alias?.value || "").trim() || "Admin2";
    const admin1Name = props.ADM1_EN || (datum && datum.level === 1 ? datum.name : undefined) || props.ADM1_PCODE;
    if (admin1Name) items.push({ displayName: adm1Label, value: String(admin1Name) });

    if (isAdmin2) {
      const admin2Name = props.ADM2_EN || (datum && datum.level === 2 ? datum.name : undefined) || props.ADM2_PCODE;
      if (admin2Name) items.push({ displayName: adm2Label, value: String(admin2Name) });
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

    // Pick the area name. nameSource = "labelText1" uses the bound
    // override when present and falls back to the geometry name when not.
    const nameSource: string = (card.nameSource?.value as any)?.value || "geometry";
    const name = (
      nameSource === "labelText1" && datum?.labelText1
        ? datum.labelText1
        : (feature.properties.ADM1_EN || feature.properties.ADM1_PCODE)
    ) as string;

    // Decode value source the same way as on-polygon labels: each source
    // contributes its own line in display order (choropleth → bubble →
    // custom). Custom only renders when Label Value 2 is bound. Each
    // value line is prefixed with the bound measure's display name —
    // 'Cases: 1.2M' rather than a bare '1.2M' — since the pill is the
    // user's primary readout for the drilled state and needs to be
    // self-explanatory without a separate legend.
    const valueColor = card.valueColor.value.value;
    const bubbleValueColor = card.bubbleValueColor?.value?.value || "#e6550d";
    const customValueColor = card.customValueColor?.value?.value || "#0f766e";
    const source: string = (card.valueSource?.value as any)?.value || "choropleth";
    const wants = {
      choropleth: source === "choropleth" || source === "both" || source === "choropleth_custom" || source === "all",
      bubble: source === "bubble" || source === "both" || source === "bubble_custom" || source === "all",
      custom: source === "custom" || source === "choropleth_custom" || source === "bubble_custom" || source === "all"
    };
    const prepared = this.currentDataView;
    const prefix = (n: string | undefined): string => (n && n.trim() ? `${n}: ` : "");
    type NumericPair = { text: string; color: string };
    const numericRows: NumericPair[] = [];
    if (wants.choropleth && datum?.colorValue != null) numericRows.push({ text: `${prefix(prepared?.colorValueColumn?.displayName)}${this.fmt(datum.colorValue, fmtCard)}`, color: valueColor });
    if (wants.bubble && datum?.bubbleSize != null) numericRows.push({ text: `${prefix(prepared?.bubbleSizeColumn?.displayName)}${this.fmt(datum.bubbleSize, fmtCard)}`, color: bubbleValueColor });
    if (wants.custom && datum?.labelValue2 != null) numericRows.push({ text: `${prefix(prepared?.labelValue2Column?.displayName)}${this.fmt(datum.labelValue2, fmtCard)}`, color: customValueColor });

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

    // Drill pill scales with the visual's viewport — ~4% of the
    // smaller dimension, floored at 14 px and capped at 36 px. The
    // user's Admin1 label font size + 4 is treated as the minimum so
    // a deliberately large card setting still wins. Value font is
    // half the title so the hierarchy reads at a glance even on
    // small visuals (200 px wide → ~14 px title, 7 px value).
    const minSide = Math.min(this.viewportW || width, this.viewportH || 600);
    const baseTitle = Math.max(card.fontSize.value + 4, minSide * 0.04);
    const titleFontSize = Math.round(Math.max(14, Math.min(36, baseTitle)));
    const valueFontSize = Math.max(8, Math.round(titleFontSize / 2));

    const baseX = 8;
    const baseY = 44;
    const svgNS = "http://www.w3.org/2000/svg";
    // Pill is rendered into pillLayer (a screen-space layer outside
    // mapGroup) so it stays glued to (8, 44) regardless of zoom / pan.
    // The wrapper group is purely for clarity; pillLayer itself is
    // cleared at the start of every render.
    const sel = document.createElementNS(svgNS, "g") as SVGGElement;
    sel.setAttribute("class", "adm-drilled-pill");
    this.pillLayer.appendChild(sel);

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
    // Build the set of selectionIds that "select Admin1 X" maps to —
    // either the direct Admin1 row's id, or every Admin2 child row's
    // id when only Admin2 is bound.
    const ids: powerbi.extensibility.ISelectionId[] = [];
    const directly = this.cached.prepared.areas.get(pcode);
    if (directly && directly.level === 1) {
      ids.push(directly.selectionId);
    } else {
      const country = this.cached.country;
      const child2parent = new Map<string, string>();
      if (country.adm2) {
        for (const f of country.adm2.features as any[]) {
          const c = f.properties?.ADM2_PCODE;
          const p = f.properties?.ADM1_PCODE;
          if (c && p) child2parent.set(c, p);
        }
      }
      for (const a of this.cached.prepared.areas.values()) {
        const parent = a.parentPcode || child2parent.get(a.pcode);
        if (parent === pcode) ids.push(a.selectionId);
      }
    }
    if (!ids.length) return;
    // Toggle off when the user single-clicks the same Admin1 that's
    // already the entire current selection. Without this PBI's
    // select(replace) leaves the filter stuck on a re-click.
    if (!multiSelect) {
      const current = this.selectionManager.getSelectionIds() as powerbi.extensibility.ISelectionId[];
      if (selectionIdsEqual(current, ids)) {
        this.selectionManager.clear();
        return;
      }
    }
    this.selectionManager.select(ids, multiSelect);
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
   * For each Admin1 in `features` that ISN'T the drilled state, return
   * a label-anchor override that pulls the label toward the boundary
   * shared with the drilled state. Anchors are computed in projected
   * screen space so they line up with whatever the path renderer
   * eventually draws.
   */
  private buildNeighborLabelOverrides(features: any[], drilledPcode: string, projection: any): Map<string, LabelAnchorOverride> {
    const out = new Map<string, LabelAnchorOverride>();
    const drilled = features.find((f) => f.properties.ADM1_PCODE === drilledPcode);
    if (!drilled) return out;

    // Drilled state's centroid in projected coords — that's the target
    // we pull neighbour labels toward.
    const drilledAnchorGeo = pickAnchor(drilled.geometry, { largestPartOnly: true, avoidHoles: true });
    if (!drilledAnchorGeo) return out;
    const drilledAnchor = projection(drilledAnchorGeo as [number, number]);
    if (!drilledAnchor) return out;

    for (const f of features) {
      if (f.properties.ADM1_PCODE === drilledPcode) continue;
      const projectedRing = projectFeatureRing(f.geometry, projection);
      if (!projectedRing) continue;
      // 70% of the way from neighbour's centroid toward the boundary
      // point closest to the drilled state. Reads as "very close to the
      // shared border, but still safely inside the polygon".
      const anchor = pickAnchorTowardPoint(projectedRing, drilledAnchor as [number, number], 0.7);
      if (anchor) out.set(f.properties.ADM1_PCODE, { x: anchor[0], y: anchor[1] });
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
    // x/y on each override is the bubble CENTRE (in pre-zoom px); the
    // padX / padY values are the desired on-screen offset between
    // bubble centre and label centre. renderLabels divides them by
    // the live zoom level so the label sticks to the bubble at a
    // constant screen offset regardless of zoom.
    for (const [pcode, anchor] of bubbleResult.anchors) {
      let padX = 0;
      let padY = 0;
      switch (placement) {
        case "below":
          padY = anchor.r + lineHeight / 2 + padding;
          break;
        case "left":
          padX = -(anchor.r + horizontalGap + padding);
          break;
        case "right":
          padX = anchor.r + horizontalGap + padding;
          break;
        case "center":
          // Bubble center — label sits inside the bubble.
          break;
        case "above":
        default:
          padY = -(anchor.r + lineHeight / 2 + padding);
          break;
      }
      out.set(pcode, { x: anchor.x, y: anchor.y, padX, padY });
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
    // Hide map chrome opt-out: drop the bar entirely so the map fills
    // the canvas. Renderless return — keeps the title pill (which is
    // a label, not chrome) intact.
    if (this.settings?.general?.hideMapChrome?.value) {
      if (bar) bar.remove();
      return;
    }
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
        this.manualDrillPcode = null;
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
          this.manualDrillPcode = target;
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
    // Hide map chrome opt-out: drop the controls panel entirely.
    if (this.settings?.general?.hideMapChrome?.value) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "adm-controls";
      this.overlay.appendChild(panel);
    } else {
      while (panel.firstChild) panel.removeChild(panel.firstChild);
    }

    const cs = this.settings.controls;
    panel.dataset.position = (cs.position.value as any).value;

    if (cs.showPan.value) {
      // 3-row directional pad: [up] / [left right] / [down].
      const mkPan = (dir: "up" | "down" | "left" | "right", glyph: string, label: string) => {
        const b = document.createElement("button");
        b.className = "adm-zoom-button adm-pan-button";
        b.type = "button";
        b.setAttribute("aria-label", label);
        b.title = label;
        b.innerHTML = glyph;
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          this.panBy(dir);
        });
        return b;
      };
      const padTop = document.createElement("div");
      padTop.className = "adm-pan-row";
      padTop.appendChild(mkPan("up", "&#9650;", "Pan up"));
      const padMid = document.createElement("div");
      padMid.className = "adm-pan-row";
      padMid.appendChild(mkPan("left", "&#9664;", "Pan left"));
      padMid.appendChild(mkPan("right", "&#9654;", "Pan right"));
      const padBot = document.createElement("div");
      padBot.className = "adm-pan-row";
      padBot.appendChild(mkPan("down", "&#9660;", "Pan down"));
      panel.appendChild(padTop);
      panel.appendChild(padMid);
      panel.appendChild(padBot);
    }

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
          this.setZoom(this.zoomLevel * (delta > 0 ? 1.25 : 1 / 1.25));
        });
        return b;
      };
      panel.appendChild(mkZoom(+1, "+", "Zoom in"));
      panel.appendChild(mkZoom(-1, "&#8722;", "Zoom out"));
    }

    // Reset button — visible after any pan / zoom (wheel, drag, or
    // button), regardless of the "Show zoom buttons" toggle. Users who
    // disable the +/- buttons can still reset what they did with the
    // mouse wheel or a drag-pan.
    if (this.zoomLevel > 1.001 || this.panX || this.panY) {
      const reset = document.createElement("button");
      reset.className = "adm-zoom-button adm-zoom-reset";
      reset.type = "button";
      reset.setAttribute("aria-label", "Reset zoom and pan");
      reset.title = "Reset zoom and pan";
      reset.innerHTML = "&#8634;";
      reset.addEventListener("click", (e) => {
        e.stopPropagation();
        this.panX = 0;
        this.panY = 0;
        this.setZoom(1);
      });
      panel.appendChild(reset);
    }

    if (cs.showExport.value) {
      const svg = document.createElement("button");
      svg.className = "adm-zoom-button adm-export-button";
      svg.type = "button";
      svg.setAttribute("aria-label", "Show SVG source for manual copy");
      svg.title = "Show SVG source — select all and copy";
      svg.innerHTML = "SVG";
      svg.addEventListener("click", (e) => {
        e.stopPropagation();
        this.exportSvg(svg);
      });
      panel.appendChild(svg);
      // PNG button is intentionally hidden — clipboard.write of a
      // PNG blob is blocked in every Power BI host we tested
      // (Service iframe sandbox + Desktop's webview both deny the
      // write), and the canvas → SVG → image rasterisation also
      // breaks on inlined CSS in some hosts. Keep exportPng around
      // so it can be re-enabled if Microsoft relaxes the iframe
      // policy, but don't add the button.
    }

    if (!panel.children.length) panel.style.display = "none";
    else panel.style.display = "";
  }

  /**
   * Apply the current zoom + pan to the map content. We zoom around the
   * centre of the viewport so the framing stays sensible, then add the
   * pan offset so the user can drag around the magnified map. Legends
   * are NOT inside mapGroup, so they keep a constant size and position.
   */
  private applyZoom(): void {
    const z = this.zoomLevel;
    const cx = this.viewportW / 2;
    const cy = this.viewportH / 2;
    this.mapGroup.setAttribute(
      "transform",
      `translate(${cx + this.panX},${cy + this.panY}) scale(${z}) translate(${-cx},${-cy})`
    );
    // Visible cursor cue: grab when zoomed in, default otherwise.
    this.svg.style.cursor = z > 1 ? (this.dragState ? "grabbing" : "grab") : "";
    // Live-update labels marked "Constant size on zoom" so they keep
    // their on-screen size as the user zooms. Walks data attributes and
    // rewrites the per-label transform — no layout / fitting re-runs.
    updateLabelTransforms(this.adm1LabelLayer, z);
    updateLabelTransforms(this.adm2LabelLayer, z);
    // Bubbles get the same counter-zoom treatment so they stay at
    // their authored screen-space radius at any zoom level.
    updateBubbleTransforms(this.bubbleLayer, z);
    updateGlyphTransforms(this.glyphLayer, z);
    // Re-run the scale bar so its labelled distance reflects the
    // current zoom (a "100 km" bar at zoom 1 spans a smaller geographic
    // distance at zoom 4 — renderScaleBar consumes zoomLevel and
    // shrinks / grows accordingly).
    this.rerenderScaleBar?.();
  }

  /**
   * Build a self-contained SVG snapshot of the live visual: clones the
   * on-screen <svg>, inlines the document stylesheet so the rasteriser
   * keeps every halo / font / opacity rule, prepends a coloured
   * background rect so the image isn't transparent. Returns both the
   * cloned SVG element and its serialised XML so callers can choose
   * to download either form (PNG via canvas, or the SVG itself).
   */
  private buildExportSvg(): { svg: SVGSVGElement; xml: string; width: number; height: number; bgColor: string } | null {
    const sourceW = Math.max(40, this.viewportW || this.svg.clientWidth || this.root.clientWidth || 800);
    const sourceH = Math.max(40, this.viewportH || this.svg.clientHeight || this.root.clientHeight || 600);

    const SVG_NS = "http://www.w3.org/2000/svg";
    const clone = this.svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(sourceW));
    clone.setAttribute("height", String(sourceH));
    clone.setAttribute("viewBox", `0 0 ${sourceW} ${sourceH}`);
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

    // Drop the country outer glow from the export. The feGaussianBlur
    // renders inconsistently across destinations (Illustrator and
    // PowerPoint sometimes promote it to a raster with banding; some
    // browsers handle filters oddly when the SVG is opened as a
    // standalone file). The fix the user asked for: just remove it.
    const glow = clone.querySelector(".country-glow-layer");
    if (glow) glow.parentNode?.removeChild(glow);

    // Shrink label halos. On-screen the halo is sized for legibility
    // over busy choropleths (typically 2 px); in a static export at
    // print resolution that reads as a chunky outline. Pin every
    // label text's stroke-width to 0.3 in the clone so the halo is
    // a hair-thin glow rather than a band.
    clone.querySelectorAll(".map-label text[stroke]").forEach((t) => {
      (t as SVGTextElement).setAttribute("stroke-width", "0.3");
    });

    const bgColor = this.settings?.general?.transparentBackground?.value
      ? "#ffffff"
      : (this.settings?.general?.background?.value?.value || "#ffffff");
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", String(sourceW));
    bg.setAttribute("height", String(sourceH));
    bg.setAttribute("fill", bgColor);
    clone.insertBefore(bg, clone.firstChild);

    // Inline the host document's stylesheets so the SVG is portable
    // (works in Illustrator / browsers / PowerPoint paste).
    const styleEl = document.createElementNS(SVG_NS, "style");
    styleEl.textContent = collectVisualCss();
    clone.insertBefore(styleEl, clone.firstChild);

    const xml = new XMLSerializer().serializeToString(clone);
    return { svg: clone, xml, width: sourceW, height: sourceH, bgColor };
  }

  /**
   * Export the current map by showing its SVG source in a modal so the
   * user can select-all and copy with Ctrl/Cmd+C. Clipboard APIs are
   * unreliable inside the Power BI iframe, so we skip them entirely
   * and rely on manual copy. Paste into a text file with a .svg
   * extension or directly into Inkscape / Illustrator / a browser.
   */
  private exportSvg(btn: HTMLButtonElement): void {
    const original = btn.innerHTML;
    try {
      const built = this.buildExportSvg();
      if (!built) throw new Error("could not build export SVG");
      this.showCopyCodeModal(built.xml, "Select all, then press Ctrl/Cmd+C to copy.", btn, original);
    } catch (e) {
      console.error("[ADM Map export] SVG export failed:", e);
      btn.innerHTML = errorIconSvg();
      btn.title = `SVG export failed: ${describeError(e)}`;
      setTimeout(() => { btn.innerHTML = original; btn.title = "Show SVG source — select all and copy"; }, 2500);
    }
  }

  /**
   * Rasterise the export SVG to a PNG and try to put it on the
   * clipboard. Power BI Service iframes used to block
   * `navigator.clipboard.write` outright; recent hosts (Service +
   * Desktop on a permitted page) sometimes succeed. We attempt the
   * write and fall back to a download if it fails so the user always
   * gets a deliverable.
   */
  private exportPng(btn: HTMLButtonElement): void {
    const original = btn.innerHTML;
    const restoreLater = () => setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 1800);
    btn.disabled = true;
    btn.innerHTML = "…";
    let built: ReturnType<typeof this.buildExportSvg>;
    try {
      built = this.buildExportSvg();
      if (!built) throw new Error("could not build export SVG");
    } catch (e) {
      console.error("[ADM Map export] PNG export failed at SVG step:", e);
      btn.innerHTML = errorIconSvg();
      btn.title = `PNG export failed: ${describeError(e)}`;
      restoreLater();
      return;
    }

    // Rasterise: SVG → blob URL → <img> → canvas → PNG blob. devicePixelRatio
    // boosts crispness on retina without changing logical dimensions.
    const dpr = Math.min(2, Math.max(1, (window as any).devicePixelRatio || 1));
    const svgBlob = new Blob([built.xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(built!.width * dpr);
        canvas.height = Math.round(built!.height * dpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D canvas unavailable");
        ctx.fillStyle = built!.bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            this.fallbackDownloadPng(btn, original);
            return;
          }
          // Try clipboard first — succeeds in Desktop and some Service
          // contexts. ClipboardItem may also be undefined in older
          // hosts; guard before the call.
          let copied = false;
          if ((navigator as any).clipboard && typeof (window as any).ClipboardItem === "function") {
            try {
              await (navigator as any).clipboard.write([new (window as any).ClipboardItem({ "image/png": blob })]);
              copied = true;
            } catch (e) {
              copied = false;
            }
          }
          if (copied) {
            btn.innerHTML = "&#10003;"; // checkmark
            btn.title = "PNG copied to clipboard";
            restoreLater();
          } else {
            // Download fallback so the user still gets the PNG.
            this.triggerPngDownload(blob);
            btn.innerHTML = "&#8595;"; // down arrow
            btn.title = "Clipboard blocked — PNG downloaded instead";
            restoreLater();
          }
        }, "image/png");
      } catch (e) {
        console.error("[ADM Map export] PNG rasterisation failed:", e);
        URL.revokeObjectURL(url);
        btn.innerHTML = errorIconSvg();
        btn.title = `PNG export failed: ${describeError(e)}`;
        restoreLater();
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      btn.innerHTML = errorIconSvg();
      btn.title = "PNG export failed: SVG image load error";
      restoreLater();
    };
    img.src = url;
  }

  private triggerPngDownload(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "map.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  private fallbackDownloadPng(btn: HTMLButtonElement, original: string): void {
    btn.innerHTML = errorIconSvg();
    btn.title = "PNG export failed: blob unavailable";
    setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 1800);
  }

  /**
   * Last-resort export path: shows a modal containing the full SVG
   * source in a textarea. The user can select-all + copy manually,
   * then close the modal.
   *
   * Used when both PNG-to-clipboard and SVG-text-to-clipboard are
   * blocked by the host iframe (Power BI Service in particular).
   * The visual's textarea is read-only but selectable, with a "Select
   * all" helper button that triggers select() + copy() — which
   * sometimes succeeds where the async clipboard API didn't.
   */
  private showCopyCodeModal(xml: string, subtitle: string, btn: HTMLButtonElement, originalBtnLabel: string): void {
    // Reset the button while the modal is open.
    btn.innerHTML = originalBtnLabel;
    btn.disabled = false;

    const modal = document.createElement("div");
    modal.className = "adm-copy-modal";
    modal.innerHTML = `
      <div class="adm-copy-modal-card">
        <div class="adm-copy-modal-header">
          <strong>Copy SVG manually</strong>
          <button class="adm-copy-modal-close" type="button" aria-label="Close">&times;</button>
        </div>
        <p class="adm-copy-modal-subtitle">${escapeHtml(subtitle)}</p>
        <p class="adm-copy-modal-instructions">
          The SVG includes every visible map element — choropleth,
          bubbles, charts, labels, legends, scale bar, and the drill
          title pill. Click <strong>Download</strong> to save it as a
          file, or <strong>Select all</strong> + <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> +
          <kbd>C</kbd> to copy. Paste / open in Inkscape, Illustrator,
          a browser, or PowerPoint.
        </p>
        <textarea class="adm-copy-modal-textarea" readonly spellcheck="false"></textarea>
        <div class="adm-copy-modal-footer">
          <button class="adm-copy-modal-download" type="button">Download .svg</button>
          <button class="adm-copy-modal-select" type="button">Select all</button>
          <button class="adm-copy-modal-copy" type="button">Try copy</button>
          <span class="adm-copy-modal-status"></span>
          <span class="adm-copy-modal-spacer"></span>
          <button class="adm-copy-modal-close-btn" type="button">Close</button>
        </div>
      </div>
    `;
    this.overlay.appendChild(modal);

    const ta = modal.querySelector(".adm-copy-modal-textarea") as HTMLTextAreaElement;
    ta.value = xml;

    const selectAll = () => {
      ta.focus();
      ta.select();
      // Older browsers / hosts: setSelectionRange ensures full range.
      ta.setSelectionRange(0, ta.value.length);
    };

    const status = modal.querySelector(".adm-copy-modal-status") as HTMLElement;
    const setStatus = (msg: string) => { if (status) status.textContent = msg; };

    const close = () => modal.remove();

    modal.querySelector(".adm-copy-modal-download")!.addEventListener("click", () => {
      // Direct file download bypasses the textarea/clipboard path
      // entirely — works even for huge SVGs (full-country Admin2
      // export) where browser clipboards typically silently truncate.
      try {
        const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "map.svg";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        setStatus("Downloaded map.svg.");
      } catch (e) {
        setStatus(`Download failed: ${describeError(e)}. Try Select all + copy.`);
      }
    });
    modal.querySelector(".adm-copy-modal-select")!.addEventListener("click", () => {
      selectAll();
      setStatus("Selected. Press Ctrl/Cmd+C to copy.");
    });
    modal.querySelector(".adm-copy-modal-copy")!.addEventListener("click", async () => {
      selectAll();
      let ok = false;
      // Try the synchronous execCommand path first — this works
      // inside a user gesture even when the async Clipboard API is
      // blocked by host CSP.
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      if (!ok && (navigator as any).clipboard?.writeText) {
        try {
          await (navigator as any).clipboard.writeText(xml);
          ok = true;
        } catch { /* fall through */ }
      }
      setStatus(ok ? "Copied. Paste anywhere." : "Copy still blocked. Use Ctrl/Cmd+C while the text is selected.");
    });
    modal.querySelector(".adm-copy-modal-close")!.addEventListener("click", close);
    modal.querySelector(".adm-copy-modal-close-btn")!.addEventListener("click", close);
    // Close on background click (not the card).
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });

    // Auto-select on open so Ctrl/Cmd+C works immediately.
    setTimeout(selectAll, 50);
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
      customValueColor: card.customValueColor?.value?.value || "#0f766e",
      valueSource: (card.valueSource?.value as any)?.value || "choropleth",
      nameSource: (card.nameSource?.value as any)?.value || "geometry",
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
      allowCallout: card.allowCallout?.value || false,
      constantSize: card.constantSize?.value || false
    };
  }

  /**
   * Project the prepared dataView's per-pcode rule map for a single
   * formatting object (one labels card). Returns a flat
   * pcode → propertyName → colour map so renderLabels doesn't need to
   * know about the outer object-name layer.
   */
  /**
   * Build the input for the new "Values legend" (card 12). Reads the
   * Admin1 labels card's Value source to decide which entries are
   * active (Choropleth, Bubble, Label Value 2 in any combination),
   * picks each entry's colour from the same card's per-source colour
   * pickers, and labels each entry with the bound measure's display
   * name. Returns undefined when the card is hidden so the legend
   * never appears in the DOM.
   */
  private buildValuesLegendInput(prepared: PreparedDataView, view: "states" | "localities", drilled: boolean): {
    title: string;
    items: { label: string; color: string }[];
    position: any;
    size: any;
    orientation: "vertical" | "horizontal";
  } | undefined {
    const card = this.settings.valuesLegend;
    if (!card.show.value) return undefined;
    // Pick the label card whose value source + colours actually drive
    // the values currently visible on the map. In Admin2 view, that's
    // the locality label card (drill or default depending on whether
    // the user drilled). In Admin1 view, it's the Admin1 labels card.
    // This way the legend's # swatches match the colours of the value
    // text the user is reading on the map.
    const labelCard = view === "localities"
      ? (drilled ? this.settings.drillLocalityLabels : this.settings.localityLabels)
      : this.settings.stateLabels;
    // Skip the legend entirely when the active label card hides its
    // value lines — content === 'name' means no value text is drawn
    // anywhere on the map, so listing # swatches for measures the
    // user can't see would just confuse the reader.
    const content: string = (labelCard.content?.value as any)?.value || "name_value";
    if (content === "name") return undefined;
    const source: string = (labelCard.valueSource?.value as any)?.value || "choropleth";
    const want = {
      choropleth: source === "choropleth" || source === "both" || source === "choropleth_custom" || source === "all",
      bubble: source === "bubble" || source === "both" || source === "bubble_custom" || source === "all",
      custom: source === "custom" || source === "choropleth_custom" || source === "bubble_custom" || source === "all"
    };
    const items: { label: string; color: string }[] = [];
    if (want.choropleth) {
      const name = prepared.colorValueColumn?.displayName || "";
      if (name) items.push({ label: name, color: labelCard.valueColor.value.value });
    }
    if (want.bubble) {
      const name = prepared.bubbleSizeColumn?.displayName || "";
      if (name) items.push({ label: name, color: labelCard.bubbleValueColor.value.value });
    }
    if (want.custom) {
      const name = prepared.labelValue2Column?.displayName || "";
      if (name) items.push({ label: name, color: labelCard.customValueColor.value.value });
    }
    if (!items.length) return undefined;
    return {
      title: card.title.value || "",
      items,
      position: (card.position.value as any).value,
      size: (card.size.value as any).value,
      orientation: ((card.orientation.value as any).value as "vertical" | "horizontal")
    };
  }

  private ruleColorsForCard(prepared: PreparedDataView, objectName: string): Map<string, Map<string, string>> {
    const out = new Map<string, Map<string, string>>();
    prepared.ruleColorsByPcode.forEach((byObject, pcode) => {
      const props = byObject.get(objectName);
      if (props && props.size) out.set(pcode, props);
    });
    return out;
  }

  /**
   * For each feature, find sibling features whose geographic centroid
   * lies inside this feature's outer ring. Those siblings are
   * spatially enclosed (Budapest in Pest megye, Vatican in Lazio,
   * etc.) and become virtual holes for the label-anchor computation.
   * Returns a map keyed by `pcodeKey` (ADM1_PCODE / ADM2_PCODE) so
   * renderLabels can look up by `label.pcode`.
   *
   * O(n²) — acceptable for the small feature counts at admin level
   * (typically < 100 features per country).
   */
  private buildVirtualHolesByPcode(features: any[], pcodeKey: "ADM1_PCODE" | "ADM2_PCODE"): Map<string, number[][][]> {
    const out = new Map<string, number[][][]>();
    if (!features || features.length < 2) return out;
    const meta = features.map((f) => ({
      feature: f,
      pcode: (f.properties && f.properties[pcodeKey]) as string,
      centroid: d3.geoCentroid(f as any) as [number, number]
    })).filter((m) => m.pcode && m.centroid && Number.isFinite(m.centroid[0]));
    for (const a of meta) {
      const aPolys = collectAllOuterRings(a.feature.geometry);
      if (!aPolys.length) continue;
      const aHoles: number[][][] = [];
      for (const b of meta) {
        if (a === b) continue;
        // b is enclosed by a if b's centroid is inside any of a's
        // outer rings (handles MultiPolygon: any part counts).
        const insideA = aPolys.some((ring) => ring.length >= 3 && d3.polygonContains(ring as [number, number][], b.centroid));
        if (!insideA) continue;
        for (const ring of collectAllOuterRings(b.feature.geometry)) {
          if (ring.length >= 3) aHoles.push(ring);
        }
      }
      if (aHoles.length) out.set(a.pcode, aHoles);
    }
    return out;
  }
}

/** Return every outer ring of a (Multi)Polygon geometry in its native
 *  coord system. For Polygon: one ring; for MultiPolygon: one per
 *  part. Used by buildVirtualHolesByPcode for enclave detection. */
function collectAllOuterRings(geometry: any): number[][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates[0] as number[][]];
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][]).map((poly) => poly[0]);
  }
  return [];
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

/** Trigger a browser download of `blob` with the given filename. Uses the
 *  classic anchor-element technique, with a window.open fallback for
 *  hosts that block programmatic clicks. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.click();
  } catch {
    try { window.open(url, "_blank"); } catch { /* drop */ }
  }
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 5000);
}

/**
 * Walk every accessible CSS rule in the host document and concatenate
 * its text. Used to inline styles inside the cloned SVG so that an
 * SVG-as-image rasteriser (which is isolated from the parent CSSOM)
 * still applies our halo / font / opacity rules.
 *
 * Cross-origin stylesheets throw when you try to read their cssRules;
 * those are silently skipped.
 */
function collectVisualCss(): string {
  const out: string[] = [];
  const sheets = document.styleSheets;
  for (let i = 0; i < sheets.length; i++) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheets[i].cssRules;
    } catch {
      continue; // cross-origin stylesheet
    }
    if (!rules) continue;
    for (let j = 0; j < rules.length; j++) {
      out.push(rules[j].cssText);
    }
  }
  return out.join("\n");
}

/**
 * Compare two ISelectionId lists by value. Set-equality, order-
 * independent. Used to detect a re-click on the already-selected
 * Admin1 / Admin2 so the click can toggle the filter off rather than
 * re-selecting it (PBI's select() without multiSelect is a replace,
 * so without this check a re-click leaves the filter stuck).
 */
function selectionIdsEqual(
  a: powerbi.extensibility.ISelectionId[] | undefined,
  b: powerbi.extensibility.ISelectionId[]
): boolean {
  if (!a) return false;
  if (a.length !== b.length) return false;
  const eqOne = (x: any, list: any[]) => list.some((y) => typeof x.equals === "function" && x.equals(y));
  return a.every((x) => eqOne(x, b)) && b.every((x) => eqOne(x, a));
}

function describeError(err: any): string {
  if (!err) return "unknown error";
  if (err instanceof Error) return err.message || err.name || "error";
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

/**
 * Project a feature's geometry into a synthetic GeoJSON-like geometry
 * whose coordinates are already in screen pixels. Used so the
 * pickAnchorTowardPoint helper can work in pixel space without having
 * to know about the original projection.
 */
function projectFeatureRing(geometry: any, projection: any): any | null {
  if (!geometry) return null;
  function project(coords: any): any {
    if (typeof coords[0] === "number") {
      const p = projection(coords as [number, number]);
      return p ? p : null;
    }
    const out: any[] = [];
    for (const c of coords) {
      const r = project(c);
      if (r !== null) out.push(r);
    }
    return out;
  }
  const projected = project(geometry.coordinates);
  if (!projected) return null;
  return { type: geometry.type, coordinates: projected };
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


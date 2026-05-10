/**
 * Strongly typed formatting settings for the visual.
 * Mirrors the objects defined in capabilities.json.
 */
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { BUNDLED_COUNTRIES } from "./generated/countries";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsModel = formattingSettings.Model;

export type ViewMode = "auto" | "states" | "localities";
export type Position = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
export type LegendSize = "small" | "medium" | "large";
export type LabelContent = "name" | "value" | "name_value";
export type LabelFormat = "auto" | "thousands" | "millions" | "percent";
export type Classification = "quantile" | "equal" | "manual";
export type ChoroplethMode = "automatic" | "custom";

class GeneralSettings extends FormattingSettingsCard {
  // Dropdown items reflect every country bundled at build time via
  // src/generated/countries.ts (auto-written by build-topojson.js).
  // "auto" delegates to PCODE-prefix sniffing, "custom" enables the
  // upload-TopoJSON flow.
  selectedCountry = new formattingSettings.ItemDropdown({
    name: "selectedCountry",
    displayName: "Country",
    items: [
      { value: "auto", displayName: "Auto-detect (from PCODE)" },
      ...BUNDLED_COUNTRIES.map((c) => ({ value: c.iso, displayName: `${c.name} (${c.iso})` })),
      { value: "custom", displayName: "Custom (upload TopoJSON)" }
    ],
    value: { value: "auto", displayName: "Auto-detect (from PCODE)" }
  });
  // These properties are populated programmatically by the upload UI via
  // host.persistProperties — they are not slices the user edits directly.
  // They MUST appear in the slices array though, otherwise the formatting
  // service never reads the persisted value back into the model. We hide
  // them via visible: false so the format pane stays clean.
  customAdm1Json = new formattingSettings.TextInput({ name: "customAdm1Json", displayName: "Custom Admin1", placeholder: "", value: "", visible: false });
  customAdm2Json = new formattingSettings.TextInput({ name: "customAdm2Json", displayName: "Custom Admin2", placeholder: "", value: "", visible: false });
  customFieldMapping = new formattingSettings.TextInput({ name: "customFieldMapping", displayName: "Custom field mapping", placeholder: "", value: "", visible: false });
  customTopoName = new formattingSettings.TextInput({ name: "customTopoName", displayName: "Custom dataset name", placeholder: "", value: "", visible: false });
  viewMode = new formattingSettings.ItemDropdown({
    name: "viewMode",
    displayName: "View mode",
    items: [
      { value: "auto", displayName: "Auto" },
      { value: "states", displayName: "Admin1" },
      { value: "localities", displayName: "Admin2" }
    ],
    value: { value: "auto", displayName: "Auto" }
  });
  interactionEnabled = new formattingSettings.ToggleSwitch({ name: "interactionEnabled", displayName: "Interaction enabled", value: true });
  hideUnfilteredStates = new formattingSettings.ToggleSwitch({ name: "hideUnfilteredStates", displayName: "Hide unfiltered Admin1 in Admin2 mode", value: false });
  hideMapChrome = new formattingSettings.ToggleSwitch({ name: "hideMapChrome", displayName: "Hide map chrome", value: false });
  admin1Alias = new formattingSettings.TextInput({ name: "admin1Alias", displayName: "Admin1 alias", placeholder: "Admin 1 / Governorate / State…", value: "" });
  admin2Alias = new formattingSettings.TextInput({ name: "admin2Alias", displayName: "Admin2 alias", placeholder: "Admin 2 / District / Locality…", value: "" });
  background = new formattingSettings.ColorPicker({ name: "background", displayName: "Background color", value: { value: "#ffffff" } });
  transparentBackground = new formattingSettings.ToggleSwitch({ name: "transparentBackground", displayName: "Transparent background", value: false });

  name = "general";
  displayName = "1. Map setup";
  // Hidden custom* slices live alongside the visible ones so the
  // formatting service round-trips them through host.persistProperties.
  slices = [this.selectedCountry, this.viewMode, this.interactionEnabled, this.hideUnfilteredStates, this.hideMapChrome, this.admin1Alias, this.admin2Alias, this.background, this.transparentBackground, this.customAdm1Json, this.customAdm2Json, this.customFieldMapping, this.customTopoName];
}

class ChoroplethSettings extends FormattingSettingsCard {
  mode = new formattingSettings.ItemDropdown({
    name: "mode",
    displayName: "Color mode",
    items: [
      { value: "automatic", displayName: "Automatic ramp" },
      { value: "custom", displayName: "Custom classes" }
    ],
    value: { value: "automatic", displayName: "Automatic ramp" }
  });
  baseColor = new formattingSettings.ColorPicker({ name: "baseColor", displayName: "Base color", value: { value: "#1f77b4" } });
  classification = new formattingSettings.ItemDropdown({
    name: "classification",
    displayName: "Classification",
    items: [
      { value: "quantile", displayName: "Quantile" },
      { value: "equal", displayName: "Equal interval" },
      { value: "manual", displayName: "Manual breaks" }
    ],
    value: { value: "quantile", displayName: "Quantile" }
  });
  manualBreaks = new formattingSettings.TextInput({ name: "manualBreaks", displayName: "Manual breaks", placeholder: "10, 50, 100, 500", value: "" });
  classCount = new formattingSettings.NumUpDown({ name: "classCount", displayName: "Number of classes", value: 5 });
  color1 = new formattingSettings.ColorPicker({ name: "color1", displayName: "Class 1", value: { value: "#deebf7" } });
  color2 = new formattingSettings.ColorPicker({ name: "color2", displayName: "Class 2", value: { value: "#9ecae1" } });
  color3 = new formattingSettings.ColorPicker({ name: "color3", displayName: "Class 3", value: { value: "#4292c6" } });
  color4 = new formattingSettings.ColorPicker({ name: "color4", displayName: "Class 4", value: { value: "#2171b5" } });
  color5 = new formattingSettings.ColorPicker({ name: "color5", displayName: "Class 5", value: { value: "#084594" } });
  blankColor = new formattingSettings.ColorPicker({ name: "blankColor", displayName: "No-data color", value: { value: "#eeeeee" } });
  blankTransparent = new formattingSettings.ToggleSwitch({ name: "blankTransparent", displayName: "Transparent for no-data", value: false });
  zeroAsBlank = new formattingSettings.ToggleSwitch({ name: "zeroAsBlank", displayName: "Treat 0 as no-data", value: false });
  fillOpacity = new formattingSettings.NumUpDown({ name: "fillOpacity", displayName: "Fill opacity", value: 0.85 });

  name = "choropleth";
  displayName = "2. Choropleth fill";
  slices = [this.mode, this.baseColor, this.classification, this.manualBreaks, this.classCount, this.color1, this.color2, this.color3, this.color4, this.color5, this.blankColor, this.blankTransparent, this.zeroAsBlank, this.fillOpacity];
}

class BordersSettings extends FormattingSettingsCard {
  stateColor = new formattingSettings.ColorPicker({ name: "stateColor", displayName: "Admin1 border color", value: { value: "#444444" } });
  stateWidth = new formattingSettings.NumUpDown({ name: "stateWidth", displayName: "Admin1 border width", value: 1 });
  stateOpacity = new formattingSettings.NumUpDown({ name: "stateOpacity", displayName: "Admin1 border opacity", value: 1 });
  localityColor = new formattingSettings.ColorPicker({ name: "localityColor", displayName: "Admin2 border color", value: { value: "#888888" } });
  localityWidth = new formattingSettings.NumUpDown({ name: "localityWidth", displayName: "Admin2 border width", value: 0.5 });
  localityOpacity = new formattingSettings.NumUpDown({ name: "localityOpacity", displayName: "Admin2 border opacity", value: 0.8 });

  countryGlowShow = new formattingSettings.ToggleSwitch({ name: "countryGlowShow", displayName: "Country outer glow", value: false });
  countryGlowColor = new formattingSettings.ColorPicker({ name: "countryGlowColor", displayName: "Glow color", value: { value: "#d0d4da" } });
  countryGlowRadius = new formattingSettings.NumUpDown({ name: "countryGlowRadius", displayName: "Glow radius (px)", value: 12 });
  countryGlowOpacity = new formattingSettings.NumUpDown({ name: "countryGlowOpacity", displayName: "Glow opacity", value: 0.6 });

  name = "borders";
  displayName = "5. Borders";
  slices = [this.stateColor, this.stateWidth, this.stateOpacity, this.localityColor, this.localityWidth, this.localityOpacity, this.countryGlowShow, this.countryGlowColor, this.countryGlowRadius, this.countryGlowOpacity];
}

function makeLabelCard(cardName: string, cardDisplayName: string, defaults: Partial<{ show: boolean; content: LabelContent; fontSize: number; color: string; bold: boolean }> = {}) {
  return class LabelCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: defaults.show ?? true });
    content = new formattingSettings.ItemDropdown({
      name: "content",
      displayName: "Content",
      items: [
        { value: "name", displayName: "Name only" },
        { value: "value", displayName: "Value only" },
        { value: "name_value", displayName: "Name + value" }
      ],
      value: { value: defaults.content ?? "name", displayName: "Name only" }
    });
    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font family", value: "Segoe UI" });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Font size", value: defaults.fontSize ?? 11 });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Color", value: { value: defaults.color ?? "#222222" } });
    valueColor = new formattingSettings.ColorPicker({ name: "valueColor", displayName: "Value color", value: { value: "#444444" } });
    bubbleValueColor = new formattingSettings.ColorPicker({ name: "bubbleValueColor", displayName: "Bubble value color", value: { value: "#e6550d" } });
    customValueColor = new formattingSettings.ColorPicker({ name: "customValueColor", displayName: "Custom value color (Label Value 2)", value: { value: "#0f766e" } });
    valueSource = new formattingSettings.ItemDropdown({
      name: "valueSource",
      displayName: "Value source",
      items: [
        { value: "choropleth", displayName: "Choropleth value" },
        { value: "bubble", displayName: "Bubble value" },
        { value: "both", displayName: "Choropleth + Bubble" },
        { value: "custom", displayName: "Label Value 2 (only)" },
        { value: "choropleth_custom", displayName: "Choropleth + Label Value 2" },
        { value: "bubble_custom", displayName: "Bubble + Label Value 2" },
        { value: "all", displayName: "All three (Choropleth + Bubble + Label Value 2)" }
      ],
      value: { value: "choropleth", displayName: "Choropleth value" }
    });
    nameSource = new formattingSettings.ItemDropdown({
      name: "nameSource",
      displayName: "Name source",
      items: [
        { value: "geometry", displayName: "Geometry name" },
        { value: "labelText1", displayName: "Label Text 1 (override)" }
      ],
      value: { value: "geometry", displayName: "Geometry name" }
    });
    bold = new formattingSettings.ToggleSwitch({ name: "bold", displayName: "Bold", value: defaults.bold ?? false });
    italic = new formattingSettings.ToggleSwitch({ name: "italic", displayName: "Italic", value: false });
    haloColor = new formattingSettings.ColorPicker({ name: "haloColor", displayName: "Halo color", value: { value: "#ffffff" } });
    haloWidth = new formattingSettings.NumUpDown({ name: "haloWidth", displayName: "Halo width", value: 2 });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimals", value: 0 });
    format = new formattingSettings.ItemDropdown({
      name: "format",
      displayName: "Number format",
      items: [
        { value: "auto", displayName: "Auto" },
        { value: "thousands", displayName: "Thousands (K)" },
        { value: "millions", displayName: "Millions (M)" },
        { value: "percent", displayName: "Percent" }
      ],
      value: { value: "auto", displayName: "Auto" }
    });
    placement = new formattingSettings.ItemDropdown({
      name: "placement",
      displayName: "Placement",
      items: [
        { value: "horizontal", displayName: "Horizontal" },
        { value: "straight", displayName: "Straight" },
        { value: "curved", displayName: "Curved" },
        { value: "boundary", displayName: "Boundary" }
      ],
      value: { value: "horizontal", displayName: "Horizontal" }
    });
    wordsOnSeparateLines = new formattingSettings.ToggleSwitch({ name: "wordsOnSeparateLines", displayName: "Words on separate lines", value: false });
    stackWhenNeeded = new formattingSettings.ToggleSwitch({ name: "stackWhenNeeded", displayName: "Stack when needed", value: true });
    reduceFontSize = new formattingSettings.ToggleSwitch({ name: "reduceFontSize", displayName: "Reduce font size to fit", value: true });
    allowOverrun = new formattingSettings.ToggleSwitch({ name: "allowOverrun", displayName: "Allow overrun", value: false });
    abbreviate = new formattingSettings.ToggleSwitch({ name: "abbreviate", displayName: "Abbreviate / truncate", value: true });
    spreadCharacters = new formattingSettings.ToggleSwitch({ name: "spreadCharacters", displayName: "Spread characters", value: false });
    avoidHoles = new formattingSettings.ToggleSwitch({ name: "avoidHoles", displayName: "Avoid holes", value: true });
    labelLargestPart = new formattingSettings.ToggleSwitch({ name: "labelLargestPart", displayName: "Label largest polygon part", value: true });
    allowCallout = new formattingSettings.ToggleSwitch({ name: "allowCallout", displayName: "Allow callout if outside", value: true });
    constantSize = new formattingSettings.ToggleSwitch({ name: "constantSize", displayName: "Constant size on zoom", value: false });

    name = cardName;
    displayName = cardDisplayName;
    slices = [this.show, this.content, this.nameSource, this.valueSource, this.fontFamily, this.fontSize, this.color, this.valueColor, this.bubbleValueColor, this.customValueColor, this.bold, this.italic, this.haloColor, this.haloWidth, this.decimals, this.format, this.placement, this.wordsOnSeparateLines, this.stackWhenNeeded, this.reduceFontSize, this.allowOverrun, this.abbreviate, this.spreadCharacters, this.avoidHoles, this.labelLargestPart, this.allowCallout, this.constantSize];
  };
}

const StateLabelsCard = makeLabelCard("stateLabels", "6. Admin1 labels", { show: true, content: "name", fontSize: 12, bold: true });
const LocalityLabelsCard = makeLabelCard("localityLabels", "7. Admin2 labels — default view", { show: true, content: "name", fontSize: 9 });
const DrillLocalityLabelsCard = makeLabelCard("drillLocalityLabels", "8. Admin2 labels — drill view", { show: true, content: "name", fontSize: 10 });

class BubblesSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: false });
  fillColor = new formattingSettings.ColorPicker({ name: "fillColor", displayName: "Fill color", value: { value: "#e6550d" } });
  strokeColor = new formattingSettings.ColorPicker({ name: "strokeColor", displayName: "Stroke color", value: { value: "#ffffff" } });
  strokeWidth = new formattingSettings.NumUpDown({ name: "strokeWidth", displayName: "Stroke width", value: 1 });
  opacity = new formattingSettings.NumUpDown({ name: "opacity", displayName: "Opacity", value: 0.85 });
  minRadius = new formattingSettings.NumUpDown({ name: "minRadius", displayName: "Min radius (px)", value: 4 });
  maxRadius = new formattingSettings.NumUpDown({ name: "maxRadius", displayName: "Max radius (px)", value: 30 });
  labelPlacement = new formattingSettings.ItemDropdown({
    name: "labelPlacement",
    displayName: "Label position vs bubble",
    items: [
      { value: "above", displayName: "Above bubble" },
      { value: "below", displayName: "Below bubble" },
      { value: "left", displayName: "Left of bubble" },
      { value: "right", displayName: "Right of bubble" },
      { value: "center", displayName: "Center of bubble" }
    ],
    value: { value: "above", displayName: "Above bubble" }
  });
  constantSize = new formattingSettings.ToggleSwitch({ name: "constantSize", displayName: "Constant size on zoom", value: true });

  name = "bubbles";
  displayName = "3. Bubble overlay";
  slices = [this.show, this.fillColor, this.strokeColor, this.strokeWidth, this.opacity, this.minRadius, this.maxRadius, this.labelPlacement, this.constantSize];
}

class GlyphChartSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: false });
  type = new formattingSettings.ItemDropdown({
    name: "type",
    displayName: "Chart type",
    items: [
      { value: "pie", displayName: "Pie" },
      { value: "donut", displayName: "Donut" },
      { value: "column", displayName: "Column" },
      { value: "concentric", displayName: "Concentric circles" }
    ],
    value: { value: "pie", displayName: "Pie" }
  });
  minSize = new formattingSettings.NumUpDown({ name: "minSize", displayName: "Min size (px)", value: 14 });
  maxSize = new formattingSettings.NumUpDown({ name: "maxSize", displayName: "Max size (px)", value: 36 });
  scaleByTotal = new formattingSettings.ToggleSwitch({ name: "scaleByTotal", displayName: "Scale glyph by total", value: true });
  stroke = new formattingSettings.ColorPicker({ name: "stroke", displayName: "Stroke color", value: { value: "#ffffff" } });
  strokeWidth = new formattingSettings.NumUpDown({ name: "strokeWidth", displayName: "Stroke width", value: 1 });
  opacity = new formattingSettings.NumUpDown({ name: "opacity", displayName: "Opacity", value: 0.9 });
  donutInnerRatio = new formattingSettings.NumUpDown({ name: "donutInnerRatio", displayName: "Donut inner ratio", value: 0.5 });
  color1 = new formattingSettings.ColorPicker({ name: "color1", displayName: "Category 1", value: { value: "#1f77b4" } });
  color2 = new formattingSettings.ColorPicker({ name: "color2", displayName: "Category 2", value: { value: "#ff7f0e" } });
  color3 = new formattingSettings.ColorPicker({ name: "color3", displayName: "Category 3", value: { value: "#2ca02c" } });
  color4 = new formattingSettings.ColorPicker({ name: "color4", displayName: "Category 4", value: { value: "#d62728" } });
  color5 = new formattingSettings.ColorPicker({ name: "color5", displayName: "Category 5", value: { value: "#9467bd" } });
  color6 = new formattingSettings.ColorPicker({ name: "color6", displayName: "Category 6", value: { value: "#8c564b" } });
  color7 = new formattingSettings.ColorPicker({ name: "color7", displayName: "Category 7", value: { value: "#e377c2" } });
  color8 = new formattingSettings.ColorPicker({ name: "color8", displayName: "Category 8", value: { value: "#7f7f7f" } });
  labelPlacement = new formattingSettings.ItemDropdown({
    name: "labelPlacement",
    displayName: "Label position vs glyph",
    items: [
      { value: "above", displayName: "Above glyph" },
      { value: "below", displayName: "Below glyph" },
      { value: "left", displayName: "Left of glyph" },
      { value: "right", displayName: "Right of glyph" },
      { value: "center", displayName: "Center of glyph" }
    ],
    value: { value: "above", displayName: "Above glyph" }
  });
  constantSize = new formattingSettings.ToggleSwitch({ name: "constantSize", displayName: "Constant size on zoom", value: true });

  name = "glyphChart";
  displayName = "4. Pie / Column overlay";
  slices = [this.show, this.type, this.minSize, this.maxSize, this.scaleByTotal, this.stroke, this.strokeWidth, this.opacity, this.donutInnerRatio, this.color1, this.color2, this.color3, this.color4, this.color5, this.color6, this.color7, this.color8, this.labelPlacement, this.constantSize];
}

class GlyphLegendSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: true });
  title = new formattingSettings.TextInput({ name: "title", displayName: "Title", placeholder: "Categories", value: "" });
  orientation = new formattingSettings.ItemDropdown({
    name: "orientation",
    displayName: "Orientation",
    items: [
      { value: "vertical", displayName: "Vertical" },
      { value: "horizontal", displayName: "Horizontal" }
    ],
    value: { value: "vertical", displayName: "Vertical" }
  });
  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { value: "topLeft", displayName: "Top left" },
      { value: "topRight", displayName: "Top right" },
      { value: "bottomLeft", displayName: "Bottom left" },
      { value: "bottomRight", displayName: "Bottom right" }
    ],
    value: { value: "topRight", displayName: "Top right" }
  });
  size = new formattingSettings.ItemDropdown({
    name: "size",
    displayName: "Size",
    items: [
      { value: "small", displayName: "Small" },
      { value: "medium", displayName: "Medium" },
      { value: "large", displayName: "Large" }
    ],
    value: { value: "medium", displayName: "Medium" }
  });

  name = "glyphLegend";
  displayName = "11. Pie / Column legend";
  slices = [this.show, this.title, this.orientation, this.position, this.size];
}

/**
 * "12. Values legend" — explains the numbers shown on labels by listing
 * the bound measure names (Choropleth, Bubble, Label Value 2) with
 * a `#` swatch in their corresponding label-value colour. Reads the
 * Admin1 labels card's Value source to decide which entries appear.
 */
class ValuesLegendSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: false });
  title = new formattingSettings.TextInput({ name: "title", displayName: "Title", placeholder: "Values", value: "" });
  orientation = new formattingSettings.ItemDropdown({
    name: "orientation",
    displayName: "Orientation",
    items: [
      { value: "vertical", displayName: "Vertical" },
      { value: "horizontal", displayName: "Horizontal" }
    ],
    value: { value: "vertical", displayName: "Vertical" }
  });
  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { value: "topLeft", displayName: "Top left" },
      { value: "topRight", displayName: "Top right" },
      { value: "bottomLeft", displayName: "Bottom left" },
      { value: "bottomRight", displayName: "Bottom right" }
    ],
    value: { value: "topLeft", displayName: "Top left" }
  });
  size = new formattingSettings.ItemDropdown({
    name: "size",
    displayName: "Size",
    items: [
      { value: "small", displayName: "Small" },
      { value: "medium", displayName: "Medium" },
      { value: "large", displayName: "Large" }
    ],
    value: { value: "medium", displayName: "Medium" }
  });

  name = "valuesLegend";
  displayName = "12. Values legend";
  slices = [this.show, this.title, this.orientation, this.position, this.size];
}

class ValueLegendSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: true });
  title = new formattingSettings.TextInput({ name: "title", displayName: "Title", placeholder: "(measure name)", value: "" });
  orientation = new formattingSettings.ItemDropdown({
    name: "orientation",
    displayName: "Orientation",
    items: [
      { value: "vertical", displayName: "Vertical" },
      { value: "horizontal", displayName: "Horizontal" }
    ],
    value: { value: "vertical", displayName: "Vertical" }
  });
  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { value: "topLeft", displayName: "Top left" },
      { value: "topRight", displayName: "Top right" },
      { value: "bottomLeft", displayName: "Bottom left" },
      { value: "bottomRight", displayName: "Bottom right" }
    ],
    value: { value: "bottomRight", displayName: "Bottom right" }
  });
  size = new formattingSettings.ItemDropdown({
    name: "size",
    displayName: "Size",
    items: [
      { value: "small", displayName: "Small" },
      { value: "medium", displayName: "Medium" },
      { value: "large", displayName: "Large" }
    ],
    value: { value: "medium", displayName: "Medium" }
  });
  decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimals", value: 0 });

  name = "valueLegend";
  displayName = "9. Choropleth legend";
  slices = [this.show, this.title, this.orientation, this.position, this.size, this.decimals];
}

class BubbleLegendSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: true });
  title = new formattingSettings.TextInput({ name: "title", displayName: "Title", placeholder: "(measure name)", value: "" });
  orientation = new formattingSettings.ItemDropdown({
    name: "orientation",
    displayName: "Orientation",
    items: [
      { value: "vertical", displayName: "Vertical" },
      { value: "horizontal", displayName: "Horizontal (3-4 bubbles)" },
      { value: "compact", displayName: "Compact (min / max)" }
    ],
    value: { value: "vertical", displayName: "Vertical" }
  });
  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { value: "topLeft", displayName: "Top left" },
      { value: "topRight", displayName: "Top right" },
      { value: "bottomLeft", displayName: "Bottom left" },
      { value: "bottomRight", displayName: "Bottom right" }
    ],
    value: { value: "bottomLeft", displayName: "Bottom left" }
  });
  size = new formattingSettings.ItemDropdown({
    name: "size",
    displayName: "Size",
    items: [
      { value: "small", displayName: "Small" },
      { value: "medium", displayName: "Medium" },
      { value: "large", displayName: "Large" }
    ],
    value: { value: "medium", displayName: "Medium" }
  });

  name = "bubbleLegend";
  displayName = "10. Bubble legend";
  slices = [this.show, this.title, this.orientation, this.position, this.size];
}

class ScaleBarSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: false });
  units = new formattingSettings.ItemDropdown({
    name: "units",
    displayName: "Units",
    items: [
      { value: "km", displayName: "Kilometres" },
      { value: "mi", displayName: "Miles" }
    ],
    value: { value: "km", displayName: "Kilometres" }
  });
  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { value: "topLeft", displayName: "Top left" },
      { value: "topRight", displayName: "Top right" },
      { value: "bottomLeft", displayName: "Bottom left" },
      { value: "bottomRight", displayName: "Bottom right" }
    ],
    value: { value: "bottomLeft", displayName: "Bottom left" }
  });
  color = new formattingSettings.ColorPicker({ name: "color", displayName: "Color", value: { value: "#222222" } });
  fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Font size", value: 11 });

  name = "scaleBar";
  displayName = "14. Scale bar";
  slices = [this.show, this.units, this.position, this.color, this.fontSize];
}

class ControlsSettings extends FormattingSettingsCard {
  showZoom = new formattingSettings.ToggleSwitch({ name: "showZoom", displayName: "Show zoom buttons", value: false });
  showPan = new formattingSettings.ToggleSwitch({ name: "showPan", displayName: "Show pan buttons", value: false });
  showExport = new formattingSettings.ToggleSwitch({ name: "showExport", displayName: "Show export buttons (PNG / SVG)", value: false });
  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { value: "topRight", displayName: "Top right" },
      { value: "topLeft", displayName: "Top left" },
      { value: "bottomRight", displayName: "Bottom right" },
      { value: "bottomLeft", displayName: "Bottom left" }
    ],
    value: { value: "topRight", displayName: "Top right" }
  });

  name = "controls";
  displayName = "15. Map controls (zoom / pan / copy)";
  slices = [this.showZoom, this.showPan, this.showExport, this.position];
}

class LegendContainerSettings extends FormattingSettingsCard {
  borderWidth = new formattingSettings.NumUpDown({ name: "borderWidth", displayName: "Border width", value: 1 });
  borderColor = new formattingSettings.ColorPicker({ name: "borderColor", displayName: "Border color", value: { value: "#cccccc" } });
  cornerRadius = new formattingSettings.NumUpDown({ name: "cornerRadius", displayName: "Corner radius", value: 6 });
  padding = new formattingSettings.NumUpDown({ name: "padding", displayName: "Padding", value: 8 });
  background = new formattingSettings.ColorPicker({ name: "background", displayName: "Background color", value: { value: "#ffffff" } });
  backgroundOpacity = new formattingSettings.NumUpDown({ name: "backgroundOpacity", displayName: "Background opacity", value: 0.9 });
  headerColor = new formattingSettings.ColorPicker({ name: "headerColor", displayName: "Header color", value: { value: "#222222" } });
  headerBold = new formattingSettings.ToggleSwitch({ name: "headerBold", displayName: "Header bold", value: true });
  headerFontSize = new formattingSettings.NumUpDown({ name: "headerFontSize", displayName: "Header font size (px)", value: 0 });
  containerOrientation = new formattingSettings.ItemDropdown({
    name: "containerOrientation",
    displayName: "Container orientation",
    items: [
      { value: "vertical", displayName: "Vertical (top → bottom)" },
      { value: "horizontal", displayName: "Horizontal (left → right)" }
    ],
    value: { value: "vertical", displayName: "Vertical (top → bottom)" }
  });

  name = "legendContainer";
  displayName = "13. Legend container";
  slices = [this.borderWidth, this.borderColor, this.cornerRadius, this.padding, this.background, this.backgroundOpacity, this.headerColor, this.headerBold, this.headerFontSize, this.containerOrientation];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
  general = new GeneralSettings();
  choropleth = new ChoroplethSettings();
  borders = new BordersSettings();
  stateLabels = new StateLabelsCard();
  localityLabels = new LocalityLabelsCard();
  drillLocalityLabels = new DrillLocalityLabelsCard();
  bubbles = new BubblesSettings();
  glyphChart = new GlyphChartSettings();
  glyphLegend = new GlyphLegendSettings();
  valueLegend = new ValueLegendSettings();
  bubbleLegend = new BubbleLegendSettings();
  valuesLegend = new ValuesLegendSettings();
  controls = new ControlsSettings();
  legendContainer = new LegendContainerSettings();
  scaleBar = new ScaleBarSettings();

  // Order matters: this is the order users see in the Power BI format pane.
  // Group from "what you see first" outward — map setup, then how the map is
  // colored, then bubbles (a layer that sits above the choropleth), then
  // borders, labels, and finally legends.
  // Order of cards in the Power BI format pane. Grouped so the user
  // walks top-down through:
  //   1. Map setup (which country, view mode, background)
  //   2. Data layers — choropleth fill, bubble overlay, pie/column overlay
  //   3. Geometry styling — borders
  //   4. Labels — Admin1, Admin2 default, Admin2 drill
  //   5. Legends — one card per layer type, then the shared container
  //   6. Map decoration — scale bar
  //   7. On-canvas tools — zoom / pan / copy
  cards = [
    this.general,
    this.choropleth,
    this.bubbles,
    this.glyphChart,
    this.borders,
    this.stateLabels,
    this.localityLabels,
    this.drillLocalityLabels,
    this.valueLegend,
    this.bubbleLegend,
    this.glyphLegend,
    this.valuesLegend,
    this.legendContainer,
    this.scaleBar,
    this.controls
  ];
}
